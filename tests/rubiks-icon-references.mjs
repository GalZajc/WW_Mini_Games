import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const modes = ['torus', 'tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron'];
const requestedMode = process.argv[2] || 'polyhedra';
if (!modes.includes(requestedMode) && requestedMode !== 'polyhedra') throw new Error(`Usage: node tests/rubiks-mode-visual.mjs <${modes.join('|')}|polyhedra>`);
const runModes = requestedMode === 'polyhedra' ? modes.filter(mode => mode !== 'torus') : [requestedMode];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'renderer', 'games', 'rubiks-cuboid', 'assets', 'icon-references', 'order-5');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9391;
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
    await client.call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1024, deviceScaleFactor: 1, mobile: false });
    await waitFor(() => client.evaluate('Boolean(window.app?.gameLoader?.games?.length)'), 'game discovery');
    for (const mode of runModes) {
        const state = await client.evaluate(`(async () => {
            window.app.settingsManager.save = async () => {};
            window.app.records.addRecord = async () => {};
            const config = window.app.gameLoader.games.find(game => game._id === 'rubiks-cuboid');
            await window.app.launchGame(config);
            window.app._isPaused = true;
            const game = window.app.currentGame;
            game._selectPendingMode('${mode}');
            game.modeSelector.querySelector('[data-size-key="polyhedronOrder"]').value = '5';
            game.selectMode('${mode}');
            const view = game.surfaceMode;
            if (!view || view.model.order !== 5 || view.model.score() !== view.model.maximumScore) throw new Error('Reference is not solved order 5');
            view.hud.style.visibility = 'hidden';
            view.camera.position.setLength(9.7);
            view.camera.lookAt(0,0,0);
            view.camera.updateMatrixWorld(true);
            game.render();
            const gl = view.renderer.getContext();
            const start = performance.now();
            for (let frame=0;frame<20;frame++) { game.render(); gl.finish(); }
            const renderMs = (performance.now()-start)/20;
            const state = { mode:game.mode, order:view.model.order, faces:view.model.faces.length, stickers:view.model.slots.length, camera:view.camera.position.toArray(), solved:true, renderMs, drawCalls:view.renderer.info.render.calls, triangles:view.renderer.info.render.triangles, image: view.canvas.toDataURL('image/png').split(',')[1] };
            if (${process.argv.includes('--verify-batch')}) {
                const read = () => { view.render(); const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4); gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes); return bytes; };
                state.batchComparison=[];
                for (const moving of [false,true]) {
                    if(moving){ const move=view.model.moves.find(m=>m.layer===1); view._applyAnimatedMove({axisIndex:move.axisIndex,axis:move.axis,layer:move.layer,move},1); view.animation.progress=.5; view._refreshMeshes(); }
                    view.stickerBatch.visible=false; view.slotMeshes.forEach(mesh=>mesh.visible=true);
                    const original=read(); const originalCalls=view.renderer.info.render.calls;
                    view.stickerBatch.visible=true; view.slotMeshes.forEach(mesh=>mesh.visible=false);
                    const batched=read(); let maxDifference=0, changed=0;
                    for(let i=0;i<original.length;i++){const d=Math.abs(original[i]-batched[i]);maxDifference=Math.max(maxDifference,d);if(d)changed++;}
                    state.batchComparison.push({moving,maxDifference,changed,originalCalls,batchedCalls:view.renderer.info.render.calls});
                    // Batched GPU matrix multiplication can round a few
                    // antialiased edge samples differently; reject any
                    // substantive image change (over 0.01% of channels).
                    if(changed>original.length*.0001)throw new Error('Batch changed rendered pixels: '+JSON.stringify(state.batchComparison));
                }
            }
            return state;
        })()`);
        await writeFile(path.join(artifacts, mode + '.png'), Buffer.from(state.image,'base64'));
        delete state.image;
        await writeFile(path.join(artifacts, mode + '.json'), JSON.stringify(state,null,2));
        console.log(JSON.stringify(state));
    }
} catch (error) { console.error(error.stack || error); process.exitCode=1; }
finally { client?.close(); child.kill(); }
