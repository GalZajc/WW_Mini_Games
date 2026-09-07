import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requireOrderedRange } from '../../core/SettingsValidation.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function makeRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

export default class RhythmMemoryGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});
        this.toleranceMs = Number.isFinite(Number(this.settings.toleranceMs)) ? Number(this.settings.toleranceMs) : 140;
        this.minimumInterval = Number.isFinite(Number(this.settings.minimumInterval)) ? Number(this.settings.minimumInterval) : 0.28;
        this.maximumInterval = Number.isFinite(Number(this.settings.maximumInterval)) ? Number(this.settings.maximumInterval) : 0.9;
        this.distribution = this.settings.distribution === 'uniform' ? 'uniform' : 'perceptual';
        this.seed = globalThis.crypto?.getRandomValues
            ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
            : Date.now() >>> 0;
        this.random = makeRandom(this.seed);
        this.phase = 'ready';
        this.round = 1;
        this.patternIntervals = [];
        this.playerClicks = [];
        this.playbackTimes = [0];
        this.playbackElapsed = 0;
        this.nextPlaybackHit = 0;
        this.pulse = 0;
        this.lastErrorMs = null;
        this.failedInterval = null;
        this._buttonPressQueued = false;
        this._ensureActionButton();
        this._syncActionButton();
    }

    preparePauseSettings(settings) {
        requireFiniteNumber(settings.toleranceMs ?? 140, 'Maximum interval error', { minimum: 0 });
        const minimum = requireFiniteNumber(settings.minimumInterval ?? 0.28, 'Shortest generated interval', { minimum: 0 });
        const maximum = requireFiniteNumber(settings.maximumInterval ?? 0.9, 'Longest generated interval', { minimum: 0 });
        requireOrderedRange(minimum, maximum, 'Shortest generated interval', 'Longest generated interval');
        if (settings.distribution !== undefined && !['perceptual', 'uniform'].includes(settings.distribution)) {
            throw new Error(`Interval distribution must be either 'perceptual' or 'uniform'.`);
        }
        return settings;
    }

    _newInterval() {
        const u = this.random();
        if (this.distribution === 'perceptual' && this.minimumInterval > 0 && this.maximumInterval > this.minimumInterval) {
            return this.minimumInterval * Math.exp(u * Math.log(this.maximumInterval / this.minimumInterval));
        }
        return this.minimumInterval
            + u * (this.maximumInterval - this.minimumInterval);
    }

    _startRound() {
        while (this.patternIntervals.length < this.round - 1) {
            this.patternIntervals.push(this._newInterval());
        }
        this.playbackTimes = [0];
        for (const interval of this.patternIntervals.slice(0, this.round - 1)) {
            this.playbackTimes.push(this.playbackTimes.at(-1) + interval);
        }
        this.playerClicks = [];
        this.playbackElapsed = -0.42;
        this.nextPlaybackHit = 0;
        this.phase = 'playback';
        this.lastErrorMs = null;
        this.failedInterval = null;
        this._syncActionButton();
    }

    _drum() {
        this.audio.playDrumHit?.(0.64);
        this.pulse = 1;
    }

    _ensureActionButton() {
        this.actionButton = document.createElement('button');
        this.actionButton.type = 'button';
        this.actionButton.style.cssText = `
            position:fixed;left:50%;top:50%;z-index:760;transform:translate(-50%,-50%);
            width:min(300px,calc(100vw - 48px));height:132px;border:4px solid #405148;
            border-radius:24px;background:linear-gradient(#66dc58,#2ead3a);color:#17311b;
            box-shadow:0 13px 0 #247c31,0 22px 40px rgba(30,81,46,.25);
            font:950 30px Inter,system-ui,sans-serif;letter-spacing:.04em;cursor:pointer;
        `;
        this._actionClick = () => { this._buttonPressQueued = true; };
        this.actionButton.addEventListener('click', this._actionClick);
        document.body.appendChild(this.actionButton);
    }

    _syncActionButton() {
        if (!this.actionButton) return;
        const playback = this.phase === 'playback';
        this.actionButton.disabled = playback;
        this.actionButton.style.cursor = playback ? 'default' : 'pointer';
        this.actionButton.style.opacity = playback ? '0.72' : '1';
        if (this.phase === 'ready') {
            this.actionButton.textContent = 'LISTEN';
            this.actionButton.style.background = 'linear-gradient(#66dc58,#2ead3a)';
        } else if (playback) {
            this.actionButton.textContent = 'LISTEN…';
            this.actionButton.style.background = 'linear-gradient(#f6d76b,#e2a637)';
        } else if (this.phase === 'input') {
            this.actionButton.textContent = 'TAP';
            this.actionButton.style.background = 'linear-gradient(#ff765f,#d9433b)';
        } else {
            this.actionButton.textContent = 'LISTEN AGAIN';
            this.actionButton.style.background = 'linear-gradient(#66dc58,#2ead3a)';
        }
    }

    update(dt) {
        this.pulse = Math.max(0, this.pulse - dt * 4.5);
        if (this.actionButton) {
            const scale = 1 + this.pulse * 0.045;
            this.actionButton.style.transform = `translate(-50%,-50%) scale(${scale})`;
        }
        const mappedTap = this.input.isActionJustDown('tap') && !this.input.isMouseJustDown(0);
        const tapped = this._buttonPressQueued || mappedTap;
        this._buttonPressQueued = false;
        if (this.phase === 'ready') {
            if (tapped) this._startRound();
            return;
        }
        if (this.phase === 'playback') {
            this.playbackElapsed += dt;
            while (this.nextPlaybackHit < this.playbackTimes.length
                && this.playbackElapsed >= this.playbackTimes[this.nextPlaybackHit]) {
                this._drum();
                this.nextPlaybackHit++;
            }
            const endTime = this.playbackTimes.at(-1) + 0.55;
            if (this.playbackElapsed >= endTime) {
                this.phase = 'input';
                this._syncActionButton();
            }
            return;
        }
        if (this.phase === 'input') {
            if (!tapped) return;
            this._drum();
            this.playerClicks.push(performance.now() / 1000);
            if (this.playerClicks.length >= this.round) {
                this._judgeRound();
                this._syncActionButton();
            }
            return;
        }
        if (this.phase === 'gameover' && tapped) {
            this.restart();
            this._startRound();
        }
    }

    _judgeRound() {
        for (let index = 0; index < this.round - 1; index++) {
            const reproduced = this.playerClicks[index + 1] - this.playerClicks[index];
            const target = this.patternIntervals[index];
            const errorMs = Math.abs(reproduced - target) * 1000;
            if (errorMs > this.toleranceMs) {
                this.lastErrorMs = errorMs;
                this.failedInterval = index + 1;
                this.phase = 'gameover';
                this.submitScore({
                    completedRounds: this.round - 1,
                    failedRound: this.round,
                    failedInterval: this.failedInterval,
                    errorMs: Math.round(errorMs),
                    seed: this.seed,
                });
                return;
            }
        }
        this.round++;
        this.patternIntervals.push(this._newInterval());
        this.phase = 'ready';
    }

    render() {
        const ctx = this.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.h);
        sky.addColorStop(0, '#64c9f5');
        sky.addColorStop(1, '#c8f1ff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, this.w, this.h);
        const centerX = this.w / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#254138';
        ctx.font = '900 24px Inter,sans-serif';
        ctx.fillText(`Round ${this.round}`, centerX, Math.max(54, this.h * 0.16));
        if (this.phase === 'input') {
            ctx.font = '700 14px Inter,sans-serif';
            ctx.fillStyle = '#47685c';
            ctx.fillText(`${this.playerClicks.length} / ${this.round}`, centerX, this.h * 0.69);
        }
        if (this.phase === 'gameover') {
            ctx.fillStyle = '#b73532';
            ctx.font = '900 18px Inter,sans-serif';
            ctx.fillText(`Game over · ${this.round - 1} completed`, centerX, this.h * 0.75);
            ctx.font = '13px Inter,sans-serif';
            ctx.fillText(`Interval ${this.failedInterval} differed by ${Math.round(this.lastErrorMs)} ms`, centerX, this.h * 0.81);
        }
    }

    destroy() {
        this.actionButton?.removeEventListener('click', this._actionClick);
        this.actionButton?.remove();
        this.actionButton = null;
    }

    wantsPointerLockNow() { return false; }

    getRecordSettings(settings = this.settings) {
        const minimumInterval = Number.isFinite(Number(settings.minimumInterval))
            ? Number(settings.minimumInterval) : 0.28;
        return {
            distribution: settings?.distribution === 'uniform' ? 'uniform' : 'perceptual',
            toleranceMs: Number.isFinite(Number(settings.toleranceMs)) ? Number(settings.toleranceMs) : 140,
            minimumInterval,
            maximumInterval: Number.isFinite(Number(settings.maximumInterval))
                ? Number(settings.maximumInterval) : 0.9,
        };
    }

    static getSettingsSchema() {
        return [
            {
                key: 'distribution',
                label: 'Interval distribution',
                type: 'select',
                default: 'perceptual',
                options: [
                    { value: 'perceptual', label: 'Perceptual (equal perceived scale)' },
                    { value: 'uniform', label: 'Uniform (linear seconds)' },
                ],
            },
            { key: 'toleranceMs', label: 'Maximum interval error [ms]', type: 'range', min: 30, max: 500, step: 10, default: 200 },
            { key: 'minimumInterval', label: 'Shortest generated interval [s]', type: 'range', min: 0.05, max: 1.5, step: 0.05, default: 0.1 },
            { key: 'maximumInterval', label: 'Longest generated interval [s]', type: 'range', min: 0.25, max: 2, step: 0.05, default: 1 },
        ];
    }

    static getControlsSchema() {
        return [{
            action: 'tap',
            label: 'Drum / Start',
            defaultBindings: [
                { type: 'keyboard', code: 'Space' },
            ],
        }];
    }
}
