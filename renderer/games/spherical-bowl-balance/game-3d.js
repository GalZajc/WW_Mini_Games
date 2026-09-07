import { BaseGame } from '../../core/BaseGame.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import { TrackballControls } from '../../../node_modules/three/examples/jsm/controls/TrackballControls.js';
import {
    BOWL_NUMERICS,
    add3,
    clamp,
    dot3,
    length3,
    makeSeed,
    normalize3,
    scale3,
    shouldReleaseAtRim,
    stepRollingSurfaceBody,
    stepSlidingSurfaceBody,
    surfaceRadialFraction,
    targetForSeed,
    vec3,
} from './physics.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export default class SphericalBowl3DModeGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.parameters = Object.freeze({ ...this.settings });
        this.variant = this.parameters.variant;
        this.bodyType = this.parameters.bodyType;
        this.isBalance = this.variant === 'balance';
        this.bowlTheta = this.isBalance ? Math.PI / 2 : this.parameters.bowlTheta;
        this.bodyClearance = this.bodyType === 'marble'
            ? this.parameters.marbleRadius
            : this.parameters.bowlRadius * BOWL_NUMERICS.pointDiscThicknessFraction / 2;
        this.accumulator = 0;
        this.bestValue = this.variant === 'target' ? Infinity : 0;
        this._setupThree();
        this._createHud();
        this._attachViewInput();
        this._loadBest();
        this._resetRun();
    }

    _setupThree() {
        const p = this.parameters;
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(this.canvas.width, this.canvas.height, false);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x74cff4);
        this.scene.fog = new THREE.Fog(0x74cff4, 28, 75);
        this.camera = new THREE.PerspectiveCamera(
            46,
            this.canvas.width / Math.max(1, this.canvas.height),
            0.04,
            160,
        );
        this.camera.position.set(p.bowlRadius * 3.7, p.bowlRadius * 3.35, p.bowlRadius * 4.7);
        this.camera.up.set(0, 1, 0);
        this.cameraTarget = new THREE.Vector3(0, p.bowlRadius * 0.72, 0);
        this.camera.lookAt(this.cameraTarget);
        this.scene.add(new THREE.HemisphereLight(0xf3fbff, 0x46773e, 1.7));
        const sun = new THREE.DirectionalLight(0xfff1d2, 2.15);
        sun.position.set(-7, 13, 9);
        sun.castShadow = true;
        this.scene.add(sun);

        const floorSize = Math.max(36, (p.movementCircleRadius || p.movementRange) * 7 + p.bowlRadius * 8);
        this.floor = new THREE.Mesh(
            new THREE.PlaneGeometry(floorSize, floorSize),
            new THREE.MeshStandardMaterial({ color: 0x58c94a, roughness: 0.94 }),
        );
        this.floor.rotation.x = -Math.PI / 2;
        this.floor.receiveShadow = true;
        this.scene.add(this.floor);

        this.bowlBaseHeight = Math.max(
            p.bowlRadius * 0.025,
            this.bodyType === 'marble' ? p.marbleRadius * 1.04 : p.bowlRadius * 0.015,
        );
        this.bowlGroup = new THREE.Group();
        this.scene.add(this.bowlGroup);
        const bowlGeometry = new THREE.SphereGeometry(
            p.bowlRadius,
            84,
            48,
            0,
            Math.PI * 2,
            Math.PI - this.bowlTheta,
            this.bowlTheta,
        );
        this.bowlMesh = new THREE.Mesh(
            bowlGeometry,
            new THREE.MeshPhysicalMaterial({
                color: 0x91ddf1,
                roughness: 0.23,
                metalness: 0.02,
                transparent: true,
                opacity: 0.59,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        );
        this.bowlMesh.position.y = p.bowlRadius;
        this.bowlMesh.receiveShadow = true;
        this.bowlGroup.add(this.bowlMesh);
        const wire = new THREE.Mesh(
            bowlGeometry.clone(),
            new THREE.MeshBasicMaterial({ color: 0x185b7b, wireframe: true, transparent: true, opacity: 0.10 }),
        );
        wire.position.y = p.bowlRadius;
        this.bowlGroup.add(wire);

        if (this.isBalance) this._createBand();
        const rimRadius = p.bowlRadius * Math.sin(this.bowlTheta);
        if (rimRadius > 1e-5) {
            const rim = new THREE.Mesh(
                new THREE.TorusGeometry(rimRadius, p.bowlRadius * 0.031, 12, 112),
                new THREE.MeshStandardMaterial({ color: 0x246f8d, roughness: 0.38 }),
            );
            rim.rotation.x = Math.PI / 2;
            rim.position.y = p.bowlRadius * (1 - Math.cos(this.bowlTheta));
            this.bowlGroup.add(rim);
        }
        this._createBodyMesh();
        if (!this.isBalance) this._createLaunchGuides();

        this.raycaster = new THREE.Raycaster();
        this.mouseNdc = new THREE.Vector2();
        this.mousePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this.controls = new TrackballControls(this.camera, this.canvas);
        this.controls.target.copy(this.cameraTarget);
        this.controls._target0.copy(this.cameraTarget);
        this.controls.staticMoving = true;
        this.controls.rotateSpeed = 4.0;
        this.controls.zoomSpeed = 1.3;
        this.controls.panSpeed = 1.1;
        this.controls.mouseButtons.LEFT = -1;
        this.controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        this.controls.minDistance = Math.max(0.6, p.bowlRadius * 1.15);
        this.controls.maxDistance = Math.max(60, floorSize * 1.8);
        this.controls.update();
    }

    _createBand() {
        const p = this.parameters;
        const outerTheta = Math.PI - Math.asin(p.bandOuterFraction);
        const innerTheta = Math.PI - Math.asin(p.bandInnerFraction);
        this.bandMesh = new THREE.Mesh(
            new THREE.SphereGeometry(
                p.bowlRadius * 0.997,
                84,
                14,
                0,
                Math.PI * 2,
                outerTheta,
                innerTheta - outerTheta,
            ),
            new THREE.MeshStandardMaterial({
                color: 0xe83f38,
                emissive: 0x4a0805,
                roughness: 0.42,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
            }),
        );
        this.bandMesh.position.y = p.bowlRadius;
        this.bowlGroup.add(this.bandMesh);
    }

    _createMarbleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const colorA = '#ffd036'; // golden yellow
        const colorB = '#d82626'; // ruby red

        const colW = canvas.width / 4;
        const rowH = canvas.height / 2;

        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 4; col++) {
                const isColorA = ((row + col) % 2 === 0);
                ctx.fillStyle = isColorA ? colorA : colorB;
                ctx.fillRect(col * colW, row * rowH, colW, rowH);

                const grad = ctx.createRadialGradient(
                    col * colW + colW / 2, row * rowH + rowH / 2, colW * 0.1,
                    col * colW + colW / 2, row * rowH + rowH / 2, colW * 0.7,
                );
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
                grad.addColorStop(0.75, 'rgba(0, 0, 0, 0)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
                ctx.fillStyle = grad;
                ctx.fillRect(col * colW, row * rowH, colW, rowH);
            }
        }

        ctx.strokeStyle = '#181e22';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, rowH);
        ctx.lineTo(canvas.width, rowH);
        ctx.stroke();

        for (let col = 0; col <= 4; col++) {
            ctx.beginPath();
            ctx.moveTo(col * colW, 0);
            ctx.lineTo(col * colW, canvas.height);
            ctx.stroke();
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    }

    _createBodyMesh() {
        const p = this.parameters;
        if (this.bodyType === 'marble') {
            const marbleTexture = this._createMarbleTexture();
            this.bodyMesh = new THREE.Mesh(
                new THREE.SphereGeometry(p.marbleRadius, 48, 32),
                new THREE.MeshStandardMaterial({
                    map: marbleTexture,
                    roughness: 0.24,
                    metalness: 0.06,
                }),
            );
        } else {
            const radius = p.bowlRadius * BOWL_NUMERICS.pointDiscRadiusFraction;
            const thickness = p.bowlRadius * BOWL_NUMERICS.pointDiscThicknessFraction;
            this.bodyMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, thickness, 28),
                new THREE.MeshStandardMaterial({ color: 0xffd43b, roughness: 0.34, metalness: 0.03 }),
            );
        }
        this.bodyMesh.castShadow = true;
        this.scene.add(this.bodyMesh);
    }

    _createLaunchGuides() {
        const p = this.parameters;
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(
                Math.max(0, p.movementCircleRadius - 0.035),
                p.movementCircleRadius + 0.035,
                112,
            ),
            new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.018;
        this.scene.add(ring);
        if (this.variant === 'target') {
            this.targetGroup = new THREE.Group();
            for (const [radius, color] of [[0.62, 0xffffff], [0.42, 0xe7443e], [0.19, 0xffd43b]]) {
                const marker = new THREE.Mesh(
                    new THREE.CircleGeometry(radius, 48),
                    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
                );
                marker.rotation.x = -Math.PI / 2;
                marker.position.y = 0.022 + radius * 0.001;
                this.targetGroup.add(marker);
            }
            this.scene.add(this.targetGroup);
        }
    }

    _attachViewInput() {
        this.orbitDragging = false;
        this._onPointerDown = event => {
            if (event.button === 2 || event.button === 1) {
                this.orbitDragging = true;
            }
        };
        this._onPointerUp = event => {
            if (event.button === 2 || event.button === 1) {
                this.orbitDragging = false;
            }
        };
        this._onPointerCancel = () => { this.orbitDragging = false; };
        this._onContextMenu = event => event.preventDefault();
        this.canvas.addEventListener('pointerdown', this._onPointerDown);
        this.canvas.addEventListener('contextmenu', this._onContextMenu);
        document.addEventListener('pointerup', this._onPointerUp);
        document.addEventListener('pointercancel', this._onPointerCancel);
        window.addEventListener('blur', this._onPointerCancel);
    }

    _createHud() {
        this.hud = document.createElement('div');
        this.hud.className = 'spherical-bowl-hud';
        this.hud.style.cssText = 'position:fixed;inset:0;z-index:6;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#263f37';
        this.hud.innerHTML = `<div data-stats style="position:absolute;left:15px;top:15px;min-width:310px;padding:10px 14px;border:2px solid #2e813c;border-radius:13px;background:rgba(247,254,247,.91);box-shadow:0 5px 14px rgba(23,73,45,.18)"></div>
            <div data-result style="display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:370px;padding:24px 28px;text-align:center;border:3px solid #2e813c;border-radius:20px;background:rgba(248,255,249,.95);box-shadow:0 16px 40px rgba(22,72,43,.25)"></div>`;
        (this.canvas.parentElement || document.body).appendChild(this.hud);
        this.statsElement = this.hud.querySelector('[data-stats]');
        this.resultElement = this.hud.querySelector('[data-result]');
    }

    async _loadBest() {
        try {
            const key = this.variant === 'target' ? 'missDistance' : (this.isBalance ? 'seconds' : 'distance');
            const direction = this.variant === 'target' ? 'min' : 'max';
            const record = await this.app?.records?.getBest?.('spherical-bowl-balance', this.settings, key, direction);
            const value = Number(record?.results?.[key]);
            if (Number.isFinite(value)) this.bestValue = value;
        } catch (error) {
            console.warn('Could not load bowl-mode record:', error);
        }
    }

    _resetRun(seed = makeSeed()) {
        const p = this.parameters;
        this.seed = seed >>> 0;
        const pathRadius = this.bodyType === 'marble' ? p.bowlRadius - p.marbleRadius : p.bowlRadius;
        this.surfaceState = {
            position: vec3(0, -pathRadius, 0),
            velocity: vec3(),
            omega: vec3(),
            contactMode: this.bodyType === 'marble' ? 'rolling' : 'sticking',
            slipSpeed: 0,
        };
        this.flightState = null;
        this.bowl = { position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, acceleration: { x: 0, z: 0 } };
        this.phase = 'ready';
        this.elapsed = 0;
        this.outsideTime = 0;
        this.result = null;
        this.accumulator = 0;
        this.scoreSubmitted = false;
        this.marbleQuaternion = new THREE.Quaternion();
        this.target = targetForSeed(this.seed, p.movementCircleRadius || 0, p.bowlRadius, 3);
        if (this.targetGroup) this.targetGroup.position.set(this.target.x, 0, this.target.z);
        const rect = this.canvas.getBoundingClientRect?.() || {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight,
        };
        if (this.camera && rect.width && rect.height) {
            this.camera.updateMatrixWorld?.(true);
            const projected = new THREE.Vector3(0, this.bowlBaseHeight, 0).project(this.camera);
            this.input.setMousePos?.(
                rect.left + (projected.x + 1) * 0.5 * rect.width,
                rect.top + (1 - projected.y) * 0.5 * rect.height,
            );
        } else {
            this.input.setMousePos?.(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
        this._syncVisuals();
        this._syncHud();
    }

    _mouseTarget() {
        const rect = this.canvas.getBoundingClientRect?.() || {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight,
        };
        const width = Math.max(1, rect.width || window.innerWidth);
        const height = Math.max(1, rect.height || window.innerHeight);
        const mouse = this.input.getMousePos?.() || { x: (rect.left || 0) + width / 2, y: (rect.top || 0) + height / 2 };
        this.mouseNdc.set(
            ((mouse.x - (rect.left || 0)) / width) * 2 - 1,
            -((mouse.y - (rect.top || 0)) / height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.mouseNdc, this.camera);
        const intersection = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.mousePlane, intersection)) {
            return { x: intersection.x, z: intersection.z };
        }
        return { x: this.bowl.position.x, z: this.bowl.position.z };
    }

    _sampleBowlMotion(dt, initialise = false) {
        if (this.orbitDragging) {
            this.bowl.acceleration = { x: 0, z: 0 };
            return;
        }
        const target = this._mouseTarget();
        if (initialise || dt <= 1e-6) {
            this.bowl.position = { ...target };
            this.bowl.velocity = { x: 0, z: 0 };
            this.bowl.acceleration = { x: 0, z: 0 };
            return;
        }
        const velocity = {
            x: (target.x - this.bowl.position.x) / dt,
            z: (target.z - this.bowl.position.z) / dt,
        };
        let acceleration = {
            x: (velocity.x - this.bowl.velocity.x) / dt,
            z: (velocity.z - this.bowl.velocity.z) / dt,
        };
        const magnitude = Math.hypot(acceleration.x, acceleration.z);
        if (magnitude > this.parameters.maximumBowlAcceleration) {
            acceleration = {
                x: acceleration.x * this.parameters.maximumBowlAcceleration / magnitude,
                z: acceleration.z * this.parameters.maximumBowlAcceleration / magnitude,
            };
        }
        this.bowl.position = { ...target };
        this.bowl.velocity = velocity;
        this.bowl.acceleration = acceleration;
    }

    _startRun() {
        this._sampleBowlMotion(0, true);
        this.phase = this.isBalance ? 'seeking' : 'surface';
        this.elapsed = 0;
        this.audio.playClick?.();
        this._syncHud();
    }

    _stepSurface(step) {
        if (this.bodyType === 'marble') {
            stepRollingSurfaceBody(this.surfaceState, this.bowl.acceleration, this.parameters, step);
            this._advanceMarbleOrientation(step);
        } else {
            stepSlidingSurfaceBody(this.surfaceState, this.bowl.acceleration, this.parameters, step);
        }
        if (this.isBalance) {
            const fraction = surfaceRadialFraction(this.surfaceState.position);
            const inside = fraction >= this.parameters.bandInnerFraction
                && fraction <= this.parameters.bandOuterFraction;
            if (this.phase === 'seeking') {
                if (inside) {
                    this.phase = 'timing';
                    this.elapsed = 0;
                    this.outsideTime = 0;
                    this.audio.playClick?.();
                }
                return;
            }
            this.elapsed += step;
            this.outsideTime = inside ? 0 : this.outsideTime + step;
            if (this.outsideTime >= BOWL_NUMERICS.outsideToleranceTime) this._finishBalance();
            return;
        }
        if (shouldReleaseAtRim(this.surfaceState, this.bowlTheta)) this._releaseBody();
    }

    _advanceMarbleOrientation(step) {
        const omega = this.surfaceState.omega;
        const speed = length3(omega);
        if (speed < 1e-9) return;
        const axis = new THREE.Vector3(omega.x / speed, omega.y / speed, omega.z / speed);
        const delta = new THREE.Quaternion().setFromAxisAngle(axis, speed * step);
        this.marbleQuaternion.premultiply(delta).normalize();
    }

    _releaseBody() {
        const p = this.parameters;
        const relative = this.surfaceState.position;
        this.flightState = {
            position: vec3(
                this.bowl.position.x + relative.x,
                this.bowlBaseHeight + p.bowlRadius + relative.y,
                this.bowl.position.z + relative.z,
            ),
            velocity: add3(this.surfaceState.velocity, vec3(this.bowl.velocity.x, 0, this.bowl.velocity.z)),
            omega: { ...this.surfaceState.omega },
        };
        this.phase = 'flight';
        this.audio.playClick?.();
    }

    _stepFlight(step) {
        this.flightState.velocity.y -= this.parameters.gravity * step;
        this.flightState.position = add3(
            this.flightState.position,
            scale3(this.flightState.velocity, step),
        );
        if (this.bodyType === 'marble') {
            const speed = length3(this.flightState.omega);
            if (speed > 1e-9) {
                const omega = this.flightState.omega;
                const axis = new THREE.Vector3(omega.x / speed, omega.y / speed, omega.z / speed);
                this.marbleQuaternion.premultiply(
                    new THREE.Quaternion().setFromAxisAngle(axis, speed * step),
                ).normalize();
            }
        }
        const landingHeight = this.bodyType === 'marble' ? this.parameters.marbleRadius : this.bodyClearance;
        if (this.flightState.position.y <= landingHeight && this.flightState.velocity.y <= 0) {
            this.flightState.position.y = landingHeight;
            this._finishLaunch();
        }
    }

    _finishBalance() {
        this.phase = 'gameover';
        this.result = { seconds: this.elapsed };
        this.bestValue = Math.max(this.bestValue, this.elapsed);
        this._submit({ seconds: Number(this.elapsed.toFixed(3)), seed: this.seed });
        this.audio.playPlasticImpact?.(0.34);
    }

    _finishLaunch() {
        const landing = this.flightState.position;
        const distance = Math.hypot(landing.x, landing.z);
        const missDistance = Math.hypot(landing.x - this.target.x, landing.z - this.target.z);
        this.phase = 'gameover';
        if (this.variant === 'target') {
            this.result = { missDistance };
            this.bestValue = Math.min(this.bestValue, missDistance);
            this._submit({ missDistance: Number(missDistance.toFixed(3)), landingDistance: Number(distance.toFixed(3)), seed: this.seed });
        } else {
            this.result = { distance };
            this.bestValue = Math.max(this.bestValue, distance);
            this._submit({ distance: Number(distance.toFixed(3)), seed: this.seed });
        }
        this.audio.playPlasticImpact?.(0.4);
    }

    _submit(results) {
        if (this.scoreSubmitted) return;
        this.submitScore(results);
        this.scoreSubmitted = true;
        this._syncHud();
    }

    update(dt) {
        const delta = Math.min(BOWL_NUMERICS.maximumFrameTime, Number(dt) || 0);
        this.controls?.update();
        const start = Boolean(this.input.isActionJustDown?.('start') || this.input.isMouseJustDown?.(0));
        if (this.phase === 'ready') {
            if (start) this._startRun();
            return;
        }
        if (this.phase === 'gameover') {
            if (start) {
                this._resetRun();
                this._startRun();
            }
            return;
        }
        this._sampleBowlMotion(delta);
        this.accumulator = Math.min(
            this.accumulator + delta,
            BOWL_NUMERICS.fixedTimeStep * BOWL_NUMERICS.maximumSubsteps,
        );
        while (this.accumulator >= BOWL_NUMERICS.fixedTimeStep) {
            if (this.phase === 'flight') this._stepFlight(BOWL_NUMERICS.fixedTimeStep);
            else this._stepSurface(BOWL_NUMERICS.fixedTimeStep);
            this.accumulator -= BOWL_NUMERICS.fixedTimeStep;
            if (this.phase === 'gameover') break;
        }
        this._syncVisuals();
        this._syncHud();
    }

    _syncVisuals() {
        if (!this.bodyMesh) return;
        const p = this.parameters;
        this.bowlGroup.position.set(this.bowl.position.x, this.bowlBaseHeight, this.bowl.position.z);
        if (this.phase === 'flight' || (this.phase === 'gameover' && this.flightState)) {
            this.bodyMesh.position.set(
                this.flightState.position.x,
                this.flightState.position.y,
                this.flightState.position.z,
            );
        } else {
            const state = this.surfaceState;
            const normal = normalize3(state.position);
            const inwardOffset = this.bodyType === 'marble' ? vec3() : scale3(normal, -this.bodyClearance);
            const local = add3(state.position, inwardOffset);
            this.bodyMesh.position.set(
                this.bowl.position.x + local.x,
                this.bowlBaseHeight + p.bowlRadius + local.y,
                this.bowl.position.z + local.z,
            );
            if (this.bodyType === 'point') {
                this.bodyMesh.quaternion.setFromUnitVectors(
                    Y_AXIS,
                    new THREE.Vector3(normal.x, normal.y, normal.z),
                );
            }
        }
        if (this.bodyType === 'marble') this.bodyMesh.quaternion.copy(this.marbleQuaternion);
    }

    _syncHud() {
        if (!this.hud) return;
        let value;
        let detail;
        if (this.isBalance) {
            value = this.phase === 'seeking' ? '—' : `${this.elapsed.toFixed(2)} s`;
            detail = this.phase === 'ready'
                ? 'Click to begin · right-drag rotates the view'
                : (this.phase === 'seeking' ? 'Reach the red band to start timing' : `${this.surfaceState.contactMode} · right-drag rotates view`);
        } else {
            value = this.phase === 'flight' ? 'IN FLIGHT' : (this.phase === 'ready' ? 'READY' : 'BUILD MOMENTUM');
            detail = this.variant === 'target'
                ? 'Throw the body as close to the target as possible'
                : 'Throw the body as far from the circle centre as possible';
        }
        this.statsElement.innerHTML = `<div style="font-size:10px;font-weight:900;color:#27813a;letter-spacing:.09em">${this.bodyType === 'marble' ? 'ROLLING MARBLE' : 'SLIDING PUCK'} · ${this.variant.toUpperCase()}</div>
            <div style="font-size:23px;font-weight:950;margin-top:3px">${value}</div>
            <div style="font-size:12px;color:#587068">${detail}</div>`;
        if (this.phase === 'gameover') {
            this.resultElement.style.display = '';
            const resultText = this.isBalance
                ? `${this.result.seconds.toFixed(2)} s`
                : (this.variant === 'target' ? `${this.result.missDistance.toFixed(2)} m from target` : `${this.result.distance.toFixed(2)} m`);
            this.resultElement.innerHTML = `<div style="font-size:25px;font-weight:950;color:#cc4038">RUN COMPLETE</div><div style="font-size:36px;font-weight:950;margin-top:8px">${resultText}</div><div style="font-size:13px;color:#536c63;margin-top:8px">Click or press Space to try again</div>`;
        } else {
            this.resultElement.style.display = 'none';
        }
    }

    render() {
        this.controls?.update();
        this.renderer.render(this.scene, this.camera);
    }

    onPause() {
        this.orbitDragging = false;
        if (this.hud) this.hud.style.visibility = 'hidden';
        if (this.controls) this.controls.enabled = false;
    }
    onResume() {
        if (this.hud) this.hud.style.visibility = '';
        if (this.controls) this.controls.enabled = true;
    }
    onResize(width, height) {
        this.renderer?.setSize(width, height, false);
        if (this.camera) {
            this.camera.aspect = width / Math.max(1, height);
            this.camera.updateProjectionMatrix();
        }
        this.controls?.handleResize?.();
    }

    destroy() {
        this.canvas?.removeEventListener('pointerdown', this._onPointerDown);
        this.canvas?.removeEventListener('contextmenu', this._onContextMenu);
        document.removeEventListener('pointerup', this._onPointerUp);
        document.removeEventListener('pointercancel', this._onPointerCancel);
        window.removeEventListener('blur', this._onPointerCancel);
        this.controls?.dispose?.();
        this.hud?.remove();
        this.scene?.traverse(object => {
            object.geometry?.dispose?.();
            if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
            else object.material?.dispose?.();
        });
        this.renderer?.dispose?.();
    }
}
