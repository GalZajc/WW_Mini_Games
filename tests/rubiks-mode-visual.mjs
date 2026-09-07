import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const modes = ['torus', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron'];
const mode = process.argv[2];
if (!modes.includes(mode)) throw new Error(`Usage: node tests/rubiks-mode-visual.mjs <${modes.join('|')}>`);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'tests', 'artifacts');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9380 + modes.indexOf(mode);
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class Client {
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
            if (!message.id) { this.events.push(message); return; }
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
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    close() { this.socket.close(); }
}

async function waitFor(callback, description, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const value = await callback();
            if (value) return value;
        } catch {}
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}`);
}

async function getPage() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    if (!response.ok) return null;
    const pages = await response.json();
    return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
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
    client = new Client(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await waitFor(() => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length)`), 'game discovery');
    const state = await client.evaluate(`(async () => {
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async () => {};
        const config = window.app.gameLoader.games.find(game => game._id === 'rubiks-cuboid');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game.settings.torusU = 8;
        game.settings.torusV = 5;
        game.settings.polyhedronOrder = ${mode === 'octahedron' ? 3 : 2};
        game.pendingMode = '${mode}';
        game._renderModeSizePanel();
        game.selectMode('${mode}');
        game.render();
        await new Promise(resolve => setTimeout(resolve, 300));
        game.render();
        return {
            mode: game.mode,
            score: game.surfaceMode.currentScore,
            maximum: game.surfaceMode.model.maximumScore,
            faces: game.surfaceMode.model.faces?.length ?? 0,
            netCells: game.surfaceMode.netHitCells?.length ?? 0,
        };
    })()`);
    const capture = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(artifacts, `rubiks-${mode}-current.png`), Buffer.from(capture.data, 'base64'));
    const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
    if (exceptions.length) throw new Error(`Renderer exceptions: ${JSON.stringify(exceptions.slice(0, 2))}`);
    console.log(JSON.stringify(state));
} catch (error) {
    console.error(error.stack || error);
    if (stdout.trim()) console.error(stdout);
    if (stderr.trim()) console.error(stderr);
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
}
