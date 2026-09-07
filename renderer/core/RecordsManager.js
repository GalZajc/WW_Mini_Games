/**
 * RecordsManager — Save and retrieve game records.
 *
 * Each record stores: date, settings snapshot, and results.
 * Records are keyed by game ID.
 */

function cloneJson(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

/**
 * Produce a deterministic JSON representation. Object-key order must not make
 * two otherwise identical settings snapshots count as different difficulties.
 */
function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map(key => [key, canonicalize(value[key])])
        );
    }
    return value;
}

export function settingsKey(settings) {
    return JSON.stringify(canonicalize(settings || {}));
}
export class RecordsManager {

    constructor() {
        /** @type {Object|null} — cached records (loaded lazily) */
        this._cache = null;
    }

    /** Load all records (cached after first call). */
    async _load() {
        if (!this._cache) {
            this._cache = await window.api.readRecords();
        }
        return this._cache;
    }

    /**
     * Add a record for a game.
     * @param {string} gameId
     * @param {Object} settings — current settings when the game was played
     * @param {Object} results  — game-specific results (e.g. { score: 42 })
     */
    async addRecord(gameId, settings, results) {
        const all = await this._load();
        if (!all[gameId]) all[gameId] = [];

        const settingsSnapshot = cloneJson(settings || {});

        all[gameId].push({
            date: new Date().toISOString(),
            settings: settingsSnapshot,
            settingsKey: settingsKey(settingsSnapshot),
            results: cloneJson(results || {}),
        });

        // Keep at most 500 records per game to avoid bloat
        if (all[gameId].length > 500) {
            all[gameId] = all[gameId].slice(-500);
        }

        await window.api.writeRecords(all);
    }

    /**
     * Get all records for a game.
     * @param {string} gameId
     * @returns {Array}
     */
    async getRecords(gameId) {
        const all = await this._load();
        return all[gameId] || [];
    }

    /**
     * Get the best record for a game that matches the given settings.
     * "Best" is determined by the `resultKey` (highest value by default).
     * @param {string} gameId
     * @param {Object} settings — settings to filter by
     * @param {string} resultKey — which result field to compare (e.g. 'score')
     * @param {'max'|'min'} mode — whether higher or lower is better
     */
    async getBest(gameId, settings, resultKey, mode = 'max') {
        const records = await this.getRecords(gameId);
        const requestedKey = settingsKey(settings);
        const matching = records.filter(r =>
            (r.settingsKey || settingsKey(r.settings)) === requestedKey
        );
        if (matching.length === 0) return null;

        const comparable = matching.filter(record => Number.isFinite(Number(record.results?.[resultKey])));
        if (comparable.length === 0) return null;

        return comparable.reduce((best, r) => {
            const val     = Number(r.results[resultKey]);
            const bestVal = Number(best.results[resultKey]);
            if (mode === 'max' && val > bestVal) return r;
            if (mode === 'min' && val < bestVal) return r;
            return best;
        });
    }

    /** Invalidate cache (e.g. after external modification). */
    invalidateCache() {
        this._cache = null;
    }
}
