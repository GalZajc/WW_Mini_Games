import { structuralSolver, STRUCTURAL_SOLVER_OPTIONS } from './structural-solver.js';
import { gridFrameLoad } from './rocking-physics.js';
import { StructuralReactionCache } from './structural-reaction-cache.js';
const reactionCache = new StructuralReactionCache();
const EPSILON = 1e-9;
const EQUILIBRIUM_RELATIVE_TOLERANCE = 1e-8;

// All physical parameters for Structural Cartesian live here. Settings expose
// these values, while the solver and animation consume the normalized result.
export const STRUCTURAL_PHYSICS_DEFAULTS = Object.freeze({
    cellSizeMeters: 0.3,
    blockMassKg: 1,
    gravity: 9.81,
    pieceFriction: 0,
    platformFriction: 0,
    wallFriction: 0,
    stabilityMarginCells: 0,
    toppleDampingPerSecond: 0.35,
    toppleInitialAngularSpeed: 0.08,
    toppleGameOverAngleDegrees: 72,
    toppleMaximumSeconds: 3,
});

function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function normalizeStructuralPhysics(raw = {}) {
    const defaults = STRUCTURAL_PHYSICS_DEFAULTS;
    return {
        cellSizeMeters: finite(raw.cellSizeMeters, defaults.cellSizeMeters),
        blockMassKg: finite(raw.blockMassKg, defaults.blockMassKg),
        gravity: finite(raw.gravity, defaults.gravity),
        pieceFriction: Math.max(0, finite(raw.pieceFriction, defaults.pieceFriction)),
        platformFriction: Math.max(0, finite(raw.platformFriction, defaults.platformFriction)),
        wallFriction: Math.max(0, finite(raw.wallFriction, defaults.wallFriction)),
        walls: Boolean(raw.walls), frame: raw.frame || null,
        floorMinColumn: finite(raw.floorMinColumn, 0),
        floorMaxColumn: finite(raw.floorMaxColumn, Infinity),
        // Legacy settings must never shrink real contact patches.
        stabilityMarginCells: 0,
        toppleDampingPerSecond: finite(raw.toppleDampingPerSecond, defaults.toppleDampingPerSecond),
        toppleInitialAngularSpeed: finite(raw.toppleInitialAngularSpeed, defaults.toppleInitialAngularSpeed),
        toppleGameOverAngleDegrees: finite(raw.toppleGameOverAngleDegrees, defaults.toppleGameOverAngleDegrees),
        toppleMaximumSeconds: finite(raw.toppleMaximumSeconds, defaults.toppleMaximumSeconds),
    };
}

function bodyMapFromGrid(bodyGrid) {
    const bodies = new Map();
    for (let row = 0; row < bodyGrid.length; row++) {
        for (let column = 0; column < bodyGrid[row].length; column++) {
            const id = Number(bodyGrid[row][column]) || 0;
            if (!id) continue;
            if (!bodies.has(id)) bodies.set(id, { id, cells: [] });
            bodies.get(id).cells.push({ row, column, x: column + 0.5, y: row + 0.5 });
        }
    }
    return bodies;
}

function supportContacts(bodyGrid, bodies) {
    const rows = bodyGrid.length;
    const contacts = [];
    for (const body of bodies.values()) {
        for (const cell of body.cells) {
            const belowRow = cell.row + 1;
            const lower = belowRow >= rows ? 0 : (Number(bodyGrid[belowRow][cell.column]) || 0);
            if (belowRow < rows && (!lower || lower === body.id)) continue;
            contacts.push({
                upperBody: body.id,
                lowerBody: lower,
                x0: cell.column,
                x1: cell.column + 1,
                x: cell.column + 0.5,
                y: cell.row + 1,
                floor: lower === 0,
            });
        }
    }
    return contacts;
}

function stronglyConnectedComponents(bodyIds, adjacency) {
    // Iterative Kosaraju avoids call-stack overflow on large/custom boards.
    const reverse = new Map(bodyIds.map(id => [id, []]));
    for (const [id, neighbors] of adjacency) for (const next of neighbors) reverse.get(next).push(id);
    const seen = new Set(), order = [];
    for (const root of bodyIds) {
        if (seen.has(root)) continue;
        seen.add(root);
        const stack = [[root, adjacency.get(root).values()]];
        while (stack.length) {
            const [id, iterator] = stack[stack.length - 1];
            const next = iterator.next();
            if (next.done) { order.push(id); stack.pop(); continue; }
            if (!seen.has(next.value)) {
                seen.add(next.value);
                stack.push([next.value, adjacency.get(next.value).values()]);
            }
        }
    }
    seen.clear();
    const components = [];
    for (let i = order.length - 1; i >= 0; i--) {
        const root = order[i];
        if (seen.has(root)) continue;
        const component = [], stack = [root];
        seen.add(root);
        while (stack.length) {
            const id = stack.pop(); component.push(id);
            for (const next of reverse.get(id)) if (!seen.has(next)) {
                seen.add(next); stack.push(next);
            }
        }
        components.push(component);
    }
    return components;
}

function addPointLoad(loads, groupId, forceN, x, fromGroup) {
    if (!(forceN > EPSILON) || groupId === -1) return;
    if (!loads.has(groupId)) loads.set(groupId, []);
    loads.get(groupId).push({ forceN, x, fromGroup });
}

function distributeReaction(loads, contacts, position, forceN, fromGroup) {
    if (!(forceN > EPSILON)) return;
    let candidates = contacts.filter(contact => position >= contact.x0 - EPSILON && position <= contact.x1 + EPSILON);
    if (!candidates.length) {
        let bestDistance = Infinity;
        for (const contact of contacts) {
            const distance = position < contact.x0 ? contact.x0 - position : position > contact.x1 ? position - contact.x1 : 0;
            if (distance < bestDistance - EPSILON) { bestDistance = distance; candidates = [contact]; }
            else if (Math.abs(distance - bestDistance) <= EPSILON) candidates.push(contact);
        }
    }
    const share = forceN / Math.max(1, candidates.length);
    for (const contact of candidates) addPointLoad(loads, contact.lowerGroup, share, position, fromGroup);
}

function assemblyDynamics(groups, topplingGroups, pivotX, pivotY, physics) {
    const bodyIds = [];
    let count = 0, sumX = 0, sumY = 0, sumSquared = 0;
    for (const groupId of topplingGroups) {
        const group = groups.get(groupId);
        bodyIds.push(...group.bodyIds);
        count += group.count;
        sumX += group.sumX; sumY += group.sumY; sumSquared += group.sumSquared;
    }
    const massKg = count * physics.blockMassKg;
    const comX = sumX / count, comY = sumY / count;
    const scale = physics.cellSizeMeters;
    // Four additive moments suffice for ANY pivot: no re-scan of its cells.
    const inertiaKgM2 = physics.blockMassKg * scale * scale * (sumSquared
        - 2 * pivotX * sumX - 2 * pivotY * sumY + count * (pivotX ** 2 + pivotY ** 2 + 1 / 6));
    const torqueNm = massKg * physics.gravity * (comX - pivotX) * scale;
    return { bodyIds, massKg, comX, comY, inertiaKgM2: Math.max(inertiaKgM2, EPSILON), torqueNm };
}

/**
 * Solve vertical static equilibrium for a grid of rigid polyomino bodies.
 *
 * Every horizontal contact can carry a non-negative normal reaction across
 * its unit-width patch. For each rigid body (or mutually supporting compound),
 * the solver balances total vertical force and moment, then passes the two
 * edge reactions to supporting bodies below. A resultant outside the support
 * interval means no compression-only force distribution can balance torque.
 */
function analyzeVerticalCertificate(bodyGrid, rawPhysics = {}) {
    const physics = normalizeStructuralPhysics(rawPhysics);
    const rows = bodyGrid?.length || 0;
    const columns = rows ? bodyGrid[0].length : 0;
    const bodies = bodyMapFromGrid(bodyGrid || []);
    if (!bodies.size) return { stable: true, physics, bodies: [], groups: [], contacts: [], minimumMarginCells: Infinity, instability: null };

    const contacts = supportContacts(bodyGrid, bodies);
    const adjacency = new Map([...bodies.keys()].map(id => [id, new Set()]));
    for (const contact of contacts) if (contact.lowerBody) adjacency.get(contact.upperBody).add(contact.lowerBody);
    const components = stronglyConnectedComponents([...bodies.keys()], adjacency);
    const bodyToGroup = new Map();
    const groups = new Map();
    components.forEach((bodyIds, groupId) => {
        const cells = bodyIds.flatMap(id => bodies.get(id).cells);
        bodyIds.forEach(id => bodyToGroup.set(id, groupId));
        let sumX = 0, sumY = 0, sumSquared = 0;
        for (const cell of cells) {
            sumX += cell.x; sumY += cell.y; sumSquared += cell.x ** 2 + cell.y ** 2;
        }
        groups.set(groupId, { groupId, bodyIds, cells, count: cells.length, sumX, sumY, sumSquared });
    });

    const groupContacts = [];
    for (const contact of contacts) {
        const upperGroup = bodyToGroup.get(contact.upperBody);
        const lowerGroup = contact.lowerBody ? bodyToGroup.get(contact.lowerBody) : -1;
        if (lowerGroup !== -1 && upperGroup === lowerGroup) continue;
        groupContacts.push({ ...contact, upperGroup, lowerGroup });
    }
    const outgoing = new Map([...groups.keys()].map(id => [id, new Set()]));
    const incoming = new Map([...groups.keys()].map(id => [id, new Set()]));
    for (const contact of groupContacts) {
        if (contact.lowerGroup === -1) continue;
        outgoing.get(contact.upperGroup).add(contact.lowerGroup);
        incoming.get(contact.lowerGroup).add(contact.upperGroup);
    }
    const indegree = new Map([...groups.keys()].map(id => [id, incoming.get(id).size]));
    const queue = [...groups.keys()].filter(id => indegree.get(id) === 0);
    const loads = new Map();
    const results = [];
    let minimumMarginCells = Infinity;
    let instability = null;

    const supportsByGroup = new Map([...groups.keys()].map(id => [id, []]));
    for (const contact of groupContacts) supportsByGroup.get(contact.upperGroup).push(contact);
    for (let head = 0; head < queue.length; head++) {
        const groupId = queue[head];
        const group = groups.get(groupId);
        const massKg = group.cells.length * physics.blockMassKg;
        const weightN = massKg * physics.gravity;
        const comX = group.sumX / group.count;
        const comY = group.sumY / group.count;
        const pointLoads = [{ forceN: weightN, x: comX, fromGroup: null }, ...(loads.get(groupId) || [])];
        const totalForceN = pointLoads.reduce((sum, load) => sum + load.forceN, 0);
        const resultantX = pointLoads.reduce((sum, load) => sum + load.forceN * load.x, 0) / totalForceN;
        const supports = supportsByGroup.get(groupId);

        if (!supports.length) {
            const footprintMin = Math.min(...group.cells.map(cell => cell.column));
            const footprintMax = Math.max(...group.cells.map(cell => cell.column + 1));
            const pivotX = resultantX <= columns / 2 ? footprintMin : footprintMax;
            const pivotY = Math.max(...group.cells.map(cell => cell.row + 1));
            instability = {
                groupId, reason: 'unsupported', bodyIds: [...group.bodyIds], resultantX,
                supportMin: null, supportMax: null, marginCells: -Infinity,
                pivotX, pivotY, direction: resultantX < pivotX ? -1 : 1,
                totalForceN, netTorqueNm: totalForceN * (resultantX - pivotX) * physics.cellSizeMeters,
            };
        } else {
            const supportMin = Math.min(...supports.map(contact => contact.x0));
            const supportMax = Math.max(...supports.map(contact => contact.x1));
            const usableMin = Math.min((supportMin + supportMax) / 2, supportMin + physics.stabilityMarginCells);
            const usableMax = Math.max((supportMin + supportMax) / 2, supportMax - physics.stabilityMarginCells);
            const marginCells = Math.min(resultantX - supportMin, supportMax - resultantX);
            minimumMarginCells = Math.min(minimumMarginCells, marginCells);
            if (resultantX < usableMin - EPSILON || resultantX > usableMax + EPSILON) {
                const left = resultantX < usableMin;
                const pivotX = left ? supportMin : supportMax;
                const edgeContacts = supports.filter(contact => left
                    ? Math.abs(contact.x0 - supportMin) <= EPSILON
                    : Math.abs(contact.x1 - supportMax) <= EPSILON);
                const pivotY = edgeContacts.length
                    ? Math.max(...edgeContacts.map(contact => contact.y))
                    : Math.max(...supports.map(contact => contact.y));
                instability = {
                    groupId, reason: 'torque', bodyIds: [...group.bodyIds], resultantX,
                    supportMin, supportMax, marginCells, pivotX, pivotY,
                    direction: left ? -1 : 1, totalForceN,
                    netTorqueNm: totalForceN * (resultantX - pivotX) * physics.cellSizeMeters,
                };
            } else {
                const span = usableMax - usableMin;
                const rightForceN = span <= EPSILON ? totalForceN * 0.5 : totalForceN * (resultantX - usableMin) / span;
                const leftForceN = totalForceN - rightForceN;
                distributeReaction(loads, supports, usableMin, leftForceN, groupId);
                distributeReaction(loads, supports, usableMax, rightForceN, groupId);
                results.push({
                    groupId, bodyIds: [...group.bodyIds], massKg, weightN, comX, comY,
                    pointLoads, totalForceN, resultantX, supportMin, supportMax,
                    marginCells, reactions: [
                        { x: usableMin, forceN: leftForceN },
                        { x: usableMax, forceN: rightForceN },
                    ],
                });
            }
        }

        if (instability) {
            const topplingGroups = new Set([groupId]);
            const above = [groupId];
            while (above.length) {
                const supported = above.pop();
                for (const upper of incoming.get(supported) || []) {
                    if (topplingGroups.has(upper)) continue;
                    topplingGroups.add(upper);
                    above.push(upper);
                }
            }
            const dynamics = assemblyDynamics(groups, topplingGroups, instability.pivotX, instability.pivotY, physics);
            instability = {
                ...instability,
                ...dynamics,
                direction: Math.sign(dynamics.torqueNm) || instability.direction || 1,
                topplingGroupIds: [...topplingGroups],
            };
            break;
        }

        for (const lower of outgoing.get(groupId)) {
            indegree.set(lower, indegree.get(lower) - 1);
            if (indegree.get(lower) === 0) queue.push(lower);
        }
    }

    return {
        stable: !instability,
        physics,
        bodies: [...bodies.values()],
        groups: results,
        contacts: groupContacts,
        minimumMarginCells,
        instability,
        dimensions: { rows, columns },
    };
}

// The kinematic dual checks ALL admissible infinitesimal motions at once.
// Coordinates: x right, y down, positive rotation clockwise. A contact may
// open but never penetrate; there is no glue, friction, or support from walls.
// Endpoint inequalities exactly cover an entire straight contact patch.
// Maximum gravitational work > 0 iff no compression-only static equilibrium
// exists. Zero includes neutral balance and must NEVER start a collapse.
function gridBodyAt(bodyGrid, row, column) {
    if (row < 0 || row >= bodyGrid.length) return 0;
    const cells = bodyGrid[row];
    if (!cells || column < 0 || column >= cells.length) return 0;
    return Number(cells[column]) || 0;
}

function contactFriction(point, physics) {
    if (point.kind === 'platform' || point.floor) return physics.platformFriction;
    if (point.kind === 'wall' || point.wall) return physics.wallFriction;
    return physics.pieceFriction;
}

function contactEndpoints(bodyGrid, bodies, physics) {
    const points = [];
    const rows = bodyGrid.length;
    const columns = bodyGrid.reduce((maximum, row) => Math.max(maximum, row?.length || 0), 0);
    const floorMin = physics.floorMinColumn;
    const floorMax = physics.floorMaxColumn;
    for (const body of bodies.values()) for (const cell of body.cells) {
        const below = gridBodyAt(bodyGrid, cell.row + 1, cell.column);
        if (below && below !== body.id) {
            for (const x of [cell.column, cell.column + 1]) {
                points.push({ a: body.id, b: below, x, y: cell.row + 1, nx: 0, ny: 1, kind: 'piece' });
            }
        } else if (!below && cell.row + 1 === rows) {
            // Clip the bottom edge to the finite platform interval. This
            // keeps cells outside either endpoint from acquiring support.
            const x0 = Math.max(cell.column, floorMin);
            const x1 = Math.min(cell.column + 1, floorMax);
            if (x1 - x0 > EPSILON) {
                points.push({ a: body.id, b: -1, x: x0, y: rows, nx: 0, ny: 1, kind: 'platform', floor: true });
                points.push({ a: body.id, b: -1, x: x1, y: rows, nx: 0, ny: 1, kind: 'platform', floor: true });
            }
        }
        const right = gridBodyAt(bodyGrid, cell.row, cell.column + 1);
        if (right && right !== body.id) {
            for (const y of [cell.row, cell.row + 1]) {
                points.push({ a: body.id, b: right, x: cell.column + 1, y, nx: 1, ny: 0, kind: 'piece' });
            }
        }
    }
    if (physics.walls) for (const body of bodies.values()) for (const cell of body.cells) {
        const right = Math.min(columns, floorMax);
        if (Math.abs(cell.column - floorMin) <= EPSILON && !gridBodyAt(bodyGrid, cell.row, cell.column - 1)) {
            for (const y of [cell.row, cell.row + 1]) {
                points.push({ a: body.id, b: -1, x: floorMin, y, nx: -1, ny: 0, kind: 'wall', wall: true });
            }
        }
        if (right > floorMin && Math.abs(cell.column + 1 - right) <= EPSILON &&
            !gridBodyAt(bodyGrid, cell.row, cell.column + 1)) for (const y of [cell.row, cell.row + 1]) {
            points.push({ a: body.id, b: -1, x: right, y, nx: 1, ny: 0, kind: 'wall', wall: true });
        }
    }
    return points;
}

function summarizeBodies(bodies) {
    for (const body of bodies.values()) {
        let sx = 0, sy = 0, sxx = 0, syy = 0;
        for (const cell of body.cells) {
            sx += cell.x; sy += cell.y;
            sxx += cell.x * cell.x; syy += cell.y * cell.y;
        }
        body.mass = body.cells.length;
        body.comX = sx / body.mass;
        body.comY = sy / body.mass;
        // Unit square intrinsic inertia plus the parallel-axis theorem.
        body.inertia = sxx + syy - (sx * sx + sy * sy) / body.mass + body.mass / 6;
    }
}

function contactVelocity(point, motions, bodies) {
    const velocity = id => {
        const body = bodies.get(id), motion = motions.get(id);
        if (!body || !motion) return 0;
        return point.nx * (motion.vx - motion.omega * (point.y - body.comY))
            + point.ny * (motion.vy + motion.omega * (point.x - body.comX));
    };
    return velocity(point.b) - velocity(point.a);
}

function rigidFailureIsAdmissible(failure, points, bodies) {
    if (!failure || failure.reason === 'unsupported' || Math.abs(failure.torqueNm) <= EPSILON) return false;
    const moving = new Set(failure.bodyIds);
    const motions = new Map();
    for (const body of bodies.values()) if (moving.has(body.id)) motions.set(body.id, {
        vx: -failure.direction * (body.comY - failure.pivotY),
        vy: failure.direction * (body.comX - failure.pivotX),
        omega: failure.direction,
    });
    return points.every(point => contactVelocity(point, motions, bodies) >= -EPSILON);
}

function solveCoupledEquilibrium(bodies, points) {
    const expression = terms => terms.filter(([value]) => Math.abs(value) > EPSILON)
        .map(([value, name]) => `${value < 0 ? '-' : '+'} ${Math.abs(value)} ${name}`).join(' ') || '0';
    const constraints = points.map((point, index) => {
        const terms = [];
        for (const [id, sign] of [[point.a, -1], [point.b, 1]]) {
            const body = bodies.get(id);
            if (!body) continue;
            terms.push([sign * point.nx, `u${id}`], [sign * point.ny, `v${id}`],
                [sign * (point.ny * (point.x - body.comX) - point.nx * (point.y - body.comY)), `w${id}`]);
        }
        return `c${index}: ${expression(terms)} >= 0`;
    });
    const bounds = [...bodies.keys()].flatMap(id => ['u', 'v', 'w'].map(axis => `-1 <= ${axis}${id} <= 1`));
    const objective = expression([...bodies.values()].flatMap(body => [
        [body.forceX, `u${body.id}`], [body.forceY, `v${body.id}`], [body.momentLoad, `w${body.id}`],
    ]));
    const model = `Maximize\nwork: ${objective}\nSubject To\n${constraints.join('\n')}\nBounds\n${bounds.join('\n')}\nEnd`;
    let solution = structuralSolver.solve(model, STRUCTURAL_SOLVER_OPTIONS);
    if (solution.Status !== 'Optimal') throw new Error(`Structural solver: ${solution.Status}`);
    const work = solution.ObjectiveValue;
    if (work > EPSILON) {
        // Remove arbitrary neutral translations/rotations from the mechanism.
        // This second solve preserves the maximum work and minimizes motion.
        const variables = [...bodies.keys()].flatMap(id => ['u', 'v', 'w'].map(axis => `${axis}${id}`));
        const absolute = variables.flatMap(name => [`a${name} - ${name} >= 0`, `a${name} + ${name} >= 0`]);
        const compact = structuralSolver.solve(`Minimize\nmotion: ${variables.map(name => `a${name}`).join(' + ')}\nSubject To\n${constraints.join('\n')}\nwork: ${objective} = ${work}\n${absolute.join('\n')}\nBounds\n${bounds.join('\n')}\nEnd`, STRUCTURAL_SOLVER_OPTIONS);
        // HiGHS can reject the exact decimal equality after it has rounded
        // the first solve's objective. The maximizing solution is already a
        // valid non-penetrating mechanism, so retain it when the optional
        // compacting solve is numerically infeasible instead of turning a
        // valid instability certificate into an exception.
        if (compact.Status === 'Optimal') {
            solution = compact;
            solution.ObjectiveValue = work;
        }
    }
    const motions = new Map([...bodies.keys()].map(id => [id, {
        vx: solution.Columns[`u${id}`]?.Primal || 0,
        vy: solution.Columns[`v${id}`]?.Primal || 0,
        omega: solution.Columns[`w${id}`]?.Primal || 0,
    }]));
    // Check the certificate independently; a numerical failure is not a loss.
    if (points.some(point => contactVelocity(point, motions, bodies) < -1e-7)) {
        throw new Error('Structural solver returned a penetrating motion');
    }
    return { solution, motions };
}

// Linear-time sufficient certificate for common stacks in an accelerating
// frame. Horizontal contact patches at one height balance Fx, Fy AND torque;
// each endpoint reaction must satisfy its own Coulomb cone. Failure here is
// inconclusive and falls through to the full coupled solve. No bodies merge.
function contactForceCertificate(bodies, contacts, physics) {
    const data = new Map([...bodies].map(([id, body]) => [id, {
        body, supports: [], parents: new Set(), children: new Set(),
        fx: body.forceX, fy: body.forceY,
        moment: body.comX * body.forceY - body.comY * body.forceX + body.momentLoad,
    }]));
    for (const point of contacts) {
        if (point.nx !== 0 || point.ny !== 1) continue;
        data.get(point.a).supports.push(point);
        if (point.b !== -1) {
            data.get(point.a).children.add(point.b);
            data.get(point.b).parents.add(point.a);
        }
    }
    const queue = [...data.keys()].filter(id => !data.get(id).parents.size);
    const remaining = new Map([...data].map(([id, entry]) => [id, entry.parents.size]));
    const reactions = [], groups = [];
    const forceScale = physics.blockMassKg * (physics.gravity || 1);
    let margin = Infinity;
    for (let head = 0; head < queue.length; head++) {
        const entry = data.get(queue[head]);
        const { body, supports, fx, fy, moment } = entry;
        if (!supports.length || fy <= EPSILON) return null;
        const y = supports[0].y;
        if (supports.some(point => point.y !== y)) return null;
        let left = supports[0], right = left;
        for (const point of supports) {
            if (point.x < left.x) left = point;
            if (point.x > right.x) right = point;
        }
        const resultant = (moment + y * fx) / fy;
        if (resultant < left.x - EPSILON || resultant > right.x + EPSILON) return null;
        const fraction = Math.max(0, Math.min(1, (resultant - left.x) / (right.x - left.x || 1)));
        const bodyReactions = [];
        for (const [point, share] of [[left, 1 - fraction], [right, fraction]]) {
            const normal = fy * share, tangent = fx * share;
            const mu = contactFriction(point, physics);
            if (Math.abs(tangent) > mu * normal + EPSILON) return null;
            if (!share) continue;
            reactions.push({ ...point, nx: tangent / normal, forceN: normal * forceScale });
            bodyReactions.push({ x: point.x, forceN: normal * forceScale, tangentN: tangent * forceScale });
            if (point.b !== -1) {
                const lower = data.get(point.b);
                lower.fx += tangent; lower.fy += normal;
                lower.moment += point.x * normal - point.y * tangent;
            }
        }
        const localMargin = Math.min(resultant - left.x, right.x - resultant);
        margin = Math.min(margin, localMargin);
        groups.push({ groupId: body.id, bodyIds: [body.id], comX: body.comX, comY: body.comY,
            massKg: body.mass * physics.blockMassKg, weightN: body.mass * physics.blockMassKg * physics.gravity,
            totalForceN: fy * forceScale, horizontalForceN: fx * forceScale,
            resultantX: resultant, supportMin: left.x, supportMax: right.x, marginCells: localMargin, reactions: bodyReactions });
        for (const lower of entry.children) {
            remaining.set(lower, remaining.get(lower) - 1);
            if (remaining.get(lower) === 0) queue.push(lower);
        }
    }
    return groups.length === bodies.size ? { reactions, groups, margin } : null;
}

function columnCertificate(grid, physics) {
    const rows = grid?.length || 0, columns = grid?.[0]?.length || 0;
    // Contiguous columns have an explicit equilibrium: transmit all weight
    // straight down at each cell center. This also works for interlocked IDs.
    // It avoids graph construction altogether on dense, very large boards.
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < columns; c++) {
        if (grid[r][c] && !grid[r + 1][c]) return null;
    }
    const pressure = new Float64Array(columns), bodies = new Map(), groups = new Map(), contacts = [];
    const unitWeight = physics.blockMassKg * physics.gravity;
    for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
        const id = grid[r][c];
        if (!id) continue;
        if (!bodies.has(id)) {
            bodies.set(id, { id, cells: [] });
            groups.set(id, { groupId: id, bodyIds: [id], massKg: 0, weightN: 0,
                comX: 0, comY: 0, totalForceN: 0, resultantX: 0,
                supportMin: Infinity, supportMax: -Infinity, reactions: [] });
        }
        const group = groups.get(id);
        bodies.get(id).cells.push({ row: r, column: c, x: c + 0.5, y: r + 0.5 });
        group.comX += c + 0.5; group.comY += r + 0.5;
        pressure[c]++;
        const lower = r + 1 === rows ? 0 : grid[r + 1][c];
        if (lower === id) continue;
        const forceN = pressure[c] * unitWeight;
        group.reactions.push({ x: c + 0.5, forceN });
        group.totalForceN += forceN; group.resultantX += forceN * (c + 0.5);
        group.supportMin = Math.min(group.supportMin, c);
        group.supportMax = Math.max(group.supportMax, c + 1);
        contacts.push({ upperBody: id, lowerBody: lower, upperGroup: id, lowerGroup: lower || -1,
            x0: c, x1: c + 1, x: c + 0.5, y: r + 1,
            kind: lower ? 'piece' : 'platform', floor: !lower });
    }
    let minimumMarginCells = Infinity;
    for (const [id, group] of groups) {
        const count = bodies.get(id).cells.length;
        group.comX /= count; group.comY /= count;
        group.massKg = count * physics.blockMassKg; group.weightN = count * unitWeight;
        group.resultantX = group.totalForceN ? group.resultantX / group.totalForceN : group.comX;
        group.marginCells = Math.min(group.resultantX - group.supportMin, group.supportMax - group.resultantX);
        minimumMarginCells = Math.min(minimumMarginCells, group.marginCells);
    }
    return { stable: true, physics, bodies: [...bodies.values()], groups: [...groups.values()], contacts,
        minimumMarginCells, instability: null, dimensions: { rows, columns }, solver: 'column-certificate' };
}

export function analyzeStructuralStability(bodyGrid, rawPhysics = {}) {
    const normalized = normalizeStructuralPhysics(rawPhysics);
    const forceCoupled = rawPhysics?.forceCoupled === true;
    const simpleFloor = normalized.floorMinColumn === 0 && normalized.floorMaxColumn >= (bodyGrid?.[0]?.length || 0);
    const simpleGravity = !normalized.frame;
    const columns = !forceCoupled && simpleFloor && simpleGravity ? columnCertificate(bodyGrid, normalized) : null;
    if (columns) return columns;
    if (normalized.gravity === 0 && !normalized.frame && !forceCoupled) return { stable: true, physics: normalized,
        bodies: [...bodyMapFromGrid(bodyGrid).values()], groups: [], contacts: [],
        minimumMarginCells: null, instability: null, solver: 'zero-gravity' };
    const fast = !forceCoupled && simpleFloor && simpleGravity ? analyzeVerticalCertificate(bodyGrid, rawPhysics) : {
        stable: false, physics: normalized, bodies: [...bodyMapFromGrid(bodyGrid).values()],
        groups: [], contacts: [], minimumMarginCells: null, instability: null,
    };
    fast.solver = 'vertical-certificate';
    // SCC merging is only a heuristic. Touching bodies are never welded:
    // a compound certificate must also satisfy equilibrium of each member.
    if (fast.stable && fast.groups.every(group => group.bodyIds.length === 1)) return fast;
    const physics = fast.physics;
    const bodies = new Map(fast.bodies.map(body => [body.id, body]));
    if (!bodies.size) return { ...fast, stable: true, instability: null };
    summarizeBodies(bodies);
    const contacts = contactEndpoints(bodyGrid, bodies, physics);
    const points = contacts.flatMap(point => {
        const mu = contactFriction(point, physics);
        if (!mu) return [point];
        // Extreme rays of the Coulomb cone: N >= 0 and |T| <= mu N.
        return [-1, 1].map(sign => ({ ...point,
            // Equivalent cone rays with unit length keep large friction
            // coefficients from magnifying the LP feasibility residual.
            nx: (point.nx - sign * mu * point.ny) / Math.hypot(1, mu),
            ny: (point.ny + sign * mu * point.nx) / Math.hypot(1, mu),
        }));
    });
    for (const body of bodies.values()) {
        const frame = physics.frame;
        const g = physics.gravity, scale = physics.cellSizeMeters;
        const rx = (body.comX - (frame?.originX || 0)) * physics.cellSizeMeters;
        const ry = (body.comY - (frame?.originY || 0)) * physics.cellSizeMeters;
        const load = gridFrameLoad(body.mass, body.inertia * scale * scale, rx, ry, g, frame || {});
        body.forceX = load.fx / (g || 1);
        body.forceY = load.fy / (g || 1);
        body.momentLoad = load.torque / (scale * (g || 1));
    }
    const certificate = forceCoupled ? null : contactForceCertificate(bodies, contacts, physics);
    if (certificate) return { ...fast, stable: true, instability: null, solver: 'contact-certificate',
        groups: certificate.groups, contactReactions: certificate.reactions, minimumMarginCells: certificate.margin };
    if (!physics.pieceFriction && !physics.platformFriction && !physics.wallFriction && !physics.frame &&
        rigidFailureIsAdmissible(fast.instability, contacts, bodies)) return fast;
    const cachedForces = rawPhysics.reuseReactions !== false ? reactionCache.solve(bodies, points) : null;
    const { solution, motions } = cachedForces ? {
        solution: { ObjectiveValue: 0, Rows: [...cachedForces].map(force => ({ Dual: -force })) }, motions: null,
    } : solveCoupledEquilibrium(bodies, points);
    const loadScale = [...bodies.values()].reduce((sum, body) => sum
        + Math.abs(body.forceX) + Math.abs(body.forceY) + Math.abs(body.momentLoad), 0);
    const stable = solution.ObjectiveValue <= EQUILIBRIUM_RELATIVE_TOLERANCE * Math.max(1, loadScale);
    if (stable && !cachedForces && rawPhysics.reuseReactions !== false) {
        reactionCache.remember(bodies, points, Float64Array.from(points,
            (_, index) => Math.max(0, -solution.Rows[index].Dual)));
    }
    const contactReactions = points.map((point, index) => ({
        ...point, forceN: Math.max(0, -solution.Rows[index].Dual) * physics.blockMassKg * physics.gravity,
    }));
    const result = {
        ...fast, stable, solver: 'coupled-equilibrium', contactReactions,
        reusedReactions: Boolean(cachedForces),
        virtualWork: solution.ObjectiveValue, instability: null,
    };
    if (stable) {
        // Report the actual globally balanced forces, not the failed greedy
        // distribution. Dual reactions are equal and opposite on both bodies.
        const incomingByBody = new Map([...bodies.keys()].map(id => [id, []]));
        const supportsByBody = new Map([...bodies.keys()].map(id => [id, []]));
        for (const point of contactReactions) if (point.ny) {
            supportsByBody.get(point.a).push(point);
            incomingByBody.get(point.b)?.push(point);
        }
        result.groups = [...bodies.values()].map(body => {
            const incoming = incomingByBody.get(body.id);
            const supports = supportsByBody.get(body.id);
            const totalForceN = body.mass * physics.blockMassKg * physics.gravity
                + incoming.reduce((sum, p) => sum + p.forceN, 0);
            const supportMin = supports.length ? Math.min(...supports.map(p => p.x)) : null;
            const supportMax = supports.length ? Math.max(...supports.map(p => p.x)) : null;
            return {
                groupId: body.id, bodyIds: [body.id], comX: body.comX, comY: body.comY,
                massKg: body.mass * physics.blockMassKg,
                weightN: body.mass * physics.blockMassKg * physics.gravity, totalForceN,
                supportMin, supportMax,
                resultantX: totalForceN ? supports.reduce((sum, p) => sum + p.forceN * p.x, 0) / totalForceN : body.comX,
                reactions: supports.map(p => ({ x: p.x, forceN: p.forceN })),
            };
        });
        result.minimumMarginCells = null; // No single interval describes side-contact equilibrium.
        return result;
    }
    // General mechanisms need separate body motions. Including every ancestor
    // in a rigid rotation can drag a bridge straight through its other support.
    // Friction-cone dual velocities certify failure, but their normal opening
    // is not a physical sliding velocity (associated-flow dilation). On a fixed
    // face, render pure translation tangentially when all real contacts allow
    // it. Keep the dual work as the driving work after friction dissipation.
    const animationMotions = new Map([...motions].map(([id, motion]) => [id, { ...motion }]));
    for (const point of contacts) {
        const friction = contactFriction(point, physics);
        if (point.b !== -1 || !friction) continue;
        const motion = animationMotions.get(point.a);
        if (Math.abs(motion.omega) > EPSILON) continue;
        const normal = point.nx * motion.vx + point.ny * motion.vy;
        const tangent = -point.ny * motion.vx + point.nx * motion.vy;
        if (normal < 0 && Math.abs(tangent) > EPSILON) {
            motion.vx -= normal * point.nx; motion.vy -= normal * point.ny;
        }
    }
    const projectedMotionValid = contacts.every(point => contactVelocity(point, animationMotions, bodies) >= -EPSILON)
        && [...animationMotions.values()].some(motion => Math.abs(motion.vx) + Math.abs(motion.vy) + Math.abs(motion.omega) > EPSILON);
    const moving = [];
    let massKg = 0, sx = 0, sy = 0, generalizedMass = 0, drivingForce = 0;
    for (const body of bodies.values()) {
        const virtualMotion = motions.get(body.id);
        const motion = (projectedMotionValid ? animationMotions : motions).get(body.id);
        if (Math.abs(motion.vx) + Math.abs(motion.vy) + Math.abs(motion.omega) <= EPSILON) continue;
        const mass = body.mass * physics.blockMassKg;
        moving.push({ bodyId: body.id, comX: body.comX, comY: body.comY, ...motion });
        massKg += mass; sx += mass * body.comX; sy += mass * body.comY;
        generalizedMass += physics.blockMassKg * physics.cellSizeMeters ** 2
            * (body.mass * (motion.vx ** 2 + motion.vy ** 2) + body.inertia * motion.omega ** 2);
        drivingForce += physics.blockMassKg * (physics.gravity || 1) * physics.cellSizeMeters
            * (body.forceX * virtualMotion.vx + body.forceY * virtualMotion.vy + body.momentLoad * virtualMotion.omega);
    }
    const rotating = moving.find(body => Math.abs(body.omega) > EPSILON);
    const comX = sx / massKg, comY = sy / massKg;
    result.instability = {
        reason: rotating ? 'mechanism' : moving.some(body => Math.abs(body.vx) > EPSILON) ? 'sliding' : 'unsupported', bodyIds: moving.map(body => body.bodyId),
        comX, comY, massKg, direction: Math.sign(rotating?.omega || 1),
        pivotX: rotating ? rotating.comX - rotating.vy / rotating.omega : comX,
        pivotY: rotating ? rotating.comY + rotating.vx / rotating.omega : comY,
        inertiaKgM2: generalizedMass, torqueNm: rotating ? drivingForce : 0, netTorqueNm: rotating ? drivingForce : 0,
        totalForceN: massKg * physics.gravity, bodyMotions: moving,
        generalizedAcceleration: drivingForce / generalizedMass,
    };
    return result;
}

/** Split body identifiers after a cleared row severs a polyomino. */
export function splitDisconnectedBodies(bodyGrid, nextBodyId = 1) {
    const rows = bodyGrid.length;
    const columns = rows ? bodyGrid[0].length : 0;
    const maximumId = Math.max(...bodyGrid.flatMap(row => [...row]), 0);
    let nextId = Math.max(1, nextBodyId, maximumId + 1);
    const visited = new Uint8Array(rows * columns);
    const seenFirstComponent = new Set();
    const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const id = Number(bodyGrid[row][column]) || 0;
        const index = row * columns + column;
        if (!id || visited[index]) continue;
        const component = [];
        const queue = [[row, column]];
        visited[index] = 1;
        while (queue.length) {
            const [r, c] = queue.pop();
            component.push([r, c]);
            for (const [dr, dc] of directions) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= rows || nc < 0 || nc >= columns) continue;
                const neighborIndex = nr * columns + nc;
                if (visited[neighborIndex] || bodyGrid[nr][nc] !== id) continue;
                visited[neighborIndex] = 1;
                queue.push([nr, nc]);
            }
        }
        if (!seenFirstComponent.has(id)) {
            seenFirstComponent.add(id);
            continue;
        }
        const replacement = nextId++;
        for (const [r, c] of component) bodyGrid[r][c] = replacement;
    }
    return { bodyGrid, nextBodyId: nextId };
}
