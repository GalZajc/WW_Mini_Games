import { BaseGame } from '../../core/BaseGame.js';
import { SessionLobby } from '../../core/SessionLobby.js';
import { modeGalleryMarkup, bindModeGallery } from '../../components/ModeGallery.js';
import {
    withModeProfiles, initializeModeSettings, switchModeSettings, syncActiveModeProfile,
} from '../../core/ModeSettings.js';
import {
    createReversi, reversiMoves, playReversi, chooseReversiMove,
    createCheckers, checkersMoves, playCheckers, chooseCheckersMove,
    createKalisto, KALISTO_SHAPES, transformKalistoShape, canPlaceKalisto,
    playKalisto, chooseKalistoMove, canPlaceKalistoPillar, playKalistoPillar,
    chooseKalistoPillar, isKalistoPlayableCell, isKalistoPillarForbiddenCell,
} from './board-model.js';
import {
    createLudoState, rollLudoDice, legalLudoMoves, applyLudoMove,
    passLudoTurn, chooseLudoMove, ludoGlobalField, normalizeLudoRules, validateLudoRules,
} from '../ludo/ludo-model.js';
import {
    createChess, chessMoves, playChess, chooseChessMove, chessInCheck, chessPieceGlyph,
} from './chess-model.js';
import WordTilesGame from '../word-tiles/game.js';
import ClassicPictureMemoryGame from '../classic-memory/game.js';
import GoGame from '../go-cube/game.js';
import { MEMORY_CATEGORIES, MEMORY_CATALOG } from '../classic-memory/catalog.js';
import { requireFiniteNumber, requireInteger, requirePositiveNumber } from '../../core/SettingsValidation.js';

const TAU = Math.PI * 2;

const MODES = {
    memory: { title: 'Classic Memory', description: 'Find matching image pairs on a grid or in an artfully scattered layout.', artKey: 'classic-board-memory' },
    go: { title: 'Go', description: 'Choose a traditional flat board or the seamless surface of a cube.', artKey: 'classic-board-go' },
    reversi: { title: 'Reversi', description: "Flank your opponent's discs and flip them to your colour.", artKey: 'classic-board-reversi' },
    checkers: { title: 'Checkers', description: 'Mandatory jumps, multi-captures, and crowned kings.', artKey: 'classic-board-checkers' },
    kalisto: { title: 'Callisto', description: 'Expand your territory from pillars and block off opponents.', artKey: 'classic-board-callisto' },
    ludo: { title: 'Ludo', description: 'Custom track, dice, tokens, and 2 to 6 players.', artKey: 'classic-board-ludo' },
    chess: { title: 'Chess', description: 'Standard chess with castling, en passant, promotion, and AI engine.', artKey: 'classic-board-chess' },
    scrabble: { title: 'Word Tiles', description: 'Letter placement crossword game with comprehensive dictionary.', artKey: 'classic-board-scrabble' },
};
const MODE_KEYS = Object.keys(MODES);
const CHILD_MODES = Object.freeze({ scrabble: WordTilesGame, memory: ClassicPictureMemoryGame, go: GoGame });
const GO_SETTINGS_SCHEMA = GoGame.getSettingsSchema();

function memoryCategoryOptions() {
    const available = new Set(MEMORY_CATALOG.map(item => item.category));
    return MEMORY_CATEGORIES.filter(option => option.value === 'mixed' || available.has(option.value));
}

function nestedGoSettingsSchema() {
    return GO_SETTINGS_SCHEMA.map(setting => ({
        ...setting,
        key: `go_${setting.key}`,
        group: `Go${setting.group ? ` · ${setting.group}` : ''}`,
        // The outer pause menu only knows that Go is active. Go's own submenu
        // continues to decide which topology is actually launched.
        modes: ['go'],
    }));
}

function settingsSchema() {
    return [
        { key: 'mode', label: 'Game', type: 'hidden', default: 'memory', modeProfile: false },
        { key: 'boardSize', label: 'Board size', type: 'range', min: 4, max: 20, step: 1, default: 8, modes: ['reversi', 'checkers'] },
        { key: 'checkerRows', label: 'Starting rows in Checkers', type: 'range', min: 1, max: 7, step: 1, default: 3, modes: ['checkers'] },
        { key: 'callistoBoardSize', label: 'Callisto board size', type: 'range', min: 12, max: 20, step: 1, default: 16, modes: ['kalisto'] },
        { key: 'callistoPlayerCount', label: 'Player count', type: 'range', min: 2, max: 4, step: 1, default: 2, modes: ['kalisto'] },
        { key: 'callistoTileCount', label: 'Tiles per player', type: 'range', min: 5, max: KALISTO_SHAPES.length, step: 1, default: KALISTO_SHAPES.length, modes: ['kalisto'] },
        { key: 'playerCount', label: 'Player count', type: 'range', min: 2, max: 6, step: 1, default: 4, modes: ['ludo'] },
        { key: 'trackFields', label: 'Track spaces', type: 'range', min: 12, max: 120, step: 1, default: 40, modes: ['ludo'] },
        { key: 'homeFields', label: 'Home column spaces', type: 'range', min: 2, max: 10, step: 1, default: 4, modes: ['ludo'] },
        { key: 'piecesPerPlayer', label: 'Tokens per player', type: 'range', min: 1, max: 8, step: 1, default: 4, modes: ['ludo'] },
        { key: 'diceSides', label: 'Dice sides', type: 'range', min: 4, max: 12, step: 1, default: 6, modes: ['ludo'] },
        { key: 'entryRoll', label: 'Roll to enter track', type: 'range', min: 1, max: 12, step: 1, default: 6, modes: ['ludo'] },
        { key: 'extraTurnOnMaximum', label: 'Extra roll on maximum roll', type: 'toggle', default: true, modes: ['ludo'] },
        { key: 'extraTurnOnCapture', label: 'Extra roll on capture', type: 'toggle', default: true, modes: ['ludo'] },
        { key: 'safeStartFields', label: 'Safe start spaces', type: 'toggle', default: true, modes: ['ludo'] },
        { key: 'chessAiDepth', label: 'Chess AI search depth', type: 'range', min: 1, max: 3, step: 1, default: 2, modes: ['chess'] },
        { key: 'wordBoardSize', label: 'Word board size (odd)', type: 'range', min: 9, max: 21, step: 2, default: 15, modes: ['scrabble'] },
        { key: 'wordRackSize', label: 'Rack tile capacity', type: 'range', min: 5, max: 12, step: 1, default: 7, modes: ['scrabble'] },
        { key: 'wordBingoBonus', label: 'Bonus for using entire rack', type: 'range', min: 0, max: 150, step: 5, default: 50, modes: ['scrabble'] },
        { key: 'wordAiScanLimit', label: 'Words evaluated per AI turn', type: 'range', min: 5000, max: 120000, step: 5000, default: 50000, modes: ['scrabble'] },
        { key: 'memoryPairCount', label: 'Image pair count', type: 'range', min: 2, max: 60, step: 1, default: 10, modes: ['memory'] },
        { key: 'memoryCategory', label: 'Image category', type: 'select', options: memoryCategoryOptions(), default: 'mixed', modes: ['memory'] },
        { key: 'memoryScattered', label: 'Scattered and rotated cards', type: 'toggle', default: true, modes: ['memory'] },
        { key: 'memoryMaxRotation', label: 'Maximum card rotation [°]', type: 'range', min: 0, max: 24, step: 1, default: 13, modes: ['memory'] },
        { key: 'memoryLabelsVisible', label: 'Card labels visible', type: 'toggle', default: true, modes: ['memory'] },
        { key: 'memoryRevealDelay', label: 'Mismatch reveal duration [s]', type: 'range', min: 0.25, max: 2.5, step: 0.05, default: 0.85, modes: ['memory'] },
        ...nestedGoSettingsSchema(),
        { key: 'aiDelay', label: 'AI think delay [s]', type: 'range', min: 0.1, max: 2, step: 0.05, default: 0.45 },
    ];
}

export default class ClassicBoardGame extends BaseGame {
    constructor() {
        super();
        this.supportsModeSelection = true;
    }

    init() {
        this.wantsPointerLock = false;
        document.querySelectorAll('.ludo-roll-button').forEach(button => button.remove());
        this.settings = initializeModeSettings(this.settings, MODE_KEYS, settingsSchema(), 'reversi');
        this.preparePauseSettings(this.settings);
        this.mode = this.settings.mode;
        this.phase = 'mode-select';
        this.state = null;
        this.session = null;
        this.child = null;
        this.selected = null;
        this.kalistoSelection = { shapeIndex: 0, rotation: 0, flipped: false, pillar: false };
        this.aiTimer = 0;
        this.layout = null;
        this.clickTargets = [];
        this.kalistoPaletteTargets = [];
        this.rollButton = null;
        this._keyDown = event => this._onKeyDown(event);
        this._wireParentInteractions();
        this._showModeSelector();
    }

    preparePauseSettings(settings) {
        const prepared = syncActiveModeProfile(settings, MODE_KEYS, settingsSchema(), 'reversi');
        const mode = prepared.mode || this.mode || 'reversi';
        const integer = (value, label, options = {}) => requireInteger(value, label, options);
        if (mode === 'reversi') {
            const size = integer(prepared.boardSize, 'Reversi board size', { minimum: 4 });
            if (size % 2) throw new Error('Reversi board size must be even.');
        } else if (mode === 'checkers') {
            const size = integer(prepared.boardSize, 'Checkers board size', { minimum: 6 });
            if (size % 2) throw new Error('Checkers board size must be even.');
            const rows = integer(prepared.checkerRows, 'Initial checkers rows', { minimum: 1 });
            if (rows > Math.floor(size / 2) - 1) throw new Error('Initial checkers rows must leave at least one empty row between the players.');
        } else if (mode === 'kalisto') {
            integer(prepared.callistoBoardSize, 'Callisto board size', { minimum: 8 });
            integer(prepared.callistoPlayerCount, 'Callisto player count', { minimum: 2, maximum: 4 });
            integer(prepared.callistoTileCount, 'Callisto tiles per player', { minimum: 5, maximum: KALISTO_SHAPES.length });
        } else if (mode === 'ludo') {
            validateLudoRules(prepared);
        } else if (mode === 'chess') {
            integer(prepared.chessAiDepth, 'Chess AI depth', { minimum: 1 });
        } else if (mode === 'scrabble') {
            const size = integer(prepared.wordBoardSize, 'Word board size', { minimum: 1 });
            if (!(size % 2)) throw new Error('Word board size must be odd.');
            integer(prepared.wordRackSize, 'Word rack size', { minimum: 1 });
            requireFiniteNumber(prepared.wordBingoBonus, 'Word-rack bonus', { minimum: 0 });
            integer(prepared.wordAiScanLimit, 'Words scanned per move', { minimum: 1 });
            requireFiniteNumber(prepared.aiDelay, 'Computer delay', { minimum: 0 });
        } else if (mode === 'memory') {
            integer(prepared.memoryPairCount, 'Memory pairs', { minimum: 2 });
            requireFiniteNumber(prepared.memoryMaxRotation, 'Maximum card rotation', { minimum: 0 });
            requireFiniteNumber(prepared.memoryRevealDelay, 'Memory reveal delay', { minimum: 0 });
            requireFiniteNumber(prepared.aiDelay, 'Computer delay', { minimum: 0 });
        } else if (mode === 'go') {
            new GoGame().preparePauseSettings(this._childSettings('go', prepared));
        }
        return prepared;
    }

    _wireParentInteractions() {
        this.network.clearCallbacks();
        this.network.onConnect(info => this.lobby?.handleConnect(info));
        this.network.onDisconnect(info => {
            if (this.lobby) this.lobby.handleDisconnect(info);
            else if (this.session?.isHost && info.peerId) delete this.session.peerSeats?.[info.peerId];
        });
        this.network.onMessage((message, info) => {
            if (this.lobby?.handleMessage(message)) return;
            this._onNetworkMessage(message, info);
        });
        if (!this._keyAttached) { window.addEventListener('keydown', this._keyDown); this._keyAttached = true; }
    }

    _unwireParentInteractions() {
        this.network.clearCallbacks();
        if (this._keyAttached) { window.removeEventListener('keydown', this._keyDown); this._keyAttached = false; }
    }

    _showModeSelector() {
        this.phase = 'mode-select';
        this.lobby?.destroy(); this.lobby = null;
        this._removeRollButton();
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Classic Board Games', prompt: 'Choose a game',
            modes: MODE_KEYS.map(key => ({ key, ...MODES[key] })), selectedMode: this.mode,
        });
        this._modeHandler = bindModeGallery(this.modeSelector, {
            onMode: mode => this._chooseMode(mode), onBack: () => this.endGame(),
        });
        document.body.appendChild(this.modeSelector);
    }

    async _chooseMode(mode) {
        this.settings = switchModeSettings(this.settings, mode, MODE_KEYS, settingsSchema(), 'reversi');
        this.mode = mode;
        try {
            this.preparePauseSettings(this.settings);
        } catch (error) {
            let message = this.modeSelector?.querySelector('[data-size-error]');
            if (!message && this.modeSelector) {
                message = document.createElement('div');
                message.dataset.sizeError = 'true';
                this.modeSelector.appendChild(message);
            }
            if (message) {
                message.textContent = error.message;
                message.style.cssText = 'margin:10px 0;color:#b3261e;font-weight:800;font-size:12px;';
            }
            return false;
        }
        this.app.currentSettings = { ...this.settings };
        await this.app.settingsManager.save(this.app.currentConfig._id, this.settings);
        this.modeSelector?.remove(); this.modeSelector = null;
        if (CHILD_MODES[mode]) { this._startChildMode(mode); return; }
        this.phase = 'lobby';
        const players = mode === 'ludo'
            ? normalizeLudoRules(this.settings).playerCount
            : (mode === 'kalisto' ? Math.round(Number(this.settings.callistoPlayerCount)) : 2);
        this.lobby = new SessionLobby(this, {
            title: MODES[mode].title, players,
            onStart: session => this._startSession(session),
        });
    }

    returnToModeSelector() {
        if (this.child?.supportsModeSelection
            && this.child.phase !== 'mode-select'
            && typeof this.child.returnToModeSelector === 'function') {
            this.child.returnToModeSelector();
            return;
        }
        this._destroyChild();
        if (this.session?.mode === 'lan') this.network.close();
        this.session = null; this.state = null; this.selected = null;
        this._removeRollButton();
        this._wireParentInteractions();
        this._showModeSelector();
    }

    _childSettings(mode, source = this.settings) {
        if (mode === 'scrabble') return {
            boardSize: Number(source.wordBoardSize ?? 15),
            rackSize: Number(source.wordRackSize ?? 7),
            bingoBonus: Number(source.wordBingoBonus ?? 50),
            aiScanLimit: Number(source.wordAiScanLimit ?? 50000),
            aiDelay: Number(source.aiDelay ?? .45),
        };
        if (mode === 'go') return Object.fromEntries(GO_SETTINGS_SCHEMA.map(setting => [
            setting.key,
            source[`go_${setting.key}`] ?? setting.default,
        ]));
        const category = source.memoryCategory || 'mixed';
        const categoryAvailable = category === 'mixed' || MEMORY_CATALOG.some(item => item.category === category);
        const effectiveCategory = categoryAvailable ? category : 'mixed';
        const availablePairs = effectiveCategory === 'mixed'
            ? MEMORY_CATALOG.length
            : MEMORY_CATALOG.filter(item => item.category === effectiveCategory).length;
        const requestedPairs = Number(source.memoryPairCount ?? 10);
        return {
            pairCount: Math.max(2, Math.min(
                Number.isFinite(requestedPairs) ? Math.round(requestedPairs) : 10,
                Math.max(2, availablePairs),
            )),
            category: effectiveCategory,
            scattered: source.memoryScattered !== false,
            maxRotation: Number(source.memoryMaxRotation ?? 13),
            labelsVisible: source.memoryLabelsVisible !== false,
            revealDelay: Number(source.memoryRevealDelay ?? .85),
            aiDelay: Number(source.aiDelay ?? .45),
        };
    }

    _startChildMode(mode) {
        const GameClass = CHILD_MODES[mode]; if (!GameClass) return;
        this._unwireParentInteractions();
        this.phase = 'child'; this.state = null; this.session = null;
        const childSettings = this._childSettings(mode);
        const childApp = Object.assign(Object.create(this.app), { currentSettings: { ...childSettings } });
        if (mode === 'go') {
            childApp.settingsManager = Object.assign(Object.create(this.app.settingsManager), {
                save: async (_standaloneGameId, nextSettings) => {
                    for (const setting of GO_SETTINGS_SCHEMA) {
                        this.settings[`go_${setting.key}`] = nextSettings?.[setting.key] ?? setting.default;
                    }
                    this.app.currentSettings = { ...this.settings };
                    return this.app.settingsManager.save(this.app.currentConfig._id, this.settings);
                },
            });
        }
        this.child = new GameClass();
        this.child._setup(
            this.canvas, this.ctx, this.input, this.audio, childSettings,
            results => this.submitScore({ ...results, mode }),
            () => this.returnToModeSelector(),
            this.network, childApp, this.mobile,
        );
    }

    _destroyChild() {
        this.child?.destroy?.(); this.child = null;
    }

    _createState(seed) {
        if (this.mode === 'ludo') return createLudoState(normalizeLudoRules(this.settings), seed);
        if (this.mode === 'chess') return { ...createChess(), seed };
        const size = Number(this.settings.boardSize ?? 8);
        if (this.mode === 'checkers') return { ...createCheckers(size, Number(this.settings.checkerRows ?? 3)), seed };
        if (this.mode === 'kalisto') return {
            ...createKalisto(
                Number(this.settings.callistoBoardSize ?? 16),
                Number(this.settings.callistoTileCount ?? KALISTO_SHAPES.length),
                Number(this.settings.callistoPlayerCount ?? 2),
            ),
            seed,
        };
        return { ...createReversi(size), seed };
    }

    _startSession(session) {
        this.lobby = null; this.session = session; this.phase = 'playing';
        this.state = this._createState(session.seed ?? Date.now());
        this.selected = null;
        if (this.mode === 'ludo') this._ensureRollButton();
        if (session.mode === 'lan' && session.isHost) this._broadcastState();
    }

    _currentSeat() {
        if (!this.state) return null;
        return this.mode === 'ludo' ? this.state.turn : this.state.player - 1;
    }

    _controlledByHuman(player = null) {
        if (!this.session) return false;
        if (this.session.mode === 'hotseat') return true;
        // In a solo room seat 0 is the human and every other seat is the
        // local heuristic opponent.  Treating the session's default seat as
        // human for all turns would silently disable the single-player AI.
        const seat = player === null ? this._currentSeat() : Number(player) - 1;
        if (this.session.mode === 'solo') return seat === 0;
        return seat === this.session.seat;
    }

    _hostControlsState() { return this.session?.mode !== 'lan' || this.session?.isHost; }
    _controlledByRemote() {
        return this.session?.mode === 'lan' && this.session.isHost
            && Object.values(this.session.peerSeats || {}).includes(this._currentSeat());
    }

    _requestAction(action) {
        if (!this.state || !this._controlledByHuman()) return;
        if (this.session.mode === 'lan' && !this.session.isHost) this.network.send({ type: 'board-action', action });
        else this._applyAction(action, this._currentSeat());
    }

    _applyAction(action, seat) {
        if (!this._hostControlsState() || seat !== this._currentSeat() || this.state.winner !== null) return;
        if (this.mode === 'ludo') {
            this._applyLudoAction(action);
            return;
        }
        let played = false;
        if (this.mode === 'reversi' && action.kind === 'cell') played = playReversi(this.state, action.row, action.column);
        if (this.mode === 'checkers' && action.kind === 'checker-move') played = playCheckers(this.state, action.move);
        if (this.mode === 'chess' && action.kind === 'chess-move') played = playChess(this.state, action.move);
        if (this.mode === 'kalisto' && action.kind === 'kalisto-place') played = playKalisto(this.state, action.placement);
        if (this.mode === 'kalisto' && action.kind === 'kalisto-pillar') played = playKalistoPillar(this.state, action.row, action.column);
        if (!played) return;
        this.selected = (this.mode === 'checkers' && this.state.forced)
            ? { row: this.state.forced[0], column: this.state.forced[1] }
            : null;
        this.audio.playClick();
        if (this.state.winner !== null) {
            this.audio.playSuccess();
            this.submitScore({ mode: this.mode, winner: this.state.winner, seed: this.state.seed });
        }
        this._broadcastState();
    }

    _applyLudoAction(action) {
        if (action.kind === 'ludo-roll' && this.state.phase === 'roll') {
            const dice = rollLudoDice(this.state);
            if (dice === null) return;
            this.audio.playBeep(180 + dice * 45, 0.08, 0.25);
            if (!legalLudoMoves(this.state).length) {
                this.state.phase = 'pass';
                this.aiTimer = Number(this.settings.aiDelay ?? 0.8);
            }
        } else if (action.kind === 'ludo-move' && this.state.phase === 'move') {
            const result = applyLudoMove(this.state, Number(action.piece));
            if (!result.ok) return;
            result.captured ? this.audio.playTone(250, 0.18, 'sawtooth', 0.22) : this.audio.playClick();
            if (result.won) {
                this.audio.playSuccess();
                this.submitScore({ mode: this.mode, winner: this.state.winner + 1, turns: this.state.turnNumber, seed: this.state.seed });
            }
        } else return;
        this._broadcastState();
        this._syncRollButton();
    }

    _broadcastState() {
        if (this.session?.mode === 'lan' && this.session.isHost) this.network.send({ type: 'board-state', state: this.state });
    }

    _onNetworkMessage(message, info) {
        if (message?.type === 'board-state' && !this.session?.isHost) {
            this.state = message.state; this.selected = null;
            this._syncRollButton();
        } else if (message?.type === 'board-action' && this.session?.isHost) {
            this._applyAction(message.action, this.session.peerSeats?.[info.peerId]);
        }
    }

    _onKeyDown(event) {
        if (this.phase !== 'playing' || this.mode !== 'kalisto' || !this.state) return;
        const remaining = this.state.remaining[this.state.player];
        if (event.code === 'KeyQ') { this.kalistoSelection.rotation = (this.kalistoSelection.rotation + 3) % 4; this.kalistoSelection.pillar = false; }
        if (event.code === 'KeyE') { this.kalistoSelection.rotation = (this.kalistoSelection.rotation + 1) % 4; this.kalistoSelection.pillar = false; }
        if (event.code === 'KeyF') { this.kalistoSelection.flipped = !this.kalistoSelection.flipped; this.kalistoSelection.pillar = false; }
        if (event.code === 'KeyC' && this.state.phase === 'pieces' && this.state.pillarsRemaining[this.state.player] > 0) this.kalistoSelection.pillar = true;
        const digit = Number(event.key);
        if (digit >= 1 && digit <= 9 && remaining[digit - 1] !== undefined) {
            this.kalistoSelection.shapeIndex = remaining[digit - 1]; this.kalistoSelection.pillar = false;
        }
    }

    update(dt) {
        if (this.child) { this.child.update(dt); return; }
        if (!this.state || this.phase !== 'playing') return;
        if (this.mode === 'ludo') { this._updateLudo(dt); return; }
        if (this.state.winner !== null) return;
        if (this._hostControlsState() && !this._controlledByHuman() && !this._controlledByRemote()) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                this.aiTimer = Number(this.settings.aiDelay ?? .45);
                let action = null;
                if (this.mode === 'reversi') { const move = chooseReversiMove(this.state); if (move) action = { kind: 'cell', ...move }; }
                if (this.mode === 'checkers') { const move = chooseCheckersMove(this.state); if (move) action = { kind: 'checker-move', move }; }
                if (this.mode === 'chess') { const move = chooseChessMove(this.state, this.settings.chessAiDepth); if (move) action = { kind: 'chess-move', move }; }
                if (this.mode === 'kalisto') {
                    if (this.state.phase === 'pillars') {
                        const pillar = chooseKalistoPillar(this.state); if (pillar) action = { kind: 'kalisto-pillar', ...pillar };
                    } else {
                        const placement = chooseKalistoMove(this.state);
                        if (placement) action = { kind: 'kalisto-place', placement };
                        else {
                            const pillar = chooseKalistoPillar(this.state); if (pillar) action = { kind: 'kalisto-pillar', ...pillar };
                        }
                    }
                }
                if (action) this._applyAction(action, this._currentSeat());
            }
            return;
        }
        this.aiTimer = Number(this.settings.aiDelay ?? .45);
        if (!this.input.isMouseJustDown(0)) return;
        const mouse = this.input.getMousePos();
        if (this.mode === 'kalisto') {
            const palette = this.kalistoPaletteTargets.find(item => mouse.x >= item.x && mouse.x <= item.x + item.w && mouse.y >= item.y && mouse.y <= item.y + item.h);
            if (palette) {
                if (palette.kind === 'pillar') this.kalistoSelection.pillar = true;
                else if (palette.kind === 'shape') { this.kalistoSelection.shapeIndex = palette.shapeIndex; this.kalistoSelection.pillar = false; }
                else if (palette.kind === 'rot-cw') { this.kalistoSelection.rotation = (this.kalistoSelection.rotation + 1) % 4; this.kalistoSelection.pillar = false; }
                else if (palette.kind === 'rot-ccw') { this.kalistoSelection.rotation = (this.kalistoSelection.rotation + 3) % 4; this.kalistoSelection.pillar = false; }
                else if (palette.kind === 'flip') { this.kalistoSelection.flipped = !this.kalistoSelection.flipped; this.kalistoSelection.pillar = false; }
                return;
            }
        }
        const cell = this._cellAt(mouse);
        if (!cell) return;
        if (this.mode === 'reversi') this._requestAction({ kind: 'cell', ...cell });
        else if (this.mode === 'checkers') this._checkerClick(cell);
        else if (this.mode === 'chess') this._chessClick(cell);
        else this._kalistoClick(cell);
    }

    _updateLudo(dt) {
        this._syncRollButton();
        if (this.state.winner !== null) return;
        if (this.state.phase === 'pass') {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0 || (this._controlledByHuman() && this.input.isMouseJustDown(0))) {
                passLudoTurn(this.state);
                this._broadcastState();
                this._syncRollButton();
            }
            return;
        }
        if (this._hostControlsState() && !this._controlledByHuman() && !this._controlledByRemote()) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                this.aiTimer = Number(this.settings.aiDelay ?? 0.45);
                if (this.state.phase === 'roll') this._applyAction({ kind: 'ludo-roll' }, this._currentSeat());
                else {
                    const piece = chooseLudoMove(this.state);
                    if (piece === null) {
                        passLudoTurn(this.state);
                        this._broadcastState();
                        this._syncRollButton();
                    } else this._applyAction({ kind: 'ludo-move', piece }, this._currentSeat());
                }
            }
        } else this.aiTimer = Number(this.settings.aiDelay ?? 0.45);

        if (this.state.phase === 'move' && this._controlledByHuman() && this.input.isMouseJustDown(0)) {
            const mouse = this.input.getMousePos();
            const target = [...this.clickTargets].reverse().find(item => Math.hypot(mouse.x - item.x, mouse.y - item.y) <= item.r);
            if (target) this._requestAction({ kind: 'ludo-move', piece: target.piece });
        }
    }

    _ensureRollButton() {
        this._removeRollButton();
        document.querySelectorAll('.ludo-roll-button').forEach(button => button.remove());
        this.rollButton = document.createElement('button');
        this.rollButton.className = 'ludo-roll-button';
        this.rollButton.type = 'button';
        this.rollButton.textContent = 'ROLL DICE';
        this.rollButton.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:720;height:34px;padding:0 15px;border:1px solid #176d25;border-radius:6px;background:linear-gradient(#73d44e,#329b34);color:#fff;font:800 11px Inter;cursor:pointer;box-shadow:inset 0 1px #d8ffc8,0 3px 8px rgba(20,70,30,.3)';
        this._rollClick = () => this._requestAction({ kind: 'ludo-roll' });
        this.rollButton.addEventListener('click', this._rollClick);
        document.body.appendChild(this.rollButton);
        this._syncRollButton();
    }

    _removeRollButton() {
        this.rollButton?.removeEventListener('click', this._rollClick);
        this.rollButton?.remove();
        document.querySelectorAll('.ludo-roll-button').forEach(button => button.remove());
        this.rollButton = null;
        this._rollClick = null;
    }

    _syncRollButton() {
        if (!this.rollButton || !this.state) return;
        const active = this.mode === 'ludo' && this.state.phase === 'roll'
            && this.state.winner === null && this._controlledByHuman();
        this.rollButton.disabled = !active;
        this.rollButton.style.opacity = active ? '1' : '.45';
        this.rollButton.style.cursor = active ? 'pointer' : 'default';
    }

    _checkerClick(cell) {
        if (this.state.forced) {
            const valid = checkersMoves(this.state, this.state.player, this.state.forced)
                .some(candidate => candidate.to[0] === cell.row && candidate.to[1] === cell.column);
            if (valid) {
                this._requestAction({ kind: 'checker-move', move: { from: this.state.forced, to: [cell.row, cell.column] } });
            }
            return;
        }
        const piece = this.state.grid[cell.row][cell.column];
        if (Math.abs(piece) === this.state.player) {
            this.selected = (this.selected?.row === cell.row && this.selected?.column === cell.column) ? null : cell;
            return;
        }
        if (!this.selected) return;
        const valid = checkersMoves(this.state, this.state.player, [this.selected.row, this.selected.column])
            .some(candidate => candidate.to[0] === cell.row && candidate.to[1] === cell.column);
        if (valid) {
            this._requestAction({ kind: 'checker-move', move: { from: [this.selected.row, this.selected.column], to: [cell.row, cell.column] } });
        } else {
            this.selected = null;
        }
    }

    _chessClick(cell) {
        const piece = this.state.board[cell.row][cell.column];
        if (this.selected && this.selected.row === cell.row && this.selected.column === cell.column) {
            this.selected = null;
            return;
        }
        if (piece?.[0] === (this.state.player === 1 ? 'w' : 'b')) {
            this.selected = cell;
            return;
        }
        if (!this.selected) return;
        const valid = chessMoves(this.state).some(candidate =>
            candidate.from[0] === this.selected.row && candidate.from[1] === this.selected.column
            && candidate.to[0] === cell.row && candidate.to[1] === cell.column);
        if (valid) {
            this._requestAction({ kind: 'chess-move', move: { from: [this.selected.row, this.selected.column], to: [cell.row, cell.column] } });
        } else {
            this.selected = null;
        }
    }

    _kalistoClick(cell) {
        if (this.state.phase === 'pillars') {
            if (canPlaceKalistoPillar(this.state, cell.row, cell.column)) this._requestAction({ kind: 'kalisto-pillar', ...cell });
            return;
        }
        if (this.kalistoSelection.pillar) {
            if (canPlaceKalistoPillar(this.state, cell.row, cell.column)) this._requestAction({ kind: 'kalisto-pillar', ...cell });
            return;
        }
        const remaining = this.state.remaining[this.state.player];
        if (!remaining.includes(this.kalistoSelection.shapeIndex)) this.kalistoSelection.shapeIndex = remaining[0];
        if (this.kalistoSelection.shapeIndex === undefined) return;
        const placement = { ...this.kalistoSelection, row: cell.row, column: cell.column };
        const shape = transformKalistoShape(KALISTO_SHAPES[placement.shapeIndex], placement.rotation, placement.flipped);
        const cells = shape.map(([r, c]) => [r + cell.row, c + cell.column]);
        if (canPlaceKalisto(this.state, this.state.player, cells)) this._requestAction({ kind: 'kalisto-place', placement });
    }

    _boardLayout() {
        const max = Math.min(this.w - 220, this.h - 120, 780);
        const cell = Math.max(16, Math.floor(max / this.state.size));
        const board = cell * this.state.size;
        return { cell, board, x: Math.max(18, (this.w - board) / 2), y: Math.max(72, (this.h - board) / 2 + 18) };
    }

    _cellAt(mouse) {
        if (!this.layout) return null;
        const column = Math.floor((mouse.x - this.layout.x) / this.layout.cell);
        const row = Math.floor((mouse.y - this.layout.y) / this.layout.cell);
        return row >= 0 && row < this.state.size && column >= 0 && column < this.state.size ? { row, column } : null;
    }

    _ludoTrackPoint(globalField, radius, cx, cy) {
        const angle = -Math.PI / 2 + TAU * globalField / this.state.rules.trackFields;
        return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    }

    _ludoPiecePoint(player, piece, position, radius, cx, cy) {
        const rules = this.state.rules;
        if (position === -1) {
            const angle = -Math.PI / 2 + TAU * player / rules.playerCount;
            const spread = Math.min(28, radius * 0.13);
            return {
                x: cx + Math.cos(angle) * radius * 0.61 + ((piece % 3) - 1) * spread,
                y: cy + Math.sin(angle) * radius * 0.61 + (Math.floor(piece / 3) - 0.5) * spread,
            };
        }
        if (position < rules.trackFields) {
            return this._ludoTrackPoint(ludoGlobalField(this.state, player, position), radius, cx, cy);
        }
        const angle = -Math.PI / 2 + TAU * player / rules.playerCount;
        const homeStep = position - rules.trackFields + 1;
        const fraction = 1 - homeStep / (rules.homeFields + 1);
        return { x: cx + Math.cos(angle) * radius * fraction, y: cy + Math.sin(angle) * radius * fraction };
    }

    render() {
        if (this.child) { this.child.render(); return; }
        const ctx = this.ctx;
        const gradient = ctx.createLinearGradient(0, 0, 0, this.h); gradient.addColorStop(0, '#69c9f2'); gradient.addColorStop(1, '#c3edfb');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.w, this.h);
        if (!this.state) return;
        if (this.mode === 'ludo') { this._renderLudo(); return; }
        if (this.mode === 'chess') { this._renderChess(); return; }
        this.layout = this._boardLayout();
        const { x, y, cell, board } = this.layout;
        ctx.fillStyle = '#31433b'; ctx.fillRect(x - 5, y - 5, board + 10, board + 10);
        for (let row = 0; row < this.state.size; row++) for (let column = 0; column < this.state.size; column++) {
            const px = x + column * cell, py = y + row * cell;
            if (this.mode === 'checkers') ctx.fillStyle = (row + column) % 2 ? '#638353' : '#efe1bc';
            else if (this.mode === 'kalisto') {
                ctx.fillStyle = !isKalistoPlayableCell(this.state, row, column)
                    ? '#48504d'
                    : (isKalistoPillarForbiddenCell(this.state, row, column) ? '#abb2b0' : 'rgba(241,248,246,.74)');
            } else ctx.fillStyle = '#3b9b55';
            ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
            const value = this.state.grid[row][column];
            if (this.mode === 'kalisto' && isKalistoPlayableCell(this.state, row, column)) {
                if (value) this._drawKalistoCell(px, py, cell, value, this.state.pillars.some(pillar => pillar.row === row && pillar.column === column));
                else {
                    ctx.beginPath(); ctx.arc(px + cell / 2, py + cell / 2, Math.max(1.5, cell * 0.11), 0, TAU);
                    ctx.fillStyle = 'rgba(119,145,137,.28)'; ctx.fill();
                }
            } else if (value) this._drawPiece(px + cell / 2, py + cell / 2, cell * .36, value);
        }
        if (this.mode === 'reversi') this._renderReversiHints();
        if (this.mode === 'checkers') this._renderCheckerSelection();
        if (this.mode === 'reversi') this._renderReversiHints();
        if (this.mode === 'checkers') this._renderCheckerSelection();
        if (this.mode === 'kalisto') {
            this._renderKalistoHover();
            this._renderKalistoPalette();
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#24342a'; ctx.font = '900 19px Inter';
        const status = this.state.winner === null ? `Turn: Player ${this.state.player}` : (this.state.winner ? `Winner: Player ${this.state.winner}` : 'Draw');
        ctx.fillText(`${MODES[this.mode].title} · ${status}`, 18, 32);
        ctx.font = '12px Inter'; ctx.fillStyle = '#4c6559'; ctx.fillText(this.state.lastEvent, 18, 52);
    }

    _renderChess() {
        const ctx = this.ctx; this.layout = this._boardLayout();
        const { x, y, cell, board } = this.layout;
        ctx.fillStyle = '#26352f'; ctx.fillRect(x - 6, y - 6, board + 12, board + 12);
        const legal = this.selected ? chessMoves(this.state).filter(move => move.from[0] === this.selected.row && move.from[1] === this.selected.column) : [];
        for (let row = 0; row < 8; row++) for (let column = 0; column < 8; column++) {
            const px = x + column * cell, py = y + row * cell;
            ctx.fillStyle = (row + column) % 2 ? '#6f8d58' : '#f0dfb5'; ctx.fillRect(px, py, cell, cell);
            if (this.state.lastMove && (this.state.lastMove.from[0] === row && this.state.lastMove.from[1] === column
                || this.state.lastMove.to[0] === row && this.state.lastMove.to[1] === column)) {
                ctx.fillStyle = 'rgba(255,216,62,.34)'; ctx.fillRect(px, py, cell, cell);
            }
            if (this.selected?.row === row && this.selected?.column === column) {
                ctx.strokeStyle = '#ffd83e'; ctx.lineWidth = 4; ctx.strokeRect(px + 2, py + 2, cell - 4, cell - 4);
            }
            const move = legal.find(candidate => candidate.to[0] === row && candidate.to[1] === column);
            if (move) {
                ctx.beginPath(); ctx.arc(px + cell / 2, py + cell / 2, this.state.board[row][column] ? cell * .42 : cell * .12, 0, TAU);
                if (this.state.board[row][column]) { ctx.strokeStyle = 'rgba(255,216,62,.9)'; ctx.lineWidth = 5; ctx.stroke(); }
                else { ctx.fillStyle = 'rgba(255,216,62,.84)'; ctx.fill(); }
            }
            const piece = this.state.board[row][column];
            if (piece) {
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = `${Math.max(24, cell * .73)}px "Segoe UI Symbol", serif`;
                ctx.lineWidth = Math.max(1.5, cell * .025);
                ctx.strokeStyle = piece[0] === 'w' ? '#25312b' : '#f6ecd4';
                ctx.fillStyle = piece[0] === 'w' ? '#fffaf0' : '#18211d';
                const glyph = chessPieceGlyph(piece); ctx.strokeText(glyph, px + cell / 2, py + cell / 2 + cell * .02); ctx.fillText(glyph, px + cell / 2, py + cell / 2 + cell * .02);
            }
        }
        ctx.fillStyle = 'rgba(255,255,255,.65)';
        ctx.font = '700 11px Inter';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (let col = 0; col < 8; col++) {
            ctx.fillText(String.fromCharCode(97 + col), x + col * cell + cell / 2, y + board + 8);
        }
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (let r = 0; r < 8; r++) {
            ctx.fillText(String(8 - r), x - 10, y + r * cell + cell / 2);
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#24342a'; ctx.font = '900 19px Inter';
        const status = this.state.winner === null
            ? `Turn: ${this.state.player === 1 ? 'White' : 'Black'}${chessInCheck(this.state) ? ' · CHECK' : ''}`
            : (this.state.winner ? `Winner: Player ${this.state.winner}` : 'Draw');
        ctx.fillText(`Chess · ${status}`, 18, 32);
        ctx.font = '12px Inter'; ctx.fillStyle = '#4c6559'; ctx.fillText(this.state.lastEvent, 18, 52);
    }

    _renderLudo() {
        const ctx = this.ctx;
        const cx = this.w / 2, cy = this.h / 2 + 12;
        const radius = Math.max(110, Math.min(this.w, this.h) * 0.36);
        ctx.fillStyle = 'rgba(255,255,255,.88)';
        ctx.beginPath(); ctx.arc(cx, cy, radius + 25, 0, TAU); ctx.fill();
        const fieldRadius = Math.max(4, Math.min(10, TAU * radius / this.state.rules.trackFields * 0.31));
        const starts = new Set(Array.from({ length: this.state.rules.playerCount }, (_, player) => ludoGlobalField(this.state, player, 0)));
        for (let field = 0; field < this.state.rules.trackFields; field++) {
            const point = this._ludoTrackPoint(field, radius, cx, cy);
            ctx.beginPath(); ctx.arc(point.x, point.y, fieldRadius, 0, TAU);
            ctx.fillStyle = starts.has(field) ? '#f7d84b' : '#f8fff5'; ctx.fill();
            ctx.strokeStyle = '#49675a'; ctx.lineWidth = 1; ctx.stroke();
        }
        this.state.players.forEach((player, index) => {
            const angle = -Math.PI / 2 + TAU * index / this.state.rules.playerCount;
            ctx.strokeStyle = player.color; ctx.lineWidth = Math.max(5, fieldRadius * 1.05);
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * radius * 0.12, cy + Math.sin(angle) * radius * 0.12);
            ctx.lineTo(cx + Math.cos(angle) * radius * 0.82, cy + Math.sin(angle) * radius * 0.82); ctx.stroke();
        });
        this.clickTargets = [];
        const legal = new Set(legalLudoMoves(this.state).map(move => move.piece));
        this.state.players.forEach((player, playerIndex) => {
            player.pieces.forEach((position, piece) => {
                const point = this._ludoPiecePoint(playerIndex, piece, position, radius, cx, cy);
                const movable = playerIndex === this.state.turn && legal.has(piece);
                const pieceRadius = Math.max(7, fieldRadius * 1.15);
                if (movable) {
                    ctx.beginPath(); ctx.arc(point.x, point.y, pieceRadius + 5, 0, TAU);
                    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
                    this.clickTargets.push({ ...point, r: pieceRadius + 7, piece });
                }
                ctx.beginPath(); ctx.arc(point.x, point.y, pieceRadius, 0, TAU);
                ctx.fillStyle = player.color; ctx.fill(); ctx.strokeStyle = '#263b32'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(8, pieceRadius)}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(String(piece + 1), point.x, point.y + 0.5);
            });
        });
        ctx.fillStyle = '#263b32'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = '900 19px Inter';
        const status = this.state.winner === null ? `Turn: Player ${this.state.turn + 1}` : `Winner: Player ${this.state.winner + 1}`;
        ctx.fillText(`${MODES[this.mode].title} · ${status}`, 20, 34);
        ctx.font = '12px Inter'; ctx.fillStyle = '#49675a'; ctx.fillText(this.state.lastEvent, 20, 54);
        ctx.textAlign = 'center'; ctx.font = '900 34px Inter'; ctx.fillStyle = '#263b32';
        ctx.fillText(this.state.dice === null ? '–' : String(this.state.dice), cx, cy + 10);
    }

    _drawPiece(x, y, radius, value) {
        const ctx = this.ctx;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
        if (this.mode === 'kalisto') ctx.fillStyle = value === 1 ? '#3586e6' : '#ef643e';
        else if (this.mode === 'reversi') ctx.fillStyle = value === 1 ? '#20272b' : '#f5f3e8';
        else ctx.fillStyle = Math.abs(value) === 1 ? '#f5f3e8' : '#20272b';
        ctx.fill(); ctx.strokeStyle = '#26352f'; ctx.lineWidth = 2; ctx.stroke();
        if (this.mode === 'checkers' && value < 0) {
            ctx.fillStyle = Math.abs(value) === 1 ? '#26352f' : '#f5f3e8'; ctx.font = `900 ${radius}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', x, y);
        }
    }

    _drawKalistoCell(x, y, size, player, pillar) {
        const colors = ['#000', '#e94a3f', '#405be0', '#f0a22e', '#4eaf5c'];
        const ctx = this.ctx;
        ctx.fillStyle = colors[player] || '#8d58c8'; ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
        ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, Math.max(2.5, size * (pillar ? 0.28 : 0.17)), 0, TAU);
        ctx.fillStyle = pillar ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.24)'; ctx.fill();
        ctx.strokeStyle = 'rgba(35,45,43,.5)'; ctx.lineWidth = pillar ? 2 : 1; ctx.stroke();
    }

    _renderReversiHints() {
        if (!this._controlledByHuman()) return;
        const { x, y, cell } = this.layout; const ctx = this.ctx;
        for (const move of reversiMoves(this.state)) {
            ctx.beginPath(); ctx.arc(x + (move.column + .5) * cell, y + (move.row + .5) * cell, Math.max(2.5, cell * .09), 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.fill();
        }
    }

    _renderCheckerSelection() {
        if (!this.selected) return;
        const { x, y, cell } = this.layout, ctx = this.ctx;
        ctx.strokeStyle = '#ffd73d'; ctx.lineWidth = 4; ctx.strokeRect(x + this.selected.column * cell + 2, y + this.selected.row * cell + 2, cell - 4, cell - 4);
        for (const move of checkersMoves(this.state, this.state.player, [this.selected.row, this.selected.column])) {
            ctx.beginPath(); ctx.arc(x + (move.to[1] + .5) * cell, y + (move.to[0] + .5) * cell, cell * .12, 0, Math.PI * 2); ctx.fillStyle = '#ffd73d'; ctx.fill();
        }
    }

    _renderKalistoHover() {
        if (!this._controlledByHuman() || this.state.winner !== null) return;
        const mouse = this.input.getMousePos();
        const cell = this._cellAt(mouse);
        if (!cell) return;
        const ctx = this.ctx, { x, y, cell: cellSize } = this.layout;
        if (this.state.phase === 'pillars' || this.kalistoSelection.pillar) {
            const valid = canPlaceKalistoPillar(this.state, cell.row, cell.column);
            const px = x + cell.column * cellSize, py = y + cell.row * cellSize;
            ctx.fillStyle = valid ? 'rgba(78, 200, 90, 0.45)' : 'rgba(235, 60, 50, 0.35)';
            ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
            ctx.beginPath();
            ctx.arc(px + cellSize / 2, py + cellSize / 2, Math.max(3, cellSize * 0.28), 0, TAU);
            ctx.fillStyle = valid ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 100, 100, 0.5)';
            ctx.fill();
            return;
        }
        const remaining = this.state.remaining[this.state.player];
        if (!remaining.includes(this.kalistoSelection.shapeIndex)) return;
        const shape = transformKalistoShape(KALISTO_SHAPES[this.kalistoSelection.shapeIndex], this.kalistoSelection.rotation, this.kalistoSelection.flipped);
        const cells = shape.map(([r, c]) => [r + cell.row, c + cell.column]);
        const valid = canPlaceKalisto(this.state, this.state.player, cells);
        const color = valid ? 'rgba(64, 160, 255, 0.5)' : 'rgba(235, 60, 50, 0.35)';
        for (const [r, c] of cells) {
            if (r >= 0 && r < this.state.size && c >= 0 && c < this.state.size) {
                const px = x + c * cellSize, py = y + r * cellSize;
                ctx.fillStyle = color;
                ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
            }
        }
    }

    _renderKalistoPalette() {
        const ctx = this.ctx, { x, y, board } = this.layout;
        const remaining = this.state.remaining[this.state.player];
        if (!remaining.includes(this.kalistoSelection.shapeIndex)) this.kalistoSelection.shapeIndex = remaining[0];
        const left = x + board + 18;
        this.kalistoPaletteTargets = [];
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#24342a'; ctx.font = '800 13px Inter';
        ctx.fillText(this.state.phase === 'pillars' ? 'Pillar Placement' : 'Callisto Inventory', left, y);

        // Quick control buttons: Rotate CCW, Rotate CW, Flip
        const btnY = y + 20;
        const btnW = 52, btnH = 22;
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(left, btnY, btnW, btnH);
        ctx.fillStyle = '#24342a'; ctx.font = '700 10px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('↺ [Q]', left + btnW / 2, btnY + btnH / 2);
        this.kalistoPaletteTargets.push({ kind: 'rot-ccw', x: left, y: btnY, w: btnW, h: btnH });

        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(left + 56, btnY, btnW, btnH);
        ctx.fillStyle = '#24342a'; ctx.fillText('↻ [E]', left + 56 + btnW / 2, btnY + btnH / 2);
        this.kalistoPaletteTargets.push({ kind: 'rot-cw', x: left + 56, y: btnY, w: btnW, h: btnH });

        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(left + 112, btnY, btnW, btnH);
        ctx.fillStyle = '#24342a'; ctx.fillText('⇄ [F]', left + 112 + btnW / 2, btnY + btnH / 2);
        this.kalistoPaletteTargets.push({ kind: 'flip', x: left + 112, y: btnY, w: btnW, h: btnH });

        let offset = 48;
        if (this.state.phase === 'pieces' && this.state.pillarsRemaining[this.state.player] > 0) {
            const py = y + offset;
            ctx.fillStyle = this.kalistoSelection.pillar ? '#ffd73d' : 'rgba(255,255,255,.75)';
            ctx.fillRect(left, py, 168, 22);
            ctx.fillStyle = '#24342a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.font = '800 11px Inter';
            ctx.fillText('⚑ 3rd Pillar [C]', left + 8, py + 11);
            this.kalistoPaletteTargets.push({ kind: 'pillar', x: left, y: py, w: 168, h: 22 });
            offset += 27;
        }
        remaining.slice(0, 18).forEach((shapeIndex, listIndex) => {
            const column = Math.floor(listIndex / 9), line = listIndex % 9;
            const px = left + column * 86, py = y + offset + line * 26;
            const isSelected = !this.kalistoSelection.pillar && shapeIndex === this.kalistoSelection.shapeIndex;
            ctx.fillStyle = isSelected ? '#ffd73d' : 'rgba(255,255,255,.72)';
            ctx.fillRect(px, py, 81, 23);
            ctx.fillStyle = '#24342a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.font = '700 11px Inter';
            ctx.fillText(`${listIndex + 1}.`, px + 4, py + 11);
            const rawShape = KALISTO_SHAPES[shapeIndex];
            const miniSize = 3.5;
            const startMiniX = px + 24;
            const startMiniY = py + 4;
            ctx.fillStyle = isSelected ? '#24342a' : '#4a6559';
            for (const [r, c] of rawShape) {
                ctx.fillRect(startMiniX + c * (miniSize + 1), startMiniY + r * (miniSize + 1), miniSize, miniSize);
            }
            this.kalistoPaletteTargets.push({ kind: 'shape', shapeIndex, x: px, y: py, w: 81, h: 23 });
        });
    }

    destroy() {
        this._destroyChild();
        this._unwireParentInteractions();
        this.lobby?.destroy(); this.modeSelector?.remove();
        this._removeRollButton();
        this.network.clearCallbacks(); if (this.session?.mode === 'lan') this.network.close();
    }

    onPause() { this.child?.onPause?.(); }
    onResume() { this.child?.onResume?.(); }
    onResize(width, height) { this.child?.onResize?.(width, height); }
    wantsPointerLockNow() { return this.child?.wantsPointerLockNow?.() ?? false; }
    getRecordSettings(settings = this.settings) {
        const active = initializeModeSettings(settings, MODE_KEYS, settingsSchema(), 'memory');
        if (active.mode === 'ludo') return { mode: active.mode, ...normalizeLudoRules(active) };
        if (active.mode === 'scrabble') return { mode: active.mode, ...this._childSettings('scrabble', active) };
        if (active.mode === 'memory') return { mode: active.mode, ...this._childSettings('memory', active) };
        if (active.mode === 'go') {
            const { mode: goMode, ...goSettings } = new GoGame().getRecordSettings(this._childSettings('go', active));
            return { mode: active.mode, goMode, ...goSettings };
        }
        return {
            mode: active.mode, boardSize: active.boardSize, checkerRows: active.checkerRows,
            callistoBoardSize: active.callistoBoardSize, callistoPlayerCount: active.callistoPlayerCount,
            callistoTileCount: active.callistoTileCount, chessAiDepth: active.chessAiDepth,
        };
    }
    static getSettingsSchema() { return withModeProfiles(settingsSchema()); }
    static getControlsSchema() { return []; }
}
