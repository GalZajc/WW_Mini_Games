export const BLACK = 1;
export const WHITE = 2;

const integer = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};
export const rectangleKey = (x, y) => `r:${x}:${y}`;
export const cuboidKey = (x, y, z) => `c:${x}:${y}:${z}`;

export function createRectangleTopology(nx = 9, ny = 9) {
    nx = Math.max(2, integer(nx, 9));
    ny = Math.max(2, integer(ny, 9));
    const points = new Map();
    const neighbors = new Map();
    for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
            const key = rectangleKey(x, y);
            points.set(key, { key, x, y });
            neighbors.set(key, []);
        }
    }
    for (const point of points.values()) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const next = rectangleKey(point.x + dx, point.y + dy);
            if (points.has(next)) neighbors.get(point.key).push(next);
        }
    }
    return { type: 'rectangle', dimensions: { nx, ny }, points, neighbors };
}

export function createCuboidTopology(nx = 7, ny = 7, nz = 7) {
    nx = Math.max(2, integer(nx, 7));
    ny = Math.max(2, integer(ny, 7));
    nz = Math.max(2, integer(nz, 7));
    const points = new Map();
    const neighbors = new Map();
    const isSurface = (x, y, z) => x === 0 || x === nx - 1
        || y === 0 || y === ny - 1 || z === 0 || z === nz - 1;

    for (let z = 0; z < nz; z++) {
        for (let y = 0; y < ny; y++) {
            for (let x = 0; x < nx; x++) {
                if (!isSurface(x, y, z)) continue;
                const key = cuboidKey(x, y, z);
                points.set(key, { key, x, y, z });
                neighbors.set(key, []);
            }
        }
    }

    for (const point of points.values()) {
        for (const [dx, dy, dz] of [
            [-1, 0, 0], [1, 0, 0],
            [0, -1, 0], [0, 1, 0],
            [0, 0, -1], [0, 0, 1],
        ]) {
            const next = cuboidKey(point.x + dx, point.y + dy, point.z + dz);
            if (points.has(next)) neighbors.get(point.key).push(next);
        }
    }
    return { type: 'cuboid', dimensions: { nx, ny, nz }, points, neighbors };
}

/** Go rules over an arbitrary finite surface graph. */
export class GoGraphModel {
    constructor(topology) {
        this.topology = topology;
        this.board = new Map();
        this.player = BLACK;
        this.captures = { [BLACK]: 0, [WHITE]: 0 };
        this.history = [''];
        this.consecutivePasses = 0;
        this.gameOver = false;
        this.scores = null;
    }

    neighbors(key) {
        return this.topology.neighbors.get(key) || [];
    }

    group(startKey, board = this.board) {
        const player = board.get(startKey);
        if (!player) return { stones: new Set(), liberties: new Set() };
        const stones = new Set([startKey]);
        const liberties = new Set();
        const queue = [startKey];
        while (queue.length) {
            const key = queue.shift();
            for (const neighbor of this.neighbors(key)) {
                const occupant = board.get(neighbor);
                if (!occupant) liberties.add(neighbor);
                else if (occupant === player && !stones.has(neighbor)) {
                    stones.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        return { stones, liberties };
    }

    serialize(board = this.board) {
        return [...board.entries()]
            .sort(([first], [second]) => first.localeCompare(second))
            .map(([key, player]) => `${key}:${player}`)
            .join(',');
    }

    place(key) {
        if (this.gameOver || !this.topology.points.has(key) || this.board.has(key)) return false;
        const opponent = this.player === BLACK ? WHITE : BLACK;
        const candidate = new Map(this.board);
        candidate.set(key, this.player);
        let captured = 0;
        const checked = new Set();
        for (const neighbor of this.neighbors(key)) {
            if (candidate.get(neighbor) !== opponent || checked.has(neighbor)) continue;
            const group = this.group(neighbor, candidate);
            group.stones.forEach(stone => checked.add(stone));
            if (group.liberties.size === 0) {
                captured += group.stones.size;
                group.stones.forEach(stone => candidate.delete(stone));
            }
        }
        if (this.group(key, candidate).liberties.size === 0 && captured === 0) return false;
        const serialized = this.serialize(candidate);
        if (this.history.length >= 2 && serialized === this.history[this.history.length - 2]) return false;
        this.board = candidate;
        this.captures[this.player] += captured;
        this.history.push(serialized);
        this.consecutivePasses = 0;
        this.player = opponent;
        return true;
    }

    pass() {
        if (this.gameOver) return false;
        this.consecutivePasses += 1;
        this.player = this.player === BLACK ? WHITE : BLACK;
        if (this.consecutivePasses >= 2) {
            this.gameOver = true;
            this.scores = this.calculateScores();
        }
        return true;
    }

    calculateScores() {
        const territory = { [BLACK]: 0, [WHITE]: 0 };
        const visited = new Set();
        for (const startKey of this.topology.points.keys()) {
            if (this.board.has(startKey) || visited.has(startKey)) continue;
            const queue = [startKey];
            const region = new Set([startKey]);
            const borders = new Set();
            visited.add(startKey);
            while (queue.length) {
                const key = queue.shift();
                for (const neighbor of this.neighbors(key)) {
                    const occupant = this.board.get(neighbor);
                    if (occupant) borders.add(occupant);
                    else if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        region.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
            if (borders.size === 1) territory[[...borders][0]] += region.size;
        }
        return {
            [BLACK]: {
                territory: territory[BLACK],
                captures: this.captures[BLACK],
                total: territory[BLACK] + this.captures[BLACK],
            },
            [WHITE]: {
                territory: territory[WHITE],
                captures: this.captures[WHITE],
                total: territory[WHITE] + this.captures[WHITE],
            },
        };
    }
}
