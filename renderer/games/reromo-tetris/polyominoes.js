import {
    ENCODED_POLYOMINOES,
    MAX_POLYOMINO_ORDER,
    POLYOMINO_COUNTS,
} from './polyomino-data.js';

export const ORDER_NAMES = Object.freeze([
    '',
    'Monominoes',
    'Dominoes',
    'Trominoes',
    'Tetrominoes',
    'Pentominoes',
    'Hexominoes',
    'Heptominoes',
    'Octominoes',
    'Nonominoes',
    'Decominoes',
]);

const CLASSIC_TETROMINOES = Object.freeze({
    '00010203': {
        name: 'I',
        color: '#00FFFF',
        rotates: true,
        offsets: [[0, -1], [0, 0], [0, 1], [0, 2]],
    },
    '00011011': {
        name: 'O',
        color: '#FFFF00',
        rotates: false,
        offsets: [[0, 0], [0, 1], [1, 0], [1, 1]],
    },
    '00010211': {
        name: 'T',
        color: '#800080',
        rotates: true,
        offsets: [[0, -1], [0, 0], [0, 1], [-1, 0]],
    },
    '00101121': {
        name: 'S',
        color: '#00FF00',
        rotates: true,
        offsets: [[0, 1], [0, 0], [1, 0], [1, -1]],
    },
    '00011112': {
        name: 'Z',
        color: '#FF0000',
        rotates: true,
        offsets: [[0, -1], [0, 0], [1, 0], [1, 1]],
    },
    '00010212': {
        name: 'J',
        color: '#0000FF',
        rotates: true,
        offsets: [[0, -1], [1, -1], [1, 0], [1, 1]],
    },
    '00010210': {
        name: 'L',
        color: '#FFA500',
        rotates: true,
        offsets: [[0, 1], [1, -1], [1, 0], [1, 1]],
    },
});

function clampByte(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(red, green, blue) {
    return `#${[red, green, blue]
        .map(value => clampByte(value).toString(16).padStart(2, '0'))
        .join('')}`.toUpperCase();
}

function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100;
    const l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const section = ((hue % 360) + 360) % 360 / 60;
    const x = chroma * (1 - Math.abs(section % 2 - 1));
    let red = 0;
    let green = 0;
    let blue = 0;
    if (section < 1) [red, green] = [chroma, x];
    else if (section < 2) [red, green] = [x, chroma];
    else if (section < 3) [green, blue] = [chroma, x];
    else if (section < 4) [green, blue] = [x, chroma];
    else if (section < 5) [red, blue] = [x, chroma];
    else [red, blue] = [chroma, x];
    const match = l - chroma / 2;
    return rgbToHex((red + match) * 255, (green + match) * 255, (blue + match) * 255);
}

export function darkenHex(hex, factor = 0.42) {
    const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
    if (!value) return '#20202A';
    return rgbToHex(
        parseInt(value.slice(0, 2), 16) * factor,
        parseInt(value.slice(2, 4), 16) * factor,
        parseInt(value.slice(4, 6), 16) * factor,
    );
}

export function tintHex(hex, amount = 0.82) {
    const value = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
    if (!value) return '#FFFFFF';
    const mix = Math.max(0, Math.min(1, amount));
    return rgbToHex(
        parseInt(value.slice(0, 2), 16) * (1 - mix) + 255 * mix,
        parseInt(value.slice(2, 4), 16) * (1 - mix) + 255 * mix,
        parseInt(value.slice(4, 6), 16) * (1 - mix) + 255 * mix,
    );
}

export function decodePolyomino(encoded) {
    const cells = [];
    for (let index = 0; index < encoded.length; index += 2) {
        cells.push([
            parseInt(encoded[index], 36),
            parseInt(encoded[index + 1], 36),
        ]);
    }
    return cells;
}

function genericColor(order, ordinal) {
    // The golden-angle step keeps neighbouring catalogue entries visually distinct.
    return hslToHex((order * 41 + ordinal * 137.507764) % 360, 72, 55);
}

function createCatalog() {
    const all = [];
    const byOrder = Array.from({ length: MAX_POLYOMINO_ORDER + 1 }, () => []);
    const byId = new Map();

    for (let order = 1; order <= MAX_POLYOMINO_ORDER; order++) {
        ENCODED_POLYOMINOES[order].forEach((encoded, ordinal) => {
            const classic = order === 4 ? CLASSIC_TETROMINOES[encoded] : null;
            const color = classic?.color || genericColor(order, ordinal);
            const entry = {
                index: all.length,
                id: `${order}:${encoded}`,
                order,
                ordinal,
                encoded,
                classicName: classic?.name || null,
                color,
                darkColor: darkenHex(color),
                outlineColor: tintHex(color),
                _geometry: null,
                _cells: null,
            };
            all.push(entry);
            byOrder[order].push(entry);
            byId.set(entry.id, entry);
        });
    }

    return { all, byOrder, byId };
}

export const POLYOMINO_CATALOG = createCatalog();
export { MAX_POLYOMINO_ORDER, POLYOMINO_COUNTS };

export function getPreviewCells(entry) {
    if (!entry._cells) {
        entry._cells = entry.classicName === 'T'
            ? [[0, 1], [1, 0], [1, 1], [1, 2]]
            : decodePolyomino(entry.encoded);
    }
    return entry._cells;
}

function choosePivot(cells) {
    const centroidRow = cells.reduce((sum, cell) => sum + cell[0], 0) / cells.length;
    const centroidColumn = cells.reduce((sum, cell) => sum + cell[1], 0) / cells.length;
    return cells.reduce((best, cell) => {
        const distance = (cell[0] - centroidRow) ** 2 + (cell[1] - centroidColumn) ** 2;
        if (!best || distance < best.distance ||
            (distance === best.distance && (cell[0] < best.cell[0] ||
                (cell[0] === best.cell[0] && cell[1] < best.cell[1])))) {
            return { cell, distance };
        }
        return best;
    }, null).cell;
}

function rotateOffsets(offsets) {
    // Same transform as the original game: (r, phi) -> (phi, -r).
    return offsets.map(({ r, phi }) => ({ r: phi, phi: -r }));
}

export function getPieceGeometry(entry) {
    if (entry._geometry) return entry._geometry;

    const classic = entry.order === 4 ? CLASSIC_TETROMINOES[entry.encoded] : null;
    let baseOffsets;
    if (classic) {
        baseOffsets = classic.offsets.map(([r, phi]) => ({ r, phi }));
    } else {
        const cells = getPreviewCells(entry);
        const [pivotRow, pivotColumn] = choosePivot(cells);
        baseOffsets = cells.map(([row, column]) => ({
            r: row - pivotRow,
            phi: column - pivotColumn,
        }));
    }

    const rotations = [baseOffsets];
    for (let turn = 1; turn < 4; turn++) rotations.push(rotateOffsets(rotations[turn - 1]));

    entry._geometry = {
        rotations,
        rotates: classic ? classic.rotates : rotations.some((rotation, index) => {
            if (index === 0) return false;
            const signature = rotation.map(({ r, phi }) => `${r},${phi}`).sort().join(';');
            const baseSignature = rotations[0].map(({ r, phi }) => `${r},${phi}`).sort().join(';');
            return signature !== baseSignature;
        }),
        maxBaseR: Math.max(...baseOffsets.map(offset => offset.r)),
    };
    return entry._geometry;
}

export function effectivePieceWeight(entry, orderWeights, overrides) {
    const override = overrides?.[entry.id];
    const raw = override === undefined ? orderWeights?.[entry.order] : override;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

export function getActivePiecePreviewBounds(orderWeights, overrides) {
    let rows = 1;
    let columns = 1;
    let count = 0;
    for (const entry of POLYOMINO_CATALOG.all) {
        if (effectivePieceWeight(entry, orderWeights, overrides) <= 0) continue;
        const cells = getPreviewCells(entry);
        const rowValues = cells.map(cell => cell[0]);
        const columnValues = cells.map(cell => cell[1]);
        rows = Math.max(rows, Math.max(...rowValues) - Math.min(...rowValues) + 1);
        columns = Math.max(columns, Math.max(...columnValues) - Math.min(...columnValues) + 1);
        count++;
    }
    return Object.freeze({ rows, columns, count });
}

export function buildWeightedSampler(orderWeights, overrides, random = Math.random) {
    const indices = [];
    const cumulative = [];
    let total = 0;

    for (const entry of POLYOMINO_CATALOG.all) {
        const weight = effectivePieceWeight(entry, orderWeights, overrides);
        if (weight <= 0) continue;
        total += weight;
        indices.push(entry.index);
        cumulative.push(total);
    }

    const cumulativeWeights = Float64Array.from(cumulative);
    const pieceIndices = Uint16Array.from(indices);

    return Object.freeze({
        total,
        size: pieceIndices.length,
        sample() {
            if (!(total > 0)) return null;
            const target = Math.max(0, Math.min(1 - Number.EPSILON, random())) * total;
            let low = 0;
            let high = cumulativeWeights.length - 1;
            while (low < high) {
                const middle = (low + high) >>> 1;
                if (target < cumulativeWeights[middle]) high = middle;
                else low = middle + 1;
            }
            return POLYOMINO_CATALOG.all[pieceIndices[low]];
        },
        probabilityOf(entry) {
            return total > 0 ? effectivePieceWeight(entry, orderWeights, overrides) / total : 0;
        },
    });
}

export function defaultOrderWeights() {
    const weights = {};
    for (let order = 1; order <= MAX_POLYOMINO_ORDER; order++) {
        weights[order] = order === 4 ? 1 : 0;
    }
    return weights;
}
