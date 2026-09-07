import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9372;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class Client {
    constructor(url) {
        this.socket = new WebSocket(url);
        this.id = 0;
        this.pending = new Map();
        this.events = [];
    }
    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
        this.socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
            if (!message.id) { this.events.push(message); return; }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
    }
    call(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async evaluate(expression) {
        const result = await this.call('Runtime.evaluate', {
            expression, awaitPromise: true, returnByValue: true, userGesture: true,
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result.value;
    }
    close() { this.socket.close(); }
}

async function waitFor(callback, label, timeout = 20000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const result = await callback();
            if (result) return result;
        } catch (error) { lastError = error; }
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk.toString(); });
let client;

try {
    const page = await waitFor(async () => {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
        if (!response.ok) return null;
        return (await response.json()).find(item => item.type === 'page' && item.webSocketDebuggerUrl);
    }, 'Electron renderer');
    client = new Client(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await waitFor(
        () => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length)`),
        'game discovery',
    );
    await client.evaluate(`window.app.settingsManager.save = async () => {}; window.app.records.addRecord = async () => {};`);

    const bowl = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(item => item._id === 'spherical-bowl-balance');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const selectorCount = game.modeSelector.querySelectorAll('[data-mode]').length;
        game._modeChosenForSession = true;
        game._startMode('balance-point-3d');
        const point = game.child;
        const initial = {
            radial: Math.hypot(point.surfaceState.position.x, point.surfaceState.position.z),
            y: point.surfaceState.position.y,
            hud: Boolean(document.querySelector('.spherical-bowl-hud')),
            renderer: Boolean(point.renderer),
            controls: { left: point.controls.mouseButtons.LEFT, right: point.controls.mouseButtons.RIGHT },
        };
        window.app.input.setMousePos(window.innerWidth, window.innerHeight / 2);
        point.orbitDragging = false;
        point._sampleBowlMotion(1 / 60);
        const directRange = point.bowl.position.x;
        const requestedRange = point.parameters.movementRange;
        const pointRecord = game.getRecordSettings();
        game.returnToModeSelector();
        game._modeChosenForSession = true;
        game._startMode('target-marble-2d');
        const marbleRecord = game.getRecordSettings();
        const twoD = {
            canvas: Boolean(game.modeCanvas),
            body: game.child.bodyType,
            targetOutside: Math.abs(game.child.target.x) > game.child.parameters.movementCircleRadius,
        };
        return {
            selectorCount, initial, directRange, requestedRange, pointRecord, marbleRecord, twoD,
        };
    })()`);
    if (bowl.selectorCount !== 10 || bowl.initial.radial !== 0 || !bowl.initial.hud
        || !bowl.initial.renderer || bowl.initial.controls.left !== -1 || bowl.initial.controls.right !== 0
        || !(bowl.directRange > 0 && Number.isFinite(bowl.directRange))
        || bowl.pointRecord.mode !== 'balance-point-3d'
        || bowl.marbleRecord.mode !== 'target-marble-2d'
        || !bowl.twoD.canvas || bowl.twoD.body !== 'marble' || !bowl.twoD.targetOutside) {
        throw new Error(`Spherical Bowl smoke failed: ${JSON.stringify(bowl)}`);
    }
    await client.evaluate(`window.app.exitGame()`);
    if (await client.evaluate(`Boolean(document.querySelector('.spherical-bowl-hud'))`)) {
        throw new Error('Spherical Bowl HUD was not removed on exit.');
    }

    const dino = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(item => item._id === 'dino-runner');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const initial = { phase: game.phase, button: game.playButton?.textContent, y: game.dinoY };
        game.playButton.click();
        const afterPlay = { phase: game.phase, y: game.dinoY };
        game._jump();
        for (let index = 0; index < 20; index++) game._step(1 / 240);
        const jumped = game.dinoY > 0;
        game.dinoY = 0;
        game.dinoVelocityY = 0;
        game.onGround = true;
        game.distance = game.obstacles[0].x - 2.65;
        game._step(1 / 240);
        return {
            initial, afterPlay, jumped, phase: game.phase,
            replay: game.playButton?.textContent,
        };
    })()`);
    if (dino.initial.phase !== 'ready' || dino.initial.button !== 'PLAY' || dino.initial.y !== 0
        || dino.afterPlay.phase !== 'running' || dino.afterPlay.y !== 0 || !dino.jumped
        || dino.phase !== 'gameover' || dino.replay !== 'PLAY AGAIN') {
        throw new Error(`Dino smoke failed: ${JSON.stringify(dino)}`);
    }
    await client.evaluate(`window.app.exitGame()`);

    const cup = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(item => item._id === 'cup-and-ball');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game._modeChosenForSession = true;
        game._startMode('2d');
        const child = game.child;
        const segment = child._cupCollisionSegments()[2];
        const midpoint = { x: (segment[0].x + segment[1].x) / 2, y: (segment[0].y + segment[1].y) / 2 };
        const tangent = { x: segment[1].x - segment[0].x, y: segment[1].y - segment[0].y };
        const length = Math.hypot(tangent.x, tangent.y);
        const normal = { x: -tangent.y / length, y: tangent.x / length };
        child.ballPosition = {
            x: midpoint.x + normal.x * child.parameters.ballRadius * .35,
            y: midpoint.y + normal.y * child.parameters.ballRadius * .35,
        };
        child.ballVelocity = { x: -normal.x * 4, y: -normal.y * 4 };
        const before = { ...child.ballVelocity };
        child._resolveCupCollisions();
        const relativeNormalAfter = child.ballVelocity.x * normal.x + child.ballVelocity.y * normal.y;
        return {
            canvas: Boolean(game.modeCanvas), restitution: child.parameters.cupRestitution,
            friction: child.parameters.cupFriction, before, relativeNormalAfter,
        };
    })()`);
    if (!cup.canvas || cup.restitution <= 0 || cup.friction <= 0 || cup.relativeNormalAfter <= 0) {
        throw new Error(`Cup collision smoke failed: ${JSON.stringify(cup)}`);
    }
    await client.evaluate(`window.app.exitGame()`);

    const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
    if (exceptions.length) throw new Error(`Renderer exceptions: ${JSON.stringify(exceptions.slice(0, 3))}`);
    console.log(JSON.stringify({ bowl, dino, cup }, null, 2));
} catch (error) {
    console.error(error.stack || error);
    if (stderr.trim()) console.error(`Electron stderr:\n${stderr}`);
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
}
