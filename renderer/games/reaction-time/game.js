import { BaseGame } from '../../core/BaseGame.js';
import { requireInteger } from '../../core/SettingsValidation.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';

const REACTION_MODES = Object.freeze({
    color: {
        title: 'Color Change',
        artKey: 'reaction-color',
        description: 'React when the dark screen flashes bright green.',
    },
    sound: {
        title: 'Sound',
        artKey: 'reaction-sound',
        description: 'React to the beep without relying on a visual cue.',
    },
    pendulum: {
        title: 'Pendulum Timing',
        artKey: 'reaction-pendulum',
        description: 'Estimate a chosen number of complete pendulum swings.',
    },
});

/**
 * Reaction Time — Three modes:
 *   1. Color   — screen changes from dark to bright, react ASAP
 *   2. Sound   — wait for a beep, react ASAP
 *   3. Pendulum — time exactly N full swings of a pendulum (start + stop)
 *
 * Settings:
 *   mode       — 'color' | 'sound' | 'pendulum'
 * Every mode owns a separate settings field; changing one mode can therefore
 * never alter another mode's difficulty or high-score identity.
 */
export default class ReactionTimeGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.preparePauseSettings(this.settings || {});
        if (Number(this.settings.reactionProfileVersion ?? 0) < 2) {
            const legacyAttempts = Number(this.settings.attempts ?? 5);
            const legacySwings = Number(this.settings.swings ?? 10);
            this.settings.colorAttempts = legacyAttempts;
            this.settings.soundAttempts = legacyAttempts;
            this.settings.pendulumSwings = legacySwings;
            this.settings.reactionProfileVersion = 2;
            delete this.settings.attempts;
            delete this.settings.swings;
            if (this.app) {
                this.app.currentSettings = { ...this.settings };
                this.app.settingsManager.save('reaction-time', this.settings).catch(() => {});
            }
        }
        // Validate again after legacy fields have been migrated; otherwise a
        // malformed old value could bypass the new mode-specific checks.
        this.preparePauseSettings(this.settings);
        if (!this._modeChosenForSession) {
            this.mode = null;
            this.phase = 'mode-select';
            this._showModeSelector();
            return;
        }
        this._initializeMode(REACTION_MODES[this.settings.mode] ? this.settings.mode : 'color');
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        const selectedMode = REACTION_MODES[this.settings.mode] ? this.settings.mode : 'color';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Reaction Time',
            prompt: 'Choose stimulus',
            selectedMode,
            modes: Object.entries(REACTION_MODES).map(([key, mode]) => ({ key, ...mode })),
        });
        document.body.appendChild(this.modeSelector);
        this._modeSelectorClick = bindModeGallery(this.modeSelector, {
            onMode: mode => this.selectMode(mode),
            onBack: () => this.endGame(),
        });
    }

    selectMode(mode) {
        if (!REACTION_MODES[mode]) return false;
        this.settings.mode = mode;
        this.app.currentSettings = { ...this.settings };
        this.app.settingsManager.save('reaction-time', this.settings).catch(() => {});
        this.modeSelector?.remove();
        this.modeSelector = null;
        this._modeChosenForSession = true;
        this._initializeMode(mode);
        return true;
    }

    returnToModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = null;
        this._modeChosenForSession = false;
        this.mode = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    _initializeMode(mode) {
        this.mode = mode;
        this.attempts = this.mode === 'sound'
            ? (this.settings.soundAttempts ?? 5)
            : (this.settings.colorAttempts ?? 5);
        this.swings = this.settings.pendulumSwings ?? 10;

        // Shared state
        this.results    = [];       // reaction times in ms
        this.attempt    = 0;        // current attempt (0-based)

        // Mode-specific
        this.phase       = 'intro'; // varies per mode
        this.waitDelay   = 0;       // random delay before stimulus
        this.waitTimer   = 0;
        this.reactionStart = 0;     // performance.now() when stimulus fires
        this.tooEarly    = false;

        // Pendulum
        this.pendAngle    = 0;
        this.pendOmega    = 0;       // angular frequency
        this.pendPeriod   = 0;
        this.pendLength   = 0;
        this.pendTime     = 0;
        this.pendStartT   = 0;
        this.pendStopT    = 0;
        this.pendMeasured = 0;
        this.pendActual   = 0;

        if (this.mode === 'pendulum') {
            this._initPendulum();
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Pendulum helpers                                          */
    /* ═══════════════════════════════════════════════════════════ */

    _initPendulum() {
        this.pendLength = Math.min(this.h, this.w) * 0.35;
        this.pendPeriod = 1.6; // seconds per full swing
        this.pendOmega  = (2 * Math.PI) / this.pendPeriod;
        this.pendActual = this.pendPeriod * this.swings;
        this.pendTime   = 0;
        this.pendAngle  = 0;
        this.phase      = 'intro'; // → 'watching' → 'timing' → 'result'
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Update                                                   */
    /* ═══════════════════════════════════════════════════════════ */

    update(dt) {
        if (this.phase === 'mode-select') return;
        if (this.mode === 'pendulum') {
            this._updatePendulum(dt);
        } else {
            this._updateReaction(dt);
        }
    }

    /* ── Color / Sound mode ─────────────────────────────────── */

    _updateReaction(dt) {
        switch (this.phase) {
            case 'intro':
                if (this.input.isActionJustDown('react')) {
                    this._startWait();
                }
                break;

            case 'waiting':
                this.waitTimer += dt;

                // Too early?
                if (this.input.isActionJustDown('react')) {
                    this.tooEarly = true;
                    this.phase = 'too-early';
                    this.audio.playTone(200, 0.2, 'square', 0.3);
                    return;
                }

                if (this.waitTimer >= this.waitDelay) {
                    // Fire stimulus!
                    this.phase = 'stimulus';
                    this.reactionStart = performance.now();
                    if (this.mode === 'sound') {
                        this.audio.playBeep(900, 0.25, 0.5);
                    }
                }
                break;

            case 'stimulus':
                if (this.input.isActionJustDown('react')) {
                    const ms = Math.round(performance.now() - this.reactionStart);
                    this.results.push(ms);
                    this.attempt++;
                    this.audio.playClick();

                    if (this.attempt >= this.attempts) {
                        this.phase = 'summary';
                        this._submitReactionResults();
                    } else {
                        this.phase = 'result-flash';
                        this._resultFlashTimer = 0;
                        this._lastResult = ms;
                    }
                }
                break;

            case 'result-flash':
                this._resultFlashTimer += dt;
                if (this._resultFlashTimer >= 1.2) {
                    this._startWait();
                }
                break;

            case 'too-early':
                if (this.input.isActionJustDown('react')) {
                    this._startWait();
                }
                break;

            case 'summary':
                if (this.input.isActionJustDown('react')) {
                    this.restart();
                }
                break;
        }
    }

    _startWait() {
        this.phase = 'waiting';
        this.tooEarly = false;
        this.waitDelay = 2 + Math.random() * 3; // 2–5 seconds
        this.waitTimer = 0;
    }

    _submitReactionResults() {
        const avg = Math.round(this.results.reduce((a, b) => a + b, 0) / this.results.length);
        const best = Math.min(...this.results);
        this.submitScore({
            mode: this.mode,
            attempts: this.results.length,
            times: [...this.results],
            average_ms: avg,
            best_ms: best,
        });
    }

    /* ── Pendulum mode ──────────────────────────────────────── */

    _updatePendulum(dt) {
        // Pendulum always swings (visual)
        this.pendTime += dt;
        const maxAngle = 0.5; // radians (~28°)
        this.pendAngle = maxAngle * Math.cos(this.pendOmega * this.pendTime);

        switch (this.phase) {
            case 'intro':
                if (this.input.isActionJustDown('react')) {
                    this.phase = 'watching';
                }
                break;

            case 'watching':
                // User presses to start the stopwatch
                if (this.input.isActionJustDown('react')) {
                    this.pendStartT = performance.now();
                    this.phase = 'timing';
                    this.audio.playClick();
                }
                break;

            case 'timing':
                // User presses to stop the stopwatch
                if (this.input.isActionJustDown('react')) {
                    this.pendStopT = performance.now();
                    this.pendMeasured = this.pendStopT - this.pendStartT;
                    this.phase = 'result';
                    this.audio.playClick();

                    const errorMs = Math.abs(this.pendMeasured - this.pendActual * 1000);
                    this.submitScore({
                        mode: 'pendulum',
                        swings: this.swings,
                        measured_ms: Math.round(this.pendMeasured),
                        actual_ms: Math.round(this.pendActual * 1000),
                        error_ms: Math.round(errorMs),
                    });
                }
                break;

            case 'result':
                if (this.input.isActionJustDown('react')) {
                    this.restart();
                }
                break;
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Render                                                   */
    /* ═══════════════════════════════════════════════════════════ */

    render() {
        if (this.phase === 'mode-select') return;
        if (this.mode === 'pendulum') {
            this._renderPendulum();
        } else {
            this._renderReaction();
        }
    }

    /* ── Color / Sound rendering ─────────────────────────────── */

    _paintSky(ctx, w, h) {
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#65caf5');
        sky.addColorStop(0.72, '#bdefff');
        sky.addColorStop(1, '#e8fbff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#4bc541';
        ctx.fillRect(0, h * 0.9, w, h * 0.1);
    }

    _renderReaction() {
        const ctx = this.ctx, w = this.w, h = this.h;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        switch (this.phase) {
            case 'intro':
                this._paintSky(ctx, w, h);
                this._drawTitle(ctx, w, h);
                break;

            case 'waiting':
                // Dark screen — wait
                if (this.mode === 'color') {
                    this.clear('#657a70');
                    ctx.fillStyle = 'rgba(255,255,255,0.72)';
                    ctx.font = '16px Inter, sans-serif';
                    ctx.fillText('Wait for it...', w / 2, h / 2);
                } else {
                    this._paintSky(ctx, w, h);
                    ctx.fillStyle = 'rgba(32,61,52,0.68)';
                    ctx.font = '16px Inter, sans-serif';
                    ctx.fillText('🔇  Wait for the beep...', w / 2, h / 2);
                }
                this._drawAttemptIndicator(ctx, w, h);
                break;

            case 'stimulus':
                if (this.mode === 'color') {
                    // Bright green flash
                    this.clear('#55d548');
                    ctx.fillStyle = '#15311a';
                    ctx.font = 'bold 28px Inter, sans-serif';
                    ctx.fillText('CLICK NOW!', w / 2, h / 2);
                } else {
                    // Sound mode deliberately keeps the exact same visual
                    // background, so the beep remains the only stimulus.
                    this._paintSky(ctx, w, h);
                    ctx.fillStyle = 'rgba(32,61,52,0.68)';
                    ctx.font = '16px Inter, sans-serif';
                    ctx.fillText('🔇  Wait for the beep...', w / 2, h / 2);
                    this._drawAttemptIndicator(ctx, w, h);
                }
                break;

            case 'result-flash':
                this._paintSky(ctx, w, h);
                ctx.fillStyle = '#237f35';
                ctx.font = 'bold 48px Inter, sans-serif';
                ctx.fillText(`${this._lastResult} ms`, w / 2, h * 0.42);

                ctx.fillStyle = 'rgba(32,61,52,0.58)';
                ctx.font = '13px Inter, sans-serif';
                ctx.fillText(`Attempt ${this.attempt} / ${this.attempts}`, w / 2, h * 0.52);
                this._drawAttemptIndicator(ctx, w, h);
                break;

            case 'too-early':
                this.clear('#ffd6c7');
                ctx.fillStyle = '#b63232';
                ctx.font = 'bold 24px Inter, sans-serif';
                ctx.fillText('Too early!', w / 2, h * 0.42);

                ctx.fillStyle = 'rgba(91,42,37,0.72)';
                ctx.font = '13px Inter, sans-serif';
                ctx.fillText('Click to try again', w / 2, h * 0.52);
                break;

            case 'summary':
                this._renderSummary(ctx, w, h);
                break;
        }
    }

    _drawTitle(ctx, w, h) {
        const modeLabel = this.mode === 'color' ? 'Color Change' : 'Sound';

        ctx.fillStyle = '#203d34';
        ctx.font = 'bold 26px Inter, sans-serif';
        ctx.fillText(`Reaction Time — ${modeLabel}`, w / 2, h * 0.35);

        ctx.fillStyle = 'rgba(32,61,52,0.68)';
        ctx.font = '14px Inter, sans-serif';
        const desc = this.mode === 'color'
            ? 'Click when the screen turns green'
            : 'Click when you hear the beep';
        ctx.fillText(desc, w / 2, h * 0.43);
        ctx.fillText(`${this.attempts} attempts`, w / 2, h * 0.48);

        const a = 0.3 + 0.2 * Math.sin(Date.now() / 400);
        ctx.fillStyle = `rgba(35, 135, 49, ${a + 0.32})`;
        ctx.font = '15px Inter, sans-serif';
        ctx.fillText('Click to start', w / 2, h * 0.58);
    }

    _drawAttemptIndicator(ctx, w, h) {
        const dotR = 4;
        const gap = 14;
        const totalW = this.attempts * gap;
        const startX = w / 2 - totalW / 2 + gap / 2;
        const y = h * 0.9;

        for (let i = 0; i < this.attempts; i++) {
            ctx.beginPath();
            ctx.arc(startX + i * gap, y, dotR, 0, Math.PI * 2);
            if (i < this.attempt) {
                ctx.fillStyle = '#238b32';
            } else if (i === this.attempt) {
                ctx.fillStyle = 'rgba(35,139,50,0.55)';
            } else {
                ctx.fillStyle = 'rgba(32,61,52,0.20)';
            }
            ctx.fill();
        }
    }

    _renderSummary(ctx, w, h) {
        this._paintSky(ctx, w, h);

        const avg = Math.round(this.results.reduce((a, b) => a + b, 0) / this.results.length);
        const best = Math.min(...this.results);
        const worst = Math.max(...this.results);

        ctx.fillStyle = '#238b32';
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillText('Results', w / 2, h * 0.20);

        ctx.fillStyle = '#203d34';
        ctx.font = 'bold 52px Inter, sans-serif';
        ctx.fillText(`${avg} ms`, w / 2, h * 0.33);

        ctx.fillStyle = 'rgba(32,61,52,0.68)';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText('average reaction time', w / 2, h * 0.40);

        // Individual results
        const rowY = h * 0.50;
        ctx.font = '12px JetBrains Mono, monospace';
        for (let i = 0; i < this.results.length; i++) {
            const x = w / 2 + (i - (this.results.length - 1) / 2) * 60;
            ctx.fillStyle = this.results[i] === best ? '#238b32' : 'rgba(32,61,52,0.68)';
            ctx.fillText(`${this.results[i]}`, x, rowY);
        }

        ctx.fillStyle = 'rgba(32,61,52,0.56)';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(`Best: ${best} ms  •  Worst: ${worst} ms`, w / 2, h * 0.58);

        const a = 0.3 + 0.2 * Math.sin(Date.now() / 400);
        ctx.fillStyle = `rgba(32,61,52,${a + 0.3})`;
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText('Click to retry', w / 2, h * 0.70);
    }

    /* ── Pendulum rendering ──────────────────────────────────── */

    _renderPendulum() {
        const ctx = this.ctx, w = this.w, h = this.h;
        this._paintSky(ctx, w, h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Pivot point
        const pivotX = w / 2;
        const pivotY = h * 0.12;
        const len = this.pendLength;

        // Bob position
        const bobX = pivotX + len * Math.sin(this.pendAngle);
        const bobY = pivotY + len * Math.cos(this.pendAngle);
        const bobR = 18;

        // Draw rod
        ctx.strokeStyle = '#4f5d55';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(bobX, bobY);
        ctx.stroke();

        // Draw pivot
        ctx.fillStyle = '#5c6c62';
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 5, 0, Math.PI * 2);
        ctx.fill();

        // Draw bob
        const bobGrad = ctx.createRadialGradient(bobX - 4, bobY - 4, 2, bobX, bobY, bobR);
        bobGrad.addColorStop(0, '#ff8b63');
        bobGrad.addColorStop(1, '#c83d35');
        ctx.fillStyle = bobGrad;
        ctx.beginPath();
        ctx.arc(bobX, bobY, bobR, 0, Math.PI * 2);
        ctx.fill();

        // Phase-specific UI
        switch (this.phase) {
            case 'intro':
                ctx.fillStyle = '#203d34';
                ctx.font = 'bold 22px Inter, sans-serif';
                ctx.fillText('Pendulum Timing', w / 2, h * 0.70);

                ctx.fillStyle = 'rgba(32,61,52,0.68)';
                ctx.font = '13px Inter, sans-serif';
                ctx.fillText(`Time exactly ${this.swings} full swings`, w / 2, h * 0.76);
                ctx.fillText('Click once to START, click again to STOP', w / 2, h * 0.80);

                const a = 0.3 + 0.2 * Math.sin(Date.now() / 400);
                ctx.fillStyle = `rgba(35, 135, 49, ${a + 0.32})`;
                ctx.font = '15px Inter, sans-serif';
                ctx.fillText('Click to begin', w / 2, h * 0.88);
                break;

            case 'watching':
                ctx.fillStyle = 'rgba(32,61,52,0.72)';
                ctx.font = '15px Inter, sans-serif';
                ctx.fillText('Watch the pendulum...  Click to START timing', w / 2, h * 0.82);

                ctx.fillStyle = 'rgba(32,61,52,0.52)';
                ctx.font = '12px Inter, sans-serif';
                ctx.fillText(`Target: ${this.swings} swings ≈ ${(this.pendActual).toFixed(1)}s`, w / 2, h * 0.87);
                break;

            case 'timing': {
                const elapsed = (performance.now() - this.pendStartT) / 1000;
                ctx.fillStyle = '#ae5c16';
                ctx.font = 'bold 32px JetBrains Mono, monospace';
                ctx.fillText(elapsed.toFixed(2) + 's', w / 2, h * 0.75);

                ctx.fillStyle = 'rgba(32,61,52,0.68)';
                ctx.font = '13px Inter, sans-serif';
                ctx.fillText('⏱ Timing...  Click to STOP', w / 2, h * 0.83);
                break;
            }

            case 'result': {
                const measured = (this.pendMeasured / 1000).toFixed(3);
                const actual   = this.pendActual.toFixed(3);
                const errorMs  = Math.abs(this.pendMeasured - this.pendActual * 1000);

                ctx.fillStyle = '#238b32';
                ctx.font = 'bold 22px Inter, sans-serif';
                ctx.fillText('Result', w / 2, h * 0.65);

                ctx.fillStyle = '#203d34';
                ctx.font = 'bold 36px JetBrains Mono, monospace';
                ctx.fillText(`${errorMs.toFixed(0)} ms error`, w / 2, h * 0.74);

                ctx.fillStyle = 'rgba(32,61,52,0.68)';
                ctx.font = '12px JetBrains Mono, monospace';
                ctx.fillText(`Measured: ${measured}s   Actual: ${actual}s`, w / 2, h * 0.82);

                const a = 0.3 + 0.2 * Math.sin(Date.now() / 400);
                ctx.fillStyle = `rgba(32,61,52,${a + 0.3})`;
                ctx.font = '13px Inter, sans-serif';
                ctx.fillText('Click to retry', w / 2, h * 0.90);
                break;
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Schema                                                   */
    /* ═══════════════════════════════════════════════════════════ */

    static getSettingsSchema() {
        return [
            {
                key: 'mode', label: 'Mode', type: 'hidden', default: 'color',
            },
            { key: 'colorAttempts', label: 'Attempts', type: 'range', min: 1, max: 10, step: 1, default: 5, modes: ['color'], group: 'Color mode' },
            { key: 'soundAttempts', label: 'Attempts', type: 'range', min: 1, max: 10, step: 1, default: 5, modes: ['sound'], group: 'Sound mode' },
            { key: 'pendulumSwings', label: 'Swings', type: 'range', min: 1, max: 30, step: 1, default: 10, modes: ['pendulum'], group: 'Pendulum mode' },
            { key: 'reactionProfileVersion', label: 'Settings profile version', type: 'hidden', default: 2 },
        ];
    }

    getRecordSettings(settings = this.settings) {
        const mode = ['color', 'sound', 'pendulum'].includes(settings.mode) ? settings.mode : 'color';
        if (mode === 'pendulum') {
            return { mode, swings: Math.round(Number(settings.pendulumSwings ?? 10)) };
        }
        return {
            mode,
            attempts: Math.round(Number(
                mode === 'sound' ? (settings.soundAttempts ?? 5) : (settings.colorAttempts ?? 5))),
        };
    }

    preparePauseSettings(settings) {
        requireInteger(settings.colorAttempts ?? 5, 'Colour-mode attempts', { minimum: 1 });
        requireInteger(settings.soundAttempts ?? 5, 'Sound-mode attempts', { minimum: 1 });
        requireInteger(settings.pendulumSwings ?? 10, 'Pendulum swings', { minimum: 1 });
        return settings;
    }

    destroy() {
        this.modeSelector?.remove();
        this.modeSelector = null;
    }

    static getControlsSchema() {
        return [
            {
                action: 'react',
                label: 'React / Click',
                defaultBindings: [
                    { type: 'keyboard', code: 'Space' },
                    { type: 'mouse',    code: 0 },
                    { type: 'gamepad',  code: 0 },
                ],
            },
        ];
    }
}
