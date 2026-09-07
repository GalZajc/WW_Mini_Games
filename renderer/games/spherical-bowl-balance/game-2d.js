import { BaseGame } from '../../core/BaseGame.js';
import {
    BOWL_NUMERICS,
    add3,
    clamp,
    length3,
    makeSeed,
    normalize3,
    scale3,
    shouldReleaseAtRim,
    stepRollingSurfaceBody,
    stepSlidingSurfaceBody,
    targetForSeed,
    vec3,
} from './physics.js';

const LOGICAL_HEIGHT = 720;

export default class SphericalBowl2DModeGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.parameters = Object.freeze({ ...this.settings });
        this.variant = this.parameters.variant;
        this.bodyType = this.parameters.bodyType;
        this.bowlTheta = this.parameters.bowlTheta;
        this.bodyClearance = this.bodyType === 'marble'
            ? this.parameters.marbleRadius
            : this.parameters.bowlRadius * BOWL_NUMERICS.pointDiscThicknessFraction / 2;
        this.bestValue = this.variant === 'target' ? Infinity : 0;
        this._loadBest();
        this._resetRun();
    }

    async _loadBest() {
        try {
            const key = this.variant === 'target' ? 'missDistance' : 'distance';
            const direction = this.variant === 'target' ? 'min' : 'max';
            const record = await this.app?.records?.getBest?.('spherical-bowl-balance', this.settings, key, direction);
            const value = Number(record?.results?.[key]);
            if (Number.isFinite(value)) this.bestValue = value;
        } catch (error) {
            console.warn('Could not load 2D bowl record:', error);
        }
    }

    _resetRun(seed = makeSeed()) {
        const p = this.parameters;
        this.seed = seed >>> 0;
        const pathRadius = this.bodyType === 'marble' ? p.bowlRadius - p.marbleRadius : p.bowlRadius;
        this.surfaceState = {
            position: vec3(0, -pathRadius, 0),
            velocity: vec3(),
            omega: vec3(),
            contactMode: this.bodyType === 'marble' ? 'rolling' : 'sticking',
            slipSpeed: 0,
        };
        this.bowl = { position: { x: 0 }, velocity: { x: 0 }, acceleration: { x: 0 } };
        this.flightState = null;
        this.target = targetForSeed(this.seed, p.movementCircleRadius, p.bowlRadius, 2);
        this.phase = 'ready';
        this.result = null;
        this.accumulator = 0;
        this.scoreSubmitted = false;
        this.marbleAngle = 0;
        const view = this._view();
        const rect = this.canvas?.getBoundingClientRect?.() || { width: window.innerWidth, height: window.innerHeight };
        this.input.setMousePos?.(
            (rect.left || 0) + view.originX * Math.max(1e-9, view.scale),
            (rect.top || 0) + (rect.height || window.innerHeight) / 2,
        );
    }

    _view() {
        const scale = this.h / LOGICAL_HEIGHT;
        const width = this.w / Math.max(1e-9, scale);
        const p = this.parameters;
        const furthest = this.variant === 'target'
            ? Math.max(Math.abs(this.target.x), p.movementCircleRadius + p.bowlRadius)
            : p.movementCircleRadius + p.bowlRadius * 2.8;
        const pixelsPerMetre = Math.min(105, (width * 0.43) / Math.max(1, furthest));
        return { scale, width, pixelsPerMetre, originX: width / 2, groundY: 610 };
    }

    _mouseTarget() {
        const view = this._view();
        const rect = this.canvas?.getBoundingClientRect?.() || { left: 0, width: window.innerWidth };
        const mouse = this.input.getMousePos?.() || { x: (rect.left || 0) + (rect.width || window.innerWidth) / 2 };
        const screenX = (mouse.x - (rect.left || 0)) / Math.max(1e-9, view.scale);
        return (screenX - view.originX) / Math.max(1e-9, view.pixelsPerMetre);
    }

    _sampleBowlMotion(dt, initialise = false) {
        const target = this._mouseTarget();
        if (initialise || dt <= 1e-6) {
            this.bowl.position.x = target;
            this.bowl.velocity.x = 0;
            this.bowl.acceleration.x = 0;
            return;
        }
        const velocity = (target - this.bowl.position.x) / dt;
        const rawAcceleration = (velocity - this.bowl.velocity.x) / dt;
        this.bowl.acceleration.x = clamp(
            rawAcceleration,
            -this.parameters.maximumBowlAcceleration,
            this.parameters.maximumBowlAcceleration,
        );
        this.bowl.velocity.x = velocity;
        this.bowl.position.x = target;
    }

    _startRun() {
        this._sampleBowlMotion(0, true);
        this.phase = 'surface';
        this.audio.playClick?.();
    }

    _stepSurface(step) {
        const acceleration = { x: this.bowl.acceleration.x, z: 0 };
        if (this.bodyType === 'marble') {
            stepRollingSurfaceBody(this.surfaceState, acceleration, this.parameters, step);
            this.marbleAngle -= this.surfaceState.omega.z * step;
        } else {
            stepSlidingSurfaceBody(this.surfaceState, acceleration, this.parameters, step);
        }
        if (shouldReleaseAtRim(this.surfaceState, this.bowlTheta)) this._releaseBody();
    }

    _releaseBody() {
        const p = this.parameters;
        this.flightState = {
            position: {
                x: this.bowl.position.x + this.surfaceState.position.x,
                y: this._bowlBaseHeight() + p.bowlRadius + this.surfaceState.position.y,
            },
            velocity: {
                x: this.bowl.velocity.x + this.surfaceState.velocity.x,
                y: this.surfaceState.velocity.y,
            },
            angularVelocity: this.surfaceState.omega.z,
        };
        this.phase = 'flight';
        this.audio.playClick?.();
    }

    _stepFlight(step) {
        this.flightState.velocity.y -= this.parameters.gravity * step;
        this.flightState.position.x += this.flightState.velocity.x * step;
        this.flightState.position.y += this.flightState.velocity.y * step;
        this.marbleAngle -= this.flightState.angularVelocity * step;
        const landingHeight = this.bodyType === 'marble' ? this.parameters.marbleRadius : this.bodyClearance;
        if (this.flightState.position.y <= landingHeight && this.flightState.velocity.y <= 0) {
            this.flightState.position.y = landingHeight;
            this._finishRun();
        }
    }

    _finishRun() {
        const landingX = this.flightState.position.x;
        const distance = Math.abs(landingX);
        const missDistance = Math.abs(landingX - this.target.x);
        this.phase = 'gameover';
        if (this.variant === 'target') {
            this.result = { missDistance };
            this.bestValue = Math.min(this.bestValue, missDistance);
            this._submit({ missDistance: Number(missDistance.toFixed(3)), landingDistance: Number(distance.toFixed(3)), seed: this.seed });
        } else {
            this.result = { distance };
            this.bestValue = Math.max(this.bestValue, distance);
            this._submit({ distance: Number(distance.toFixed(3)), seed: this.seed });
        }
        this.audio.playPlasticImpact?.(0.38);
    }

    _submit(results) {
        if (this.scoreSubmitted) return;
        this.submitScore(results);
        this.scoreSubmitted = true;
    }

    update(dt) {
        const delta = Math.min(BOWL_NUMERICS.maximumFrameTime, Number(dt) || 0);
        const start = Boolean(this.input.isActionJustDown?.('start') || this.input.isMouseJustDown?.(0));
        if (this.phase === 'ready') {
            if (start) this._startRun();
            return;
        }
        if (this.phase === 'gameover') {
            if (start) {
                this._resetRun();
                this._startRun();
            }
            return;
        }
        this._sampleBowlMotion(delta);
        this.accumulator = Math.min(
            this.accumulator + delta,
            BOWL_NUMERICS.fixedTimeStep * BOWL_NUMERICS.maximumSubsteps,
        );
        while (this.accumulator >= BOWL_NUMERICS.fixedTimeStep) {
            if (this.phase === 'flight') this._stepFlight(BOWL_NUMERICS.fixedTimeStep);
            else this._stepSurface(BOWL_NUMERICS.fixedTimeStep);
            this.accumulator -= BOWL_NUMERICS.fixedTimeStep;
            if (this.phase === 'gameover') break;
        }
    }

    _bowlBaseHeight() {
        return Math.max(
            this.parameters.bowlRadius * 0.025,
            this.bodyType === 'marble' ? this.parameters.marbleRadius * 1.04 : this.parameters.bowlRadius * 0.015,
        );
    }

    _worldToScreen(point, view) {
        return {
            x: view.originX + point.x * view.pixelsPerMetre,
            y: view.groundY - point.y * view.pixelsPerMetre,
        };
    }

    _drawBowl(ctx, view) {
        const p = this.parameters;
        const centre = { x: this.bowl.position.x, y: this._bowlBaseHeight() + p.bowlRadius };
        const samples = 100;
        ctx.strokeStyle = '#1f6685';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let index = 0; index <= samples; index++) {
            const beta = -this.bowlTheta + 2 * this.bowlTheta * index / samples;
            const screen = this._worldToScreen({
                x: centre.x + p.bowlRadius * Math.sin(beta),
                y: centre.y - p.bowlRadius * Math.cos(beta),
            }, view);
            if (index === 0) ctx.moveTo(screen.x, screen.y);
            else ctx.lineTo(screen.x, screen.y);
        }
        ctx.stroke();
        ctx.strokeStyle = '#8edcf0';
        ctx.lineWidth = 6;
        ctx.stroke();
    }

    _drawBody(ctx, view) {
        const p = this.parameters;
        let world;
        let normal = null;
        if (this.phase === 'flight' || (this.phase === 'gameover' && this.flightState)) {
            world = this.flightState.position;
        } else {
            normal = normalize3(this.surfaceState.position);
            const inward = this.bodyType === 'point' ? scale3(normal, -this.bodyClearance) : vec3();
            const local = add3(this.surfaceState.position, inward);
            world = {
                x: this.bowl.position.x + local.x,
                y: this._bowlBaseHeight() + p.bowlRadius + local.y,
            };
        }
        const screen = this._worldToScreen(world, view);
        if (this.bodyType === 'marble') {
            const radius = p.marbleRadius * view.pixelsPerMetre;
            ctx.save();
            ctx.translate(screen.x, screen.y);
            ctx.rotate(this.marbleAngle);

            // Red base fill
            ctx.fillStyle = '#d82626';
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();

            // Alternating gold quadrants (0 to 90 deg, 180 to 270 deg)
            ctx.fillStyle = '#ffd036';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, 0, Math.PI / 2);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, Math.PI, Math.PI * 1.5);
            ctx.closePath();
            ctx.fill();

            // Inner sphere 3D gradient shading
            const highlightGrad = ctx.createRadialGradient(-radius * 0.28, -radius * 0.35, 1, 0, 0, radius);
            highlightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
            highlightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
            highlightGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.15)');
            highlightGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
            ctx.fillStyle = highlightGrad;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();

            // Dividing seam lines
            ctx.strokeStyle = '#181e22';
            ctx.lineWidth = Math.max(1.8, radius * 0.08);
            ctx.beginPath();
            ctx.moveTo(-radius, 0);
            ctx.lineTo(radius, 0);
            ctx.moveTo(0, -radius);
            ctx.lineTo(0, radius);
            ctx.stroke();

            // Outer dark rim outline
            ctx.strokeStyle = '#1d2328';
            ctx.lineWidth = Math.max(2, radius * 0.09);
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();

            // Center hub dot
            ctx.fillStyle = '#181e22';
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(1.5, radius * 0.12), 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        } else {
            const radius = p.bowlRadius * BOWL_NUMERICS.pointDiscRadiusFraction * view.pixelsPerMetre;
            const angle = normal ? Math.atan2(normal.y, normal.x) + Math.PI / 2 : 0;
            ctx.save();
            ctx.translate(screen.x, screen.y);
            ctx.rotate(-angle);
            ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#6f571b'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(-radius, -2.5, radius * 2, 5, 2.5); ctx.fill(); ctx.stroke();
            ctx.restore();
        }
    }

    render() {
        const ctx = this.ctx;
        const view = this._view();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
        const sky = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
        sky.addColorStop(0, '#68cef4'); sky.addColorStop(1, '#d9f7ff');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, view.width, LOGICAL_HEIGHT);
        ctx.fillStyle = '#55c94a'; ctx.fillRect(0, view.groundY, view.width, LOGICAL_HEIGHT - view.groundY);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.setLineDash([9, 8]);
        const left = this._worldToScreen({ x: -this.parameters.movementCircleRadius, y: 0 }, view);
        const right = this._worldToScreen({ x: this.parameters.movementCircleRadius, y: 0 }, view);
        ctx.beginPath(); ctx.moveTo(left.x, view.groundY - 3); ctx.lineTo(right.x, view.groundY - 3); ctx.stroke(); ctx.setLineDash([]);
        if (this.variant === 'target') {
            const target = this._worldToScreen({ x: this.target.x, y: 0 }, view);
            for (const [radius, color] of [[27, '#fff'], [18, '#e7473e'], [8, '#ffd43b']]) {
                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(target.x, view.groundY - 2, radius, Math.PI, Math.PI * 2); ctx.fill();
            }
        }
        this._drawBowl(ctx, view);
        this._drawBody(ctx, view);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#24483b'; ctx.font = '950 20px Inter,sans-serif';
        ctx.fillText(`${this.bodyType === 'marble' ? 'ROLLING MARBLE' : 'SLIDING PUCK'} · ${this.variant.toUpperCase()} · 2D`, 18, 18);
        ctx.font = '750 13px Inter,sans-serif'; ctx.fillStyle = '#4d6c61';
        ctx.fillText(this.phase === 'ready' ? 'Click or press Space to begin' : `${this.surfaceState.contactMode} · move the bowl horizontally with the mouse`, 18, 48);
        if (this.phase === 'gameover') {
            const resultText = this.variant === 'target'
                ? `${this.result.missDistance.toFixed(2)} m from target`
                : `${this.result.distance.toFixed(2)} m from centre`;
            ctx.fillStyle = 'rgba(248,255,247,.95)'; ctx.strokeStyle = '#2d803d'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.roundRect(view.width / 2 - 220, 235, 440, 170, 18); ctx.fill(); ctx.stroke();
            ctx.textAlign = 'center'; ctx.fillStyle = '#c94137'; ctx.font = '950 27px Inter,sans-serif';
            ctx.fillText('RUN COMPLETE', view.width / 2, 263);
            ctx.fillStyle = '#264239'; ctx.font = '950 35px Inter,sans-serif'; ctx.fillText(resultText, view.width / 2, 308);
            ctx.fillStyle = '#536e65'; ctx.font = '750 13px Inter,sans-serif'; ctx.fillText('Click or press Space to try again', view.width / 2, 359);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    destroy() {}
    onResize() {}
}
