import test from 'node:test';
import assert from 'node:assert/strict';
import Game from '../renderer/games/cup-and-ball/game-2d.js';

function create(settings = {}) {
    const game = Object.create(Game.prototype);
    Object.defineProperties(game, { w: { value: 1200, writable: true }, h: { value: 700, writable: true } });
    Object.assign(game, { settings,
        input: { getMousePos: () => ({ x: 600, y: 350 }) },
        _ensureHud() {}, _renderHud() {} });
    game.init();
    return game;
}

test('large radial damping dissipates energy without reversing outward velocity', () => {
    for (const damping of [200, 2000, 100000]) {
        const game = create({ gravity: 0, ropeDamping: damping });
        game.ballPosition.y -= 0.1;
        game.ballVelocity.y = -10;
        const energy = () => {
            const stretch = Math.max(0, Math.hypot(game.ballPosition.x - game.attachPoint.x,
                game.ballPosition.y - game.attachPoint.y) - game.parameters.ropeLength);
            return (game.ballVelocity.x ** 2 + game.ballVelocity.y ** 2
                + game.parameters.ropeStiffness * stretch ** 2) / 2;
        };
        let previous = energy();
        game._integrateBall(game.parameters.fixedTimeStep);
        assert.ok(game.ballVelocity.y <= 0, 'damping must not bounce the ball inward');
        for (let i = 0; i < 1800; i++) {
            game._integrateBall(game.parameters.fixedTimeStep);
            const next = energy();
            assert.ok(Number.isFinite(next) && next <= previous + 1e-8);
            previous = next;
        }
    }
});

test('view fits long ropes and edge cursor positions in wide and narrow windows', () => {
    for (const [w, h] of [[1200, 700], [360, 800]]) {
        const game = create({ ropeLength: 8 });
        Object.assign(game, { w, h });
        const view = game._view();
        const p = game.parameters;
        assert.ok(h / view.scale >= 2.6 * (p.ropeLength + p.cupDepth + 2 * p.ballRadius) - 1e-8);
        for (const [x, y] of [[0, 0], [w, h]]) {
            game.input.getMousePos = () => ({ x, y });
            const center = game._worldToScreen(game._mouseToWorld());
            assert.ok(center.x >= -1e-8 && center.x <= w + 1e-8);
            assert.ok(center.y >= -1e-8 && center.y <= h + 1e-8);
        }
        game.input.getMousePos = () => ({ x: w * 0.5, y: 0 });
        const topCenter = game._worldToScreen(game._mouseToWorld());
        game.input.getMousePos = () => ({ x: w * 0.5, y: h });
        const bottomCenter = game._worldToScreen(game._mouseToWorld());
        assert.ok(Math.abs(bottomCenter.y - topCenter.y - h) < 1e-6, 'vertical movement must span full window height');
    }
});
