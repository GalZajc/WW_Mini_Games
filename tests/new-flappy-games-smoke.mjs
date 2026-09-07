import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDirectory = path.join(root, 'tests', 'artifacts');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9361;
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

    close() {
        this.socket.close();
    }
}

async function waitFor(callback, description, timeout = 15000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const value = await callback();
            if (value) return value;
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

async function saveScreenshot(client, filename) {
    const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(artifactDirectory, filename), Buffer.from(screenshot.data, 'base64'));
}

let stdout = '';
let stderr = '';
const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', data => { stdout += data.toString(); });
child.stderr.on('data', data => { stderr += data.toString(); });

let client;
try {
    await mkdir(artifactDirectory, { recursive: true });
    const page = await waitFor(getPage, 'Electron renderer');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');

    await waitFor(() => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length)`), 'game discovery');
    const discovered = await client.evaluate(`window.app.gameLoader.games.map(game => game._id)`);
    for (const id of ['sky-pilot-3d', 'flappy']) {
        if (!discovered.includes(id)) throw new Error(`${id} was not discovered.`);
    }
    for (const hiddenId of ['flappy-bird', 'flappy-3d', 'multi-lane-flappy-3d']) {
        if (discovered.includes(hiddenId)) throw new Error(`${hiddenId} should be hidden behind the unified Flappy card.`);
    }

    const skyPilot = await client.evaluate(`(async () => {
        const config = window.app.gameLoader.games.find(game => game._id === 'sky-pilot-3d');
        await window.app.launchGame(config);
        const game = window.app.currentGame;
        game._mouseDeltaX = 9;
        game._mouseDeltaY = -7;
        game.update(1 / 60);
        game.render();
        return {
            constructor: game.constructor.name,
            hasPlane: Boolean(game.birdMesh?.userData?.propeller),
            hasHoops: game.pillars.length,
            position: game.birdPos.toArray(),
            pitch: game.flightPitch,
            pointerLockRequested: game.wantsPointerLockNow(),
        };
    })()`);
    if (!skyPilot.hasPlane || skyPilot.hasHoops < 18 || !skyPilot.position.every(Number.isFinite)) {
        throw new Error(`Sky Pilot runtime state is invalid: ${JSON.stringify(skyPilot)}`);
    }
    await saveScreenshot(client, 'sky-pilot-3d.png');

    await client.evaluate(`window.app.exitGame()`);
    const multiLane = await client.evaluate(`(async () => {
        window.__flappyBestCalls = [];
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async () => {};
        window.app.records.getBest = async (...args) => {
            window.__flappyBestCalls.push(args);
            return null;
        };
        const config = window.app.gameLoader.games.find(game => game._id === 'flappy');
        await window.app.launchGame(config);
        const collection = window.app.currentGame;
        if (!collection.modeSelector?.querySelectorAll('[data-mode]').length) throw new Error('Flappy mode selector is missing.');
        const gliderGravityBefore = collection._childSettings('glider3d').gravity;
        collection.settings.classic_gravity = 0.3;
        const profileIsolation = {
            selectorUsesGalleryDesign: collection.modeSelector.classList.contains('ww-mode-select'),
            classicGravity: collection._childSettings('classic').gravity,
            gliderGravityBefore,
            gliderGravityAfter: collection._childSettings('glider3d').gravity,
            hasSeparateKeys: 'classic_gravity' in collection.settings && 'glider_gravity' in collection.settings,
        };
        collection.selectMode('classic');
        collection.child.update(1 / 60);
        collection.child.render();
        const classicMode = {
            constructor: collection.child.constructor.name,
            has2DContext: Boolean(collection.child.ctx),
        };
        collection.returnToModeSelector();
        collection.selectMode('glider3d');
        collection.child.update(1 / 60);
        collection.child.render();
        const gliderMode = {
            constructor: collection.child.constructor.name,
            hasRenderer: Boolean(collection.child.renderer),
            pointerLockRequested: collection.wantsPointerLockNow(),
        };
        collection.returnToModeSelector();
        collection.settings.multi_laneCount = '2';
        collection.selectMode('multilane');
        const game = collection.child;
        const before = game.birds.map(bird => bird.velocityY);
        game.input._keysJustDown.add('KeyQ');
        game.update(1 / 60);
        game.render();
        return {
            constructor: game.constructor.name,
            collection: collection.constructor.name,
            selectedMode: collection.mode,
            laneCount: game.laneCount,
            birdCount: game.birds.length,
            rowCount: game.rows.length,
            controlCount: game.constructor.getControlsSchema().length,
            after: game.birds.map(bird => bird.velocityY),
            before,
            hasHud: Boolean(document.body.contains(game._hud)),
            pointerLockRequested: game.wantsPointerLockNow(),
            bestCalls: window.__flappyBestCalls.map(args => ({ gameId: args[0], settings: args[1] })),
            modeSmoke: { classicMode, gliderMode },
            profileIsolation,
        };
    })()`);
    if (multiLane.laneCount !== 2 || multiLane.birdCount !== 2 || multiLane.controlCount !== 8 || !multiLane.hasHud) {
        throw new Error(`Multi-lane defaults are invalid: ${JSON.stringify(multiLane)}`);
    }
    if (!(multiLane.after[0] > multiLane.before[0]) || multiLane.pointerLockRequested) {
        throw new Error(`Lane Q input did not flap only the keyboard-driven game: ${JSON.stringify(multiLane)}`);
    }
    if (!multiLane.modeSmoke.classicMode.has2DContext || !multiLane.modeSmoke.gliderMode.hasRenderer
        || !multiLane.modeSmoke.gliderMode.pointerLockRequested) {
        throw new Error(`Unified Flappy modes failed to initialize: ${JSON.stringify(multiLane.modeSmoke)}`);
    }
    if (!multiLane.profileIsolation.selectorUsesGalleryDesign || !multiLane.profileIsolation.hasSeparateKeys ||
        multiLane.profileIsolation.classicGravity !== 0.3 ||
        multiLane.profileIsolation.gliderGravityBefore !== multiLane.profileIsolation.gliderGravityAfter) {
        throw new Error(`Flappy mode settings leaked between profiles: ${JSON.stringify(multiLane.profileIsolation)}`);
    }
    if (!multiLane.bestCalls.some(call => call.gameId === 'flappy' && call.settings.mode === 'multilane')) {
        throw new Error(`Unified Flappy high-score lookup was not mode-specific: ${JSON.stringify(multiLane.bestCalls)}`);
    }
    await saveScreenshot(client, 'multi-lane-flappy-3d.png');

    const failurePolicy = await client.evaluate(`(() => {
        const game = window.app.currentGame.child;
        const before = game.birds.map(bird => ({
            color: bird.mesh.userData.bodyMaterial.color.getHex(),
            emissive: bird.mesh.userData.bodyMaterial.emissive.getHex(),
        }));
        game._failLane(game.birds[0], null);
        const after = game.birds.map(bird => ({
            color: bird.mesh.userData.bodyMaterial.color.getHex(),
            emissive: bird.mesh.userData.bodyMaterial.emissive.getHex(),
        }));
        return {
            phase: game.phase,
            failedAlive: game.birds[0].alive,
            otherBirdStillAlive: game.birds[1].alive,
            colorsUnchanged: JSON.stringify(before) === JSON.stringify(after),
            overlayText: game._gameOverOverlay?.textContent || '',
        };
    })()`);
    if (failurePolicy.phase !== 'dead' || failurePolicy.failedAlive || !failurePolicy.otherBirdStillAlive
        || !failurePolicy.colorsUnchanged || !failurePolicy.overlayText.includes('A BIRD MISSED')) {
        throw new Error(`Multi-lane failure policy is invalid: ${JSON.stringify(failurePolicy)}`);
    }

    const eightLanes = await client.evaluate(`(() => {
        const collection = window.app.currentGame;
        collection.settings.multi_laneCount = '8';
        collection.returnToModeSelector();
        collection.selectMode('multilane');
        const game = collection.child;
        game.update(1 / 60);
        game.render();
        return {
            laneCount: game.laneCount,
            birdCount: game.birds.length,
            firstX: game.birds[0].mesh.position.x,
            lastX: game.birds[7].mesh.position.x,
        };
    })()`);
    if (eightLanes.laneCount !== 8 || eightLanes.birdCount !== 8 || !(eightLanes.firstX < eightLanes.lastX)) {
        throw new Error(`Eight-lane layout is invalid: ${JSON.stringify(eightLanes)}`);
    }
    await saveScreenshot(client, 'multi-lane-flappy-3d-8-lanes.png');

    const exceptions = client.events.filter(event => event.method === 'Runtime.exceptionThrown');
    if (exceptions.length) throw new Error(`Renderer exceptions: ${JSON.stringify(exceptions.slice(0, 3))}`);

    console.log(JSON.stringify({ discovered, skyPilot, multiLane, failurePolicy, eightLanes }, null, 2));
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
