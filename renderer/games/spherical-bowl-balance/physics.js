export const BOWL_SHARED_DEFAULTS = Object.freeze({
    gravity: 9.81,
    bowlRadius: 2.35,
    maximumBowlAcceleration: 240,
    pointFrictionCoefficient: 0.075,
    pointViscousDamping: 0.20,
    marbleRadius: 0.18,
    staticFrictionCoefficient: 0.55,
    rollingFrictionCoefficient: 0.012,
    movementRange: 3.6,
    movementCircleRadius: 3.6,
    bowlTheta: Math.PI / 2,
    bandInnerFraction: 0.88,
    bandOuterFraction: 0.975,
});

export const BOWL_NUMERICS = Object.freeze({
    fixedTimeStep: 1 / 300,
    maximumSubsteps: 24,
    maximumFrameTime: 0.05,
    outsideToleranceTime: 0.045,
    kineticToStaticFrictionRatio: 0.82,
    contactVelocityEpsilon: 1e-5,
    releaseAngleTolerance: 2e-4,
    pointDiscRadiusFraction: 0.035,
    pointDiscThicknessFraction: 0.008,
    targetOffsetInBowlRadii: 2.4,
});

export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Date.now() >>> 0;
}

export function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

export function vec3(x = 0, y = 0, z = 0) { return { x, y, z }; }
export function add3(a, b) { return vec3(a.x + b.x, a.y + b.y, a.z + b.z); }
export function subtract3(a, b) { return vec3(a.x - b.x, a.y - b.y, a.z - b.z); }
export function scale3(a, factor) { return vec3(a.x * factor, a.y * factor, a.z * factor); }
export function dot3(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function cross3(a, b) {
    return vec3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
    );
}
export function length3(a) { return Math.hypot(a.x, a.y, a.z); }
export function normalize3(a, fallback = vec3(0, -1, 0)) {
    const magnitude = length3(a);
    return magnitude > 1e-12 ? scale3(a, 1 / magnitude) : { ...fallback };
}

export function tangentProjection(vector, normal) {
    return subtract3(vector, scale3(normal, dot3(vector, normal)));
}

export function surfacePolarAngle(position) {
    const radius = Math.max(1e-12, length3(position));
    return Math.acos(clamp(-position.y / radius, -1, 1));
}

export function surfaceRadialFraction(position) {
    const radius = Math.max(1e-12, length3(position));
    return Math.hypot(position.x, position.z) / radius;
}

export function outwardSurfaceDirection(position) {
    const horizontal = Math.hypot(position.x, position.z);
    if (horizontal < 1e-12) return vec3(1, 0, 0);
    const angle = surfacePolarAngle(position);
    return vec3(
        Math.cos(angle) * position.x / horizontal,
        Math.sin(angle),
        Math.cos(angle) * position.z / horizontal,
    );
}

export function shouldReleaseAtRim(state, bowlTheta) {
    if (bowlTheta <= BOWL_NUMERICS.releaseAngleTolerance) return true;
    const angle = surfacePolarAngle(state.position);
    const outward = outwardSurfaceDirection(state.position);
    return angle >= bowlTheta - BOWL_NUMERICS.releaseAngleTolerance
        && dot3(state.velocity, outward) > 0;
}

function projectSurfaceState(state, pathRadius) {
    const normal = normalize3(state.position);
    state.position = scale3(normal, pathRadius);
    state.velocity = tangentProjection(state.velocity, normal);
    return normal;
}

/** Point-like puck sliding on the inside of the translating spherical bowl. */
export function stepSlidingSurfaceBody(state, bowlAcceleration, parameters, dt) {
    const pathRadius = parameters.bowlRadius;
    const normal = normalize3(state.position);
    const effectiveWithoutDamping = vec3(
        -bowlAcceleration.x,
        -parameters.gravity,
        -bowlAcceleration.z,
    );
    let tangentAcceleration = tangentProjection(effectiveWithoutDamping, normal);
    tangentAcceleration = add3(
        tangentAcceleration,
        scale3(state.velocity, -parameters.pointViscousDamping),
    );
    const speed = length3(state.velocity);
    const normalAcceleration = Math.max(
        0,
        dot3(effectiveWithoutDamping, normal) + speed * speed / pathRadius,
    );
    const maximumFriction = parameters.pointFrictionCoefficient * normalAcceleration;
    if (speed > BOWL_NUMERICS.contactVelocityEpsilon) {
        const removableSpeed = maximumFriction * dt;
        const frictionAcceleration = Math.min(maximumFriction, speed / dt);
        tangentAcceleration = add3(
            tangentAcceleration,
            scale3(state.velocity, -frictionAcceleration / speed),
        );
        state.contactMode = removableSpeed >= speed ? 'sticking' : 'sliding';
    } else {
        const drive = length3(tangentAcceleration);
        if (drive <= maximumFriction) {
            tangentAcceleration = vec3();
            state.velocity = vec3();
            state.contactMode = 'sticking';
        } else {
            tangentAcceleration = add3(
                tangentAcceleration,
                scale3(normalize3(tangentAcceleration), -maximumFriction),
            );
            state.contactMode = 'sliding';
        }
    }
    state.velocity = add3(state.velocity, scale3(tangentAcceleration, dt));
    state.position = add3(state.position, scale3(state.velocity, dt));
    projectSurfaceState(state, pathRadius);
    state.normalAcceleration = normalAcceleration;
    state.slipSpeed = length3(state.velocity);
    return state;
}

/**
 * Solid sphere on the inside of a translating spherical bowl.
 * I = 2/5 m r². In the static regime the required contact friction is
 * (2/7)m|a_t| and the centre acceleration is (5/7)a_t. If that force exceeds
 * μ_s N, translation and angular velocity are integrated independently with
 * kinetic Coulomb friction opposing the contact-point slip velocity.
 */
export function stepRollingSurfaceBody(state, bowlAcceleration, parameters, dt) {
    const marbleRadius = parameters.marbleRadius;
    const pathRadius = parameters.bowlRadius - marbleRadius;
    const normal = normalize3(state.position);
    const effective = vec3(
        -bowlAcceleration.x,
        -parameters.gravity,
        -bowlAcceleration.z,
    );
    let drive = tangentProjection(effective, normal);
    const speed = length3(state.velocity);
    const normalAcceleration = Math.max(0, dot3(effective, normal) + speed * speed / pathRadius);
    if (speed > BOWL_NUMERICS.contactVelocityEpsilon) {
        drive = add3(
            drive,
            scale3(state.velocity, -parameters.rollingFrictionCoefficient * normalAcceleration / speed),
        );
    }

    const contactVelocity = add3(
        state.velocity,
        scale3(cross3(state.omega, normal), marbleRadius),
    );
    const slipSpeed = length3(contactVelocity);
    const requiredStaticAcceleration = (2 / 7) * length3(drive);
    const staticLimit = parameters.staticFrictionCoefficient * normalAcceleration;
    const canRoll = slipSpeed < 0.012 && requiredStaticAcceleration <= staticLimit;

    if (canRoll) {
        state.contactMode = 'rolling';
        state.velocity = add3(state.velocity, scale3(drive, (5 / 7) * dt));
        state.position = add3(state.position, scale3(state.velocity, dt));
        const nextNormal = projectSurfaceState(state, pathRadius);
        state.omega = scale3(cross3(nextNormal, state.velocity), -1 / marbleRadius);
    } else {
        state.contactMode = 'slipping';
        const kineticCoefficient = BOWL_NUMERICS.kineticToStaticFrictionRatio
            * parameters.staticFrictionCoefficient;
        let slipDirection;
        if (slipSpeed > BOWL_NUMERICS.contactVelocityEpsilon) {
            slipDirection = scale3(contactVelocity, 1 / slipSpeed);
        } else {
            slipDirection = normalize3(drive, vec3(1, 0, 0));
        }
        const frictionAcceleration = scale3(
            slipDirection,
            -kineticCoefficient * normalAcceleration,
        );
        state.velocity = add3(
            state.velocity,
            scale3(add3(drive, frictionAcceleration), dt),
        );
        const angularAcceleration = scale3(
            cross3(normal, frictionAcceleration),
            5 / (2 * marbleRadius),
        );
        state.omega = add3(state.omega, scale3(angularAcceleration, dt));
        state.position = add3(state.position, scale3(state.velocity, dt));
        projectSurfaceState(state, pathRadius);
    }
    state.normalAcceleration = normalAcceleration;
    state.slipSpeed = length3(add3(
        state.velocity,
        scale3(cross3(state.omega, normalize3(state.position)), marbleRadius),
    ));
    return state;
}

export function targetForSeed(seed, movementCircleRadius, bowlRadius, dimensions = 3) {
    const random = seededRandom(seed);
    const radius = movementCircleRadius + BOWL_NUMERICS.targetOffsetInBowlRadii * bowlRadius;
    if (dimensions === 2) {
        return { x: (random() < 0.5 ? -1 : 1) * radius, z: 0 };
    }
    const angle = random() * Math.PI * 2;
    return { x: radius * Math.cos(angle), z: radius * Math.sin(angle) };
}
