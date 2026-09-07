import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import CupAndBall2DGame from './game-2d.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

export class CupAndBall3DGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});

        this.ropeLength = this.settings.ropeLength ?? 1.7;
        this.ropeStiffness = this.settings.ropeStiffness ?? 42;
        this.ballRadius = this.settings.ballRadius ?? 0.26;
        this.cupRadius = this.settings.cupRadius ?? 0.34;

        this.gravity = new THREE.Vector3(0, -8.8, 0);
        this.handleLength = 0.86;
        this.attachRatio = 0.77;
        this.handleDrive = 22;
        this.handleHomeSpring = 7.8;
        this.handleDrag = 4.4;
        this.ropeDamping = 9.5;
        this.maxHandleOffset = 1.35;
        this.maxTiltAngle = Math.PI * 0.24;
        this.catchHoldDuration = 0.3;
        this.groundY = 0;
        this.cameraAnchor = new THREE.Vector3(4.9, 3.3, 8.2);
        this.lookTarget = new THREE.Vector3();

        this.home = new THREE.Vector3(0, 1.18, 0);
        this.handlePos = this.home.clone();
        this.handleVel = new THREE.Vector3();
        this.handleQuat = new THREE.Quaternion();
        this.filteredTilt = new THREE.Vector2();
        this.filteredAccel = new THREE.Vector3();

        this.cupCenter = new THREE.Vector3();
        this.attachPoint = new THREE.Vector3();
        this.upAxis = new THREE.Vector3(0, 1, 0);
        this.rightAxis = new THREE.Vector3(1, 0, 0);
        this.forwardAxis = new THREE.Vector3(0, 0, 1);

        this.ballPos = new THREE.Vector3();
        this.ballVel = new THREE.Vector3();
        this.lastRelativeHeight = -1;
        this.attemptActive = false;
        this.catchHoldTimer = 0;
        this.phase = 'playing';

        this.streak = 0;
        this.bestStreak = 0;
        this.scoreSubmitted = false;
        this.localCalibration = this.settings.mobileCalibration || null;

        this.mobile.clearCallbacks();
        this.mobile.onCalibrationUpdate(() => this._renderHud());

        this._setupThree();
        this._ensureHud();
        this._resetRun();
    }

    preparePauseSettings(settings) {
        requireFiniteNumber(settings.gravity ?? 8.8, 'Gravity', { minimum: 0 });
        requirePositiveNumber(settings.ropeLength ?? 1.7, 'Rope length');
        requireFiniteNumber(settings.ropeStiffness ?? 42, 'Rope stiffness', { minimum: 0 });
        requirePositiveNumber(settings.ballRadius ?? 0.26, 'Ball radius');
        requirePositiveNumber(settings.cupRadius ?? 0.34, 'Cup radius');
        return settings;
    }

    _setupThree() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.width, this.canvas.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xaedfff);
        this.scene.fog = new THREE.Fog(0xaedfff, 14, 40);

        this.camera = new THREE.PerspectiveCamera(54, this.canvas.width / this.canvas.height, 0.1, 100);
        this.camera.position.copy(this.cameraAnchor);

        this.scene.add(new THREE.AmbientLight(0xf7f8ff, 0.72));
        const sun = new THREE.DirectionalLight(0xfff4d8, 1.12);
        sun.position.set(6, 12, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 1;
        sun.shadow.camera.far = 30;
        sun.shadow.camera.left = -8;
        sun.shadow.camera.right = 8;
        sun.shadow.camera.top = 8;
        sun.shadow.camera.bottom = -8;
        this.scene.add(sun);

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(18, 80),
            new THREE.MeshPhongMaterial({ color: 0x6fbf58, shininess: 8 })
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = this.groundY;
        floor.receiveShadow = true;
        this.scene.add(floor);

        const floorRing = new THREE.Mesh(
            new THREE.RingGeometry(7.4, 11.8, 96),
            new THREE.MeshBasicMaterial({ color: 0x4e9b43, side: THREE.DoubleSide, transparent: true, opacity: 0.22 })
        );
        floorRing.rotation.x = -Math.PI / 2;
        floorRing.position.y = this.groundY + 0.01;
        this.scene.add(floorRing);

        const woodMat = new THREE.MeshPhongMaterial({ color: 0xae7a4f, shininess: 38 });
        const woodDarkMat = new THREE.MeshPhongMaterial({ color: 0x7d5534, shininess: 28 });

        this.handleGroup = new THREE.Group();
        this.scene.add(this.handleGroup);

        this.handleMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.18, this.handleLength, 18),
            woodMat
        );
        this.handleMesh.position.y = this.handleLength * 0.5;
        this.handleMesh.castShadow = true;
        this.handleMesh.receiveShadow = true;
        this.handleGroup.add(this.handleMesh);

        this.cupOuter = new THREE.Mesh(
            new THREE.CylinderGeometry(this.cupRadius + 0.16, this.cupRadius + 0.22, 0.34, 28),
            woodMat
        );
        this.cupOuter.position.y = this.handleLength;
        this.cupOuter.castShadow = true;
        this.cupOuter.receiveShadow = true;
        this.handleGroup.add(this.cupOuter);

        this.cupShoulder = new THREE.Mesh(
            new THREE.SphereGeometry(this.cupRadius + 0.12, 24, 18, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.45),
            woodMat
        );
        this.cupShoulder.position.y = this.handleLength - 0.15;
        this.cupShoulder.castShadow = true;
        this.cupShoulder.receiveShadow = true;
        this.handleGroup.add(this.cupShoulder);

        this.cupInner = new THREE.Mesh(
            new THREE.SphereGeometry(this.cupRadius, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.56),
            new THREE.MeshPhongMaterial({ color: 0x6d492f, shininess: 12, side: THREE.BackSide })
        );
        this.cupInner.position.set(0, this.handleLength - this.cupRadius * 0.52, 0);
        this.handleGroup.add(this.cupInner);

        this.cupLip = new THREE.Mesh(
            new THREE.TorusGeometry(this.cupRadius + 0.02, 0.055, 12, 48),
            woodDarkMat
        );
        this.cupLip.rotation.x = Math.PI / 2;
        this.cupLip.position.y = this.handleLength + 0.14;
        this.cupLip.castShadow = true;
        this.handleGroup.add(this.cupLip);

        this.attachPeg = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 14, 10),
            woodDarkMat
        );
        this.attachPeg.position.y = this.handleLength * this.attachRatio;
        this.attachPeg.castShadow = true;
        this.handleGroup.add(this.attachPeg);

        this.ropeMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.006, 0.006, 1, 8),
            new THREE.MeshPhongMaterial({ color: 0xd7ccb0, shininess: 8 })
        );
        this.ropeMesh.castShadow = true;
        this.scene.add(this.ropeMesh);

        this.ballMesh = new THREE.Mesh(
            new THREE.SphereGeometry(this.ballRadius, 28, 20),
            new THREE.MeshPhongMaterial({ color: 0xcfa072, shininess: 46 })
        );
        this.ballMesh.castShadow = true;
        this.ballMesh.receiveShadow = true;
        this.scene.add(this.ballMesh);
    }

    applyPhoneCalibration(calibration) {
        this.localCalibration = calibration ? structuredClone(calibration) : null;
        this._renderHud();
    }

    _resetRun() {
        this.phase = 'playing';
        this.catchHoldTimer = 0;
        this.attemptActive = false;
        this.streak = 0;
        this.scoreSubmitted = false;
        this.handlePos.copy(this.home);
        this.handleVel.set(0, 0, 0);
        this.handleQuat.identity();
        this.filteredTilt.set(0, 0);
        this.filteredAccel.set(0, 0, 0);
        this._updateHandleFrame();
        this._placeBallHanging();
        this._renderHud();
    }

    _placeBallHanging() {
        this.ballPos.copy(this.attachPoint).addScaledVector(this.upAxis, -this.ropeLength);
        this.ballVel.copy(this.handleVel);
        this.lastRelativeHeight = this.ballPos.y - this.attachPoint.y;
        this.attemptActive = false;
        this.catchHoldTimer = 0;
    }

    _readInputs(dt) {
        const snapshot = this.mobile.getSnapshot();
        const phoneTilt = this.mobile.getMappedTilt(snapshot, this.localCalibration || undefined);
        const accel = snapshot?.motion?.acceleration || {};
        const phoneAccel = new THREE.Vector3(
            clamp((accel.x ?? 0) / 2.4, -3.6, 3.6),
            clamp((-(accel.y ?? 0)) / 2.8, -4.2, 4.8),
            clamp((accel.z ?? 0) / 2.5, -3.6, 3.6),
        );

        const keyboardTilt = new THREE.Vector2(
            (this.input.isActionDown('tiltRight') ? 1 : 0) - (this.input.isActionDown('tiltLeft') ? 1 : 0),
            (this.input.isActionDown('tiltUp') ? 1 : 0) - (this.input.isActionDown('tiltDown') ? 1 : 0),
        );
        const keyboardMove = new THREE.Vector3(
            (this.input.isActionDown('moveRight') ? 1 : 0) - (this.input.isActionDown('moveLeft') ? 1 : 0),
            (this.input.isActionDown('moveUp') ? 1 : 0) - (this.input.isActionDown('moveDown') ? 1 : 0),
            (this.input.isActionDown('moveForward') ? 1 : 0) - (this.input.isActionDown('moveBack') ? 1 : 0),
        );

        const gamepadMove = this.input.hasGamepad()
            ? new THREE.Vector3(
                this.input.getAxis(0, 0),
                -this.input.getAxis(0, 1),
                this.input.getAxis(0, 3) || 0,
            )
            : new THREE.Vector3();

        const targetTiltX = clamp(phoneTilt.x + keyboardTilt.x, -1, 1);
        const targetTiltY = clamp(phoneTilt.y + keyboardTilt.y, -1, 1);
        const targetAccel = phoneAccel.add(keyboardMove).add(gamepadMove);

        const blend = 1 - Math.exp(-dt * 10);
        this.filteredTilt.x = lerp(this.filteredTilt.x, targetTiltX, blend);
        this.filteredTilt.y = lerp(this.filteredTilt.y, targetTiltY, blend);
        this.filteredAccel.lerp(targetAccel, blend);
    }

    _updateHandleFrame() {
        const tiltRoll = this.filteredTilt.x * this.maxTiltAngle;
        const tiltPitch = this.filteredTilt.y * this.maxTiltAngle * 0.92;
        this.handleQuat.setFromEuler(new THREE.Euler(-tiltPitch, 0, -tiltRoll, 'XYZ'));

        this.upAxis.set(0, 1, 0).applyQuaternion(this.handleQuat).normalize();
        this.rightAxis.set(1, 0, 0).applyQuaternion(this.handleQuat).normalize();
        this.forwardAxis.set(0, 0, 1).applyQuaternion(this.handleQuat).normalize();

        this.cupCenter.copy(this.handlePos).addScaledVector(this.upAxis, this.handleLength);
        this.attachPoint.copy(this.handlePos).addScaledVector(this.upAxis, this.handleLength * this.attachRatio);
    }

    _updateHandle(dt) {
        const spring = this.home.clone().sub(this.handlePos).multiplyScalar(this.handleHomeSpring);
        const drag = this.handleVel.clone().multiplyScalar(-this.handleDrag);
        const drive = this.filteredAccel.clone().multiplyScalar(this.handleDrive);
        const accel = spring.add(drag).add(drive);

        this.handleVel.addScaledVector(accel, dt);
        this.handlePos.addScaledVector(this.handleVel, dt);

        if (this.handlePos.distanceTo(this.home) > this.maxHandleOffset) {
            const limited = this.handlePos.clone().sub(this.home).setLength(this.maxHandleOffset);
            this.handlePos.copy(this.home).add(limited);
            this.handleVel.multiplyScalar(0.78);
        }

        this._updateHandleFrame();
    }

    _updateBall(dt) {
        if (this.catchHoldTimer > 0) {
            this.catchHoldTimer -= dt;
            this.ballPos.copy(this.cupCenter);
            this.ballVel.copy(this.handleVel);
            if (this.catchHoldTimer <= 0) {
                this._placeBallHanging();
            }
            return;
        }

        const delta = this.ballPos.clone().sub(this.attachPoint);
        const distance = delta.length();
        const direction = distance > 0.0001 ? delta.clone().divideScalar(distance) : new THREE.Vector3(0, -1, 0);
        const relativeVel = this.ballVel.clone().sub(this.handleVel);
        const totalForce = this.gravity.clone();

        if (distance > this.ropeLength) {
            const stretch = distance - this.ropeLength;
            const damping = this.ropeDamping * Math.max(0, relativeVel.dot(direction));
            totalForce.addScaledVector(direction, -(this.ropeStiffness * stretch + damping));
        }

        this.ballVel.addScaledVector(totalForce, dt);
        this.ballPos.addScaledVector(this.ballVel, dt);

        const relativeHeight = this.ballPos.y - this.attachPoint.y;
        if (!this.attemptActive && this.lastRelativeHeight < 0 && relativeHeight >= 0) {
            this.attemptActive = true;
        }

        if (this.attemptActive) {
            if (this._checkCatch()) {
                this.streak += 1;
                this.bestStreak = Math.max(this.bestStreak, this.streak);
                this.attemptActive = false;
                this.catchHoldTimer = this.catchHoldDuration;
                this._renderHud();
            } else if (this.lastRelativeHeight >= 0 && relativeHeight < 0) {
                this._failAttempt();
            }
        }

        this.lastRelativeHeight = relativeHeight;
    }

    _checkCatch() {
        const rel = this.ballPos.clone().sub(this.cupCenter);
        const radialX = rel.dot(this.rightAxis);
        const radialZ = rel.dot(this.forwardAxis);
        const alongUp = rel.dot(this.upAxis);
        const radialDistance = Math.hypot(radialX, radialZ);
        const relativeSpeedAlongCup = this.ballVel.clone().sub(this.handleVel).dot(this.upAxis);

        return radialDistance <= Math.max(0.08, this.cupRadius - this.ballRadius * 0.52) &&
            alongUp <= this.ballRadius * 0.9 &&
            alongUp >= -this.ballRadius * 0.9 &&
            relativeSpeedAlongCup < 0.9;
    }

    _failAttempt() {
        if (this.phase === 'dead') return;
        this.phase = 'dead';

        if (!this.scoreSubmitted) {
            this.submitScore({
                streak: this.streak,
                ropeLength: Number(this.ropeLength.toFixed(2)),
                ropeStiffness: Number(this.ropeStiffness.toFixed(1)),
                ballRadius: Number(this.ballRadius.toFixed(2)),
                cupRadius: Number(this.cupRadius.toFixed(2)),
            });
            this.scoreSubmitted = true;
        }

        this._renderHud();
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 760;
            display: grid;
            gap: 16px;
            pointer-events: none;
            font-family: Inter, system-ui, sans-serif;
            color: #29362f;
        `;

        this.hud.innerHTML = `
            <div style="min-width:320px; max-width:380px; padding:14px 18px; border-radius:18px; border:2px solid #5d6b62; background:rgba(239,243,240,.94); box-shadow:0 12px 30px rgba(25,48,33,.22); text-align:right;">
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.12em; color:#2e8a3a;">Consecutive Catches</div>
                <div id="cab-streak-value" style="margin-top:4px; font-size:42px; font-weight:900;">0</div>
                <div id="cab-subtitle" style="margin-top:6px; font-size:13px; color:#536258;"></div>
                <div id="cab-status-line" style="margin-top:6px; font-size:12px; color:#66756b;"></div>
            </div>
            <div id="cab-dead-panel" style="display:none; position:fixed; inset:0; place-items:center; pointer-events:auto; background:rgba(59,92,67,.30);">
                <div style="width:min(390px, calc(100vw - 32px)); padding:22px; border-radius:20px; background:#eff3f0; border:2px solid #5d6b62; box-shadow:0 24px 60px rgba(25,48,33,.28); text-align:center;">
                    <div style="font-size:13px; letter-spacing:0.12em; text-transform:uppercase; color:#c14d39;">Game Over</div>
                    <div id="cab-dead-score" style="margin-top:10px; font-size:34px; font-weight:900;">0 catches</div>
                    <button id="cab-restart-button" type="button" style="margin-top:16px; width:100%; border:2px solid #277632; border-radius:12px; padding:11px 14px; background:#50c747; color:#153318; font-weight:800; cursor:pointer;">Restart Run</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.hud);

        this.streakValueEl = this.hud.querySelector('#cab-streak-value');
        this.subtitleEl = this.hud.querySelector('#cab-subtitle');
        this.statusLineEl = this.hud.querySelector('#cab-status-line');
        this.deadPanelEl = this.hud.querySelector('#cab-dead-panel');
        this.deadScoreEl = this.hud.querySelector('#cab-dead-score');
        this.restartButtonEl = this.hud.querySelector('#cab-restart-button');
        this._handleRestartClick = () => this._resetRun();
        this.restartButtonEl.addEventListener('click', this._handleRestartClick);

        this._renderHud();
    }

    _renderHud() {
        if (!this.hud) return;
        const effectiveCalibration = this.localCalibration || this.mobile.getGlobalCalibration();
        const calibration = this.mobile.getCalibrationSummary(
            effectiveCalibration,
            { inheritedFromGlobal: !this.localCalibration }
        );

        this.streakValueEl.textContent = String(this.streak);
        this.subtitleEl.textContent = `Rope ${this.ropeLength.toFixed(2)} | Stiffness ${this.ropeStiffness.toFixed(0)} | Ball ${this.ballRadius.toFixed(2)} | Cup ${this.cupRadius.toFixed(2)}`;
        this.statusLineEl.textContent = `${this.mobile.isConnected ? 'Phone connected' : 'Keyboard fallback'} | ${calibration.statusLabel}${this.localCalibration ? '' : ' (global default)'}`;
        this.deadPanelEl.style.display = this.phase === 'dead' ? 'grid' : 'none';
        this.deadScoreEl.textContent = `${this.streak} catches`;
    }

    _updateScene(dt) {
        this.handleGroup.position.copy(this.handlePos);
        this.handleGroup.quaternion.copy(this.handleQuat);

        this.ballMesh.position.copy(this.ballPos);

        const ropeDelta = this.ballPos.clone().sub(this.attachPoint);
        const ropeLengthNow = Math.max(0.001, ropeDelta.length());
        this.ropeMesh.position.copy(this.attachPoint).addScaledVector(ropeDelta, 0.5);
        this.ropeMesh.scale.set(1, ropeLengthNow, 1);
        this.ropeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), ropeDelta.clone().normalize());

        const desiredCam = new THREE.Vector3(
            this.cameraAnchor.x + this.handlePos.x * 0.38,
            this.cameraAnchor.y + (this.handlePos.y - this.home.y) * 0.16,
            this.cameraAnchor.z + this.handlePos.z * 0.28,
        );
        this.camera.position.lerp(desiredCam, 1 - Math.exp(-dt * 2.4));
        const desiredLook = this.cupCenter.clone().addScaledVector(this.ballPos.clone().sub(this.cupCenter), 0.28);
        this.lookTarget.lerp(desiredLook, 1 - Math.exp(-dt * 5));
        this.camera.lookAt(this.lookTarget);
    }

    update(dt) {
        const restartPressed = this.input.isActionJustDown('restart') || this.input.isMouseJustDown(0);
        if (this.phase === 'dead') {
            if (restartPressed) this._resetRun();
            return;
        }

        this._readInputs(dt);
        this._updateHandle(dt);
        this._updateBall(dt);
        this._updateScene(dt);
    }

    render() {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
    }

    onResize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    destroy() {
        this.mobile.clearCallbacks();
        if (this.restartButtonEl && this._handleRestartClick) {
            this.restartButtonEl.removeEventListener('click', this._handleRestartClick);
        }
        if (this.hud) {
            this.hud.remove();
            this.hud = null;
        }

        if (this.scene) {
            this.scene.traverse((obj) => {
                if (!obj.isMesh) return;
                obj.geometry?.dispose?.();
                (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m?.dispose?.());
            });
        }
        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }

    static getSettingsSchema() {
        return [
            { key: 'ropeLength', label: 'Rope Length', type: 'range', min: 1.0, max: 2.8, step: 0.05, default: 1.7 },
            { key: 'ropeStiffness', label: 'Rope Stiffness', type: 'range', min: 4, max: 220, step: 1, default: 42 },
            { key: 'ballRadius', label: 'Ball Radius', type: 'range', min: 0.14, max: 0.46, step: 0.01, default: 0.26 },
            { key: 'cupRadius', label: 'Cup Radius', type: 'range', min: 0.18, max: 0.56, step: 0.01, default: 0.34 },
        ];
    }

    static getControlsSchema() {
        return [
            {
                action: 'tiltLeft',
                label: 'Tilt Left',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowLeft' },
                    { type: 'keyboard', code: 'KeyA' },
                ],
            },
            {
                action: 'tiltRight',
                label: 'Tilt Right',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowRight' },
                    { type: 'keyboard', code: 'KeyD' },
                ],
            },
            {
                action: 'tiltUp',
                label: 'Tilt Forward',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowUp' },
                    { type: 'keyboard', code: 'KeyW' },
                ],
            },
            {
                action: 'tiltDown',
                label: 'Tilt Back',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowDown' },
                    { type: 'keyboard', code: 'KeyS' },
                ],
            },
            {
                action: 'moveLeft',
                label: 'Swing Left',
                defaultBindings: [{ type: 'keyboard', code: 'KeyJ' }],
            },
            {
                action: 'moveRight',
                label: 'Swing Right',
                defaultBindings: [{ type: 'keyboard', code: 'KeyL' }],
            },
            {
                action: 'moveUp',
                label: 'Swing Up',
                defaultBindings: [{ type: 'keyboard', code: 'KeyI' }],
            },
            {
                action: 'moveDown',
                label: 'Swing Down',
                defaultBindings: [{ type: 'keyboard', code: 'KeyK' }],
            },
            {
                action: 'moveForward',
                label: 'Swing Forward',
                defaultBindings: [{ type: 'keyboard', code: 'KeyU' }],
            },
            {
                action: 'moveBack',
                label: 'Swing Back',
                defaultBindings: [{ type: 'keyboard', code: 'KeyO' }],
            },
            {
                action: 'restart',
                label: 'Restart Run',
                defaultBindings: [
                    { type: 'keyboard', code: 'Enter' },
                    { type: 'mouse', code: 0 },
                    { type: 'gamepad', code: 1 },
                ],
            },
        ];
    }
}

const CUP_MODES = Object.freeze({
    '2d': {
        label: 'Mouse 2D',
        artKey: 'cup-ball-2d',
        description: 'Move the handle with the mouse; hold left or right to rotate it in either direction.',
        prefix: 'twoD',
        GameClass: CupAndBall2DGame,
        excludedRecordSettings: Object.freeze(['angularSpeedDegrees', 'viewHeightFactor']),
    },
    '3d': {
        label: 'Phone Tilt 3D',
        artKey: 'cup-ball-3d',
        description: 'The original spatial cup-and-ball challenge controlled by phone tilt and acceleration.',
        prefix: 'threeD',
        GameClass: CupAndBall3DGame,
        excludedRecordSettings: Object.freeze([]),
    },
});

function prefixedSettings(mode, info) {
    return info.GameClass.getSettingsSchema().map(setting => ({
        ...setting,
        key: `${info.prefix}_${setting.key}`,
        group: `${info.label}${setting.group ? ` · ${setting.group}` : ''}`,
        modes: [mode],
    }));
}

export default class CupAndBallGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.mode = null;
        this.child = null;
        this.phase = 'mode-select';
        if (this._modeChosenForSession && CUP_MODES[this.settings.mode]) {
            this._startMode(this.settings.mode);
        } else {
            this._showModeSelector();
        }
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        const selectedMode = CUP_MODES[this.settings.mode] ? this.settings.mode : '2d';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Cup and Ball',
            prompt: 'Choose control style',
            selectedMode,
            modes: Object.entries(CUP_MODES).map(([key, info]) => ({
                key,
                title: info.label,
                description: info.description,
                artKey: info.artKey,
            })),
        });
        document.body.appendChild(this.modeSelector);
        this._selectorClick = bindModeGallery(this.modeSelector, {
            onMode: mode => {
                this._modeChosenForSession = true;
                this._startMode(mode);
            },
            onBack: () => this.endGame(),
        });
    }

    _childSettings(mode) {
        const info = CUP_MODES[mode];
        return Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
            setting.key,
            this.settings[`${info.prefix}_${setting.key}`] ?? setting.default,
        ]));
    }

    _startMode(mode) {
        const info = CUP_MODES[mode];
        if (!info) return false;
        const childSettings = this._childSettings(mode);
        try {
            new info.GameClass().preparePauseSettings(childSettings);
        } catch (error) {
            let message = this.modeSelector?.querySelector('[data-size-error]');
            if (!message && this.modeSelector) {
                message = document.createElement('div');
                message.dataset.sizeError = 'true';
                this.modeSelector.appendChild(message);
            }
            if (message) {
                message.textContent = error.message;
                message.style.cssText = 'margin:10px 0;color:#b3261e;font-weight:800;font-size:12px;';
            }
            return false;
        }
        this._destroyChild();
        this.settings.mode = mode;
        this.app.currentSettings = { ...this.settings };
        this.app.settingsManager.save('cup-and-ball', this.settings).catch(() => {});
        this._selectorClick = null;
        this.modeSelector?.remove();
        this.modeSelector = null;
        this.mode = mode;
        this.phase = 'playing';

        let canvas = this.canvas;
        let context = null;
        if (mode === '2d') {
            this.modeCanvas = document.createElement('canvas');
            this.modeCanvas.style.cssText = 'position:fixed;inset:0;z-index:700;width:100%;height:100%;display:block;';
            this.modeCanvas.width = window.innerWidth;
            this.modeCanvas.height = window.innerHeight;
            document.body.appendChild(this.modeCanvas);
            canvas = this.modeCanvas;
            context = canvas.getContext('2d');
        }

        const recordSettings = this.getRecordSettings({ ...this.settings, mode });
        this.child = new info.GameClass();
        const childApp = {
            ...this.app,
            currentSettings: childSettings,
            records: {
                getBest: (_legacyId, _legacySettings, resultKey, direction = 'max') =>
                    this.app.records.getBest('cup-and-ball', recordSettings, resultKey, direction),
            },
        };
        this.child._setup(
            canvas,
            context,
            this.input,
            this.audio,
            childSettings,
            results => this.submitScore({ ...results, mode }),
            () => this.endGame(),
            this.network,
            childApp,
            this.mobile,
        );
        return true;
    }

    returnToModeSelector() {
        this._destroyChild();
        this._modeChosenForSession = false;
        this.mode = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    _destroyChild() {
        this.child?.destroy?.();
        this.child = null;
        this.modeCanvas?.remove();
        this.modeCanvas = null;
    }

    update(dt) { this.child?.update?.(dt); }
    render() { this.child?.render?.(); }
    onPause() { this.child?.onPause?.(); }
    onResume() { this.child?.onResume?.(); }
    onResize(width, height) {
        if (this.modeCanvas) {
            this.modeCanvas.width = width;
            this.modeCanvas.height = height;
        }
        this.child?.onResize?.(width, height);
    }
    wantsPointerLockNow() { return this.child?.wantsPointerLockNow?.() ?? false; }

    preparePauseSettings(settings) {
        const requestedMode = settings?.mode ?? this.mode ?? '3d';
        if (!CUP_MODES[requestedMode]) throw new Error(`Cup and Ball mode is invalid: ${requestedMode}.`);
        const mode = requestedMode;
        const info = CUP_MODES[mode];
        const childSettings = Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
            setting.key,
            settings?.[`${info.prefix}_${setting.key}`] ?? setting.default,
        ]));
        const validator = new info.GameClass();
        validator.preparePauseSettings(childSettings);
        return settings;
    }

    destroy() {
        this._selectorClick = null;
        this.modeSelector?.remove();
        this.modeSelector = null;
        this._destroyChild();
        this.mode = null;
    }

    getRecordSettings(settings = this.settings) {
        const mode = settings?.mode ?? this.mode ?? '3d';
        if (!CUP_MODES[mode]) throw new Error(`Cup and Ball mode is invalid: ${mode}.`);
        const info = CUP_MODES[mode];
        const excluded = new Set(info.excludedRecordSettings);
        return {
            mode,
            ...Object.fromEntries(info.GameClass.getSettingsSchema()
                .filter(setting => !excluded.has(setting.key))
                .map(setting => [
                    setting.key,
                    settings[`${info.prefix}_${setting.key}`] ?? setting.default,
                ])),
        };
    }

    static getSettingsSchema() {
        return [
            { key: 'mode', label: 'Mode', type: 'hidden', default: '2d' },
            ...Object.entries(CUP_MODES).flatMap(([mode, info]) => prefixedSettings(mode, info)),
            { key: 'cupProfileVersion', label: 'Settings profile version', type: 'hidden', default: 2 },
        ];
    }

    static migrateSettings(settings) {
        if (Number(settings.cupProfileVersion ?? 0) >= 2) return settings;
        const migrated = { ...settings, cupProfileVersion: 2 };
        for (const setting of CupAndBall3DGame.getSettingsSchema()) {
            if (settings[setting.key] !== undefined) migrated[`threeD_${setting.key}`] = settings[setting.key];
            delete migrated[setting.key];
        }
        return migrated;
    }

    static getControlsSchema() {
        const controls = Object.values(CUP_MODES).flatMap(info => info.GameClass.getControlsSchema());
        return [...new Map(controls.map(control => [control.action, control])).values()];
    }
}
