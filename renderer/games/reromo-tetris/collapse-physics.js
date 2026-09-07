import * as planck from './vendor/planck/dist/planck.mjs';
import { rockingOscillation } from './rocking-physics.js';

// The collapse solver is deliberately self-contained.  Planck uses SI-like
// units, so all positions below are metres and all velocities are metres per
// second (or radians per second).
export const COLLAPSE_NUMERICS = Object.freeze({
    stepSeconds: 1 / 240,
    // A render update may be delayed for a while when the window is
    // backgrounded.  Integrate those delays in small deterministic chunks so
    // one late frame cannot hand a compound fixture an enormous TOI step.
    maxFrameSeconds: 0.1,
    catchupCapSeconds: 0.1,
    maxSeconds: 8,
    velocityIterations: 12,
    positionIterations: 8,
    // One convex hull avoids false collisions on decomposition seams.
    platformArcStepRadians: 2 * Math.PI / 180,
    maximumPolygonVertices: 128,
    contactSlopMeters: 0.0001,
    // A large friction coefficient makes the polygon/ground contact solver
    // over-constrained and can turn a late positional correction into a kick.
    // The circular segment still has ample static friction at this value.
    groundFriction: 2,
    groundDepthMeters: 1,
    wallThicknessFraction: 0.08,
    minimumWallThicknessMeters: 0.002,
    minimumNormalForce: 1e-8,
    settledLinearSpeed: 1e-4,
    settledAngularSpeed: 1e-4,
    restSpeedCellsPerSecond: 0.005,
    restAngularSpeed: 0.005,
    minimumObservationSeconds: 2,
    settleHoldSeconds: 1,
    // No unconfigured drag: shared rocking must obey the same energy law
    // before and after the switch from statics to contact dynamics.
    postCollapseLinearDamping: 0,
    postCollapseAngularDamping: 0,
    maximumRollingNormalForceMultiplier: 3,
    orientationEpsilonRadians: 0.05,
    restitution: 0,
    energyToleranceRelative: 1e-10,
    zeroEpsilon: 1e-12,
    arcCategory: 2,
    groundCategory: 4,
});

export const COLLAPSE_DEFAULT_PHYSICS = Object.freeze({
    cellSizeMeters: 0.3,
    blockMassKg: 1,
    gravity: 9.81,
    pieceFriction: 0,
    wallFriction: 0,
    platformFriction: 0,
    walls: false,
});

function finiteNumber(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function positiveNumber(value, fallback, name) {
    const number = finiteNumber(value, fallback);
    if (!(number > 0)) throw new RangeError(`${name} must be positive.`);
    return number;
}

function nonNegativeNumber(value, fallback, name) {
    const number = finiteNumber(value, fallback);
    if (!(number >= 0)) throw new RangeError(`${name} must be non-negative.`);
    return number;
}

function vec(x = 0, y = 0) {
    return planck.Vec2(Number(x), Number(y));
}

function normalizePhysics(raw = {}) {
    const input = raw && typeof raw === 'object' ? raw : {};
    return {
        cellSizeMeters: positiveNumber(input.cellSizeMeters, COLLAPSE_DEFAULT_PHYSICS.cellSizeMeters, 'cellSizeMeters'),
        blockMassKg: positiveNumber(input.blockMassKg, COLLAPSE_DEFAULT_PHYSICS.blockMassKg, 'blockMassKg'),
        gravity: nonNegativeNumber(input.gravity, COLLAPSE_DEFAULT_PHYSICS.gravity, 'gravity'),
        pieceFriction: nonNegativeNumber(input.pieceFriction, COLLAPSE_DEFAULT_PHYSICS.pieceFriction, 'pieceFriction'),
        wallFriction: nonNegativeNumber(input.wallFriction, COLLAPSE_DEFAULT_PHYSICS.wallFriction, 'wallFriction'),
        platformFriction: nonNegativeNumber(input.platformFriction, COLLAPSE_DEFAULT_PHYSICS.platformFriction, 'platformFriction'),
        walls: input.walls === true,
    };
}

function normalizeRowsColumns(rows, columns) {
    const normalizedRows = Number(rows);
    const normalizedColumns = Number(columns);
    if (!Number.isInteger(normalizedRows) || normalizedRows <= 0) throw new RangeError('rows must be a positive integer.');
    if (!Number.isInteger(normalizedColumns) || normalizedColumns <= 0) throw new RangeError('columns must be a positive integer.');
    return { rows: normalizedRows, columns: normalizedColumns };
}

function isMissingBodyId(value) {
    return value === undefined || value === null || value === 0 || value === '';
}

function normalizeCell(raw, index) {
    if (!raw || typeof raw !== 'object') throw new TypeError(`cells[${index}] must be an object.`);
    const row = Number(raw.row);
    const column = Number(raw.column);
    if (!Number.isInteger(row) || !Number.isInteger(column)) {
        throw new TypeError(`cells[${index}] row and column must be integers.`);
    }
    return {
        row,
        column,
        value: raw.value,
        bodyId: isMissingBodyId(raw.bodyId) ? undefined : raw.bodyId,
        inputIndex: index,
    };
}

function generatedBodyId(usedIds, nextNumber) {
    while (usedIds.has(nextNumber.value)) nextNumber.value += 1;
    const id = nextNumber.value;
    nextNumber.value += 1;
    usedIds.add(id);
    return id;
}

/**
 * Group locked cells into rigid pieces.  A supplied bodyId is authoritative;
 * when a caller has no body IDs, four-neighbour components provide a useful
 * deterministic fallback and keep disconnected cells from becoming welded.
 */
function groupCells(rawCells) {
    const cells = (Array.isArray(rawCells) ? rawCells : []).map(normalizeCell);
    const groups = [];
    const explicit = new Map();
    const missing = [];
    const usedIds = new Set();
    let maximumNumericId = 0;

    for (const cell of cells) {
        if (cell.bodyId === undefined) {
            missing.push(cell);
            continue;
        }
        if (!explicit.has(cell.bodyId)) explicit.set(cell.bodyId, []);
        explicit.get(cell.bodyId).push(cell);
        usedIds.add(cell.bodyId);
        if (typeof cell.bodyId === 'number' && Number.isFinite(cell.bodyId)) {
            maximumNumericId = Math.max(maximumNumericId, Math.floor(cell.bodyId));
        }
    }
    for (const [id, members] of explicit) groups.push({ id, cells: members });

    const byCoordinate = new Map(missing.map(cell => [`${cell.row},${cell.column}`, cell]));
    const visited = new Set();
    const nextNumber = { value: Math.max(1, maximumNumericId + 1) };
    for (const seed of missing) {
        const seedKey = `${seed.row},${seed.column}`;
        if (visited.has(seedKey)) continue;
        const component = [];
        const queue = [seed];
        visited.add(seedKey);
        for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
            const current = queue[queueIndex];
            component.push(current);
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const neighbour = byCoordinate.get(`${current.row + dr},${current.column + dc}`);
                if (!neighbour) continue;
                const key = `${neighbour.row},${neighbour.column}`;
                if (visited.has(key)) continue;
                visited.add(key);
                queue.push(neighbour);
            }
        }
        groups.push({ id: generatedBodyId(usedIds, nextNumber), cells: component });
    }
    return groups;
}

function rotatePoint(point, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: c * point.x - s * point.y, y: s * point.x + c * point.y };
}

function transformPoint(position, angle, point) {
    const rotated = rotatePoint(point, angle);
    return { x: position.x + rotated.x, y: position.y + rotated.y };
}

function crossAngularVelocity(omega, point) {
    // Planck follows the ordinary right-handed x/y convention.  The game uses
    // positive y downwards as its screen convention, so gravity is positive;
    // this rigid-body cross product still follows Planck's angular convention.
    return { x: -omega * point.y, y: omega * point.x };
}

function rockingKinematics(shape, state) {
    const angle = state.angle;
    const omega = state.omega;
    const radius = shape.radius;
    const d = shape.d;
    return {
        x: radius * angle - d * Math.sin(angle) + (state.offsetX || 0),
        y: d * (Math.cos(angle) - 1) + (state.offsetY || 0),
        vx: (radius - d * Math.cos(angle)) * omega,
        vy: -d * Math.sin(angle) * omega,
    };
}

function normalizeRockingShape(shape) {
    if (!shape || typeof shape !== 'object') return null;
    const lengthMeters = positiveNumber(shape.lengthMeters, NaN, 'rockingShape.lengthMeters');
    const radius = positiveNumber(shape.radius, NaN, 'rockingShape.radius');
    const d = finiteNumber(shape.d, NaN);
    const halfAngle = positiveNumber(shape.halfAngle, NaN, 'rockingShape.halfAngle');
    const massKg = positiveNumber(shape.massKg, NaN, 'rockingShape.massKg');
    const centroidFromCircle = finiteNumber(shape.centroidFromCircle, NaN);
    const inertiaAtCom = positiveNumber(shape.inertiaAtCom, NaN, 'rockingShape.inertiaAtCom');
    if (!Number.isFinite(d) || !Number.isFinite(centroidFromCircle)) {
        throw new TypeError('rockingShape must be geometry returned by rockingGeometry.');
    }
    if (!(halfAngle > 0 && halfAngle <= Math.PI)) throw new RangeError('rockingShape.halfAngle is out of range.');
    return {
        lengthMeters,
        radius,
        d,
        halfAngle,
        massKg,
        centroidFromCircle,
        inertiaAtCom,
        sag: Number.isFinite(shape.sag) ? Number(shape.sag) : radius - d,
    };
}

function platformVertices(shape) {
    const requested = Math.ceil(2 * shape.halfAngle / COLLAPSE_NUMERICS.platformArcStepRadians);
    const count = Math.max(2, requested + requested % 2);
    return Array.from({ length: count + 1 }, (_, i) => {
        const angle = shape.halfAngle - 2 * shape.halfAngle * i / count;
        return vec(shape.radius * Math.sin(angle), shape.radius * Math.cos(angle) - shape.d);
    });
}

function setBodyMass(body, mass, center, inertiaAtOrigin) {
    body.setMassData({ mass, center: vec(center.x, center.y), I: inertiaAtOrigin });
}

function fixtureKind(fixture) {
    return fixture?.getUserData?.()?.kind || null;
}

function contactHasKinds(contact, kindA, kindB) {
    const a = fixtureKind(contact.getFixtureA());
    const b = fixtureKind(contact.getFixtureB());
    return (a === kindA && b === kindB) || (a === kindB && b === kindA);
}

function contactNormalImpulse(impulse) {
    return (impulse?.normalImpulses || []).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

/**
 * Create a physically simulated post-instability collapse.
 *
 * In rocking mode the neutral grid coordinates are carried onto the initial
 * platform transform.  This is what lets the first dynamic frame continue
 * the already moving render without a positional or velocity jump.  At the
 * neutral state (angle = 0) the resulting coordinates are exactly the
 * documented ((column + .5 - columns / 2) * s,
 * (row + .5 - rows) * s) centres.
 */
export function createCollapseSimulation({
    cells = [],
    rows,
    columns,
    physics: rawPhysics = {},
    rockingShape: rawRockingShape = null,
    rockingState: rawRockingState = {},
    rollingFriction: rawRollingFriction = 0,
    // Settling damping belongs to this post-collapse solver only.  The
    // ordinary rocking integrator remains conservative until a collapse has
    // actually been authorized by the game.
    settlingDamping = true,
    postCollapseDamping = settlingDamping,
    maxSeconds: rawMaxSeconds = COLLAPSE_NUMERICS.maxSeconds,
    stopWhenSettled = true,
} = {}) {
    const dimensions = normalizeRowsColumns(rows, columns);
    const physics = normalizePhysics(rawPhysics);
    const shape = normalizeRockingShape(rawRockingShape);
    const rocking = shape !== null;
    const rollingFriction = nonNegativeNumber(rawRollingFriction, 0, 'rollingFriction');
    const maxSeconds = rawMaxSeconds === null ? Infinity : positiveNumber(rawMaxSeconds, COLLAPSE_NUMERICS.maxSeconds, 'maxSeconds');
    let dampingEnabled = settlingDamping !== false && postCollapseDamping !== false;
    const state = {
        angle: finiteNumber(rawRockingState?.angle, 0),
        omega: finiteNumber(rawRockingState?.omega, 0),
        alpha: finiteNumber(rawRockingState?.alpha, 0),
        offsetX: finiteNumber(rawRockingState?.offsetX, 0),
        offsetY: finiteNumber(rawRockingState?.offsetY, 0),
    };
    const cellSize = physics.cellSizeMeters;
    const groups = groupCells(cells);
    // Planck otherwise truncates a polygon at its configured vertex limit.
    // These settings affect only our private vendored physics engine.
    planck.Settings.maxPolygonVertices = COLLAPSE_NUMERICS.maximumPolygonVertices;
    planck.Settings.linearSlop = COLLAPSE_NUMERICS.contactSlopMeters;
    planck.Settings.linearSleepTolerance = COLLAPSE_NUMERICS.settledLinearSpeed;
    planck.Settings.angularSleepTolerance = COLLAPSE_NUMERICS.settledAngularSpeed;
    const world = new planck.World({ gravity: vec(0, physics.gravity), continuousPhysics: false });
    world.setAllowSleeping(true);

    const postCollapseDampingDefinition = dampingEnabled ? {
        linearDamping: COLLAPSE_NUMERICS.postCollapseLinearDamping,
        angularDamping: COLLAPSE_NUMERICS.postCollapseAngularDamping,
    } : {
        linearDamping: 0,
        angularDamping: 0,
    };

    const pieceBodies = new Map();
    const pieceRecords = new Map();
    const allDynamicBodies = [];
    let platformBody = null;
    let groundBody = null;
    let floorBody = null;
    const platformPosition = rocking ? rockingKinematics(shape, state) : null;

    if (rocking) {
        platformBody = world.createBody({
            type: 'dynamic',
            position: vec(platformPosition.x, platformPosition.y),
            angle: state.angle,
            allowSleep: true,
            awake: true,
            ...postCollapseDampingDefinition,
            userData: { kind: 'platform' },
        });
        const vertices = platformVertices(shape);
        const hull = new planck.Polygon(vertices);
        if (hull.m_count !== vertices.length) throw new Error('Platform collision hull lost arc vertices.');
        const platformFixtures = [platformBody.createFixture(hull, {
            density: 0, friction: physics.platformFriction, restitution: COLLAPSE_NUMERICS.restitution,
            userData: { kind: 'platform', surface: 'hull' },
        })];
        // Exact circular contact with the ground while rolling on the arc.
        // The hull still collides with pieces; a full circle must never touch
        // those pieces above the deck. After tipping, the hull meets ground.
        platformBody.createFixture(new planck.Circle(vec(0, -shape.d), shape.radius), {
            density: 0, friction: COLLAPSE_NUMERICS.groundFriction, restitution: COLLAPSE_NUMERICS.restitution,
            filterCategoryBits: COLLAPSE_NUMERICS.arcCategory,
            filterMaskBits: COLLAPSE_NUMERICS.groundCategory,
            userData: { kind: 'platform', surface: 'arc' },
        });
        // The segment's exact analytic mass data is independent of the arc
        // tessellation used for collision detection.
        const platformComY = shape.centroidFromCircle - shape.d;
        const platformInertiaAtOrigin = shape.inertiaAtCom + shape.massKg * platformComY * platformComY;
        setBodyMass(platformBody, shape.massKg, { x: 0, y: platformComY }, platformInertiaAtOrigin);
        // Body.setLinearVelocity operates at the centre of mass, while the
        // rocking kinematics gives the velocity of the chord transform (the
        // body origin).  Convert the latter to the COM velocity before handing
        // it to Planck so both the platform pose and its material points have
        // the prescribed no-slip initial motion.
        const platformComOffsetWorld = rotatePoint({ x: 0, y: platformComY }, state.angle);
        const platformComSpinVelocity = crossAngularVelocity(state.omega, platformComOffsetWorld);
        platformBody.setLinearVelocity(vec(
            platformPosition.vx + platformComSpinVelocity.x,
            platformPosition.vy + platformComSpinVelocity.y,
        ));
        platformBody.setAngularVelocity(state.omega);
        platformBody.platformFixtures = platformFixtures;
        // Keep the singular alias for callers that used the earlier
        // diagnostic surface; all platform fixtures share the same body.
        platformBody.platformFixture = platformFixtures[0] || null;
        allDynamicBodies.push(platformBody);

        groundBody = world.createBody({ userData: { kind: 'ground' } });
        const groundSpan = Math.max(100, dimensions.columns * cellSize * 8, shape.radius * 8, Math.abs(platformPosition.x) + shape.radius * 4);
        groundBody.createFixture(new planck.Box(groundSpan, COLLAPSE_NUMERICS.groundDepthMeters / 2, vec(0, shape.sag + COLLAPSE_NUMERICS.groundDepthMeters / 2)), {
            density: 0,
            friction: COLLAPSE_NUMERICS.groundFriction,
            filterCategoryBits: COLLAPSE_NUMERICS.groundCategory,
            restitution: COLLAPSE_NUMERICS.restitution,
            userData: { kind: 'ground' },
        });
    } else {
        floorBody = world.createBody({ userData: { kind: 'floor' } });
        const halfWidth = dimensions.columns * cellSize / 2;
        floorBody.createFixture(new planck.Box(halfWidth, COLLAPSE_NUMERICS.groundDepthMeters / 2, vec(0, COLLAPSE_NUMERICS.groundDepthMeters / 2)), {
            density: 0,
            friction: physics.platformFriction,
            restitution: COLLAPSE_NUMERICS.restitution,
            userData: { kind: 'floor' },
        });
    }

    const wallThickness = Math.max(COLLAPSE_NUMERICS.minimumWallThicknessMeters, cellSize * COLLAPSE_NUMERICS.wallThicknessFraction);
    const createStaticWall = (x, side) => {
        const body = world.createBody({ userData: { kind: 'wall' } });
        body.createFixture(new planck.Box(wallThickness / 2, dimensions.rows * cellSize / 2,
            vec(x + side * wallThickness / 2, -dimensions.rows * cellSize / 2)), {
                density: 0,
                friction: physics.wallFriction,
                restitution: COLLAPSE_NUMERICS.restitution,
                userData: { kind: 'wall' },
            });
    };
    const createPlatformWall = (x, side) => {
        platformBody.createFixture(new planck.Box(wallThickness / 2, dimensions.rows * cellSize / 2,
            vec(x + side * wallThickness / 2, -dimensions.rows * cellSize / 2)), {
            density: 0,
            friction: physics.wallFriction,
            restitution: COLLAPSE_NUMERICS.restitution,
            userData: { kind: 'platform-wall' },
        });
    };
    if (physics.walls) {
        const halfWidth = dimensions.columns * cellSize / 2;
        if (rocking) {
            createPlatformWall(-halfWidth, -1);
            createPlatformWall(halfWidth, 1);
        } else {
            createStaticWall(-halfWidth, -1);
            createStaticWall(halfWidth, 1);
        }
    }

    const neutralCellCenter = cell => ({
        x: (cell.column + 0.5 - dimensions.columns / 2) * cellSize,
        y: (cell.row + 0.5 - dimensions.rows) * cellSize,
    });
    const initialWorldPoint = point => rocking
        ? transformPoint({ x: platformPosition.x, y: platformPosition.y }, state.angle, point)
        : point;

    for (const group of groups) {
        if (!group.cells.length) continue;
        const neutralCenters = group.cells.map(neutralCellCenter);
        const neutralCom = neutralCenters.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
        neutralCom.x /= neutralCenters.length;
        neutralCom.y /= neutralCenters.length;
        const worldCom = initialWorldPoint(neutralCom);
        const body = world.createBody({
            type: 'dynamic',
            position: vec(worldCom.x, worldCom.y),
            angle: rocking ? state.angle : 0,
            allowSleep: true,
            awake: true,
            // Cells are integrated at 240 Hz and are large compared with the
            // solver slop.  Continuous TOI on every compound piece makes
            // resting contacts re-enter the solver with a large corrective
            // impulse; discrete contacts are stable here and avoid that kick.
            bullet: false,
            ...postCollapseDampingDefinition,
            userData: { kind: 'piece', id: group.id },
        });
        let inertiaAtCom = 0;
        const records = [];
        for (let i = 0; i < group.cells.length; i++) {
            const cell = group.cells[i];
            const local = { x: neutralCenters[i].x - neutralCom.x, y: neutralCenters[i].y - neutralCom.y };
            body.createFixture(new planck.Box(cellSize / 2, cellSize / 2, vec(local.x, local.y)), {
                density: physics.blockMassKg / (cellSize * cellSize),
                friction: physics.pieceFriction,
                restitution: COLLAPSE_NUMERICS.restitution,
                userData: { kind: 'piece', id: group.id, row: cell.row, column: cell.column, value: cell.value },
            });
            inertiaAtCom += physics.blockMassKg * (local.x * local.x + local.y * local.y + cellSize * cellSize / 6);
            records.push({ x: local.x, y: local.y, value: cell.value, row: cell.row, column: cell.column });
        }
        setBodyMass(body, group.cells.length * physics.blockMassKg, { x: 0, y: 0 }, inertiaAtCom);
        if (rocking) {
            const velocity = platformBody.getLinearVelocityFromWorldPoint(vec(worldCom.x, worldCom.y));
            body.setLinearVelocity(velocity);
            body.setAngularVelocity(state.omega);
        }
        pieceBodies.set(group.id, body);
        pieceRecords.set(group.id, records);
        allDynamicBodies.push(body);
    }

    const groundContacts = new Set();
    let lastGroundNormalForce = 0;
    let lastGroundStepSeconds = COLLAPSE_NUMERICS.stepSeconds;
    let elapsed = 0;
    let quietSeconds = 0;
    let settled = allDynamicBodies.length === 0;
    let timedOut = false;
    const finished = () => timedOut || (stopWhenSettled && settled);

    world.on('pre-solve', contact => {
        const kinds = [fixtureKind(contact.getFixtureA()), fixtureKind(contact.getFixtureB())];
        const hasPiece = kinds.includes('piece');
        const hasPlatform = kinds.includes('platform');
        const hasPlatformWall = kinds.includes('platform-wall');
        const hasWall = kinds.includes('wall');
        const hasFloor = kinds.includes('floor');
        const hasGround = kinds.includes('ground');
        if (hasPlatform && hasGround) {
            const fixture = fixtureKind(contact.getFixtureA()) === 'platform' ? contact.getFixtureA() : contact.getFixtureB();
            const angle = Math.atan2(Math.sin(platformBody.getAngle()), Math.cos(platformBody.getAngle()));
            const onArc = Math.abs(angle) <= shape.halfAngle;
            contact.setEnabled((fixture.getUserData().surface === 'arc') === onArc);
            contact.setFriction(COLLAPSE_NUMERICS.groundFriction);
        }
        else if (hasPiece && (hasPlatformWall || hasWall)) contact.setFriction(physics.wallFriction);
        else if (hasPiece && (hasPlatform || hasFloor || hasGround)) contact.setFriction(physics.platformFriction);
        else if (hasPiece) contact.setFriction(physics.pieceFriction);
    });
    world.on('begin-contact', contact => {
        if (rocking && contactHasKinds(contact, 'platform', 'ground')) groundContacts.add(contact);
    });
    world.on('end-contact', contact => {
        groundContacts.delete(contact);
    });
    world.on('post-solve', (contact, impulse) => {
        if (rocking && contactHasKinds(contact, 'platform', 'ground')) {
            lastGroundNormalForce += contactNormalImpulse(impulse) / Math.max(lastGroundStepSeconds, COLLAPSE_NUMERICS.zeroEpsilon);
        }
    });

    function pruneGroundContacts() {
        for (const contact of groundContacts) if (!contact.isTouching()) groundContacts.delete(contact);
    }

    function estimatedGroundNormalForce() {
        if (!platformBody) return 0;
        // Before the first post-solve callback, use the current touching
        // contact island as a conservative estimate.  Once an impulse has
        // been reported, the measured normal load below supersedes it.
        const included = new Set([platformBody]);
        const adjacency = new Map();
        for (let contact = world.getContactList(); contact; contact = contact.getNext()) {
            if (!contact.isTouching() || !contact.isEnabled()) continue;
            const bodyA = contact.getFixtureA().getBody();
            const bodyB = contact.getFixtureB().getBody();
            if (!bodyA.isDynamic() && !bodyB.isDynamic()) continue;
            if (!adjacency.has(bodyA)) adjacency.set(bodyA, []);
            if (!adjacency.has(bodyB)) adjacency.set(bodyB, []);
            adjacency.get(bodyA).push(bodyB);
            adjacency.get(bodyB).push(bodyA);
        }
        const queue = [platformBody];
        for (let index = 0; index < queue.length; index++) {
            const body = queue[index];
            for (const neighbour of adjacency.get(body) || []) {
                if (!neighbour.isDynamic() || included.has(neighbour)) continue;
                included.add(neighbour);
                queue.push(neighbour);
            }
        }
        let mass = 0;
        for (const body of included) if (body.isDynamic()) mass += body.getMass();
        return mass * physics.gravity;
    }

    function applyRollingResistance(stepSeconds) {
        if (!platformBody || rollingFriction <= 0) return;
        pruneGroundContacts();
        if (!groundContacts.size) return;
        const omega = platformBody.getAngularVelocity();
        if (Math.abs(omega) <= COLLAPSE_NUMERICS.zeroEpsilon) return;
        const maximumNormalForce = Math.max(COLLAPSE_NUMERICS.minimumNormalForce,
            platformBody.getMass() * physics.gravity * COLLAPSE_NUMERICS.maximumRollingNormalForceMultiplier);
        // A post-solve impulse is an instantaneous collision response, not a
        // persistent load.  Feeding an unbounded impact impulse into rolling
        // resistance is a common source of a late angular kick, so only a
        // bounded load estimate may drive this torque.
        const normalForce = Math.min(maximumNormalForce, Math.max(COLLAPSE_NUMERICS.minimumNormalForce,
            lastGroundNormalForce || estimatedGroundNormalForce()));
        const coulombTorque = rollingFriction * normalForce * shape.radius;
        // Limit the final substep so the explicit Coulomb torque cannot
        // numerically reverse a nearly stopped body.  This is the discrete
        // equivalent of the static part of rolling resistance and prevents
        // artificial sign chatter around zero angular velocity.
        // Planck getInertia() is about the body's local origin (the deck),
        // whereas angular velocity integrates about the centre of mass.
        // Using deck inertia here overshoots zero and injects a reverse kick.
        const center = platformBody.getLocalCenter();
        const centerInertia = Math.max(0, platformBody.getInertia()
            - platformBody.getMass() * (center.x * center.x + center.y * center.y));
        const stopTorque = centerInertia * Math.abs(omega) / Math.max(stepSeconds, COLLAPSE_NUMERICS.zeroEpsilon);
        const torqueMagnitude = Math.min(coulombTorque, stopTorque);
        // A Coulomb rolling resistance is a torque, not an impulse or a
        // prescribed angle.  It therefore vanishes as soon as the body leaves
        // the ground and naturally leaves zero-friction motion undamped.
        platformBody.applyTorque(-Math.sign(omega) * torqueMagnitude);
    }

    function setSettlingDamping(enabled = true) {
        dampingEnabled = enabled === true;
        for (const body of allDynamicBodies) {
            body.setLinearDamping(dampingEnabled ? COLLAPSE_NUMERICS.postCollapseLinearDamping : 0);
            body.setAngularDamping(dampingEnabled ? COLLAPSE_NUMERICS.postCollapseAngularDamping : 0);
        }
        return dampingEnabled;
    }

    function kineticEnergy(body) {
        const velocity = body.getLinearVelocity(), center = body.getLocalCenter();
        const inertia = Math.max(0, body.getInertia() - body.getMass() * (center.x ** 2 + center.y ** 2));
        return (body.getMass() * (velocity.x ** 2 + velocity.y ** 2)
            + inertia * body.getAngularVelocity() ** 2) / 2;
    }

    // All external boundaries are stationary. Gravity is the only energy
    // source; friction and inelastic impacts can only dissipate energy.
    // Limit numerical contact work without limiting physical gravitational
    // acceleration or legitimate transfer of energy between touching bodies.
    const energyReference = allDynamicBodies.reduce((sum, body) => sum + body.getMass(), 0)
        * Math.max(physics.gravity * cellSize, COLLAPSE_NUMERICS.zeroEpsilon);
    let energyCeiling = allDynamicBodies.reduce((sum, body) => sum + kineticEnergy(body)
        - body.getMass() * physics.gravity * body.getWorldCenter().y, 0);
    function captureEnergy() {
        return allDynamicBodies.map(body => ({ x: body.getWorldCenter().x, y: body.getWorldCenter().y,
            angle: body.getAngle(), kinetic: kineticEnergy(body) }));
    }
    function removeNumericalContactEnergy(before, h) {
        let available = 0, actual = 0, potential = 0;
        for (let i = 0; i < allDynamicBodies.length; i++) {
            const body = allDynamicBodies[i];
            // Position projection separates overlapping contact skins; it is
            // not physical work. Charging that upward correction to kinetic
            // energy creates a permanent energy debt and freezes real falls.
            const integratedDrop = h * body.getLinearVelocity().y;
            const projectedDrop = body.getWorldCenter().y - before[i].y - integratedDrop;
            energyCeiling -= body.getMass() * physics.gravity * projectedDrop;
            available += before[i].kinetic + body.getMass() * physics.gravity * integratedDrop;
            actual += kineticEnergy(body);
            potential -= body.getMass() * physics.gravity * body.getWorldCenter().y;
        }
        // The ceiling follows the corrected geometry, but permits no kinetic
        // contact kick beyond gravity's work during the integrated motion.
        const allowed = Math.max(0, Math.min(available, energyCeiling - potential))
            + energyReference * COLLAPSE_NUMERICS.energyToleranceRelative;
        energyCeiling = Math.min(energyCeiling, potential + Math.min(actual, allowed));
        if (actual <= allowed || actual <= COLLAPSE_NUMERICS.zeroEpsilon) return;
        const scale = Math.sqrt(allowed / actual);
        for (const body of allDynamicBodies) {
            const velocity = body.getLinearVelocity();
            body.setLinearVelocity(vec(velocity.x * scale, velocity.y * scale));
            body.setAngularVelocity(body.getAngularVelocity() * scale);
        }
    }

    function step(stepSeconds) {
        // `step` is the render-facing boundary.  It may receive a delayed
        // frame, but integration is always split at the catch-up cap and can
        // never continue beyond the finite collapse budget.
        let remaining = Math.max(0, finiteNumber(stepSeconds, 0));
        if (remaining === 0) {
            if (!finished()) world.step(0, COLLAPSE_NUMERICS.velocityIterations, COLLAPSE_NUMERICS.positionIterations);
            return snapshot();
        }
        if (finished()) return snapshot();
        while (remaining > COLLAPSE_NUMERICS.zeroEpsilon && !finished()) {
            const available = maxSeconds - elapsed;
            if (available <= COLLAPSE_NUMERICS.zeroEpsilon) {
                timedOut = true;
                break;
            }
            // Keep a long caller update deterministic and numerically tame,
            // while still advancing the full requested duration in bounded
            // catch-up chunks.  This preserves existing callers that pass a
            // multi-second diagnostic interval while preventing one giant
            // physics step.
            const frame = Math.min(remaining, COLLAPSE_NUMERICS.catchupCapSeconds, available);
            let frameRemaining = frame;
            while (frameRemaining > COLLAPSE_NUMERICS.zeroEpsilon && !finished()) {
                const h = Math.min(frameRemaining, COLLAPSE_NUMERICS.stepSeconds, maxSeconds - elapsed);
                if (h <= COLLAPSE_NUMERICS.zeroEpsilon) {
                    timedOut = true;
                    break;
                }
                applyRollingResistance(h);
                lastGroundNormalForce = 0;
                lastGroundStepSeconds = h;
                const energyBefore = captureEnergy();
                world.step(h, COLLAPSE_NUMERICS.velocityIterations, COLLAPSE_NUMERICS.positionIterations);
                // Observe the solver's motion BEFORE the energy safeguard
                // changes velocities. Numerical braking is not evidence of rest.
                const moving = allDynamicBodies.some((body, index) => {
                    const before = energyBefore[index], center = body.getWorldCenter(), velocity = body.getLinearVelocity();
                    const linearLimit = physics.cellSizeMeters * COLLAPSE_NUMERICS.restSpeedCellsPerSecond;
                    return Math.hypot(velocity.x, velocity.y) > linearLimit
                        || Math.abs(body.getAngularVelocity()) > COLLAPSE_NUMERICS.restAngularSpeed
                        || Math.hypot(center.x - before.x, center.y - before.y) > linearLimit * h
                        || Math.abs(body.getAngle() - before.angle) > COLLAPSE_NUMERICS.restAngularSpeed * h;
                });
                removeNumericalContactEnergy(energyBefore, h);
                elapsed = Math.min(maxSeconds, elapsed + h);
                const touching = new Set();
                for (let contact = world.getContactList(); contact; contact = contact.getNext()) {
                    if (!contact.isTouching() || !contact.isEnabled()) continue;
                    touching.add(contact.getFixtureA().getBody()); touching.add(contact.getFixtureB().getBody());
                }
                quietSeconds = !moving && (allDynamicBodies.length === 0 || allDynamicBodies.every(body => bodyIsSettled(body, touching)))
                    ? quietSeconds + h : 0;
                settled = allDynamicBodies.length === 0 || (elapsed >= COLLAPSE_NUMERICS.minimumObservationSeconds
                    && quietSeconds >= COLLAPSE_NUMERICS.settleHoldSeconds);
                frameRemaining -= h;
                if (!settled && elapsed >= maxSeconds - COLLAPSE_NUMERICS.zeroEpsilon) timedOut = true;
            }
            remaining -= frame;
        }
        return snapshot();
    }

    function collectContactData() {
        const contacts = [];
        const touchingBodies = new Set();
        const seen = new Set();
        for (let contact = world.getContactList(); contact; contact = contact.getNext()) {
            if (!contact.isTouching() || !contact.isEnabled()) continue;
            touchingBodies.add(contact.getFixtureA().getBody());
            touchingBodies.add(contact.getFixtureB().getBody());
            const manifold = contact.getWorldManifold(null);
            if (!manifold || !manifold.pointCount) continue;
            for (let i = 0; i < manifold.pointCount; i++) {
                const point = manifold.points[i];
                const key = `${point.x.toPrecision(15)},${point.y.toPrecision(15)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                contacts.push({ x: point.x, y: point.y });
            }
        }
        return { contacts, touchingBodies };
    }

    function bodyIsSettled(body, touchingBodies) {
        // Sleeping is a solver result, but retain the contact guard for awake
        // bodies so a free-falling body at a numerical apex is not mistaken
        // for a resting stack.  A sleeping body is accepted because Planck
        // only sleeps after its own stable-time test.
        if (!body.isAwake()) return true;
        // The initial state is intentionally allowed to be an unstable
        // touching configuration (for example, a three-cell overhang).  It
        // must receive at least one real integration step before a zero
        // velocity can be interpreted as a settled result.
        if (elapsed <= COLLAPSE_NUMERICS.zeroEpsilon) return false;
        const velocity = body.getLinearVelocity();
        const restLinearSpeed = Math.max(COLLAPSE_NUMERICS.settledLinearSpeed,
            physics.cellSizeMeters * COLLAPSE_NUMERICS.restSpeedCellsPerSecond);
        if (Math.hypot(velocity.x, velocity.y) > restLinearSpeed) return false;
        if (Math.abs(body.getAngularVelocity()) > Math.max(COLLAPSE_NUMERICS.settledAngularSpeed,
            COLLAPSE_NUMERICS.restAngularSpeed)) return false;
        // A very slow unsupported body can be at the apex of a free fall.  It
        // is not settled until it has a real contact or Planck has put it to
        // sleep.  This also keeps small but persistent zero-friction slides
        // from being declared done merely because a time limit elapsed.
        return touchingBodies.has(body);
    }

    function snapshot() {
        const contactData = collectContactData();
        let oscillation = null;
        if (platformBody) {
            let mass = 0, sx = 0, sy = 0, inertiaAtCircle = 0;
            for (const body of allDynamicBodies) {
                const m = body.getMass(), center = platformBody.getLocalPoint(body.getWorldCenter());
                const localCom = body.getLocalCenter(), y = center.y + shape.d;
                mass += m; sx += m * center.x; sy += m * y;
                inertiaAtCircle += body.getInertia() - m * (localCom.x ** 2 + localCom.y ** 2)
                    + m * (center.x ** 2 + y ** 2);
            }
            oscillation = rockingOscillation({ mass, comX: sx / mass, comY: sy / mass,
                inertiaAtCircle, radius: shape.radius }, physics.gravity);
        }
        const bodySnapshots = [];
        for (const group of groups) {
            const body = pieceBodies.get(group.id);
            if (!body) continue;
            const position = body.getPosition();
            const velocity = body.getLinearVelocity();
            const records = pieceRecords.get(group.id) || [];
            bodySnapshots.push({
                id: group.id,
                x: position.x,
                y: position.y,
                angle: body.getAngle(),
                vx: velocity.x,
                vy: velocity.y,
                omega: body.getAngularVelocity(),
                cells: records.map(record => ({ x: record.x, y: record.y, value: record.value })),
            });
        }
        const platformSnapshot = platformBody ? (() => {
            const position = platformBody.getPosition();
            const velocity = platformBody.getLinearVelocity();
            return {
                x: position.x,
                y: position.y,
                angle: platformBody.getAngle(),
                vx: velocity.x,
                vy: velocity.y,
                omega: platformBody.getAngularVelocity(),
            };
        })() : null;
        return {
            bodies: bodySnapshots,
            platform: platformSnapshot,
            oscillation,
            settled,
            quietSeconds,
            timedOut,
            hasRestContacts: allDynamicBodies.every(body => !body.isAwake() || contactData.touchingBodies.has(body)),
            elapsed,
            maxSeconds,
            contacts: contactData.contacts,
        };
    }

    // A zero-length update creates initial touching contacts without advancing
    // the simulation, which makes snapshot() useful immediately after setup.
    world.step(0, COLLAPSE_NUMERICS.velocityIterations, COLLAPSE_NUMERICS.positionIterations);

    return {
        step,
        snapshot,
        contactPoints: () => collectContactData().contacts,
        world,
        pieceBodies,
        // `bodies` is a small compatibility convenience for diagnostics and
        // tests; rendering should consume snapshot() instead.
        bodies: pieceBodies,
        platformBody,
        platformFixtures: platformBody?.platformFixtures || [],
        groundBody,
        floorBody,
        physics,
        rockingShape: shape,
        maxSeconds,
        setSettlingDamping,
        get settlingDamping() { return dampingEnabled; },
    };
}

export default createCollapseSimulation;
