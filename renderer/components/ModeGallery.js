import { gameArtworkMarkup } from './GameCard.js';

// A small shared registry keeps the launcher/framework independent from the
// implementation details of an individual game. New games can register their
// selector metadata without making PauseMenu know about their module.
const MODE_REGISTRY = new Map();

const MODE_SETTING_KEYS = new Set([
    'mode', 'modes', 'representation', 'variant', 'subgame', 'gameMode',
]);

const asModeArray = value => Array.isArray(value)
    ? value
    : (value && typeof value === 'object' ? Object.entries(value).map(([key, info]) => ({ key, ...(info || {}) })) : []);

const titleFromKey = key => String(key ?? '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase())
    .trim() || 'Mode';

function normalizeModes(modes) {
    return asModeArray(modes).map((mode, index) => {
        if (typeof mode === 'string') {
            return { key: mode, title: titleFromKey(mode), description: '', artKey: mode };
        }
        const key = String(mode?.key ?? mode?.value ?? mode?.id ?? index);
        return {
            ...mode,
            key,
            title: String(mode?.title ?? mode?.label ?? titleFromKey(key)),
            description: String(mode?.description ?? ''),
            artKey: mode?.artKey,
        };
    }).filter(mode => mode.key);
}

/**
 * Register the mode cards belonging to a game. Registration is intentionally
 * optional; existing games are discovered from their selector hooks and
 * settings schema by getGameModes below.
 */
export function registerGameModes(gameId, modes) {
    const key = String(gameId ?? '').trim();
    const normalized = normalizeModes(modes);
    if (!key || normalized.length < 2) {
        MODE_REGISTRY.delete(key);
        return [];
    }
    MODE_REGISTRY.set(key, normalized);
    return normalized;
}

export function getRegisteredGameModes(gameId) {
    return MODE_REGISTRY.get(String(gameId ?? '').trim())?.map(mode => ({ ...mode })) || [];
}

function safeSettingsSchema(GameClass) {
    try {
        return typeof GameClass?.getSettingsSchema === 'function'
            ? (GameClass.getSettingsSchema() || [])
            : [];
    } catch {
        return [];
    }
}

function schemaModes(schema) {
    const modeField = schema.find(setting =>
        MODE_SETTING_KEYS.has(String(setting?.key ?? '')) &&
        Array.isArray(setting?.options) && setting.options.length > 1
    );
    if (modeField) {
        return normalizeModes(modeField.options.map(option => ({
            key: option.value,
            title: option.label,
        })));
    }

    // Mode-profile schemas (used by the collection games) keep the active
    // mode in a hidden field and tag each profile setting with `modes`.
    const keys = new Set(schema.flatMap(setting => Array.isArray(setting?.modes) ? setting.modes : []));
    if (keys.size > 1) return normalizeModes([...keys]);

    // Tic-Tac-Toe predates the shared selector and expresses its two lobbies
    // through explicit schema groups. Treat only the well-known paired lobby
    // labels as a mode signal; ordinary physics/settings groups are not modes.
    const groups = new Set(schema.map(setting => String(setting?.group ?? '').trim().toLocaleLowerCase()).filter(Boolean));
    const hasSingle = [...groups].some(group => /^(single player|solo|single-player)$/.test(group));
    const hasMulti = [...groups].some(group => /^(multiplayer|multi-player|lan)$/.test(group));
    if (hasSingle && hasMulti) {
        return [
            { key: 'sp', title: 'Single Player', description: 'Play against the computer.', artKey: 'tic-tac-toe-sp' },
            { key: 'mp', title: 'Multiplayer', description: 'Play with other players.', artKey: 'tic-tac-toe-mp' },
        ];
    }
    return [];
}

function customModeHook(game) {
    if (!game) return false;
    if (game.supportsModeSelection === true) return true;
    const inheritedOpen = game.constructor?.prototype?.openModeSelector;
    return typeof game.returnToModeSelector === 'function' ||
        (typeof game.openModeSelector === 'function' && game.openModeSelector !== inheritedOpen);
}

/**
 * Return known mode definitions for a game, including metadata supplied by a
 * future game class or the shared registry. A custom selector may not expose
 * definitions; in that case the returned array is empty while
 * hasGameModes({ game }) still recognizes the explicit hook.
 */
export function getGameModes({ gameId, GameClass, game } = {}) {
    const registered = getRegisteredGameModes(gameId);
    if (registered.length > 1) return registered;

    const candidates = [
        GameClass?.getModeDefinitions,
        GameClass?.getModes,
        game?.getModeDefinitions,
        game?.getModes,
    ];
    for (const candidate of candidates) {
        if (typeof candidate !== 'function') continue;
        try {
            const modes = normalizeModes(candidate.call(candidate === game?.getModeDefinitions || candidate === game?.getModes ? game : GameClass));
            if (modes.length > 1) return modes;
        } catch {
            // A game metadata hook must never prevent the global menu opening.
        }
    }
    return schemaModes(safeSettingsSchema(GameClass));
}

export function hasGameModes({ gameId, GameClass, game } = {}) {
    return customModeHook(game) || getGameModes({ gameId, GameClass, game }).length > 1;
}

const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

/**
 * Full-screen mode chooser built from the exact same header, grid and card
 * primitives as the main game launcher. Clicking a card starts that mode.
 */
export function modeGalleryMarkup({ gameName, prompt, modes, selectedMode }) {
    const cards = modes.map(mode => `
        <button type="button" class="game-card ww-mode-card ${mode.key === selectedMode ? 'is-selected' : ''}" data-mode="${escapeHtml(mode.key)}" data-mode-search="${escapeHtml(`${mode.title} ${mode.description}`.toLocaleLowerCase())}">
            <div class="game-card-thumb">${gameArtworkMarkup(mode.artKey, mode.title)}</div>
            <div class="game-card-info">
                <div class="game-card-name">${escapeHtml(mode.title)}</div>
                <div class="game-card-desc">${escapeHtml(mode.description)}</div>
            </div>
        </button>`).join('');

    return `
        <header class="ww-mode-header">
            <button type="button" class="ww-mode-back" data-mode-back aria-label="Back to games" title="Back to games">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <label class="ww-mode-search-wrap">
                <svg class="ww-mode-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
                <input class="ww-mode-search" data-mode-search-input type="search" autocomplete="off" spellcheck="false" aria-label="Search modes" placeholder="Search ${escapeHtml(gameName)} modes…">
            </label>
            <span class="ww-mode-context"><strong>${escapeHtml(gameName)}</strong><span class="ww-mode-prompt"> · ${escapeHtml(prompt)}</span></span>
            <span class="ww-mode-count" data-mode-count>${modes.length} mode${modes.length === 1 ? '' : 's'}</span>
        </header>
        <main class="ww-mode-panel">
            <div class="ww-mode-grid">${cards}</div>
        </main>`;
}

export function bindModeGallery(element, { onMode, onBack }) {
    const handler = event => {
        const back = event.target.closest('[data-mode-back]');
        if (back) {
            onBack?.();
            return;
        }
        const card = event.target.closest('[data-mode]');
        if (card) onMode?.(card.dataset.mode);
    };
    const filter = event => {
        if (!event.target.matches('[data-mode-search-input]')) return;
        const query = event.target.value.trim().toLocaleLowerCase();
        const cards = [...element.querySelectorAll('[data-mode]')];
        let visible = 0;
        for (const card of cards) {
            const matches = !query || card.dataset.modeSearch.includes(query);
            card.hidden = !matches;
            if (matches) visible++;
        }
        const count = element.querySelector('[data-mode-count]');
        if (count) count.textContent = `${visible} mode${visible === 1 ? '' : 's'}`;
    };
    const keyboard = event => {
        const target = event.target;
        if (target?.matches?.('input, select, textarea, [contenteditable="true"]')) return;
        // Let the browser dispatch Enter/Space to the gallery's explicit back
        // button; only mode cards are handled by this keyboard layer.
        if (target?.closest?.('[data-mode-back]')) return;

        const cards = [...element.querySelectorAll('[data-mode]:not([hidden])')];
        if (!cards.length) return;
        const activeCard = document.activeElement?.closest?.('[data-mode]');
        const currentIndex = Math.max(0, cards.indexOf(activeCard));
        let nextIndex = currentIndex;

        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + cards.length) % cards.length;
        else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % cards.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = cards.length - 1;
        else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            (activeCard || cards[0]).click();
            return;
        } else {
            return;
        }

        event.preventDefault();
        cards[nextIndex]?.focus();
    };
    element.addEventListener('click', handler);
    element.addEventListener('input', filter);
    element.addEventListener('keydown', keyboard);
    return handler;
}
