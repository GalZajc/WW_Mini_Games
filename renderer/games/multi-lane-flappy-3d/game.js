import { BaseGame } from '../../core/BaseGame.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import { requireFiniteNumber, requireInteger, requirePositiveNumber } from '../../core/SettingsValidation.js';

const LANE_KEYS = ['Q', 'W', 'E', 'R', 'T', 'Z', 'U', 'I'];

/**
 * A fixed-forward, multi-lane version of Hoop Glider 3D. Each lane has its own
 * bird, gravity, hoop height, score, and flap key. Every active bird must clear
 * every row: the first failed lane ends the shared run.
 */
export default class MultiLaneFlappy3DGame extends BaseGame {

    init() {
        // All physical/gameplay parameters are collected here and in the schema.
        this.preparePauseSettings(this.settings || {});
        this.laneCount = Math.round(Number(this.settings.laneCount ?? 2));
        this.birdRadius = Number(this.settings.birdRadius ?? 0.75);
        this.ringRadius = this.birdRadius * Number(this.settings.ringRadiusRatio ?? 4.5);
        this.laneSpacing = Number(this.settings.laneSpacing ?? 10);
        this.rowSpacing = Number(this.settings.rowSpacing ?? 36);
        this.speed = Number(this.settings.speed ?? 18);
        this.gravity = Number(this.settings.gravity ?? 36);
        this.flapStrength = Number(this.settings.flapStrength ?? 15);
        this.minimumHoopHeight = Number(this.settings.minimumHoopHeight ?? 8);
        this.hoopHeightRange = Number(this.settings.hoopHeightRange ?? 25);
        this.sfxVolume = Number(this.settings.sfxVolume ?? 0.5);

        this.wantsPointerLock = false;
        this.phase = 'playing';
        this.score = 0;
        this.highScore = 0;
        this.travelZ = 0;
        this.rows = [];
        this.birds = [];
        this._highScoreRequest = (this._highScoreRequest || 0) + 1;

        this._setupThree();
        this._createBirds();
        for (let i = 0; i < 18; i++) this._spawnRow();
        this._createHUD();
        this._loadHighScore(this._highScoreRequest);
        this._updateCamera();
    }

    preparePauseSettings(settings) {
        requireInteger(settings.laneCount ?? 2, 'Number of lanes', { minimum: 1, maximum: LANE_KEYS.length });
        requireFiniteNumber(settings.sfxVolume ?? 0.5, 'SFX volume', { minimum: 0, maximum: 1 });
        requireFiniteNumber(settings.gravity ?? 36, 'Gravity', { minimum: 0 });
        requireFiniteNumber(settings.flapStrength ?? 15, 'Flap strength');
        requirePositiveNumber(settings.speed ?? 18, 'Forward speed');
        requirePositiveNumber(settings.birdRadius ?? 0.75, 'Bird radius');
        requirePositiveNumber(settings.ringRadiusRatio ?? 4.5, 'Hoop size ratio', { allowZero: false });
        if (Number(settings.ringRadiusRatio ?? 4.5) <= 1) throw new Error('Hoop size ratio must be greater than one bird radius so the bird can pass.');
        requirePositiveNumber(settings.rowSpacing ?? 36, 'Hoop row spacing');
        requirePositiveNumber(settings.laneSpacing ?? 10, 'Lane spacing');
        requireFiniteNumber(settings.minimumHoopHeight ?? 8, 'Minimum hoop height');
        requireFiniteNumber(settings.hoopHeightRange ?? 25, 'Hoop height variation', { minimum: 0 });
        return settings;
    }

    wantsPointerLockNow() {
        return false;
    }

    _laneX(index) {
        return (index - (this.laneCount - 1) / 2) * this.laneSpacing;
    }

    _setupThree() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.width, this.canvas.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x82cafa);
        this.scene.fog = new THREE.FogExp2(0x82cafa, 0.0045);
        this.camera = new THREE.PerspectiveCamera(66, this.canvas.width / this.canvas.height, 0.1, 1200);

        this.scene.add(new THREE.HemisphereLight(0xfff4d6, 0x173c5c, 1.7));
        const sun = new THREE.DirectionalLight(0xffffff, 1.6);
        sun.position.set(80, 160, 70);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.left = -160;
        sun.shadow.camera.right = 160;
        sun.shadow.camera.top = 160;
        sun.shadow.camera.bottom = -160;
        sun.shadow.camera.far = 600;
        this.scene.add(sun);
        this.sun = sun;

        const sea = new THREE.Mesh(
            new THREE.PlaneGeometry(8000, 8000),
            new THREE.MeshPhongMaterial({ color: 0x176b9b, specular: 0x9edfff, shininess: 100 }),
        );
        sea.rotation.x = -Math.PI / 2;
        sea.receiveShadow = true;
        this.scene.add(sea);

        const grid = new THREE.GridHelper(8000, 320, 0x174d6e, 0x1b5574);
        grid.position.y = 0.04;
        this.scene.add(grid);

        // Permanent lane boundaries make the parallel tracks readable even when
        // perspective causes distant hoops to visually converge.
        for (let boundary = 0; boundary <= this.laneCount; boundary++) {
            const x = (boundary - this.laneCount / 2) * this.laneSpacing;
            const geometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(x, 0.12, 300),
                new THREE.Vector3(x, 0.12, -8000),
            ]);
            const material = new THREE.LineBasicMaterial({
                color: 0xc5efff,
                transparent: true,
                opacity: 0.42,
            });
            this.scene.add(new THREE.Line(geometry, material));
        }

        this.ringGeometry = new THREE.TorusGeometry(this.ringRadius, 0.32, 8, 28);
        this.pillarGeometry = new THREE.CylinderGeometry(0.55, 1.35, 100, 8);
        this.activeRingMaterial = new THREE.MeshPhongMaterial({ color: 0x36c47a, emissive: 0x082d19, flatShading: true });
        this.passedRingMaterial = new THREE.MeshPhongMaterial({ color: 0x168a50, emissive: 0x042516, flatShading: true });
        this.pillarMaterial = new THREE.MeshPhongMaterial({ color: 0x25875a, emissive: 0x061a10, flatShading: true });
        this.failedMaterial = new THREE.MeshPhongMaterial({ color: 0xf02d4f, emissive: 0x5c0615, flatShading: true });
    }

    _createBirds() {
        for (let lane = 0; lane < this.laneCount; lane++) {
            const mesh = this._makeBird(lane);
            mesh.position.set(this._laneX(lane), 15, 0);
            this.scene.add(mesh);
            this.birds.push({
                lane,
                mesh,
                y: 15,
                velocityY: 0,
                alive: true,
                score: 0,
                lastFlapAt: -10,
            });
        }
    }

    _makeBird(lane) {
        const group = new THREE.Group();
        const hue = (0.12 + lane * 0.105) % 1;
        const bodyMat = new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(hue, 0.82, 0.57), shininess: 65 });
        const wingMat = new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(hue, 0.78, 0.39), flatShading: true });
        const whiteMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
        const blackMat = new THREE.MeshPhongMaterial({ color: 0x11131c });

        const body = new THREE.Mesh(new THREE.SphereGeometry(this.birdRadius, 16, 11), bodyMat);
        body.castShadow = true;
        group.add(body);

        for (const side of [-1, 1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(this.birdRadius * 0.24, 8, 6), whiteMat);
            eye.position.set(side * this.birdRadius * 0.43, this.birdRadius * 0.35, -this.birdRadius * 0.63);
            group.add(eye);
            const pupil = new THREE.Mesh(new THREE.SphereGeometry(this.birdRadius * 0.10, 7, 5), blackMat);
            pupil.position.set(side * this.birdRadius * 0.44, this.birdRadius * 0.36, -this.birdRadius * 0.79);
            group.add(pupil);
        }

        const beakGeo = new THREE.ConeGeometry(this.birdRadius * 0.2, this.birdRadius * 0.48, 7);
        beakGeo.rotateX(-Math.PI / 2);
        const beak = new THREE.Mesh(beakGeo, new THREE.MeshPhongMaterial({ color: 0xff7b32 }));
        beak.position.set(0, -0.05, -this.birdRadius * 1.08);
        group.add(beak);

        const wings = [];
        for (const side of [-1, 1]) {
            const wingGeo = new THREE.SphereGeometry(this.birdRadius * 0.62, 8, 4);
            wingGeo.scale(1, 0.18, 0.75);
            const wing = new THREE.Mesh(wingGeo, wingMat);
            wing.position.set(side * this.birdRadius * 0.98, -this.birdRadius * 0.15, 0.05);
            wing.castShadow = true;
            group.add(wing);
            wings.push(wing);
        }
        group.userData.wings = wings;
        group.userData.bodyMaterial = bodyMat;
        return group;
    }

    _spawnRow() {
        const z = this.rows.length ? this.rows[this.rows.length - 1].z - this.rowSpacing : -55;
        const row = { z, cells: [], resolved: Array(this.laneCount).fill(false) };

        for (let lane = 0; lane < this.laneCount; lane++) {
            const x = this._laneX(lane);
            const y = this.minimumHoopHeight + Math.random() * this.hoopHeightRange;
            const ring = new THREE.Mesh(this.ringGeometry, this.activeRingMaterial.clone());
            ring.position.set(x, y, z);
            ring.castShadow = true;
            this.scene.add(ring);

            const pillar = new THREE.Mesh(this.pillarGeometry, this.pillarMaterial.clone());
            pillar.position.set(x, y - 50 - this.ringRadius, z);
            pillar.castShadow = true;
            pillar.receiveShadow = true;
            this.scene.add(pillar);
            row.cells.push({ y, ring, pillar });
        }
        this.rows.push(row);
    }

    _removeRow(row) {
        for (const cell of row.cells) {
            this.scene.remove(cell.ring, cell.pillar);
            cell.ring.material?.dispose?.();
            cell.pillar.material?.dispose?.();
        }
    }

    update(dt) {
        if (this.phase !== 'playing') return;

        for (let lane = 0; lane < this.laneCount; lane++) {
            const bird = this.birds[lane];
            if (bird.alive && this.input.isActionJustDown(`lane${lane + 1}`)) {
                bird.velocityY = this.flapStrength;
                bird.lastFlapAt = performance.now() / 1000;
                this.audio.playBeep(390 + lane * 34, 0.035, 0.075 * this.sfxVolume);
            }
        }

        const previousZ = this.travelZ;
        this.travelZ -= this.speed * dt;
        const now = performance.now() / 1000;

        for (const bird of this.birds) {
            bird.mesh.position.z = this.travelZ;
            if (!bird.alive) continue;

            bird.velocityY -= this.gravity * dt;
            bird.y += bird.velocityY * dt;
            bird.mesh.position.y = bird.y;
            bird.mesh.rotation.x = -Math.atan2(bird.velocityY, this.speed);

            const flapPhase = Math.min(1, Math.max(0, 1 - (now - bird.lastFlapAt) * 5));
            const wingAngle = Math.sin(now * 14) * 0.18 + flapPhase * 0.85;
            bird.mesh.userData.wings[0].rotation.z = wingAngle;
            bird.mesh.userData.wings[1].rotation.z = -wingAngle;

            if (bird.y < this.birdRadius) {
                bird.y = this.birdRadius;
                bird.mesh.position.y = bird.y;
                this._failLane(bird, null);
                return;
            }
        }

        for (const row of this.rows) {
            if (!(previousZ > row.z && this.travelZ <= row.z)) continue;
            for (let lane = 0; lane < this.laneCount; lane++) {
                if (row.resolved[lane]) continue;
                row.resolved[lane] = true;
                const bird = this.birds[lane];
                if (!bird.alive) continue;
                const cell = row.cells[lane];
                if (Math.abs(bird.y - cell.y) <= this.ringRadius - this.birdRadius) {
                    bird.score++;
                    this.score++;
                    this.highScore = Math.max(this.highScore, this.score);
                    cell.ring.material.dispose();
                    cell.ring.material = this.passedRingMaterial.clone();
                    this.audio.playBeep(780 + lane * 28, 0.045, 0.10 * this.sfxVolume);
                } else {
                    this._failLane(bird, cell);
                    return;
                }
            }
        }

        while (this.rows.length && this.rows[0].z > this.travelZ + this.rowSpacing * 1.5) {
            this._removeRow(this.rows.shift());
        }
        while (this.rows.length < 18) this._spawnRow();

        if (this.sun) {
            this.sun.position.set(80, 160, this.travelZ + 70);
            this.sun.target.position.set(0, 12, this.travelZ - 25);
            this.sun.target.updateMatrixWorld();
        }

        this._updateCamera();
        this._updateHUD();
    }

    _failLane(bird, cell) {
        if (!bird.alive) return;
        bird.alive = false;
        bird.velocityY = 0;
        if (cell) {
            cell.ring.material.dispose();
            cell.pillar.material.dispose();
            cell.ring.material = this.failedMaterial.clone();
            cell.pillar.material = this.failedMaterial.clone();
        }
        this.audio.playTone(150, 0.18, 'sawtooth', 0.12 * this.sfxVolume);
        this._gameOver();
    }

    _updateCamera() {
        const width = Math.max(this.laneSpacing, (this.laneCount - 1) * this.laneSpacing);
        const distance = Math.max(28, width * 0.82 + 18);
        const height = 24 + Math.min(14, width * 0.12);
        this.camera.position.set(0, height, this.travelZ + distance);
        this.camera.lookAt(0, 15, this.travelZ - 30);
    }

    _createHUD() {
        this._hud = document.createElement('div');
        this._hud.style.cssText = `
            position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:700;
            display:flex;gap:5px;font-family:Inter,sans-serif;pointer-events:none;user-select:none;
        `;
        document.body.appendChild(this._hud);
        this._updateHUD();
    }

    _updateHUD() {
        if (!this._hud) return;
        this._hud.innerHTML = this.birds.map((bird, lane) => `
            <div style="min-width:52px;padding:5px 7px;border-radius:5px;text-align:center;
                        background:${bird.alive ? 'rgba(14,24,42,.76)' : 'rgba(70,10,18,.82)'};
                        border:1px solid ${bird.alive ? 'rgba(255,255,255,.25)' : '#ef476f'};
                        color:#fff;text-shadow:0 1px 3px #000;">
                <div style="font-size:12px;font-weight:800;color:#ffd166">${LANE_KEYS[lane]}</div>
                <div style="font-size:18px;font-weight:700">${bird.score}</div>
                <div style="font-size:9px;opacity:.7">${bird.alive ? `LANE ${lane + 1}` : 'OUT'}</div>
            </div>
        `).join('');
    }

    _loadHighScore(requestId) {
        if (!this.app?.records) return;
        this.app.records.getBest('multi-lane-flappy-3d', { ...this.settings }, 'score')
            .then(record => {
                if (requestId !== this._highScoreRequest) return;
                const value = Number(record?.results?.score);
                if (Number.isFinite(value)) this.highScore = Math.max(this.highScore, value);
            })
            .catch(error => console.warn('Could not load Multi-Lane Flappy 3D highscore:', error));
    }

    _gameOver() {
        if (this.phase === 'dead') return;
        this.phase = 'dead';
        this.highScore = Math.max(this.highScore, this.score);
        this.submitScore({
            score: this.score,
            laneScores: this.birds.map(bird => bird.score),
            laneCount: this.laneCount,
        });

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position:fixed;inset:0;z-index:800;display:flex;flex-direction:column;
            align-items:center;justify-content:center;background:rgba(39,94,61,.32);
            font-family:Inter,sans-serif;color:#202724;
        `;
        overlay.innerHTML = `
            <div style="min-width:360px;padding:22px 26px;border:2px solid #59645d;border-radius:18px;background:rgba(235,240,236,.96);box-shadow:0 20px 55px rgba(35,65,44,.3);text-align:center;">
                <div style="font-size:39px;font-weight:800;color:#d9363e;margin-bottom:10px">A BIRD MISSED</div>
                <div style="font-size:15px;margin-bottom:8px;color:#59645d">Every active bird must clear every hoop row.</div>
                <div style="font-size:26px">Total score: <b style="color:#b87b00">${this.score}</b></div>
                <div style="font-size:16px;margin:7px 0 24px;color:#59645d">Highscore: ${this.highScore}</div>
                <button data-restart style="padding:10px 25px;border:2px solid #187127;border-radius:9px;background:linear-gradient(#69d84e,#24952d);color:#fff;font-weight:800;cursor:pointer">▶ Play Again</button>
            </div>
        `;
        document.body.appendChild(overlay);
        this._gameOverOverlay = overlay;
        overlay.querySelector('[data-restart]').addEventListener('click', event => {
            event.stopPropagation();
            this.restart();
        });
    }

    onResize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    render() {
        this.renderer?.render(this.scene, this.camera);
    }

    destroy() {
        this._hud?.remove();
        this._hud = null;
        this._gameOverOverlay?.remove();
        this._gameOverOverlay = null;
        if (!this.scene) return;
        this.scene.traverse(obj => {
            if (!obj.isMesh && !obj.isLine) return;
            obj.geometry?.dispose?.();
            (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(material => material?.dispose?.());
        });
        this.ringGeometry?.dispose();
        this.pillarGeometry?.dispose();
        this.activeRingMaterial?.dispose();
        this.passedRingMaterial?.dispose();
        this.pillarMaterial?.dispose();
        this.failedMaterial?.dispose();
        this.renderer?.dispose();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }

    static getSettingsSchema() {
        return [
            {
                key: 'laneCount', label: 'Number of Lanes', type: 'select', default: '2',
                options: Array.from({ length: 8 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) })),
            },
            { key: 'sfxVolume', label: 'SFX Volume', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
            { key: 'gravity', label: 'Gravity', type: 'range', min: 10, max: 70, step: 2, default: 36 },
            { key: 'flapStrength', label: 'Flap Strength', type: 'range', min: 5, max: 32, step: 1, default: 15 },
            { key: 'speed', label: 'Forward Speed', type: 'range', min: 8, max: 40, step: 1, default: 18 },
            { key: 'birdRadius', label: 'Bird Radius', type: 'range', min: 0.45, max: 1.2, step: 0.05, default: 0.75 },
            { key: 'ringRadiusRatio', label: 'Hoop Size (× bird radius)', type: 'range', min: 2.5, max: 8, step: 0.25, default: 4.5 },
            { key: 'rowSpacing', label: 'Hoop Row Spacing', type: 'range', min: 20, max: 80, step: 2, default: 36 },
            { key: 'laneSpacing', label: 'Lane Spacing', type: 'range', min: 7, max: 16, step: 0.5, default: 10 },
            { key: 'minimumHoopHeight', label: 'Minimum Hoop Height', type: 'range', min: 5, max: 20, step: 1, default: 8 },
            { key: 'hoopHeightRange', label: 'Hoop Height Variation', type: 'range', min: 5, max: 45, step: 1, default: 25 },
        ];
    }

    static getControlsSchema() {
        const codes = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyZ', 'KeyU', 'KeyI'];
        return codes.map((code, index) => ({
            action: `lane${index + 1}`,
            label: `Flap Lane ${index + 1}`,
            defaultBindings: [{ type: 'keyboard', code }],
        }));
    }
}
