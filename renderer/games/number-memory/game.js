import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requireInteger } from '../../core/SettingsValidation.js';

export const NUMBER_MEMORY_DEFAULTS = Object.freeze({
    visibleTime: 0.72,
    blankTime: 0.18,
    startingDigits: 1,
    digitsAddedPerRound: 1,
});

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Date.now() >>> 0;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

export function readNumberMemorySettings(settings = {}, { strict = false } = {}) {
    const source = { ...NUMBER_MEMORY_DEFAULTS, ...(settings || {}) };
    if (strict) validateNumberMemorySettings(source);
    const number = (value, fallback, minimum, maximum) => {
        const parsed = Number.isFinite(Number(value)) ? Number(value) : fallback;
        return strict ? parsed : Math.max(minimum, Math.min(maximum, parsed));
    };
    const integer = (value, fallback, minimum, maximum) => Math.round(number(value, fallback, minimum, maximum));
    return Object.freeze({
        visibleTime: number(source.visibleTime, NUMBER_MEMORY_DEFAULTS.visibleTime, 0.15, 2.5),
        blankTime: number(source.blankTime, NUMBER_MEMORY_DEFAULTS.blankTime, 0.03, 1),
        startingDigits: integer(source.startingDigits, NUMBER_MEMORY_DEFAULTS.startingDigits, 1, 12),
        digitsAddedPerRound: integer(source.digitsAddedPerRound, NUMBER_MEMORY_DEFAULTS.digitsAddedPerRound, 1, 6),
    });
}

export function validateNumberMemorySettings(settings = {}) {
    requireFiniteNumber(settings.visibleTime ?? NUMBER_MEMORY_DEFAULTS.visibleTime, 'Digit visible time', { minimum: 0 });
    requireFiniteNumber(settings.blankTime ?? NUMBER_MEMORY_DEFAULTS.blankTime, 'Blank gap between digits', { minimum: 0 });
    requireInteger(settings.startingDigits ?? NUMBER_MEMORY_DEFAULTS.startingDigits, 'Starting sequence length', { minimum: 1 });
    requireInteger(settings.digitsAddedPerRound ?? NUMBER_MEMORY_DEFAULTS.digitsAddedPerRound, 'Digits added each round', { minimum: 1 });
}

export default class NumberMemoryGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        validateNumberMemorySettings(this.settings || {});
        this.parameters = readNumberMemorySettings(this.settings, { strict: true });
        this.bestDigits = 0;
        this._loadBest();
        this._resetSession();
        this._onKeyDown = event => {
            if (this.app?._isPaused || event.repeat) return;
            if (this.phase === 'input' && /^\d$/.test(event.key)) {
                this._digitQueue.push(event.key);
                event.preventDefault();
            } else if (this.phase === 'input' && event.key === 'Backspace') {
                this._backspaceQueued = true;
                event.preventDefault();
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
    }

    preparePauseSettings(settings) {
        validateNumberMemorySettings(settings);
        return settings;
    }

    _resetSession(seed = makeSeed()) {
        this.seed = seed >>> 0;
        this.random = seededRandom(this.seed);
        this.sequence = [];
        this.round = 1;
        this.completedDigits = 0;
        this.phase = 'ready';
        this.phaseElapsed = 0;
        this.answer = '';
        this.failedAnswer = '';
        this._digitQueue = [];
        this._backspaceQueued = false;
    }

    async _loadBest() {
        try {
            const record = await this.app?.records?.getBest(
                'number-memory',
                this.getRecordSettings(this.settings),
                'digits',
            );
            const value = Number(record?.results?.digits);
            if (Number.isFinite(value)) this.bestDigits = value;
        } catch (error) {
            console.warn('Could not load Number Memory record:', error);
        }
    }

    _requiredLength() {
        return this.parameters.startingDigits
            + (this.round - 1) * this.parameters.digitsAddedPerRound;
    }

    _startSequence() {
        while (this.sequence.length < this._requiredLength()) {
            this.sequence.push(Math.floor(this.random() * 10));
        }
        this.answer = '';
        this.failedAnswer = '';
        this.phase = 'showing';
        this.phaseElapsed = -0.38;
        this.audio.playClick?.();
    }

    _visibleDigit() {
        if (this.phase !== 'showing' || this.phaseElapsed < 0) return null;
        const cycle = this.parameters.visibleTime + this.parameters.blankTime;
        const index = Math.floor(this.phaseElapsed / cycle);
        if (index >= this._requiredLength()) return null;
        const withinCycle = this.phaseElapsed - index * cycle;
        return withinCycle < this.parameters.visibleTime ? this.sequence[index] : null;
    }

    _finishAnswer() {
        const expected = this.sequence.slice(0, this._requiredLength()).join('');
        if (this.answer === expected) {
            this.completedDigits = this._requiredLength();
            this.bestDigits = Math.max(this.bestDigits, this.completedDigits);
            this.submitScore({
                digits: this.completedDigits,
                completedRounds: this.round,
                seed: this.seed,
            });
            this.round++;
            this.phase = 'correct';
            this.phaseElapsed = 0;
            this.audio.playSuccess?.();
            return;
        }
        this.failedAnswer = this.answer;
        this.phase = 'gameover';
        this.phaseElapsed = 0;
        this.submitScore({
            digits: this.completedDigits,
            completedRounds: this.round - 1,
            failedRound: this.round,
            seed: this.seed,
        });
        this.audio.playPlasticImpact?.(0.28);
    }

    update(dt) {
        const startPressed = Boolean(
            this.input.isActionJustDown?.('start')
                || this.input.isMouseJustDown?.(0),
        );
        this.phaseElapsed += Math.min(0.05, Number(dt) || 0);
        if (this.phase === 'ready' || this.phase === 'correct') {
            if (startPressed) this._startSequence();
            return;
        }
        if (this.phase === 'gameover') {
            if (startPressed) {
                this._resetSession();
                this._startSequence();
            }
            return;
        }
        if (this.phase === 'showing') {
            const cycle = this.parameters.visibleTime + this.parameters.blankTime;
            if (this.phaseElapsed >= this._requiredLength() * cycle) {
                this.phase = 'input';
                this.phaseElapsed = 0;
            }
            return;
        }
        if (this.phase !== 'input') return;
        if (this._backspaceQueued) this.answer = this.answer.slice(0, -1);
        this._backspaceQueued = false;
        while (this._digitQueue.length && this.answer.length < this._requiredLength()) {
            this.answer += this._digitQueue.shift();
        }
        if (this.answer.length >= this._requiredLength()) this._finishAnswer();
    }

    render() {
        const ctx = this.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.h);
        sky.addColorStop(0, '#5bc8f3');
        sky.addColorStop(1, '#d2f4ff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#25433a';
        ctx.font = '900 21px Inter,sans-serif';
        ctx.fillText(`ROUND ${this.round} · ${this._requiredLength()} DIGITS`, this.w / 2, this.h * 0.13);

        ctx.fillStyle = 'rgba(248,255,249,.92)';
        ctx.strokeStyle = '#2b843c';
        ctx.lineWidth = 4;
        const panelWidth = Math.min(720, this.w - 50);
        const panelHeight = Math.min(310, this.h * 0.5);
        const panelX = (this.w - panelWidth) / 2;
        const panelY = (this.h - panelHeight) / 2;
        ctx.beginPath();
        ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 24);
        ctx.fill();
        ctx.stroke();

        if (this.phase === 'showing') {
            const digit = this._visibleDigit();
            ctx.fillStyle = '#173e72';
            ctx.font = '950 132px Inter,sans-serif';
            if (digit !== null) ctx.fillText(String(digit), this.w / 2, this.h / 2);
        } else if (this.phase === 'input') {
            const slots = Array.from({ length: this._requiredLength() }, (_, index) => (
                this.answer[index] ?? '•'
            )).join('  ');
            const size = clamp(64 - this._requiredLength() * 1.8, 24, 58);
            ctx.fillStyle = '#173e72';
            ctx.font = `900 ${size}px ui-monospace,Consolas,monospace`;
            ctx.fillText(slots, this.w / 2, this.h / 2);
            ctx.fillStyle = '#567269';
            ctx.font = '700 14px Inter,sans-serif';
            ctx.fillText('Type the digits · Backspace is allowed · no time limit', this.w / 2, panelY + panelHeight - 42);
        } else {
            ctx.fillStyle = this.phase === 'gameover' ? '#c63e36' : '#267f38';
            ctx.font = '950 37px Inter,sans-serif';
            const title = this.phase === 'gameover'
                ? 'SEQUENCE LOST'
                : (this.phase === 'correct' ? 'CORRECT' : 'NUMBER MEMORY');
            ctx.fillText(title, this.w / 2, this.h / 2 - 38);
            ctx.fillStyle = '#4d6a61';
            ctx.font = '750 15px Inter,sans-serif';
            if (this.phase === 'gameover') {
                ctx.fillText(`Correct: ${this.sequence.slice(0, this._requiredLength()).join('')}`, this.w / 2, this.h / 2 + 14);
                ctx.fillText(`You typed: ${this.failedAnswer}`, this.w / 2, this.h / 2 + 43);
            } else {
                ctx.fillText('Click or press Space when you are ready', this.w / 2, this.h / 2 + 23);
            }
        }
        ctx.fillStyle = '#41635a';
        ctx.font = '800 13px Inter,sans-serif';
        ctx.fillText(`Best ${this.bestDigits} digits`, this.w / 2, this.h * 0.88);
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
    }

    getRecordSettings(settings = this.settings) {
        return { ...readNumberMemorySettings(settings, { strict: true }) };
    }

    static getSettingsSchema() {
        const d = NUMBER_MEMORY_DEFAULTS;
        return [
            { key: 'visibleTime', label: 'Digit visible time [s]', type: 'range', min: 0.15, max: 2.5, step: 0.05, default: d.visibleTime },
            { key: 'blankTime', label: 'Blank gap between digits [s]', type: 'range', min: 0.03, max: 1, step: 0.01, default: d.blankTime },
            { key: 'startingDigits', label: 'Starting sequence length', type: 'range', min: 1, max: 12, step: 1, default: d.startingDigits },
            { key: 'digitsAddedPerRound', label: 'Digits added each round', type: 'range', min: 1, max: 6, step: 1, default: d.digitsAddedPerRound },
        ];
    }

    static getControlsSchema() {
        return [{
            action: 'start',
            label: 'Show sequence / restart',
            defaultBindings: [{ type: 'keyboard', code: 'Space' }],
        }];
    }
}
