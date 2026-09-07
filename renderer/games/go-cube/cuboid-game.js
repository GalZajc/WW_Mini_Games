import { BaseGame } from '../../core/BaseGame.js';
import { requireInteger } from '../../core/SettingsValidation.js';
import { PolyLabTrackballOrbitControls } from '../../core/PolyLabTrackballOrbitControls.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import {
    BLACK,
    WHITE,
    GoGraphModel,
    createCuboidTopology,
    cuboidKey,
} from './go-model.js';

const VISUALS = Object.freeze({
    maximumGridSpan: 4.4,
    stoneRadiusRatio: 0.44,
    stoneLiftRatio: 0.34,
    gridLift: 0.012,
});

function makeFaceGeometry(center, u, v, width, height) {
    const corners = [
        center.clone().addScaledVector(u, -width / 2).addScaledVector(v, -height / 2),
        center.clone().addScaledVector(u, width / 2).addScaledVector(v, -height / 2),
        center.clone().addScaledVector(u, width / 2).addScaledVector(v, height / 2),
        center.clone().addScaledVector(u, -width / 2).addScaledVector(v, height / 2),
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap(point => point.toArray()), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    return geometry;
}

export default class GoCuboidGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});
        this.nx = Math.round(Number(this.settings.nx ?? 7));
        this.ny = Math.round(Number(this.settings.ny ?? 7));
        this.nz = Math.round(Number(this.settings.nz ?? 7));
        this.model = new GoGraphModel(createCuboidTopology(this.nx, this.ny, this.nz));
        this.elapsed = 0;
        this.raycaster = new THREE.Raycaster();
        this.pointerNdc = new THREE.Vector2();
        this._setupScene();
        this._ensureHud();
        this._rebuildStones();

        this._pointerDown = event => this._onPointerDown(event);
        this._keyDown = event => {
            if (event.code === 'KeyP') this._pass();
            if (event.code === 'KeyR') this._restartBoard();
        };
        this.canvas.addEventListener('pointerdown', this._pointerDown);
        window.addEventListener('keydown', this._keyDown);
    }

    _setupScene() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(this.canvas.width, this.canvas.height, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x72cdf2);
        this.scene.fog = new THREE.Fog(0x72cdf2, 18, 50);
        this.camera = new THREE.PerspectiveCamera(46, this.canvas.width / Math.max(1, this.canvas.height), 0.03, 100);

        this.scene.add(new THREE.HemisphereLight(0xe7f7ff, 0x687449, 1.55));
        const sun = new THREE.DirectionalLight(0xfff4d9, 2.5);
        sun.position.set(-7, 11, 9);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -8;
        sun.shadow.camera.right = 8;
        sun.shadow.camera.top = 8;
        sun.shadow.camera.bottom = -8;
        this.scene.add(sun);

        const maximumIntervals = Math.max(this.nx - 1, this.ny - 1, this.nz - 1, 1);
        this.cellSize = VISUALS.maximumGridSpan / maximumIntervals;
        this.boardWidth = Math.max(this.cellSize, (this.nx - 1) * this.cellSize);
        this.boardHeight = Math.max(this.cellSize, (this.ny - 1) * this.cellSize);
        this.boardDepth = Math.max(this.cellSize, (this.nz - 1) * this.cellSize);
        this.halfExtents = new THREE.Vector3(this.boardWidth / 2, this.boardHeight / 2, this.boardDepth / 2);
        this.stoneRadius = this.cellSize * VISUALS.stoneRadiusRatio;

        this.boardGroup = new THREE.Group();
        this.scene.add(this.boardGroup);
        this.faceMeshes = [];
        this._buildBoardFaces();

        const edgeGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(this.boardWidth, this.boardHeight, this.boardDepth));
        const edges = new THREE.LineSegments(edgeGeometry, new THREE.LineBasicMaterial({ color: 0x4c2b18 }));
        edges.renderOrder = 5;
        this.boardGroup.add(edges);

        this.stoneGeometry = new THREE.SphereGeometry(this.stoneRadius, 24, 16);
        this.blackMaterial = new THREE.MeshStandardMaterial({ color: 0x111416, roughness: 0.34, metalness: 0.04 });
        this.whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.4, metalness: 0.02 });
        this.stonesGroup = new THREE.Group();
        this.scene.add(this.stonesGroup);

        const radius = this.halfExtents.length();
        this.camera.position.set(radius * 1.55, radius * 1.18, radius * 1.8);
        this.camera.lookAt(0, 0, 0);
        this.controls = new PolyLabTrackballOrbitControls(this.camera, this.canvas, {
            button: 2,
            rotateSpeed: 4,
            zoomSpeed: 1.3,
            minDistance: Math.max(radius * 1.05, 2),
            maxDistance: radius * 8,
            target: new THREE.Vector3(0, 0, 0),
        });
    }

    _faceSpecs() {
        const ex = this.boardWidth / 2;
        const ey = this.boardHeight / 2;
        const ez = this.boardDepth / 2;
        return [
            {
                center: new THREE.Vector3(0, 0, ez), normal: new THREE.Vector3(0, 0, 1),
                u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0),
                width: this.boardWidth, height: this.boardHeight, countU: this.nx, countV: this.ny,
                key: (u, v) => cuboidKey(u, v, this.nz - 1),
            },
            {
                center: new THREE.Vector3(0, 0, -ez), normal: new THREE.Vector3(0, 0, -1),
                u: new THREE.Vector3(-1, 0, 0), v: new THREE.Vector3(0, 1, 0),
                width: this.boardWidth, height: this.boardHeight, countU: this.nx, countV: this.ny,
                key: (u, v) => cuboidKey(this.nx - 1 - u, v, 0),
            },
            {
                center: new THREE.Vector3(ex, 0, 0), normal: new THREE.Vector3(1, 0, 0),
                u: new THREE.Vector3(0, 0, -1), v: new THREE.Vector3(0, 1, 0),
                width: this.boardDepth, height: this.boardHeight, countU: this.nz, countV: this.ny,
                key: (u, v) => cuboidKey(this.nx - 1, v, this.nz - 1 - u),
            },
            {
                center: new THREE.Vector3(-ex, 0, 0), normal: new THREE.Vector3(-1, 0, 0),
                u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0),
                width: this.boardDepth, height: this.boardHeight, countU: this.nz, countV: this.ny,
                key: (u, v) => cuboidKey(0, v, u),
            },
            {
                center: new THREE.Vector3(0, ey, 0), normal: new THREE.Vector3(0, 1, 0),
                u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, -1),
                width: this.boardWidth, height: this.boardDepth, countU: this.nx, countV: this.nz,
                key: (u, v) => cuboidKey(u, this.ny - 1, this.nz - 1 - v),
            },
            {
                center: new THREE.Vector3(0, -ey, 0), normal: new THREE.Vector3(0, -1, 0),
                u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1),
                width: this.boardWidth, height: this.boardDepth, countU: this.nx, countV: this.nz,
                key: (u, v) => cuboidKey(u, 0, v),
            },
        ];
    }

    _buildBoardFaces() {
        const boardMaterial = new THREE.MeshStandardMaterial({
            color: 0xd79a4d,
            roughness: 0.63,
            metalness: 0.01,
            side: THREE.DoubleSide,
        });
        const gridMaterial = new THREE.LineBasicMaterial({ color: 0x5b351f, transparent: true, opacity: 0.92 });
        for (const spec of this._faceSpecs()) {
            const mesh = new THREE.Mesh(makeFaceGeometry(spec.center, spec.u, spec.v, spec.width, spec.height), boardMaterial);
            mesh.userData.faceSpec = spec;
            mesh.receiveShadow = true;
            this.boardGroup.add(mesh);
            this.faceMeshes.push(mesh);

            const positions = [];
            const liftedCenter = spec.center.clone().addScaledVector(spec.normal, VISUALS.gridLift);
            for (let index = 0; index < spec.countU; index++) {
                const amount = spec.countU === 1 ? 0 : -spec.width / 2 + spec.width * index / (spec.countU - 1);
                positions.push(
                    ...liftedCenter.clone().addScaledVector(spec.u, amount).addScaledVector(spec.v, -spec.height / 2).toArray(),
                    ...liftedCenter.clone().addScaledVector(spec.u, amount).addScaledVector(spec.v, spec.height / 2).toArray(),
                );
            }
            for (let index = 0; index < spec.countV; index++) {
                const amount = spec.countV === 1 ? 0 : -spec.height / 2 + spec.height * index / (spec.countV - 1);
                positions.push(
                    ...liftedCenter.clone().addScaledVector(spec.u, -spec.width / 2).addScaledVector(spec.v, amount).toArray(),
                    ...liftedCenter.clone().addScaledVector(spec.u, spec.width / 2).addScaledVector(spec.v, amount).toArray(),
                );
            }
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const lines = new THREE.LineSegments(geometry, gridMaterial);
            lines.renderOrder = 3;
            this.boardGroup.add(lines);
        }
    }

    _pointWorldPosition(point) {
        return new THREE.Vector3(
            -this.boardWidth / 2 + point.x * this.cellSize,
            -this.boardHeight / 2 + point.y * this.cellSize,
            -this.boardDepth / 2 + point.z * this.cellSize,
        );
    }

    _outwardNormal(point) {
        const normal = new THREE.Vector3();
        if (point.x === 0) normal.x -= 1;
        if (point.x === this.nx - 1) normal.x += 1;
        if (point.y === 0) normal.y -= 1;
        if (point.y === this.ny - 1) normal.y += 1;
        if (point.z === 0) normal.z -= 1;
        if (point.z === this.nz - 1) normal.z += 1;
        return normal.normalize();
    }

    _rebuildStones() {
        if (!this.stonesGroup) return;
        this.stonesGroup.clear();
        for (const [key, player] of this.model.board.entries()) {
            const point = this.model.topology.points.get(key);
            if (!point) continue;
            const normal = this._outwardNormal(point);
            const stone = new THREE.Mesh(this.stoneGeometry, player === BLACK ? this.blackMaterial : this.whiteMaterial);
            stone.position.copy(this._pointWorldPosition(point)).addScaledVector(normal, this.stoneRadius * VISUALS.stoneLiftRatio);
            stone.castShadow = true;
            stone.receiveShadow = true;
            this.stonesGroup.add(stone);
        }
    }

    _onPointerDown(event) {
        if (event.button !== 0 || this.controls?.dragging || this.model.gameOver) return;
        const rect = this.canvas.getBoundingClientRect();
        this.pointerNdc.set(
            ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
            -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.pointerNdc, this.camera);
        const hit = this.raycaster.intersectObjects(this.faceMeshes, false)[0];
        if (!hit) return;
        const spec = hit.object.userData.faceSpec;
        const relative = hit.point.clone().sub(spec.center);
        const uFloat = (relative.dot(spec.u) / spec.width + 0.5) * (spec.countU - 1);
        const vFloat = (relative.dot(spec.v) / spec.height + 0.5) * (spec.countV - 1);
        const u = Math.max(0, Math.min(spec.countU - 1, Math.round(uFloat)));
        const v = Math.max(0, Math.min(spec.countV - 1, Math.round(vFloat)));
        if (Math.abs(uFloat - u) > 0.54 || Math.abs(vFloat - v) > 0.54) return;
        if (this.model.place(spec.key(u, v))) {
            this.audio.playClick();
            this._rebuildStones();
            this._renderHud();
        }
    }

    _pass() {
        if (!this.model.pass()) return;
        this.audio.playClick();
        if (this.model.gameOver) this._submitResult();
        this._renderHud();
    }

    _submitResult() {
        const black = this.model.scores[BLACK];
        const white = this.model.scores[WHITE];
        this.submitScore({
            winner: black.total === white.total ? 'draw' : black.total > white.total ? 'black' : 'white',
            black,
            white,
            seconds: Number(this.elapsed.toFixed(3)),
        });
    }

    _restartBoard() {
        this.model = new GoGraphModel(createCuboidTopology(this.nx, this.ny, this.nz));
        this.elapsed = 0;
        this._rebuildStones();
        this._renderHud();
    }

    update(dt) {
        if (!this.model.gameOver) this.elapsed += dt;
    }

    render() {
        this.renderer?.render(this.scene, this.camera);
    }

    onResize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
        this.controls?.handleResize();
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = 'position:fixed;top:12px;left:12px;z-index:760;display:flex;align-items:center;gap:10px;padding:8px 10px;border:2px solid #58615b;border-radius:11px;background:rgba(235,238,235,.94);box-shadow:0 7px 20px rgba(38,68,47,.2);font:12px Inter,system-ui,sans-serif;color:#202724;pointer-events:auto';
        this.hud.innerHTML = `
            <span id="go-cuboid-turn" style="font-weight:900"></span>
            <span id="go-cuboid-score" style="color:#56625b"></span>
            <button id="go-cuboid-pass" type="button" style="padding:5px 12px;border:1px solid #68736b;border-radius:7px;background:#f8faf8;color:#26332a;font-weight:800;cursor:pointer">Pass</button>
            <button id="go-cuboid-restart" type="button" style="display:none;padding:5px 12px;border:1px solid #277632;border-radius:7px;background:#50c747;color:#153318;font-weight:800;cursor:pointer">Play again</button>`;
        document.body.appendChild(this.hud);
        this.turnElement = this.hud.querySelector('#go-cuboid-turn');
        this.scoreElement = this.hud.querySelector('#go-cuboid-score');
        this.passElement = this.hud.querySelector('#go-cuboid-pass');
        this.restartElement = this.hud.querySelector('#go-cuboid-restart');
        this._passClick = () => this._pass();
        this._restartClick = () => this._restartBoard();
        this.passElement.addEventListener('click', this._passClick);
        this.restartElement.addEventListener('click', this._restartClick);
        this._renderHud();
    }

    _renderHud() {
        if (!this.hud) return;
        if (this.model.gameOver) {
            const black = this.model.scores[BLACK];
            const white = this.model.scores[WHITE];
            this.turnElement.textContent = 'Final score';
            this.scoreElement.textContent = `Black ${black.total} · White ${white.total}`;
            this.passElement.style.display = 'none';
            this.restartElement.style.display = '';
        } else {
            this.turnElement.textContent = `${this.model.player === BLACK ? 'Black' : 'White'} to play`;
            this.scoreElement.textContent = `Captures ${this.model.captures[BLACK]}:${this.model.captures[WHITE]}`;
            this.passElement.style.display = '';
            this.restartElement.style.display = 'none';
        }
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this._pointerDown);
        window.removeEventListener('keydown', this._keyDown);
        this.passElement?.removeEventListener('click', this._passClick);
        this.restartElement?.removeEventListener('click', this._restartClick);
        this.hud?.remove();
        this.hud = null;
        this.controls?.dispose();
        this.controls = null;
        this.scene?.traverse(object => {
            if (!object.isMesh && !object.isLine && !object.isLineSegments) return;
            if (object.geometry !== this.stoneGeometry) object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                if (material !== this.blackMaterial && material !== this.whiteMaterial) material?.dispose?.();
            }
        });
        this.stoneGeometry?.dispose();
        this.blackMaterial?.dispose();
        this.whiteMaterial?.dispose();
        this.renderer?.dispose();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }

    static getSettingsSchema() {
        return [
            { key: 'nx', label: 'X-axis intersections (Nx)', type: 'number', min: 2, step: 1, default: 7 },
            { key: 'ny', label: 'Y-axis intersections (Ny)', type: 'number', min: 2, step: 1, default: 7 },
            { key: 'nz', label: 'Z-axis intersections (Nz)', type: 'number', min: 2, step: 1, default: 7 },
        ];
    }

    preparePauseSettings(settings) {
        requireInteger(settings.nx ?? 7, 'Cuboid X intersections', { minimum: 2 });
        requireInteger(settings.ny ?? 7, 'Cuboid Y intersections', { minimum: 2 });
        requireInteger(settings.nz ?? 7, 'Cuboid Z intersections', { minimum: 2 });
        return settings;
    }

    static getControlsSchema() { return []; }
}
