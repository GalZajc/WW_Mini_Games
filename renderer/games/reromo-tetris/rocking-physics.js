export const ROCKING_DEFAULTS = Object.freeze({
    lengthCells: 10, arcDegrees: 60, massKg: 20, rollingFriction: 0,
    allowOverhang: false, collapseMassKg: 20,
});
export const ROCKING_NUMERICS = Object.freeze({ stepSeconds: 1 / 240, maxFrameSeconds: 0.1, restEpsilon: 1e-10,
    viewAngleSamples: 64, viewArcSamples: 24, viewPaddingCells: 1.5 });

export function rockingViewBounds(shape, rows, columns, metersPerCell) {
    const points = [[-columns / 2, -rows], [columns / 2, -rows], [-columns / 2, 0], [columns / 2, 0]];
    for (let i = 0; i <= ROCKING_NUMERICS.viewArcSamples; i++) {
        const a = -shape.halfAngle + 2 * shape.halfAngle * i / ROCKING_NUMERICS.viewArcSamples;
        points.push([shape.radius * Math.sin(a) / metersPerCell, (shape.radius * Math.cos(a) - shape.d) / metersPerCell]);
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i <= ROCKING_NUMERICS.viewAngleSamples; i++) {
        const angle = -shape.halfAngle + 2 * shape.halfAngle * i / ROCKING_NUMERICS.viewAngleSamples;
        const offset = rockingKinematics(shape, { angle, omega: 0, alpha: 0 });
        for (const [x, y] of points) {
            const px = offset.x / metersPerCell + x * Math.cos(angle) - y * Math.sin(angle);
            const py = offset.y / metersPerCell + x * Math.sin(angle) + y * Math.cos(angle);
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        }
    }
    const pad = ROCKING_NUMERICS.viewPaddingCells;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
}

// Uniform circular segment: chord is the deck; the minor arc rolls on the ground.
export function rockingGeometry(lengthMeters, arcDegrees, massKg) {
    const halfAngle = arcDegrees * Math.PI / 360;
    const radius = lengthMeters / (2 * Math.sin(halfAngle));
    const a = lengthMeters / 2, d = radius * Math.cos(halfAngle);
    const area = radius ** 2 * (halfAngle - Math.sin(halfAngle) * Math.cos(halfAngle));
    const centroidFromCircle = 2 * a ** 3 / (3 * area);
    const polarAreaMoment = radius ** 4 * halfAngle / 2 - a * d * (a * a + 3 * d * d) / 6;
    return { lengthMeters, halfAngle, radius, d, sag: radius - d, massKg,
        centroidFromCircle, inertiaAtCom: massKg * (polarAreaMoment / area - centroidFromCircle ** 2) };
}

export function rockingAssembly(geometry, cells, rows, columns, physics) {
    const { radius, massKg, centroidFromCircle, inertiaAtCom } = geometry;
    let mass = massKg, sx = 0, sy = massKg * centroidFromCircle;
    let inertiaAtCircle = inertiaAtCom + massKg * centroidFromCircle ** 2;
    for (const cell of cells) {
        const x = (cell.column + 0.5 - columns / 2) * physics.cellSizeMeters;
        const y = geometry.d + (cell.row + 0.5 - rows) * physics.cellSizeMeters;
        const m = physics.blockMassKg;
        mass += m; sx += m * x; sy += m * y;
        inertiaAtCircle += m * (x * x + y * y + physics.cellSizeMeters ** 2 / 6);
    }
    return { mass, comX: sx / mass, comY: sy / mass, inertiaAtCircle, radius };
}

export function rockingKinematics(geometry, state) {
    const { radius: r, d } = geometry, { angle: t, omega: w, alpha: a } = state;
    return {
        x: r * t - d * Math.sin(t) + (state.offsetX || 0), y: d * (Math.cos(t) - 1) + (state.offsetY || 0),
        ax: (r - d * Math.cos(t)) * a + d * Math.sin(t) * w * w,
        ay: -d * Math.sin(t) * a - d * Math.cos(t) * w * w,
    };
}

export function rockingAcceleration(assembly, angle, omega, gravity, rollingFriction) {
    const { mass: m, radius: r, comX: x, comY: y, inertiaAtCircle } = assembly;
    const arm = x * Math.cos(angle) - y * Math.sin(angle);
    const inertia = inertiaAtCircle + m * r * r - 2 * m * r * (x * Math.sin(angle) + y * Math.cos(angle));
    // Lagrange equation for no-slip rolling: K a + K' w²/2 = gravity torque.
    const drive = m * (gravity + r * omega * omega) * arm;
    const resistance = rollingFriction * m * gravity * r;
    if (Math.abs(omega) < ROCKING_NUMERICS.restEpsilon && Math.abs(drive) <= resistance) return 0;
    const torque = drive - resistance * (Math.sign(omega) || Math.sign(drive));
    return torque / Math.max(inertia, ROCKING_NUMERICS.restEpsilon);
}

// U = -m g (x sin(theta) + y cos(theta)); T = K(theta) omega²/2.
// The curvature at the stable equilibrium gives a reference half-period.
export function rockingOscillation(assembly, gravity) {
    const { mass: m, radius: r, comX: x, comY: y, inertiaAtCircle } = assembly;
    const distance = Math.hypot(x, y);
    const inertia = inertiaAtCircle + m * r * r - 2 * m * r * distance;
    return { equilibriumAngle: Math.atan2(x, y),
        halfPeriod: gravity > 0 && distance > 0 && inertia > 0
            ? Math.PI * Math.sqrt(inertia / (m * gravity * distance)) : null };
}

// Exact effective load in the grid frame (x right, y down). The reference
// point translates with acceleration A and rotates with omega and alpha.
// F/m = R(-theta) (g_world - A) - alpha J r + omega² r.
// Summing this affine field over squares gives the COM force and -I alpha.
export function gridFrameLoad(mass, inertia, x, y, gravity, frame = {}) {
    const { angle = 0, omega = 0, alpha = 0, ax = 0, ay = 0 } = frame;
    const c = Math.cos(angle), s = Math.sin(angle);
    return { fx: mass * (gravity * s - ax * c - ay * s + alpha * y + omega * omega * x),
        fy: mass * (gravity * c + ax * s - ay * c - alpha * x + omega * omega * y),
        torque: -inertia * alpha };
}

export function stepRocking(state, geometry, assembly, physics, rollingFriction, dt) {
    let remaining = Math.max(0, Math.min(dt, ROCKING_NUMERICS.maxFrameSeconds));
    while (remaining > 0) {
        const h = Math.min(remaining, ROCKING_NUMERICS.stepSeconds);
        const previous = state.omega;
        const acceleration = (angle, omega) => rockingAcceleration(assembly, angle, omega, physics.gravity, rollingFriction);
        const a1 = acceleration(state.angle, previous);
        // Resolve the Coulomb stopping event before RK4 samples the other
        // side of the velocity discontinuity. Otherwise its stages can keep
        // flipping friction and converge to a tiny, never-stopping chatter.
        const stopTime = previous * a1 < 0 ? -previous / a1 : Infinity;
        if (rollingFriction > 0 && stopTime <= h &&
            acceleration(state.angle + previous * stopTime / 2, 0) === 0) {
            state.angle += previous * stopTime / 2;
            state.omega = 0;
            if (Math.abs(state.angle) >= geometry.halfAngle) {
                state.angle = Math.sign(state.angle) * geometry.halfAngle; state.tipped = true; break;
            }
            remaining -= h;
            continue;
        }
        const w2 = previous + a1 * h / 2, a2 = acceleration(state.angle + previous * h / 2, w2);
        const w3 = previous + a2 * h / 2, a3 = acceleration(state.angle + w2 * h / 2, w3);
        const w4 = previous + a3 * h, a4 = acceleration(state.angle + w3 * h, w4);
        state.omega += h * (a1 + 2 * a2 + 2 * a3 + a4) / 6;
        if (rollingFriction > 0 && previous * state.omega < 0 &&
            rockingAcceleration(assembly, state.angle, 0, physics.gravity, rollingFriction) === 0) state.omega = 0;
        state.angle += state.omega === 0 ? 0 : h * (previous + 2 * w2 + 2 * w3 + w4) / 6;
        if (Math.abs(state.angle) >= geometry.halfAngle) {
            state.angle = Math.sign(state.angle) * geometry.halfAngle;
            state.tipped = true;
            break;
        }
        remaining -= h;
    }
    state.alpha = rockingAcceleration(assembly, state.angle, state.omega, physics.gravity, rollingFriction);
    return state;
}

export function rowsToCollapse(cells, rows, columns, mode, blockMassKg, thresholdKg) {
    const counts = new Int32Array(rows);
    for (const cell of cells) if (cell.row >= 0 && cell.row < rows) counts[cell.row]++;
    const result = [];
    let massAbove = 0;
    for (let row = 0; row < rows; row++) {
        if (mode === 'rocking-pressure' ? counts[row] > 0 && massAbove >= thresholdKg : counts[row] >= columns) result.push(row);
        massAbove += counts[row] * blockMassKg;
    }
    return result;
}
