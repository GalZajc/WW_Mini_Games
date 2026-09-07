import { BaseGame } from '../../core/BaseGame.js';
import { SessionLobby } from '../../core/SessionLobby.js';
import { validateLudoRules } from './ludo-model.js';
import {
    createLudoState, rollLudoDice, legalLudoMoves, applyLudoMove,
    passLudoTurn, chooseLudoMove, ludoGlobalField, normalizeLudoRules,
} from './ludo-model.js';

const TAU = Math.PI * 2;

export default class LudoGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        validateLudoRules(this.settings || {});
        this.rules = normalizeLudoRules(this.settings);
        this.state = null;
        this.session = null;
        this.aiTimer = 0;
        this.clickTargets = [];
        this.rollButton = null;
        this.network.onConnect(info => this.lobby?.handleConnect(info));
        this.network.onDisconnect(info => {
            if (this.lobby) this.lobby.handleDisconnect(info);
            else if (this.session?.mode === 'lan') this._networkLost(info);
        });
        this.network.onMessage((message, info) => {
            if (this.lobby?.handleMessage(message)) return;
            this._onNetworkMessage(message, info);
        });
        this.lobby = new SessionLobby(this, {
            title: 'Človek ne jezi se',
            players: this.rules.playerCount,
            onStart: session => this._startSession(session),
        });
    }

    preparePauseSettings(settings) {
        validateLudoRules(settings);
        return settings;
    }

    _startSession(session) {
        this.lobby = null;
        this.session = session;
        this.state = createLudoState(this.rules, session.seed ?? Date.now());
        if (session.mode === 'lan' && !session.isHost) {
            this.state.lastEvent = 'Čakam začetno stanje gostitelja…';
        } else if (session.mode === 'lan') this._broadcastState();
        this._ensureRollButton();
    }

    _ensureRollButton() {
        document.querySelectorAll('.ludo-roll-button').forEach(button => button.remove());
        this.rollButton = document.createElement('button');
        this.rollButton.className = 'ludo-roll-button';
        this.rollButton.type = 'button';
        this.rollButton.textContent = 'VRZI KOCKO';
        this.rollButton.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:720;height:34px;padding:0 15px;border:1px solid #176d25;border-radius:6px;background:linear-gradient(#73d44e,#329b34);color:#fff;font:800 11px Inter;cursor:pointer;box-shadow:inset 0 1px #d8ffc8,0 3px 8px rgba(20,70,30,.3)';
        this._rollClick = () => this._requestAction({ action: 'roll' });
        this.rollButton.addEventListener('click', this._rollClick);
        document.body.appendChild(this.rollButton);
        this._syncRollButton();
    }

    _controlledByHuman(player) {
        if (!this.session) return false;
        if (this.session.mode === 'hotseat') return true;
        return player === this.session.seat;
    }

    _hostControlsState() {
        return this.session?.mode !== 'lan' || this.session.isHost;
    }

    _controlledByRemote(player) {
        return this.session?.mode === 'lan' && this.session.isHost
            && Object.values(this.session.peerSeats || {}).includes(player);
    }

    _requestAction(payload) {
        if (!this.state || this.state.winner !== null || !this._controlledByHuman(this.state.turn)) return;
        if (this.session.mode === 'lan' && !this.session.isHost) {
            this.network.send({ type: 'ludo-action', ...payload });
        } else this._applyAction(payload, this.state.turn);
    }

    _applyAction(payload, requestedSeat) {
        if (!this._hostControlsState() || requestedSeat !== this.state.turn) return;
        if (payload.action === 'roll' && this.state.phase === 'roll') {
            rollLudoDice(this.state);
            this.audio.playBeep(180 + this.state.dice * 45, 0.08, 0.25);
            if (!legalLudoMoves(this.state).length) passLudoTurn(this.state);
        } else if (payload.action === 'move' && this.state.phase === 'move') {
            const result = applyLudoMove(this.state, Number(payload.piece));
            if (!result.ok) return;
            result.captured ? this.audio.playTone(250, 0.18, 'sawtooth', 0.22) : this.audio.playClick();
            if (result.won) {
                this.audio.playSuccess();
                this.submitScore({ winner: this.state.winner + 1, turns: this.state.turnNumber, seed: this.state.seed });
            }
        } else return;
        this._broadcastState();
        this._syncRollButton();
    }

    _onNetworkMessage(message, info) {
        if (message?.type === 'ludo-state' && !this.session?.isHost) {
            this.state = message.state;
            this._syncRollButton();
        } else if (message?.type === 'ludo-action' && this.session?.isHost) {
            const seat = this.session.peerSeats?.[info.peerId];
            this._applyAction(message, seat);
        }
    }

    _broadcastState() {
        if (this.session?.mode === 'lan' && this.session.isHost) {
            this.network.send({ type: 'ludo-state', state: this.state });
        }
    }

    _networkLost(info = {}) {
        if (this.session?.isHost && info.peerId) delete this.session.peerSeats?.[info.peerId];
        if (this.state) this.state.lastEvent = 'Povezava z igralcem je bila prekinjena.';
    }

    update(dt) {
        if (!this.state || this.state.winner !== null) return;
        this._syncRollButton();
        if (this._hostControlsState() && !this._controlledByHuman(this.state.turn) && !this._controlledByRemote(this.state.turn)) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                // Zero is a valid intentional setting: the computer acts on
                // the next update.  Do not silently replace it with 120 ms.
                this.aiTimer = Number(this.settings.aiDelay ?? 0.55);
                if (this.state.phase === 'roll') this._applyAction({ action: 'roll' }, this.state.turn);
                else {
                    const piece = chooseLudoMove(this.state);
                    if (piece === null) { passLudoTurn(this.state); this._broadcastState(); }
                    else this._applyAction({ action: 'move', piece }, this.state.turn);
                }
            }
        } else this.aiTimer = Number(this.settings.aiDelay ?? 0.55);

        if (this.state.phase === 'move' && this._controlledByHuman(this.state.turn) && this.input.isMouseJustDown(0)) {
            const mouse = this.input.getMousePos();
            const target = [...this.clickTargets].reverse().find(item => Math.hypot(mouse.x - item.x, mouse.y - item.y) <= item.r);
            if (target) this._requestAction({ action: 'move', piece: target.piece });
        }
    }

    _syncRollButton() {
        if (!this.rollButton || !this.state) return;
        const active = this.state.phase === 'roll' && this.state.winner === null && this._controlledByHuman(this.state.turn);
        this.rollButton.disabled = !active;
        this.rollButton.style.opacity = active ? '1' : '.45';
        this.rollButton.style.cursor = active ? 'pointer' : 'default';
    }

    _trackPoint(globalField, radius, cx, cy) {
        const angle = -Math.PI / 2 + TAU * globalField / this.state.rules.trackFields;
        return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
    }

    _piecePoint(player, piece, position, radius, cx, cy) {
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
            return this._trackPoint(ludoGlobalField(this.state, player, position), radius, cx, cy);
        }
        const angle = -Math.PI / 2 + TAU * player / rules.playerCount;
        const homeStep = position - rules.trackFields + 1;
        const fraction = 1 - homeStep / (rules.homeFields + 1);
        return { x: cx + Math.cos(angle) * radius * fraction, y: cy + Math.sin(angle) * radius * fraction };
    }

    render() {
        const ctx = this.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.h);
        sky.addColorStop(0, '#6bcaf3'); sky.addColorStop(1, '#c8f1ff');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, this.w, this.h);
        if (!this.state) return;
        const cx = this.w / 2, cy = this.h / 2 + 12;
        const radius = Math.max(110, Math.min(this.w, this.h) * 0.36);
        ctx.fillStyle = 'rgba(255,255,255,.88)';
        ctx.beginPath(); ctx.arc(cx, cy, radius + 25, 0, TAU); ctx.fill();
        const fieldRadius = Math.max(4, Math.min(10, TAU * radius / this.state.rules.trackFields * 0.31));
        const starts = new Set(Array.from({ length: this.state.rules.playerCount }, (_, p) => ludoGlobalField(this.state, p, 0)));
        for (let field = 0; field < this.state.rules.trackFields; field++) {
            const point = this._trackPoint(field, radius, cx, cy);
            ctx.beginPath(); ctx.arc(point.x, point.y, fieldRadius, 0, TAU);
            ctx.fillStyle = starts.has(field) ? '#f7d84b' : '#f8fff5'; ctx.fill();
            ctx.strokeStyle = '#49675a'; ctx.lineWidth = 1; ctx.stroke();
        }
        this.state.players.forEach((player, index) => {
            const angle = -Math.PI / 2 + TAU * index / this.state.rules.playerCount;
            ctx.strokeStyle = player.color; ctx.lineWidth = Math.max(5, fieldRadius * 1.05);
            ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * radius * .12, cy + Math.sin(angle) * radius * .12);
            ctx.lineTo(cx + Math.cos(angle) * radius * .82, cy + Math.sin(angle) * radius * .82); ctx.stroke();
        });
        this.clickTargets = [];
        const legal = new Set(legalLudoMoves(this.state).map(move => move.piece));
        this.state.players.forEach((player, playerIndex) => {
            player.pieces.forEach((position, piece) => {
                const point = this._piecePoint(playerIndex, piece, position, radius, cx, cy);
                const movable = playerIndex === this.state.turn && legal.has(piece);
                const r = Math.max(7, fieldRadius * 1.15);
                if (movable) {
                    ctx.beginPath(); ctx.arc(point.x, point.y, r + 5, 0, TAU);
                    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
                    this.clickTargets.push({ ...point, r: r + 7, piece });
                }
                ctx.beginPath(); ctx.arc(point.x, point.y, r, 0, TAU);
                ctx.fillStyle = player.color; ctx.fill(); ctx.strokeStyle = '#263b32'; ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(8, r)}px Inter`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(String(piece + 1), point.x, point.y + .5);
            });
        });
        ctx.fillStyle = '#263b32'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = '900 19px Inter'; ctx.fillText(this.state.winner === null ? `Na vrsti: igralec ${this.state.turn + 1}` : `Zmagovalec: igralec ${this.state.winner + 1}`, 20, 34);
        ctx.font = '12px Inter'; ctx.fillStyle = '#49675a'; ctx.fillText(this.state.lastEvent, 20, 54);
        ctx.textAlign = 'center'; ctx.font = '900 34px Inter'; ctx.fillStyle = '#263b32';
        ctx.fillText(this.state.dice === null ? '–' : String(this.state.dice), cx, cy + 10);
    }

    destroy() {
        this.lobby?.destroy(); this.lobby = null;
        this.rollButton?.removeEventListener('click', this._rollClick);
        this.rollButton?.remove(); this.rollButton = null;
        document.querySelectorAll('.ludo-roll-button').forEach(button => button.remove());
        this.network.clearCallbacks();
        if (this.session?.mode === 'lan') this.network.close();
    }

    wantsPointerLockNow() { return false; }

    getRecordSettings(settings = this.settings) { return normalizeLudoRules(settings); }

    static getSettingsSchema() {
        return [
            { key: 'playerCount', label: 'Število igralcev', type: 'range', min: 2, max: 6, step: 1, default: 4 },
            { key: 'trackFields', label: 'Polja na skupni poti', type: 'range', min: 12, max: 120, step: 1, default: 40 },
            { key: 'homeFields', label: 'Polja v ciljni vrsti', type: 'range', min: 2, max: 10, step: 1, default: 4 },
            { key: 'piecesPerPlayer', label: 'Figur na igralca', type: 'range', min: 1, max: 8, step: 1, default: 4 },
            { key: 'diceSides', label: 'Strani kocke', type: 'range', min: 4, max: 12, step: 1, default: 6 },
            { key: 'entryRoll', label: 'Met za vstop na ploščo', type: 'range', min: 1, max: 12, step: 1, default: 6 },
            { key: 'extraTurnOnMaximum', label: 'Dodaten met pri največjem metu', type: 'toggle', default: true },
            { key: 'extraTurnOnCapture', label: 'Dodaten met ob izločitvi', type: 'toggle', default: true },
            { key: 'safeStartFields', label: 'Varna začetna polja', type: 'toggle', default: true },
            { key: 'aiDelay', label: 'Premor računalnika [s]', type: 'range', min: 0.12, max: 2, step: 0.05, default: 0.55 },
        ];
    }

    static getControlsSchema() { return []; }
}
