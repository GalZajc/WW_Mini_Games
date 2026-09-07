export const AXES = Object.freeze(['x', 'y', 'z']);
export const AXIS_INDEX = Object.freeze({ x: 0, y: 1, z: 2 });
export const FACE_KEYS = Object.freeze(['+x', '-x', '+y', '-y', '+z', '-z']);
export const FACE_NORMALS = Object.freeze({
    '+x': Object.freeze([1, 0, 0]),
    '-x': Object.freeze([-1, 0, 0]),
    '+y': Object.freeze([0, 1, 0]),
    '-y': Object.freeze([0, -1, 0]),
    '+z': Object.freeze([0, 0, 1]),
    '-z': Object.freeze([0, 0, -1]),
});
export const FACE_COLORS = Object.freeze({
    '+x': '#e53935',
    '-x': '#ff8f00',
    '+y': '#f5f5f5',
    '-y': '#fdd835',
    '+z': '#43a047',
    '-z': '#1e88e5',
});

const FACE_INDEX = Object.freeze(Object.fromEntries(FACE_KEYS.map((key, index) => [key, index])));

function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function transform(matrix, vector) {
    return matrix.map(row => Math.round(dot(row, vector)));
}

function normalKey(normal) {
    if (normal[0]) return normal[0] > 0 ? '+x' : '-x';
    if (normal[1]) return normal[1] > 0 ? '+y' : '-y';
    return normal[2] > 0 ? '+z' : '-z';
}

function rotateQuarter(vector, axis) {
    const [x, y, z] = vector;
    if (axis === 'x') return [x, -z, y];
    if (axis === 'y') return [z, y, -x];
    return [-y, x, z];
}

function normalizedQuarterTurns(value) {
    return ((Math.trunc(value) % 4) + 4) % 4;
}

function maximumAssignment(counts) {
    let best = 0;
    const visit = (row, usedMask, total) => {
        if (row === 6) {
            best = Math.max(best, total);
            return;
        }
        for (let column = 0; column < 6; column++) {
            const bit = 1 << column;
            if (usedMask & bit) continue;
            visit(row + 1, usedMask | bit, total + counts[row][column]);
        }
    };
    visit(0, 0, 0);
    return best;
}

const ALL_ORIENTATIONS = (() => {
    const directions = [
        [1, 0, 0], [-1, 0, 0],
        [0, 1, 0], [0, -1, 0],
        [0, 0, 1], [0, 0, -1],
    ];
    const matrices = [];
    for (const xBasis of directions) {
        for (const yBasis of directions) {
            if (dot(xBasis, yBasis) !== 0) continue;
            const zBasis = cross(xBasis, yBasis);
            matrices.push([
                [xBasis[0], yBasis[0], zBasis[0]],
                [xBasis[1], yBasis[1], zBasis[1]],
                [xBasis[2], yBasis[2], zBasis[2]],
            ]);
        }
    }
    return Object.freeze(matrices);
})();

const orientationCache = new Map();

function fittingOrientations(dimensions) {
    const key = dimensions.join('x');
    if (orientationCache.has(key)) return orientationCache.get(key);
    const fitting = ALL_ORIENTATIONS.filter(matrix => {
        for (let outputAxis = 0; outputAxis < 3; outputAxis++) {
            const sourceAxis = matrix[outputAxis].findIndex(value => value !== 0);
            if (dimensions[sourceAxis] !== dimensions[outputAxis]) return false;
        }
        return true;
    });
    orientationCache.set(key, fitting);
    return fitting;
}

export function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export class CuboidModel {

    constructor(nx, ny, nz) {
        this.dimensions = [
            Math.max(1, Math.trunc(nx)),
            Math.max(1, Math.trunc(ny)),
            Math.max(1, Math.trunc(nz)),
        ];
        this.stickers = [];
        this.scrambleMoves = [];
        this._createSolvedStickers();
    }

    get nx() { return this.dimensions[0]; }
    get ny() { return this.dimensions[1]; }
    get nz() { return this.dimensions[2]; }
    get maximumScore() { return this.stickers.length; }

    _createSolvedStickers() {
        let id = 0;
        for (let x = 0; x < this.nx; x++) {
            for (let y = 0; y < this.ny; y++) {
                for (let z = 0; z < this.nz; z++) {
                    const position = [x, y, z];
                    if (x === this.nx - 1) this.stickers.push({ id: id++, position: [...position], normal: [1, 0, 0], color: '+x' });
                    if (x === 0) this.stickers.push({ id: id++, position: [...position], normal: [-1, 0, 0], color: '-x' });
                    if (y === this.ny - 1) this.stickers.push({ id: id++, position: [...position], normal: [0, 1, 0], color: '+y' });
                    if (y === 0) this.stickers.push({ id: id++, position: [...position], normal: [0, -1, 0], color: '-y' });
                    if (z === this.nz - 1) this.stickers.push({ id: id++, position: [...position], normal: [0, 0, 1], color: '+z' });
                    if (z === 0) this.stickers.push({ id: id++, position: [...position], normal: [0, 0, -1], color: '-z' });
                }
            }
        }
    }

    centeredPosition(sticker) {
        return sticker.position.map((value, axis) => value - (this.dimensions[axis] - 1) * 0.5);
    }

    layerCount(axis) {
        return this.dimensions[AXIS_INDEX[axis]];
    }

    allowsQuarterTurns(axis) {
        if (axis === 'x') return this.ny === this.nz;
        if (axis === 'y') return this.nx === this.nz;
        return this.nx === this.ny;
    }

    legalMoves() {
        const result = [];
        for (const axis of AXES) {
            const turns = this.allowsQuarterTurns(axis) ? [-1, 1, 2] : [2];
            for (let layer = 0; layer < this.layerCount(axis); layer++) {
                for (const quarterTurns of turns) result.push({ axis, layer, quarterTurns });
            }
        }
        return result;
    }

    rotate(axis, layer, quarterTurns) {
        const axisIndex = AXIS_INDEX[axis];
        if (axisIndex === undefined) return false;
        if (layer < 0 || layer >= this.dimensions[axisIndex]) return false;
        const turns = normalizedQuarterTurns(quarterTurns);
        if (turns === 0) return false;
        if (!this.allowsQuarterTurns(axis) && turns !== 2) return false;

        for (const sticker of this.stickers) {
            if (sticker.position[axisIndex] !== layer) continue;
            let centered = this.centeredPosition(sticker);
            let normal = [...sticker.normal];
            for (let step = 0; step < turns; step++) {
                centered = rotateQuarter(centered, axis);
                normal = rotateQuarter(normal, axis);
            }
            sticker.position = centered.map((value, index) =>
                Math.round(value + (this.dimensions[index] - 1) * 0.5)
            );
            sticker.normal = normal.map(value => Math.round(value));
        }
        return true;
    }

    score() {
        let best = 0;
        for (const orientation of fittingOrientations(this.dimensions)) {
            const counts = Array.from({ length: 6 }, () => Array(6).fill(0));
            for (const sticker of this.stickers) {
                const transformedNormal = transform(orientation, sticker.normal);
                const referenceFace = FACE_INDEX[normalKey(transformedNormal)];
                counts[FACE_INDEX[sticker.color]][referenceFace]++;
            }
            best = Math.max(best, maximumAssignment(counts));
        }
        return best;
    }

    scramble(seed) {
        const random = seededRandom(seed);
        const legalMoves = this.legalMoves();
        const burnInMoves = this.estimateScrambleBurnIn();
        const windowMoves = burnInMoves;
        const samplesPerWindow = 12;
        const sampleStride = Math.max(1, Math.floor(windowMoves / samplesPerWindow));
        const minimumWindows = 8;
        const maximumWindows = 16;
        const stableWindows = 4;
        const plateauTolerance = 0.06;
        const targetScore = Math.floor(this.maximumScore * 0.58);
        const moves = [];
        const windowMeans = [];
        let previousKey = '';

        const addMove = () => {
            let move;
            for (let attempt = 0; attempt < 20; attempt++) {
                move = legalMoves[Math.floor(random() * legalMoves.length)];
                if (`${move.axis}:${move.layer}` !== previousKey) break;
            }
            if (!this.rotate(move.axis, move.layer, move.quarterTurns)) {
                throw new Error(`Generated illegal scramble move ${move.axis}${move.layer}:${move.quarterTurns}`);
            }
            moves.push({ ...move });
            previousKey = `${move.axis}:${move.layer}`;
        };

        let plateauReached = false;
        for (let windowIndex = 0; windowIndex < maximumWindows; windowIndex++) {
            const samples = [];
            for (let index = 0; index < windowMoves; index++) {
                addMove();
                if ((index + 1) % sampleStride === 0 || index === windowMoves - 1) {
                    samples.push(this.score() / Math.max(1, this.maximumScore));
                }
            }
            windowMeans.push(samples.reduce((sum, value) => sum + value, 0) / samples.length);

            if (windowIndex + 1 < minimumWindows || windowMeans.length < stableWindows) continue;
            const recent = windowMeans.slice(-stableWindows);
            plateauReached = Math.max(...recent) - Math.min(...recent) <= plateauTolerance;
            if (plateauReached) break;
        }

        // End on a visually well-mixed member of the measured plateau rather
        // than on an unusually high-score fluctuation. Degenerate 1×1×1-like
        // puzzles can have an invariant score, so this phase is bounded.
        let finalScore = this.score();
        const extraMoveLimit = moves.length + windowMoves * 4;
        while (finalScore > targetScore && moves.length < extraMoveLimit) {
            for (let index = 0; index < sampleStride; index++) addMove();
            finalScore = this.score();
        }

        this.scrambleMoves = moves;
        this.scrambleInverseMoves = this.inverseMoves(moves);
        const verification = this.clone();
        for (const move of this.scrambleInverseMoves) {
            if (!verification.rotate(move.axis, move.layer, move.quarterTurns)) {
                throw new Error('Scramble inverse unexpectedly contained an illegal move.');
            }
        }
        this.scrambleVerified = verification.isExactlySolved();
        if (!this.scrambleVerified) {
            throw new Error('Scramble verification failed: generated state was not exactly reversible.');
        }
        this.scrambleDiagnostics = {
            algorithmVersion: 2,
            burnInMoves,
            windowMoves,
            windowsMeasured: windowMeans.length,
            plateauReached,
            plateauTolerance,
            normalizedWindowMeans: windowMeans.map(value => Number(value.toFixed(6))),
            finalScore,
        };
        return moves;
    }

    faceKeyForSticker(sticker) {
        return normalKey(sticker.normal);
    }

    clone() {
        const copy = new CuboidModel(this.nx, this.ny, this.nz);
        copy.stickers = this.stickers.map(sticker => ({
            ...sticker,
            position: [...sticker.position],
            normal: [...sticker.normal],
        }));
        copy.scrambleMoves = this.scrambleMoves.map(move => ({ ...move }));
        return copy;
    }

    exactStateSignature() {
        return this.stickers
            .slice()
            .sort((a, b) => a.id - b.id)
            .map(sticker => `${sticker.id}:${sticker.position.join(',')}:${sticker.normal.join(',')}:${sticker.color}`)
            .join('|');
    }

    isExactlySolved() {
        const solved = new CuboidModel(this.nx, this.ny, this.nz);
        return this.exactStateSignature() === solved.exactStateSignature();
    }

    inverseMoves(moves = this.scrambleMoves) {
        return moves.slice().reverse().map(move => ({
            axis: move.axis,
            layer: move.layer,
            quarterTurns: -move.quarterTurns,
        }));
    }

    estimateScrambleBurnIn() {
        const [nx, ny, nz] = this.dimensions;
        const pairArea = nx * ny + ny * nz + nx * nz;
        return Math.max(
            260,
            12 * pairArea,
            16 * (nx + ny + nz),
            3 * this.maximumScore,
        );
    }
}
