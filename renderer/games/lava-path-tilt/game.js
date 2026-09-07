import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function vec(x = 0, y = 0) {
    return { x, y };
}

function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}

function mul(a, scalar) {
    return { x: a.x * scalar, y: a.y * scalar };
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y;
}

function len(a) {
    return Math.hypot(a.x, a.y);
}

function normalize(a) {
    const length = len(a);
    if (!length) return { x: 0, y: 0 };
    return { x: a.x / length, y: a.y / length };
}

function distancePointToSegment(point, a, b) {
    const ab = sub(b, a);
    const abLenSq = dot(ab, ab);
    if (!abLenSq) {
        const delta = sub(point, a);
        return {
            distance: len(delta),
            t: 0,
            closest: { ...a },
            tangent: { x: 0, y: 1 },
        };
    }

    const t = clamp(dot(sub(point, a), ab) / abLenSq, 0, 1);
    const closest = add(a, mul(ab, t));
    const tangent = normalize(ab);
    const delta = sub(point, closest);

    return {
        distance: len(delta),
        t,
        closest,
        tangent,
    };
}

function orientation2D(a, b, c) {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (Math.abs(value) < 1e-6) return 0;
    return value > 0 ? 1 : 2;
}

function onSegment2D(a, b, c) {
    return (
        b.x <= Math.max(a.x, c.x) + 1e-6 &&
        b.x + 1e-6 >= Math.min(a.x, c.x) &&
        b.y <= Math.max(a.y, c.y) + 1e-6 &&
        b.y + 1e-6 >= Math.min(a.y, c.y)
    );
}

function segmentsIntersect2D(a, b, c, d) {
    const o1 = orientation2D(a, b, c);
    const o2 = orientation2D(a, b, d);
    const o3 = orientation2D(c, d, a);
    const o4 = orientation2D(c, d, b);

    if (o1 !== o2 && o3 !== o4) return true;
    if (o1 === 0 && onSegment2D(a, c, b)) return true;
    if (o2 === 0 && onSegment2D(a, d, b)) return true;
    if (o3 === 0 && onSegment2D(c, a, d)) return true;
    if (o4 === 0 && onSegment2D(c, b, d)) return true;
    return false;
}

function distanceSegmentToSegment(a, b, c, d) {
    if (segmentsIntersect2D(a, b, c, d)) return 0;
    return Math.min(
        distancePointToSegment(a, c, d).distance,
        distancePointToSegment(b, c, d).distance,
        distancePointToSegment(c, a, b).distance,
        distancePointToSegment(d, a, b).distance,
    );
}

export default class MinimalLavaPathGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});

        this.pathWidth = Number(this.settings.pathWidth ?? 96);
        this.friction = Number(this.settings.friction ?? 1.8);
        this.stickiness = Number(this.settings.stickiness ?? 5.5);
        this.tiltStrength = Number(this.settings.tiltStrength ?? 900);
        this.turnSharpness = Number(this.settings.turnSharpness ?? 0.58);
        this.localCalibration = this.settings.mobileCalibration || null;

        this.ballRadius = 16;
        this.segmentLength = 118;
        this.segmentCount = 40;
        this.extendBy = 12;
        this.maxSpeed = 680;
        this.cameraAhead = 210;

        this.score = 0;
        this.displayScore = 0;
        this.phase = 'playing';
        this.scoreSubmitted = false;

        this.pathPoints = [];
        this.pathLengths = [];
        this.pathHeading = 0;
        this.pathTurnVelocity = 0;
        this.pathLengthTotal = 0;
        this.nearestIndex = 0;

        this.ballPos = vec();
        this.ballVel = vec();
        this.filteredTilt = vec();
        this.tiltTarget = vec();
        this.camera = vec();
        this.packetRate = 0;
        this._packetCounter = 0;
        this._packetTimer = 0;

        this.mobile.clearCallbacks();
        this._bindMobileCallbacks();
        this._ensureHud();
        this._generateTrack();
        this._resetRun();
    }

    preparePauseSettings(settings) {
        requirePositiveNumber(settings.pathWidth ?? 96, 'Path width');
        requireFiniteNumber(settings.friction ?? 1.8, 'Friction', { minimum: 0 });
        requireFiniteNumber(settings.stickiness ?? 5.5, 'Stickiness', { minimum: 0 });
        requireFiniteNumber(settings.tiltStrength ?? 900, 'Tilt strength', { minimum: 0 });
        requireFiniteNumber(settings.turnSharpness ?? 0.58, 'Turn sharpness', { minimum: 0, maximum: 1 });
        return settings;
    }

    _bindMobileCallbacks() {
        this.mobile.onMessage((msg) => {
            if (msg?.type === 'sensor-frame') {
                this._packetCounter++;
            }
        });

        this.mobile.onCalibrationUpdate(() => this._renderHud());
    }

    applyPhoneCalibration(calibration) {
        this.localCalibration = calibration ? structuredClone(calibration) : null;
        this._renderHud();
    }

    _generateTrack() {
        this.pathPoints = [vec(0, 0), vec(0, this.segmentLength)];
        this.pathHeading = (Math.random() > 0.5 ? 1 : -1) * 0.26;
        this.pathTurnVelocity = this.pathHeading * 0.8;

        while (this.pathPoints.length < this.segmentCount) {
            this._appendSegment();
        }

        this._rebuildLengths();
    }

    _appendSegment() {
        const last = this.pathPoints[this.pathPoints.length - 1];
        const sharpness = clamp(this.turnSharpness, 0, 1);
        const waveStrength = lerp(0.08, 0.32, sharpness);
        const randomStrength = lerp(0.05, 0.34, sharpness);
        const turnDamping = lerp(0.92, 0.62, sharpness);
        const turnLimit = lerp(0.22, 1.0, sharpness);
        const headingStep = lerp(0.14, 0.56, sharpness);

        for (let attempt = 0; attempt < 160; attempt++) {
            const idx = this.pathPoints.length;
            const waveBias = Math.sin(idx * 0.72) * waveStrength;
            const turnImpulse = waveBias + (Math.random() * 2 - 1) * randomStrength;
            const nextTurnVelocity = clamp(
                this.pathTurnVelocity * turnDamping + turnImpulse,
                -turnLimit,
                turnLimit
            );
            const nextHeading = this.pathHeading + nextTurnVelocity * headingStep;
            const direction = { x: Math.sin(nextHeading), y: Math.cos(nextHeading) };
            const candidate = add(last, mul(direction, this.segmentLength));
            const margin = this.pathWidth * (attempt > 100 ? 1.2 : 1.55);

            if (!this._segmentIsSafe(last, candidate, margin)) continue;

            this.pathPoints.push(candidate);
            this.pathHeading = nextHeading;
            this.pathTurnVelocity = nextTurnVelocity;
            return;
        }

        this.pathPoints.push(add(last, vec((Math.random() - 0.5) * 70, this.segmentLength * 0.95)));
        this.pathHeading *= 0.4;
        this.pathTurnVelocity *= 0.4;
    }

    _segmentIsSafe(from, to, margin) {
        for (let i = 0; i < this.pathPoints.length - 2; i++) {
            const a = this.pathPoints[i];
            const b = this.pathPoints[i + 1];
            if (a === from || b === from) continue;
            if (distanceSegmentToSegment(from, to, a, b) < margin) return false;
        }
        return true;
    }

    _rebuildLengths() {
        this.pathLengths = [0];
        let total = 0;
        for (let i = 1; i < this.pathPoints.length; i++) {
            total += len(sub(this.pathPoints[i], this.pathPoints[i - 1]));
            this.pathLengths.push(total);
        }
        this.pathLengthTotal = total;
    }

    _ensureTrackAhead() {
        while (this.pathLengthTotal - this.score < this.segmentLength * 12) {
            for (let i = 0; i < this.extendBy; i++) {
                this._appendSegment();
            }
            this._rebuildLengths();
        }
    }

    _resetRun() {
        this.phase = 'playing';
        this.scoreSubmitted = false;
        this.score = 0;
        this.displayScore = 0;
        this.ballVel = vec(0, 0);
        this.filteredTilt = vec(0, 0);
        this.tiltTarget = vec(0, 0);
        this.nearestIndex = 0;
        this.ballPos = { ...this.pathPoints[0] };
        this.camera = { x: this.ballPos.x, y: this.ballPos.y + this.cameraAhead };
        this._renderHud();
    }

    _findNearestPathInfo(point) {
        const start = Math.max(0, this.nearestIndex - 4);
        const end = Math.min(this.pathPoints.length - 2, this.nearestIndex + 18);
        let best = null;

        for (let i = start; i <= end; i++) {
            const a = this.pathPoints[i];
            const b = this.pathPoints[i + 1];
            const info = distancePointToSegment(point, a, b);
            if (!best || info.distance < best.distance) {
                best = {
                    ...info,
                    segmentIndex: i,
                    progress: lerp(this.pathLengths[i], this.pathLengths[i + 1], info.t),
                };
            }
        }

        this.nearestIndex = best?.segmentIndex ?? this.nearestIndex;
        return best;
    }

    _readControls(dt) {
        const snapshot = this.mobile.getSnapshot();
        const restartPressed = this.input.isActionJustDown('restart') || this.input.isMouseJustDown(0);

        if (this.phase === 'dead' && restartPressed) {
            this._resetRun();
            return;
        }

        const phoneTilt = this.mobile.getMappedTilt(snapshot, this.localCalibration || undefined);
        const keyboardTilt = vec(
            (this.input.isActionDown('tiltRight') ? 1 : 0) - (this.input.isActionDown('tiltLeft') ? 1 : 0),
            (this.input.isActionDown('tiltUp') ? 1 : 0) - (this.input.isActionDown('tiltDown') ? 1 : 0),
        );

        const gamepadTilt = this.input.hasGamepad()
            ? vec(this.input.getAxis(0, 0), -this.input.getAxis(0, 1))
            : vec(0, 0);
        if (len(gamepadTilt) < 0.16) {
            gamepadTilt.x = 0;
            gamepadTilt.y = 0;
        }

        const combined = add(add(phoneTilt, keyboardTilt), gamepadTilt);
        const combinedLen = len(combined);
        this.tiltTarget = combinedLen > 1 ? mul(normalize(combined), 1) : combined;

        const inputBlend = 1 - Math.exp(-dt * (7 + this.stickiness * 0.3));
        this.filteredTilt.x = lerp(this.filteredTilt.x, this.tiltTarget.x, inputBlend);
        this.filteredTilt.y = lerp(this.filteredTilt.y, this.tiltTarget.y, inputBlend);
    }

    _updatePhysics(dt) {
        this._readControls(dt);

        if (this.phase === 'dead') {
            this.ballVel = mul(this.ballVel, Math.exp(-this.friction * 1.3 * dt));
            this.ballPos = add(this.ballPos, mul(this.ballVel, dt));
            return;
        }

        const pathInfo = this._findNearestPathInfo(this.ballPos);
        if (!pathInfo) return;

        const controlAccel = mul(this.filteredTilt, this.tiltStrength);
        const toCenter = sub(pathInfo.closest, this.ballPos);
        const centerPull = mul(toCenter, this.stickiness * 4.8);
        const acceleration = add(controlAccel, centerPull);

        this.ballVel = add(this.ballVel, mul(acceleration, dt));
        this.ballVel = mul(this.ballVel, Math.exp(-this.friction * dt));

        const speed = len(this.ballVel);
        if (speed > this.maxSpeed) {
            this.ballVel = mul(normalize(this.ballVel), this.maxSpeed);
        }

        this.ballPos = add(this.ballPos, mul(this.ballVel, dt));

        const updatedInfo = this._findNearestPathInfo(this.ballPos);
        this.score = Math.max(this.score, updatedInfo.progress);
        this.displayScore = lerp(this.displayScore, this.score, 1 - Math.exp(-dt * 12));

        const safeRadius = this.pathWidth * 0.5 - this.ballRadius * 0.48;
        if (updatedInfo.distance > Math.max(10, safeRadius)) {
            this._triggerFail();
        }
    }

    _triggerFail() {
        if (this.phase === 'dead') return;
        this.phase = 'dead';

        if (!this.scoreSubmitted) {
            this.submitScore({
                distance: Number(this.score.toFixed(2)),
                pathWidth: Number(this.pathWidth.toFixed(2)),
                friction: Number(this.friction.toFixed(2)),
                stickiness: Number(this.stickiness.toFixed(2)),
                turnSharpness: Number(this.turnSharpness.toFixed(2)),
            });
            this.scoreSubmitted = true;
        }

        this._renderHud();
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            z-index: 760;
            display: grid;
            gap: 16px;
            align-items: start;
            pointer-events: none;
            font-family: Inter, system-ui, sans-serif;
            color: #29362f;
        `;

        this.hud.innerHTML = `
            <div style="justify-self:end; min-width:320px; max-width:360px; padding:14px 18px; border-radius:18px; border:2px solid #5d6b62; background:rgba(239,243,240,.94); box-shadow:0 12px 30px rgba(25,48,33,.22); text-align:right;">
                <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.12em; color:#c25829;">Distance Survived</div>
                <div id="mini-score-value" style="margin-top:4px; font-size:42px; font-weight:900;">0.0 m</div>
                <div id="mini-subtitle" style="margin-top:6px; font-size:13px; color:#536258;"></div>
                <div id="mini-status-line" style="margin-top:6px; font-size:12px; color:#66756b;"></div>
            </div>
            <div id="mini-dead-panel" style="display:none; position:fixed; inset:0; place-items:center; pointer-events:auto; background:rgba(72,55,43,.30);">
                <div style="width:min(360px, calc(100vw - 32px)); padding:22px; border-radius:20px; background:#eff3f0; border:2px solid #5d6b62; box-shadow:0 24px 60px rgba(25,48,33,.28); text-align:center;">
                    <div style="font-size:13px; letter-spacing:0.12em; text-transform:uppercase; color:#c25829;">Game Over</div>
                    <div id="mini-dead-score" style="margin-top:10px; font-size:34px; font-weight:900;">0.0 m</div>
                    <button id="mini-restart-button" type="button" style="margin-top:16px; width:100%; border:2px solid #277632; border-radius:12px; padding:11px 14px; background:#50c747; color:#153318; font-weight:800; cursor:pointer;">Restart Run</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.hud);

        this.scoreValueEl = this.hud.querySelector('#mini-score-value');
        this.subtitleEl = this.hud.querySelector('#mini-subtitle');
        this.statusLineEl = this.hud.querySelector('#mini-status-line');
        this.deadPanelEl = this.hud.querySelector('#mini-dead-panel');
        this.deadScoreEl = this.hud.querySelector('#mini-dead-score');
        this.restartButtonEl = this.hud.querySelector('#mini-restart-button');

        this._handleRestartClick = () => this._resetRun();
        this.restartButtonEl.addEventListener('click', this._handleRestartClick);

        this._renderHud();
    }

    _renderHud() {
        if (!this.hud) return;

        const effectiveCalibration = this.localCalibration || this.mobile.getGlobalCalibration();
        const calibration = this.mobile.getCalibrationSummary(
            effectiveCalibration,
            { inheritedFromGlobal: !this.localCalibration }
        );

        this.scoreValueEl.textContent = `${this.displayScore.toFixed(1)} m`;
        this.subtitleEl.textContent = `Path ${this.pathWidth.toFixed(0)} | Friction ${this.friction.toFixed(1)} | Stickiness ${this.stickiness.toFixed(1)} | Turns ${this.turnSharpness.toFixed(2)}`;
        this.statusLineEl.textContent = `${this.mobile.isConnected ? 'Phone connected' : 'Keyboard / gamepad fallback'} | ${calibration.statusLabel}${this.localCalibration ? '' : ' (global default)'}`;
        this.deadPanelEl.style.display = this.phase === 'dead' ? 'grid' : 'none';
        this.deadScoreEl.textContent = `${this.displayScore.toFixed(1)} m`;
    }

    _tracePath(ctx, toScreenX, toScreenY) {
        const pts = this.pathPoints;
        if (pts.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(toScreenX(pts[0].x), toScreenY(pts[0].y));

        for (let i = 1; i < pts.length - 1; i++) {
            const current = pts[i];
            const next = pts[i + 1];
            const midX = (current.x + next.x) * 0.5;
            const midY = (current.y + next.y) * 0.5;
            ctx.quadraticCurveTo(
                toScreenX(current.x),
                toScreenY(current.y),
                toScreenX(midX),
                toScreenY(midY),
            );
        }

        const last = pts[pts.length - 1];
        ctx.lineTo(toScreenX(last.x), toScreenY(last.y));
    }

    update(dt) {
        this._packetTimer += dt;
        if (this._packetTimer >= 0.45) {
            this.packetRate = Math.round(this._packetCounter / this._packetTimer);
            this._packetCounter = 0;
            this._packetTimer = 0;
            this._renderHud();
        }

        this._ensureTrackAhead();
        this._updatePhysics(dt);

        this.camera.x = lerp(this.camera.x, this.ballPos.x, 1 - Math.exp(-dt * 5));
        this.camera.y = lerp(this.camera.y, this.ballPos.y + this.cameraAhead, 1 - Math.exp(-dt * 5));
    }

    _drawLava(ctx, timeSeconds) {
        const base = ctx.createLinearGradient(0, 0, 0, this.h);
        base.addColorStop(0, '#43100a');
        base.addColorStop(0.52, '#7f1b0b');
        base.addColorStop(1, '#2b0705');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, this.w, this.h);

        // Slowly moving hot pools provide depth without the old horizontal
        // stripe pattern. Positions are deterministic functions of time.
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let index = 0; index < 11; index++) {
            const radius = 95 + (index % 4) * 34;
            const x = ((index * 241 + timeSeconds * (13 + index * 0.7)) % (this.w + radius * 2)) - radius;
            const y = ((index * 137 + Math.sin(timeSeconds * 0.31 + index) * 75) % (this.h + radius * 2)) - radius * 0.25;
            const glow = ctx.createRadialGradient(x, y, radius * 0.08, x, y, radius);
            glow.addColorStop(0, 'rgba(255,207,79,.30)');
            glow.addColorStop(0.36, 'rgba(255,90,22,.22)');
            glow.addColorStop(1, 'rgba(80,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        }
        ctx.restore();

        // Irregular dark crust seams with a narrow incandescent centre.
        for (let vein = 0; vein < 10; vein++) {
            const baseY = (vein + 0.5) * this.h / 10;
            const trace = () => {
                ctx.beginPath();
                for (let x = -24; x <= this.w + 24; x += 24) {
                    const y = baseY
                        + Math.sin(x * 0.018 + vein * 1.73 + timeSeconds * 0.42) * (15 + vein % 3 * 5)
                        + Math.sin(x * 0.006 - timeSeconds * 0.23 + vein) * 12;
                    if (x === -24) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
            };
            trace();
            ctx.strokeStyle = 'rgba(34,8,7,.72)';
            ctx.lineWidth = 9 + (vein % 3) * 2;
            ctx.stroke();
            trace();
            ctx.strokeStyle = 'rgba(255,112,28,.62)';
            ctx.lineWidth = 2.2;
            ctx.shadowColor = '#ff5b17';
            ctx.shadowBlur = 9;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;

        const scale = 0.72;
        const toScreenX = (x) => this.w * 0.5 + (x - this.camera.x) * scale;
        const toScreenY = (y) => this.h * 0.72 + (this.camera.y - y) * scale;

        this._drawLava(ctx, performance.now() / 1000);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this._tracePath(ctx, toScreenX, toScreenY);
        ctx.strokeStyle = 'rgba(72, 60, 50, 0.90)';
        ctx.lineWidth = (this.pathWidth + 16) * scale;
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this._tracePath(ctx, toScreenX, toScreenY);
        ctx.strokeStyle = '#d9d4cc';
        ctx.lineWidth = this.pathWidth * scale;
        ctx.shadowBlur = 18;
        ctx.shadowColor = 'rgba(255, 247, 228, 0.18)';
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this._tracePath(ctx, toScreenX, toScreenY);
        ctx.strokeStyle = 'rgba(248,245,238,0.78)';
        ctx.lineWidth = Math.max(3, this.pathWidth * 0.18 * scale);
        ctx.stroke();
        ctx.restore();

        const tiltIndicatorX = this.w - 90;
        const tiltIndicatorY = this.h - 90;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(tiltIndicatorX, tiltIndicatorY, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#f3efe5';
        ctx.beginPath();
        ctx.arc(
            tiltIndicatorX + this.filteredTilt.x * 24,
            tiltIndicatorY - this.filteredTilt.y * 24,
            9,
            0,
            Math.PI * 2
        );
        ctx.fill();

        const ballScreenX = toScreenX(this.ballPos.x);
        const ballScreenY = toScreenY(this.ballPos.y);
        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.beginPath();
        ctx.ellipse(ballScreenX, ballScreenY + 10, this.ballRadius * scale * 1.05, this.ballRadius * scale * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();

        const ballGrad = ctx.createRadialGradient(
            ballScreenX - 8,
            ballScreenY - 10,
            4,
            ballScreenX,
            ballScreenY,
            this.ballRadius * scale
        );
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.45, '#ece8df');
        ballGrad.addColorStop(1, '#bdb6aa');
        ctx.fillStyle = ballGrad;
        ctx.beginPath();
        ctx.arc(ballScreenX, ballScreenY, this.ballRadius * scale, 0, Math.PI * 2);
        ctx.fill();

        if (this.phase === 'dead') {
            ctx.fillStyle = 'rgba(255,120,64,0.12)';
            ctx.fillRect(0, 0, this.w, this.h);
        }
    }

    destroy() {
        this.mobile.clearCallbacks();
        if (this.restartButtonEl && this._handleRestartClick) {
            this.restartButtonEl.removeEventListener('click', this._handleRestartClick);
        }
        if (this.hud) {
            this.hud.remove();
            this.hud = null;
        }
    }

    static getSettingsSchema() {
        return [
            { key: 'pathWidth', label: 'Path Width', type: 'range', min: 60, max: 180, step: 5, default: 85 },
            { key: 'friction', label: 'Friction', type: 'range', min: 0.2, max: 5.0, step: 0.1, default: 1.2 },
            { key: 'stickiness', label: 'Stickiness', type: 'range', min: 0.5, max: 12, step: 0.1, default: 3 },
            { key: 'tiltStrength', label: 'Tilt Strength', type: 'range', min: 200, max: 1600, step: 25, default: 900 },
            { key: 'turnSharpness', label: 'Turn Sharpness', type: 'range', min: 0.0, max: 1.0, step: 0.01, default: 1 },
        ];
    }

    static getControlsSchema() {
        return [
            {
                action: 'tiltLeft',
                label: 'Tilt Left',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowLeft' },
                    { type: 'keyboard', code: 'KeyA' },
                ],
            },
            {
                action: 'tiltRight',
                label: 'Tilt Right',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowRight' },
                    { type: 'keyboard', code: 'KeyD' },
                ],
            },
            {
                action: 'tiltUp',
                label: 'Tilt Forward',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowUp' },
                    { type: 'keyboard', code: 'KeyW' },
                ],
            },
            {
                action: 'tiltDown',
                label: 'Tilt Back',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowDown' },
                    { type: 'keyboard', code: 'KeyS' },
                ],
            },
            {
                action: 'restart',
                label: 'Restart Run',
                defaultBindings: [
                    { type: 'keyboard', code: 'Enter' },
                    { type: 'mouse', code: 0 },
                    { type: 'gamepad', code: 1 },
                ],
            },
        ];
    }
}
