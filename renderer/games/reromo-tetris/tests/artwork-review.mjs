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
    const result = await client.call('Page.captureScreenshot', { format: 'png', fromSurface: false });
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
const fs = await import('node:fs/promises');
const cardSource = await fs.readFile(path.join(projectRoot,'renderer/components/GameCard.js'),'utf8');
const keys = [...new Set([...cardSource.matchAll(/^\s+'([^']+)':/gm)].map(match=>match[1]).concat(['tetris-survival','tetris-sprint']))];
const child=spawn(electronPath,['.',`--remote-debugging-port=${debugPort}`],{cwd:projectRoot,windowsHide:true,env:{...process.env,WW_MINI_GAMES_HEADLESS_TEST:'1'},stdio:'ignore'});
let client;
try {
 const page=await waitFor(async()=> (await getPages()).find(p=>p.type==='page'&&p.webSocketDebuggerUrl),'renderer');
 client=new CdpClient(page.webSocketDebuggerUrl); await client.connect(); await client.call('Runtime.enable'); await client.call('Page.enable');
 await waitFor(()=>client.evaluate('Boolean(window.app?.gameLoader?.games?.length)'),'launcher');
 await setViewport(client,1200,900);
 const audit=await client.evaluate(`(async()=>{
  const {createGameCard,gameArtworkMarkup}=await import('./components/GameCard.js');
  const entries=window.app.gameLoader.games.map(g=>({key:g._id,label:g.name,html:createGameCard(g,()=>{}).querySelector('.game-card-thumb').innerHTML}));
  for(const key of ${JSON.stringify(keys)}) { const html=gameArtworkMarkup(key,key); if(html)entries.push({key,label:key,html}); }
  window.artAudit=entries; return entries.map(({html,...item})=>({...item,type:html.includes('<img')?'raster':'vector'}));
 })()`);
 await fs.writeFile(path.join(artifactDir,'artwork-audit.json'),JSON.stringify(audit,null,2));
 for(let offset=0;offset<audit.length;offset+=20){
  await client.evaluate(`(()=>{document.body.innerHTML='<style>body{margin:0;background:#202428;color:white;font:13px sans-serif}.sheet{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:10px}.item{height:205px;overflow:hidden}.art{height:175px;background:#12151b;overflow:hidden}.art img,.art svg{width:100%;height:100%;object-fit:contain}.label{padding:5px}</style><div class="sheet">'+window.artAudit.slice(${offset},${offset+20}).map(e=>'<div class="item"><div class="art">'+e.html+'</div><div class="label">'+e.label+'</div></div>').join('')+'</div>';})()`);
  await client.evaluate('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
  await screenshot(client,`artwork-review-${offset/20+1}.png`);
 }
 console.log(JSON.stringify({entries:audit.length,pages:Math.ceil(audit.length/20)}));
}finally{client?.close(); child.kill();}