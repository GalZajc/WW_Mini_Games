import { BaseGame } from '../../core/BaseGame.js';
import { requirePositiveNumber } from '../../core/SettingsValidation.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';

export const ROBOT_ISLAND_DEFAULTS = Object.freeze({
    islandLength: 5.0, // l [m], interval length in 1D and square side in 2D
    movementSpeed: 2.0, // [m/s], magnitude never becomes zero during a run
});

const MODEL = Object.freeze({
    fixedTimeStep: 1 / 240,
    maximumSubsteps: 18,
    logicalHeight: 720,
    robotRadius: 0.20,
    oneDWorldPixelsPerMetre: 110,
    twoDWorldPixelsPerMetre: 76,
    isometricVerticalFactor: 0.68,
});

const MODES = Object.freeze({
    '1d': {
        label: 'Robot Island 1D',
        description: 'The robot never stops. Reverse it with Left and Right before it walks into the water.',
        artKey: 'robot-island-1d',
        prefix: 'oneD',
    },
    '2d': {
        label: 'Robot Island 2D',
        description: 'A 2.5D square island with continuous motion. Steer with Up, Down, Left, and Right.',
        artKey: 'robot-island-2d',
        prefix: 'twoD',
    },
});

function makeSeed() {
    if (globalThis.crypto?.getRandomValues) {
        return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    }
    return Date.now() >>> 0;
}

export function validateRobotIslandParameters(settings = {}, label = 'Robot Island') {
    const source = { ...ROBOT_ISLAND_DEFAULTS, ...(settings || {}) };
    requirePositiveNumber(source.islandLength, `${label} island size l`);
    requirePositiveNumber(source.movementSpeed, `${label} robot speed`);
    return source;
}

export function readRobotIslandParameters(settings = {}, label) {
    const source = validateRobotIslandParameters(settings, label);
    return Object.freeze({
        islandLength: Number(source.islandLength),
        movementSpeed: Number(source.movementSpeed),
    });
}

export function isRobotOnIsland(mode, position, islandLength) {
    const limit = islandLength / 2;
    if (mode === '1d') return Math.abs(position.x) <= limit;
    return Math.abs(position.x) <= limit && Math.abs(position.y) <= limit;
}

export default class RobotIslandGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.mode = null;
        this.phase = 'mode-select';
        this.bestTime = 0;
        this.accumulator = 0;
        this.animTime = 0;
        this.splashParticles = [];
        this.dustParticles = [];
        if (this._modeChosenForSession && MODES[this.settings.mode]) {
            this._startMode(this.settings.mode);
        } else {
            this._showModeSelector();
        }
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        const selectedMode = MODES[this.settings.mode] ? this.settings.mode : '2d';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Robot Island',
            prompt: 'Choose dimensions',
            selectedMode,
            modes: Object.entries(MODES).map(([key, info]) => ({
                key,
                title: info.label,
                description: info.description,
                artKey: info.artKey,
            })),
        });
        document.body.appendChild(this.modeSelector);
        this._selectorClick = bindModeGallery(this.modeSelector, {
            onMode: mode => {
                this._modeChosenForSession = true;
                this._startMode(mode);
            },
            onBack: () => this.endGame(),
        });
    }

    _activeSettings(settings = this.settings, mode = this.mode || settings.mode || '1d') {
        const prefix = MODES[mode].prefix;
        return {
            islandLength: settings[`${prefix}_islandLength`] ?? ROBOT_ISLAND_DEFAULTS.islandLength,
            movementSpeed: settings[`${prefix}_movementSpeed`] ?? ROBOT_ISLAND_DEFAULTS.movementSpeed,
        };
    }

    _startMode(mode) {
        if (!MODES[mode]) return false;
        const parameters = readRobotIslandParameters(this._activeSettings(this.settings, mode), MODES[mode].label);
        this.modeSelector?.remove();
        this.modeSelector = null;
        this.mode = mode;
        this.settings.mode = mode;
        this.parameters = parameters;
        this.app.currentSettings = { ...this.settings };
        this.app.settingsManager.save('robot-island', this.settings).catch(() => {});
        this._loadBest();
        this._resetRun();
        return true;
    }

    returnToModeSelector() {
        this._modeChosenForSession = false;
        this.mode = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    async _loadBest() {
        const mode = this.mode;
        try {
            const record = await this.app?.records?.getBest(
                'robot-island', this.getRecordSettings({ ...this.settings, mode }), 'seconds',
            );
            if (this.mode !== mode) return;
            const value = Number(record?.results?.seconds);
            this.bestTime = Number.isFinite(value) ? value : 0;
        } catch (error) {
            console.warn('Could not load Robot Island record:', error);
        }
    }

    _resetRun(seed = makeSeed()) {
        this.seed = seed >>> 0;
        this.phase = 'ready';
        this.elapsed = 0;
        this.position = { x: 0, y: 0 };
        this.direction = this.mode === '1d'
            ? { x: 1, y: 0 }
            : { x: 0, y: -1 };
        this.accumulator = 0;
        this.scoreSubmitted = false;
        this.walkClock = 0;
        this.splashParticles = [];
        this.dustParticles = [];
    }

    _axisInput() {
        const left = Number(Boolean(this.input.isActionDown?.('left')));
        const right = Number(Boolean(this.input.isActionDown?.('right')));
        const up = Number(Boolean(this.input.isActionDown?.('up')));
        const down = Number(Boolean(this.input.isActionDown?.('down')));
        return {
            x: right - left,
            y: this.mode === '2d' ? (down - up) : 0,
        };
    }

    _hasSteeringJustStarted() {
        return ['left', 'right', ...(this.mode === '2d' ? ['up', 'down'] : [])]
            .some(action => this.input.isActionJustDown?.(action));
    }

    _applySteering() {
        const axis = this._axisInput();
        if (this.mode === '1d') {
            if (axis.x) this.direction = { x: Math.sign(axis.x), y: 0 };
            return;
        }
        const length = Math.hypot(axis.x, axis.y);
        if (length > 0) this.direction = { x: axis.x / length, y: axis.y / length };
    }

    _spawnDust(x, y) {
        if (this.dustParticles.length > 25) return;
        this.dustParticles.push({
            x,
            y,
            vx: (Math.random() - 0.5) * 14 - this.direction.x * 12,
            vy: (Math.random() - 0.5) * 8 - this.direction.y * 8,
            life: 1.0,
            radius: 3 + Math.random() * 3,
        });
    }

    _spawnSplash(x, y) {
        for (let i = 0; i < 28; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 35 + Math.random() * 85;
            this.splashParticles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed * 0.6 - 45,
                radius: 2.5 + Math.random() * 3.5,
                life: 1.0,
            });
        }
    }

    _step(step) {
        this._applySteering();
        this.position.x += this.direction.x * this.parameters.movementSpeed * step;
        this.position.y += this.direction.y * this.parameters.movementSpeed * step;
        this.elapsed += step;
        this.walkClock += this.parameters.movementSpeed * step;

        if (Math.random() < 0.25) {
            const { width } = this._layout();
            const centreX = width / 2;
            const centreY = this.mode === '1d' ? 476 : 370;
            const pos = this.mode === '1d'
                ? { x: centreX + this.position.x * MODEL.oneDWorldPixelsPerMetre, y: centreY }
                : this._iso(this.position, centreX, centreY);
            this._spawnDust(pos.x, pos.y);
        }

        if (!isRobotOnIsland(this.mode, this.position, this.parameters.islandLength)) {
            this._finishRun();
        }
    }

    _finishRun() {
        if (this.phase === 'gameover') return;
        this.phase = 'gameover';
        this.bestTime = Math.max(this.bestTime, this.elapsed);
        const { width } = this._layout();
        const centreX = width / 2;
        const centreY = this.mode === '1d' ? 480 : 370;
        const splashPos = this.mode === '1d'
            ? { x: centreX + this.position.x * MODEL.oneDWorldPixelsPerMetre, y: centreY + 25 }
            : this._iso(this.position, centreX, centreY);
        this._spawnSplash(splashPos.x, splashPos.y + 15);

        if (!this.scoreSubmitted) {
            this.submitScore({
                seconds: Number(this.elapsed.toFixed(3)),
                seed: this.seed,
                mode: this.mode,
            });
            this.scoreSubmitted = true;
        }
        this.audio.playPlasticImpact?.(0.32);
    }

    update(dt) {
        if (this.phase === 'mode-select') return;
        const delta = Math.min(0.05, Number(dt) || 0);
        this.animTime += delta;

        for (let i = this.dustParticles.length - 1; i >= 0; i--) {
            const p = this.dustParticles[i];
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.life -= delta * 2.8;
            if (p.life <= 0) this.dustParticles.splice(i, 1);
        }
        for (let i = this.splashParticles.length - 1; i >= 0; i--) {
            const p = this.splashParticles[i];
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.vy += 120 * delta;
            p.life -= delta * 1.6;
            if (p.life <= 0) this.splashParticles.splice(i, 1);
        }

        const steeringPressed = this._hasSteeringJustStarted();
        if (this.phase === 'ready') {
            if (steeringPressed) {
                this.phase = 'running';
                this._applySteering();
                this.audio.playClick?.();
            }
            return;
        }
        if (this.phase === 'gameover') {
            if (steeringPressed) {
                this._resetRun();
                this.phase = 'running';
                this._applySteering();
            }
            return;
        }
        this.accumulator = Math.min(
            this.accumulator + delta,
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

    _iso(point, centreX, centreY) {
        const ppm = MODEL.twoDWorldPixelsPerMetre;
        return {
            x: centreX + point.x * ppm,
            y: centreY + point.y * ppm * MODEL.isometricVerticalFactor,
        };
    }

    _isNearEdge() {
        const limit = this.parameters.islandLength / 2;
        if (this.mode === '1d') {
            return Math.abs(this.position.x) > limit * 0.72;
        }
        return Math.max(Math.abs(this.position.x), Math.abs(this.position.y)) > limit * 0.72;
    }

    _drawSkyAndOcean(ctx, width, horizonY = 380) {
        // Vibrant sky gradient with sun rays
        const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
        sky.addColorStop(0, '#42b6ee');
        sky.addColorStop(0.65, '#9ee1f9');
        sky.addColorStop(1, '#e5f8ff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, horizonY);

        // Sun with warm glow halo
        const sunX = width - 110;
        const sunY = 75;
        const sunGlow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 70);
        sunGlow.addColorStop(0, 'rgba(255, 245, 160, 0.95)');
        sunGlow.addColorStop(0.4, 'rgba(255, 230, 110, 0.45)');
        sunGlow.addColorStop(1, 'rgba(255, 230, 110, 0)');
        ctx.fillStyle = sunGlow;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#fff9a6';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 28, 0, Math.PI * 2);
        ctx.fill();

        // Stylized fluffy clouds
        ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
        const cloudOffsets = [
            { x: 120 + ((this.animTime * 8) % (width + 200)) - 100, y: 85, scale: 1 },
            { x: 450 + ((this.animTime * 5) % (width + 200)) - 100, y: 120, scale: 0.75 },
            { x: 800 + ((this.animTime * 6) % (width + 200)) - 100, y: 65, scale: 0.85 },
        ];
        for (const c of cloudOffsets) {
            ctx.save();
            ctx.translate(c.x, c.y);
            ctx.scale(c.scale, c.scale);
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.arc(18, -8, 20, 0, Math.PI * 2);
            ctx.arc(38, 0, 22, 0, Math.PI * 2);
            ctx.arc(20, 8, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Deep multi-layered tropical ocean
        const ocean = ctx.createLinearGradient(0, horizonY, 0, MODEL.logicalHeight);
        ocean.addColorStop(0, '#1575af');
        ocean.addColorStop(0.35, '#1286cb');
        ocean.addColorStop(0.75, '#17a1e3');
        ocean.addColorStop(1, '#0e5f91');
        ctx.fillStyle = ocean;
        ctx.fillRect(0, horizonY, width, MODEL.logicalHeight - horizonY);

        // Animated layered wave ripples
        ctx.lineWidth = 2.5;
        const waveRows = [
            { y: horizonY + 25, speed: 1.2, amp: 4, width: 90, color: 'rgba(255,255,255,0.22)' },
            { y: horizonY + 70, speed: 1.6, amp: 6, width: 120, color: 'rgba(255,255,255,0.28)' },
            { y: horizonY + 130, speed: 1.0, amp: 7, width: 150, color: 'rgba(255,255,255,0.25)' },
            { y: horizonY + 210, speed: 1.4, amp: 8, width: 180, color: 'rgba(255,255,255,0.22)' },
            { y: horizonY + 290, speed: 0.9, amp: 9, width: 210, color: 'rgba(255,255,255,0.18)' },
        ];
        for (const w of waveRows) {
            ctx.strokeStyle = w.color;
            ctx.beginPath();
            const phase = this.animTime * w.speed;
            for (let x = -60; x < width + 60; x += w.width) {
                const waveY = w.y + Math.sin(phase + x * 0.03) * w.amp;
                ctx.moveTo(x, waveY);
                ctx.quadraticCurveTo(x + w.width * 0.5, waveY - w.amp * 1.5, x + w.width, waveY);
            }
            ctx.stroke();
        }
    }

    _drawPalmTree(ctx, x, y, scale = 1, sway = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        // Shadow under tree
        ctx.fillStyle = 'rgba(15, 55, 30, 0.28)';
        ctx.beginPath();
        ctx.ellipse(4, 0, 16, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Curved trunk
        ctx.strokeStyle = '#6d4826';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(8 + sway * 4, -25, 14 + sway * 10, -52);
        ctx.stroke();

        ctx.strokeStyle = '#8b5e34';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(8 + sway * 4, -25, 14 + sway * 10, -52);
        ctx.stroke();

        // Palm fronds (leaves)
        const topX = 14 + sway * 10;
        const topY = -52;
        const leafAngles = [
            -Math.PI * 0.85, -Math.PI * 0.55, -Math.PI * 0.25,
            Math.PI * 0.05, Math.PI * 0.35, -Math.PI * 0.05,
        ];
        for (const angle of leafAngles) {
            ctx.save();
            ctx.translate(topX, topY);
            ctx.rotate(angle + sway * 0.15);
            ctx.fillStyle = '#2ea637';
            ctx.strokeStyle = '#1b6b23';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(24, -10, 42, 6);
            ctx.quadraticCurveTo(20, 8, 0, 0);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // Coconuts
        ctx.fillStyle = '#4e3017';
        ctx.beginPath();
        ctx.arc(topX - 3, topY + 2, 4, 0, Math.PI * 2);
        ctx.arc(topX + 4, topY + 3, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawWarningPost(ctx, x, y, scale = 1, isLeft = true) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        // Shadow
        ctx.fillStyle = 'rgba(15, 55, 30, 0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Wooden pole
        ctx.fillStyle = '#7a4f2b';
        ctx.fillRect(-3, -28, 6, 28);
        ctx.fillStyle = '#a06a3d';
        ctx.fillRect(-2, -28, 3, 28);

        // Sign board with hazard stripes
        ctx.save();
        ctx.translate(0, -32);
        ctx.fillStyle = '#ffcc00';
        ctx.strokeStyle = '#3d2510';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-14, -10, 28, 20, 4);
        ctx.fill();
        ctx.stroke();

        // Exclamation / Danger mark
        ctx.fillStyle = '#d63027';
        ctx.font = '900 13px Inter,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 1);
        ctx.restore();

        ctx.restore();
    }

    _drawRobot(ctx, x, y, heading, size = 1) {
        const nearEdge = this._isNearEdge();
        const isGameOver = this.phase === 'gameover';
        const bob = Math.abs(Math.sin(this.walkClock * 7.5)) * 4;
        const stride = Math.sin(this.walkClock * 7.5);
        const headingLength = Math.max(1e-6, Math.hypot(heading.x, heading.y));
        const facing = { x: heading.x / headingLength, y: heading.y / headingLength };

        ctx.save();
        ctx.translate(x, y - bob);
        ctx.scale(size, size);

        // Soft drop shadow on ground
        ctx.fillStyle = 'rgba(12, 42, 32, 0.32)';
        ctx.beginPath();
        ctx.ellipse(0, 10 + bob, 22, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs and Footpads
        ctx.strokeStyle = '#1e333d';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';

        // Left leg
        ctx.beginPath();
        ctx.moveTo(-9, 6);
        ctx.lineTo(-12 - stride * 7, 18);
        ctx.stroke();
        ctx.fillStyle = '#2f4b57';
        ctx.beginPath();
        ctx.roundRect(-20 - stride * 7, 15, 14, 7, 3);
        ctx.fill();

        // Right leg
        ctx.beginPath();
        ctx.moveTo(9, 6);
        ctx.lineTo(12 + stride * 7, 18);
        ctx.stroke();
        ctx.fillStyle = '#2f4b57';
        ctx.beginPath();
        ctx.roundRect(6 + stride * 7, 15, 14, 7, 3);
        ctx.fill();

        // Robot Body (rounded torso)
        const torsoGrad = ctx.createLinearGradient(-16, -18, 16, 12);
        torsoGrad.addColorStop(0, '#f0f6f8');
        torsoGrad.addColorStop(0.6, '#d6e5eb');
        torsoGrad.addColorStop(1, '#a8c1cc');
        ctx.fillStyle = torsoGrad;
        ctx.strokeStyle = '#1a2e38';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.roundRect(-16, -16, 32, 24, 7);
        ctx.fill();
        ctx.stroke();

        // Torso gauge / power indicator
        ctx.fillStyle = nearEdge ? '#ff4d3d' : '#2bd96b';
        ctx.beginPath();
        ctx.roundRect(-10, -10, 20, 7, 3);
        ctx.fill();

        // Arms swinging
        ctx.strokeStyle = '#1e333d';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-17, -8);
        ctx.lineTo(-24 + stride * 5, 2);
        ctx.moveTo(17, -8);
        ctx.lineTo(24 - stride * 5, 2);
        ctx.stroke();

        // Metallic hands
        ctx.fillStyle = '#ff7a36';
        ctx.beginPath();
        ctx.arc(-24 + stride * 5, 2, 4, 0, Math.PI * 2);
        ctx.arc(24 - stride * 5, 2, 4, 0, Math.PI * 2);
        ctx.fill();

        // Robot Head (dome/capsule)
        const headGrad = ctx.createLinearGradient(-18, -48, 18, -16);
        headGrad.addColorStop(0, '#ffffff');
        headGrad.addColorStop(0.5, '#e1ecf0');
        headGrad.addColorStop(1, '#b6cbd6');
        ctx.fillStyle = headGrad;
        ctx.strokeStyle = '#1a2e38';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.roundRect(-19, -46, 38, 30, 10);
        ctx.fill();
        ctx.stroke();

        // Visor / Screen Face
        const visorGrad = ctx.createLinearGradient(-13, -42, 13, -22);
        visorGrad.addColorStop(0, '#102533');
        visorGrad.addColorStop(1, '#1b3b4f');
        ctx.fillStyle = visorGrad;
        ctx.beginPath();
        ctx.roundRect(-14, -40, 28, 18, 6);
        ctx.fill();

        // Expressive Eyes
        const eyeOffset = facing.x * 2.5;
        if (isGameOver) {
            // Stunned X eyes
            ctx.strokeStyle = '#ff5747';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-8 + eyeOffset, -35); ctx.lineTo(-4 + eyeOffset, -29);
            ctx.moveTo(-4 + eyeOffset, -35); ctx.lineTo(-8 + eyeOffset, -29);
            ctx.moveTo(4 + eyeOffset, -35); ctx.lineTo(8 + eyeOffset, -29);
            ctx.moveTo(8 + eyeOffset, -35); ctx.lineTo(4 + eyeOffset, -29);
            ctx.stroke();
        } else if (nearEdge) {
            // Wide alert yellow-red eyes
            ctx.fillStyle = '#ffea4d';
            ctx.shadowColor = '#ff5722';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(-6 + eyeOffset, -31, 4.5, 0, Math.PI * 2);
            ctx.arc(6 + eyeOffset, -31, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#221100';
            ctx.beginPath();
            ctx.arc(-6 + eyeOffset, -31, 2, 0, Math.PI * 2);
            ctx.arc(6 + eyeOffset, -31, 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // Happy glowing cyan eyes
            ctx.fillStyle = '#52eeff';
            ctx.shadowColor = '#00c3ff';
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(-6 + eyeOffset, -31, 3.5, 0, Math.PI * 2);
            ctx.arc(6 + eyeOffset, -31, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-7 + eyeOffset, -32.5, 1.2, 0, Math.PI * 2);
            ctx.arc(5 + eyeOffset, -32.5, 1.2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Visor reflection shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.roundRect(-12, -39, 14, 3.5, 1.5);
        ctx.fill();

        // Top Antenna
        const antennaWiggle = Math.sin(this.walkClock * 15) * 3;
        ctx.strokeStyle = '#1a2e38';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -46);
        ctx.lineTo(antennaWiggle * 0.8, -58);
        ctx.stroke();

        // Glowing Antenna Beacon Orb
        const beaconPulse = Math.sin(this.animTime * (nearEdge ? 16 : 6)) * 0.3 + 0.7;
        const beaconColor = nearEdge ? `rgba(255, 45, 45, ${beaconPulse})` : `rgba(255, 120, 30, ${beaconPulse})`;
        ctx.fillStyle = beaconColor;
        ctx.shadowColor = nearEdge ? '#ff1e1e' : '#ff9800';
        ctx.shadowBlur = nearEdge ? 14 : 7;
        ctx.beginPath();
        ctx.arc(antennaWiggle * 0.8, -60, nearEdge ? 5.5 : 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    _renderOneDimensional(ctx, width) {
        const horizonY = 370;
        this._drawSkyAndOcean(ctx, width, horizonY);

        const centreX = width / 2;
        const islandY = 470;
        const ppm = MODEL.oneDWorldPixelsPerMetre;
        const islandWidth = this.parameters.islandLength * ppm;
        const leftX = centreX - islandWidth / 2;
        const rightX = centreX + islandWidth / 2;

        // Animated ocean foam / ripples at the island waterline
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        const foamWave = Math.sin(this.animTime * 3) * 3;
        ctx.beginPath();
        ctx.ellipse(leftX - 8, islandY + 68 + foamWave, 34, 12, 0, 0, Math.PI * 2);
        ctx.ellipse(rightX + 8, islandY + 68 + foamWave, 34, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // 3D Earth Cliff Base under the strip
        const cliffGrad = ctx.createLinearGradient(0, islandY, 0, islandY + 80);
        cliffGrad.addColorStop(0, '#9e6d42');
        cliffGrad.addColorStop(0.4, '#7a4e2a');
        cliffGrad.addColorStop(1, '#4e2d14');
        ctx.fillStyle = cliffGrad;
        ctx.beginPath();
        ctx.moveTo(leftX, islandY);
        ctx.lineTo(rightX, islandY);
        ctx.lineTo(rightX - islandWidth * 0.05, islandY + 75);
        ctx.lineTo(leftX + islandWidth * 0.05, islandY + 75);
        ctx.closePath();
        ctx.fill();

        // Sandy beach ends (left and right shores)
        const sandGrad = ctx.createLinearGradient(0, islandY - 15, 0, islandY + 15);
        sandGrad.addColorStop(0, '#f8e09e');
        sandGrad.addColorStop(1, '#d8ae62');
        ctx.fillStyle = sandGrad;
        ctx.beginPath();
        ctx.roundRect(leftX - 16, islandY - 18, islandWidth + 32, 36, 18);
        ctx.fill();

        // Lush Green Grass Top
        const grassGrad = ctx.createLinearGradient(0, islandY - 22, 0, islandY + 10);
        grassGrad.addColorStop(0, '#5ee64e');
        grassGrad.addColorStop(0.65, '#38c431');
        grassGrad.addColorStop(1, '#238a20');
        ctx.fillStyle = grassGrad;
        ctx.strokeStyle = '#185d16';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(leftX, islandY - 22, islandWidth, 34, 16);
        ctx.fill();
        ctx.stroke();

        // Grass blade fringe highlights along the surface
        ctx.fillStyle = '#89f578';
        for (let gx = leftX + 15; gx < rightX - 15; gx += 28) {
            ctx.beginPath();
            ctx.moveTo(gx, islandY - 20);
            ctx.lineTo(gx + 3, islandY - 26);
            ctx.lineTo(gx + 6, islandY - 20);
            ctx.fill();
        }

        // Decorative palm trees
        const sway = Math.sin(this.animTime * 2) * 0.2;
        this._drawPalmTree(ctx, leftX + 35, islandY - 18, 0.75, sway);
        this._drawPalmTree(ctx, rightX - 35, islandY - 18, 0.75, -sway);

        // Warning Hazard Posts on the edges
        this._drawWarningPost(ctx, leftX + 8, islandY - 14, 0.85, true);
        this._drawWarningPost(ctx, rightX - 8, islandY - 14, 0.85, false);

        // Dust particles
        for (const p of this.dustParticles) {
            ctx.fillStyle = `rgba(230, 245, 230, ${p.life * 0.5})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Robot
        const robotX = centreX + this.position.x * ppm;
        const robotY = islandY - 16;
        this._drawRobot(ctx, robotX, robotY, this.direction, 1.05);

        // Water splash particles
        for (const p of this.splashParticles) {
            ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.9})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _renderTwoDimensional(ctx, width) {
        const horizonY = 240;
        this._drawSkyAndOcean(ctx, width, horizonY);

        const centreX = width / 2;
        const centreY = 440;
        const ppm = MODEL.twoDWorldPixelsPerMetre;
        const half = this.parameters.islandLength / 2;
        const vert = MODEL.isometricVerticalFactor;
        const islandW = this.parameters.islandLength * ppm;
        const islandH = this.parameters.islandLength * ppm * vert;
        const cliffDepth = 55;

        const leftX = centreX - half * ppm;
        const rightX = centreX + half * ppm;
        const topY = centreY - half * ppm * vert;
        const bottomY = centreY + half * ppm * vert;

        // Island Drop Shadow on water
        ctx.fillStyle = 'rgba(8, 48, 75, 0.38)';
        ctx.beginPath();
        ctx.roundRect(leftX - 18, topY + cliffDepth * 0.4, islandW + 36, islandH + cliffDepth * 0.7, 30);
        ctx.fill();

        // Water foam ring around the island base
        const foamPulse = Math.sin(this.animTime * 2.5) * 4;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.roundRect(leftX - 22 - foamPulse, topY + cliffDepth - 10, islandW + 44 + foamPulse * 2, islandH + 20 + foamPulse, 36);
        ctx.fill();

        // 3D Cliff Extrusion (front and side rock walls)
        const cliffGrad = ctx.createLinearGradient(0, bottomY, 0, bottomY + cliffDepth);
        cliffGrad.addColorStop(0, '#94663b');
        cliffGrad.addColorStop(0.35, '#734825');
        cliffGrad.addColorStop(1, '#42240f');
        ctx.fillStyle = cliffGrad;
        ctx.strokeStyle = '#291406';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(leftX - 12, bottomY);
        ctx.lineTo(rightX + 12, bottomY);
        ctx.lineTo(rightX + 12, bottomY + cliffDepth);
        ctx.lineTo(leftX - 12, bottomY + cliffDepth);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Rock strata details on the cliff
        ctx.strokeStyle = '#5a3518';
        ctx.lineWidth = 2.5;
        for (let sy = bottomY + 14; sy < bottomY + cliffDepth - 6; sy += 16) {
            ctx.beginPath();
            ctx.moveTo(leftX - 6, sy);
            for (let sx = leftX; sx < rightX; sx += 40) {
                ctx.lineTo(sx + 20, sy + ((sx % 80 === 0) ? 3 : -2));
            }
            ctx.lineTo(rightX + 6, sy);
            ctx.stroke();
        }

        // Golden Sand Perimeter Beach
        const sandGrad = ctx.createLinearGradient(0, topY - 14, 0, bottomY + 14);
        sandGrad.addColorStop(0, '#f9e39a');
        sandGrad.addColorStop(1, '#dbad59');
        ctx.fillStyle = sandGrad;
        ctx.beginPath();
        ctx.roundRect(leftX - 14, topY - 14, islandW + 28, islandH + 28, 26);
        ctx.fill();

        // Lush Green Grass Plateau (Top Surface)
        const grassGrad = ctx.createLinearGradient(0, topY, 0, bottomY);
        grassGrad.addColorStop(0, '#5ee64e');
        grassGrad.addColorStop(0.5, '#38c731');
        grassGrad.addColorStop(1, '#239620');
        ctx.fillStyle = grassGrad;
        ctx.strokeStyle = '#185d16';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(leftX, topY, islandW, islandH, 20);
        ctx.fill();
        ctx.stroke();

        // Subtle decorative grass texture grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2;
        const gridStep = ppm;
        for (let gx = leftX + gridStep; gx < rightX; gx += gridStep) {
            ctx.beginPath();
            ctx.moveTo(gx, topY + 4);
            ctx.lineTo(gx, bottomY - 4);
            ctx.stroke();
        }
        for (let gy = topY + gridStep * vert; gy < bottomY; gy += gridStep * vert) {
            ctx.beginPath();
            ctx.moveTo(leftX + 4, gy);
            ctx.lineTo(rightX - 4, gy);
            ctx.stroke();
        }

        // Decorative palm trees at back corners
        const sway = Math.sin(this.animTime * 2) * 0.2;
        this._drawPalmTree(ctx, leftX + 20, topY + 22, 0.72, sway);
        this._drawPalmTree(ctx, rightX - 20, topY + 22, 0.72, -sway);

        // Warning Hazard Posts at front corners
        this._drawWarningPost(ctx, leftX + 8, bottomY - 4, 0.8, true);
        this._drawWarningPost(ctx, rightX - 8, bottomY - 4, 0.8, false);

        // Dust particles
        for (const p of this.dustParticles) {
            ctx.fillStyle = `rgba(230, 245, 230, ${p.life * 0.5})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw Robot on the 2D surface
        const robot = this._iso(this.position, centreX, centreY);
        this._drawRobot(ctx, robot.x, robot.y, this.direction, 0.96);

        // Water splash particles
        for (const p of this.splashParticles) {
            ctx.fillStyle = `rgba(255, 255, 255, ${p.life * 0.9})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    render() {
        if (this.phase === 'mode-select') return;
        const ctx = this.ctx;
        const { scale, width } = this._layout();
        ctx.save();
        ctx.scale(scale, scale);

        if (this.mode === '1d') this._renderOneDimensional(ctx, width);
        else this._renderTwoDimensional(ctx, width);

        // High-contrast Glassmorphic HUD Badges
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';

        // Timer badge
        ctx.fillStyle = 'rgba(16, 52, 38, 0.82)';
        ctx.beginPath();
        ctx.roundRect(16, 16, 175, 42, 12);
        ctx.fill();
        ctx.strokeStyle = '#39a84d';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '950 22px Inter,system-ui,sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`⏱ ${this.elapsed.toFixed(2)} s`, 28, 25);

        // Best badge
        ctx.fillStyle = 'rgba(16, 52, 38, 0.72)';
        ctx.beginPath();
        ctx.roundRect(16, 64, 150, 28, 9);
        ctx.fill();

        ctx.font = '850 12px Inter,system-ui,sans-serif';
        ctx.fillStyle = '#b8f5c8';
        ctx.fillText(`BEST: ${this.bestTime.toFixed(2)} s`, 26, 71);

        // Ready & Game Over Modal Dialogs
        if (this.phase !== 'running') {
            const isOver = this.phase === 'gameover';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
            ctx.strokeStyle = isOver ? '#d94138' : '#27943d';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.roundRect(width / 2 - 250, 120, 500, 158, 22);
            ctx.fill();
            ctx.stroke();

            ctx.textAlign = 'center';
            ctx.fillStyle = isOver ? '#c4342d' : '#1e7e34';
            ctx.font = '950 32px Inter,system-ui,sans-serif';
            ctx.fillText(isOver ? '💦 SPLASH!' : MODES[this.mode].label.toUpperCase(), width / 2, 152);

            ctx.font = '800 15px Inter,system-ui,sans-serif';
            ctx.fillStyle = '#2d4d42';
            ctx.fillText(
                isOver
                    ? `Survived for ${this.elapsed.toFixed(2)} s · Press any arrow to try again!`
                    : (this.mode === '1d'
                        ? 'Press Left or Right. The robot never stops moving!'
                        : 'Press Up, Down, Left, or Right to steer! Keep it on the island!'),
                width / 2,
                210,
            );
        }
        ctx.restore();
    }

    onPause() {}
    onResume() {}
    onResize() {}

    destroy() {
        this.modeSelector?.remove();
        this.modeSelector = null;
    }

    preparePauseSettings(settings) {
        const mode = settings?.mode ?? this.mode ?? '1d';
        if (!MODES[mode]) throw new Error(`Robot Island mode is invalid: ${mode}.`);
        validateRobotIslandParameters(this._activeSettings(settings, mode), MODES[mode].label);
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        const mode = settings?.mode ?? this.mode ?? '1d';
        return {
            mode,
            ...readRobotIslandParameters(this._activeSettings(settings, mode), MODES[mode].label),
        };
    }

    static getSettingsSchema() {
        const d = ROBOT_ISLAND_DEFAULTS;
        const fields = (mode, prefix, label) => [
            { key: `${prefix}_islandLength`, label: 'Island size l [m]', type: 'range', min: Number.MIN_VALUE, step: 0.1, default: d.islandLength, group: `${label} · Geometry`, modes: [mode] },
            { key: `${prefix}_movementSpeed`, label: 'Robot speed [m/s]', type: 'range', min: Number.MIN_VALUE, step: 0.05, default: d.movementSpeed, group: `${label} · Motion`, modes: [mode] },
        ];
        return [
            { key: 'mode', label: 'Mode', type: 'hidden', default: '2d' },
            ...fields('1d', 'oneD', MODES['1d'].label),
            ...fields('2d', 'twoD', MODES['2d'].label),
        ];
    }

    static getControlsSchema() {
        return [
            { action: 'left', label: 'Steer left', defaultBindings: [{ type: 'keyboard', code: 'ArrowLeft' }] },
            { action: 'right', label: 'Steer right', defaultBindings: [{ type: 'keyboard', code: 'ArrowRight' }] },
            { action: 'up', label: 'Steer up (2D)', defaultBindings: [{ type: 'keyboard', code: 'ArrowUp' }] },
            { action: 'down', label: 'Steer down (2D)', defaultBindings: [{ type: 'keyboard', code: 'ArrowDown' }] },
        ];
    }
}
