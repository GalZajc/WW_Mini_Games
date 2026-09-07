import { BaseGame } from '../../core/BaseGame.js';
import {
    requireFiniteNumber,
    requireOrderedRange,
    requirePositiveNumber,
} from '../../core/SettingsValidation.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import SphericalBowl3DModeGame from './game-3d.js';
import SphericalBowl2DModeGame from './game-2d.js';
import {
    BOWL_SHARED_DEFAULTS,
    stepSlidingSurfaceBody,
    surfaceRadialFraction,
} from './physics.js';

export const BOWL_BALANCE_DEFAULTS = Object.freeze({
    gravity: BOWL_SHARED_DEFAULTS.gravity,
    bowlRadius: BOWL_SHARED_DEFAULTS.bowlRadius,
    bandInnerFraction: BOWL_SHARED_DEFAULTS.bandInnerFraction,
    bandOuterFraction: BOWL_SHARED_DEFAULTS.bandOuterFraction,
    slidingDamping: BOWL_SHARED_DEFAULTS.pointViscousDamping,
    pointFrictionCoefficient: BOWL_SHARED_DEFAULTS.pointFrictionCoefficient,
    maximumBowlAcceleration: BOWL_SHARED_DEFAULTS.maximumBowlAcceleration,
    movementRange: BOWL_SHARED_DEFAULTS.movementRange,
});

export function readBowlBalanceSettings(settings = {}) {
    const source = { ...BOWL_BALANCE_DEFAULTS, ...(settings || {}) };
    return Object.freeze(Object.fromEntries(
        Object.keys(BOWL_BALANCE_DEFAULTS).map(key => [key, Number(source[key])]),
    ));
}

export function validateBowlBalanceSettings(settings = {}) {
    const source = { ...BOWL_BALANCE_DEFAULTS, ...(settings || {}) };
    validateActiveSettings({
        ...source,
        pointViscousDamping: source.pointViscousDamping ?? source.slidingDamping,
        variant: 'balance', bodyType: 'point', dimensions: 3,
    });
    return source;
}

export const bowlRadialFraction = (position, parameters = {}) => {
    if (parameters.bowlRadius
        && Math.abs(Math.hypot(position.x, position.y, position.z) - parameters.bowlRadius) > 1e-8) {
        return Math.hypot(position.x, position.z) / parameters.bowlRadius;
    }
    return surfaceRadialFraction(position);
};

export function stepSphericalBowlParticle(state, bowlAcceleration, parameters, dt) {
    return stepSlidingSurfaceBody(state, bowlAcceleration, {
        ...BOWL_SHARED_DEFAULTS,
        ...parameters,
        pointViscousDamping: parameters.pointViscousDamping
            ?? parameters.slidingDamping
            ?? BOWL_SHARED_DEFAULTS.pointViscousDamping,
        pointFrictionCoefficient: parameters.pointFrictionCoefficient ?? 0,
    }, dt);
}

const MODES = Object.freeze({
    'balance-point-3d': {
        label: 'Sliding Puck Balance 3D', description: 'Slide a tiny non-rolling puck from the bottom into the upper red band and keep it there.',
        artKey: 'bowl-balance-puck-3d', prefix: 'bp3', variant: 'balance', bodyType: 'point', dimensions: 3, GameClass: SphericalBowl3DModeGame,
    },
    'balance-marble-3d': {
        label: 'Rolling Marble Balance 3D', description: 'Balance a solid marble with static friction, rolling resistance and physical slipping.',
        artKey: 'bowl-balance-marble-3d', prefix: 'bm3', variant: 'balance', bodyType: 'marble', dimensions: 3, GameClass: SphericalBowl3DModeGame,
    },
    'distance-point-3d': {
        label: 'Puck Distance 3D', description: 'Move the bowl inside its circle, throw the puck over the rim and land as far away as possible.',
        artKey: 'bowl-distance-puck-3d', prefix: 'dp3', variant: 'distance', bodyType: 'point', dimensions: 3, GameClass: SphericalBowl3DModeGame,
    },
    'distance-marble-3d': {
        label: 'Marble Distance 3D', description: 'Build rolling momentum, allow slip when adhesion fails, and launch the marble for distance.',
        artKey: 'bowl-distance-marble-3d', prefix: 'dm3', variant: 'distance', bodyType: 'marble', dimensions: 3, GameClass: SphericalBowl3DModeGame,
    },
    'target-point-3d': {
        label: 'Puck Target 3D', description: 'Launch the sliding puck from the movement circle and land closest to the random target.',
        artKey: 'bowl-target-puck-3d', prefix: 'tp3', variant: 'target', bodyType: 'point', dimensions: 3, GameClass: SphericalBowl3DModeGame,
    },
    'target-marble-3d': {
        label: 'Marble Target 3D', description: 'Use rolling and controlled slip to land the marble closest to the random target.',
        artKey: 'bowl-target-marble-3d', prefix: 'tm3', variant: 'target', bodyType: 'marble', dimensions: 3, GameClass: SphericalBowl3DModeGame,
    },
    'distance-point-2d': {
        label: 'Puck Distance 2D', description: 'A side-view puck launch with the bowl constrained to a horizontal interval.',
        artKey: 'bowl-distance-puck-2d', prefix: 'dp2', variant: 'distance', bodyType: 'point', dimensions: 2, GameClass: SphericalBowl2DModeGame,
    },
    'distance-marble-2d': {
        label: 'Marble Distance 2D', description: 'The rolling-and-slipping marble launch reduced to a precise side-view simulation.',
        artKey: 'bowl-distance-marble-2d', prefix: 'dm2', variant: 'distance', bodyType: 'marble', dimensions: 2, GameClass: SphericalBowl2DModeGame,
    },
    'target-point-2d': {
        label: 'Puck Target 2D', description: 'Throw the side-view puck toward a target randomly placed left or right of the movement interval.',
        artKey: 'bowl-target-puck-2d', prefix: 'tp2', variant: 'target', bodyType: 'point', dimensions: 2, GameClass: SphericalBowl2DModeGame,
    },
    'target-marble-2d': {
        label: 'Marble Target 2D', description: 'Roll, slip and launch a marble toward the random side-view target.',
        artKey: 'bowl-target-marble-2d', prefix: 'tm2', variant: 'target', bodyType: 'marble', dimensions: 2, GameClass: SphericalBowl2DModeGame,
    },
});

function commonFields() {
    const d = BOWL_SHARED_DEFAULTS;
    return [
        { key: 'gravity', label: 'Gravity [m/s²]', type: 'range', min: 0, step: 0.05, default: d.gravity, group: 'World' },
        { key: 'bowlRadius', label: 'Bowl radius [m]', type: 'range', min: Number.MIN_VALUE, step: 0.05, default: d.bowlRadius, group: 'Geometry' },
        { key: 'maximumBowlAcceleration', label: 'Maximum inferred bowl acceleration [m/s²]', type: 'range', min: 0, step: 1, default: d.maximumBowlAcceleration, group: 'Mouse motion' },
    ];
}

function bodyFields(bodyType) {
    const d = BOWL_SHARED_DEFAULTS;
    return bodyType === 'marble' ? [
        { key: 'marbleRadius', label: 'Marble radius [m]', type: 'range', min: Number.MIN_VALUE, step: 0.01, default: d.marbleRadius, group: 'Marble contact' },
        { key: 'staticFrictionCoefficient', label: 'Static adhesion coefficient μₛ', type: 'range', min: 0, step: 0.01, default: d.staticFrictionCoefficient, group: 'Marble contact' },
        { key: 'rollingFrictionCoefficient', label: 'Rolling-friction coefficient', type: 'range', min: 0, step: 0.001, default: d.rollingFrictionCoefficient, group: 'Marble contact' },
    ] : [
        { key: 'pointFrictionCoefficient', label: 'Puck friction coefficient', type: 'range', min: 0, step: 0.005, default: d.pointFrictionCoefficient, group: 'Puck contact' },
        { key: 'pointViscousDamping', label: 'Puck viscous damping [1/s]', type: 'range', min: 0, step: 0.01, default: d.pointViscousDamping, group: 'Puck contact' },
    ];
}

function modeFields(info) {
    const d = BOWL_SHARED_DEFAULTS;
    const fields = [...commonFields(), ...bodyFields(info.bodyType)];
    if (info.variant === 'balance') {
        fields.push(
            { key: 'bandInnerFraction', label: 'Red band start radius / R', type: 'range', min: 0, max: 1, step: 0.005, default: d.bandInnerFraction, group: 'Target band' },
            { key: 'bandOuterFraction', label: 'Red band end radius / R', type: 'range', min: 0, max: 1, step: 0.005, default: d.bandOuterFraction, group: 'Target band' },
            { key: 'movementRange', label: 'Mouse movement range [m]', type: 'range', min: 0, step: 0.1, default: d.movementRange, group: 'Mouse motion' },
        );
    } else {
        fields.push(
            { key: 'bowlTheta', label: 'Bowl opening angle θ [rad]', type: 'range', min: 0, max: Math.PI, step: 0.01, default: d.bowlTheta, group: 'Geometry' },
            { key: 'movementCircleRadius', label: 'Allowed movement-circle radius [m]', type: 'range', min: 0, step: 0.1, default: d.movementCircleRadius, group: 'Mouse motion' },
        );
    }
    return fields;
}

function validateActiveSettings(settings) {
    requireFiniteNumber(settings.gravity, 'Gravity', { minimum: 0 });
    requirePositiveNumber(settings.bowlRadius, 'Bowl radius');
    requireFiniteNumber(settings.maximumBowlAcceleration, 'Maximum bowl acceleration', { minimum: 0 });
    if (settings.bodyType === 'marble') {
        const radius = requirePositiveNumber(settings.marbleRadius, 'Marble radius');
        if (radius >= Number(settings.bowlRadius)) throw new Error('Marble radius must be smaller than the bowl radius.');
        requireFiniteNumber(settings.staticFrictionCoefficient, 'Static adhesion coefficient', { minimum: 0 });
        requireFiniteNumber(settings.rollingFrictionCoefficient, 'Rolling-friction coefficient', { minimum: 0 });
    } else {
        requireFiniteNumber(settings.pointFrictionCoefficient, 'Puck friction coefficient', { minimum: 0 });
        requireFiniteNumber(settings.pointViscousDamping, 'Puck viscous damping', { minimum: 0 });
    }
    if (settings.variant === 'balance') {
        requireOrderedRange(settings.bandInnerFraction, settings.bandOuterFraction, 'Red band start', 'Red band end');
        requireFiniteNumber(settings.bandInnerFraction, 'Red band start', { minimum: 0, maximum: 1 });
        requireFiniteNumber(settings.bandOuterFraction, 'Red band end', { minimum: 0, maximum: 1 });
        requireFiniteNumber(settings.movementRange, 'Mouse movement range', { minimum: 0 });
    } else {
        requireFiniteNumber(settings.bowlTheta, 'Bowl opening angle', { minimum: 0, maximum: Math.PI });
        requireFiniteNumber(settings.movementCircleRadius, 'Movement-circle radius', { minimum: 0 });
    }
    return settings;
}

function prefixedFields(mode, info) {
    return modeFields(info).map(field => ({
        ...field,
        key: `${info.prefix}_${field.key}`,
        group: field.group,
        modes: [mode],
    }));
}

export default class SphericalBowlGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.mode = null;
        this.child = null;
        this.phase = 'mode-select';
        if (this._modeChosenForSession && MODES[this.settings.mode]) this._startMode(this.settings.mode);
        else this._showModeSelector();
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        const selectedMode = MODES[this.settings.mode] ? this.settings.mode : 'distance-marble-3d';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Spherical Bowl', prompt: 'Choose body, objective and dimensions', selectedMode,
            modes: Object.entries(MODES).map(([key, info]) => ({ key, title: info.label, description: info.description, artKey: info.artKey })),
        });
        document.body.appendChild(this.modeSelector);
        this._selectorClick = bindModeGallery(this.modeSelector, {
            onMode: mode => { this._modeChosenForSession = true; this._startMode(mode); },
            onBack: () => this.endGame(),
        });
    }

    _activeSettings(settings, mode) {
        const info = MODES[mode];
        return Object.fromEntries(modeFields(info).map(field => [
            field.key, settings[`${info.prefix}_${field.key}`] ?? field.default,
        ]));
    }

    _runtimeSettings(settings, mode) {
        const info = MODES[mode];
        return { ...this._activeSettings(settings, mode), variant: info.variant, bodyType: info.bodyType, dimensions: info.dimensions };
    }

    _startMode(mode) {
        const info = MODES[mode];
        if (!info) return false;
        const runtime = this._runtimeSettings(this.settings, mode);
        validateActiveSettings(runtime);
        this._destroyChild();
        this.settings.mode = mode;
        this.app.currentSettings = { ...this.settings };
        this.app.settingsManager.save('spherical-bowl-balance', this.settings).catch(() => {});
        this.modeSelector?.remove();
        this.modeSelector = null;
        this.mode = mode;
        this.phase = 'playing';
        let canvas = this.canvas;
        let context = null;
        if (info.dimensions === 2) {
            this.modeCanvas = document.createElement('canvas');
            this.modeCanvas.style.cssText = 'position:fixed;inset:0;z-index:700;width:100%;height:100%;display:block;';
            this.modeCanvas.width = window.innerWidth;
            this.modeCanvas.height = window.innerHeight;
            document.body.appendChild(this.modeCanvas);
            canvas = this.modeCanvas;
            context = canvas.getContext('2d');
        }
        const recordSettings = this.getRecordSettings({ ...this.settings, mode });
        const childApp = {
            ...this.app,
            currentSettings: runtime,
            records: { getBest: (_id, _settings, key, direction = 'max') => this.app.records.getBest('spherical-bowl-balance', recordSettings, key, direction) },
        };
        this.child = new info.GameClass();
        this.child._setup(canvas, context, this.input, this.audio, runtime,
            results => this.submitScore({ ...results, mode }), () => this.endGame(),
            this.network, childApp, this.mobile);
        return true;
    }

    returnToModeSelector() {
        this._destroyChild();
        this._modeChosenForSession = false;
        this.mode = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    _destroyChild() {
        this.child?.destroy?.();
        this.child = null;
        this.modeCanvas?.remove();
        this.modeCanvas = null;
    }

    update(dt) { this.child?.update?.(dt); }
    render() { this.child?.render?.(); }
    onPause() { this.child?.onPause?.(); }
    onResume() { this.child?.onResume?.(); }
    onResize(width, height) {
        if (this.modeCanvas) { this.modeCanvas.width = width; this.modeCanvas.height = height; }
        this.child?.onResize?.(width, height);
    }
    wantsPointerLockNow() { return false; }
    destroy() {
        this.modeSelector?.remove();
        this.modeSelector = null;
        this._destroyChild();
        this.mode = null;
    }

    preparePauseSettings(settings) {
        const mode = settings?.mode ?? this.mode ?? 'balance-point-3d';
        if (!MODES[mode]) throw new Error(`Spherical Bowl mode is invalid: ${mode}.`);
        validateActiveSettings(this._runtimeSettings(settings, mode));
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        const mode = settings?.mode ?? this.mode ?? 'distance-marble-3d';
        if (!MODES[mode]) throw new Error(`Spherical Bowl mode is invalid: ${mode}.`);
        return { mode, ...this._activeSettings(settings, mode) };
    }

    static getSettingsSchema() {
        return [
            { key: 'mode', label: 'Mode', type: 'hidden', default: 'distance-marble-3d' },
            ...Object.entries(MODES).flatMap(([mode, info]) => prefixedFields(mode, info)),
            { key: 'bowlModesVersion', label: 'Settings profile version', type: 'hidden', default: 3 },
        ];
    }

    static async migrateSettings(settings = {}) {
        if (Number(settings.bowlModesVersion ?? 0) >= 3) return settings;
        const migrated = { ...settings, bowlModesVersion: 3 };
        const legacyMap = {
            gravity: 'gravity', bowlRadius: 'bowlRadius', bandInnerFraction: 'bandInnerFraction',
            bandOuterFraction: 'bandOuterFraction', slidingDamping: 'pointViscousDamping',
            pointFrictionCoefficient: 'pointFrictionCoefficient', maximumBowlAcceleration: 'maximumBowlAcceleration',
            movementRange: 'movementRange',
        };
        for (const [legacy, current] of Object.entries(legacyMap)) {
            if (settings[legacy] !== undefined) migrated[`bp3_${current}`] = settings[legacy];
            delete migrated[legacy];
        }
        if (migrated.bp3_pointFrictionCoefficient === undefined) migrated.bp3_pointFrictionCoefficient = BOWL_SHARED_DEFAULTS.pointFrictionCoefficient;
        if (migrated.bp3_pointViscousDamping === undefined) migrated.bp3_pointViscousDamping = BOWL_SHARED_DEFAULTS.pointViscousDamping;
        if (!MODES[migrated.mode]) migrated.mode = 'distance-marble-3d';
        return migrated;
    }

    static getControlsSchema() {
        return [{
            action: 'start', label: 'Start / restart',
            defaultBindings: [{ type: 'keyboard', code: 'Space' }, { type: 'mouse', code: 0 }],
        }];
    }
}
