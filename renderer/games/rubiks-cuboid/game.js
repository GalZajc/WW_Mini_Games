import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requireInteger, requirePositiveNumber } from '../../core/SettingsValidation.js';
import { PolyLabTrackballOrbitControls } from '../../core/PolyLabTrackballOrbitControls.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import {
    initializeModeSettings,
    switchModeSettings,
    syncActiveModeProfile,
    withModeProfiles,
} from '../../core/ModeSettings.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {
    AXES,
    AXIS_INDEX,
    FACE_COLORS,
    FACE_KEYS,
    CuboidModel,
} from './model.js';
import { TwistySurfaceMode } from './twisty-surface-mode.js';
import { TWISTY_MODE_INFO } from './twisty-models.js';

const PARAMETERS = Object.freeze({
    nx: 3,
    ny: 3,
    nz: 4,
    dragPixelsPerQuarter: 58,
    turnAnimationSpeed: 720,
    cubieSize: 1,
    stickerSize: 0.9,
    stickerCornerRadius: 0.105,
    stickerLift: 0.502,
    trackballRotateSpeed: 4,
});

const TURN_SOUND_URL = new URL('./assets/turn-click.wav', import.meta.url).href;
const RELEASE_SOUND_URL = new URL('./assets/turn-release.wav', import.meta.url).href;

const COLOR_VALUES = Object.freeze(Object.fromEntries(
    Object.entries(FACE_COLORS).map(([key, value]) => [key, Number.parseInt(value.slice(1), 16)])
));
const AXIS_VECTORS = Object.freeze({
    x: Object.freeze([1, 0, 0]),
    y: Object.freeze([0, 1, 0]),
    z: Object.freeze([0, 0, 1]),
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TWISTY_MODE_KEYS = Object.freeze(Object.keys(TWISTY_MODE_INFO));

function initializeTwistySettings(settings) {
    let source = settings || {};
    if (!source.modeProfiles || Object.keys(source.modeProfiles).length === 0) {
        const schema = CuboidModeGame.getSettingsSchema();
        const profiles = {};
        for (const mode of TWISTY_MODE_KEYS) {
            profiles[mode] = Object.fromEntries(schema
                .filter(setting => setting.key !== 'mode' && source[setting.key] !== undefined &&
                    (!setting.modes?.length || setting.modes.includes(mode)))
                .map(setting => [setting.key, typeof structuredClone === 'function'
                    ? structuredClone(source[setting.key])
                    : JSON.parse(JSON.stringify(source[setting.key]))]));
        }
        source = { ...source, modeProfiles: profiles };
    }
    return initializeModeSettings(
        source, TWISTY_MODE_KEYS, CuboidModeGame.getSettingsSchema(), 'cuboid');
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const length2 = vector => Math.hypot(vector[0], vector[1]);

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}

function roundedStickerGeometry(size, radius) {
    const half = size * 0.5;
    const corner = Math.min(radius, half);
    const shape = new THREE.Shape();
    shape.moveTo(-half + corner, -half);
    shape.lineTo(half - corner, -half);
    shape.quadraticCurveTo(half, -half, half, -half + corner);
    shape.lineTo(half, half - corner);
    shape.quadraticCurveTo(half, half, half - corner, half);
    shape.lineTo(-half + corner, half);
    shape.quadraticCurveTo(-half, half, -half, half - corner);
    shape.lineTo(-half, -half + corner);
    shape.quadraticCurveTo(-half, -half, -half + corner, -half);
    return new THREE.ShapeGeometry(shape, 5);
}

class CuboidModeGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.preparePauseSettings(this.settings || {});
        this.nx = Math.round(Number(this.settings.nx ?? PARAMETERS.nx));
        this.ny = Math.round(Number(this.settings.ny ?? PARAMETERS.ny));
        this.nz = Math.round(Number(this.settings.nz ?? PARAMETERS.nz));
        this.dragPixelsPerQuarter = Number(this.settings.dragPixelsPerQuarter ?? PARAMETERS.dragPixelsPerQuarter);
        this.turnAnimationSpeed = Number(this.settings.turnAnimationSpeed ?? PARAMETERS.turnAnimationSpeed);

        this.phase = 'playing';
        this.elapsed = 0;
        this.moves = 0;
        this.bestMoves = null;
        this.runStarted = false;
        this.scoreSubmitted = false;
        this.sliceDrag = null;
        this.netResizing = null;
        this.moveHistory = [];
        this.turnAnimation = null;

        this.audio?.loadSound?.('rubik-turn', TURN_SOUND_URL).catch(error => {
            console.warn('Could not preload Rubik turn sound:', error);
        });
        this.audio?.loadSound?.('rubik-release', RELEASE_SOUND_URL).catch(error => {
            console.warn('Could not preload Rubik release sound:', error);
        });

        this.model = new CuboidModel(this.nx, this.ny, this.nz);
        this._scrambleModel();
        this.currentScore = this.model.score();

        this._setupThree();
        this._ensureHud();
        this._attachInput();
        this._refreshStickerInstances();
        this._loadBestRecord();
        this._renderHud();
        this._drawNet();
    }

    preparePauseSettings(settings) {
        requireInteger(settings.nx ?? PARAMETERS.nx, 'X cubies', { minimum: 1 });
        requireInteger(settings.ny ?? PARAMETERS.ny, 'Y cubies', { minimum: 1 });
        requireInteger(settings.nz ?? PARAMETERS.nz, 'Z cubies', { minimum: 1 });
        requirePositiveNumber(settings.dragPixelsPerQuarter ?? PARAMETERS.dragPixelsPerQuarter, 'Drag length per quarter-turn');
        requirePositiveNumber(settings.turnAnimationSpeed ?? PARAMETERS.turnAnimationSpeed, 'Turn animation speed');
        return settings;
    }

    _scrambleModel() {
        this.scrambleSeed = makeSeed();
        this.scrambleMoves = this.model.scramble(this.scrambleSeed);
        this.scrambleDiagnostics = { ...this.model.scrambleDiagnostics };
    }

    _setupThree() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.width, this.canvas.height, false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x78cfff);
        this.camera = new THREE.PerspectiveCamera(
            44,
            this.canvas.width / Math.max(1, this.canvas.height),
            0.05,
            100,
        );
        this.cameraTarget = new THREE.Vector3(0, 0, 0);
        this.cameraDistance = Math.max(this.nx, this.ny, this.nz) * 2.35 + 5.5;
        const initialYaw = 0.72;
        const initialPitch = 0.46;
        const horizontal = Math.cos(initialPitch) * this.cameraDistance;
        this.camera.position.set(
            Math.sin(initialYaw) * horizontal,
            Math.sin(initialPitch) * this.cameraDistance,
            Math.cos(initialYaw) * horizontal,
        );
        this.camera.lookAt(this.cameraTarget);
        this.camera.updateMatrixWorld(true);
        this.trackball = new PolyLabTrackballOrbitControls(this.camera, this.canvas, {
            button: 2,
            rotateSpeed: PARAMETERS.trackballRotateSpeed,
            zoomSpeed: 1.3,
            minDistance: Math.max(2.2, Math.max(this.nx, this.ny, this.nz) * 0.72),
            maxDistance: this.cameraDistance * 4,
            target: this.cameraTarget,
            onDragStateChange: dragging => {
                this.canvas.style.cursor = dragging ? 'grabbing' : 'default';
            },
        });

        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x4e8ec8, 2.05));
        const keyLight = new THREE.DirectionalLight(0xfff0d5, 2.5);
        keyLight.position.set(-6, 10, 8);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.camera.left = -10;
        keyLight.shadow.camera.right = 10;
        keyLight.shadow.camera.top = 10;
        keyLight.shadow.camera.bottom = -10;
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 35;
        this.scene.add(keyLight);

        const rimLight = new THREE.DirectionalLight(0x7caeff, 1.35);
        rimLight.position.set(8, 3, -7);
        this.scene.add(rimLight);

        this.puzzleGroup = new THREE.Group();
        this.scene.add(this.puzzleGroup);
        this._createCubieBodies();
        this._createStickerInstances();

        this.layerBox = new THREE.Box3();
        this.layerHelper = new THREE.Box3Helper(this.layerBox, 0xffd45c);
        this.layerHelper.visible = false;
        this.scene.add(this.layerHelper);

        this.raycaster = new THREE.Raycaster();
        this.pointerNdc = new THREE.Vector2();
    }

    _createCubieBodies() {
        const visibleCells = [];
        for (let x = 0; x < this.nx; x++) {
            for (let y = 0; y < this.ny; y++) {
                for (let z = 0; z < this.nz; z++) {
                    if (x !== 0 && x !== this.nx - 1
                        && y !== 0 && y !== this.ny - 1
                        && z !== 0 && z !== this.nz - 1) continue;
                    visibleCells.push([x, y, z]);
                }
            }
        }
        this.bodyCells = visibleCells;

        const geometry = new THREE.BoxGeometry(
            PARAMETERS.cubieSize,
            PARAMETERS.cubieSize,
            PARAMETERS.cubieSize,
        );
        const material = new THREE.MeshStandardMaterial({
            color: 0x111319,
            roughness: 0.62,
            metalness: 0.08,
        });
        this.bodyInstances = new THREE.InstancedMesh(geometry, material, visibleCells.length);
        this.bodyInstances.castShadow = true;
        this.bodyInstances.receiveShadow = true;
        this.puzzleGroup.add(this.bodyInstances);
        this._refreshBodyInstances();
    }

    _createStickerInstances() {
        const geometry = roundedStickerGeometry(
            PARAMETERS.stickerSize,
            PARAMETERS.stickerCornerRadius,
        );
        this.stickerInstances = [];
        for (const colorKey of FACE_KEYS) {
            const count = this.model.stickers.filter(sticker => sticker.color === colorKey).length;
            const material = new THREE.MeshStandardMaterial({
                color: COLOR_VALUES[colorKey],
                roughness: 0.38,
                metalness: 0.03,
                side: THREE.FrontSide,
            });
            const mesh = new THREE.InstancedMesh(geometry, material, count);
            mesh.userData.colorKey = colorKey;
            mesh.userData.stickers = [];
            mesh.castShadow = true;
            this.stickerInstances.push(mesh);
            this.puzzleGroup.add(mesh);
        }
    }

    _animationTransforms() {
        const animation = this.turnAnimation;
        if (!animation) return null;
        const t = clamp(animation.progress, 0, 1);
        const eased = t * t * (3 - 2 * t);
        const axis = new THREE.Vector3(...AXIS_VECTORS[animation.axis]);
        return {
            animation,
            axisIndex: AXIS_INDEX[animation.axis],
            forward: new THREE.Quaternion().setFromAxisAngle(axis, animation.angle * eased),
            residual: new THREE.Quaternion().setFromAxisAngle(axis, -animation.angle * (1 - eased)),
        };
    }

    _refreshBodyInstances() {
        if (!this.bodyInstances || !this.bodyCells) return;
        const transforms = this._animationTransforms();
        const dummy = new THREE.Object3D();
        for (let index = 0; index < this.bodyCells.length; index++) {
            const cell = this.bodyCells[index];
            dummy.position.set(
                cell[0] - (this.nx - 1) * 0.5,
                cell[1] - (this.ny - 1) * 0.5,
                cell[2] - (this.nz - 1) * 0.5,
            );
            dummy.quaternion.identity();
            if (transforms && cell[transforms.axisIndex] === transforms.animation.layer) {
                dummy.position.applyQuaternion(transforms.forward);
                dummy.quaternion.copy(transforms.forward);
            }
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            this.bodyInstances.setMatrixAt(index, dummy.matrix);
        }
        this.bodyInstances.instanceMatrix.needsUpdate = true;
        this.bodyInstances.computeBoundingSphere();
    }

    _refreshStickerInstances(drawNet = true) {
        const zAxis = new THREE.Vector3(0, 0, 1);
        const dummy = new THREE.Object3D();
        const baseQuaternion = new THREE.Quaternion();
        const transforms = this._animationTransforms();
        this._refreshBodyInstances();
        for (const mesh of this.stickerInstances) {
            const stickers = this.model.stickers.filter(sticker => sticker.color === mesh.userData.colorKey);
            mesh.userData.stickers = stickers;
            stickers.forEach((sticker, index) => {
                const centered = this.model.centeredPosition(sticker);
                const normal = new THREE.Vector3(...sticker.normal);
                dummy.position.set(...centered).addScaledVector(normal, PARAMETERS.stickerLift);
                baseQuaternion.setFromUnitVectors(zAxis, normal);
                dummy.quaternion.copy(baseQuaternion);
                if (transforms && sticker.position[transforms.axisIndex] === transforms.animation.layer) {
                    dummy.position.applyQuaternion(transforms.residual);
                    dummy.quaternion.copy(transforms.residual).multiply(baseQuaternion);
                }
                dummy.scale.set(1, 1, 1);
                dummy.updateMatrix();
                mesh.setMatrixAt(index, dummy.matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingSphere();
        }
        if (drawNet) this._drawNet();
    }

    _loadBestRecord() {
        const request = (this._bestRequest || 0) + 1;
        this._bestRequest = request;
        this.app?.records?.getBest(
            'rubiks-cuboid',
            this.getRecordSettings(this.settings),
            'moves',
            'min',
        )
            .then(record => {
                if (request !== this._bestRequest) return;
                const moves = Number(record?.results?.moves);
                if (Number.isFinite(moves)) this.bestMoves = moves;
                this._renderHud();
            })
            .catch(error => console.warn('Could not load Rubik cuboid record:', error));
    }

    _attachInput() {
        this._canvasMouseDown = event => {
            if (this.phase !== 'playing') return;
            if (event.button !== 0) return;
            const sticker = this._pickSticker(event.clientX, event.clientY);
            if (!sticker) return;
            event.preventDefault();
            this._startSliceDrag(sticker, event.clientX, event.clientY, '3d', null);
        };
        this._windowMouseMove = event => {
            if (this.netResizing) {
                this._updateNetResize(event);
                return;
            }
            if (this.sliceDrag) {
                this._updateSliceDrag(event.clientX, event.clientY);
            }
        };
        this._windowMouseUp = event => {
            if (this.netResizing && event.button === 0) {
                this.netResizing = null;
                return;
            }
            if (this.sliceDrag && event.button === 0) {
                this._finishSliceDrag();
            }
        };
        this.canvas.addEventListener('mousedown', this._canvasMouseDown);
        window.addEventListener('mousemove', this._windowMouseMove);
        window.addEventListener('mouseup', this._windowMouseUp);
    }

    _pickSticker(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        this.pointerNdc.set(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        const intersections = this.raycaster.intersectObjects(this.stickerInstances, false);
        for (const intersection of intersections) {
            const sticker = intersection.object.userData.stickers?.[intersection.instanceId];
            if (sticker) return sticker;
        }
        return null;
    }

    _startSliceDrag(sticker, clientX, clientY, source, netFace) {
        const tangentAxes = AXES.filter(axis => sticker.normal[AXIS_INDEX[axis]] === 0);
        const candidates = tangentAxes.map(axis => ({
            axis,
            layer: sticker.position[AXIS_INDEX[axis]],
            quarterTurnsAllowed: this.model.allowsQuarterTurns(axis),
            direction: source === 'net'
                ? this._netSliceDirection(sticker, axis, netFace)
                : this._projectedSliceDirection(sticker, axis),
        })).filter(candidate => length2(candidate.direction) > 0.001);
        if (candidates.length !== 2) return;

        this.runStarted = true;
        this.sliceDrag = {
            sticker,
            source,
            startX: clientX,
            startY: clientY,
            candidates,
            chosen: null,
            projectedDistance: 0,
            quarterTurns: 0,
            appliedAxis: null,
            appliedLayer: null,
            appliedQuarterTurns: 0,
        };
        this._updateSliceDrag(clientX, clientY);
    }

    _projectedSliceDirection(sticker, axis) {
        const centered = this.model.centeredPosition(sticker);
        const point = new THREE.Vector3(...centered).addScaledVector(
            new THREE.Vector3(...sticker.normal),
            PARAMETERS.stickerLift,
        );
        const axisVector = new THREE.Vector3(...AXIS_VECTORS[axis]);
        const faceNormal = new THREE.Vector3(...sticker.normal);
        const tangent = new THREE.Vector3().crossVectors(axisVector, faceNormal);
        if (tangent.lengthSq() < 1e-8) return [0, 0];
        tangent.normalize();

        const first = point.clone().project(this.camera);
        const second = point.clone().addScaledVector(tangent, 0.45).project(this.camera);
        const rect = this.canvas.getBoundingClientRect();
        const direction = [
            (second.x - first.x) * rect.width * 0.5,
            -(second.y - first.y) * rect.height * 0.5,
        ];
        const magnitude = length2(direction);
        return magnitude > 0 ? direction.map(value => value / magnitude) : [0, 0];
    }

    _netSliceDirection(sticker, axis, face) {
        const axisVector = AXIS_VECTORS[axis];
        const tangent = cross(axisVector, sticker.normal);
        const direction = [dot(tangent, face.u), dot(tangent, face.v)];
        const magnitude = length2(direction);
        return magnitude > 0 ? direction.map(value => value / magnitude) : [0, 0];
    }

    _updateSliceDrag(clientX, clientY) {
        const drag = this.sliceDrag;
        if (!drag) return;
        const delta = [clientX - drag.startX, clientY - drag.startY];
        const magnitude = length2(delta);
        const normalized = magnitude > 0.001 ? delta.map(value => value / magnitude) : [1, 0];

        const chosen = drag.candidates.reduce((best, candidate) => {
            const closeness = Math.abs(candidate.direction[0] * normalized[0]
                + candidate.direction[1] * normalized[1]);
            return !best || closeness > best.closeness ? { ...candidate, closeness } : best;
        }, null);
        drag.projectedDistance = delta[0] * chosen.direction[0]
            + delta[1] * chosen.direction[1];
        drag.quarterTurns = chosen.quarterTurnsAllowed
            ? Math.round(drag.projectedDistance / this.dragPixelsPerQuarter)
            : Math.round(drag.projectedDistance / (this.dragPixelsPerQuarter * 2)) * 2;
        drag.quarterTurns = clamp(drag.quarterTurns, -12, 12);
        drag.chosen = chosen;

        this._applyLiveSlicePreview(drag, chosen, drag.quarterTurns);
        this._showLayerHelper(chosen.axis, chosen.layer);
    }

    _applyLiveSlicePreview(drag, chosen, quarterTurns) {
        const changedSlice = drag.appliedAxis !== null
            && (drag.appliedAxis !== chosen.axis || drag.appliedLayer !== chosen.layer);
        let visuallyChanged = false;

        if (changedSlice) {
            if (drag.appliedQuarterTurns !== 0) {
                visuallyChanged = this._applyAnimatedModelTurn(
                    drag.appliedAxis,
                    drag.appliedLayer,
                    -drag.appliedQuarterTurns,
                ) || visuallyChanged;
            }
            drag.appliedQuarterTurns = 0;
        }

        drag.appliedAxis = chosen.axis;
        drag.appliedLayer = chosen.layer;
        const turnDelta = quarterTurns - drag.appliedQuarterTurns;
        if (turnDelta !== 0) {
            visuallyChanged = this._applyAnimatedModelTurn(
                chosen.axis,
                chosen.layer,
                turnDelta,
            ) || visuallyChanged;
            drag.appliedQuarterTurns = quarterTurns;
        }

        if (visuallyChanged) this._drawNet();
    }

    _applyAnimatedModelTurn(axis, layer, quarterTurns) {
        this._finishTurnAnimationImmediately();
        if (!this.model.rotate(axis, layer, quarterTurns)) return false;
        const duration = Math.max(
            0.025,
            Math.abs(quarterTurns) * 90 / this.turnAnimationSpeed,
        );
        this.turnAnimation = {
            axis,
            layer,
            angle: quarterTurns * Math.PI / 2,
            elapsed: 0,
            duration,
            progress: 0,
        };
        this._refreshStickerInstances(false);
        this.audio?.playSound?.('rubik-turn', { volume: 0.34 });
        return true;
    }

    _finishTurnAnimationImmediately() {
        if (!this.turnAnimation) return;
        this.turnAnimation.progress = 1;
        this._refreshStickerInstances(false);
        this.turnAnimation = null;
        this._refreshStickerInstances(false);
    }

    _showLayerHelper(axis, layer) {
        const halfDimensions = [this.nx, this.ny, this.nz].map(value => value * 0.5);
        const center = layer - (this.model.dimensions[AXIS_INDEX[axis]] - 1) * 0.5;
        const min = halfDimensions.map(value => -value - 0.04);
        const max = halfDimensions.map(value => value + 0.04);
        min[AXIS_INDEX[axis]] = center - 0.51;
        max[AXIS_INDEX[axis]] = center + 0.51;
        this.layerBox.min.set(...min);
        this.layerBox.max.set(...max);
        this.layerHelper.visible = true;
    }

    _finishSliceDrag() {
        const drag = this.sliceDrag;
        this.sliceDrag = null;
        this.layerHelper.visible = false;
        if (!drag?.chosen) return;

        this.audio?.playSound?.('rubik-release', { volume: 0.32 });
        if (drag.appliedQuarterTurns === 0) return;

        const normalized = ((drag.appliedQuarterTurns % 4) + 4) % 4;
        if (normalized === 0) return;
        if (!drag.chosen.quarterTurnsAllowed && normalized !== 2) return;
        const appliedTurns = normalized === 3 ? -1 : normalized;

        this.moves++;
        this.moveHistory.push({
            axis: drag.chosen.axis,
            layer: drag.chosen.layer,
            quarterTurns: appliedTurns,
        });
        this.currentScore = this.model.score();
        this._renderHud();
        if (this.currentScore === this.model.maximumScore) this._completeRun();
    }

    _cancelSliceDrag() {
        const drag = this.sliceDrag;
        this.sliceDrag = null;
        this.layerHelper.visible = false;
        this._finishTurnAnimationImmediately();
        if (!drag || drag.appliedAxis === null || drag.appliedQuarterTurns === 0) return;
        if (this.model.rotate(drag.appliedAxis, drag.appliedLayer, -drag.appliedQuarterTurns)) {
            this.turnAnimation = null;
            this._refreshStickerInstances();
        }
    }

    _completeRun() {
        if (this.phase !== 'playing') return;
        this.phase = 'complete';
        this.bestMoves = this.bestMoves === null ? this.moves : Math.min(this.bestMoves, this.moves);
        if (!this.scoreSubmitted) {
            this.submitScore({
                score: this.currentScore,
                maximumScore: this.model.maximumScore,
                moves: this.moves,
                seconds: Number(this.elapsed.toFixed(3)),
                scrambleSeed: this.scrambleSeed,
                scrambleMoveCount: this.scrambleMoves.length,
                scrambleAlgorithmVersion: this.scrambleDiagnostics.algorithmVersion,
                scrambleVerified: this.model.scrambleVerified,
                scrambleBurnInMoves: this.scrambleDiagnostics.burnInMoves,
                scramblePlateauReached: this.scrambleDiagnostics.plateauReached,
            });
            this.scoreSubmitted = true;
        }
        this._renderHud();
    }

    _newScramble() {
        this._cancelSliceDrag();
        this.turnAnimation = null;
        this.model = new CuboidModel(this.nx, this.ny, this.nz);
        this._scrambleModel();
        this.currentScore = this.model.score();
        this.phase = 'playing';
        this.elapsed = 0;
        this.moves = 0;
        this.runStarted = false;
        this.scoreSubmitted = false;
        this.moveHistory = [];
        this._refreshStickerInstances();
        this._renderHud();
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = `
            position:fixed; inset:0; z-index:760; pointer-events:none;
            font-family:Inter,system-ui,sans-serif; color:#242b27;
        `;
        this.hud.innerHTML = `
            <div style="position:absolute;top:14px;left:14px;min-width:285px;padding:12px 15px;border:2px solid #5e6661;border-radius:14px;background:rgba(220,224,221,.94);box-shadow:0 12px 30px rgba(35,55,44,.22);">
                <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#396047;">Rubik's Cuboid ${this.nx} × ${this.ny} × ${this.nz}</div>
                <div data-score style="margin-top:3px;font-size:34px;font-weight:900;line-height:1.08;">0 / 0</div>
                <div data-score-percent style="font-size:12px;color:#4f5d55;">0% colour match</div>
                <div data-run style="margin-top:6px;font-size:12px;color:#59675e;">0 moves · 0.0 s</div>
                <div data-best style="margin-top:3px;font-size:11px;color:#707b74;">Best: —</div>
            </div>
            <div data-net-panel style="position:absolute;top:14px;right:14px;width:330px;height:250px;min-width:220px;min-height:170px;max-width:720px;max-height:600px;border:2px solid #5e6661;border-radius:14px;background:rgba(201,206,202,.96);box-shadow:0 12px 32px rgba(35,55,44,.24);pointer-events:auto;overflow:hidden;">
                <div style="height:25px;padding:6px 10px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#3f4b43;border-bottom:1px solid #8c948f;">Live unfolded net · drag stickers here too</div>
                <canvas data-net-canvas style="display:block;width:100%;height:calc(100% - 25px);cursor:grab;"></canvas>
                <div data-net-resize title="Drag to resize" style="position:absolute;left:0;bottom:0;width:18px;height:18px;cursor:nesw-resize;background:linear-gradient(135deg,transparent 45%,rgba(255,255,255,.42) 46%,rgba(255,255,255,.42) 54%,transparent 55%);"></div>
            </div>
            <div data-complete style="display:none;position:absolute;inset:0;place-items:center;pointer-events:auto;background:rgba(35,55,44,.28);">
                <div style="width:min(390px,calc(100vw - 32px));padding:22px;border-radius:20px;background:rgba(225,230,226,.98);border:2px solid #5e6661;text-align:center;box-shadow:0 24px 70px rgba(35,55,44,.34);color:#242b27;">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.15em;color:#72f0b2;">Solved</div>
                    <div data-complete-score style="margin-top:8px;font-size:34px;font-weight:900;">0 moves</div>
                    <div data-complete-time style="margin-top:5px;font-size:14px;color:#59635d;">0.0 seconds</div>
                    <button data-new-scramble type="button" style="margin-top:16px;width:100%;padding:10px 12px;border:2px solid #18771f;border-radius:12px;background:linear-gradient(#69d84e,#24952d);color:white;font-size:13px;font-weight:800;cursor:pointer;">New scramble</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.hud);

        this.scoreElement = this.hud.querySelector('[data-score]');
        this.scorePercentElement = this.hud.querySelector('[data-score-percent]');
        this.runElement = this.hud.querySelector('[data-run]');
        this.bestElement = this.hud.querySelector('[data-best]');
        this.netPanel = this.hud.querySelector('[data-net-panel]');
        this.netCanvas = this.hud.querySelector('[data-net-canvas]');
        this.netResizeHandle = this.hud.querySelector('[data-net-resize]');
        this.completeElement = this.hud.querySelector('[data-complete]');
        this.completeScoreElement = this.hud.querySelector('[data-complete-score]');
        this.completeTimeElement = this.hud.querySelector('[data-complete-time]');
        this.newScrambleButton = this.hud.querySelector('[data-new-scramble]');

        this._netMouseDown = event => {
            if (event.button !== 0 || this.phase !== 'playing') return;
            const rect = this.netCanvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            const hit = this.netHitCells?.find(cell =>
                x >= cell.x && x <= cell.x + cell.width && y >= cell.y && y <= cell.y + cell.height
            );
            if (!hit) return;
            event.preventDefault();
            event.stopPropagation();
            this._startSliceDrag(hit.sticker, event.clientX, event.clientY, 'net', hit.face);
        };
        this._netResizeDown = event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = this.netPanel.getBoundingClientRect();
            this.netResizing = {
                startX: event.clientX,
                startY: event.clientY,
                width: rect.width,
                height: rect.height,
            };
        };
        this._newScrambleClick = () => this._newScramble();
        this.netCanvas.addEventListener('mousedown', this._netMouseDown);
        this.netResizeHandle.addEventListener('mousedown', this._netResizeDown);
        this.newScrambleButton.addEventListener('click', this._newScrambleClick);
    }

    _updateNetResize(event) {
        const resize = this.netResizing;
        const width = clamp(resize.width - (event.clientX - resize.startX), 220, 720);
        const height = clamp(resize.height + (event.clientY - resize.startY), 170, 600);
        this.netPanel.style.width = `${width}px`;
        this.netPanel.style.height = `${height}px`;
        this._drawNet();
    }

    _netFaces() {
        const rowY = this.nz;
        return [
            { key: '-x', normal: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0], columns: this.nz, rows: this.ny, gx: 0, gy: rowY },
            { key: '+z', normal: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0], columns: this.nx, rows: this.ny, gx: this.nz, gy: rowY },
            { key: '+x', normal: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0], columns: this.nz, rows: this.ny, gx: this.nz + this.nx, gy: rowY },
            { key: '-z', normal: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0], columns: this.nx, rows: this.ny, gx: this.nz + this.nx + this.nz, gy: rowY },
            { key: '+y', normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1], columns: this.nx, rows: this.nz, gx: this.nz, gy: 0 },
            { key: '-y', normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1], columns: this.nx, rows: this.nz, gx: this.nz, gy: rowY + this.ny },
        ];
    }

    _drawNet() {
        if (!this.netCanvas || !this.model) return;
        const rect = this.netCanvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const pixelRatio = Math.min(window.devicePixelRatio, 2);
        const width = Math.max(1, Math.round(rect.width * pixelRatio));
        const height = Math.max(1, Math.round(rect.height * pixelRatio));
        if (this.netCanvas.width !== width || this.netCanvas.height !== height) {
            this.netCanvas.width = width;
            this.netCanvas.height = height;
        }
        const ctx = this.netCanvas.getContext('2d');
        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.fillStyle = '#aeb4b0';
        ctx.fillRect(0, 0, rect.width, rect.height);

        const gridWidth = this.nx * 2 + this.nz * 2;
        const gridHeight = this.ny + this.nz * 2;
        const padding = 10;
        const cellSize = Math.max(3, Math.min(
            (rect.width - padding * 2) / gridWidth,
            (rect.height - padding * 2) / gridHeight,
        ));
        const offsetX = (rect.width - gridWidth * cellSize) * 0.5;
        const offsetY = (rect.height - gridHeight * cellSize) * 0.5;
        const faces = this._netFaces();
        this.netHitCells = [];

        for (const face of faces) {
            ctx.fillStyle = '#737a75';
            ctx.fillRect(
                offsetX + face.gx * cellSize,
                offsetY + face.gy * cellSize,
                face.columns * cellSize,
                face.rows * cellSize,
            );
            const faceStickers = this.model.stickers.filter(sticker =>
                sticker.normal[0] === face.normal[0]
                && sticker.normal[1] === face.normal[1]
                && sticker.normal[2] === face.normal[2]
            );
            for (const sticker of faceStickers) {
                const centered = this.model.centeredPosition(sticker);
                const column = Math.round(dot(centered, face.u) + (face.columns - 1) * 0.5);
                const row = Math.round(dot(centered, face.v) + (face.rows - 1) * 0.5);
                const x = offsetX + (face.gx + column) * cellSize;
                const y = offsetY + (face.gy + row) * cellSize;
                ctx.fillStyle = FACE_COLORS[sticker.color];
                ctx.fillRect(x + 1, y + 1, Math.max(1, cellSize - 2), Math.max(1, cellSize - 2));
                ctx.strokeStyle = 'rgba(0,0,0,.72)';
                ctx.lineWidth = 1;
                ctx.strokeRect(x + 0.5, y + 0.5, cellSize - 1, cellSize - 1);
                this.netHitCells.push({
                    x, y, width: cellSize, height: cellSize, sticker, face,
                });
            }
        }

        const occupied = new Map();
        for (const face of faces) {
            for (let row = 0; row < face.rows; row++) {
                for (let column = 0; column < face.columns; column++) {
                    occupied.set(`${face.gx + column},${face.gy + row}`, face.key);
                }
            }
        }

        const outerEdges = new Map();
        const internalEdges = new Map();
        const directions = [
            { dx: -1, dy: 0, edge: [0, 0, 0, 1] },
            { dx: 1, dy: 0, edge: [1, 0, 1, 1] },
            { dx: 0, dy: -1, edge: [0, 0, 1, 0] },
            { dx: 0, dy: 1, edge: [0, 1, 1, 1] },
        ];
        for (const [cellKey, faceKey] of occupied) {
            const [cellX, cellY] = cellKey.split(',').map(Number);
            for (const direction of directions) {
                const neighbour = occupied.get(`${cellX + direction.dx},${cellY + direction.dy}`);
                if (neighbour === faceKey) continue;
                const edge = [
                    cellX + direction.edge[0],
                    cellY + direction.edge[1],
                    cellX + direction.edge[2],
                    cellY + direction.edge[3],
                ];
                const endpointA = `${edge[0]},${edge[1]}`;
                const endpointB = `${edge[2]},${edge[3]}`;
                const edgeKey = endpointA < endpointB
                    ? `${endpointA}|${endpointB}`
                    : `${endpointB}|${endpointA}`;
                (neighbour === undefined ? outerEdges : internalEdges).set(edgeKey, edge);
            }
        }

        const strokeEdges = (edges, color, lineWidth) => {
            ctx.beginPath();
            for (const [x1, y1, x2, y2] of edges.values()) {
                ctx.moveTo(offsetX + x1 * cellSize, offsetY + y1 * cellSize);
                ctx.lineTo(offsetX + x2 * cellSize, offsetY + y2 * cellSize);
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'square';
            ctx.lineJoin = 'miter';
            ctx.stroke();
        };
        const unifiedBoundary = new Map([...outerEdges, ...internalEdges]);
        strokeEdges(
            unifiedBoundary,
            'rgba(0,0,0,.98)',
            Math.min(5.5, Math.max(3.8, cellSize * 0.21)),
        );
        strokeEdges(
            unifiedBoundary,
            'rgba(157,166,178,.98)',
            Math.min(2.2, Math.max(1.4, cellSize * 0.08)),
        );
        this.netBoundaryStats = {
            occupiedCells: occupied.size,
            outerEdges: outerEdges.size,
            internalEdges: internalEdges.size,
            unifiedEdges: unifiedBoundary.size,
        };
    }

    _renderHud() {
        if (!this.hud) return;
        const maximum = this.model.maximumScore;
        const percent = maximum > 0 ? this.currentScore / maximum * 100 : 0;
        this.scoreElement.textContent = `${this.currentScore} / ${maximum}`;
        this.scorePercentElement.textContent = `${percent.toFixed(1)}% colour match`;
        this.runElement.textContent = `${this.moves} moves · ${this.elapsed.toFixed(1)} s · scramble ${this.scrambleMoves.length} moves`;
        this.bestElement.textContent = this.bestMoves === null
            ? 'Best for these settings: —'
            : `Best for these settings: ${this.bestMoves} moves`;
        this.completeElement.style.display = this.phase === 'complete' ? 'grid' : 'none';
        this.completeScoreElement.textContent = `${this.moves} moves`;
        this.completeTimeElement.textContent = `${this.elapsed.toFixed(1)} seconds`;
    }

    update(dt) {
        this.trackball?.update();
        if (this.turnAnimation) {
            this.turnAnimation.elapsed += dt;
            this.turnAnimation.progress = clamp(
                this.turnAnimation.elapsed / this.turnAnimation.duration,
                0,
                1,
            );
            this._refreshStickerInstances(false);
            if (this.turnAnimation.progress >= 1) {
                this.turnAnimation = null;
                this._refreshStickerInstances(false);
            }
        }
        if (this.phase === 'playing' && this.runStarted) {
            this.elapsed += dt;
            this._renderHud();
        }
    }

    render() {
        this.renderer?.render(this.scene, this.camera);
    }

    onResize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
        this.trackball?.handleResize();
        this._drawNet();
    }

    onPause() {
        this.trackball?.cancel();
        this._cancelSliceDrag();
        this.canvas.style.cursor = 'default';
    }

    wantsPointerLockNow() {
        return false;
    }

    destroy() {
        this._bestRequest = (this._bestRequest || 0) + 1;
        if (this._canvasMouseDown) this.canvas.removeEventListener('mousedown', this._canvasMouseDown);
        if (this._windowMouseMove) window.removeEventListener('mousemove', this._windowMouseMove);
        if (this._windowMouseUp) window.removeEventListener('mouseup', this._windowMouseUp);
        if (this.netCanvas && this._netMouseDown) this.netCanvas.removeEventListener('mousedown', this._netMouseDown);
        if (this.netResizeHandle && this._netResizeDown) this.netResizeHandle.removeEventListener('mousedown', this._netResizeDown);
        if (this.newScrambleButton && this._newScrambleClick) {
            this.newScrambleButton.removeEventListener('click', this._newScrambleClick);
        }
        this.trackball?.dispose();
        this.trackball = null;
        this.hud?.remove();
        this.hud = null;

        this.scene?.traverse(object => {
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) material?.dispose?.();
        });
        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }

    static getSettingsSchema() {
        return [
            { key: 'mode', label: 'Mode', type: 'hidden', default: 'tetrahedron' },
            { key: 'nx', label: 'X cubies', type: 'number', min: 1, step: 1, default: PARAMETERS.nx, group: 'Cuboid dimensions', modes: ['cuboid'] },
            { key: 'ny', label: 'Y cubies', type: 'number', min: 1, step: 1, default: PARAMETERS.ny, group: 'Cuboid dimensions', modes: ['cuboid'] },
            { key: 'nz', label: 'Z cubies', type: 'number', min: 1, step: 1, default: PARAMETERS.nz, group: 'Cuboid dimensions', modes: ['cuboid'] },
            { key: 'torusU', label: 'Major-ring cells', type: 'number', min: 4, step: 1, default: 12, group: 'Torus dimensions', modes: ['torus'] },
            { key: 'torusV', label: 'Minor-ring cells', type: 'number', min: 3, step: 1, default: 6, group: 'Torus dimensions', modes: ['torus'] },
            { key: 'polyhedronOrder', label: 'Polyhedron cut order', type: 'number', min: 2, step: 1, default: 3, group: 'Polyhedron size', modes: ['tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron'] },
            { key: 'dragPixelsPerQuarter', label: 'Drag length / 90° [px]', type: 'range', min: 0, step: 2, strictPositive: true, default: PARAMETERS.dragPixelsPerQuarter, group: 'Controls' },
            { key: 'turnAnimationSpeed', label: 'Turn animation speed [°/s]', type: 'range', min: 0, step: 90, strictPositive: true, default: PARAMETERS.turnAnimationSpeed, group: 'Controls' },
        ];
    }

    getRecordSettings(settings = this.settings) {
        return {
            nx: Math.round(Number(settings.nx ?? PARAMETERS.nx)),
            ny: Math.round(Number(settings.ny ?? PARAMETERS.ny)),
            nz: Math.round(Number(settings.nz ?? PARAMETERS.nz)),
        };
    }

    static getControlsSchema() {
        return [];
    }
}

export default class RubiksTwistyGame extends CuboidModeGame {

    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.settings = initializeTwistySettings(this.settings);
        this.mode = null;
        this.surfaceMode = null;
        this.phase = 'mode-select';
        this.dragPixelsPerQuarter = Number(this.settings.dragPixelsPerQuarter ?? PARAMETERS.dragPixelsPerQuarter);
        this.turnAnimationSpeed = Number(this.settings.turnAnimationSpeed ?? PARAMETERS.turnAnimationSpeed);
        this._showModeSelector();
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        this.pendingMode = TWISTY_MODE_INFO[this.settings.mode] ? this.settings.mode : 'cuboid';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Rubik Twisty Puzzles',
            prompt: 'Choose puzzle',
            selectedMode: this.pendingMode,
            modes: Object.entries(TWISTY_MODE_INFO).map(([mode, info]) => ({
                key: mode,
                title: info.label,
                artKey: `twisty-${mode}`,
                description: `${info.sizeLabel}; independent settings and records.`,
            })),
        });
        this.modeSelector.insertAdjacentHTML('beforeend', '<div hidden data-size-panel></div>');
        document.body.appendChild(this.modeSelector);
        this._renderModeSizePanel();
        this._modeCardClick = bindModeGallery(this.modeSelector, {
            onMode: mode => this.selectMode(mode),
            onBack: () => this.endGame(),
        });
    }

    _numberField(key, label, min, max, value) {
        const bounds = `${Number.isFinite(Number(min)) ? `min=\"${min}\"` : ''} ${Number.isFinite(Number(max)) ? `max=\"${max}\"` : ''}`;
        return `<label style="display:grid;gap:4px;font-size:10px;color:#45604a;text-transform:uppercase;letter-spacing:.08em;">${label}
            <input data-size-key="${key}" type="number" step="1" ${bounds} value="${value}" style="width:100%;padding:7px 8px;border-radius:8px;font-size:13px;color-scheme:dark;">
        </label>`;
    }

    _capturePendingProfile() {
        if (!this.modeSelector || !TWISTY_MODE_INFO[this.pendingMode]) return;
        this.modeSelector.querySelectorAll('[data-size-key]').forEach(input => {
            this.settings[input.dataset.sizeKey] = Number(input.value);
        });
        this.settings.mode = this.pendingMode;
        this.settings = syncActiveModeProfile(
            this.settings,
            TWISTY_MODE_KEYS,
            CuboidModeGame.getSettingsSchema(),
            'cuboid',
        );
    }

    _selectPendingMode(mode) {
        if (!TWISTY_MODE_INFO[mode] || mode === this.pendingMode) return;
        this._capturePendingProfile();
        this.settings = switchModeSettings(
            this.settings,
            mode,
            TWISTY_MODE_KEYS,
            CuboidModeGame.getSettingsSchema(),
            'cuboid',
        );
        this.pendingMode = mode;
        this._renderModeSizePanel();
    }

    _renderModeSizePanel() {
        const panel = this.modeSelector?.querySelector('[data-size-panel]');
        if (!panel) return;
        if (this.pendingMode === 'cuboid') {
            panel.innerHTML = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                ${this._numberField('nx', 'X cubies', 1, undefined, this.settings.nx ?? PARAMETERS.nx)}
                ${this._numberField('ny', 'Y cubies', 1, undefined, this.settings.ny ?? PARAMETERS.ny)}
                ${this._numberField('nz', 'Z cubies', 1, undefined, this.settings.nz ?? PARAMETERS.nz)}
            </div>`;
        } else if (this.pendingMode === 'torus') {
            panel.innerHTML = `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
                ${this._numberField('torusU', 'Major-ring cells', 4, undefined, this.settings.torusU ?? 12)}
                ${this._numberField('torusV', 'Minor-ring cells', 3, undefined, this.settings.torusV ?? 6)}
            </div>`;
        } else {
            const minimum = 2;
            const maximum = TWISTY_MODE_INFO[this.pendingMode].maxOrder;
            panel.innerHTML = `<div style="display:grid;grid-template-columns:1fr;gap:8px;">
                ${this._numberField('polyhedronOrder', TWISTY_MODE_INFO[this.pendingMode].sizeLabel, minimum, maximum, this.settings.polyhedronOrder ?? 2)}
            </div>`;
        }
    }

    selectMode(mode) {
        if (!TWISTY_MODE_INFO[mode]) return false;
        if (this.pendingMode !== mode) this._selectPendingMode(mode);
        this._capturePendingProfile();
        if (this.settings.mode !== mode) {
            this.settings = switchModeSettings(
                this.settings, mode, TWISTY_MODE_KEYS, CuboidModeGame.getSettingsSchema(), 'cuboid');
        }
        this.settings = syncActiveModeProfile(
            this.settings, TWISTY_MODE_KEYS, CuboidModeGame.getSettingsSchema(), 'cuboid');
        try {
            this.preparePauseSettings(this.settings);
        } catch (error) {
            const panel = this.modeSelector?.querySelector('[data-size-panel]');
            if (panel) {
                let message = panel.querySelector('[data-size-error]');
                if (!message) {
                    message = document.createElement('div');
                    message.dataset.sizeError = 'true';
                    panel.appendChild(message);
                }
                message.textContent = error.message;
                message.style.cssText = 'margin-top:8px;color:#b3261e;font-weight:800;font-size:11px;text-transform:none;letter-spacing:0;';
            }
            return false;
        }
        this.dragPixelsPerQuarter = Number(this.settings.dragPixelsPerQuarter ?? PARAMETERS.dragPixelsPerQuarter);
        this.turnAnimationSpeed = Number(this.settings.turnAnimationSpeed ?? PARAMETERS.turnAnimationSpeed);
        this.app.currentSettings = { ...this.settings };
        this.app.settingsManager.save('rubiks-cuboid', this.settings).catch(() => {});
        this.modeSelector?.remove();
        this.modeSelector = null;
        this.mode = mode;
        if (mode === 'cuboid') {
            super.init();
        } else {
            this.surfaceMode = new TwistySurfaceMode(this, mode);
            this.surfaceMode.init();
            this.phase = 'playing';
        }
        return true;
    }

    returnToModeSelector() {
        if (this.surfaceMode) {
            this.surfaceMode.destroy();
            this.surfaceMode = null;
        } else if (this.mode === 'cuboid') {
            super.destroy();
        }
        this.mode = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    update(dt) {
        if (this.surfaceMode) this.surfaceMode.update(dt);
        else if (this.mode === 'cuboid') super.update(dt);
    }

    render() {
        if (this.surfaceMode) this.surfaceMode.render();
        else if (this.mode === 'cuboid') super.render();
    }

    onResize(width, height) {
        if (this.surfaceMode) this.surfaceMode.onResize(width, height);
        else if (this.mode === 'cuboid') super.onResize(width, height);
    }

    onPause() {
        if (this.surfaceMode) this.surfaceMode.onPause();
        else if (this.mode === 'cuboid') super.onPause();
    }

    mountPauseSettings({ panel, settings }) {
        const mode = settings.mode || this.mode || 'cuboid';
        const input = panel.querySelector('[data-key="polyhedronOrder"]');
        if (!input || !TWISTY_MODE_INFO[mode]?.maxOrder) return;
        input.removeAttribute('max');
    }

    preparePauseSettings(settings) {
        const active = syncActiveModeProfile(
            settings, TWISTY_MODE_KEYS, CuboidModeGame.getSettingsSchema(), 'cuboid');
        const mode = active.mode || this.mode || 'cuboid';
        if (mode === 'cuboid') {
            requireInteger(active.nx ?? PARAMETERS.nx, 'X cubies', { minimum: 1 });
            requireInteger(active.ny ?? PARAMETERS.ny, 'Y cubies', { minimum: 1 });
            requireInteger(active.nz ?? PARAMETERS.nz, 'Z cubies', { minimum: 1 });
        } else if (mode === 'torus') {
            requireInteger(active.torusU ?? 12, 'Major-ring cells', { minimum: 4 });
            requireInteger(active.torusV ?? 6, 'Minor-ring cells', { minimum: 3 });
        } else {
            const maximum = TWISTY_MODE_INFO[mode]?.maxOrder;
            const order = requireInteger(active.polyhedronOrder ?? 2, 'Polyhedron cut order', { minimum: 2, maximum: maximum ?? Infinity });
            if (maximum && order > maximum) {
                throw new Error(`${TWISTY_MODE_INFO[mode].label} supports cut orders only through ${maximum}.`);
            }
        }
        requirePositiveNumber(active.dragPixelsPerQuarter ?? PARAMETERS.dragPixelsPerQuarter, 'Drag length per quarter-turn');
        requirePositiveNumber(active.turnAnimationSpeed ?? PARAMETERS.turnAnimationSpeed, 'Turn animation speed');
        return active;
    }

    destroy() {
        this.modeSelector?.remove();
        this.modeSelector = null;
        if (this.surfaceMode) {
            this.surfaceMode.destroy();
            this.surfaceMode = null;
        } else if (this.mode === 'cuboid') {
            super.destroy();
        }
        this.mode = null;
    }

    getRecordSettings(settings = this.settings) {
        const active = initializeTwistySettings(settings);
        const mode = active.mode || this.mode || 'cuboid';
        if (mode === 'cuboid') {
            return {
                mode,
                nx: Math.round(Number(active.nx ?? PARAMETERS.nx)),
                ny: Math.round(Number(active.ny ?? PARAMETERS.ny)),
                nz: Math.round(Number(active.nz ?? PARAMETERS.nz)),
            };
        }
        if (mode === 'torus') {
            return {
                mode,
                torusU: Math.round(Number(active.torusU ?? 12)),
                torusV: Math.round(Number(active.torusV ?? 6)),
            };
        }
        return {
            mode,
            order: Math.round(Number(active.polyhedronOrder ?? 2)),
        };
    }

    static getSettingsSchema() {
        return withModeProfiles(CuboidModeGame.getSettingsSchema());
    }

    static getControlsSchema() {
        return [];
    }
}
