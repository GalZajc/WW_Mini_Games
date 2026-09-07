import { TETRIS_MODES, STRUCTURAL_MODES, ROCKING_MODES, isStructuralMode, isRockingMode } from './tetris-modes.js';
import { ROCKING_DEFAULTS } from './rocking-physics.js';
import { COLLAPSE_RECOVERY_NUMERICS } from './collapse-recovery.js';
import { defaultOrderWeights, MAX_POLYOMINO_ORDER, POLYOMINO_CATALOG } from './polyominoes.js';
import {
    findGridPreset,
    GRID_LIMITS,
    GRID_PRESETS,
    gridPresetValue,
} from './projection-cache.js';
import { STRUCTURAL_PHYSICS_DEFAULTS } from './structural-stability.js';
import {
    requireFiniteNumber,
    requireInteger,
    requirePositiveNumber,
} from '../../core/SettingsValidation.js';
import {
    DEFAULT_WIDGET_LAYOUT,
    cloneWidgetLayout,
    normalizeWidgetLayout,
} from '../../core/WidgetLayout.js';

export const GAME_ID = 'reromo-tetris';

export const CONTROL_DEFINITIONS = Object.freeze([
    { action: 'moveClockwise', label: 'Move Left', code: 'ArrowLeft', key: 'ArrowLeft' },
    { action: 'moveCounterClockwise', label: 'Move Right', code: 'ArrowRight', key: 'ArrowRight' },
    { action: 'rotateClockwise', label: 'Rotate Clockwise', code: 'KeyZ', key: 'z' },
    { action: 'rotateCounterClockwise', label: 'Rotate Anti-Clockwise', code: 'KeyT', key: 't' },
    { action: 'rotate180', label: 'Rotate 180°', code: 'ArrowUp', key: 'ArrowUp' },
    { action: 'softDrop', label: 'Soft Drop', code: 'ArrowDown', key: 'ArrowDown' },
    { action: 'hardDrop', label: 'Hard Drop', code: 'Space', key: ' ' },
    { action: 'holdPiece', label: 'Hold Piece', code: 'KeyU', key: 'u' },
    { action: 'pause', label: 'Pause / Resume', code: 'Backquote', key: '¸', match: 'code' },
    { action: 'restart', label: 'Restart Game', code: 'KeyR', key: 'r' },
    { action: 'quickMotion', label: 'Quick Motion Hotkey', code: 'Digit6', key: '6' },
    { action: 'checkCollapse', label: 'Check Collapse / Skip Wait', code: 'Enter', key: 'Enter' },
]);

export const DEFAULT_SETTINGS = Object.freeze({
    mode: 'circular',
    ruleMode: 'survival',
    sprintLines: 40,

    // Movement
    das: 60,
    arr: 80,
    quickMotionMultiplier: 3,
    softDropSpeed: 15,
    comboTime: 120,
    comboMode: 'release-lock',

    // Gravity and locking
    initialSpeed: 400,
    speedIncrease: 80,
    initialLockDelay: 1500,
    lockDelayDecrease: 80,

    // Grid
    phiSegments: 24,
    rSegments: 18,
    gridPreset: gridPresetValue(24, 18),

    // Visuals
    centralHoleColor: '#333333',
    outerSpaceColor: '#333333',
    lineClearDuration: 30,
    mobiusGridOpacity: 0.8,
    rectBackgroundColor: '#000000',
    dropPathOpacity: 0.25,
    pieceOutlineWidth: 2,
    nextPreviewCount: 2,
    // Preview cells use the same measured grid cell size as the board.  A
    // multiplier keeps this responsive on small and large windows alike.
    nextPreviewCellScale: 1,
    holdPreviewCellScale: 1,
    previewFramed: true,
    sfxVolume: 0.5,

    // Widget positions are saved with the active game mode profile.  They are
    // intentionally excluded from record identity (see settingsRecordKey).
    widgetLayout: Object.freeze(cloneWidgetLayout(DEFAULT_WIDGET_LAYOUT)),

    // Structural Cartesian physics (source defaults are centralized in
    // structural-stability.js alongside the solver and animation model).
    structuralCellSizeMeters: STRUCTURAL_PHYSICS_DEFAULTS.cellSizeMeters,
    structuralBlockMassKg: STRUCTURAL_PHYSICS_DEFAULTS.blockMassKg,
    structuralGravity: STRUCTURAL_PHYSICS_DEFAULTS.gravity,
    structuralPieceFriction: STRUCTURAL_PHYSICS_DEFAULTS.pieceFriction,
    structuralRecoveryTolerance: COLLAPSE_RECOVERY_NUMERICS.epsilonCells,
    structuralPlatformFriction: STRUCTURAL_PHYSICS_DEFAULTS.platformFriction ?? 0,
    structuralWallFriction: STRUCTURAL_PHYSICS_DEFAULTS.wallFriction,
    rockingLengthCells: ROCKING_DEFAULTS.lengthCells,
    rockingArcDegrees: ROCKING_DEFAULTS.arcDegrees,
    rockingMassKg: ROCKING_DEFAULTS.massKg,
    rockingRollingFriction: ROCKING_DEFAULTS.rollingFriction,
    rockingAllowOverhang: ROCKING_DEFAULTS.allowOverhang,
    rockingCollapseMassKg: ROCKING_DEFAULTS.collapseMassKg,
    // 0 means automatic neutral-view bounds.  The shared editor writes an
    // explicit tenth-cell value only after the user drags a frame edge.
    rockingFrameWidthCells: 0,
    rockingFrameHeadroomCells: 0,
    structuralStabilityMarginCells: STRUCTURAL_PHYSICS_DEFAULTS.stabilityMarginCells,
    structuralToppleDampingPerSecond: STRUCTURAL_PHYSICS_DEFAULTS.toppleDampingPerSecond,
    structuralToppleInitialAngularSpeed: STRUCTURAL_PHYSICS_DEFAULTS.toppleInitialAngularSpeed,
    structuralToppleGameOverAngleDegrees: STRUCTURAL_PHYSICS_DEFAULTS.toppleGameOverAngleDegrees,
    structuralToppleMaximumSeconds: STRUCTURAL_PHYSICS_DEFAULTS.toppleMaximumSeconds,

    // Piece distribution
    orderWeights: Object.freeze(defaultOrderWeights()),
    pieceOverrides: Object.freeze({}),
});

export const SETTINGS_GROUPS = Object.freeze([
    Object.freeze({
        title: 'Movement',
        fields: Object.freeze([
            { key: 'das', label: 'DAS (ms)', type: 'number', min: 0, step: 10, domainStep: 'any', fundamental: true },
            { key: 'arr', label: 'ARR (ms)', type: 'number', min: 0, step: 5, domainStep: 'any', fundamental: true },
            { key: 'quickMotionMultiplier', label: 'Quick Motion Multiplier (×)', type: 'number', min: 0, step: 0.5, domainStep: 'any', fundamental: true },
            { key: 'softDropSpeed', label: 'Soft Drop Speed (×)', type: 'number', min: 0, step: 1, domainStep: 'any', fundamental: true },
            { key: 'comboTime', label: 'Combo Time (ms)', type: 'number', min: 0, step: 10, domainStep: 'any', fundamental: true },
            {
                key: 'comboMode', label: 'Down + Arrow Combo', type: 'select', options: [
                    { value: 'release-lock', label: 'Manual: lock on release' },
                    { value: 'auto-slide-lock', label: 'Auto: slide + lock' },
                ],
            },
        ]),
    }),
    Object.freeze({
        title: 'Speed',
        fields: Object.freeze([
            // Zero means the fastest deterministic drop allowed by the
            // per-frame safety budget; it is not an invalid timer.
            { key: 'initialSpeed', label: 'Initial Speed (ms)', type: 'number', min: 0, step: 50, domainStep: 'any', fundamental: true },
            // 0 is meaningful: it disables level scaling and keeps the
            // initial drop interval constant.
            { key: 'speedIncrease', label: 'Speed Increase Rate (%)', type: 'number', min: 0, step: 1, domainStep: 'any', fundamental: true },
            { key: 'initialLockDelay', label: 'Initial Lock Delay (ms)', type: 'number', min: 0, step: 50, domainStep: 'any', fundamental: true },
            { key: 'lockDelayDecrease', label: 'Lock Delay Decrease Rate (%)', type: 'number', min: 0, step: 1, domainStep: 'any', fundamental: true },
        ]),
    }),
    Object.freeze({
        title: 'Grid & Visuals',
        fields: Object.freeze([
            { key: 'mode', label: 'Game Mode', type: 'hidden' },
            { key: 'ruleMode', label: 'Rules', type: 'hidden', modeProfile: false },
            { key: 'sprintLines', label: 'Sprint — target rows', type: 'number', min: 1, max: 10000, step: 1, fundamental: true, modeProfile: false },
            {
                key: 'gridPreset', modes: ['rectangular', 'structural', 'circular', 'mobius'],
                label: 'Prepared Grid Size',
                type: 'select',
                options: [
                    { value: 'custom', label: 'Custom — type below' },
                    ...GRID_PRESETS.map(({ columns, rows }) => ({
                        value: gridPresetValue(columns, rows),
                        label: `${columns} × ${rows}`,
                    })),
                ],
            },
            {
                key: 'phiSegments', modes: ['rectangular', 'structural', 'circular', 'mobius'],
                label: 'Grid Width (cells)',
                type: 'number',
                // The renderer's prepared-grid cache has a practical
                // 10–256 domain. The gameplay validator still checks the
                // active mode explicitly and never rewrites a typed value.
                min: GRID_LIMITS.minColumns,
                max: GRID_LIMITS.maxColumns,
                fundamental: true,
                step: 1,
                suggestions: GRID_PRESETS.map(preset => preset.columns),
            },
            {
                key: 'rSegments',
                label: 'Grid Height (cells)',
                type: 'number',
                min: GRID_LIMITS.minRows,
                max: GRID_LIMITS.maxRows,
                fundamental: true,
                step: 1,
                suggestions: GRID_PRESETS.map(preset => preset.rows),
            },
            { key: 'rockingLengthCells', label: 'Grid Width (cells)', type: 'number', min: 1, max: 256, step: 1, domainStep: 1, fundamental: true, modes: ROCKING_MODES },
            { key: 'centralHoleColor', label: 'Central Hole Color', type: 'color', modes: ['circular'] },
            { key: 'outerSpaceColor', label: 'Outer Space Color', type: 'color', modes: ['circular', 'mobius'] },
            { key: 'rectBackgroundColor', label: 'Rectangular Background', type: 'color', modes: ['rectangular', ...STRUCTURAL_MODES] },
            { key: 'lineClearDuration', label: 'Line Clear Effect Duration (ms)', type: 'number', min: 0, step: 10, domainStep: 'any', fundamental: true },
            { key: 'mobiusGridOpacity', label: 'Möbius Grid Opacity', type: 'number', min: 0, max: 1, step: 0.05, domainStep: 'any', fundamental: true, modes: ['mobius'] },
            { key: 'dropPathOpacity', label: 'Drop Path Opacity', type: 'number', min: 0, max: 1, step: 0.05, domainStep: 'any', fundamental: true },
            { key: 'pieceOutlineWidth', label: 'Piece Outline Width (px)', type: 'number', min: 0, max: 20, step: 0.5, domainStep: 'any', fundamental: true, modes: ['rectangular', ...STRUCTURAL_MODES] },
            { key: 'nextPreviewCount', label: 'Next Pieces Shown', type: 'number', min: 1, max: 5, step: 1, domainStep: 1, domainMin: 1 },
            { key: 'nextPreviewCellScale', label: 'Next Preview Cell Scale (×)', type: 'number', min: 0.25, max: 8, step: 0.1, domainStep: 'any' },
            { key: 'holdPreviewCellScale', label: 'Hold Preview Cell Scale (×)', type: 'number', min: 0.25, max: 8, step: 0.1, domainStep: 'any' },
            { key: 'previewFramed', label: 'Frame Preview Boxes', type: 'toggle' },
            { key: 'widgetLayout', label: 'Widget Layout', type: 'hidden' },
            { key: 'sfxVolume', label: 'Sound Effects Volume', type: 'range', min: 0, max: 1, step: 0.05, domainStep: 'any', fundamental: true },
        ]),
    }),
    Object.freeze({
        title: 'Structural Physics',
        fields: Object.freeze([
            { key: 'structuralCellSizeMeters', label: 'Cell Size (m)', type: 'number', min: 0.01, max: 10, step: 0.01, modes: STRUCTURAL_MODES },
            { key: 'structuralBlockMassKg', label: 'Mass per Cell (kg)', type: 'number', min: 0.001, max: 10000, step: 0.1, modes: STRUCTURAL_MODES },
            { key: 'structuralGravity', label: 'Gravity (m/s²)', type: 'number', min: 0.01, max: 100, step: 0.01, modes: STRUCTURAL_MODES },
            { key: 'structuralPieceFriction', label: 'Piece–Piece Friction', type: 'number', min: 0, step: 0.05, domainStep: 'any', modes: STRUCTURAL_MODES },
            { key: 'structuralRecoveryTolerance', label: 'Recovery vertex tolerance (cells)', type: 'number', min: 0, max: 0.49, step: 0.01, modes: STRUCTURAL_MODES },
            { key: 'structuralPlatformFriction', label: 'Piece–Platform Friction', type: 'number', min: 0, step: 0.05, domainStep: 'any', modes: STRUCTURAL_MODES },
            { key: 'structuralWallFriction', label: 'Piece–Wall Friction', type: 'number', min: 0, step: 0.05, domainStep: 'any', modes: STRUCTURAL_MODES },
            { key: 'rockingArcDegrees', label: 'Platform Arc Angle (°)', type: 'number', min: 5, max: 180, step: 1, domainStep: 'any', modes: ROCKING_MODES },
            { key: 'rockingMassKg', label: 'Platform Mass (kg)', type: 'number', min: 0.001, step: 1, domainStep: 'any', modes: ROCKING_MODES },
            { key: 'rockingRollingFriction', label: 'Rolling Resistance', type: 'number', min: 0, step: 0.001, domainStep: 'any', fundamental: true, modes: ROCKING_MODES },
            { key: 'rockingAllowOverhang', label: 'Allow Side Overhangs', type: 'toggle', modes: ROCKING_MODES },
            { key: 'rockingCollapseMassKg', label: 'Collapse: Mass Above Row (kg)', type: 'number', min: 0.001, step: 1, domainStep: 'any', modes: ['rocking-pressure'] },
            { key: 'rockingFrameWidthCells', label: 'Frame Width (cells; 0 = auto)', type: 'number', min: 0, max: 256, step: 0.1, domainStep: 'any', modes: ROCKING_MODES },
            { key: 'rockingFrameHeadroomCells', label: 'Frame Headroom (cells; 0 = auto)', type: 'number', min: 0, max: 256, step: 0.1, domainStep: 'any', modes: ROCKING_MODES },
        ]),
    }),
]);

function deepClone(value) {
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedNumber(value, fallback, min = -Infinity, max = Infinity) {
    const parsed = finiteNumber(value, fallback);
    return Math.max(min, Math.min(max, parsed));
}

function integer(value, fallback, min = -Infinity, max = Infinity) {
    return Math.round(boundedNumber(value, fallback, min, max));
}

function color(value, fallback) {
    const string = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(string) ? string.toUpperCase() : fallback;
}

function flattenLegacySettings(input) {
    if (!input || typeof input !== 'object') return {};
    const flattened = { ...input };
    if (input.gameplay) Object.assign(flattened, {
        das: input.gameplay.das,
        arr: input.gameplay.arr,
        quickMotionMultiplier: input.gameplay.quickMotionMultiplier,
        softDropSpeed: input.gameplay.softDropSpeed,
        initialSpeed: input.gameplay.initialSpeed,
        speedIncrease: input.gameplay.speedIncrease,
        initialLockDelay: input.gameplay.initialLockDelay,
        lockDelayDecrease: input.gameplay.lockDelayDecrease,
    });
    if (input.movement) {
        flattened.comboTime = input.movement.comboTime;
        flattened.comboMode = input.movement.comboMode;
    }
    if (input.grid) Object.assign(flattened, {
        phiSegments: input.grid.phiSegments,
        rSegments: input.grid.rSegments,
    });
    if (input.visuals) Object.assign(flattened, {
        centralHoleColor: input.visuals.centralHoleColor,
        outerSpaceColor: input.visuals.outerSpaceColor,
        lineClearDuration: input.visuals.lineClearDuration,
        mobiusGridOpacity: input.visuals.mobiusGridOpacity,
        rectBackgroundColor: input.visuals.rectBackgroundColor,
        dropPathOpacity: input.visuals.dropPathOpacity,
        pieceOutlineWidth: input.visuals.pieceOutlineWidth,
        nextPreviewCount: input.visuals.nextPreviewCount,
        nextPreviewCellScale: input.visuals.nextPreviewCellScale,
        holdPreviewCellScale: input.visuals.holdPreviewCellScale,
        previewFramed: input.visuals.previewFramed,
        sfxVolume: input.visuals.sfxVolume,
    });
    // Accept the names used by early layout prototypes when importing a save.
    if (flattened.nextPreviewCellScale === undefined) {
        flattened.nextPreviewCellScale = input.nextPreviewScale ?? input.previewCellScale;
    }
    if (flattened.holdPreviewCellScale === undefined) {
        flattened.holdPreviewCellScale = input.holdPreviewScale ?? input.previewCellScale;
    }
    if (flattened.widgetLayout === undefined) {
        flattened.widgetLayout = input.layout?.widgetLayout ?? input.layout;
    }
    // Before the contact split, wall friction also applied to the floor and
    // rocking deck. Copy it into the new platform field when importing an
    // older payload so existing physical profiles keep their behaviour.
    if ((flattened.structuralPlatformFriction === undefined || flattened.structuralPlatformFriction === null) &&
        Object.hasOwn(flattened, 'structuralWallFriction')) {
        flattened.structuralPlatformFriction = flattened.structuralWallFriction;
    }
    if (input.rocking) Object.assign(flattened, {
        rockingFrameWidthCells: input.rocking.frameWidthCells ?? input.rockingFrameWidthCells,
        rockingFrameHeadroomCells: input.rocking.frameHeadroomCells ?? input.rockingFrameHeadroomCells,
    });
    return flattened;
}

export function createDefaultSettings() {
    return deepClone(DEFAULT_SETTINGS);
}

export function normalizeSettings(rawSettings, { strict = false } = {}) {
    const input = flattenLegacySettings(rawSettings);
    // Strict normalization is used by the live game after validation and is
    // lossless for every accepted value.  The compatibility form remains
    // available to import old standalone payloads; it only repairs malformed
    // legacy data, never values which passed the live validator.
    if (strict) validateSettings(input);
    const defaults = DEFAULT_SETTINGS;
    const mode = TETRIS_MODES.includes(input.mode) ? input.mode : defaults.mode;
    const comboMode = ['release-lock', 'auto-slide-lock'].includes(input.comboMode)
        ? input.comboMode
        : defaults.comboMode;
    const phiSegments = strict
        ? Number(input.phiSegments ?? defaults.phiSegments)
        : integer(input.phiSegments, defaults.phiSegments, GRID_LIMITS.minColumns, GRID_LIMITS.maxColumns);
    const rSegments = strict
        ? Number(input.rSegments ?? defaults.rSegments)
        : integer(input.rSegments, defaults.rSegments, GRID_LIMITS.minRows, GRID_LIMITS.maxRows);
    const preset = findGridPreset(phiSegments, rSegments);
    const widgetLayout = normalizeWidgetLayout(input.widgetLayout, {
        defaults: DEFAULT_WIDGET_LAYOUT.assignments,
    });

    const orderWeights = {};
    const rawOrderWeights = input.orderWeights || {};
    for (let order = 1; order <= MAX_POLYOMINO_ORDER; order++) {
        orderWeights[order] = strict
            ? Number(rawOrderWeights[order] ?? defaults.orderWeights[order])
            : boundedNumber(rawOrderWeights[order], defaults.orderWeights[order], 0, Number.MAX_SAFE_INTEGER);
    }

    const pieceOverrides = {};
    const rawOverrides = input.pieceOverrides || {};
    for (const [id, rawWeight] of Object.entries(rawOverrides)) {
        const entry = POLYOMINO_CATALOG.byId.get(id);
        if (!entry) {
            if (strict) throw new Error(`Unknown polyomino override: ${id}.`);
            continue;
        }
        const value = strict
            ? Number(rawWeight)
            : boundedNumber(rawWeight, NaN, 0, Number.MAX_SAFE_INTEGER);
        if (!Number.isFinite(value)) continue;
        if (value !== orderWeights[entry.order]) pieceOverrides[id] = value;
    }

    return {
        mode,
        ruleMode: input.ruleMode === 'sprint' ? 'sprint' : 'survival',
        sprintLines: strict ? Number(input.sprintLines ?? defaults.sprintLines) : Math.round(boundedNumber(input.sprintLines, defaults.sprintLines, 1, 10000)),
        das: strict ? Number(input.das ?? defaults.das) : finiteNumber(input.das, defaults.das),
        arr: strict ? Number(input.arr ?? defaults.arr) : finiteNumber(input.arr, defaults.arr),
        quickMotionMultiplier: strict ? Number(input.quickMotionMultiplier ?? defaults.quickMotionMultiplier) : finiteNumber(input.quickMotionMultiplier, defaults.quickMotionMultiplier),
        softDropSpeed: strict ? Number(input.softDropSpeed ?? defaults.softDropSpeed) : finiteNumber(input.softDropSpeed, defaults.softDropSpeed),
        comboTime: strict ? Number(input.comboTime ?? defaults.comboTime) : finiteNumber(input.comboTime, defaults.comboTime),
        comboMode,
        initialSpeed: strict ? Number(input.initialSpeed ?? defaults.initialSpeed) : finiteNumber(input.initialSpeed, defaults.initialSpeed),
        speedIncrease: strict ? Number(input.speedIncrease ?? defaults.speedIncrease) : finiteNumber(input.speedIncrease, defaults.speedIncrease),
        initialLockDelay: strict ? Number(input.initialLockDelay ?? defaults.initialLockDelay) : finiteNumber(input.initialLockDelay, defaults.initialLockDelay),
        lockDelayDecrease: strict ? Number(input.lockDelayDecrease ?? defaults.lockDelayDecrease) : finiteNumber(input.lockDelayDecrease, defaults.lockDelayDecrease),
        phiSegments,
        rSegments,
        gridPreset: preset ? gridPresetValue(preset.columns, preset.rows) : 'custom',
        centralHoleColor: color(input.centralHoleColor, defaults.centralHoleColor),
        outerSpaceColor: color(input.outerSpaceColor, defaults.outerSpaceColor),
        lineClearDuration: strict ? Number(input.lineClearDuration ?? defaults.lineClearDuration) : finiteNumber(input.lineClearDuration, defaults.lineClearDuration),
        mobiusGridOpacity: strict ? Number(input.mobiusGridOpacity ?? defaults.mobiusGridOpacity) : boundedNumber(input.mobiusGridOpacity, defaults.mobiusGridOpacity, 0, 1),
        rectBackgroundColor: color(input.rectBackgroundColor, defaults.rectBackgroundColor),
        dropPathOpacity: strict ? Number(input.dropPathOpacity ?? defaults.dropPathOpacity) : boundedNumber(input.dropPathOpacity, defaults.dropPathOpacity, 0, 1),
        pieceOutlineWidth: strict ? Number(input.pieceOutlineWidth ?? defaults.pieceOutlineWidth) : boundedNumber(input.pieceOutlineWidth, defaults.pieceOutlineWidth, 0, 20),
        nextPreviewCount: strict ? Number(input.nextPreviewCount ?? defaults.nextPreviewCount) : integer(input.nextPreviewCount, defaults.nextPreviewCount, 1),
        nextPreviewCellScale: strict ? Number(input.nextPreviewCellScale ?? defaults.nextPreviewCellScale) : boundedNumber(input.nextPreviewCellScale, defaults.nextPreviewCellScale, 0.25, 8),
        holdPreviewCellScale: strict ? Number(input.holdPreviewCellScale ?? defaults.holdPreviewCellScale) : boundedNumber(input.holdPreviewCellScale, defaults.holdPreviewCellScale, 0.25, 8),
        previewFramed: input.previewFramed !== false,
        sfxVolume: strict ? Number(input.sfxVolume ?? defaults.sfxVolume) : boundedNumber(input.sfxVolume, defaults.sfxVolume, 0, 1),
        widgetLayout,
        structuralCellSizeMeters: strict ? Number(input.structuralCellSizeMeters ?? defaults.structuralCellSizeMeters) : boundedNumber(input.structuralCellSizeMeters, defaults.structuralCellSizeMeters, Number.MIN_VALUE),
        structuralBlockMassKg: strict ? Number(input.structuralBlockMassKg ?? defaults.structuralBlockMassKg) : boundedNumber(input.structuralBlockMassKg, defaults.structuralBlockMassKg, Number.MIN_VALUE),
        structuralGravity: strict ? Number(input.structuralGravity ?? defaults.structuralGravity) : boundedNumber(input.structuralGravity, defaults.structuralGravity, Number.MIN_VALUE),
        structuralPieceFriction: strict ? Number(input.structuralPieceFriction ?? defaults.structuralPieceFriction) : boundedNumber(input.structuralPieceFriction, defaults.structuralPieceFriction, 0),
        structuralRecoveryTolerance: strict ? Number(input.structuralRecoveryTolerance ?? defaults.structuralRecoveryTolerance) : boundedNumber(input.structuralRecoveryTolerance, defaults.structuralRecoveryTolerance, 0, 0.49),
        structuralPlatformFriction: strict ? Number(input.structuralPlatformFriction ?? defaults.structuralPlatformFriction) : boundedNumber(input.structuralPlatformFriction, defaults.structuralPlatformFriction, 0),
        structuralWallFriction: strict ? Number(input.structuralWallFriction ?? defaults.structuralWallFriction) : boundedNumber(input.structuralWallFriction, defaults.structuralWallFriction, 0),
        rockingArcDegrees: strict ? Number(input.rockingArcDegrees ?? defaults.rockingArcDegrees) : boundedNumber(input.rockingArcDegrees, defaults.rockingArcDegrees, 5, 180),
        rockingMassKg: strict ? Number(input.rockingMassKg ?? defaults.rockingMassKg) : boundedNumber(input.rockingMassKg, defaults.rockingMassKg, 0.001),
        rockingRollingFriction: strict ? Number(input.rockingRollingFriction ?? defaults.rockingRollingFriction) : boundedNumber(input.rockingRollingFriction, defaults.rockingRollingFriction, 0),
        rockingCollapseMassKg: strict ? Number(input.rockingCollapseMassKg ?? defaults.rockingCollapseMassKg) : boundedNumber(input.rockingCollapseMassKg, defaults.rockingCollapseMassKg, 0.001),
        rockingLengthCells: strict ? Number(input.rockingLengthCells ?? defaults.rockingLengthCells) : integer(input.rockingLengthCells, defaults.rockingLengthCells, 1, 256),
        rockingFrameWidthCells: strict ? Number(input.rockingFrameWidthCells ?? defaults.rockingFrameWidthCells) : boundedNumber(input.rockingFrameWidthCells, defaults.rockingFrameWidthCells, 0, 256),
        rockingFrameHeadroomCells: strict ? Number(input.rockingFrameHeadroomCells ?? defaults.rockingFrameHeadroomCells) : boundedNumber(input.rockingFrameHeadroomCells, defaults.rockingFrameHeadroomCells, 0, 256),
        rockingAllowOverhang: input.rockingAllowOverhang === true,
        structuralStabilityMarginCells: 0, // Migrate the obsolete artificial support inset.
        structuralToppleDampingPerSecond: strict ? Number(input.structuralToppleDampingPerSecond ?? defaults.structuralToppleDampingPerSecond) : boundedNumber(input.structuralToppleDampingPerSecond, defaults.structuralToppleDampingPerSecond, 0),
        structuralToppleInitialAngularSpeed: strict ? Number(input.structuralToppleInitialAngularSpeed ?? defaults.structuralToppleInitialAngularSpeed) : boundedNumber(input.structuralToppleInitialAngularSpeed, defaults.structuralToppleInitialAngularSpeed, 0),
        structuralToppleGameOverAngleDegrees: strict ? Number(input.structuralToppleGameOverAngleDegrees ?? defaults.structuralToppleGameOverAngleDegrees) : boundedNumber(input.structuralToppleGameOverAngleDegrees, defaults.structuralToppleGameOverAngleDegrees, Number.MIN_VALUE),
        structuralToppleMaximumSeconds: strict ? Number(input.structuralToppleMaximumSeconds ?? defaults.structuralToppleMaximumSeconds) : boundedNumber(input.structuralToppleMaximumSeconds, defaults.structuralToppleMaximumSeconds, Number.MIN_VALUE),
        orderWeights,
        pieceOverrides,
    };
}

/**
 * Validate values which are genuinely part of the mathematical domain of the
 * Tetris model.  In particular, speed and lock-delay rates intentionally have
 * no artificial upper bound: values above 100% simply make later levels
 * slower instead of being silently reset to 100%.
 */
export function validateSettings(rawSettings = {}) {
    const input = flattenLegacySettings(rawSettings);
    if (!TETRIS_MODES.includes(input.mode ?? DEFAULT_SETTINGS.mode)) {
        throw new Error('Tetris mode is invalid.');
    }
    if (!['release-lock', 'auto-slide-lock'].includes(input.comboMode ?? DEFAULT_SETTINGS.comboMode)) {
        throw new Error('Down + Arrow combo mode is invalid.');
    }
    requireFiniteNumber(input.das ?? DEFAULT_SETTINGS.das, 'DAS', { minimum: 0 });
    if (!['survival', 'sprint'].includes(input.ruleMode ?? 'survival')) throw new Error('Invalid Tetris rules.');
    requireFiniteNumber(input.sprintLines ?? 40, 'Sprint target rows', { minimum: 1, maximum: 10000 });
    if (!Number.isInteger(Number(input.sprintLines ?? 40))) throw new Error('Sprint target rows must be an integer.');
    // Zero ARR means repeat as fast as the frame-step safety budget permits.
    // A zero quick multiplier disables the optional quick boost, and a zero
    // soft-drop multiplier disables soft-drop acceleration. All three are
    // finite, well-defined gameplay settings rather than invalid numbers.
    requireFiniteNumber(input.arr ?? DEFAULT_SETTINGS.arr, 'ARR', { minimum: 0 });
    requireFiniteNumber(input.quickMotionMultiplier ?? DEFAULT_SETTINGS.quickMotionMultiplier, 'Quick Motion Multiplier', { minimum: 0 });
    requireFiniteNumber(input.softDropSpeed ?? DEFAULT_SETTINGS.softDropSpeed, 'Soft Drop Speed', { minimum: 0 });
    requireFiniteNumber(input.comboTime ?? DEFAULT_SETTINGS.comboTime, 'Combo Time', { minimum: 0 });
    // A zero interval is a valid “as fast as safely possible” profile. The
    // gravity loop caps zero-time steps per frame, so this cannot hang.
    requireFiniteNumber(input.initialSpeed ?? DEFAULT_SETTINGS.initialSpeed, 'Initial Speed', { minimum: 0 });
    // A zero rate means "do not scale speed when the level changes".  It is
    // not an invalid/instantaneous timer; the level-update code uses a
    // neutral multiplier for it.
    requireFiniteNumber(input.speedIncrease ?? DEFAULT_SETTINGS.speedIncrease, 'Speed Increase Rate', { minimum: 0 });
    requireFiniteNumber(input.initialLockDelay ?? DEFAULT_SETTINGS.initialLockDelay, 'Initial Lock Delay', { minimum: 0 });
    requireFiniteNumber(input.lockDelayDecrease ?? DEFAULT_SETTINGS.lockDelayDecrease, 'Lock Delay Decrease Rate', { minimum: 0 });
    const usesMobiusCache = (input.mode ?? DEFAULT_SETTINGS.mode) === 'mobius';
    // Cartesian/circular boards have no topology-imposed minimum.  Möbius
    // uses the precomputed double-traversal mesh, whose finite cache domain is
    // deliberately explicit and reported here instead of silently clamping.
    requireInteger(input.phiSegments ?? DEFAULT_SETTINGS.phiSegments, 'Grid Width (cells)', usesMobiusCache
        ? { minimum: GRID_LIMITS.minColumns, maximum: GRID_LIMITS.maxColumns }
        : { minimum: 1 });
    requireInteger(input.rSegments ?? DEFAULT_SETTINGS.rSegments, 'Grid Height (cells)', usesMobiusCache
        ? { minimum: GRID_LIMITS.minRows, maximum: GRID_LIMITS.maxRows }
        : { minimum: 1 });
    // Zero is an intentional instant-clear mode; the update path handles it
    // without entering the animation loop.
    requireFiniteNumber(input.lineClearDuration ?? DEFAULT_SETTINGS.lineClearDuration, 'Line Clear Effect Duration', { minimum: 0 });
    requireFiniteNumber(input.mobiusGridOpacity ?? DEFAULT_SETTINGS.mobiusGridOpacity, 'Möbius Grid Opacity', { minimum: 0, maximum: 1 });
    requireFiniteNumber(input.dropPathOpacity ?? DEFAULT_SETTINGS.dropPathOpacity, 'Drop Path Opacity', { minimum: 0, maximum: 1 });
    requireFiniteNumber(input.pieceOutlineWidth ?? DEFAULT_SETTINGS.pieceOutlineWidth, 'Piece Outline Width', { minimum: 0, maximum: 20 });
    requireInteger(input.nextPreviewCount ?? DEFAULT_SETTINGS.nextPreviewCount, 'Next Pieces Shown', { minimum: 1 });
    requireFiniteNumber(input.nextPreviewCellScale ?? DEFAULT_SETTINGS.nextPreviewCellScale, 'Next Preview Cell Scale', { minimum: 0.25, maximum: 8 });
    requireFiniteNumber(input.holdPreviewCellScale ?? DEFAULT_SETTINGS.holdPreviewCellScale, 'Hold Preview Cell Scale', { minimum: 0.25, maximum: 8 });
    requireFiniteNumber(input.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume, 'Sound Effects Volume', { minimum: 0, maximum: 1 });
    if (input.previewFramed !== undefined && typeof input.previewFramed !== 'boolean') {
        throw new Error('Frame Preview Boxes must be a boolean.');
    }

    for (const [key, label] of [
        ['centralHoleColor', 'Central-hole color'],
        ['outerSpaceColor', 'Outer-space color'],
        ['rectBackgroundColor', 'Rectangular background color'],
    ]) {
        const value = input[key] ?? DEFAULT_SETTINGS[key];
        if (!/^#[0-9a-f]{6}$/i.test(String(value))) throw new Error(`${label} must be a six-digit hexadecimal colour such as #336699.`);
    }

    const positiveFields = [
        ['structuralCellSizeMeters', 'Cell Size'],
        ['structuralBlockMassKg', 'Mass per Cell'],
        ['structuralGravity', 'Structural Gravity'],
        ['structuralToppleMaximumSeconds', 'Maximum Topple Time'],
    ];
    for (const [key, label] of positiveFields) {
        if (key === 'structuralGravity') requireFiniteNumber(input[key] ?? DEFAULT_SETTINGS[key], label, { minimum: 0 });
        else requirePositiveNumber(input[key] ?? DEFAULT_SETTINGS[key], label);
    }
    for (const key of ['structuralPieceFriction', 'structuralPlatformFriction', 'structuralWallFriction', 'rockingRollingFriction'])
        requireFiniteNumber(input[key] ?? DEFAULT_SETTINGS[key], key, { minimum: 0 });
    requireInteger(input.rockingLengthCells ?? DEFAULT_SETTINGS.rockingLengthCells, 'Grid Width (cells)', { minimum: 1, maximum: 256 });
    requireFiniteNumber(input.rockingArcDegrees ?? DEFAULT_SETTINGS.rockingArcDegrees, 'Platform Arc Angle', { minimum: 5, maximum: 180 });
    requirePositiveNumber(input.rockingMassKg ?? DEFAULT_SETTINGS.rockingMassKg, 'Platform Mass');
    requireFiniteNumber(input.structuralRecoveryTolerance ?? DEFAULT_SETTINGS.structuralRecoveryTolerance, 'Recovery vertex tolerance', { minimum: 0, maximum: 0.49 });
    requirePositiveNumber(input.rockingCollapseMassKg ?? DEFAULT_SETTINGS.rockingCollapseMassKg, 'Collapse Mass');
    requireFiniteNumber(input.rockingFrameWidthCells ?? DEFAULT_SETTINGS.rockingFrameWidthCells, 'Frame Width', { minimum: 0, maximum: 256 });
    requireFiniteNumber(input.rockingFrameHeadroomCells ?? DEFAULT_SETTINGS.rockingFrameHeadroomCells, 'Frame Headroom', { minimum: 0, maximum: 256 });
    if (input.rockingAllowOverhang !== undefined && typeof input.rockingAllowOverhang !== 'boolean') throw new Error('Allow Side Overhangs must be a boolean.');
    requireFiniteNumber(input.structuralStabilityMarginCells ?? DEFAULT_SETTINGS.structuralStabilityMarginCells, 'Required Support Margin', { minimum: 0, maximum: 0.5 });
    requireFiniteNumber(input.structuralToppleDampingPerSecond ?? DEFAULT_SETTINGS.structuralToppleDampingPerSecond, 'Angular Damping', { minimum: 0 });
    requireFiniteNumber(input.structuralToppleInitialAngularSpeed ?? DEFAULT_SETTINGS.structuralToppleInitialAngularSpeed, 'Initial Topple Speed', { minimum: 0 });
    requireFiniteNumber(input.structuralToppleGameOverAngleDegrees ?? DEFAULT_SETTINGS.structuralToppleGameOverAngleDegrees, 'Game Over Angle', { minimum: 0, maximum: 180 });

    for (let order = 1; order <= MAX_POLYOMINO_ORDER; order++) {
        requireFiniteNumber(input.orderWeights?.[order] ?? DEFAULT_SETTINGS.orderWeights[order], `${order}-omino probability factor`, { minimum: 0 });
    }
    for (const [id, value] of Object.entries(input.pieceOverrides || {})) {
        if (!POLYOMINO_CATALOG.byId.has(id)) throw new Error(`Unknown polyomino override: ${id}.`);
        requireFiniteNumber(value, `Probability factor for ${id}`, { minimum: 0 });
    }
    return true;
}

export function getDefaultBindings() {
    const bindings = {};
    for (const control of CONTROL_DEFINITIONS) {
        bindings[control.action] = [{
            type: 'keyboard',
            code: control.code,
            key: control.key,
            match: control.match || 'key',
        }];
    }
    return bindings;
}

export function normalizeBindings(rawBindings) {
    const defaults = getDefaultBindings();
    const result = {};
    for (const control of CONTROL_DEFINITIONS) {
        const candidate = rawBindings?.[control.action];
        if (!Array.isArray(candidate) || !candidate.length) {
            result[control.action] = defaults[control.action].map(binding => ({ ...binding }));
            continue;
        }
        result[control.action] = candidate.map(binding => {
            // ESC belongs to the WW pause menu now. Any saved ReRoMo pause
            // binding that still points at ESC is migrated to the physical key
            // immediately below it (Backquote on the browser event model).
            if (control.action === 'pause' && binding?.type === 'keyboard' &&
                (binding.code === 'Escape' || String(binding.key).toLocaleLowerCase('en-US') === 'escape')) {
                return { ...defaults.pause[0] };
            }
            // Migrate the code-only defaults written by the first WW integration
            // back to the original KeyboardEvent.key semantics. Custom code-only
            // remaps remain physical-key bindings until the user remaps them again.
            if (binding?.type === 'keyboard' && binding.code === control.code &&
                (control.match || 'key') === 'key' &&
                binding.match !== 'key' && typeof binding.key !== 'string') {
                return { ...defaults[control.action][0] };
            }
            if (control.action === 'pause' && binding?.type === 'keyboard' &&
                binding.code === control.code && binding.key === control.key) {
                return { ...defaults.pause[0] };
            }
            return { ...binding };
        });
    }
    return result;
}

function oldKeyToCode(key) {
    if (key === ' ') return 'Space';
    if (/^[a-z]$/i.test(key || '')) return `Key${key.toUpperCase()}`;
    if (/^[0-9]$/.test(key || '')) return `Digit${key}`;
    return key;
}

export function importPayload(payload) {
    const wrapped = payload?.settings ? payload : { settings: payload, bindings: null };
    const settings = normalizeSettings(wrapped.settings, { strict: true });
    let bindings = wrapped.bindings ? normalizeBindings(wrapped.bindings) : null;

    // Original standalone exports stored KeyboardEvent.key values inside settings.controls.
    if (!bindings && wrapped.settings?.controls) {
        bindings = getDefaultBindings();
        for (const control of CONTROL_DEFINITIONS) {
            const oldKey = wrapped.settings.controls[control.action];
            if (typeof oldKey === 'string') {
                bindings[control.action] = [{
                    type: 'keyboard',
                    code: oldKeyToCode(oldKey),
                    key: oldKey,
                    match: 'key',
                }];
            }
        }
        bindings = normalizeBindings(bindings);
    }
    return { settings, bindings };
}

export function exportPayload(settings, bindings) {
    return {
        format: 'WW Mini Games / ReRoMo Tetris settings',
        version: 1,
        settings: normalizeSettings(settings, { strict: true }),
        bindings: normalizeBindings(bindings),
    };
}

export function settingsRecordKey(settings) {
    const normalized = normalizeSettings(settings, { strict: true });
    const overrides = Object.entries(normalized.pieceOverrides).sort(([a], [b]) => a.localeCompare(b));
    const recordSettings = {
        mode: normalized.mode,
        comboMode: normalized.comboMode,
        initialSpeed: normalized.initialSpeed,
        speedIncrease: normalized.speedIncrease,
        initialLockDelay: normalized.initialLockDelay,
        lockDelayDecrease: normalized.lockDelayDecrease,
        phiSegments: normalized.phiSegments,
        rSegments: normalized.rSegments,
        nextPreviewCount: normalized.nextPreviewCount,
        orderWeights: normalized.orderWeights,
        pieceOverrides: overrides,
    };
    if (normalized.ruleMode === 'sprint') Object.assign(recordSettings, { ruleMode: 'sprint', sprintLines: normalized.sprintLines });
    // Structural parameters define a distinct physical ruleset, but changing
    // an inactive structural profile must not split records in other modes.
    if (isStructuralMode(normalized.mode)) Object.assign(recordSettings, {
        structuralCellSizeMeters: normalized.structuralCellSizeMeters,
        structuralBlockMassKg: normalized.structuralBlockMassKg,
        structuralGravity: normalized.structuralGravity,
        structuralModelVersion: 4,
        structuralPieceFriction: normalized.structuralPieceFriction,
        structuralRecoveryTolerance: normalized.structuralRecoveryTolerance,
        structuralPlatformFriction: normalized.structuralPlatformFriction,
        structuralWallFriction: normalized.structuralWallFriction,
    });
    if (isRockingMode(normalized.mode)) Object.assign(recordSettings, {
        phiSegments: normalized.rockingLengthCells,
        rockingLengthCells: normalized.rockingLengthCells, rockingArcDegrees: normalized.rockingArcDegrees,
        rockingMassKg: normalized.rockingMassKg, rockingRollingFriction: normalized.rockingRollingFriction,
        rockingAllowOverhang: normalized.rockingAllowOverhang,
        ...(normalized.mode === 'rocking-pressure' ? { rockingCollapseMassKg: normalized.rockingCollapseMassKg } : {}),
    });
    return JSON.stringify(recordSettings);
}

export function getFrameworkSettingsSchema() {
    const fields = SETTINGS_GROUPS.flatMap(group => group.fields.map(field => ({
        ...field,
        group: group.title,
        default: deepClone(DEFAULT_SETTINGS[field.key]),
    })));
    fields.push({
        key: 'orderWeights',
        label: 'Piece Probability Factors',
        type: 'game-custom',
        customKind: 'polyomino-weights',
        group: 'Piece Probability Factors',
        fullWidth: true,
        default: deepClone(DEFAULT_SETTINGS.orderWeights),
    });
    // Individual overrides are edited by the custom detail page launched from
    // the standard settings panel, but they remain a first-class persisted
    // setting so no existing configuration is lost.
    fields.push({
        key: 'pieceOverrides',
        label: 'Individual Piece Factors',
        type: 'hidden',
        default: deepClone(DEFAULT_SETTINGS.pieceOverrides),
    });
    return fields;
}

export function getFrameworkControlsSchema() {
    return CONTROL_DEFINITIONS.map(control => ({
        action: control.action,
        label: control.label,
        defaultBindings: [{
            type: 'keyboard',
            code: control.code,
            key: control.key,
            match: control.match || 'key',
        }],
    }));
}
