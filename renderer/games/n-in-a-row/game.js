import { BaseGame } from '../../core/BaseGame.js';
import { requireInteger } from '../../core/SettingsValidation.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import {
    initializeModeSettings,
    switchModeSettings,
    syncActiveModeProfile,
    withModeProfiles,
} from '../../core/ModeSettings.js';

const MODES = Object.freeze({
    rotate: { label: 'Clockwise gravity', artKey: 'nrow-rotate', description: 'Rotate 90° clockwise after every move, then let all pieces fall.' },
    random: { label: 'Random gravity', artKey: 'nrow-random', description: 'After every move: clockwise, counter-clockwise, or no rotation.' },
    shoot: { label: 'Edge shot', artKey: 'nrow-shoot', description: 'No gravity. Fire from any edge segment until the piece hits something.' },
    push: { label: 'Edge push', artKey: 'nrow-push', description: 'Like Edge shot, but the incoming piece packs every piece ahead of it against the far wall.' },
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const MODE_KEYS = Object.freeze(Object.keys(MODES));

function settingsSchema() {
    return [
        { key: 'mode', label: 'Mode', type: 'hidden', default: 'rotate' },
        { key: 'columns', label: 'Nx · columns', type: 'number', min: 3, max: 20, step: 1, default: 7, group: 'Board' },
        { key: 'rows', label: 'Ny · rows', type: 'number', min: 3, max: 20, step: 1, default: 6, group: 'Board' },
        { key: 'winLength', label: 'N · pieces in row', type: 'number', min: 3, max: 20, step: 1, default: 4, group: 'Board' },
    ];
}

function initializeNInRowSettings(settings) {
    let source = settings || {};
    if (!source.modeProfiles || Object.keys(source.modeProfiles).length === 0) {
        const sharedLegacy = Object.fromEntries(settingsSchema()
            .filter(setting => setting.key !== 'mode' && source[setting.key] !== undefined)
            .map(setting => [setting.key, source[setting.key]]));
        source = {
            ...source,
            modeProfiles: Object.fromEntries(MODE_KEYS.map(mode => [mode, { ...sharedLegacy }])),
        };
    }
    return initializeModeSettings(source, MODE_KEYS, settingsSchema(), 'rotate');
}

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    return Date.now() >>> 0;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

export class NInRowBoard {
    constructor(columns = 7, rows = 6, winLength = 4) {
        this.columns = requireInteger(columns, 'Board columns', { minimum: 1 });
        this.rows = requireInteger(rows, 'Board rows', { minimum: 1 });
        this.winLength = requireInteger(winLength, 'Win length', { minimum: 1 });
        if (this.winLength > Math.max(this.columns, this.rows)) {
            throw new Error(`Win length cannot exceed the longest grid dimension (${Math.max(this.columns, this.rows)}).`);
        }
        this.grid = Array.from({ length: this.rows }, () => Array(this.columns).fill(0));
    }

    cloneGrid() {
        return this.grid.map(row => [...row]);
    }

    drop(column, player) {
        if (column < 0 || column >= this.columns) return null;
        for (let row = this.rows - 1; row >= 0; row--) {
            if (this.grid[row][column] !== 0) continue;
            this.grid[row][column] = player;
            return { row, column };
        }
        return null;
    }

    rotate(direction) {
        if (direction === 0) return;
        const oldRows = this.rows;
        const oldColumns = this.columns;
        const next = Array.from({ length: oldColumns }, () => Array(oldRows).fill(0));
        for (let row = 0; row < oldRows; row++) {
            for (let column = 0; column < oldColumns; column++) {
                if (direction > 0) next[column][oldRows - 1 - row] = this.grid[row][column];
                else next[oldColumns - 1 - column][row] = this.grid[row][column];
            }
        }
        this.rows = oldColumns;
        this.columns = oldRows;
        this.grid = next;
    }

    settle() {
        for (let column = 0; column < this.columns; column++) {
            const pieces = [];
            for (let row = 0; row < this.rows; row++) {
                if (this.grid[row][column]) pieces.push(this.grid[row][column]);
                this.grid[row][column] = 0;
            }
            const start = this.rows - pieces.length;
            pieces.forEach((piece, index) => { this.grid[start + index][column] = piece; });
        }
    }

    edgeLine(side, index) {
        const line = [];
        if (side === 'top' || side === 'bottom') {
            if (index < 0 || index >= this.columns) return line;
            for (let offset = 0; offset < this.rows; offset++) {
                const row = side === 'top' ? offset : this.rows - 1 - offset;
                line.push({ row, column: index });
            }
        } else {
            if (index < 0 || index >= this.rows) return line;
            for (let offset = 0; offset < this.columns; offset++) {
                const column = side === 'left' ? offset : this.columns - 1 - offset;
                line.push({ row: index, column });
            }
        }
        return line;
    }

    shoot(side, index, player, push = false) {
        const line = this.edgeLine(side, index);
        if (!line.length) return null;
        if (push) {
            const pieces = line
                .map(cell => this.grid[cell.row][cell.column])
                .filter(Boolean);
            if (pieces.length >= line.length) return null;
            for (const cell of line) this.grid[cell.row][cell.column] = 0;
            const packed = [player, ...pieces];
            const start = line.length - packed.length;
            packed.forEach((piece, offset) => {
                const cell = line[start + offset];
                this.grid[cell.row][cell.column] = piece;
            });
            return line[start];
        }
        let landing = null;
        for (const cell of line) {
            if (this.grid[cell.row][cell.column] !== 0) break;
            landing = cell;
        }
        if (!landing) return null;
        this.grid[landing.row][landing.column] = player;
        return landing;
    }

    winningCells(player) {
        const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (let row = 0; row < this.rows; row++) {
            for (let column = 0; column < this.columns; column++) {
                if (this.grid[row][column] !== player) continue;
                for (const [dr, dc] of directions) {
                    const cells = [];
                    for (let step = 0; step < this.winLength; step++) {
                        const r = row + dr * step;
                        const c = column + dc * step;
                        if (r < 0 || r >= this.rows || c < 0 || c >= this.columns
                            || this.grid[r][c] !== player) break;
                        cells.push({ row: r, column: c });
                    }
                    if (cells.length === this.winLength) return cells;
                }
            }
        }
        return [];
    }

    isFull() {
        return this.grid.every(row => row.every(Boolean));
    }
}

export default class NInRowGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.settings = initializeNInRowSettings(this.settings);
        requireInteger(this.settings.columns, 'Board columns', { minimum: 1 });
        requireInteger(this.settings.rows, 'Board rows', { minimum: 1 });
        requireInteger(this.settings.winLength, 'Win length', { minimum: 1 });
        this.mode = null;
        this.phase = 'mode-select';
        this.elapsed = 0;
        this.moves = 0;
        this.player = 1;
        this.winner = 0;
        this.winCells = [];
        this.lastTransform = '—';
        this._mouseDown = event => this._handlePointer(event);
        this._keyDown = event => {
            if (event.code === 'Enter' && this.phase === 'gameover') this._startMode(this.mode);
        };
        this.canvas.addEventListener('mousedown', this._mouseDown);
        window.addEventListener('keydown', this._keyDown);
        this._showModeSelector();
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        const selected = MODES[this.settings.mode] ? this.settings.mode : 'rotate';
        this.pendingMode = selected;
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'N in a Row',
            prompt: 'Choose movement mode',
            selectedMode: selected,
            modes: Object.entries(MODES).map(([key, mode]) => ({
                key, title: mode.label, description: mode.description, artKey: mode.artKey,
            })),
        });
        this.modeSelector.insertAdjacentHTML('beforeend', `<div hidden data-mode-profile-proxy>${this._field('columns', 'Nx · columns', 3, 20, this.settings.columns ?? 7)}${this._field('rows', 'Ny · rows', 3, 20, this.settings.rows ?? 6)}${this._field('winLength', 'N · in a row', 3, 20, this.settings.winLength ?? 4)}</div>`);
        document.body.appendChild(this.modeSelector);
        this._selectorClick = bindModeGallery(this.modeSelector, {
            onMode: mode => {
                this._selectPendingMode(mode);
                this._startMode(mode);
            },
            onBack: () => this.endGame(),
        });
    }

    _field(key, label, min, max, value) {
        return `<label style="display:grid;gap:4px;font-size:10px;color:#45604a;text-transform:uppercase;letter-spacing:.07em;">${label}<input data-size="${key}" type="number" step="1" value="${value}" style="padding:7px;border-radius:8px;color-scheme:dark;"></label>`;
    }

    _capturePendingProfile() {
        if (!this.modeSelector || !MODES[this.pendingMode]) return;
        this.modeSelector.querySelectorAll('[data-size]').forEach(input => {
            this.settings[input.dataset.size] = Number(input.value);
        });
        this.settings.mode = this.pendingMode;
        this.settings = syncActiveModeProfile(this.settings, MODE_KEYS, settingsSchema(), 'rotate');
    }

    _selectPendingMode(mode) {
        if (!MODES[mode] || mode === this.pendingMode) return;
        this._capturePendingProfile();
        this.settings = switchModeSettings(this.settings, mode, MODE_KEYS, settingsSchema(), 'rotate');
        this.pendingMode = mode;
        this.modeSelector?.querySelectorAll('[data-size]').forEach(input => {
            input.value = String(this.settings[input.dataset.size]);
        });
    }

    _startMode(mode) {
        if (!MODES[mode]) return;
        // Programmatic callers may start a card directly after editing the
        // visible fields. Treat those visible values as belonging to `mode`.
        if (this.modeSelector) {
            this.pendingMode = mode;
            this._capturePendingProfile();
        }
        if (this.settings.mode !== mode) {
            this.settings = switchModeSettings(this.settings, mode, MODE_KEYS, settingsSchema(), 'rotate');
        }
        this.settings = syncActiveModeProfile(this.settings, MODE_KEYS, settingsSchema(), 'rotate');
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
                message.style.cssText = 'margin-top:10px;color:#b3261e;font-weight:800;font-size:12px;';
            }
            return false;
        }
        this.app.currentSettings = { ...this.settings };
        this.app.settingsManager.save('n-in-a-row', this.settings).catch(() => {});
        this.modeSelector?.remove();
        this.modeSelector = null;
        this.mode = mode;
        const columns = requireInteger(this.settings.columns ?? 7, 'Board columns', { minimum: 1 });
        const rows = requireInteger(this.settings.rows ?? 6, 'Board rows', { minimum: 1 });
        const winLength = requireInteger(this.settings.winLength ?? 4, 'Win length', { minimum: 1 });
        this.board = new NInRowBoard(columns, rows, winLength);
        this.seed = makeSeed();
        this.random = seededRandom(this.seed);
        this.phase = 'playing';
        this.elapsed = 0;
        this.moves = 0;
        this.player = 1;
        this.winner = 0;
        this.winCells = [];
        this.animation = null;
        this.lastTransform = mode === 'shoot' || mode === 'push' ? 'No gravity' : 'Gravity down';
    }

    returnToModeSelector() {
        this.board = null;
        this.mode = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    _handlePointer(event) {
        if (event.button !== 0) return;
        if (this.phase === 'gameover') {
            this._startMode(this.mode);
            return;
        }
        if (this.phase !== 'playing' || !this.layout) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * this.canvas.width / rect.width;
        const y = (event.clientY - rect.top) * this.canvas.height / rect.height;
        const layout = this.layout;
        const before = {
            grid: this.board.cloneGrid(),
            columns: this.board.columns,
            rows: this.board.rows,
        };
        let placed = null;
        let shot = null;
        if (this.mode === 'rotate' || this.mode === 'random') {
            const column = Math.floor((x - layout.x) / layout.cell);
            if (x >= layout.x && x < layout.x + layout.width) placed = this.board.drop(column, this.player);
        } else {
            const margin = layout.edgeMargin;
            let side = null;
            let index = -1;
            if (x >= layout.x && x < layout.x + layout.width && y >= layout.y - margin && y < layout.y) {
                side = 'top'; index = Math.floor((x - layout.x) / layout.cell);
            } else if (x >= layout.x && x < layout.x + layout.width && y > layout.y + layout.height && y <= layout.y + layout.height + margin) {
                side = 'bottom'; index = Math.floor((x - layout.x) / layout.cell);
            } else if (y >= layout.y && y < layout.y + layout.height && x >= layout.x - margin && x < layout.x) {
                side = 'left'; index = Math.floor((y - layout.y) / layout.cell);
            } else if (y >= layout.y && y < layout.y + layout.height && x > layout.x + layout.width && x <= layout.x + layout.width + margin) {
                side = 'right'; index = Math.floor((y - layout.y) / layout.cell);
            }
            if (side) {
                shot = { side, index, line: this.board.edgeLine(side, index) };
                placed = this.board.shoot(side, index, this.player, this.mode === 'push');
            }
        }
        if (!placed) {
            this.audio.playPlasticImpact?.(0.11);
            return;
        }
        this.moves++;
        if (this.mode === 'rotate' || this.mode === 'random') {
            const afterDrop = this.board.cloneGrid();
            const direction = this.mode === 'rotate'
                ? 1
                : [-1, 0, 1][Math.floor(this.random() * 3)];
            this.board.rotate(direction);
            const afterRotate = this.board.cloneGrid();
            const rotatedColumns = this.board.columns;
            const rotatedRows = this.board.rows;
            this.board.settle();
            this.lastTransform = direction > 0 ? '↻ Clockwise' : direction < 0 ? '↺ Counter-clockwise' : '• Stayed still';
            this.animation = {
                kind: 'rotate',
                elapsed: 0,
                duration: direction === 0 ? 0.55 : 1.0,
                direction,
                player: this.player,
                placed,
                before,
                afterDrop,
                afterRotate,
                rotatedColumns,
                rotatedRows,
                finalGrid: this.board.cloneGrid(),
                settleMoves: this._settleMoves(afterRotate, this.board.grid),
                impactPlayed: false,
            };
        } else {
            this.animation = {
                kind: 'shoot',
                elapsed: 0,
                duration: this.mode === 'push' ? 0.62 : 0.44,
                player: this.player,
                push: this.mode === 'push',
                placed,
                shot,
                before,
                finalGrid: this.board.cloneGrid(),
                lineMoves: this._lineMoves(before.grid, shot.line, this.player, this.mode === 'push', placed),
                impactPlayed: false,
            };
        }
        this.phase = 'animating';
    }

    _settleMoves(rotatedGrid, finalGrid) {
        const rows = rotatedGrid.length;
        const columns = rotatedGrid[0]?.length || 0;
        const moves = [];
        for (let column = 0; column < columns; column++) {
            const pieces = [];
            for (let row = 0; row < rows; row++) {
                if (rotatedGrid[row][column]) pieces.push({ player: rotatedGrid[row][column], fromRow: row });
            }
            const start = rows - pieces.length;
            pieces.forEach((piece, index) => moves.push({
                player: piece.player,
                column,
                fromRow: piece.fromRow,
                toRow: start + index,
            }));
        }
        return moves;
    }

    _lineMoves(beforeGrid, line, player, push, placed) {
        if (!push) return [{
            player,
            fromIndex: -0.82,
            toIndex: line.findIndex(cell => cell.row === placed.row && cell.column === placed.column),
        }];
        const existing = [];
        line.forEach((cell, index) => {
            const value = beforeGrid[cell.row][cell.column];
            if (value) existing.push({ player: value, fromIndex: index });
        });
        const start = line.length - existing.length - 1;
        return [
            { player, fromIndex: -0.82, toIndex: start },
            ...existing.map((piece, index) => ({ ...piece, toIndex: start + 1 + index })),
        ];
    }

    _resolveMove() {
        const currentWin = this.board.winningCells(this.player);
        const other = this.player === 1 ? 2 : 1;
        const otherWin = this.board.winningCells(other);
        if (currentWin.length || otherWin.length) {
            this.winner = currentWin.length ? this.player : other;
            this.winCells = currentWin.length ? currentWin : otherWin;
            this.phase = 'gameover';
            this.audio.playPlasticImpact?.(0.48);
            this.submitScore({ winner: this.winner, moves: this.moves, seconds: Number(this.elapsed.toFixed(3)), mode: this.mode, seed: this.seed });
            return;
        }
        if (this.board.isFull()) {
            this.phase = 'gameover';
            this.submitScore({ winner: 0, moves: this.moves, seconds: Number(this.elapsed.toFixed(3)), mode: this.mode, seed: this.seed });
            return;
        }
        this.player = other;
    }

    update(dt) {
        if (this.phase === 'playing' || this.phase === 'animating') this.elapsed += dt;
        if (this.phase !== 'animating' || !this.animation) return;
        const animation = this.animation;
        const previous = animation.elapsed;
        animation.elapsed = Math.min(animation.duration, animation.elapsed + dt);
        const impactTime = animation.kind === 'rotate' ? Math.min(0.28, animation.duration * 0.52) : animation.duration * 0.9;
        if (!animation.impactPlayed && previous < impactTime && animation.elapsed >= impactTime) {
            animation.impactPlayed = true;
            this.audio.playPlasticImpact?.(0.34);
        }
        if (animation.elapsed >= animation.duration) {
            this.animation = null;
            this.phase = 'playing';
            this._resolveMove();
        }
    }

    render() {
        const ctx = this.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.h);
        sky.addColorStop(0, '#69cef7');
        sky.addColorStop(0.7, '#bdefff');
        sky.addColorStop(1, '#e8fbff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, this.w, this.h);
        if (!this.board) return;
        if (this.animation) this._renderAnimation(ctx, this.animation);
        else {
            const edgeMargin = this.mode === 'shoot' || this.mode === 'push' ? 34 : 8;
            this.layout = this._calculateLayout(this.board.columns, this.board.rows, edgeMargin);
            this._drawBoardGrid(ctx, this.board.grid, this.board.columns, this.board.rows, this.layout, true);
            if (edgeMargin > 8) {
                const { x, y, width, height, cell } = this.layout;
                this._drawEdgeLaunchers(ctx, x, y, width, height, cell, edgeMargin);
            }
        }
        this._drawHud(ctx);
    }

    _calculateLayout(columns, rows, edgeMargin, forcedCell = null) {
        const top = 82;
        const naturalCell = Math.max(12, Math.min(
            (this.w - 70 - edgeMargin * 2) / columns,
            (this.h - top - 38 - edgeMargin * 2) / rows,
        ));
        const cell = forcedCell ?? naturalCell;
        const width = cell * columns;
        const height = cell * rows;
        const x = (this.w - width) * 0.5;
        const y = top + (this.h - top - height) * 0.5;
        return { x, y, width, height, cell, edgeMargin };
    }

    _drawPiece(ctx, cx, cy, radius, piece, highlighted = false) {
        const gradient = ctx.createRadialGradient(cx - radius * 0.34, cy - radius * 0.38, radius * 0.08, cx, cy, radius);
        if (piece === 1) {
            gradient.addColorStop(0, '#ff9b86');
            gradient.addColorStop(0.38, '#f34e4e');
            gradient.addColorStop(1, '#b51e34');
        } else {
            gradient.addColorStop(0, '#fff5a2');
            gradient.addColorStop(0.4, '#ffd43b');
            gradient.addColorStop(1, '#c48900');
        }
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = piece === 1 ? '#8f1830' : '#996500';
        ctx.lineWidth = Math.max(1.5, radius * 0.14);
        ctx.stroke();
        if (highlighted) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.61, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(2, radius * 0.2);
            ctx.stroke();
        }
    }

    _drawBoardGrid(ctx, grid, columns, rows, layout, showWin = false, skipped = null) {
        const { x, y, width, height, cell } = layout;
        ctx.save();
        ctx.shadowColor = 'rgba(40,68,61,.25)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = '#36413f';
        ctx.beginPath();
        ctx.roundRect(x - 8, y - 8, width + 16, height + 16, 11);
        ctx.fill();
        ctx.restore();
        for (let row = 0; row < rows; row++) {
            for (let column = 0; column < columns; column++) {
                const cx = x + (column + 0.5) * cell;
                const cy = y + (row + 0.5) * cell;
                ctx.fillStyle = '#edf8f4';
                ctx.fillRect(x + column * cell + 1, y + row * cell + 1, cell - 2, cell - 2);
                const piece = grid[row]?.[column] || 0;
                if (!piece) continue;
                if (skipped?.has(`${row}:${column}`)) continue;
                const highlighted = showWin && this.winCells.some(cellPosition => cellPosition.row === row && cellPosition.column === column);
                this._drawPiece(ctx, cx, cy, cell * 0.38, piece, highlighted);
            }
        }
    }

    _renderAnimation(ctx, animation) {
        const ease = value => 1 - Math.pow(1 - clamp(value, 0, 1), 3);
        if (animation.kind === 'rotate') {
            const edgeMargin = 8;
            const beforeLayoutNatural = this._calculateLayout(animation.before.columns, animation.before.rows, edgeMargin);
            const afterLayoutNatural = this._calculateLayout(animation.rotatedColumns, animation.rotatedRows, edgeMargin);
            const cell = Math.min(beforeLayoutNatural.cell, afterLayoutNatural.cell);
            const beforeLayout = this._calculateLayout(animation.before.columns, animation.before.rows, edgeMargin, cell);
            const afterLayout = this._calculateLayout(animation.rotatedColumns, animation.rotatedRows, edgeMargin, cell);
            this.layout = afterLayout;
            const dropEnd = animation.direction === 0 ? 0.58 : 0.28;
            const rotateEnd = animation.direction === 0 ? dropEnd : 0.68;
            const progress = animation.elapsed / animation.duration;

            if (progress < dropEnd) {
                this._drawBoardGrid(ctx, animation.before.grid, animation.before.columns, animation.before.rows, beforeLayout);
                const local = ease(progress / dropEnd);
                const cx = beforeLayout.x + (animation.placed.column + 0.5) * cell;
                const fromY = beforeLayout.y - cell * 0.72;
                const toY = beforeLayout.y + (animation.placed.row + 0.5) * cell;
                this._drawPiece(ctx, cx, fromY + (toY - fromY) * local, cell * 0.38, animation.player);
                return;
            }

            if (progress < rotateEnd && animation.direction !== 0) {
                const local = (progress - dropEnd) / (rotateEnd - dropEnd);
                const smoothed = local * local * (3 - 2 * local);
                const centerX = this.w * 0.5;
                const centerY = beforeLayout.y + beforeLayout.height * 0.5;
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(animation.direction * Math.PI * 0.5 * smoothed);
                ctx.translate(-centerX, -centerY);
                this._drawBoardGrid(ctx, animation.afterDrop, animation.before.columns, animation.before.rows, beforeLayout);
                ctx.restore();
                return;
            }

            const local = ease((progress - rotateEnd) / Math.max(1e-6, 1 - rotateEnd));
            const empty = Array.from({ length: animation.rotatedRows }, () => Array(animation.rotatedColumns).fill(0));
            this._drawBoardGrid(ctx, empty, animation.rotatedColumns, animation.rotatedRows, afterLayout);
            for (const move of animation.settleMoves) {
                const cx = afterLayout.x + (move.column + 0.5) * cell;
                const row = move.fromRow + (move.toRow - move.fromRow) * local;
                const cy = afterLayout.y + (row + 0.5) * cell;
                this._drawPiece(ctx, cx, cy, cell * 0.38, move.player);
            }
            return;
        }

        const edgeMargin = 34;
        const layout = this._calculateLayout(animation.before.columns, animation.before.rows, edgeMargin);
        this.layout = layout;
        const base = animation.before.grid.map(row => [...row]);
        if (animation.push) {
            for (const cell of animation.shot.line) base[cell.row][cell.column] = 0;
        }
        this._drawBoardGrid(ctx, base, animation.before.columns, animation.before.rows, layout);
        const local = ease(animation.elapsed / animation.duration);
        for (const move of animation.lineMoves) {
            const lineCoordinate = move.fromIndex + (move.toIndex - move.fromIndex) * local;
            const position = this._linePosition(animation.shot.line, lineCoordinate, layout);
            this._drawPiece(ctx, position.x, position.y, layout.cell * 0.38, move.player);
        }
        this._drawEdgeLaunchers(ctx, layout.x, layout.y, layout.width, layout.height, layout.cell, edgeMargin);
    }

    _linePosition(line, coordinate, layout) {
        const center = cell => ({
            x: layout.x + (cell.column + 0.5) * layout.cell,
            y: layout.y + (cell.row + 0.5) * layout.cell,
        });
        const first = center(line[0]);
        const second = line.length > 1 ? center(line[1]) : { x: first.x, y: first.y + layout.cell };
        return {
            x: first.x + (second.x - first.x) * coordinate,
            y: first.y + (second.y - first.y) * coordinate,
        };
    }

    _drawEdgeLaunchers(ctx, x, y, width, height, cell, margin) {
        ctx.fillStyle = this.player === 1 ? '#f04452' : '#ffd23f';
        ctx.font = `bold ${Math.max(12, cell * 0.28)}px Inter,sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let column = 0; column < this.board.columns; column++) {
            const cx = x + (column + 0.5) * cell;
            ctx.fillText('▼', cx, y - margin * 0.5);
            ctx.fillText('▲', cx, y + height + margin * 0.5);
        }
        for (let row = 0; row < this.board.rows; row++) {
            const cy = y + (row + 0.5) * cell;
            ctx.fillText('▶', x - margin * 0.5, cy);
            ctx.fillText('◀', x + width + margin * 0.5, cy);
        }
    }

    _drawHud(ctx) {
        ctx.save();
        ctx.shadowColor = 'rgba(34,76,47,.2)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = 'rgba(238,243,239,.94)';
        ctx.strokeStyle = '#5b6960';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(12, 12, Math.min(470, this.w - 24), 58, 11);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#24342a';
        ctx.font = '800 18px Inter,sans-serif';
        const status = this.phase === 'gameover'
            ? (this.winner ? `Player ${this.winner} wins` : 'Draw')
            : this.phase === 'animating' ? 'Moving pieces…' : `Player ${this.player}'s turn`;
        ctx.fillText(status, 25, 37);
        ctx.font = '11px Inter,sans-serif';
        ctx.fillStyle = '#59685e';
        ctx.fillText(`${MODES[this.mode].label} · ${this.board.columns}×${this.board.rows} · ${this.board.winLength} in row · ${this.lastTransform}`, 25, 57);
    }

    onResize() {}

    destroy() {
        this.canvas.removeEventListener('mousedown', this._mouseDown);
        window.removeEventListener('keydown', this._keyDown);
        this.modeSelector?.remove();
        this.modeSelector = null;
    }

    wantsPointerLockNow() { return false; }

    getRecordSettings(settings = this.settings) {
        const active = initializeNInRowSettings(settings);
        const columns = requireInteger(active.columns ?? 7, 'Board columns', { minimum: 1 });
        const rows = requireInteger(active.rows ?? 6, 'Board rows', { minimum: 1 });
        return {
            mode: MODES[active.mode] ? active.mode : 'rotate',
            columns,
            rows,
            winLength: requireInteger(active.winLength ?? 4, 'Win length', { minimum: 1 }),
        };
    }

    preparePauseSettings(settings) {
        const columns = requireInteger(settings.columns ?? 7, 'Board columns', { minimum: 1 });
        const rows = requireInteger(settings.rows ?? 6, 'Board rows', { minimum: 1 });
        const winLength = requireInteger(settings.winLength ?? 4, 'Win length', { minimum: 1 });
        if (winLength > Math.max(columns, rows)) {
            throw new Error(`Win length cannot exceed the longest grid dimension (${Math.max(columns, rows)}).`);
        }
        return syncActiveModeProfile(settings, MODE_KEYS, settingsSchema(), 'rotate');
    }

    static getSettingsSchema() {
        return withModeProfiles(settingsSchema());
    }

    static getControlsSchema() { return []; }
}
