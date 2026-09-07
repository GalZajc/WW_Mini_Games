import { BaseGame } from '../../core/BaseGame.js';
import { SessionLobby } from '../../core/SessionLobby.js';
import { resolvedMemoryCatalog } from './catalog.js';
import { requireFiniteNumber, requireInteger } from '../../core/SettingsValidation.js';
import {
    createPictureMemory, flipPictureMemory, resolvePictureMemory,
    rememberOpenPictureCards, choosePictureMemoryCard, layoutPictureMemoryCards,
} from './memory-model.js';

export default class ClassicPictureMemoryGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.catalog = resolvedMemoryCatalog();
        this.preparePauseSettings(this.settings || {});
        this.phase = 'lobby'; this.state = null; this.session = null; this.layout = [];
        this.layoutKey = ''; this.cardTargets = []; this.resolveTimer = 0; this.aiTimer = 0;
        this.catalogById = new Map(this.catalog.map(item => [item.id, item]));
        this.images = new Map(); this.knowledge = new Map();
        this.network.onConnect(info => this.lobby?.handleConnect(info));
        this.network.onDisconnect(info => {
            if (this.lobby) this.lobby.handleDisconnect(info);
            else if (this.session?.isHost && info.peerId) delete this.session.peerSeats?.[info.peerId];
        });
        this.network.onMessage((message, info) => {
            if (this.lobby?.handleMessage(message)) return;
            this._onNetworkMessage(message, info);
        });
        this._keyDown = event => { if (event.code === 'KeyR' && this.state && this._hostControlsState()) this._restartState(); };
        window.addEventListener('keydown', this._keyDown);
        this.lobby = new SessionLobby(this, { title: 'Klasični spomin', players: 2, onStart: session => this._startSession(session) });
    }

    _startSession(session) {
        this.lobby = null; this.session = session; this.phase = 'playing';
        this.state = createPictureMemory(this.catalog, this.settings, session.seed ?? Date.now());
        this.knowledge.clear(); this.layoutKey = ''; this.resolveTimer = 0;
        this._preloadSelectedImages();
        if (session.mode === 'lan' && session.isHost) this._broadcastState();
    }

    _restartState() {
        this.state = createPictureMemory(this.catalog, this.settings, (Date.now() ^ this.state.seed) >>> 0);
        this.knowledge.clear(); this.layoutKey = ''; this.resolveTimer = 0;
        this._preloadSelectedImages(); this._broadcastState();
    }

    _preloadSelectedImages() {
        for (const card of this.state.cards) {
            const item = this.catalogById.get(card.catalogId);
            if (!item || this.images.has(item.id)) continue;
            const image = new Image(); image.src = item.url; this.images.set(item.id, image);
        }
    }

    _controlledByHuman(player = this.state?.player) {
        if (this.session?.mode === 'hotseat') return true;
        if (this.session?.mode === 'solo') return player === 1;
        return player - 1 === this.session?.seat;
    }
    _hostControlsState() { return this.session?.mode !== 'lan' || this.session?.isHost; }
    _controlledByRemote(player = this.state?.player) {
        return this.session?.mode === 'lan' && this.session.isHost
            && Object.values(this.session.peerSeats || {}).includes(player - 1);
    }

    _requestAction(action) {
        if (!this.state || !this._controlledByHuman()) return;
        if (this.session.mode === 'lan' && !this.session.isHost) this.network.send({ type: 'picture-memory-action', action });
        else this._applyAction(action, this.state.player - 1);
    }

    _applyAction(action, seat) {
        if (!this._hostControlsState() || seat !== this.state.player - 1 || this.state.winner !== null) return;
        let played = false;
        if (action.kind === 'flip') played = flipPictureMemory(this.state, action.index);
        if (action.kind === 'resolve') played = resolvePictureMemory(this.state);
        if (!played) return;
        rememberOpenPictureCards(this.state, this.knowledge);
        if (this.state.phase === 'resolve') this.resolveTimer = Number(this.settings.revealDelay ?? .85);
        this.audio.playClick(); this._broadcastState();
        if (this.state.winner !== null) {
            this.audio.playSuccess();
            this.submitScore({ winner: this.state.winner, pairs: this.state.cards.length / 2, moves: this.state.moves, seed: this.state.seed });
        }
    }

    _broadcastState() {
        if (this.session?.mode === 'lan' && this.session.isHost) this.network.send({ type: 'picture-memory-state', state: this.state });
    }

    _onNetworkMessage(message, info) {
        if (message?.type === 'picture-memory-state' && !this.session?.isHost) {
            this.state = message.state; this.layoutKey = ''; this._preloadSelectedImages(); rememberOpenPictureCards(this.state, this.knowledge);
        } else if (message?.type === 'picture-memory-action' && this.session?.isHost) {
            this._applyAction(message.action, this.session.peerSeats?.[info.peerId]);
        }
    }

    update(dt) {
        if (!this.state || this.phase !== 'playing' || this.state.winner !== null) return;
        if (this.state.phase === 'resolve' && this._hostControlsState()) {
            this.resolveTimer -= dt;
            if (this.resolveTimer <= 0) this._applyAction({ kind: 'resolve' }, this.state.player - 1);
            return;
        }
        if (this._hostControlsState() && !this._controlledByHuman() && !this._controlledByRemote()) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                this.aiTimer = Number(this.settings.aiDelay ?? .55);
                const index = choosePictureMemoryCard(this.state, this.knowledge);
                if (index !== null) this._applyAction({ kind: 'flip', index }, this.state.player - 1);
            }
            return;
        }
        this.aiTimer = Number(this.settings.aiDelay ?? .55);
        if (!this._controlledByHuman() || !this.input.isMouseJustDown(0)) return;
        const mouse = this.input.getMousePos();
        const target = [...this.cardTargets].reverse().find(card => this._pointInCard(mouse, card));
        if (target) this._requestAction({ kind: 'flip', index: target.index });
    }

    _pointInCard(point, card) {
        const dx = point.x - card.x, dy = point.y - card.y, c = Math.cos(card.angle), s = Math.sin(card.angle);
        const localX = dx * c + dy * s, localY = -dx * s + dy * c;
        return Math.abs(localX) <= card.w / 2 && Math.abs(localY) <= card.h / 2;
    }

    _ensureLayout() {
        const key = [this.state.cards.length, this.w, this.h, this.settings.scattered, this.settings.maxRotation, this.state.seed].join(':');
        if (key === this.layoutKey) return;
        this.layoutKey = key;
        this.layout = layoutPictureMemoryCards(this.state.cards.length, this.w, this.h, {
            scatter: this.settings.scattered !== false,
            maxRotation: Number(this.settings.maxRotation ?? 13),
            seed: this.state.seed,
        });
    }

    _drawCard(card, placement, index) {
        const ctx = this.ctx, visible = this.state.open.includes(index) || this.state.matched.includes(index);
        const matched = this.state.matched.includes(index), item = this.catalogById.get(card.catalogId);
        ctx.save(); ctx.translate(placement.x, placement.y); ctx.rotate(placement.angle);
        ctx.shadowColor = 'rgba(0,0,0,.34)'; ctx.shadowBlur = Math.max(4, placement.w * .08); ctx.shadowOffsetY = Math.max(2, placement.w * .035);
        ctx.beginPath(); ctx.roundRect(-placement.w / 2, -placement.h / 2, placement.w, placement.h, Math.max(4, placement.w * .1));
        ctx.clip();
        if (!visible) {
            const gradient = ctx.createLinearGradient(-placement.w / 2, -placement.h / 2, placement.w / 2, placement.h / 2);
            gradient.addColorStop(0, '#24175a'); gradient.addColorStop(1, '#0f4660'); ctx.fillStyle = gradient;
            ctx.fillRect(-placement.w / 2, -placement.h / 2, placement.w, placement.h);
            ctx.strokeStyle = 'rgba(143,247,237,.24)'; ctx.lineWidth = Math.max(1, placement.w * .018);
            for (let offset = -placement.w; offset < placement.w * 2; offset += Math.max(11, placement.w * .18)) {
                ctx.beginPath(); ctx.moveTo(offset, -placement.h / 2); ctx.lineTo(offset - placement.h, placement.h / 2); ctx.stroke();
            }
            ctx.fillStyle = '#8ff7ed'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 ${Math.max(16, placement.w * .31)}px Inter`; ctx.fillText('✦', 0, 1);
        } else {
            ctx.fillStyle = '#081126'; ctx.fillRect(-placement.w / 2, -placement.h / 2, placement.w, placement.h);
            const image = this.images.get(item?.id);
            if (image?.complete && image.naturalWidth) ctx.drawImage(image, -placement.w / 2, -placement.h / 2, placement.w, placement.h);
            else {
                ctx.fillStyle = '#6049a4'; ctx.fillRect(-placement.w / 2, -placement.h / 2, placement.w, placement.h);
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${Math.max(9, placement.w * .13)}px Inter`; ctx.fillText(item?.name || '?', 0, 0, placement.w * .86);
            }
            if (this.settings.labelsVisible !== false && placement.w >= 54) {
                const labelHeight = Math.max(13, placement.h * .17);
                ctx.fillStyle = 'rgba(5,7,22,.76)'; ctx.fillRect(-placement.w / 2, placement.h / 2 - labelHeight, placement.w, labelHeight);
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.max(7, placement.w * .09)}px Inter`;
                ctx.fillText(item?.name || '', 0, placement.h / 2 - labelHeight / 2, placement.w * .9);
            }
            if (matched) { ctx.strokeStyle = '#80f4d4'; ctx.lineWidth = Math.max(3, placement.w * .045); ctx.strokeRect(-placement.w / 2 + 2, -placement.h / 2 + 2, placement.w - 4, placement.h - 4); }
        }
        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        const gradient = ctx.createRadialGradient(this.w * .2, this.h * .15, 0, this.w * .55, this.h * .5, Math.max(this.w, this.h));
        gradient.addColorStop(0, '#25205b'); gradient.addColorStop(.45, '#0d2342'); gradient.addColorStop(1, '#050918');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, this.w, this.h);
        if (!this.state) return;
        this._ensureLayout(); this.cardTargets = [];
        this.state.cards.forEach((card, index) => {
            const placement = this.layout[index]; this._drawCard(card, placement, index);
            if (!this.state.matched.includes(index) && !this.state.open.includes(index)) this.cardTargets.push({ ...placement, index });
        });
        ctx.fillStyle = '#f7f5ff'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '900 19px Inter';
        const status = this.state.winner === null ? `Na vrsti: igralec ${this.state.player}` : (this.state.winner ? `Zmagovalec: igralec ${this.state.winner}` : 'Neodločeno');
        ctx.fillText(`Klasični spomin · ${status}`, 18, 31);
        ctx.fillStyle = '#aaa7bf'; ctx.font = '12px Inter'; ctx.fillText(this.state.lastEvent, 18, 51);
        ctx.textAlign = 'right'; ctx.fillStyle = '#d9fff8'; ctx.font = '800 13px Inter';
        ctx.fillText(`Igralec 1: ${this.state.scores[1]} · Igralec 2: ${this.state.scores[2]} · poteze: ${this.state.moves}`, this.w - 18, 31);
    }

    destroy() {
        window.removeEventListener('keydown', this._keyDown); this.lobby?.destroy();
        this.network.clearCallbacks(); if (this.session?.mode === 'lan') this.network.close();
    }
    preparePauseSettings(settings) {
        const pairCount = requireInteger(settings.pairCount ?? 10, 'Memory pairs', { minimum: 2 });
        const category = settings.category || 'mixed';
        const available = category === 'mixed'
            ? this.catalog?.length ?? resolvedMemoryCatalog().length
            : (this.catalog || resolvedMemoryCatalog()).filter(item => item.category === category).length;
        // The parent settings panel has one global pair-count control. A
        // category may contain fewer images than that global maximum, so
        // child-mode startup remains safe and the model clamps selection.
        if (available >= 2 && pairCount > available) settings.pairCount = available;
        requireFiniteNumber(settings.maxRotation ?? 13, 'Maximum card rotation', { minimum: 0 });
        requireFiniteNumber(settings.revealDelay ?? .85, 'Memory reveal delay', { minimum: 0 });
        requireFiniteNumber(settings.aiDelay ?? .55, 'Computer delay', { minimum: 0 });
        return settings;
    }
    wantsPointerLockNow() { return false; }
    getRecordSettings(settings = this.settings) {
        return { pairCount: settings.pairCount, category: settings.category, scattered: settings.scattered, maxRotation: settings.maxRotation };
    }
    static getSettingsSchema() { return []; }
    static getControlsSchema() { return []; }
}
