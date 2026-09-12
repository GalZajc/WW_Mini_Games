import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root,'tests','artifacts','tetris-orientations');
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9393;
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
 await mkdir(artifacts,{recursive:true});
 const page=await waitFor(getPage,'renderer');client=new Client(page.webSocketDebuggerUrl);await client.connect();
 await waitFor(()=>client.evaluate('Boolean(window.app?.gameLoader?.games?.length)'),'games');
 for(const mode of ['rectangular','structural','rocking','rocking-pressure','circular','mobius']){
 await client.evaluate(`(async()=>{window.app.settingsManager.save=async()=>{};const c=window.app.gameLoader.games.find(g=>g._id==='reromo-tetris');await window.app.launchGame(c);window.app._isPaused=true;const g=window.app.currentGame;g._selectInitialMode('${mode}');})()`);
 await waitFor(()=>client.evaluate('Boolean(window.app.currentGame.projection)&&!window.app.currentGame.projectionLoading'),'projection',30000);
 for(const name of ['J','S','T']){
 const result=await client.evaluate(`(async()=>{const g=window.app.currentGame;const {POLYOMINO_CATALOG,getPreviewCells}=await import('./games/reromo-tetris/polyominoes.js');const e=POLYOMINO_CATALOG.byOrder[4].find(p=>p.classicName==='${name}');g._spawnPiece(e);g.currentPiece.r=3;g.heldPieceIndex=e.index;g.nextPieces.fill(e.index);g._refreshPieceProjection();g.ui.hudPreviewSignature='';g.ui.updateHud();g.render();return {mode:g.settings.mode,name:e.classicName,blocks:g._blocksFor(g.currentPiece),preview:getPreviewCells(e,g.settings.mode)};})()`);
 const wake=setInterval(()=>client.call('Page.captureScreenshot',{format:'png',fromSurface:false}).catch(()=>{}),700); const shot=await client.call('Page.captureScreenshot',{format:'png',fromSurface:true}); clearInterval(wake);await writeFile(path.join(artifacts,mode+'-'+name+'.png'),Buffer.from(shot.data,'base64'));console.log(JSON.stringify(result));
 }
 }
}finally{client?.close();child.kill();}
