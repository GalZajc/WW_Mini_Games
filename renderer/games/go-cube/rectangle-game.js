import { BaseGame } from '../../core/BaseGame.js';
import { requireInteger } from '../../core/SettingsValidation.js';
import {
    BLACK,
    WHITE,
    GoGraphModel,
    createRectangleTopology,
    rectangleKey,
} from './go-model.js';

const BOARD = Object.freeze({
    minimumPadding: 54,
    boardMarginCells: 0.72,
    stoneRadiusRatio: 0.44,
});

export default class GoRectangleGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.preparePauseSettings(this.settings || {});
        this.nx = Math.round(Number(this.settings.nx ?? 9));
        this.ny = Math.round(Number(this.settings.ny ?? 9));
        this.model = new GoGraphModel(createRectangleTopology(this.nx, this.ny));
        this.elapsed = 0;
        this.layoutPoints = [];
        this._pointerDown = event => this._onPointerDown(event);
        this._keyDown = event => {
            if (event.code === 'KeyP') this._pass();
            if (event.code === 'KeyR') this._restartBoard();
        };
        this.canvas.addEventListener('pointerdown', this._pointerDown);
        window.addEventListener('keydown', this._keyDown);
        this._ensureHud();
        this._renderHud();
    }

    _restartBoard() {
        this.model = new GoGraphModel(createRectangleTopology(this.nx, this.ny));
        this.elapsed = 0;
        this._renderHud();
    }

    _onPointerDown(event) {
        if (event.button !== 0 || this.model.gameOver) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * this.canvas.width / Math.max(1, rect.width);
        const y = (event.clientY - rect.top) * this.canvas.height / Math.max(1, rect.height);
        let closest = null;
        for (const point of this.layoutPoints) {
            const distance = Math.hypot(x - point.screenX, y - point.screenY);
            if (distance <= point.hitRadius && (!closest || distance < closest.distance)) {
                closest = { ...point, distance };
            }
        }
        if (!closest) return;
        if (this.model.place(closest.key)) {
            this.audio.playClick();
            this._renderHud();
        }
    }

    _pass() {
        if (!this.model.pass()) return;
        this.audio.playClick();
        if (this.model.gameOver) this._submitResult();
        this._renderHud();
    }

    _submitResult() {
        const black = this.model.scores[BLACK];
        const white = this.model.scores[WHITE];
        this.submitScore({
            winner: black.total === white.total ? 'draw' : black.total > white.total ? 'black' : 'white',
            black,
            white,
            seconds: Number(this.elapsed.toFixed(3)),
        });
    }

    update(dt) {
        if (!this.model.gameOver) this.elapsed += dt;
    }

    _drawStone(ctx, x, y, radius, player) {
        const gradient = ctx.createRadialGradient(
            x - radius * 0.34,
            y - radius * 0.38,
            radius * 0.08,
            x,
            y,
            radius,
        );
        if (player === BLACK) {
            gradient.addColorStop(0, '#666b70');
            gradient.addColorStop(0.28, '#272b2e');
            gradient.addColorStop(1, '#050607');
        } else {
            gradient.addColorStop(0, '#ffffff');
            gradient.addColorStop(0.66, '#ece8dc');
            gradient.addColorStop(1, '#aaa89f');
        }
        ctx.fillStyle = gradient;
        ctx.strokeStyle = player === BLACK ? '#020303' : '#777870';
        ctx.lineWidth = Math.max(1.5, radius * 0.08);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    render() {
        const ctx = this.ctx;
        if (!ctx) return;
        const sky = ctx.createLinearGradient(0, 0, 0, this.h);
        sky.addColorStop(0, '#68cbf5');
        sky.addColorStop(1, '#c9f1ff');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, this.w, this.h);

        const availableWidth = Math.max(100, this.w - BOARD.minimumPadding * 2);
        const availableHeight = Math.max(100, this.h - BOARD.minimumPadding * 2);
        const cellsWide = Math.max(1, this.nx - 1 + BOARD.boardMarginCells * 2);
        const cellsHigh = Math.max(1, this.ny - 1 + BOARD.boardMarginCells * 2);
        const step = Math.min(availableWidth / cellsWide, availableHeight / cellsHigh);
        const boardWidth = cellsWide * step;
        const boardHeight = cellsHigh * step;
        const boardX = (this.w - boardWidth) * 0.5;
        const boardY = (this.h - boardHeight) * 0.5;
        const gridX = boardX + BOARD.boardMarginCells * step;
        const gridY = boardY + BOARD.boardMarginCells * step;

        ctx.save();
        ctx.shadowColor = 'rgba(77,45,15,.28)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 10;
        const boardGradient = ctx.createLinearGradient(boardX, boardY, boardX + boardWidth, boardY + boardHeight);
        boardGradient.addColorStop(0, '#f2c573');
        boardGradient.addColorStop(0.46, '#d99b4b');
        boardGradient.addColorStop(1, '#bc7535');
        ctx.fillStyle = boardGradient;
        ctx.strokeStyle = '#713b1c';
        ctx.lineWidth = Math.max(3, step * 0.07);
        ctx.beginPath();
        ctx.roundRect(boardX, boardY, boardWidth, boardHeight, Math.min(18, step * 0.3));
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = 'rgba(73,43,22,.88)';
        ctx.lineWidth = Math.max(1, step * 0.032);
        for (let x = 0; x < this.nx; x++) {
            const screenX = gridX + x * step;
            ctx.beginPath();
            ctx.moveTo(screenX, gridY);
            ctx.lineTo(screenX, gridY + (this.ny - 1) * step);
            ctx.stroke();
        }
        for (let y = 0; y < this.ny; y++) {
            const screenY = gridY + y * step;
            ctx.beginPath();
            ctx.moveTo(gridX, screenY);
            ctx.lineTo(gridX + (this.nx - 1) * step, screenY);
            ctx.stroke();
        }

        this.layoutPoints = [];
        const radius = step * BOARD.stoneRadiusRatio;
        for (let y = 0; y < this.ny; y++) {
            for (let x = 0; x < this.nx; x++) {
                const screenX = gridX + x * step;
                const screenY = gridY + y * step;
                const key = rectangleKey(x, y);
                this.layoutPoints.push({ key, screenX, screenY, hitRadius: Math.max(radius, step * 0.48) });
                const player = this.model.board.get(key);
                if (player) this._drawStone(ctx, screenX, screenY, radius, player);
            }
        }
    }

    _ensureHud() {
        this.hud = document.createElement('div');
        this.hud.style.cssText = 'position:fixed;top:12px;left:12px;z-index:760;display:flex;align-items:center;gap:10px;padding:8px 10px;border:2px solid #58615b;border-radius:11px;background:rgba(235,238,235,.94);box-shadow:0 7px 20px rgba(38,68,47,.2);font:12px Inter,system-ui,sans-serif;color:#202724;pointer-events:auto';
        this.hud.innerHTML = `
            <span id="go-rect-turn" style="font-weight:900"></span>
            <span id="go-rect-score" style="color:#56625b"></span>
            <button id="go-rect-pass" type="button" style="padding:5px 12px;border:1px solid #68736b;border-radius:7px;background:#f8faf8;color:#26332a;font-weight:800;cursor:pointer">Pass</button>
            <button id="go-rect-restart" type="button" style="display:none;padding:5px 12px;border:1px solid #277632;border-radius:7px;background:#50c747;color:#153318;font-weight:800;cursor:pointer">Play again</button>`;
        document.body.appendChild(this.hud);
        this.turnElement = this.hud.querySelector('#go-rect-turn');
        this.scoreElement = this.hud.querySelector('#go-rect-score');
        this.passElement = this.hud.querySelector('#go-rect-pass');
        this.restartElement = this.hud.querySelector('#go-rect-restart');
        this._passClick = () => this._pass();
        this._restartClick = () => this._restartBoard();
        this.passElement.addEventListener('click', this._passClick);
        this.restartElement.addEventListener('click', this._restartClick);
    }

    _renderHud() {
        if (!this.hud) return;
        if (this.model.gameOver) {
            const black = this.model.scores[BLACK];
            const white = this.model.scores[WHITE];
            this.turnElement.textContent = 'Final score';
            this.scoreElement.textContent = `Black ${black.total} · White ${white.total}`;
            this.passElement.style.display = 'none';
            this.restartElement.style.display = '';
        } else {
            this.turnElement.textContent = `${this.model.player === BLACK ? 'Black' : 'White'} to play`;
            this.scoreElement.textContent = `Captures ${this.model.captures[BLACK]}:${this.model.captures[WHITE]}`;
            this.passElement.style.display = '';
            this.restartElement.style.display = 'none';
        }
    }

    destroy() {
        this.canvas.removeEventListener('pointerdown', this._pointerDown);
        window.removeEventListener('keydown', this._keyDown);
        this.passElement?.removeEventListener('click', this._passClick);
        this.restartElement?.removeEventListener('click', this._restartClick);
        this.hud?.remove();
        this.hud = null;
    }

    static getSettingsSchema() {
        return [
            { key: 'nx', label: 'Horizontal intersections (Nx)', type: 'number', min: 2, step: 1, default: 9 },
            { key: 'ny', label: 'Vertical intersections (Ny)', type: 'number', min: 2, step: 1, default: 9 },
        ];
    }

    preparePauseSettings(settings) {
        requireInteger(settings.nx ?? 9, 'Rectangle X intersections', { minimum: 2 });
        requireInteger(settings.ny ?? 9, 'Rectangle Y intersections', { minimum: 2 });
        return settings;
    }

    static getControlsSchema() { return []; }
}
