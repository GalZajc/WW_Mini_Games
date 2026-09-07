import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import * as THREE from '../../../node_modules/three/build/three.module.js';
import RodBalance2DGame from '../rod-balance-2d/game.js';

/*
 * All physical and numerical-model parameters live here. The first four are
 * exposed in the game's Settings screen; the rest define the shared model.
 */
const PHYSICS = Object.freeze({
    handLength: 1.35,             // l_r [m]
    frictionCoefficient: 1.94,   // k [-]
    rodLength: 4.5,               // l_p [m]
    gravity: 2.9,                // g [m/s^2]
    rodMass: 1.0,                 // [kg] (cancels from the equations)
    rodRadius: 0.065,             // [m]
    handThickness: 0.14,          // [m]
    handTopY: 0.72,               // [m]
    angularDamping: 0.045,        // [1/s]
    slidingFrictionFactor: 0.88,  // kinetic/static friction ratio
    handResponse: 11.0,           // [1/s], critically damped mouse following
    maximumHandAcceleration: 75,  // [m/s^2]
    fallAngleDegrees: 74,         // contact is considered lost beyond this tilt
    restickSpeed: 0.11,           // [m/s]
    fixedTimeStep: 1 / 120,       // [s]
});

const WORLD = Object.freeze({
    targetRadius: 5.4,
    targetPoints: Object.freeze([10, 8, 6, 4, 2, 1]),
    initialOffsetFraction: 0.18,
    initialTiltDegrees: 10,
    maximumSubsteps: 8,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export class RodBalance3DGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.preparePauseSettings(this.settings || {});

        this.parameters = Object.freeze({
            ...PHYSICS,
            handLength: Number(this.settings.handLength ?? PHYSICS.handLength),
            frictionCoefficient: Number(this.settings.frictionCoefficient ?? PHYSICS.frictionCoefficient),
            rodLength: Number(this.settings.rodLength ?? PHYSICS.rodLength),
            gravity: Number(this.settings.gravity ?? PHYSICS.gravity),
        });

        this.up = new THREE.Vector3(0, 1, 0);
        this.gravityVector = new THREE.Vector3(0, -this.parameters.gravity, 0);
        this.mousePlane = new THREE.Plane(this.up, -this.parameters.handTopY);
        this.raycaster = new THREE.Raycaster();
        this.mouseNdc = new THREE.Vector2();
        this.accumulator = 0;
        this.bestScore = 0;
        this.score = 0;
        this.currentRate = 0;
        this.bottomPoints = 0;
        this.topPoints = 0;
        this.phase = 'ready';
        this.contactState = 'sticking';
        this.failureReason = '';
        this.scoreSubmitted = false;

        this._setupThree();
        this._ensureHud();
        this._attachStartInput();
        this._loadBestScore();
        this._resetRun();
    }

    _setupThree() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(this.canvas.width, this.canvas.height, false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x76cff4);
        this.scene.fog = new THREE.Fog(0x76cff4, 18, 42);

        this.camera = new THREE.PerspectiveCamera(
            48,
            this.canvas.width / Math.max(1, this.canvas.height),
            0.05,
            80,
        );
        const cameraHeight = Math.max(5.7, this.parameters.rodLength * 1.62);
        this.camera.position.set(7.4, cameraHeight, 8.7);
        this.cameraTarget = new THREE.Vector3(0, Math.min(1.75, this.parameters.rodLength * 0.48), 0);
        const cameraOffset = this.camera.position.clone().sub(this.cameraTarget);
        this.cameraDistance = cameraOffset.length();
        this.cameraYaw = Math.atan2(cameraOffset.x, cameraOffset.z);
        this.cameraPitch = Math.asin(cameraOffset.y / this.cameraDistance);
        this.camera.lookAt(this.cameraTarget);

        this.scene.add(new THREE.HemisphereLight(0xe9f8ff, 0x4f8b3d, 1.42));
        const keyLight = new THREE.DirectionalLight(0xffedcf, 2.35);
        keyLight.position.set(-4, 10, 6);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(2048, 2048);
        keyLight.shadow.camera.left = -8;
        keyLight.shadow.camera.right = 8;
        keyLight.shadow.camera.top = 8;
        keyLight.shadow.camera.bottom = -8;
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 24;
        this.scene.add(keyLight);

        const floor = new THREE.Mesh(
            new THREE.CircleGeometry(13, 96),
            new THREE.MeshStandardMaterial({ color: 0x4fbe42, roughness: 0.94, metalness: 0.01 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        this._createTarget();

        const handMaterial = new THREE.MeshStandardMaterial({
            color: 0xe2a273,
            roughness: 0.72,
            metalness: 0.01,
        });
        this.handMesh = new THREE.Mesh(
            new THREE.BoxGeometry(
                this.parameters.handLength,
                this.parameters.handThickness,
                this.parameters.handLength,
                2,
                1,
                2,
            ),
            handMaterial,
        );
        this.handMesh.castShadow = true;
        this.handMesh.receiveShadow = true;
        this.scene.add(this.handMesh);

        this.handEdge = new THREE.LineSegments(
            new THREE.EdgesGeometry(this.handMesh.geometry),
            new THREE.LineBasicMaterial({ color: 0x6c3c29, transparent: true, opacity: 0.72 }),
        );
        this.handMesh.add(this.handEdge);

        this.rodMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(
                this.parameters.rodRadius,
                this.parameters.rodRadius * 1.08,
                this.parameters.rodLength,
                24,
            ),
            new THREE.MeshStandardMaterial({ color: 0xeee7d4, roughness: 0.42, metalness: 0.08 }),
        );
        this.rodMesh.castShadow = true;
        this.rodMesh.receiveShadow = true;
        this.scene.add(this.rodMesh);

        const markerGeometry = new THREE.SphereGeometry(this.parameters.rodRadius * 1.55, 18, 12);
        this.bottomMarker = new THREE.Mesh(markerGeometry, new THREE.MeshStandardMaterial({ color: 0xffc857 }));
        this.topMarker = new THREE.Mesh(markerGeometry.clone(), new THREE.MeshStandardMaterial({ color: 0x64d8ff }));
        this.bottomMarker.castShadow = true;
        this.topMarker.castShadow = true;
        this.scene.add(this.bottomMarker, this.topMarker);

        this.contactGlow = new THREE.Mesh(
            new THREE.RingGeometry(this.parameters.rodRadius * 1.7, this.parameters.rodRadius * 2.6, 28),
            new THREE.MeshBasicMaterial({
                color: 0x62ffb4,
                transparent: true,
                opacity: 0.75,
                side: THREE.DoubleSide,
                depthWrite: false,
            }),
        );
        this.contactGlow.rotation.x = -Math.PI / 2;
        this.scene.add(this.contactGlow);
    }

    _createTarget() {
        const colors = [0xf5d15f, 0x315fb5, 0xe8ecef, 0xb94252, 0xe8ecef, 0x294f91];
        const points = WORLD.targetPoints;
        const binWidth = WORLD.targetRadius / points.length;

        for (let index = points.length - 1; index >= 0; index--) {
            const outerRadius = binWidth * (index + 1);
            const disc = new THREE.Mesh(
                new THREE.CircleGeometry(outerRadius, 96),
                new THREE.MeshStandardMaterial({
                    color: colors[index % colors.length],
                    roughness: 0.88,
                    transparent: true,
                    opacity: 0.78,
                    side: THREE.DoubleSide,
                }),
            );
            disc.rotation.x = -Math.PI / 2;
            disc.position.y = 0.008 + (points.length - index) * 0.0005;
            disc.receiveShadow = true;
            this.scene.add(disc);
        }

        for (let index = 1; index <= points.length; index++) {
            const radius = binWidth * index;
            const boundary = new THREE.Mesh(
                new THREE.RingGeometry(radius - 0.012, radius + 0.012, 96),
                new THREE.MeshBasicMaterial({ color: 0x101724, side: THREE.DoubleSide }),
            );
            boundary.rotation.x = -Math.PI / 2;
            boundary.position.y = 0.019;
            this.scene.add(boundary);
        }

        for (let index = 0; index < points.length; index++) {
            const radius = binWidth * (index + 0.5);
            const angle = -1.28 + index * 0.52;
            const label = this._makePointLabel(points[index]);
            label.position.set(Math.cos(angle) * radius, 0.16, Math.sin(angle) * radius);
            this.scene.add(label);
        }
    }

    _makePointLabel(points) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        context.font = '900 42px Inter, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineWidth = 9;
        context.strokeStyle = 'rgba(8, 13, 24, 0.92)';
        context.strokeText(String(points), 64, 34);
        context.fillStyle = '#ffffff';
        context.fillText(String(points), 64, 34);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        }));
        sprite.scale.set(0.66, 0.33, 1);
        return sprite;
    }

    _attachStartInput() {
        this._startMouseHandler = event => {
            if (event.button !== 0 || this.phase !== 'ready') return;
            event.preventDefault();
            this._beginRun(true);
        };
        this.canvas.addEventListener('mousedown', this._startMouseHandler);

        this._orbitMouseDownHandler = event => {
            if (event.button !== 2 || this.phase !== 'playing') return;
            event.preventDefault();
            this.orbitDragging = true;
        };
        this._orbitMouseMoveHandler = event => {
            if (!this.orbitDragging || this.phase !== 'playing') return;
            event.preventDefault();
            this.cameraYaw += (event.movementX || 0) * 0.0052;
            this.cameraPitch = clamp(
                this.cameraPitch - (event.movementY || 0) * 0.0044,
                THREE.MathUtils.degToRad(18),
                THREE.MathUtils.degToRad(76),
            );
            this._updateOrbitCamera();
            this._placeVirtualPointerAtHand();
        };
        this._orbitMouseUpHandler = event => {
            if (event.button !== 2 || !this.orbitDragging) return;
            event.preventDefault();
            this.orbitDragging = false;
            this._placeVirtualPointerAtHand();
        };
        window.addEventListener('mousedown', this._orbitMouseDownHandler);
        window.addEventListener('mousemove', this._orbitMouseMoveHandler);
        window.addEventListener('mouseup', this._orbitMouseUpHandler);
    }

    _loadBestScore() {
        const request = (this._bestScoreRequest || 0) + 1;
        this._bestScoreRequest = request;
        this.app?.records?.getBest('rod-balance', { ...this.settings }, 'score')
            .then(record => {
                if (request !== this._bestScoreRequest) return;
                const value = Number(record?.results?.score);
                if (Number.isFinite(value)) this.bestScore = Math.max(this.bestScore, value);
                this._renderHud();
            })
            .catch(error => console.warn('Could not load Rod Balance record:', error));
    }

    _resetRun() {
        this.runSeed = makeSeed();
        const random = seededRandom(this.runSeed);
        const maximumOffset = this.parameters.handLength * WORLD.initialOffsetFraction;
        const offsetX = (random() * 2 - 1) * maximumOffset;
        const tilt = THREE.MathUtils.degToRad(1.5 + random() * (WORLD.initialTiltDegrees - 1.5));
        const azimuth = random() * Math.PI * 2;

        this.handPosition = new THREE.Vector3(0, this.parameters.handTopY, 0);
        this.handTarget = this.handPosition.clone();
        this.handVelocity = new THREE.Vector3();
        this.handAcceleration = new THREE.Vector3();
        this.contactOffset = new THREE.Vector3(offsetX, 0, 0);
        this.bottomPosition = this.handPosition.clone().add(this.contactOffset);
        this.bottomVelocity = new THREE.Vector3();
        this.rodDirection = new THREE.Vector3(
            Math.sin(tilt) * Math.cos(azimuth),
            Math.cos(tilt),
            Math.sin(tilt) * Math.sin(azimuth),
        ).normalize();
        this.angularVelocity = new THREE.Vector3();
        this.freeCenter = new THREE.Vector3();
        this.freeVelocity = new THREE.Vector3();

        this.score = 0;
        this._survivalSeconds = 0;
        this.currentRate = 0;
        this.bottomPoints = 0;
        this.topPoints = 0;
        this.phase = 'ready';
        this.contactState = 'sticking';
        this.failureReason = '';
        this.scoreSubmitted = false;
        this.lastFrictionRatio = 0;
        this.accumulator = 0;
        this.orbitDragging = false;
        this._syncMeshes();
        this._renderHud();
    }

    _beginRun(lockPointer = true) {
        if (this.phase !== 'ready') return;

        // Project the initial hand position to the canvas and put the virtual
        // pointer there before pointer lock starts. The first movement is then
        // relative to the hand instead of jumping from the menu-click position.
        this.handTarget.copy(this.handPosition);
        this._placeVirtualPointerAtHand();
        this.accumulator = 0;
        this.phase = 'playing';
        this._renderHud();

        if (lockPointer) this.app?._lockPointer?.();
    }

    _updateOrbitCamera() {
        const horizontalDistance = Math.cos(this.cameraPitch) * this.cameraDistance;
        this.camera.position.set(
            this.cameraTarget.x + Math.sin(this.cameraYaw) * horizontalDistance,
            this.cameraTarget.y + Math.sin(this.cameraPitch) * this.cameraDistance,
            this.cameraTarget.z + Math.cos(this.cameraYaw) * horizontalDistance,
        );
        this.camera.lookAt(this.cameraTarget);
        this.camera.updateMatrixWorld(true);
    }

    _placeVirtualPointerAtHand() {
        if (!this.camera || !this.handPosition) return;
        this.camera.updateMatrixWorld(true);
        const projected = this.handPosition.clone().project(this.camera);
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.input.setMousePos(
            rect.left + (projected.x + 1) * 0.5 * rect.width,
            rect.top + (1 - projected.y) * 0.5 * rect.height,
        );
        this.mouseNdc.set(projected.x, projected.y);
    }

    _updateMouseTarget() {
        if (this.phase !== 'playing' || this.orbitDragging) return;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const mouse = this.input.getMousePos();
        this.mouseNdc.set(
            ((mouse.x - rect.left) / rect.width) * 2 - 1,
            -((mouse.y - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(this.mouseNdc, this.camera);
        const intersection = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.mousePlane, intersection)) return;

        intersection.y = this.parameters.handTopY;
        this.handTarget.copy(intersection);
    }

    _stepHand(dt) {
        const response = this.parameters.handResponse;
        this.handAcceleration
            .copy(this.handTarget)
            .sub(this.handPosition)
            .multiplyScalar(response * response)
            .addScaledVector(this.handVelocity, -2 * response);
        this.handAcceleration.y = 0;
        if (this.handAcceleration.length() > this.parameters.maximumHandAcceleration) {
            this.handAcceleration.setLength(this.parameters.maximumHandAcceleration);
        }
        this.handVelocity.addScaledVector(this.handAcceleration, dt);
        this.handPosition.addScaledVector(this.handVelocity, dt);
        this.handPosition.y = this.parameters.handTopY;
    }

    _angularAcceleration(baseAcceleration) {
        const effectiveGravity = this.gravityVector.clone().sub(baseAcceleration);
        return new THREE.Vector3()
            .crossVectors(this.rodDirection, effectiveGravity)
            .multiplyScalar(3 / (2 * this.parameters.rodLength))
            .addScaledVector(this.angularVelocity, -this.parameters.angularDamping);
    }

    _contactLoad(baseAcceleration, angularAcceleration) {
        const angularTerm = new THREE.Vector3()
            .crossVectors(angularAcceleration, this.rodDirection)
            .add(new THREE.Vector3().crossVectors(
                this.angularVelocity,
                new THREE.Vector3().crossVectors(this.angularVelocity, this.rodDirection),
            ))
            .multiplyScalar(this.parameters.rodLength * 0.5);
        const centerAcceleration = baseAcceleration.clone().add(angularTerm);
        const tangent = Math.hypot(centerAcceleration.x, centerAcceleration.z) * this.parameters.rodMass;
        const normal = (centerAcceleration.y + this.parameters.gravity) * this.parameters.rodMass;
        return { tangent, normal };
    }

    _slidingAcceleration() {
        const relativeVelocity = this.bottomVelocity.clone().sub(this.handVelocity);
        relativeVelocity.y = 0;
        const frictionAcceleration = this.parameters.frictionCoefficient
            * this.parameters.gravity
            * this.parameters.slidingFrictionFactor;
        const horizontalTilt = new THREE.Vector3(this.rodDirection.x, 0, this.rodDirection.z);

        // For a homogeneous rod on a frictionless horizontal contact, the
        // small-angle end-point acceleration is -3 g theta. Kinetic friction
        // acts on the centre of mass; converting it back to end-point
        // acceleration contributes a factor of four. These are derived rod
        // coefficients, not additional physical parameters.
        const frictionlessBottomAcceleration = horizontalTilt.multiplyScalar(-3 * this.parameters.gravity);
        const impendingSlip = relativeVelocity.lengthSq() > 0.000025
            ? relativeVelocity
            : frictionlessBottomAcceleration.clone().sub(this.handAcceleration);
        const frictionOnCenter = new THREE.Vector3();
        if (impendingSlip.lengthSq() > 1e-10 && frictionAcceleration > 0) {
            frictionOnCenter.copy(impendingSlip).normalize().multiplyScalar(-frictionAcceleration);
        }

        return frictionlessBottomAcceleration.addScaledVector(frictionOnCenter, 4);
    }

    _stepPlaying(dt) {
        this._stepHand(dt);

        let baseAcceleration;
        let angularAcceleration;
        if (this.contactState === 'sticking') {
            baseAcceleration = this.handAcceleration.clone();
            angularAcceleration = this._angularAcceleration(baseAcceleration);
            const load = this._contactLoad(baseAcceleration, angularAcceleration);
            const frictionLimit = this.parameters.frictionCoefficient * Math.max(0, load.normal);
            this.lastFrictionRatio = frictionLimit > 0 ? load.tangent / frictionLimit : Infinity;

            if (load.normal <= 0.02) {
                this._fail('The rod lost contact with the hand.');
                return;
            }
            if (load.tangent > frictionLimit + 1e-6) {
                this.contactState = 'sliding';
                baseAcceleration = this._slidingAcceleration();
                angularAcceleration = this._angularAcceleration(baseAcceleration);
            }
        } else {
            baseAcceleration = this._slidingAcceleration();
            angularAcceleration = this._angularAcceleration(baseAcceleration);
            const candidateAngularAcceleration = this._angularAcceleration(this.handAcceleration);
            const candidateLoad = this._contactLoad(this.handAcceleration, candidateAngularAcceleration);
            const candidateLimit = this.parameters.frictionCoefficient * Math.max(0, candidateLoad.normal);
            this.lastFrictionRatio = candidateLimit > 0 ? candidateLoad.tangent / candidateLimit : Infinity;
        }

        if (this.contactState === 'sticking') {
            this.bottomPosition.copy(this.handPosition).add(this.contactOffset);
            this.bottomVelocity.copy(this.handVelocity);
        } else {
            this.bottomVelocity.addScaledVector(baseAcceleration, dt);
            this.bottomVelocity.y = 0;
            this.bottomPosition.addScaledVector(this.bottomVelocity, dt);
            this.bottomPosition.y = this.parameters.handTopY;

            const relativeOffset = this.bottomPosition.clone().sub(this.handPosition);
            relativeOffset.y = 0;
            const relativeVelocity = this.bottomVelocity.clone().sub(this.handVelocity);
            relativeVelocity.y = 0;
            const usableHalfLength = this.parameters.handLength * 0.5 - this.parameters.rodRadius;
            if (Math.abs(relativeOffset.x) > usableHalfLength || Math.abs(relativeOffset.z) > usableHalfLength) {
                this._fail('The rod slid off the hand.');
                return;
            }
            if (relativeVelocity.length() <= this.parameters.restickSpeed && this.lastFrictionRatio < 0.82) {
                this.contactState = 'sticking';
                this.contactOffset.copy(relativeOffset);
                this.bottomVelocity.copy(this.handVelocity);
            }
        }

        this.angularVelocity.addScaledVector(angularAcceleration, dt);
        this.angularVelocity.addScaledVector(
            this.rodDirection,
            -this.angularVelocity.dot(this.rodDirection),
        );
        const directionVelocity = new THREE.Vector3().crossVectors(this.angularVelocity, this.rodDirection);
        this.rodDirection.addScaledVector(directionVelocity, dt).normalize();

        const tilt = Math.acos(clamp(this.rodDirection.y, -1, 1));
        if (tilt >= THREE.MathUtils.degToRad(this.parameters.fallAngleDegrees)) {
            this._fail('The rod fell from the hand.');
            return;
        }

        this._integrateScore(dt);
        if (this._rodEntirelyOffScreen()) this._fail('The rod fell completely out of view.');
    }

    _integrateScore(dt) {
        const topPosition = this.bottomPosition.clone().addScaledVector(
            this.rodDirection,
            this.parameters.rodLength,
        );
        this.bottomPoints = this._pointsAt(this.bottomPosition);
        this.topPoints = this._pointsAt(topPosition);
        this.currentRate = Math.min(this.bottomPoints, this.topPoints);
        this.score += this.currentRate * dt;
        this.bestScore = Math.max(this.bestScore, this.score);
    }

    _pointsAt(position) {
        const radius = Math.hypot(position.x, position.z);
        const width = WORLD.targetRadius / WORLD.targetPoints.length;
        const index = Math.floor(radius / width);
        return WORLD.targetPoints[index] ?? 0;
    }

    _fail(reason) {
        if (this.phase !== 'playing') return;
        this.phase = 'dead';
        this.failureReason = reason;
        this.freeCenter.copy(this.bottomPosition).addScaledVector(
            this.rodDirection,
            this.parameters.rodLength * 0.5,
        );
        this.freeVelocity.copy(this.bottomVelocity).add(
            new THREE.Vector3().crossVectors(
                this.angularVelocity,
                this.rodDirection.clone().multiplyScalar(this.parameters.rodLength * 0.5),
            ),
        );

        if (!this.scoreSubmitted) {
            this.submitScore({
                score: Number(this.score.toFixed(3)),
                survivedSeconds: Number(this._survivalSeconds.toFixed(3)),
                seed: this.runSeed,
                reason,
            });
            this.scoreSubmitted = true;
        }
        this._renderHud();
    }

    _stepDead(dt) {
        this.freeVelocity.addScaledVector(this.gravityVector, dt);
        this.freeCenter.addScaledVector(this.freeVelocity, dt);
        const directionVelocity = new THREE.Vector3().crossVectors(this.angularVelocity, this.rodDirection);
        this.rodDirection.addScaledVector(directionVelocity, dt).normalize();
        this.bottomPosition.copy(this.freeCenter).addScaledVector(
            this.rodDirection,
            -this.parameters.rodLength * 0.5,
        );
    }

    _rodEntirelyOffScreen() {
        if (!this.camera) return false;
        const bottom = this.bottomPosition.clone().project(this.camera);
        const top = this.bottomPosition.clone()
            .addScaledVector(this.rodDirection, this.parameters.rodLength)
            .project(this.camera);
        const margin = 1.18;
        return (bottom.x < -margin && top.x < -margin)
            || (bottom.x > margin && top.x > margin)
            || (bottom.y < -margin && top.y < -margin)
            || (bottom.y > margin && top.y > margin);
    }

    _syncMeshes() {
        if (!this.rodMesh) return;
        const topPosition = this.bottomPosition.clone().addScaledVector(
            this.rodDirection,
            this.parameters.rodLength,
        );
        this.handMesh.position.set(
            this.handPosition.x,
            this.parameters.handTopY - this.parameters.handThickness * 0.5,
            this.handPosition.z,
        );
        this.rodMesh.position.copy(this.bottomPosition).addScaledVector(
            this.rodDirection,
            this.parameters.rodLength * 0.5,
        );
        this.rodMesh.quaternion.setFromUnitVectors(this.up, this.rodDirection);
        this.bottomMarker.position.copy(this.bottomPosition);
        this.topMarker.position.copy(topPosition);
        this.contactGlow.position.copy(this.bottomPosition);
        this.contactGlow.position.y += 0.004;
        this.contactGlow.material.color.setHex(this.contactState === 'sticking' ? 0x62ffb4 : 0xffa447);
        this.contactGlow.visible = this.phase === 'playing';
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = `
            position:fixed; inset:0; z-index:760; pointer-events:none;
            font-family:Inter,system-ui,sans-serif; color:#26362c;
        `;
        this.hud.innerHTML = `
            <div style="position:absolute; top:14px; right:14px; min-width:292px; padding:12px 15px; border:2px solid #5d6b62; border-radius:16px; background:rgba(239,243,240,.93); box-shadow:0 12px 30px rgba(38,82,50,.20); text-align:right;">
                <div style="font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#2e8a3a;">Integrated score</div>
                <div data-score style="font-size:38px; font-weight:900; line-height:1.08;">0.00</div>
                <div data-rate style="margin-top:4px; font-size:13px; color:#536258;">10 pts/s</div>
                <div data-contact style="margin-top:5px; font-size:12px; color:#257c35;">Sticking</div>
                <div data-best style="margin-top:3px; font-size:12px; color:#66756b;">Record: 0.00</div>
            </div>
            <div data-ready style="display:grid; position:absolute; inset:0; place-items:center; pointer-events:none;">
                <div style="padding:14px 20px; border-radius:16px; background:rgba(239,243,240,.94); border:2px solid #5d6b62; box-shadow:0 18px 50px rgba(38,82,50,.22); text-align:center;">
                    <div style="font-size:12px; text-transform:uppercase; letter-spacing:.15em; color:#2e8a3a;">Ready</div>
                    <div style="margin-top:5px; font-size:20px; font-weight:850;">Left click to start</div>
                </div>
            </div>
            <div data-dead style="display:none; position:absolute; inset:0; place-items:center; pointer-events:auto; background:rgba(59,92,67,.30);">
                <div style="width:min(390px,calc(100vw - 32px)); padding:21px; border-radius:20px; background:#eff3f0; border:2px solid #5d6b62; box-shadow:0 24px 70px rgba(38,82,50,.28); text-align:center;">
                    <div style="font-size:12px; text-transform:uppercase; letter-spacing:.14em; color:#c14d39;">Game over</div>
                    <div data-final style="margin-top:8px; font-size:35px; font-weight:900;">0.00 points</div>
                    <div data-reason style="margin-top:7px; color:#59685e; font-size:14px;"></div>
                    <button data-restart type="button" style="margin-top:15px; width:100%; padding:10px 12px; border:2px solid #277632; border-radius:12px; background:#50c747; color:#153318; font-size:13px; font-weight:800; cursor:pointer;">Restart</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.hud);
        this.scoreElement = this.hud.querySelector('[data-score]');
        this.rateElement = this.hud.querySelector('[data-rate]');
        this.contactElement = this.hud.querySelector('[data-contact]');
        this.bestElement = this.hud.querySelector('[data-best]');
        this.readyElement = this.hud.querySelector('[data-ready]');
        this.deadElement = this.hud.querySelector('[data-dead]');
        this.finalElement = this.hud.querySelector('[data-final]');
        this.reasonElement = this.hud.querySelector('[data-reason]');
        this.restartElement = this.hud.querySelector('[data-restart]');
        this._restartHandler = () => this._resetRun();
        this.restartElement.addEventListener('click', this._restartHandler);
    }

    _renderHud() {
        if (!this.hud) return;
        this.scoreElement.textContent = this.score.toFixed(2);
        this.rateElement.textContent = `${this.currentRate} pts/s · bottom ${this.bottomPoints}, top ${this.topPoints}`;
        const sliding = this.contactState === 'sliding';
        this.contactElement.textContent = sliding ? 'Sliding — move under the rod' : 'Sticking';
        this.contactElement.style.color = sliding ? '#b45c18' : '#257c35';
        this.bestElement.textContent = `Record for these settings: ${this.bestScore.toFixed(2)}`;
        this.readyElement.style.display = this.phase === 'ready' ? 'grid' : 'none';
        this.deadElement.style.display = this.phase === 'dead' ? 'grid' : 'none';
        this.finalElement.textContent = `${this.score.toFixed(2)} points`;
        this.reasonElement.textContent = this.failureReason;
    }

    update(dt) {
        if (this.phase === 'dead' && this.input.isActionJustDown('restart')) {
            this._resetRun();
            return;
        }

        if (this.phase === 'ready') {
            this._syncMeshes();
            this._renderHud();
            return;
        }

        this._updateMouseTarget();
        this.accumulator = Math.min(
            this.accumulator + dt,
            this.parameters.fixedTimeStep * WORLD.maximumSubsteps,
        );
        let substeps = 0;
        while (this.accumulator >= this.parameters.fixedTimeStep && substeps < WORLD.maximumSubsteps) {
            if (this.phase === 'playing') {
                this._survivalSeconds += this.parameters.fixedTimeStep;
                this._stepPlaying(this.parameters.fixedTimeStep);
            } else {
                this._stepDead(this.parameters.fixedTimeStep);
            }
            this.accumulator -= this.parameters.fixedTimeStep;
            substeps++;
        }
        this._syncMeshes();
        this._renderHud();
    }

    render() {
        this.renderer?.render(this.scene, this.camera);
    }

    onResize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / Math.max(1, height);
        this.camera.updateProjectionMatrix();
        if (this.phase === 'playing') this._placeVirtualPointerAtHand();
    }

    onPause() {
        this.orbitDragging = false;
    }

    onResume() {
        if (this.phase === 'playing') this._placeVirtualPointerAtHand();
    }

    wantsPointerLockNow() {
        return this.phase === 'playing';
    }

    destroy() {
        this._bestScoreRequest = (this._bestScoreRequest || 0) + 1;
        if (this._startMouseHandler) this.canvas.removeEventListener('mousedown', this._startMouseHandler);
        if (this._orbitMouseDownHandler) window.removeEventListener('mousedown', this._orbitMouseDownHandler);
        if (this._orbitMouseMoveHandler) window.removeEventListener('mousemove', this._orbitMouseMoveHandler);
        if (this._orbitMouseUpHandler) window.removeEventListener('mouseup', this._orbitMouseUpHandler);
        if (this.restartElement && this._restartHandler) {
            this.restartElement.removeEventListener('click', this._restartHandler);
        }
        this.hud?.remove();
        this.hud = null;

        this.scene?.traverse(object => {
            if (object.geometry) object.geometry.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            for (const material of materials) {
                material?.map?.dispose?.();
                material?.dispose?.();
            }
        });
        this.renderer?.dispose?.();
        this.renderer = null;
        this.scene = null;
        this.camera = null;
    }

    static getSettingsSchema() {
        return [
            {
                key: 'handLength',
                label: 'Hand length l_r [m]',
                type: 'range', min: 0.7, max: 2.5, step: 0.05, default: PHYSICS.handLength,
                group: 'Physics',
            },
            {
                key: 'frictionCoefficient',
                label: 'Friction coefficient k',
                type: 'range', min: 0, max: 2, step: 0.02, default: PHYSICS.frictionCoefficient,
                group: 'Physics',
            },
            {
                key: 'rodLength',
                label: 'Rod length l_p [m]',
                type: 'range', min: 1.5, max: 5, step: 0.1, default: PHYSICS.rodLength,
                group: 'Physics',
            },
            {
                key: 'gravity',
                label: 'Gravity g [m/s²]',
                type: 'range', min: 1, max: 20, step: 0.1, default: PHYSICS.gravity,
                group: 'Physics',
            },
        ];
    }

    preparePauseSettings(settings) {
        requirePositiveNumber(settings.handLength ?? PHYSICS.handLength, 'Hand length');
        requireFiniteNumber(settings.frictionCoefficient ?? PHYSICS.frictionCoefficient, 'Friction coefficient', { minimum: 0 });
        requirePositiveNumber(settings.rodLength ?? PHYSICS.rodLength, 'Rod length');
        requireFiniteNumber(settings.gravity ?? PHYSICS.gravity, 'Gravity', { minimum: 0 });
        return settings;
    }

    static getControlsSchema() {
        return [{
            action: 'restart',
            label: 'Restart run',
            defaultBindings: [{ type: 'keyboard', code: 'Enter' }],
        }];
    }
}

const ROD_MODES = Object.freeze({
    '2d': {
        label: 'Rod Balance 2D',
        artKey: 'rod-2d',
        description: 'Move the support horizontally and vertically; pulling it from beneath the rod also ends the run.',
        prefix: 'twoD',
        GameClass: RodBalance2DGame,
    },
    '3d': {
        label: 'Rod Balance 3D',
        artKey: 'rod-3d',
        description: 'Move the hand across the horizontal X–Z plane and orbit the camera with right-drag.',
        prefix: 'threeD',
        GameClass: RodBalance3DGame,
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

export default class RodBalanceGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.mode = null;
        this.child = null;
        this.phase = 'mode-select';
        if (this._modeChosenForSession && ROD_MODES[this.settings.mode]) {
            this._startMode(this.settings.mode);
        } else {
            this._showModeSelector();
        }
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        this.pendingMode = ROD_MODES[this.settings.mode] ? this.settings.mode : '2d';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Rod Balance',
            prompt: 'Choose dimensions',
            selectedMode: this.pendingMode,
            modes: Object.entries(ROD_MODES).map(([key, info]) => ({
                key, title: info.label, description: info.description, artKey: info.artKey,
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
        const info = ROD_MODES[mode];
        return Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
            setting.key,
            this.settings[`${info.prefix}_${setting.key}`] ?? setting.default,
        ]));
    }

    _startMode(mode) {
        const info = ROD_MODES[mode];
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
        this.app.settingsManager.save('rod-balance', this.settings).catch(() => {});
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

        this.child = new info.GameClass();
        const recordSettings = this.getRecordSettings({ ...this.settings, mode });
        const childApp = {
            ...this.app,
            currentSettings: childSettings,
            records: {
                getBest: (_legacyId, _legacySettings, resultKey, direction = 'max') =>
                    this.app.records.getBest('rod-balance', recordSettings, resultKey, direction),
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

    destroy() {
        this.modeSelector?.remove();
        this.modeSelector = null;
        this._destroyChild();
        this.mode = null;
    }

    preparePauseSettings(settings) {
        const mode = settings?.mode ?? this.mode ?? '3d';
        if (!ROD_MODES[mode]) throw new Error(`Rod Balance mode is invalid: ${mode}.`);
        const info = ROD_MODES[mode];
        const prefix = info.prefix;
        requirePositiveNumber(settings[`${prefix}_handLength`] ?? PHYSICS.handLength, `${mode} hand length`);
        requireFiniteNumber(settings[`${prefix}_frictionCoefficient`] ?? PHYSICS.frictionCoefficient, `${mode} friction coefficient`, { minimum: 0 });
        requirePositiveNumber(settings[`${prefix}_rodLength`] ?? PHYSICS.rodLength, `${mode} rod length`);
        requireFiniteNumber(settings[`${prefix}_gravity`] ?? PHYSICS.gravity, `${mode} gravity`, { minimum: 0 });
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        const mode = settings?.mode ?? this.mode ?? '3d';
        if (!ROD_MODES[mode]) throw new Error(`Rod Balance mode is invalid: ${mode}.`);
        const info = ROD_MODES[mode];
        return {
            mode,
            ...Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
                setting.key,
                settings[`${info.prefix}_${setting.key}`] ?? setting.default,
            ])),
        };
    }

    static getSettingsSchema() {
        return [
            { key: 'mode', label: 'Mode', type: 'hidden', default: '2d' },
            ...Object.entries(ROD_MODES).flatMap(([mode, info]) => prefixedSettings(mode, info)),
            { key: 'rodProfileVersion', label: 'Settings profile version', type: 'hidden', default: 2 },
        ];
    }

    static async migrateSettings(settings) {
        if (Number(settings.rodProfileVersion ?? 0) >= 2) return settings;
        const migrated = { ...settings, rodProfileVersion: 2 };
        for (const setting of RodBalance3DGame.getSettingsSchema()) {
            if (settings[setting.key] !== undefined) {
                migrated[`threeD_${setting.key}`] = settings[setting.key];
            }
            delete migrated[setting.key];
        }
        const legacy2D = await window.api.readSettings('rod-balance-2d');
        for (const setting of RodBalance2DGame.getSettingsSchema()) {
            if (legacy2D?.[setting.key] !== undefined) {
                migrated[`twoD_${setting.key}`] = legacy2D[setting.key];
            }
        }
        return migrated;
    }

    static getControlsSchema() {
        const controls = Object.values(ROD_MODES).flatMap(info => info.GameClass.getControlsSchema());
        return [...new Map(controls.map(control => [control.action, control])).values()];
    }
}
