import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requireInteger, requirePositiveNumber } from '../../core/SettingsValidation.js';

export const CUP_SHUFFLE_DEFAULTS = Object.freeze({
    cupCount: 10,
    shuffleMoves: 10,
    ballCount: 1,
    revealTime: 1.5,
    shuffleSpeed: 2.15,
});

export const CUP_SHUFFLE_SPEED = Object.freeze({
    step: 0.05,
    default: 1.25,
    successIncrement: 0.15,
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

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

export function readCupShuffleSettings(settings = {}, { strict = false } = {}) {
    const source = { ...CUP_SHUFFLE_DEFAULTS, ...(settings || {}) };
    if (strict) {
        // The live path is deliberately lossless: validation has already
        // established that every value is finite and physically meaningful.
        // Never repair an accepted value here, because doing so would make
        // the settings UI lie about what the game is using.
        const validated = validateCupShuffleSettings(source);
        return Object.freeze({
            cupCount: validated.cupCount,
            shuffleMoves: validated.shuffleMoves,
            ballCount: validated.ballCount,
            revealTime: validated.revealTime,
            shuffleSpeed: validated.shuffleSpeed,
        });
    }
    // This reader is also used by old deterministic logic tests and exports.
    // The live game calls validateCupShuffleSettings first, so UI-entered
    // values are rejected before this compatibility normalization is reached.
    const cupCount = Math.max(2, Math.round(Number.isFinite(Number(source.cupCount)) ? Number(source.cupCount) : CUP_SHUFFLE_DEFAULTS.cupCount));
    const shuffleSpeed = Number(source.shuffleSpeed);
    return Object.freeze({
        cupCount,
        // Preserve the historical fallback semantics only for callers of the
        // old exported compatibility reader.  The live game uses strict=true.
        shuffleMoves: Math.max(1, Math.round(Number.isFinite(Number(source.shuffleMoves)) ? Number(source.shuffleMoves) : CUP_SHUFFLE_DEFAULTS.shuffleMoves)),
        ballCount: Math.max(1, Math.min(Math.max(1, cupCount - 1), Math.round(Number.isFinite(Number(source.ballCount)) ? Number(source.ballCount) : CUP_SHUFFLE_DEFAULTS.ballCount))),
        revealTime: Math.max(0, Number.isFinite(Number(source.revealTime)) ? Number(source.revealTime) : CUP_SHUFFLE_DEFAULTS.revealTime),
        shuffleSpeed: Number.isFinite(shuffleSpeed) && shuffleSpeed > 0 ? shuffleSpeed : CUP_SHUFFLE_DEFAULTS.shuffleSpeed,
    });
}

export function validateCupShuffleSettings(settings = {}) {
    const source = { ...CUP_SHUFFLE_DEFAULTS, ...(settings || {}) };
    const cupCount = requireInteger(source.cupCount, 'Number of cups', { minimum: 2 });
    requireInteger(source.shuffleMoves, 'Number of shuffle moves', { minimum: 0 });
    requireInteger(source.ballCount, 'Number of hidden balls', { minimum: 1, maximum: cupCount });
    requireFiniteNumber(source.revealTime, 'Initial reveal time', { minimum: 0 });
    requirePositiveNumber(source.shuffleSpeed, 'Shuffle speed');
    return source;
}

export function generateCupShuffle(parameters, seed) {
    const random = seededRandom(seed);
    const cupIds = Array.from({ length: parameters.cupCount }, (_, index) => index);
    const shuffledForBalls = [...cupIds];
    for (let index = shuffledForBalls.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [shuffledForBalls[index], shuffledForBalls[other]] = [
            shuffledForBalls[other], shuffledForBalls[index],
        ];
    }
    const ballCupIds = shuffledForBalls.slice(0, parameters.ballCount).sort((a, b) => a - b);
    const moves = [];
    let previousKey = '';
    for (let index = 0; index < parameters.shuffleMoves; index++) {
        let first;
        let second;
        let key;
        do {
            first = Math.floor(random() * parameters.cupCount);
            second = Math.floor(random() * (parameters.cupCount - 1));
            if (second >= first) second++;
            key = first < second ? `${first}:${second}` : `${second}:${first}`;
        } while (key === previousKey && parameters.cupCount > 2);
        previousKey = key;
        moves.push([first, second]);
    }
    return { ballCupIds, moves };
}

export function resolveCupShuffle(parameters, generated) {
    const cupAtSlot = Array.from({ length: parameters.cupCount }, (_, index) => index);
    for (const [first, second] of generated.moves) {
        [cupAtSlot[first], cupAtSlot[second]] = [cupAtSlot[second], cupAtSlot[first]];
    }
    return Object.fromEntries(cupAtSlot.map((cupId, slot) => [cupId, slot]));
}

export default class CupShuffleGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});
        this.parameters = readCupShuffleSettings(this.settings, { strict: true });
        this.shuffleSpeed = this.parameters.shuffleSpeed;
        this.bestSpeed = 0;
        this._loadBest();
        this._createSpeedControl();
        this._resetRound();
    }

    _resetRound() {
        this.phase = 'ready';
        this.phaseElapsed = 0;
        this.seed = 0;
        this.cups = Array.from({ length: this.parameters.cupCount }, (_, id) => ({
            id,
            slot: id,
            hasBall: false,
        }));
        this.moves = [];
        this.moveIndex = 0;
        this.moveElapsed = 0;
        this.activeMove = null;
        this.selected = new Set();
        this.correct = null;
        this.roundSpeed = this.shuffleSpeed;
        this._syncSpeedControl();
    }

    async _loadBest() {
        try {
            const record = await this.app?.records?.getBest(
                'cup-shuffle', this.getRecordSettings(this.settings), 'speed',
            );
            const value = Number(record?.results?.speed);
            if (Number.isFinite(value)) this.bestSpeed = value;
        } catch (error) {
            console.warn('Could not load Cup Shuffle record:', error);
        }
    }

    _createSpeedControl() {
        if (typeof document === 'undefined') return;
        this.speedControl?.remove();
        const root = document.createElement('div');
        root.className = 'cup-shuffle-speed-control';
        root.dataset.recordIndependent = 'true';
        root.style.cssText = `position:fixed;right:22px;top:17px;z-index:7;width:250px;
            padding:10px 13px;border:2px solid #277a39;border-radius:12px;
            background:rgba(247,254,247,.95);box-shadow:0 5px 14px rgba(23,73,45,.24);
            color:#263c34;font:700 12px Inter,sans-serif;user-select:none`;
        root.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px">
            <span>SHUFFLE SPEED</span><strong data-speed-value style="font-size:16px;color:#238138"></strong></div>
            <input data-speed-slider type="number" step="${CUP_SHUFFLE_SPEED.step}" value="${this.shuffleSpeed}" aria-label="Shuffle speed in swaps per second" style="box-sizing:border-box;width:100%;padding:6px 8px;border:1px solid #277a39;border-radius:7px;background:#effbea;color:#263c34;margin:7px 0 2px">
            <div data-speed-error role="alert" style="min-height:14px;color:#b3261e;font-size:10px"></div>
            <div style="font-size:10px;color:#63746c">Successful speed is the record</div>`;
        this.speedSlider = root.querySelector('[data-speed-slider]');
        this.speedValue = root.querySelector('[data-speed-value]');
        this.speedError = root.querySelector('[data-speed-error]');
        this._onSpeedInput = () => {
            const value = Number(this.speedSlider.value);
            if (!Number.isFinite(value) || value <= 0) {
                this.speedSlider.setCustomValidity('Shuffle speed must be a finite number greater than zero.');
                this.speedError.textContent = 'Enter a finite speed greater than zero.';
                this.speedSlider.setAttribute('aria-invalid', 'true');
                return;
            }
            this.speedSlider.setCustomValidity('');
            this.speedError.textContent = '';
            this.speedSlider.removeAttribute('aria-invalid');
            this.shuffleSpeed = value;
            this.settings.shuffleSpeed = value;
            this.app?.settingsManager?.save?.('cup-shuffle', this.settings).catch?.(() => {});
            this._syncSpeedControl();
        };
        this.speedSlider.addEventListener('input', this._onSpeedInput);
        for (const type of ['mousedown', 'mouseup', 'click']) {
            root.addEventListener(type, event => event.stopPropagation());
        }
        (this.canvas?.parentElement || document.body).appendChild(root);
        this.speedControl = root;
        this._syncSpeedControl();
    }

    _syncSpeedControl() {
        if (!this.speedControl) return;
        this.speedValue.textContent = `${this.shuffleSpeed.toFixed(2)} swaps/s`;
        if (document.activeElement !== this.speedSlider) this.speedSlider.value = String(this.shuffleSpeed);
        this.speedSlider.disabled = ['reveal', 'shuffle'].includes(this.phase);
        this.speedControl.style.opacity = this.speedSlider.disabled ? '0.72' : '1';
    }

    _startRound(seed = makeSeed()) {
        this.seed = seed >>> 0;
        this.roundSpeed = this.shuffleSpeed;
        const generated = generateCupShuffle(this.parameters, this.seed);
        this.moves = generated.moves;
        this.cups.forEach(cup => {
            cup.slot = cup.id;
            cup.hasBall = generated.ballCupIds.includes(cup.id);
        });
        this.selected.clear();
        this.correct = null;
        this.moveIndex = 0;
        this.moveElapsed = 0;
        this.activeMove = null;
        this.phase = 'reveal';
        this.phaseElapsed = 0;
        this._syncSpeedControl();
        this.audio.playClick?.();
    }

    _beginMove() {
        if (this.moveIndex >= this.moves.length) {
            this.phase = 'select';
            this.activeMove = null;
            this._syncSpeedControl();
            return;
        }
        const [firstSlot, secondSlot] = this.moves[this.moveIndex];
        const firstCup = this.cups.find(cup => cup.slot === firstSlot);
        const secondCup = this.cups.find(cup => cup.slot === secondSlot);
        this.activeMove = {
            firstCup,
            secondCup,
            firstSlot,
            secondSlot,
        };
        this.moveElapsed = 0;
    }

    _completeMove() {
        const move = this.activeMove;
        move.firstCup.slot = move.secondSlot;
        move.secondCup.slot = move.firstSlot;
        this.moveIndex++;
        this.activeMove = null;
        this.audio.playPlasticImpact?.(0.1);
        this._beginMove();
    }

    _layout() {
        const spacing = Math.min(148, (this.w - 90) / this.parameters.cupCount);
        return {
            spacing,
            cupWidth: clamp(spacing * 0.67, 34, 92),
            cupHeight: clamp(spacing * 0.78, 48, 108),
            centreX: this.w / 2,
            baseY: this.h * 0.61,
        };
    }

    _slotX(slot) {
        const layout = this._layout();
        return layout.centreX
            + (slot - (this.parameters.cupCount - 1) / 2) * layout.spacing;
    }

    _displayPose(cup) {
        const layout = this._layout();
        if (!this.activeMove || (cup !== this.activeMove.firstCup && cup !== this.activeMove.secondCup)) {
            const lift = this.phase === 'reveal' || this.phase === 'result' ? -layout.cupHeight * 0.72 : 0;
            return { x: this._slotX(cup.slot), y: layout.baseY + lift, upper: false };
        }
        const duration = 1 / this.roundSpeed;
        const t = clamp(this.moveElapsed / duration, 0, 1);
        const smooth = t * t * (3 - 2 * t);
        const first = cup === this.activeMove.firstCup;
        const start = first ? this.activeMove.firstSlot : this.activeMove.secondSlot;
        const end = first ? this.activeMove.secondSlot : this.activeMove.firstSlot;
        const arc = Math.sin(Math.PI * t);
        return {
            x: this._slotX(start + (end - start) * smooth),
            y: layout.baseY + (first ? -1 : 0.22) * layout.cupHeight * 0.72 * arc,
            upper: first,
        };
    }

    _cupAtMouse() {
        const mouse = this.input.getMousePos?.() || { x: -1, y: -1 };
        const layout = this._layout();
        return this.cups.find(cup => {
            const pose = this._displayPose(cup);
            return Math.abs(mouse.x - pose.x) <= layout.cupWidth * 0.58
                && mouse.y >= pose.y - layout.cupHeight
                && mouse.y <= pose.y + 10;
        });
    }

    _judgeSelection() {
        this.correct = this.cups.every(cup => cup.hasBall === this.selected.has(cup.id));
        this.phase = 'result';
        this.phaseElapsed = 0;
        if (this.correct) {
            this.bestSpeed = Math.max(this.bestSpeed, this.roundSpeed);
            this.submitScore({
                speed: Number(this.roundSpeed.toFixed(3)),
                swapsPerSecond: Number(this.roundSpeed.toFixed(3)),
                seed: this.seed,
            });
            this.shuffleSpeed = this.roundSpeed + CUP_SHUFFLE_SPEED.successIncrement;
            this.settings.shuffleSpeed = this.shuffleSpeed;
            this.audio.playSuccess?.();
        } else {
            this.audio.playPlasticImpact?.(0.32);
        }
        this._syncSpeedControl();
    }

    update(dt) {
        const delta = Math.min(0.05, Number(dt) || 0);
        this.phaseElapsed += delta;
        const click = Boolean(this.input.isMouseJustDown?.(0));
        const start = click || Boolean(this.input.isActionJustDown?.('start'));
        if (this.phase === 'ready') {
            if (start) this._startRound();
            return;
        }
        if (this.phase === 'result') {
            if (start) this._startRound();
            return;
        }
        if (this.phase === 'reveal') {
            if (this.phaseElapsed >= this.parameters.revealTime) {
                this.phase = 'shuffle';
                this.phaseElapsed = 0;
                this._beginMove();
                this._syncSpeedControl();
            }
            return;
        }
        if (this.phase === 'shuffle') {
            if (!this.activeMove) this._beginMove();
            if (!this.activeMove) return;
            this.moveElapsed += delta;
            if (this.moveElapsed >= 1 / this.roundSpeed) this._completeMove();
            return;
        }
        if (this.phase === 'select' && click) {
            const cup = this._cupAtMouse();
            if (!cup) return;
            if (this.selected.has(cup.id)) this.selected.delete(cup.id);
            else if (this.selected.size < this.parameters.ballCount) this.selected.add(cup.id);
            this.audio.playClick?.();
            if (this.selected.size === this.parameters.ballCount) this._judgeSelection();
        }
    }

    _drawBall(ctx, x, y, radius) {
        ctx.fillStyle = '#ffd239';
        ctx.strokeStyle = '#7e511b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.65)';
        ctx.beginPath();
        ctx.arc(x - radius * 0.28, y - radius * 0.32, radius * 0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawCup(ctx, cup) {
        const layout = this._layout();
        const pose = this._displayPose(cup);
        const width = layout.cupWidth;
        const height = layout.cupHeight;
        const selected = this.selected.has(cup.id);
        ctx.fillStyle = selected ? '#58d04d' : '#e84b40';
        ctx.strokeStyle = selected ? '#1d742b' : '#762a28';
        ctx.lineWidth = selected ? 6 : 4;
        ctx.beginPath();
        ctx.moveTo(pose.x - width * 0.53, pose.y - height);
        ctx.lineTo(pose.x + width * 0.53, pose.y - height);
        ctx.lineTo(pose.x + width * 0.39, pose.y);
        ctx.quadraticCurveTo(pose.x, pose.y + height * 0.15, pose.x - width * 0.39, pose.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#ff9c83';
        ctx.lineWidth = Math.max(2, width * 0.06);
        ctx.beginPath();
        ctx.moveTo(pose.x - width * 0.39, pose.y - height * 0.77);
        ctx.lineTo(pose.x + width * 0.39, pose.y - height * 0.77);
        ctx.stroke();
    }

    render() {
        const ctx = this.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.h);
        sky.addColorStop(0, '#61cdf5');
        sky.addColorStop(1, '#d5f5ff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, this.w, this.h);
        const layout = this._layout();
        ctx.fillStyle = '#75c64b';
        ctx.fillRect(0, layout.baseY + 12, this.w, this.h - layout.baseY);
        ctx.fillStyle = '#9a6638';
        ctx.fillRect(0, layout.baseY + 3, this.w, 20);

        const ballsVisible = this.phase === 'reveal' || this.phase === 'result';
        if (ballsVisible) {
            for (const cup of this.cups.filter(item => item.hasBall)) {
                this._drawBall(ctx, this._slotX(cup.slot), layout.baseY - 8, layout.cupWidth * 0.18);
            }
        }
        const ordered = [...this.cups].sort((a, b) => Number(this._displayPose(a).upper) - Number(this._displayPose(b).upper));
        for (const cup of ordered) this._drawCup(ctx, cup);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#25443a';
        ctx.font = '950 25px Inter,sans-serif';
        const title = this.phase === 'ready'
            ? 'CUP SHUFFLE'
            : (this.phase === 'reveal'
                ? `Remember ${this.parameters.ballCount === 1 ? 'the ball' : 'all balls'}`
                : (this.phase === 'shuffle'
                    ? `Swap ${Math.min(this.moveIndex + 1, this.parameters.shuffleMoves)} / ${this.parameters.shuffleMoves}`
                    : (this.phase === 'select'
                        ? `Choose ${this.parameters.ballCount} cup${this.parameters.ballCount === 1 ? '' : 's'}`
                        : (this.correct ? 'CORRECT' : 'WRONG CUPS'))));
        ctx.fillText(title, this.w / 2, this.h * 0.14);
        ctx.font = '750 14px Inter,sans-serif';
        ctx.fillStyle = '#4e6c62';
        if (this.phase === 'ready') ctx.fillText('Click or press Space to reveal the balls', this.w / 2, this.h * 0.2);
        if (this.phase === 'result') {
            ctx.fillText(
                this.correct
                    ? `${this.roundSpeed.toFixed(2)} swaps/s recorded · next round is faster`
                    : 'The hidden balls are shown · click to try again',
                this.w / 2,
                this.h * 0.2,
            );
        }
        ctx.textAlign = 'left';
        ctx.font = '800 12px Inter,sans-serif';
        ctx.fillText(`Best ${this.bestSpeed.toFixed(2)} swaps/s`, 18, 24);
    }

    onPause() { if (this.speedControl) this.speedControl.style.visibility = 'hidden'; }
    onResume() { if (this.speedControl) this.speedControl.style.visibility = ''; }
    destroy() {
        this.speedSlider?.removeEventListener('input', this._onSpeedInput);
        this.speedControl?.remove();
        this.speedControl = null;
    }

    getRecordSettings(settings = this.settings) {
        const { shuffleSpeed: _shuffleSpeed, ...recordSettings } = readCupShuffleSettings(settings, { strict: true });
        return recordSettings;
    }

    static getSettingsSchema() {
        const d = CUP_SHUFFLE_DEFAULTS;
        return [
            { key: 'cupCount', label: 'Number of cups', type: 'range', min: 2, max: 12, step: 1, default: d.cupCount },
            { key: 'shuffleMoves', label: 'Number of shuffle moves', type: 'range', min: 1, max: 80, step: 1, default: d.shuffleMoves },
            { key: 'ballCount', label: 'Number of hidden balls', type: 'range', min: 1, max: 11, step: 1, default: d.ballCount },
            { key: 'revealTime', label: 'Initial reveal time [s]', type: 'range', min: 0, step: 0.1, default: d.revealTime },
        ];
    }

    preparePauseSettings(settings) {
        validateCupShuffleSettings(settings);
        return settings;
    }

    static getControlsSchema() {
        return [{
            action: 'start',
            label: 'Start / next shuffle',
            defaultBindings: [{ type: 'keyboard', code: 'Space' }],
        }];
    }
}
