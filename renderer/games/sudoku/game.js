import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requireInteger } from '../../core/SettingsValidation.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import {
    initializeModeSettings,
    switchModeSettings,
    syncActiveModeProfile,
    withModeProfiles,
} from '../../core/ModeSettings.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const REPRESENTATIONS = Object.freeze(['numbers', 'colors']);

function settingsSchema() {
    return [
        { key: 'representation', label: 'Notation', type: 'hidden', default: 'colors' },
        { key: 'blockRows', label: 'm · block rows', type: 'number', step: 1, default: 3, group: 'Grid' },
        { key: 'blockColumns', label: 'n · block columns', type: 'number', step: 1, default: 3, group: 'Grid' },
        { key: 'clueRatio', label: 'Target clue fraction', type: 'range', min: 0, max: 1, step: 0.02, default: 0.42, group: 'Difficulty' },
    ];
}

const MAX_SUDOKU_SYMBOLS = 30;

export function validateSudokuSettings(settings = {}) {
    const m = requireInteger(settings.blockRows ?? 3, 'Sudoku block rows', { minimum: 1 });
    const n = requireInteger(settings.blockColumns ?? 3, 'Sudoku block columns', { minimum: 1 });
    if (m * n > MAX_SUDOKU_SYMBOLS) {
        throw new Error(`This Sudoku solver supports at most ${MAX_SUDOKU_SYMBOLS} symbols (m × n).`);
    }
    requireFiniteNumber(settings.clueRatio ?? 0.42, 'Sudoku clue fraction', { minimum: 0, maximum: 1 });
    return { blockRows: m, blockColumns: n };
}

function initializeSudokuSettings(settings) {
    let source = settings || {};
    if (!source.modeProfiles || Object.keys(source.modeProfiles).length === 0) {
        const sharedLegacy = Object.fromEntries(settingsSchema()
            .filter(setting => setting.key !== 'representation' && source[setting.key] !== undefined)
            .map(setting => [setting.key, source[setting.key]]));
        source = {
            ...source,
            modeProfiles: Object.fromEntries(REPRESENTATIONS.map(mode => [mode, { ...sharedLegacy }])),
        };
    }
    return initializeModeSettings(
        source, REPRESENTATIONS, settingsSchema(), 'numbers', 'representation');
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function shuffle(values, random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
}

export function generateSolvedSudoku(blockRows, blockColumns, seed = 1) {
    const { blockRows: m, blockColumns: n } = validateSudokuSettings({ blockRows, blockColumns });
    const size = m * n;
    const random = seededRandom(seed);
    const rowBands = shuffle(Array.from({ length: n }, (_, index) => index), random);
    const columnStacks = shuffle(Array.from({ length: m }, (_, index) => index), random);
    const rows = rowBands.flatMap(band => shuffle(Array.from({ length: m }, (_, row) => band * m + row), random));
    const columns = columnStacks.flatMap(stack => shuffle(Array.from({ length: n }, (_, column) => stack * n + column), random));
    const symbols = shuffle(Array.from({ length: size }, (_, index) => index + 1), random);
    const pattern = (row, column) => (row * n + Math.floor(row / m) + column) % size;
    return rows.map(row => columns.map(column => symbols[pattern(row, column)]));
}

export function countSudokuSolutions(puzzle, blockRows, blockColumns, limit = 2) {
    const m = blockRows;
    const n = blockColumns;
    const size = m * n;
    const fullMask = (1 << size) - 1;
    const grid = puzzle.map(row => [...row]);
    const rowMasks = Array(size).fill(0);
    const columnMasks = Array(size).fill(0);
    const blockMasks = Array(size).fill(0);
    const blockIndex = (row, column) => Math.floor(row / m) * m + Math.floor(column / n);
    for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
            const value = grid[row][column];
            if (!value) continue;
            const bit = 1 << (value - 1);
            const block = blockIndex(row, column);
            if ((rowMasks[row] | columnMasks[column] | blockMasks[block]) & bit) return 0;
            rowMasks[row] |= bit;
            columnMasks[column] |= bit;
            blockMasks[block] |= bit;
        }
    }
    let solutions = 0;
    const solve = () => {
        if (solutions >= limit) return;
        let bestRow = -1;
        let bestColumn = -1;
        let bestMask = 0;
        let bestCount = Infinity;
        for (let row = 0; row < size; row++) {
            for (let column = 0; column < size; column++) {
                if (grid[row][column]) continue;
                const block = blockIndex(row, column);
                const mask = fullMask & ~(rowMasks[row] | columnMasks[column] | blockMasks[block]);
                const count = mask.toString(2).replaceAll('0', '').length;
                if (count === 0) return;
                if (count < bestCount) {
                    bestRow = row;
                    bestColumn = column;
                    bestMask = mask;
                    bestCount = count;
                    if (count === 1) break;
                }
            }
            if (bestCount === 1) break;
        }
        if (bestRow < 0) {
            solutions++;
            return;
        }
        const block = blockIndex(bestRow, bestColumn);
        let mask = bestMask;
        while (mask && solutions < limit) {
            const bit = mask & -mask;
            mask ^= bit;
            const value = 32 - Math.clz32(bit);
            grid[bestRow][bestColumn] = value;
            rowMasks[bestRow] |= bit;
            columnMasks[bestColumn] |= bit;
            blockMasks[block] |= bit;
            solve();
            grid[bestRow][bestColumn] = 0;
            rowMasks[bestRow] ^= bit;
            columnMasks[bestColumn] ^= bit;
            blockMasks[block] ^= bit;
        }
    };
    solve();
    return solutions;
}

export function generateUniqueSudoku(blockRows, blockColumns, clueRatio = 0.42, seed = 1, progress = null) {
    const solution = generateSolvedSudoku(blockRows, blockColumns, seed);
    const size = blockRows * blockColumns;
    const puzzle = solution.map(row => [...row]);
    const random = seededRandom(seed ^ 0x9e3779b9);
    const cells = shuffle(Array.from({ length: size * size }, (_, index) => index), random);
    const targetClues = Math.max(size * 2, Math.round(size * size * Number(clueRatio)));
    let clues = size * size;
    cells.forEach((flatIndex, attempt) => {
        if (clues <= targetClues) return;
        const row = Math.floor(flatIndex / size);
        const column = flatIndex % size;
        const previous = puzzle[row][column];
        puzzle[row][column] = 0;
        if (countSudokuSolutions(puzzle, blockRows, blockColumns, 2) !== 1) puzzle[row][column] = previous;
        else clues--;
        progress?.((attempt + 1) / cells.length);
    });
    return { puzzle, solution, clues, seed, size };
}

function colorForValue(value, size) {
    return `hsl(${Math.round((value - 1) * 360 / size)},72%,55%)`;
}

export default class SudokuGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.settings = initializeSudokuSettings(this.settings);
        validateSudokuSettings(this.settings);
        this.phase = 'mode-select';
        this.representation = null;
        this.selected = null;
        this.candidateMode = false;
        this.elapsed = 0;
        this.mistakes = 0;
        this._generationToken = 0;
        this._mouseDown = event => this._handleMouse(event);
        this._contextMenu = event => event.preventDefault();
        this._keyDown = event => this._handleKey(event);
        this.canvas.addEventListener('mousedown', this._mouseDown);
        this.canvas.addEventListener('contextmenu', this._contextMenu);
        window.addEventListener('keydown', this._keyDown);
        this._showModeSelector();
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        this.pendingRepresentation = this.settings.representation === 'colors' ? 'colors' : 'numbers';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Sudoku',
            prompt: 'Choose notation',
            selectedMode: this.pendingRepresentation,
            modes: [
                { key: 'numbers', title: 'Numbers', artKey: 'sudoku-numbers', description: 'Numbers and small numeric candidates.' },
                { key: 'colors', title: 'Colors', artKey: 'sudoku-colors', description: 'Colors and small colored candidate dots.' },
            ],
        });
        this.modeSelector.insertAdjacentHTML('beforeend', `<div hidden data-mode-profile-proxy>${this._field('blockRows', 'm · block rows', this.settings.blockRows ?? 3)}${this._field('blockColumns', 'n · block columns', this.settings.blockColumns ?? 3)}</div>`);
        document.body.appendChild(this.modeSelector);
        this._selectorClick = bindModeGallery(this.modeSelector, {
            onMode: representation => {
                this._selectPendingRepresentation(representation);
                this._startPuzzle();
            },
            onBack: () => this.endGame(),
        });
    }

    _field(key, label, value) {
        return `<label style="display:grid;gap:4px;font-size:10px;color:#45604a;text-transform:uppercase;">${label}<input data-size="${key}" type="number" step="1" value="${value}" style="padding:7px;border-radius:8px;color-scheme:dark;"></label>`;
    }

    _capturePendingProfile() {
        if (!this.modeSelector || !REPRESENTATIONS.includes(this.pendingRepresentation)) return;
        this.modeSelector.querySelectorAll('[data-size]').forEach(input => {
            this.settings[input.dataset.size] = Number(input.value);
        });
        this.settings.representation = this.pendingRepresentation;
        this.settings = syncActiveModeProfile(
            this.settings, REPRESENTATIONS, settingsSchema(), 'numbers', 'representation');
    }

    _selectPendingRepresentation(representation) {
        if (!REPRESENTATIONS.includes(representation) || representation === this.pendingRepresentation) return;
        this._capturePendingProfile();
        this.settings = switchModeSettings(
            this.settings, representation, REPRESENTATIONS, settingsSchema(), 'numbers', 'representation');
        this.pendingRepresentation = representation;
        this.modeSelector?.querySelectorAll('[data-size]').forEach(input => {
            input.value = String(this.settings[input.dataset.size]);
        });
    }

    _startPuzzle() {
        this._capturePendingProfile();
        this.settings = syncActiveModeProfile(
            this.settings, REPRESENTATIONS, settingsSchema(), 'numbers', 'representation');
        let dimensions;
        try {
            dimensions = validateSudokuSettings(this.settings);
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
        this.app.settingsManager.save('sudoku', this.settings).catch(() => {});
        this.modeSelector.remove();
        this.modeSelector = null;
        this.representation = this.settings.representation;
        this.blockRows = dimensions.blockRows;
        this.blockColumns = dimensions.blockColumns;
        this.seed = globalThis.crypto?.getRandomValues
            ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
            : Date.now() >>> 0;
        this.phase = 'generating';
        this.generationProgress = 0;
        const generationToken = ++this._generationToken;
        setTimeout(() => {
            if (generationToken !== this._generationToken || this.phase !== 'generating') return;
            const generated = generateUniqueSudoku(
                this.blockRows,
                this.blockColumns,
                this.settings.clueRatio ?? 0.42,
                this.seed,
                fraction => { this.generationProgress = fraction; },
            );
            this.puzzle = generated.puzzle;
            this.solution = generated.solution;
            this.grid = generated.puzzle.map(row => [...row]);
            this.fixed = generated.puzzle.map(row => row.map(Boolean));
            this.notes = generated.puzzle.map(row => row.map(() => new Set()));
            this.size = generated.size;
            this.clues = generated.clues;
            this.phase = 'playing';
            this.elapsed = 0;
            this.mistakes = 0;
        }, 0);
    }

    returnToModeSelector() {
        this._generationToken++;
        this.representation = null;
        this.selected = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    update(dt) {
        if (this.phase === 'playing') this.elapsed += dt;
    }

    _handleMouse(event) {
        if (this.phase !== 'playing' || !this.layout) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * this.canvas.width / rect.width;
        const y = (event.clientY - rect.top) * this.canvas.height / rect.height;
        const { boardX, boardY, boardSize, cell, palette } = this.layout;
        if (x >= boardX && x < boardX + boardSize && y >= boardY && y < boardY + boardSize) {
            const row = Math.floor((y - boardY) / cell);
            const column = Math.floor((x - boardX) / cell);
            if (!this.fixed[row][column]) {
                this.selected = { row, column };
                this.candidateMode = event.button === 2;
            }
            event.preventDefault();
            return;
        }
        const paletteHit = palette?.find(item => x >= item.x && x <= item.x + item.size && y >= item.y && y <= item.y + item.size);
        if (paletteHit) this._enterValue(paletteHit.value);
    }

    _handleKey(event) {
        if (this.phase !== 'playing' || !this.selected) return;
        if (event.code === 'Backspace' || event.code === 'Delete' || event.code === 'Digit0') {
            const { row, column } = this.selected;
            this.grid[row][column] = 0;
            this.notes[row][column].clear();
            event.preventDefault();
            return;
        }
        if (event.code === 'KeyN') {
            this.candidateMode = !this.candidateMode;
            return;
        }
        let value = 0;
        if (/^Digit[1-9]$/.test(event.code)) value = Number(event.code.slice(5));
        else if (/^Numpad[1-9]$/.test(event.code)) value = Number(event.code.slice(6));
        else if (/^Key[A-Z]$/.test(event.code)) value = 10 + event.code.charCodeAt(3) - 65;
        if (value > 0 && value <= this.size) {
            this._enterValue(value);
            event.preventDefault();
        }
    }

    _enterValue(value) {
        if (!this.selected || value < 1 || value > this.size) return;
        const { row, column } = this.selected;
        if (this.fixed[row][column]) return;
        if (this.candidateMode) {
            const notes = this.notes[row][column];
            if (notes.has(value)) notes.delete(value);
            else notes.add(value);
            return;
        }
        this.grid[row][column] = value;
        this.notes[row][column].clear();
        if (value !== this.solution[row][column]) {
            this.mistakes++;
            this.audio.playTone(180, 0.08, 'square', 0.1);
        } else this.audio.playClick();
        if (this.grid.every((gridRow, r) => gridRow.every((cell, c) => cell === this.solution[r][c]))) {
            this.phase = 'complete';
            this.audio.playSuccess();
            this.submitScore({ seconds: Number(this.elapsed.toFixed(3)), mistakes: this.mistakes, seed: this.seed, clues: this.clues });
        }
    }

    render() {
        const ctx = this.ctx;
        this.clear('#86d5f7');
        if (this.phase === 'generating') {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#252a30';
            ctx.font = '800 25px Inter,sans-serif';
            ctx.fillText('Generating a uniquely solvable Sudoku…', this.w / 2, this.h * 0.44);
            ctx.fillStyle = '#30363d';
            ctx.fillRect(this.w * 0.25, this.h * 0.5, this.w * 0.5, 12);
            ctx.fillStyle = '#42aee1';
            ctx.fillRect(this.w * 0.25, this.h * 0.5, this.w * 0.5 * this.generationProgress, 12);
            return;
        }
        if (!this.grid) return;
        const sideSpace = Math.min(210, Math.max(150, this.w * 0.2));
        const boardSize = Math.min(this.h - 52, this.w - sideSpace - 42);
        const boardX = Math.max(18, (this.w - sideSpace - boardSize) * 0.5);
        const boardY = (this.h - boardSize) * 0.5;
        const cell = boardSize / this.size;
        this.layout = { boardX, boardY, boardSize, cell, palette: [] };
        ctx.fillStyle = '#f8fbfd';
        ctx.fillRect(boardX, boardY, boardSize, boardSize);
        for (let row = 0; row < this.size; row++) {
            for (let column = 0; column < this.size; column++) {
                const x = boardX + column * cell;
                const y = boardY + row * cell;
                if (this.selected?.row === row && this.selected?.column === column) {
                    ctx.fillStyle = this.candidateMode ? '#ffe8b3' : '#d2effc';
                    ctx.fillRect(x, y, cell, cell);
                }
                const value = this.grid[row][column];
                if (value) this._drawValue(ctx, value, x + cell / 2, y + cell / 2, cell, this.fixed[row][column]);
                else this._drawNotes(ctx, this.notes[row][column], x, y, cell);
            }
        }
        for (let index = 0; index <= this.size; index++) {
            ctx.beginPath();
            ctx.moveTo(boardX + index * cell, boardY);
            ctx.lineTo(boardX + index * cell, boardY + boardSize);
            ctx.strokeStyle = index % this.blockColumns === 0 ? '#252a30' : '#9ba7b0';
            ctx.lineWidth = index % this.blockColumns === 0 ? 2.6 : 0.7;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(boardX, boardY + index * cell);
            ctx.lineTo(boardX + boardSize, boardY + index * cell);
            ctx.strokeStyle = index % this.blockRows === 0 ? '#252a30' : '#9ba7b0';
            ctx.lineWidth = index % this.blockRows === 0 ? 2.6 : 0.7;
            ctx.stroke();
        }
        this._drawPalette(ctx, boardX + boardSize + 18, boardY, sideSpace - 28);
        if (this.phase === 'complete') {
            ctx.fillStyle = 'rgba(30,34,39,.82)';
            ctx.fillRect(boardX, boardY + boardSize * 0.38, boardSize, boardSize * 0.24);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.font = '900 27px Inter,sans-serif';
            ctx.fillText('Solved!', boardX + boardSize / 2, boardY + boardSize * 0.49);
            ctx.font = '12px Inter,sans-serif';
            ctx.fillText(`${this.elapsed.toFixed(1)} s · ${this.mistakes} mistakes`, boardX + boardSize / 2, boardY + boardSize * 0.55);
        }
    }

    _drawValue(ctx, value, x, y, cell, fixed) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (this.representation === 'colors') {
            ctx.beginPath();
            ctx.arc(x, y, cell * 0.34, 0, Math.PI * 2);
            ctx.fillStyle = colorForValue(value, this.size);
            ctx.fill();
            ctx.strokeStyle = fixed ? '#20252b' : '#ffffff';
            ctx.lineWidth = fixed ? 2 : 1.3;
            ctx.stroke();
        } else {
            ctx.fillStyle = fixed ? '#20252b' : '#137dad';
            ctx.font = `${fixed ? '800' : '650'} ${Math.max(11, cell * 0.48)}px Inter,sans-serif`;
            ctx.fillText(value <= 9 ? String(value) : String.fromCharCode(55 + value), x, y);
        }
    }

    _drawNotes(ctx, notes, x, y, cell) {
        const columns = Math.ceil(Math.sqrt(this.size));
        const rows = Math.ceil(this.size / columns);
        for (const value of notes) {
            const index = value - 1;
            const cx = x + (index % columns + 0.5) * cell / columns;
            const cy = y + (Math.floor(index / columns) + 0.5) * cell / rows;
            if (this.representation === 'colors') {
                ctx.beginPath();
                ctx.arc(cx, cy, Math.max(1.5, cell / columns * 0.18), 0, Math.PI * 2);
                ctx.fillStyle = colorForValue(value, this.size);
                ctx.fill();
            } else {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#58636d';
                ctx.font = `${Math.max(6, cell / columns * 0.55)}px Inter,sans-serif`;
                ctx.fillText(value <= 9 ? String(value) : String.fromCharCode(55 + value), cx, cy);
            }
        }
    }

    _drawPalette(ctx, x, y, width) {
        ctx.fillStyle = 'rgba(35,40,46,.94)';
        ctx.fillRect(x - 8, y, width + 16, Math.min(this.h - y - 10, this.size * 34 + 96));
        ctx.textAlign = 'left';
        ctx.fillStyle = '#f2f5f7';
        ctx.font = '800 15px Inter,sans-serif';
        ctx.fillText(this.candidateMode ? 'Candidate notes' : 'Enter value', x, y + 23);
        ctx.font = '10px Inter,sans-serif';
        ctx.fillStyle = '#bac4cc';
        ctx.fillText('Right-click a cell for notes · N toggles', x, y + 41);
        const columns = this.size > 9 ? 4 : 3;
        const itemSize = Math.min(36, (width - 8) / columns);
        for (let value = 1; value <= this.size; value++) {
            const column = (value - 1) % columns;
            const row = Math.floor((value - 1) / columns);
            const itemX = x + column * itemSize;
            const itemY = y + 52 + row * itemSize;
            this.layout.palette.push({ value, x: itemX, y: itemY, size: itemSize - 3 });
            ctx.fillStyle = '#4b545c';
            ctx.fillRect(itemX, itemY, itemSize - 3, itemSize - 3);
            this._drawValue(ctx, value, itemX + (itemSize - 3) / 2, itemY + (itemSize - 3) / 2, itemSize - 3, false);
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = '#d3dbe1';
        ctx.font = '11px Inter,sans-serif';
        ctx.fillText(`${this.blockRows}×${this.blockColumns} blocks · ${this.clues} clues`, x, y + 65 + Math.ceil(this.size / columns) * itemSize);
        ctx.fillText(`${this.elapsed.toFixed(1)} s · ${this.mistakes} mistakes`, x, y + 82 + Math.ceil(this.size / columns) * itemSize);
    }

    destroy() {
        this._generationToken++;
        this.canvas.removeEventListener('mousedown', this._mouseDown);
        this.canvas.removeEventListener('contextmenu', this._contextMenu);
        window.removeEventListener('keydown', this._keyDown);
        this.modeSelector?.remove();
    }

    wantsPointerLockNow() { return false; }

    getRecordSettings(settings = this.settings) {
        const active = initializeSudokuSettings(settings);
        return {
            representation: active.representation === 'colors' ? 'colors' : 'numbers',
            blockRows: Math.round(Number(active.blockRows ?? 3)),
            blockColumns: Math.round(Number(active.blockColumns ?? 3)),
            clueRatio: Number(active.clueRatio ?? 0.42),
        };
    }

    preparePauseSettings(settings) {
        validateSudokuSettings(settings);
        return syncActiveModeProfile(
            settings, REPRESENTATIONS, settingsSchema(), 'numbers', 'representation');
    }

    static getSettingsSchema() {
        return withModeProfiles(settingsSchema());
    }

    static getControlsSchema() { return []; }
}
