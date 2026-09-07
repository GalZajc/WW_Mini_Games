import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const artifactDirectory = path.join(root, 'tests', 'artifacts');
const debugPort = 9364;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CdpClient {
    constructor(url) {
        this.socket = new WebSocket(url);
        this.id = 0;
        this.pending = new Map();
        this.exceptions = [];
    }

    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
        this.socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
            if (message.method === 'Runtime.exceptionThrown') this.exceptions.push(message);
            if (!message.id) return;
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
        const response = await this.call('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (response.exceptionDetails) {
            throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        }
        return response.result.value;
    }

    close() { this.socket.close(); }
}

async function waitFor(callback, description, timeout = 15000) {
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

async function findPage() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    if (!response.ok) return null;
    const pages = await response.json();
    return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
}

const child = spawn(electronPath, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '';
let stderr = '';
child.stdout.on('data', data => { stdout += data; });
child.stderr.on('data', data => { stderr += data; });

let client;
try {
    await mkdir(artifactDirectory, { recursive: true });
    const page = await waitFor(findPage, 'Electron renderer');
    client = new CdpClient(page.webSocketDebuggerUrl);
    await client.connect();
    await client.call('Runtime.enable');
    await client.call('Page.enable');
    await waitFor(() => client.evaluate(`Boolean(window.app?.gameLoader?.games?.length)`), 'game discovery');

    const state = await client.evaluate(`(async () => {
        window.app.settingsManager.save = async () => {};
        window.app.records.addRecord = async () => {};
        const config = window.app.gameLoader.games.find(game => game._id === 'rod-balance');
        if (!config) throw new Error('Rod Balance was not discovered.');
        await window.app.launchGame(config);
        window.app._isPaused = true;
        const wrapper = window.app.currentGame;
        const selectorCount = wrapper.modeSelector.querySelectorAll('[data-mode]').length;
        wrapper.modeSelector.querySelector('[data-mode="3d"]').click();
        wrapper._onScoreSubmit = () => {};
        const game = wrapper.child;
        const initialTilt = Math.acos(game.rodDirection.y) * 180 / Math.PI;
        const initialDirection = game.rodDirection.clone();
        game.update(0.05);
        const readyFrozen = game.phase === 'ready'
            && game.score === 0
            && game._survivalSeconds === 0
            && game.rodDirection.distanceTo(initialDirection) === 0;
        const readyVisible = getComputedStyle(game.readyElement).display === 'grid';
        const pointerBeforeStart = game.wantsPointerLockNow();
        window.app._isPaused = false;
        window.app.pauseGame();
        const pauseOverlay = window.app.pauseMenu.overlay;
        const pauseZIndex = Number(getComputedStyle(pauseOverlay).zIndex);
        const gameHudZIndex = Number(getComputedStyle(game.hud).zIndex);
        const topCenterElement = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        const pauseIsTopLayer = pauseOverlay.contains(topCenterElement)
            && pauseOverlay.parentElement === document.body
            && pauseZIndex > gameHudZIndex;
        window.app.pauseMenu.hide();
        window.app._isPaused = true;
        game._beginRun(false);
        const projectedHand = game.handPosition.clone().project(game.camera);
        const rect = game.canvas.getBoundingClientRect();
        const expectedMouse = {
            x: rect.left + (projectedHand.x + 1) * 0.5 * rect.width,
            y: rect.top + (1 - projectedHand.y) * 0.5 * rect.height,
        };
        const actualMouse = game.input.getMousePos();
        const mousePositionError = Math.hypot(actualMouse.x - expectedMouse.x, actualMouse.y - expectedMouse.y);
        const cameraBeforeOrbit = game.camera.position.clone();
        const yawBeforeOrbit = game.cameraYaw;
        const fakeEvent = { preventDefault() {} };
        game._orbitMouseDownHandler({ ...fakeEvent, button: 2 });
        game._orbitMouseMoveHandler({ ...fakeEvent, movementX: 44, movementY: -18 });
        game._orbitMouseUpHandler({ ...fakeEvent, button: 2 });
        game._updateMouseTarget();
        const orbitCameraMoved = game.camera.position.distanceTo(cameraBeforeOrbit) > 0.1;
        const orbitThetaDirectionCorrect = game.cameraYaw > yawBeforeOrbit;
        const orbitKeptHandStill = game.handTarget.distanceTo(game.handPosition) < 1e-6;
        game.input.setMousePos(rect.right - 2, rect.top + rect.height * 0.12);
        game._updateMouseTarget();
        const unboundedHandTargetRadius = Math.hypot(game.handTarget.x, game.handTarget.z);
        game._placeVirtualPointerAtHand();
        game._updateMouseTarget();
        for (let index = 0; index < 30 && game.phase === 'playing'; index++) {
            game._stepPlaying(game.parameters.fixedTimeStep);
        }
        game._syncMeshes();
        game._renderHud();
        game.render();
        const { settingsKey } = await import('./core/RecordsManager.js');
        return {
            constructor: game.constructor.name,
            selectorCount,
            wrapperSettings: wrapper.constructor.getSettingsSchema().map(setting => setting.key),
            settings: game.constructor.getSettingsSchema().map(setting => setting.key),
            centerPoints: game._pointsAt({ x: 0, z: 0 }),
            edgePoints: game._pointsAt({ x: 5.25, z: 0 }),
            outsidePoints: game._pointsAt({ x: 8, z: 0 }),
            initialTilt,
            readyFrozen,
            readyVisible,
            pointerBeforeStart,
            pauseIsTopLayer,
            pauseZIndex,
            gameHudZIndex,
            mousePositionError,
            orbitCameraMoved,
            orbitThetaDirectionCorrect,
            orbitKeptHandStill,
            unboundedHandTargetRadius,
            simulatedPhase: game.phase,
            simulatedScore: game.score,
            finiteState: [
                ...game.bottomPosition.toArray(),
                ...game.rodDirection.toArray(),
                game.score,
            ].every(Number.isFinite),
            exactKeyOrder: settingsKey({ b: 2, a: { d: 4, c: 3 } }) === settingsKey({ a: { c: 3, d: 4 }, b: 2 }),
            rejectsExtraSetting: settingsKey({ a: 1 }) !== settingsKey({ a: 1, stale: true }),
            pointerLock: game.wantsPointerLockNow(),
            hasHud: document.body.contains(game.hud),
        };
    })()`);

    const expectedSettings = ['handLength', 'frictionCoefficient', 'rodLength', 'gravity'];
    if (JSON.stringify(state.settings) !== JSON.stringify(expectedSettings)) {
        throw new Error(`Unexpected settings schema: ${JSON.stringify(state)}`);
    }
    if (!state.finiteState || !state.exactKeyOrder || !state.rejectsExtraSetting || !state.pointerLock || !state.hasHud
        || state.selectorCount !== 2 || state.wrapperSettings.length !== 10
        || !state.wrapperSettings.includes('threeD_gravity') || !state.wrapperSettings.includes('twoD_gravity')
        || !state.readyFrozen || !state.readyVisible || state.pointerBeforeStart || !state.pauseIsTopLayer
        || state.mousePositionError > 0.01 || !state.orbitCameraMoved || !state.orbitThetaDirectionCorrect
        || !state.orbitKeptHandStill || !(state.unboundedHandTargetRadius > 3.75)) {
        throw new Error(`Invalid initial runtime state: ${JSON.stringify(state)}`);
    }
    if (state.centerPoints !== 10 || state.edgePoints !== 1 || state.outsidePoints !== 0 || state.initialTilt > 10.001
        || state.simulatedPhase !== 'playing' || !(state.simulatedScore > 0)) {
        throw new Error(`Invalid target scoring or initial tilt: ${JSON.stringify(state)}`);
    }

    const screenshot = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(artifactDirectory, 'rod-balance.png'), Buffer.from(screenshot.data, 'base64'));

    const failure = await client.evaluate(`(() => {
        const game = window.app.currentGame.child;
        game.phase = 'playing';
        game.contactState = 'sliding';
        game.bottomPosition.copy(game.handPosition);
        game.bottomPosition.x += game.parameters.handLength;
        game._stepPlaying(game.parameters.fixedTimeStep);
        const failed = game.phase === 'dead' && game.failureReason.includes('slid off');
        game._resetRun();
        return {
            failed,
            resetPhase: game.phase,
            resetSurvival: game._survivalSeconds,
            resetScore: game.score,
        };
    })()`);
    if (!failure.failed || failure.resetPhase !== 'ready' || failure.resetSurvival !== 0 || failure.resetScore !== 0) {
        throw new Error(`Failure/restart lifecycle is invalid: ${JSON.stringify(failure)}`);
    }

    const zeroFriction = await client.evaluate(`(() => {
        window.app.restartGame({ ...window.app.currentSettings, threeD_frictionCoefficient: 0 });
        window.app._isPaused = true;
        const wrapper = window.app.currentGame;
        wrapper._onScoreSubmit = () => {};
        const game = wrapper.child;
        game._beginRun(false);
        game.rodDirection.set(0.1, Math.sqrt(0.99), 0).normalize();
        game.angularVelocity.set(0, 0, 0);
        game.handTarget.copy(game.handPosition);
        game.handVelocity.set(0, 0, 0);
        game.bottomVelocity.set(0, 0, 0);
        game.contactState = 'sticking';
        game._stepPlaying(game.parameters.fixedTimeStep);
        return {
            contactState: game.contactState,
            bottomVelocityX: game.bottomVelocity.x,
            friction: game.parameters.frictionCoefficient,
        };
    })()`);
    if (zeroFriction.contactState !== 'sliding' || !(zeroFriction.bottomVelocityX < 0) || zeroFriction.friction !== 0) {
        throw new Error(`Zero-friction dynamics are invalid: ${JSON.stringify(zeroFriction)}`);
    }

    const twoDimensional = await client.evaluate(`(async () => {
        const wrapper = window.app.currentGame;
        wrapper.returnToModeSelector();
        wrapper.modeSelector.querySelector('[data-mode="2d"]').click();
        window.app._isPaused = true;
        wrapper._onScoreSubmit = () => {};
        const game = wrapper.child;
        const initialAngle = Math.abs(game.angle) * 180 / Math.PI;
        const initialBottom = { ...game.bottomPosition };
        game.update(0.05);
        const readyFrozen = game.phase === 'ready'
            && game._survivalSeconds === 0
            && game.score === 0
            && game.bottomPosition.x === initialBottom.x
            && game.bottomPosition.y === initialBottom.y;
        game._beginRun(false);
        for (let index = 0; index < 30 && game.phase === 'playing'; index++) {
            game._stepPlaying(game.parameters.fixedTimeStep);
        }
        game._renderHud();
        game.render();
        return {
            constructor: game.constructor.name,
            readyFrozen,
            initialAngle,
            phase: game.phase,
            score: game.score,
            centerPoints: game._pointsAtX(0),
            edgePoints: game._pointsAtX(5.25),
            outsidePoints: game._pointsAtX(8),
            settings: game.constructor.getSettingsSchema().map(setting => setting.key),
            friction: game.parameters.frictionCoefficient,
            configuredFriction: wrapper.settings.twoD_frictionCoefficient,
            separateCardHidden: !window.app.gameLoader.games.some(config => config._id === 'rod-balance-2d'),
            recordMode: wrapper.getRecordSettings().mode,
            pointerLock: game.wantsPointerLockNow(),
            finiteState: [
                game.handPosition.x, game.handPosition.y,
                game.bottomPosition.x, game.bottomPosition.y,
                game.angle, game.score,
            ].every(Number.isFinite),
        };
    })()`);
    if (!twoDimensional.readyFrozen || twoDimensional.initialAngle > 10.001
        || twoDimensional.phase !== 'playing' || !(twoDimensional.score > 0)
        || twoDimensional.centerPoints !== 10 || twoDimensional.edgePoints !== 1
        || twoDimensional.outsidePoints !== 0 || !twoDimensional.pointerLock
        || !twoDimensional.finiteState || twoDimensional.friction === 0
        || twoDimensional.friction !== twoDimensional.configuredFriction
        || !twoDimensional.separateCardHidden || twoDimensional.recordMode !== '2d'
        || JSON.stringify(twoDimensional.settings) !== JSON.stringify(expectedSettings)) {
        throw new Error(`Rod Balance 2D runtime state is invalid: ${JSON.stringify(twoDimensional)}`);
    }

    const screenshot2d = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path.join(artifactDirectory, 'rod-balance-2d.png'), Buffer.from(screenshot2d.data, 'base64'));

    const pulledFloor = await client.evaluate(`(() => {
        const game = window.app.currentGame.child;
        game._resetRun();
        game._beginRun(false);
        game.handTarget.y = game.handPosition.y - 10;
        game._stepPlaying(game.parameters.fixedTimeStep);
        return {
            phase: game.phase,
            reason: game.failureReason,
            verticalAcceleration: game.handAcceleration.y,
        };
    })()`);
    if (pulledFloor.phase !== 'dead' || !pulledFloor.reason.includes('out from under')
        || !(pulledFloor.verticalAcceleration < -9.81)) {
        throw new Error(`Pulled-floor failure is invalid: ${JSON.stringify(pulledFloor)}`);
    }

    if (client.exceptions.length) {
        throw new Error(`Renderer exceptions: ${JSON.stringify(client.exceptions.slice(0, 3))}`);
    }
    console.log(JSON.stringify({ state, failure, zeroFriction, twoDimensional, pulledFloor }, null, 2));
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
