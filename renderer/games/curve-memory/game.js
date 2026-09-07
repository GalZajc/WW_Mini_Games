import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requireInteger, requirePositiveNumber } from '../../core/SettingsValidation.js';

export const CURVE_MEMORY_DEFAULTS = Object.freeze({
    viewTime: 2.4,
    curveLength: 8,
    persistenceLength: 2.2,
    curvatureCorrelation: 0.34,
    drawingLowpassPasses: 4,
});

const LOGICAL_HEIGHT = 720;
const GENERATED_SAMPLES = 420;
const COMPARISON_SAMPLES = 150;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function normalRandom(random) {
    const first = Math.max(1e-12, random());
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random());
}

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Date.now() >>> 0;
}

export function readCurveMemorySettings(settings = {}, { strict = false } = {}) {
    const source = { ...CURVE_MEMORY_DEFAULTS, ...(settings || {}) };
    if (strict) validateCurveMemorySettings(source);
    const number = (value, fallback, minimum, maximum) => {
        const parsed = Number.isFinite(Number(value)) ? Number(value) : fallback;
        return strict ? parsed : Math.max(minimum, Math.min(maximum, parsed));
    };
    const integer = (value, fallback, minimum, maximum) => Math.round(number(value, fallback, minimum, maximum));
    return Object.freeze({
        viewTime: number(source.viewTime, CURVE_MEMORY_DEFAULTS.viewTime, 0.4, 10),
        curveLength: number(source.curveLength, CURVE_MEMORY_DEFAULTS.curveLength, 2, 24),
        persistenceLength: number(source.persistenceLength, CURVE_MEMORY_DEFAULTS.persistenceLength, 0.35, 15),
        curvatureCorrelation: number(source.curvatureCorrelation, CURVE_MEMORY_DEFAULTS.curvatureCorrelation, 0.08, 2),
        drawingLowpassPasses: integer(source.drawingLowpassPasses, CURVE_MEMORY_DEFAULTS.drawingLowpassPasses, 0, 12),
    });
}

export function validateCurveMemorySettings(settings = {}) {
    requireFiniteNumber(settings.viewTime ?? CURVE_MEMORY_DEFAULTS.viewTime, 'Curve viewing time', { minimum: 0 });
    requirePositiveNumber(settings.curveLength ?? CURVE_MEMORY_DEFAULTS.curveLength, 'Curve contour length');
    requirePositiveNumber(settings.persistenceLength ?? CURVE_MEMORY_DEFAULTS.persistenceLength, 'Persistence length');
    requireFiniteNumber(settings.curvatureCorrelation ?? CURVE_MEMORY_DEFAULTS.curvatureCorrelation, 'Curvature smoothing length', { minimum: 0 });
    requireInteger(settings.drawingLowpassPasses ?? CURVE_MEMORY_DEFAULTS.drawingLowpassPasses, 'Drawing low-pass passes', { minimum: 0 });
}

/** Smooth worm-like chain with tangent persistence controlled in arc-length units. */
export function generateMemoryCurve(parameters, seed) {
    const random = seededRandom(seed);
    const count = GENERATED_SAMPLES;
    const ds = parameters.curveLength / (count - 1);
    const correlation = Math.max(ds * 3, parameters.curvatureCorrelation);
    const curvatureVariance = 1 / Math.max(
        1e-6,
        parameters.persistenceLength * correlation,
    );
    const rho = Math.exp(-ds / correlation);
    const innovation = Math.sqrt(curvatureVariance * (1 - rho * rho));
    let curvature = normalRandom(random) * Math.sqrt(curvatureVariance);
    let angle = random() * Math.PI * 2;
    let x = 0;
    let y = 0;
    const points = [{ x, y }];
    for (let index = 1; index < count; index++) {
        curvature = rho * curvature + innovation * normalRandom(random);
        angle += curvature * ds;
        x += Math.cos(angle) * ds;
        y += Math.sin(angle) * ds;
        points.push({ x, y });
    }
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;
    const scale = Math.min(
        0.76 / Math.max(1e-6, maxX - minX),
        0.62 / Math.max(1e-6, maxY - minY),
    );
    return points.map(point => ({
        x: 0.5 + (point.x - centreX) * scale,
        y: 0.52 + (point.y - centreY) * scale,
    }));
}

export function smoothCurve(points, passes = 1) {
    let output = (points || []).map(point => ({ ...point }));
    for (let pass = 0; pass < passes && output.length >= 5; pass++) {
        output = output.map((point, index, source) => {
            if (index === 0 || index === source.length - 1) return { ...point };
            const p0 = source[Math.max(0, index - 2)];
            const p1 = source[Math.max(0, index - 1)];
            const p2 = source[index];
            const p3 = source[Math.min(source.length - 1, index + 1)];
            const p4 = source[Math.min(source.length - 1, index + 2)];
            return {
                x: (p0.x + 4 * p1.x + 6 * p2.x + 4 * p3.x + p4.x) / 16,
                y: (p0.y + 4 * p1.y + 6 * p2.y + 4 * p3.y + p4.y) / 16,
            };
        });
    }
    return output;
}

export function curveArcLength(points) {
    let total = 0;
    for (let index = 1; index < points.length; index++) {
        total += distance(points[index - 1], points[index]);
    }
    return total;
}

export function resampleCurve(points, count = COMPARISON_SAMPLES) {
    if (!points?.length) return [];
    if (points.length === 1) return Array.from({ length: count }, () => ({ ...points[0] }));
    const cumulative = [0];
    for (let index = 1; index < points.length; index++) {
        cumulative.push(cumulative.at(-1) + distance(points[index - 1], points[index]));
    }
    const total = cumulative.at(-1);
    if (total < 1e-9) return Array.from({ length: count }, () => ({ ...points[0] }));
    const result = [];
    let segment = 1;
    for (let sample = 0; sample < count; sample++) {
        const target = total * sample / (count - 1);
        while (segment < cumulative.length - 1 && cumulative[segment] < target) segment++;
        const startDistance = cumulative[segment - 1];
        const segmentLength = Math.max(1e-12, cumulative[segment] - startDistance);
        const t = (target - startDistance) / segmentLength;
        const a = points[segment - 1];
        const b = points[segment];
        result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return result;
}

function centroid(points) {
    const sum = points.reduce((result, point) => ({
        x: result.x + point.x,
        y: result.y + point.y,
    }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

export function extractCurveExtrema(points) {
    const events = [];
    const windowSize = 3;
    for (const axis of ['x', 'y']) {
        let priorSign = 0;
        let priorIndex = windowSize;
        for (let index = windowSize; index < points.length - windowSize; index++) {
            const derivative = points[index + windowSize][axis]
                - points[index - windowSize][axis];
            const sign = Math.abs(derivative) < 0.0012 ? 0 : Math.sign(derivative);
            if (!sign) continue;
            if (priorSign && sign !== priorSign) {
                const candidateIndex = Math.round((priorIndex + index) / 2);
                const candidate = {
                    axis,
                    type: priorSign > 0 ? 'max' : 'min',
                    index: candidateIndex,
                    t: candidateIndex / (points.length - 1),
                    point: { ...points[candidateIndex] },
                };
                const last = events.at(-1);
                if (!last || last.axis !== axis || candidate.t - last.t > 0.035) {
                    events.push(candidate);
                }
            }
            priorSign = sign;
            priorIndex = index;
        }
    }
    return events.sort((a, b) => a.t - b.t || a.axis.localeCompare(b.axis));
}

function extremaSequenceError(target, player) {
    const a = extractCurveExtrema(target);
    const b = extractCurveExtrema(player);
    const deletionCost = 0.72;
    const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) rows[i][0] = i * deletionCost;
    for (let j = 1; j <= b.length; j++) rows[0][j] = j * deletionCost;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const first = a[i - 1];
            const second = b[j - 1];
            const mismatch = (first.axis === second.axis ? 0 : 0.65)
                + (first.type === second.type ? 0 : 0.55)
                + clamp(distance(first.point, second.point) / 0.3, 0, 1)
                + 0.45 * Math.abs(first.t - second.t);
            rows[i][j] = Math.min(
                rows[i - 1][j] + deletionCost,
                rows[i][j - 1] + deletionCost,
                rows[i - 1][j - 1] + mismatch,
            );
        }
    }
    return clamp(rows[a.length][b.length] / Math.max(1, Math.max(a.length, b.length)), 0, 1);
}

function compareOrientation(target, player) {
    const targetCentre = centroid(target);
    const playerCentre = centroid(player);
    const shift = {
        x: targetCentre.x - playerCentre.x,
        y: targetCentre.y - playerCentre.y,
    };
    const aligned = player.map(point => ({ x: point.x + shift.x, y: point.y + shift.y }));
    let pointError = 0;
    let tangentError = 0;
    for (let index = 0; index < target.length; index++) {
        pointError += distance(target[index], aligned[index]);
        if (index === 0) continue;
        const ta = {
            x: target[index].x - target[index - 1].x,
            y: target[index].y - target[index - 1].y,
        };
        const tb = {
            x: aligned[index].x - aligned[index - 1].x,
            y: aligned[index].y - aligned[index - 1].y,
        };
        const denominator = Math.max(1e-9, Math.hypot(ta.x, ta.y) * Math.hypot(tb.x, tb.y));
        tangentError += (1 - clamp((ta.x * tb.x + ta.y * tb.y) / denominator, -1, 1)) / 2;
    }
    pointError = clamp(pointError / target.length / 0.28, 0, 1);
    tangentError = clamp(tangentError / (target.length - 1), 0, 1);
    const lengthError = clamp(Math.abs(Math.log(
        Math.max(1e-6, curveArcLength(player))
            / Math.max(1e-6, curveArcLength(target)),
    )) / 0.7, 0, 1);
    const positionError = clamp(distance(targetCentre, playerCentre) / 0.36, 0, 1);
    const turningError = extremaSequenceError(target, aligned);
    const error = 0.42 * pointError
        + 0.18 * tangentError
        + 0.18 * turningError
        + 0.10 * lengthError
        + 0.12 * positionError;
    return {
        error,
        pointError,
        tangentError,
        turningError,
        lengthError,
        positionError,
    };
}

export function scoreCurveMatch(targetPoints, playerPoints, lowpassPasses = 4) {
    if (!targetPoints?.length || !playerPoints?.length) {
        return { score: 0, error: 1, reversed: false };
    }
    const target = resampleCurve(smoothCurve(targetPoints, 2));
    const player = resampleCurve(smoothCurve(playerPoints, lowpassPasses));
    const forward = compareOrientation(target, player);
    const reverse = compareOrientation(target, [...player].reverse());
    const best = reverse.error < forward.error
        ? { ...reverse, reversed: true }
        : { ...forward, reversed: false };
    return {
        ...best,
        score: Number((100 * Math.exp(-3.1 * best.error)).toFixed(2)),
    };
}

export default class CurveMemoryGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        validateCurveMemorySettings(this.settings || {});
        this.parameters = readCurveMemorySettings(this.settings, { strict: true });
        this.phase = 'ready';
        this.phaseElapsed = 0;
        this.targetCurve = [];
        this.playerCurve = [];
        this.smoothedPlayerCurve = [];
        this.drawing = false;
        this.result = null;
        this.bestScore = 0;
        this._loadBest();
    }

    async _loadBest() {
        try {
            const record = await this.app?.records?.getBest(
                'curve-memory', this.getRecordSettings(this.settings), 'score',
            );
            const value = Number(record?.results?.score);
            if (Number.isFinite(value)) this.bestScore = value;
        } catch (error) {
            console.warn('Could not load Curve Memory record:', error);
        }
    }

    _startRound(seed = makeSeed()) {
        this.seed = seed >>> 0;
        this.targetCurve = generateMemoryCurve(this.parameters, this.seed);
        this.playerCurve = [];
        this.smoothedPlayerCurve = [];
        this.result = null;
        this.drawing = false;
        this.phase = 'showing';
        this.phaseElapsed = 0;
        this.audio.playClick?.();
    }

    _normalizedMouse() {
        const mouse = this.input.getMousePos?.() || { x: this.w / 2, y: this.h / 2 };
        return {
            x: clamp(mouse.x / Math.max(1, this.w), 0, 1),
            y: clamp(mouse.y / Math.max(1, this.h), 0, 1),
        };
    }

    _judgeDrawing() {
        this.smoothedPlayerCurve = smoothCurve(
            this.playerCurve,
            this.parameters.drawingLowpassPasses,
        );
        this.result = scoreCurveMatch(
            this.targetCurve,
            this.playerCurve,
            this.parameters.drawingLowpassPasses,
        );
        this.bestScore = Math.max(this.bestScore, this.result.score);
        this.phase = 'result';
        this.phaseElapsed = 0;
        this.submitScore({
            score: this.result.score,
            pointMatch: Number(((1 - this.result.pointError) * 100).toFixed(1)),
            tangentMatch: Number(((1 - this.result.tangentError) * 100).toFixed(1)),
            turningPointMatch: Number(((1 - this.result.turningError) * 100).toFixed(1)),
            seed: this.seed,
        });
        this.audio.playPlasticImpact?.(0.2);
    }

    update(dt) {
        const delta = Math.min(0.05, Number(dt) || 0);
        this.phaseElapsed += delta;
        const start = Boolean(
            this.input.isActionJustDown?.('start')
                || this.input.isMouseJustDown?.(0),
        );
        if (this.phase === 'ready' || this.phase === 'result') {
            if (start) this._startRound();
            return;
        }
        if (this.phase === 'showing') {
            if (this.phaseElapsed >= this.parameters.viewTime) {
                this.phase = 'drawing';
                this.phaseElapsed = 0;
            }
            return;
        }
        if (this.phase !== 'drawing') return;
        if (this.input.isMouseJustDown?.(0)) {
            this.drawing = true;
            this.playerCurve = [this._normalizedMouse()];
        }
        if (this.drawing && this.input.isMouseDown?.(0)) {
            const point = this._normalizedMouse();
            if (distance(point, this.playerCurve.at(-1)) > 0.0015) this.playerCurve.push(point);
        }
        if (this.drawing && this.input.isMouseJustUp?.(0)) {
            this.drawing = false;
            if (this.playerCurve.length >= 12 && curveArcLength(this.playerCurve) > 0.06) {
                this._judgeDrawing();
            } else {
                this.playerCurve = [];
            }
        }
    }

    _traceCurve(ctx, points, width, height, color, lineWidth, dash = []) {
        if (points.length < 2) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(dash);
        ctx.beginPath();
        ctx.moveTo(points[0].x * width, points[0].y * height);
        for (const point of points.slice(1)) ctx.lineTo(point.x * width, point.y * height);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    render() {
        const ctx = this.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.h);
        sky.addColorStop(0, '#64ccf5');
        sky.addColorStop(1, '#d9f7ff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.fillStyle = 'rgba(250,255,249,.88)';
        ctx.strokeStyle = '#2d8340';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(this.w * 0.075, this.h * 0.13, this.w * 0.85, this.h * 0.73, 24);
        ctx.fill();
        ctx.stroke();

        if (this.phase === 'showing' || this.phase === 'result') {
            this._traceCurve(ctx, this.targetCurve, this.w, this.h, this.phase === 'result' ? '#d7483e' : '#173e72', 7);
        }
        if (this.phase === 'drawing') {
            this._traceCurve(ctx, this.playerCurve, this.w, this.h, '#248d45', 6);
        } else if (this.phase === 'result') {
            this._traceCurve(ctx, this.smoothedPlayerCurve, this.w, this.h, '#248d45', 5, [10, 7]);
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#27453c';
        if (this.phase === 'ready') {
            ctx.font = '950 40px Inter,sans-serif';
            ctx.fillText('CURVE MEMORY', this.w / 2, this.h * 0.43);
            ctx.font = '750 15px Inter,sans-serif';
            ctx.fillStyle = '#536f66';
            ctx.fillText('Click or press Space to reveal a new curve', this.w / 2, this.h * 0.52);
        } else if (this.phase === 'showing') {
            ctx.font = '850 16px Inter,sans-serif';
            ctx.fillText(`Remember the curve · ${(this.parameters.viewTime - this.phaseElapsed).toFixed(1)} s`, this.w / 2, this.h * 0.075);
        } else if (this.phase === 'drawing') {
            ctx.font = '850 16px Inter,sans-serif';
            ctx.fillText('Draw one continuous stroke · release to compare · no time limit', this.w / 2, this.h * 0.075);
        } else if (this.phase === 'result') {
            ctx.font = '950 31px Inter,sans-serif';
            ctx.fillStyle = '#267d39';
            ctx.fillText(`${this.result.score.toFixed(1)} / 100`, this.w / 2, this.h * 0.075);
            ctx.font = '750 12px Inter,sans-serif';
            ctx.fillStyle = '#526e65';
            ctx.fillText(
                `shape ${Math.round((1 - this.result.pointError) * 100)}% · turns ${Math.round((1 - this.result.turningError) * 100)}% · click for another`,
                this.w / 2,
                this.h * 0.91,
            );
        }
        ctx.textAlign = 'left';
        ctx.font = '800 12px Inter,sans-serif';
        ctx.fillStyle = '#416159';
        ctx.fillText(`Best ${this.bestScore.toFixed(1)}`, 18, 24);
    }

    destroy() {}
    onResize() {}

    getRecordSettings(settings = this.settings) {
        return { ...readCurveMemorySettings(settings, { strict: true }) };
    }

    preparePauseSettings(settings) {
        validateCurveMemorySettings(settings);
        return settings;
    }

    static getSettingsSchema() {
        const d = CURVE_MEMORY_DEFAULTS;
        return [
            { key: 'viewTime', label: 'Curve viewing time [s]', type: 'range', min: 0.4, max: 10, step: 0.1, default: d.viewTime, group: 'Memory' },
            { key: 'curveLength', label: 'Curve contour length', type: 'range', min: 2, max: 24, step: 0.25, default: d.curveLength, group: 'Curve generation' },
            { key: 'persistenceLength', label: 'Persistence length', type: 'range', min: 0.35, max: 15, step: 0.05, default: d.persistenceLength, group: 'Curve generation' },
            { key: 'curvatureCorrelation', label: 'Curvature smoothing length', type: 'range', min: 0.08, max: 2, step: 0.02, default: d.curvatureCorrelation, group: 'Curve generation' },
            { key: 'drawingLowpassPasses', label: 'Symmetric drawing low-pass passes', type: 'range', min: 0, max: 12, step: 1, default: d.drawingLowpassPasses, group: 'Comparison' },
        ];
    }

    static getControlsSchema() {
        return [{
            action: 'start',
            label: 'Reveal next curve',
            defaultBindings: [{ type: 'keyboard', code: 'Space' }],
        }];
    }
}
