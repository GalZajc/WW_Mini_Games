import { BaseGame } from '../../core/BaseGame.js';
import { requireInteger } from '../../core/SettingsValidation.js';

/**
 * Tic Tac Toe — Single Player (vs AI) or Multiplayer (LAN via WebSocket).
 *
 * Settings are grouped by mode (Single Player / Multiplayer):
 *   sp_rows, sp_cols, sp_winLen, sp_ai  — single player
 *   mp_rows, mp_cols, mp_winLen         — multiplayer
 *
 * Lobby offers three options: Single Player, Host, Join.
 * Host generates a code that can be copied to clipboard.
 * Random symbol (X/O) and first-turn assignment.
 */
export default class TicTacToeGame extends BaseGame {

    init() {
        this.preparePauseSettings(this.settings || {});
        // Use standard ESC pause menu (handlesPause = false by default)
        this.gameMode = null;  // 'sp' | 'mp'

        // Grid config (set when mode is chosen)
        this.rows   = 3;
        this.cols   = 3;
        this.winLen = 3;

        // Game state
        this.grid       = [];
        this.mySymbol   = null;
        this.aiSymbol   = null;
        this.turn       = null;
        this.winner     = null;
        this.winCells   = [];
        this.lastMove   = null;

        // AI
        this.aiDifficulty = 'easy';
        this._aiPending   = false;
        this._aiTimer     = 0;

        // Phases: lobby | hosting | joining | connecting | playing | gameover
        this.phase       = 'lobby';
        this.statusText  = '';
        this.errorText   = '';
        this.joinCode    = '';
        this._hoveredBtn = null;
        this._buttons    = [];
        this._copiedFlash = 0;   // countdown for "Copied!" feedback

        // Keyboard listener for text input (join code)
        this._keyHandler = (e) => this._onKeyDown(e);
        window.addEventListener('keydown', this._keyHandler);

        // Network callbacks
        this.network.onConnect(() => this._onPeerConnected());
        this.network.onDisconnect(() => this._onPeerDisconnected());
        this.network.onMessage((msg) => this._onNetMessage(msg));
    }

    destroy() {
        window.removeEventListener('keydown', this._keyHandler);
        this.network.clearCallbacks();
        // Close network if in multiplayer
        if (this.gameMode === 'mp') {
            this.network.close();
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Mode start helpers                                       */
    /* ═══════════════════════════════════════════════════════════ */

    _startSinglePlayer() {
        this.gameMode      = 'sp';
        this.rows          = this.settings.sp_rows   ?? 3;
        this.cols          = this.settings.sp_cols   ?? 3;
        this.winLen        = this.settings.sp_winLen ?? 3;
        this.aiDifficulty  = this.settings.sp_ai     ?? 'easy';

        const playerIsX = Math.random() < 0.5;
        this.mySymbol   = playerIsX ? 'X' : 'O';
        this.aiSymbol   = playerIsX ? 'O' : 'X';
        this.turn       = Math.random() < 0.5 ? 'X' : 'O';

        this._resetGrid();
        this.phase = 'playing';
        this.audio.playBeep(800, 0.1, 0.3);

        // If AI goes first, schedule its move
        if (this.turn === this.aiSymbol) {
            this._scheduleAiMove();
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Grid                                                     */
    /* ═══════════════════════════════════════════════════════════ */

    _resetGrid() {
        this.grid = [];
        for (let r = 0; r < this.rows; r++) {
            this.grid.push(new Array(this.cols).fill(null));
        }
        this.winner   = null;
        this.winCells = [];
        this.lastMove = null;
    }

    _placeSymbol(r, c, symbol) {
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
        if (this.grid[r][c] !== null) return false;
        this.grid[r][c] = symbol;
        this.lastMove = { r, c };
        return true;
    }

    _checkWin(r, c) {
        const sym = this.grid[r][c];
        if (!sym) return null;

        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        for (const [dr, dc] of dirs) {
            const cells = [{ r, c }];
            for (let i = 1; i < this.winLen; i++) {
                const nr = r + dr * i, nc = c + dc * i;
                if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && this.grid[nr][nc] === sym) {
                    cells.push({ r: nr, c: nc });
                } else break;
            }
            for (let i = 1; i < this.winLen; i++) {
                const nr = r - dr * i, nc = c - dc * i;
                if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && this.grid[nr][nc] === sym) {
                    cells.push({ r: nr, c: nc });
                } else break;
            }
            if (cells.length >= this.winLen) return cells;
        }
        return null;
    }

    _isBoardFull() {
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (this.grid[r][c] === null) return false;
        return true;
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  AI                                                       */
    /* ═══════════════════════════════════════════════════════════ */

    _scheduleAiMove() {
        this._aiPending = true;
        this._aiTimer   = 0.3 + Math.random() * 0.4; // 300–700ms delay
    }

    _doAiMove() {
        const move = this.aiDifficulty === 'medium'
            ? this._aiMoveMedium()
            : this._aiMoveRandom();

        if (!move) return; // board full (shouldn't happen)

        this._placeSymbol(move.r, move.c, this.aiSymbol);
        this.audio.playClick();

        const win = this._checkWin(move.r, move.c);
        if (win) {
            this.winner   = this.aiSymbol;
            this.winCells = win;
            this.phase    = 'gameover';
            this.audio.playTone(300, 0.4, 'sawtooth', 0.25);
            this.submitScore({ result: 'loss', mode: 'sp', difficulty: this.aiDifficulty });
        } else if (this._isBoardFull()) {
            this.winner = 'draw';
            this.phase  = 'gameover';
            this.submitScore({ result: 'draw', mode: 'sp', difficulty: this.aiDifficulty });
        } else {
            this.turn = this.mySymbol;
        }
    }

    _aiMoveRandom() {
        const empty = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++)
                if (this.grid[r][c] === null) empty.push({ r, c });
        return empty.length ? empty[Math.floor(Math.random() * empty.length)] : null;
    }

    _aiMoveMedium() {
        // 1. Win if possible
        const winMove = this._findWinningMove(this.aiSymbol);
        if (winMove) return winMove;

        // 2. Block opponent's win
        const blockMove = this._findWinningMove(this.mySymbol);
        if (blockMove) return blockMove;

        // 3. Take center
        const cr = Math.floor(this.rows / 2), cc = Math.floor(this.cols / 2);
        if (this.grid[cr][cc] === null) return { r: cr, c: cc };

        // 4. Take a cell adjacent to own pieces (offensive)
        const adj = this._findAdjacentMove(this.aiSymbol);
        if (adj) return adj;

        // 5. Random fallback
        return this._aiMoveRandom();
    }

    _findWinningMove(symbol) {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] !== null) continue;
                this.grid[r][c] = symbol;
                const win = this._checkWin(r, c);
                this.grid[r][c] = null;
                if (win) return { r, c };
            }
        }
        return null;
    }

    _findAdjacentMove(symbol) {
        const candidates = [];
        const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] !== symbol) continue;
                for (const [dr, dc] of dirs) {
                    const nr = r + dr, nc = c + dc;
                    if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && this.grid[nr][nc] === null) {
                        candidates.push({ r: nr, c: nc });
                    }
                }
            }
        }
        return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Network handlers                                         */
    /* ═══════════════════════════════════════════════════════════ */

    _onPeerConnected() {
        if (this.phase === 'hosting') {
            this.gameMode = 'mp';
            this.rows   = this.settings.mp_rows   ?? 3;
            this.cols   = this.settings.mp_cols   ?? 3;
            this.winLen = this.settings.mp_winLen ?? 3;

            const hostIsX = Math.random() < 0.5;
            this.mySymbol = hostIsX ? 'X' : 'O';
            const firstTurn = Math.random() < 0.5 ? 'X' : 'O';
            this.turn = firstTurn;

            this.network.send({
                type: 'setup',
                yourSymbol: hostIsX ? 'O' : 'X',
                firstTurn,
                rows: this.rows,
                cols: this.cols,
                winLen: this.winLen,
            });

            this._resetGrid();
            this.phase = 'playing';
            this.audio.playBeep(800, 0.1, 0.3);
        }
    }

    _onPeerDisconnected() {
        if (this.phase === 'playing' || this.phase === 'gameover') {
            this.winner = 'disconnect';
            this.phase  = 'gameover';
        }
    }

    _onNetMessage(msg) {
        switch (msg.type) {
            case 'setup':
                this.gameMode  = 'mp';
                this.mySymbol  = msg.yourSymbol;
                this.turn      = msg.firstTurn;
                this.rows      = msg.rows;
                this.cols      = msg.cols;
                this.winLen    = msg.winLen;
                this._resetGrid();
                this.phase = 'playing';
                this.audio.playBeep(800, 0.1, 0.3);
                break;

            case 'move': {
                this._placeSymbol(msg.r, msg.c, msg.symbol);
                const win = this._checkWin(msg.r, msg.c);
                if (win) {
                    this.winner   = msg.symbol;
                    this.winCells = win;
                    this.phase    = 'gameover';
                    this.audio.playTone(300, 0.4, 'sawtooth', 0.25);
                } else if (this._isBoardFull()) {
                    this.winner = 'draw';
                    this.phase  = 'gameover';
                } else {
                    this.turn = this.turn === 'X' ? 'O' : 'X';
                    this.audio.playClick();
                }
                break;
            }

            case 'rematch':
                this.mySymbol = msg.yourSymbol;
                this.turn     = msg.firstTurn;
                this._resetGrid();
                this.phase  = 'playing';
                this.winner = null;
                this.audio.playBeep(800, 0.1, 0.3);
                break;
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Keyboard (text input for join code)                      */
    /* ═══════════════════════════════════════════════════════════ */

    _onKeyDown(e) {
        if (this.phase !== 'joining') return;

        if (e.key === 'Backspace') {
            this.joinCode = this.joinCode.slice(0, -1);
            e.preventDefault();
        } else if (e.key === 'Enter') {
            this._doJoin();
            e.preventDefault();
        } else if (e.key === 'Escape') {
            this.phase = 'lobby';
            e.preventDefault();
        } else if (e.key.length === 1 && /[0-9.:]/.test(e.key)) {
            this.joinCode += e.key;
            e.preventDefault();
        } else if (e.key === 'v' && e.ctrlKey) {
            navigator.clipboard.readText().then(text => {
                this.joinCode += text.trim();
            }).catch(() => {});
            e.preventDefault();
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Update                                                   */
    /* ═══════════════════════════════════════════════════════════ */

    update(dt) {
        const mx = this.input.getMousePos().x;
        const my = this.input.getMousePos().y;
        const clicked = this.input.isMouseJustDown(0);

        // Copied flash countdown
        if (this._copiedFlash > 0) this._copiedFlash -= dt;

        // AI timer (single player)
        if (this.phase === 'playing' && this.gameMode === 'sp' && this._aiPending) {
            this._aiTimer -= dt;
            if (this._aiTimer <= 0) {
                this._aiPending = false;
                this._doAiMove();
                return; // state may have changed
            }
        }

        // Button hover detection
        this._hoveredBtn = null;
        for (const btn of this._buttons) {
            if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
                this._hoveredBtn = btn.id;
                if (clicked) {
                    this._onButtonClick(btn.id);
                    return;
                }
            }
        }

        // Grid click during playing phase (my turn)
        if (this.phase === 'playing' && clicked) {
            const isMyTurn = this.turn === this.mySymbol;
            if (!isMyTurn) return;
            // In SP mode, don't allow click while AI is pending
            if (this.gameMode === 'sp' && this._aiPending) return;

            const cell = this._getCellAt(mx, my);
            if (cell && this.grid[cell.r][cell.c] === null) {
                this._placeSymbol(cell.r, cell.c, this.mySymbol);
                this.audio.playClick();

                if (this.gameMode === 'mp') {
                    this.network.send({ type: 'move', r: cell.r, c: cell.c, symbol: this.mySymbol });
                }

                const win = this._checkWin(cell.r, cell.c);
                if (win) {
                    this.winner   = this.mySymbol;
                    this.winCells = win;
                    this.phase    = 'gameover';
                    this.audio.playSuccess();
                    this.submitScore({
                        result: 'win',
                        mode: this.gameMode,
                        ...(this.gameMode === 'sp' ? { difficulty: this.aiDifficulty } : {}),
                    });
                } else if (this._isBoardFull()) {
                    this.winner = 'draw';
                    this.phase  = 'gameover';
                    this.submitScore({ result: 'draw', mode: this.gameMode });
                } else {
                    this.turn = this.turn === 'X' ? 'O' : 'X';
                    // Schedule AI move in SP
                    if (this.gameMode === 'sp') {
                        this._scheduleAiMove();
                    }
                }
            }
        }
    }

    _onButtonClick(id) {
        this.audio.playClick();
        switch (id) {
            case 'singleplayer':
                this._startSinglePlayer();
                break;
            case 'host':
                this._doHost();
                break;
            case 'join':
                this.phase = 'joining';
                this.joinCode = '';
                this.errorText = '';
                break;
            case 'connect':
                this._doJoin();
                break;
            case 'cancel':
                this.network.close();
                this.phase = 'lobby';
                break;
            case 'copy':
                this._copyCode();
                break;
            case 'rematch-sp':
                this._startSinglePlayer();
                break;
            case 'rematch-mp':
                this._requestRematch();
                break;
        }
    }

    async _doHost() {
        this.phase = 'hosting';
        this.statusText = 'Starting server...';
        const result = await this.network.host();
        if (result.success) {
            this.statusText = 'Waiting for opponent...';
        } else {
            this.errorText = result.error || 'Failed to host';
            this.phase = 'lobby';
        }
    }

    async _doJoin() {
        if (!this.joinCode.trim()) return;
        this.phase = 'connecting';
        this.statusText = 'Connecting...';
        const result = await this.network.join(this.joinCode.trim());
        if (!result.success) {
            this.errorText = result.error || 'Failed to connect';
            this.phase = 'joining';
        }
    }

    _copyCode() {
        const code = this.network.code;
        if (code) {
            navigator.clipboard.writeText(code).then(() => {
                this._copiedFlash = 2.0; // show "Copied!" for 2s
            }).catch(() => {});
        }
    }

    _requestRematch() {
        this._resetGrid();
        this.turn = Math.random() < 0.5 ? 'X' : 'O';
        this.mySymbol = this.mySymbol === 'X' ? 'O' : 'X';
        this.network.send({
            type: 'rematch',
            yourSymbol: this.mySymbol === 'X' ? 'O' : 'X',
            firstTurn: this.turn,
        });
        this.phase  = 'playing';
        this.winner = null;
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Grid geometry                                            */
    /* ═══════════════════════════════════════════════════════════ */

    _getGridLayout() {
        const w = this.w, h = this.h;
        const maxGridW = w * 0.7;
        const maxGridH = h * 0.65;
        const cellSize = Math.min(maxGridW / this.cols, maxGridH / this.rows, 80);
        const gridW = cellSize * this.cols;
        const gridH = cellSize * this.rows;
        const gridX = (w - gridW) / 2;
        const gridY = (h - gridH) / 2 + 20;
        return { cellSize, gridW, gridH, gridX, gridY };
    }

    _getCellAt(mx, my) {
        const { cellSize, gridX, gridY } = this._getGridLayout();
        const col = Math.floor((mx - gridX) / cellSize);
        const row = Math.floor((my - gridY) / cellSize);
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            return { r: row, c: col };
        }
        return null;
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Render                                                   */
    /* ═══════════════════════════════════════════════════════════ */

    render() {
        this._buttons = [];
        this.clear('#49b8e8');

        switch (this.phase) {
            case 'lobby':      this._renderLobby();      break;
            case 'hosting':    this._renderHosting();    break;
            case 'joining':    this._renderJoining();    break;
            case 'connecting': this._renderConnecting(); break;
            case 'playing':    this._renderPlaying();    break;
            case 'gameover':   this._renderGameOver();   break;
        }
    }

    /* ── Lobby ───────────────────────────────────────────────── */

    _renderLobby() {
        const ctx = this.ctx, w = this.w, h = this.h;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px Inter, sans-serif';
        ctx.fillText('Tic Tac Toe', w / 2, h * 0.18);

        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText('Change grid size & settings via ESC → Settings', w / 2, h * 0.24);

        const btnW = 220, btnH = 42, gap = 12;
        const bx = w / 2 - btnW / 2;
        let by = h * 0.34;

        this._drawBtn(bx, by, btnW, btnH, '🎮  Single Player', 'singleplayer', true);
        by += btnH + gap;

        // Separator
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 2 - 80, by + 4);
        ctx.lineTo(w / 2 + 80, by + 4);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText('MULTIPLAYER', w / 2, by + 4);
        by += 20;

        this._drawBtn(bx, by, btnW, btnH, '🖥  Host Game', 'host', false);
        by += btnH + gap;
        this._drawBtn(bx, by, btnW, btnH, '🔗  Join Game', 'join', false);

        // Error text
        if (this.errorText) {
            ctx.fillStyle = '#ff4466';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(this.errorText, w / 2, h * 0.82);
        }
    }

    /* ── Hosting ─────────────────────────────────────────────── */

    _renderHosting() {
        const ctx = this.ctx, w = this.w, h = this.h;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.fillText('Waiting for opponent...', w / 2, h * 0.25);

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText('Share this code with your opponent:', w / 2, h * 0.34);

        // Code box
        const code = this.network.code || '...';
        const codeW = Math.max(280, code.length * 14 + 60);
        const codeH = 44;
        const cx = w / 2 - codeW / 2;
        const cy = h * 0.40;

        ctx.fillStyle = '#333b36';
        ctx.strokeStyle = '#258d37';
        ctx.lineWidth = 2;
        this._roundRect(cx, cy, codeW, codeH, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#8bea71';
        ctx.font = 'bold 20px JetBrains Mono, monospace';
        ctx.fillText(code, w / 2, cy + codeH / 2);

        // Copy button
        const copyLabel = this._copiedFlash > 0 ? '✓ Copied!' : '📋 Copy Code';
        const copyColor = this._copiedFlash > 0;
        const copyBtnW = 150, copyBtnH = 34;
        const copyX = w / 2 - copyBtnW / 2;
        const copyY = cy + codeH + 12;

        // Draw copy button with special styling for "Copied!" state
        const hovered = this._hoveredBtn === 'copy';
        if (this._copiedFlash > 0) {
            ctx.fillStyle = '#00d68f';
        } else {
            ctx.fillStyle = hovered ? '#48be45' : '#258d37';
        }
        this._roundRect(copyX, copyY, copyBtnW, copyBtnH, 5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText(copyLabel, w / 2, copyY + copyBtnH / 2);
        this._buttons.push({ id: 'copy', x: copyX, y: copyY, w: copyBtnW, h: copyBtnH });

        // Pulsing dot
        const alpha = 0.3 + 0.4 * Math.abs(Math.sin(Date.now() / 500));
        ctx.fillStyle = `rgba(37, 141, 55, ${alpha})`;
        ctx.beginPath();
        ctx.arc(w / 2, copyY + copyBtnH + 24, 4, 0, Math.PI * 2);
        ctx.fill();

        // Cancel
        this._drawBtn(w / 2 - 70, copyY + copyBtnH + 44, 140, 34, 'Cancel', 'cancel', false);

        // Settings hint
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(`Grid: ${this.settings.mp_rows ?? 3}×${this.settings.mp_cols ?? 3}  •  Win: ${this.settings.mp_winLen ?? 3}`, w / 2, h * 0.87);
    }

    /* ── Joining ─────────────────────────────────────────────── */

    _renderJoining() {
        const ctx = this.ctx, w = this.w, h = this.h;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.fillText('Join Game', w / 2, h * 0.28);

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText('Enter the host\'s code:', w / 2, h * 0.36);

        // Text input box
        const inpW = 280, inpH = 40;
        const ix = w / 2 - inpW / 2;
        const iy = h * 0.42;

        ctx.fillStyle = '#333b36';
        ctx.strokeStyle = '#258d37';
        ctx.lineWidth = 2;
        this._roundRect(ix, iy, inpW, inpH, 5);
        ctx.fill();
        ctx.stroke();

        const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? '│' : '';
        ctx.fillStyle = this.joinCode ? '#ffffff' : 'rgba(255,255,255,0.25)';
        ctx.font = '16px JetBrains Mono, monospace';
        ctx.fillText(this.joinCode ? this.joinCode + cursor : '192.168.x.x:port', w / 2, iy + inpH / 2);

        if (this.errorText) {
            ctx.fillStyle = '#ff4466';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText(this.errorText, w / 2, h * 0.56);
        }

        const btnY = h * 0.62;
        this._drawBtn(w / 2 - 150, btnY, 140, 34, 'Cancel', 'cancel', false);
        this._drawBtn(w / 2 + 10, btnY, 140, 34, 'Connect', 'connect', true);

        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText('Ctrl+V to paste  •  Enter to connect', w / 2, h * 0.74);
    }

    /* ── Connecting ──────────────────────────────────────────── */

    _renderConnecting() {
        const ctx = this.ctx, w = this.w, h = this.h;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const dots = '.'.repeat(Math.floor(Date.now() / 400) % 4);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '18px Inter, sans-serif';
        ctx.fillText('Connecting' + dots, w / 2, h / 2);
    }

    /* ── Playing ─────────────────────────────────────────────── */

    _renderPlaying() {
        const ctx = this.ctx, w = this.w, h = this.h;
        const { cellSize, gridW, gridH, gridX, gridY } = this._getGridLayout();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const isMyTurn = this.turn === this.mySymbol;
        let turnText, turnColor;

        if (this.gameMode === 'sp' && this._aiPending) {
            turnText = 'AI is thinking...';
            turnColor = '#ff9900';
        } else if (isMyTurn) {
            turnText = 'Your turn';
            turnColor = '#00d68f';
        } else {
            turnText = this.gameMode === 'sp' ? 'AI\'s turn' : 'Opponent\'s turn';
            turnColor = '#ff9900';
        }

        ctx.fillStyle = turnColor;
        ctx.font = 'bold 16px Inter, sans-serif';
        ctx.fillText(turnText, w / 2, gridY - 36);

        const oppLabel = this.gameMode === 'sp' ? `AI (${this.aiDifficulty})` : 'Opponent';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(`You: ${this.mySymbol}  •  ${oppLabel}: ${this.mySymbol === 'X' ? 'O' : 'X'}  •  Turn: ${this.turn}`, w / 2, gridY - 16);

        // Grid lines
        ctx.strokeStyle = '#333355';
        ctx.lineWidth = 2;
        for (let r = 0; r <= this.rows; r++) {
            ctx.beginPath();
            ctx.moveTo(gridX, gridY + r * cellSize);
            ctx.lineTo(gridX + gridW, gridY + r * cellSize);
            ctx.stroke();
        }
        for (let c = 0; c <= this.cols; c++) {
            ctx.beginPath();
            ctx.moveTo(gridX + c * cellSize, gridY);
            ctx.lineTo(gridX + c * cellSize, gridY + gridH);
            ctx.stroke();
        }

        // Symbols
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const sym = this.grid[r][c];
                if (!sym) continue;
                const cx = gridX + c * cellSize + cellSize / 2;
                const cy = gridY + r * cellSize + cellSize / 2;
                const s  = cellSize * 0.32;
                if (sym === 'X') this._drawX(cx, cy, s);
                else this._drawO(cx, cy, s);
            }
        }

        // Hover highlight
        if (isMyTurn && this.phase === 'playing' && !(this.gameMode === 'sp' && this._aiPending)) {
            const mp = this.input.getMousePos();
            const cell = this._getCellAt(mp.x, mp.y);
            if (cell && this.grid[cell.r][cell.c] === null) {
                const cx = gridX + cell.c * cellSize;
                const cy = gridY + cell.r * cellSize;
                ctx.fillStyle = 'rgba(37, 141, 55, 0.15)';
                ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
            }
        }

        // Last move highlight
        if (this.lastMove) {
            const lx = gridX + this.lastMove.c * cellSize;
            const ly = gridY + this.lastMove.r * cellSize;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 2;
            ctx.strokeRect(lx + 2, ly + 2, cellSize - 4, cellSize - 4);
        }

        // Win line highlight
        if (this.winCells.length > 0) {
            ctx.fillStyle = 'rgba(0, 214, 143, 0.15)';
            for (const { r, c } of this.winCells) {
                ctx.fillRect(gridX + c * cellSize + 1, gridY + r * cellSize + 1, cellSize - 2, cellSize - 2);
            }
        }
    }

    /* ── Game Over ───────────────────────────────────────────── */

    _renderGameOver() {
        this._renderPlaying();

        const ctx = this.ctx, w = this.w, h = this.h;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let title, color;
        if (this.winner === 'draw') {
            title = 'DRAW';
            color = '#ffaa00';
        } else if (this.winner === 'disconnect') {
            title = 'Opponent Disconnected';
            color = '#ff4466';
        } else if (this.winner === this.mySymbol) {
            title = 'YOU WIN! 🎉';
            color = '#00d68f';
        } else {
            title = this.gameMode === 'sp' ? 'AI WINS' : 'YOU LOSE';
            color = '#ff4466';
        }

        ctx.fillStyle = color;
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.fillText(title, w / 2, h * 0.38);

        const btnY = h * 0.52;
        if (this.winner === 'disconnect') {
            // The common pause menu owns navigation; no duplicate exit or
            // controls panel is drawn inside the game-over overlay.
        } else if (this.gameMode === 'sp') {
            this._drawBtn(w / 2 - 72.5, btnY, 145, 38, '🔄 Play Again', 'rematch-sp', true);
        } else {
            this._drawBtn(w / 2 - 72.5, btnY, 145, 38, '🔄 Rematch', 'rematch-mp', true);
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Drawing helpers                                          */
    /* ═══════════════════════════════════════════════════════════ */

    _drawX(cx, cy, s) {
        const ctx = this.ctx;
        ctx.strokeStyle = '#e94b43';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - s);
        ctx.lineTo(cx + s, cy + s);
        ctx.moveTo(cx + s, cy - s);
        ctx.lineTo(cx - s, cy + s);
        ctx.stroke();
    }

    _drawO(cx, cy, s) {
        const ctx = this.ctx;
        ctx.strokeStyle = '#00d68f';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, s, 0, Math.PI * 2);
        ctx.stroke();
    }

    _drawBtn(x, y, w, h, label, id, primary) {
        const ctx = this.ctx;
        const hovered = this._hoveredBtn === id;

        ctx.fillStyle = primary
            ? (hovered ? '#48be45' : '#258d37')
            : (hovered ? '#46504a' : '#333b36');
        ctx.strokeStyle = primary ? '#187127' : '#59645d';
        ctx.lineWidth = 1;
        this._roundRect(x, y, w, h, 5);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = primary ? '#ffffff' : '#d0d0e0';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w / 2, y + h / 2);

        this._buttons.push({ id, x, y, w, h });
    }

    _roundRect(x, y, w, h, r) {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Schema                                                   */
    /* ═══════════════════════════════════════════════════════════ */

    static getSettingsSchema() {
        return [
            // ── Single Player ──
            { key: 'sp_rows',   label: 'Grid Rows',      group: 'Single Player', type: 'range', min: 2, max: 20, step: 1, default: 9 },
            { key: 'sp_cols',   label: 'Grid Columns',    group: 'Single Player', type: 'range', min: 2, max: 20, step: 1, default: 16 },
            { key: 'sp_winLen', label: 'Win Length',      group: 'Single Player', type: 'range', min: 2, max: 20, step: 1, default: 6 },
            {
                key: 'sp_ai', label: 'AI Difficulty', group: 'Single Player', type: 'select', default: 'easy',
                options: [
                    { value: 'easy',   label: 'Easy (Random)' },
                    { value: 'medium', label: 'Medium (Heuristic)' },
                ],
            },
            // ── Multiplayer ──
            { key: 'mp_rows',   label: 'Grid Rows',      group: 'Multiplayer', type: 'range', min: 2, max: 20, step: 1, default: 10 },
            { key: 'mp_cols',   label: 'Grid Columns',    group: 'Multiplayer', type: 'range', min: 2, max: 20, step: 1, default: 15 },
            { key: 'mp_winLen', label: 'Win Length',      group: 'Multiplayer', type: 'range', min: 2, max: 20, step: 1, default: 6 },
        ];
    }

    preparePauseSettings(settings) {
        for (const prefix of ['sp', 'mp']) {
            const rows = requireInteger(settings[`${prefix}_rows`] ?? 3, `${prefix.toUpperCase()} rows`, { minimum: 1 });
            const cols = requireInteger(settings[`${prefix}_cols`] ?? 3, `${prefix.toUpperCase()} columns`, { minimum: 1 });
            const winLen = requireInteger(settings[`${prefix}_winLen`] ?? 3, `${prefix.toUpperCase()} win length`, { minimum: 1 });
            if (winLen > Math.max(rows, cols)) {
                throw new Error(`${prefix.toUpperCase()} win length cannot exceed the longest grid dimension (${Math.max(rows, cols)}).`);
            }
        }
        const difficulty = settings.sp_ai ?? 'easy';
        if (!['easy', 'medium'].includes(difficulty)) {
            throw new Error('AI difficulty must be Easy or Medium.');
        }
        return settings;
    }

    static getControlsSchema() {
        return [
            {
                action: 'click',
                label: 'Place Symbol',
                defaultBindings: [
                    { type: 'mouse', code: 0 },
                ],
            },
        ];
    }
}
