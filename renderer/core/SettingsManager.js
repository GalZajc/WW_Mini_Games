/**
 * SettingsManager — Per-game settings persistence.
 *
 * Reads/writes settings via the IPC bridge (window.api).
 * Merges user overrides with game defaults (from getSettingsSchema).
 */
export class SettingsManager {

    /**
     * Load saved settings for a game, merged with defaults.
     * @param {string} gameId
     * @param {Array} schema — from GameClass.getSettingsSchema()
     * @returns {Object} merged settings
     */
    async load(gameId, schema = []) {
        const defaults = {};
        for (const s of schema) {
            defaults[s.key] = s.default;
        }
        const saved = await window.api.readSettings(gameId);
        return { ...defaults, ...(saved || {}) };
    }

    /**
     * Save settings for a game.
     * @param {string} gameId
     * @param {Object} settings
     */
    async save(gameId, settings) {
        await window.api.writeSettings(gameId, settings);
    }

    /**
     * Load keybindings for a game.
     * @param {string} gameId
     * @returns {Object} bindings per action — { action: [{ type, code }] }
     */
    async loadKeybindings(gameId) {
        const all = await window.api.readKeybindings();
        return all[gameId] || {};
    }

    /**
     * Save keybindings for a game.
     * @param {string} gameId
     * @param {Object} bindings — { action: [{ type, code }] }
     */
    async saveKeybindings(gameId, bindings) {
        const all = await window.api.readKeybindings();
        all[gameId] = bindings;
        await window.api.writeKeybindings(all);
    }
}
