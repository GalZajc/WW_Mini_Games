import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 14683;
const seed = 123456789;
const settings = { rows: 17, columns: 15, minimumColors: 15, maximumColors: 23, moveMode: 'strokes', timedPuzzleCount: 5 };
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'renderer', 'games', 'flow-lines', 'OUTPUT', `electron-${stamp}`);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'parameters.json'), JSON.stringify({ settings, seed }, null, 2), 'utf8');

class Client {
    constructor(url) { this.socket = new WebSocket(url); this.pending = new Map(); this.id = 0; this.events = []; }
    async connect() {
        await new Promise((resolve, reject) => { this.socket.once('open', resolve); this.socket.once('error', reject); });
        this.socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
            if (!message.id) { this.events.push(message); return; }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
        });
    }
    call(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.id;
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async evaluate(expression) {
        const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    close() { this.socket.close(); }
}

const child = spawn(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['--mute-audio', '.', `--remote-debugging-port=${port}`], {
        cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1', WW_MINI_GAMES_OFFSCREEN_TEST: '1' },
    });
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
let client;
async function waitFor(callback, label, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const value = await callback();
        if (value) return value;
        if (child.exitCode !== null) throw new Error(`Electron exited while waiting for ${label}: ${logs}`);
        await delay(75);
    }
    throw new Error(`Timed out: ${label}`);
}
async function screenshot(name) {
    await client.evaluate('window.app.currentGame?.render()');
    const image = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(output, name), Buffer.from(image.data, 'base64'));
}

try {
    const page = await waitFor(async () => {
        try { const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); return pages.find(page => page.type === 'page'); }
        catch { return null; }
    }, 'renderer');
    client = new Client(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await waitFor(() => client.evaluate('Boolean(window.app?.gameLoader?.games?.length)'), 'game discovery');
    await client.evaluate(`(() => {
        window.flowRecords = [];
        window.flowHeartbeat = 0;
        setInterval(() => window.flowHeartbeat++, 50);
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            postMessage(message, ...rest) {
                if (message?.rows && message?.columns && 'seed' in message) message = { ...message, seed: ${seed} };
                return super.postMessage(message, ...rest);
            }
        };
        const load = window.app.settingsManager.load.bind(window.app.settingsManager);
        window.app.settingsManager.load = async (id, schema) => id === 'flow-lines' ? ${JSON.stringify(settings)} : load(id, schema);
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async (...record) => window.flowRecords.push(record);
    })()`);
    const started = Date.now();
    await client.evaluate(`window.app.launchGame(window.app.gameLoader.games.find(game => game._id === 'flow-lines'))`);
    assert.equal(await client.evaluate('window.app.currentGame.phase'), 'generating');
    await screenshot('generating.png');
    await waitFor(() => client.evaluate(`window.app.currentGame.phase === 'error' ? Promise.reject(new Error(window.app.currentGame.errorMessage)) : window.app.currentGame.phase === 'playing'`), 'certified 17x15 puzzle');
    const board = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        return { colors: game.colorCount, quality: game.puzzle.quality, proof: game.puzzle.uniquenessProof,
            heartbeat: window.flowHeartbeat, workerStopped: game._generationWorker === null,
            structuredClone: game.puzzle.endpointByCell instanceof Map && game.puzzle.targetEdges[0] instanceof Set };
    })()`);
    assert.equal(board.colors, 15);
    assert.equal(board.proof.includesIncompleteRoutings, true);
    assert.equal(board.proof.solutionCount, 1);
    assert.ok(board.quality.turns >= 30);
    assert.ok(board.heartbeat > 5);
    assert.ok(board.workerStopped && board.structuredClone);
    await screenshot('puzzle.png');
    await client.evaluate(`(() => {
        const g = window.app.currentGame;
        g.edgeSets = g.puzzle.targetEdges.map(edges => new Set(edges));
        g._rebuildOccupancy();
    })()`);
    assert.equal(await client.evaluate('window.app.currentGame._isFullCoverSolution()'), true);
    await screenshot('solution.png');

    const drag = await client.evaluate(`(() => {
        const g = window.app.currentGame;
        const color = g.colorCount - 1;
        g.edgeSets[color].clear(); g.moveCount = color; g.strokeHistory = []; g._rebuildOccupancy(); g.render();
        const rect = g.canvas.getBoundingClientRect();
        return g.puzzle.paths[color].map(cell => ({
            x: rect.left + (g.layout.x + ((cell % g.columns) + .5) * g.layout.cell) * rect.width / g.canvas.width,
            y: rect.top + (g.layout.y + (Math.floor(cell / g.columns) + .5) * g.layout.cell) * rect.height / g.canvas.height,
        }));
    })()`);
    await client.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...drag[0], button: 'left', buttons: 1, clickCount: 1 });
    for (const point of drag.slice(1)) await client.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, buttons: 1 });
    await client.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...drag.at(-1), button: 'left', clickCount: 1 });
    assert.equal(await client.evaluate('window.app.currentGame.phase'), 'solved');
    await client.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ' });
    await client.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ' });
    assert.equal(await client.evaluate('window.app.currentGame.phase'), 'playing');

    await client.evaluate(`window.app.restartGame({rows:6, columns:6, minimumColors:4, maximumColors:6, moveMode:'timed', timedPuzzleCount:2})`);
    await waitFor(() => client.evaluate(`window.app.currentGame.phase === 'playing'`), 'timed puzzle');
    await client.evaluate('window.app.pauseGame()');
    const pausedBefore = await client.evaluate('window.app.currentGame._currentTimedPuzzleElapsed()');
    await delay(200);
    const pausedAfter = await client.evaluate('window.app.currentGame._currentTimedPuzzleElapsed()');
    assert.ok(Math.abs(pausedAfter - pausedBefore) < 1);
    await client.evaluate(`window.app.pauseMenu.hide(); window.app.resumeGame();
        window.app.currentGame.edgeSets = window.app.currentGame.puzzle.targetEdges.map(edges => new Set(edges));
        window.app.currentGame._completePuzzle();`);
    assert.equal(await client.evaluate('window.app.currentGame.timedSolvedCount'), 1);
    assert.equal(await client.evaluate('window.flowRecords.length'), 0);
    await client.evaluate('window.app.currentGame._startNextPuzzle()');
    await waitFor(() => client.evaluate(`window.app.currentGame.phase === 'playing'`), 'second timed puzzle');
    await client.evaluate(`window.app.currentGame.edgeSets = window.app.currentGame.puzzle.targetEdges.map(edges => new Set(edges));
        window.app.currentGame._completePuzzle(); window.app.currentGame._finalizeSolvedPuzzle();`);
    assert.equal(await client.evaluate('window.app.currentGame.phase'), 'run-complete');
    const records = await client.evaluate('window.flowRecords');
    assert.equal(records.length, 1);
    assert.equal(records[0][2].puzzlesCompleted, 2);
    assert.ok(records[0][2].elapsedMs > 0);
    await client.evaluate(`window.app.restartGame(${JSON.stringify(settings)}); window.app.exitGame();`);
    await delay(200);
    assert.equal(await client.evaluate('window.app.currentGame === null'), true);
    const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
    assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
    const result = { board, elapsedMilliseconds: Date.now() - started, pausedClockStable: true,
        pointerSolveAndUndo: true, timedSeries: records[0][2], generationCancellation: true, rendererExceptions: 0 };
    await writeFile(path.join(output, 'results.json'), JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ ...result, output }, null, 2));
} catch (error) {
    console.error(error.stack || error);
    console.error(logs.slice(-6000));
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
}
