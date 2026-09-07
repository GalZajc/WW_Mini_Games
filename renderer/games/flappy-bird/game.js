import { BaseGame } from '../../core/BaseGame.js';
import { requireFiniteNumber, requirePositiveNumber } from '../../core/SettingsValidation.js';

// Gameplay always runs in this fixed logical space. Window resizing only
// changes the render scale, so it cannot alter pipe openings or their heights.
const FLAPPY_MODEL = Object.freeze({
    worldHeight: 720,
    gravity: 1400,
    jumpVelocity: -420,
    pipeSpeed: 220,
    pipeWidth: 56,
    birdRadius: 14,
    spawnInterval: 1.6,
    pipeMargin: 80,
});

/**
 * Flappy Bird — Tap to flap, avoid the pipes.
 *
 * Settings:
 *   gravity  — non-negative gravity multiplier (default 1.0)
 *   gap      — positive gap between top and bottom pipe in px; the logical
 *              world leaves an 80 px margin at both ends (default 180)
 */
export default class FlappyBirdGame extends BaseGame {

    init() {
        const s = this.settings;
        this.gravityMultiplier = requireFiniteNumber(s.gravity ?? 1.0, 'Gravity multiplier', { minimum: 0 });
        this.pipeGap = requirePositiveNumber(s.gap ?? 180, 'Pipe gap', {
            maximum: FLAPPY_MODEL.worldHeight - 2 * FLAPPY_MODEL.pipeMargin,
        });

        this.GRAVITY = FLAPPY_MODEL.gravity * this.gravityMultiplier;
        this.JUMP_VEL = FLAPPY_MODEL.jumpVelocity;
        this.PIPE_SPEED = FLAPPY_MODEL.pipeSpeed;
        this.PIPE_WIDTH = FLAPPY_MODEL.pipeWidth;
        this.BIRD_R = FLAPPY_MODEL.birdRadius;
        this.SPAWN_INTERVAL = FLAPPY_MODEL.spawnInterval;

        // State
        this.birdX   = 0;
        this.birdY   = 0;
        this.birdVel = 0;
        this.birdRot = 0;
        this.pipes   = [];
        this.score   = 0;
        this.highScore = 0;
        this.spawnT  = 0;

        // A record belongs to this exact settings snapshot. The request token
        // prevents a slower lookup from an earlier restart overwriting it.
        this._highScoreRequest = (this._highScoreRequest || 0) + 1;
        this._loadHighScore(this._highScoreRequest);

        this.phase = 'ready'; // 'ready' | 'playing' | 'dead'

        this._resetBird();
    }

    preparePauseSettings(settings) {
        requireFiniteNumber(settings.gravity ?? 1.0, 'Gravity multiplier', { minimum: 0 });
        requirePositiveNumber(settings.gap ?? 180, 'Pipe gap', {
            maximum: FLAPPY_MODEL.worldHeight - 2 * FLAPPY_MODEL.pipeMargin,
        });
        return settings;
    }

    _resetBird() {
        this.birdX = this._logicalWidth() * 0.25;
        this.birdY = FLAPPY_MODEL.worldHeight * 0.45;
        this.birdVel = 0;
        this.birdRot = 0;
    }

    _renderScale() {
        return this.h / FLAPPY_MODEL.worldHeight;
    }

    _logicalWidth() {
        return this.w / Math.max(1e-6, this._renderScale());
    }

    _loadHighScore(requestId) {
        if (!this.app?.records) return;

        this.app.records.getBest('flappy-bird', { ...this.settings }, 'score')
            .then(record => {
                if (requestId !== this._highScoreRequest) return;
                const storedHighScore = Number(record?.results?.score);
                if (Number.isFinite(storedHighScore)) {
                    this.highScore = Math.max(this.highScore, storedHighScore);
                }
            })
            .catch(error => console.warn('Could not load Flappy Bird highscore:', error));
    }

    _die() {
        if (this.phase === 'dead') return;
        this.phase = 'dead';
        this.highScore = Math.max(this.highScore, this.score);
        this.submitScore({ score: this.score });
        this.audio.playTone(200, 0.3, 'sawtooth', 0.3);
    }

    /* ── Update ──────────────────────────────────────────────── */

    update(dt) {
        if (this.phase === 'ready') {
            // Idle bob
            this.birdY = FLAPPY_MODEL.worldHeight * 0.45 + Math.sin(Date.now() / 300) * 8;
            if (this.input.isActionJustDown('jump')) {
                this.phase = 'playing';
                this.birdVel = this.JUMP_VEL;
                this.audio.playClick();
            }
            return;
        }

        if (this.phase === 'dead') {
            // Fall off screen
            this.birdVel += this.GRAVITY * dt;
            this.birdY   += this.birdVel * dt;
            this.birdRot  = Math.min(this.birdRot + dt * 8, Math.PI / 2);

            if (this.input.isActionJustDown('jump')) {
                this.restart();
            }
            return;
        }

        // ── Playing ────────────

        // Jump
        if (this.input.isActionJustDown('jump')) {
            this.birdVel = this.JUMP_VEL;
            this.audio.playClick();
        }

        // Physics
        this.birdVel += this.GRAVITY * dt;
        this.birdY   += this.birdVel * dt;

        // Bird rotation follows velocity
        this.birdRot = Math.max(-0.5, Math.min(Math.PI / 2, this.birdVel / 400));

        // Spawn pipes
        this.spawnT += dt;
        if (this.spawnT >= this.SPAWN_INTERVAL) {
            this.spawnT = 0;
            const minimumCenter = FLAPPY_MODEL.pipeMargin + this.pipeGap * 0.5;
            const maximumCenter = FLAPPY_MODEL.worldHeight - FLAPPY_MODEL.pipeMargin - this.pipeGap * 0.5;
            const gapCenter = maximumCenter > minimumCenter
                ? minimumCenter + Math.random() * (maximumCenter - minimumCenter)
                : FLAPPY_MODEL.worldHeight * 0.5;
            this.pipes.push({ x: this._logicalWidth() + this.PIPE_WIDTH, gapCenter, scored: false });
        }

        // Move pipes
        for (const p of this.pipes) {
            p.x -= this.PIPE_SPEED * dt;

            // Score
            if (!p.scored && p.x + this.PIPE_WIDTH < this.birdX) {
                p.scored = true;
                this.score++;
                this.highScore = Math.max(this.highScore, this.score);
                this.audio.playBeep(660, 0.08, 0.2);
            }

            // Collision
            if (this._collides(p)) {
                this._die();
                return;
            }
        }

        // Remove off-screen
        this.pipes = this.pipes.filter(p => p.x + this.PIPE_WIDTH > -10);

        // Floor / ceiling death
        if (this.birdY - this.BIRD_R > FLAPPY_MODEL.worldHeight || this.birdY + this.BIRD_R < 0) {
            this._die();
        }
    }

    _collides(pipe) {
        const bx = this.birdX, by = this.birdY, r = this.BIRD_R;
        const pw = this.PIPE_WIDTH, gap = this.pipeGap;
        const topBot    = pipe.gapCenter - gap / 2; // bottom edge of top pipe
        const bottomTop = pipe.gapCenter + gap / 2; // top edge of bottom pipe

        // Horizontal overlap?
        if (bx + r < pipe.x || bx - r > pipe.x + pw) return false;
        // Vertical overlap with either pipe?
        if (by - r < topBot || by + r > bottomTop) return true;
        return false;
    }

    /* ── Render ──────────────────────────────────────────────── */

    render() {
        const ctx = this.ctx;
        const pixelWidth = this.w;
        const pixelHeight = this.h;
        const renderScale = this._renderScale();
        const w = this._logicalWidth();
        const h = FLAPPY_MODEL.worldHeight;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, pixelWidth, pixelHeight);
        ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);

        // Background gradient
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#5fcaff');
        grad.addColorStop(0.65, '#b7edff');
        grad.addColorStop(1, '#e6faff');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Soft distant clouds and a lively grass strip.
        ctx.fillStyle = 'rgba(255,255,255,.78)';
        for (const cloud of [[w * .14, 128, 28], [w * .72, 185, 35]]) {
            const [x, y, r] = cloud;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.arc(x + r, y + 5, r * .72, 0, Math.PI * 2);
            ctx.arc(x - r, y + 8, r * .62, 0, Math.PI * 2);
            ctx.fill();
        }
        const grass = ctx.createLinearGradient(0, h - 34, 0, h);
        grass.addColorStop(0, '#67d947');
        grass.addColorStop(1, '#23963a');
        ctx.fillStyle = grass;
        ctx.fillRect(0, h - 34, w, 34);
        ctx.strokeStyle = '#237b34';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, h - 34);
        ctx.lineTo(w, h - 34);
        ctx.stroke();

        // Pipes
        for (const p of this.pipes) {
            this._drawPipe(ctx, p, w, h);
        }

        // Bird
        this._drawBird(ctx);

        // Score
        ctx.fillStyle = '#17384e';
        ctx.font = 'bold 36px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(this.score.toString(), w / 2, 30);

        ctx.fillStyle = 'rgba(23,56,78,.72)';
        ctx.font = 'bold 14px Inter, sans-serif';
        ctx.fillText(`Highscore: ${this.highScore}`, w / 2, 76);

        // Overlay text
        if (this.phase === 'ready') {
            this._drawCenterText(ctx, 'Press SPACE to start', w / 2, h * 0.62, 15, 'rgba(23,56,78,.72)');
        }

        if (this.phase === 'dead') {
            ctx.fillStyle = 'rgba(35,83,76,0.30)';
            ctx.fillRect(0, 0, w, h);

            ctx.fillStyle = '#c93d35';
            ctx.font = 'bold 32px Inter, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillText('GAME OVER', w / 2, h * 0.40);

            ctx.fillStyle = '#17384e';
            ctx.font = '20px Inter, sans-serif';
            ctx.fillText(`Score: ${this.score}`, w / 2, h * 0.48);

            ctx.font = '17px Inter, sans-serif';
            ctx.fillStyle = '#8a5a00';
            ctx.fillText(`Highscore: ${this.highScore}`, w / 2, h * 0.54);

            this._drawCenterText(ctx, 'SPACE to retry', w / 2, h * 0.63, 13, 'rgba(23,56,78,.72)');
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    _drawPipe(ctx, pipe, w, h) {
        const gap = this.pipeGap;
        const topH = pipe.gapCenter - gap / 2;
        const botY = pipe.gapCenter + gap / 2;

        // Pipe body
        const pipeGrad = ctx.createLinearGradient(pipe.x, 0, pipe.x + this.PIPE_WIDTH, 0);
        pipeGrad.addColorStop(0,   '#168d36');
        pipeGrad.addColorStop(0.28, '#67df4d');
        pipeGrad.addColorStop(0.64, '#35bd3d');
        pipeGrad.addColorStop(1,   '#147b2e');
        ctx.fillStyle = pipeGrad;

        // Top pipe
        ctx.fillRect(pipe.x, 0, this.PIPE_WIDTH, topH);
        // Lip
        ctx.fillStyle = '#52d847';
        ctx.fillRect(pipe.x - 3, topH - 16, this.PIPE_WIDTH + 6, 16);
        ctx.strokeStyle = '#176d2d';
        ctx.lineWidth = 3;
        ctx.strokeRect(pipe.x, 0, this.PIPE_WIDTH, Math.max(0, topH));
        ctx.strokeRect(pipe.x - 3, topH - 16, this.PIPE_WIDTH + 6, 16);

        // Bottom pipe
        ctx.fillStyle = pipeGrad;
        ctx.fillRect(pipe.x, botY, this.PIPE_WIDTH, h - botY);
        // Lip
        ctx.fillStyle = '#52d847';
        ctx.fillRect(pipe.x - 3, botY, this.PIPE_WIDTH + 6, 16);
        ctx.strokeStyle = '#176d2d';
        ctx.strokeRect(pipe.x, botY, this.PIPE_WIDTH, Math.max(0, h - botY));
        ctx.strokeRect(pipe.x - 3, botY, this.PIPE_WIDTH + 6, 16);
    }

    _drawBird(ctx) {
        ctx.save();
        ctx.translate(this.birdX, this.birdY);
        ctx.rotate(this.birdRot);

        // Body
        ctx.fillStyle = '#ffd93d';
        ctx.beginPath();
        ctx.ellipse(0, 0, this.BIRD_R + 2, this.BIRD_R, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(6, -4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1a1a2e';
        ctx.beginPath();
        ctx.arc(7, -4, 2, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath();
        ctx.moveTo(this.BIRD_R + 2, -3);
        ctx.lineTo(this.BIRD_R + 10, 0);
        ctx.lineTo(this.BIRD_R + 2, 3);
        ctx.closePath();
        ctx.fill();

        // Wing
        ctx.fillStyle = '#f0c420';
        ctx.beginPath();
        const wingY = this.birdVel < 0 ? -6 : 4;
        ctx.ellipse(-4, wingY, 8, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawCenterText(ctx, text, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.font = `${size}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
    }

    /* ── Schema ──────────────────────────────────────────────── */

    static getSettingsSchema() {
        return [
            { key: 'gravity', label: 'Gravity',   type: 'range', min: 0.3, max: 2.0, step: 0.1, default: 1.0 },
            { key: 'gap',     label: 'Pipe Gap',   type: 'range', min: 80,  max: 400, step: 10,  default: 180 },
        ];
    }

    static getControlsSchema() {
        return [
            {
                action: 'jump',
                label: 'Jump / Flap',
                defaultBindings: [
                    { type: 'keyboard', code: 'Space' },
                    { type: 'mouse',    code: 0 },
                    { type: 'gamepad',  code: 0 },
                ],
            },
        ];
    }
}
