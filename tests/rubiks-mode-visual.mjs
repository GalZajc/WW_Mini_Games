import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const modes = ['torus', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron'];
const requestedMode = process.argv[2];
if (!modes.includes(requestedMode) && requestedMode !== 'polyhedra') throw new Error(`Usage: node tests/rubiks-mode-visual.mjs <${modes.join('|')}|polyhedra>`);
const runModes = requestedMode === 'polyhedra' ? modes.filter(mode => mode !== 'torus') : [requestedMode];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'tests', 'artifacts');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9380 + Math.max(0, modes.indexOf(requestedMode));
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class Client {
    constructor(url) {
        this.socket = new WebSocket(url);
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
    }
    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
        this.socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
            if (!message.id) { this.events.push(message); return; }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
    }
    call(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async evaluate(expression) {
        const result = await this.call('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    close() { this.socket.close(); }
}

async function waitFor(callback, description, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const value = await callback();
            if (value) return value;
        } catch {}
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}`);
}

async function getPage() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    if (!response.ok) return null;
    const pages = await response.json();
    return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
}

let stdout = '';
let stderr = '';
const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => { stdout += chunk.toString(); });
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

let client;
try {
    await mkdir(artifacts, { recursive: true });
    const page = await waitFor(getPage, 'Electron renderer');
    client = new Client(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await waitFor(() => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length)`), 'game discovery');
    for (const mode of runModes) {
    const state = await client.evaluate(`(async () => {
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async () => {};
        window.app._isPaused = true;
        const config = window.app.gameLoader.games.find(game => game._id === 'rubiks-cuboid');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game.settings.torusU = 8;
        game.settings.torusV = 5;
        game.settings.polyhedronOrder = ${mode === 'dodecahedron' ? 4 : 3};
        game.pendingMode = '${mode}';
        game._renderModeSizePanel();
        game.selectMode('${mode}');
        const surface = game.surfaceMode;
        let submissions = 0;
        game._onScoreSubmit = () => submissions++;
        if (surface.scoredRun || surface.model.score() !== surface.model.maximumScore || surface.scrambleMoves.length) throw new Error('Puzzle did not start solved in free play');
        surface.update(0.1);
        if (surface.elapsed !== 0) throw new Error('Practice timer started');
        surface.hud.querySelector('[data-shuffle]').click();
        if (!surface.scoredRun || !surface.scrambleMoves.length) throw new Error('Shuffle did not start a challenge');
        surface.hud.querySelector('[data-solve]').click();
        if (surface.scoredRun || surface.model.score() !== surface.model.maximumScore || surface.elapsed !== 0 || submissions) throw new Error('Solve did not return to unscored practice');
        const info = surface.hud.querySelector('[data-run-info]').getBoundingClientRect();
        const left = surface.hud.querySelector('[data-shuffle]').getBoundingClientRect();
        const right = surface.hud.querySelector('[data-solve]').getBoundingClientRect();
        if (Math.abs(info.left-left.left)>1 || Math.abs(info.right-right.right)>1) throw new Error('Buttons do not align with info panel');
        const panel = document.createElement('div');
        panel.innerHTML = '<input data-key="sliceDarkness" type="number" value="80">';
        game.mountPauseSettings({panel,settings:game.settings});
        if (panel.firstChild.type !== 'range' || panel.firstChild.max !== '100') throw new Error('Missing darkening slider');
        game.render();
        await new Promise(resolve => setTimeout(resolve, 300));
        game.render();
        return {
            mode: game.mode,
            score: game.surfaceMode.currentScore,
            maximum: game.surfaceMode.model.maximumScore,
            faces: game.surfaceMode.model.faces?.length ?? 0,
            netCells: game.surfaceMode.netHitCells?.length ?? 0,
        };
    })()`);
    const capture = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(artifacts, `rubiks-${mode}-current.png`), Buffer.from(capture.data, 'base64'));
    if (mode === 'octahedron') {
        const choiceState = await client.evaluate(`(async () => {
            const { dragSliceChoices } = await import('./games/rubiks-cuboid/puzzle-interaction.js');
            const surface = window.app.currentGame.surfaceMode;
            let gesture;
            for (const slot of surface.model.slots) {
                if (slot.normal.dot(surface.camera.position.clone().sub(slot.center)) <= 0) continue;
                const candidates = surface.model.candidatesForSlot(slot.id).map(candidate => ({ ...candidate, direction: surface._projectDirection(slot.center, candidate.tangent) })).filter(candidate => candidate.direction);
                for (const candidate of candidates) {
                    const choices = dragSliceChoices(candidates, candidate.direction.x * 20, candidate.direction.y * 20);
                    if (choices.length === 2) { gesture = { slot, direction: candidate.direction }; break; }
                }
                if (gesture) break;
            }
            if (!gesture) throw new Error('No real ambiguous octahedron swipe found');
            const begin = () => {
                surface._startDrag(gesture.slot.id, 600, 350);
                surface._updateDrag(600 + gesture.direction.x * 20, 350 + gesture.direction.y * 20);
                surface.render();
            };
            window.__beginSliceChoice = begin;
            const colors = surface.model.colors.join(',');
            begin();
            if (surface.model.colors.join(',') !== colors) throw new Error('Puzzle moved before selection');
            return { choices: surface.drag.choices.length, glowMeshes: surface.sliceChoiceOverlay.group.children.length, boxes: surface.scene.children.filter(object => object.isBox3Helper).length };
        })()`);
        const choicesCapture = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
        await writeFile(path.join(artifacts, 'rubiks-octahedron-choices.png'), Buffer.from(choicesCapture.data, 'base64'));
        const selection = await client.evaluate(`(() => {
            const surface = window.app.currentGame.surfaceMode;
            const colors = () => surface.model.colors.join(',');
            const before = colors();
            const original = surface.drag.slotIndex;
            surface._mouseUp({ button: 0 });
            surface._resumeSliceChoice({ clientX: 600, clientY: 350, preventDefault() {} }, '3d', original);
            if (!surface.drag.choices) throw new Error('Shared field selected a slice');
            surface._resumeSliceChoice({ preventDefault() {} }, '3d', null);
            if (surface.drag || surface.sliceChoiceOverlay) throw new Error('Background did not cancel');
            window.__beginSliceChoice();
            const choices = surface.drag.choices;
            const slot = choices[0].move.selected.find(slot => !choices[1].move.selectedSet.has(slot));
            surface._resumeSliceChoice({ clientX: 600, clientY: 350, preventDefault() {} }, '3d', slot);
            const chosen = surface.drag.chosen;
            if (!chosen || chosen.axisIndex !== choices[0].axisIndex) throw new Error('Exclusive field did not select its slice');
            surface._updateDrag(600 + chosen.direction.x * surface.dragPixelsPerStep * 2, 350 + chosen.direction.y * surface.dragPixelsPerStep * 2);
            surface._finishDrag(); surface._finishAnimationImmediately();
            if (surface.history.undo.length !== 1) throw new Error('Whole drag was not one history entry');
            const after = colors();
            window.app._isPaused = false;
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
            if (colors() !== before) throw new Error('Undo failed');
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
            window.app._isPaused = true;
            if (colors() !== after) throw new Error('Redo failed');
            const nav = surface.netNavigation;
            const point = nav.point(120, 100);
            const rect = surface.netCanvas.getBoundingClientRect();
            nav.wheel({ clientX: rect.left + 120, clientY: rect.top + 100, deltaY: -400, deltaMode: 0, preventDefault() {} });
            const anchored = nav.point(120, 100);
            if (Math.hypot(point[0] - anchored[0], point[1] - anchored[1]) > 1e-8) throw new Error('Zoom anchor drifted');
            nav.down({button:2,clientX:100,clientY:100,preventDefault(){},stopPropagation(){}});
            const oldX = nav.x;
            nav.move({clientX:140,clientY:130}); nav.up({button:2});
            if (nav.x !== oldX + 40) throw new Error('Right-drag pan failed');
            surface.netResizing = { width: 350, height: 270, startX: 0, startY: 0 };
            const style = surface.netPanel.style.cssText;
            surface._updateNetResize({clientX:-9999,clientY:9999});
            const full = surface.netPanel.getBoundingClientRect();
            if (Math.abs(full.width-innerWidth)>1 || Math.abs(full.height-innerHeight)>1) throw new Error('Net cannot fill window');
            surface.netPanel.style.cssText = style;
            surface.netResizing = null; nav.scale=1; nav.x=nav.y=0; surface._drawNet();
            return { exclusiveSelection:true, cancel:true, undoRedo:true, netNavigation:true, fullWindow:true };
        })()`);
        state.selection = { ...choiceState, ...selection };
    }
    if (mode !== 'torus') {
        const turn = await client.evaluate(`(() => {
            const surface = window.app.currentGame.surfaceMode;
            const move = surface.model.moves.find(move => move.layer === 1 && move.selected.length > 3);
            surface._applyAnimatedMove({ axisIndex: move.axisIndex, axis: move.axis, layer: move.layer, move }, 1);
            surface.animation.progress = 0.5;
            surface._refreshMeshes();
            surface.render();
            return { rotating: surface.bodyTurnMesh.visible, angle: surface.bodyTurnMesh.quaternion.angleTo(surface.bodyRestMesh.quaternion), movingVertices: surface.bodyTurnMesh.geometry.attributes.position.count, stationaryVertices: surface.bodyRestMesh.geometry.attributes.position.count };
        })()`);
        if (!turn.rotating || turn.angle < 0.1 || !turn.movingVertices || !turn.stationaryVertices) throw new Error('Missing rotating cubie bodies.');
        const movingCapture = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
        await writeFile(path.join(artifacts, `rubiks-${mode}-turn.png`), Buffer.from(movingCapture.data, 'base64'));
        await client.evaluate(`window.app.currentGame.surfaceMode._finishAnimationImmediately()`);
        state.turn = turn;
    }
    if (mode === 'octahedron') {
        state.restart = await client.evaluate(`(() => {
            const game = window.app.currentGame;
            window.app.restartGame({ ...game.settings, polyhedronOrder: 4 });
            if (game.mode !== 'octahedron' || game.surfaceMode?.model.order !== 4 || game.modeSelector) throw new Error('Resize returned to selector or ignored size');
            const restart = { mode: game.mode, order: game.surfaceMode.model.order };
            game.returnToModeSelector(); game.selectMode('cuboid');
            if (game.scoredRun || game.model.score() !== game.model.maximumScore) throw new Error('Cuboid did not start solved');
            game.hud.querySelector('[data-shuffle]').click();
            if (!game.scoredRun || !game.scrambleMoves.length) throw new Error('Cuboid shuffle failed');
            game.hud.querySelector('[data-solve]').click();
            if (game.scoredRun || game.model.score() !== game.model.maximumScore) throw new Error('Cuboid solve failed');
            const snapshot = () => JSON.stringify(game.model.stickers);
            const before = snapshot();
            game._startSliceDrag(game.model.stickers[0], 500, 350);
            const candidate = game.sliceDrag.candidates[0];
            game._updateSliceDrag(500 + candidate.direction[0] * game.dragPixelsPerQuarter * 2, 350 + candidate.direction[1] * game.dragPixelsPerQuarter * 2);
            game._finishSliceDrag(); game._finishTurnAnimationImmediately();
            if (game.history.undo.length !== 1) throw new Error('Cuboid history did not record drag');
            const after = snapshot(); game.history.step(false);
            if (snapshot() !== before) throw new Error('Cuboid undo failed');
            game.history.step(true);
            if (snapshot() !== after || game.layerHelper?.visible) throw new Error('Cuboid redo or box removal failed');
            window.app.restartGame({ ...game.settings, nx: 4 });
            if (game.mode !== 'cuboid' || game.nx !== 4) throw new Error('Cuboid resize left game');
            game.returnToModeSelector(); game.selectMode('torus');
            const surface = game.surfaceMode;
            if (surface.scoredRun || surface.model.score() !== surface.model.maximumScore) throw new Error('Torus did not start solved');
            surface.hud.querySelector('[data-shuffle]').click();
            if (!surface.scoredRun) throw new Error('Torus shuffle failed');
            surface.hud.querySelector('[data-solve]').click();
            if (surface.scoredRun || surface.model.score() !== surface.model.maximumScore) throw new Error('Torus solve failed');
            const colors = surface.model.colors.join(',');
            surface.model.applyMove('u',0,2); surface.history.record({axis:'u',layer:0,turns:2});
            const changed = surface.model.colors.join(','); surface.history.step(false);
            if (surface.model.colors.join(',') !== colors) throw new Error('Torus undo failed');
            surface.history.step(true);
            if (surface.model.colors.join(',') !== changed) throw new Error('Torus redo failed');
            return { ...restart, cuboid:true, torus:true };
        })()`);
    }
    const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
    if (exceptions.length) throw new Error(`Renderer exceptions: ${JSON.stringify(exceptions.slice(0, 2))}`);
    console.log(JSON.stringify(state));
    }
} catch (error) {
    console.error(error.stack || error);
    if (stdout.trim()) console.error(stdout);
    if (stderr.trim()) console.error(stderr);
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
}
