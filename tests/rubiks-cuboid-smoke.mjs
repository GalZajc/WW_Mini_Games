import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const artifacts = path.join(root, 'tests', 'artifacts');
const debugPort = 9366;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CdpClient {
    constructor(url) {
        this.socket = new WebSocket(url);
        this.id = 0;
        this.pending = new Map();
        this.exceptions = [];
    }
    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
        this.socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
            if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message);
            if (!message.id) return;
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
    }
    call(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async evaluate(expression) {
        const response = await this.call('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (response.exceptionDetails) {
            throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        }
        return response.result.value;
    }
    close() { this.socket.close(); }
}

async function waitFor(callback, description, timeout = 20000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const value = await callback();
            if (value) return value;
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

async function pageInfo() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    if (!response.ok) return null;
    const pages = await response.json();
    return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
}

const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', data => { stdout += data; });
child.stderr.on('data', data => { stderr += data; });

let client;
try {
    await mkdir(artifacts, { recursive: true });
    const page = await waitFor(pageInfo, 'Electron page');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await waitFor(() => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length)`), 'game discovery');

    const state = await client.evaluate(`(async () => {
        const { CuboidModel } = await import('./games/rubiks-cuboid/model.js');
        const { PolyhedronPuzzleModel, TWISTY_MODE_INFO, disposePuzzleModel } = await import('./games/rubiks-cuboid/twisty-models.js');
        const solved = new CuboidModel(3, 3, 4);
        const maximum = solved.maximumScore;
        const solvedScore = solved.score();
        const illegalQuarter = solved.rotate('x', 0, 1);
        const legalHalf = solved.rotate('x', 0, 2);

        const oriented = new CuboidModel(3, 3, 4);
        for (let layer = 0; layer < oriented.nz; layer++) oriented.rotate('z', layer, 1);
        const wholeOrientationScore = oriented.score();
        const recoloured = new CuboidModel(3, 3, 4);
        const colourCycle = { '+x': '-z', '-z': '+y', '+y': '-x', '-x': '+z', '+z': '-y', '-y': '+x' };
        for (const sticker of recoloured.stickers) sticker.color = colourCycle[sticker.color];
        const permutedFaceScore = recoloured.score();
        const fullyRectangular = new CuboidModel(2, 3, 4);
        const fullyRectangularRules = {
            x: fullyRectangular.allowsQuarterTurns('x'),
            y: fullyRectangular.allowsQuarterTurns('y'),
            z: fullyRectangular.allowsQuarterTurns('z'),
            rejectedQuarter: fullyRectangular.rotate('z', 0, 1),
            acceptedHalf: fullyRectangular.rotate('z', 0, 2),
        };
        const ySquareCrossSection = new CuboidModel(3, 4, 3).allowsQuarterTurns('y');
        const thinCuboid = new CuboidModel(1, 2, 3);
        const thinHalfTurn = thinCuboid.rotate('z', 0, 2);
        const thinCuboidValid = thinCuboid.dimensions.join('x') === '1x2x3'
            && thinHalfTurn
            && thinCuboid.stickers.every(sticker => sticker.position.every((value, axis) =>
                Number.isInteger(value) && value >= 0 && value < thinCuboid.dimensions[axis]
            ));
        const singleCubie = new CuboidModel(1, 1, 1);
        const singleCubieValid = singleCubie.maximumScore === 6
            && singleCubie.score() === 6
            && singleCubie.rotate('x', 0, 1);
        const maximumOrderSamples = ['tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron'].map(mode => {
            const expectedOrder = TWISTY_MODE_INFO[mode].maxOrder;
            const model = new PolyhedronPuzzleModel(mode, expectedOrder);
            const layersByAxis = model.moves.reduce((byAxis, move) => {
                if (!byAxis.has(move.axisIndex)) byAxis.set(move.axisIndex, []);
                byAxis.get(move.axisIndex).push(move);
                return byAxis;
            }, new Map());
            const overlappingLayerPairs = [...layersByAxis.values()].reduce((total, moves) => {
                for (let first = 0; first < moves.length; first++) {
                    for (let second = first + 1; second < moves.length; second++) {
                        if (moves[first].selected.some(slot => moves[second].selectedSet.has(slot))) total++;
                    }
                }
                return total;
            }, 0);
            const permutationsStayInsideSlice = model.moves.every(move =>
                move.selected.length > 0
                && move.selected.every(source => move.selectedSet.has(move.destinationBySource[source]))
            );
            model.scramble(7300 + expectedOrder);
            const sample = {
                mode,
                expectedOrder,
                actualOrder: model.order,
                slots: model.slots.length,
                moves: model.moves.length,
                scrambleMoves: model.scrambleMoves.length,
                scrambleVerified: model.scrambleVerified,
                overlappingLayerPairs,
                permutationsStayInsideSlice,
                axisCount: model.axes.length,
                turnOrder: model.spec.turnOrder,
            };
            disposePuzzleModel(model);
            return sample;
        });
        const scrambleSamples = [[2, 2, 2], [2, 3, 4], [3, 4, 3], [4, 4, 6]].map((dimensions, index) => {
            const sample = new CuboidModel(...dimensions);
            sample.scramble(1200 + index);
            const inverse = sample.inverseMoves();
            const verifier = sample.clone();
            for (const move of inverse) verifier.rotate(move.axis, move.layer, move.quarterTurns);
            return {
                dimensions,
                score: sample.score(),
                maximum: sample.maximumScore,
                moves: sample.scrambleMoves.length,
                burnInMoves: sample.scrambleDiagnostics.burnInMoves,
                plateauWindows: sample.scrambleDiagnostics.windowsMeasured,
                verified: sample.scrambleVerified && verifier.isExactlySolved(),
            };
        });
        const solvabilitySamples = [
            [1, 2, 3], [1, 3, 3], [2, 2, 3], [3, 3, 4],
            [3, 4, 3], [4, 3, 3], [4, 5, 6],
        ].map((dimensions, index) => {
            const sample = new CuboidModel(...dimensions);
            sample.scramble(9100 + index);
            const inverse = sample.inverseMoves();
            const verifier = sample.clone();
            const inverseLegal = inverse.every(move =>
                verifier.rotate(move.axis, move.layer, move.quarterTurns)
            );
            return {
                dimensions,
                inverseLegal,
                exactlySolved: verifier.isExactlySolved(),
                verifiedByGenerator: sample.scrambleVerified,
            };
        });

        const config = window.app.gameLoader.games.find(game => game._id === 'rubiks-cuboid');
        if (!config) throw new Error('Rubik cuboid was not discovered.');
        await window.app.launchGame(config);
        window.app.restartGame({
            mode: 'cuboid',
            nx: 3,
            ny: 3,
            nz: 4,
            torusU: 8,
            torusV: 5,
            polyhedronOrder: 2,
            dragPixelsPerQuarter: 58,
            turnAnimationSpeed: 720,
        });
        window.app._isPaused = true;
        const game = window.app.currentGame;
        window.__rubiksOriginalSettingsSave = game.app.settingsManager.save.bind(game.app.settingsManager);
        game.app.settingsManager.save = async () => {};
        const modeSelectorCardCount = game.modeSelector?.querySelectorAll('[data-mode]').length ?? 0;
        game._selectPendingMode('tetrahedron');
        game.modeSelector.querySelector('[data-size-key="polyhedronOrder"]').value = '3';
        game.settings.dragPixelsPerQuarter = 31;
        game._capturePendingProfile();
        game._selectPendingMode('octahedron');
        game.modeSelector.querySelector('[data-size-key="polyhedronOrder"]').value = '4';
        game.settings.dragPixelsPerQuarter = 117;
        game._capturePendingProfile();
        game._selectPendingMode('tetrahedron');
        const modeProfileIsolation = {
            tetrahedronOrder: Number(game.modeSelector.querySelector('[data-size-key="polyhedronOrder"]').value),
            tetrahedronDrag: game.settings.dragPixelsPerQuarter,
            octahedronOrder: game.settings.modeProfiles.octahedron.polyhedronOrder,
            octahedronDrag: game.settings.modeProfiles.octahedron.dragPixelsPerQuarter,
        };
        game._selectPendingMode('cuboid');
        game.selectMode('cuboid');
        game._onScoreSubmit = () => {};
        game.render();
        const initialScrambledScore = game.currentScore;
        const dimensionSettingMinimums = game.constructor.getSettingsSchema()
            .filter(setting => ['nx', 'ny', 'nz'].includes(setting.key))
            .map(setting => setting.min);
        await Promise.allSettled([...game.audio._soundLoads.values()]);
        const mechanicalSoundsLoaded = game.audio._soundBuffers.has('rubik-turn')
            && game.audio._soundBuffers.has('rubik-release');
        const fastRecordSettings = game.getRecordSettings({
            mode: 'cuboid', nx: 3, ny: 4, nz: 5, dragPixelsPerQuarter: 20, turnAnimationSpeed: 1800,
        });
        const slowRecordSettings = game.getRecordSettings({
            mode: 'cuboid', nx: 3, ny: 4, nz: 5, dragPixelsPerQuarter: 140, turnAnimationSpeed: 180,
        });
        const animationExcludedFromRecord = JSON.stringify(fastRecordSettings)
            === JSON.stringify(slowRecordSettings)
            && JSON.stringify(fastRecordSettings) === JSON.stringify({ mode: 'cuboid', nx: 3, ny: 4, nz: 5 });
        const originalAddRecord = window.app.records.addRecord;
        let appRecordSettings = null;
        window.app.records.addRecord = async (_gameId, settings) => { appRecordSettings = settings; };
        await window.app._onScore({ moves: 999 });
        window.app.records.addRecord = originalAddRecord;
        const appUsesProjectedRecordSettings = JSON.stringify(appRecordSettings)
            === JSON.stringify({ mode: 'cuboid', nx: 3, ny: 3, nz: 4 });

        const cameraXBeforeTrackball = game.camera.position.x;
        const cameraDistanceBeforeTrackball = game.camera.position.distanceTo(game.trackball.target);
        const targetBeforeTrackball = game.trackball.target.toArray();
        game.trackball._movePrev.set(0, 0);
        game.trackball._moveCurr.set(0.12, 0);
        game.trackball.update();
        const trackballDirectionCorrect = game.camera.position.x < cameraXBeforeTrackball;
        const trackballDistancePreserved = Math.abs(
            game.camera.position.distanceTo(game.trackball.target) - cameraDistanceBeforeTrackball
        ) < 1e-8;
        const trackballTargetPreserved = game.trackball.target.toArray()
            .every((value, index) => Math.abs(value - targetBeforeTrackball[index]) < 1e-10);
        const zoomDistanceBefore = game.camera.position.distanceTo(game.trackball.target);
        const zoomTargetBefore = game.trackball.target.toArray();
        game.trackball._onMouseWheel({
            deltaY: -120,
            deltaMode: 0,
            preventDefault() {},
            stopPropagation() {},
        });
        const zoomDistanceAfter = game.camera.position.distanceTo(game.trackball.target);
        const wheelZoomsAboutStationaryTarget = zoomDistanceAfter < zoomDistanceBefore
            && game.trackball.target.toArray().every((value, index) =>
                Math.abs(value - zoomTargetBefore[index]) < 1e-10
            );

        const pickTarget = game.model.stickers.find(sticker => sticker.normal[2] === 1);
        const Vector3 = game.camera.position.constructor;
        const pickPoint = new Vector3(...game.model.centeredPosition(pickTarget))
            .addScaledVector(new Vector3(...pickTarget.normal), 0.502)
            .project(game.camera);
        const canvasRect = game.canvas.getBoundingClientRect();
        const rayPickedSticker = Boolean(game._pickSticker(
            canvasRect.left + (pickPoint.x + 1) * canvasRect.width * 0.5,
            canvasRect.top + (1 - pickPoint.y) * canvasRect.height * 0.5
        ));

        const positionsValid = game.model.stickers.every(sticker =>
            sticker.position.every((value, axis) => Number.isInteger(value)
                && value >= 0 && value < game.model.dimensions[axis])
            && sticker.normal.reduce((sum, value) => sum + Math.abs(value), 0) === 1
        );
        const scrambleMovesLegal = game.scrambleMoves.every(move =>
            game.model.allowsQuarterTurns(move.axis)
                ? [-1, 1, 2].includes(move.quarterTurns)
                : move.quarterTurns === 2
        );
        const axisVectors = {
            x: new Vector3(1, 0, 0),
            y: new Vector3(0, 1, 0),
            z: new Vector3(0, 0, 1),
        };
        const dragDirectionsRespectClickedFace = game.model.stickers.every(sticker => {
            const faceNormal = new Vector3(...sticker.normal);
            return ['x', 'y', 'z']
                .filter(axis => sticker.normal[{ x: 0, y: 1, z: 2 }[axis]] === 0)
                .every(axis => {
                    const tangent = new Vector3().crossVectors(axisVectors[axis], faceNormal).normalize();
                    const inFacePlane = Math.abs(tangent.dot(faceNormal)) < 1e-10;
                    const sideParallel = tangent.toArray().filter(value => Math.abs(value) > 1e-10).length === 1;
                    const projected = game._projectedSliceDirection(sticker, axis);
                    return inFacePlane && sideParallel && Math.hypot(...projected) > 0.999;
                });
        });
        const cubiesTouchWithoutGeometryGap = game.bodyInstances.geometry.parameters.width === 1
            && game.bodyInstances.geometry.parameters.height === 1
            && game.bodyInstances.geometry.parameters.depth === 1
            && game.stickerInstances.every(mesh => mesh.geometry.type === 'ShapeGeometry');

        let snapSoundCount = 0;
        let releaseSoundCount = 0;
        game.audio.playSound = id => {
            if (id === 'rubik-turn') snapSoundCount++;
            if (id === 'rubik-release') releaseSoundCount++;
        };

        const nonSquareSticker = game.model.stickers.find(sticker => sticker.normal[2] === 1);
        const beforeLivePreview = JSON.stringify(game.model.stickers);
        const findStickerMatrix = stickerId => {
            for (const mesh of game.stickerInstances) {
                const instanceIndex = mesh.userData.stickers.findIndex(sticker => sticker.id === stickerId);
                if (instanceIndex < 0) continue;
                const matrix = new game.camera.matrixWorld.constructor();
                mesh.getMatrixAt(instanceIndex, matrix);
                return matrix.elements.slice();
            }
            return null;
        };
        const stickerMatrixBefore = findStickerMatrix(nonSquareSticker.id);
        game._startSliceDrag(nonSquareSticker, 430, 420, '3d', null);
        const nonSquareCandidate = game.sliceDrag.candidates.find(candidate => candidate.axis === 'x');
        game._updateSliceDrag(
            430 + nonSquareCandidate.direction[0] * game.dragPixelsPerQuarter * 2,
            420 + nonSquareCandidate.direction[1] * game.dragPixelsPerQuarter * 2
        );
        const nonSquareAngle = game.sliceDrag.quarterTurns * 90;
        const livePreviewChanged = JSON.stringify(game.model.stickers) !== beforeLivePreview;
        const liveNetUpdated = game.netHitCells.length === game.model.maximumScore;
        const stickerMatrixAtAnimationStart = findStickerMatrix(nonSquareSticker.id);
        const poseIndices = [8, 9, 10, 12, 13, 14];
        const animationStartsFromOldPose = poseIndices.every(index =>
            Math.abs(stickerMatrixBefore[index] - stickerMatrixAtAnimationStart[index]) < 1e-6
        );
        const animationDuration = game.turnAnimation.duration;
        game.update(animationDuration * 0.5);
        const stickerMatrixMidAnimation = findStickerMatrix(nonSquareSticker.id);
        const animationHasIntermediatePose = stickerMatrixMidAnimation.some((value, index) =>
            Math.abs(value - stickerMatrixBefore[index]) > 1e-4
        ) && game.turnAnimation?.progress > 0 && game.turnAnimation?.progress < 1;
        game._finishSliceDrag();

        const squareSticker = game.model.stickers.find(sticker => sticker.normal[0] === 1);
        game._startSliceDrag(squareSticker, 460, 390, '3d', null);
        const squareCandidate = game.sliceDrag.candidates.find(candidate => candidate.axis === 'z');
        game._updateSliceDrag(
            460 + squareCandidate.direction[0] * game.dragPixelsPerQuarter,
            390 + squareCandidate.direction[1] * game.dragPixelsPerQuarter
        );
        const squareAngle = game.sliceDrag.quarterTurns * 90;
        game._finishSliceDrag();
        game.update(1);

        game._drawNet();
        const netCell = game.netHitCells.find(cell => cell.face.key === '+x');
        const netRect = game.netCanvas.getBoundingClientRect();
        const netStartX = netRect.left + netCell.x + netCell.width * 0.5;
        const netStartY = netRect.top + netCell.y + netCell.height * 0.5;
        game._startSliceDrag(netCell.sticker, netStartX, netStartY, 'net', netCell.face);
        const netCandidateCount = game.sliceDrag.candidates.length;
        game._cancelSliceDrag();

        const panelBefore = game.netPanel.getBoundingClientRect();
        game.netResizing = { startX: 500, startY: 300, width: panelBefore.width, height: panelBefore.height };
        game._updateNetResize({ clientX: 450, clientY: 350 });
        const panelAfter = game.netPanel.getBoundingClientRect();
        game.netResizing = null;
        game.render();

        const cuboidState = {
            constructor: game.constructor.name,
            dimensions: game.model.dimensions,
            settings: game.constructor.getSettingsSchema().map(setting => setting.key),
            maximum,
            solvedScore,
            illegalQuarter,
            legalHalf,
            wholeOrientationScore,
            permutedFaceScore,
            fullyRectangularRules,
            ySquareCrossSection,
            thinCuboidValid,
            singleCubieValid,
            maximumOrderSamples,
            dimensionSettingMinimums,
            mechanicalSoundsLoaded,
            animationExcludedFromRecord,
            appUsesProjectedRecordSettings,
            scrambleSamples,
            solvabilitySamples,
            scrambleMoveCount: game.scrambleMoves.length,
            initialScrambledScore,
            finalScore: game.currentScore,
            scrambleMovesLegal,
            positionsValid,
            rayPickedSticker,
            stickerInstanceCount: game.stickerInstances.length,
            netCellCount: game.netHitCells.length,
            netCandidateCount,
            nonSquareAngle,
            squareAngle,
            livePreviewChanged,
            liveNetUpdated,
            animationStartsFromOldPose,
            animationHasIntermediatePose,
            turnAnimationSpeed: game.turnAnimationSpeed,
            snapSoundCount,
            releaseSoundCount,
            moves: game.moves,
            panelResized: panelAfter.width > panelBefore.width && panelAfter.height > panelBefore.height,
            pointerLock: game.wantsPointerLockNow(),
            finiteCamera: game.camera.position.toArray().every(Number.isFinite),
            trackballDirectionCorrect,
            trackballDistancePreserved,
            trackballTargetPreserved,
            wheelZoomsAboutStationaryTarget,
            trackballButton: game.trackball.button,
            trackballRotateSpeed: game.trackball.rotateSpeed,
            backgroundHex: game.scene.background.getHex(),
            hasFloor: game.scene.children.some(child => child.geometry?.type === 'CircleGeometry'),
            scrambleVerified: game.model.scrambleVerified,
            scrambleBurnInMoves: game.scrambleDiagnostics.burnInMoves,
            scramblePlateauWindows: game.scrambleDiagnostics.windowsMeasured,
            netBoundaryStats: game.netBoundaryStats,
            modeSelectorCardCount,
            modeProfileIsolation,
            dragDirectionsRespectClickedFace,
            cubiesTouchWithoutGeometryGap,
        };

        game.returnToModeSelector();
        const surfaceModes = [];
        const modes = ['torus', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron'];
        for (const mode of modes) {
            game._selectPendingMode(mode);
            if (mode === 'torus') {
                game.modeSelector.querySelector('[data-size-key="torusU"]').value = '8';
                game.modeSelector.querySelector('[data-size-key="torusV"]').value = '5';
            } else {
                game.modeSelector.querySelector('[data-size-key="polyhedronOrder"]').value = mode === 'octahedron' ? '3' : '2';
            }
            game.selectMode(mode);
            const surface = game.surfaceMode;
            surface._drawNet();
            const netCellCount = surface.netHitCells.length;
            const hasFunctionalNet = Boolean(surface.netPanel && surface.netCanvas
                && netCellCount === surface.model.maximumScore);
            const connectedNetFaces = mode === 'torus'
                ? 0
                : (surface.polyhedronNetLayout?.size ?? 0);
            const connectedNetLinks = mode === 'torus'
                ? 0
                : [...(surface.polyhedronNetLayout?.values?.() ?? [])]
                    .filter(placement => placement.parentFaceIndex !== null).length;
            const netDragHit = surface.netHitCells.find(hit =>
                surface.model.candidatesForSlot(hit.slotIndex).length >= 1
            );
            if (netDragHit) surface._startDrag(netDragHit.slotIndex, 100, 100, 'net', netDragHit.face);
            const netDragDirectionsValid = Boolean(surface.drag?.candidates.length >= 1
                && surface.drag.candidates.every(item => Number.isFinite(item.direction.x)
                    && Number.isFinite(item.direction.y)
                    && Math.abs(item.direction.length() - 1) < 1e-6));
            surface.drag = null;
            const before = [...surface.model.colors];
            const candidate = surface.model.candidatesForSlot(0)[0];
            const applied = surface._applyAnimatedMove(candidate, 1);
            const animationDuration = surface.animation?.duration ?? 0;
            surface.update(animationDuration * 0.5);
            const hasIntermediateAnimation = Boolean(surface.animation?.progress > 0 && surface.animation.progress < 1);
            surface._finishAnimationImmediately();
            const changed = before.some((color, index) => color !== surface.model.colors[index]);
            if (mode === 'torus') surface.model.applyMove(candidate.axis, candidate.layer, -1);
            else surface.model.applyMove(candidate.axisIndex, candidate.layer, -1);
            const inverseRestored = before.every((color, index) => color === surface.model.colors[index]);

            const rollbackBefore = [...surface.model.colors];
            surface._applyAnimatedMove(candidate, 1);
            surface.drag = { chosen: candidate, appliedSteps: 1 };
            surface.onPause();
            const pauseRollback = rollbackBefore.every((color, index) => color === surface.model.colors[index]);

            const distanceBefore = surface.camera.position.distanceTo(surface.trackball.target);
            surface.trackball._onMouseWheel({
                deltaY: -120,
                deltaMode: 0,
                preventDefault() {},
                stopPropagation() {},
            });
            const zoomWorks = surface.camera.position.distanceTo(surface.trackball.target) < distanceBefore;
            const recordSettings = game.getRecordSettings(game.settings);
            surface.render();
            surfaceModes.push({
                mode,
                maximum: surface.model.maximumScore,
                score: surface.currentScore,
                scrambleMoves: surface.scrambleMoves.length,
                scrambleVerified: surface.model.scrambleVerified,
                meshCount: surface.slotMeshes.length,
                applied,
                changed,
                inverseRestored,
                hasIntermediateAnimation,
                pauseRollback,
                zoomWorks,
                recordSettings,
                finiteCamera: surface.camera.position.toArray().every(Number.isFinite),
                hasFunctionalNet,
                connectedNetFaces,
                connectedNetLinks,
                netDragDirectionsValid,
            });
            game.returnToModeSelector();
        }
        game.settings.mode = 'cuboid';
        game.selectMode('cuboid');
        game.render();
        return { ...cuboidState, surfaceModes };
    })()`);

    const expectedSettings = ['mode', 'nx', 'ny', 'nz', 'torusU', 'torusV', 'polyhedronOrder', 'dragPixelsPerQuarter', 'turnAnimationSpeed', 'modeProfiles'];
    if (state.constructor !== 'RubiksTwistyGame'
        || JSON.stringify(state.dimensions) !== JSON.stringify([3, 3, 4])
        || JSON.stringify(state.settings) !== JSON.stringify(expectedSettings)
        || state.solvedScore !== state.maximum || state.wholeOrientationScore !== state.maximum
        || state.permutedFaceScore !== state.maximum
        || state.fullyRectangularRules.x || state.fullyRectangularRules.y || state.fullyRectangularRules.z
        || state.fullyRectangularRules.rejectedQuarter || !state.fullyRectangularRules.acceptedHalf
        || !state.ySquareCrossSection || !state.thinCuboidValid || !state.singleCubieValid
        || state.maximumOrderSamples.some(sample => sample.actualOrder !== sample.expectedOrder
            || sample.slots <= 0 || sample.moves <= 0 || sample.scrambleMoves < 240
            || !sample.scrambleVerified || sample.overlappingLayerPairs !== 0
            || !sample.permutationsStayInsideSlice
            || (sample.mode === 'icosahedron' && (sample.axisCount !== 12 || sample.turnOrder !== 5)))
        || JSON.stringify(state.dimensionSettingMinimums) !== JSON.stringify([1, 1, 1])
        || !state.mechanicalSoundsLoaded || !state.animationExcludedFromRecord
        || !state.appUsesProjectedRecordSettings
        || state.scrambleSamples.some(sample => sample.score > Math.floor(sample.maximum * 0.58)
            || sample.moves < sample.burnInMoves * 8 || sample.plateauWindows < 8 || !sample.verified)
        || state.solvabilitySamples.some(sample => !sample.inverseLegal
            || !sample.exactlySolved || !sample.verifiedByGenerator)
        || state.illegalQuarter || !state.legalHalf || !state.scrambleMovesLegal || !state.positionsValid
        || state.scrambleMoveCount < state.scrambleBurnInMoves * 8
        || state.initialScrambledScore > Math.floor(state.maximum * 0.58)
        || !state.scrambleVerified || state.scramblePlateauWindows < 8
        || !state.rayPickedSticker
        || state.stickerInstanceCount !== 6 || state.netCellCount !== state.maximum
        || state.netCandidateCount !== 2 || Math.abs(state.nonSquareAngle) !== 180
        || Math.abs(state.squareAngle) !== 90 || !state.livePreviewChanged || !state.liveNetUpdated
        || !state.animationStartsFromOldPose || !state.animationHasIntermediatePose
        || state.turnAnimationSpeed !== 720
        || state.snapSoundCount < 2 || state.releaseSoundCount !== 2
        || state.moves !== 2 || !state.panelResized
        || state.pointerLock || !state.finiteCamera || !state.trackballDirectionCorrect
        || !state.trackballDistancePreserved || !state.trackballTargetPreserved
        || !state.wheelZoomsAboutStationaryTarget
        || state.trackballButton !== 2 || state.trackballRotateSpeed !== 4
        || state.backgroundHex !== 0x78cfff || state.hasFloor
        || state.netBoundaryStats.occupiedCells !== state.maximum
        || state.netBoundaryStats.outerEdges <= 0 || state.netBoundaryStats.internalEdges <= 0
        || state.netBoundaryStats.unifiedEdges !== state.netBoundaryStats.outerEdges + state.netBoundaryStats.internalEdges
        || state.modeSelectorCardCount !== 6
        || state.modeProfileIsolation.tetrahedronOrder !== 3
        || state.modeProfileIsolation.tetrahedronDrag !== 31
        || state.modeProfileIsolation.octahedronOrder !== 4
        || state.modeProfileIsolation.octahedronDrag !== 117
        || !state.dragDirectionsRespectClickedFace
        || !state.cubiesTouchWithoutGeometryGap
        || state.surfaceModes.length !== 5
        || state.surfaceModes.some(mode => !mode.scrambleVerified || mode.scrambleMoves < 240
            || mode.meshCount !== mode.maximum || !mode.applied || !mode.changed
            || !mode.inverseRestored || !mode.hasIntermediateAnimation || !mode.pauseRollback
            || !mode.zoomWorks || !mode.finiteCamera || !mode.hasFunctionalNet
            || !mode.netDragDirectionsValid
            || (mode.mode !== 'torus' && (mode.connectedNetFaces < 4
                || mode.connectedNetLinks !== mode.connectedNetFaces - 1))
            || mode.recordSettings.mode !== mode.mode)) {
        throw new Error(`Rubik cuboid state is invalid: ${JSON.stringify(state)}`);
    }

    const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(artifacts, 'rubiks-cuboid.png'), Buffer.from(screenshot.data, 'base64'));
    await client.evaluate(`window.app.currentGame.returnToModeSelector()`);
    await delay(650);
    const selectorScreenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(artifacts, 'rubiks-mode-selector.png'), Buffer.from(selectorScreenshot.data, 'base64'));
    await client.evaluate(`(() => {
        window.app.settingsManager.save = window.__rubiksOriginalSettingsSave;
        delete window.__rubiksOriginalSettingsSave;
    })()`);
    if (client.exceptions.length) {
        throw new Error(`Renderer exceptions: ${JSON.stringify(client.exceptions.slice(0, 3))}`);
    }
    console.log(JSON.stringify(state, null, 2));
} catch (error) {
    console.error(error.stack || error);
    if (stdout.trim()) console.error(`Electron stdout:\n${stdout}`);
    if (stderr.trim()) console.error(`Electron stderr:\n${stderr}`);
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
}
