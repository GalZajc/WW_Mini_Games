import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'tests', 'artifacts');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9371;
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
            if (!message.id) return;
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

async function waitFor(callback, description, timeout = 30000) {
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

async function screenshot(client, name) {
    await client.call('Page.bringToFront');
    await delay(300);
    const result = await client.call('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    });
    await writeFile(path.join(artifacts, name), Buffer.from(result.data, 'base64'));
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
    await waitFor(() => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length && document.querySelector('.game-card'))`), 'main menu');
    await client.evaluate(`(() => {
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async () => {};
    })()`);

    await waitFor(() => client.evaluate(`[...document.querySelectorAll('.game-card-thumb img')]
        .every(image => image.complete && image.naturalWidth > 0)`), 'launcher thumbnails');
    await screenshot(client, 'generated-art-main-menu.png');

    const captureModeSelector = async (gameId, fileName) => {
        await client.evaluate(`(async () => {
            const config = window.app.gameLoader.games.find(game => game._id === ${JSON.stringify(gameId)});
            await window.app.launchGame(config);
        })()`);
        await waitFor(() => client.evaluate(`(() => {
            const images = [...document.querySelectorAll('.ww-mode-select .game-card-art')]
                .filter(image => image.tagName === 'IMG');
            return images.length > 0 && images.every(image => image.complete && image.naturalWidth > 0);
        })()`), `${gameId} mode thumbnails`);
        await screenshot(client, fileName);
        await client.evaluate(`window.app.exitGame()`);
    };

    await captureModeSelector('classic-board', 'classic-board-mode-selector-icons.png');
    await captureModeSelector('card-lounge', 'card-lounge-mode-selector-icons.png');
    await captureModeSelector('reromo-tetris', 'tetris-mode-selector-icons.png');

    const captureCollectionMode = async (gameId, mode, setupExpression, fileName) => {
        await client.evaluate(`(async () => {
            const config = window.app.gameLoader.games.find(game => game._id === ${JSON.stringify(gameId)});
            await window.app.launchGame(config);
            document.querySelector('[data-mode=${JSON.stringify(mode)}]').click();
            await new Promise(resolve => setTimeout(resolve, 100));
            document.querySelector('.session-lobby [data-action="solo"]')?.click();
            await new Promise(resolve => setTimeout(resolve, 120));
            const game = window.app.currentGame;
            ${setupExpression}
            game.render();
        })()`);
        await screenshot(client, fileName);
        await client.evaluate(`window.app.exitGame()`);
    };

    await captureCollectionMode('classic-board', 'checkers', '', 'classic-board-checkers.png');
    await captureCollectionMode('classic-board', 'chess', '', 'classic-board-chess-reference.png');
    await captureCollectionMode('classic-board', 'memory', '', 'classic-board-memory-reference.png');
    await captureCollectionMode('card-lounge', 'eights', '', 'card-lounge-eights.png');
    await captureCollectionMode('card-lounge', 'war', `game._applyAction({ kind: 'round' }, 0);`, 'card-lounge-war.png');
    await captureCollectionMode('card-lounge', 'memory', `
        const first = 0;
        const mate = game.state.cards.findIndex((card, index) => index !== first && card.pair === game.state.cards[first].pair);
        const secondPair = game.state.cards.find((card, index) => index !== first && index !== mate && card.pair !== game.state.cards[first].pair)?.pair;
        const secondPairIndices = game.state.cards.map((card, index) => ({ card, index })).filter(item => item.card.pair === secondPair).map(item => item.index);
        game.state.open = [first, mate];
        game.state.matched = secondPairIndices;
    `, 'card-lounge-memory.png');

    await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'classic-board');
        await window.app.launchGame(config);
        document.querySelector('[data-mode="scrabble"]').click();
    })()`);
    await waitFor(() => client.evaluate(`window.app.currentGame?.child?.phase === 'lobby'`), 'Slovenian dictionary');
    await client.evaluate(`(() => {
        document.querySelector('.session-lobby [data-action="solo"]').click();
        const game = window.app.currentGame.child;
        const letters = [...'ČLOVEK'];
        const start = Math.floor(game.state.size / 2) - 2;
        letters.forEach((letter, index) => {
            game.state.board[Math.floor(game.state.size / 2)][start + index] = {
                id: 9000 + index,
                letter,
                points: { 'Č': 5, 'L': 1, 'O': 1, 'V': 2, 'E': 1, 'K': 3 }[letter],
            };
        });
        game.state.scores[1] = 18;
        game.state.turn = 2;
        game.message = 'ČLOVEK: 18 točk.';
        window.app.currentGame.render();
    })()`);
    await screenshot(client, 'word-tiles-played.png');
    await client.evaluate(`window.app.exitGame()`);

    console.log('Captured new game-art reference frames.');
} catch (error) {
    console.error(error.stack || error);
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(3000)]);
}
