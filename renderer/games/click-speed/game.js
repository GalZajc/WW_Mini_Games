import { BaseGame } from '../../core/BaseGame.js';
import { requirePositiveNumber } from '../../core/SettingsValidation.js';

/**
 * Click Speed — Count clicks within a time limit.
 *
 * Settings:
 *   duration — positive test duration in seconds (default 10); there is no
 *              artificial upper limit
 */
export default class ClickSpeedGame extends BaseGame {

    init() {
        this.duration  = requirePositiveNumber(this.settings.duration ?? 10, 'Test duration');
        this.clicks    = 0;
        this.elapsed   = 0;
        this.phase     = 'ready'; // 'ready' | 'playing' | 'done'
        this.barPulse  = 0; // animation: progress bar pulse
        this.clickAnim = []; // visual click feedback ripples
    }

    preparePauseSettings(settings) {
        requirePositiveNumber(settings.duration ?? 10, 'Test duration');
        return settings;
    }

    /* ── Update ──────────────────────────────────────────────── */

    update(dt) {
        // Animate ripples
        this.clickAnim = this.clickAnim.filter(a => {
            a.t += dt;
            return a.t < 0.4;
        });

        if (this.phase === 'ready') {
            if (this.input.isActionJustDown('click')) {
                this.phase = 'playing';
                this.clicks = 1;
                this.elapsed = 0;
                this.audio.playClick();
                this._addRipple();
            }
            return;
        }

        if (this.phase === 'playing') {
            this.elapsed += dt;

            if (this.input.isActionJustDown('click')) {
                this.clicks++;
                this.audio.playBeep(500 + this.clicks * 8, 0.04, 0.15);
                this._addRipple();
            }

            if (this.elapsed >= this.duration) {
                this.phase = 'done';
                this.audio.playSuccess();
                this.submitScore({
                    clicks: this.clicks,
                    cps:    parseFloat((this.clicks / this.duration).toFixed(2)),
                    duration: this.duration,
                });
            }
            return;
        }

        if (this.phase === 'done') {
            if (this.input.isActionJustDown('click')) {
                this.restart();
            }
        }
    }

    _addRipple() {
        this.clickAnim.push({ t: 0, x: this.w / 2, y: this.h * 0.38 });
    }

    /* ── Render ──────────────────────────────────────────────── */

    render() {
        const ctx = this.ctx;
        const w = this.w, h = this.h;

        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#65caf5');
        sky.addColorStop(0.72, '#bdefff');
        sky.addColorStop(1, '#e8fbff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#4bc541';
        ctx.beginPath();
        ctx.moveTo(0, h * 0.86);
        for (let x = 0; x <= w; x += 64) {
            ctx.quadraticCurveTo(x + 32, h * 0.83 - 8 * Math.sin(x * 0.018), x + 64, h * 0.86);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();

        if (this.phase === 'ready') {
            this._renderReady(ctx, w, h);
            return;
        }

        if (this.phase === 'playing') {
            this._renderPlaying(ctx, w, h);
            return;
        }

        this._renderDone(ctx, w, h);
    }

    _renderReady(ctx, w, h) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#203d34';
        ctx.font = 'bold 28px Inter, sans-serif';
        ctx.fillText('Click Speed Test', w / 2, h * 0.35);

        ctx.fillStyle = 'rgba(32,61,52,0.68)';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText(`Click as fast as you can for ${this.duration} seconds`, w / 2, h * 0.43);

        // Pulsing prompt
        const alpha = 0.4 + 0.3 * Math.sin(Date.now() / 400);
        ctx.fillStyle = `rgba(35, 135, 49, ${alpha + 0.25})`;
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText('Click to start', w / 2, h * 0.55);
    }

    _renderPlaying(ctx, w, h) {
        const remaining = Math.max(0, this.duration - this.elapsed);
        const progress  = this.elapsed / this.duration;

        // Ripple animations
        for (const a of this.clickAnim) {
            const r = a.t * 200;
            const alpha = 1 - a.t / 0.4;
            ctx.strokeStyle = `rgba(38, 166, 57, ${alpha * 0.72})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Big click count
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#203d34';
        ctx.font = 'bold 72px Inter, sans-serif';
        ctx.fillText(this.clicks.toString(), w / 2, h * 0.38);

        // CPS live
        const cps = this.elapsed > 0 ? (this.clicks / this.elapsed).toFixed(1) : '0.0';
        ctx.fillStyle = 'rgba(32,61,52,0.66)';
        ctx.font = '16px Inter, sans-serif';
        ctx.fillText(`${cps} clicks/sec`, w / 2, h * 0.48);

        // Timer text
        ctx.fillStyle = '#b45b14';
        ctx.font = 'bold 22px JetBrains Mono, monospace';
        ctx.fillText(remaining.toFixed(1) + 's', w / 2, h * 0.58);

        // Progress bar
        const barW = w * 0.5;
        const barH = 4;
        const barX = (w - barW) / 2;
        const barY = h * 0.64;

        ctx.fillStyle = 'rgba(39,89,54,.22)';
        ctx.fillRect(barX, barY, barW, barH);

        const progGrad = ctx.createLinearGradient(barX, 0, barX + barW * progress, 0);
        progGrad.addColorStop(0, '#238b32');
        progGrad.addColorStop(1, '#68dc51');
        ctx.fillStyle = progGrad;
        ctx.fillRect(barX, barY, barW * progress, barH);
    }

    _renderDone(ctx, w, h) {
        const cps = (this.clicks / this.duration).toFixed(2);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = '#238b32';
        ctx.font = 'bold 28px Inter, sans-serif';
        ctx.fillText('Results', w / 2, h * 0.28);

        ctx.fillStyle = '#203d34';
        ctx.font = 'bold 56px Inter, sans-serif';
        ctx.fillText(`${cps}`, w / 2, h * 0.40);

        ctx.fillStyle = 'rgba(32,61,52,0.68)';
        ctx.font = '14px Inter, sans-serif';
        ctx.fillText('clicks per second', w / 2, h * 0.48);

        ctx.fillStyle = 'rgba(32,61,52,0.54)';
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText(`${this.clicks} clicks in ${this.duration}s`, w / 2, h * 0.54);

        const alpha = 0.3 + 0.2 * Math.sin(Date.now() / 400);
        ctx.fillStyle = `rgba(32,61,52,${alpha + 0.28})`;
        ctx.font = '13px Inter, sans-serif';
        ctx.fillText('Click to retry', w / 2, h * 0.66);
    }

    /* ── Schema ──────────────────────────────────────────────── */

    static getSettingsSchema() {
        return [
            { key: 'duration', label: 'Duration (seconds)', type: 'range', min: 1, max: 60, step: 1, default: 5 },
        ];
    }

    static getControlsSchema() {
        return [
            {
                action: 'click',
                label: 'Click',
                defaultBindings: [
                    { type: 'keyboard', code: 'Space' },
                    { type: 'mouse',    code: 0 },
                    { type: 'gamepad',  code: 0 },
                ],
            },
        ];
    }
}
