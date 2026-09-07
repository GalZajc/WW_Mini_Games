/**
 * GameLoader — Discovers and dynamically imports game modules.
 *
 * 1. Asks the main process to scan renderer/games/ for subdirectories
 *    with a valid config.json.
 * 2. On demand, dynamically imports the game class from game.js.
 */
export const DEFAULT_GAME_ORDER = Object.freeze([
    'reromo-tetris',           // tetris
    'pogo-cloud-jump',         // pogo jump
    'flappy',                  // flappy
    'sky-pilot-3d',            // ski pilot 3D
    'dino-runner',             // dino runner
    'rod-balance',             // rod balance
    'wheelie-balance',         // wheeelie balance
    'cup-shuffle',             // cup shuffle
    'rubiks-cuboid',           // rubik
    'robot-island',            // robot island
    'curve-memory',            // curve memory
    'rhythm-memory',           // rhythm memory
    'number-memory',           // number memory
    'reaction-time',           // reaction time
    'click-speed',             // click speed
    'cup-and-ball',            // cup and ball
    'n-in-a-row',              // n in a row
    'tic-tac-toe',             // tic tac toe
    'sudoku',                  // sudoku
    'spherical-bowl-balance',  // sperical bowl
    'lava-path-tilt',          // lava path tilt
    'tarzan-swing',            // tarzan swing
    'standing-swing-jump',     // swing jump
    'card-lounge',             // kartni salon
    'classic-board',           // klasične namizne igre
]);

/**
 * Sorts games by user-curated priority order.
 * Games not in the list (e.g. untested / WIP) appear at the end sorted alphabetically.
 * @param {Array<Object>} games
 * @param {readonly string[]} order
 * @returns {Array<Object>}
 */
export function sortGamesByPriority(games, order = DEFAULT_GAME_ORDER) {
    const orderMap = new Map(order.map((id, index) => [id, index]));
    return games.sort((a, b) => {
        const indexA = orderMap.has(a._id) ? orderMap.get(a._id) : Number.MAX_SAFE_INTEGER;
        const indexB = orderMap.has(b._id) ? orderMap.get(b._id) : Number.MAX_SAFE_INTEGER;
        if (indexA !== indexB) {
            return indexA - indexB;
        }
        return (a.name || a._id || '').localeCompare(b.name || b._id || '');
    });
}

export class GameLoader {

    constructor() {
        /** @type {Array<Object>} — list of game configs (populated by scan) */
        this.games = [];
    }

    /** Scan for available games via IPC. */
    async scan() {
        this.games = await window.api.scanGames();
        sortGamesByPriority(this.games);
        return this.games;
    }

    /**
     * Dynamically import a game class.
     * @param {Object} gameConfig — one of the objects in this.games
     * @returns {typeof import('./BaseGame.js').BaseGame} — the game class (default export)
     */
    async loadGame(gameConfig) {
        // Use relative import from this module's location (core/) to games/<id>/game.js
        const relativePath = `../games/${gameConfig._id}/game.js`;
        const module = await import(relativePath);
        return module.default;
    }
}
