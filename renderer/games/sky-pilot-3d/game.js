import Flappy3DGame from '../flappy-3d/game.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

/**
 * Sky Pilot 3D reuses Hoop Glider's world, hoop generation, collision detection,
 * scoring, audio, and game-over flow. Its flight model is continuous 3D steering:
 * there is no gravity and no flap impulse.
 */
export default class SkyPilot3DGame extends Flappy3DGame {

    init() {
        // Flight parameters are kept together here and exposed together below.
        this.pitchSens = this.settings.pitchSens ?? 0.0025;
        this.maxPitch = THREE.MathUtils.degToRad(this.settings.maxPitch ?? 55);
        this.turnResponse = this.settings.turnResponse ?? 8;
        this.keyboardTurnSpeed = THREE.MathUtils.degToRad(this.settings.keyboardTurnSpeed ?? 75);
        this.cameraDistance = this.settings.cameraDistance ?? 16;
        this.cameraHeight = this.settings.cameraHeight ?? 5;

        super.init();

        this.flightYaw = 0;
        this.flightPitch = 0;
        this.targetYaw = 0;
        this.targetPitch = 0;
        this._bank = 0;
        this.birdYaw = 0;
        this.birdVelY = 0;
    }

    /** Validate the flight-specific settings before Flappy3D creates any state. */
    preparePauseSettings(settings) {
        // Keep the shared world/hoop checks from the parent class.  This also
        // means legacy settings that are present but not displayed by this
        // mode are checked rather than silently repaired.
        super.preparePauseSettings(settings);
        requireFiniteNumber(settings.pitchSens ?? 0.0025, 'Vertical mouse sensitivity');
        requireFiniteNumber(settings.maxPitch ?? 55, 'Maximum climb / dive angle', { minimum: 0, maximum: 180 });
        requireFiniteNumber(settings.turnResponse ?? 8, 'Steering smoothness', { minimum: 0 });
        requireFiniteNumber(settings.keyboardTurnSpeed ?? 75, 'Keyboard steering speed');
        requirePositiveNumber(settings.cameraDistance ?? 16, 'Camera distance');
        requireFiniteNumber(settings.cameraHeight ?? 5, 'Camera height');
        return settings;
    }

    _setupThree() {
        super._setupThree();
        this._replaceBirdWithPlane();
    }

    _replaceBirdWithPlane() {
        const oldBird = this.birdMesh;
        this.scene.remove(oldBird);
        oldBird.traverse(obj => {
            if (!obj.isMesh) return;
            obj.geometry?.dispose?.();
            (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(mat => mat?.dispose?.());
        });

        const plane = new THREE.Group();
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xe8edf4, emissive: 0x10141a, shininess: 95 });
        const accentMat = new THREE.MeshPhongMaterial({ color: 0xe63946, emissive: 0x240407, shininess: 60 });
        const darkMat = new THREE.MeshPhongMaterial({ color: 0x17243a, emissive: 0x020407, shininess: 110 });
        const propMat = new THREE.MeshPhongMaterial({ color: 0x252a34, shininess: 50 });

        const fuselageGeo = new THREE.CapsuleGeometry(0.48, 2.5, 8, 12);
        fuselageGeo.rotateX(-Math.PI / 2);
        const fuselage = new THREE.Mesh(fuselageGeo, bodyMat);
        fuselage.castShadow = true;
        plane.add(fuselage);

        const noseGeo = new THREE.ConeGeometry(0.48, 0.85, 14);
        noseGeo.rotateX(-Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, accentMat);
        nose.position.z = -1.72;
        nose.castShadow = true;
        plane.add(nose);

        const cockpit = new THREE.Mesh(
            new THREE.SphereGeometry(0.43, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2),
            darkMat,
        );
        cockpit.scale.set(0.75, 0.48, 1.25);
        cockpit.position.set(0, 0.38, -0.55);
        cockpit.castShadow = true;
        plane.add(cockpit);

        const wings = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.13, 1.15), accentMat);
        wings.position.z = 0.12;
        wings.castShadow = true;
        plane.add(wings);

        const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.10, 0.65), accentMat);
        tailWing.position.set(0, 0.12, 1.52);
        tailWing.castShadow = true;
        plane.add(tailWing);

        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.68), accentMat);
        fin.position.set(0, 0.47, 1.48);
        fin.rotation.x = -0.22;
        fin.castShadow = true;
        plane.add(fin);

        const propeller = new THREE.Group();
        propeller.position.z = -2.16;
        const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.28, 10);
        hubGeo.rotateX(Math.PI / 2);
        propeller.add(new THREE.Mesh(hubGeo, accentMat));
        propeller.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.15, 0.07), propMat));
        plane.add(propeller);

        plane.scale.setScalar(0.78);
        plane.traverse(obj => { if (obj.isMesh) obj.castShadow = true; });
        plane.userData.propeller = propeller;
        this.scene.add(plane);

        this.birdMesh = plane;
        this.wingL = null;
        this.wingR = null;
    }

    _loadHighScore(requestId) {
        if (!this.app?.records) return;
        this.app.records.getBest('sky-pilot-3d', { ...this.settings }, 'score')
            .then(record => {
                if (requestId !== this._highScoreRequest) return;
                const value = Number(record?.results?.score);
                if (Number.isFinite(value)) {
                    this.highScore = Math.max(this.highScore, value);
                    this._updateScoreDOM();
                }
            })
            .catch(error => console.warn('Could not load Sky Pilot 3D highscore:', error));
    }

    update(dt) {
        if (this.phase === 'dead') return;

        const rawX = this._mouseDeltaX;
        const rawY = this._mouseDeltaY;
        this._mouseDeltaX = 0;
        this._mouseDeltaY = 0;

        this.targetYaw += rawX * this.mouseSens;
        this.targetPitch = THREE.MathUtils.clamp(
            this.targetPitch - rawY * this.pitchSens,
            -this.maxPitch,
            this.maxPitch,
        );

        if (this.input.isActionDown('steerLeft')) this.targetYaw -= this.keyboardTurnSpeed * dt;
        if (this.input.isActionDown('steerRight')) this.targetYaw += this.keyboardTurnSpeed * dt;
        if (this.input.isActionDown('steerUp')) this.targetPitch += this.keyboardTurnSpeed * dt;
        if (this.input.isActionDown('steerDown')) this.targetPitch -= this.keyboardTurnSpeed * dt;
        this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -this.maxPitch, this.maxPitch);

        const smooth = 1 - Math.exp(-this.turnResponse * dt);
        this.flightYaw += (this.targetYaw - this.flightYaw) * smooth;
        this.flightPitch += (this.targetPitch - this.flightPitch) * smooth;
        this.birdYaw = this.flightYaw;

        const cp = Math.cos(this.flightPitch);
        const forward = new THREE.Vector3(
            Math.sin(this.flightYaw) * cp,
            Math.sin(this.flightPitch),
            -Math.cos(this.flightYaw) * cp,
        );
        const velocity = forward.clone().multiplyScalar(this.speed);
        this.birdVelY = velocity.y;
        this.birdPos.addScaledVector(velocity, dt);

        const localForward = new THREE.Vector3(0, 0, -1);
        this.birdMesh.quaternion.setFromUnitVectors(localForward, forward);
        const targetBank = THREE.MathUtils.clamp(-rawX * 0.012, -0.65, 0.65);
        this._bank += (targetBank - this._bank) * (1 - Math.exp(-7 * dt));
        this.birdMesh.rotateZ(this._bank);
        this.birdMesh.position.copy(this.birdPos);
        if (this.birdMesh.userData.propeller) {
            this.birdMesh.userData.propeller.rotation.z += dt * 38;
        }

        if (this.sunLight) {
            this.sunLight.position.set(this.birdPos.x + 100, this.birdPos.y + 200, this.birdPos.z + 80);
            this.sunLight.target.position.copy(this.birdPos);
            this.sunLight.target.updateMatrixWorld();
        }

        if (this.birdPos.y < this.birdRadius) {
            this._die('The aeroplane hit the sea!');
            return;
        }

        this._checkHoopCollision();
        if (this.phase === 'dead') return;
        this._checkWrongWay(velocity.x, velocity.z);
        if (this.phase === 'dead') return;

        while (this.pillars.length < 20) this._spawnPillar();
        this._cullOldPillars();
        this._updateScoreDOM();
        this._updatePlaneCamera(dt, forward);
    }

    _updatePlaneCamera(dt, forward) {
        const desired = this.birdPos.clone()
            .addScaledVector(forward, -this.cameraDistance)
            .add(new THREE.Vector3(0, this.cameraHeight, 0));
        const cameraSmooth = 1 - Math.exp(-this.camStiffness * dt);
        this.camera.position.lerp(desired, cameraSmooth);
        this.camera.lookAt(this.birdPos.clone().addScaledVector(forward, 8));
        this.birdMesh.visible = true;
    }

    _showGameOverDOM() {
        super._showGameOverDOM();
        this._govElem?.querySelector('#btn-r3d')?.addEventListener('click', () => {
            this.flightYaw = 0;
            this.flightPitch = 0;
            this.targetYaw = 0;
            this.targetPitch = 0;
            this._bank = 0;
        });
    }

    static getSettingsSchema() {
        return [
            { key: 'sfxVolume', label: 'SFX Volume', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
            { key: 'mouseSens', label: 'Horizontal Mouse Sensitivity', type: 'range', min: 0.001, max: 0.015, step: 0.001, default: 0.003 },
            { key: 'pitchSens', label: 'Vertical Mouse Sensitivity', type: 'range', min: 0.001, max: 0.015, step: 0.0005, default: 0.0025 },
            { key: 'maxPitch', label: 'Maximum Climb / Dive Angle (°)', type: 'range', min: 15, max: 80, step: 5, default: 80 },
            { key: 'turnResponse', label: 'Steering Smoothness', type: 'range', min: 2, max: 20, step: 1, default: 8 },
            { key: 'keyboardTurnSpeed', label: 'Keyboard Steering Speed (°/s)', type: 'range', min: 20, max: 180, step: 5, default: 75 },
            { key: 'speed', label: 'Forward Speed', type: 'range', min: 8, max: 45, step: 2, default: 44 },
            { key: 'ringRadiusRatio', label: 'Hoop Size (× plane radius)', type: 'range', min: 2, max: 12, step: 0.5, default: 4 },
            { key: 'pillarDist', label: 'Hoop Spacing', type: 'range', min: 20, max: 120, step: 5, default: 40 },
            { key: 'maxSegmentTurn', label: 'Maximum Path Bend (°)', type: 'range', min: 0, max: 75, step: 5, default: 30 },
            { key: 'deltaPhiMax', label: 'Maximum Hoop Turn (°)', type: 'range', min: 0, max: 60, step: 5, default: 20 },
            { key: 'cameraDistance', label: 'Camera Distance', type: 'range', min: 8, max: 30, step: 1, default: 16 },
            { key: 'cameraHeight', label: 'Camera Height', type: 'range', min: 0, max: 15, step: 1, default: 5 },
            { key: 'camStiffness', label: 'Camera Follow Speed', type: 'range', min: 1, max: 30, step: 1, default: 30 },
        ];
    }

    static getControlsSchema() {
        return [
            { action: 'steerLeft', label: 'Steer Left', defaultBindings: [{ type: 'keyboard', code: 'ArrowLeft' }] },
            { action: 'steerRight', label: 'Steer Right', defaultBindings: [{ type: 'keyboard', code: 'ArrowRight' }] },
            { action: 'steerUp', label: 'Climb', defaultBindings: [{ type: 'keyboard', code: 'ArrowUp' }] },
            { action: 'steerDown', label: 'Dive', defaultBindings: [{ type: 'keyboard', code: 'ArrowDown' }] },
        ];
    }
}
