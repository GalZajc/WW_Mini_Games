import { BaseGame } from '../../core/BaseGame.js';
import { SessionLobby } from '../../core/SessionLobby.js';
import { modeGalleryMarkup, bindModeGallery } from '../../components/ModeGallery.js';
import { withModeProfiles, initializeModeSettings, switchModeSettings, syncActiveModeProfile } from '../../core/ModeSettings.js';
import { requireFiniteNumber, requireInteger } from '../../core/SettingsValidation.js';
import {
    SUITS, cardLabel, cardColor, createWar, playWarRound,
    createCrazyEights, canPlayEight, playEightCard, drawEightCard, chooseEightAction,
    createBlackjack, blackjackValue, hitBlackjack, standBlackjack,
    createMemory, flipMemoryCard, resolveMemory, chooseMemoryCard,
} from './card-model.js';

const MODES = {
    blackjack: { title: 'Blackjack', description: 'Približaj se 21, ne da bi jo presegel.', artKey: 'card-lounge-blackjack' },
    eights: { title: 'Osmica', description: 'Ujemaj barvo ali vrednost; osmica zamenja barvo.', artKey: 'card-lounge-eights' },
    war: { title: 'Vojna', description: 'Višja karta pobere kup; ob izenačenju sledi vojna.', artKey: 'card-lounge-war' },
    memory: { title: 'Spomin s kartami', description: 'Odkrivaj pare in si zapomni njihove položaje.', artKey: 'card-lounge-memory' },
};
const MODE_KEYS = Object.keys(MODES);

function settingsSchema() {
    return [
        { key: 'mode', label: 'Igra', type: 'hidden', default: 'war', modeProfile: false },
        { key: 'deckCount', label: 'Kompleti kart', type: 'range', min: 1, max: 6, step: 1, default: 1, modes: ['blackjack'] },
        { key: 'dealerHitsSoft17', label: 'Delivec vleče pri mehkih 17', type: 'toggle', default: false, modes: ['blackjack'] },
        { key: 'eightHandSize', label: 'Začetnih kart', type: 'range', min: 3, max: 12, step: 1, default: 7, modes: ['eights'] },
        { key: 'memoryPairs', label: 'Število parov', type: 'range', min: 3, max: 26, step: 1, default: 8, modes: ['memory'] },
        { key: 'aiDelay', label: 'Premor računalnika [s]', type: 'range', min: 0.1, max: 2, step: 0.05, default: 0.55 },
    ];
}

export default class CardLoungeGame extends BaseGame {
    constructor() { super(); this.supportsModeSelection = true; }

    init() {
        this.wantsPointerLock = false;
        this.settings = initializeModeSettings(this.settings, MODE_KEYS, settingsSchema(), 'war');
        this.preparePauseSettings(this.settings);
        this.mode = this.settings.mode; this.phase = 'mode-select'; this.state = null; this.session = null;
        this.aiTimer = 0; this.resolveTimer = 0; this.cardTargets = []; this.memoryKnowledge = new Map();
        this.network.onConnect(info => this.lobby?.handleConnect(info));
        this.network.onDisconnect(info => {
            if (this.lobby) this.lobby.handleDisconnect(info);
            else if (this.session?.isHost && info.peerId) delete this.session.peerSeats?.[info.peerId];
        });
        this.network.onMessage((message, info) => {
            if (this.lobby?.handleMessage(message)) return;
            this._onNetworkMessage(message, info);
        });
        this._showModeSelector();
    }

    _showModeSelector() {
        this.phase = 'mode-select'; this.lobby?.destroy(); this.lobby = null; this._removeButtons();
        this.modeSelector?.remove(); this.modeSelector = document.createElement('div'); this.modeSelector.className = 'ww-mode-select';
        this.modeSelector.innerHTML = modeGalleryMarkup({ gameName: 'Kartni salon', prompt: 'izberi način', modes: MODE_KEYS.map(key => ({ key, ...MODES[key] })), selectedMode: this.mode });
        this._modeHandler = bindModeGallery(this.modeSelector, { onMode: mode => this._chooseMode(mode), onBack: () => this.endGame() });
        document.body.appendChild(this.modeSelector);
    }

    async _chooseMode(mode) {
        this.settings = switchModeSettings(this.settings, mode, MODE_KEYS, settingsSchema(), 'blackjack'); this.mode = mode;
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
        this.app.currentSettings = { ...this.settings }; await this.app.settingsManager.save(this.app.currentConfig._id, this.settings);
        this.modeSelector?.remove(); this.modeSelector = null;
        if (mode === 'blackjack') {
            this._startSession({ mode: 'solo', seat: 0, seed: Date.now() >>> 0, isHost: true, peerSeats: {} });
            return;
        }
        this.phase = 'lobby';
        this.lobby = new SessionLobby(this, { title: MODES[mode].title, players: 2, onStart: session => this._startSession(session) });
    }

    returnToModeSelector() {
        if (this.session?.mode === 'lan') this.network.close();
        this.session = null; this.state = null; this._showModeSelector();
    }

    _createState(seed) {
        if (this.mode === 'war') return createWar(seed);
        if (this.mode === 'eights') return createCrazyEights(seed, Number(this.settings.eightHandSize ?? 7));
        if (this.mode === 'memory') return createMemory(seed, Number(this.settings.memoryPairs ?? 8));
        return createBlackjack(seed, Number(this.settings.deckCount ?? 1));
    }

    _startSession(session) {
        this.lobby = null; this.session = session; this.phase = 'playing'; this.state = this._createState(session.seed ?? Date.now());
        this.memoryKnowledge.clear(); this._ensureButtons();
        if (session.mode === 'lan' && session.isHost) this._broadcastState();
    }

    _ensureButtons() {
        this._removeButtons(); this.actionBar = document.createElement('div');
        this.actionBar.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:720;display:flex;gap:7px';
        this._actionClick = event => { const action = event.target.closest('[data-card-action]')?.dataset.cardAction; if (action) this._requestAction({ kind: action }); };
        this.actionBar.addEventListener('click', this._actionClick); document.body.appendChild(this.actionBar); this._syncButtons();
    }

    _removeButtons() {
        this.actionBar?.removeEventListener('click', this._actionClick); this.actionBar?.remove(); this.actionBar = null;
    }

    _button(action, label, disabled = false) {
        return `<button data-card-action="${action}" ${disabled ? 'disabled' : ''} style="height:34px;padding:0 14px;border:1px solid #176d25;border-radius:6px;background:linear-gradient(#73d44e,#329b34);color:#fff;font:800 11px Inter;cursor:${disabled ? 'default' : 'pointer'};opacity:${disabled ? '.45' : '1'}">${label}</button>`;
    }

    _syncButtons() {
        if (!this.actionBar || !this.state) return;
        const human = this._controlledByHuman(this.state.player ?? 1);
        if (this.mode === 'blackjack') this.actionBar.innerHTML = this.state.phase === 'player'
            ? `${this._button('hit', 'VZEMI')}${this._button('stand', 'OSTANI')}` : this._button('again', 'NOVA IGRA');
        else if (this.mode === 'war') this.actionBar.innerHTML = this._button('round', 'OBRNI KARTI', this.state.winner !== null);
        else if (this.mode === 'eights') this.actionBar.innerHTML = this._button('draw', 'VLECI KARTO', !human || this.state.winner !== null);
        else this.actionBar.innerHTML = '';
    }

    _controlledByHuman(player) {
        if (this.mode === 'blackjack' || this.mode === 'war') return true;
        return this.session?.mode === 'hotseat' || player - 1 === this.session?.seat;
    }
    _hostControlsState() { return this.session?.mode !== 'lan' || this.session?.isHost; }
    _controlledByRemote(player) {
        return this.session?.mode === 'lan' && this.session.isHost
            && Object.values(this.session.peerSeats || {}).includes(player - 1);
    }

    _requestAction(action) {
        if (!this.state) return;
        if (this.session?.mode === 'lan' && !this.session.isHost) this.network.send({ type: 'card-action', action });
        else this._applyAction(action, (this.state.player ?? 1) - 1);
    }

    _applyAction(action, seat) {
        if (!this._hostControlsState() || this.state.winner !== null && action.kind !== 'again') return;
        if (!['war', 'blackjack'].includes(this.mode) && seat !== this.state.player - 1) return;
        let played = false;
        if (this.mode === 'blackjack') {
            if (action.kind === 'hit') played = hitBlackjack(this.state);
            if (action.kind === 'stand') played = standBlackjack(this.state, Boolean(this.settings.dealerHitsSoft17));
            if (action.kind === 'again') { this.state = this._createState((Date.now() ^ this.state.seed) >>> 0); played = true; }
        } else if (this.mode === 'war' && action.kind === 'round') played = playWarRound(this.state);
        else if (this.mode === 'eights') {
            if (action.kind === 'play') played = playEightCard(this.state, Number(action.cardIndex), action.chosenSuit);
            if (action.kind === 'draw') played = drawEightCard(this.state);
        } else if (this.mode === 'memory') {
            if (action.kind === 'flip') {
                played = flipMemoryCard(this.state, Number(action.index));
                if (played) this._rememberOpenCards();
                if (this.state.phase === 'resolve') this.resolveTimer = .85;
            }
            if (action.kind === 'resolve') played = resolveMemory(this.state);
        }
        if (!played) return;
        this.audio.playClick(); this._syncButtons(); this._broadcastState();
        if (this.state.winner !== null) {
            this.audio.playSuccess(); this.submitScore({ mode: this.mode, winner: this.state.winner, seed: this.state.seed });
        }
    }

    _rememberOpenCards() {
        for (const index of this.state.open || []) {
            const pair = this.state.cards[index].pair;
            if (!this.memoryKnowledge.has(pair)) this.memoryKnowledge.set(pair, []);
            if (!this.memoryKnowledge.get(pair).includes(index)) this.memoryKnowledge.get(pair).push(index);
        }
    }

    _broadcastState() { if (this.session?.mode === 'lan' && this.session.isHost) this.network.send({ type: 'card-state', state: this.state }); }

    _onNetworkMessage(message, info) {
        if (message?.type === 'card-state' && !this.session?.isHost) { this.state = message.state; this._rememberOpenCards(); this._syncButtons(); }
        else if (message?.type === 'card-action' && this.session?.isHost) this._applyAction(message.action, this.session.peerSeats?.[info.peerId]);
    }

    update(dt) {
        if (!this.state || this.phase !== 'playing') return;
        this._syncButtons();
        if (this.mode === 'memory' && this.state.phase === 'resolve' && this._hostControlsState()) {
            this.resolveTimer -= dt;
            if (this.resolveTimer <= 0) this._applyAction({ kind: 'resolve' }, this.state.player - 1);
            return;
        }
        if (this.state.winner !== null) return;
        if (['eights', 'memory'].includes(this.mode) && this._hostControlsState()
            && !this._controlledByHuman(this.state.player) && !this._controlledByRemote(this.state.player)) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                this.aiTimer = Number(this.settings.aiDelay ?? .55);
                const action = this.mode === 'eights'
                    ? chooseEightAction(this.state)
                    : { kind: 'flip', index: chooseMemoryCard(this.state, this.memoryKnowledge) };
                if (action.index !== null) this._applyAction(action, this.state.player - 1);
            }
            return;
        }
        this.aiTimer = Number(this.settings.aiDelay ?? .55);
        if (!this.input.isMouseJustDown(0)) return;
        const mouse = this.input.getMousePos();
        const target = [...this.cardTargets].reverse().find(item => mouse.x >= item.x && mouse.x <= item.x + item.w && mouse.y >= item.y && mouse.y <= item.y + item.h);
        if (!target) return;
        if (this.mode === 'eights') this._requestAction({ kind: 'play', cardIndex: target.index });
        if (this.mode === 'memory') this._requestAction({ kind: 'flip', index: target.index });
    }

    _drawCard(card, x, y, w, h, hidden = false, highlight = false) {
        const ctx = this.ctx; ctx.save();
        ctx.fillStyle = hidden ? '#276fb1' : '#fffdf4'; ctx.strokeStyle = highlight ? '#ffd43b' : '#263b32'; ctx.lineWidth = highlight ? 4 : 2;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(8, w * .12)); ctx.fill(); ctx.stroke();
        if (hidden) {
            ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
            for (let px = x + 8; px < x + w; px += 9) { ctx.beginPath(); ctx.moveTo(px, y + 5); ctx.lineTo(px - 12, y + h - 5); ctx.stroke(); }
        } else if (card) {
            ctx.fillStyle = cardColor(card); ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = `800 ${Math.max(11, w * .21)}px Inter`; ctx.fillText(cardLabel(card), x + 7, y + 6);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `${Math.max(20, w * .43)}px Inter`; ctx.fillText(SUITS[card.suit], x + w / 2, y + h * .58);
        }
        ctx.restore();
    }

    render() {
        const ctx = this.ctx, gradient = ctx.createLinearGradient(0, 0, 0, this.h); gradient.addColorStop(0, '#34875a'); gradient.addColorStop(1, '#154a38');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.w, this.h); this.cardTargets = [];
        if (!this.state) return;
        if (this.mode === 'blackjack') this._renderBlackjack();
        if (this.mode === 'war') this._renderWar();
        if (this.mode === 'eights') this._renderEights();
        if (this.mode === 'memory') this._renderMemory();
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.font = '900 19px Inter'; ctx.fillText(MODES[this.mode].title, 18, 31);
        ctx.font = '12px Inter'; ctx.fillStyle = '#d7f3df'; ctx.fillText(this.state.lastEvent, 18, 51);
    }

    _renderBlackjack() {
        const w = 82, h = 116, gap = 22, center = this.w / 2;
        const drawHand = (hand, y, hideHole = false) => {
            const total = hand.length * w + (hand.length - 1) * gap; let x = center - total / 2;
            hand.forEach((card, index) => { this._drawCard(card, x, y, w, h, hideHole && index === 1); x += w + gap; });
        };
        drawHand(this.state.dealerHand, 82, this.state.phase === 'player');
        drawHand(this.state.playerHand, this.h - h - 78);
        const ctx = this.ctx; ctx.textAlign = 'center'; ctx.fillStyle = '#d7f3df'; ctx.font = '800 14px Inter';
        ctx.fillText(`Delivec: ${this.state.phase === 'player' ? '?' : blackjackValue(this.state.dealerHand)}`, center, 72);
        ctx.fillText(`Ti: ${blackjackValue(this.state.playerHand)}`, center, this.h - 50);
    }

    _renderWar() {
        const w = 110, h = 154, y = (this.h - h) / 2;
        const battle = this.state.lastBattle;
        this._drawCard(battle[0], this.w / 2 - w - 35, y, w, h, !battle[0]);
        this._drawCard(battle[1], this.w / 2 + 35, y, w, h, !battle[1]);
        const ctx = this.ctx; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '800 14px Inter';
        ctx.fillText(`Igralec 1 · ${this.state.hands[1].length} kart`, this.w / 2 - w / 2 - 35, y + h + 27);
        ctx.fillText(`Igralec 2 · ${this.state.hands[2].length} kart`, this.w / 2 + w / 2 + 35, y + h + 27);
    }

    _renderEights() {
        const state = this.state, ctx = this.ctx, w = 72, h = 102;
        const opponent = state.player === 1 ? 2 : 1;
        const topY = 70, backGap = Math.min(22, (this.w - 100) / Math.max(1, state.hands[opponent].length));
        let x = (this.w - (w + backGap * (state.hands[opponent].length - 1))) / 2;
        state.hands[opponent].forEach(() => { this._drawCard(null, x, topY, w, h, true); x += backGap; });
        this._drawCard(null, this.w / 2 - w - 18, this.h / 2 - h / 2, w, h, true);
        this._drawCard(state.discard.at(-1), this.w / 2 + 18, this.h / 2 - h / 2, w, h);
        ctx.textAlign = 'center'; ctx.fillStyle = '#d7f3df'; ctx.font = '12px Inter'; ctx.fillText(`Izbrana barva: ${SUITS[state.chosenSuit]} · kup: ${state.drawPile.length}`, this.w / 2, this.h / 2 + h / 2 + 22);
        const hand = state.hands[state.player], gap = Math.min(72, (this.w - 70 - w) / Math.max(1, hand.length - 1));
        x = (this.w - (w + gap * (hand.length - 1))) / 2; const y = this.h - h - 34;
        hand.forEach((card, index) => {
            const playable = canPlayEight(state, card) && this._controlledByHuman(state.player);
            this._drawCard(card, x, y - (playable ? 9 : 0), w, h, false, playable);
            if (playable) this.cardTargets.push({ x, y: y - 9, w, h, index }); x += gap;
        });
    }

    _renderMemory() {
        const count = this.state.cards.length;
        const columns = Math.ceil(Math.sqrt(count * 1.45)), rows = Math.ceil(count / columns);
        const gap = 7, cardW = Math.min(82, (this.w - 60 - gap * (columns - 1)) / columns), cardH = cardW * 1.28;
        const totalW = columns * cardW + (columns - 1) * gap, totalH = rows * cardH + (rows - 1) * gap;
        const startX = (this.w - totalW) / 2, startY = Math.max(66, (this.h - totalH) / 2 + 16);
        this.state.cards.forEach((card, index) => {
            const row = Math.floor(index / columns), column = index % columns, x = startX + column * (cardW + gap), y = startY + row * (cardH + gap);
            const visible = this.state.open.includes(index) || this.state.matched.includes(index), matched = this.state.matched.includes(index);
            this._drawCard(card, x, y, cardW, cardH, !visible, matched);
            if (!visible && this.state.phase === 'pick' && this._controlledByHuman(this.state.player)) this.cardTargets.push({ x, y, w: cardW, h: cardH, index });
        });
        const ctx = this.ctx; ctx.textAlign = 'right'; ctx.fillStyle = '#d7f3df'; ctx.font = '800 13px Inter'; ctx.fillText(`Igralec 1: ${this.state.scores[1]} · Igralec 2: ${this.state.scores[2]}`, this.w - 18, 31);
    }

    destroy() {
        this.lobby?.destroy(); this.modeSelector?.remove(); this._removeButtons(); this.network.clearCallbacks();
        if (this.session?.mode === 'lan') this.network.close();
    }
    wantsPointerLockNow() { return false; }
    preparePauseSettings(settings) {
        const prepared = syncActiveModeProfile(settings, MODE_KEYS, settingsSchema(), 'blackjack');
        const mode = prepared.mode || this.mode || 'blackjack';
        requireInteger(prepared.deckCount ?? 1, 'Number of decks', { minimum: 1 });
        requireInteger(prepared.eightHandSize ?? 7, 'Initial hand size', { minimum: 1, maximum: 25 });
        requireInteger(prepared.memoryPairs ?? 8, 'Memory pairs', { minimum: 1, maximum: 26 });
        requireFiniteNumber(prepared.aiDelay ?? 0.55, 'Computer delay', { minimum: 0 });
        if (mode === 'memory' && Number(prepared.memoryPairs) * 2 > 52) {
            throw new Error('Memory pairs cannot exceed 26 because the standard deck has only 52 cards.');
        }
        if (mode === 'eights' && Number(prepared.eightHandSize) * 2 + 1 > 52) {
            throw new Error('Initial hands are too large for one 52-card deck.');
        }
        return prepared;
    }
    getRecordSettings(settings = this.settings) { const active = initializeModeSettings(settings, MODE_KEYS, settingsSchema(), 'blackjack'); return { mode: active.mode, deckCount: active.deckCount, eightHandSize: active.eightHandSize, memoryPairs: active.memoryPairs }; }
    static getSettingsSchema() { return withModeProfiles(settingsSchema()); }
    static getControlsSchema() { return []; }
}
