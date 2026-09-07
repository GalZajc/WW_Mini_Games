import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9388;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CdpClient {
    constructor(url) {
        this.socket = new WebSocket(url);
        this.nextId = 1;
        this.pending = new Map();
    }
    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
        this.socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
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
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result.value;
    }
    close() { this.socket.close(); }
}

async function waitFor(callback, description, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const result = await callback();
            if (result) return result;
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

const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
});

let client;
try {
    const page = await waitFor(getPage, 'Electron renderer');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');

    await waitFor(() => client.evaluate('Boolean(window.app && window.app.gameLoader && window.app.gameLoader.games.length)'), 'app loaded');

    await client.evaluate(`(() => {
        const game = window.app.gameLoader.games.find(g => g._id === 'pogo-cloud-jump');
        return window.app.launchGame(game);
    })()`);

    await delay(1000);

    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        if (game) {
            game._startRun();
            game.monster.y = 2.4;
            game.monster.angle = 0.08;
            game.render();
        }
    })()`);

    await delay(500);

    // Get canvas clip bounds
    const clip = await client.evaluate(`(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
            scale: 1,
        };
    })()`);

    const result = await client.call('Page.captureScreenshot', {
        format: 'png',
        clip: clip || undefined,
        fromSurface: true,
    });

    const outDir = 'C:\\Users\\galza\\.gemini\\antigravity\\brain\\99ead09b-e792-4688-abcf-0162b0b68b25';
    const outFile = path.join(outDir, 'pogo_gameplay_screenshot.png');
    await writeFile(outFile, Buffer.from(result.data, 'base64'));
    console.log('Saved screenshot to', outFile);

    // Also capture a tight close-up of the monster
    const monsterPos = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        const layout = game._layout();
        const pos = game._toScreen(game.monster.x, game.monster.y, layout.width);
        const canvasRect = game.canvas.getBoundingClientRect();
        const monsterScreenX = canvasRect.left + pos.x * layout.scale;
        const monsterScreenY = canvasRect.top + pos.y * layout.scale;
        return {
            x: Math.round(monsterScreenX - 80),
            y: Math.round(monsterScreenY - 100),
            width: 160,
            height: 220,
            scale: 1,
        };
    })()`);

    const closeUpResult = await client.call('Page.captureScreenshot', {
        format: 'png',
        clip: monsterPos,
        fromSurface: true,
    });
    const closeUpFile = path.join(outDir, 'monster_close_up.png');
    await writeFile(closeUpFile, Buffer.from(closeUpResult.data, 'base64'));
    console.log('Saved monster close-up to', closeUpFile);

    // Now turn left and capture
    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        if (game) {
            game.monster.angle = -0.15;
            game.monster.facing = -1;
            game.render();
        }
    })()`);
    await delay(200);

    const leftResult = await client.call('Page.captureScreenshot', {
        format: 'png',
        clip: monsterPos,
        fromSurface: true,
    });
    const leftFile = path.join(outDir, 'monster_facing_left.png');
    await writeFile(leftFile, Buffer.from(leftResult.data, 'base64'));
    console.log('Saved monster facing left to', leftFile);
} finally {
    client?.close();
    child.kill();
    await delay(250);
    if (!child.killed) child.kill('SIGKILL');
}
