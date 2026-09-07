import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'tests', 'artifacts');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9366;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CdpClient {
    constructor(url) {
        this.socket = new WebSocket(url);
        this.nextId = 1;
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
            if (!message.id) {
                this.events.push(message);
                return;
            }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
    }

    call(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const result = await this.call('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        }
        return result.result.value;
    }

    close() { this.socket.close(); }
}

async function waitFor(callback, description, timeout = 20000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const result = await callback();
            if (result) return result;
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

async function getPage() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    if (!response.ok) return null;
    const pages = await response.json();
    return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
}

async function screenshot(client, filename) {
    const result = await client.call('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    await writeFile(path.join(artifacts, filename), Buffer.from(result.data, 'base64'));
}

let stdout = '';
let stderr = '';
const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => { stdout += chunk.toString(); });
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

let client;
try {
    await mkdir(artifacts, { recursive: true });
    const page = await waitFor(getPage, 'Electron renderer');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await waitFor(
        () => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length && document.querySelector('.game-card'))`),
        'game discovery',
    );

    const gallery = await client.evaluate(`(() => {
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async () => {};
        const ids = ['number-memory', 'curve-memory', 'cup-shuffle', 'spherical-bowl-balance'];
        return Object.fromEntries(ids.map(id => {
            const card = document.querySelector('[data-game-id="' + id + '"]');
            return [id, Boolean(card?.querySelector('svg.game-card-art'))];
        }));
    })()`);
    if (Object.values(gallery).some(value => !value)) {
        throw new Error(`New games or their artwork are missing: ${JSON.stringify(gallery)}`);
    }

    const number = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'number-memory');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game._resetSession(12345);
        game._startSequence();
        const expected = game.sequence.slice(0, game._requiredLength()).join('');
        game.phase = 'input';
        game.answer = expected;
        game._finishAnswer();
        game.render();
        return {
            phase: game.phase,
            round: game.round,
            completedDigits: game.completedDigits,
            expected,
            settingsCount: game.constructor.getSettingsSchema().length,
            record: game.getRecordSettings(),
        };
    })()`);
    if (number.phase !== 'correct' || number.round !== 2 || number.completedDigits !== 1
        || number.expected.length !== 1 || number.settingsCount !== 4
        || !Object.hasOwn(number.record, 'visibleTime')) {
        throw new Error(`Number Memory integration failed: ${JSON.stringify(number)}`);
    }
    await screenshot(client, 'number-memory.png');
    await client.evaluate(`window.app.exitGame()`);

    const curve = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'curve-memory');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game._startRound(23456);
        game.playerCurve = game.targetCurve.map(point => ({ ...point }));
        game._judgeDrawing();
        game.render();
        return {
            phase: game.phase,
            points: game.targetCurve.length,
            score: game.result.score,
            turningPointMatch: game.result.turningError,
            settingsCount: game.constructor.getSettingsSchema().length,
            seed: game.seed,
        };
    })()`);
    if (curve.phase !== 'result' || curve.points < 300 || curve.score < 99
        || curve.turningPointMatch > 0.01 || curve.settingsCount !== 5 || curve.seed !== 23456) {
        throw new Error(`Curve Memory integration failed: ${JSON.stringify(curve)}`);
    }
    await screenshot(client, 'curve-memory.png');
    await client.evaluate(`window.app.exitGame()`);

    const cups = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'cup-shuffle');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game.shuffleSpeed = 1.75;
        game._startRound(34567);
        game.phase = 'shuffle';
        game._beginMove();
        while (game.phase === 'shuffle') game._completeMove();
        for (const cup of game.cups.filter(cup => cup.hasBall)) game.selected.add(cup.id);
        game._judgeSelection();
        game.render();
        const record = game.getRecordSettings();
        return {
            phase: game.phase,
            correct: game.correct,
            speed: game.roundSpeed,
            nextSpeed: game.shuffleSpeed,
            distinctSlots: new Set(game.cups.map(cup => cup.slot)).size,
            cupCount: game.parameters.cupCount,
            settingsCount: game.constructor.getSettingsSchema().length,
            speedControl: Boolean(document.querySelector('.cup-shuffle-speed-control')),
            recordExcludesSpeed: !Object.hasOwn(record, 'speed') && !Object.hasOwn(record, 'shuffleSpeed'),
        };
    })()`);
    if (cups.phase !== 'result' || !cups.correct || cups.speed !== 1.75
        || cups.nextSpeed <= cups.speed || cups.distinctSlots !== cups.cupCount
        || cups.settingsCount !== 4 || !cups.speedControl || !cups.recordExcludesSpeed) {
        throw new Error(`Cup Shuffle integration failed: ${JSON.stringify(cups)}`);
    }
    await screenshot(client, 'cup-shuffle.png');
    await client.evaluate(`window.app.exitGame()`);
    if (await client.evaluate(`Boolean(document.querySelector('.cup-shuffle-speed-control'))`)) {
        throw new Error('Cup Shuffle left its live speed control behind.');
    }

    const bowl = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'spherical-bowl-balance');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        const selectorCount = game.modeSelector.querySelectorAll('[data-mode]').length;
        game._modeChosenForSession = true;
        game._startMode('balance-point-3d');
        const pointRecord = game.getRecordSettings();
        const point = game.child;
        point._resetRun(45678);
        const initialFraction = Math.hypot(point.surfaceState.position.x, point.surfaceState.position.z)
            / point.parameters.bowlRadius;
        const fraction = (point.parameters.bandInnerFraction + point.parameters.bandOuterFraction) / 2;
        const radius = point.parameters.bowlRadius;
        point.surfaceState.position = {
            x: fraction * radius,
            y: -Math.sqrt(radius * radius - (fraction * radius) ** 2),
            z: 0,
        };
        point.surfaceState.velocity = { x: 0, y: 0, z: 0 };
        point._startRun();
        point._stepSurface(1 / 300);
        const enteredPhase = point.phase;
        point._stepSurface(1 / 300);
        const elapsed = point.elapsed;
        window.app.input.setMousePos(window.innerWidth, window.innerHeight / 2);
        point.orbitDragging = false;
        point._sampleBowlMotion(1 / 60);
        const mouseRange = point.bowl.position.x;
        const controls = {
            left: point.controls.mouseButtons.LEFT,
            right: point.controls.mouseButtons.RIGHT,
            target: point.controls.target.toArray(),
        };
        game.render();
        game.returnToModeSelector();
        game._modeChosenForSession = true;
        game._startMode('target-marble-2d');
        const marbleRecord = game.getRecordSettings();
        const has2dCanvas = Boolean(game.modeCanvas && game.child?.bodyType === 'marble');
        return {
            selectorCount,
            initialFraction,
            enteredPhase,
            elapsed,
            mouseRange,
            configuredRange: point.parameters.movementRange,
            controls,
            pointMode: pointRecord.mode,
            marbleMode: marbleRecord.mode,
            recordsIndependent: JSON.stringify(pointRecord) !== JSON.stringify(marbleRecord),
            has2dCanvas,
        };
    })()`);
    if (bowl.selectorCount !== 10 || bowl.initialFraction !== 0
        || bowl.enteredPhase !== 'timing' || bowl.elapsed <= 0
        || Math.abs(bowl.mouseRange - bowl.configuredRange) > 1e-9
        || bowl.controls.left !== 0 || bowl.controls.right !== -1
        || bowl.pointMode !== 'balance-point-3d' || bowl.marbleMode !== 'target-marble-2d'
        || !bowl.recordsIndependent || !bowl.has2dCanvas) {
        throw new Error(`Spherical Bowl Balance integration failed: ${JSON.stringify(bowl)}`);
    }
    await screenshot(client, 'spherical-bowl-balance.png');
    await client.evaluate(`window.app.exitGame()`);
    if (await client.evaluate(`Boolean(document.querySelector('.spherical-bowl-hud'))`)) {
        throw new Error('Spherical Bowl Balance left its HUD behind.');
    }

    const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
    if (exceptions.length) throw new Error(`Renderer exceptions: ${JSON.stringify(exceptions.slice(0, 3))}`);
    console.log(JSON.stringify({ gallery, number, curve, cups, bowl }, null, 2));
} catch (error) {
    console.error(error.stack || error);
    if (stdout.trim()) console.error(`Electron stdout:\n${stdout}`);
    if (stderr.trim()) console.error(`Electron stderr:\n${stderr}`);
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
}
