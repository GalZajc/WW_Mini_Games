import {
    buildMobiusTemplate,
    decodeMobiusTemplate,
    encodeMobiusTemplate,
    MOBIUS_TEMPLATE_VERSION,
} from './mobius-geometry.js';

// Grid limits, suggested sizes and cache policy live together so the menu,
// validator, preset generator and renderer cannot silently diverge.
export const GRID_LIMITS = Object.freeze({
    // Ten columns is the classic Cartesian Tetris width and is also a valid
    // Möbius double traversal (five coincident physical column pairs).
    minColumns: 10,
    minRows: 10,
    maxColumns: 256,
    maxRows: 256,
});

export const GRID_PRESETS = Object.freeze([
    Object.freeze({ columns: 24, rows: 18 }),
    Object.freeze({ columns: 48, rows: 32 }),
    Object.freeze({ columns: 64, rows: 48 }),
    Object.freeze({ columns: 96, rows: 64 }),
    Object.freeze({ columns: 128, rows: 96 }),
    Object.freeze({ columns: 192, rows: 128 }),
    Object.freeze({ columns: 256, rows: 256 }),
]);

const memoryCache = new Map();
const inFlight = new Map();
const MEMORY_TEMPLATE_LIMIT = 6;

function rememberTemplate(key, template) {
    memoryCache.delete(key);
    memoryCache.set(key, template);
    while (memoryCache.size > MEMORY_TEMPLATE_LIMIT) {
        memoryCache.delete(memoryCache.keys().next().value);
    }
}

export function mobiusTemplateCacheKey(rows, columns, subdivisions) {
    return `v${MOBIUS_TEMPLATE_VERSION}-c${columns}-r${rows}-s${subdivisions}`;
}

export function gridPresetValue(columns, rows) {
    return `${columns}x${rows}`;
}

export function findGridPreset(columns, rows) {
    return GRID_PRESETS.find(preset => preset.columns === columns && preset.rows === rows) || null;
}

function assertGridDimensions(rows, columns) {
    if (!Number.isInteger(columns) || columns < GRID_LIMITS.minColumns || columns > GRID_LIMITS.maxColumns) {
        throw new Error(`Angular / column fields must be between ${GRID_LIMITS.minColumns} and ${GRID_LIMITS.maxColumns}.`);
    }
    if (!Number.isInteger(rows) || rows < GRID_LIMITS.minRows || rows > GRID_LIMITS.maxRows) {
        throw new Error(`Radial / row fields must be between ${GRID_LIMITS.minRows} and ${GRID_LIMITS.maxRows}.`);
    }
}

async function loadPersistedTemplate(key, expected) {
    const read = globalThis.window?.api?.readReRoMoProjectionCache;
    if (typeof read !== 'function') return null;
    try {
        const bytes = await read(key);
        if (!bytes) return null;
        return decodeMobiusTemplate(bytes, expected);
    } catch (error) {
        console.warn(`Ignoring invalid ReRoMo projection cache ${key}:`, error);
        return null;
    }
}

async function savePersistedTemplate(key, template) {
    const write = globalThis.window?.api?.writeReRoMoProjectionCache;
    if (typeof write !== 'function') return;
    try {
        await write(key, encodeMobiusTemplate(template));
    } catch (error) {
        // Gameplay remains fully functional when a read-only installation or a
        // transient filesystem error prevents persistent caching.
        console.warn(`Could not save ReRoMo projection cache ${key}:`, error);
    }
}

/**
 * Load a bundled/user-cached normalized mesh, or calculate and persist it once.
 * Repeated callers in the same session share both completed and in-flight work.
 */
export async function ensureMobiusTemplate({
    rows,
    columns,
    subdivisions,
    onProgress = null,
}) {
    assertGridDimensions(rows, columns);
    const segmentCount = Math.max(2, Math.round(subdivisions));
    const key = mobiusTemplateCacheKey(rows, columns, segmentCount);
    if (memoryCache.has(key)) {
        const cached = memoryCache.get(key);
        rememberTemplate(key, cached);
        onProgress?.(1, 'Using prepared Möbius geometry…');
        return cached;
    }
    if (inFlight.has(key)) {
        onProgress?.(0.02, 'Finishing the already-started Möbius calculation…');
        const template = await inFlight.get(key);
        onProgress?.(1, 'Möbius geometry prepared.');
        return template;
    }

    const expected = { rows, columns, subdivisions: segmentCount };
    const task = (async () => {
        onProgress?.(0, 'Loading prepared Möbius geometry…');
        const persisted = await loadPersistedTemplate(key, expected);
        if (persisted) {
            rememberTemplate(key, persisted);
            onProgress?.(1, 'Prepared Möbius geometry loaded.');
            return persisted;
        }

        onProgress?.(0.02, 'Calculating this Möbius grid for the first time…');
        const template = await buildMobiusTemplate({
            rows,
            columns,
            subdivisions: segmentCount,
            onProgress: fraction => onProgress?.(
                0.02 + fraction * 0.92,
                `Calculating Möbius curves… ${Math.round(fraction * 100)}%`,
            ),
        });
        rememberTemplate(key, template);
        onProgress?.(0.96, 'Saving the prepared grid for later…');
        await savePersistedTemplate(key, template);
        onProgress?.(1, 'Möbius geometry prepared and saved.');
        return template;
    })();

    inFlight.set(key, task);
    try {
        return await task;
    } finally {
        inFlight.delete(key);
    }
}

export function clearMobiusMemoryCacheForTests() {
    memoryCache.clear();
    inFlight.clear();
}
