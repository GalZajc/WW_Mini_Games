// A previous feasible contact-force solution is a local linear certificate.
// Factor its active reaction columns once; new loads only need a matrix-vector
// product. A failed certificate is inconclusive and MUST fall back to the LP.
const NUMERICS = Object.freeze({ maximumRows: 360, pivotTolerance: 1e-10,
    activeForceTolerance: 1e-10, residualTolerance: 1e-9 });

function system(bodies, points) {
    const entries = [...bodies.values()];
    const indices = new Map(entries.map((body, i) => [body.id, i * 3]));
    const loads = Float64Array.from(entries.flatMap(body => [body.forceX, body.forceY, body.momentLoad]));
    const columns = points.map(point => {
        const terms = [];
        for (const [id, sign] of [[point.a, 1], [point.b, -1]]) {
            const body = bodies.get(id);
            if (!body) continue;
            const row = indices.get(id);
            terms.push([row, sign * point.nx], [row + 1, sign * point.ny],
                [row + 2, sign * (point.ny * (point.x - body.comX) - point.nx * (point.y - body.comY))]);
        }
        return terms;
    });
    // Include the complete matrix and row order: edited grids, split pieces,
    // friction changes and newly touching walls can never reuse stale forces.
    const key = entries.map(body => body.id).join(',') + ':' + JSON.stringify(columns);
    return { loads, columns, key };
}

function feasible({ loads, columns }, forces) {
    const residual = Float64Array.from(loads);
    for (let j = 0; j < columns.length; j++) {
        if (!Number.isFinite(forces[j]) || forces[j] < 0) return false;
        for (const [row, value] of columns[j]) residual[row] -= value * forces[j];
    }
    const tolerance = NUMERICS.residualTolerance * Math.max(1, ...loads.map(Math.abs));
    return residual.every(value => Number.isFinite(value) && Math.abs(value) <= tolerance);
}

export class StructuralReactionCache {
    constructor() { this.entry = null; }

    solve(bodies, points) {
        if (!this.entry) return null;
        const current = system(bodies, points), cached = this.entry;
        if (current.key !== cached.key) { this.entry = null; return null; }
        const delta = current.loads.map((value, i) => value - cached.loads[i]);
        const forces = Float64Array.from(cached.forces);
        for (let row = 0; row < cached.pivots.length; row++) {
            let change = 0;
            for (let i = 0; i < delta.length; i++) change += cached.inverse[row][i] * delta[i];
            const column = cached.pivots[row];
            forces[column] += change;
            if (forces[column] < -NUMERICS.residualTolerance) return null;
            forces[column] = Math.max(0, forces[column]);
        }
        // Independent Newton balances also catch rank-deficient systems whose
        // old active contacts cannot transmit a newly requested load component.
        return feasible(current, forces) ? forces : null;
    }

    remember(bodies, points, forces) {
        this.entry = null;
        if (bodies.size * 3 > NUMERICS.maximumRows) return;
        const current = system(bodies, points), n = current.loads.length;
        if (!feasible(current, forces)) return;
        const active = [...forces.keys()].filter(i => forces[i] > NUMERICS.activeForceTolerance);
        const matrix = Array.from({ length: n }, () => new Float64Array(active.length));
        active.forEach((column, j) => {
            for (const [row, value] of current.columns[column]) matrix[row][j] += value;
        });
        const inverse = Array.from({ length: n }, (_, i) => {
            const row = new Float64Array(n); row[i] = 1; return row;
        });
        const pivots = [];
        for (let column = 0; column < active.length && pivots.length < n; column++) {
            const row = pivots.length;
            let best = row;
            for (let i = row + 1; i < n; i++) if (Math.abs(matrix[i][column]) > Math.abs(matrix[best][column])) best = i;
            const pivot = matrix[best][column];
            if (Math.abs(pivot) <= NUMERICS.pivotTolerance) continue;
            [matrix[row], matrix[best]] = [matrix[best], matrix[row]];
            [inverse[row], inverse[best]] = [inverse[best], inverse[row]];
            for (let j = column; j < active.length; j++) matrix[row][j] /= pivot;
            for (let j = 0; j < n; j++) inverse[row][j] /= pivot;
            for (let i = 0; i < n; i++) {
                if (i === row) continue;
                const factor = matrix[i][column];
                if (factor === 0) continue;
                for (let j = column; j < active.length; j++) matrix[i][j] -= factor * matrix[row][j];
                for (let j = 0; j < n; j++) inverse[i][j] -= factor * inverse[row][j];
            }
            pivots.push(active[column]);
        }
        this.entry = { ...current, forces: Float64Array.from(forces), pivots, inverse: inverse.slice(0, pivots.length) };
    }
}
