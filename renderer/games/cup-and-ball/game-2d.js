import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

/*
 * Every physical/numerical parameter used by the 2D model lives here. Values
 * exposed in Settings are overridden once in init(); the remaining values are
 * implementation constants shared by every run.
 */
const MODEL = Object.freeze({
    gravity: 8.8,
    ropeLength: 1.7,
    ropeStiffness: 58,
    ropeDamping: 200,
    viewHeightFactor: 2.6,
    viewSafetyFactor: 1.05,
    ballRadius: 0.26,
    cupRadius: 0.34,
    handleLength: 0.9,
    attachRatio: 0.74,
    cupDepth: 0.28,
    cupRestitution: 0.34,
    cupFriction: 0.32,
    angularSpeedDegrees: 125,
    catchHoldDuration: 0.3,
    fixedTimeStep: 1 / 180,
    maximumSubsteps: 12,
    maximumHandleSpeed: 24,
    maximumRopeStretch: 1.16,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function vector(x = 0, y = 0) { return { x, y }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
function scale(a, factor) { return { x: a.x * factor, y: a.y * factor }; }
function dot(a, b) { return a.x * b.x + a.y * b.y; }
function length(a) { return Math.hypot(a.x, a.y); }
function normalize(a, fallback = vector(0, -1)) {
    const magnitude = length(a);
    return magnitude > 1e-8 ? scale(a, 1 / magnitude) : { ...fallback };
}

export function resolveCircleSegmentCollision({
    position,
    velocity,
    radius,
    start,
    end,
    surfaceVelocity = vector(),
    restitution = 0,
    friction = 0,
}) {
    const segment = subtract(end, start);
    const segmentLengthSquared = Math.max(1e-12, dot(segment, segment));
    const projection = clamp(dot(subtract(position, start), segment) / segmentLengthSquared, 0, 1);
    const closest = add(start, scale(segment, projection));
    const separation = subtract(position, closest);
    const distance = length(separation);
    if (distance >= radius) return { collided: false, position, velocity };
    const fallbackNormal = normalize(vector(-segment.y, segment.x), vector(0, 1));
    const normal = distance > 1e-8 ? scale(separation, 1 / distance) : fallbackNormal;
    const correctedPosition = add(position, scale(normal, radius - distance + 1e-6));
    const relativeVelocity = subtract(velocity, surfaceVelocity);
    const normalSpeed = dot(relativeVelocity, normal);
    if (normalSpeed >= 0) return { collided: true, position: correctedPosition, velocity };
    const normalImpulse = -(1 + restitution) * normalSpeed;
    let correctedVelocity = add(velocity, scale(normal, normalImpulse));
    const tangent = vector(-normal.y, normal.x);
    const tangentSpeed = dot(subtract(correctedVelocity, surfaceVelocity), tangent);
    const frictionImpulse = clamp(-tangentSpeed, -friction * normalImpulse, friction * normalImpulse);
    correctedVelocity = add(correctedVelocity, scale(tangent, frictionImpulse));
    return { collided: true, position: correctedPosition, velocity: correctedVelocity };
}

export default class CupAndBall2DGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});
        this.parameters = Object.freeze({
            ...MODEL,
            gravity: Number(this.settings.gravity ?? MODEL.gravity),
            ropeLength: Number(this.settings.ropeLength ?? MODEL.ropeLength),
            ropeStiffness: Number(this.settings.ropeStiffness ?? MODEL.ropeStiffness),
            ropeDamping: Number(this.settings.ropeDamping ?? MODEL.ropeDamping),
            viewHeightFactor: Number(this.settings.viewHeightFactor ?? MODEL.viewHeightFactor),
            ballRadius: Number(this.settings.ballRadius ?? MODEL.ballRadius),
            cupRadius: Number(this.settings.cupRadius ?? MODEL.cupRadius),
            angularSpeedDegrees: Number(this.settings.angularSpeedDegrees ?? MODEL.angularSpeedDegrees),
            cupRestitution: Number(this.settings.cupRestitution ?? MODEL.cupRestitution),
            cupFriction: Number(this.settings.cupFriction ?? MODEL.cupFriction),
        });

        this.phase = 'playing';
        this.streak = 0;
        this.bestStreak = 0;
        this.scoreSubmitted = false;
        this.accumulator = 0;
        this.handleAngle = 0;
        this.handleAngularVelocity = 0;
        this.handlePosition = vector();
        this.previousHandlePosition = vector();
        this.handleVelocity = vector();
        this.attachPoint = vector();
        this.previousAttachPoint = vector();
        this.attachVelocity = vector();
        this.cupCenter = vector();
        this.ballPosition = vector();
        this.ballVelocity = vector();
        this.lastRelativeHeight = -1;
        this.attemptActive = false;
        this.catchHoldTimer = 0;

        this._ensureHud();
        this._resetRun();
    }

    preparePauseSettings(settings) {
        requireFiniteNumber(settings.gravity ?? MODEL.gravity, 'Gravity', { minimum: 0 });
        requirePositiveNumber(settings.ropeLength ?? MODEL.ropeLength, 'Rope length');
        requireFiniteNumber(settings.ropeStiffness ?? MODEL.ropeStiffness, 'Rope stiffness', { minimum: 0 });
        requireFiniteNumber(settings.ropeDamping ?? MODEL.ropeDamping, 'Rope stretch damping', { minimum: 0 });
        requireFiniteNumber(settings.viewHeightFactor ?? MODEL.viewHeightFactor, 'View height factor', { minimum: 2 });
        requirePositiveNumber(settings.ballRadius ?? MODEL.ballRadius, 'Ball radius');
        requirePositiveNumber(settings.cupRadius ?? MODEL.cupRadius, 'Cup radius');
        requireFiniteNumber(settings.angularSpeedDegrees ?? MODEL.angularSpeedDegrees, 'Mouse rotation speed', { minimum: 0 });
        requireFiniteNumber(settings.cupRestitution ?? MODEL.cupRestitution, 'Cup restitution', { minimum: 0, maximum: 1 });
        requireFiniteNumber(settings.cupFriction ?? MODEL.cupFriction, 'Cup friction', { minimum: 0 });
        return settings;
    }

    _view() {
        const p = this.parameters;
        const reach = Math.max(
            p.handleLength * p.attachRatio + p.ropeLength * p.maximumRopeStretch + p.ballRadius,
            Math.hypot(p.handleLength, p.cupRadius) + p.ballRadius,
        );
        const span = Math.max(
            p.viewHeightFactor * (p.ropeLength + p.cupDepth + 2 * p.ballRadius),
            2 * reach * p.viewSafetyFactor,
        );
        // Narrow windows fit the same swing envelope horizontally too.
        // No minimum pixel scale: longer ropes must actually zoom out.
        const scalePx = Math.max(1e-6, Math.min(this.w, this.h) / span);
        return {
            scale: scalePx,
            margin: reach * scalePx,
            originX: this.w * 0.5,
            originY: this.h * 0.5,
        };
    }

    _worldToScreen(point) {
        const view = this._view();
        return {
            x: view.originX + point.x * view.scale,
            y: view.originY - point.y * view.scale,
        };
    }

    _mouseToWorld() {
        const mouse = this.input.getMousePos();
        const view = this._view();
        return {
            x: (clamp(mouse.x, 0, this.w) - view.originX) / view.scale,
            y: (view.originY - clamp(mouse.y, 0, this.h)) / view.scale,
        };
    }

    _axes() {
        return {
            up: vector(Math.sin(this.handleAngle), Math.cos(this.handleAngle)),
            right: vector(Math.cos(this.handleAngle), -Math.sin(this.handleAngle)),
        };
    }

    _updateHandleGeometry(dt, initialise = false) {
        const target = this._mouseToWorld();
        if (initialise) {
            this.handlePosition = target;
            this.previousHandlePosition = { ...target };
        } else {
            this.previousHandlePosition = { ...this.handlePosition };
            this.handlePosition = target;
        }

        const rawVelocity = dt > 1e-6
            ? scale(subtract(this.handlePosition, this.previousHandlePosition), 1 / dt)
            : vector();
        const speed = length(rawVelocity);
        this.handleVelocity = speed > this.parameters.maximumHandleSpeed
            ? scale(rawVelocity, this.parameters.maximumHandleSpeed / speed)
            : rawVelocity;

        const axes = this._axes();
        this.previousAttachPoint = { ...this.attachPoint };
        this.cupCenter = add(this.handlePosition, scale(axes.up, this.parameters.handleLength));
        this.attachPoint = add(this.handlePosition, scale(axes.up, this.parameters.handleLength * this.parameters.attachRatio));
        if (initialise) this.previousAttachPoint = { ...this.attachPoint };

        const lever = subtract(this.attachPoint, this.handlePosition);
        const rotationalVelocity = scale(vector(lever.y, -lever.x), this.handleAngularVelocity);
        this.attachVelocity = add(this.handleVelocity, rotationalVelocity);
    }

    _resetRun() {
        this.phase = 'playing';
        this.streak = 0;
        this.scoreSubmitted = false;
        this.accumulator = 0;
        this.handleAngle = 0;
        this.handleAngularVelocity = 0;
        this.attachPoint = vector();
        this._updateHandleGeometry(0, true);
        this._placeBallHanging();
        this._renderHud();
    }

    _placeBallHanging() {
        const axes = this._axes();
        this.ballPosition = add(this.attachPoint, scale(axes.up, -this.parameters.ropeLength));
        this.ballVelocity = { ...this.attachVelocity };
        this.lastRelativeHeight = -this.parameters.ropeLength;
        this.attemptActive = false;
        this.catchHoldTimer = 0;
    }

    _integrateBall(step) {
        const delta = subtract(this.ballPosition, this.attachPoint);
        const distance = length(delta);
        const direction = normalize(delta);
        this.ballVelocity.y -= this.parameters.gravity * step;
        const stretch = distance - this.parameters.ropeLength;
        const radialSpeed = dot(subtract(this.ballVelocity, this.attachVelocity), direction);
        if (stretch > 0 || stretch + radialSpeed * step > 0) {
            const k = this.parameters.ropeStiffness;
            const c = this.parameters.ropeDamping;
            // Backward-Euler radial spring/dashpot impulse (unit ball mass).
            // Damping is proportional to extension RATE, not total speed;
            // implicit integration remains stable even with very large c.
            // A rope can pull but cannot push when it contracts or is slack.
            const impulse = Math.max(0, step * (k * stretch + (c + k * step) * radialSpeed)
                / (1 + c * step + k * step * step));
            this.ballVelocity = add(this.ballVelocity, scale(direction, -impulse));
        }
        this.ballPosition = add(this.ballPosition, scale(this.ballVelocity, step));

        // A safety projection prevents an abrupt mouse jump from injecting an
        // unstable spring extension while preserving the taut-rope dynamics.
        const correctedDelta = subtract(this.ballPosition, this.attachPoint);
        const correctedDistance = length(correctedDelta);
        const maximumDistance = this.parameters.ropeLength * this.parameters.maximumRopeStretch;
        if (correctedDistance > maximumDistance) {
            const correctedDirection = scale(correctedDelta, 1 / correctedDistance);
            this.ballPosition = add(this.attachPoint, scale(correctedDirection, maximumDistance));
            const outwardSpeed = dot(subtract(this.ballVelocity, this.attachVelocity), correctedDirection);
            if (outwardSpeed > 0) this.ballVelocity = add(this.ballVelocity, scale(correctedDirection, -outwardSpeed));
        }
        this._resolveCupCollisions();
    }

    _rigidPointVelocity(point) {
        const lever = subtract(point, this.handlePosition);
        return add(
            this.handleVelocity,
            scale(vector(lever.y, -lever.x), this.handleAngularVelocity),
        );
    }

    _cupCollisionSegments() {
        const axes = this._axes();
        const leftLip = add(this.cupCenter, scale(axes.right, -this.parameters.cupRadius));
        const rightLip = add(this.cupCenter, scale(axes.right, this.parameters.cupRadius));
        const bottomCenter = add(this.cupCenter, scale(axes.up, -this.parameters.cupDepth));
        const bottomHalfWidth = this.parameters.cupRadius * 0.66;
        const bottomLeft = add(bottomCenter, scale(axes.right, -bottomHalfWidth));
        const bottomRight = add(bottomCenter, scale(axes.right, bottomHalfWidth));
        return [
            [leftLip, bottomLeft],
            [bottomLeft, bottomRight],
            [bottomRight, rightLip],
        ];
    }

    _resolveCupCollisions() {
        // Repeating the three-segment projection resolves lip/corner contacts
        // without allowing a fast frame to leave the ball embedded in a wall.
        for (let iteration = 0; iteration < 3; iteration++) {
            let any = false;
            for (const [start, end] of this._cupCollisionSegments()) {
                const segmentVelocity = scale(
                    add(this._rigidPointVelocity(start), this._rigidPointVelocity(end)),
                    0.5,
                );
                const result = resolveCircleSegmentCollision({
                    position: this.ballPosition,
                    velocity: this.ballVelocity,
                    radius: this.parameters.ballRadius,
                    start,
                    end,
                    surfaceVelocity: segmentVelocity,
                    restitution: this.parameters.cupRestitution,
                    friction: this.parameters.cupFriction,
                });
                if (!result.collided) continue;
                any = true;
                this.ballPosition = result.position;
                this.ballVelocity = result.velocity;
            }
            if (!any) break;
        }
    }

    _checkCatch() {
        const axes = this._axes();
        const mouthCenter = add(this.cupCenter, scale(axes.up, this.parameters.cupDepth * 0.12));
        const relative = subtract(this.ballPosition, mouthCenter);
        const lateral = Math.abs(dot(relative, axes.right));
        const axial = dot(relative, axes.up);
        const relativeSpeed = dot(subtract(this.ballVelocity, this.attachVelocity), axes.up);
        return lateral <= Math.max(0.06, this.parameters.cupRadius - this.parameters.ballRadius * 0.42)
            && axial >= -this.parameters.ballRadius * 0.9
            && axial <= this.parameters.ballRadius * 1.05
            && relativeSpeed < 1.2;
    }

    _updateAttemptState() {
        const axes = this._axes();
        const relativeHeight = dot(subtract(this.ballPosition, this.attachPoint), axes.up);
        if (!this.attemptActive && this.lastRelativeHeight < 0 && relativeHeight >= 0) {
            this.attemptActive = true;
        }

        if (this.attemptActive) {
            if (this._checkCatch()) {
                this.streak += 1;
                this.bestStreak = Math.max(this.bestStreak, this.streak);
                this.attemptActive = false;
                this.catchHoldTimer = this.parameters.catchHoldDuration;
                this.audio.playClick?.();
                this._renderHud();
            } else if (this.lastRelativeHeight >= 0 && relativeHeight < 0) {
                this._failAttempt();
            }
        }
        this.lastRelativeHeight = relativeHeight;
    }

    _failAttempt() {
        if (this.phase === 'dead') return;
        this.phase = 'dead';
        if (!this.scoreSubmitted) {
            this.submitScore({ streak: this.streak });
            this.scoreSubmitted = true;
        }
        this._renderHud();
    }

    update(dt) {
        if (this.phase === 'dead') {
            if (this.input.isActionJustDown('restart') || this.input.isMouseJustDown(0)) this._resetRun();
            return;
        }

        const direction = (this.input.isMouseDown(0) ? 1 : 0) - (this.input.isMouseDown(2) ? 1 : 0);
        this.handleAngularVelocity = direction * this.parameters.angularSpeedDegrees * Math.PI / 180;
        this.handleAngle += this.handleAngularVelocity * dt;
        this.handleAngle = Math.atan2(Math.sin(this.handleAngle), Math.cos(this.handleAngle));
        this._updateHandleGeometry(dt);

        if (this.catchHoldTimer > 0) {
            this.catchHoldTimer -= dt;
            this.ballPosition = { ...this.cupCenter };
            this.ballVelocity = { ...this.attachVelocity };
            if (this.catchHoldTimer <= 0) this._placeBallHanging();
            return;
        }

        this.accumulator = Math.min(this.accumulator + dt, this.parameters.fixedTimeStep * this.parameters.maximumSubsteps);
        let substeps = 0;
        while (this.accumulator >= this.parameters.fixedTimeStep && substeps < this.parameters.maximumSubsteps) {
            this._integrateBall(this.parameters.fixedTimeStep);
            this.accumulator -= this.parameters.fixedTimeStep;
            substeps += 1;
        }
        this._updateAttemptState();
    }

    _drawBackground() {
        const ctx = this.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.h);
        sky.addColorStop(0, '#62c9ff');
        sky.addColorStop(0.62, '#bcefff');
        sky.addColorStop(1, '#e9fbff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, this.w, this.h);

        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        for (const [x, y, radius] of [[0.14, 0.18, 24], [0.78, 0.26, 30]]) {
            ctx.beginPath();
            ctx.arc(this.w * x, this.h * y, radius, 0, Math.PI * 2);
            ctx.arc(this.w * x + radius * 0.9, this.h * y + 5, radius * 0.72, 0, Math.PI * 2);
            ctx.arc(this.w * x - radius * 0.9, this.h * y + 7, radius * 0.64, 0, Math.PI * 2);
            ctx.fill();
        }

        const grassY = this.h * 0.82;
        const grass = ctx.createLinearGradient(0, grassY, 0, this.h);
        grass.addColorStop(0, '#66ce43');
        grass.addColorStop(1, '#2b9d38');
        ctx.fillStyle = grass;
        ctx.beginPath();
        ctx.moveTo(0, grassY);
        for (let x = 0; x <= this.w; x += 48) {
            ctx.quadraticCurveTo(x + 24, grassY - 12 - 7 * Math.sin(x * 0.021), x + 48, grassY);
        }
        ctx.lineTo(this.w, this.h);
        ctx.lineTo(0, this.h);
        ctx.closePath();
        ctx.fill();
    }

    _drawCupAndHandle() {
        const ctx = this.ctx;
        const view = this._view();
        const axes = this._axes();
        const base = this._worldToScreen(this.handlePosition);
        const cup = this._worldToScreen(this.cupCenter);
        const leftLip = this._worldToScreen(add(this.cupCenter, scale(axes.right, -this.parameters.cupRadius)));
        const rightLip = this._worldToScreen(add(this.cupCenter, scale(axes.right, this.parameters.cupRadius)));
        const cupBottom = this._worldToScreen(add(this.cupCenter, scale(axes.up, -this.parameters.cupDepth)));

        ctx.lineCap = 'round';
        ctx.strokeStyle = '#66361f';
        ctx.lineWidth = Math.max(14, view.scale * 0.17);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(cupBottom.x, cupBottom.y);
        ctx.stroke();
        ctx.strokeStyle = '#d98a47';
        ctx.lineWidth *= 0.62;
        ctx.stroke();

        ctx.fillStyle = '#c96835';
        ctx.strokeStyle = '#572819';
        ctx.lineWidth = Math.max(4, view.scale * 0.045);
        ctx.beginPath();
        ctx.moveTo(leftLip.x, leftLip.y);
        ctx.lineTo(rightLip.x, rightLip.y);
        ctx.lineTo(cupBottom.x + (rightLip.x - cup.x) * 0.66, cupBottom.y + (rightLip.y - cup.y) * 0.66);
        ctx.lineTo(cupBottom.x + (leftLip.x - cup.x) * 0.66, cupBottom.y + (leftLip.y - cup.y) * 0.66);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = '#32180f';
        ctx.lineWidth = Math.max(6, view.scale * 0.065);
        ctx.beginPath();
        ctx.moveTo(leftLip.x, leftLip.y);
        ctx.lineTo(rightLip.x, rightLip.y);
        ctx.stroke();
        ctx.strokeStyle = '#f0b269';
        ctx.lineWidth *= 0.38;
        ctx.stroke();
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;
        this._drawBackground();

        const attach = this._worldToScreen(this.attachPoint);
        const ball = this._worldToScreen(this.ballPosition);
        const view = this._view();
        ctx.strokeStyle = '#f8e8bd';
        ctx.lineWidth = Math.max(2, view.scale * 0.018);
        ctx.beginPath();
        ctx.moveTo(attach.x, attach.y);
        ctx.lineTo(ball.x, ball.y);
        ctx.stroke();

        this._drawCupAndHandle();

        const ballRadius = Math.max(8, this.parameters.ballRadius * view.scale);
        const gradient = ctx.createRadialGradient(
            ball.x - ballRadius * 0.34,
            ball.y - ballRadius * 0.36,
            ballRadius * 0.08,
            ball.x,
            ball.y,
            ballRadius,
        );
        gradient.addColorStop(0, '#ffe0a2');
        gradient.addColorStop(0.42, '#e69a58');
        gradient.addColorStop(1, '#88472c');
        ctx.fillStyle = gradient;
        ctx.strokeStyle = '#542719';
        ctx.lineWidth = Math.max(3, ballRadius * 0.13);
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = 'position:fixed;top:14px;right:14px;z-index:760;pointer-events:none;font-family:Inter,system-ui,sans-serif;color:#223326;';
        this.hud.innerHTML = `
            <div style="min-width:210px;padding:10px 14px;border:2px solid #39763c;border-radius:14px;background:rgba(240,246,240,.92);box-shadow:0 8px 22px rgba(25,78,43,.2);text-align:right">
                <div style="font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#378a3d">Consecutive catches</div>
                <div id="cab2-streak" style="font-size:34px;font-weight:950;line-height:1.05">0</div>
            </div>
            <div id="cab2-dead" style="display:none;position:fixed;inset:0;place-items:center;pointer-events:auto;background:rgba(52,84,67,.28)">
                <div style="width:min(330px,calc(100vw - 32px));padding:20px;border:2px solid #39763c;border-radius:18px;background:#f0f6f0;box-shadow:0 20px 48px rgba(23,59,33,.28);text-align:center">
                    <div style="font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#d05438">Game over</div>
                    <div id="cab2-result" style="margin-top:8px;font-size:30px;font-weight:950">0 catches</div>
                    <button id="cab2-restart" type="button" style="margin-top:15px;width:100%;padding:10px;border:2px solid #277632;border-radius:11px;background:linear-gradient(#5ed750,#30a837);color:#102712;font-weight:900;cursor:pointer">Play again</button>
                </div>
            </div>`;
        document.body.appendChild(this.hud);
        this.streakElement = this.hud.querySelector('#cab2-streak');
        this.deadElement = this.hud.querySelector('#cab2-dead');
        this.resultElement = this.hud.querySelector('#cab2-result');
        this.restartElement = this.hud.querySelector('#cab2-restart');
        this._onRestart = () => this._resetRun();
        this.restartElement.addEventListener('click', this._onRestart);
    }

    _renderHud() {
        if (!this.hud) return;
        this.streakElement.textContent = String(this.streak);
        this.resultElement.textContent = `${this.streak} ${this.streak === 1 ? 'catch' : 'catches'}`;
        this.deadElement.style.display = this.phase === 'dead' ? 'grid' : 'none';
    }

    onResize() {
        // Physics is expressed in world units; resizing changes only the view.
    }

    destroy() {
        this.restartElement?.removeEventListener('click', this._onRestart);
        this.hud?.remove();
        this.hud = null;
    }

    getRecordSettings(settings = this.settings) {
        const { angularSpeedDegrees: _controlFeel, viewHeightFactor: _view, ...difficulty } = settings || {};
        return difficulty;
    }

    static getSettingsSchema() {
        return [
            { key: 'gravity', label: 'Gravity', type: 'range', min: 2, max: 18, step: 0.1, default: MODEL.gravity },
            { key: 'ropeLength', label: 'Rope length', type: 'range', min: 1, max: 2.8, step: 0.05, default: MODEL.ropeLength },
            { key: 'ropeStiffness', label: 'Rope stiffness', type: 'range', min: 12, max: 180, step: 1, default: MODEL.ropeStiffness },
            { key: 'ropeDamping', label: 'Rope stretch damping (1/s)', type: 'range', min: 0, max: 2000, step: 5, default: MODEL.ropeDamping },
            { key: 'viewHeightFactor', label: 'View height / (rope + cup depth + ball diameter)', type: 'range', min: 2, max: 6, step: 0.1, default: MODEL.viewHeightFactor },
            { key: 'ballRadius', label: 'Ball radius', type: 'range', min: 0.14, max: 0.46, step: 0.01, default: MODEL.ballRadius },
            { key: 'cupRadius', label: 'Cup radius', type: 'range', min: 0.18, max: 0.58, step: 0.01, default: MODEL.cupRadius },
            { key: 'angularSpeedDegrees', label: 'Mouse rotation speed (degrees/s)', type: 'range', min: 30, max: 360, step: 5, default: MODEL.angularSpeedDegrees },
            { key: 'cupRestitution', label: 'Cup collision restitution', type: 'range', min: 0, max: 1, step: 0.01, default: MODEL.cupRestitution },
            { key: 'cupFriction', label: 'Cup collision friction coefficient', type: 'range', min: 0, step: 0.01, default: MODEL.cupFriction },
        ];
    }

    static getControlsSchema() {
        return [{
            action: 'restart',
            label: 'Restart run',
            defaultBindings: [{ type: 'keyboard', code: 'Enter' }],
        }];
    }
}
