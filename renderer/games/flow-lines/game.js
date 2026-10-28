import { BaseGame } from '../../core/BaseGame.js';
import { requireInteger } from '../../core/SettingsValidation.js';
import {
    edgeCells,
    makeEdgeKey,
    makePuzzleSeed,
    MAX_BOARD_CELLS,
    MAX_BOARD_DIMENSION,
    MAX_COLOR_COUNT,
    GENERATOR_VERSION,
    minimumPathCells,
    seededRandom,
    theoreticalColorCounts,
} from './puzzle.js';

const THEORETICAL_COUNTS_CACHE = new Map();

const SCORING_MODES = new Set(['strokes', 'edges', 'timed']);
const MAX_TIMED_PUZZLES = 100;

function countCacheKey(rows, columns) {
    return `${rows}x${columns}`;
}

function getTheoreticalCounts(rows, columns) {
    const key = countCacheKey(rows, columns);
    if (!THEORETICAL_COUNTS_CACHE.has(key)) {
        THEORETICAL_COUNTS_CACHE.set(key, theoreticalColorCounts(rows, columns));
    }
    return [...THEORETICAL_COUNTS_CACHE.get(key)];
}

function defaultColorRange(rows, columns) {
    const total = Number(rows) * Number(columns);
    const theoreticalMaximum = getTheoreticalCounts(rows, columns).at(-1) ?? 1;
    const target = Math.max(1, Math.round(Math.sqrt(total)));
    const minimum = Math.min(theoreticalMaximum, Math.max(rows > 1 && columns > 1 ? 2 : 1, target - 1));
    const maximum = Math.min(theoreticalMaximum, Math.max(minimum, target + 2));
    return { minimum, maximum };
}

function cloneEdgeSets(edgeSets) {
    return edgeSets.map(edges => new Set(edges));
}

function labelForColor(index) {
    let value = index + 1;
    let label = '';
    while (value > 0) {
        value--;
        label = String.fromCharCode(65 + (value % 26)) + label;
        value = Math.floor(value / 26);
    }
    return label;
}

function formatElapsed(milliseconds) {
    const wholeMilliseconds = Math.max(0, Math.floor(milliseconds));
    const minutes = Math.floor(wholeMilliseconds / 60_000);
    const seconds = ((wholeMilliseconds % 60_000) / 1000).toFixed(2).padStart(5, '0');
    return `${minutes}:${seconds}`;
}

function makeColorPalette(count, seed) {
    const random = seededRandom(seed ^ 0xa341316c);
    const firstHue = random() * 360;
    const hueStep = 137.507764;
    return Array.from({ length: count }, (_, index) => {
        const hue = (firstHue + index * hueStep + random() * 14) % 360;
        return `hsl(${hue.toFixed(1)} 78% 61%)`;
    });
}

function gridLine(first, second, columns) {
    const firstRow = Math.floor(first / columns);
    const secondRow = Math.floor(second / columns);
    const firstColumn = first % columns;
    const secondColumn = second % columns;
    const rowDistance = Math.abs(firstRow - secondRow);
    const columnDistance = Math.abs(firstColumn - secondColumn);
    if (rowDistance + columnDistance !== 1) return false;
    return rowDistance === 1 ? firstColumn === secondColumn : firstRow === secondRow;
}

function traceGridCells(from, to, columns) {
    const cells = [];
    let row = Math.floor(from / columns);
    let column = from % columns;
    const targetRow = Math.floor(to / columns);
    const targetColumn = to % columns;
    while (row !== targetRow || column !== targetColumn) {
        const rowDistance = Math.abs(targetRow - row);
        const columnDistance = Math.abs(targetColumn - column);
        if (columnDistance >= rowDistance && column !== targetColumn) {
            column += Math.sign(targetColumn - column);
        } else {
            row += Math.sign(targetRow - row);
        }
        cells.push(row * columns + column);
    }
    return cells;
}

export default class FlowLinesGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.rows = Number(this.settings.rows ?? 6);
        this.columns = Number(this.settings.columns ?? 6);
        const defaultColors = defaultColorRange(this.rows, this.columns);
        this.minimumColors = Number(this.settings.minimumColors ?? defaultColors.minimum);
        this.maximumColors = Number(this.settings.maximumColors ?? defaultColors.maximum);
        this.moveMode = SCORING_MODES.has(this.settings.moveMode) ? this.settings.moveMode : 'strokes';
        this.timedPuzzleCount = Number(this.settings.timedPuzzleCount ?? 5);
        this.streak = 0;
        this.bestStreak = 0;
        this.puzzleNumber = 0;
        this.timedSolvedCount = 0;
        this.timedRunElapsedMs = 0;
        this.timedPuzzleElapsedMs = 0;
        this.timedPuzzleStartedAt = null;
        this.timedPuzzleSeeds = [];
        this.timedRunFinalElapsedMs = null;
        this.bestTimedElapsedMs = null;
        this.timedBestLookupStarted = false;
        this.layout = null;
        this.activeStroke = null;
        this.phase = 'playing';
        this.errorMessage = '';
        this._generationWorker = null;
        this.generationProgress = 0;
        this.generationStage = '';
        this._previousCursor = this.canvas.style.cursor;
        this._previousTouchAction = this.canvas.style.touchAction;
        this.canvas.style.cursor = 'crosshair';
        this.canvas.style.touchAction = 'none';

        this._pointerDown = event => this._onPointerDown(event);
        this._pointerMove = event => this._onPointerMove(event);
        this._pointerUp = event => this._onPointerUp(event);
        this._keyDown = event => this._onKeyDown(event);
        this.canvas.addEventListener('pointerdown', this._pointerDown);
        this.canvas.addEventListener('pointermove', this._pointerMove);
        this.canvas.addEventListener('pointerup', this._pointerUp);
        this.canvas.addEventListener('pointercancel', this._pointerUp);
        window.addEventListener('keydown', this._keyDown);

        try {
            this._validateSettings(this.settings);
            this._generatePuzzle();
        } catch (error) {
            this.phase = 'error';
            this.errorMessage = error?.message || String(error);
        }
    }

    _validateSettings(settings = {}) {
        const rows = requireInteger(settings.rows ?? 6, 'Number of rows', { minimum: 1, maximum: MAX_BOARD_DIMENSION });
        const columns = requireInteger(settings.columns ?? 6, 'Number of columns', { minimum: 1, maximum: MAX_BOARD_DIMENSION });
        if (rows * columns < 2) throw new Error('The grid must contain at least two cells.');
        if (rows * columns > MAX_BOARD_CELLS) {
            throw new Error(`The grid can contain at most ${MAX_BOARD_CELLS} cells because every puzzle is exhaustively checked for uniqueness.`);
        }
        const defaultColors = defaultColorRange(rows, columns);
        const minimumColors = requireInteger(settings.minimumColors ?? defaultColors.minimum, 'Minimum number of colors', {
            minimum: 1, maximum: MAX_COLOR_COUNT,
        });
        const maximumColors = requireInteger(settings.maximumColors ?? defaultColors.maximum, 'Maximum number of colors', {
            minimum: 1, maximum: MAX_COLOR_COUNT,
        });
        if (minimumColors > maximumColors) {
            throw new Error('The minimum number of colors must not exceed the maximum.');
        }
        const moveMode = settings.moveMode ?? 'strokes';
        if (!SCORING_MODES.has(moveMode)) throw new Error('The selected scoring mode is invalid.');
        const timedPuzzleCount = requireInteger(settings.timedPuzzleCount ?? 5, 'Puzzles per timed run', {
            minimum: 1, maximum: MAX_TIMED_PUZZLES,
        });
        const candidateCounts = getTheoreticalCounts(rows, columns);
        const allowedCounts = candidateCounts.filter(count => count >= minimumColors && count <= maximumColors);
        if (!allowedCounts.length) {
            if (rows > 1 && columns > 1 && maximumColors === 1) {
                throw new Error('A single color on a two-dimensional rectangular grid cannot have a unique connection covering every cell: a shortcut always exists.');
            }
            const maximumByCoverage = candidateCounts.at(-1) ?? 0;
            const minimumCellsPerPath = minimumPathCells(rows, columns);
            throw new Error(`For a ${rows} × ${columns} grid with at least ${minimumCellsPerPath} cells per path, the upper limit is ${maximumByCoverage} colors. This is a coverage limit, not a guarantee of uniqueness.`);
        }
        return { rows, columns, minimumColors, maximumColors, moveMode, timedPuzzleCount, candidateCounts, allowedCounts };
    }

    _generatePuzzle() {
        const validated = this._validateSettings(this.settings);
        this.rows = validated.rows;
        this.columns = validated.columns;
        this.minimumColors = validated.minimumColors;
        this.maximumColors = validated.maximumColors;
        this.moveMode = validated.moveMode;
        this.timedPuzzleCount = validated.timedPuzzleCount;
        this.candidateColorCounts = validated.candidateCounts;
        this.puzzleSettingsSnapshot = {
            rows: this.rows,
            columns: this.columns,
            minimumColors: this.minimumColors,
            maximumColors: this.maximumColors,
            moveMode: this.moveMode,
            timedPuzzleCount: this.timedPuzzleCount,
            generatorVersion: GENERATOR_VERSION,
        };
        this._loadTimedBestRecord();

        this._generationWorker?.terminate();
        this.phase = 'generating';
        this.activeStroke = null;
        this.timedPuzzleStartedAt = null;
        this.generationProgress = 0;
        this.generationStage = 'Building interwoven paths';
        const worker = new Worker(new URL('./generation-worker.js', import.meta.url), { type: 'module' });
        this._generationWorker = worker;
        worker.onmessage = event => {
            if (this._generationWorker !== worker) return;
            const message = event.data;
            if (message.type === 'progress') {
                this.generationProgress = message.fraction;
                this.generationStage = message.stage;
            } else if (message.type === 'result') {
                worker.terminate();
                this._generationWorker = null;
                this._installPuzzle(message.puzzle);
            } else if (message.type === 'error') {
                worker.terminate();
                this._generationWorker = null;
                this.phase = 'error';
                this.errorMessage = message.message;
            }
        };
        worker.onerror = event => {
            if (this._generationWorker !== worker) return;
            worker.terminate();
            this._generationWorker = null;
            this.phase = 'error';
            this.errorMessage = event.message || 'Puzzle generation was interrupted.';
        };
        worker.postMessage({
            rows: this.rows, columns: this.columns,
            minimumColors: this.minimumColors, maximumColors: this.maximumColors,
            seed: makePuzzleSeed(),
        });
    }

    _installPuzzle(puzzle) {
        this.puzzle = puzzle;
        this.colorCount = this.puzzle.colorCount;
        this.colors = makeColorPalette(this.colorCount, this.puzzle.seed);
        this.totalCells = this.rows * this.columns;
        this.edgeSets = this.puzzle.paths.map(() => new Set());
        this.strokeHistory = [];
        this.edgeHistory = [];
        this.moveCount = 0;
        this.activeStroke = null;
        this.minimumMoves = this.moveMode === 'edges'
            ? this.totalCells - this.colorCount
            : this.colorCount;
        this.puzzleNumber++;
        this.phase = 'playing';
        this.completedPuzzle = null;
        this._rebuildOccupancy();
        this.timedPuzzleElapsedMs = 0;
        this.timedPuzzleStartedAt = this.moveMode === 'timed' && !this.app?._isPaused ? performance.now() : null;
    }

    _rebuildOccupancy() {
        this.cellOccupancy = new Int16Array(this.totalCells);
        this.cellOccupancy.fill(-1);
        for (const [cell, color] of this.puzzle.endpointByCell) this.cellOccupancy[cell] = color;
        for (let color = 0; color < this.edgeSets.length; color++) {
            for (const edge of this.edgeSets[color]) {
                const [first, second] = edgeCells(edge, this.totalCells);
                if (this.cellOccupancy[first] === -1) this.cellOccupancy[first] = color;
                if (this.cellOccupancy[second] === -1) this.cellOccupancy[second] = color;
            }
        }
    }

    _isFullCoverSolution() {
        const occupancy = new Int16Array(this.totalCells);
        occupancy.fill(-1);
        const neighbors = Array.from({ length: this.totalCells }, () => []);

        for (let color = 0; color < this.edgeSets.length; color++) {
            for (const edge of this.edgeSets[color]) {
                const [first, second] = edgeCells(edge, this.totalCells);
                if (occupancy[first] !== -1 && occupancy[first] !== color) return false;
                if (occupancy[second] !== -1 && occupancy[second] !== color) return false;
                occupancy[first] = color;
                occupancy[second] = color;
                neighbors[first].push(second);
                neighbors[second].push(first);
            }
        }

        for (const [cell, color] of this.puzzle.endpointByCell) {
            if (occupancy[cell] !== -1 && occupancy[cell] !== color) return false;
            occupancy[cell] = color;
        }
        for (let cell = 0; cell < this.totalCells; cell++) {
            if (occupancy[cell] === -1) return false;
            const isEndpoint = this.puzzle.endpointByCell.has(cell);
            if (neighbors[cell].length !== (isEndpoint ? 1 : 2)) return false;
        }

        for (let color = 0; color < this.puzzle.paths.length; color++) {
            const pair = this.puzzle.paths[color];
            const start = pair[0];
            const goal = pair.at(-1);
            const visited = new Set([start]);
            const stack = [start];
            while (stack.length) {
                const cell = stack.pop();
                for (const next of neighbors[cell]) {
                    if (occupancy[next] !== color || visited.has(next)) continue;
                    visited.add(next);
                    stack.push(next);
                }
            }
            if (!visited.has(goal)) return false;
            for (let cell = 0; cell < this.totalCells; cell++) {
                if (occupancy[cell] === color && !visited.has(cell)) return false;
            }
        }
        return true;
    }

    _currentTimedPuzzleElapsed() {
        if (this.moveMode !== 'timed') return 0;
        const active = this.timedPuzzleStartedAt === null
            ? 0
            : performance.now() - this.timedPuzzleStartedAt;
        return this.timedPuzzleElapsedMs + active;
    }

    _loadTimedBestRecord() {
        if (this.moveMode !== 'timed' || this.timedBestLookupStarted) return;
        const gameId = this.app?.currentConfig?._id;
        const records = this.app?.records;
        if (!gameId || typeof records?.getBest !== 'function') return;
        this.timedBestLookupStarted = true;
        records.getBest(gameId, this.puzzleSettingsSnapshot, 'elapsedMs', 'min')
            .then(record => {
                const elapsed = Number(record?.results?.elapsedMs);
                if (Number.isFinite(elapsed)) {
                    this.bestTimedElapsedMs = this.bestTimedElapsedMs === null
                        ? elapsed
                        : Math.min(this.bestTimedElapsedMs, elapsed);
                }
            })
            .catch(() => {});
    }

    _canvasPoint(event) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * this.canvas.width / rect.width,
            y: (event.clientY - rect.top) * this.canvas.height / rect.height,
        };
    }

    _cellAtPoint(point) {
        if (!this.layout) return -1;
        const { x, y, cell, width, height } = this.layout;
        if (point.x < x || point.x >= x + width || point.y < y || point.y >= y + height) return -1;
        const column = Math.floor((point.x - x) / cell);
        const row = Math.floor((point.y - y) / cell);
        return row * this.columns + column;
    }

    _onPointerDown(event) {
        if (event.button !== 0) return;
        event.preventDefault();
        if (this.app?._isPaused) return;
        if (this.phase === 'solved' || this.phase === 'run-complete') {
            this._startNextPuzzle();
            return;
        }
        if (this.phase !== 'playing' || !this.layout) return;
        const cell = this._cellAtPoint(this._canvasPoint(event));
        const color = this.puzzle.endpointByCell.get(cell);
        if (color === undefined) return;

        this.activeStroke = {
            color,
            start: cell,
            path: [cell],
            beforeBoard: cloneEdgeSets(this.edgeSets),
            editing: false,
            changed: false,
            completed: false,
            pointerId: event.pointerId,
        };
        this.canvas.setPointerCapture?.(event.pointerId);
    }

    _onPointerMove(event) {
        const active = this.activeStroke;
        if (!active || active.pointerId !== event.pointerId || this.phase !== 'playing' || this.app?._isPaused) return;
        event.preventDefault();
        const target = this._cellAtPoint(this._canvasPoint(event));
        if (target < 0) return;
        const start = active.path.at(-1);
        if (target === start) return;

        for (const cell of traceGridCells(start, target, this.columns)) {
            if (!this._stepStroke(cell)) break;
            if (this.phase !== 'playing') break;
        }
    }

    _beginEditing(active) {
        if (active.editing) return;
        active.editing = true;
        const oldEdges = [...this.edgeSets[active.color]];
        for (const edge of oldEdges) this._changeEdge(active, edge, false);
        this._rebuildOccupancy();
    }

    _stepStroke(target) {
        const active = this.activeStroke;
        if (!active || this.phase !== 'playing') return false;
        const path = active.path;
        const last = path.at(-1);

        if (path.length > 1 && target === path[path.length - 2]) {
            this._beginEditing(active);
            const edge = makeEdgeKey(last, target, this.totalCells);
            if (this._changeEdge(active, edge, false)) {
                path.pop();
                active.completed = false;
                active.changed = true;
            }
            return true;
        }
        if (path.includes(target) || !gridLine(last, target, this.columns)) return false;

        const targetEndpointColor = this.puzzle.endpointByCell.get(target);
        if (targetEndpointColor !== undefined && targetEndpointColor !== active.color) return false;
        const occupiedBy = this.cellOccupancy[target];
        if (occupiedBy !== -1 && occupiedBy !== active.color) return false;

        this._beginEditing(active);
        const edge = makeEdgeKey(last, target, this.totalCells);
        if (!this._changeEdge(active, edge, true)) return false;
        path.push(target);
        active.changed = true;
        const ownPath = this.puzzle.paths[active.color];
        const ownEndpoints = [ownPath[0], ownPath.at(-1)];
        active.completed = ownEndpoints.includes(target) && target !== active.start;

        if (this.moveMode === 'edges' && this._isFullCoverSolution()) {
            this._completePuzzle();
        }
        return true;
    }

    _changeEdge(active, edge, add) {
        const edges = this.edgeSets[active.color];
        if (add ? edges.has(edge) : !edges.has(edge)) return false;
        if (add) edges.add(edge); else edges.delete(edge);
        active.changed = true;
        if (this.moveMode === 'edges') {
            this.edgeHistory.push({ color: active.color, edge, added: add });
            this.moveCount++;
        }
        this._rebuildOccupancy();
        return true;
    }

    _onPointerUp(event) {
        const active = this.activeStroke;
        if (!active || active.pointerId !== event.pointerId) return;
        if (this.moveMode !== 'edges' && active.changed) {
            this.strokeHistory.push({ beforeBoard: active.beforeBoard });
            this.moveCount++;
        }
        this.activeStroke = null;
        if (this.phase === 'playing' && this._isFullCoverSolution()) {
            this._completePuzzle();
        }
    }

    _onKeyDown(event) {
        if (this.app?._isPaused || event.repeat) return;
        if (event.code === 'KeyZ' || event.key?.toLowerCase() === 'z') {
            event.preventDefault();
            this._undo();
            return;
        }
        if ((event.code === 'Enter' || event.code === 'NumpadEnter')
            && (this.phase === 'solved' || this.phase === 'run-complete')) {
            event.preventDefault();
            this._startNextPuzzle();
        }
    }

    _undo() {
        if (!['playing', 'solved', 'run-complete'].includes(this.phase)) return;
        if (this.activeStroke && this.moveMode !== 'edges') {
            this.edgeSets = cloneEdgeSets(this.activeStroke.beforeBoard);
            this.activeStroke = null;
            this._rebuildOccupancy();
            return;
        }
        if (this.activeStroke) {
            const hadChanges = this.activeStroke.changed;
            this.activeStroke = null;
            if (!hadChanges) return;
        }

        if (this.moveMode === 'edges') {
            const operation = this.edgeHistory.pop();
            if (!operation) return;
            const edges = this.edgeSets[operation.color];
            if (operation.added) edges.delete(operation.edge); else edges.add(operation.edge);
            this.moveCount = Math.max(0, this.moveCount - 1);
        } else {
            const action = this.strokeHistory.pop();
            if (!action) return;
            this.edgeSets = cloneEdgeSets(action.beforeBoard);
            this.moveCount = Math.max(0, this.moveCount - 1);
        }

        if ((this.phase === 'solved' || this.phase === 'run-complete') && this.completedPuzzle) {
            this.streak = this.completedPuzzle.previousStreak;
            this.bestStreak = this.completedPuzzle.previousBest;
            if (this.moveMode === 'timed') {
                this.timedSolvedCount = this.completedPuzzle.previousTimedSolvedCount;
                this.timedRunElapsedMs = this.completedPuzzle.previousTimedRunElapsedMs;
                this.timedPuzzleSeeds = [...this.completedPuzzle.previousTimedPuzzleSeeds];
                this.timedRunFinalElapsedMs = null;
                this.timedPuzzleElapsedMs = this.completedPuzzle.timedSegmentMs;
                this.timedPuzzleStartedAt = performance.now();
            }
            this.completedPuzzle = null;
            this.phase = 'playing';
        }
        this._rebuildOccupancy();
    }

    _completePuzzle() {
        if (this.phase !== 'playing') return;
        const previousStreak = this.streak;
        const previousBest = this.bestStreak;
        const previousTimedSolvedCount = this.timedSolvedCount;
        const previousTimedRunElapsedMs = this.timedRunElapsedMs;
        const previousTimedPuzzleSeeds = [...this.timedPuzzleSeeds];
        const optimal = this.moveMode !== 'timed' && this.moveCount === this.minimumMoves;
        if (this.moveMode !== 'timed') {
            this.streak = optimal ? this.streak + 1 : 0;
            this.bestStreak = Math.max(this.bestStreak, this.streak);
        }

        let timedSegmentMs = 0;
        if (this.moveMode === 'timed') {
            timedSegmentMs = this._currentTimedPuzzleElapsed();
            this.timedPuzzleStartedAt = null;
            this.timedPuzzleElapsedMs = 0;
            this.timedRunElapsedMs += timedSegmentMs;
            this.timedPuzzleSeeds.push(this.puzzle.seed);
            this.timedSolvedCount++;
            if (this.timedSolvedCount >= this.timedPuzzleCount) {
                this.timedRunFinalElapsedMs = this.timedRunElapsedMs;
            }
        }
        this.completedPuzzle = {
            previousStreak,
            previousBest,
            previousTimedSolvedCount,
            previousTimedRunElapsedMs,
            previousTimedPuzzleSeeds,
            timedSegmentMs,
            optimal,
            moves: this.moveCount,
            minimumMoves: this.minimumMoves,
            colorCount: this.colorCount,
            seed: this.puzzle.seed,
            finalized: false,
        };
        this.phase = this.moveMode === 'timed' && this.timedSolvedCount >= this.timedPuzzleCount
            ? 'run-complete'
            : 'solved';
        this.activeStroke = null;
        this.audio.playSuccess?.();
    }

    _finalizeSolvedPuzzle() {
        const result = this.completedPuzzle;
        if (!result || result.finalized) return;
        if (this.moveMode === 'timed') {
            if (this.phase !== 'run-complete') return;
            result.finalized = true;
            this.bestTimedElapsedMs = this.bestTimedElapsedMs === null
                ? this.timedRunFinalElapsedMs
                : Math.min(this.bestTimedElapsedMs, this.timedRunFinalElapsedMs);
            this.submitScore({
                elapsedMs: this.timedRunFinalElapsedMs,
                seconds: this.timedRunFinalElapsedMs / 1000,
                puzzlesCompleted: this.timedSolvedCount,
                puzzleSeeds: [...this.timedPuzzleSeeds],
                puzzleNumber: this.puzzleNumber,
            });
            return;
        }
        result.finalized = true;
        this.submitScore({
            streak: this.streak,
            bestStreak: this.bestStreak,
            optimal: result.optimal,
            moves: result.moves,
            minimumMoves: result.minimumMoves,
            colorCount: result.colorCount,
            seed: result.seed,
            puzzleNumber: this.puzzleNumber,
        });
    }

    _startNextPuzzle() {
        if (this.phase !== 'solved' && this.phase !== 'run-complete') return;
        const startingNewTimedRun = this.moveMode === 'timed' && this.phase === 'run-complete';
        if (this.moveMode !== 'timed' || startingNewTimedRun) this._finalizeSolvedPuzzle();
        if (startingNewTimedRun) {
            this.timedSolvedCount = 0;
            this.timedRunElapsedMs = 0;
            this.timedRunFinalElapsedMs = null;
            this.timedPuzzleSeeds = [];
        }
        try {
            this._generatePuzzle();
        } catch (error) {
            this.phase = 'error';
            this.errorMessage = error?.message || String(error);
        }
    }

    _calculateLayout() {
        const header = 104;
        const footer = 56;
        const usableWidth = Math.max(40, this.w - 44);
        const usableHeight = Math.max(40, this.h - header - footer);
        const cell = Math.max(8, Math.min(88, usableWidth / this.columns, usableHeight / this.rows));
        const width = cell * this.columns;
        const height = cell * this.rows;
        return {
            x: (this.w - width) / 2,
            y: header + Math.max(0, (usableHeight - height) / 2),
            cell,
            width,
            height,
        };
    }

    _drawBackground(ctx) {
        const gradient = ctx.createLinearGradient(0, 0, this.w, this.h);
        gradient.addColorStop(0, '#111a2a');
        gradient.addColorStop(1, '#1c2940');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.strokeStyle = 'rgba(184, 210, 255, 0.035)';
        ctx.lineWidth = 1;
        const gap = 34;
        for (let x = 0; x < this.w; x += gap) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.h); ctx.stroke();
        }
        for (let y = 0; y < this.h; y += gap) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.w, y); ctx.stroke();
        }
    }

    _drawHeader(ctx) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f1f6ff';
        ctx.font = '700 23px Inter, system-ui, sans-serif';
        ctx.fillText('FLOW FREE', this.w / 2, 30);

        ctx.fillStyle = 'rgba(218, 229, 249, .76)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.fillText(`${this.rows} × ${this.columns} cells  ·  ${this.colorCount} colors  ·  unique solution`, this.w / 2, 55);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#a9bad7';
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        if (this.moveMode === 'timed') {
            const elapsed = this.timedRunFinalElapsedMs ?? (this.timedRunElapsedMs + this._currentTimedPuzzleElapsed());
            ctx.fillText(`TIME  ${formatElapsed(elapsed)}`, 22, 82);
            ctx.fillStyle = '#8293b2';
            ctx.font = '500 11px Inter, system-ui, sans-serif';
            ctx.fillText(`PUZZLES  ${this.timedSolvedCount} / ${this.timedPuzzleCount}`, 22, 99);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#8e9ebc';
            ctx.font = '500 11px Inter, system-ui, sans-serif';
            ctx.fillText(`BEST  ${this.bestTimedElapsedMs === null ? '—' : formatElapsed(this.bestTimedElapsedMs)}`, this.w - 22, 100);
        } else {
            ctx.fillText(`OPTIMAL STREAK  ${this.streak}`, 22, 82);
            ctx.fillStyle = '#8293b2';
            ctx.font = '500 11px Inter, system-ui, sans-serif';
            ctx.fillText(`BEST  ${this.bestStreak}`, 22, 99);

            ctx.textAlign = 'right';
            ctx.fillStyle = '#edf3ff';
            ctx.font = '600 13px Inter, system-ui, sans-serif';
            const moveLabel = this.moveMode === 'edges' ? 'edges' : 'moves';
            ctx.fillText(`${moveLabel}  ${this.moveCount} / ${this.minimumMoves}`, this.w - 22, 83);
            ctx.fillStyle = '#8e9ebc';
            ctx.font = '500 11px Inter, system-ui, sans-serif';
            ctx.fillText(this.moveMode === 'edges' ? 'optimal: cells − colors' : 'optimal: one stroke per color', this.w - 22, 100);
        }
    }

    _drawBoard(ctx) {
        const { x, y, cell, width, height } = this.layout;
        ctx.fillStyle = 'rgba(5, 10, 20, .46)';
        ctx.fillRect(x - 8, y - 8, width + 16, height + 16);
        ctx.strokeStyle = 'rgba(190, 211, 246, .28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 8, y - 8, width + 16, height + 16);

        for (let row = 0; row < this.rows; row++) {
            for (let column = 0; column < this.columns; column++) {
                ctx.fillStyle = (row + column) % 2 === 0 ? '#202c40' : '#1c2739';
                ctx.fillRect(x + column * cell, y + row * cell, cell, cell);
            }
        }

        ctx.strokeStyle = 'rgba(198, 216, 247, .16)';
        ctx.lineWidth = 1;
        for (let column = 0; column <= this.columns; column++) {
            const gridX = x + column * cell;
            ctx.beginPath(); ctx.moveTo(gridX, y); ctx.lineTo(gridX, y + height); ctx.stroke();
        }
        for (let row = 0; row <= this.rows; row++) {
            const gridY = y + row * cell;
            ctx.beginPath(); ctx.moveTo(x, gridY); ctx.lineTo(x + width, gridY); ctx.stroke();
        }

        for (let color = 0; color < this.edgeSets.length; color++) {
            ctx.strokeStyle = this.colors[color];
            ctx.lineWidth = Math.max(3, cell * 0.34);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const edge of this.edgeSets[color]) {
                const [first, second] = edgeCells(edge, this.totalCells);
                const firstRow = Math.floor(first / this.columns);
                const firstColumn = first % this.columns;
                const secondRow = Math.floor(second / this.columns);
                const secondColumn = second % this.columns;
                ctx.beginPath();
                ctx.moveTo(x + (firstColumn + 0.5) * cell, y + (firstRow + 0.5) * cell);
                ctx.lineTo(x + (secondColumn + 0.5) * cell, y + (secondRow + 0.5) * cell);
                ctx.stroke();
            }
        }

        for (let cellIndex = 0; cellIndex < this.totalCells; cellIndex++) {
            const color = this.puzzle.endpointByCell.get(cellIndex);
            if (color === undefined) {
                const row = Math.floor(cellIndex / this.columns);
                const column = cellIndex % this.columns;
                ctx.fillStyle = 'rgba(211, 225, 250, .22)';
                ctx.beginPath();
                ctx.arc(x + (column + 0.5) * cell, y + (row + 0.5) * cell, Math.max(1.5, cell * 0.035), 0, Math.PI * 2);
                ctx.fill();
                continue;
            }
            const row = Math.floor(cellIndex / this.columns);
            const column = cellIndex % this.columns;
            const centerX = x + (column + 0.5) * cell;
            const centerY = y + (row + 0.5) * cell;
            const radius = cell * 0.31;
            ctx.fillStyle = this.colors[color];
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.48)';
            ctx.lineWidth = Math.max(1, cell * 0.025);
            ctx.stroke();

            const label = labelForColor(color);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `800 ${Math.max(9, cell * (label.length > 1 ? 0.29 : 0.38))}px Inter, system-ui, sans-serif`;
            ctx.lineJoin = 'round';
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText(label, centerX, centerY + 0.5);
            ctx.fillStyle = '#080b11';
            ctx.fillText(label, centerX, centerY + 0.5);
        }
    }

    _drawFooter(ctx) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(219, 230, 249, .75)';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        const undoDescription = this.moveMode === 'edges'
            ? 'Z · undo last edge change'
            : 'Z · undo last stroke';
        if (this.phase === 'run-complete') {
            ctx.fillStyle = '#9be7b0';
            ctx.font = '700 15px Inter, system-ui, sans-serif';
            ctx.fillText(`RUN COMPLETE · ${formatElapsed(this.timedRunFinalElapsedMs)}`, this.w / 2, this.layout.y + this.layout.height + 27);
            ctx.fillStyle = 'rgba(219, 230, 249, .75)';
            ctx.font = '500 11px Inter, system-ui, sans-serif';
            ctx.fillText('Enter or click for a new run  ·  Z undoes the last stroke', this.w / 2, this.layout.y + this.layout.height + 48);
        } else if (this.phase === 'solved') {
            ctx.fillStyle = this.completedPuzzle?.optimal ? '#9be7b0' : '#f5d489';
            ctx.font = '700 15px Inter, system-ui, sans-serif';
            const result = this.moveMode === 'timed'
                ? `SOLVED · ${this.timedSolvedCount} / ${this.timedPuzzleCount} puzzles · ${formatElapsed(this.timedRunElapsedMs)}`
                : (this.completedPuzzle?.optimal
                    ? `PERFECT · optimal!  Streak: ${this.streak}`
                    : `SOLVED · ${this.moveCount} moves; minimum ${this.minimumMoves}`);
            ctx.fillText(result, this.w / 2, this.layout.y + this.layout.height + 27);
            ctx.fillStyle = 'rgba(219, 230, 249, .75)';
            ctx.font = '500 11px Inter, system-ui, sans-serif';
            const undo = this.moveMode === 'edges' ? 'Z undoes the last edge' : 'Z undoes the last stroke';
            ctx.fillText(`Enter or click for the next puzzle  ·  ${undo}`, this.w / 2, this.layout.y + this.layout.height + 48);
        } else {
            ctx.fillText(`Drag from a letter to its match  ·  ${undoDescription}`, this.w / 2, Math.min(this.h - 19, this.layout.y + this.layout.height + 31));
        }
    }

    _drawError(ctx) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f1f6ff';
        ctx.font = '700 24px Inter, system-ui, sans-serif';
        ctx.fillText('Unable to generate puzzle', this.w / 2, this.h * 0.4);
        ctx.fillStyle = '#f2b9b9';
        ctx.font = '500 15px Inter, system-ui, sans-serif';
        const words = this.errorMessage.split(/\s+/);
        let line = '';
        let y = this.h * 0.48;
        const maxWidth = this.w * 0.78;
        for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (ctx.measureText(next).width > maxWidth && line) {
                ctx.fillText(line, this.w / 2, y);
                line = word;
                y += 23;
            } else {
                line = next;
            }
        }
        if (line) ctx.fillText(line, this.w / 2, y);
        ctx.fillStyle = '#aab9d3';
        ctx.font = '500 12px Inter, system-ui, sans-serif';
        ctx.fillText('Press Esc to adjust the grid settings or color range.', this.w / 2, y + 38);
    }

    _drawGeneration(ctx) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f1f6ff';
        ctx.font = '700 22px Inter, system-ui, sans-serif';
        ctx.fillText('Generating puzzle', this.w / 2, this.h / 2 - 48);
        ctx.fillStyle = '#a9bad7';
        ctx.font = '500 13px Inter, system-ui, sans-serif';
        ctx.fillText(this.generationStage, this.w / 2, this.h / 2 - 14);
        const width = Math.min(320, this.w - 60);
        const x = (this.w - width) / 2;
        const y = this.h / 2 + 12;
        ctx.fillStyle = '#26344b';
        ctx.fillRect(x, y, width, 5);
        ctx.fillStyle = '#5bdad3';
        ctx.fillRect(x, y, width * Math.max(0.01, this.generationProgress), 5);
        ctx.fillStyle = '#8293b2';
        ctx.font = '500 11px Inter, system-ui, sans-serif';
        ctx.fillText(`${this.rows} × ${this.columns} · ${this.minimumColors}–${this.maximumColors} colors`, this.w / 2, y + 27);
    }

    update() {}

    onPause() {
        if (this.moveMode === 'timed' && this.phase === 'playing' && this.timedPuzzleStartedAt !== null) {
            this.timedPuzzleElapsedMs += performance.now() - this.timedPuzzleStartedAt;
            this.timedPuzzleStartedAt = null;
        }
        if (!this.activeStroke) return;
        if (this.moveMode !== 'edges') {
            this.edgeSets = cloneEdgeSets(this.activeStroke.beforeBoard);
            this._rebuildOccupancy();
        }
        this.activeStroke = null;
    }

    onResume() {
        if (this.moveMode === 'timed' && this.phase === 'playing' && this.timedPuzzleStartedAt === null) {
            this.timedPuzzleStartedAt = performance.now();
        }
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;
        this._drawBackground(ctx);
        if (this.phase === 'generating') {
            this._drawGeneration(ctx);
            return;
        }
        if (this.phase === 'error') {
            this._drawError(ctx);
            return;
        }
        this.layout = this._calculateLayout();
        this._drawHeader(ctx);
        this._drawBoard(ctx);
        this._drawFooter(ctx);
    }

    onResize() {
        this.layout = null;
    }

    renderPauseSettingInput(setting, value, settings) {
        if (!['minimumColors', 'maximumColors'].includes(setting.key)) return '';
        const rows = Number(settings.rows ?? 6);
        const columns = Number(settings.columns ?? 6);
        const defaults = defaultColorRange(rows, columns);
        const numberValue = Number(value);
        const fallback = setting.key === 'minimumColors' ? defaults.minimum : defaults.maximum;
        const safeValue = Number.isInteger(numberValue) ? numberValue : fallback;
        const input = `<input type="number" class="setting-number" data-key="${setting.key}" step="1" min="1" max="${MAX_COLOR_COUNT}" value="${safeValue}">`;
        if (setting.key !== 'minimumColors') return input;

        const counts = Number.isInteger(rows) && Number.isInteger(columns)
            ? getTheoreticalCounts(rows, columns)
            : [];
        const theoreticalMax = counts.at(-1) ?? 0;
        const minimumCellsPerPath = minimumPathCells(rows, columns);
        return `<div class="flow-color-setting">${input}<small data-flow-range-note>Theoretical limit with at least ${minimumCellsPerPath} cells per path: ${theoreticalMax} colors. The generator only accepts puzzles exhaustively proven to have a unique solution.</small></div>`;
    }

    mountPauseSettings({ panel, settings }) {
        if (!panel) return;
        const minimumInput = panel.querySelector('[data-key="minimumColors"]');
        const maximumInput = panel.querySelector('[data-key="maximumColors"]');
        let automaticRange = {
            minimum: Number(minimumInput?.value),
            maximum: Number(maximumInput?.value),
        };
        let colorRangeEdited = false;
        for (const input of [minimumInput, maximumInput]) {
            input?.addEventListener('input', () => { colorRangeEdited = true; });
        }
        const updateRangeNote = () => {
            const note = panel.querySelector('[data-flow-range-note]');
            if (!note) return;
            const rows = Number(panel.querySelector('[data-key="rows"]')?.value);
            const columns = Number(panel.querySelector('[data-key="columns"]')?.value);
            const maximumPossible = Number.isInteger(rows) && Number.isInteger(columns)
                ? getTheoreticalCounts(rows, columns).at(-1) ?? 1
                : 1;
            const defaults = defaultColorRange(rows, columns);
            if (minimumInput && maximumInput && !colorRangeEdited
                && Number(minimumInput.value) === automaticRange.minimum
                && Number(maximumInput.value) === automaticRange.maximum) {
                minimumInput.value = defaults.minimum;
                maximumInput.value = defaults.maximum;
                automaticRange = { minimum: defaults.minimum, maximum: defaults.maximum };
            }
            if (minimumInput && Number(minimumInput.value) > maximumPossible) minimumInput.value = maximumPossible;
            if (maximumInput && Number(maximumInput.value) > maximumPossible) maximumInput.value = maximumPossible;
            if (minimumInput && maximumInput && Number(minimumInput.value) > Number(maximumInput.value)) {
                minimumInput.value = maximumInput.value;
            }
            if (minimumInput && settings) settings.minimumColors = Number(minimumInput.value);
            if (maximumInput && settings) settings.maximumColors = Number(maximumInput.value);
            const counts = Number.isInteger(rows) && Number.isInteger(columns)
                ? getTheoreticalCounts(rows, columns)
                : [];
            const theoreticalMax = counts.at(-1) ?? 0;
            const minimumCellsPerPath = minimumPathCells(rows, columns);
            note.textContent = `Theoretical limit with at least ${minimumCellsPerPath} cells per path: ${theoreticalMax} colors. The generator only accepts puzzles exhaustively proven to have a unique solution.`;
        };
        panel.querySelector('[data-key="rows"]')?.addEventListener('change', updateRangeNote);
        panel.querySelector('[data-key="columns"]')?.addEventListener('change', updateRangeNote);
        updateRangeNote();

        const moveModeInput = panel.querySelector('[data-key="moveMode"]');
        const timedCountRow = panel.querySelector('[data-key="timedPuzzleCount"]')?.closest('.setting-row');
        const updateTimedCountVisibility = () => {
            if (timedCountRow) timedCountRow.hidden = moveModeInput?.value !== 'timed';
        };
        moveModeInput?.addEventListener('change', updateTimedCountVisibility);
        updateTimedCountVisibility();
    }

    async preparePauseSettings(settings, progressContext = {}) {
        const rows = requireInteger(settings.rows ?? 6, 'Number of rows', { minimum: 1, maximum: MAX_BOARD_DIMENSION });
        const columns = requireInteger(settings.columns ?? 6, 'Number of columns', { minimum: 1, maximum: MAX_BOARD_DIMENSION });
        if (rows * columns < 2) throw new Error('The grid must contain at least two cells.');
        if (rows * columns > MAX_BOARD_CELLS) {
            throw new Error(`The grid can contain at most ${MAX_BOARD_CELLS} cells because every puzzle is exhaustively checked for uniqueness.`);
        }
        const defaultColors = defaultColorRange(rows, columns);
        const minimumColors = requireInteger(settings.minimumColors ?? defaultColors.minimum, 'Minimum number of colors', {
            minimum: 1, maximum: MAX_COLOR_COUNT,
        });
        const maximumColors = requireInteger(settings.maximumColors ?? defaultColors.maximum, 'Maximum number of colors', {
            minimum: 1, maximum: MAX_COLOR_COUNT,
        });
        if (minimumColors > maximumColors) throw new Error('The minimum number of colors must not exceed the maximum.');

        const moveMode = settings.moveMode ?? 'strokes';
        if (!SCORING_MODES.has(moveMode)) throw new Error('The selected scoring mode is invalid.');
        requireInteger(settings.timedPuzzleCount ?? 5, 'Puzzles per timed run', {
            minimum: 1, maximum: MAX_TIMED_PUZZLES,
        });

        const counts = getTheoreticalCounts(rows, columns);
        const available = counts.filter(count => count >= minimumColors && count <= maximumColors);
        if (!available.length) {
            throw new Error(`For the ${rows} × ${columns} grid, the selected range exceeds the coverage limit of ${counts.at(-1) ?? 'no'} colors.`);
        }
        progressContext.setStatus?.('Every puzzle will be exhaustively checked during generation.');
        progressContext.setProgress?.(1, `Range within coverage limits: ${available[0]}–${available.at(-1)} colors.`);
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        return { ...(this.puzzleSettingsSnapshot || {
            rows: settings.rows,
            columns: settings.columns,
            minimumColors: settings.minimumColors ?? defaultColorRange(settings.rows ?? 6, settings.columns ?? 6).minimum,
            maximumColors: settings.maximumColors ?? defaultColorRange(settings.rows ?? 6, settings.columns ?? 6).maximum,
            moveMode: settings.moveMode,
            timedPuzzleCount: settings.timedPuzzleCount ?? 5,
            generatorVersion: GENERATOR_VERSION,
        }) };
    }

    destroy() {
        this._generationWorker?.terminate();
        this._generationWorker = null;
        this._finalizeSolvedPuzzle();
        this.canvas?.removeEventListener('pointerdown', this._pointerDown);
        this.canvas?.removeEventListener('pointermove', this._pointerMove);
        this.canvas?.removeEventListener('pointerup', this._pointerUp);
        this.canvas?.removeEventListener('pointercancel', this._pointerUp);
        window.removeEventListener('keydown', this._keyDown);
        this.activeStroke = null;
        if (this.canvas) {
            this.canvas.style.cursor = this._previousCursor || '';
            this.canvas.style.touchAction = this._previousTouchAction || '';
        }
    }

    static getSettingsSchema() {
        return [
            { key: 'rows', label: 'A · rows', type: 'number', domainMin: 1, domainMax: MAX_BOARD_DIMENSION, domainStep: 1, default: 6, group: 'Grid' },
            { key: 'columns', label: 'B · columns', type: 'number', domainMin: 1, domainMax: MAX_BOARD_DIMENSION, domainStep: 1, default: 6, group: 'Grid' },
            { key: 'minimumColors', label: 'Minimum colors', type: 'game-custom', domainMin: 1, domainMax: MAX_COLOR_COUNT, domainStep: 1, default: 5, group: 'Colors' },
            { key: 'maximumColors', label: 'Maximum colors', type: 'game-custom', domainMin: 1, domainMax: MAX_COLOR_COUNT, domainStep: 1, default: 8, group: 'Colors' },
            {
                key: 'moveMode', label: 'Scoring', type: 'select', default: 'strokes', group: 'Scoring',
                options: [
                    { value: 'strokes', label: 'Optimal streak · strokes' },
                    { value: 'edges', label: 'Optimal streak · edges' },
                    { value: 'timed', label: 'Fastest run' },
                ],
            },
            { key: 'timedPuzzleCount', label: 'Puzzles per run', type: 'number', domainMin: 1, domainMax: MAX_TIMED_PUZZLES, domainStep: 1, default: 5, group: 'Scoring' },
        ];
    }
}
