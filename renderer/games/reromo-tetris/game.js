import { TETRIS_MODES, isCartesianMode, isStructuralMode, isRockingMode, formatSprintTime } from './tetris-modes.js';
import { rockingGeometry, rockingAssembly, rockingKinematics, rockingAcceleration, stepRocking, rowsToCollapse } from './rocking-physics.js';
import { createCollapseSimulation } from './collapse-physics.js';
import { recoverGrid, observeRecoveryRest } from './collapse-recovery.js';
import { findGridFallBodies } from './grid-fall.js';
import { createRockingViewport, rockingFrame, FRAME_INSET } from './rocking-viewport.js';
import { fitMobiusTemplate } from './projection-bounds.js';
import { BaseGame } from '../../core/BaseGame.js';
import { computeWidgetLayout } from '../../core/WidgetLayout.js';
import { InputManager } from '../../core/InputManager.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import {
    initializeModeSettings,
    modeProfilesOf,
    switchModeSettings,
    syncActiveModeProfile,
    withModeProfiles,
} from '../../core/ModeSettings.js';
import {
    getMobiusTemplateBoundaryOffset,
    positiveModulo,
    TAU,
} from './mobius-geometry.js';
import {
    buildWeightedSampler,
    getActivePiecePreviewBounds,
    getPieceGeometry,
    getPreviewCells,
    POLYOMINO_CATALOG,
} from './polyominoes.js';
import {
    CONTROL_DEFINITIONS,
    createDefaultSettings,
    GAME_ID,
    getFrameworkControlsSchema,
    getFrameworkSettingsSchema,
    normalizeBindings,
    normalizeSettings,
    validateSettings,
    settingsRecordKey,
} from './settings.js';
import {
    ensureMobiusTemplate,
    findGridPreset,
    GRID_PRESETS,
    gridPresetValue,
} from './projection-cache.js';
import {
    analyzeStructuralStability,
    normalizeStructuralPhysics,
    splitDisconnectedBodies,
} from './structural-stability.js';
import {
    mountPolyominoWeightSetting,
    preparePolyominoSettings,
    renderPolyominoWeightSetting,
    TetrisUI,
} from './ui.js';

const MAX_UPDATE_STEPS = 64;
const PROJECTION_YIELD_INTERVAL_MS = 8;
const TETRIS_AUDIO = Object.freeze({ landingGain: 0.28, lockGain: 0.36 });
const RECOVERY_EFFECT = Object.freeze({ seconds: 0.5, recheckDelaySeconds: 0.5, soundGain: 0.6, glowColor: '#b6ffff', glowBlur: 18 });


let preparedMobiusProjection = null;

function normalizeProfiledSettings(settings) {
    const schema = getFrameworkSettingsSchema();
    const profiled = initializeModeSettings(settings, TETRIS_MODES, schema, 'circular');
    const normalized = {
        ...normalizeSettings(profiled, { strict: true }),
        modeProfiles: modeProfilesOf(profiled),
    };
    return syncActiveModeProfile(normalized, TETRIS_MODES, schema, 'circular');
}

const CELL_KIND = Object.freeze({
    EMPTY: 0,
    DROP_PATH: 1,
    GHOST: 2,
    LOCKED: 3,
    CURRENT: 4,
    FLASH: 5,
});

// Drawing constants are intentionally centralized so visual tuning never needs
// to be hunted through the renderer.
const DRAWING = Object.freeze({
    margin: 8,
    gap: 6,
    platformArcSamples: 32,
    hudWidth: 220,
    circularInnerRadiusRatio: 0.075,
    circularOuterRadiusRatio: 0.49,
    mobiusSubdivisions: 7,
    gridLineWidth: 0.55,
    blockLineWidth: 1,
    hudPanelRadius: 4,
});

const STANDARD_KICKS = Object.freeze([
    { r: 0, phi: 0 },
    { r: 0, phi: 1 },
    { r: 0, phi: -1 },
    { r: 1, phi: 0 },
    { r: -1, phi: 0 },
    { r: 0, phi: 2 },
]);

const HALF_TURN_KICKS = Object.freeze([
    { r: 0, phi: 0 },
    { r: 1, phi: 0 },
    { r: -1, phi: 0 },
    { r: 0, phi: 1 },
    { r: 0, phi: -1 },
]);

function clone(value) {
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function roundedRectPath(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    const path = new Path2D();
    path.moveTo(x + r, y);
    path.lineTo(x + width - r, y);
    path.quadraticCurveTo(x + width, y, x + width, y + r);
    path.lineTo(x + width, y + height - r);
    path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    path.lineTo(x + r, y + height);
    path.quadraticCurveTo(x, y + height, x, y + height - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
    path.closePath();
    return path;
}

function appendTemplateBoundary(path, template, physicalColumn, boundaryRow, board, move = true) {
    const data = template.boundaryData;
    const offset = getMobiusTemplateBoundaryOffset(template, physicalColumn, boundaryRow);
    const pointCount = template.subdivisions + 1;
    const controlOffset = offset + pointCount * 2;
    const screenX = index => board.x + data[index] * board.size;
    const screenY = index => board.y + data[index] * board.size;
    if (move) path.moveTo(screenX(offset), screenY(offset + 1));
    for (let segment = 0; segment < template.subdivisions; segment++) {
        const controlIndex = controlOffset + segment * 2;
        const endIndex = offset + (segment + 1) * 2;
        path.quadraticCurveTo(
            screenX(controlIndex),
            screenY(controlIndex + 1),
            screenX(endIndex),
            screenY(endIndex + 1),
        );
    }
}

function makeMobiusPatch(template, rawIndex, board) {
    const physicalColumn = Math.floor(rawIndex / template.rows);
    const row = rawIndex % template.rows;
    const lowerOffset = getMobiusTemplateBoundaryOffset(template, physicalColumn, row);
    const upperOffset = getMobiusTemplateBoundaryOffset(template, physicalColumn, row + 1);
    const pointCount = template.subdivisions + 1;
    const upperControlOffset = upperOffset + pointCount * 2;
    const data = template.boundaryData;
    const screenX = index => board.x + data[index] * board.size;
    const screenY = index => board.y + data[index] * board.size;
    const fillPath = new Path2D();
    appendTemplateBoundary(fillPath, template, physicalColumn, row, board);
    const upperEndIndex = upperOffset + (pointCount - 1) * 2;
    fillPath.lineTo(screenX(upperEndIndex), screenY(upperEndIndex + 1));
    for (let segment = template.subdivisions - 1; segment >= 0; segment--) {
        const controlIndex = upperControlOffset + segment * 2;
        const endIndex = upperOffset + segment * 2;
        fillPath.quadraticCurveTo(
            screenX(controlIndex),
            screenY(controlIndex + 1),
            screenX(endIndex),
            screenY(endIndex + 1),
        );
    }
    fillPath.closePath();

    const signedFacing = template.signedFacings[rawIndex];
    const facing = Math.abs(signedFacing);
    const shade = Math.round(7 + facing * 12);
    const patch = {
        rawIndex,
        physicalColumn,
        row,
        slotA: physicalColumn,
        rowA: row,
        slotB: null,
        rowB: null,
        frontFacing: signedFacing >= 0,
        frontIsA: signedFacing >= 0,
        facing,
        depth: template.depths[rawIndex] * board.size,
        fillPath,
        surfaceColor: `rgb(${shade},${shade + 1},${shade + 5})`,
    };
    if (template.paired) {
        patch.slotB = physicalColumn + template.physicalColumns;
        patch.rowB = template.rows - 1 - row;
    }
    return patch;
}

function appendMobiusGridColumn(path, template, physicalColumn, board) {
    const data = template.boundaryData;
    for (let boundaryRow = 0; boundaryRow <= template.rows; boundaryRow++) {
        appendTemplateBoundary(path, template, physicalColumn, boundaryRow, board);
    }

    // A fixed-angle strip line is a projected 3-D line and is therefore
    // straight in screen space. One line replaces the old per-cell copies.
    const firstOffset = getMobiusTemplateBoundaryOffset(template, physicalColumn, 0);
    path.moveTo(
        board.x + data[firstOffset] * board.size,
        board.y + data[firstOffset + 1] * board.size,
    );
    for (let boundaryRow = 1; boundaryRow <= template.rows; boundaryRow++) {
        const offset = getMobiusTemplateBoundaryOffset(template, physicalColumn, boundaryRow);
        path.lineTo(
            board.x + data[offset] * board.size,
            board.y + data[offset + 1] * board.size,
        );
    }
}

function yieldToBrowser() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

export default class ReRoMoTetris extends BaseGame {
    constructor() {
        super();
        this.handlesPause = false;
        this.wantsPointerLock = false;
        this._runToken = 0;
        this._projectionBuildToken = 0;
    }

    static getSettingsSchema() {
        return withModeProfiles(getFrameworkSettingsSchema());
    }

    static getControlsSchema() {
        return getFrameworkControlsSchema();
    }

    wantsPointerLockNow() {
        return false;
    }

    init() {
        validateSettings(this.settings || {});
        this.settings = normalizeProfiledSettings(this.settings);
        if (!this._modeChosenForSession) {
            this._showModeSelector();
            return;
        }
        this._initializeRun();
    }

    static getModeDefinitions() {
        return [
            { key: 'survival', title: 'Survival', artKey: 'tetris-survival', description: 'Keep clearing rows and survive as long as possible.' },
            { key: 'sprint', title: 'Sprint', artKey: 'tetris-sprint', description: 'Clear the target rows as fast as possible. Default: 40 rows.' },
        ];
    }

    openModeSelector(options = {}) {
        this.destroy();
        this._modeChosenForSession = false;
        this._showBoardSelector();
        return true;
    }

    returnToModeSelector(options = {}) {
        this.destroy();
        this._modeChosenForSession = false;
        if (options?.direct || options?.source === 'pause-menu') {
            this._showBoardSelector();
        } else {
            this._showModeSelector();
        }
    }

    _showModeSelector() {
        this.state = 'mode-select';
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        this.modeSelector.innerHTML = modeGalleryMarkup({ gameName: 'ReRoMo Tetris', prompt: 'Choose rules',
            selectedMode: this.settings.ruleMode, modes: this.constructor.getModeDefinitions() });
        document.body.appendChild(this.modeSelector);
        bindModeGallery(this.modeSelector, {
            onMode: mode => { if (!['survival', 'sprint'].includes(mode)) return;
                this.settings.ruleMode = mode; this._showBoardSelector(); },
            onBack: () => this.endGame(),
        });
    }

    _showBoardSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        const modes = [
            { key: 'rectangular', title: 'Cartesian', artKey: 'tetris-rectangular', description: 'The original rectangular field.' },
            { key: 'circular', title: 'Polar', artKey: 'tetris-circular', description: 'Periodic angular direction on a polar board.' },
            { key: 'mobius', title: 'Möbius', artKey: 'tetris-mobius', description: 'Double-traversal non-orientable strip.' },
            { key: 'structural', title: 'Structural Cartesian', artKey: 'tetris-structural', description: 'Cartesian stacking with forces, torques, and toppling.' },
            { key: 'rocking', title: 'Rocking · Lines', artKey: 'tetris-rocking', description: 'A rolling circular platform. Clear rows by filling the platform width.' },
            { key: 'rocking-pressure', title: 'Rocking · Pressure', artKey: 'tetris-rocking-pressure', description: 'A rolling platform. Rows collapse under the mass stacked above them.' },
        ];
        this.pendingMode = modes.some(mode => mode.key === this.settings.mode) ? this.settings.mode : 'circular';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: `ReRoMo Tetris · ${this.settings.ruleMode === 'sprint' ? 'Sprint' : 'Survival'}`,
            prompt: 'Choose board topology',
            selectedMode: this.pendingMode,
            modes,
        });
        document.body.appendChild(this.modeSelector);
        this._modeSelectorClick = bindModeGallery(this.modeSelector, {
            onMode: mode => this._selectInitialMode(mode),
            onBack: () => this._showModeSelector(),
        });
    }

    _selectInitialMode(mode) {
        if (!TETRIS_MODES.includes(mode)) return false;
        this.audio?.warmUp?.();
        this.settings = normalizeProfiledSettings(switchModeSettings(
            this.settings,
            mode,
            TETRIS_MODES,
            getFrameworkSettingsSchema(),
            'circular',
        ));
        this.app.currentSettings = clone(this.settings);
        this.app.settingsManager.save(GAME_ID, this.settings).catch(() => {});
        this.modeSelector?.remove();
        this.modeSelector = null;
        this._modeChosenForSession = true;
        this._initializeRun();
        return true;
    }

    _initializeRun() {
        this.sprintElapsed = 0;
        this.sprintTick = null;
        this.bestSprintSeconds = null;
        this.rockingViewport = null;
        this.gridRecovery = null;
        this.recoveryGraceSeconds = 0;
        this.collapseResumePiece = null;
        this._runToken++;
        const runToken = this._runToken;
        this.settings = normalizeProfiledSettings(this.settings);
        const bindings = normalizeBindings(this.app.currentBindings);
        this.app.currentSettings = clone(this.settings);
        this.app.currentBindings = clone(bindings);
        this.input.setActionBindings(bindings);
        this.rows = this.settings.rSegments;
        this.columns = isRockingMode(this.settings.mode) ? this.settings.rockingLengthCells : this.settings.phiSegments;
        this.overhangGrid = new Map();
        this.grid = Array.from({ length: this.rows }, () => new Int32Array(this.columns));
        this.structuralBodyGrid = isStructuralMode(this.settings.mode)
            ? Array.from({ length: this.rows }, () => new Int32Array(this.columns))
            : null;
        this.pieceIdentityGrid = this.structuralBodyGrid || (isCartesianMode(this.settings.mode)
            ? Array.from({ length: this.rows }, () => new Int32Array(this.columns)) : null);
        this.lockedOutlinePath = null;
        this.nextStructuralBodyId = 1;
        this.structuralPhysics = isStructuralMode(this.settings.mode)
            ? this._structuralPhysicsFromSettings()
            : null;
        this.structuralAnalysis = null;
        this.toppling = null;
        this.collapseSimulation = null;
        this.collapseSnapshot = null;
        this.gridFalling = null;
        this.rocking = isRockingMode(this.settings.mode) ? { angle: 0, omega: 0, alpha: 0, tipped: false } : null;
        this.rockingShape = this.rocking ? rockingGeometry(this.columns * this.structuralPhysics.cellSizeMeters,
            this.settings.rockingArcDegrees, this.settings.rockingMassKg) : null;
        this._refreshRockingMass();
        this.gameOverReason = null;

        this.sampler = buildWeightedSampler(this.settings.orderWeights, this.settings.pieceOverrides);
        if (!(this.sampler.total > 0)) {
            const fallback = createDefaultSettings();
            this.settings.orderWeights = fallback.orderWeights;
            this.settings.pieceOverrides = {};
            this.sampler = buildWeightedSampler(this.settings.orderWeights, this.settings.pieceOverrides);
        }
        this.previewBounds = getActivePiecePreviewBounds(
            this.settings.orderWeights,
            this.settings.pieceOverrides,
        );

        this.score = 0;
        this.linesCleared = 0;
        this.level = 1;
        this.gameSpeed = this.settings.initialSpeed;
        this.lockDelay = this.settings.initialLockDelay;
        this.highScore = 0;
        this.highLines = 0;
        this.state = 'playing';
        this.menuPaused = false;
        this.scoreSubmitted = false;

        this.currentPiece = null;
        this.heldPieceIndex = null;
        this.canHold = true;
        this.nextPieces = [];
        this.ghostR = 0;
        this.mobiusViewPhi = Math.floor(this.columns / 2);

        this.gravityElapsed = 0;
        this.groundedElapsed = 0;
        this.pieceGrounded = false;
        this.softDropElapsed = 0;
        this.softDropActive = false;
        this.lastSoftDropPressTime = -Infinity;
        this.comboReleaseLock = null;
        this.lastHorizontalComboPress = null;
        this.horizontalDropCombo = null;
        this.horizontal = {
            action: null,
            direction: 0,
            elapsed: 0,
            repeatElapsed: 0,
            repeating: false,
        };
        this.lineClear = null;
        this.visualKinds = new Uint8Array(this.rows * this.columns);
        this.visualPieces = new Int32Array(this.rows * this.columns);
        this.visualActiveIndices = [];

        this.layout = null;
        this.projection = null;
        this.projectionLoading = false;
        this.projectionProgress = 0;
        this.projectionLoadingMessage = '';
        this.projectionError = '';
        this.dirty = true;
        this.renderCount = 0;
        this.lastRenderDurationMs = 0;
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.lineJoin = 'round';
        this.ctx.lineCap = 'round';

        this.ui = new TetrisUI(this);
        this.ui.updateHud();
        this._rebuildProjectionCache();
        this._fillQueue();
        this._spawnPiece();
        this._loadHighScores(runToken);
    }

    destroy() {
        this._runToken++;
        this._projectionBuildToken++;
        this.input?.cancelListen();
        this.ui?.destroy();
        this.ui = null;
        this.currentPiece = null;
        this.lineClear = null;
        this.structuralBodyGrid = null;
        this.structuralPhysics = null;
        this.structuralAnalysis = null;
        this.toppling = null;
        this.projection = null;
        this.visualKinds = null;
        this.visualPieces = null;
        this.visualActiveIndices = null;
        this.modeSelector?.remove();
        this.modeSelector = null;
    }

    restart() {
        // A normal R-key restart does not change either geometry or window
        // size. Preserve the expensive native paths and raster layers across
        // that restart; a changed settings key is rejected during init.
        const board = this.layout?.board;
        const desiredKey = this.settings?.mode === 'mobius' && board
            ? this._mobiusProjectionKey(this.settings, board)
            : null;
        if (preparedMobiusProjection?.key === desiredKey) {
            // The settings panel just prepared the new grid; do not overwrite
            // it with the currently displayed (old-settings) projection.
        } else if (this.projection?.mobius?.cacheKey === desiredKey) {
            preparedMobiusProjection = {
                key: this.projection.mobius.cacheKey,
                mesh: this.projection.mobius,
            };
        } else {
            preparedMobiusProjection = null;
        }
        super.restart();
    }

    onResize() {
        if (!this.canvas || !this.ctx) return;
        this._rebuildProjectionCache();
        this.invalidate();
    }

    getLayoutWidgets() {
        return this.ui?.getLayoutWidgets?.() || super.getLayoutWidgets();
    }

    async onLayoutSettingsApplied(settings) {
        this.settings = normalizeProfiledSettings(settings);
        if (this.rockingViewport) {
            // Editing the frame changes its edges, never the camera or floor.
            const span = Math.max(this.columns, Number(this.settings.rockingFrameWidthCells) || this.columns);
            Object.assign(this.rockingViewport.base, { minX: -span / 2, maxX: span / 2,
                minY: -this.rows - Math.max(0, Number(this.settings.rockingFrameHeadroomCells) || 0) });
        }
        this._rebuildProjectionCache();
        this.invalidate();
    }

    onPause() {
        this._advanceSprintClock();
        this.sprintTick = null;
        this.setMenuPaused(true);
    }

    onResume() {
        this.sprintTick = null;
        this.setMenuPaused(false);
    }

    invalidate() {
        this.dirty = true;
    }

    setMenuPaused(paused) {
        if (paused && !this.menuPaused) this._advanceSprintClock();
        this.sprintTick = null;
        this.menuPaused = Boolean(paused);
        this._resetRepeats();
        this.invalidate();
    }

    renderPauseSettingInput(setting, _value, settings) {
        if (setting.customKind === 'polyomino-weights') {
            return renderPolyominoWeightSetting(settings);
        }
        return '';
    }

    mountPauseSettings(context) {
        mountPolyominoWeightSetting(context);
        const { panel, settings, setStatus } = context;
        const presetSelect = panel.querySelector('[data-key="gridPreset"]');
        const columnInput = panel.querySelector('[data-key="phiSegments"]');
        const rowInput = panel.querySelector('[data-key="rSegments"]');
        if (!presetSelect || !columnInput || !rowInput) return;

        const syncPresetSelection = () => {
            const columns = Math.round(Number(columnInput.value));
            const rows = Math.round(Number(rowInput.value));
            const preset = findGridPreset(columns, rows);
            const value = preset ? gridPresetValue(columns, rows) : 'custom';
            presetSelect.value = value;
            settings.gridPreset = value;
        };
        presetSelect.addEventListener('change', () => {
            if (presetSelect.value === 'custom') return;
            const preset = GRID_PRESETS.find(candidate =>
                gridPresetValue(candidate.columns, candidate.rows) === presetSelect.value);
            if (!preset) return;
            columnInput.value = String(preset.columns);
            rowInput.value = String(preset.rows);
            settings.phiSegments = preset.columns;
            settings.rSegments = preset.rows;
            settings.gridPreset = presetSelect.value;
            setStatus('Prepared grid size selected. You can still type either value manually.');
        });
        columnInput.addEventListener('input', syncPresetSelection);
        rowInput.addEventListener('input', syncPresetSelection);
        syncPresetSelection();
    }

    async preparePauseSettings(settings, progressContext = {}) {
        validateSettings(settings);
        const profiled = syncActiveModeProfile(
            settings,
            TETRIS_MODES,
            getFrameworkSettingsSchema(),
            'circular',
        );
        const prepared = syncActiveModeProfile({
            ...preparePolyominoSettings(profiled),
            modeProfiles: modeProfilesOf(profiled),
        }, TETRIS_MODES, getFrameworkSettingsSchema(), 'circular');
        if (prepared.mode !== 'mobius') {
            preparedMobiusProjection = null;
            return prepared;
        }

        const layout = this._calculateLayout(prepared.mode);
        const key = this._mobiusProjectionKey(prepared, layout.board);
        if (this.projection?.mobius && this._mobiusProjectionKey(this.settings, layout.board) === key) {
            preparedMobiusProjection = { key, mesh: this.projection.mobius };
            progressContext.setProgress?.(1, 'Möbius grid is already prepared.');
            return prepared;
        }

        const mesh = await this._createMobiusProjection(
            prepared,
            layout.board,
            (fraction, message) => progressContext.setProgress?.(fraction, message),
        );
        preparedMobiusProjection = { key, mesh };
        progressContext.setProgress?.(1, 'Grid ready. Restarting…');
        return prepared;
    }

    preparePauseBinding(binding) {
        return binding?.type === 'keyboard' ? { ...binding, match: 'key' } : binding;
    }

    async saveBindings(bindings) {
        const normalized = normalizeBindings(bindings);
        await this.app.settingsManager.saveKeybindings(GAME_ID, normalized);
        this.app.currentBindings = clone(normalized);
        this.input.setActionBindings(normalized);
    }

    async applyConfiguration(settings, bindings) {
        const normalizedSettings = normalizeProfiledSettings(settings);
        const normalizedBindings = normalizeBindings(bindings);
        await Promise.all([
            this.app.settingsManager.save(GAME_ID, normalizedSettings),
            this.app.settingsManager.saveKeybindings(GAME_ID, normalizedBindings),
        ]);
        this.app.currentSettings = clone(normalizedSettings);
        this.app.currentBindings = clone(normalizedBindings);
        this.input.setActionBindings(normalizedBindings);
        this.settings = clone(normalizedSettings);
        this.restart();
    }

    getRecordSettings(settings = this.settings) {
        // Only the active topology participates in record identity. Profiles
        // belonging to the other modes must never split this leaderboard.
        return normalizeSettings(settings, { strict: true });
    }

    _allowsOverhang() {
        return isRockingMode(this.settings.mode) && this.settings.rockingAllowOverhang;
    }

    _cellAt(row, column) {
        if (row < 0 || row >= this.rows) return 0;
        if (column >= 0 && column < this.columns) return this.grid[row][column];
        return this.overhangGrid?.get(`${row},${column}`)?.value || 0;
    }

    _lockedCells() {
        const cells = [];
        for (let row = 0; row < this.rows; row++) for (let column = 0; column < this.columns; column++) {
            const value = this.grid[row][column];
            if (value) cells.push({ row, column, value, bodyId: (this.structuralBodyGrid || this.pieceIdentityGrid)?.[row][column] || 0 });
        }
        cells.push(...(this.overhangGrid?.values() || []));
        return cells;
    }

    _refreshRockingMass() {
        if (!this.rocking) return;
        this.rockingMass = rockingAssembly(this.rockingShape, this._lockedCells(), this.rows, this.columns, this.structuralPhysics);
        this.rocking.alpha = rockingAcceleration(this.rockingMass, this.rocking.angle, this.rocking.omega,
            this.structuralPhysics.gravity, this.settings.rockingRollingFriction);
    }

    _structuralFrame() {
        let minColumn = 0, maxColumn = this.columns - 1;
        for (const cell of this.overhangGrid?.values() || []) {
            minColumn = Math.min(minColumn, cell.column); maxColumn = Math.max(maxColumn, cell.column);
        }
        let grid = this.structuralBodyGrid;
        if (minColumn || maxColumn >= this.columns) {
            grid = Array.from({ length: this.rows }, () => new Int32Array(maxColumn - minColumn + 1));
            for (const cell of this._lockedCells()) grid[cell.row][cell.column - minColumn] = cell.bodyId;
        }
        const physics = { ...this.structuralPhysics, floorMinColumn: -minColumn, floorMaxColumn: this.columns - minColumn };
        if (this.rocking) {
            const kinematics = rockingKinematics(this.rockingShape, this.rocking);
            physics.frame = { ...this.rocking, ax: kinematics.ax, ay: kinematics.ay,
                originX: this.columns / 2 - minColumn, originY: this.rows };
        }
        return { grid, physics, minColumn };
    }

    _updateRocking(dt) {
        const before = `${this.rocking.angle},${this.rocking.omega},${this.rocking.alpha}`;
        stepRocking(this.rocking, this.rockingShape, this.rockingMass, this.structuralPhysics,
            this.settings.rockingRollingFriction, dt);
        if (this.rocking.tipped) return this._beginCollapse('platform');
        if (before !== `${this.rocking.angle},${this.rocking.omega},${this.rocking.alpha}`) {
            this._rebuildProjectionCache();
            this.invalidate();
            if (this.state === 'settling-grid' && this._checkStructuralEquilibrium()) return true;
            if (!this.lineClear && this._beginStructuralToppleIfNeeded()) return true;
        }
        return false;
    }

    _beginRockingRender(cache) {
        const ctx = this.ctx, shape = this.rockingShape;
        const pixelsPerMeter = cache.cellSize / this.structuralPhysics.cellSizeMeters;
        const x = cache.x + cache.gridWidth / 2, y = cache.y + cache.gridHeight;
        ctx.strokeStyle = '#707078'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.layout.board.x, y + shape.sag * pixelsPerMeter);
        ctx.lineTo(this.layout.board.x + this.layout.board.width, y + shape.sag * pixelsPerMeter);
        ctx.stroke();
        const position = this.collapseSnapshot?.platform || { ...rockingKinematics(shape, this.rocking), angle: this.rocking.angle };
        ctx.save();
        ctx.translate(x + position.x * pixelsPerMeter, y + position.y * pixelsPerMeter);
        ctx.rotate(position.angle); ctx.translate(-x, -y);
        ctx.beginPath();
        ctx.moveTo(cache.x, y); ctx.lineTo(cache.x + cache.gridWidth, y);
        ctx.arc(x, y - shape.d * pixelsPerMeter, shape.radius * pixelsPerMeter,
            Math.PI / 2 - shape.halfAngle, Math.PI / 2 + shape.halfAngle);
        ctx.closePath(); ctx.fillStyle = '#a69776'; ctx.fill();
        ctx.strokeStyle = '#e0d3b5'; ctx.lineWidth = 1; ctx.stroke();
    }

    _renderOverhang(cache) {
        if (!this._allowsOverhang()) return;
        const draw = (row, column, value, alpha = 1) => {
            if (row < 0 || row >= this.rows || (column >= 0 && column < this.columns)) return;
            const entry = POLYOMINO_CATALOG.all[value - 1];
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = entry?.color || '#ccc';
            this.ctx.fillRect(cache.x + column * cache.cellSize, cache.y + row * cache.cellSize, cache.cellSize, cache.cellSize);
        };
        for (const cell of this.overhangGrid.values()) {
            if (!this.toppling?.bodyIdSet.has(cell.bodyId)) draw(cell.row, cell.column, cell.value,
                this.lineClear?.flashOn && this.lineClear.rowSet.has(cell.row) ? 0.25 : 1);
        }
        if (this.currentPiece && !this.lineClear) {
            const ghost = this._blocksFor(this.currentPiece, this.ghostR);
            const hasLanding = ghost.some(cell => (cell.phi >= 0 && cell.phi < this.columns && cell.r + 1 === this.rows)
                || this._cellAt(cell.r + 1, cell.phi));
            if (hasLanding && this.ghostR > this.currentPiece.r) for (const cell of ghost)
                draw(cell.r, cell.phi, this.currentPiece.entry.index + 1, 0.25);
            for (const cell of this._blocksFor(this.currentPiece)) draw(cell.r, cell.phi, this.currentPiece.entry.index + 1);
        }
        this.ctx.globalAlpha = 1;
    }

    _structuralPhysicsFromSettings() {
        return normalizeStructuralPhysics({
            cellSizeMeters: this.settings.structuralCellSizeMeters,
            blockMassKg: this.settings.structuralBlockMassKg,
            gravity: this.settings.structuralGravity,
            pieceFriction: this.settings.structuralPieceFriction,
            wallFriction: this.settings.structuralWallFriction,
            platformFriction: this.settings.structuralPlatformFriction,
            walls: !this._allowsOverhang(),
            stabilityMarginCells: this.settings.structuralStabilityMarginCells,
            toppleDampingPerSecond: this.settings.structuralToppleDampingPerSecond,
            toppleInitialAngularSpeed: this.settings.structuralToppleInitialAngularSpeed,
            toppleGameOverAngleDegrees: this.settings.structuralToppleGameOverAngleDegrees,
            toppleMaximumSeconds: this.settings.structuralToppleMaximumSeconds,
        });
    }

    update(dt, frameDt = dt) {
        if (this.state === 'mode-select') return;
        if (this.input.isActionJustDown('pause')) {
            this.setMenuPaused(!this.menuPaused);
            return;
        }
        if (this.menuPaused) return;

        if (this.input.isActionJustDown('restart')) {
            this.restart();
            return;
        }
        if (this.projectionLoading || this.projectionError) return;
        if (this.state === 'won' || this.state === 'gameover') return;
        this._advanceSprintClock();
        if (this.state === 'recovering') {
            this._updateGridRecovery(dt);
            return;
        }
        if (this.state === 'toppling') {
            const checkNow = this.input.isActionJustDown('checkCollapse');
            // The contact integrator subdivides the full elapsed time itself.
            // The app's capped gameplay dt would cause slow motion below 20 FPS.
            this._updateToppling(checkNow ? 0 : frameDt, checkNow);
            return;
        }
        if (this.state === 'settling-grid') {
            this._updateGridFalling(dt);
            return;
        }
        if (this.state === 'gameover') return;
        this.recoveryGraceSeconds = Math.max(0, (this.recoveryGraceSeconds || 0) - dt);
        if (this.rocking && this._updateRocking(dt)) return;

        const elapsedMs = dt * 1000;
        if (this.lineClear) {
            this._updateLineClear(elapsedMs);
            return;
        }
        if (!this.currentPiece) {
            this._spawnPiece();
            if (!this.currentPiece) return;
        }

        if (this._updateComboReleaseLock()) return;
        if (this._updateHorizontalDropCombo(elapsedMs)) return;

        const now = performance.now();
        const softJustDown = this.input.isActionJustDown('softDrop');
        const softJustUp = this.input.isActionJustUp('softDrop');
        const horizontalJustDown = this._horizontalActionJustPressed();

        const horizontalDropPrefix = softJustDown
            ? this._recentHorizontalComboAction(now)
            : null;
        if (horizontalDropPrefix) {
            this._performHorizontalDropCombo(horizontalDropPrefix);
            return;
        }

        if (softJustDown) {
            this.softDropActive = true;
            this.softDropElapsed = 0;
            this.lastSoftDropPressTime = now;
            if (!this._stepDown(true)) this.softDropActive = false;
        }
        if (softJustUp) {
            this.softDropActive = false;
            this.softDropElapsed = 0;
            this.lastSoftDropPressTime = -Infinity;
        }

        const comboAction = this._comboActionJustPressed();
        let horizontalPressUsedByDownFirstCombo = false;
        if (now - this.lastSoftDropPressTime < this.settings.comboTime && comboAction) {
            horizontalPressUsedByDownFirstCombo = comboAction === horizontalJustDown;
            if (this._performSoftDropCombo(comboAction)) return;
        }

        if (this.input.isActionJustDown('hardDrop')) {
            this._hardDrop();
            return;
        }
        if (this.input.isActionJustDown('holdPiece')) {
            this._holdPiece();
            return;
        }

        // Structural Cartesian and Möbius retain their established projected
        // clockwise convention. Ordinary Cartesian now uses catalogue
        // chirality directly, so its screen-facing rotation needs no swap.
        const rotationDirection = (isStructuralMode(this.settings.mode) || this.settings.mode === 'mobius') ? -1 : 1;
        if (this.input.isActionJustDown('rotateClockwise')) this._rotatePiece(rotationDirection);
        if (this.input.isActionJustDown('rotateCounterClockwise')) this._rotatePiece(-rotationDirection);
        if (this.input.isActionJustDown('rotate180')) this._rotatePiece(2);

        if (horizontalJustDown && !horizontalPressUsedByDownFirstCombo) {
            this.lastHorizontalComboPress = {
                action: horizontalJustDown,
                piece: this.currentPiece,
                time: now,
            };
        }
        this._updateHorizontalMovement(elapsedMs);
        this._updateSoftDrop(elapsedMs);
        this._updateGravityAndLock(elapsedMs);
    }

    _comboActionJustPressed() {
        return [
            'moveClockwise',
            'moveCounterClockwise',
            'rotateClockwise',
            'rotateCounterClockwise',
            'rotate180',
            'hardDrop',
            'holdPiece',
        ].find(action => this.input.isActionJustDown(action)) || null;
    }

    _horizontalActionJustPressed() {
        if (this.input.isActionJustDown('moveClockwise')) return 'moveClockwise';
        if (this.input.isActionJustDown('moveCounterClockwise')) return 'moveCounterClockwise';
        return null;
    }

    _recentHorizontalComboAction(now) {
        const pending = this.lastHorizontalComboPress;
        if (!pending || pending.piece !== this.currentPiece || !(this.settings.comboTime > 0)) return null;
        const age = now - pending.time;
        return age >= 0 && age < this.settings.comboTime ? pending.action : null;
    }

    _performHorizontalDropCombo(action) {
        const piece = this.currentPiece;
        if (!piece) return;
        this._clearHorizontal();
        this._slideToObstacle(this._logicalHorizontalDirection(action));
        const target = this._findGhostR(piece);
        if (target > piece.r) piece.r = target;
        this.gravityElapsed = 0;
        this.groundedElapsed = 0;
        this.softDropActive = false;
        this.softDropElapsed = 0;
        this.lastSoftDropPressTime = -Infinity;
        this.lastHorizontalComboPress = null;
        this.horizontalDropCombo = { piece, elapsed: 0 };
        this._markPieceGrounded();
        this._refreshPieceProjection();
    }

    _updateHorizontalDropCombo(elapsedMs) {
        const pending = this.horizontalDropCombo;
        if (!pending) return false;
        if (pending.piece !== this.currentPiece) {
            this.horizontalDropCombo = null;
            return false;
        }

        const action = this._horizontalActionJustPressed();
        if (action) {
            this.horizontalDropCombo = null;
            this.comboReleaseLock = { action, piece: this.currentPiece };
            this._startHorizontal(action, this._logicalHorizontalDirection(action));
            if (this.input.isActionJustUp(action) && this.comboReleaseLock) {
                this.comboReleaseLock = null;
                this._lockPiece();
            }
            return true;
        }

        pending.elapsed += elapsedMs;
        if (pending.elapsed >= this.settings.comboTime) {
            this.horizontalDropCombo = null;
            this._lockPiece();
        }
        return true;
    }

    _performSoftDropCombo(action) {
        if (!this.currentPiece) return false;
        const target = this._findGhostR(this.currentPiece);
        if (target > this.currentPiece.r) {
            this.currentPiece.r = target;
            this.gravityElapsed = 0;
            this.groundedElapsed = 0;
            this._refreshPieceProjection();
        }
        this._markPieceGrounded();
        this.softDropActive = false;
        this.softDropElapsed = 0;
        this.lastSoftDropPressTime = -Infinity;

        const isHorizontal = action === 'moveClockwise' || action === 'moveCounterClockwise';
        if (!isHorizontal) return false;

        if (this.settings.comboMode === 'auto-slide-lock') {
            this._slideToObstacle(this._logicalHorizontalDirection(action));
            this._lockPiece();
            return true;
        }

        // Keep moving with normal DAS/ARR while held, but remember exactly
        // which piece initiated the combo. If its regular floor lock delay wins
        // first, _lockPiece clears this token and the newly spawned piece is safe.
        this.comboReleaseLock = { action, piece: this.currentPiece };
        // A very quick tap can place keydown and keyup in the same rendered
        // frame. Do not lose that release edge and leave the piece waiting.
        if (this.input.isActionJustUp(action)) {
            // The ordinary path performs one responsive move on keydown before
            // waiting for DAS. Preserve that move even when both edges arrived
            // between two frames.
            this._movePiece(0, this._logicalHorizontalDirection(action));
            if (this.comboReleaseLock) {
                this.comboReleaseLock = null;
                this._lockPiece();
                return true;
            }
            return true;
        }
        return false;
    }

    _updateComboReleaseLock() {
        const pending = this.comboReleaseLock;
        if (!pending) return false;
        if (this.currentPiece !== pending.piece) {
            this.comboReleaseLock = null;
            return false;
        }
        if (!this.input.isActionJustUp(pending.action)) return false;
        if (this._isValidState(
            this.currentPiece,
            this.currentPiece.r + 1,
            this.currentPiece.phi,
            this.currentPiece.rotation,
        )) {
            this.comboReleaseLock = null;
            this.groundedElapsed = 0;
            this.gravityElapsed = Math.max(this.gravityElapsed, this.gameSpeed);
            this.pieceGrounded = false;
            return false;
        }
        this.comboReleaseLock = null;
        this._lockPiece();
        return true;
    }

    _logicalHorizontalDirection(action) {
        // The original display maps the left/right labels oppositely in the
        // rectangular and Möbius projections. Mechanics below stay shared.
        const legacyFlip = (isCartesianMode(this.settings.mode) || this.settings.mode === 'mobius') ? -1 : 1;
        return action === 'moveClockwise' ? legacyFlip : -legacyFlip;
    }

    _slideToObstacle(direction) {
        const piece = this.currentPiece;
        if (!piece || !direction) return;
        // A wrapped empty row has no wall. One complete traversal is therefore
        // the deterministic maximum; it returns to the same logical field.
        for (let step = 0; step < this.columns; step++) {
            const nextPhi = isCartesianMode(this.settings.mode)
                ? piece.phi + direction
                : positiveModulo(piece.phi + direction, this.columns);
            if (!this._isValidState(piece, piece.r, nextPhi, piece.rotation)) break;
            piece.phi = nextPhi;
        }
        this._refreshPieceProjection();
    }

    _updateHorizontalMovement(elapsedMs) {
        if (this.input.isActionJustDown('moveClockwise')) {
            this._startHorizontal('moveClockwise', this._logicalHorizontalDirection('moveClockwise'));
        } else if (this.input.isActionJustDown('moveCounterClockwise')) {
            this._startHorizontal('moveCounterClockwise', this._logicalHorizontalDirection('moveCounterClockwise'));
        }

        if (!this.horizontal.action) return;
        if (!this.input.isActionDown(this.horizontal.action)) {
            this._clearHorizontal();
            return;
        }

        this.horizontal.elapsed += elapsedMs;
        if (!this.horizontal.repeating) {
            if (this.horizontal.elapsed < this.settings.das) return;
            this.horizontal.repeating = true;
            this.horizontal.repeatElapsed = this.horizontal.elapsed - this.settings.das;
            this._movePiece(0, this.horizontal.direction);
        } else {
            this.horizontal.repeatElapsed += elapsedMs;
        }

        const multiplier = this.input.isActionDown('quickMotion') && this.settings.quickMotionMultiplier > 0
            ? this.settings.quickMotionMultiplier
            : 1;
        // ARR=0 intentionally means "as fast as the per-frame safety budget
        // allows". Avoid 0/0 when a disabled quick multiplier is selected.
        const interval = this.settings.arr === 0 ? 0 : this.settings.arr / multiplier;
        let steps = 0;
        while (this.horizontal.repeatElapsed >= interval && steps++ < MAX_UPDATE_STEPS) {
            this.horizontal.repeatElapsed -= interval;
            this._movePiece(0, this.horizontal.direction);
        }
    }

    _startHorizontal(action, direction) {
        this.horizontal.action = action;
        this.horizontal.direction = direction;
        this.horizontal.elapsed = 0;
        this.horizontal.repeatElapsed = 0;
        this.horizontal.repeating = false;
        this._movePiece(0, direction);
    }

    _clearHorizontal() {
        this.horizontal.action = null;
        this.horizontal.direction = 0;
        this.horizontal.elapsed = 0;
        this.horizontal.repeatElapsed = 0;
        this.horizontal.repeating = false;
    }

    _updateSoftDrop(elapsedMs) {
        if (!this.softDropActive) return;
        if (!this.input.isActionDown('softDrop')) {
            this.softDropActive = false;
            this.softDropElapsed = 0;
            this.lastSoftDropPressTime = -Infinity;
            return;
        }
        const interval = this.settings.softDropSpeed > 0
            ? this.gameSpeed / this.settings.softDropSpeed
            : Infinity;
        this.softDropElapsed += elapsedMs;
        let steps = 0;
        while (this.softDropElapsed >= interval && steps++ < MAX_UPDATE_STEPS) {
            this.softDropElapsed -= interval;
            if (!this._stepDown(true)) {
                this.softDropActive = false;
                this.softDropElapsed = 0;
                break;
            }
        }
    }

    _updateGravityAndLock(elapsedMs) {
        if (!this.currentPiece) return;
        if (!this.softDropActive) {
            this.gravityElapsed += elapsedMs;
            let steps = 0;
            // A zero initial speed is an intentional fastest-drop profile.
            // The step cap is the finite-time guard that replaces a positive
            // interval in that case.
            while (this.gravityElapsed >= this.gameSpeed && steps++ < MAX_UPDATE_STEPS) {
                this.gravityElapsed -= this.gameSpeed;
                if (!this._stepDown(false)) {
                    this.gravityElapsed = 0;
                    break;
                }
            }
        }

        if (!this.currentPiece) return;
        if (this._isValidState(this.currentPiece, this.currentPiece.r + 1, this.currentPiece.phi, this.currentPiece.rotation)) {
            this.pieceGrounded = false;
            this.groundedElapsed = 0;
        } else {
            this._markPieceGrounded();
            this.groundedElapsed += elapsedMs;
            if (this.groundedElapsed >= this.lockDelay) this._lockPiece();
        }
    }

    _stepDown(addScore) {
        if (!this._movePiece(1, 0)) return false;
        if (addScore) {
            this.score += 1;
            this._updateHighValues();
        }
        return true;
    }

    _resetRepeats() {
        this._clearHorizontal();
        this.comboReleaseLock = null;
        this.lastHorizontalComboPress = null;
        this.horizontalDropCombo = null;
        this.softDropActive = false;
        this.softDropElapsed = 0;
        this.lastSoftDropPressTime = -Infinity;
    }

    _fillQueue() {
        while (this.nextPieces.length < this.settings.nextPreviewCount + 1) {
            const entry = this.sampler.sample();
            if (!entry) break;
            this.nextPieces.push(entry.index);
        }
    }

    _takeNextPiece() {
        this._fillQueue();
        const index = this.nextPieces.shift();
        this._fillQueue();
        return index === undefined ? null : POLYOMINO_CATALOG.all[index];
    }

    _spawnPiece(entry = null) {
        if (this.state !== 'playing') return;
        const next = entry || this._takeNextPiece();
        if (!next) {
            this._gameOver();
            return;
        }
        const geometry = getPieceGeometry(next);
        const piece = {
            entry: next,
            r: -geometry.maxBaseR,
            phi: Math.floor(this.columns / 2),
            rotation: 0,
        };
        this.currentPiece = piece;
        this.gravityElapsed = 0;
        this.groundedElapsed = 0;
        this.pieceGrounded = false;
        this.mobiusViewPhi = piece.phi;
        this._refreshPieceProjection();
        if (!this._isValidState(piece, piece.r, piece.phi, piece.rotation)) this._gameOver();
    }

    _blocksFor(piece, r = piece.r, phi = piece.phi, rotation = piece.rotation) {
        const offsets = getPieceGeometry(piece.entry).rotations[positiveModulo(rotation, 4)];
        const wrapped = !isCartesianMode(this.settings.mode);
        return offsets.map(offset => {
            // Ordinary Cartesian play uses the same catalogue chirality as
            // HOLD/NEXT and the non-Cartesian projections. The old negation
            // mirrored every one-sided polyomino but retained its colour.
            // Structural Cartesian keeps its established physical convention.
            const rawPhi = this.settings.mode === 'rectangular'
                ? phi + offset.phi
                : phi - offset.phi;
            return {
                r: r + offset.r,
                phi: wrapped ? positiveModulo(rawPhi, this.columns) : rawPhi,
            };
        });
    }

    _isValidState(piece, r, phi, rotation) {
        const seen = new Set();
        for (const block of this._blocksFor(piece, r, phi, rotation)) {
            if (block.r >= this.rows) return false;
            if (!this._allowsOverhang() && (block.phi < 0 || block.phi >= this.columns)) return false;
            const key = `${block.r},${block.phi}`;
            if (seen.has(key)) return false;
            seen.add(key);
            if (block.r >= 0 && this._cellAt(block.r, block.phi) !== 0) return false;
        }
        return true;
    }

    _movePiece(dr, dphi) {
        if (!this.currentPiece || this.lineClear || this.state !== 'playing') return false;
        const piece = this.currentPiece;
        const nextR = piece.r + dr;
        const nextPhi = isCartesianMode(this.settings.mode)
            ? piece.phi + dphi
            : positiveModulo(piece.phi + dphi, this.columns);
        if (!this._isValidState(piece, nextR, nextPhi, piece.rotation)) return false;
        piece.r = nextR;
        piece.phi = nextPhi;
        if (dr === 0 && dphi !== 0) this._endReleaseLockIfAirborne();
        this._refreshPieceProjection();
        return true;
    }

    _endReleaseLockIfAirborne() {
        const pending = this.comboReleaseLock;
        const piece = this.currentPiece;
        if (!pending || pending.piece !== piece) return false;
        if (!this._isValidState(piece, piece.r + 1, piece.phi, piece.rotation)) return false;

        // Once a lateral combo movement leaves its support, releasing the
        // arrow must no longer lock the piece in mid-air. Resume ordinary
        // gravity immediately, including a fall step in this same update.
        this.comboReleaseLock = null;
        this.groundedElapsed = 0;
        this.gravityElapsed = Math.max(this.gravityElapsed, this.gameSpeed);
        this.pieceGrounded = false;
        return true;
    }

    _rotatePiece(amount) {
        const piece = this.currentPiece;
        if (!piece || !getPieceGeometry(piece.entry).rotates || this.lineClear) return false;
        const nextRotation = positiveModulo(piece.rotation + amount, 4);

        if (isCartesianMode(this.settings.mode) && !this._allowsOverhang()) {
            const unshiftedBlocks = this._blocksFor(piece, piece.r, piece.phi, nextRotation);
            const minimumPhi = Math.min(...unshiftedBlocks.map(block => block.phi));
            const maximumPhi = Math.max(...unshiftedBlocks.map(block => block.phi));
            let wallShift = 0;
            if (minimumPhi < 0) wallShift = -minimumPhi;
            else if (maximumPhi >= this.columns) wallShift = this.columns - 1 - maximumPhi;

            // A wall-blocked rotation gets exactly the smallest translation
            // away from that wall. If a settled piece blocks that one precise
            // candidate, the rotation stays blocked; no unrelated kick is
            // allowed to route around the obstacle.
            if (wallShift !== 0) {
                const testPhi = piece.phi + wallShift;
                if (!this._isValidState(piece, piece.r, testPhi, nextRotation)) return false;
                piece.phi = testPhi;
                piece.rotation = nextRotation;
                this._refreshPieceProjection();
                return true;
            }
        }

        const baseKicks = Math.abs(amount) === 2 ? HALF_TURN_KICKS : STANDARD_KICKS;
        for (const baseKick of baseKicks) {
            const kickPhi = Math.abs(amount) === 2 ? baseKick.phi : baseKick.phi * Math.sign(amount || 1);
            const testR = piece.r + baseKick.r;
            const testPhi = isCartesianMode(this.settings.mode)
                ? piece.phi + kickPhi
                : positiveModulo(piece.phi + kickPhi, this.columns);
            if (!this._isValidState(piece, testR, testPhi, nextRotation)) continue;
            piece.r = testR;
            piece.phi = testPhi;
            piece.rotation = nextRotation;
            this._refreshPieceProjection();
            return true;
        }
        return false;
    }

    _findGhostR(piece) {
        let r = piece.r;
        let steps = 0;
        while (steps++ < this.rows * 2 && this._isValidState(piece, r + 1, piece.phi, piece.rotation)) r++;
        return r;
    }

    _refreshPieceProjection() {
        if (this.currentPiece) {
            this.ghostR = this._findGhostR(this.currentPiece);
            this.mobiusViewPhi = this.currentPiece.phi;
        }
        this.invalidate();
    }

    _markPieceGrounded() {
        const piece = this.currentPiece;
        if (!piece || this.pieceGrounded) return false;
        if (this._isValidState(piece, piece.r + 1, piece.phi, piece.rotation)) return false;
        this.pieceGrounded = true;
        this.audio?.playTetrisLanding?.(this.settings.sfxVolume * TETRIS_AUDIO.landingGain);
        return true;
    }

    _playLockSound() {
        this.audio?.playTetrisLock?.(this.settings.sfxVolume * TETRIS_AUDIO.lockGain);
    }

    _hardDrop() {
        if (!this.currentPiece) return;
        this.currentPiece.r = this._findGhostR(this.currentPiece);
        this._markPieceGrounded();
        this._refreshPieceProjection();
        this._lockPiece();
    }

    _holdPiece() {
        if (!this.currentPiece || !this.canHold) return;
        const outgoingIndex = this.currentPiece.entry.index;
        let incoming;
        if (this.heldPieceIndex === null) {
            this.heldPieceIndex = outgoingIndex;
            incoming = this._takeNextPiece();
        } else {
            incoming = POLYOMINO_CATALOG.all[this.heldPieceIndex];
            this.heldPieceIndex = outgoingIndex;
        }
        this.canHold = false;
        this.currentPiece = null;
        this._spawnPiece(incoming);
    }

    _lockPiece() {
        const piece = this.currentPiece;
        if (!piece || this.lineClear) return;
        const blocks = this._blocksFor(piece);
        if (blocks.some(block => block.r < 0 || block.r >= this.rows || (!this._allowsOverhang() && (block.phi < 0 || block.phi >= this.columns)))) {
            this._gameOver();
            return;
        }
        if (this._isValidState(piece, piece.r + 1, piece.phi, piece.rotation)) {
            this.comboReleaseLock = null;
            this.horizontalDropCombo = null;
            this.pieceGrounded = false;
            this.groundedElapsed = 0;
            this.gravityElapsed = Math.max(this.gravityElapsed, this.gameSpeed);
            return;
        }
        if (this._allowsOverhang() && blocks.every(block => block.phi < 0 || block.phi >= this.columns)
            && blocks.every(block => !this._cellAt(block.r + 1, block.phi))) {
            // A purely vertical miss leaves the grid just like an unsupported
            // fragment; it never creates a fictitious floor or a loss event.
            this.currentPiece = null;
            this._resetRepeats();
            this._completeLineClear(0);
            return;
        }
        this._markPieceGrounded();
        const storedValue = piece.entry.index + 1;
        const structuralBodyId = this.pieceIdentityGrid ? this.nextStructuralBodyId++ : 0;
        this.lockedOutlinePath = null;
        for (const block of blocks) {
            if (this._cellAt(block.r, block.phi) !== 0) {
                this._gameOver();
                return;
            }
            if (block.phi < 0 || block.phi >= this.columns) {
                this.overhangGrid.set(`${block.r},${block.phi}`, { row: block.r, column: block.phi, value: storedValue, bodyId: structuralBodyId });
            } else {
                this.grid[block.r][block.phi] = storedValue;
                const identities = this.structuralBodyGrid || this.pieceIdentityGrid;
                if (identities) identities[block.r][block.phi] = structuralBodyId;
            }
        }
        this._playLockSound();
        this.currentPiece = null;
        this._resetRepeats();

        this._refreshRockingMass();
        const fullRows = rowsToCollapse(this._lockedCells(), this.rows, this.columns,
            this.settings.mode, this.structuralPhysics?.blockMassKg || 1, this.settings.rockingCollapseMassKg);

        if (fullRows.length) {
            this.lineClear = {
                rows: fullRows,
                rowSet: new Set(fullRows),
                elapsed: 0,
                phase: 0,
                flashOn: true,
            };
            this.invalidate();
        } else {
            this._completeLineClear(0);
        }
    }

    _updateLineClear(elapsedMs) {
        const animation = this.lineClear;
        if (!animation) return;
        animation.elapsed += elapsedMs;
        const stepDuration = this.settings.lineClearDuration;
        if (!(stepDuration > 0)) {
            this._finishLineClearAnimation(animation);
            return;
        }
        while (animation.elapsed >= stepDuration) {
            animation.elapsed -= stepDuration;
            animation.phase++;
            if (animation.phase >= 4) {
                this._finishLineClearAnimation(animation);
                return;
            }
            animation.flashOn = animation.phase % 2 === 0;
            this.invalidate();
        }
    }

    _finishLineClearAnimation(animation) {
        const count = animation.rows.length;
        const remaining = this.grid.filter((_row, index) => !animation.rowSet.has(index));
        const empty = Array.from({ length: count }, () => new Int32Array(this.columns));
        this.grid = [...empty, ...remaining];
        if (this.structuralBodyGrid) {
            const remainingBodies = this.structuralBodyGrid.filter((_row, index) => !animation.rowSet.has(index));
            const emptyBodies = Array.from({ length: count }, () => new Int32Array(this.columns));
            this.structuralBodyGrid = [...emptyBodies, ...remainingBodies];
            const shifted = new Map();
            for (const cell of this.overhangGrid?.values() || []) {
                if (animation.rowSet.has(cell.row)) continue;
                const row = cell.row + animation.rows.filter(r => r > cell.row).length;
                shifted.set(`${row},${cell.column}`, { ...cell, row });
            }
            this.overhangGrid = shifted;
            const frame = this._structuralFrame();
            const split = splitDisconnectedBodies(frame.grid, this.nextStructuralBodyId);
            for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.columns; c++) this.structuralBodyGrid[r][c] = split.bodyGrid[r][c - frame.minColumn];
            for (const cell of this.overhangGrid.values()) cell.bodyId = split.bodyGrid[cell.row][cell.column - frame.minColumn];
            this.nextStructuralBodyId = split.nextBodyId;
        }
        if (this.structuralBodyGrid) this.pieceIdentityGrid = this.structuralBodyGrid;
        else if (this.pieceIdentityGrid) {
            const remaining = this.pieceIdentityGrid.filter((_row, index) => !animation.rowSet.has(index));
            const split = splitDisconnectedBodies([...Array.from({ length: count }, () => new Int32Array(this.columns)), ...remaining], this.nextStructuralBodyId);
            this.pieceIdentityGrid = split.bodyGrid;
            this.nextStructuralBodyId = split.nextBodyId;
        }
        this.lockedOutlinePath = null;
        this.lineClear = null;
        this._completeLineClear(count);
    }

    _completeLineClear(count) {
        if (count > 0) {
            const points = [0, 100, 300, 500, 800];
            this.linesCleared += count;
            this.score += points[Math.min(count, 4)] || 800;
            this.level = Math.floor(this.linesCleared / 10) + 1;
            // Zero is a valid constant-speed profile.  Keep the historical
            // percentage semantics for non-zero values, but use a neutral
            // factor for zero instead of creating a zero timer interval.
            const speedFactor = this.settings.speedIncrease === 0
                ? 1
                : this.settings.speedIncrease / 100;
            this.gameSpeed = this.settings.initialSpeed * speedFactor ** (this.level - 1);
            this.lockDelay = this.settings.initialLockDelay
                * (this.settings.lockDelayDecrease / 100) ** (this.level - 1);
            this._updateHighValues();
            this._saveLegacyHighScores();
        }
        this.canHold = true;
        if (this.settings.ruleMode === 'sprint' && this.linesCleared >= this.settings.sprintLines) {
            this._finishSprint(); return;
        }
        this._refreshRockingMass();
        if (this._beginStructuralToppleIfNeeded()) {
            this.invalidate();
            return;
        }
        if (this.state === 'playing') this._spawnPiece();
        this.invalidate();
    }

    _storeLockedCell(cell, erase = false) {
        this.lockedOutlinePath = null;
        const { row, column, value, bodyId } = cell;
        if (column < 0 || column >= this.columns) {
            if (erase) this.overhangGrid.delete(`${row},${column}`);
            else this.overhangGrid.set(`${row},${column}`, { ...cell });
        } else if (row >= 0 && row < this.rows) {
            this.grid[row][column] = erase ? 0 : value;
            this.structuralBodyGrid[row][column] = erase ? 0 : bodyId;
        }
    }

    _beginGridFallIfNeeded(allowedIds = null) {
        const cells = this._lockedCells();
        const physics = allowedIds ? { ...this.structuralPhysics, wallFriction: 0, pieceFriction: 0 } : this.structuralPhysics;
        const ids = findGridFallBodies(cells, this.rows, this.columns, physics);
        if (allowedIds) for (const id of ids) if (!allowedIds.has(id)) ids.delete(id);
        if (!ids.size) return false;
        const bodies = new Map();
        for (const cell of cells) if (ids.has(cell.bodyId)) {
            if (!bodies.has(cell.bodyId)) bodies.set(cell.bodyId, []);
            bodies.get(cell.bodyId).push({ ...cell });
            this._storeLockedCell(cell, true);
        }
        this.gridFalling = { bodies: [...bodies.values()], elapsed: 0, resumePiece: this.currentPiece };
        this.currentPiece = null;
        this.state = 'settling-grid';
        this._refreshRockingMass();
        this._checkStructuralEquilibrium();
        this.invalidate();
        return true;
    }

    _updateGridFalling(dt) {
        const falling = this.gridFalling;
        if (!falling) return;
        if (this.rocking) this._updateRocking(dt);
        if (this.state === 'toppling') return;
        falling.elapsed += dt * 1000;
        const interval = Math.max(1, this.gameSpeed);
        let iterations = 0;
        while (falling.elapsed >= interval && iterations++ < MAX_UPDATE_STEPS) {
            falling.elapsed -= interval;
            falling.bodies.sort((a, b) => Math.max(...b.map(c => c.row)) - Math.max(...a.map(c => c.row)));
            const remaining = [];
            for (const cells of falling.bodies) {
                const lands = cells.some(c => (c.row + 1 >= this.rows && c.column >= 0 && c.column < this.columns)
                    || this._cellAt(c.row + 1, c.column));
                if (lands) for (const cell of cells) this._storeLockedCell(cell);
                else {
                    for (const cell of cells) cell.row++;
                    // An entirely unsupported overhang simply leaves the board.
                    if (cells.some(c => c.row < this.rows)) remaining.push(cells);
                }
            }
            falling.bodies = remaining;
            this._refreshRockingMass();
            this.invalidate();
            if (this._checkStructuralEquilibrium()) return;
            if (!remaining.length) {
                this.gridFalling = null;
                this.state = 'playing';
                this.currentPiece = falling.resumePiece;
                const fullRows = rowsToCollapse(this._lockedCells(), this.rows, this.columns,
                    this.settings.mode, this.structuralPhysics.blockMassKg, this.settings.rockingCollapseMassKg);
                if (fullRows.length) {
                    this.currentPiece = null;
                    this.lineClear = { rows: fullRows, rowSet: new Set(fullRows), elapsed: 0, phase: 0, flashOn: true };
                } else if (!this._beginStructuralToppleIfNeeded()) {
                    if (this.currentPiece) this._refreshPieceProjection();
                    else this._spawnPiece();
                }
                return;
            }
        }
    }

    _beginStructuralToppleIfNeeded() {
        if (!this.structuralBodyGrid || this.state !== 'playing') return false;
        if (this._beginGridFallIfNeeded()) return true;
        return this._checkStructuralEquilibrium();
    }

    _checkStructuralEquilibrium() {
        if (this.recoveryGraceSeconds > 0) return false;
        const frame = this._structuralFrame();
        this.structuralAnalysis = analyzeStructuralStability(frame.grid, frame.physics);
        const instability = this.structuralAnalysis.instability;
        if (!instability) return false;
        // A wall coefficient alone cannot hold an unloaded vertical face.
        // Let the solver certify such a pure descent before overriding the
        // conservative friction-aware support search.
        if (this.state === 'playing' && instability.reason === 'unsupported' && instability.bodyMotions) {
            const descending = new Set(instability.bodyMotions.filter(body => Math.abs(body.vx) < 1e-9
                && Math.abs(body.omega) < 1e-9 && body.vy > 1e-9).map(body => body.bodyId));
            if (descending.size && this._beginGridFallIfNeeded(descending)) return true;
        }
        return this._beginCollapse(instability.reason || 'topple');
    }

    _beginCollapse(reason = 'topple') {
        this.collapseResumePiece = this.gridFalling?.resumePiece || this.currentPiece;
        const cells = this._lockedCells().concat(this.gridFalling?.bodies.flat() || []);
        this.collapseDiagnostic = { version: 1, startedAt: new Date().toISOString(), reason,
            cells, rows: this.rows, columns: this.columns, physics: this.structuralPhysics,
            rockingShape: this.rockingShape, rockingState: this.rocking ? { ...this.rocking } : null,
            rollingFriction: this.settings.rockingRollingFriction,
            recoveryTolerance: this.settings.structuralRecoveryTolerance,
            frame: this.structuralAnalysis?.physics?.frame,
            virtualWork: this.structuralAnalysis?.virtualWork,
            instability: this.structuralAnalysis?.instability };
        this._recordCollapseDiagnostic('simulating');
        this.recoveryRest = null;
        this.collapseSimulation = createCollapseSimulation({
            cells, rows: this.rows, columns: this.columns, physics: this.structuralPhysics,
            rockingShape: this.rockingShape, rockingState: this.rocking,
            rollingFriction: this.settings.rockingRollingFriction,
            // Duration alone never proves collapse. Keep integrating until
            // relative rest has lasted through the platform's oscillation.
            maxSeconds: null, stopWhenSettled: false,
        });
        this.collapseSnapshot = this.collapseSimulation.snapshot();
        this.toppling = { bodyIds: [...new Set(cells.map(c => c.bodyId))],
            bodyIdSet: new Set(cells.map(c => c.bodyId)), reason, elapsed: 0 };
        this.gridFalling = null;
        this.state = 'toppling';
        this.currentPiece = null;
        this.lineClear = null;
        this._resetRepeats();
        this.invalidate();
        return true;
    }

    _updateToppling(dt, checkNow = false) {
        if (!this.collapseSimulation) return;
        this.collapseSnapshot = this.collapseSimulation.step(dt)
            || this.collapseSimulation.snapshot();
        this.toppling.elapsed = this.collapseSnapshot.elapsed;
        if (this.rocking) this._rebuildProjectionCache();
        this.invalidate();
        this.recoveryRest = observeRecoveryRest(this.collapseSnapshot, this.recoveryRest, this.structuralPhysics.cellSizeMeters);
        if (this.recoveryRest?.ready || checkNow) {
            if (this.collapseDiagnostic) {
                this.collapseDiagnostic.manualCheck = checkNow;
            }
            const recovered = recoverGrid({ snapshot: this.collapseSnapshot,
                rows: this.rows, columns: this.columns,
                cellSizeMeters: this.structuralPhysics.cellSizeMeters,
                epsilonCells: this.settings.structuralRecoveryTolerance,
                allowOverhang: this._allowsOverhang(), rockingShape: this.rockingShape });
            if (this._prepareGridRecovery(recovered)) return;
            this._recordCollapseDiagnostic(checkNow ? 'manual-check-outside-grid'
                : 'rested-outside-grid');
            this._gameOver(this.toppling.reason === 'platform' ? 'platform' : 'topple');
        }
    }

    _recordCollapseDiagnostic(outcome) {
        if (!this.collapseDiagnostic || !globalThis.api?.writeTetrisPhysicsDiagnostic) return;
        void globalThis.api.writeTetrisPhysicsDiagnostic({ ...this.collapseDiagnostic, outcome,
            finalSnapshot: outcome === 'simulating' ? null : this.collapseSnapshot,
            rest: outcome === 'simulating' ? null : this.recoveryRest,
        }).catch(error => console.warn('Could not save Tetris physics diagnostic:', error));
    }

    _advanceSprintClock(now = performance.now()) {
        if (this.settings?.ruleMode !== 'sprint' || ['gameover', 'won', 'mode-select'].includes(this.state)) return;
        if (this.sprintTick !== null && this.sprintTick !== undefined) this.sprintElapsed += (now - this.sprintTick) / 1000;
        this.sprintTick = now;
        this.invalidate();
    }

    _finishSprint() {
        if (this.state === 'won') return;
        this._advanceSprintClock();
        this.state = 'won'; this.sprintTick = null; this.currentPiece = null;
        this._resetRepeats();
        this.bestSprintSeconds = this.bestSprintSeconds === null ? this.sprintElapsed : Math.min(this.bestSprintSeconds, this.sprintElapsed);
        if (!this.scoreSubmitted) {
            this.scoreSubmitted = true;
            this.submitScore({ completed: true, timeSeconds: this.sprintElapsed, lines: this.linesCleared,
                targetLines: this.settings.sprintLines, ruleMode: 'sprint', mode: this.settings.mode,
                settingsKey: settingsRecordKey(this.settings) });
        }
        this.invalidate();
    }

    _gameOver(reason = 'stack') {
        if (this.state === 'gameover') return;
        this.state = 'gameover';
        this.gameOverReason = reason;
        this._resetRepeats();
        this._updateHighValues();
        this._saveLegacyHighScores();
        this.invalidate();
        if (!this.scoreSubmitted && this.settings.ruleMode !== 'sprint') {
            this.scoreSubmitted = true;
            this.submitScore({
                score: this.score,
                lines: this.linesCleared,
                level: this.level,
                mode: this.settings.mode,
                settingsKey: settingsRecordKey(this.settings),
            });
        }
    }

    _updateHighValues() {
        if (this.settings.ruleMode === 'sprint') return;
        this.highScore = Math.max(this.highScore, this.score);
        this.highLines = Math.max(this.highLines, this.linesCleared);
        this.invalidate();
    }

    _legacyScoreStem() {
        if (isStructuralMode(this.settings.mode)) return settingsRecordKey(this.settings);
        return `${this.settings.mode}_${this.settings.initialSpeed}_${this.settings.speedIncrease}_${this.settings.initialLockDelay}_${this.settings.lockDelayDecrease}_${this.columns}_${this.rows}`;
    }

    _saveLegacyHighScores() {
        if (this.settings.ruleMode === 'sprint') return;
        try {
            const stem = this._legacyScoreStem();
            localStorage.setItem(`circularTetrisHighScore_${stem}`, String(this.highScore));
            localStorage.setItem(`circularTetrisHighLines_${stem}`, String(this.highLines));
        } catch (error) {
            console.warn('Could not save ReRoMo Tetris high scores:', error);
        }
    }

    async _loadHighScores(runToken) {
        try {
            const key = settingsRecordKey(this.settings);
            const records = await this.app.records.getRecords(GAME_ID);
            if (runToken !== this._runToken) return;
            if (this.settings.ruleMode === 'sprint') {
                const times = records.filter(record => record.results?.settingsKey === key && record.results?.completed
                    && Number.isFinite(record.results.timeSeconds)).map(record => record.results.timeSeconds);
                this.bestSprintSeconds = times.length ? Math.min(...times) : null;
                this.invalidate(); return;
            }
            for (const record of records) {
                if (record.results?.settingsKey !== key) continue;
                this.highScore = Math.max(this.highScore, Number(record.results.score) || 0);
                this.highLines = Math.max(this.highLines, Number(record.results.lines) || 0);
            }

            // Read the standalone prototype's keys when it shares this browser profile.
            const legacyStem = this._legacyScoreStem();
            this.highScore = Math.max(this.highScore,
                Number(localStorage.getItem(`circularTetrisHighScore_${legacyStem}`)) || 0);
            this.highLines = Math.max(this.highLines,
                Number(localStorage.getItem(`circularTetrisHighLines_${legacyStem}`)) || 0);
            this.invalidate();
        } catch (error) {
            console.warn('Could not load ReRoMo Tetris records:', error);
        }
    }

    _cartesianSceneBounds() {
        const s = this.structuralPhysics?.cellSizeMeters || 1;
        const pose = this.collapseSnapshot?.platform || (this.rocking
            ? { ...rockingKinematics(this.rockingShape, this.rocking), angle: this.rocking.angle }
            : { x: 0, y: 0, angle: 0 });
        const ct = Math.cos(pose.angle), st = Math.sin(pose.angle);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        const include = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
        const local = (x, y) => include(pose.x / s + ct * x - st * y, pose.y / s + st * x + ct * y);
        for (const x of [-this.columns / 2, this.columns / 2]) for (const y of [-this.rows, 0]) local(x, y);
        if (this.rockingShape) {
            const shape = this.rockingShape;
            for (let i = 0; i <= DRAWING.platformArcSamples; i++) {
                const a = -shape.halfAngle + 2 * shape.halfAngle * i / DRAWING.platformArcSamples;
                local(shape.radius * Math.sin(a) / s, (shape.radius * Math.cos(a) - shape.d) / s);
            }
            include(0, shape.sag / s);
        }
        for (const cell of this.overhangGrid?.values() || []) for (const dx of [0, 1]) for (const dy of [0, 1])
            local(cell.column + dx - this.columns / 2, cell.row + dy - this.rows);
        for (const body of this.collapseSnapshot?.bodies || []) for (const cell of body.cells) {
            const c = Math.cos(body.angle), t = Math.sin(body.angle);
            for (const dx of [-s / 2, s / 2]) for (const dy of [-s / 2, s / 2])
                include((body.x + c * (cell.x + dx) - t * (cell.y + dy)) / s,
                    (body.y + t * (cell.x + dx) + c * (cell.y + dy)) / s);
        }
        return { minX, maxX, minY, maxY };
    }

    _calculateLayout(mode = this.settings.mode) {
        const margin = DRAWING.margin, gap = DRAWING.gap;
        const hudWidth = Math.min(DRAWING.hudWidth, Math.max(110, this.w * 0.24));
        const measure = size => this.ui?.measureLayout?.(size) || { leftWidth: 0, rightWidth: hudWidth + gap };
        const finish = (board, size) => {
            const reservations = measure(size);
            const placed = this.ui?.getLayoutWidgets ? computeWidgetLayout({ board,
                widgets: this.ui.getLayoutWidgets(), assignments: this.settings.widgetLayout, gap }) : {};
            return { ...placed, board, cellSize: size,
                hud: { x: board.x + board.width + gap, y: board.y,
                    width: Math.max(0, reservations.rightWidth - gap), height: board.height }, stacked: false };
        };
        const availableWidth = Math.max(1, this.w - 2 * margin - gap - hudWidth);
        const availableHeight = Math.max(1, this.h - 2 * margin);
        if (isRockingMode(mode) && this.rockingShape) {
            if (!this.rockingViewport) {
                const span = Math.max(this.columns, Number(this.settings.rockingFrameWidthCells) || this.columns);
                const heightCells = this.rows + this.rockingShape.sag / this.structuralPhysics.cellSizeMeters
                    + Math.max(0, Number(this.settings.rockingFrameHeadroomCells) || 0);
                let lo = 0.01, hi = (this.h - 2 * margin - 2 * FRAME_INSET) / heightCells;
                for (let i = 0; i < 20; i++) {
                    const mid = (lo + hi) / 2, reservation = measure(mid);
                    if (span * mid + reservation.leftWidth + reservation.rightWidth + 2 * FRAME_INSET > this.w - 2 * margin) hi = mid;
                    else lo = mid;
                }
                const reservation = measure(lo);
                this.rockingViewport = createRockingViewport({
                width: this.w, height: this.h, rows: this.rows, columns: this.columns,
                sag: this.rockingShape.sag / this.structuralPhysics.cellSizeMeters,
                frameWidth: this.settings.rockingFrameWidthCells,
                headroom: this.settings.rockingFrameHeadroomCells,
                leftWidth: reservation.leftWidth, rightWidth: reservation.rightWidth, margin, gap: 0,
                });
            }
            const board = rockingFrame(this.rockingViewport, this._cartesianSceneBounds());
            return finish(board, this.rockingViewport.scale);
        }
        const view = isCartesianMode(mode) ? this._cartesianSceneBounds() : null;
        const ratio = view ? (view.maxX - view.minX) / (view.maxY - view.minY) : 1;
        const previewSize = width => view ? width / (view.maxX - view.minX)
            : mode === 'circular' ? Math.max(1, width * 0.425 - FRAME_INSET) / this.rows
            : width / Math.max(this.rows, this.columns / 2);
        let lo = 0.01, hi = Math.min(this.w - 2 * margin, availableHeight * ratio);
        const upperReservation = measure(previewSize(hi));
        if (hi + upperReservation.leftWidth + upperReservation.rightWidth <= this.w - 2 * margin) lo = hi;
        for (let i = 0; i < 20 && lo < hi; i++) {
            const mid = (lo + hi) / 2, reservation = measure(previewSize(mid));
            if (mid + reservation.leftWidth + reservation.rightWidth > this.w - 2 * margin) hi = mid;
            else lo = mid;
        }
        const width = lo;
        const height = width / ratio;
        const reservation = measure(previewSize(width));
        const x = Math.max(margin + reservation.leftWidth, (this.w - width - reservation.leftWidth - reservation.rightWidth) / 2 + reservation.leftWidth);
        const y = Math.max(margin, (this.h - height) / 2);
        return finish({ x, y, width, height, size: Math.max(width, height), view }, previewSize(width));
    }

    _prepareGridRecovery(recovered) {
        if (!recovered) return false;
        const candidate = Object.create(this);
        candidate.grid = Array.from({ length: this.rows }, () => new Int32Array(this.columns));
        candidate.structuralBodyGrid = Array.from({ length: this.rows }, () => new Int32Array(this.columns));
        candidate.pieceIdentityGrid = candidate.structuralBodyGrid;
        candidate.overhangGrid = new Map();
        candidate.rocking = this.rocking ? { ...this.rocking, ...recovered.rockingState, alpha: 0, tipped: false } : null;
        for (const cell of recovered.cells) candidate._storeLockedCell(cell);
        candidate._refreshRockingMass();
        const frame = candidate._structuralFrame();
        const analysis = analyzeStructuralStability(frame.grid, frame.physics);
        // The completed physical trajectory and vertex alignment decide
        // recovery. A fresh static prediction must not relabel an intact
        // structure as already toppled.
        this.gridRecovery = { candidate, analysis, elapsed: 0 };
        this._recordCollapseDiagnostic('recovered');
        this.state = 'recovering';
        this.audio?.playTetrisRecovery?.(this.settings.sfxVolume * RECOVERY_EFFECT.soundGain);
        return true;
    }

    _updateGridRecovery(dt) {
        const recovery = this.gridRecovery;
        if (!recovery) return;
        recovery.elapsed += dt;
        this.invalidate();
        if (recovery.elapsed < RECOVERY_EFFECT.seconds) return;
        for (const key of ['grid', 'structuralBodyGrid', 'pieceIdentityGrid', 'overhangGrid', 'rocking', 'rockingMass']) this[key] = recovery.candidate[key];
        this.structuralAnalysis = recovery.analysis;
        this.recoveryGraceSeconds = RECOVERY_EFFECT.recheckDelaySeconds;
        this.gridRecovery = null;
        this.collapseSimulation = null;
        this.collapseSnapshot = null;
        this.toppling = null;
        this.lockedOutlinePath = null;
        this.state = 'playing';
        this.currentPiece = this.collapseResumePiece;
        this.collapseResumePiece = null;
        this._resetRepeats();
        if (this.currentPiece && !this._isValidState(this.currentPiece, this.currentPiece.r, this.currentPiece.phi, this.currentPiece.rotation)) {
            this._gameOver('stack');
            return;
        }
        const fullRows = rowsToCollapse(this._lockedCells(), this.rows, this.columns, this.settings.mode,
            this.structuralPhysics.blockMassKg, this.settings.rockingCollapseMassKg);
        if (fullRows.length) {
            this.currentPiece = null;
            this.lineClear = { rows: fullRows, rowSet: new Set(fullRows), elapsed: 0, phase: 0, flashOn: true };
        } else if (!this._beginStructuralToppleIfNeeded()) {
            if (this.currentPiece) this._refreshPieceProjection();
            else this._spawnPiece();
        }
        this._rebuildProjectionCache();
    }

    _renderRecoveryGlow() {
        const cache = this.projection?.rectangular;
        if (!cache || !this.gridRecovery) return;
        const ctx = this.ctx;
        const phase = Math.min(1, this.gridRecovery.elapsed / RECOVERY_EFFECT.seconds);
        ctx.save();
        if (this.rocking) {
            const pose = this.collapseSnapshot?.platform;
            const x = cache.x + cache.gridWidth / 2, y = cache.y + cache.gridHeight;
            const ppm = cache.cellSize / this.structuralPhysics.cellSizeMeters;
            ctx.translate(x + pose.x * ppm, y + pose.y * ppm);
            ctx.rotate(pose.angle); ctx.translate(-x, -y);
        }
        ctx.globalAlpha = Math.sin(Math.PI * phase) * 0.8;
        ctx.shadowColor = RECOVERY_EFFECT.glowColor;
        ctx.shadowBlur = RECOVERY_EFFECT.glowBlur;
        ctx.strokeStyle = RECOVERY_EFFECT.glowColor; ctx.lineWidth = 2;
        ctx.stroke(cache.gridPath);
        ctx.fillStyle = RECOVERY_EFFECT.glowColor;
        ctx.globalAlpha *= 0.16;
        ctx.fillRect(cache.x, cache.y, cache.gridWidth, cache.gridHeight);
        ctx.restore();
    }

    layoutPreview({ widthCells = this.columns, headroomCells = 0 } = {}) {
        if (!this.rockingShape) return null;
        const s = this.structuralPhysics.cellSizeMeters;
        const width = Math.max(this.columns, Number(widthCells) || this.columns);
        const transform = angle => {
            const pose = rockingKinematics(this.rockingShape, { angle, omega: 0, alpha: 0 });
            const c = Math.cos(angle), t = Math.sin(angle);
            return (x, y) => ({ x: pose.x / s + c * x - t * y, y: pose.y / s + t * x + c * y });
        };
        const cornersAt = angle => {
            const point = transform(angle);
            return [[-this.columns / 2, -this.rows], [this.columns / 2, -this.rows], [this.columns / 2, 0], [-this.columns / 2, 0]].map(([x, y]) => point(x, y));
        };
        let lo = 0, hi = this.rockingShape.halfAngle;
        for (let i = 0; i < 48; i++) {
            const mid = (lo + hi) / 2;
            if (Math.max(...cornersAt(mid).map(p => p.x)) > width / 2) hi = mid;
            else lo = mid;
        }
        const angle = lo, point = transform(angle), platformArc = [];
        for (let i = 0; i <= DRAWING.platformArcSamples; i++) {
            const a = -this.rockingShape.halfAngle + 2 * this.rockingShape.halfAngle * i / DRAWING.platformArcSamples;
            platformArc.push(point(this.rockingShape.radius * Math.sin(a) / s, (this.rockingShape.radius * Math.cos(a) - this.rockingShape.d) / s));
        }
        return { rows: this.rows, columns: this.columns, angle, gridCorners: cornersAt(angle), platformArc,
            groundY: this.rockingShape.sag / s,
            frameBounds: { minX: -width / 2, maxX: width / 2, minY: -this.rows - Math.max(0, Number(headroomCells) || 0), maxY: this.rockingShape.sag / s } };
    }

    _rebuildProjectionCache() {
        if (!this.canvas || this.w <= 0 || this.h <= 0) return;
        this.lockedOutlinePath = null;
        const buildToken = ++this._projectionBuildToken;
        this.layout = this._calculateLayout();
        const board = this.layout.board;
        const projection = { mode: this.settings.mode };
        this.projectionError = '';

        if (this.settings.mode === 'circular') {
            const centerX = board.x + board.size / 2;
            const centerY = board.y + board.size / 2;
            const innerRadius = Math.max(16, board.size * DRAWING.circularInnerRadiusRatio);
            const outerRadius = Math.max(1, board.size / 2 - FRAME_INSET);
            const radialStep = (outerRadius - innerRadius) / this.rows;
            const angularStep = TAU / this.columns;
            // Cell paths are created lazily only when a cell becomes visible.
            // A 256×256 empty board therefore starts as cheaply as a small one.
            const cells = new Array(this.rows * this.columns);
            const gridPath = new Path2D();
            for (let row = 0; row <= this.rows; row++) {
                gridPath.moveTo(centerX + innerRadius + row * radialStep, centerY);
                gridPath.arc(centerX, centerY, innerRadius + row * radialStep, 0, TAU);
            }
            for (let phi = 0; phi < this.columns; phi++) {
                const angle = phi * angularStep - Math.PI / 2;
                gridPath.moveTo(centerX + innerRadius * Math.cos(angle), centerY + innerRadius * Math.sin(angle));
                gridPath.lineTo(centerX + outerRadius * Math.cos(angle), centerY + outerRadius * Math.sin(angle));
            }
            projection.circular = {
                centerX,
                centerY,
                innerRadius,
                outerRadius,
                radialStep,
                angularStep,
                cells,
                gridPath,
            };
        } else if (isCartesianMode(this.settings.mode)) {
            // Keep a fractional cell size at high resolutions. Flooring used to
            // collapse sufficiently dense/small-window boards to zero pixels.
            const view = board.view;
            const camera = this.rocking ? this.rockingViewport : null;
            const cellSize = camera?.scale || Math.min(board.width / (view.maxX - view.minX), board.height / (view.maxY - view.minY));
            const gridWidth = cellSize * this.columns;
            const gridHeight = cellSize * this.rows;
            const x = camera ? camera.originX - this.columns / 2 * cellSize : board.x - (view.minX + this.columns / 2) * cellSize;
            const y = camera ? camera.originY - this.rows * cellSize : board.y - (view.minY + this.rows) * cellSize;
            const cells = new Array(this.rows * this.columns);
            const gridPath = new Path2D();
            for (let row = 0; row <= this.rows; row++) {
                const lineY = y + row * cellSize;
                gridPath.moveTo(x, lineY);
                gridPath.lineTo(x + gridWidth, lineY);
            }
            for (let phi = 0; phi <= this.columns; phi++) {
                const lineX = x + phi * cellSize;
                gridPath.moveTo(lineX, y);
                gridPath.lineTo(lineX, y + gridHeight);
            }
            projection.rectangular = { x, y, cellSize, gridWidth, gridHeight, cells, gridPath };

        } else {
            const key = this._mobiusProjectionKey(this.settings, board);
            if (preparedMobiusProjection?.key === key) {
                projection.mobius = preparedMobiusProjection.mesh;
                preparedMobiusProjection = null;
                this.projectionLoading = false;
                this.projectionProgress = 1;
                this.projection = projection;
                this.ui?.syncLayout(this.layout);
                this.invalidate();
                return;
            }
            preparedMobiusProjection = null;

            this.projection = null;
            this.projectionLoading = true;
            this.projectionProgress = 0;
            this.projectionLoadingMessage = 'Preparing Möbius grid…';
            this.ui?.syncLayout(this.layout);
            this.invalidate();
            void this._createMobiusProjection(
                this.settings,
                board,
                (fraction, message) => {
                    if (buildToken !== this._projectionBuildToken) return;
                    this.projectionProgress = fraction;
                    this.projectionLoadingMessage = message;
                    this.invalidate();
                },
                () => buildToken !== this._projectionBuildToken,
            ).then(mesh => {
                if (!mesh || buildToken !== this._projectionBuildToken) return;
                this.projection = { mode: 'mobius', mobius: mesh };
                this.projectionLoading = false;
                this.projectionProgress = 1;
                this.invalidate();
            }).catch(error => {
                if (buildToken !== this._projectionBuildToken) return;
                console.error('Could not prepare Möbius projection:', error);
                this.projectionLoading = false;
                this.projectionError = error?.message || String(error);
                this.invalidate();
            });
            return;
        }
        this.projectionLoading = false;
        this.projectionProgress = 1;
        this.projection = projection;
        this.ui?.syncLayout(this.layout);
        this.invalidate();
    }

    _mobiusProjectionKey(settings, board) {
        return [
            settings.rSegments,
            settings.phiSegments,
            DRAWING.mobiusSubdivisions,
            settings.mobiusGridOpacity,
            board.x,
            board.y,
            board.size,
        ].join(':');
    }

    async _createMobiusProjection(settings, board, onProgress = null, isCancelled = () => false) {
        const report = (fraction, message) => onProgress?.(Math.max(0, Math.min(1, fraction)), message);
        const template = await ensureMobiusTemplate({
            rows: settings.rSegments,
            columns: settings.phiSegments,
            subdivisions: DRAWING.mobiusSubdivisions,
            onProgress: (fraction, message) => report(fraction * 0.42, message),
        });
        if (isCancelled()) return null;

        const patchCount = template.drawOrder.length;
        const fittedBoard = fitMobiusTemplate(template, board);
        const patches = new Array(patchCount);
        const rawToSortedIndex = new Uint32Array(patchCount);
        let lastYield = performance.now();
        for (let sortedIndex = 0; sortedIndex < patchCount; sortedIndex++) {
            const rawIndex = template.drawOrder[sortedIndex];
            patches[sortedIndex] = makeMobiusPatch(template, rawIndex, fittedBoard);
            rawToSortedIndex[rawIndex] = sortedIndex;
            if (performance.now() - lastYield >= PROJECTION_YIELD_INTERVAL_MS) {
                report(
                    0.42 + 0.28 * (sortedIndex + 1) / patchCount,
                    `Building curved cells… ${Math.round((sortedIndex + 1) / patchCount * 100)}%`,
                );
                await yieldToBrowser();
                if (isCancelled()) return null;
                lastYield = performance.now();
            }
        }

        const gridPath = new Path2D();
        for (let physicalColumn = 0; physicalColumn < template.physicalColumns; physicalColumn++) {
            appendMobiusGridColumn(gridPath, template, physicalColumn, fittedBoard);
            if (performance.now() - lastYield >= PROJECTION_YIELD_INTERVAL_MS) {
                report(
                    0.7 + 0.1 * (physicalColumn + 1) / template.physicalColumns,
                    'Assembling the curved grid…',
                );
                await yieldToBrowser();
                if (isCancelled()) return null;
                lastYield = performance.now();
            }
        }

        const mesh = {
            cacheKey: this._mobiusProjectionKey(settings, board),
            x: board.x,
            y: board.y,
            size: board.size,
            rows: template.rows,
            columns: template.columns,
            paired: template.paired,
            physicalColumns: template.physicalColumns,
            traversalSpan: template.traversalSpan,
            subdivisions: template.subdivisions,
            logicalCellCount: template.rows * template.columns,
            projectedCellCount: patchCount,
            patches,
            rawToSortedIndex,
            gridPath,
            activePatchMarks: new Uint32Array(patchCount),
            activePatchGeneration: 0,
            activePatchIndices: [],
        };
        const cached = await this._cacheMobiusSurface(
            mesh,
            board,
            settings,
            (fraction, message) => report(0.8 + fraction * 0.2, message),
            isCancelled,
        );
        if (!cached || isCancelled()) return null;
        report(1, 'Möbius grid ready.');
        return mesh;
    }

    async _cacheMobiusSurface(mesh, board, settings, onProgress = null, isCancelled = () => false) {
        const surfaceCanvas = document.createElement('canvas');
        const gridCanvas = document.createElement('canvas');
        surfaceCanvas.width = gridCanvas.width = Math.ceil(board.size);
        surfaceCanvas.height = gridCanvas.height = Math.ceil(board.size);
        const surfaceContext = surfaceCanvas.getContext('2d');
        const gridContext = gridCanvas.getContext('2d');
        const opacity = settings.mobiusGridOpacity;
        const surfaceOpacity = mesh.paired
            ? opacity
            : 1 - Math.sqrt(1 - opacity);

        for (const context of [surfaceContext, gridContext]) {
            context.save();
            context.translate(-board.x, -board.y);
            context.beginPath();
            context.rect(board.x, board.y, board.size, board.size);
            context.clip();
            context.lineJoin = 'round';
            context.lineCap = 'round';
        }

        if (surfaceOpacity > 0) {
            surfaceContext.globalAlpha = surfaceOpacity;
            let lastYield = performance.now();
            for (let index = 0; index < mesh.patches.length; index++) {
                const patch = mesh.patches[index];
                surfaceContext.fillStyle = patch.surfaceColor;
                surfaceContext.fill(patch.fillPath);
                if (performance.now() - lastYield >= PROJECTION_YIELD_INTERVAL_MS) {
                    onProgress?.(
                        (index + 1) / mesh.patches.length * 0.8,
                        `Rasterizing Möbius surface… ${Math.round((index + 1) / mesh.patches.length * 100)}%`,
                    );
                    await yieldToBrowser();
                    if (isCancelled()) return false;
                    lastYield = performance.now();
                }
            }
        }
        if (opacity > 0) {
            gridContext.globalAlpha = Math.min(0.9, opacity * 0.72);
            gridContext.strokeStyle = '#B8B8C8';
            gridContext.lineWidth = DRAWING.gridLineWidth;
            onProgress?.(0.9, 'Rasterizing grid lines…');
            gridContext.stroke(mesh.gridPath);
        }
        surfaceContext.restore();
        gridContext.restore();
        // Finish raster work during preparation. Keeping a canvas display list
        // here can defer thousands of curve strokes until the first game frame.
        const [surfaceBitmap, gridBitmap] = await Promise.all([
            createImageBitmap(surfaceCanvas), createImageBitmap(gridCanvas),
        ]);
        if (isCancelled()) { surfaceBitmap.close(); gridBitmap.close(); return false; }
        mesh.surfaceCanvas = surfaceBitmap;
        mesh.gridCanvas = gridBitmap;
        surfaceCanvas.width = gridCanvas.width = 0;
        // The one large static path has now been rasterized and can be released.
        // Dynamic cells retain only their fill paths.
        mesh.gridPath = null;
        onProgress?.(1, 'Projection cache complete.');
        return true;
    }

    _buildVisualState() {
        const length = this.rows * this.columns;
        const kinds = this.visualKinds?.length === length
            ? this.visualKinds
            : (this.visualKinds = new Uint8Array(length));
        const pieces = this.visualPieces?.length === length
            ? this.visualPieces
            : (this.visualPieces = new Int32Array(length));
        const activeIndices = this.visualActiveIndices || (this.visualActiveIndices = []);
        activeIndices.length = 0;
        kinds.fill(CELL_KIND.EMPTY);
        pieces.fill(-1);

        for (let row = 0; row < this.rows; row++) {
            const flashing = this.lineClear?.flashOn && this.lineClear.rowSet.has(row);
            for (let phi = 0; phi < this.columns; phi++) {
                const stored = this.grid[row][phi];
                if (!stored) continue;
                const bodyId = this.structuralBodyGrid?.[row]?.[phi] || 0;
                if (this.toppling?.bodyIdSet.has(bodyId)) continue;
                const index = row * this.columns + phi;
                kinds[index] = flashing ? CELL_KIND.FLASH : CELL_KIND.LOCKED;
                pieces[index] = stored - 1;
                activeIndices.push(index);
            }
        }

        const piece = this.currentPiece;
        if (piece && !this.lineClear) {
            const currentBlocks = this._blocksFor(piece);
            const ghostBlocks = this._blocksFor(piece, this.ghostR, piece.phi, piece.rotation);
            const currentLowest = new Int16Array(this.columns);
            const ghostHighest = new Int16Array(this.columns);
            currentLowest.fill(-32768);
            ghostHighest.fill(32767);
            for (const block of currentBlocks) {
                if (block.r >= 0) currentLowest[block.phi] = Math.max(currentLowest[block.phi], block.r);
            }
            for (const block of ghostBlocks) {
                if (block.r >= 0) ghostHighest[block.phi] = Math.min(ghostHighest[block.phi], block.r);
            }
            for (let phi = 0; phi < this.columns; phi++) {
                const start = currentLowest[phi] + 1;
                const end = ghostHighest[phi];
                if (currentLowest[phi] === -32768 || end === 32767) continue;
                for (let row = Math.max(0, start); row < Math.min(this.rows, end); row++) {
                    const index = row * this.columns + phi;
                    if (kinds[index] !== CELL_KIND.EMPTY) continue;
                    kinds[index] = CELL_KIND.DROP_PATH;
                    pieces[index] = piece.entry.index;
                    activeIndices.push(index);
                }
            }
            if (this.ghostR > piece.r) {
                for (const block of ghostBlocks) {
                    if (block.r < 0 || block.r >= this.rows || block.phi < 0 || block.phi >= this.columns) continue;
                    const index = block.r * this.columns + block.phi;
                    if (kinds[index] > CELL_KIND.DROP_PATH) continue;
                    if (kinds[index] === CELL_KIND.EMPTY) activeIndices.push(index);
                    kinds[index] = CELL_KIND.GHOST;
                    pieces[index] = piece.entry.index;
                }
            }
            for (const block of currentBlocks) {
                if (block.r < 0 || block.r >= this.rows || block.phi < 0 || block.phi >= this.columns) continue;
                const index = block.r * this.columns + block.phi;
                if (kinds[index] === CELL_KIND.EMPTY) activeIndices.push(index);
                kinds[index] = CELL_KIND.CURRENT;
                pieces[index] = piece.entry.index;
            }
        }
        return { kinds, pieces, activeIndices };
    }

    render() {
        if (!this.dirty) return;
        const started = performance.now();
        this.dirty = false;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#222222';
        ctx.fillRect(0, 0, this.w, this.h);
        if (!this.projection) {
            this._renderProjectionLoading();
            ctx.restore();
            this.ui?.updateHud();
            this.renderCount++;
            this.lastRenderDurationMs = performance.now() - started;
            return;
        }
        const visual = this._buildVisualState();

        if (this.settings.mode === 'circular') this._renderCircular(visual);
        else if (isCartesianMode(this.settings.mode)) this._renderRectangular(visual);
        else this._renderMobius(visual);

        this._renderRecoveryGlow();

        const frame = this._boardFrameRect();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 1;
        ctx.strokeRect(frame.x + 0.5, frame.y + 0.5, frame.width - 1, frame.height - 1);
        if (this.state === 'gameover' || this.state === 'won') this._renderGameOver();
        else if (this.menuPaused) this._renderPaused();
        ctx.restore();
        this.ui?.updateHud();
        this.renderCount++;
        this.lastRenderDurationMs = performance.now() - started;
    }

    _boardFrameRect() {
        if (this.rocking) return this.layout.board;
        if (isCartesianMode(this.settings.mode) && this.projection?.rectangular) {
            const cache = this.projection.rectangular;
            return {
                x: cache.x,
                y: cache.y,
                width: cache.gridWidth,
                height: cache.gridHeight,
            };
        }
        const board = this.layout.board;
        return { x: board.x, y: board.y, width: board.size, height: board.size };
    }

    _renderProjectionLoading() {
        const ctx = this.ctx;
        const board = this.layout?.board || { x: 20, y: 20, size: Math.min(this.w, this.h) - 40 };
        ctx.fillStyle = this.settings.outerSpaceColor || '#333333';
        ctx.fillRect(board.x, board.y, board.size, board.size);
        const width = Math.min(360, board.size * 0.7);
        const x = board.x + (board.size - width) / 2;
        const y = board.y + board.size / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = this.projectionError ? '#FF7777' : '#D8D8E4';
        ctx.fillText(
            this.projectionError || this.projectionLoadingMessage || 'Preparing projection…',
            board.x + board.size / 2,
            y - 10,
            width,
        );
        ctx.fillStyle = '#15151F';
        ctx.fillRect(x, y, width, 6);
        if (!this.projectionError) {
            ctx.fillStyle = '#7C5CFC';
            ctx.fillRect(x, y, width * this.projectionProgress, 6);
            ctx.fillStyle = '#8B8B9D';
            ctx.textBaseline = 'top';
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.fillText(`${Math.round(this.projectionProgress * 100)}%`, board.x + board.size / 2, y + 11);
        }
    }

    _circularCellPath(cache, index) {
        if (cache.cells[index]) return cache.cells[index];
        const row = Math.floor(index / this.columns);
        const phi = index - row * this.columns;
        const inner = cache.innerRadius + row * cache.radialStep;
        const outer = inner + cache.radialStep;
        const start = phi * cache.angularStep - Math.PI / 2;
        const end = start + cache.angularStep;
        const path = new Path2D();
        path.arc(cache.centerX, cache.centerY, outer, start, end, false);
        path.arc(cache.centerX, cache.centerY, inner, end, start, true);
        path.closePath();
        cache.cells[index] = path;
        return path;
    }

    _rectangularCellPath(cache, index) {
        if (cache.cells[index]) return cache.cells[index];
        const row = Math.floor(index / this.columns);
        const phi = index - row * this.columns;
        const path = new Path2D();
        path.rect(
            cache.x + phi * cache.cellSize,
            cache.y + row * cache.cellSize,
            cache.cellSize,
            cache.cellSize,
        );
        cache.cells[index] = path;
        return path;
    }

    _renderCircular(visual) {
        const ctx = this.ctx;
        const board = this.layout.board;
        const cache = this.projection.circular;
        ctx.fillStyle = this.settings.outerSpaceColor;
        ctx.fillRect(board.x, board.y, board.size, board.size);
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(cache.centerX, cache.centerY, cache.outerRadius, 0, TAU);
        ctx.fill();
        ctx.fillStyle = this.settings.centralHoleColor;
        ctx.beginPath();
        ctx.arc(cache.centerX, cache.centerY, cache.innerRadius, 0, TAU);
        ctx.fill();

        for (const index of visual.activeIndices) {
            this._fillVisualPath(
                this._circularCellPath(cache, index),
                visual.kinds[index],
                visual.pieces[index],
            );
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#484856';
        ctx.lineWidth = DRAWING.gridLineWidth;
        ctx.stroke(cache.gridPath);
    }

    _pieceBoundaryPath(cells, size, x = 0, y = 0) {
        const path = new Path2D();
        const occupied = new Map(cells.map(c => [`${c.row},${c.column}`, c.bodyId || 1]));
        for (const cell of cells) {
            const id = cell.bodyId || 1, r = cell.row, c = cell.column;
            const px = x + c * size, py = y + r * size;
            if (occupied.get(`${r - 1},${c}`) !== id) { path.moveTo(px, py); path.lineTo(px + size, py); }
            if (occupied.get(`${r + 1},${c}`) !== id) { path.moveTo(px, py + size); path.lineTo(px + size, py + size); }
            if (occupied.get(`${r},${c - 1}`) !== id) { path.moveTo(px, py); path.lineTo(px, py + size); }
            if (occupied.get(`${r},${c + 1}`) !== id) { path.moveTo(px + size, py); path.lineTo(px + size, py + size); }
        }
        return path;
    }

    _drawPieceOutline(path) {
        if (!(this.settings.pieceOutlineWidth > 0)) return;
        this.ctx.globalAlpha = 1;
        this.ctx.strokeStyle = '#17171d';
        this.ctx.lineWidth = this.settings.pieceOutlineWidth;
        this.ctx.stroke(path);
    }

    _renderStructuralToppling() {
        const cache = this.projection.rectangular, snapshot = this.collapseSnapshot;
        if (!cache || !snapshot) return;
        const ctx = this.ctx, size = this.structuralPhysics.cellSizeMeters;
        const scale = cache.cellSize / size;
        const originX = cache.x + cache.gridWidth / 2, originY = cache.y + cache.gridHeight;
        for (const body of snapshot.bodies) {
            ctx.save();
            ctx.translate(originX + body.x * scale, originY + body.y * scale);
            ctx.rotate(body.angle);
            for (const cell of body.cells) {
                ctx.fillStyle = POLYOMINO_CATALOG.all[cell.value - 1]?.color || '#ccc';
                ctx.fillRect((cell.x - size / 2) * scale, (cell.y - size / 2) * scale, cache.cellSize, cache.cellSize);
            }
            // Relative cell coordinates can have a fractional COM offset;
            // quantize only the lookup lattice, never the rendered transform.
            const first = body.cells[0];
            if (first) {
                const cells = body.cells.map(c => ({ row: Math.round((c.y - first.y) / size), column: Math.round((c.x - first.x) / size) }));
                this._drawPieceOutline(this._pieceBoundaryPath(cells, cache.cellSize, (first.x - size / 2) * scale, (first.y - size / 2) * scale));
            }
            ctx.restore();
        }
    }

    _renderRectangular(visual) {
        const ctx = this.ctx, cache = this.projection.rectangular;
        if (this.rocking) this._beginRockingRender(cache);
        ctx.fillStyle = this.settings.rectBackgroundColor;
        ctx.fillRect(cache.x, cache.y, cache.gridWidth, cache.gridHeight);
        if (!this.collapseSnapshot) for (const index of visual.activeIndices)
            this._fillVisualPath(this._rectangularCellPath(cache, index), visual.kinds[index], visual.pieces[index]);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#484856';
        ctx.lineWidth = DRAWING.gridLineWidth;
        ctx.stroke(cache.gridPath);
        if (!this.collapseSnapshot) {
            this._renderOverhang(cache);
            if (this.settings.pieceOutlineWidth > 0) {
                if (!this.lockedOutlinePath) this.lockedOutlinePath = this._pieceBoundaryPath(this._lockedCells(), cache.cellSize, cache.x, cache.y);
                this._drawPieceOutline(this.lockedOutlinePath);
                if (this.currentPiece) this._drawPieceOutline(this._pieceBoundaryPath(
                    this._blocksFor(this.currentPiece).filter(c => c.r >= 0).map(c => ({ row: c.r, column: c.phi })), cache.cellSize, cache.x, cache.y));
            }
            for (const cells of this.gridFalling?.bodies || []) {
                for (const cell of cells) {
                    ctx.fillStyle = POLYOMINO_CATALOG.all[cell.value - 1]?.color || '#ccc';
                    ctx.fillRect(cache.x + cell.column * cache.cellSize, cache.y + cell.row * cache.cellSize, cache.cellSize, cache.cellSize);
                }
                this._drawPieceOutline(this._pieceBoundaryPath(cells, cache.cellSize, cache.x, cache.y));
            }
        }
        if (this.rocking) ctx.restore();
        if (this.collapseSnapshot) this._renderStructuralToppling();
    }

    _renderMobius(visual) {
        const ctx = this.ctx;
        const board = this.layout.board;
        const mesh = this.projection.mobius;
        ctx.fillStyle = this.settings.outerSpaceColor;
        ctx.fillRect(board.x, board.y, board.size, board.size);
        ctx.save();
        ctx.beginPath();
        ctx.rect(board.x, board.y, board.size, board.size);
        ctx.clip();
        const activePatchIndices = this._activeMobiusPatchIndices(mesh, visual.activeIndices);

        // The surface and grid never change during play. They are rasterized
        // once on resize/settings changes; only blocks are composited per frame.
        // Back-side blocks go below the film, front-side blocks above it, and
        // the cached grid is the final overlay. This retains the double-cover
        // layering without hundreds of static path fills every movement frame.
        for (const patchIndex of activePatchIndices) {
            const patch = mesh.patches[patchIndex];
            const phiA = positiveModulo(this.mobiusViewPhi + patch.slotA, this.columns);
            const indexA = patch.rowA * this.columns + phiA;
            if (!mesh.paired) {
                const kind = visual.kinds[indexA];
                const pieceIndex = visual.pieces[indexA];
                if (!patch.frontFacing && kind !== CELL_KIND.EMPTY && kind !== CELL_KIND.CURRENT) {
                    this._fillVisualPath(patch.fillPath, kind, pieceIndex, 0.52);
                }
                continue;
            }

            const phiB = positiveModulo(this.mobiusViewPhi + patch.slotB, this.columns);
            const indexB = patch.rowB * this.columns + phiB;
            const frontIndex = patch.frontIsA ? indexA : indexB;
            const backIndex = patch.frontIsA ? indexB : indexA;
            const frontKind = visual.kinds[frontIndex];
            const backKind = visual.kinds[backIndex];

            if (backKind !== CELL_KIND.EMPTY && backKind !== CELL_KIND.CURRENT) {
                this._fillVisualPath(patch.fillPath, backKind, visual.pieces[backIndex], 0.52);
            }
        }

        ctx.globalAlpha = 1;
        ctx.drawImage(mesh.surfaceCanvas, board.x, board.y);

        for (const patchIndex of activePatchIndices) {
            const patch = mesh.patches[patchIndex];
            const phiA = positiveModulo(this.mobiusViewPhi + patch.slotA, this.columns);
            const indexA = patch.rowA * this.columns + phiA;
            if (!mesh.paired) {
                const kind = visual.kinds[indexA];
                if ((patch.frontFacing || kind === CELL_KIND.CURRENT) && kind !== CELL_KIND.EMPTY) {
                    this._fillVisualPath(patch.fillPath, kind, visual.pieces[indexA]);
                }
                continue;
            }

            const phiB = positiveModulo(this.mobiusViewPhi + patch.slotB, this.columns);
            const indexB = patch.rowB * this.columns + phiB;
            const frontIndex = patch.frontIsA ? indexA : indexB;
            const backIndex = patch.frontIsA ? indexB : indexA;
            const frontKind = visual.kinds[frontIndex];
            const backKind = visual.kinds[backIndex];
            if (frontKind !== CELL_KIND.EMPTY && frontKind !== CELL_KIND.CURRENT) {
                this._fillVisualPath(patch.fillPath, frontKind, visual.pieces[frontIndex]);
            }

            // Keep the falling piece readable even when its double-cover
            // preimage is locally back-facing.
            if (backKind === CELL_KIND.CURRENT) {
                this._fillVisualPath(patch.fillPath, backKind, visual.pieces[backIndex]);
            }
            if (frontKind === CELL_KIND.CURRENT) {
                this._fillVisualPath(patch.fillPath, frontKind, visual.pieces[frontIndex]);
            }
        }
        ctx.globalAlpha = 1;
        ctx.drawImage(mesh.gridCanvas, board.x, board.y);
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    _activeMobiusPatchIndices(mesh, logicalIndices) {
        let generation = (mesh.activePatchGeneration + 1) >>> 0;
        if (generation === 0) {
            mesh.activePatchMarks.fill(0);
            generation = 1;
        }
        mesh.activePatchGeneration = generation;
        const selected = mesh.activePatchIndices;
        selected.length = 0;

        for (const logicalIndex of logicalIndices) {
            const logicalRow = Math.floor(logicalIndex / this.columns);
            const logicalPhi = logicalIndex - logicalRow * this.columns;
            const slot = positiveModulo(logicalPhi - this.mobiusViewPhi, this.columns);
            let physicalColumn = slot;
            let physicalRow = logicalRow;
            if (mesh.paired && slot >= mesh.physicalColumns) {
                physicalColumn -= mesh.physicalColumns;
                physicalRow = this.rows - 1 - logicalRow;
            }
            const rawIndex = physicalColumn * this.rows + physicalRow;
            const sortedIndex = mesh.rawToSortedIndex[rawIndex];
            if (mesh.activePatchMarks[sortedIndex] === generation) continue;
            mesh.activePatchMarks[sortedIndex] = generation;
            selected.push(sortedIndex);
        }
        selected.sort((a, b) => a - b);
        return selected;
    }

    _fillVisualPath(path, kind, pieceIndex, alphaScale = 1) {
        const ctx = this.ctx;
        const entry = pieceIndex >= 0 ? POLYOMINO_CATALOG.all[pieceIndex] : null;
        let alpha = alphaScale;
        let fill = '#FFFFFF';
        if (kind === CELL_KIND.DROP_PATH) {
            fill = entry?.darkColor || '#20202A';
            alpha *= this.settings.dropPathOpacity;
        } else if (kind === CELL_KIND.GHOST) {
            fill = entry?.color || '#CCCCCC';
            alpha *= 0.25;
        } else if (kind === CELL_KIND.LOCKED || kind === CELL_KIND.CURRENT) {
            fill = entry?.color || '#CCCCCC';
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = fill;
        ctx.fill(path);
        if (kind === CELL_KIND.GHOST && entry) {
            ctx.globalAlpha = Math.min(1, 0.72 * alphaScale);
            ctx.strokeStyle = entry.outlineColor;
            ctx.lineWidth = 1.2;
            ctx.stroke(path);
        }
    }

    _renderHud() {
        const ctx = this.ctx;
        const hud = this.layout.hud;
        ctx.globalAlpha = 1;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        if (this.layout.stacked) {
            ctx.fillStyle = '#1A1A28';
            ctx.fillRect(hud.x, hud.y, hud.width, Math.max(1, hud.height));
            ctx.fillStyle = '#D8D8E4';
            ctx.font = '600 11px Inter, sans-serif';
            ctx.fillText(`Score ${this.score}   ·   Lines ${this.linesCleared}   ·   Level ${this.level}`, hud.x + 8, hud.y + 15);
            return;
        }

        const panel = roundedRectPath(hud.x, hud.y, hud.width, hud.height, DRAWING.hudPanelRadius);
        ctx.fillStyle = '#12121C';
        ctx.fill(panel);
        ctx.strokeStyle = '#2A2A3E';
        ctx.lineWidth = 1;
        ctx.stroke(panel);

        let y = hud.y + 18;
        ctx.fillStyle = '#D8D8E4';
        ctx.font = '600 12px Inter, sans-serif';
        ctx.fillText('ReRoMo Tetris', hud.x + 10, y);
        ctx.fillStyle = '#686880';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${this.settings.mode} · ${this.sampler.size.toLocaleString()} active`, hud.x + hud.width - 10, y);
        ctx.textAlign = 'left';

        y += 18;
        const statHeight = 58;
        ctx.fillStyle = '#1A1A28';
        ctx.fillRect(hud.x + 7, y, hud.width - 14, statHeight);
        const stats = [
            ['SCORE', this.score], ['HIGH', this.highScore],
            ['LINES', this.linesCleared], ['HIGH', this.highLines],
            ['LEVEL', this.level], ['FALL', `${Math.round(this.gameSpeed)} ms`],
        ];
        stats.forEach(([label, value], index) => {
            const column = index % 2;
            const row = Math.floor(index / 2);
            const x = hud.x + 15 + column * 101;
            const sy = y + 10 + row * 18;
            ctx.fillStyle = '#686880';
            ctx.font = '8px Inter, sans-serif';
            ctx.fillText(label, x, sy);
            ctx.fillStyle = '#D8D8E4';
            ctx.font = '10px JetBrains Mono, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(String(value), x + 80, sy);
            ctx.textAlign = 'left';
        });

        y += statHeight + 8;
        const previewGap = 5;
        const previewWidth = Math.floor((hud.width - 14 - previewGap * 2) / 3);
        const previews = [
            ['HOLD', this.heldPieceIndex === null ? null : POLYOMINO_CATALOG.all[this.heldPieceIndex]],
            ['NEXT', this.nextPieces[0] === undefined ? null : POLYOMINO_CATALOG.all[this.nextPieces[0]]],
            ['NEXT +1', this.nextPieces[1] === undefined ? null : POLYOMINO_CATALOG.all[this.nextPieces[1]]],
        ];
        previews.forEach(([label, entry], index) => {
            this._drawPreview(entry, hud.x + 7 + index * (previewWidth + previewGap), y, previewWidth, 76, label);
        });

        y += 84;
        ctx.fillStyle = '#686880';
        ctx.font = '600 8px Inter, sans-serif';
        ctx.fillText('CONTROLS', hud.x + 9, y);
        y += 12;
        const shortLabels = {
            moveClockwise: isCartesianMode(this.settings.mode) ? 'Move left' : 'Move clockwise',
            moveCounterClockwise: isCartesianMode(this.settings.mode) ? 'Move right' : 'Move anti-clockwise',
            rotateClockwise: 'Rotate clockwise',
            rotateCounterClockwise: 'Rotate anti-clockwise',
            rotate180: 'Rotate 180°',
            softDrop: 'Soft drop / combo',
            hardDrop: 'Hard drop',
            holdPiece: 'Hold',
            pause: 'Pause',
            restart: 'Restart',
            quickMotion: 'Quick motion',
            checkCollapse: 'Check collapse / skip wait',
        };
        for (const control of CONTROL_DEFINITIONS) {
            const binding = this.app.currentBindings?.[control.action]?.[0];
            ctx.fillStyle = '#8C8CA2';
            ctx.font = '9px Inter, sans-serif';
            ctx.fillText(shortLabels[control.action], hud.x + 10, y);
            ctx.fillStyle = '#C8C8D6';
            ctx.font = '9px JetBrains Mono, monospace';
            ctx.textAlign = 'right';
            ctx.fillText(binding ? InputManager.bindingName(binding) : '—', hud.x + hud.width - 10, y);
            ctx.textAlign = 'left';
            y += 14;
        }
    }

    _drawPreview(entry, x, y, width, height, label) {
        const ctx = this.ctx;
        ctx.fillStyle = '#1A1A28';
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = '#2A2A3E';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        ctx.fillStyle = '#686880';
        ctx.font = '7px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x + width / 2, y + 8);
        if (!entry) {
            ctx.textAlign = 'left';
            return;
        }
        const cells = getPreviewCells(entry);
        const maxRow = Math.max(...cells.map(cell => cell[0]));
        const maxColumn = Math.max(...cells.map(cell => cell[1]));
        const shapeWidth = maxColumn + 1;
        const shapeHeight = maxRow + 1;
        const previewBounds = this.previewBounds || { columns: shapeWidth, rows: shapeHeight };
        const block = Math.max(2, Math.floor(Math.min(
            (width - 10) / previewBounds.columns,
            (height - 23) / previewBounds.rows,
        )));
        const offsetX = Math.floor(x + (width - shapeWidth * block) / 2);
        const offsetY = Math.floor(y + 17 + (height - 20 - shapeHeight * block) / 2);
        ctx.fillStyle = entry.color;
        ctx.strokeStyle = entry.darkColor;
        ctx.lineWidth = 1;
        for (const [row, column] of cells) {
            const px = offsetX + column * block;
            const py = offsetY + row * block;
            ctx.fillRect(px, py, block, block);
            if (block >= 4) ctx.strokeRect(px + 0.5, py + 0.5, block - 1, block - 1);
        }
        ctx.textAlign = 'left';
    }

    _visibleOverlayFrame() {
        const board = this.layout.board;
        const x = Math.max(0, Math.min(this.w - 1, board.x));
        const y = Math.max(0, Math.min(this.h - 1, board.y));
        return { x, y, width: Math.max(1, Math.min(this.w, board.x + board.width) - x),
            height: Math.max(1, Math.min(this.h, board.y + board.height) - y) };
    }

    _renderGameOver() {
        const ctx = this.ctx;
        const board = this._visibleOverlayFrame();
        const centerY = board.y + (board.height ?? board.size) / 2;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(board.x, centerY - 43, board.width ?? board.size, 86);
        ctx.fillStyle = '#FF4466';
        ctx.font = '700 30px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.state === 'won' ? `SPRINT · ${formatSprintTime(this.sprintElapsed)}` : this.gameOverReason === 'topple' ? 'STRUCTURE TOPPLED' : this.gameOverReason === 'platform' ? 'PLATFORM TIPPED' : 'GAME OVER', board.x + (board.width ?? board.size) / 2, centerY - 9);
        const restartBinding = this.app.currentBindings?.restart?.[0];
        ctx.fillStyle = '#D8D8E4';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(`Press ${restartBinding ? InputManager.bindingName(restartBinding) : 'R'} to restart`, board.x + (board.width ?? board.size) / 2, centerY + 22);
        ctx.textAlign = 'left';
    }

    _renderPaused() {
        const ctx = this.ctx;
        const board = this._visibleOverlayFrame();
        const centerY = board.y + (board.height ?? board.size) / 2;
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fillRect(board.x, centerY - 32, board.width ?? board.size, 64);
        const pauseBinding = this.app.currentBindings?.pause?.[0];
        ctx.fillStyle = '#FFFF00';
        ctx.font = '700 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            `PAUSED (${pauseBinding ? InputManager.bindingName(pauseBinding) : 'ESC'})`,
            board.x + (board.width ?? board.size) / 2,
            centerY,
        );
        ctx.textAlign = 'left';
    }

    getDebugSnapshot() {
        let occupiedCells = 0;
        for (const row of this.grid) {
            for (const value of row) if (value) occupiedCells++;
        }
        return {
            state: this.state,
            ruleMode: this.settings.ruleMode,
            sprintElapsed: this.sprintElapsed,
            sprintLines: this.settings.sprintLines,
            mode: this.settings.mode,
            rows: this.rows,
            columns: this.columns,
            score: this.score,
            lines: this.linesCleared,
            level: this.level,
            gameSpeed: this.gameSpeed,
            lockDelay: this.lockDelay,
            groundedElapsed: this.groundedElapsed,
            activePieceCount: this.sampler.size,
            samplerTotal: this.sampler.total,
            previewRows: this.previewBounds?.rows || 1,
            previewColumns: this.previewBounds?.columns || 1,
            horizontalDropComboPending: Boolean(this.horizontalDropCombo),
            currentPiece: this.currentPiece ? {
                name: this.currentPiece.entry.classicName || this.currentPiece.entry.id,
                order: this.currentPiece.entry.order,
                r: this.currentPiece.r,
                phi: this.currentPiece.phi,
                rotation: this.currentPiece.rotation,
                ghostR: this.ghostR,
            } : null,
            heldPiece: this.heldPieceIndex === null
                ? null
                : (POLYOMINO_CATALOG.all[this.heldPieceIndex].classicName || POLYOMINO_CATALOG.all[this.heldPieceIndex].id),
            canHold: this.canHold,
            occupiedCells,
            gameOverReason: this.gameOverReason,
            rocking: this.rocking ? { ...this.rocking, translation: rockingKinematics(this.rockingShape, this.rocking), massKg: this.rockingMass.mass } : null,
            overhangCells: this.overhangGrid?.size || 0,
            gridFallingBodies: this.gridFalling?.bodies.length || 0,
            collapse: this.collapseSnapshot,
            structuralStable: this.structuralAnalysis?.stable ?? null,
            structuralMinimumMarginCells: Number.isFinite(this.structuralAnalysis?.minimumMarginCells)
                ? this.structuralAnalysis.minimumMarginCells
                : null,
            structuralBodyCount: this.structuralAnalysis?.bodies?.length ?? 0,
            toppling: this.toppling ? {
                bodyIds: [...this.toppling.bodyIds],
                reason: this.toppling.reason,
                settled: this.collapseSnapshot?.settled || false,
                elapsed: this.toppling.elapsed,
            } : null,
            menuPaused: this.menuPaused,
            uiView: this.ui?.view || null,
            renderCount: this.renderCount,
            lastRenderDurationMs: this.lastRenderDurationMs,
            mobiusPatchCount: this.projection?.mobius?.patches.length || 0,
            mobiusLogicalCellCount: this.projection?.mobius?.logicalCellCount || 0,
            mobiusCurveSubdivisions: this.projection?.mobius?.subdivisions || 0,
            projectionLoading: this.projectionLoading,
            projectionProgress: this.projectionProgress,
            projectionError: this.projectionError,
            dirty: this.dirty,
        };
    }
}
