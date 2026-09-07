// Geometry-only recovery for a finished rigid collapse.  The physics solver
// deliberately does not mutate the gameplay grid; this module converts a
// quiet snapshot back to grid cells only when the complete square geometry
// proves that such a conversion is unambiguous.

export const COLLAPSE_RECOVERY_NUMERICS = Object.freeze({
    epsilonCells: 0.1,
    minimumObservationSeconds: 2,
    restHoldSeconds: 1,
    restDriftCells: 0.01,
    platformRestAngle: 0.0001,
    platformRestSpeed: 0.0001,
    timeEpsilon: 1e-6,
    orientationEpsilonRadians: 0.05,
});

// Observe vertices in the GRID frame over a full interval. A rigid assembly
// can keep rocking while every piece is at rest relative to the deck. World
// motion must not prevent recovery; resume that deck motion instead of braking it.
export function observeRecoveryRest(snapshot, previous, cellSizeMeters) {
    const elapsed = Number(snapshot?.elapsed);
    const vertices = [];
    const frame = snapshot?.platform || { x: 0, y: 0, angle: 0 };
    for (const body of snapshot?.bodies || []) {
        for (const cell of body.cells || []) {
            const geometry = makeWorldCorners(body, cell, cellSizeMeters);
            if (!geometry) return null;
            vertices.push(...geometry.corners.map(point => inverseTransform(point, frame)));
        }
    }
    if (!vertices.length && snapshot?.platform) vertices.push({ x: 0, y: 0 });
    if (!Number.isFinite(elapsed) || !vertices.length) return null;
    const limit = cellSizeMeters * COLLAPSE_RECOVERY_NUMERICS.restDriftCells;
    const unchanged = previous && elapsed > previous.elapsed && previous.vertices.length === vertices.length
        && vertices.every((p, i) => Math.hypot(p.x - previous.vertices[i].x, p.y - previous.vertices[i].y) <= limit);
    const since = unchanged ? previous.since : elapsed;
    const halfPeriod = unchanged ? previous.halfPeriod : snapshot.oscillation?.halfPeriod;
    const hold = Math.max(COLLAPSE_RECOVERY_NUMERICS.restHoldSeconds, halfPeriod || 0);
    const angle = frame.angle || 0;
    const startAngle = unchanged ? previous.startAngle : angle;
    const excursion = unchanged ? Math.max(previous.excursion, Math.abs(angle - startAngle)) : 0;
    const returnedAngle = Boolean(unchanged && (previous.returnedAngle
        || (previous.excursion > COLLAPSE_RECOVERY_NUMERICS.platformRestAngle
            && (previous.angle - startAngle) * (angle - startAngle) <= 0)));
    const platformStill = unchanged
        && Math.abs(angle - previous.platformRestAngle) <= COLLAPSE_RECOVERY_NUMERICS.platformRestAngle;
    const platformRestSince = platformStill ? previous.platformRestSince : elapsed;
    // Require an actual return crossing, not a small-amplitude phase estimate.
    // If damping prevents that return, a stopped deck is the alternative.
    // Fixed vertex anchors bound TOTAL motion over this entire observation;
    // rapid tiny vibrations and momentary contact gaps do not reset it.
    const stopped = elapsed - platformRestSince >= hold;
    return { vertices: unchanged ? previous.vertices : vertices, since, elapsed,
        halfPeriod, startAngle, angle, excursion, returnedAngle, platformRestSince,
        platformRestAngle: platformStill ? previous.platformRestAngle : angle,
        ready: elapsed >= COLLAPSE_RECOVERY_NUMERICS.minimumObservationSeconds
            && elapsed - since >= hold
            && (!snapshot.platform || returnedAngle || stopped) };
}

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;

function finiteNumber(value, fallback = NaN) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function normalizeDimensions(rows, columns, cellSizeMeters) {
    const normalizedRows = Number(rows);
    const normalizedColumns = Number(columns);
    const cellSize = finiteNumber(cellSizeMeters);
    if (!Number.isInteger(normalizedRows) || normalizedRows <= 0) return null;
    if (!Number.isInteger(normalizedColumns) || normalizedColumns <= 0) return null;
    if (!(cellSize > 0)) return null;
    return { rows: normalizedRows, columns: normalizedColumns, cellSize };
}

function normalizeAngle(angle) {
    let result = finiteNumber(angle);
    if (!Number.isFinite(result)) return NaN;
    result = (result + Math.PI) % TAU;
    if (result < 0) result += TAU;
    return result - Math.PI;
}

function rotate(point, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return { x: c * point.x - s * point.y, y: s * point.x + c * point.y };
}

function inverseTransform(point, pose) {
    const translated = { x: point.x - pose.x, y: point.y - pose.y };
    return rotate(translated, -pose.angle);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function latticeCellCenter(row, column, rows, columns, cellSize) {
    return {
        x: (column + 0.5 - columns / 2) * cellSize,
        y: (row + 0.5 - rows) * cellSize,
    };
}

function latticeVertex(row, column, rows, columns, cellSize) {
    return {
        x: (column - columns / 2) * cellSize,
        y: (row - rows) * cellSize,
    };
}

function cellCorners(row, column, rows, columns, cellSize) {
    return [
        latticeVertex(row, column, rows, columns, cellSize),
        latticeVertex(row, column + 1, rows, columns, cellSize),
        latticeVertex(row + 1, column, rows, columns, cellSize),
        latticeVertex(row + 1, column + 1, rows, columns, cellSize),
    ];
}

function cornersMatch(actual, expected, epsilonMeters) {
    if (!Array.isArray(actual) || actual.length !== 4 || expected.length !== 4) return null;
    const used = new Set();
    let maximumError = 0;
    for (const point of actual) {
        let bestIndex = -1;
        let bestDistance = Infinity;
        for (let index = 0; index < expected.length; index++) {
            if (used.has(index)) continue;
            const error = distance(point, expected[index]);
            if (error < bestDistance) {
                bestDistance = error;
                bestIndex = index;
            }
        }
        if (bestIndex < 0 || bestDistance > epsilonMeters) return null;
        used.add(bestIndex);
        maximumError = Math.max(maximumError, bestDistance);
    }
    return maximumError;
}

function rockingPose(shape, angle) {
    if (!shape || typeof shape !== 'object') return { x: 0, y: 0, angle };
    const radius = finiteNumber(shape.radius);
    const d = finiteNumber(shape.d);
    if (!(radius > 0) || !Number.isFinite(d)) return null;
    return {
        // This is the analytic rockingKinematics translation.  A dynamic
        // platform may have accumulated tiny x/y drift; the resumed game uses
        // this canonical pose instead of carrying that drift into the grid.
        x: radius * angle - d * Math.sin(angle),
        y: d * (Math.cos(angle) - 1),
        angle,
    };
}

function bodyCellCenter(cell, cellSize) {
    if (!cell || typeof cell !== 'object') return null;
    const x = finiteNumber(cell.x, finiteNumber(cell.localX));
    const y = finiteNumber(cell.y, finiteNumber(cell.localY));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    // Cell records emitted by collapse-physics are offsets from the body's
    // centre of mass.  Keep the helper explicit so malformed records cannot
    // silently turn into a gameplay cell.
    return { x, y, half: cellSize / 2 };
}

function makeWorldCorners(body, cell, cellSize) {
    const bodyX = finiteNumber(body.x);
    const bodyY = finiteNumber(body.y);
    const bodyAngle = finiteNumber(body.angle, 0);
    const local = bodyCellCenter(cell, cellSize);
    if (!Number.isFinite(bodyX) || !Number.isFinite(bodyY) || !Number.isFinite(bodyAngle) || !local) return null;
    const corners = [];
    for (const dx of [-local.half, local.half]) for (const dy of [-local.half, local.half]) {
        const point = rotate({ x: local.x + dx, y: local.y + dy }, bodyAngle);
        corners.push({ x: bodyX + point.x, y: bodyY + point.y });
    }
    const centerOffset = rotate({ x: local.x, y: local.y }, bodyAngle);
    return {
        center: { x: bodyX + centerOffset.x, y: bodyY + centerOffset.y },
        corners,
        angle: bodyAngle,
    };
}

function nearestCell(localCenter, dimensions) {
    const { rows, columns, cellSize } = dimensions;
    const column = Math.round(localCenter.x / cellSize + columns / 2 - 0.5) || 0;
    const row = Math.round(localCenter.y / cellSize + rows - 0.5) || 0;
    const expected = latticeCellCenter(row, column, rows, columns, cellSize);
    return { row, column, expected, error: distance(localCenter, expected) };
}

function validCell(row, column, dimensions, allowOverhang) {
    if (!Number.isInteger(row) || row < 0 || row >= dimensions.rows) return false;
    if (allowOverhang === true) return Number.isInteger(column);
    return Number.isInteger(column) && column >= 0 && column < dimensions.columns;
}

/**
 * Recover a collapsed snapshot as grid cells when every body square is
 * aligned to the same current deck frame.  The dynamic platform pose is used
 * only to remove frame motion; when a rocking shape is supplied the returned
 * platform pose is rebuilt with analytic rockingKinematics at the snapshot
 * angle, so small physics drift is never persisted.
 *
 * Returns null when a cell is malformed, outside the permitted board, rotated
 * away from a quarter turn, outside the corner tolerance, or maps to an
 * occupied lattice cell.
 */
export function recoverGrid({
    snapshot,
    rows,
    columns,
    cellSizeMeters,
    epsilonCells = COLLAPSE_RECOVERY_NUMERICS.epsilonCells,
    allowOverhang = false,
    rockingShape = null,
} = {}) {
    const dimensions = normalizeDimensions(rows, columns, cellSizeMeters);
    if (!dimensions || !snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.bodies)) return null;
    const epsilon = finiteNumber(epsilonCells);
    if (!(epsilon >= 0)) return null;
    const epsilonMeters = epsilon * dimensions.cellSize;

    const hasPlatform = snapshot.platform !== null && snapshot.platform !== undefined;
    const suppliedPlatform = hasPlatform ? snapshot.platform : null;
    let platformAngle = hasPlatform ? finiteNumber(suppliedPlatform.angle, 0) : 0;
    if (!Number.isFinite(platformAngle)) return null;

    let framePose = { x: 0, y: 0, angle: 0 };
    let canonicalPlatform = { x: 0, y: 0, angle: platformAngle };
    if (hasPlatform) {
        const frameX = finiteNumber(suppliedPlatform.x);
        const frameY = finiteNumber(suppliedPlatform.y);
        if (!Number.isFinite(frameX) || !Number.isFinite(frameY)) return null;
        framePose = { x: frameX, y: frameY, angle: platformAngle };
    }
    if (rockingShape) {
        const halfAngle = finiteNumber(rockingShape.halfAngle);
        // Keep the supplied angle's sign at the ±π boundary for the analytic
        // translation, and reject an actually out-of-arc pose instead of
        // accepting a 2π-wrapped angle as if it were inside the arc.
        if (!(halfAngle > 0) || Math.abs(platformAngle) > halfAngle + 1e-12) return null;
        canonicalPlatform = rockingPose(rockingShape, platformAngle);
        if (!canonicalPlatform) return null;
        // The visible grid is attached to the actual deck. No-slip analytic
        // translation is not a valid reference after dynamic contact/sliding.
    } else if (hasPlatform) {
        // A caller without rocking geometry can still recover a generic
        // moving deck; root may choose not to use this pose for a rocking
        // resume.  The grid conversion itself remains frame-relative.
        canonicalPlatform = { ...framePose };
    }

    const occupied = new Set();
    const recovered = [];
    let maximumErrorMeters = 0;
    const usedBodyIds = new Set();
    let fallbackBodyId = 1;

    for (let bodyIndex = 0; bodyIndex < snapshot.bodies.length; bodyIndex++) {
        const body = snapshot.bodies[bodyIndex];
        if (!body || typeof body !== 'object' || body.kind === 'active-piece' || body.active === true) return null;
        if (!Array.isArray(body.cells) || body.cells.length === 0) return null;
        const rawId = body.bodyId ?? body.id;
        let bodyId = rawId;
        if (bodyId === undefined || bodyId === null || bodyId === '') {
            while (usedBodyIds.has(fallbackBodyId)) fallbackBodyId++;
            bodyId = fallbackBodyId++;
        }
        if (usedBodyIds.has(bodyId)) return null;
        usedBodyIds.add(bodyId);

        const bodyAngle = finiteNumber(body.angle);
        if (!Number.isFinite(bodyAngle)) return null;
        const relativeAngle = normalizeAngle(bodyAngle - platformAngle);
        if (!Number.isFinite(relativeAngle)) return null;
        // Matching all four vertices below also checks orientation, using
        // the requested distance tolerance rather than a stricter angle gate.

        for (const cell of body.cells) {
            const worldGeometry = makeWorldCorners(body, cell, dimensions.cellSize);
            if (!worldGeometry) return null;
            const localCenter = inverseTransform(worldGeometry.center, framePose);
            const localCorners = worldGeometry.corners.map(corner => inverseTransform(corner, framePose));
            const mapped = nearestCell(localCenter, dimensions);
            if (!validCell(mapped.row, mapped.column, dimensions, allowOverhang)) return null;
            if (mapped.error > epsilonMeters) return null;

            const expectedCorners = cellCorners(mapped.row, mapped.column,
                dimensions.rows, dimensions.columns, dimensions.cellSize);
            const cornerError = cornersMatch(localCorners, expectedCorners, epsilonMeters);
            if (cornerError === null) return null;
            maximumErrorMeters = Math.max(maximumErrorMeters, mapped.error, cornerError);

            const key = `${mapped.row},${mapped.column}`;
            if (occupied.has(key)) return null;
            occupied.add(key);
            recovered.push({
                row: mapped.row,
                column: mapped.column,
                value: cell.value,
                bodyId,
            });
        }
    }

    recovered.sort((a, b) => a.row - b.row || a.column - b.column || String(a.bodyId).localeCompare(String(b.bodyId)));
    return {
        cells: recovered,
        rockingState: { angle: platformAngle, omega: finiteNumber(suppliedPlatform?.omega, 0), alpha: 0,
            offsetX: framePose.x - canonicalPlatform.x, offsetY: framePose.y - canonicalPlatform.y },
        platform: canonicalPlatform,
        platformPose: { ...canonicalPlatform },
        epsilonCells: epsilon,
        maxErrorCells: maximumErrorMeters / dimensions.cellSize,
    };
}

export default recoverGrid;
