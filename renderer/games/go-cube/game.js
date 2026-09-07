import { BaseGame } from '../../core/BaseGame.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import { requireInteger } from '../../core/SettingsValidation.js';
import GoCuboidGame from './cuboid-game.js';
import GoRectangleGame from './rectangle-game.js';

const BLACK = 1;
const WHITE = 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const keyOf = point => `${point.face}-${point.x}-${point.y}`;

export class GoCubeModel {
    constructor(size = 9) {
        this.size = Math.max(1, Math.round(Number(size)));
        this.board = new Map();
        this.player = BLACK;
        this.captures = { [BLACK]: 0, [WHITE]: 0 };
        this.history = [];
        this.consecutivePasses = 0;
        this.gameOver = false;
        this.scores = null;
    }

    neighbors(point) {
        const { face, x, y } = point;
        const N = this.size - 1;
        const result = [];
        if (x > 0) result.push({ face, x: x - 1, y });
        if (x < N) result.push({ face, x: x + 1, y });
        if (y > 0) result.push({ face, x, y: y - 1 });
        if (y < N) result.push({ face, x, y: y + 1 });
        if (face === 0) {
            if (y === 0) result.push({ face: 4, x: N - x, y: 0 });
            if (y === N) result.push({ face: 2, x, y: 0 });
            if (x === 0) result.push({ face: 1, x: y, y: 0 });
            if (x === N) result.push({ face: 3, x: y, y: 0 });
        } else if (face === 1) {
            if (y === 0) result.push({ face: 0, x: 0, y: x });
            if (y === N) result.push({ face: 5, x: 0, y: x });
            if (x === 0) result.push({ face: 4, x: N, y });
            if (x === N) result.push({ face: 2, x: 0, y });
        } else if (face === 2) {
            if (y === 0) result.push({ face: 0, x, y: N });
            if (y === N) result.push({ face: 5, x, y: 0 });
            if (x === 0) result.push({ face: 1, x: N, y });
            if (x === N) result.push({ face: 3, x: 0, y });
        } else if (face === 3) {
            if (y === 0) result.push({ face: 0, x: N, y: x });
            if (y === N) result.push({ face: 5, x: N, y: x });
            if (x === 0) result.push({ face: 2, x: N, y });
            if (x === N) result.push({ face: 4, x: 0, y });
        } else if (face === 4) {
            if (y === 0) result.push({ face: 0, x: N - x, y: 0 });
            if (y === N) result.push({ face: 5, x: N - x, y: N });
            if (x === 0) result.push({ face: 3, x: N, y });
            if (x === N) result.push({ face: 1, x: 0, y });
        } else if (face === 5) {
            if (y === 0) result.push({ face: 2, x, y: N });
            if (y === N) result.push({ face: 4, x: N - x, y: N });
            if (x === 0) result.push({ face: 1, x: y, y: N });
            if (x === N) result.push({ face: 3, x: y, y: N });
        }
        return result;
    }

    group(start, board = this.board) {
        const startKey = keyOf(start);
        const player = board.get(startKey);
        if (!player) return { stones: new Set(), liberties: new Set() };
        const stones = new Set([startKey]);
        const liberties = new Set();
        const queue = [start];
        while (queue.length) {
            const point = queue.shift();
            for (const neighbor of this.neighbors(point)) {
                const key = keyOf(neighbor);
                const occupant = board.get(key);
                if (!occupant) liberties.add(key);
                else if (occupant === player && !stones.has(key)) {
                    stones.add(key);
                    queue.push(neighbor);
                }
            }
        }
        return { stones, liberties };
    }

    serialize(board = this.board) {
        return [...board.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, player]) => `${key}:${player}`).join(',');
    }

    place(point) {
        if (this.gameOver || point.face < 0 || point.face > 5
            || point.x < 0 || point.x >= this.size || point.y < 0 || point.y >= this.size) return false;
        const key = keyOf(point);
        if (this.board.has(key)) return false;
        const opponent = this.player === BLACK ? WHITE : BLACK;
        const candidate = new Map(this.board);
        candidate.set(key, this.player);
        let captured = 0;
        const checked = new Set();
        for (const neighbor of this.neighbors(point)) {
            const neighborKey = keyOf(neighbor);
            if (candidate.get(neighborKey) !== opponent || checked.has(neighborKey)) continue;
            const group = this.group(neighbor, candidate);
            group.stones.forEach(stone => checked.add(stone));
            if (group.liberties.size === 0) {
                captured += group.stones.size;
                group.stones.forEach(stone => candidate.delete(stone));
            }
        }
        if (this.group(point, candidate).liberties.size === 0 && captured === 0) return false;
        const serialized = this.serialize(candidate);
        if (this.history.length >= 2 && serialized === this.history[this.history.length - 2]) return false;
        this.board = candidate;
        this.captures[this.player] += captured;
        this.history.push(serialized);
        this.consecutivePasses = 0;
        this.player = opponent;
        return true;
    }

    pass() {
        if (this.gameOver) return false;
        this.consecutivePasses++;
        this.player = this.player === BLACK ? WHITE : BLACK;
        if (this.consecutivePasses >= 2) {
            this.gameOver = true;
            this.scores = this.calculateScores();
        }
        return true;
    }

    calculateScores() {
        const territory = { [BLACK]: 0, [WHITE]: 0 };
        const visited = new Set();
        for (let face = 0; face < 6; face++) {
            for (let y = 0; y < this.size; y++) {
                for (let x = 0; x < this.size; x++) {
                    const start = { face, x, y };
                    const startKey = keyOf(start);
                    if (this.board.has(startKey) || visited.has(startKey)) continue;
                    const queue = [start];
                    const region = new Set([startKey]);
                    const borders = new Set();
                    visited.add(startKey);
                    while (queue.length) {
                        const point = queue.shift();
                        for (const neighbor of this.neighbors(point)) {
                            const key = keyOf(neighbor);
                            const occupant = this.board.get(key);
                            if (occupant) borders.add(occupant);
                            else if (!visited.has(key)) {
                                visited.add(key);
                                region.add(key);
                                queue.push(neighbor);
                            }
                        }
                    }
                    if (borders.size === 1) territory[[...borders][0]] += region.size;
                }
            }
        }
        return {
            [BLACK]: { territory: territory[BLACK], captures: this.captures[BLACK], total: territory[BLACK] + this.captures[BLACK] },
            [WHITE]: { territory: territory[WHITE], captures: this.captures[WHITE], total: territory[WHITE] + this.captures[WHITE] },
        };
    }
}

const FACE_LAYOUT = [[null, 0, null, null], [1, 2, 3, 4], [null, 5, null, null]];
const CUBE_FACES = Object.freeze([
    { center: [0, 1, 0], normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
    { center: [-1, 0, 0], normal: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
    { center: [0, 0, 1], normal: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
    { center: [1, 0, 0], normal: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
    { center: [0, 0, -1], normal: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
    { center: [0, -1, 0], normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
]);

export class LegacyGoCubeGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.model = new GoCubeModel(this.settings.boardSize ?? 9);
        this.elapsed = 0;
        if (!['2d', '3d'].includes(this.viewMode)) this.viewMode = '2d';
        if (!Number.isFinite(this.viewYaw)) this.viewYaw = -0.62;
        if (!Number.isFinite(this.viewPitch)) this.viewPitch = 0.46;
        if (!Number.isFinite(this.viewZoom)) this.viewZoom = 1;
        this.rotatingView = false;
        this._mouseDown = event => this._handleMouse(event);
        this._mouseMove = event => this._handleRotateMove(event);
        this._mouseUp = event => {
            if (event.button === 2) this.rotatingView = false;
        };
        this._wheel = event => {
            if (this.viewMode !== '3d') return;
            event.preventDefault();
            this.viewZoom = clamp(this.viewZoom * Math.exp(-event.deltaY * 0.0012), 0.58, 2.2);
        };
        this._contextMenu = event => event.preventDefault();
        this._keyDown = event => {
            if (event.code === 'KeyP') this._pass();
            if (event.code === 'KeyR') this.restart();
            if (event.code === 'KeyV') this.viewMode = this.viewMode === '2d' ? '3d' : '2d';
        };
        this.canvas.addEventListener('mousedown', this._mouseDown);
        this.canvas.addEventListener('wheel', this._wheel, { passive: false });
        this.canvas.addEventListener('contextmenu', this._contextMenu);
        window.addEventListener('mousemove', this._mouseMove);
        window.addEventListener('mouseup', this._mouseUp);
        window.addEventListener('keydown', this._keyDown);
    }

    update(dt) {
        if (!this.model.gameOver) this.elapsed += dt;
    }

    _handleMouse(event) {
        if (!this.layout) return;
        if (event.button === 2 && this.viewMode === '3d') {
            this.rotatingView = true;
            this.lastRotateX = event.clientX;
            this.lastRotateY = event.clientY;
            event.preventDefault();
            return;
        }
        if (event.button !== 0) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * this.canvas.width / rect.width;
        const y = (event.clientY - rect.top) * this.canvas.height / rect.height;
        if (this.layout.viewButton && x >= this.layout.viewButton.x && x <= this.layout.viewButton.x + this.layout.viewButton.width
            && y >= this.layout.viewButton.y && y <= this.layout.viewButton.y + this.layout.viewButton.height) {
            this.viewMode = this.viewMode === '2d' ? '3d' : '2d';
            return;
        }
        if (this.layout.passButton && x >= this.layout.passButton.x && x <= this.layout.passButton.x + this.layout.passButton.width
            && y >= this.layout.passButton.y && y <= this.layout.passButton.y + this.layout.passButton.height) {
            this._pass();
            return;
        }
        if (this.model.gameOver) {
            this.restart();
            return;
        }
        let closest = null;
        for (const point of this.layout.points) {
            const distance = Math.hypot(x - point.screenX, y - point.screenY);
            if (distance <= point.radius && (!closest || distance < closest.distance)) closest = { ...point, distance };
        }
        if (!closest) return;
        if (this.model.place({ face: closest.face, x: closest.x, y: closest.y })) this.audio.playClick();
        else this.audio.playTone(170, 0.08, 'square', 0.1);
    }

    _handleRotateMove(event) {
        if (!this.rotatingView || this.viewMode !== '3d') return;
        const dx = event.clientX - this.lastRotateX;
        const dy = event.clientY - this.lastRotateY;
        this.lastRotateX = event.clientX;
        this.lastRotateY = event.clientY;
        this.viewYaw += dx * 0.008;
        this.viewPitch = clamp(this.viewPitch - dy * 0.008, -Math.PI * 0.49, Math.PI * 0.49);
    }

    _pass() {
        if (!this.model.pass()) return;
        this.audio.playBeep(430, 0.08, 0.12);
        if (this.model.gameOver) {
            const black = this.model.scores[BLACK].total;
            const white = this.model.scores[WHITE].total;
            this.submitScore({
                winner: black === white ? 'draw' : black > white ? 'black' : 'white',
                black: this.model.scores[BLACK],
                white: this.model.scores[WHITE],
                seconds: Number(this.elapsed.toFixed(3)),
            });
        }
    }

    render() {
        const ctx = this.ctx;
        this.clear('#86d5f7');
        const panelWidth = Math.min(220, this.w * 0.22);
        const availableWidth = this.w - panelWidth - 34;
        this.layout = { points: [] };
        if (this.viewMode === '3d') {
            this._drawCube3D(ctx, 12, 18, availableWidth - 16, this.h - 36);
        } else {
            const faceSize = Math.min(availableWidth / 4, (this.h - 36) / 3);
            const netWidth = faceSize * 4;
            const netHeight = faceSize * 3;
            const originX = Math.max(12, (availableWidth - netWidth) * 0.5);
            const originY = (this.h - netHeight) * 0.5;
            FACE_LAYOUT.forEach((row, gridY) => row.forEach((face, gridX) => {
                if (face === null) return;
                this._drawFace(ctx, face, originX + gridX * faceSize, originY + gridY * faceSize, faceSize);
            }));
        }
        this._drawHud(ctx, availableWidth + 8, 18, panelWidth - 16);
    }

    _rotate3D(point) {
        const cosYaw = Math.cos(this.viewYaw);
        const sinYaw = Math.sin(this.viewYaw);
        const xYaw = cosYaw * point[0] + sinYaw * point[2];
        const zYaw = -sinYaw * point[0] + cosYaw * point[2];
        const cosPitch = Math.cos(this.viewPitch);
        const sinPitch = Math.sin(this.viewPitch);
        return [
            xYaw,
            cosPitch * point[1] - sinPitch * zYaw,
            sinPitch * point[1] + cosPitch * zYaw,
        ];
    }

    _cubePoint(frame, u, v) {
        return [0, 1, 2].map(axis => frame.center[axis] + frame.u[axis] * u + frame.v[axis] * v);
    }

    _drawCube3D(ctx, x, y, width, height) {
        const centerX = x + width * 0.5;
        const centerY = y + height * 0.52;
        const cameraDistance = 5;
        const projectionScale = Math.min(width, height) * 1.55 * this.viewZoom;
        const project = point => {
            const rotated = this._rotate3D(point);
            const perspective = projectionScale / Math.max(1.5, cameraDistance - rotated[2]);
            return {
                x: centerX + rotated[0] * perspective,
                y: centerY - rotated[1] * perspective,
                z: rotated[2],
                perspective,
            };
        };
        const visibleFaces = CUBE_FACES.map((frame, face) => ({
            face,
            frame,
            center: this._rotate3D(frame.center),
            normal: this._rotate3D(frame.normal),
        })).filter(item => item.normal[2] > 0.015)
            .sort((first, second) => first.center[2] - second.center[2]);

        for (const item of visibleFaces) {
            const { frame, face } = item;
            const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
                .map(([u, v]) => project(this._cubePoint(frame, u, v)));
            ctx.beginPath();
            corners.forEach((corner, index) => index
                ? ctx.lineTo(corner.x, corner.y)
                : ctx.moveTo(corner.x, corner.y));
            ctx.closePath();
            ctx.fillStyle = '#b78a5e';
            ctx.fill();
            ctx.strokeStyle = '#4b3424';
            ctx.lineWidth = 2;
            ctx.stroke();

            const inset = 0.78;
            const coordinate = index => -inset + index * (inset * 2 / (this.model.size - 1));
            ctx.strokeStyle = '#6c4c33';
            ctx.lineWidth = 1;
            for (let index = 0; index < this.model.size; index++) {
                const value = coordinate(index);
                const verticalStart = project(this._cubePoint(frame, value, -inset));
                const verticalEnd = project(this._cubePoint(frame, value, inset));
                ctx.beginPath();
                ctx.moveTo(verticalStart.x, verticalStart.y);
                ctx.lineTo(verticalEnd.x, verticalEnd.y);
                ctx.stroke();
                const horizontalStart = project(this._cubePoint(frame, -inset, value));
                const horizontalEnd = project(this._cubePoint(frame, inset, value));
                ctx.beginPath();
                ctx.moveTo(horizontalStart.x, horizontalStart.y);
                ctx.lineTo(horizontalEnd.x, horizontalEnd.y);
                ctx.stroke();
            }

            const worldStep = inset * 2 / (this.model.size - 1);
            for (let boardY = 0; boardY < this.model.size; boardY++) {
                for (let boardX = 0; boardX < this.model.size; boardX++) {
                    const position = project(this._cubePoint(frame, coordinate(boardX), coordinate(boardY)));
                    const radius = clamp(worldStep * position.perspective * 0.40, 3.2, 12);
                    this.layout.points.push({ face, x: boardX, y: boardY, screenX: position.x, screenY: position.y, radius: Math.max(radius, 5) });
                    const player = this.model.board.get(`${face}-${boardX}-${boardY}`);
                    if (!player) continue;
                    const gradient = ctx.createRadialGradient(
                        position.x - radius * 0.35,
                        position.y - radius * 0.4,
                        radius * 0.1,
                        position.x,
                        position.y,
                        radius,
                    );
                    if (player === BLACK) {
                        gradient.addColorStop(0, '#555');
                        gradient.addColorStop(1, '#050505');
                    } else {
                        gradient.addColorStop(0, '#fff');
                        gradient.addColorStop(1, '#cfd3d6');
                    }
                    ctx.beginPath();
                    ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
                    ctx.fillStyle = gradient;
                    ctx.fill();
                    ctx.strokeStyle = player === BLACK ? '#000' : '#858b90';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }

        ctx.fillStyle = 'rgba(35,40,46,.82)';
        ctx.fillRect(x + 8, y + height - 34, Math.min(330, width - 16), 26);
        ctx.fillStyle = '#e9f0f4';
        ctx.textAlign = 'left';
        ctx.font = '11px Inter,sans-serif';
        ctx.fillText('RMB + drag: rotate cube · wheel: zoom', x + 17, y + height - 17);
    }

    _drawFace(ctx, face, x, y, size) {
        ctx.fillStyle = '#b78a5e';
        ctx.fillRect(x, y, size, size);
        ctx.strokeStyle = '#4b3424';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, size, size);
        const inset = size / (this.model.size + 1);
        const span = size - inset * 2;
        const step = span / (this.model.size - 1);
        ctx.strokeStyle = '#6c4c33';
        ctx.lineWidth = Math.max(0.5, size / 500);
        for (let index = 0; index < this.model.size; index++) {
            ctx.beginPath();
            ctx.moveTo(x + inset + index * step, y + inset);
            ctx.lineTo(x + inset + index * step, y + size - inset);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x + inset, y + inset + index * step);
            ctx.lineTo(x + size - inset, y + inset + index * step);
            ctx.stroke();
        }
        const radius = Math.min(step * 0.45, 10);
        for (let boardY = 0; boardY < this.model.size; boardY++) {
            for (let boardX = 0; boardX < this.model.size; boardX++) {
                const screenX = x + inset + boardX * step;
                const screenY = y + inset + boardY * step;
                this.layout.points.push({ face, x: boardX, y: boardY, screenX, screenY, radius: Math.max(radius, 5) });
                const player = this.model.board.get(`${face}-${boardX}-${boardY}`);
                if (!player) continue;
                const gradient = ctx.createRadialGradient(screenX - radius * 0.35, screenY - radius * 0.4, radius * 0.1, screenX, screenY, radius);
                if (player === BLACK) {
                    gradient.addColorStop(0, '#555');
                    gradient.addColorStop(1, '#050505');
                } else {
                    gradient.addColorStop(0, '#fff');
                    gradient.addColorStop(1, '#cfd3d6');
                }
                ctx.beginPath();
                ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
                ctx.strokeStyle = player === BLACK ? '#000' : '#858b90';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    _drawHud(ctx, x, y, width) {
        ctx.fillStyle = 'rgba(35,40,46,.95)';
        ctx.fillRect(x, y, width, this.h - y * 2);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#78d1f8';
        ctx.font = '700 11px Inter,sans-serif';
        ctx.fillText('GO CUBE', x + 14, y + 25);
        ctx.fillStyle = '#f4f7fa';
        ctx.font = '900 20px Inter,sans-serif';
        ctx.fillText(this.model.gameOver ? 'Final score' : `${this.model.player === BLACK ? 'Black' : 'White'} to play`, x + 14, y + 55);
        ctx.font = '12px Inter,sans-serif';
        ctx.fillStyle = '#c1cad2';
        ctx.fillText(`Black captures: ${this.model.captures[BLACK]}`, x + 14, y + 86);
        ctx.fillText(`White captures: ${this.model.captures[WHITE]}`, x + 14, y + 106);
        ctx.fillText(`Passes: ${this.model.consecutivePasses} / 2`, x + 14, y + 126);
        const viewButton = { x: x + 14, y: y + 148, width: width - 28, height: 30 };
        this.layout.viewButton = viewButton;
        ctx.fillStyle = '#39434b';
        ctx.fillRect(viewButton.x, viewButton.y, viewButton.width, viewButton.height);
        ctx.fillStyle = '#dbe7ee';
        ctx.textAlign = 'center';
        ctx.font = '700 11px Inter,sans-serif';
        ctx.fillText(`${this.viewMode === '2d' ? '3D cube' : '2D unfolded net'} · V`, viewButton.x + viewButton.width / 2, viewButton.y + 19);
        const passButton = { x: x + 14, y: y + 188, width: width - 28, height: 34 };
        this.layout.passButton = passButton;
        ctx.fillStyle = '#48535c';
        ctx.fillRect(passButton.x, passButton.y, passButton.width, passButton.height);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = '700 12px Inter,sans-serif';
        ctx.fillText('Pass · P', passButton.x + passButton.width / 2, passButton.y + 21);
        if (this.model.gameOver) {
            const black = this.model.scores[BLACK];
            const white = this.model.scores[WHITE];
            ctx.textAlign = 'left';
            ctx.fillStyle = '#f4f7fa';
            ctx.font = '800 15px Inter,sans-serif';
            ctx.fillText(`Black: ${black.total}`, x + 14, y + 252);
            ctx.fillText(`White: ${white.total}`, x + 14, y + 278);
            ctx.font = '11px Inter,sans-serif';
            ctx.fillStyle = '#bdc6cf';
            ctx.fillText('Click to start a new game', x + 14, y + 310);
        }
    }

    destroy() {
        this.canvas.removeEventListener('mousedown', this._mouseDown);
        this.canvas.removeEventListener('wheel', this._wheel);
        this.canvas.removeEventListener('contextmenu', this._contextMenu);
        window.removeEventListener('mousemove', this._mouseMove);
        window.removeEventListener('mouseup', this._mouseUp);
        window.removeEventListener('keydown', this._keyDown);
    }

    wantsPointerLockNow() { return false; }

    preparePauseSettings(settings) {
        const mode = GO_MODES[settings.mode] ? settings.mode : 'cuboid';
        const prefix = GO_MODES[mode].prefix;
        const minimum = 2;
        const keys = mode === 'cuboid' ? ['nx', 'ny', 'nz'] : ['nx', 'ny'];
        for (const key of keys) requireInteger(settings[`${prefix}_${key}`], `${mode} ${key}`, { minimum });
        return settings;
    }

    getRecordSettings(settings = this.settings) {
        return { boardSize: Math.round(Number(settings.boardSize ?? 9)) };
    }

    static getSettingsSchema() {
        return [{ key: 'boardSize', label: 'Intersections per cube edge', type: 'number', min: 3, max: 15, step: 1, default: 9 }];
    }

    static getControlsSchema() { return []; }
}

const GO_MODES = Object.freeze({
    cuboid: {
        label: 'Go on a Cuboid',
        artKey: 'go-cuboid',
        description: 'One continuous Go board wraps across an Nx × Ny × Nz cuboid surface.',
        prefix: 'cuboid',
        GameClass: GoCuboidGame,
    },
    rectangle: {
        label: 'Go on a Rectangle',
        artKey: 'go-rectangle',
        description: 'Classic planar Go on an independently configurable Nx × Ny board.',
        prefix: 'rectangle',
        GameClass: GoRectangleGame,
    },
});

function prefixedSettings(mode, info) {
    return info.GameClass.getSettingsSchema().map(setting => ({
        ...setting,
        key: `${info.prefix}_${setting.key}`,
        group: `${info.label}${setting.group ? ` · ${setting.group}` : ''}`,
        modes: [mode],
    }));
}

export default class GoGame extends BaseGame {

    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.mode = null;
        this.child = null;
        this.phase = 'mode-select';
        if (this._modeChosenForSession && GO_MODES[this.settings.mode]) {
            this._startMode(this.settings.mode);
        } else {
            this._showModeSelector();
        }
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        const selectedMode = GO_MODES[this.settings.mode] ? this.settings.mode : 'cuboid';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Go',
            prompt: 'Choose board topology',
            selectedMode,
            modes: Object.entries(GO_MODES).map(([key, info]) => ({
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

    _childSettings(mode) {
        const info = GO_MODES[mode];
        return Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
            setting.key,
            this.settings[`${info.prefix}_${setting.key}`] ?? setting.default,
        ]));
    }

    _startMode(mode) {
        const info = GO_MODES[mode];
        if (!info) return false;
        const childSettings = this._childSettings(mode);
        try {
            new info.GameClass().preparePauseSettings(childSettings);
        } catch (error) {
            let message = this.modeSelector?.querySelector('[data-size-error]');
            if (!message && this.modeSelector) {
                message = document.createElement('div');
                message.dataset.sizeError = 'true';
                this.modeSelector.appendChild(message);
            }
            if (message) {
                message.textContent = error.message;
                message.style.cssText = 'margin:10px 0;color:#b3261e;font-weight:800;font-size:12px;';
            }
            return false;
        }
        this._destroyChild();
        this.settings.mode = mode;
        this.app.currentSettings = { ...this.settings };
        this.app.settingsManager.save('go-cube', this.settings).catch(() => {});
        this._selectorClick = null;
        this.modeSelector?.remove();
        this.modeSelector = null;
        this.mode = mode;
        this.phase = 'playing';

        let canvas = this.canvas;
        let context = this.ctx;
        if (mode === 'cuboid') {
            this.modeCanvas = document.createElement('canvas');
            this.modeCanvas.style.cssText = 'position:fixed;inset:0;z-index:700;width:100%;height:100%;display:block;';
            this.modeCanvas.width = window.innerWidth;
            this.modeCanvas.height = window.innerHeight;
            document.body.appendChild(this.modeCanvas);
            canvas = this.modeCanvas;
            context = null;
        }

        const recordSettings = this.getRecordSettings({ ...this.settings, mode });
        this.child = new info.GameClass();
        const childApp = {
            ...this.app,
            currentSettings: childSettings,
            records: {
                getBest: (_legacyId, _legacySettings, resultKey, direction = 'max') =>
                    this.app.records.getBest('go-cube', recordSettings, resultKey, direction),
            },
        };
        this.child._setup(
            canvas,
            context,
            this.input,
            this.audio,
            childSettings,
            results => this.submitScore({ ...results, mode }),
            () => this.endGame(),
            this.network,
            childApp,
            this.mobile,
        );
        return true;
    }

    returnToModeSelector() {
        this._destroyChild();
        this._modeChosenForSession = false;
        this.mode = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    _destroyChild() {
        this.child?.destroy?.();
        this.child = null;
        this.modeCanvas?.remove();
        this.modeCanvas = null;
    }

    update(dt) { this.child?.update?.(dt); }
    render() { this.child?.render?.(); }
    onPause() { this.child?.onPause?.(); }
    onResume() { this.child?.onResume?.(); }
    onResize(width, height) {
        if (this.modeCanvas) {
            this.modeCanvas.width = width;
            this.modeCanvas.height = height;
        }
        this.child?.onResize?.(width, height);
    }
    wantsPointerLockNow() { return false; }

    preparePauseSettings(settings) {
        const mode = settings?.mode ?? this.mode ?? 'cuboid';
        if (!GO_MODES[mode]) throw new Error(`Go mode is invalid: ${mode}.`);
        const info = GO_MODES[mode];
        const childSettings = Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
            setting.key,
            settings?.[`${info.prefix}_${setting.key}`] ?? setting.default,
        ]));
        new info.GameClass().preparePauseSettings(childSettings);
        return settings;
    }

    destroy() {
        this._selectorClick = null;
        this.modeSelector?.remove();
        this.modeSelector = null;
        this._destroyChild();
        this.mode = null;
    }

    getRecordSettings(settings = this.settings) {
        const mode = settings?.mode ?? this.mode ?? 'cuboid';
        if (!GO_MODES[mode]) throw new Error(`Go mode is invalid: ${mode}.`);
        const info = GO_MODES[mode];
        return {
            mode,
            ...Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
                setting.key,
                settings[`${info.prefix}_${setting.key}`] ?? setting.default,
            ])),
        };
    }

    static getSettingsSchema() {
        return [
            { key: 'mode', label: 'Mode', type: 'hidden', default: 'cuboid' },
            ...Object.entries(GO_MODES).flatMap(([mode, info]) => prefixedSettings(mode, info)),
            { key: 'goProfileVersion', label: 'Settings profile version', type: 'hidden', default: 2 },
        ];
    }

    static migrateSettings(settings) {
        if (Number(settings.goProfileVersion ?? 0) >= 2) return settings;
        // Preserve a legacy value exactly. The selected child validator will
        // report an invalid size; migration must not silently repair it.
        const legacySize = settings.boardSize === undefined ? 9 : Number(settings.boardSize);
        const migrated = {
            ...settings,
            mode: 'cuboid',
            cuboid_nx: legacySize,
            cuboid_ny: legacySize,
            cuboid_nz: legacySize,
            rectangle_nx: legacySize,
            rectangle_ny: legacySize,
            goProfileVersion: 2,
        };
        delete migrated.boardSize;
        return migrated;
    }

    static getControlsSchema() { return []; }
}
