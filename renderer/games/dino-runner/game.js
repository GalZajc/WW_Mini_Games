import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

export const DINO_RUNNER_DEFAULTS = Object.freeze({
    runningSpeed: 7.2,          // [m/s]
    gravity: 23.5,              // [m/s²]
    jumpSpeed: 10.2,            // [m/s]
    meanObstacleGap: 7.6,       // [m]
    obstacleGapDeviation: 1.15, // [m]
    jumpBufferTime: 0.14,       // [s]
});

const MODEL = Object.freeze({
    fixedTimeStep: 1 / 240,
    maximumSubsteps: 18,
    logicalHeight: 720,
    pixelsPerMetre: 72,
    groundY: 590,
    dinosaurX: 2.65,
    dinosaurWidth: 0.72,
    dinosaurHeight: 1.12,
    dinosaurCrouchWidth: 1.05,
    dinosaurCrouchHeight: 0.62,
    collisionInset: 0.08,
    firstObstacleDistance: 8.5,
    minimumGeneratedGap: 0.01,
    dayNightCycleDistance: 160,
});

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

function normalRandom(random) {
    const first = Math.max(1e-12, random());
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random());
}

function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerpColor(colorA, colorB, t) {
    const clamped = Math.max(0, Math.min(1, t));
    const [r1, g1, b1] = hexToRgb(colorA);
    const [r2, g2, b2] = hexToRgb(colorB);
    const r = Math.round(r1 + (r2 - r1) * clamped);
    const g = Math.round(g1 + (g2 - g1) * clamped);
    const b = Math.round(b1 + (b2 - b1) * clamped);
    return `rgb(${r}, ${g}, ${b})`;
}

export function validateDinoRunnerSettings(settings = {}) {
    const source = { ...DINO_RUNNER_DEFAULTS, ...(settings || {}) };
    requirePositiveNumber(source.runningSpeed, 'Running speed');
    requirePositiveNumber(source.gravity, 'Gravity');
    requirePositiveNumber(source.jumpSpeed, 'Jump speed');
    requirePositiveNumber(source.meanObstacleGap, 'Mean obstacle gap');
    requireFiniteNumber(source.obstacleGapDeviation, 'Obstacle-gap standard deviation', { minimum: 0 });
    requireFiniteNumber(source.jumpBufferTime, 'Jump buffer time', { minimum: 0 });
    return source;
}

export function readDinoRunnerSettings(settings = {}) {
    const source = validateDinoRunnerSettings(settings);
    return Object.freeze(Object.fromEntries(
        Object.keys(DINO_RUNNER_DEFAULTS).map(key => [key, Number(source[key])]),
    ));
}

export function nextDinoObstacleGap(parameters, random) {
    return Math.max(
        MODEL.minimumGeneratedGap,
        parameters.meanObstacleGap + parameters.obstacleGapDeviation * normalRandom(random),
    );
}

export default class DinoRunnerGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.parameters = readDinoRunnerSettings(this.settings);
        this.bestDistance = 0;
        this._loadBest();
        this._createPlayOverlay();
        this._resetRun();
    }

    async _loadBest() {
        try {
            const record = await this.app?.records?.getBest(
                'dino-runner', this.getRecordSettings(this.settings), 'distance',
            );
            const value = Number(record?.results?.distance);
            if (Number.isFinite(value)) this.bestDistance = value;
        } catch (error) {
            console.warn('Could not load Dino Runner record:', error);
        }
    }

    _resetRun(seed = makeSeed()) {
        this.seed = seed >>> 0;
        this.random = seededRandom(this.seed);
        this.phase = 'ready';
        this.distance = 0;
        this.elapsed = 0;
        this.dinoY = 0;
        this.dinoVelocityY = 0;
        this.onGround = true;
        this.isDucking = false;
        this.legClock = 0;
        this.accumulator = 0;
        this.scoreSubmitted = false;
        this.obstacles = [];
        this.nextObstacleX = MODEL.firstObstacleDistance;
        this._jumpBufferedUntil = 0;
        this._spawnAhead(32);
        this._syncPlayOverlay();
    }

    _spawnAhead(ahead) {
        while (this.nextObstacleX < this.distance + ahead) {
            const allowBirds = this.nextObstacleX > 28;
            const roll = this.random();

            if (allowBirds && roll < 0.32) {
                // Flying Pterodactyl Bird at 3 different altitudes
                const altRoll = this.random();
                let altitude = 'mid';
                let birdY = 0.78; // must duck under
                if (altRoll < 0.35) {
                    altitude = 'low';
                    birdY = 0.36; // must jump over
                } else if (altRoll > 0.75) {
                    altitude = 'high';
                    birdY = 1.34; // can run or duck under safely
                }

                this.obstacles.push({
                    type: 'bird',
                    x: this.nextObstacleX,
                    y: birdY,
                    width: 0.78,
                    height: 0.44,
                    altitude,
                });
            } else {
                // Cactus varieties: small, double, tall, or cluster
                const cRoll = this.random();
                let cactusType = 'small';
                let width = 0.40;
                let height = 0.68;
                let cluster = 1;

                if (cRoll < 0.35) {
                    cactusType = 'small';
                    width = 0.40;
                    height = 0.68;
                    cluster = 1;
                } else if (cRoll < 0.62) {
                    cactusType = 'double';
                    width = 0.76;
                    height = 0.72;
                    cluster = 2;
                } else if (cRoll < 0.84) {
                    cactusType = 'tall';
                    width = 0.44;
                    height = 1.14;
                    cluster = 1;
                } else {
                    cactusType = 'cluster';
                    width = 1.05;
                    height = 1.15;
                    cluster = 3;
                }

                this.obstacles.push({
                    type: 'cactus',
                    cactusType,
                    x: this.nextObstacleX,
                    y: 0,
                    width,
                    height,
                    cluster,
                });
            }

            this.nextObstacleX += nextDinoObstacleGap(this.parameters, this.random);
        }
    }

    _jump() {
        if (!this.onGround || this.phase !== 'running') return;
        this.dinoVelocityY = this.parameters.jumpSpeed;
        this.onGround = false;
        this.isDucking = false;
        this.audio.playClick?.();
    }

    _startRun() {
        this.phase = 'running';
        this._syncPlayOverlay();
        this.audio.playClick?.();
    }

    _step(step) {
        this.elapsed += step;
        this.distance += this.parameters.runningSpeed * step;
        this.legClock += step * this.parameters.runningSpeed;
        this.dinoVelocityY -= this.parameters.gravity * step;
        this.dinoY += this.dinoVelocityY * step;

        if (this.dinoY <= 0) {
            this.dinoY = 0;
            this.dinoVelocityY = 0;
            this.onGround = true;

            // Check input buffer upon landing
            if (this.elapsed <= this._jumpBufferedUntil) {
                this._jumpBufferedUntil = 0;
                this._jump();
            }
        }

        this._spawnAhead(34);
        this.obstacles = this.obstacles.filter(obstacle => obstacle.x + obstacle.width > this.distance - 4);
        if (this._hasCollision()) this._finishRun();
    }

    _hasCollision() {
        const ducking = this.isDucking && this.onGround;
        const dinoWidth = ducking ? MODEL.dinosaurCrouchWidth : MODEL.dinosaurWidth;
        const dinoHeight = ducking ? MODEL.dinosaurCrouchHeight : MODEL.dinosaurHeight;
        const xOffset = ducking ? 0.08 : 0;

        const left = this.distance + MODEL.dinosaurX - dinoWidth / 2 + MODEL.collisionInset + xOffset;
        const right = this.distance + MODEL.dinosaurX + dinoWidth / 2 - MODEL.collisionInset + xOffset;
        const bottom = this.dinoY + MODEL.collisionInset;
        const top = this.dinoY + dinoHeight - MODEL.collisionInset;

        return this.obstacles.some(obstacle => {
            const obstacleLeft = obstacle.x - obstacle.width / 2 + 0.05;
            const obstacleRight = obstacle.x + obstacle.width / 2 - 0.05;
            const obstacleBottom = obstacle.y + 0.04;
            const obstacleTop = obstacle.y + obstacle.height - 0.04;

            return right > obstacleLeft
                && left < obstacleRight
                && top > obstacleBottom
                && bottom < obstacleTop;
        });
    }

    _finishRun() {
        if (this.phase === 'gameover') return;
        this.phase = 'gameover';
        this.bestDistance = Math.max(this.bestDistance, this.distance);
        if (!this.scoreSubmitted) {
            this.submitScore({
                distance: Number(this.distance.toFixed(2)),
                seconds: Number(this.elapsed.toFixed(3)),
                seed: this.seed,
            });
            this.scoreSubmitted = true;
        }
        this.audio.playPlasticImpact?.(0.34);
        this._syncPlayOverlay();
    }

    update(dt) {
        const jumpPressed = Boolean(
            this.input.isActionJustDown?.('jump')
                || this.input.isMouseJustDown?.(0),
        );
        const crouchHeld = Boolean(
            this.input.isActionDown?.('crouch')
                || this.input.isMouseDown?.(2),
        );

        if (this.phase === 'ready' || this.phase === 'gameover') return;

        if (crouchHeld) {
            this.isDucking = true;
            if (!this.onGround) {
                // Fast drop dive while in air
                this.dinoVelocityY = Math.min(this.dinoVelocityY, -this.parameters.jumpSpeed * 0.95);
            }
        } else {
            this.isDucking = false;
        }

        if (jumpPressed) {
            if (this.onGround) {
                this._jump();
            } else {
                // Buffer the jump input so dino jumps immediately on landing
                this._jumpBufferedUntil = this.elapsed + this.parameters.jumpBufferTime;
            }
        }

        this.accumulator = Math.min(
            this.accumulator + Math.min(0.05, Number(dt) || 0),
            MODEL.fixedTimeStep * MODEL.maximumSubsteps,
        );
        while (this.accumulator >= MODEL.fixedTimeStep) {
            this._step(MODEL.fixedTimeStep);
            this.accumulator -= MODEL.fixedTimeStep;
            if (this.phase === 'gameover') break;
        }
    }

    _layout() {
        const scale = this.h / MODEL.logicalHeight;
        return { scale, width: this.w / Math.max(1e-9, scale) };
    }

    _worldX(x) {
        return (x - this.distance) * MODEL.pixelsPerMetre;
    }

    _nightFactor() {
        const period = MODEL.dayNightCycleDistance;
        const phase = this.distance % period;
        const transition = 16;
        if (phase < period * 0.45) return 0; // Day
        if (phase < period * 0.45 + transition) {
            return (phase - period * 0.45) / transition; // Day -> Night
        }
        if (phase < period * 0.90) return 1; // Night
        return 1 - (phase - period * 0.90) / transition; // Night -> Day
    }

    _drawSkyAndAtmosphere(ctx, width, height, nightFactor) {
        // Multi-stop gradient sky transitioning between lush Day, Sunset, and Cosmic Night
        const skyGrad = ctx.createLinearGradient(0, 0, 0, MODEL.groundY);
        if (nightFactor < 0.2) {
            // Sunny Desert Day
            skyGrad.addColorStop(0, '#3ba2e8');
            skyGrad.addColorStop(0.55, '#76c4f8');
            skyGrad.addColorStop(0.85, '#ffe3a8');
            skyGrad.addColorStop(1, '#fde6ba');
        } else if (nightFactor < 0.8) {
            // Golden Sunset / Dusk Twilight
            const t = (nightFactor - 0.2) / 0.6;
            const topColor = lerpColor('#3ba2e8', '#0e1236', t);
            const midColor = lerpColor('#ff6e54', '#3d2358', t);
            const botColor = lerpColor('#ffa94d', '#723659', t);
            skyGrad.addColorStop(0, topColor);
            skyGrad.addColorStop(0.45, midColor);
            skyGrad.addColorStop(1, botColor);
        } else {
            // Rich Cosmic Night
            skyGrad.addColorStop(0, '#0a0d24');
            skyGrad.addColorStop(0.5, '#16193b');
            skyGrad.addColorStop(0.85, '#261c47');
            skyGrad.addColorStop(1, '#3b2552');
        }

        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height);

        // Sun & Solar Glow (Day)
        if (nightFactor < 0.85) {
            const sunAlpha = 1 - Math.min(1, nightFactor / 0.7);
            const sunX = width - 110;
            const sunY = 96;

            // Outer radiant aura
            const sunGlow = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 90);
            sunGlow.addColorStop(0, `rgba(255, 240, 150, ${0.7 * sunAlpha})`);
            sunGlow.addColorStop(0.5, `rgba(255, 180, 60, ${0.3 * sunAlpha})`);
            sunGlow.addColorStop(1, 'rgba(255, 160, 40, 0)');
            ctx.fillStyle = sunGlow;
            ctx.beginPath();
            ctx.arc(sunX, sunY, 90, 0, Math.PI * 2);
            ctx.fill();

            // Sun Core with bright corona
            const sunCore = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 28);
            sunCore.addColorStop(0, `rgba(255, 255, 240, ${sunAlpha})`);
            sunCore.addColorStop(0.7, `rgba(255, 220, 80, ${sunAlpha})`);
            sunCore.addColorStop(1, `rgba(255, 160, 30, ${0.9 * sunAlpha})`);
            ctx.fillStyle = sunCore;
            ctx.beginPath();
            ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
            ctx.fill();
        }

        // Moon & Twinkling Stars (Night)
        if (nightFactor > 0.15) {
            const moonAlpha = Math.min(1, (nightFactor - 0.15) / 0.7);
            const moonX = width - 110;
            const moonY = 92;

            // Moon Aura
            const moonGlow = ctx.createRadialGradient(moonX, moonY, 18, moonX, moonY, 70);
            moonGlow.addColorStop(0, `rgba(180, 220, 255, ${0.45 * moonAlpha})`);
            moonGlow.addColorStop(1, 'rgba(100, 150, 240, 0)');
            ctx.fillStyle = moonGlow;
            ctx.beginPath();
            ctx.arc(moonX, moonY, 70, 0, Math.PI * 2);
            ctx.fill();

            // Crescent Moon Body
            ctx.save();
            ctx.fillStyle = `rgba(242, 246, 255, ${moonAlpha})`;
            ctx.beginPath();
            ctx.arc(moonX, moonY, 24, 0, Math.PI * 2);
            ctx.fill();

            // Inner Shadow carving out the crescent
            ctx.fillStyle = `rgba(22, 25, 59, ${moonAlpha * 0.96})`;
            ctx.beginPath();
            ctx.arc(moonX - 9, moonY - 6, 20, 0, Math.PI * 2);
            ctx.fill();

            // Subtle crater accents on bright crescent
            ctx.fillStyle = `rgba(200, 215, 240, ${0.4 * moonAlpha})`;
            ctx.beginPath();
            ctx.arc(moonX + 10, moonY + 4, 3, 0, Math.PI * 2);
            ctx.arc(moonX + 6, moonY + 13, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Sparkling Starfield
            for (let i = 0; i < 22; i++) {
                const sx = ((i * 137 + 45) % (width - 40)) + 20;
                const sy = 25 + (i * 39) % 150;
                const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.5 + i * 1.9);
                const starSize = (i % 4 === 0) ? 2.5 : 1.5;
                const sAlpha = moonAlpha * (0.4 + 0.6 * pulse);

                ctx.fillStyle = `rgba(255, 255, 255, ${sAlpha})`;
                ctx.beginPath();
                ctx.arc(sx, sy, starSize * 0.75, 0, Math.PI * 2);
                ctx.fill();

                if (i % 5 === 0) {
                    // Cross sparkle for bright stars
                    ctx.strokeStyle = `rgba(230, 240, 255, ${sAlpha * 0.8})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy);
                    ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4);
                    ctx.stroke();
                }
            }
        }

        // Fluffy Stylized Clouds with Parallax
        const cloudTint = nightFactor > 0.5
            ? 'rgba(65, 55, 95, 0.45)'
            : 'rgba(255, 255, 255, 0.72)';
        const cloudShadow = nightFactor > 0.5
            ? 'rgba(40, 32, 65, 0.4)'
            : 'rgba(220, 235, 250, 0.65)';

        for (let i = -1; i < 5; i++) {
            const cx = ((i * 310 - this.distance * 7.5) % (width + 380)) + 60;
            const cy = 80 + (i % 3) * 36;
            const cw = 76 + (i % 2) * 24;

            ctx.save();
            ctx.translate(cx, cy);

            // Cloud base shadow
            ctx.fillStyle = cloudShadow;
            ctx.beginPath();
            ctx.roundRect(-cw / 2, 4, cw, 22, 11);
            ctx.fill();

            // Cloud body
            ctx.fillStyle = cloudTint;
            ctx.beginPath();
            ctx.roundRect(-cw / 2, 0, cw, 20, 10);
            ctx.arc(-cw * 0.2, -8, 16, 0, Math.PI * 2);
            ctx.arc(cw * 0.15, -12, 20, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    _drawParallaxScenery(ctx, width, nightFactor) {
        const ground = MODEL.groundY;

        // Far Mountains / Mesas (moves at 0.08x speed)
        const farMountainColor = nightFactor > 0.5
            ? lerpColor('#22183c', '#15102a', nightFactor)
            : lerpColor('#c77b5a', '#6d3c52', nightFactor);
        const farHighlight = nightFactor > 0.5
            ? 'rgba(90, 70, 130, 0.2)'
            : 'rgba(255, 210, 180, 0.35)';

        ctx.fillStyle = farMountainColor;
        const mesaStep = 240;
        const mesaOffset = (this.distance * MODEL.pixelsPerMetre * 0.08) % mesaStep;

        ctx.beginPath();
        ctx.moveTo(-40, ground);
        for (let mx = -mesaOffset - 40; mx < width + mesaStep + 40; mx += mesaStep) {
            const mesaIndex = Math.floor((mx + this.distance * MODEL.pixelsPerMetre * 0.08) / mesaStep);
            const peakH = 90 + Math.abs(Math.sin(mesaIndex * 3.7)) * 75;
            const plateauW = 55 + Math.abs(Math.cos(mesaIndex * 2.1)) * 45;

            ctx.lineTo(mx, ground - peakH * 0.5);
            ctx.lineTo(mx + 35, ground - peakH);
            ctx.lineTo(mx + 35 + plateauW, ground - peakH);
            ctx.lineTo(mx + 70 + plateauW, ground - peakH * 0.4);
            ctx.lineTo(mx + mesaStep, ground);
        }
        ctx.lineTo(width + 40, ground);
        ctx.closePath();
        ctx.fill();

        // Midground Dunes & Prehistoric Flora (moves at 0.28x speed)
        const duneColor = nightFactor > 0.5
            ? lerpColor('#32224d', '#1f1533', nightFactor)
            : lerpColor('#e5914c', '#7d3a4c', nightFactor);
        const duneHighlight = nightFactor > 0.5
            ? 'rgba(120, 95, 170, 0.25)'
            : 'rgba(255, 230, 160, 0.45)';

        const duneStep = 180;
        const duneOffset = (this.distance * MODEL.pixelsPerMetre * 0.28) % duneStep;

        ctx.fillStyle = duneColor;
        ctx.beginPath();
        ctx.moveTo(-30, ground);
        for (let dx = -duneOffset - 30; dx < width + duneStep + 30; dx += duneStep) {
            const duneIndex = Math.floor((dx + this.distance * MODEL.pixelsPerMetre * 0.28) / duneStep);
            const duneH = 45 + Math.abs(Math.sin(duneIndex * 5.1)) * 40;

            ctx.bezierCurveTo(
                dx + 40, ground - duneH,
                dx + 120, ground - duneH,
                dx + duneStep, ground,
            );
        }
        ctx.lineTo(width + 30, ground);
        ctx.closePath();
        ctx.fill();

        // Dunes top highlight rim
        ctx.strokeStyle = duneHighlight;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let dx = -duneOffset - 30; dx < width + duneStep + 30; dx += duneStep) {
            const duneIndex = Math.floor((dx + this.distance * MODEL.pixelsPerMetre * 0.28) / duneStep);
            const duneH = 45 + Math.abs(Math.sin(duneIndex * 5.1)) * 40;
            ctx.moveTo(dx, ground);
            ctx.bezierCurveTo(
                dx + 40, ground - duneH,
                dx + 120, ground - duneH,
                dx + duneStep, ground,
            );
        }
        ctx.stroke();
    }

    _drawGround(ctx, width, nightFactor) {
        const ground = MODEL.groundY;
        const groundHeight = MODEL.logicalHeight - ground;

        // Sandstone strata gradient
        const groundGrad = ctx.createLinearGradient(0, ground, 0, MODEL.logicalHeight);
        if (nightFactor < 0.5) {
            groundGrad.addColorStop(0, '#e8aa55');
            groundGrad.addColorStop(0.12, '#cc893b');
            groundGrad.addColorStop(0.4, '#a76026');
            groundGrad.addColorStop(1, '#683612');
        } else {
            groundGrad.addColorStop(0, '#53436d');
            groundGrad.addColorStop(0.15, '#3b2d52');
            groundGrad.addColorStop(0.5, '#281c3a');
            groundGrad.addColorStop(1, '#150d22');
        }

        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, ground, width, groundHeight);

        // Golden top rim edge highlight
        const rimColor = nightFactor < 0.5 ? '#ffe894' : '#8874aa';
        ctx.fillStyle = rimColor;
        ctx.fillRect(0, ground, width, 4);

        // Sedimentary rock strata lines & pebbles
        const strataColor = nightFactor < 0.5 ? 'rgba(120, 60, 20, 0.35)' : 'rgba(20, 10, 35, 0.45)';
        const pebbleColor = nightFactor < 0.5 ? '#f5d688' : '#6b578c';

        ctx.strokeStyle = strataColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, ground + 24); ctx.lineTo(width, ground + 24);
        ctx.moveTo(0, ground + 54); ctx.lineTo(width, ground + 54);
        ctx.moveTo(0, ground + 90); ctx.lineTo(width, ground + 90);
        ctx.stroke();

        // Moving ground details (pebbles, fossil rocks, grass tufts)
        const tickSpacing = 32;
        const offset = (this.distance * MODEL.pixelsPerMetre) % tickSpacing;
        for (let gx = -offset; gx < width + 36; gx += tickSpacing) {
            const seed = Math.sin(Math.floor((gx + this.distance * MODEL.pixelsPerMetre) / tickSpacing) * 137.9);

            if (seed > 0.4) {
                // Shiny pebble
                ctx.fillStyle = pebbleColor;
                ctx.beginPath();
                ctx.ellipse(gx, ground + 10 + Math.abs(seed) * 18, 5, 2.5, 0.2, 0, Math.PI * 2);
                ctx.fill();
            } else if (seed < -0.3) {
                // Desert grass tuft / stone cluster
                ctx.fillStyle = nightFactor < 0.5 ? '#7bb339' : '#4a6b32';
                ctx.beginPath();
                ctx.moveTo(gx, ground);
                ctx.lineTo(gx - 3, ground - 7);
                ctx.lineTo(gx + 1, ground);
                ctx.lineTo(gx + 4, ground - 9);
                ctx.lineTo(gx + 6, ground);
                ctx.fill();
            }
        }

        // Dust puffs kicked up behind Dino while running on the ground
        if (this.phase === 'running' && this.onGround) {
            const dinoFootX = MODEL.dinosaurX * MODEL.pixelsPerMetre - 20;
            const puffStep = (this.legClock * 3.4) % 1;
            const puffAlpha = (1 - puffStep) * 0.65;
            const puffX = dinoFootX - puffStep * 28;
            const puffY = ground - 4 - puffStep * 10;
            const puffR = 4 + puffStep * 9;

            ctx.fillStyle = nightFactor < 0.5
                ? `rgba(240, 210, 160, ${puffAlpha})`
                : `rgba(160, 140, 190, ${puffAlpha * 0.7})`;
            ctx.beginPath();
            ctx.arc(puffX, puffY, puffR, 0, Math.PI * 2);
            ctx.arc(puffX + 7, puffY + 2, puffR * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawDinosaur(ctx, x, ground, nightFactor) {
        const ppm = MODEL.pixelsPerMetre;
        const y = ground - this.dinoY * ppm;
        const blink = (Math.floor(this.elapsed * 0.75) % 6 === 0) && (this.elapsed % 1 < 0.16);
        const isCrashed = (this.phase === 'gameover');
        const isAirborne = !this.onGround;

        // Shadow on the ground (stretches / fades when jumping)
        const shadowScale = Math.max(0.2, 1 - (this.dinoY / 4));
        const shadowAlpha = 0.35 * shadowScale;
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(x, ground + 2, 28 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(x, y);

        if (this.isDucking && this.onGround && !isCrashed) {
            const stepFrame = Math.floor(this.legClock * 4.2) % 2;
            this._drawVibrantDuckingDino(ctx, stepFrame, blink);
        } else {
            const stepFrame = isAirborne ? -1 : (Math.floor(this.legClock * 4.2) % 2);
            this._drawVibrantStandingDino(ctx, stepFrame, blink, isCrashed, isAirborne);
        }

        ctx.restore();
    }

    _drawVibrantStandingDino(ctx, stepFrame, blink, isCrashed, isAirborne) {
        // Color Palette: Vibrant Emerald T-Rex with Sunset Dorsal Spikes & Golden Belly
        const dinoGreenLight = '#4cd162';
        const dinoGreenMid = '#32a848';
        const dinoGreenDark = '#1e752f';
        const bellyCream = '#fef0b8';
        const spikeOrange = '#ff7b25';
        const eyeColor = '#1d2228';
        const toothWhite = '#ffffff';

        // 1. TAIL
        ctx.beginPath();
        ctx.moveTo(-16, -38);
        ctx.bezierCurveTo(-34, -48, -48, -52, -54, -46);
        ctx.bezierCurveTo(-50, -36, -30, -22, -14, -22);
        ctx.closePath();
        const tailGrad = ctx.createLinearGradient(-54, -50, -14, -22);
        tailGrad.addColorStop(0, dinoGreenLight);
        tailGrad.addColorStop(1, dinoGreenMid);
        ctx.fillStyle = tailGrad;
        ctx.fill();
        ctx.strokeStyle = dinoGreenDark;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Tail spikes
        ctx.fillStyle = spikeOrange;
        for (let i = 0; i < 3; i++) {
            const spX = -26 - i * 10;
            const spY = -40 - i * 3;
            ctx.beginPath();
            ctx.moveTo(spX, spY);
            ctx.lineTo(spX - 5, spY - 9);
            ctx.lineTo(spX - 8, spY + 2);
            ctx.closePath();
            ctx.fill();
        }

        // 2. BACK / DORSAL RIDGE SPIKES
        ctx.fillStyle = spikeOrange;
        for (let i = 0; i < 4; i++) {
            const spX = -12 + i * 8;
            const spY = -52 + (i === 0 ? 4 : 0);
            ctx.beginPath();
            ctx.moveTo(spX, spY);
            ctx.lineTo(spX + 4, spY - 8);
            ctx.lineTo(spX + 8, spY + 2);
            ctx.closePath();
            ctx.fill();
        }

        // 3. MAIN BODY / TORSO
        ctx.beginPath();
        ctx.ellipse(0, -36, 22, 25, 0.15, 0, Math.PI * 2);
        const bodyGrad = ctx.createRadialGradient(-6, -42, 4, 0, -36, 26);
        bodyGrad.addColorStop(0, dinoGreenLight);
        bodyGrad.addColorStop(0.7, dinoGreenMid);
        bodyGrad.addColorStop(1, dinoGreenDark);
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.stroke();

        // Cream Underbelly
        ctx.beginPath();
        ctx.ellipse(6, -32, 12, 17, 0.35, -Math.PI * 0.4, Math.PI * 0.6);
        ctx.fillStyle = bellyCream;
        ctx.fill();

        // 4. NECK & HEAD
        ctx.beginPath();
        ctx.moveTo(-4, -50);
        ctx.lineTo(6, -72);
        ctx.bezierCurveTo(12, -84, 34, -84, 38, -66); // Top snout
        ctx.lineTo(38, -52); // Jaw front
        ctx.lineTo(16, -52); // Jaw line
        ctx.bezierCurveTo(8, -46, 2, -40, 2, -36);
        ctx.closePath();
        const headGrad = ctx.createLinearGradient(4, -84, 30, -50);
        headGrad.addColorStop(0, dinoGreenLight);
        headGrad.addColorStop(0.8, dinoGreenMid);
        headGrad.addColorStop(1, dinoGreenDark);
        ctx.fillStyle = headGrad;
        ctx.fill();
        ctx.stroke();

        // Head Spikes on back of skull
        ctx.fillStyle = spikeOrange;
        ctx.beginPath();
        ctx.moveTo(4, -76); ctx.lineTo(-2, -84); ctx.lineTo(10, -78);
        ctx.fill();

        // Mouth & Teeth
        if (isCrashed) {
            // Open shocked mouth
            ctx.fillStyle = '#8f1d1d';
            ctx.beginPath();
            ctx.roundRect(18, -56, 18, 9, 3);
            ctx.fill();
            // Tiny teeth
            ctx.fillStyle = toothWhite;
            ctx.fillRect(20, -56, 3, 3);
            ctx.fillRect(26, -56, 3, 3);
            ctx.fillRect(32, -56, 3, 3);
        } else {
            // Determined / smiling toothy mouth
            ctx.strokeStyle = dinoGreenDark;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(16, -54); ctx.lineTo(36, -54);
            ctx.stroke();
            // Sharp little tooth sticking out
            ctx.fillStyle = toothWhite;
            ctx.beginPath();
            ctx.moveTo(26, -54); ctx.lineTo(29, -49); ctx.lineTo(32, -54);
            ctx.closePath();
            ctx.fill();
        }

        // Cute Nostril
        ctx.fillStyle = dinoGreenDark;
        ctx.beginPath();
        ctx.arc(32, -72, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // 5. EYE
        const eyeX = 16;
        const eyeY = -70;
        if (isCrashed) {
            // Cartoon Crash 'X' Eye
            ctx.strokeStyle = '#c92a2a';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(eyeX - 6, eyeY - 6); ctx.lineTo(eyeX + 6, eyeY + 6);
            ctx.moveTo(eyeX + 6, eyeY - 6); ctx.lineTo(eyeX - 6, eyeY + 6);
            ctx.stroke();

            // Orbiting Dizzy Stars
            const rot = this.elapsed * 5;
            ctx.fillStyle = '#ffe066';
            for (let i = 0; i < 3; i++) {
                const ang = rot + (i * Math.PI * 2) / 3;
                const starX = eyeX + Math.cos(ang) * 16;
                const starY = eyeY - 14 + Math.sin(ang) * 6;
                ctx.beginPath();
                ctx.arc(starX, starY, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (blink) {
            // Closed happy blinking eye
            ctx.strokeStyle = eyeColor;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(eyeX - 6, eyeY);
            ctx.quadraticCurveTo(eyeX, eyeY + 4, eyeX + 6, eyeY);
            ctx.stroke();
        } else {
            // Big lively cartoon eye with shine
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(eyeX, eyeY, 7.5, 8.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = dinoGreenDark;
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Iris & Pupil
            ctx.fillStyle = '#ff9900';
            ctx.beginPath();
            ctx.arc(eyeX + 1.5, eyeY, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = eyeColor;
            ctx.beginPath();
            ctx.arc(eyeX + 2, eyeY, 3.2, 0, Math.PI * 2);
            ctx.fill();

            // Bright White Specular Highlights
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(eyeX + 0.5, eyeY - 2.5, 2, 0, Math.PI * 2);
            ctx.arc(eyeX + 3.5, eyeY + 1.5, 1, 0, Math.PI * 2);
            ctx.fill();
        }

        // 6. TINY T-REX ARMS
        ctx.save();
        ctx.translate(14, -38);
        ctx.rotate(Math.sin(this.legClock * 4.2) * 0.25);
        ctx.fillStyle = dinoGreenMid;
        ctx.beginPath();
        ctx.roundRect(0, -3, 14, 7, 3.5);
        ctx.roundRect(10, 0, 5, 8, 2.5);
        ctx.fill();
        ctx.strokeStyle = dinoGreenDark;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // Little white claws
        ctx.fillStyle = toothWhite;
        ctx.fillRect(13, 6, 2, 3);
        ctx.fillRect(10, 6, 2, 3);
        ctx.restore();

        // 7. POWERFUL LEGS & CLAWS
        const drawLeg = (legX, isBack, phaseOffset) => {
            ctx.save();
            ctx.translate(legX, -16);

            let hipRot = 0;
            let kneeY = 8;
            let footX = 0;

            if (isAirborne) {
                // Tucked in jump pose
                hipRot = isBack ? -0.4 : 0.35;
                kneeY = 6;
                footX = isBack ? -4 : 6;
            } else if (stepFrame === -1) {
                hipRot = 0;
            } else {
                // Dynamic running stride
                const cycle = Math.sin(this.legClock * 4.2 + phaseOffset);
                hipRot = cycle * 0.65;
                footX = Math.sin(this.legClock * 4.2 + phaseOffset) * 12;
            }

            ctx.rotate(hipRot);

            // Thigh
            ctx.fillStyle = isBack ? dinoGreenDark : dinoGreenMid;
            ctx.beginPath();
            ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            // Shin
            ctx.fillStyle = isBack ? dinoGreenDark : dinoGreenMid;
            ctx.beginPath();
            ctx.roundRect(-3.5, 4, 7, 12, 3);
            ctx.fill();

            // Foot & Sharp White Claws
            ctx.fillStyle = isBack ? dinoGreenDark : dinoGreenMid;
            ctx.beginPath();
            ctx.roundRect(-4 + footX * 0.2, 14, 15, 6, 2.5);
            ctx.fill();

            ctx.fillStyle = toothWhite;
            ctx.fillRect(8 + footX * 0.2, 16, 3, 3);
            ctx.fillRect(5 + footX * 0.2, 17, 3, 3);

            ctx.restore();
        };

        // Draw left leg (background), then right leg (foreground)
        drawLeg(-6, true, Math.PI);
        drawLeg(6, false, 0);
    }

    _drawVibrantDuckingDino(ctx, stepFrame, blink) {
        const dinoGreenLight = '#4cd162';
        const dinoGreenMid = '#32a848';
        const dinoGreenDark = '#1e752f';
        const bellyCream = '#fef0b8';
        const spikeOrange = '#ff7b25';
        const eyeColor = '#1d2228';
        const toothWhite = '#ffffff';

        // Speed Lines trailing behind while ducking
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-45, -34); ctx.lineTo(-65, -34);
        ctx.moveTo(-40, -22); ctx.lineTo(-70, -22);
        ctx.moveTo(-35, -12); ctx.lineTo(-58, -12);
        ctx.stroke();

        // 1. STRAIGHTENED TAIL
        ctx.beginPath();
        ctx.moveTo(-20, -32);
        ctx.lineTo(-54, -30);
        ctx.lineTo(-54, -20);
        ctx.lineTo(-18, -16);
        ctx.closePath();
        const tailGrad = ctx.createLinearGradient(-54, -30, -18, -16);
        tailGrad.addColorStop(0, dinoGreenLight);
        tailGrad.addColorStop(1, dinoGreenMid);
        ctx.fillStyle = tailGrad;
        ctx.fill();
        ctx.strokeStyle = dinoGreenDark;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Tail Spikes
        ctx.fillStyle = spikeOrange;
        ctx.beginPath();
        ctx.moveTo(-36, -31); ctx.lineTo(-40, -39); ctx.lineTo(-44, -30);
        ctx.moveTo(-24, -32); ctx.lineTo(-28, -40); ctx.lineTo(-32, -31);
        ctx.fill();

        // 2. HORIZONTAL LOW TORSO
        ctx.beginPath();
        ctx.roundRect(-22, -36, 48, 24, 12);
        const bodyGrad = ctx.createLinearGradient(-22, -36, 26, -12);
        bodyGrad.addColorStop(0, dinoGreenLight);
        bodyGrad.addColorStop(1, dinoGreenDark);
        ctx.fillStyle = bodyGrad;
        ctx.fill();
        ctx.stroke();

        // Cream Underbelly
        ctx.fillStyle = bellyCream;
        ctx.beginPath();
        ctx.roundRect(-10, -20, 32, 8, 4);
        ctx.fill();

        // Spine Ridge Spikes
        ctx.fillStyle = spikeOrange;
        for (let i = 0; i < 4; i++) {
            const spX = -14 + i * 10;
            ctx.beginPath();
            ctx.moveTo(spX, -36);
            ctx.lineTo(spX + 4, -43);
            ctx.lineTo(spX + 8, -36);
            ctx.closePath();
            ctx.fill();
        }

        // 3. LOW STREAMLINED HEAD & SNOUT
        ctx.beginPath();
        ctx.roundRect(18, -38, 36, 20, 8);
        ctx.fillStyle = dinoGreenMid;
        ctx.fill();
        ctx.stroke();

        // Mouth & Teeth
        ctx.strokeStyle = dinoGreenDark;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(34, -23); ctx.lineTo(52, -23);
        ctx.stroke();
        ctx.fillStyle = toothWhite;
        ctx.beginPath();
        ctx.moveTo(42, -23); ctx.lineTo(45, -19); ctx.lineTo(48, -23);
        ctx.closePath();
        ctx.fill();

        // Nostril
        ctx.fillStyle = dinoGreenDark;
        ctx.beginPath();
        ctx.arc(48, -32, 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Eye (Determined racing eye)
        const eyeX = 32;
        const eyeY = -30;
        if (blink) {
            ctx.strokeStyle = eyeColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(eyeX - 5, eyeY); ctx.lineTo(eyeX + 5, eyeY);
            ctx.stroke();
        } else {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(eyeX, eyeY, 6, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff9900';
            ctx.beginPath();
            ctx.arc(eyeX + 1.5, eyeY, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = eyeColor;
            ctx.beginPath();
            ctx.arc(eyeX + 2, eyeY, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(eyeX + 0.8, eyeY - 2, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }

        // 4. TINY STREAMLINED ARM
        ctx.fillStyle = dinoGreenMid;
        ctx.beginPath();
        ctx.roundRect(22, -18, 12, 5, 2.5);
        ctx.fill();
        ctx.fillStyle = toothWhite;
        ctx.fillRect(32, -17, 2, 3);

        // 5. RAPID CROUCHING RUNNING LEGS
        const drawCrouchLeg = (legX, isBack, phase) => {
            ctx.save();
            ctx.translate(legX, -10);
            const cycle = Math.sin(this.legClock * 4.8 + phase);
            ctx.rotate(cycle * 0.55);

            ctx.fillStyle = isBack ? dinoGreenDark : dinoGreenMid;
            ctx.beginPath();
            ctx.roundRect(-3, 0, 6, 12, 2.5);
            ctx.roundRect(-3, 9, 13, 5, 2);
            ctx.fill();
            ctx.fillStyle = toothWhite;
            ctx.fillRect(7, 10, 3, 3);
            ctx.restore();
        };

        drawCrouchLeg(-4, true, Math.PI);
        drawCrouchLeg(10, false, 0);
    }

    _drawCactus(ctx, x, ground, obstacle, nightFactor) {
        const ppm = MODEL.pixelsPerMetre;
        const height = obstacle.height * ppm;
        const width = obstacle.width * ppm;

        // Shadow on the desert sand
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.beginPath();
        ctx.ellipse(x, ground + 2, width * 0.65, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        const stems = obstacle.cluster || 1;
        const trunkWidth = Math.max(16, (width / stems) * 0.46);

        // Cactus 3D Rich Green Gradient & Ridge Palette
        const isNight = nightFactor > 0.6;
        const cactusGreenLight = isNight ? '#3a7d44' : '#4cd964';
        const cactusGreenMid = isNight ? '#22592d' : '#28a745';
        const cactusGreenDark = isNight ? '#13381a' : '#146c2e';
        const spineColor = isNight ? '#d0dbb8' : '#fff37a';
        const flowerMagenta = '#ff2e78';
        const flowerCenter = '#ffdd33';

        for (let i = 0; i < stems; i++) {
            const stemX = x + (i - (stems - 1) / 2) * (width * 0.54);
            const stemH = height * (1 - (i % 2) * 0.14);

            ctx.save();

            // Main Vertical Saguaro Trunk
            const trunkGrad = ctx.createLinearGradient(stemX - trunkWidth / 2, 0, stemX + trunkWidth / 2, 0);
            trunkGrad.addColorStop(0, cactusGreenLight);
            trunkGrad.addColorStop(0.35, cactusGreenMid);
            trunkGrad.addColorStop(1, cactusGreenDark);

            ctx.fillStyle = trunkGrad;
            ctx.beginPath();
            ctx.roundRect(stemX - trunkWidth / 2, ground - stemH, trunkWidth, stemH + 2, trunkWidth * 0.42);
            ctx.fill();
            ctx.strokeStyle = cactusGreenDark;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Vertical Ribbed Grooves / Ridges
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(stemX - trunkWidth * 0.2, ground - stemH + 4);
            ctx.lineTo(stemX - trunkWidth * 0.2, ground);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.moveTo(stemX + trunkWidth * 0.22, ground - stemH + 4);
            ctx.lineTo(stemX + trunkWidth * 0.22, ground);
            ctx.stroke();

            // Sharp Yellow Needles / Spines sticking out
            ctx.strokeStyle = spineColor;
            ctx.lineWidth = 1.2;
            for (let ny = ground - stemH + 14; ny < ground - 8; ny += 18) {
                // Left needles
                ctx.beginPath();
                ctx.moveTo(stemX - trunkWidth / 2, ny);
                ctx.lineTo(stemX - trunkWidth / 2 - 5, ny - 3);
                ctx.moveTo(stemX - trunkWidth / 2, ny);
                ctx.lineTo(stemX - trunkWidth / 2 - 5, ny + 3);
                ctx.stroke();

                // Right needles
                ctx.beginPath();
                ctx.moveTo(stemX + trunkWidth / 2, ny);
                ctx.lineTo(stemX + trunkWidth / 2 + 5, ny - 3);
                ctx.moveTo(stemX + trunkWidth / 2, ny);
                ctx.lineTo(stemX + trunkWidth / 2 + 5, ny + 3);
                ctx.stroke();
            }

            // Left Branching Saguaro Arm
            if (stemH > 44) {
                const armY1 = ground - stemH * 0.62;
                const armW1 = trunkWidth * 0.72;
                const armH1 = stemH * 0.34;

                ctx.fillStyle = trunkGrad;
                ctx.beginPath();
                ctx.roundRect(stemX - trunkWidth * 1.35, armY1, trunkWidth * 1.35, armW1, 4);
                ctx.roundRect(stemX - trunkWidth * 1.35, armY1 - armH1 + armW1, armW1, armH1, armW1 * 0.45);
                ctx.fill();
                ctx.strokeStyle = cactusGreenDark;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Blooming flower on left arm tip
                if (stemH > 60) {
                    this._drawCactusFlower(ctx, stemX - trunkWidth * 1.35 + armW1 / 2, armY1 - armH1 + armW1, flowerMagenta, flowerCenter);
                }
            }

            // Right Branching Saguaro Arm
            if (stemH > 68) {
                const armY2 = ground - stemH * 0.48;
                const armW2 = trunkWidth * 0.72;
                const armH2 = stemH * 0.3;

                ctx.fillStyle = trunkGrad;
                ctx.beginPath();
                ctx.roundRect(stemX, armY2, trunkWidth * 1.35, armW2, 4);
                ctx.roundRect(stemX + trunkWidth * 0.63, armY2 - armH2 + armW2, armW2, armH2, armW2 * 0.45);
                ctx.fill();
                ctx.strokeStyle = cactusGreenDark;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Blooming flower on right arm tip
                this._drawCactusFlower(ctx, stemX + trunkWidth * 0.63 + armW2 / 2, armY2 - armH2 + armW2, flowerMagenta, flowerCenter);
            }

            // Blooming Flower on Main Crown Tip!
            this._drawCactusFlower(ctx, stemX, ground - stemH, flowerMagenta, flowerCenter);

            ctx.restore();
        }
    }

    _drawCactusFlower(ctx, cx, cy, petalColor, centerColor) {
        ctx.save();
        ctx.fillStyle = petalColor;
        for (let a = 0; a < 6; a++) {
            const angle = (a * Math.PI * 2) / 6;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(angle) * 4.5, cy - 3 + Math.sin(angle) * 3, 3.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = centerColor;
        ctx.beginPath();
        ctx.arc(cx, cy - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawBird(ctx, x, ground, obstacle, nightFactor) {
        const ppm = MODEL.pixelsPerMetre;
        const y = ground - obstacle.y * ppm;
        const flap = Math.floor(this.elapsed * 7.5 + obstacle.x * 0.5) % 2;

        // Shadow on the ground below
        const shadowAlpha = Math.max(0.1, 0.32 - obstacle.y * 0.12);
        ctx.fillStyle = `rgba(0, 0, 0, ${shadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(x, ground + 2, 22, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.save();
        ctx.translate(x, y);

        // Vibrant Dragon/Pterodactyl Palette: Royal Violet body with Sunset Orange wing membranes
        const birdPurpleLight = '#c77dff';
        const birdPurpleMid = '#7b2cbf';
        const birdPurpleDark = '#3c096c';
        const wingOrangeLight = '#ffb703';
        const wingOrangeMid = '#fb8500';
        const beakGold = '#ffd166';
        const eyeRed = '#ff0054';

        // 1. BEAK & HEAD CREST
        // Crest pointing backward
        ctx.fillStyle = birdPurpleMid;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-24, -14);
        ctx.lineTo(-6, 2);
        ctx.closePath();
        ctx.fill();

        // Head & Sharp Golden Beak
        ctx.beginPath();
        ctx.roundRect(-4, -8, 20, 14, 5);
        ctx.fillStyle = birdPurpleMid;
        ctx.fill();

        ctx.fillStyle = beakGold;
        ctx.beginPath();
        ctx.moveTo(14, -8);
        ctx.lineTo(34, -2);
        ctx.lineTo(14, 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#b87a00';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Fierce Glowing Eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(10, -3, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = eyeRed;
        ctx.beginPath();
        ctx.arc(10.5, -3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(9.8, -4, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // 2. TORSO & TAIL
        ctx.beginPath();
        ctx.ellipse(-4, 0, 15, 9, 0.1, 0, Math.PI * 2);
        const bodyGrad = ctx.createLinearGradient(-19, -9, 11, 9);
        bodyGrad.addColorStop(0, birdPurpleLight);
        bodyGrad.addColorStop(1, birdPurpleDark);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Forked Tail
        ctx.fillStyle = birdPurpleMid;
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(-32, -6);
        ctx.lineTo(-26, 0);
        ctx.lineTo(-32, 6);
        ctx.closePath();
        ctx.fill();

        // 3. FLAPPING WINGS (2-Frame High-Energy Animation)
        if (flap === 0) {
            // WINGS ARCHED UPWARD
            // Wing membrane
            const wingGrad = ctx.createLinearGradient(0, 0, 8, -36);
            wingGrad.addColorStop(0, wingOrangeMid);
            wingGrad.addColorStop(1, wingOrangeLight);

            ctx.fillStyle = wingGrad;
            ctx.beginPath();
            ctx.moveTo(-6, -2);
            ctx.bezierCurveTo(-2, -22, 12, -38, 14, -38);
            ctx.bezierCurveTo(4, -28, -12, -18, -22, -12);
            ctx.lineTo(-14, -2);
            ctx.closePath();
            ctx.fill();

            // Wing bone & joint claw
            ctx.strokeStyle = birdPurpleDark;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-4, -2);
            ctx.lineTo(8, -26);
            ctx.lineTo(14, -38);
            ctx.stroke();

            // Wing claw
            ctx.fillStyle = beakGold;
            ctx.beginPath();
            ctx.arc(8, -26, 2.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // WINGS SWOOPED DOWNWARD
            const wingGrad = ctx.createLinearGradient(0, 0, 8, 36);
            wingGrad.addColorStop(0, wingOrangeMid);
            wingGrad.addColorStop(1, wingOrangeLight);

            ctx.fillStyle = wingGrad;
            ctx.beginPath();
            ctx.moveTo(-6, 2);
            ctx.bezierCurveTo(-2, 22, 12, 38, 14, 38);
            ctx.bezierCurveTo(4, 28, -12, 18, -22, 12);
            ctx.lineTo(-14, 2);
            ctx.closePath();
            ctx.fill();

            // Wing bone
            ctx.strokeStyle = birdPurpleDark;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-4, 2);
            ctx.lineTo(8, 26);
            ctx.lineTo(14, 38);
            ctx.stroke();

            // Wing claw
            ctx.fillStyle = beakGold;
            ctx.beginPath();
            ctx.arc(8, 26, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    render() {
        const ctx = this.ctx;
        const { scale, width } = this._layout();
        const nightFactor = this._nightFactor();

        ctx.save();
        ctx.scale(scale, scale);

        // 1. Dynamic Sky & Atmosphere
        this._drawSkyAndAtmosphere(ctx, width, MODEL.logicalHeight, nightFactor);

        // 2. Parallax Mountain & Dune Scenery
        this._drawParallaxScenery(ctx, width, nightFactor);

        // 3. Ground with Strata Layers, Grass & Dust Particles
        this._drawGround(ctx, width, nightFactor);

        // 4. Obstacles (Cacti with Flowers & Flying Pterodactyls)
        for (const obstacle of this.obstacles) {
            const x = this._worldX(obstacle.x);
            if (x > -120 && x < width + 120) {
                if (obstacle.type === 'bird') {
                    this._drawBird(ctx, x, MODEL.groundY, obstacle, nightFactor);
                } else {
                    this._drawCactus(ctx, x, MODEL.groundY, obstacle, nightFactor);
                }
            }
        }

        // 5. Expressive Vibrant Dinosaur
        this._drawDinosaur(ctx, MODEL.dinosaurX * MODEL.pixelsPerMetre, MODEL.groundY, nightFactor);

        // 6. Polished Arcade HUD Display
        const hudBg = nightFactor > 0.5
            ? 'rgba(18, 14, 34, 0.75)'
            : 'rgba(255, 255, 255, 0.88)';
        const hudBorder = nightFactor > 0.5
            ? 'rgba(140, 110, 200, 0.35)'
            : 'rgba(50, 168, 72, 0.35)';
        const textMain = nightFactor > 0.5 ? '#f2f4f8' : '#1e3321';
        const textGold = '#f59f00';

        // Score Pill (Top-Right)
        const currentScore = Math.floor(this.distance * 10).toString().padStart(5, '0');
        const bestScore = Math.floor(this.bestDistance * 10).toString().padStart(5, '0');

        ctx.fillStyle = hudBg;
        ctx.beginPath();
        ctx.roundRect(width - 240, 16, 222, 38, 12);
        ctx.fill();
        ctx.strokeStyle = hudBorder;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.textBaseline = 'middle';
        ctx.font = '900 16px Inter, "Courier New", monospace, sans-serif';
        ctx.fillStyle = textGold;
        ctx.textAlign = 'left';
        ctx.fillText(`HI ${bestScore}`, width - 226, 35);

        ctx.fillStyle = textMain;
        ctx.textAlign = 'right';
        ctx.fillText(`${currentScore}`, width - 28, 35);

        // Distance & Status Badge (Top-Left)
        ctx.fillStyle = hudBg;
        ctx.beginPath();
        ctx.roundRect(18, 16, 120, 38, 12);
        ctx.fill();
        ctx.strokeStyle = hudBorder;
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.font = '800 15px Inter, system-ui, sans-serif';
        ctx.fillStyle = textMain;
        ctx.fillText(`${this.distance.toFixed(1)} m`, 78, 35);

        ctx.restore();
    }

    _createPlayOverlay() {
        this.playOverlay = document.createElement('div');
        this.playOverlay.style.cssText = 'position:fixed;inset:0;z-index:8;display:grid;place-items:center;pointer-events:none;font-family:Inter,system-ui,sans-serif';
        this.playOverlay.innerHTML = `<div style="min-width:360px;padding:22px 26px;text-align:center;border:3px solid #237c3a;border-radius:20px;background:rgba(249,255,246,.96);box-shadow:0 16px 40px rgba(22,72,43,.25);pointer-events:auto">
            <div data-title style="font-size:32px;font-weight:950;color:#237b38"></div>
            <div data-result style="margin:8px 0 14px;font-size:14px;font-weight:750;color:#4e6b61"></div>
            <button data-play type="button" style="width:100%;padding:11px;border:2px solid #277632;border-radius:11px;background:linear-gradient(#67dd55,#30a837);color:#102712;font-weight:950;cursor:pointer"></button>
        </div>`;
        (this.canvas.parentElement || document.body).appendChild(this.playOverlay);
        this.playTitle = this.playOverlay.querySelector('[data-title]');
        this.playResult = this.playOverlay.querySelector('[data-result]');
        this.playButton = this.playOverlay.querySelector('[data-play]');
        this._stopPlayPointer = event => event.stopPropagation();
        for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
            this.playButton.addEventListener(type, this._stopPlayPointer);
        }
        this._onPlay = event => {
            event.stopPropagation();
            if (this.phase === 'gameover') this._resetRun();
            this._startRun();
        };
        this.playButton.addEventListener('click', this._onPlay);
    }

    _syncPlayOverlay() {
        if (!this.playOverlay) return;
        const visible = this.phase === 'ready' || this.phase === 'gameover';
        this.playOverlay.style.display = visible ? 'grid' : 'none';
        if (!visible) return;
        this.playTitle.textContent = this.phase === 'gameover' ? 'GAME OVER' : 'DINO RUNNER';
        this.playResult.textContent = this.phase === 'gameover'
            ? `${this.distance.toFixed(1)} m · best ${this.bestDistance.toFixed(1)} m`
            : 'Jump with Space, W, Up arrow or left click. Duck / fast-drop with Down arrow or S.';
        this.playButton.textContent = this.phase === 'gameover' ? 'PLAY AGAIN' : 'PLAY';
    }

    onPause() { if (this.playOverlay) this.playOverlay.style.visibility = 'hidden'; }
    onResume() { if (this.playOverlay) this.playOverlay.style.visibility = ''; }
    destroy() {
        this.playButton?.removeEventListener('click', this._onPlay);
        if (this.playButton) {
            for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
                this.playButton.removeEventListener(type, this._stopPlayPointer);
            }
        }
        this.playOverlay?.remove();
        this.playOverlay = null;
    }
    onResize() {}

    preparePauseSettings(settings) {
        validateDinoRunnerSettings(settings);
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        return { ...readDinoRunnerSettings(settings) };
    }

    static getSettingsSchema() {
        const d = DINO_RUNNER_DEFAULTS;
        return [
            { key: 'runningSpeed', label: 'Running speed [m/s]', type: 'range', min: 2, max: 20, step: 0.1, default: d.runningSpeed, group: 'Runner' },
            { key: 'gravity', label: 'Gravity [m/s²]', type: 'range', min: 5, max: 60, step: 0.5, default: d.gravity, group: 'Jump physics' },
            { key: 'jumpSpeed', label: 'Jump take-off speed [m/s]', type: 'range', min: 4, max: 25, step: 0.1, default: d.jumpSpeed, group: 'Jump physics' },
            { key: 'jumpBufferTime', label: 'Jump input buffer window [s]', type: 'range', min: 0, max: 0.4, step: 0.01, default: d.jumpBufferTime, group: 'Jump physics' },
            { key: 'meanObstacleGap', label: 'Mean obstacle gap [m]', type: 'range', min: 3, max: 25, step: 0.1, default: d.meanObstacleGap, group: 'Course' },
            { key: 'obstacleGapDeviation', label: 'Obstacle-gap standard deviation [m]', type: 'range', min: 0, max: 10, step: 0.05, default: d.obstacleGapDeviation, group: 'Course' },
        ];
    }

    static getControlsSchema() {
        return [
            {
                action: 'jump',
                label: 'Jump / start',
                defaultBindings: [
                    { type: 'keyboard', code: 'Space' },
                    { type: 'keyboard', code: 'ArrowUp' },
                    { type: 'keyboard', code: 'KeyW' },
                    { type: 'mouse', code: 0 },
                ],
            },
            {
                action: 'crouch',
                label: 'Crouch / duck / fast drop',
                defaultBindings: [
                    { type: 'keyboard', code: 'ArrowDown' },
                    { type: 'keyboard', code: 'KeyS' },
                    { type: 'mouse', code: 2 },
                ],
            },
        ];
    }
}
