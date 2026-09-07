import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'tests', 'artifacts');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9365;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

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
    await mkdir(artifacts, { recursive: true });
    const page = await waitFor(getPage, 'Electron renderer');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await waitFor(() => client.evaluate(`(() => {
        const cards = [...document.querySelectorAll('.game-card')];
        const images = [...document.querySelectorAll('.game-card-thumb img')];
        const artwork = [...document.querySelectorAll('.game-card-thumb img, .game-card-thumb svg.game-card-art')];
        return cards.length > 0 && cards.length === window.app.gameLoader.games.length
            && artwork.length === cards.length && images.length > 0 && images.every(image =>
                image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
    })()`), 'all generated launcher thumbnails');
    // The gallery staggers its short entrance animation across the first ten cards.
    await delay(900);

    const layout = await client.evaluate(`(() => {
        const cards = [...document.querySelectorAll('.game-card')];
        return cards.map(card => {
            const thumb = card.querySelector('.game-card-thumb').getBoundingClientRect();
            const info = card.querySelector('.game-card-info').getBoundingClientRect();
            const image = card.querySelector('img');
            return {
                id: card.dataset.gameId,
                source: image?.getAttribute('src') || 'inline-svg',
                naturalSize: image ? [image.naturalWidth, image.naturalHeight] : null,
                overlap: Math.max(0, thumb.bottom - info.top),
            };
        });
    })()`);
    if (layout.some(card => card.overlap > 1)) {
        throw new Error(`Artwork overlaps the title strip: ${JSON.stringify(layout)}`);
    }
    await client.call('Page.bringToFront');
    const result = await client.call('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    await writeFile(path.join(artifacts, 'launcher-generated-thumbnails.png'), Buffer.from(result.data, 'base64'));
    console.log(JSON.stringify(layout, null, 2));
} finally {
    client?.close();
    child.kill();
    await delay(250);
    if (!child.killed) child.kill('SIGKILL');
}
