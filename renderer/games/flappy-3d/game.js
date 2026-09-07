import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';

/**
 * Hoop Glider 3D — Flappy Bird in proper 3D with Three.js
 *
 * Controls:
 *   Mouse X delta → steer (sensitivity adjustable)
 *   Arrow L/R     → steer
 *   Click / Space → flap
 *
 * Camera: 3rd person — yaw (phi) tracks birdYaw exactly, only height uses spring-damper.
 *
 * Fail conditions:
 *   - Missed hole / hit rim (when crossing ring plane)
 *   - Crossed ring from wrong side
 *   - Flying backward (vel dot ring-axis < threshold)
 *   - Fell in water
 */
export default class Flappy3DGame extends BaseGame {

    init() {
        this.preparePauseSettings(this.settings || {});
        this.cameraMode      = this.settings.cameraMode      || 'third';
        this.birdRadius      = 1.0;
        this.ringRadiusRatio = this.settings.ringRadiusRatio  ?? 4.0;
        this.ringRadius      = this.birdRadius * this.ringRadiusRatio;
        this.ringDist        = this.settings.pillarDist       ?? 40.0;
        this.maxSegmentTurn  = (this.settings.maxSegmentTurn  ?? 30) * (Math.PI / 180);
        this.deltaPhiMax     = (this.settings.deltaPhiMax     ?? 20) * (Math.PI / 180);
        this.mouseSens       = this.settings.mouseSens        ?? 0.003;
        this.camStiffness    = this.settings.camStiffness     ?? 8.0;
        this.camDamping      = this.settings.camDamping       ?? 0.85;
        this.sfxVolume       = this.settings.sfxVolume        ?? 0.5;  // 0–1 master SFX

        this.speed        = this.settings.speed        ?? 20.0;
        this.gravity      = this.settings.gravity       ?? 38.0;
        this.flapStrength = this.settings.flapStrength  ?? 17.0;
        this.railHeightRings = this.settings.railHeightRings ?? 2.0;
        this.railLook        = this.settings.railLook        || 'bird';
        this.fixedCamHeight  = this.settings.fixedCamHeight  ?? 35;       // world Y for 'fixed-y' mode
        this.fixedCamPitch   = (this.settings.fixedCamPitch  ?? -20) * (Math.PI / 180); // radians

        // IMPORTANT FOR FUTURE AI AGENTS:
        // This game uses raw mouse movement for steering, so pointer lock is mandatory
        // during active gameplay. If lock is removed, the invisible cursor can escape
        // the Electron window and the player loses control. Keep the mouse locked while
        // phase === 'playing', then release it for game-over and pause UI.

        // Bird state
        this.birdPos  = new THREE.Vector3(0, 15, 0);
        this.birdVelY = 0;
        this.birdYaw  = 0;

        // Mouse delta (X = yaw steering, Y = pitch for rail-mouse mode)
        this._mouseDeltaX = 0;
        this._mouseDeltaY = 0;
        this._camPitch    = 0;  // for rail 'mouse' look mode
        if (!this._onMouseMove) {
            this._onMouseMove = (e) => {
                this._mouseDeltaX += e.movementX;
                this._mouseDeltaY += e.movementY;
            };
            window.addEventListener('mousemove', this._onMouseMove);
        }

        this.score   = 0;
        this.highScore = 0;
        this.phase   = 'playing';
        this._dieMsg = '';
        this._highScoreRequest = (this._highScoreRequest || 0) + 1;

        // Path
        this.pillars       = [];
        this.lastPillarPos = new THREE.Vector3(0, 15, -this.ringDist * 1.5);
        this.lastSegYaw    = 0;

        // Three.js: setup once, reset scene on restart
        if (!this.renderer) {
            this._setupThree();
        } else {
            this._clearPillarsFromScene();
        }

        for (let i = 0; i < 18; i++) this._spawnPillar();

        this.birdMesh.position.copy(this.birdPos);
        this.birdMesh.visible = (this.cameraMode !== 'first');

        // Camera state
        this._camY              = this.birdPos.y + 5;
        this._camYVel           = 0;
        this._railCamY          = this.birdPos.y + this.railHeightRings * this.ringRadius;
        this._railSlopeSmoothed = 0;
        // Spring-damped look-Y for rail 'bird' mode (only vertical, horizontal is exact)
        this._railLookY         = this.birdPos.y;
        this._railLookYVel      = 0;

        this._ensureScoreDOM();
        this._loadHighScore(this._highScoreRequest);
        this.canvas.style.cursor = 'none';
    }

    preparePauseSettings(settings) {
        if (!['third', 'fixed-y', 'first', 'rail'].includes(settings.cameraMode ?? 'third')) {
            throw new Error('Perspective must be one of the available camera modes.');
        }
        if (!['bird', 'tangent', 'mouse'].includes(settings.railLook ?? 'bird')) {
            throw new Error('Rail camera look mode is invalid.');
        }
        requireFiniteNumber(settings.sfxVolume ?? 0.5, 'SFX volume', { minimum: 0, maximum: 1 });
        requireFiniteNumber(settings.mouseSens ?? 0.003, 'Mouse sensitivity');
        requireFiniteNumber(settings.camStiffness ?? 8, 'Camera stiffness', { minimum: 0 });
        requireFiniteNumber(settings.camDamping ?? 0.85, 'Camera damping', { minimum: 0 });
        requireFiniteNumber(settings.railHeightRings ?? 2, 'Rail camera height');
        requireFiniteNumber(settings.fixedCamHeight ?? 35, 'Fixed camera height');
        requireFiniteNumber(settings.fixedCamPitch ?? -20, 'Fixed camera pitch');
        requireFiniteNumber(settings.gravity ?? 38, 'Gravity', { minimum: 0 });
        requireFiniteNumber(settings.flapStrength ?? 17, 'Flap strength');
        requirePositiveNumber(settings.speed ?? 20, 'Forward speed');
        requirePositiveNumber(settings.ringRadiusRatio ?? 4, 'Ring size ratio');
        requirePositiveNumber(settings.pillarDist ?? 40, 'Hoop spacing');
        requireFiniteNumber(settings.maxSegmentTurn ?? 30, 'Maximum path bend', { minimum: 0 });
        requireFiniteNumber(settings.deltaPhiMax ?? 20, 'Maximum hoop tilt', { minimum: 0 });
        return settings;
    }

    wantsPointerLockNow() {
        return this.phase === 'playing';
    }

    _clearPillarsFromScene() {
        for (const p of this.pillars) {
            this.scene?.remove(p.ring);
            this.scene?.remove(p.pillar);
            p.ring.material?.dispose();
            p.pillar.material?.dispose();
        }
        this.pillars = [];
    }

    // ── Score DOM ────────────────────────────────────────────────

    _loadHighScore(requestId) {
        if (!this.app?.records) return;

        this.app.records.getBest('flappy-3d', { ...this.settings }, 'score')
            .then(record => {
                if (requestId !== this._highScoreRequest) return;
                const storedHighScore = Number(record?.results?.score);
                if (Number.isFinite(storedHighScore)) {
                    this.highScore = Math.max(this.highScore, storedHighScore);
                    this._updateScoreDOM();
                }
            })
            .catch(error => console.warn('Could not load 3D Flappy Bird highscore:', error));
    }

    _ensureScoreDOM() {
        if (!this._scoreElem) {
            const el = document.createElement('div');
            el.style.cssText = `
                position:fixed; top:18px; left:50%; transform:translateX(-50%);
                z-index:700; font-family:Inter,sans-serif; font-weight:700;
                color:#fff; letter-spacing:1px; text-align:center; line-height:1.15;
                text-shadow: 0 2px 8px rgba(0,0,0,0.6), 0 0 20px rgba(255,255,200,0.25);
                pointer-events:none; user-select:none;
            `;
            document.body.appendChild(el);
            this._scoreElem = el;
        }
        this._scoreElem.innerHTML = `
            <div style="font-size:34px;">Score: <span data-score-value>0</span></div>
            <div style="font-size:14px;color:rgba(255,255,255,0.72);margin-top:4px;">
                Highscore: <span data-highscore-value>0</span>
            </div>
        `;
        this._scoreValueElem = this._scoreElem.querySelector('[data-score-value]');
        this._highScoreValueElem = this._scoreElem.querySelector('[data-highscore-value]');
        this._updateScoreDOM();
    }

    _updateScoreDOM() {
        if (this._scoreValueElem) this._scoreValueElem.textContent = String(this.score);
        if (this._highScoreValueElem) this._highScoreValueElem.textContent = String(this.highScore);
    }

    _removeScoreDOM() {
        if (this._scoreElem) { this._scoreElem.remove(); this._scoreElem = null; }
        this._scoreValueElem = null;
        this._highScoreValueElem = null;
    }

    // ── Three.js Setup ───────────────────────────────────────────

    _setupThree() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.width, this.canvas.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

        this.scene            = new THREE.Scene();
        this.scene.fog        = new THREE.FogExp2(0x87ceeb, 0.005);
        this.scene.background = new THREE.Color(0x87ceeb);

        this.camera = new THREE.PerspectiveCamera(70, this.canvas.width / this.canvas.height, 0.1, 1000);

        // Lights
        this.scene.add(new THREE.AmbientLight(0xfff0cc, 0.6));
        const sun = new THREE.DirectionalLight(0xffeedd, 1.3);
        sun.position.set(100, 200, 80);
        sun.castShadow             = true;
        sun.shadow.mapSize.width   = 2048;
        sun.shadow.mapSize.height  = 2048;
        sun.shadow.camera.near     = 1;
        sun.shadow.camera.far      = 1500;
        sun.shadow.camera.left     = -300;
        sun.shadow.camera.right    = 300;
        sun.shadow.camera.top      = 300;
        sun.shadow.camera.bottom   = -300;
        sun.shadow.bias            = -0.0005;
        this.scene.add(sun);
        this.sunLight = sun;
        this.scene.add(new THREE.DirectionalLight(0xaaccff, 0.3));

        // Water
        const sea = new THREE.Mesh(
            new THREE.PlaneGeometry(8000, 8000),
            new THREE.MeshPhongMaterial({ color: 0x1a6696, specular: 0x88ccff, shininess: 120 })
        );
        sea.rotation.x = -Math.PI / 2;
        sea.receiveShadow = true;
        this.scene.add(sea);

        const grid = new THREE.GridHelper(8000, 200, 0x0d4466, 0x0f3355);
        grid.position.y = 0.05;
        this.scene.add(grid);

        // ── Bird ────────────────────────────────────
        // Local axes: +X = right, +Y = up, -Z = forward (direction of travel when birdYaw=0)
        // Eyes: on front-upper-left and front-upper-right face, visible from camera (behind)
        // Beak: tip at -Z (forward), pointing out of the ball
        // Wings: left (-X) and right (+X), horizontal
        // Tail: at +Z (behind)

        const BR = this.birdRadius;

        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xffd93d, emissive: 0x221800, shininess: 55 });
        this.birdMesh = new THREE.Mesh(new THREE.SphereGeometry(BR, 20, 14), bodyMat);
        this.birdMesh.castShadow = true;

        // Eyes — front-upper sides, visible from camera (behind) and from front
        const makeEye = (sx) => {
            const white = new THREE.Mesh(
                new THREE.SphereGeometry(BR * 0.30, 10, 8),
                new THREE.MeshPhongMaterial({ color: 0xffffff })
            );
            // Position slightly forward (-Z), upward (+Y), and to each side
            white.position.set(sx * BR * 0.48, BR * 0.40, -BR * 0.65);
            white.castShadow = true;
            this.birdMesh.add(white);

            const pupil = new THREE.Mesh(
                new THREE.SphereGeometry(BR * 0.135, 8, 6),
                new THREE.MeshPhongMaterial({ color: 0x111122 })
            );
            pupil.position.set(sx * BR * 0.50, BR * 0.41, -BR * 0.76);
            this.birdMesh.add(pupil);

            const shine = new THREE.Mesh(
                new THREE.SphereGeometry(BR * 0.05, 5, 4),
                new THREE.MeshPhongMaterial({ color: 0xffffff, emissive: 0xffffff })
            );
            shine.position.set(sx * BR * 0.50 + BR * 0.04, BR * 0.44, -BR * 0.79);
            this.birdMesh.add(shine);
        };
        makeEye(-1);   // left eye
        makeEye( 1);   // right eye

        // Beak — cone, tip in -Z direction (forward)
        // ConeGeometry: tip at +Y by default.
        // rotateX(-PI/2): +Y → -Z, so tip ends up at -Z. ✓
        const beakGeo = new THREE.ConeGeometry(BR * 0.20, BR * 0.50, 7);
        beakGeo.rotateX(-Math.PI / 2);
        const beak = new THREE.Mesh(beakGeo, new THREE.MeshPhongMaterial({ color: 0xff6b35, emissive: 0x330d00 }));
        beak.position.set(0, -BR * 0.08, -BR * 1.1);  // centered, pointing -Z
        this.birdMesh.add(beak);

        // Wings — left and right, flapping independently
        const makeWing = (sx) => {
            const geo = new THREE.SphereGeometry(BR * 0.65, 8, 4);
            geo.scale(1.0, 0.18, 0.80);
            const w = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0xf0c420, emissive: 0x1a1000, flatShading: true }));
            w.position.set(sx * BR * 1.05, -BR * 0.18, 0);
            w.castShadow = true;
            this.birdMesh.add(w);
            return w;
        };
        this.wingL = makeWing(-1);
        this.wingR = makeWing( 1);

        // Tail — behind (+Z)
        const tailGeo = new THREE.ConeGeometry(BR * 0.28, BR * 0.40, 5);
        tailGeo.rotateX(Math.PI / 2);   // tip → +Z (backward)
        const tail = new THREE.Mesh(tailGeo, new THREE.MeshPhongMaterial({ color: 0xe8b800, emissive: 0x150d00, flatShading: true }));
        tail.position.set(0, -BR * 0.08, BR * 1.0);
        this.birdMesh.add(tail);

        this.scene.add(this.birdMesh);

        // Shared geometry / materials
        this.ringGeo   = new THREE.TorusGeometry(this.ringRadius, 0.38, 8, 36);
        this.matActive = new THREE.MeshPhongMaterial({ color: 0x3cb478, emissive: 0x0a2e18, shininess: 40, flatShading: true });
        this.matPassed = new THREE.MeshPhongMaterial({ color: 0x3cb478, emissive: 0x062214, shininess: 20, flatShading: true });
        this.matDanger = new THREE.MeshPhongMaterial({ color: 0xff3333, emissive: 0x550000, flatShading: true });

        this.pillarGeo     = new THREE.CylinderGeometry(0.7, 1.8, 200, 8);
        this.pillarMat     = new THREE.MeshPhongMaterial({ color: 0x2d8a5e, emissive: 0x061a0e, flatShading: true });
        this.pillarMatDead = this.matDanger; // reuse same red material for pillar on death
    }

    // ── Pillar Generation ────────────────────────────────────────

    _spawnPillar() {
        const isFirst = this.pillars.length === 0;
        if (!isFirst) this.lastSegYaw += (Math.random() * 2 - 1) * this.maxSegmentTurn;

        const segYaw = this.lastSegYaw;
        const posX   = this.lastPillarPos.x + Math.sin(segYaw)  * this.ringDist;
        const posZ   = this.lastPillarPos.z - Math.cos(segYaw)  * this.ringDist;
        const posY   = 10 + Math.random() * 32;
        const center = new THREE.Vector3(posX, posY, posZ);

        // Normal points TOWARD the approaching bird:
        //   Bird travels in direction (sin(segYaw), 0, -cos(segYaw)).
        //   FROM direction = (-sin(segYaw), 0, cos(segYaw)).
        //   normalYaw = -segYaw  [gives sin(-s)=-sin(s), cos(-s)=cos(s)] ✓
        //   For isFirst (segYaw=0): normalYaw=0 → normal=(0,0,1) pointing+Z toward origin ✓
        const variation = isFirst ? 0 : (Math.random() * 2 - 1) * this.deltaPhiMax;
        const normalYaw = -segYaw + variation;
        const normal    = new THREE.Vector3(Math.sin(normalYaw), 0, Math.cos(normalYaw));

        const ring = new THREE.Mesh(this.ringGeo, this.matActive.clone());
        ring.position.copy(center);
        ring.rotation.y    = normalYaw;
        ring.castShadow    = true;
        ring.receiveShadow = true;
        this.scene.add(ring);

        const pillar = new THREE.Mesh(this.pillarGeo, this.pillarMat.clone());
        pillar.position.set(posX, posY - 100 - this.ringRadius, posZ);
        pillar.castShadow    = true;
        pillar.receiveShadow = true;
        this.scene.add(pillar);

        this.pillars.push({ center, normal, ring, pillar, passed: false, prevSign: null, segYaw });
        this.lastPillarPos.copy(center);
    }

    _cullOldPillars() {
        while (this.pillars.length > 2 && this.pillars[0].passed && this.pillars[1]?.passed) {
            const p = this.pillars.shift();
            this.scene.remove(p.ring);
            this.scene.remove(p.pillar);
            p.ring.material.dispose();
            p.pillar.material.dispose();
        }
    }

    // ── Resize ───────────────────────────────────────────────────

    onResize(w, h) {
        if (!this.renderer) return;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    // ── Update ───────────────────────────────────────────────────

    update(dt) {
        if (this.phase === 'dead') return;

        // Steering (horizontal)
        const rawDelta    = this._mouseDeltaX;
        this._mouseDeltaX = 0;
        this.birdYaw += rawDelta * this.mouseSens;

        // Rail pitch (vertical, only in rail+mouse mode)
        if (this.cameraMode === 'rail' && this.railLook === 'mouse') {
            const rawDeltaY   = this._mouseDeltaY;
            this._mouseDeltaY = 0;
            this._camPitch   -= rawDeltaY * this.mouseSens;  // down=positive Y → look down
            this._camPitch    = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 3, this._camPitch));
        } else {
            this._mouseDeltaY = 0;  // consume & discard
        }

        const keyTurn = 1.6;
        if (this.input.isKeyDown('ArrowLeft'))  this.birdYaw -= keyTurn * dt;
        if (this.input.isKeyDown('ArrowRight')) this.birdYaw += keyTurn * dt;
        const gpAxis = this.input.getAxis(0, 0);
        if (Math.abs(gpAxis) > 0.12) this.birdYaw += gpAxis * keyTurn * dt;

        // Flap
        if (this.input.isKeyJustDown('Space') || this.input.isMouseJustDown(0)) {
            this.birdVelY = this.flapStrength;
            this.audio.playBeep(440, 0.04, 0.10 * this.sfxVolume);
        }

        // Gravity + Move
        this.birdVelY -= this.gravity * dt;
        const birdVelX = Math.sin(this.birdYaw) * this.speed;
        const birdVelZ = -Math.cos(this.birdYaw) * this.speed;

        this.birdPos.x += birdVelX * dt;
        this.birdPos.y += this.birdVelY * dt;
        this.birdPos.z += birdVelZ * dt;

        // ── Bird Mesh: yaw + full 3D orientation ──────────────────
        // Three.js rotation.y = θ rotates local -Z to (-sin θ, 0, -cos θ).
        // We want forward = (sin birdYaw, 0, -cos birdYaw), so θ = -birdYaw.
        this.birdMesh.rotation.y = -this.birdYaw;
        // Pitch: beak points in actual 3D flight direction
        const pitch = Math.atan2(this.birdVelY, this.speed);
        this.birdMesh.rotation.x = -pitch;
        // Bank: lean into turns
        this.birdMesh.rotation.z = Math.max(-0.4, Math.min(0.4, -rawDelta * 0.005));
        this.birdMesh.position.copy(this.birdPos);

        // Wing flap
        const t = Date.now() / 110;
        if (this.wingL) this.wingL.rotation.z =  Math.sin(t) * 0.5;
        if (this.wingR) this.wingR.rotation.z = -Math.sin(t) * 0.5;

        // Shadow follows bird
        if (this.sunLight) {
            this.sunLight.position.set(this.birdPos.x + 100, this.birdPos.y + 200, this.birdPos.z + 80);
            this.sunLight.target.position.copy(this.birdPos);
            this.sunLight.target.updateMatrixWorld();
        }

        // Water
        if (this.birdPos.y < this.birdRadius) {
            this._die('Fell into the sea!'); return;
        }

        // Collision
        this._checkHoopCollision();
        if (this.phase === 'dead') return;

        // Wrong way
        this._checkWrongWay(birdVelX, birdVelZ);
        if (this.phase === 'dead') return;

        // Generate & cull
        while (this.pillars.length < 20) this._spawnPillar();
        this._cullOldPillars();

        this._updateScoreDOM();

        // Camera
        this._updateCamera(dt, birdVelX, birdVelZ);
    }

    // ── Collision ────────────────────────────────────────────────

    _checkHoopCollision() {
        const target = this.pillars.find(p => !p.passed);
        if (!target) return;

        const toHoop     = new THREE.Vector3().subVectors(this.birdPos, target.center);
        const signedDist = toHoop.dot(target.normal);
        const curSign    = Math.sign(signedDist);

        if (target.prevSign !== null && curSign !== 0 && curSign !== target.prevSign) {
            const onPlane        = this.birdPos.clone().sub(target.normal.clone().multiplyScalar(signedDist));
            const distFromCentre = onPlane.distanceTo(target.center);

            if (target.prevSign === 1) {
                if (distFromCentre <= this.ringRadius - this.birdRadius) {
                    // ✓ Through the hole
                    target.passed        = true;
                    target.ring.material = this.matPassed.clone();
                    this.score++;
                    this.highScore = Math.max(this.highScore, this.score);
                    this._updateScoreDOM();
                    this.audio.playBeep(880, 0.06, 0.18 * this.sfxVolume);
                    setTimeout(() => { if (this.audio) this.audio.playBeep(1200, 0.04, 0.14 * this.sfxVolume); }, 90);
                } else if (distFromCentre <= this.ringRadius + this.birdRadius) {
                    this._markDanger(target);
                    this._die('Crashed into the ring rim!');
                } else {
                    this._markDanger(target);
                    this._die('Missed the hoop!');
                }
            } else {
                this._markDanger(target);
                this._die('Flying the wrong way!');
            }
        }

        if (curSign !== 0) target.prevSign = curSign;
    }

    // Both ring AND pillar turn red
    _markDanger(target) {
        target.ring.material   = this.matDanger.clone();
        target.pillar.material = this.matDanger.clone();
    }

    // Wrong-way: the ring's symmetry axis = -normal (the direction you must fly through).
    // velocity dot ring_forward = velocity dot (-normal) = -velocity dot normal.
    // If this is NEGATIVE → velocity dot normal is POSITIVE → flying toward origin = wrong way.
    // No distance cap: check whenever the next unpassed ring exists.

    _checkWrongWay(bvx, bvz) {
        const target = this.pillars.find(p => !p.passed);
        if (!target) return;

        const velDir    = new THREE.Vector3(bvx, 0, bvz).normalize();
        const dotNormal = velDir.dot(target.normal);  // > 0 = wrong direction
        if (dotNormal > 0.40) {
            this._markDanger(target);
            this._die('Flying the wrong way!');
        }
    }

    // ── Camera ───────────────────────────────────────────────────
    //
    //  'first'  : cockpit
    //  'third'  : behind bird, phi exact, only Y spring-damped
    //  'rail'   : Y from Catmull-Rom pillar spline, X/Z behind yaw
    //  'fixed-y': X/Z behind yaw, Y constant world height, constant downward pitch

    _updateCamera(dt, birdVelX, birdVelZ) {
        if (this.cameraMode === 'first') {
            this.birdMesh.visible = false;
            this.camera.position.copy(this.birdPos);
            const hlen = Math.sqrt(birdVelX * birdVelX + birdVelZ * birdVelZ) || 1;
            this.camera.lookAt(this.birdPos.clone().add(
                new THREE.Vector3(birdVelX / hlen * 20, this.birdVelY * 0.4, birdVelZ / hlen * 20)
            ));

        } else if (this.cameraMode === 'rail') {
            this.birdMesh.visible = true;
            this._updateRailCamera(dt, birdVelX, birdVelZ);

        } else if (this.cameraMode === 'fixed-y') {
            // Constant world-Y, constant pitch, XZ follows birdYaw exactly (no spring)
            this.birdMesh.visible = true;
            const camDist = 14;
            const camX    = this.birdPos.x - Math.sin(this.birdYaw) * camDist;
            const camZ    = this.birdPos.z + Math.cos(this.birdYaw) * camDist;
            this.camera.position.set(camX, this.fixedCamHeight, camZ);
            // Look direction: forward in birdYaw with constant pitch
            const cp = Math.cos(this.fixedCamPitch);
            const sp = Math.sin(this.fixedCamPitch);
            const lookTarget = this.camera.position.clone().add(
                new THREE.Vector3(
                    cp * Math.sin(this.birdYaw),
                    sp,
                    cp * -Math.cos(this.birdYaw)
                ).multiplyScalar(40)
            );
            this.camera.lookAt(lookTarget);

        } else {
            // 'third' — exact phi, spring Y only
            this.birdMesh.visible = true;

            const camDist = 14;
            const camX    = this.birdPos.x - Math.sin(this.birdYaw) * camDist;
            const camZ    = this.birdPos.z + Math.cos(this.birdYaw) * camDist;

            const desiredY  = this.birdPos.y + 5;
            const errY      = desiredY - this._camY;
            this._camYVel  += errY * this.camStiffness * dt;
            this._camYVel  *= Math.pow(1 - this.camDamping, dt);
            this._camY     += this._camYVel * dt;

            this.camera.position.set(camX, this._camY, camZ);

            const hlen   = Math.sqrt(birdVelX * birdVelX + birdVelZ * birdVelZ) || 1;
            const lookAt = this.birdPos.clone().add(
                new THREE.Vector3(birdVelX / hlen * 6, this.birdVelY * 0.15, birdVelZ / hlen * 6)
            );
            this.camera.lookAt(lookAt);
        }
    }

    // Rail camera:
    //   X, Z — identical to 'third' mode (behind bird's yaw, exact phi tracking)
    //   Y    — Catmull-Rom spline through pillar heights, evaluated at the abscissa
    //            t = n + d(bird→prev) / (d(bird→prev) + d(bird→next))
    //         where n = number of pillars passed.
    //         Before first pillar: linear interpolation from birdPos.y to first pillar height.
    //   Height offset = railHeightRings × ringRadius (in units of ring radii)

    _updateRailCamera(dt, birdVelX, birdVelZ) {
        // X, Z: exactly the same as 'third' camera
        const camDist = 14;
        const camX    = this.birdPos.x - Math.sin(this.birdYaw) * camDist;
        const camZ    = this.birdPos.z + Math.cos(this.birdYaw) * camDist;

        // Y: Catmull-Rom through pillar heights
        const targetY = this._getRailCameraY();

        // Use spring-damper for Y smoothing (same params as 3rd-person)
        const errY      = targetY - this._railCamY;
        this._camYVel  += errY * this.camStiffness * dt;
        this._camYVel  *= Math.pow(1 - this.camDamping, dt);
        this._railCamY += this._camYVel * dt;

        this.camera.position.set(camX, this._railCamY, camZ);

        // Look direction: 3 sub-modes
        if (this.railLook === 'tangent') {
            // Smooth the raw slope with a low-pass filter (~0.12 s time constant)
            const rawSlope = this._getRailCameraYDeriv();
            const alpha    = 1 - Math.exp(-dt / 0.12);  // exponential decay
            this._railSlopeSmoothed += (rawSlope - this._railSlopeSmoothed) * alpha;
            const slope = this._railSlopeSmoothed;
            // Tangent vector (un-normalised): (sin yaw, slope, -cos yaw)
            // normalise so length = 1
            const len     = Math.sqrt(1 + slope * slope);
            const lookTarget = this.camera.position.clone().add(
                new THREE.Vector3(Math.sin(this.birdYaw) / len, slope / len, -Math.cos(this.birdYaw) / len)
                    .multiplyScalar(30)
            );
            this.camera.lookAt(lookTarget);

        } else if (this.railLook === 'mouse') {
            // Pitch = _camPitch (controlled by mouse Y).
            // Forward direction = birdYaw (XZ), tilted by _camPitch.
            const cp = Math.cos(this._camPitch);
            const sp = Math.sin(this._camPitch);
            const lookTarget = this.camera.position.clone().add(
                new THREE.Vector3(
                    cp * Math.sin(this.birdYaw),
                    sp,
                    cp * -Math.cos(this.birdYaw)
                ).multiplyScalar(30)
            );
            this.camera.lookAt(lookTarget);

        } else {
            // 'bird' (default):
            //   Horizontal (XZ): exact — look direction follows birdYaw with no lag.
            //   Vertical  (Y):   spring-damped — reduces snap when bird bounces.
            const hlen   = Math.sqrt(birdVelX * birdVelX + birdVelZ * birdVelZ) || 1;
            const lookX  = this.birdPos.x + birdVelX / hlen * 6;   // exact horizontal
            const lookZ  = this.birdPos.z + birdVelZ / hlen * 6;
            const tgtY   = this.birdPos.y + this.birdVelY * 0.15;  // desired look-Y
            const errY   = tgtY - this._railLookY;
            this._railLookYVel += errY * this.camStiffness * dt;
            this._railLookYVel *= Math.pow(1 - this.camDamping, dt);
            this._railLookY    += this._railLookYVel * dt;
            this.camera.lookAt(new THREE.Vector3(lookX, this._railLookY, lookZ));
        }
    }

    // Compute the desired rail camera Y:
    //   Catmull-Rom through pillar centre heights, indexed by the abscissa
    //   t = n + d(bird, prev) / (d(bird, prev) + d(bird, next))

    _getRailCameraY() {
        const heightOffset = this.railHeightRings * this.ringRadius;

        if (this.pillars.length === 0) return this.birdPos.y + heightOffset;

        const nextIdx = this.pillars.findIndex(p => !p.passed);

        // All pillars passed
        if (nextIdx < 0) return this.pillars[this.pillars.length - 1].center.y + heightOffset;

        if (nextIdx === 0) {
            // Before first pillar: linear from birdPos.y to first pillar height.
            // Use fraction: 1 - d(bird, first) / initialApproachDist
            const distToFirst = this.birdPos.distanceTo(this.pillars[0].center);
            // Initial distance = 1.5 * ringDist (based on how lastPillarPos is seeded)
            const initDist    = this.ringDist * 1.5;
            const fraction    = Math.max(0, Math.min(1, 1 - distToFirst / initDist));
            const h = this.birdPos.y + fraction * (this.pillars[0].center.y - this.birdPos.y);
            return h + heightOffset;
        }

        // General case: bird is between pillar[nextIdx-1] (prev, last passed) and pillar[nextIdx] (next)
        const prevPillar = this.pillars[nextIdx - 1];
        const nextPillar = this.pillars[nextIdx];

        const dPrev = this.birdPos.distanceTo(prevPillar.center);
        const dNext = this.birdPos.distanceTo(nextPillar.center);
        // t_local ∈ [0,1]: 0 = at prev pillar, 1 = at next pillar
        const t_local = dPrev / (dPrev + dNext);

        // Catmull-Rom control points: heights at indices n-1, n, n+1, n+2
        const n = nextIdx - 1;
        const H = this.pillars.map(p => p.center.y);
        const h0 = H[Math.max(0, n - 1)];
        const h1 = H[n];
        const h2 = H[Math.min(H.length - 1, n + 1)];
        const h3 = H[Math.min(H.length - 1, n + 2)];

        // Standard Catmull-Rom formula
        const t = t_local, t2 = t*t, t3 = t2*t;
        const h = 0.5 * (
            2*h1 +
            (-h0 + h2) * t +
            (2*h0 - 5*h1 + 4*h2 - h3) * t2 +
            (-h0 + 3*h1 - 3*h2 + h3) * t3
        );

        return h + heightOffset;
    }

    // Analytic derivative of the Catmull-Rom spline used by _getRailCameraY(),
    // returns dH/ds = height change per metre of horizontal travel.

    _getRailCameraYDeriv() {
        const nextIdx = this.pillars.findIndex(p => !p.passed);
        if (nextIdx <= 0) return 0;

        const prevPillar = this.pillars[nextIdx - 1];
        const nextPillar = this.pillars[nextIdx];
        const dPrev = this.birdPos.distanceTo(prevPillar.center);
        const dNext = this.birdPos.distanceTo(nextPillar.center);
        const t  = dPrev / (dPrev + dNext);
        const t2 = t * t;

        const n  = nextIdx - 1;
        const H  = this.pillars.map(p => p.center.y);
        const h0 = H[Math.max(0, n - 1)];
        const h1 = H[n];
        const h2 = H[Math.min(H.length - 1, n + 1)];
        const h3 = H[Math.min(H.length - 1, n + 2)];

        // dH/dt (per unit of parameter t, which spans one ringDist in world-space)
        const dHdt = 0.5 * (
            (-h0 + h2) +
            2 * (2*h0 - 5*h1 + 4*h2 - h3) * t +
            3 * (-h0 + 3*h1 - 3*h2 + h3) * t2
        );

        // Convert to dH/ds: parameter t spans ringDist metres horizontally
        return dHdt / this.ringDist;
    }

    _die(reason) {
        if (this.phase === 'dead') return;
        this.phase   = 'dead';
        this._dieMsg = reason;
        this.highScore = Math.max(this.highScore, this.score);
        this._updateScoreDOM();
        const vol = this.sfxVolume ?? 0.5;
        this.audio.playTone(160, 0.4, 'sawtooth', 0.35 * vol);
        setTimeout(() => { if (this.audio) this.audio.playTone(90, 0.9, 'square', 0.30 * vol); }, 220);
        this.submitScore({ score: this.score, reason, camera: this.cameraMode });
        this._showGameOverDOM();
    }

    _showGameOverDOM() {
        if (this._govElem) return;
        const el = document.createElement('div');
        el.style.cssText = `
            position:fixed;inset:0;z-index:800;
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            background:rgba(39,94,61,.32);font-family:Inter,sans-serif;color:#202724;
        `;
        el.innerHTML = `
            <div style="min-width:330px;padding:22px 26px;border:2px solid #59645d;border-radius:18px;background:rgba(235,240,236,.96);box-shadow:0 20px 55px rgba(35,65,44,.3);text-align:center;">
            <div style="font-size:40px;font-weight:800;color:#d9363e;margin-bottom:10px;">GAME OVER</div>
            <div style="font-size:28px;margin-bottom:8px;color:#202724;">
                Score: <b style="color:#b87b00">${this.score}</b>
            </div>
            <div style="font-size:18px;margin-bottom:12px;color:#334039;">
                Highscore: <b style="color:#b87b00">${this.highScore}</b>
            </div>
            <div style="font-size:13px;color:#68736c;margin-bottom:24px;">
                ${this._dieMsg}
            </div>
            <div>
                <button id="btn-r3d" style="
                    padding:11px 30px;font-size:14px;border-radius:9px;border:2px solid #187127;cursor:pointer;
                    background:linear-gradient(#69d84e,#24952d);color:#fff;font-family:Inter,sans-serif;font-weight:800;">
                    ▶ Play Again
                </button>
            </div>
            </div>
        `;
        document.body.appendChild(el);
        this._govElem = el;

        el.querySelector('#btn-r3d').addEventListener('click', (e) => {
            e.stopPropagation();
            this._hideGameOverDOM();
            // In-place reset
            this.score         = 0;
            this.birdYaw       = 0;
            this.birdVelY      = 0;
            this.birdPos.set(0, 15, 0);
            this.lastPillarPos = new THREE.Vector3(0, 15, -this.ringDist * 1.5);
            this.lastSegYaw    = 0;
            this._clearPillarsFromScene();
            for (let i = 0; i < 18; i++) this._spawnPillar();
            this._camY              = this.birdPos.y + 5;
            this._camYVel           = 0;
            this._railCamY          = this.birdPos.y + this.railHeightRings * this.ringRadius;
            this._railSlopeSmoothed = 0;
            this._railLookY         = this.birdPos.y;
            this._railLookYVel      = 0;
            this._camPitch          = 0;
            this._mouseDeltaX       = 0;
            this._mouseDeltaY       = 0;
            this.phase     = 'playing';
            this._updateScoreDOM();
        });

    }

    _hideGameOverDOM() {
        if (this._govElem) { this._govElem.remove(); this._govElem = null; }
    }

    // ── Render ───────────────────────────────────────────────────

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }

    // ── Destroy ──────────────────────────────────────────────────

    destroy() {
        this.canvas.style.cursor = 'auto';
        if (this._onMouseMove) {
            window.removeEventListener('mousemove', this._onMouseMove);
            this._onMouseMove = null;
        }
        this._hideGameOverDOM();
        this._removeScoreDOM();

        if (!this.renderer) return;
        this.scene.traverse(obj => {
            if (!obj.isMesh) return;
            obj.geometry?.dispose?.();
            (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m?.dispose?.());
        });
        this.ringGeo?.dispose();   this.pillarGeo?.dispose();
        this.matActive?.dispose(); this.matPassed?.dispose();
        this.matDanger?.dispose(); this.pillarMat?.dispose();
        this.renderer.dispose();
        this.renderer = null;
        this.scene    = null;
    }

    // ── Schemas ──────────────────────────────────────────────────

    static getSettingsSchema() {
        return [
            {
                key: 'cameraMode', label: 'Perspective', type: 'select', default: 'rail',
                options: [
                    { value: 'third',   label: '3rd Person (Behind, Spring Y)' },
                    { value: 'fixed-y', label: '3rd Person (Fixed Height + Angle)' },
                    { value: 'first',   label: '1st Person (Cockpit)' },
                    { value: 'rail',    label: 'Rail (Spline Path, Behind Yaw)' },
                ],
            },
            { key: 'sfxVolume',    label: 'SFX Volume',                  type: 'range', min: 0,   max: 1,   step: 0.05,  default: 1    },
            { key: 'mouseSens',    label: 'Mouse Sensitivity',           type: 'range', min: 0.001, max: 0.015, step: 0.001, default: 0.002 },
            { key: 'camStiffness', label: 'Camera Spring (Stiffness)',   type: 'range', min: 1,   max: 30,  step: 1,     default: 21   },
            { key: 'camDamping',   label: 'Camera Damping',              type: 'range', min: 0.3, max: 0.98, step: 0.02,  default: 0.86 },
            { key: 'railHeightRings', label: 'Rail Camera Height (× ring radius)', type: 'range', min: -1, max: 6, step: 0.5, default: 1 },
            {
                key: 'railLook', label: 'Rail Camera Look Mode', type: 'select', default: 'bird',
                options: [
                    { value: 'bird',    label: 'Track Bird (spring-damped)' },
                    { value: 'tangent', label: 'Rail Tangent (follow slope)' },
                    { value: 'mouse',   label: 'Mouse Pitch (mouse Y = tilt)' },
                ],
            },
            { key: 'fixedCamHeight', label: 'Fixed Cam: World Height',      type: 'range', min: 5,   max: 100, step: 1,   default: 35 },
            { key: 'fixedCamPitch',  label: 'Fixed Cam: Pitch Angle (°)',   type: 'range', min: -70, max: 0,   step: 1,   default: -29 },
            { key: 'gravity',      label: 'Gravity',                     type: 'range', min: 10,  max: 80,  step: 2,     default: 74   },
            { key: 'flapStrength', label: 'Flap Strength',               type: 'range', min: 5,   max: 35,  step: 1,     default: 28   },
            { key: 'speed',        label: 'Forward Speed',               type: 'range', min: 8,   max: 45,  step: 2,     default: 36   },
            { key: 'ringRadiusRatio', label: 'Ring Size (× bird radius)', type: 'range', min: 2,  max: 12,  step: 0.5,   default: 5.5  },
            { key: 'pillarDist',      label: 'Hoop Spacing',              type: 'range', min: 20, max: 120, step: 5,     default: 45   },
            { key: 'maxSegmentTurn',  label: 'Max Path Bend (°)',          type: 'range', min: 0,  max: 75,  step: 5,     default: 45   },
            { key: 'deltaPhiMax',     label: 'Max Hoop Tilt (°)',          type: 'range', min: 0,  max: 60,  step: 5,     default: 30   },
        ];
    }

    static getControlsSchema() {
        return [
            { action: 'flap',       label: 'Flap Wings',  defaultBindings: [{ type: 'mouse', code: 0 }, { type: 'key', code: 'Space' }] },
            { action: 'steerLeft',  label: 'Steer Left',  defaultBindings: [{ type: 'key', code: 'ArrowLeft'  }] },
            { action: 'steerRight', label: 'Steer Right', defaultBindings: [{ type: 'key', code: 'ArrowRight' }] },
        ];
    }
}
