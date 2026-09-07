import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..', '..', '..', '..');
const electronPath = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const artifactDir = path.join(here, 'artifacts');
const debugPort = 9347;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
            if (message.id) {
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message));
                else pending.resolve(message.result);
            } else {
                this.events.push(message);
            }
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

    close() {
        this.socket.close();
    }
}

async function getPages() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    if (!response.ok) throw new Error(`DevTools endpoint returned ${response.status}`);
    return response.json();
}

async function waitFor(fn, description, timeout = 15000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const value = await fn();
            if (value) return value;
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

async function screenshot(client, filename) {
    const result = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(artifactDir, filename), Buffer.from(result.data, 'base64'));
}

async function setViewport(client, width, height) {
    await client.call('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
    });
    await client.evaluate(`window.dispatchEvent(new Event('resize'))`);
    await delay(80);
}

async function clearViewport(client) {
    await client.call('Emulation.clearDeviceMetricsOverride');
    await client.evaluate(`window.dispatchEvent(new Event('resize'))`);
    await delay(80);
}

async function keyDown(client, code, key) {
    await client.call('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: key?.charCodeAt?.(0) || 0 });
}

async function keyUp(client, code, key) {
    await client.call('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: key?.charCodeAt?.(0) || 0 });
}

async function pumpFrames(client, count = 1, dt = 1 / 60) {
    await client.evaluate(`(() => {
        for (let index = 0; index < ${count}; index++) {
            window.app.input.update();
            const game = window.app.currentGame;
            if (game) {
                game.update(${dt});
                game.render();
            }
            window.app.input.postUpdate();
        }
        return true;
    })()`);
}

async function tapKey(client, code, key, duration = 45) {
    await keyDown(client, code, key);
    await pumpFrames(client, Math.max(1, Math.ceil(duration / (1000 / 60))));
    await keyUp(client, code, key);
    await pumpFrames(client, 1);
}

async function benchmarkRenderer(client, samples = 20) {
    return client.evaluate(`(() => {
        const game = window.app.currentGame;
        const samples = [];
        for (let index = 0; index < ${samples}; index++) {
            game.invalidate();
            game.render();
            samples.push(game.lastRenderDurationMs);
        }
        samples.sort((a, b) => a - b);
        return {
            min: samples[0],
            median: samples[Math.floor(samples.length / 2)],
            p95: samples[Math.floor(samples.length * 0.95)],
            max: samples[samples.length - 1],
        };
    })()`);
}

await mkdir(artifactDir, { recursive: true });
let stdout = '';
let stderr = '';
const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: projectRoot,
    windowsHide: true,
    env: {
        ...process.env,
        WW_MINI_GAMES_HEADLESS_TEST: '1',
        ELECTRON_ENABLE_LOGGING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => { stdout += chunk.toString(); });
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

let client;
try {
    const page = await waitFor(async () => {
        const pages = await getPages();
        return pages.find(candidate => candidate.type === 'page' && candidate.webSocketDebuggerUrl);
    }, 'Electron renderer page');

    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await client.call('Log.enable');

    await waitFor(
        () => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length)`),
        'WW Mini Games initialization',
    );
    const discovered = await client.evaluate(`window.app.gameLoader.games.map(game => game._id)`);
    if (!discovered.includes('reromo-tetris')) throw new Error('ReRoMo Tetris was not discovered.');

    await client.evaluate(`(async () => {
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async () => {};
        const config = window.app.gameLoader.games.find(game => game._id === 'reromo-tetris');
        await window.app.launchGame(config);
        if (window.app.currentGame.modeSelector?.querySelectorAll('[data-mode]').length !== 2) {
            throw new Error('ReRoMo Tetris did not show Survival and Sprint.');
        }
        // Deterministic legacy migration fixture: the previously active
        // Möbius board was very wide. Polar must not inherit those values.
        window.app.currentGame.settings = {
            ...window.app.currentGame.settings,
            mode: 'mobius',
            phiSegments: 94,
            rSegments: 12,
            modeProfiles: {},
        };
        window.app.currentGame._showModeSelector();
        window.app.currentGame.modeSelector.querySelector('[data-mode="survival"]').click();
        const polarCard = window.app.currentGame.modeSelector.querySelector('[data-mode="circular"]');
        polarCard.click();
        return true;
    })()`);
    await waitFor(
        () => client.evaluate(`Boolean(window.app.currentGame?.getDebugSnapshot)`),
        'ReRoMo Tetris launch',
    );
    await waitFor(
        () => client.evaluate(`(() => {
            const snapshot = window.app.currentGame?.getDebugSnapshot();
            return snapshot?.mode === 'circular' && snapshot.renderCount > 0 &&
                !snapshot.projectionLoading && !snapshot.projectionError;
        })()`),
        'first polar gameplay frame selected through the visible launcher',
    );
    await screenshot(client, 'polar-from-launcher.png');
    const initialProfileIsolation = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        return {
            active: [game.columns, game.rows],
            polar: [game.settings.modeProfiles.circular.phiSegments, game.settings.modeProfiles.circular.rSegments],
            mobius: [game.settings.modeProfiles.mobius.phiSegments, game.settings.modeProfiles.mobius.rSegments],
        };
    })()`);
    if (initialProfileIsolation.active.join('x') !== '24x18' ||
        initialProfileIsolation.polar.join('x') !== '24x18' ||
        initialProfileIsolation.mobius.join('x') !== '94x12') {
        throw new Error(`Tetris mode settings leaked between profiles: ${JSON.stringify(initialProfileIsolation)}`);
    }

    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const settingsModule = await import('./games/reromo-tetris/settings.js');
        game.settings = settingsModule.createDefaultSettings();
        window.app.currentSettings = structuredClone(game.settings);
        window.app.currentBindings = settingsModule.getDefaultBindings();
        game.input.setActionBindings(structuredClone(window.app.currentBindings));
        game.restart();
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 2, phi: Math.floor(game.columns / 2), rotation: 0 };
        game.state = 'playing';
        game.canHold = true;
        game._refreshPieceProjection();
        return true;
    })()`);
    const controlsStart = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    await tapKey(client, 'ArrowLeft', 'ArrowLeft', 10);
    const afterMove = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterMove.currentPiece.phi !== (controlsStart.currentPiece.phi + 1) % controlsStart.columns) {
        throw new Error(`Move Left binding did not move exactly one field: ${JSON.stringify({ controlsStart, afterMove })}`);
    }
    await tapKey(client, 'ArrowRight', 'ArrowRight', 10);
    const afterCounterMove = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterCounterMove.currentPiece.phi !== controlsStart.currentPiece.phi) {
        throw new Error(`Move Right binding did not move exactly one field: ${JSON.stringify({ controlsStart, afterCounterMove })}`);
    }

    // The standalone game matched KeyboardEvent.key, not the physical code.
    // On a Slovenian QWERTZ layout the key labelled Z reports code KeyY.
    await tapKey(client, 'KeyY', 'z');
    const afterRotate = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterRotate.currentPiece.rotation !== 1) throw new Error('Clockwise rotation binding failed.');
    await tapKey(client, 'KeyT', 't');
    const afterCounterRotate = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterCounterRotate.currentPiece.rotation !== 0) throw new Error('Anti-clockwise rotation binding failed.');
    await tapKey(client, 'ArrowUp', 'ArrowUp');
    const afterHalfTurn = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterHalfTurn.currentPiece.rotation !== 2) throw new Error('180-degree rotation binding failed.');
    await tapKey(client, 'KeyU', 'u');
    const afterHold = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterHold.heldPiece !== 'T' || afterHold.canHold) throw new Error('Hold binding failed.');
    await tapKey(client, 'KeyU', 'u');
    const afterSecondHold = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterSecondHold.heldPiece !== afterHold.heldPiece ||
        afterSecondHold.currentPiece.name !== afterHold.currentPiece.name || afterSecondHold.canHold) {
        throw new Error(`Hold was incorrectly allowed twice before locking: ${JSON.stringify({ afterHold, afterSecondHold })}`);
    }

    await tapKey(client, 'KeyR', 'r');
    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 2, phi: Math.floor(game.columns / 2), rotation: 0 };
        game.state = 'playing';
        game._refreshPieceProjection();
        return true;
    })()`);
    const normalStart = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings.das = 100;
        game.settings.arr = 80;
        game.settings.quickMotionMultiplier = 4;
        game.settings.mode = 'rectangular';
        game._rebuildProjectionCache();
        game.gameSpeed = 1000000;
        game.lockDelay = 1000000;
        return game.currentPiece.phi;
    })()`);
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 15);
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    const normalEnd = await client.evaluate(`window.app.currentGame.getDebugSnapshot().currentPiece.phi`);
    const normalDistance = normalStart - normalEnd;

    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 2, phi: Math.floor(game.columns / 2), rotation: 0 };
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    const quickStart = await client.evaluate(`window.app.currentGame.getDebugSnapshot().currentPiece.phi`);
    // Number-row 6 and numpad 6 both have KeyboardEvent.key === '6'.
    await keyDown(client, 'Numpad6', '6');
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 15);
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await keyUp(client, 'Numpad6', '6');
    await pumpFrames(client, 1);
    const quickEnd = await client.evaluate(`window.app.currentGame.getDebugSnapshot().currentPiece.phi`);
    const quickDistance = quickStart - quickEnd;
    if (normalDistance < 2 || quickDistance <= normalDistance + 2) {
        throw new Error(`Quick Motion did not accelerate ARR: ${JSON.stringify({ normalDistance, quickDistance })}`);
    }

    // Moving along the floor must not postpone locking forever. This was the
    // most visible regression in the first integration.
    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 2, phi: Math.floor(game.columns / 2), rotation: 0 };
        game.state = 'playing';
        game.settings.das = 0;
        game.settings.arr = 20;
        game.gameSpeed = 1000000;
        game.lockDelay = 200;
        game.currentPiece.r = game._findGhostR(game.currentPiece);
        game.groundedElapsed = 0;
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 14, 0.02);
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    const afterGroundedMovement = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterGroundedMovement.occupiedCells !== 4 || afterGroundedMovement.groundedElapsed !== 0) {
        throw new Error(`Grounded movement prevented the lock delay: ${JSON.stringify(afterGroundedMovement)}`);
    }

    const progression = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings.initialSpeed = 400;
        game.settings.speedIncrease = 80;
        game.settings.initialLockDelay = 1500;
        game.settings.lockDelayDecrease = 80;
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = null;
        game.state = 'playing';
        game.linesCleared = 9;
        game.score = 0;
        const originalSaveLegacyHighScores = game._saveLegacyHighScores;
        game._saveLegacyHighScores = () => {};
        game._completeLineClear(1);
        game._saveLegacyHighScores = originalSaveLegacyHighScores;
        return game.getDebugSnapshot();
    })()`);
    if (progression.lines !== 10 || progression.level !== 2 || progression.score !== 100 ||
        Math.abs(progression.gameSpeed - 320) > 1e-9 || Math.abs(progression.lockDelay - 1200) > 1e-9) {
        throw new Error(`Speed/lock-delay progression changed: ${JSON.stringify(progression)}`);
    }

    const lineClearTiming = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings.lineClearDuration = 60;
        game.lineClear = { rows: [0], rowSet: new Set([0]), elapsed: 0, phase: 0, flashOn: true };
        game._updateLineClear(59);
        const before = { phase: game.lineClear.phase, elapsed: game.lineClear.elapsed };
        game._updateLineClear(1);
        const after = { phase: game.lineClear.phase, elapsed: game.lineClear.elapsed };
        game.lineClear = null;
        return { before, after };
    })()`);
    if (lineClearTiming.before.phase !== 0 || lineClearTiming.before.elapsed !== 59 ||
        lineClearTiming.after.phase !== 1 || lineClearTiming.after.elapsed !== 0) {
        throw new Error(`Line-clear duration setting was ignored: ${JSON.stringify(lineClearTiming)}`);
    }

    const softDropTiming = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[1][0];
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 0, phi: 12, rotation: 0 };
        game.gameSpeed = 400;
        game.settings.softDropSpeed = 10;
        game.softDropActive = true;
        game.softDropElapsed = 0;
        game.score = 0;
        const originalIsActionDown = game.input.isActionDown;
        game.input.isActionDown = action => action === 'softDrop' || originalIsActionDown.call(game.input, action);
        game._updateSoftDrop(39);
        const before = { r: game.currentPiece.r, elapsed: game.softDropElapsed, score: game.score };
        game._updateSoftDrop(1);
        const after = { r: game.currentPiece.r, elapsed: game.softDropElapsed, score: game.score };
        game.input.isActionDown = originalIsActionDown;
        game.softDropActive = false;
        return { before, after };
    })()`);
    if (softDropTiming.before.r !== 0 || softDropTiming.before.elapsed !== 39 || softDropTiming.before.score !== 0 ||
        softDropTiming.after.r !== 1 || softDropTiming.after.elapsed !== 0 || softDropTiming.after.score !== 1) {
        throw new Error(`Soft-drop speed setting was ignored: ${JSON.stringify(softDropTiming)}`);
    }

    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 0, phi: Math.floor(game.columns / 2), rotation: 0 };
        game.settings.comboTime = 0;
        game.settings.softDropSpeed = 15;
        game.gameSpeed = 400;
        game.score = 0;
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    await keyDown(client, 'KeyZ', 'z');
    await pumpFrames(client, 1);
    await keyUp(client, 'KeyZ', 'z');
    await keyUp(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    const afterDisabledCombo = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterDisabledCombo.currentPiece.r >= afterDisabledCombo.currentPiece.ghostR) {
        throw new Error(`A zero combo window still teleported the piece: ${JSON.stringify(afterDisabledCombo.currentPiece)}`);
    }

    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 0, phi: Math.floor(game.columns / 2), rotation: 0 };
        game.settings.comboTime = 120;
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    await keyDown(client, 'KeyZ', 'z');
    await pumpFrames(client, 1);
    await keyUp(client, 'KeyZ', 'z');
    await keyUp(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    const afterCombo = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterCombo.currentPiece.r !== afterCombo.currentPiece.ghostR) {
        throw new Error(`Soft-drop combo did not reach the ghost: ${JSON.stringify(afterCombo.currentPiece)}`);
    }
    await tapKey(client, 'Space', ' ');
    const afterHardDrop = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (afterHardDrop.occupiedCells !== 4) throw new Error('Hard Drop did not lock the tetromino.');

    // In the default combo mode, Down + Left/Right reaches the ghost and keeps
    // ordinary DAS/ARR movement, then locks the same piece on arrow release.
    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.settings = { ...game.settings, mode: 'rectangular', comboTime: 120, comboMode: 'release-lock', das: 1000 };
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 0, phi: Math.floor(game.columns / 2), rotation: 0 };
        game.gameSpeed = 1000000;
        game.lockDelay = 1000000;
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    const comboBeforeRelease = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        return { snapshot: game.getDebugSnapshot(), pending: game.comboReleaseLock?.action || null };
    })()`);
    if (comboBeforeRelease.snapshot.currentPiece.r !== comboBeforeRelease.snapshot.currentPiece.ghostR ||
        comboBeforeRelease.pending !== 'moveClockwise' || comboBeforeRelease.snapshot.occupiedCells !== 0) {
        throw new Error(`Release-lock combo was not armed at the landing position: ${JSON.stringify(comboBeforeRelease)}`);
    }
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    await keyUp(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    const comboAfterRelease = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (comboAfterRelease.occupiedCells !== 4) {
        throw new Error(`Releasing the combo arrow did not lock immediately: ${JSON.stringify(comboAfterRelease)}`);
    }

    // Even a press/release pair received inside one rendered frame keeps the
    // responsive first lateral step and locks instead of losing the key-up.
    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[1][0];
        game.settings = { ...game.settings, mode: 'rectangular', comboTime: 120, comboMode: 'release-lock' };
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 0, phi: 12, rotation: 0 };
        game.gameSpeed = 1000000;
        game.lockDelay = 1000000;
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowDown', 'ArrowDown');
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    const sameFrameCombo = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        return { occupied: game.getDebugSnapshot().occupiedCells, landing: game.grid[game.rows - 1][11] };
    })()`);
    await keyUp(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    if (sameFrameCombo.occupied !== 1 || !sameFrameCombo.landing) {
        throw new Error(`Same-frame combo release was lost or skipped its first move: ${JSON.stringify(sameFrameCombo)}`);
    }

    // Holding the arrow cannot extend the normal floor lock deadline.
    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.settings = { ...game.settings, mode: 'rectangular', comboTime: 120, comboMode: 'release-lock', das: 1000 };
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 0, phi: Math.floor(game.columns / 2), rotation: 0 };
        game.gameSpeed = 1000000;
        game.lockDelay = 80;
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1, 0.02);
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 5, 0.02);
    const comboAfterDeadline = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        return { snapshot: game.getDebugSnapshot(), arrowHeld: game.input.isActionDown('moveClockwise'), pending: Boolean(game.comboReleaseLock) };
    })()`);
    if (comboAfterDeadline.snapshot.occupiedCells !== 4 || !comboAfterDeadline.arrowHeld || comboAfterDeadline.pending) {
        throw new Error(`Normal lock delay did not win while the combo arrow stayed held: ${JSON.stringify(comboAfterDeadline)}`);
    }
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await keyUp(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);

    // Optional instant mode drops, slides to the first obstacle, and locks in
    // the same update (before either key is released).
    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[1][0];
        // CDP round-trips can exceed the normal 120 ms combo window while the
        // renderer is under load. Keep the window generous here so this test
        // exercises auto-slide semantics rather than wall-clock scheduling.
        game.settings = { ...game.settings, mode: 'rectangular', comboTime: 5000, comboMode: 'auto-slide-lock' };
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.grid[game.rows - 1][3] = entry.index + 1;
        game.currentPiece = { entry, r: 0, phi: 12, rotation: 0 };
        game.gameSpeed = 1000000;
        game.lockDelay = 1000000;
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    const autoSlideCombo = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        return {
            snapshot: game.getDebugSnapshot(),
            obstacle: game.grid[game.rows - 1][3],
            landing: game.grid[game.rows - 1][4],
            pending: Boolean(game.comboReleaseLock),
        };
    })()`);
    if (!autoSlideCombo.obstacle || !autoSlideCombo.landing || autoSlideCombo.snapshot.occupiedCells !== 2 || autoSlideCombo.pending) {
        throw new Error(`Auto-slide combo did not stop and lock beside the obstacle: ${JSON.stringify(autoSlideCombo)}`);
    }
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await keyUp(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);

    // Reverse-order combos slide first, drop second, and preserve a short
    // configurable window in which a third horizontal key can be added.
    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[1][0];
        game.settings = { ...game.settings, mode: 'rectangular', comboTime: 500, das: 1000 };
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 0, phi: 5, rotation: 0 };
        game.gameSpeed = 1000000;
        game.lockDelay = 1000000;
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    await keyDown(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    const leftDownWaiting = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (leftDownWaiting.currentPiece.phi !== 0 ||
        leftDownWaiting.currentPiece.r !== leftDownWaiting.currentPiece.ghostR ||
        !leftDownWaiting.horizontalDropComboPending || leftDownWaiting.occupiedCells !== 0) {
        throw new Error(`Left/down did not slide then drop into its continuation window: ${JSON.stringify(leftDownWaiting)}`);
    }
    await pumpFrames(client, 24, 0.02);
    const leftDownBeforeTimeout = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (!leftDownBeforeTimeout.horizontalDropComboPending || leftDownBeforeTimeout.occupiedCells !== 0) {
        throw new Error(`Left/down locked before Combo Time elapsed: ${JSON.stringify(leftDownBeforeTimeout)}`);
    }
    await pumpFrames(client, 1, 0.02);
    const leftDownAfterTimeout = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (leftDownAfterTimeout.horizontalDropComboPending || leftDownAfterTimeout.occupiedCells !== 1) {
        throw new Error(`Left/down did not lock at the Combo Time deadline: ${JSON.stringify(leftDownAfterTimeout)}`);
    }
    await keyUp(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);

    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[1][0];
        game.settings = { ...game.settings, mode: 'rectangular', comboTime: 500, das: 1000 };
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 0, phi: 5, rotation: 0 };
        game.gameSpeed = 1000000;
        game.lockDelay = 1000000;
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await keyDown(client, 'ArrowRight', 'ArrowRight');
    await pumpFrames(client, 1);
    await keyUp(client, 'ArrowRight', 'ArrowRight');
    await pumpFrames(client, 1);
    await keyDown(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);
    await keyDown(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    const rightDownLeftHeld = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        return {
            snapshot: game.getDebugSnapshot(),
            pendingRelease: game.comboReleaseLock?.action || null,
        };
    })()`);
    if (rightDownLeftHeld.snapshot.currentPiece.phi !== rightDownLeftHeld.snapshot.columns - 2 ||
        rightDownLeftHeld.snapshot.occupiedCells !== 0 ||
        rightDownLeftHeld.pendingRelease !== 'moveClockwise') {
        throw new Error(`Right/down/left did not enter release-lock movement: ${JSON.stringify(rightDownLeftHeld)}`);
    }
    await keyUp(client, 'ArrowLeft', 'ArrowLeft');
    await pumpFrames(client, 1);
    const rightDownLeftReleased = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (rightDownLeftReleased.occupiedCells !== 1) {
        throw new Error(`Right/down/left did not lock on third-key release: ${JSON.stringify(rightDownLeftReleased)}`);
    }
    await keyUp(client, 'ArrowDown', 'ArrowDown');
    await pumpFrames(client, 1);

    // The old lightweight canvas pause moves from ESC to the key below ESC.
    await tapKey(client, 'Backquote', '¸');
    const paused = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (!paused.menuPaused) throw new Error('Backquote/¸ did not toggle the in-game pause.');
    await tapKey(client, 'Backquote', '¸');
    const resumed = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (resumed.menuPaused) throw new Error('Backquote/¸ did not resume the game.');

    // ESC is owned by the standard WW Mini Games pause/settings overlay.
    await keyDown(client, 'Escape', 'Escape');
    await delay(90);
    await keyUp(client, 'Escape', 'Escape');
    await waitFor(() => client.evaluate(`window.app.pauseMenu.isVisible && window.app._isPaused`), 'standard ESC pause menu');
    const standardPause = await client.evaluate(`({
        visible: window.app.pauseMenu.isVisible,
        appPaused: window.app._isPaused,
        menuPaused: window.app.currentGame.menuPaused,
        standardPanel: Boolean(document.querySelector('#pause-overlay.active #pause-panel')),
        oldSettingsButton: Boolean(document.querySelector('.reromo-settings-button')),
    })`);
    if (!standardPause.visible || !standardPause.appPaused || !standardPause.menuPaused ||
        !standardPause.standardPanel || standardPause.oldSettingsButton) {
        throw new Error(`ESC did not open only the standard WW menu: ${JSON.stringify(standardPause)}`);
    }
    await keyDown(client, 'Escape', 'Escape');
    await delay(90);
    await keyUp(client, 'Escape', 'Escape');
    await waitFor(() => client.evaluate(`!window.app.pauseMenu.isVisible && !window.app._isPaused`), 'ESC resume');

    const sharedMechanics = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        const run = mode => {
            game.settings.mode = mode;
            game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
            game.currentPiece = { entry, r: 3, phi: 12, rotation: 0 };
            game._movePiece(0, 1);
            game._rotatePiece(1);
            return {
                r: game.currentPiece.r,
                phi: game.currentPiece.phi,
                rotation: game.currentPiece.rotation,
                blocks: game._blocksFor(game.currentPiece).map(block => block.r + ',' + block.phi).sort(),
            };
        };
        return { circular: run('circular'), mobius: run('mobius') };
    })()`);
    if (JSON.stringify(sharedMechanics.circular) !== JSON.stringify(sharedMechanics.mobius)) {
        throw new Error(`Circular and Möbius mechanics diverged: ${JSON.stringify(sharedMechanics)}`);
    }

    const gridDimensions = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[1][0];
        const result = {};
        for (const mode of ['circular', 'mobius', 'rectangular']) {
            game.settings = {
                ...game.settings,
                mode,
                phiSegments: 17,
                rSegments: 13,
                das: 1000,
                arr: 80,
            };
            game.restart();
            while (game.projectionLoading) await new Promise(resolve => setTimeout(resolve, 5));
            if (game.projectionError) throw new Error(game.projectionError);
            game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
            game.currentPiece = { entry, r: 0, phi: 0, rotation: 0 };
            game.state = 'playing';
            const horizontalMoves = [];
            for (let step = 0; step < 17; step++) horizontalMoves.push(game._movePiece(0, 1));
            const phiAfter17 = game.currentPiece.phi;

            game.currentPiece = { entry, r: 0, phi: mode === 'rectangular' ? 8 : 0, rotation: 0 };
            const verticalMoves = [];
            for (let step = 0; step < 13; step++) verticalMoves.push(game._movePiece(1, 0));

            const projectionCellCount = mode === 'circular'
                ? game.projection.circular.cells.length
                : mode === 'rectangular'
                    ? game.projection.rectangular.cells.length
                    : game.projection.mobius.logicalCellCount;
            result[mode] = {
                rows: game.rows,
                columns: game.columns,
                rowLengths: game.grid.map(row => row.length),
                projectionCellCount,
                horizontalMoves,
                phiAfter17,
                verticalMoves,
                rAfter13: game.currentPiece.r,
            };
        }
        return result;
    })()`);
    for (const [mode, result] of Object.entries(gridDimensions)) {
        if (result.rows !== 13 || result.columns !== 17 || result.rowLengths.some(length => length !== 17) ||
            result.projectionCellCount !== 13 * 17 || result.rAfter13 !== 12 ||
            result.verticalMoves.slice(0, 12).some(success => !success) || result.verticalMoves[12]) {
            throw new Error(`${mode} did not use the selected 17×13 gameplay grid: ${JSON.stringify(result)}`);
        }
        if (mode === 'rectangular') {
            if (result.horizontalMoves.slice(0, 16).some(success => !success) || result.horizontalMoves[16] || result.phiAfter17 !== 16) {
                throw new Error(`Rectangular column count is not 17: ${JSON.stringify(result)}`);
            }
        } else if (result.horizontalMoves.some(success => !success) || result.phiAfter17 !== 0) {
            throw new Error(`${mode} did not wrap after exactly 17 angular moves: ${JSON.stringify(result)}`);
        }
    }

    // In the Möbius projection the requested left/right screen directions are
    // reversed, while the underlying movement routine above stays identical.
    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[1][0];
        game.settings.mode = 'mobius';
        game.settings.das = 1000;
        game._rebuildProjectionCache();
        while (game.projectionLoading) await new Promise(resolve => setTimeout(resolve, 5));
        if (game.projectionError) throw new Error(game.projectionError);
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 5, phi: 8, rotation: 0 };
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await tapKey(client, 'ArrowLeft', 'ArrowLeft', 10);
    const mobiusAfterLeft = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (mobiusAfterLeft.currentPiece.phi !== 7) {
        throw new Error(`Möbius left arrow was not reversed: ${JSON.stringify(mobiusAfterLeft.currentPiece)}`);
    }
    await tapKey(client, 'ArrowRight', 'ArrowRight', 10);
    const mobiusAfterRight = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (mobiusAfterRight.currentPiece.phi !== 8) {
        throw new Error(`Möbius right arrow was not reversed: ${JSON.stringify(mobiusAfterRight.currentPiece)}`);
    }

    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const module = await import('./games/reromo-tetris/polyominoes.js');
        const entry = module.POLYOMINO_CATALOG.byOrder[4].find(piece => piece.classicName === 'T');
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.currentPiece = { entry, r: 5, phi: 8, rotation: 0 };
        game.state = 'playing';
        game._resetRepeats();
        game._refreshPieceProjection();
        return true;
    })()`);
    await tapKey(client, 'KeyY', 'z');
    const mobiusClockwiseRotation = await client.evaluate(`window.app.currentGame.getDebugSnapshot().currentPiece.rotation`);
    if (mobiusClockwiseRotation !== 3) {
        throw new Error(`Möbius clockwise key was not swapped: rotation ${mobiusClockwiseRotation}`);
    }
    await tapKey(client, 'KeyT', 't');
    const mobiusCounterRotation = await client.evaluate(`window.app.currentGame.getDebugSnapshot().currentPiece.rotation`);
    if (mobiusCounterRotation !== 0) {
        throw new Error(`Möbius anti-clockwise key was not swapped: rotation ${mobiusCounterRotation}`);
    }

    await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const settingsModule = await import('./games/reromo-tetris/settings.js');
        game.settings = settingsModule.createDefaultSettings();
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        game.render();
        return true;
    })()`);
    await waitFor(
        () => client.evaluate(`window.app.currentGame?.getDebugSnapshot().renderCount > 0`),
        'clean circular restart',
    );
    await delay(250);

    const circular = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    const circularBenchmark = await benchmarkRenderer(client);
    await screenshot(client, 'circular.png');
    await client.evaluate(`window.app.currentGame.setMenuPaused(true)`);
    await delay(80);
    const idleStart = await client.evaluate(`window.app.currentGame.getDebugSnapshot().renderCount`);
    await delay(450);
    const idleEnd = await client.evaluate(`window.app.currentGame.getDebugSnapshot().renderCount`);
    if (idleEnd !== idleStart) {
        throw new Error(`Idle renderer redrew ${idleEnd - idleStart} times.`);
    }
    await client.evaluate(`window.app.currentGame.setMenuPaused(false)`);

    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'mobius', phiSegments: 24 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        game.render();
        return true;
    })()`);
    await waitFor(
        () => client.evaluate(`(() => {
            const snapshot = window.app.currentGame?.getDebugSnapshot();
            return snapshot?.mode === 'mobius' && snapshot.mobiusPatchCount === 12 * 18 &&
                !snapshot.projectionLoading && !snapshot.projectionError;
        })()`),
        'Möbius restart',
    );
    const mobius = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    if (mobius.mobiusPatchCount !== 12 * 18 || mobius.mobiusLogicalCellCount !== 24 * 18) {
        throw new Error(`Unexpected Möbius patch count ${mobius.mobiusPatchCount}.`);
    }
    const mobiusBenchmark = await benchmarkRenderer(client);
    await screenshot(client, 'mobius.png');
    const mobiusRestartReusedProjection = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        const previousMesh = game.projection.mobius;
        game.restart();
        return game.projection?.mobius === previousMesh && !game.projectionLoading;
    })()`);
    if (!mobiusRestartReusedProjection) {
        throw new Error('An unchanged Möbius restart recalculated its projection.');
    }

    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'mobius', phiSegments: 23 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        game.render();
        return true;
    })()`);
    await waitFor(
        () => client.evaluate(`(() => {
            const snapshot = window.app.currentGame?.getDebugSnapshot();
            return snapshot?.columns === 23 && snapshot.mobiusPatchCount === 23 * 18 &&
                !snapshot.projectionLoading && !snapshot.projectionError;
        })()`),
        'odd Möbius projection',
    );
    const mobiusOdd = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        return {
            snapshot: game.getDebugSnapshot(),
            paired: game.projection.mobius.paired,
            traversalSpan: game.projection.mobius.traversalSpan,
        };
    })()`);
    if (mobiusOdd.snapshot.columns !== 23 || mobiusOdd.snapshot.mobiusPatchCount !== 23 * 18 ||
        mobiusOdd.snapshot.mobiusLogicalCellCount !== 23 * 18 || mobiusOdd.paired) {
        throw new Error(`Odd Möbius grid changed or used the wrong cache: ${JSON.stringify(mobiusOdd)}`);
    }
    await screenshot(client, 'mobius-odd.png');

    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'mobius', phiSegments: 48, rSegments: 30 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        game.render();
        return true;
    })()`);
    await waitFor(
        () => client.evaluate(`(() => {
            const snapshot = window.app.currentGame?.getDebugSnapshot();
            return snapshot?.columns === 48 && snapshot.rows === 30 &&
                snapshot.mobiusPatchCount === 24 * 30 && !snapshot.projectionLoading &&
                !snapshot.projectionError;
        })()`),
        'dense-test Möbius projection',
    );
    const mobiusMaximum = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    const mobiusMaximumBenchmark = await benchmarkRenderer(client, 30);
    if (mobiusMaximum.columns !== 48 || mobiusMaximum.rows !== 30 ||
        mobiusMaximum.mobiusLogicalCellCount !== 48 * 30 || mobiusMaximum.mobiusPatchCount !== 24 * 30 ||
        mobiusMaximumBenchmark.median > 3 || mobiusMaximumBenchmark.p95 > 20) {
        throw new Error(`Maximum Möbius grid is incorrect or too slow: ${JSON.stringify({ mobiusMaximum, mobiusMaximumBenchmark })}`);
    }

    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        for (let row = 0; row < game.rows; row++) {
            for (let phi = 0; phi < game.columns; phi++) game.grid[row][phi] = (row + phi) % 7 + 1;
        }
        game.currentPiece = null;
        game.invalidate();
        return true;
    })()`);
    const mobiusDenseBenchmark = await benchmarkRenderer(client, 30);
    if (mobiusDenseBenchmark.median > 8 || mobiusDenseBenchmark.p95 > 25) {
        throw new Error(`Dense maximum Möbius grid is too slow: ${JSON.stringify(mobiusDenseBenchmark)}`);
    }

    // The new full range is real geometry, not subdivisions hidden inside the
    // old fields: 256 clicks traverse 256 distinct logical angular positions.
    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'mobius', phiSegments: 256, rSegments: 256 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        game.render();
        return true;
    })()`);
    await waitFor(
        () => client.evaluate(`(() => {
            const snapshot = window.app.currentGame?.getDebugSnapshot();
            return snapshot?.columns === 256 && snapshot.rows === 256 &&
                snapshot.mobiusPatchCount === 128 * 256 && !snapshot.projectionLoading &&
                !snapshot.projectionError;
        })()`),
        '256 × 256 Möbius projection',
        30000,
    );
    const mobius256 = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    const mobius256Benchmark = await benchmarkRenderer(client, 20);
    if (mobius256.mobiusLogicalCellCount !== 256 * 256 ||
        mobius256Benchmark.median > 5 || mobius256Benchmark.p95 > 25) {
        throw new Error(`256 × 256 Möbius grid is incorrect or too slow: ${JSON.stringify({ mobius256, mobius256Benchmark })}`);
    }

    const customGridPreparation = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const progress = [];
        const prepared = await game.preparePauseSettings({
            ...game.settings,
            mode: 'mobius',
            phiSegments: 100,
            rSegments: 101,
        }, {
            setProgress: (fraction, message) => progress.push({ fraction, message }),
        });
        game.settings = prepared;
        game.restart();
        const bytes = await window.api.readReRoMoProjectionCache('v1-c100-r101-s7');
        return {
            first: progress[0]?.fraction,
            last: progress.at(-1)?.fraction,
            wentBackwards: progress.some((entry, index) => index > 0 && entry.fraction < progress[index - 1].fraction),
            showedCalculation: progress.some(entry => /Calculating|Building|Rasterizing/.test(entry.message || '')),
            immediateReuse: Boolean(game.projection?.mobius) && !game.projectionLoading,
            rows: game.rows,
            columns: game.columns,
            cachedBytes: bytes?.byteLength || 0,
        };
    })()`);
    if (customGridPreparation.first !== 0 || customGridPreparation.last !== 1 ||
        customGridPreparation.wentBackwards || !customGridPreparation.showedCalculation ||
        !customGridPreparation.immediateReuse || customGridPreparation.rows !== 101 ||
        customGridPreparation.columns !== 100 || customGridPreparation.cachedBytes <= 0) {
        throw new Error(`Custom-grid progress/cache failed: ${JSON.stringify(customGridPreparation)}`);
    }

    // The exact user-reported 10 × 20 dimensions must survive the complete
    // settings/precompute/restart path. In Möbius mode this is a non-preset
    // grid, so its normalized template is calculated, persisted and then
    // consumed immediately rather than rebuilt during live play.
    const classicMobiusPreparation = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const progress = [];
        const prepared = await game.preparePauseSettings({
            ...game.settings,
            mode: 'mobius',
            phiSegments: 10,
            rSegments: 20,
        }, {
            setProgress: (fraction, message) => progress.push({ fraction, message }),
        });
        game.settings = prepared;
        game.restart();
        const bytes = await window.api.readReRoMoProjectionCache('v1-c10-r20-s7');
        const snapshot = game.getDebugSnapshot();
        return {
            progressComplete: progress.at(-1)?.fraction,
            immediateReuse: Boolean(game.projection?.mobius) && !game.projectionLoading,
            columns: snapshot.columns,
            rows: snapshot.rows,
            logicalFields: snapshot.mobiusLogicalCellCount,
            projectedPatches: snapshot.mobiusPatchCount,
            profileColumns: prepared.modeProfiles.mobius.phiSegments,
            profileRows: prepared.modeProfiles.mobius.rSegments,
            cachedBytes: bytes?.byteLength || 0,
        };
    })()`);
    if (classicMobiusPreparation.progressComplete !== 1 ||
        !classicMobiusPreparation.immediateReuse || classicMobiusPreparation.columns !== 10 ||
        classicMobiusPreparation.rows !== 20 || classicMobiusPreparation.logicalFields !== 200 ||
        classicMobiusPreparation.projectedPatches !== 100 ||
        classicMobiusPreparation.profileColumns !== 10 || classicMobiusPreparation.profileRows !== 20 ||
        classicMobiusPreparation.cachedBytes <= 0) {
        throw new Error(`10 × 20 Möbius preparation failed: ${JSON.stringify(classicMobiusPreparation)}`);
    }

    const classicCartesianPreparation = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const prepared = await game.preparePauseSettings({
            ...game.settings,
            mode: 'rectangular',
            phiSegments: 10,
            rSegments: 20,
        });
        game.settings = prepared;
        game.restart();
        game.render();
        const snapshot = game.getDebugSnapshot();
        return {
            mode: snapshot.mode,
            columns: snapshot.columns,
            rows: snapshot.rows,
            gridCells: game.grid.reduce((sum, row) => sum + row.length, 0),
            profileColumns: prepared.modeProfiles.rectangular.phiSegments,
            profileRows: prepared.modeProfiles.rectangular.rSegments,
        };
    })()`);
    if (classicCartesianPreparation.mode !== 'rectangular' ||
        classicCartesianPreparation.columns !== 10 || classicCartesianPreparation.rows !== 20 ||
        classicCartesianPreparation.gridCells !== 200 ||
        classicCartesianPreparation.profileColumns !== 10 || classicCartesianPreparation.profileRows !== 20) {
        throw new Error(`10 × 20 Cartesian preparation failed: ${JSON.stringify(classicCartesianPreparation)}`);
    }

    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'rectangular', phiSegments: 100, rSegments: 137 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        game.render();
        return true;
    })()`);
    await waitFor(
        () => client.evaluate(`(() => {
            const snapshot = window.app.currentGame?.getDebugSnapshot();
            return snapshot?.mode === 'rectangular' && snapshot.columns === 100 && snapshot.rows === 137 &&
                snapshot.renderCount > 0 && !snapshot.dirty;
        })()`),
        'rectangular restart',
    );
    const rectangular = await client.evaluate(`window.app.currentGame.getDebugSnapshot()`);
    const rectangularBenchmark = await benchmarkRenderer(client);
    await screenshot(client, 'rectangular.png');

    const settingsView = await client.evaluate(`(() => {
        window.app.pauseGame();
        const menu = window.app.pauseMenu;
        menu._view = 'settings';
        menu._render();
        return {
            standardOverlay: Boolean(document.querySelector('#pause-overlay.active #pause-panel')),
            oldSettingsButton: Boolean(document.querySelector('.reromo-settings-button')),
            orderWeightInputs: document.querySelectorAll('[data-order-weight]').length,
            detailButtons: document.querySelectorAll('[data-detail-order]').length,
            controlBindings: window.app.currentGame.constructor.getControlsSchema().length,
            settingKeys: [...document.querySelectorAll('#pause-panel [data-key]')].map(input => input.dataset.key).sort(),
            comboOptions: document.querySelectorAll('[data-key="comboMode"] option').length,
            gridPresetOptions: document.querySelectorAll('[data-key="gridPreset"] option').length,
            phiMinimum: Number(document.querySelector('[data-key="phiSegments"]')?.min),
            phiMaximum: Number(document.querySelector('[data-key="phiSegments"]')?.max),
            rowMaximum: Number(document.querySelector('[data-key="rSegments"]')?.max),
            phiSuggestions: document.querySelectorAll('#setting-suggestions-phiSegments option').length,
            rowSuggestions: document.querySelectorAll('#setting-suggestions-rSegments option').length,
            progressBar: Boolean(document.querySelector('[data-settings-progress]')),
            structuralPhysicsHidden: [...document.querySelectorAll('[data-setting-modes^="structural"]')]
                .every(row => row.hidden),
            legacyToppleKeys: [...document.querySelectorAll('#pause-panel [data-key^="structuralTopple"]')]
                .map(input => input.dataset.key),
            settingLabels: [...document.querySelectorAll('#pause-panel [data-key]')]
                .map(input => input.closest('.setting-row')?.querySelector('.setting-label')?.textContent.trim() || ''),
            gridWidthLabel: document.querySelector('#pause-panel [data-key="phiSegments"]')
                ?.closest('.setting-row')?.querySelector('.setting-label')?.textContent.trim() || '',
            gridHeightLabel: document.querySelector('#pause-panel [data-key="rSegments"]')
                ?.closest('.setting-row')?.querySelector('.setting-label')?.textContent.trim() || '',
            probabilityRows: [...document.querySelectorAll('.reromo-standard-weight-row')].map(row => ({
                weightInputs: row.querySelectorAll('[data-order-weight]').length,
                detailButtons: row.querySelectorAll('[data-detail-order]').length,
            })),
            sideHud: {
                holdCanvases: document.querySelectorAll('[data-hud-preview="hold"]').length,
                nextCanvases: document.querySelectorAll('[data-hud-preview^="next-"]').length,
                scoreValues: document.querySelectorAll('[data-hud-score], [data-hud-lines], [data-hud-high-score], [data-hud-high-lines]').length,
                controlRows: document.querySelectorAll('.reromo-controls-table tbody tr').length,
                columnFirstPreviews: [...document.querySelectorAll('.reromo-info-column')]
                    .map(column => column.querySelector('[data-hud-preview]')?.dataset.hudPreview || null),
                nextGap: (() => {
                    const previews = [...document.querySelectorAll('[data-hud-preview^="next-"]')]
                        .map(canvas => canvas.closest('.reromo-preview-container'));
                    if (previews.length < 2) return null;
                    return previews[1].getBoundingClientRect().top - previews[0].getBoundingClientRect().bottom;
                })(),
                holdScoreGap: (() => {
                    const hold = document.querySelector('[data-hud-preview="hold"]')?.closest('.reromo-preview-container');
                    const score = document.querySelector('[data-hud-score]')?.closest('.reromo-info-box');
                    return hold && score ? score.getBoundingClientRect().top - hold.getBoundingClientRect().bottom : null;
                })(),
            },
        };
    })()`);
    const expectedSettingKeys = [
        'arr', 'centralHoleColor', 'comboMode', 'comboTime', 'das', 'dropPathOpacity', 'gridPreset',
        'initialLockDelay', 'initialSpeed', 'lineClearDuration', 'lockDelayDecrease',
        'mobiusGridOpacity', 'nextPreviewCount', 'outerSpaceColor', 'phiSegments', 'pieceOutlineWidth',
        'quickMotionMultiplier', 'rSegments', 'rectBackgroundColor',
        'rockingAllowOverhang', 'rockingArcDegrees', 'rockingCollapseMassKg', 'rockingLengthCells', 'rockingMassKg', 'rockingRollingFriction',
        'sfxVolume', 'softDropSpeed', 'speedIncrease', 'structuralBlockMassKg',
        'structuralCellSizeMeters', 'structuralGravity', 'structuralPieceFriction',
        'structuralPlatformFriction', 'structuralWallFriction',
    ];
    if (!settingsView.standardOverlay || settingsView.oldSettingsButton || settingsView.comboOptions !== 2 ||
        settingsView.gridPresetOptions !== 8 || settingsView.phiMinimum !== 10 ||
        settingsView.phiMaximum !== 256 || settingsView.rowMaximum !== 256 ||
        settingsView.phiSuggestions !== 7 || settingsView.rowSuggestions !== 7 || !settingsView.progressBar ||
        !settingsView.structuralPhysicsHidden || settingsView.legacyToppleKeys.length !== 0 ||
        settingsView.gridWidthLabel !== 'Grid Width (cells)' || settingsView.gridHeightLabel !== 'Grid Height (cells)' ||
        settingsView.orderWeightInputs !== 10 || settingsView.detailButtons !== 10 || settingsView.controlBindings !== 11 ||
        JSON.stringify(settingsView.settingKeys) !== JSON.stringify([...expectedSettingKeys,
            'holdPreviewCellScale', 'nextPreviewCellScale', 'previewFramed',
            'rockingFrameHeadroomCells', 'rockingFrameWidthCells'].sort()) ||
        settingsView.probabilityRows.length !== 10 ||
        settingsView.probabilityRows.some(row => row.weightInputs !== 1 || row.detailButtons !== 1) ||
        settingsView.sideHud.holdCanvases !== 1 || settingsView.sideHud.nextCanvases !== 2 ||
        settingsView.sideHud.scoreValues !== 4 || settingsView.sideHud.controlRows !== 11 ||
        JSON.stringify(settingsView.sideHud.columnFirstPreviews) !== JSON.stringify(['next-0', 'hold']) ||
        Math.abs(settingsView.sideHud.nextGap - settingsView.sideHud.holdScoreGap) > 0.01) {
        throw new Error(`Probability table is incomplete: ${JSON.stringify(settingsView)}`);
    }

    const gridPresetInteraction = await client.evaluate(`(() => {
        const preset = document.querySelector('[data-key="gridPreset"]');
        const columns = document.querySelector('[data-key="phiSegments"]');
        const rows = document.querySelector('[data-key="rSegments"]');
        preset.value = '96x64';
        preset.dispatchEvent(new Event('change', { bubbles: true }));
        const selected = { preset: preset.value, columns: Number(columns.value), rows: Number(rows.value) };
        columns.value = '100';
        columns.dispatchEvent(new Event('input', { bubbles: true }));
        columns.dispatchEvent(new Event('change', { bubbles: true }));
        const custom = {
            preset: preset.value,
            columns: window.app.pauseMenu._tempSettings.phiSegments,
        };
        columns.value = '10';
        columns.dispatchEvent(new Event('input', { bubbles: true }));
        columns.dispatchEvent(new Event('change', { bubbles: true }));
        rows.value = '20';
        rows.dispatchEvent(new Event('input', { bubbles: true }));
        rows.dispatchEvent(new Event('change', { bubbles: true }));
        return {
            selected,
            custom,
            classic: {
                preset: preset.value,
                columns: window.app.pauseMenu._tempSettings.phiSegments,
                rows: window.app.pauseMenu._tempSettings.rSegments,
            },
        };
    })()`);
    if (gridPresetInteraction.selected.preset !== '96x64' ||
        gridPresetInteraction.selected.columns !== 96 || gridPresetInteraction.selected.rows !== 64 ||
        gridPresetInteraction.custom.preset !== 'custom' || gridPresetInteraction.custom.columns !== 100 ||
        gridPresetInteraction.classic.preset !== 'custom' ||
        gridPresetInteraction.classic.columns !== 10 || gridPresetInteraction.classic.rows !== 20) {
        throw new Error(`Prepared/custom grid inputs are not synchronized: ${JSON.stringify(gridPresetInteraction)}`);
    }

    await client.evaluate(`(() => {
        const menu = window.app.pauseMenu;
        menu._view = 'controls';
        menu._render();
        document.querySelector('.control-key[data-action="rotateClockwise"][data-index="0"]').click();
        return true;
    })()`);
    await keyDown(client, 'KeyQ', 'q');
    await keyUp(client, 'KeyQ', 'q');
    const remappedControl = await client.evaluate(`(() => {
        const binding = window.app.pauseMenu._tempBindings.rotateClockwise[0];
        return { ...binding, buttonText: document.querySelector('.control-key[data-action="rotateClockwise"]').textContent };
    })()`);
    if (remappedControl.code !== 'KeyQ' || remappedControl.key !== 'q' || remappedControl.match !== 'key' || remappedControl.buttonText !== 'Q') {
        throw new Error(`Control remapping lost original key semantics: ${JSON.stringify(remappedControl)}`);
    }
    await client.evaluate(`(async () => {
        const menu = window.app.pauseMenu;
        const settingsModule = await import('./games/reromo-tetris/settings.js');
        menu._tempBindings = settingsModule.getDefaultBindings();
        menu._view = 'settings';
        menu._render();
        return true;
    })()`);
    await screenshot(client, 'settings.png');
    await client.evaluate(`(() => {
        const scroll = document.querySelector('#pause-panel');
        const section = document.querySelector('.reromo-standard-weights');
        scroll.scrollTop = section.offsetTop - 12;
        return true;
    })()`);
    await screenshot(client, 'settings-probabilities.png');

    await client.evaluate(`(() => {
        window.app.pauseMenu._tempSettings.pieceOverrides = {};
        document.querySelector('[data-detail-order="4"]').click();
        return true;
    })()`);
    await waitFor(
        () => client.evaluate(`document.querySelectorAll('.reromo-piece-card').length > 0`),
        'virtualized piece editor',
    );
    const editor = await client.evaluate(`(() => {
        const inputs = [...document.querySelectorAll('[data-piece-weight^="4:"]')];
        const initialValues = inputs.map(input => Number(input.value));
        inputs[0].value = '2';
        inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        return {
        visibleCards: document.querySelectorAll('.reromo-piece-card').length,
        previewCanvases: document.querySelectorAll('[data-piece-preview]').length,
        virtualHeight: parseFloat(document.querySelector('.reromo-piece-spacer').style.height),
            panelWidth: document.querySelector('.reromo-panel-piece-editor').getBoundingClientRect().width,
            tetrominoCount: inputs.length,
            initialValues,
            editedValues: inputs.map(input => Number(input.value)),
            overrideCount: Number.parseInt(document.querySelector('[data-override-count]').textContent, 10),
            overriddenCards: document.querySelectorAll('.reromo-piece-card.overridden').length,
            editorOrder: Number(document.querySelector('.reromo-editor-header h2').textContent.split('—')[0].trim()),
        };
    })()`);
    if (editor.visibleCards > 250 || editor.previewCanvases !== editor.visibleCards) {
        throw new Error(`Piece editor virtualization failed: ${JSON.stringify(editor)}`);
    }
    if (editor.editorOrder !== 4 || editor.tetrominoCount !== 7 || editor.initialValues.some(value => value !== 1) ||
        editor.overrideCount !== 1 || editor.overriddenCards !== 1 || editor.editedValues.slice(1).some(value => value !== 1)) {
        throw new Error(`Individual factor editing changed the wrong pieces: ${JSON.stringify(editor)}`);
    }
    await screenshot(client, 'piece-editor.png');

    const savedTetrominoOverride = await client.evaluate(`(() => {
        document.querySelector('[data-done]').click();
        return Object.keys(window.app.pauseMenu._tempSettings.pieceOverrides)
            .filter(id => id.startsWith('4:')).length;
    })()`);
    if (savedTetrominoOverride !== 1) {
        throw new Error(`Tetromino detail page did not preserve its one edited factor: ${savedTetrominoOverride}`);
    }

    const decominoEditor = await client.evaluate(`(async () => {
        const module = await import('./games/reromo-tetris/polyominoes.js');
        document.querySelector('[data-detail-order="10"]').click();
        return {
            order: Number(document.querySelector('.reromo-editor-header h2').textContent.split('—')[0].trim()),
            catalogCount: module.POLYOMINO_CATALOG.byOrder[10].length,
            visibleCards: document.querySelectorAll('.reromo-piece-card').length,
            virtualHeight: parseFloat(document.querySelector('.reromo-piece-spacer').style.height),
            wrongOrderCards: document.querySelectorAll('[data-piece-weight]:not([data-piece-weight^="10:"])').length,
        };
    })()`);
    if (decominoEditor.order !== 10 || decominoEditor.catalogCount !== 9189 ||
        decominoEditor.visibleCards > 250 || decominoEditor.virtualHeight < 10000 || decominoEditor.wrongOrderCards !== 0) {
        throw new Error(`Per-order decomino editor failed: ${JSON.stringify(decominoEditor)}`);
    }

    await client.evaluate(`(() => {
        document.querySelector('[data-cancel]').click();
        window.app.pauseMenu.hide();
        window.app.resumeGame();
        return true;
    })()`);

    // Every mode uses one compact side HUD. Exercise the real resize path at
    // the minimum supported viewport, the normal window, and a large desktop
    // viewport so the board/HUD contract is checked after layout recalculation.
    const layoutModes = ['rectangular', 'structural', 'rocking', 'rocking-pressure', 'circular', 'mobius'];
    const layoutSizes = [[800, 600], [1280, 720], [1920, 1080]];
    const layoutMatrix = [];
    for (const [width, height] of layoutSizes) {
        await setViewport(client, width, height);
        for (const mode of layoutModes) {
            await client.evaluate(`(() => {
                const game = window.app.currentGame;
                game.menuPaused = false;
                game.settings = { ...game.settings, mode: '${mode}', phiSegments: 24, rSegments: 18,
                    rockingLengthCells: 10, rockingArcDegrees: 60, rockingMassKg: 20,
                    rockingAllowOverhang: false, structuralPlatformFriction: 1,
                    structuralPieceFriction: 0, structuralWallFriction: 0 };
                window.app.currentSettings = structuredClone(game.settings);
                game.restart();
                game.invalidate();
                game.render();
                return true;
            })()`);
            await waitFor(
                () => client.evaluate(`(() => {
                    const snapshot = window.app.currentGame?.getDebugSnapshot();
                    return snapshot?.mode === '${mode}' && snapshot.renderCount > 0 &&
                        !snapshot.projectionLoading && !snapshot.projectionError;
                })()`),
                `layout ${mode} at ${width}x${height}`,
            );
            const measurement = await client.evaluate(`(() => {
                const game = window.app.currentGame;
                const board = game.layout.board;
                const hud = game.layout.hud;
                const uiRect = game.ui?.gameUi?.getBoundingClientRect();
                const controlsRect = game.ui?.root?.querySelector('.reromo-controls-table')?.getBoundingClientRect();
                const rect = value => value ? { left: value.left, top: value.top, right: value.right, bottom: value.bottom,
                    width: value.width, height: value.height } : null;
                return {
                    snapshot: game.getDebugSnapshot(),
                    canvas: { width: game.w, height: game.h },
                    board: { x: board.x, y: board.y, width: board.width, height: board.height,
                        right: board.x + board.width, bottom: board.y + board.height },
                    hud: { x: hud.x, y: hud.y, width: hud.width, height: hud.height,
                        right: hud.x + hud.width, bottom: hud.y + hud.height },
                    stacked: Boolean(game.layout.stacked),
                    uiRect: rect(uiRect),
                    controlsRect: rect(controlsRect),
                    widgets: game.getLayoutWidgets().map(widget => ({ id: widget.id,
                        actual: rect(widget.element?.getBoundingClientRect()), expected: game.layout.widgets[widget.id] })),
                };
            })()`);
            const tolerance = 3;
            const { canvas, board, hud, uiRect, controlsRect } = measurement;
            const layoutValid = !measurement.stacked && board.x >= -tolerance && board.y >= -tolerance &&
                board.right <= canvas.width + tolerance && board.bottom <= canvas.height + tolerance &&
                hud.x >= board.right - tolerance && hud.y >= -tolerance &&
                hud.right <= canvas.width + tolerance && hud.bottom <= canvas.height + tolerance &&
                Math.abs(hud.y - board.y) <= tolerance && Math.abs(hud.bottom - board.bottom) <= tolerance &&
                measurement.widgets.every(({ actual, expected }) => actual && expected &&
                    Math.abs(actual.left - expected.x) <= tolerance && Math.abs(actual.top - expected.y) <= tolerance &&
                    actual.left >= -tolerance && actual.right <= canvas.width + tolerance &&
                    actual.top >= -tolerance && actual.bottom <= canvas.height + tolerance) &&
                controlsRect && Math.abs(controlsRect.bottom - hud.bottom) <= tolerance &&
                controlsRect.left >= hud.x - tolerance && controlsRect.right <= hud.right + tolerance;
            if (!layoutValid) {
                throw new Error(`Board/HUD layout mismatch for ${mode} at ${width}x${height}: ${JSON.stringify(measurement)}`);
            }
            layoutMatrix.push({ width, height, mode, board, hud, controlsRect });
            if (width === 1920 && height === 1080 && mode === 'rectangular') {
                await screenshot(client, 'layout-1920x1080.png');
            }
        }
    }
    await clearViewport(client);

    // Same-colour adjacent pieces keep a boundary, while cells belonging to
    // one rigid piece share an unbroken fill. The outline is independent of
    // the one-pixel grid stroke and is measured from the actual canvas.
    const outlinePixels = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'rectangular', phiSegments: 8, rSegments: 6,
            pieceOutlineWidth: 2 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        const value = 1;
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.pieceIdentityGrid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.structuralBodyGrid = null;
        for (const [row, column, bodyId] of [[4, 1, 1], [4, 2, 2], [2, 4, 3], [2, 5, 3]]) {
            game.grid[row][column] = value;
            game.pieceIdentityGrid[row][column] = bodyId;
        }
        game.overhangGrid = new Map();
        game.currentPiece = null;
        game.state = 'playing';
        game.lockedOutlinePath = null;
        game.invalidate();
        game.render();
        const cache = game.projection.rectangular;
        const readback = document.createElement('canvas');
        readback.width = game.canvas.width; readback.height = game.canvas.height;
        const readContext = readback.getContext('2d', { willReadFrequently: true });
        readContext.drawImage(game.canvas, 0, 0);
        const rgb = (x, y) => [...readContext.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3)];
        const adjacentBoundary = rgb(cache.x + 2 * cache.cellSize, cache.y + 4.5 * cache.cellSize);
        const samePieceInterior = rgb(cache.x + 5 * cache.cellSize, cache.y + 2.5 * cache.cellSize);
        const outerPerimeter = rgb(cache.x + cache.cellSize, cache.y + 4.5 * cache.cellSize);
        const luminance = color => color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
        return { adjacentBoundary, samePieceInterior, outerPerimeter,
            adjacentLuminance: luminance(adjacentBoundary),
            interiorLuminance: luminance(samePieceInterior),
            outerLuminance: luminance(outerPerimeter),
            cellSize: cache.cellSize };
    })()`);
    if (!(outlinePixels.adjacentLuminance < outlinePixels.interiorLuminance - 8) ||
        !(outlinePixels.outerLuminance < outlinePixels.interiorLuminance - 8)) {
        throw new Error(`Piece outlines did not preserve boundaries without internal barriers: ${JSON.stringify(outlinePixels)}`);
    }

    // Structural Cartesian uses the ordinary rectangular controls/grid, then
    // hands an unstable stack to the rigid-body collapse simulation. Keep the
    // physics loop explicit here so this check does not depend on RAF timing.
    const structuralStart = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        game.settings = {
            ...game.settings,
            mode: 'structural',
            phiSegments: 8,
            rSegments: 8,
            structuralCellSizeMeters: 0.3,
            structuralBlockMassKg: 1,
            structuralGravity: 9.81,
            structuralPlatformFriction: 1,
            structuralPieceFriction: 0,
            structuralWallFriction: 0,
        };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();

        const module = await import('./games/reromo-tetris/polyominoes.js');
        const storedValue = module.POLYOMINO_CATALOG.byOrder[1][0].index + 1;
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.structuralBodyGrid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        const cells = [
            [5, 4, 1],
            [6, 2, 2], [6, 3, 2], [6, 4, 2],
            [7, 2, 3],
        ];
        for (const [row, column, bodyId] of cells) {
            game.grid[row][column] = storedValue;
            game.structuralBodyGrid[row][column] = bodyId;
        }
        game.nextStructuralBodyId = 4;
        game.currentPiece = null;
        game.state = 'playing';
        game.menuPaused = true;
        game._completeLineClear(0);
        game.render();
        const cache = game.projection.rectangular;
        const movingPixel = [...game.ctx.getImageData(
            Math.floor(cache.x + 4.5 * cache.cellSize),
            Math.floor(cache.y + 5.5 * cache.cellSize),
            1,
            1,
        ).data];
        const expectedHex = module.POLYOMINO_CATALOG.byOrder[1][0].color.slice(1);
        const pieceContactCount = () => {
            let count = 0;
            for (let contact = game.collapseSimulation?.world?.getContactList(); contact; contact = contact.getNext()) {
                if (!contact.isTouching()) continue;
                const a = contact.getFixtureA().getUserData?.();
                const b = contact.getFixtureB().getUserData?.();
                if (a?.kind === 'piece' && b?.kind === 'piece' && a.id !== b.id) count++;
            }
            return count;
        };
        const snapshot = game.getDebugSnapshot();
        const initialBodies = new Map((snapshot.collapse?.bodies || []).map(body => [body.id, body]));
        let maxBodyDisplacement = 0;
        let maxAngleChange = 0;
        let maxPieceContacts = pieceContactCount();
        let contactFrames = 0;
        let steps = 0;
        while (game.state === 'toppling' && steps < 2400) {
            game._updateToppling(1 / 120);
            steps++;
            const current = game.getDebugSnapshot();
            for (const body of current.collapse?.bodies || []) {
                const initial = initialBodies.get(body.id);
                if (!initial) continue;
                maxBodyDisplacement = Math.max(maxBodyDisplacement,
                    Math.hypot(body.x - initial.x, body.y - initial.y));
                maxAngleChange = Math.max(maxAngleChange, Math.abs(body.angle - initial.angle));
            }
            const contacts = pieceContactCount();
            maxPieceContacts = Math.max(maxPieceContacts, contacts);
            if (contacts > 0) contactFrames++;
            if (current.collapse?.settled) break;
        }
        game.render();
        return {
            snapshot,
            endSnapshot: game.getDebugSnapshot(),
            steps,
            maxBodyDisplacement,
            maxAngleChange,
            maxPieceContacts,
            contactFrames,
            rectangularProjection: Boolean(game.projection?.rectangular),
            movingPixel,
            expectedMovingPixel: [0, 2, 4].map(offset => Number.parseInt(expectedHex.slice(offset, offset + 2), 16)),
        };
    })()`);
    if (structuralStart.snapshot.mode !== 'structural' || structuralStart.snapshot.state !== 'toppling' ||
        structuralStart.snapshot.structuralStable !== false || !structuralStart.rectangularProjection ||
        structuralStart.snapshot.collapse?.settled !== false ||
        structuralStart.snapshot.collapse?.bodies?.length < 2 ||
        new Set(structuralStart.snapshot.collapse.bodies.map(body => body.id)).size < 2 ||
        !(structuralStart.maxBodyDisplacement > 1e-4) ||
        !(structuralStart.maxAngleChange > 1e-4) ||
        !(structuralStart.maxPieceContacts > 0) || !(structuralStart.contactFrames > 0) ||
        structuralStart.movingPixel.slice(0, 3).join(',') !== structuralStart.expectedMovingPixel.join(',')) {
        throw new Error(`Structural equilibrium did not start a physical topple: ${JSON.stringify(structuralStart)}`);
    }
    await screenshot(client, 'structural-topple-start.png');
    const structuralEnd = structuralStart.endSnapshot;
    if (structuralStart.steps >= 2400 || structuralEnd.state !== 'gameover' || structuralEnd.gameOverReason !== 'topple' ||
        structuralEnd.collapse?.settled !== true || !(structuralEnd.collapse?.elapsed > 0)) {
        throw new Error(`Structural toppling animation did not reach game over: ${JSON.stringify(structuralEnd)}`);
    }
    await screenshot(client, 'structural-topple-game-over.png');

    const structuralCoupled = await client.evaluate(`(async () => {
        const { analyzeStructuralStability } = await import('./games/reromo-tetris/structural-stability.js');
        const bridge = analyzeStructuralStability([
            [1,1,1,1,1,1,1], [2,2,2,3,4,4,4],
            [0,0,2,3,4,0,0], [0,0,2,3,4,0,0], [0,0,2,3,4,0,0],
        ]);
        const neutral = analyzeStructuralStability([[1,1,0],[2,0,0]], { stabilityMarginCells: 0.5 });
        const game = window.app.currentGame;
        game.grid.forEach(row => row.fill(0));
        game.structuralBodyGrid.forEach(row => row.fill(0));
        game.grid[3][3] = 1;
        game.structuralBodyGrid[3][3] = 1;
        game.gridFalling = null;
        game.collapseSimulation = null;
        game.collapseSnapshot = null;
        game.state = 'playing';
        game.toppling = null;
        game.gameOverReason = null;
        game._beginStructuralToppleIfNeeded();
        const start = game.getDebugSnapshot();
        let steps = 0;
        while (game.state === 'settling-grid' && steps < 32) {
            game._updateGridFalling(Math.max(1, game.gameSpeed) / 1000);
            steps++;
        }
        const end = game.getDebugSnapshot();
        game.render();
        const landed = game.grid[game.rows - 1][3] === 1;
        return { bridgeStable: bridge.stable, solver: bridge.solver, neutralStable: neutral.stable,
            start, end, steps, landed };
    })()`);
    if (!structuralCoupled.bridgeStable || structuralCoupled.solver !== 'coupled-equilibrium' ||
        !structuralCoupled.neutralStable || structuralCoupled.start.state !== 'settling-grid' ||
        structuralCoupled.start.gridFallingBodies < 1 || structuralCoupled.steps >= 32 ||
        structuralCoupled.end.state !== 'playing' || structuralCoupled.end.gridFallingBodies !== 0 ||
        structuralCoupled.end.gameOverReason !== null || !structuralCoupled.landed ||
        structuralCoupled.end.occupiedCells !== 1 || !structuralCoupled.end.currentPiece) {
        throw new Error('Coupled structural physics failed in Electron: ' + JSON.stringify(structuralCoupled));
    }
    await screenshot(client, 'structural-free-fall.png');

    const rockingStart = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'rocking', rSegments: 8, rockingLengthCells: 10,
            rockingArcDegrees: 60, rockingMassKg: 20, rockingRollingFriction: 0,
            rockingAllowOverhang: true, structuralPieceFriction: 0,
            structuralPlatformFriction: 1, structuralWallFriction: 1 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        const { POLYOMINO_CATALOG } = await import('./games/reromo-tetris/polyominoes.js');
        const entry = POLYOMINO_CATALOG.byOrder[1][0];
        game.grid[7][8] = entry.index + 1;
        game.structuralBodyGrid[7][8] = 1;
        game._refreshRockingMass();
        for (let i = 0; i < 25; i++) game._updateRocking(1 / 60);
        game.currentPiece = { entry, r: 3, phi: -1, rotation: 0 };
        game._refreshPieceProjection();
        game.invalidate(); game.render();
        return game.getDebugSnapshot();
    })()`);
    if (rockingStart.mode !== 'rocking' || rockingStart.columns !== 10 || rockingStart.state !== 'playing' ||
        !(rockingStart.rocking.angle > 0) || !(rockingStart.rocking.translation.x > 0) ||
        rockingStart.rocking.massKg !== 21 || rockingStart.structuralStable !== true) {
        throw new Error('Rolling platform failed: ' + JSON.stringify(rockingStart));
    }
    await screenshot(client, 'rocking-lines.png');

    // Render near the configured angle limit without advancing physics. The
    // projection must keep the complete swept platform inside the board box,
    // while the side HUD remains outside that box.
    const rockingExtreme = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        const cameraBefore = { ...game.rockingViewport };
        game.rocking.angle = game.rockingShape.halfAngle * 0.95;
        game.rocking.omega = 0;
        game.rocking.alpha = 0;
        game.rocking.tipped = false;
        game._rebuildProjectionCache();
        game.invalidate();
        game.render();
        const view = game._cartesianSceneBounds();
        const board = game.layout.board;
        const hud = game.layout.hud;
        const boardView = board.view;
        const viewWidth = boardView.maxX - boardView.minX;
        const viewHeight = boardView.maxY - boardView.minY;
        const viewPixels = {
            minX: game.rockingViewport.originX + view.minX * game.rockingViewport.scale,
            maxX: game.rockingViewport.originX + view.maxX * game.rockingViewport.scale,
            minY: game.rockingViewport.originY + view.minY * game.rockingViewport.scale,
            maxY: game.rockingViewport.originY + view.maxY * game.rockingViewport.scale,
        };
        const viewDelta = Math.max(
            Math.abs(view.minX - boardView.minX), Math.abs(view.maxX - boardView.maxX),
            Math.abs(view.minY - boardView.minY), Math.abs(view.maxY - boardView.maxY),
        );
        const uiRect = game.ui?.gameUi?.getBoundingClientRect();
        const controlsRect = game.ui?.root?.querySelector('.reromo-controls-table')?.getBoundingClientRect();
        return {
            snapshot: game.getDebugSnapshot(),
            viewPixels,
            cameraBefore, cameraAfter: game.rockingViewport,
            view, boardView, viewDelta,
            board: { left: board.x, top: board.y, right: board.x + board.width, bottom: board.y + board.height },
            hud: { left: hud.x, right: hud.x + hud.width, top: hud.y, bottom: hud.y + hud.height },
            uiRect: uiRect ? { left: uiRect.left, top: uiRect.top, right: uiRect.right, bottom: uiRect.bottom } : null,
            controlsRect: controlsRect ? { left: controlsRect.left, top: controlsRect.top, right: controlsRect.right, bottom: controlsRect.bottom } : null,
            canvas: { width: game.w, height: game.h },
            angleLimit: game.rockingShape.halfAngle,
            renderCount: game.renderCount,
        };
    })()`);
    const viewTolerance = 1e-6;
    const hudTolerance = 3;
    if (rockingExtreme.snapshot.state !== 'playing' || rockingExtreme.snapshot.rocking.tipped ||
        Math.abs(rockingExtreme.snapshot.rocking.angle - rockingExtreme.angleLimit * 0.95) > 1e-12 ||
        rockingExtreme.cameraBefore.scale !== rockingExtreme.cameraAfter.scale ||
        rockingExtreme.cameraBefore.originX !== rockingExtreme.cameraAfter.originX ||
        rockingExtreme.cameraBefore.originY !== rockingExtreme.cameraAfter.originY ||
        rockingExtreme.viewPixels.minX < rockingExtreme.board.left - viewTolerance ||
        rockingExtreme.viewPixels.maxX > rockingExtreme.board.right + viewTolerance ||
        rockingExtreme.viewPixels.minY < rockingExtreme.board.top - viewTolerance ||
        rockingExtreme.viewPixels.maxY > rockingExtreme.board.bottom + viewTolerance ||
        rockingExtreme.hud.left < rockingExtreme.board.right - hudTolerance ||
        Math.abs(rockingExtreme.hud.top - rockingExtreme.board.top) > hudTolerance ||
        Math.abs(rockingExtreme.hud.bottom - rockingExtreme.board.bottom) > hudTolerance ||
        !rockingExtreme.controlsRect ||
        Math.abs(rockingExtreme.controlsRect.bottom - rockingExtreme.hud.bottom) > hudTolerance ||
        rockingExtreme.controlsRect.right > rockingExtreme.hud.right + hudTolerance) {
        throw new Error('Extreme rocking angle escaped its board bounds or overlapped the HUD: ' + JSON.stringify(rockingExtreme));
    }
    await screenshot(client, 'rocking-extreme-angle.png');

    const pressureClear = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'rocking-pressure', rockingLengthCells: 5,
            rockingCollapseMassKg: 2, rockingRollingFriction: 1, rockingAllowOverhang: false };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        const { POLYOMINO_CATALOG } = await import('./games/reromo-tetris/polyominoes.js');
        const entry = POLYOMINO_CATALOG.byOrder[1][0];
        for (const [r, c, id] of [[7,2,1], [7,3,2], [6,2,3]]) {
            game.grid[r][c] = entry.index + 1; game.structuralBodyGrid[r][c] = id;
        }
        game.nextStructuralBodyId = 4;
        game.currentPiece = { entry, r: 6, phi: 3, rotation: 0 };
        game._lockPiece();
        const rows = [...(game.lineClear?.rows || [])];
        game._finishLineClearAnimation(game.lineClear);
        game.invalidate(); game.render();
        return { rows, snapshot: game.getDebugSnapshot(), remaining: game._lockedCells().length };
    })()`);
    if (pressureClear.rows.join(',') !== '7' || pressureClear.remaining !== 2 || pressureClear.snapshot.lines !== 1) {
        throw new Error('Pressure row collapse failed: ' + JSON.stringify(pressureClear));
    }
    await screenshot(client, 'rocking-pressure.png');

    // A five-cell rocking cantilever (two cells over the deck and three
    // outside it) must enter the rigid collapse path while the heavy platform
    // starts stationary. This guards against treating a real overhang as a
    // detached grid fall or stabilizing it with a prescribed angle.
    const cantilever = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'rocking', phiSegments: 5, rSegments: 1,
            rockingLengthCells: 5, rockingArcDegrees: 60, rockingMassKg: 1000,
            rockingRollingFriction: 0, rockingAllowOverhang: true,
            structuralBlockMassKg: 1, structuralGravity: 9.81,
            structuralPieceFriction: 0, structuralPlatformFriction: 1, structuralWallFriction: 0 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart();
        const { POLYOMINO_CATALOG } = await import('./games/reromo-tetris/polyominoes.js');
        const value = POLYOMINO_CATALOG.byOrder[1][0].index + 1;
        game.grid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.structuralBodyGrid = Array.from({ length: game.rows }, () => new Int32Array(game.columns));
        game.pieceIdentityGrid = game.structuralBodyGrid;
        game.overhangGrid = new Map();
        for (const column of [3, 4]) {
            game.grid[0][column] = value;
            game.structuralBodyGrid[0][column] = 1;
        }
        for (const column of [5, 6, 7]) {
            game.overhangGrid.set('0,' + column, { row: 0, column, value, bodyId: 1 });
        }
        game.nextStructuralBodyId = 2;
        game.currentPiece = null;
        game.state = 'playing';
        game.gameOverReason = null;
        game.menuPaused = true;
        game.rocking.angle = 0;
        game.rocking.omega = 0;
        game.rocking.alpha = 0;
        game.rocking.tipped = false;
        game._refreshRockingMass();
        game._completeLineClear(0);
        const start = game.getDebugSnapshot();
        const startBody = start.collapse?.bodies?.[0];
        let maxDisplacement = 0;
        let steps = 0;
        while (game.state === 'toppling' && steps < 1200) {
            game._updateToppling(1 / 120);
            steps++;
            const body = game.getDebugSnapshot().collapse?.bodies?.[0];
            if (body && startBody) maxDisplacement = Math.max(maxDisplacement,
                Math.hypot(body.x - startBody.x, body.y - startBody.y));
            if (game.getDebugSnapshot().collapse?.settled) break;
        }
        game.render();
        return { start, end: game.getDebugSnapshot(), steps, maxDisplacement,
            insideCells: game.grid[0].filter(Boolean).length,
            overhangCells: game.overhangGrid.size };
    })()`);
    if (cantilever.insideCells !== 2 || cantilever.overhangCells !== 3 ||
        cantilever.start.mode !== 'rocking' || cantilever.start.rows !== 1 || cantilever.start.columns !== 5 ||
        cantilever.start.state !== 'toppling' || cantilever.start.gridFallingBodies !== 0 ||
        cantilever.start.collapse?.settled !== false || cantilever.start.collapse?.bodies?.length !== 1 ||
        cantilever.start.collapse.bodies[0].cells.length !== 5 ||
        Math.abs(cantilever.start.rocking.angle) > 1e-12 || Math.abs(cantilever.start.rocking.omega) > 1e-12 ||
        !(cantilever.start.rocking.massKg > 1000) || cantilever.steps >= 1200 ||
        cantilever.end.state !== 'gameover' || cantilever.end.gameOverReason !== 'topple' ||
        cantilever.end.collapse?.settled !== true || !(cantilever.end.collapse?.elapsed > 0) ||
        !(cantilever.maxDisplacement > 1e-5) ||
        !(Math.abs(cantilever.end.collapse.bodies[0].angle) > 1e-5)) {
        throw new Error('Five-cell rocking cantilever did not enter real collapse: ' + JSON.stringify(cantilever));
    }
    await screenshot(client, 'rocking-cantilever-start.png');
    await screenshot(client, 'rocking-cantilever-game-over.png');

    await client.evaluate(`(() => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'rocking', rSegments: 20, rockingLengthCells: 10 };
        window.app.currentSettings = structuredClone(game.settings);
        game.restart(); window.app.pauseGame();
        document.querySelector('[data-action="layout"]').click();
    })()`);
    await waitFor(() => client.evaluate(`Boolean(document.querySelector('[data-layout-editor]'))`), 'shared layout editor');
    await screenshot(client, 'layout-editor.png');
    const layoutCamera = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        const camera = structuredClone(game.rockingViewport);
        const transfer = new DataTransfer();
        const card = document.querySelector('[data-layout-widget-card="next"]');
        card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
        document.querySelector('[data-layout-slot="top-left-outer"]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        document.querySelector('[data-layout-setting="holdPreviewCellScale"]').value = '1.2';
        document.querySelector('[data-preview-framed]').checked = false;
        document.querySelector('[data-layout-setting="rockingFrameWidthCells"]').value = '14';
        document.querySelector('[data-layout-apply]').click();
        return camera;
    })()`);
    await waitFor(() => client.evaluate(`window.app.pauseMenu._view === 'main' && window.app.currentGame.settings.previewFramed === false`), 'layout applied');
    const appliedLayout = await client.evaluate(`(() => {
        const game = window.app.currentGame;
        window.app.pauseMenu.hide(); window.app.resumeGame(); game.setMenuPaused(true); game.render();
        const next = game.layout.widgets.next;
        const preview = document.querySelector('[data-hud-preview="hold"]');
        const copy = document.createElement('canvas'); copy.width = preview.width; copy.height = preview.height;
        const pixels = copy.getContext('2d', { willReadFrequently: true }); pixels.drawImage(preview, 0, 0);
        return { camera: game.rockingViewport, next, board: game.layout.board,
            framed: game.settings.previewFramed,
            backgroundAlpha: pixels.getImageData(0, 0, 1, 1).data[3],
            holdScale: Number(document.querySelector('[data-hud-preview="hold"]').dataset.previewScale) };
    })()`);
    if (appliedLayout.next.slot !== 'top-left-inner' ||
        Math.abs(appliedLayout.next.x + appliedLayout.next.width + 6 - appliedLayout.board.x) > 1 ||
        appliedLayout.holdScale !== 1.2 || appliedLayout.framed || appliedLayout.backgroundAlpha !== 0 ||
        appliedLayout.camera.scale !== layoutCamera.scale || appliedLayout.camera.originY !== layoutCamera.originY ||
        appliedLayout.camera.originX !== layoutCamera.originX) throw new Error('Layout editor failed: ' + JSON.stringify(appliedLayout));
    await screenshot(client, 'layout-applied.png');

    const recoveryVisual = await client.evaluate(`(async () => {
        const game = window.app.currentGame;
        game.settings = { ...game.settings, mode: 'structural', phiSegments: 10, rSegments: 20 };
        window.app.currentSettings = structuredClone(game.settings); game.restart(); game.setMenuPaused(true);
        const { POLYOMINO_CATALOG } = await import('./games/reromo-tetris/polyominoes.js');
        game._storeLockedCell({ row: 19, column: 4, value: POLYOMINO_CATALOG.byOrder[1][0].index + 1, bodyId: 1 });
        game.currentPiece = null; game._beginCollapse('slide');
        for (let i = 0; i < 2400 && game.state === 'toppling'; i++) game._updateToppling(1 / 240);
        const reached = game.state;
        if (reached === 'recovering') {
            window.app.pauseMenu.hide(); window.app._isPaused = true; game.menuPaused = false;
            game._updateGridRecovery(.25); game.render();
        }
        return { reached };
    })()`);
    if (recoveryVisual.reached !== 'recovering') throw new Error('Resting stack did not enter grid recovery');
    await screenshot(client, 'recovery-glow.png');
    const recoveredGame = await client.evaluate(`(() => {
        const game = window.app.currentGame; game._updateGridRecovery(.25);
        return { state: game.state, active: Boolean(game.currentPiece), occupied: game._lockedCells().length };
    })()`);
    if (recoveredGame.state !== 'playing' || !recoveredGame.active || recoveredGame.occupied !== 1)
        throw new Error('Recovery did not resume game: ' + JSON.stringify(recoveredGame));

    const iconDimensions = await client.evaluate(`(async () => {
        const image = document.createElement('img');
        image.src = new URL('./games/reromo-tetris/icon.svg', location.href).href;
        image.dataset.iconQa = 'true';
        Object.assign(image.style, {
            position: 'fixed', inset: '0', width: '100vw', height: '100vh',
            objectFit: 'contain', background: '#111118', zIndex: '99999',
        });
        document.body.appendChild(image);
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
    })()`);
    if (iconDimensions.width !== 1024 || iconDimensions.height !== 640) {
        throw new Error(`Programmatic icon has wrong dimensions: ${JSON.stringify(iconDimensions)}`);
    }
    await screenshot(client, 'icon-preview.png');
    await client.evaluate(`document.querySelector('[data-icon-qa]')?.remove()`);

    const exceptions = client.events.filter(event =>
        event.method === 'Runtime.exceptionThrown' ||
        (event.method === 'Log.entryAdded' && ['error', 'warning'].includes(event.params?.entry?.level)));
    if (exceptions.length) {
        throw new Error(`Renderer emitted errors: ${JSON.stringify(exceptions.slice(0, 4))}`);
    }

    console.log(JSON.stringify({
        discovered,
        grids: {
            circular: `${circular.columns}×${circular.rows}`,
            mobius: `${mobius.columns}×${mobius.rows} (${mobius.mobiusLogicalCellCount} logical fields)`,
            mobiusOdd: `${mobiusOdd.snapshot.columns}×${mobiusOdd.snapshot.rows}`,
            mobiusMaximum: `${mobiusMaximum.columns}×${mobiusMaximum.rows}`,
            mobius256: `${mobius256.columns}×${mobius256.rows}`,
            rectangular: `${rectangular.columns}×${rectangular.rows}`,
            structural: `${structuralEnd.columns}×${structuralEnd.rows}`,
        },
        benchmarks: {
            circular: circularBenchmark,
            mobius: mobiusBenchmark,
            mobiusMaximum: mobiusMaximumBenchmark,
            mobiusDenseMaximum: mobiusDenseBenchmark,
            mobius256: mobius256Benchmark,
            rectangular: rectangularBenchmark,
        },
        controls: {
            allOriginalBindings: true,
            normalDistance,
            quickDistance,
            groundedMovementLockedCells: afterGroundedMovement.occupiedCells,
            progression: {
                level: progression.level,
                gameSpeed: progression.gameSpeed,
                lockDelay: progression.lockDelay,
            },
            comboEnabledReachedGhost: afterCombo.currentPiece.r === afterCombo.currentPiece.ghostR,
            comboDisabledStayedAboveGhost: afterDisabledCombo.currentPiece.r < afterDisabledCombo.currentPiece.ghostR,
            comboReleaseLockedCells: comboAfterRelease.occupiedCells,
            comboDeadlineLockedWhileHeld: comboAfterDeadline.snapshot.occupiedCells,
            comboAutoSlideLandingColumn: autoSlideCombo.landing ? 4 : null,
            hardDropLockedCells: afterHardDrop.occupiedCells,
            pauseResume: paused.menuPaused && !resumed.menuPaused,
            standardEscPause: standardPause.standardPanel && !standardPause.oldSettingsButton,
        },
        sharedCircularMobiusMechanics: JSON.stringify(sharedMechanics.circular) === JSON.stringify(sharedMechanics.mobius),
        selectedGridDimensions: Object.fromEntries(Object.entries(gridDimensions).map(([mode, value]) => [
            mode,
            `${value.columns}×${value.rows} / ${value.projectionCellCount} fields`,
        ])),
        mobiusArrows: { afterLeft: mobiusAfterLeft.currentPiece.phi, afterRight: mobiusAfterRight.currentPiece.phi },
        mobiusRotations: { clockwise: mobiusClockwiseRotation, counterClockwise: mobiusCounterRotation },
        idleRenderDelta: idleEnd - idleStart,
        mobiusRestartReusedProjection,
        layoutMatrix,
        outlinePixels,
        structuralTopple: {
            start: {
                state: structuralStart.snapshot.state,
                bodyCount: structuralStart.snapshot.collapse?.bodies?.length || 0,
                settled: structuralStart.snapshot.collapse?.settled,
            },
            end: {
                state: structuralEnd.state,
                gameOverReason: structuralEnd.gameOverReason,
                elapsed: structuralEnd.collapse?.elapsed,
                settled: structuralEnd.collapse?.settled,
            },
            bodyDisplacement: structuralStart.maxBodyDisplacement,
            bodyAngleChange: structuralStart.maxAngleChange,
            pieceContacts: structuralStart.maxPieceContacts,
            rockingStart, rockingExtreme, pressureClear, coupled: structuralCoupled,
            cantilever,
        },
        customGridPreparation,
        classicMobiusPreparation,
        classicCartesianPreparation,
        settings: {
            fields: settingsView.settingKeys.length,
            controls: settingsView.controlBindings,
            probabilityRows: settingsView.probabilityRows.length,
            perOrderButtons: settingsView.detailButtons,
        },
        initialProfileIsolation,
        editors: {
            tetrominoes: editor.tetrominoCount,
            decominoes: decominoEditor.catalogCount,
            virtualizedVisibleCards: decominoEditor.visibleCards,
        },
        stderr: stderr.trim().split(/\r?\n/).filter(Boolean).slice(-4),
    }, null, 2));
} catch (error) {
    console.error(error.stack || error);
    if (stdout.trim()) console.error(`Electron stdout:\n${stdout}`);
    if (stderr.trim()) console.error(`Electron stderr:\n${stderr}`);
    process.exitCode = 1;
} finally {
    client?.close();
    child.kill();
    await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        delay(3000),
    ]);
}
