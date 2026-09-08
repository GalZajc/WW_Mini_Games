import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requireInteger } from '../../core/SettingsValidation.js';
import { SessionLobby } from '../../core/SessionLobby.js';
import {
    LETTER_DATA, normalizeWord, createWordState, boardBonus,
    playWordMove, passWordTurn, exchangeRack, chooseWordMove,
} from './word-model.js';
import { expandHunspellDictionaryAsync } from './hunspell-dictionary.js';

const FALLBACK_WORDS = ['in', 'na', 'je', 'za', 'da', 'ne', 'se', 'to', 'kot', 'jaz', 'ti', 'on', 'ona', 'mi', 'vi', 'dan', 'noč', 'miza', 'hiša', 'igra', 'beseda', 'voda', 'zemlja', 'sonce', 'človek'];

export default class WordTilesGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});
        this.wasDestroyed = false;
        this.phase = 'loading'; this.state = null; this.session = null; this.lobby = null;
        this.dictionary = new Set(); this.dictionaryWords = []; this.pending = []; this.selectedTileId = null;
        this.blankLetter = null; this.message = 'Loading dictionary…'; this.dictionaryProgress = 0;
        this.aiTimer = 0; this.layout = null; this.rackTargets = [];
        this.network.onConnect(info => this.lobby?.handleConnect(info));
        this.network.onDisconnect(info => {
            if (this.lobby) this.lobby.handleDisconnect(info);
            else if (this.session?.isHost && info.peerId) delete this.session.peerSeats?.[info.peerId];
        });
        this.network.onMessage((message, info) => {
            if (this.lobby?.handleMessage(message)) return;
            this._onNetworkMessage(message, info);
        });
        this._keyDown = event => this._onKeyDown(event); window.addEventListener('keydown', this._keyDown);
        this._loadDictionary();
    }

    async _loadDictionary() {
        try {
            const [dictionaryResponse, affixResponse] = await Promise.all([
                fetch(new URL('./dictionary/sl_SI.dic', import.meta.url)),
                fetch(new URL('./dictionary/sl_SI.aff', import.meta.url)),
            ]);
            if (!dictionaryResponse.ok || !affixResponse.ok) {
                throw new Error(`HTTP ${dictionaryResponse.status}/${affixResponse.status}`);
            }
            this.message = 'Expanding dictionary word forms…';
            const [dictionaryRaw, affixRaw] = await Promise.all([dictionaryResponse.text(), affixResponse.text()]);
            this.dictionary = await expandHunspellDictionaryAsync(dictionaryRaw, affixRaw, {
                onProgress: progress => {
                    this.dictionaryProgress = progress * 0.92;
                    this.message = `Expanding dictionary word forms… ${Math.round(progress * 100)} %`;
                },
            });
            FALLBACK_WORDS.forEach(word => this.dictionary.add(normalizeWord(word)));
            this.dictionaryProgress = 0.94; this.message = 'Preparing words for AI engine…';
            const points = word => [...word.toLocaleUpperCase('sl-SI')].reduce((sum, letter) => sum + (LETTER_DATA[letter]?.[1] || 0), 0);
            const scoredWords = [...this.dictionary]
                .filter(word => word.length <= 13)
                .map(word => ({ word, points: points(word) }));
            scoredWords.sort((a, b) => b.points - a.points || b.word.length - a.word.length);
            this.dictionaryWords = scoredWords.slice(0, 120000).map(item => item.word);
            this.dictionaryProgress = 1;
            this.message = `${this.dictionary.size.toLocaleString('en-US')} words in dictionary.`;
        } catch (error) {
            console.error('Slovenian dictionary load failed:', error);
            this.dictionary = new Set(FALLBACK_WORDS); this.dictionaryWords = [...this.dictionary];
            this.dictionaryProgress = 1;
            this.message = 'Dictionary could not be loaded; using fallback word list.';
        }
        if (!this.wasDestroyed && this.phase === 'loading') this._showLobby();
    }

    _showLobby() {
        this.phase = 'lobby';
        this.lobby = new SessionLobby(this, { title: 'Word Tiles', players: 2, onStart: session => this._startSession(session) });
    }

    _startSession(session) {
        this.lobby = null; this.session = session; this.phase = 'playing';
        this.state = createWordState(this.settings, session.seed ?? Date.now());
        this.pending = []; this.selectedTileId = null; this._ensureActionBar();
        if (session.mode === 'lan' && session.isHost) this._broadcastState();
    }

    _ensureActionBar() {
        this.actionBar?.remove(); this.actionBar = document.createElement('div');
        this.actionBar.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:720;display:flex;gap:6px';
        const button = (action, text) => `<button data-word-action="${action}" style="height:32px;padding:0 11px;border:1px solid #176d25;border-radius:5px;background:linear-gradient(#73d44e,#329b34);color:#fff;font:800 10px Inter;cursor:pointer">${text}</button>`;
        this.actionBar.innerHTML = `${button('commit', 'PLAY [ENTER]')}${button('recall', 'RECALL [R]')}${button('exchange', 'EXCHANGE ALL [X]')}${button('pass', 'PASS [P]')}`;
        this._actionClick = event => { const action = event.target.closest('[data-word-action]')?.dataset.wordAction; if (action) this._handleUiAction(action); };
        this.actionBar.addEventListener('click', this._actionClick); document.body.appendChild(this.actionBar);
    }

    _onKeyDown(event) {
        if (this.phase !== 'playing') return;
        if (this.selectedTileId) {
            const tile = this._viewRack().find(item => item.id === this.selectedTileId);
            if (tile?.letter === '?' && /^[a-zčšž]$/iu.test(event.key)) {
                this.blankLetter = event.key.toLocaleUpperCase('sl-SI'); this.message = `Blank tile assigned to letter ${this.blankLetter}.`; return;
            }
        }
        if (event.key === 'Enter') this._handleUiAction('commit');
        if (event.code === 'KeyR') this._handleUiAction('recall');
        if (event.code === 'KeyX') this._handleUiAction('exchange');
        if (event.code === 'KeyP') this._handleUiAction('pass');
    }

    _handleUiAction(action) {
        if (!this.state || !this._controlledByHuman(this.state.player)) return;
        if (action === 'recall') { this.pending = []; this.selectedTileId = null; return; }
        if (action === 'commit') {
            if (!this.pending.length) { this.message = 'Place at least one tile on the board first.'; return; }
            this._requestAction({ kind: 'play', placements: this.pending }); return;
        }
        if (this.pending.length) { this.message = 'Recall placed tiles before exchanging or passing.'; return; }
        this._requestAction({ kind: action });
    }

    _controlledByHuman(player) {
        if (this.session?.mode === 'hotseat') return true;
        if (this.session?.mode === 'solo') return player === 1;
        return player - 1 === this.session?.seat;
    }
    _hostControlsState() { return this.session?.mode !== 'lan' || this.session?.isHost; }
    _controlledByRemote(player) {
        return this.session?.mode === 'lan' && this.session.isHost
            && Object.values(this.session.peerSeats || {}).includes(player - 1);
    }

    _requestAction(action) {
        if (this.session.mode === 'lan' && !this.session.isHost) this.network.send({ type: 'word-action', action });
        else this._applyAction(action, this.state.player - 1);
    }

    _applyAction(action, seat) {
        if (!this._hostControlsState() || seat !== this.state.player - 1 || this.state.winner !== null) return;
        let played = false;
        if (action.kind === 'play') {
            const result = playWordMove(this.state, action.placements, this.dictionary);
            if (!result.ok) { this.message = result.error; return; }
            this.message = `${result.words.join(' + ')}: ${result.score} pts.`; played = true;
        }
        if (action.kind === 'pass') played = passWordTurn(this.state);
        if (action.kind === 'exchange') {
            played = exchangeRack(this.state); if (!played) this.message = 'Not enough tiles in bag to exchange.';
        }
        if (!played) return;
        this.pending = []; this.selectedTileId = null; this.audio.playClick(); this._broadcastState();
        if (this.state.winner !== null) {
            this.audio.playSuccess(); this.submitScore({ winner: this.state.winner, scores: this.state.scores.slice(1), seed: this.state.seed });
        }
    }

    _broadcastState() { if (this.session?.mode === 'lan' && this.session.isHost) this.network.send({ type: 'word-state', state: this.state }); }

    _onNetworkMessage(message, info) {
        if (message?.type === 'word-state' && !this.session?.isHost) {
            this.state = message.state; this.pending = []; this.selectedTileId = null;
        } else if (message?.type === 'word-action' && this.session?.isHost) this._applyAction(message.action, this.session.peerSeats?.[info.peerId]);
    }

    _viewPlayer() { return this.session?.mode === 'hotseat' ? this.state.player : (this.session?.seat ?? 0) + 1; }
    _viewRack() { return this.state?.racks?.[this._viewPlayer()] || []; }

    update(dt) {
        if (!this.state || this.phase !== 'playing' || this.state.winner !== null) return;
        if (this._hostControlsState() && !this._controlledByHuman(this.state.player) && !this._controlledByRemote(this.state.player)) {
            this.aiTimer -= dt;
            if (this.aiTimer <= 0) {
                this.aiTimer = Number(this.settings.aiDelay ?? .7);
                this.message = 'Computer searching for a word…';
                const choice = chooseWordMove(this.state, this.dictionaryWords, this.dictionary, Number(this.settings.aiScanLimit ?? 50000));
                this._applyAction(choice ? { kind: 'play', placements: choice.placements } : (this.state.bag.length >= this.state.rackSize ? { kind: 'exchange' } : { kind: 'pass' }), this.state.player - 1);
            }
            return;
        }
        this.aiTimer = Number(this.settings.aiDelay ?? .7);
        if (!this.input.isMouseJustDown(0) || !this._controlledByHuman(this.state.player)) return;
        const mouse = this.input.getMousePos();
        const rackTarget = this.rackTargets.find(item => mouse.x >= item.x && mouse.x <= item.x + item.w && mouse.y >= item.y && mouse.y <= item.y + item.h);
        if (rackTarget) {
            if (this.pending.some(item => item.tileId === rackTarget.tileId)) return;
            this.selectedTileId = rackTarget.tileId; this.blankLetter = null;
            const tile = this._viewRack().find(item => item.id === rackTarget.tileId);
            this.message = tile?.letter === '?' ? 'Press a letter key for the blank tile, then click a board square.' : `Selected letter ${tile?.letter}.`;
            return;
        }
        const cell = this._cellAt(mouse);
        if (!cell || !this.selectedTileId || this.state.board[cell.row][cell.column] || this.pending.some(item => item.row === cell.row && item.column === cell.column)) return;
        const tile = this._viewRack().find(item => item.id === this.selectedTileId);
        if (tile?.letter === '?' && !this.blankLetter) { this.message = 'Press a letter key to assign to the blank tile first.'; return; }
        this.pending.push({ ...cell, tileId: this.selectedTileId, blankLetter: this.blankLetter }); this.selectedTileId = null; this.blankLetter = null;
    }

    _boardLayout() {
        const availableWidth = this.w - 235, availableHeight = this.h - 145;
        const cell = Math.max(18, Math.floor(Math.min(availableWidth, availableHeight, 760) / this.state.size));
        const board = cell * this.state.size;
        return { cell, board, x: Math.max(16, (this.w - board) / 2 - 70), y: Math.max(66, (this.h - board - 70) / 2 + 28) };
    }

    _cellAt(mouse) {
        if (!this.layout) return null;
        const column = Math.floor((mouse.x - this.layout.x) / this.layout.cell), row = Math.floor((mouse.y - this.layout.y) / this.layout.cell);
        return row >= 0 && row < this.state.size && column >= 0 && column < this.state.size ? { row, column } : null;
    }

    _drawTile(tile, x, y, size, selected = false) {
        const ctx = this.ctx; ctx.fillStyle = selected ? '#ffe46b' : '#f2d39b'; ctx.strokeStyle = '#785526'; ctx.lineWidth = selected ? 3 : 1.5;
        ctx.beginPath(); ctx.roundRect(x, y, size, size, Math.max(2, size * .1)); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2d271f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 ${Math.max(11, size * .52)}px Inter`; ctx.fillText(tile.letter, x + size * .47, y + size * .49);
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.font = `800 ${Math.max(7, size * .22)}px Inter`; ctx.fillText(String(tile.points), x + size - 3, y + size - 2);
    }

    render() {
        const ctx = this.ctx, sky = ctx.createLinearGradient(0, 0, 0, this.h); sky.addColorStop(0, '#69c9f2'); sky.addColorStop(1, '#c3edfb'); ctx.fillStyle = sky; ctx.fillRect(0, 0, this.w, this.h);
        if (!this.state) {
            ctx.fillStyle = '#244236'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 18px Inter'; ctx.fillText(this.message, this.w / 2, this.h / 2 - 12);
            if (this.phase === 'loading') {
                const width = Math.min(360, this.w * 0.45), height = 8, x = (this.w - width) / 2, y = this.h / 2 + 16;
                ctx.fillStyle = 'rgba(36,66,54,.2)'; ctx.fillRect(x, y, width, height);
                ctx.fillStyle = '#3eaf4c'; ctx.fillRect(x, y, width * this.dictionaryProgress, height);
            }
            return;
        }
        this.layout = this._boardLayout(); const { x, y, cell, board } = this.layout;
        ctx.fillStyle = '#31433b'; ctx.fillRect(x - 4, y - 4, board + 8, board + 8);
        const pendingByCell = new Map(this.pending.map(item => [`${item.row}:${item.column}`, item]));
        const rack = this._viewRack();
        for (let row = 0; row < this.state.size; row++) for (let column = 0; column < this.state.size; column++) {
            const px = x + column * cell, py = y + row * cell, bonus = boardBonus(this.state.size, row, column);
            ctx.fillStyle = bonus === 'TW' ? '#db5a50' : bonus === 'DW' ? '#ef9e91' : bonus === 'TL' ? '#438dca' : bonus === 'DL' ? '#91c8e8' : '#e8f0dc';
            ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
            const placed = this.state.board[row][column]; const pending = pendingByCell.get(`${row}:${column}`);
            if (placed) this._drawTile(placed, px + 2, py + 2, cell - 4);
            else if (pending) {
                const source = rack.find(tile => tile.id === pending.tileId); this._drawTile({ ...source, letter: source.letter === '?' ? pending.blankLetter : source.letter }, px + 2, py + 2, cell - 4, true);
            } else if (bonus) {
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${Math.max(7, cell * .27)}px Inter`; ctx.fillText(bonus, px + cell / 2, py + cell / 2);
            }
        }
        const rackY = y + board + 12, tileSize = Math.min(48, Math.max(30, (board - 6 * (rack.length - 1)) / Math.max(1, rack.length))), total = rack.length * tileSize + (rack.length - 1) * 6;
        let rackX = x + (board - total) / 2; this.rackTargets = [];
        rack.forEach(tile => {
            const used = this.pending.some(item => item.tileId === tile.id); if (!used) {
                this._drawTile(tile, rackX, rackY, tileSize, tile.id === this.selectedTileId); this.rackTargets.push({ x: rackX, y: rackY, w: tileSize, h: tileSize, tileId: tile.id });
            } rackX += tileSize + 6;
        });
        const sideX = x + board + 18; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#244236'; ctx.font = '900 15px Inter';
        ctx.fillText(`Player 1: ${this.state.scores[1]}`, sideX, y); ctx.fillText(`Player 2: ${this.state.scores[2]}`, sideX, y + 24);
        ctx.font = '12px Inter'; ctx.fillStyle = '#4a675a'; ctx.fillText(`In bag: ${this.state.bag.length}`, sideX, y + 57); ctx.fillText(`Turn: ${this.state.turn}`, sideX, y + 77);
        const status = this.state.winner === null ? `Turn: Player ${this.state.player}` : (this.state.winner ? `Winner: Player ${this.state.winner}` : 'Draw');
        ctx.fillStyle = '#244236'; ctx.font = '900 19px Inter'; ctx.fillText(`Word Tiles · ${status}`, 18, 18);
        ctx.font = '11px Inter'; ctx.fillStyle = '#4a675a'; this._wrapText(this.message || this.state.lastEvent, sideX, y + 112, 190, 16);
    }

    _wrapText(text, x, y, maxWidth, lineHeight) {
        const ctx = this.ctx; const words = String(text).split(/\s+/); let line = '';
        for (const word of words) { const test = `${line}${word} `; if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, y); line = `${word} `; y += lineHeight; } else line = test; } ctx.fillText(line, x, y);
    }

    destroy() {
        this.wasDestroyed = true;
        window.removeEventListener('keydown', this._keyDown); this.lobby?.destroy();
        this.actionBar?.removeEventListener('click', this._actionClick); this.actionBar?.remove();
        this.network.clearCallbacks(); if (this.session?.mode === 'lan') this.network.close();
    }
    wantsPointerLockNow() { return false; }
    getRecordSettings(settings = this.settings) { return { boardSize: settings.boardSize, rackSize: settings.rackSize, bingoBonus: settings.bingoBonus }; }

    preparePauseSettings(settings) {
        const boardSize = requireInteger(settings.boardSize ?? 15, 'Board size', { minimum: 1 });
        if (boardSize % 2 === 0) throw new Error('Board size must be odd so the centre starting square exists.');
        requireInteger(settings.rackSize ?? 7, 'Rack size', { minimum: 1 });
        requireFiniteNumber(settings.bingoBonus ?? 50, 'Bingo bonus', { minimum: 0 });
        requireFiniteNumber(settings.aiDelay ?? 0.7, 'AI delay', { minimum: 0 });
        requireInteger(settings.aiScanLimit ?? 50000, 'AI scan limit', { minimum: 1 });
        return settings;
    }
    static getSettingsSchema() {
        return [
            { key: 'boardSize', label: 'Board size (odd)', type: 'range', min: 9, max: 21, step: 2, default: 15 },
            { key: 'rackSize', label: 'Rack capacity', type: 'range', min: 5, max: 12, step: 1, default: 7 },
            { key: 'bingoBonus', label: 'Bonus for using entire rack', type: 'range', min: 0, max: 150, step: 5, default: 50 },
            { key: 'aiDelay', label: 'AI delay [s]', type: 'range', min: 0.1, max: 2, step: 0.05, default: 0.7 },
            { key: 'aiScanLimit', label: 'Words evaluated per AI turn', type: 'range', min: 5000, max: 120000, step: 5000, default: 50000 },
        ];
    }
    static getControlsSchema() { return []; }
}
