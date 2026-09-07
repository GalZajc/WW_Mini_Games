import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

/* All physical and numerical-model parameters for the 2D game are here. */
const PHYSICS = Object.freeze({
    handLength: 1.35,             // l_r [m]
    frictionCoefficient: 1.76,   // k [-]
    rodLength: 3.2,               // l_p [m]
    gravity: 9.81,                // g [m/s^2]
    rodMass: 1.0,                 // [kg]
    rodRadius: 0.065,             // [m]
    handThickness: 0.14,          // [m]
    initialHandHeight: 1.25,      // [m]
    angularDamping: 0.045,        // [1/s]
    slidingFrictionFactor: 0.88,  // kinetic/static friction ratio
    handResponse: 10.5,           // [1/s]
    maximumHandAcceleration: 75,  // [m/s^2]
    fallAngleDegrees: 74,
    restickSpeed: 0.11,           // [m/s]
    fixedTimeStep: 1 / 120,       // [s]
});

const WORLD = Object.freeze({
    targetHalfWidth: 5.4,
    targetPoints: Object.freeze([10, 8, 6, 4, 2, 1]),
    initialOffsetFraction: 0.18,
    initialTiltDegrees: 10,
    minimumViewHeight: 6.6,
    maximumSubsteps: 8,
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
}

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export default class RodBalance2DGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});
        this.parameters = Object.freeze({
            ...PHYSICS,
            handLength: Number(this.settings.handLength ?? PHYSICS.handLength),
            frictionCoefficient: Number(this.settings.frictionCoefficient ?? PHYSICS.frictionCoefficient),
            rodLength: Number(this.settings.rodLength ?? PHYSICS.rodLength),
            gravity: Number(this.settings.gravity ?? PHYSICS.gravity),
        });

        this.viewHeight = Math.max(WORLD.minimumViewHeight, this.parameters.rodLength + 3.0);
        this.phase = 'ready';
        this.contactState = 'sticking';
        this.score = 0;
        this.bestScore = 0;
        this.accumulator = 0;
        this._ensureHud();
        this._attachStartInput();
        this._loadBestScore();
        this._resetRun();
    }

    _attachStartInput() {
        this._startMouseHandler = event => {
            if (event.button !== 0 || this.phase !== 'ready') return;
            event.preventDefault();
            this._beginRun(true);
        };
        this.canvas.addEventListener('mousedown', this._startMouseHandler);
    }

    _loadBestScore() {
        const request = (this._bestScoreRequest || 0) + 1;
        this._bestScoreRequest = request;
        this.app?.records?.getBest('rod-balance-2d', { ...this.settings }, 'score')
            .then(record => {
                if (request !== this._bestScoreRequest) return;
                const value = Number(record?.results?.score);
                if (Number.isFinite(value)) this.bestScore = Math.max(this.bestScore, value);
                this._renderHud();
            })
            .catch(error => console.warn('Could not load Rod Balance 2D record:', error));
    }

    _resetRun() {
        this.runSeed = makeSeed();
        const random = seededRandom(this.runSeed);
        const maximumOffset = this.parameters.handLength * WORLD.initialOffsetFraction;
        const tiltMagnitude = (1.5 + random() * (WORLD.initialTiltDegrees - 1.5)) * Math.PI / 180;

        this.handPosition = { x: 0, y: this.parameters.initialHandHeight };
        this.handTarget = { ...this.handPosition };
        this.handVelocity = { x: 0, y: 0 };
        this.handAcceleration = { x: 0, y: 0 };
        this.contactOffsetX = (random() * 2 - 1) * maximumOffset;
        this.bottomPosition = {
            x: this.handPosition.x + this.contactOffsetX,
            y: this.handPosition.y,
        };
        this.bottomVelocity = { x: 0, y: 0 };
        this.angle = (random() < 0.5 ? -1 : 1) * tiltMagnitude;
        this.angleVelocity = 0;
        this.freeCenter = { x: 0, y: 0 };
        this.freeVelocity = { x: 0, y: 0 };

        this.phase = 'ready';
        this.contactState = 'sticking';
        this.score = 0;
        this.bestScore = Math.max(0, this.bestScore || 0);
        this.currentRate = 0;
        this.bottomPoints = 0;
        this.topPoints = 0;
        this._survivalSeconds = 0;
        this.failureReason = '';
        this.scoreSubmitted = false;
        this.lastFrictionRatio = 0;
        this.accumulator = 0;
        this._renderHud();
    }

    _beginRun(lockPointer = true) {
        if (this.phase !== 'ready') return;
        this.handTarget = { ...this.handPosition };
        this._placeVirtualPointerAtHand();
        this.accumulator = 0;
        this.phase = 'playing';
        this._renderHud();
        if (lockPointer) this.app?._lockPointer?.();
    }

    _worldWidth() {
        return this.viewHeight * this.w / Math.max(1, this.h);
    }

    _placeVirtualPointerAtHand() {
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const viewWidth = this._worldWidth();
        this.input.setMousePos(
            rect.left + (this.handPosition.x / viewWidth + 0.5) * rect.width,
            rect.top + (1 - this.handPosition.y / this.viewHeight) * rect.height,
        );
    }

    _updateMouseTarget() {
        if (this.phase !== 'playing') return;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const mouse = this.input.getMousePos();
        const nx = (mouse.x - rect.left) / rect.width;
        const ny = (mouse.y - rect.top) / rect.height;
        this.handTarget.x = (nx - 0.5) * this._worldWidth();
        this.handTarget.y = (1 - ny) * this.viewHeight;
    }

    _stepHand(dt) {
        const response = this.parameters.handResponse;
        let ax = (this.handTarget.x - this.handPosition.x) * response * response
            - 2 * response * this.handVelocity.x;
        let ay = (this.handTarget.y - this.handPosition.y) * response * response
            - 2 * response * this.handVelocity.y;
        const magnitude = Math.hypot(ax, ay);
        if (magnitude > this.parameters.maximumHandAcceleration) {
            const scale = this.parameters.maximumHandAcceleration / magnitude;
            ax *= scale;
            ay *= scale;
        }
        this.handAcceleration.x = ax;
        this.handAcceleration.y = ay;
        this.handVelocity.x += ax * dt;
        this.handVelocity.y += ay * dt;
        this.handPosition.x += this.handVelocity.x * dt;
        this.handPosition.y += this.handVelocity.y * dt;
    }

    _angularAcceleration(baseAccelerationX, baseAccelerationY) {
        const s = Math.sin(this.angle);
        const c = Math.cos(this.angle);
        return (3 / (2 * this.parameters.rodLength))
            * ((this.parameters.gravity + baseAccelerationY) * s - baseAccelerationX * c)
            - this.parameters.angularDamping * this.angleVelocity;
    }

    _contactLoad(baseAccelerationX, baseAccelerationY, angularAcceleration) {
        const s = Math.sin(this.angle);
        const c = Math.cos(this.angle);
        const halfLength = this.parameters.rodLength * 0.5;
        const centerAccelerationX = baseAccelerationX
            + halfLength * (c * angularAcceleration - s * this.angleVelocity ** 2);
        const centerAccelerationY = baseAccelerationY
            + halfLength * (-s * angularAcceleration - c * this.angleVelocity ** 2);
        return {
            tangent: Math.abs(centerAccelerationX) * this.parameters.rodMass,
            normal: (centerAccelerationY + this.parameters.gravity) * this.parameters.rodMass,
        };
    }

    _slidingAccelerationX() {
        const effectiveDownwardAcceleration = Math.max(
            0,
            this.parameters.gravity + this.handAcceleration.y,
        );
        const frictionless = -3 * effectiveDownwardAcceleration * Math.sin(this.angle);
        const relativeVelocity = this.bottomVelocity.x - this.handVelocity.x;
        const impendingSlip = Math.abs(relativeVelocity) > 0.005
            ? relativeVelocity
            : frictionless - this.handAcceleration.x;
        if (Math.abs(impendingSlip) < 1e-9 || this.parameters.frictionCoefficient <= 0) {
            return frictionless;
        }
        const frictionOnCenter = -Math.sign(impendingSlip)
            * this.parameters.frictionCoefficient
            * effectiveDownwardAcceleration
            * this.parameters.slidingFrictionFactor;
        return frictionless + 4 * frictionOnCenter;
    }

    _contactWasPulledAway(load) {
        if (load.normal > 0.02) return false;
        const reason = this.handAcceleration.y < -this.parameters.gravity * 0.45
            ? 'You pulled the hand out from under the rod.'
            : 'The rod lost contact with the hand.';
        this._fail(reason);
        return true;
    }

    _stepPlaying(dt) {
        this._stepHand(dt);

        let baseAccelerationX = this.handAcceleration.x;
        const baseAccelerationY = this.handAcceleration.y;
        let angularAcceleration = this._angularAcceleration(baseAccelerationX, baseAccelerationY);
        let load = this._contactLoad(baseAccelerationX, baseAccelerationY, angularAcceleration);

        if (this._contactWasPulledAway(load)) return;

        if (this.contactState === 'sticking') {
            const frictionLimit = this.parameters.frictionCoefficient * Math.max(0, load.normal);
            this.lastFrictionRatio = frictionLimit > 0 ? load.tangent / frictionLimit : Infinity;
            if (load.tangent > frictionLimit + 1e-6) {
                this.contactState = 'sliding';
                baseAccelerationX = this._slidingAccelerationX();
                angularAcceleration = this._angularAcceleration(baseAccelerationX, baseAccelerationY);
                load = this._contactLoad(baseAccelerationX, baseAccelerationY, angularAcceleration);
                if (this._contactWasPulledAway(load)) return;
            }
        } else {
            baseAccelerationX = this._slidingAccelerationX();
            angularAcceleration = this._angularAcceleration(baseAccelerationX, baseAccelerationY);
            load = this._contactLoad(baseAccelerationX, baseAccelerationY, angularAcceleration);
            if (this._contactWasPulledAway(load)) return;

            const candidateAngularAcceleration = this._angularAcceleration(
                this.handAcceleration.x,
                this.handAcceleration.y,
            );
            const candidateLoad = this._contactLoad(
                this.handAcceleration.x,
                this.handAcceleration.y,
                candidateAngularAcceleration,
            );
            const candidateLimit = this.parameters.frictionCoefficient * Math.max(0, candidateLoad.normal);
            this.lastFrictionRatio = candidateLimit > 0
                ? candidateLoad.tangent / candidateLimit
                : Infinity;
        }

        if (this.contactState === 'sticking') {
            this.bottomPosition.x = this.handPosition.x + this.contactOffsetX;
            this.bottomVelocity.x = this.handVelocity.x;
        } else {
            this.bottomVelocity.x += baseAccelerationX * dt;
            this.bottomPosition.x += this.bottomVelocity.x * dt;
            const relativeOffset = this.bottomPosition.x - this.handPosition.x;
            const relativeVelocity = this.bottomVelocity.x - this.handVelocity.x;
            const usableHalfLength = this.parameters.handLength * 0.5 - this.parameters.rodRadius;
            if (Math.abs(relativeOffset) > usableHalfLength) {
                this._fail('The rod slid off the hand.');
                return;
            }
            if (Math.abs(relativeVelocity) <= this.parameters.restickSpeed && this.lastFrictionRatio < 0.82) {
                this.contactState = 'sticking';
                this.contactOffsetX = relativeOffset;
                this.bottomVelocity.x = this.handVelocity.x;
            }
        }

        this.bottomPosition.y = this.handPosition.y;
        this.bottomVelocity.y = this.handVelocity.y;
        this.angleVelocity += angularAcceleration * dt;
        this.angle += this.angleVelocity * dt;

        if (Math.abs(this.angle) >= this.parameters.fallAngleDegrees * Math.PI / 180) {
            this._fail('The rod fell from the hand.');
            return;
        }

        this._integrateScore(dt);
        if (this._rodEntirelyOffScreen()) this._fail('The rod fell completely out of view.');
    }

    _topPosition() {
        return {
            x: this.bottomPosition.x + Math.sin(this.angle) * this.parameters.rodLength,
            y: this.bottomPosition.y + Math.cos(this.angle) * this.parameters.rodLength,
        };
    }

    _integrateScore(dt) {
        const top = this._topPosition();
        this.bottomPoints = this._pointsAtX(this.bottomPosition.x);
        this.topPoints = this._pointsAtX(top.x);
        this.currentRate = Math.min(this.bottomPoints, this.topPoints);
        this.score += this.currentRate * dt;
        this.bestScore = Math.max(this.bestScore, this.score);
    }

    _pointsAtX(x) {
        const width = WORLD.targetHalfWidth / WORLD.targetPoints.length;
        const index = Math.floor(Math.abs(x) / width);
        return WORLD.targetPoints[index] ?? 0;
    }

    _fail(reason) {
        if (this.phase !== 'playing') return;
        this.phase = 'dead';
        this.failureReason = reason;
        const halfLength = this.parameters.rodLength * 0.5;
        this.freeCenter = {
            x: this.bottomPosition.x + Math.sin(this.angle) * halfLength,
            y: this.bottomPosition.y + Math.cos(this.angle) * halfLength,
        };
        this.freeVelocity = {
            x: this.bottomVelocity.x + Math.cos(this.angle) * halfLength * this.angleVelocity,
            y: this.bottomVelocity.y - Math.sin(this.angle) * halfLength * this.angleVelocity,
        };

        if (!this.scoreSubmitted) {
            this.submitScore({
                score: Number(this.score.toFixed(3)),
                survivedSeconds: Number(this._survivalSeconds.toFixed(3)),
                seed: this.runSeed,
                reason,
            });
            this.scoreSubmitted = true;
        }
        this._renderHud();
    }

    _stepDead(dt) {
        this.freeVelocity.y -= this.parameters.gravity * dt;
        this.freeCenter.x += this.freeVelocity.x * dt;
        this.freeCenter.y += this.freeVelocity.y * dt;
        this.angle += this.angleVelocity * dt;
        const halfLength = this.parameters.rodLength * 0.5;
        this.bottomPosition.x = this.freeCenter.x - Math.sin(this.angle) * halfLength;
        this.bottomPosition.y = this.freeCenter.y - Math.cos(this.angle) * halfLength;
    }

    _rodEntirelyOffScreen() {
        const top = this._topPosition();
        const halfWidth = this._worldWidth() * 0.5;
        const margin = 0.25;
        return (this.bottomPosition.x < -halfWidth - margin && top.x < -halfWidth - margin)
            || (this.bottomPosition.x > halfWidth + margin && top.x > halfWidth + margin)
            || (this.bottomPosition.y < -margin && top.y < -margin)
            || (this.bottomPosition.y > this.viewHeight + margin && top.y > this.viewHeight + margin);
    }

    update(dt) {
        if (this.phase === 'dead' && this.input.isActionJustDown('restart')) {
            this._resetRun();
            return;
        }
        if (this.phase === 'ready') {
            this._renderHud();
            return;
        }

        this._updateMouseTarget();
        this.accumulator = Math.min(
            this.accumulator + dt,
            this.parameters.fixedTimeStep * WORLD.maximumSubsteps,
        );
        let substeps = 0;
        while (this.accumulator >= this.parameters.fixedTimeStep && substeps < WORLD.maximumSubsteps) {
            if (this.phase === 'playing') {
                this._survivalSeconds += this.parameters.fixedTimeStep;
                this._stepPlaying(this.parameters.fixedTimeStep);
            } else {
                this._stepDead(this.parameters.fixedTimeStep);
            }
            this.accumulator -= this.parameters.fixedTimeStep;
            substeps++;
        }
        this._renderHud();
    }

    _screenTransform() {
        const scale = this.h / this.viewHeight;
        return {
            scale,
            x: worldX => this.w * 0.5 + worldX * scale,
            y: worldY => this.h - worldY * scale,
        };
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;
        const transform = this._screenTransform();
        const scale = transform.scale;

        const background = ctx.createLinearGradient(0, 0, 0, this.h);
        background.addColorStop(0, '#65caf5');
        background.addColorStop(0.76, '#bdefff');
        background.addColorStop(1, '#e8fbff');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, this.w, this.h);

        ctx.fillStyle = '#4fbe42';
        ctx.fillRect(0, this.h * 0.91, this.w, this.h * 0.09);

        this._drawTarget(ctx, transform);

        const handX = transform.x(this.handPosition.x);
        const handY = transform.y(this.handPosition.y);
        const handWidth = this.parameters.handLength * scale;
        const handThickness = Math.max(8, this.parameters.handThickness * scale);
        ctx.fillStyle = '#e2a273';
        ctx.strokeStyle = '#6c3c29';
        ctx.lineWidth = Math.max(1.5, scale * 0.018);
        ctx.beginPath();
        ctx.roundRect(handX - handWidth * 0.5, handY, handWidth, handThickness, 4);
        ctx.fill();
        ctx.stroke();

        const top = this._topPosition();
        const bottomX = transform.x(this.bottomPosition.x);
        const bottomY = transform.y(this.bottomPosition.y);
        const topX = transform.x(top.x);
        const topY = transform.y(top.y);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#eee7d4';
        ctx.lineWidth = Math.max(4, this.parameters.rodRadius * 2 * scale);
        ctx.shadowBlur = 9;
        ctx.shadowColor = 'rgba(0,0,0,.35)';
        ctx.beginPath();
        ctx.moveTo(bottomX, bottomY);
        ctx.lineTo(topX, topY);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffc857';
        ctx.beginPath();
        ctx.arc(bottomX, bottomY, Math.max(5, this.parameters.rodRadius * 1.6 * scale), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#64d8ff';
        ctx.beginPath();
        ctx.arc(topX, topY, Math.max(5, this.parameters.rodRadius * 1.6 * scale), 0, Math.PI * 2);
        ctx.fill();
    }

    _drawTarget(ctx, transform) {
        const points = WORLD.targetPoints;
        const binWidth = WORLD.targetHalfWidth / points.length;
        const bandHeight = Math.max(24, transform.scale * 0.26);
        const floorY = transform.y(0);
        const colors = ['#f5d15f', '#315fb5', '#e8ecef', '#b94252', '#e8ecef', '#294f91'];

        for (let index = points.length - 1; index >= 0; index--) {
            const halfWidth = binWidth * (index + 1) * transform.scale;
            ctx.fillStyle = colors[index];
            ctx.fillRect(this.w * 0.5 - halfWidth, floorY - bandHeight, halfWidth * 2, bandHeight);
        }
        ctx.strokeStyle = '#101724';
        ctx.lineWidth = 1.5;
        for (let index = 1; index <= points.length; index++) {
            const offset = binWidth * index * transform.scale;
            for (const direction of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(this.w * 0.5 + direction * offset, floorY - bandHeight);
                ctx.lineTo(this.w * 0.5 + direction * offset, floorY);
                ctx.stroke();
            }
        }
        ctx.fillStyle = '#101724';
        ctx.font = `900 ${Math.max(10, bandHeight * 0.46)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let index = 0; index < points.length; index++) {
            const center = index === 0 ? 0 : binWidth * (index + 0.5) * transform.scale;
            ctx.fillText(String(points[index]), this.w * 0.5 + center, floorY - bandHeight * 0.5);
        }
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = `
            position:fixed; inset:0; z-index:760; pointer-events:none;
            font-family:Inter,system-ui,sans-serif; color:#26362c;
        `;
        this.hud.innerHTML = `
            <div style="position:absolute;top:14px;right:14px;min-width:292px;padding:12px 15px;border:2px solid #5d6b62;border-radius:16px;background:rgba(239,243,240,.93);box-shadow:0 12px 30px rgba(38,82,50,.20);text-align:right;">
                <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#2e8a3a;">Integrated score</div>
                <div data-score style="font-size:38px;font-weight:900;line-height:1.08;">0.00</div>
                <div data-rate style="margin-top:4px;font-size:13px;color:#536258;">0 pts/s</div>
                <div data-contact style="margin-top:5px;font-size:12px;color:#257c35;">Waiting</div>
                <div data-best style="margin-top:3px;font-size:12px;color:#66756b;">Record: 0.00</div>
            </div>
            <div data-ready style="display:grid;position:absolute;inset:0;place-items:center;pointer-events:none;">
                <div style="padding:14px 20px;border-radius:16px;background:rgba(239,243,240,.94);border:2px solid #5d6b62;text-align:center;box-shadow:0 18px 50px rgba(38,82,50,.22);">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.15em;color:#2e8a3a;">Ready · 2D</div>
                    <div style="margin-top:5px;font-size:20px;font-weight:850;">Left click to start</div>
                </div>
            </div>
            <div data-dead style="display:none;position:absolute;inset:0;place-items:center;pointer-events:auto;background:rgba(59,92,67,.30);">
                <div style="width:min(390px,calc(100vw - 32px));padding:21px;border-radius:20px;background:#eff3f0;border:2px solid #5d6b62;text-align:center;box-shadow:0 24px 70px rgba(38,82,50,.28);">
                    <div style="font-size:12px;text-transform:uppercase;letter-spacing:.14em;color:#c14d39;">Game over</div>
                    <div data-final style="margin-top:8px;font-size:35px;font-weight:900;">0.00 points</div>
                    <div data-reason style="margin-top:7px;color:#59685e;font-size:14px;"></div>
                    <button data-restart type="button" style="margin-top:15px;width:100%;padding:10px 12px;border:2px solid #277632;border-radius:12px;background:#50c747;color:#153318;font-size:13px;font-weight:800;cursor:pointer;">Restart</button>
                </div>
            </div>
        `;
        document.body.appendChild(this.hud);
        this.scoreElement = this.hud.querySelector('[data-score]');
        this.rateElement = this.hud.querySelector('[data-rate]');
        this.contactElement = this.hud.querySelector('[data-contact]');
        this.bestElement = this.hud.querySelector('[data-best]');
        this.readyElement = this.hud.querySelector('[data-ready]');
        this.deadElement = this.hud.querySelector('[data-dead]');
        this.finalElement = this.hud.querySelector('[data-final]');
        this.reasonElement = this.hud.querySelector('[data-reason]');
        this.restartElement = this.hud.querySelector('[data-restart]');
        this._restartHandler = () => this._resetRun();
        this.restartElement.addEventListener('click', this._restartHandler);
    }

    _renderHud() {
        if (!this.hud) return;
        this.scoreElement.textContent = this.score.toFixed(2);
        this.rateElement.textContent = `${this.currentRate} pts/s · bottom ${this.bottomPoints}, top ${this.topPoints}`;
        if (this.phase === 'ready') {
            this.contactElement.textContent = 'Waiting';
            this.contactElement.style.color = '#66756b';
        } else {
            const sliding = this.contactState === 'sliding';
            this.contactElement.textContent = sliding ? 'Sliding — move under the rod' : 'Sticking';
            this.contactElement.style.color = sliding ? '#b45c18' : '#257c35';
        }
        this.bestElement.textContent = `Record for these settings: ${this.bestScore.toFixed(2)}`;
        this.readyElement.style.display = this.phase === 'ready' ? 'grid' : 'none';
        this.deadElement.style.display = this.phase === 'dead' ? 'grid' : 'none';
        this.finalElement.textContent = `${this.score.toFixed(2)} points`;
        this.reasonElement.textContent = this.failureReason;
    }

    onResize() {
        if (this.phase === 'playing') this._placeVirtualPointerAtHand();
    }

    onPause() {}

    onResume() {
        if (this.phase === 'playing') this._placeVirtualPointerAtHand();
    }

    wantsPointerLockNow() {
        return this.phase === 'playing';
    }

    destroy() {
        this._bestScoreRequest = (this._bestScoreRequest || 0) + 1;
        if (this._startMouseHandler) this.canvas.removeEventListener('mousedown', this._startMouseHandler);
        if (this.restartElement && this._restartHandler) {
            this.restartElement.removeEventListener('click', this._restartHandler);
        }
        this.hud?.remove();
        this.hud = null;
    }

    preparePauseSettings(settings) {
        requirePositiveNumber(settings.handLength ?? PHYSICS.handLength, 'Hand length');
        requireFiniteNumber(settings.frictionCoefficient ?? PHYSICS.frictionCoefficient, 'Friction coefficient', { minimum: 0 });
        requirePositiveNumber(settings.rodLength ?? PHYSICS.rodLength, 'Rod length');
        requireFiniteNumber(settings.gravity ?? PHYSICS.gravity, 'Gravity', { minimum: 0 });
        return settings;
    }

    static getSettingsSchema() {
        return [
            {
                key: 'handLength', label: 'Hand length l_r [m]', group: 'Physics',
                type: 'range', min: 0.7, max: 2.5, step: 0.05, default: PHYSICS.handLength,
            },
            {
                key: 'frictionCoefficient', label: 'Friction coefficient k', group: 'Physics',
                type: 'range', min: 0, max: 2, step: 0.02, default: PHYSICS.frictionCoefficient,
            },
            {
                key: 'rodLength', label: 'Rod length l_p [m]', group: 'Physics',
                type: 'range', min: 1.5, max: 5, step: 0.1, default: PHYSICS.rodLength,
            },
            {
                key: 'gravity', label: 'Gravity g [m/s²]', group: 'Physics',
                type: 'range', min: 1, max: 20, step: 0.1, default: PHYSICS.gravity,
            },
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
