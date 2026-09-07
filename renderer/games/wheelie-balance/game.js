import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

/* All record-relevant physical parameters are centralized here. */
export const WHEELIE_DEFAULTS = Object.freeze({
    gravity: 9.81,
    carMass: 760,
    wheelbase: 2.42,
    wheelRadius: 0.34,
    comForwardFromRearAxle: 0.86,
    comHeightAboveRearAxle: 0.62,
    pitchInertiaFactor: 0.17,
    tireFriction: 1.12,
    rollingResistance: 0.016,
    aerodynamicDrag: 0.42,
    pitchDamping: 38,
    drivelineEfficiency: 0.91,
    meanTerrainAmplitude: 0.30,
    terrainAmplitudeStdDev: 0.08,
    meanTerrainFwhm: 14,
    terrainFwhmStdDev: 2.8,
});

/* Engine power is deliberately a live, record-independent player choice. */
export const IN_GAME_POWER = Object.freeze({
    stepKw: 1,
    defaultKw: 68,
    lowSpeedPowerFloor: 4.2,
});

const SIMULATION = Object.freeze({
    logicalHeight: 720,
    pixelsPerMetre: 91,
    groundScreenY: 601,
    fixedTimeStep: 1 / 300,
    maximumSubsteps: 20,
    maximumFrameTime: 0.05,
    countdownStepDuration: 0.72,
    zeroFlashDuration: 0.42,
    liftAngle: 0.0025,
    touchdownAngle: 0.001,
    rolloverComMargin: 0.025,
    maximumPitchSpeed: 8,
    maximumRoadSpeed: 95,
    frontLandingMinimumTime: 0.65,
    frontLandingMaximumTime: 2,
    frontLandingPitchStiffness: 72,
    frontLandingPitchDamping: 17,
    backwardBodySlideFriction: 0.18,
    backwardBodyImpactTangentialRetention: 0.78,
    terrainStartClearance: 13,
    terrainMinimumAmplitude: 0,
    terrainMaximumAmplitude: 2.5,
    terrainMinimumFwhm: 4,
    terrainMaximumFwhm: 70,
    terrainGenerationMargin: 100,
    terrainRenderStepPixels: 7,
    roadThicknessPixels: 54,
});

const CAR_BODY_POLYGON = Object.freeze([
    [-0.34, 0.12],
    [0.00, 0.68],
    [0.62, 0.83],
    [1.03, 1.25],
    [1.78, 1.22],
    [2.13, 0.82],
    ['front', 0.64],
    ['frontInset', 0.17],
]);

const REAR_BODY_CONTACT_POINTS = Object.freeze([
    [-0.34, 0.12],
    [-0.18, 0.2],
    [0, 0.31],
]);

const BACKWARD_FINAL_CONTACT_POINTS = Object.freeze([
    [0.62, 0.83],
    [1.03, 1.25],
    [1.78, 1.22],
    [2.13, 0.82],
]);

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const GAUSSIAN_FWHM_FACTOR = 4 * Math.log(2);

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Date.now() >>> 0;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function normalRandom(random) {
    const first = Math.max(1e-12, random());
    const second = random();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(Math.PI * 2 * second);
}

export function readWheelieParameters(settings = {}) {
    const source = { ...WHEELIE_DEFAULTS, ...(settings || {}) };
    return Object.freeze({
        gravity: Number(source.gravity),
        carMass: Number(source.carMass),
        wheelbase: Number(source.wheelbase),
        wheelRadius: Number(source.wheelRadius),
        comForwardFromRearAxle: Number(source.comForwardFromRearAxle),
        comHeightAboveRearAxle: Number(source.comHeightAboveRearAxle),
        pitchInertiaFactor: Number(source.pitchInertiaFactor),
        tireFriction: Number(source.tireFriction),
        rollingResistance: Number(source.rollingResistance),
        aerodynamicDrag: Number(source.aerodynamicDrag),
        pitchDamping: Number(source.pitchDamping),
        drivelineEfficiency: Number(source.drivelineEfficiency),
        meanTerrainAmplitude: Number(source.meanTerrainAmplitude),
        terrainAmplitudeStdDev: Number(source.terrainAmplitudeStdDev),
        meanTerrainFwhm: Number(source.meanTerrainFwhm),
        terrainFwhmStdDev: Number(source.terrainFwhmStdDev),
    });
}

export function validateWheelieSettings(settings = {}) {
    requireFiniteNumber(settings.gravity, 'Gravity', { minimum: 0 });
    requirePositiveNumber(settings.carMass, 'Car mass');
    requirePositiveNumber(settings.wheelbase, 'Wheelbase');
    requirePositiveNumber(settings.wheelRadius, 'Wheel radius');
    requireFiniteNumber(settings.comForwardFromRearAxle, 'Centre-of-mass longitudinal offset');
    requireFiniteNumber(settings.comHeightAboveRearAxle, 'Centre-of-mass height');
    requirePositiveNumber(settings.pitchInertiaFactor, 'Pitch inertia factor');
    for (const [key, label] of [
        ['tireFriction', 'Tyre friction'], ['rollingResistance', 'Rolling resistance'],
        ['aerodynamicDrag', 'Aerodynamic drag'], ['pitchDamping', 'Pitch damping'],
        ['meanTerrainAmplitude', 'Mean terrain amplitude'],
        ['terrainAmplitudeStdDev', 'Terrain-amplitude standard deviation'],
        ['meanTerrainFwhm', 'Mean terrain FWHM'], ['terrainFwhmStdDev', 'Terrain-width standard deviation'],
    ]) {
        if (key === 'meanTerrainFwhm') requirePositiveNumber(settings[key], label);
        else requireFiniteNumber(settings[key], label, { minimum: 0 });
    }
    // An efficiency is a dimensionless fraction: negative values and gains above 100%
    // are not a different car model, they violate the meaning of this parameter.
    requireFiniteNumber(settings.drivelineEfficiency, 'Driveline efficiency', { minimum: 0, maximum: 1 });
}

export function generateTerrainBump(previousBump, parameters, random, id = 0) {
    const amplitude = Math.max(
        SIMULATION.terrainMinimumAmplitude,
        parameters.meanTerrainAmplitude
            + parameters.terrainAmplitudeStdDev * normalRandom(random),
    );
    const fwhm = Math.max(
        Number.EPSILON,
        parameters.meanTerrainFwhm
            + parameters.terrainFwhmStdDev * normalRandom(random),
    );
    const centre = previousBump
        ? previousBump.centre + 0.68 * (previousBump.fwhm + fwhm)
        : SIMULATION.terrainStartClearance + fwhm * 0.62;
    return { id, centre, amplitude, fwhm };
}

/** Height, first derivative and signed curvature of a Gaussian-bump road. */
export function sampleTerrain(bumps, x) {
    let height = 0;
    let slope = 0;
    let secondDerivative = 0;
    for (const bump of bumps || []) {
        const delta = x - bump.centre;
        if (Math.abs(delta) > bump.fwhm * 4.5) continue;
        const inverseWidthSquared = 1 / (bump.fwhm * bump.fwhm);
        const exponential = Math.exp(
            -GAUSSIAN_FWHM_FACTOR * delta * delta * inverseWidthSquared,
        );
        const contribution = bump.amplitude * exponential;
        const logarithmicSlope = -2 * GAUSSIAN_FWHM_FACTOR
            * delta * inverseWidthSquared;
        height += contribution;
        slope += contribution * logarithmicSlope;
        secondDerivative += contribution * (
            logarithmicSlope * logarithmicSlope
                - 2 * GAUSSIAN_FWHM_FACTOR * inverseWidthSquared
        );
    }
    const slopeScale = Math.sqrt(1 + slope * slope);
    return {
        height,
        slope,
        angle: Math.atan(slope),
        secondDerivative,
        curvature: secondDerivative / (slopeScale * slopeScale * slopeScale),
    };
}

export function wheelieGeometry(state, parameters, terrainSampler = () => ({
    height: 0, slope: 0, angle: 0, curvature: 0,
})) {
    const rearRoad = terrainSampler(state.position);
    const tangent = { x: Math.cos(rearRoad.angle), y: Math.sin(rearRoad.angle) };
    const normal = { x: -tangent.y, y: tangent.x };
    const cosine = Math.cos(state.pitch);
    const sine = Math.sin(state.pitch);
    const a = parameters.comForwardFromRearAxle;
    const h = parameters.comHeightAboveRearAxle;
    const rearContact = { x: state.position, y: rearRoad.height };
    const rearAxle = {
        x: rearContact.x + parameters.wheelRadius * normal.x,
        y: rearContact.y + parameters.wheelRadius * normal.y,
    };
    const frontAxle = {
        x: rearAxle.x + parameters.wheelbase * cosine,
        y: rearAxle.y + parameters.wheelbase * sine,
    };
    const frontRoad = terrainSampler(frontAxle.x);
    const frontNormalDistance = (frontAxle.y - frontRoad.height)
        / Math.sqrt(1 + frontRoad.slope * frontRoad.slope);
    const com = {
        x: rearAxle.x + a * cosine - h * sine,
        y: rearAxle.y + a * sine + h * cosine,
    };
    const contactToCom = {
        x: com.x - rearContact.x,
        y: com.y - rearContact.y,
    };
    const comTangent = contactToCom.x * tangent.x + contactToCom.y * tangent.y;
    const comNormal = contactToCom.x * normal.x + contactToCom.y * normal.y;
    return {
        rearRoad,
        frontRoad,
        tangent,
        normal,
        rearContact,
        rearAxle,
        frontAxle,
        com,
        comXFromRearContact: comTangent,
        comYFromRearContact: comNormal,
        frontAxleXFromRearAxle: parameters.wheelbase * cosine,
        frontAxleY: frontAxle.y,
        frontTireBottomY: frontNormalDistance - parameters.wheelRadius,
        relativePitch: state.pitch - rearRoad.angle,
    };
}

export function wheelieForces(state, parameters, enginePowerKw, throttle, road = {}) {
    const p = parameters;
    const massGravity = p.carMass * p.gravity;
    const slopeAngle = Number(road.slopeAngle) || 0;
    const normalForce = Number.isFinite(road.normalForce)
        ? Math.max(0, road.normalForce)
        : massGravity * Math.cos(slopeAngle);
    const requestedDrive = throttle
        ? enginePowerKw * 1000 * p.drivelineEfficiency
            / Math.max(IN_GAME_POWER.lowSpeedPowerFloor, Math.abs(state.velocity))
        : 0;
    const driveForce = clamp(requestedDrive, 0, p.tireFriction * normalForce);
    const rollingForce = state.velocity > 1e-5
        ? p.rollingResistance * normalForce
        : Math.min(driveForce, p.rollingResistance * normalForce);
    const aerodynamicForce = p.aerodynamicDrag * state.velocity * Math.abs(state.velocity);
    return {
        driveForce,
        rollingForce,
        aerodynamicForce,
        normalForce,
        longitudinalAcceleration: (driveForce - rollingForce - aerodynamicForce) / p.carMass
            - p.gravity * Math.sin(slopeAngle),
    };
}

export default class WheelieBalanceGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        validateWheelieSettings({ ...WHEELIE_DEFAULTS, ...(this.settings || {}) });
        this.parameters = readWheelieParameters(this.settings);
        const requestedPower = Number(this.enginePowerKw);
        this.enginePowerKw = Number.isFinite(requestedPower) && requestedPower >= 0
            ? requestedPower
            : IN_GAME_POWER.defaultKw;
        this.bestDistance = 0;
        this._bestRequest = (this._bestRequest || 0) + 1;
        this._loadBest(this._bestRequest);
        this._createPowerControl();
        this._resetRun();
    }

    _resetRun(seed = makeSeed()) {
        this.terrainSeed = seed >>> 0;
        this.terrainRandom = seededRandom(this.terrainSeed);
        this.terrainBumps = [];
        this._ensureTerrainAhead(SIMULATION.terrainGenerationMargin);
        this.phase = 'countdown';
        this.countdownElapsed = 0;
        this.startFlashRemaining = 0;
        this.elapsed = 0;
        this.accumulator = 0;
        this.position = 0;
        this.velocity = 0;
        this.pitch = this._groundPitchAt(0);
        this.pitchVelocity = 0;
        this.rearWheelAngle = 0;
        this.hasLifted = false;
        this.wheelieStartX = 0;
        this.wheelieTime = 0;
        this.distance = 0;
        this.maximumPitch = 0;
        this.lastDriveForce = 0;
        this.lastThrottle = false;
        this.endReason = '';
        this.crashType = null;
        this.crashElapsed = 0;
        this.crashStartPitch = this.pitch;
        this.crashStartDistance = 0;
        this.backwardBodyPivot = null;
        this.crashPose = null;
        this.cameraX = 0;
        this.cameraY = this._terrainAt(0).height;
        this._scoreSubmitted = false;
    }

    _ensureTerrainAhead(worldX) {
        while (!this.terrainBumps.length
            || this.terrainBumps[this.terrainBumps.length - 1].centre
                < worldX + SIMULATION.terrainGenerationMargin) {
            const previous = this.terrainBumps[this.terrainBumps.length - 1] || null;
            this.terrainBumps.push(generateTerrainBump(
                previous,
                this.parameters,
                this.terrainRandom,
                this.terrainBumps.length,
            ));
        }
    }

    _terrainAt(x) {
        return sampleTerrain(this.terrainBumps, x);
    }

    _groundPitchAt(x) {
        const p = this.parameters;
        const rear = this._terrainAt(x);
        const front = this._terrainAt(x + p.wheelbase);
        return Math.atan2(front.height - rear.height, p.wheelbase);
    }

    _vehicleGeometry() {
        if (!this.crashPose) {
            return wheelieGeometry(this, this.parameters, x => this._terrainAt(x));
        }
        const p = this.parameters;
        const rearAxle = { ...this.crashPose.rearAxle };
        const rearRoad = this._terrainAt(rearAxle.x);
        const tangent = { x: Math.cos(rearRoad.angle), y: Math.sin(rearRoad.angle) };
        const normal = { x: -tangent.y, y: tangent.x };
        const cosine = Math.cos(this.pitch);
        const sine = Math.sin(this.pitch);
        const frontAxle = {
            x: rearAxle.x + p.wheelbase * cosine,
            y: rearAxle.y + p.wheelbase * sine,
        };
        const frontRoad = this._terrainAt(frontAxle.x);
        const com = {
            x: rearAxle.x + p.comForwardFromRearAxle * cosine
                - p.comHeightAboveRearAxle * sine,
            y: rearAxle.y + p.comForwardFromRearAxle * sine
                + p.comHeightAboveRearAxle * cosine,
        };
        const rearContact = { x: rearAxle.x, y: rearRoad.height };
        const contactToCom = {
            x: com.x - rearContact.x,
            y: com.y - rearContact.y,
        };
        const frontNormalDistance = (frontAxle.y - frontRoad.height)
            / Math.sqrt(1 + frontRoad.slope * frontRoad.slope);
        return {
            rearRoad,
            frontRoad,
            tangent,
            normal,
            rearContact,
            rearAxle,
            frontAxle,
            com,
            comXFromRearContact: contactToCom.x * tangent.x
                + contactToCom.y * tangent.y,
            comYFromRearContact: contactToCom.x * normal.x
                + contactToCom.y * normal.y,
            frontAxleXFromRearAxle: p.wheelbase * cosine,
            frontAxleY: frontAxle.y,
            frontTireBottomY: frontNormalDistance - p.wheelRadius,
            relativePitch: this.pitch - rearRoad.angle,
        };
    }

    async _loadBest(requestId) {
        try {
            const record = await this.app?.records?.getBest(
                'wheelie-balance',
                this.getRecordSettings(this.settings),
                'distance',
            );
            if (requestId !== this._bestRequest) return;
            const value = Number(record?.results?.distance);
            if (Number.isFinite(value)) this.bestDistance = value;
        } catch (error) {
            console.warn('Could not load Wheelie Balance record:', error);
        }
    }

    _createPowerControl() {
        this._removePowerControl();
        if (typeof document === 'undefined') return;
        const root = document.createElement('div');
        root.className = 'wheelie-power-control';
        root.dataset.recordIndependent = 'true';
        Object.assign(root.style, {
            position: 'fixed',
            top: '17px',
            right: '22px',
            zIndex: '7',
            width: '236px',
            padding: '10px 13px 9px',
            border: '2px solid #277a39',
            borderRadius: '12px',
            background: 'rgba(244,252,246,.94)',
            boxShadow: '0 5px 14px rgba(23,73,45,.24)',
            color: '#263c34',
            font: '700 12px Inter, sans-serif',
            userSelect: 'none',
        });
        root.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
                <span>ENGINE POWER</span>
                <strong data-power-value style="font-size:16px;color:#238138"></strong>
            </div>
            <input data-power-slider type="number" min="0" step="${IN_GAME_POWER.stepKw}" value="${this.enginePowerKw}" aria-label="Engine power in kilowatts" style="box-sizing:border-box;width:100%;padding:6px 8px;border:1px solid #277a39;border-radius:7px;background:#effbea;color:#263c34;margin:7px 0 2px">
            <div data-power-error role="alert" style="min-height:14px;color:#b3261e;font-size:10px"></div>
            <div style="font-size:10px;color:#63746c">Live choice · excluded from records</div>`;
        const slider = root.querySelector('[data-power-slider]');
        const value = root.querySelector('[data-power-value]');
        const error = root.querySelector('[data-power-error]');
        const refresh = () => {
            const requested = Number(slider.value);
            if (!Number.isFinite(requested) || requested < 0) {
                slider.setCustomValidity('Engine power must be a finite non-negative number.');
                error.textContent = 'Enter a finite power value ≥ 0.';
                slider.setAttribute('aria-invalid', 'true');
                value.textContent = `${Math.round(this.enginePowerKw)} kW`;
                return;
            }
            slider.setCustomValidity('');
            error.textContent = '';
            slider.removeAttribute('aria-invalid');
            this.enginePowerKw = requested;
            value.textContent = `${Math.round(this.enginePowerKw)} kW`;
        };
        refresh();
        slider.addEventListener('input', refresh);
        const stopMouse = event => {
            this.powerUiPointerActive = event.type !== 'mouseup';
            event.stopPropagation();
        };
        root.addEventListener('mousedown', stopMouse);
        root.addEventListener('mouseup', stopMouse);
        root.addEventListener('click', event => event.stopPropagation());
        root.addEventListener('mouseleave', () => { this.powerUiPointerActive = false; });
        (this.canvas?.parentElement || document.body).appendChild(root);
        this.powerControl = root;
    }

    _removePowerControl() {
        this.powerControl?.remove?.();
        this.powerControl = null;
        this.powerUiPointerActive = false;
    }

    _integrate(step, throttle) {
        if (this.phase === 'crashing') {
            this._integrateCrash(step);
            return;
        }
        const p = this.parameters;
        this._ensureTerrainAhead(this.position);
        if (!this.hasLifted) this.pitch = this._groundPitchAt(this.position);
        let geometry = this._vehicleGeometry();
        const rawNormalForce = p.carMass * (
            p.gravity * Math.cos(geometry.rearRoad.angle)
                + this.velocity * this.velocity * geometry.rearRoad.curvature
        );
        const forces = wheelieForces(this, p, this.enginePowerKw, throttle, {
            slopeAngle: geometry.rearRoad.angle,
            normalForce: Math.max(0, rawNormalForce),
        });
        this.lastDriveForce = forces.driveForce;
        this.velocity = clamp(
            this.velocity + forces.longitudinalAcceleration * step,
            0,
            SIMULATION.maximumRoadSpeed,
        );
        this.position += this.velocity * Math.cos(geometry.rearRoad.angle) * step;
        this.rearWheelAngle += this.velocity / p.wheelRadius * step;

        if (!this.hasLifted) this.pitch = this._groundPitchAt(this.position);
        geometry = this._vehicleGeometry();
        if (!this.hasLifted) {
            const liftMoment = forces.driveForce * geometry.comYFromRearContact
                - forces.normalForce * geometry.comXFromRearContact;
            if (liftMoment > 0) {
                this.hasLifted = true;
                this.wheelieStartX = this.position;
                this.pitch = geometry.rearRoad.angle + SIMULATION.liftAngle;
                this.pitchVelocity = Math.max(
                    geometry.rearRoad.curvature * this.velocity,
                    0.015,
                ) + liftMoment * step
                    / this._rearPitchInertia();
                this.audio.playPlasticImpact?.(0.18);
            } else {
                this.pitch = this._groundPitchAt(this.position);
                this.pitchVelocity = geometry.rearRoad.curvature * this.velocity;
            }
            return;
        }

        if (rawNormalForce <= 0) {
            this._beginCrash('front', 'Front wheel touched down');
            return;
        }
        geometry = this._vehicleGeometry();
        const pitchMoment = forces.driveForce * geometry.comYFromRearContact
            - forces.normalForce * geometry.comXFromRearContact
            - p.pitchDamping * this.pitchVelocity;
        const pitchAcceleration = pitchMoment / this._rearPitchInertia();
        this.pitchVelocity = clamp(
            this.pitchVelocity + pitchAcceleration * step,
            -SIMULATION.maximumPitchSpeed,
            SIMULATION.maximumPitchSpeed,
        );
        this.pitch += this.pitchVelocity * step;
        this.maximumPitch = Math.max(this.maximumPitch, geometry.relativePitch);
        this.wheelieTime += step;
        this.distance += this.velocity * step;

        geometry = this._vehicleGeometry();
        if (geometry.comXFromRearContact <= SIMULATION.rolloverComMargin) {
            this._beginCrash('backward', 'Rolled over backwards');
        } else if (geometry.frontTireBottomY <= SIMULATION.touchdownAngle) {
            this._beginCrash('front', 'Front wheel touched down');
        }
    }

    _beginCrash(type, reason) {
        if (this.phase === 'crashing' || this.phase === 'done') return;
        this.phase = 'crashing';
        this.crashType = type;
        this.crashElapsed = 0;
        this.crashStartPitch = this.pitch;
        this.crashStartDistance = this.distance;
        this.endReason = reason;
        this.lastThrottle = false;
        this.backwardBodyPivot = null;
        this.crashPose = null;
        if (type === 'front') {
            // Preserve a small, visible tyre/suspension rebound instead of
            // snapping the whole car to its road pose under a game-over card.
            this.pitchVelocity = Math.max(0, -this.pitchVelocity * 0.22);
            this.audio.playPlasticImpact?.(0.18);
        }
    }

    _integrateCrash(step) {
        const p = this.parameters;
        this._ensureTerrainAhead(this.position);
        this.crashElapsed += step;
        this.lastDriveForce = 0;
        if (this.crashType === 'backward' && this.backwardBodyPivot) {
            this._integrateBackwardBodyPivot(step);
            return;
        }
        let geometry = this._vehicleGeometry();
        const normalForce = p.carMass * Math.max(
            0,
            p.gravity * Math.cos(geometry.rearRoad.angle)
                + this.velocity * this.velocity * geometry.rearRoad.curvature,
        );
        const coast = wheelieForces(this, p, this.enginePowerKw, false, {
            slopeAngle: geometry.rearRoad.angle,
            normalForce,
        });
        this.velocity = clamp(
            this.velocity + coast.longitudinalAcceleration * step,
            0,
            SIMULATION.maximumRoadSpeed,
        );
        this.position += this.velocity * Math.cos(geometry.rearRoad.angle) * step;
        this.rearWheelAngle += this.velocity / p.wheelRadius * step;
        geometry = this._vehicleGeometry();
        if (this.crashType === 'backward') {
            // Once the COM passes behind the rear contact, recovery is over,
            // but gravity must still rotate the car until its rear body really
            // hits the road. That impact then becomes a second physical pivot
            // so the car can continue onto its roof instead of stopping while
            // still upright. The score remains frozen throughout the fall.
            const pitchMoment = -normalForce * geometry.comXFromRearContact
                - p.pitchDamping * 0.35 * this.pitchVelocity;
            this.pitchVelocity = clamp(
                this.pitchVelocity + pitchMoment / this._rearPitchInertia() * step,
                -SIMULATION.maximumPitchSpeed,
                SIMULATION.maximumPitchSpeed,
            );
            this.pitch += this.pitchVelocity * step;
            this.maximumPitch = Math.max(
                this.maximumPitch,
                this._vehicleGeometry().relativePitch,
            );
            if (this._rearBodyGroundClearance() <= 0) {
                this._beginBackwardBodyPivot();
            }
            return;
        }

        // With both tyres returning to the road, use a damped suspension-like
        // pitch response. This leaves the landed car visible before game over.
        const targetPitch = this._groundPitchAt(this.position);
        const pitchAcceleration = SIMULATION.frontLandingPitchStiffness
            * (targetPitch - this.pitch)
            - SIMULATION.frontLandingPitchDamping * this.pitchVelocity;
        this.pitchVelocity = clamp(
            this.pitchVelocity + pitchAcceleration * step,
            -SIMULATION.maximumPitchSpeed,
            SIMULATION.maximumPitchSpeed,
        );
        this.pitch += this.pitchVelocity * step;
        const settled = Math.abs(this.pitch - targetPitch) < 0.01
            && Math.abs(this.pitchVelocity) < 0.12;
        if ((this.crashElapsed >= SIMULATION.frontLandingMinimumTime && settled)
            || this.crashElapsed >= SIMULATION.frontLandingMaximumTime) {
            this.pitch = targetPitch;
            this.pitchVelocity = geometry.rearRoad.curvature * this.velocity;
            this._finishRun(this.endReason);
        }
    }

    _rearBodyGroundClearance() {
        return this._minimumBodyGroundContact(REAR_BODY_CONTACT_POINTS).clearance;
    }

    _backwardRoofGroundClearance() {
        return this._minimumBodyGroundContact(BACKWARD_FINAL_CONTACT_POINTS).clearance;
    }

    _minimumBodyGroundContact(localPoints) {
        let result = { clearance: Infinity, local: localPoints[0], point: null, road: null };
        for (const [localX, localY] of localPoints) {
            const point = this._bodyPoint(localX, localY);
            const road = this._terrainAt(point.x);
            const clearance = (point.y - road.height)
                / Math.sqrt(1 + road.slope * road.slope);
            if (clearance < result.clearance) {
                result = { clearance, local: [localX, localY], point, road };
            }
        }
        return result;
    }

    _beginBackwardBodyPivot() {
        const contact = this._minimumBodyGroundContact(REAR_BODY_CONTACT_POINTS);
        const geometry = this._vehicleGeometry();
        const rearVelocity = {
            x: this.velocity * Math.cos(geometry.rearRoad.angle),
            y: this.velocity * Math.sin(geometry.rearRoad.angle),
        };
        const contactArm = {
            x: contact.point.x - geometry.rearAxle.x,
            y: contact.point.y - geometry.rearAxle.y,
        };
        const contactVelocity = {
            x: rearVelocity.x - this.pitchVelocity * contactArm.y,
            y: rearVelocity.y + this.pitchVelocity * contactArm.x,
        };
        const roadLength = Math.hypot(1, contact.road.slope);
        const roadTangent = { x: 1 / roadLength, y: contact.road.slope / roadLength };
        this.backwardBodyPivot = {
            world: { x: contact.point.x, y: contact.road.height },
            local: contact.local,
            slideVelocity: SIMULATION.backwardBodyImpactTangentialRetention
                * (contactVelocity.x * roadTangent.x + contactVelocity.y * roadTangent.y),
        };
        this.crashPose = { rearAxle: { ...geometry.rearAxle } };
        this.pitchVelocity = Math.max(0.12, this.pitchVelocity * 0.58);
        this._syncBackwardBodyPivotPose();
        this.audio.playPlasticImpact?.(0.27);
    }

    _syncBackwardBodyPivotPose() {
        const pivot = this.backwardBodyPivot;
        if (!pivot) return;
        const [localX, localY] = pivot.local;
        const cosine = Math.cos(this.pitch);
        const sine = Math.sin(this.pitch);
        this.crashPose.rearAxle = {
            x: pivot.world.x - (localX * cosine - localY * sine),
            y: pivot.world.y - (localX * sine + localY * cosine),
        };
        this.position = this.crashPose.rearAxle.x;
    }

    _integrateBackwardBodyPivot(step) {
        const p = this.parameters;
        const pivot = this.backwardBodyPivot;
        const road = this._terrainAt(pivot.world.x);
        const slideSign = Math.sign(pivot.slideVelocity);
        const gravityAlongRoad = -p.gravity * Math.sin(road.angle);
        const scrapeAcceleration = slideSign === 0
            ? 0
            : -slideSign * SIMULATION.backwardBodySlideFriction
                * p.gravity * Math.max(0, Math.cos(road.angle));
        const nextSlideVelocity = pivot.slideVelocity
            + (gravityAlongRoad + scrapeAcceleration) * step;
        pivot.slideVelocity = slideSign !== 0 && Math.sign(nextSlideVelocity) !== slideSign
            ? 0
            : nextSlideVelocity;
        pivot.world.x += pivot.slideVelocity * Math.cos(road.angle) * step;
        pivot.world.y = this._terrainAt(pivot.world.x).height;
        this.velocity = Math.abs(pivot.slideVelocity);
        this.rearWheelAngle += pivot.slideVelocity / p.wheelRadius * step;
        const [pivotLocalX, pivotLocalY] = this.backwardBodyPivot.local;
        const comLocalX = p.comForwardFromRearAxle - pivotLocalX;
        const comLocalY = p.comHeightAboveRearAxle - pivotLocalY;
        const cosine = Math.cos(this.pitch);
        const sine = Math.sin(this.pitch);
        const horizontalComArm = comLocalX * cosine - comLocalY * sine;
        const inertiaAtCom = p.pitchInertiaFactor * p.carMass
            * (p.wheelbase * p.wheelbase + (p.comHeightAboveRearAxle * 2) ** 2);
        const pivotInertia = inertiaAtCom + p.carMass
            * (comLocalX * comLocalX + comLocalY * comLocalY);
        const pitchMoment = -p.carMass * p.gravity * horizontalComArm
            - p.pitchDamping * 0.18 * this.pitchVelocity;
        this.pitchVelocity = clamp(
            this.pitchVelocity + pitchMoment / pivotInertia * step,
            -SIMULATION.maximumPitchSpeed,
            SIMULATION.maximumPitchSpeed,
        );
        this.pitch += this.pitchVelocity * step;
        this._syncBackwardBodyPivotPose();
        this.maximumPitch = Math.max(
            this.maximumPitch,
            this._vehicleGeometry().relativePitch,
        );
        if (this._backwardRoofGroundClearance() <= 0) {
            this._finishRun(this.endReason);
        }
    }

    _rearPitchInertia() {
        const p = this.parameters;
        const inertiaAtCom = p.pitchInertiaFactor * p.carMass
            * (p.wheelbase * p.wheelbase + (p.comHeightAboveRearAxle * 2) ** 2);
        const distanceSquared = p.comForwardFromRearAxle ** 2
            + (p.wheelRadius + p.comHeightAboveRearAxle) ** 2;
        return inertiaAtCom + p.carMass * distanceSquared;
    }

    _finishRun(reason) {
        if (this.phase === 'done') return;
        this.phase = 'done';
        this.endReason = reason;
        this.bestDistance = Math.max(this.bestDistance, this.distance);
        if (!this._scoreSubmitted) {
            this.submitScore({
                distance: Number(this.distance.toFixed(3)),
                seconds: Number(this.wheelieTime.toFixed(3)),
                maximumAngle: Number((this.maximumPitch * 180 / Math.PI).toFixed(2)),
                reason,
                terrainSeed: this.terrainSeed,
            });
            this._scoreSubmitted = true;
        }
        this.audio.playPlasticImpact?.(0.46);
    }

    update(dt) {
        const cappedDt = Math.min(Number(dt) || 0, SIMULATION.maximumFrameTime);
        const throttlePressed = Boolean(
            !this.powerUiPointerActive && this.input.isActionDown?.('throttle'),
        );
        const throttleJustPressed = Boolean(
            !this.powerUiPointerActive && this.input.isActionJustDown?.('throttle'),
        );
        if (this.phase === 'countdown') {
            this.countdownElapsed += cappedDt;
            if (this.countdownElapsed >= SIMULATION.countdownStepDuration * 3) {
                this.phase = 'running';
                this.startFlashRemaining = SIMULATION.zeroFlashDuration;
                this.audio.playClick?.();
            }
            return;
        }
        if (this.phase === 'done') {
            if (throttleJustPressed) this._resetRun();
            return;
        }
        this.lastThrottle = this.phase === 'running' && throttlePressed;
        this.elapsed += cappedDt;
        this.startFlashRemaining = Math.max(0, this.startFlashRemaining - cappedDt);
        this.accumulator = Math.min(
            this.accumulator + cappedDt,
            SIMULATION.fixedTimeStep * SIMULATION.maximumSubsteps,
        );
        let substeps = 0;
        while (this.accumulator >= SIMULATION.fixedTimeStep
            && substeps < SIMULATION.maximumSubsteps) {
            this._integrate(
                SIMULATION.fixedTimeStep,
                this.phase === 'running' && throttlePressed,
            );
            this.accumulator -= SIMULATION.fixedTimeStep;
            substeps++;
            if (this.phase === 'done') break;
        }
        // At road speed, an eased camera has a steady-state lag proportional
        // to velocity and eventually lets the car escape the viewport. Locking
        // the longitudinal framing to the rear contact keeps the balance point
        // readable without feeding anything back into the physics.
        this.cameraX = Math.max(0, this.position - 3.2);
        this.cameraY = this._terrainAt(this.position).height;
    }

    _renderScale() { return this.h / SIMULATION.logicalHeight; }
    _logicalWidth() { return this.w / Math.max(1e-6, this._renderScale()); }
    _worldToLogical(point) {
        return {
            x: this._logicalWidth() * 0.32
                + (point.x - this.cameraX) * SIMULATION.pixelsPerMetre,
            y: SIMULATION.groundScreenY
                - (point.y - this.cameraY) * SIMULATION.pixelsPerMetre,
        };
    }

    _bodyPoint(localX, localY) {
        const rearAxle = this._vehicleGeometry().rearAxle;
        const cosine = Math.cos(this.pitch);
        const sine = Math.sin(this.pitch);
        return {
            x: rearAxle.x + localX * cosine - localY * sine,
            y: rearAxle.y + localX * sine + localY * cosine,
        };
    }

    _drawBackground(ctx, width, height) {
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#4ec4ef');
        sky.addColorStop(0.64, '#b8edfb');
        sky.addColorStop(1, '#e8fbff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(255,255,255,.80)';
        for (const [x, y, s] of [[105, 105, 1], [width * .62, 72, .66], [width - 170, 160, .82]]) {
            ctx.beginPath();
            ctx.arc(x, y, 31 * s, 0, Math.PI * 2);
            ctx.arc(x + 34 * s, y - 8 * s, 27 * s, 0, Math.PI * 2);
            ctx.arc(x + 65 * s, y + 2 * s, 23 * s, 0, Math.PI * 2);
            ctx.fill();
        }
        const surface = [];
        for (let logicalX = -SIMULATION.terrainRenderStepPixels;
            logicalX <= width + SIMULATION.terrainRenderStepPixels;
            logicalX += SIMULATION.terrainRenderStepPixels) {
            const worldX = this.cameraX
                + (logicalX - width * 0.32) / SIMULATION.pixelsPerMetre;
            const road = this._terrainAt(worldX);
            surface.push({
                x: logicalX,
                y: SIMULATION.groundScreenY
                    - (road.height - this.cameraY) * SIMULATION.pixelsPerMetre,
            });
        }

        ctx.fillStyle = '#58c947';
        ctx.beginPath();
        ctx.moveTo(surface[0].x, surface[0].y);
        for (const point of surface.slice(1)) ctx.lineTo(point.x, point.y);
        ctx.lineTo(width + 10, height + 10);
        ctx.lineTo(-10, height + 10);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#4f5558';
        ctx.beginPath();
        ctx.moveTo(surface[0].x, surface[0].y);
        for (const point of surface.slice(1)) ctx.lineTo(point.x, point.y);
        for (const point of [...surface].reverse()) {
            ctx.lineTo(point.x, point.y + SIMULATION.roadThicknessPixels);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#7d888d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(surface[0].x, surface[0].y + 3);
        for (const point of surface.slice(1)) ctx.lineTo(point.x, point.y + 3);
        ctx.stroke();
        const dashOffset = ((-this.cameraX * SIMULATION.pixelsPerMetre) % 170);
        ctx.strokeStyle = '#f6e45a';
        ctx.lineWidth = 5;
        ctx.setLineDash([76, 35]);
        ctx.lineDashOffset = dashOffset;
        ctx.beginPath();
        ctx.moveTo(surface[0].x, surface[0].y + 35);
        for (const point of surface.slice(1)) ctx.lineTo(point.x, point.y + 35);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    _drawWheel(ctx, centre, driven = false) {
        const p = this.parameters;
        const screen = this._worldToLogical(centre);
        const radius = p.wheelRadius * SIMULATION.pixelsPerMetre;
        const angle = this.rearWheelAngle;

        // Wheel arch shadow
        ctx.fillStyle = 'rgba(10, 16, 20, 0.45)';
        ctx.beginPath();
        ctx.ellipse(screen.x, screen.y + radius * 0.15, radius * 1.08, radius * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Outer Tire (thick performance rubber with radial tread)
        const tireGradient = ctx.createRadialGradient(
            screen.x - radius * 0.2, screen.y - radius * 0.2, radius * 0.4,
            screen.x, screen.y, radius,
        );
        tireGradient.addColorStop(0, '#363f45');
        tireGradient.addColorStop(0.7, '#20262b');
        tireGradient.addColorStop(1, '#111518');
        ctx.fillStyle = tireGradient;
        ctx.strokeStyle = '#0a0d10';
        ctx.lineWidth = Math.max(2, radius * 0.06);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Outer Tread Grooves
        ctx.strokeStyle = 'rgba(12, 16, 20, 0.9)';
        ctx.lineWidth = Math.max(2.5, radius * 0.08);
        for (let i = 0; i < 14; i++) {
            const treadAngle = angle + i * (Math.PI * 2 / 14);
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, radius * 0.93, treadAngle, treadAngle + Math.PI / 18);
            ctx.stroke();
        }

        // Sidewall inner bead / groove
        ctx.strokeStyle = 'rgba(78, 92, 100, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius * 0.74, 0, Math.PI * 2);
        ctx.stroke();

        // Brake Rotor Assembly behind rim
        const rotorRadius = radius * 0.58;
        const rotorGrad = ctx.createRadialGradient(
            screen.x, screen.y, rotorRadius * 0.2,
            screen.x, screen.y, rotorRadius,
        );
        rotorGrad.addColorStop(0, '#5f6970');
        rotorGrad.addColorStop(0.5, '#9faab1');
        rotorGrad.addColorStop(0.85, '#d6dee2');
        rotorGrad.addColorStop(1, '#4a5358');
        ctx.fillStyle = rotorGrad;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, rotorRadius, 0, Math.PI * 2);
        ctx.fill();

        // Cross-drilled rotor cooling holes
        ctx.fillStyle = 'rgba(30, 36, 40, 0.8)';
        for (let i = 0; i < 8; i++) {
            const hAngle = i * (Math.PI / 4);
            for (const rFrac of [0.42, 0.68, 0.86]) {
                const hx = screen.x + Math.cos(hAngle + rFrac * 0.5) * rotorRadius * rFrac;
                const hy = screen.y + Math.sin(hAngle + rFrac * 0.5) * rotorRadius * rFrac;
                ctx.beginPath();
                ctx.arc(hx, hy, Math.max(1, radius * 0.024), 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Sport Brake Caliper
        ctx.fillStyle = driven ? '#d81e28' : '#e62a26';
        ctx.strokeStyle = '#6a0a0e';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, rotorRadius * 1.05, -Math.PI * 0.75, -Math.PI * 0.35);
        ctx.arc(screen.x, screen.y, rotorRadius * 0.55, -Math.PI * 0.35, -Math.PI * 0.75, true);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Caliper highlight
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, rotorRadius * 0.98, -Math.PI * 0.70, -Math.PI * 0.40);
        ctx.stroke();

        // Deep-dish Outer Rim Lip
        const rimRadius = radius * 0.58;
        const rimGrad = ctx.createRadialGradient(
            screen.x - rimRadius * 0.25, screen.y - rimRadius * 0.25, rimRadius * 0.1,
            screen.x, screen.y, rimRadius,
        );
        if (driven) {
            rimGrad.addColorStop(0, '#ffe58f');
            rimGrad.addColorStop(0.4, '#e5a522');
            rimGrad.addColorStop(0.85, '#996305');
            rimGrad.addColorStop(1, '#573400');
        } else {
            rimGrad.addColorStop(0, '#ffffff');
            rimGrad.addColorStop(0.35, '#dde6ea');
            rimGrad.addColorStop(0.8, '#8596a0');
            rimGrad.addColorStop(1, '#344046');
        }
        ctx.strokeStyle = rimGrad;
        ctx.lineWidth = Math.max(3, radius * 0.08);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, rimRadius, 0, Math.PI * 2);
        ctx.stroke();

        // 5-Spoke Sport Star / Dual-Spokes
        const spokeCount = 5;
        const spokeWidth = radius * 0.075;
        for (let i = 0; i < spokeCount; i++) {
            const a = angle + i * (Math.PI * 2 / spokeCount);
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            const perpCos = -sin;
            const perpSin = cos;

            // Spoke shadow
            ctx.fillStyle = 'rgba(15, 20, 24, 0.65)';
            ctx.beginPath();
            ctx.moveTo(screen.x + perpCos * spokeWidth * 0.8, screen.y + perpSin * spokeWidth * 0.8);
            ctx.lineTo(screen.x + cos * rimRadius * 0.95 + perpCos * spokeWidth * 0.5, screen.y + sin * rimRadius * 0.95 + perpSin * spokeWidth * 0.5);
            ctx.lineTo(screen.x + cos * rimRadius * 0.95 - perpCos * spokeWidth * 0.5, screen.y + sin * rimRadius * 0.95 - perpSin * spokeWidth * 0.5);
            ctx.lineTo(screen.x - perpCos * spokeWidth * 0.8, screen.y - perpSin * spokeWidth * 0.8);
            ctx.closePath();
            ctx.fill();

            // Spoke front face
            ctx.fillStyle = driven ? '#f7ca45' : '#e8f0f4';
            ctx.strokeStyle = driven ? '#8c5906' : '#566670';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(screen.x + perpCos * (spokeWidth * 0.55), screen.y + perpSin * (spokeWidth * 0.55));
            ctx.lineTo(screen.x + cos * rimRadius * 0.9 + perpCos * (spokeWidth * 0.35), screen.y + sin * rimRadius * 0.9 + perpSin * (spokeWidth * 0.35));
            ctx.lineTo(screen.x + cos * rimRadius * 0.9 - perpCos * (spokeWidth * 0.35), screen.y + sin * rimRadius * 0.9 - perpSin * (spokeWidth * 0.35));
            ctx.lineTo(screen.x - perpCos * (spokeWidth * 0.55), screen.y - perpSin * (spokeWidth * 0.55));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Specular ridge along each spoke
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(screen.x, screen.y);
            ctx.lineTo(screen.x + cos * rimRadius * 0.88, screen.y + sin * rimRadius * 0.88);
            ctx.stroke();
        }

        // Center Wheel Hub & Lug Nuts
        const hubRadius = radius * 0.18;
        const hubGrad = ctx.createRadialGradient(
            screen.x - hubRadius * 0.3, screen.y - hubRadius * 0.3, 1,
            screen.x, screen.y, hubRadius,
        );
        hubGrad.addColorStop(0, '#4d5b63');
        hubGrad.addColorStop(0.7, '#242c31');
        hubGrad.addColorStop(1, '#0e1316');
        ctx.fillStyle = hubGrad;
        ctx.strokeStyle = '#6e7e88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hubRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 5 Chrome Lug Nuts
        for (let i = 0; i < 5; i++) {
            const lugAngle = angle + i * (Math.PI * 2 / 5);
            const lx = screen.x + Math.cos(lugAngle) * hubRadius * 0.62;
            const ly = screen.y + Math.sin(lugAngle) * hubRadius * 0.62;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(lx, ly, Math.max(1.2, radius * 0.028), 0, Math.PI * 2);
            ctx.fill();
        }

        // Center badge
        ctx.fillStyle = driven ? '#e53935' : '#ffd54f';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hubRadius * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawCar(ctx) {
        const p = this.parameters;
        const wb = p.wheelbase;
        const wr = p.wheelRadius;
        const archR = wr * 1.24;
        const geometry = this._vehicleGeometry();
        const rearAxle = geometry.rearAxle;
        const frontAxle = geometry.frontAxle;

        const bodyToScreen = (lx, ly) => this._worldToLogical(this._bodyPoint(lx, ly));

        // 1. Dynamic Under-Car Ground Shadow
        const rearScreen = this._worldToLogical(rearAxle);
        const frontScreen = this._worldToLogical(frontAxle);
        const shadowMidX = (rearScreen.x + frontScreen.x) / 2;
        const shadowWidth = Math.abs(frontScreen.x - rearScreen.x) + wr * SIMULATION.pixelsPerMetre * 2.8;
        const groundRoad = this._terrainAt(rearAxle.x + wb * 0.5);
        const groundScreen = SIMULATION.groundScreenY - (groundRoad.height - this.cameraY) * SIMULATION.pixelsPerMetre;
        ctx.fillStyle = 'rgba(16, 24, 28, 0.42)';
        ctx.beginPath();
        ctx.ellipse(shadowMidX, groundScreen + 4, shadowWidth * 0.5, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Wheels (Rendered under bodywork)
        this._drawWheel(ctx, rearAxle, true);
        this._drawWheel(ctx, frontAxle, false);

        // 3. Key Local Anchor Points for Chassis
        const pRearBumperBot = bodyToScreen(-0.46, 0.16);
        const pRearDiffuserMid = bodyToScreen(-0.48, 0.38);
        const pRearBumperTop = bodyToScreen(-0.48, 0.62);
        const pRearSpoilerLip = bodyToScreen(-0.52, 0.74);
        const pTrunkRear = bodyToScreen(-0.36, 0.70);
        const pTrunkFront = bodyToScreen(0.20, 0.70);

        const pFastbackSlope = bodyToScreen(0.66, 1.25);
        const pRoofCrest = bodyToScreen(0.66 + (wb - 0.66) * 0.44, 1.23);
        const pWindshieldBase = bodyToScreen(0.66 + (wb - 0.66) * 0.68, 0.78);

        const pHoodMid = bodyToScreen(wb * 0.86, 0.68);
        const pFrontNoseTop = bodyToScreen(wb + 0.42, 0.54);
        const pFrontGrilleMid = bodyToScreen(wb + 0.44, 0.34);
        const pFrontSplitterTop = bodyToScreen(wb + 0.44, 0.16);
        const pFrontSplitterTip = bodyToScreen(wb + 0.49, 0.14);
        const pFrontSplitterBot = bodyToScreen(wb + 0.38, 0.14);

        const pFrontArchFront = bodyToScreen(wb + archR * 0.94, 0.16);
        const pFrontArchTop = bodyToScreen(wb, archR * 1.05);
        const pFrontArchRear = bodyToScreen(wb - archR * 0.94, 0.16);
        const pSideSkirtMid = bodyToScreen(wb * 0.48, 0.15);
        const pRearArchFront = bodyToScreen(archR * 0.94, 0.16);
        const pRearArchTop = bodyToScreen(0, archR * 1.05);
        const pRearArchRear = bodyToScreen(-archR * 0.94, 0.16);

        // 4. Aerodynamic High-Mount GT Rear Wing
        const pWingStrutA_Base = bodyToScreen(-0.32, 0.70);
        const pWingStrutA_Top = bodyToScreen(-0.44, 0.96);
        const pWingStrutB_Base = bodyToScreen(-0.16, 0.70);
        const pWingStrutB_Top = bodyToScreen(-0.24, 0.96);

        ctx.strokeStyle = '#1e252a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pWingStrutA_Base.x, pWingStrutA_Base.y);
        ctx.lineTo(pWingStrutA_Top.x, pWingStrutA_Top.y);
        ctx.moveTo(pWingStrutB_Base.x, pWingStrutB_Base.y);
        ctx.lineTo(pWingStrutB_Top.x, pWingStrutB_Top.y);
        ctx.stroke();

        const pWingBladeRear = bodyToScreen(-0.56, 0.98);
        const pWingBladeFront = bodyToScreen(-0.12, 0.96);
        const pWingBladeTop = bodyToScreen(-0.14, 1.02);
        const pWingBladeBackTop = bodyToScreen(-0.58, 1.05);

        ctx.fillStyle = '#181f24';
        ctx.strokeStyle = '#d32f2f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pWingBladeRear.x, pWingBladeRear.y);
        ctx.lineTo(pWingBladeFront.x, pWingBladeFront.y);
        ctx.lineTo(pWingBladeTop.x, pWingBladeTop.y);
        ctx.lineTo(pWingBladeBackTop.x, pWingBladeBackTop.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 5. Main Car Body Outer Shell
        const bodyGrad = ctx.createLinearGradient(
            pFastbackSlope.x, pFastbackSlope.y,
            pSideSkirtMid.x, pSideSkirtMid.y,
        );
        bodyGrad.addColorStop(0, '#ff6a5c');
        bodyGrad.addColorStop(0.18, '#eb2f38');
        bodyGrad.addColorStop(0.55, '#ba111e');
        bodyGrad.addColorStop(0.88, '#78060f');
        bodyGrad.addColorStop(1, '#3b0106');

        ctx.fillStyle = bodyGrad;
        ctx.strokeStyle = '#1d272d';
        ctx.lineWidth = 4.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pRearBumperBot.x, pRearBumperBot.y);
        ctx.lineTo(pRearDiffuserMid.x, pRearDiffuserMid.y);
        ctx.lineTo(pRearBumperTop.x, pRearBumperTop.y);
        ctx.lineTo(pRearSpoilerLip.x, pRearSpoilerLip.y);
        ctx.lineTo(pTrunkRear.x, pTrunkRear.y);
        ctx.lineTo(pTrunkFront.x, pTrunkFront.y);
        ctx.lineTo(pFastbackSlope.x, pFastbackSlope.y);
        ctx.lineTo(pRoofCrest.x, pRoofCrest.y);
        ctx.lineTo(pWindshieldBase.x, pWindshieldBase.y);
        ctx.lineTo(pHoodMid.x, pHoodMid.y);
        ctx.lineTo(pFrontNoseTop.x, pFrontNoseTop.y);
        ctx.lineTo(pFrontGrilleMid.x, pFrontGrilleMid.y);
        ctx.lineTo(pFrontSplitterTop.x, pFrontSplitterTop.y);
        ctx.lineTo(pFrontSplitterTip.x, pFrontSplitterTip.y);
        ctx.lineTo(pFrontSplitterBot.x, pFrontSplitterBot.y);
        ctx.lineTo(pFrontArchFront.x, pFrontArchFront.y);
        ctx.quadraticCurveTo(pFrontArchTop.x, pFrontArchTop.y, pFrontArchRear.x, pFrontArchRear.y);
        ctx.lineTo(pSideSkirtMid.x, pSideSkirtMid.y);
        ctx.lineTo(pRearArchFront.x, pRearArchFront.y);
        ctx.quadraticCurveTo(pRearArchTop.x, pRearArchTop.y, pRearArchRear.x, pRearArchRear.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 6. Lower Carbon Fiber Rocker & Front Chin Splitter
        ctx.fillStyle = '#1c242a';
        ctx.strokeStyle = '#0f1418';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pRearArchFront.x, pRearArchFront.y);
        ctx.lineTo(pSideSkirtMid.x, pSideSkirtMid.y + 4);
        ctx.lineTo(pFrontArchRear.x, pFrontArchRear.y);
        ctx.lineTo(pFrontArchRear.x, pFrontArchRear.y - 6);
        ctx.lineTo(pSideSkirtMid.x, pSideSkirtMid.y - 2);
        ctx.lineTo(pRearArchFront.x, pRearArchFront.y - 6);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 7. Gloss Racing Stripes along Body
        const stripeTopA = bodyToScreen(-0.35, 0.69);
        const stripeTopB = bodyToScreen(0.20, 0.69);
        const stripeTopC = bodyToScreen(0.66, 1.24);
        const stripeTopD = bodyToScreen(0.66 + (wb - 0.66) * 0.44, 1.22);
        const stripeTopE = bodyToScreen(0.66 + (wb - 0.66) * 0.68, 0.77);
        const stripeTopF = bodyToScreen(wb + 0.42, 0.53);

        ctx.strokeStyle = '#ffd84d';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(stripeTopA.x, stripeTopA.y);
        ctx.lineTo(stripeTopB.x, stripeTopB.y);
        ctx.moveTo(stripeTopC.x, stripeTopC.y);
        ctx.lineTo(stripeTopD.x, stripeTopD.y);
        ctx.moveTo(stripeTopE.x, stripeTopE.y);
        ctx.lineTo(stripeTopF.x, stripeTopF.y);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(stripeTopA.x, stripeTopA.y);
        ctx.lineTo(stripeTopB.x, stripeTopB.y);
        ctx.moveTo(stripeTopC.x, stripeTopC.y);
        ctx.lineTo(stripeTopD.x, stripeTopD.y);
        ctx.moveTo(stripeTopE.x, stripeTopE.y);
        ctx.lineTo(stripeTopF.x, stripeTopF.y);
        ctx.stroke();

        // Side rocker racing stripe
        const sideStripeA = bodyToScreen(archR * 0.98, 0.30);
        const sideStripeB = bodyToScreen(wb - archR * 0.98, 0.30);
        ctx.strokeStyle = '#ffd84d';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(sideStripeA.x, sideStripeA.y);
        ctx.lineTo(sideStripeB.x, sideStripeB.y);
        ctx.stroke();

        // 8. Supercharger Blower / Hood Scoop
        const scoopBaseX = 0.66 + (wb - 0.66) * 0.78;
        const pScoopBack = bodyToScreen(scoopBaseX - 0.16, 0.76);
        const pScoopTop = bodyToScreen(scoopBaseX, 0.94);
        const pScoopFront = bodyToScreen(scoopBaseX + 0.22, 0.92);
        const pScoopMouth = bodyToScreen(scoopBaseX + 0.22, 0.74);

        ctx.fillStyle = '#222b31';
        ctx.strokeStyle = '#9caab2';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pScoopBack.x, pScoopBack.y);
        ctx.lineTo(pScoopTop.x, pScoopTop.y);
        ctx.lineTo(pScoopFront.x, pScoopFront.y);
        ctx.lineTo(pScoopMouth.x, pScoopMouth.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const pScoopValveTop = bodyToScreen(scoopBaseX + 0.23, 0.88);
        const pScoopValveBot = bodyToScreen(scoopBaseX + 0.23, 0.78);
        ctx.strokeStyle = '#ff2b2b';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(pScoopValveTop.x, pScoopValveTop.y);
        ctx.lineTo(pScoopValveBot.x, pScoopValveBot.y);
        ctx.stroke();

        // 9. Cabin Glass, Roll Cage & Driver
        const pWinRearBot = bodyToScreen(0.48, 0.78);
        const pWinRearTop = bodyToScreen(0.72, 1.18);
        const pWinFrontTop = bodyToScreen(0.66 + (wb - 0.66) * 0.40, 1.16);
        const pWinFrontBot = bodyToScreen(0.66 + (wb - 0.66) * 0.62, 0.78);

        const winGrad = ctx.createLinearGradient(
            pWinRearTop.x, pWinRearTop.y,
            pWinFrontBot.x, pWinFrontBot.y,
        );
        winGrad.addColorStop(0, '#10222e');
        winGrad.addColorStop(0.4, '#3883a3');
        winGrad.addColorStop(0.85, '#95ebff');
        winGrad.addColorStop(1, '#dff8ff');

        ctx.fillStyle = winGrad;
        ctx.strokeStyle = '#18242b';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(pWinRearBot.x, pWinRearBot.y);
        ctx.lineTo(pWinRearTop.x, pWinRearTop.y);
        ctx.lineTo(pWinFrontTop.x, pWinFrontTop.y);
        ctx.lineTo(pWinFrontBot.x, pWinFrontBot.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Roll Cage Interior Tube
        const pCageA = bodyToScreen(0.60, 0.80);
        const pCageB = bodyToScreen(0.66 + (wb - 0.66) * 0.35, 1.14);
        ctx.strokeStyle = '#dce6ec';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pCageA.x, pCageA.y);
        ctx.lineTo(pCageB.x, pCageB.y);
        ctx.stroke();

        // Driver Figure
        const driverX = 0.66 + (wb - 0.66) * 0.22;
        const pDriverHead = bodyToScreen(driverX, 0.98);
        const pDriverVisor = bodyToScreen(driverX + 0.08, 0.98);
        const pSteeringWheel = bodyToScreen(driverX + 0.24, 0.86);

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#d32f2f';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pDriverHead.x, pDriverHead.y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1c242c';
        ctx.beginPath();
        ctx.arc(pDriverVisor.x, pDriverVisor.y, 6.5, -Math.PI * 0.45, Math.PI * 0.45);
        ctx.fill();

        ctx.strokeStyle = '#222c33';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(pSteeringWheel.x, pSteeringWheel.y, 7, -Math.PI * 0.8, Math.PI * 0.8);
        ctx.stroke();

        // B-Pillar divider
        const pPillarTop = bodyToScreen(0.66 + (wb - 0.66) * 0.28, 1.17);
        const pPillarBot = bodyToScreen(0.66 + (wb - 0.66) * 0.28, 0.78);
        ctx.strokeStyle = '#1d272d';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(pPillarTop.x, pPillarTop.y);
        ctx.lineTo(pPillarBot.x, pPillarBot.y);
        ctx.stroke();

        // Specular Shine Glare
        const pGlintA = bodyToScreen(0.72, 1.12);
        const pGlintB = bodyToScreen(0.66 + (wb - 0.66) * 0.50, 0.84);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(pGlintA.x, pGlintA.y);
        ctx.lineTo(pGlintB.x, pGlintB.y);
        ctx.stroke();

        // 10. Door Panel Seam, Roundel Decal & Chrome Handle
        const doorSeamTop = bodyToScreen(0.66 + (wb - 0.66) * 0.30, 0.77);
        const doorSeamBot = bodyToScreen(0.66 + (wb - 0.66) * 0.30, 0.22);
        ctx.strokeStyle = 'rgba(40, 6, 10, 0.65)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(doorSeamTop.x, doorSeamTop.y);
        ctx.lineTo(doorSeamBot.x, doorSeamBot.y);
        ctx.stroke();

        const pRoundel = bodyToScreen(wb * 0.44, 0.48);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffd84d';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(pRoundel.x, pRoundel.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1c242b';
        ctx.font = '900 13px Inter,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('77', pRoundel.x, pRoundel.y + 1);

        const pHandleA = bodyToScreen(0.66 + (wb - 0.66) * 0.14, 0.70);
        const pHandleB = bodyToScreen(0.66 + (wb - 0.66) * 0.24, 0.70);
        ctx.strokeStyle = '#eef3f7';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(pHandleA.x, pHandleA.y);
        ctx.lineTo(pHandleB.x, pHandleB.y);
        ctx.stroke();

        // 11. Headlights, Taillights & Front Light Beam
        const pHeadlight = bodyToScreen(wb + 0.38, 0.50);
        ctx.fillStyle = '#fffbc7';
        ctx.strokeStyle = '#ffd54f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pHeadlight.x, pHeadlight.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const pBeamEndTop = bodyToScreen(wb + 2.8, 0.85);
        const pBeamEndBot = bodyToScreen(wb + 2.8, 0.15);
        const beamGrad = ctx.createLinearGradient(
            pHeadlight.x, pHeadlight.y,
            pBeamEndBot.x, pBeamEndBot.y,
        );
        beamGrad.addColorStop(0, 'rgba(255, 252, 210, 0.45)');
        beamGrad.addColorStop(0.5, 'rgba(255, 245, 170, 0.18)');
        beamGrad.addColorStop(1, 'rgba(255, 240, 150, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(pHeadlight.x, pHeadlight.y);
        ctx.lineTo(pBeamEndTop.x, pBeamEndTop.y);
        ctx.lineTo(pBeamEndBot.x, pBeamEndBot.y);
        ctx.closePath();
        ctx.fill();

        const pTailA = bodyToScreen(-0.47, 0.58);
        const pTailB = bodyToScreen(-0.47, 0.44);
        ctx.strokeStyle = '#ff1c2f';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(pTailA.x, pTailA.y);
        ctx.lineTo(pTailB.x, pTailB.y);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 40, 60, 0.4)';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(pTailA.x, pTailA.y);
        ctx.lineTo(pTailB.x, pTailB.y);
        ctx.stroke();

        // 12. Exhaust System & Dynamic Throttle Flame / Smoke
        const pExhaustTip = bodyToScreen(-0.46, 0.28);
        ctx.fillStyle = '#9aa9b2';
        ctx.strokeStyle = '#222b31';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pExhaustTip.x, pExhaustTip.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#11171a';
        ctx.beginPath();
        ctx.arc(pExhaustTip.x, pExhaustTip.y, 3.2, 0, Math.PI * 2);
        ctx.fill();

        if (this.lastThrottle && this.phase !== 'done') {
            const time = performance.now() * 0.02;
            const flicker = 0.85 + 0.3 * Math.sin(time * 3.7) * Math.cos(time * 5.1);
            const flameLen = (0.75 + 0.35 * Math.sin(time * 2.3)) * flicker;

            const pFlameTip = bodyToScreen(-0.46 - flameLen, 0.28 + 0.03 * Math.sin(time * 4));
            const pFlameTop = bodyToScreen(-0.46 - flameLen * 0.35, 0.39);
            const pFlameBot = bodyToScreen(-0.46 - flameLen * 0.35, 0.17);

            const flameGrad = ctx.createLinearGradient(
                pExhaustTip.x, pExhaustTip.y,
                pFlameTip.x, pFlameTip.y,
            );
            flameGrad.addColorStop(0, '#ffffff');
            flameGrad.addColorStop(0.2, '#ffee55');
            flameGrad.addColorStop(0.55, '#ff6714');
            flameGrad.addColorStop(0.88, 'rgba(240, 30, 20, 0.85)');
            flameGrad.addColorStop(1, 'rgba(200, 10, 10, 0)');

            ctx.fillStyle = flameGrad;
            ctx.beginPath();
            ctx.moveTo(pExhaustTip.x, pExhaustTip.y - 6);
            ctx.quadraticCurveTo(pFlameTop.x, pFlameTop.y, pFlameTip.x, pFlameTip.y);
            ctx.quadraticCurveTo(pFlameBot.x, pFlameBot.y, pExhaustTip.x, pExhaustTip.y + 6);
            ctx.closePath();
            ctx.fill();

            const pCoreTip = bodyToScreen(-0.46 - flameLen * 0.52, 0.28);
            ctx.fillStyle = 'rgba(200, 245, 255, 0.92)';
            ctx.beginPath();
            ctx.moveTo(pExhaustTip.x, pExhaustTip.y - 3);
            ctx.lineTo(pCoreTip.x, pCoreTip.y);
            ctx.lineTo(pExhaustTip.x, pExhaustTip.y + 3);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#fff469';
            for (let i = 0; i < 4; i++) {
                const sparkDist = flameLen * (0.8 + i * 0.32);
                const sparkYOffset = 0.08 * Math.sin(time * 6 + i * 2.1);
                const pSpark = bodyToScreen(-0.46 - sparkDist, 0.28 + sparkYOffset);
                ctx.beginPath();
                ctx.arc(pSpark.x, pSpark.y, Math.max(1, 3.2 - i * 0.6), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    _drawHud(ctx, width) {
        ctx.fillStyle = 'rgba(244,252,246,.92)';
        ctx.strokeStyle = '#2f823a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(15, 15, Math.min(455, width - 30), 94, 14);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.fillStyle = '#27813a';
        ctx.font = '900 11px Inter,sans-serif';
        ctx.fillText('WHEELIE BALANCE', 29, 38);
        ctx.fillStyle = '#253b34';
        ctx.font = '900 23px Inter,sans-serif';
        ctx.fillText(`${this.distance.toFixed(2)} m`, 29, 67);
        ctx.fillStyle = '#5c7067';
        ctx.font = '700 12px Inter,sans-serif';
        const angle = Math.max(0, this._vehicleGeometry().relativePitch * 180 / Math.PI);
        const state = this.phase === 'crashing'
            ? (this.crashType === 'backward'
                ? `${angle.toFixed(1)}° · falling onto the rear body`
                : 'front tyre landed · suspension settling')
            : (this.hasLifted
                ? `${angle.toFixed(1)}° · ${this.wheelieTime.toFixed(1)} s`
                : 'Hold SPACE or LMB to lift the front');
        ctx.fillText(`${state} · best ${this.bestDistance.toFixed(2)} m`, 29, 91);
    }

    _drawOverlay(ctx, width, height) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.phase === 'countdown') {
            const number = Math.max(1, 3 - Math.floor(this.countdownElapsed / SIMULATION.countdownStepDuration));
            ctx.fillStyle = 'rgba(247,253,247,.94)';
            ctx.strokeStyle = '#2f823a';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, 54, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#27813a';
            ctx.font = '900 58px Inter,sans-serif';
            ctx.fillText(String(number), width / 2, height / 2 + 1);
            ctx.fillStyle = '#42574f';
            ctx.font = '700 13px Inter,sans-serif';
            ctx.fillText('Choose power and get ready', width / 2, height / 2 + 78);
        } else if (this.phase === 'running' && this.startFlashRemaining > 0) {
            ctx.fillStyle = '#27813a';
            ctx.font = '900 58px Inter,sans-serif';
            ctx.fillText('GO', width / 2, height / 2);
        } else if (this.phase === 'done') {
            ctx.fillStyle = 'rgba(27,74,48,.30)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#f5fbf5';
            ctx.strokeStyle = '#416d51';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(width / 2 - 215, height / 2 - 105, 430, 210, 18);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#d14237';
            ctx.font = '900 26px Inter,sans-serif';
            ctx.fillText('WHEELIE OVER', width / 2, height / 2 - 62);
            ctx.fillStyle = '#253b34';
            ctx.font = '900 35px Inter,sans-serif';
            ctx.fillText(`${this.distance.toFixed(2)} m`, width / 2, height / 2 - 15);
            ctx.fillStyle = '#5c7067';
            ctx.font = '700 13px Inter,sans-serif';
            ctx.fillText(this.endReason, width / 2, height / 2 + 21);
            ctx.fillText('Press SPACE or left mouse to try again', width / 2, height / 2 + 62);
        }
    }

    render() {
        const ctx = this.ctx;
        const renderScale = this._renderScale();
        const width = this._logicalWidth();
        const height = SIMULATION.logicalHeight;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
        this._drawBackground(ctx, width, height);
        this._drawCar(ctx);
        this._drawHud(ctx, width);
        this._drawOverlay(ctx, width, height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    onPause() {
        if (this.powerControl) this.powerControl.style.visibility = 'hidden';
    }

    onResume() {
        if (this.powerControl) this.powerControl.style.visibility = '';
    }

    onResize() {
        // Rendering changes; metre-based physics and scores do not.
    }

    destroy() {
        this._removePowerControl();
    }

    preparePauseSettings(settings) {
        validateWheelieSettings({ ...WHEELIE_DEFAULTS, ...(settings || {}) });
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        // enginePowerKw is intentionally absent: every live power choice shares
        // exactly the same record table, as requested.
        return { ...readWheelieParameters(settings) };
    }

    static getSettingsSchema() {
        const d = WHEELIE_DEFAULTS;
        return [
            { key: 'gravity', label: 'Gravity [m/s²]', type: 'range', min: 3, max: 20, step: 0.05, default: d.gravity, group: 'World' },
            { key: 'rollingResistance', label: 'Rolling-resistance coefficient', type: 'range', min: 0, max: 0.12, step: 0.001, default: d.rollingResistance, group: 'Road and tyres' },
            { key: 'tireFriction', label: 'Rear tyre friction coefficient', type: 'range', min: 0.15, max: 2.4, step: 0.01, default: d.tireFriction, group: 'Road and tyres' },
            { key: 'aerodynamicDrag', label: 'Aerodynamic drag [N·s²/m²]', type: 'range', min: 0, max: 2.5, step: 0.01, default: d.aerodynamicDrag, group: 'Road and tyres' },
            { key: 'meanTerrainAmplitude', label: 'Mean hill amplitude [m]', type: 'range', min: 0, max: 1.8, step: 0.01, default: d.meanTerrainAmplitude, group: 'Random terrain' },
            { key: 'terrainAmplitudeStdDev', label: 'Amplitude standard deviation [m]', type: 'range', min: 0, max: 0.9, step: 0.01, default: d.terrainAmplitudeStdDev, group: 'Random terrain' },
            { key: 'meanTerrainFwhm', label: 'Mean hill width, FWHM [m]', type: 'range', min: 4, max: 60, step: 0.5, default: d.meanTerrainFwhm, group: 'Random terrain' },
            { key: 'terrainFwhmStdDev', label: 'FWHM standard deviation [m]', type: 'range', min: 0, max: 24, step: 0.25, default: d.terrainFwhmStdDev, group: 'Random terrain' },
            { key: 'carMass', label: 'Car mass [kg]', type: 'range', min: 180, max: 2600, step: 10, default: d.carMass, group: 'Car geometry' },
            { key: 'wheelbase', label: 'Wheelbase [m]', type: 'range', min: 1.3, max: 4.2, step: 0.01, default: d.wheelbase, group: 'Car geometry' },
            { key: 'wheelRadius', label: 'Wheel radius [m]', type: 'range', min: 0.18, max: 0.65, step: 0.005, default: d.wheelRadius, group: 'Car geometry' },
            { key: 'comForwardFromRearAxle', label: 'COM ahead of rear axle [m]', type: 'range', min: 0.35, max: 2.5, step: 0.01, default: d.comForwardFromRearAxle, group: 'Car geometry' },
            { key: 'comHeightAboveRearAxle', label: 'COM above rear axle [m]', type: 'range', min: 0.15, max: 1.25, step: 0.01, default: d.comHeightAboveRearAxle, group: 'Car geometry' },
            { key: 'pitchInertiaFactor', label: 'Pitch inertia factor', type: 'range', min: 0.04, max: 0.5, step: 0.005, default: d.pitchInertiaFactor, group: 'Pitch dynamics' },
            { key: 'pitchDamping', label: 'Pitch damping [N·m·s/rad]', type: 'range', min: 0, max: 250, step: 1, default: d.pitchDamping, group: 'Pitch dynamics' },
            { key: 'drivelineEfficiency', label: 'Driveline efficiency', type: 'range', min: 0.35, max: 1, step: 0.01, default: d.drivelineEfficiency, group: 'Driveline' },
        ];
    }

    static getControlsSchema() {
        return [{
            action: 'throttle',
            label: 'Rear-wheel throttle',
            defaultBindings: [
                { type: 'keyboard', code: 'Space' },
                { type: 'mouse', code: 0 },
            ],
        }];
    }
}
