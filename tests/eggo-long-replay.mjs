// Long autonomous Eggo Mania replay: runs the production game from a fresh Survival start with the
// recorded inputs and compares every rendered frame (SHA-256 of the RGB565 framebuffer) with the
// original capture. Stops at the first difference and stores app PNG + state for diagnosis.
//
//   node tests/eggo-long-replay.mjs --recording=<capture dir> --steps=<steps.json> --start-after=400 \
//        --seed=1492 [--limit=N] [--chunk=300]
//
// No native state is injected after the first frame; only the seed (RNG state when Survival was started).
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback = null) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const recording = arg('recording'), stepsFile = arg('steps'), startAfter = Number(arg('start-after', 400));
const seed = Number(arg('seed', 1492)), limit = Number(arg('limit', Infinity)), chunk = Number(arg('chunk', 300));
const dumpFrames = (arg('dump', '') || '').split(',').filter(Boolean).map(Number), noStop = process.argv.includes('--no-stop'), traceUntil = Number(arg('trace-until', 0)), drawProbe = (arg('draw-probe', '') || '').split(',').map(Number);
const character = arg('character', 'yolko'), videoOffset = Number(arg('video-offset', 0));
const traceDetailFrom = Number(arg('trace-detail-from', Infinity));
const pixelProbe=(arg('pixel-probe','')||'').split(',').filter(Boolean).map(Number);
const hashMode=arg('hash-mode','js');
// Diagnostic acceleration only: no claim of pixel parity for skipped renders.
const renderFrom=Number(arg('render-from',startAfter+videoOffset+1));
if(!['js','native'].includes(hashMode))throw Error('--hash-mode must be js or native');
if (!recording || !stepsFile) throw Error('--recording and --steps are required');
const artifacts = path.join(root, 'tests', 'OUTPUT', 'eggo-long-replay_' + new Date().toISOString().replace(/[:.]/g, '-'));
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9397;
const delay = ms => new Promise(r => setTimeout(r, ms));

class Client {
    constructor(url) { this.socket = new WebSocket(url); this.nextId = 1; this.pending = new Map(); }
    async connect() {
        await new Promise((res, rej) => { this.socket.once('open', res); this.socket.once('error', rej); });
        this.socket.on('message', raw => {
            const m = JSON.parse(raw.toString()); if (!m.id) return;
            const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id);
            m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
        });
    }
    call(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
    }
    async evaluate(expression) {
        const r = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
    }
    close() { this.socket.close(); }
}
async function waitFor(cb, what, timeout = 30000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { try { const v = await cb(); if (v) return v; } catch {} await delay(100); }
    throw new Error('Timed out waiting for ' + what);
}
async function getPage() {
    const r = await fetch(`http://127.0.0.1:${debugPort}/json`); if (!r.ok) return null;
    return (await r.json()).find(p => p.type === 'page' && p.webSocketDebuggerUrl);
}

// Original per-frame hashes: frame number -> sha256 of raw RGB565 video bytes.
const records = (await readFile(path.join(recording, 'inputs.jsonl'), 'utf8')).split('\n').filter(Boolean);
const expectedHash = new Map();
for (const line of records) { const r = JSON.parse(line); expectedHash.set(r.frame, r.video_sha256); }
const steps = JSON.parse(await readFile(stepsFile, 'utf8'));
const tape = []; for (const [n, keys] of steps) for (let i = 0; i < n; i++) tape.push(keys);
const total = Math.min(tape.length, limit);
await mkdir(artifacts, { recursive: true });
const sha256 = data => createHash('sha256').update(data).digest('hex');
const sourceHashes={};
async function hashSources(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
        const file=path.join(directory,entry.name);
        if(entry.isDirectory()&&entry.name!=='OUTPUT')await hashSources(file);
        else if(entry.isFile()&&/\.(js|json|png)$/.test(entry.name))
            sourceHashes[path.relative(root,file)]=sha256(await readFile(file));
    }
}
await hashSources(path.join(root,'renderer/games/eggo-mania'));
await writeFile(path.join(artifacts, 'parameters.json'), JSON.stringify({ recording, stepsFile, startAfter, videoOffset, seed, limit: total, chunk, character,
    noStop,traceUntil,traceDetailFrom:Number.isFinite(traceDetailFrom)?traceDetailFrom:null,pixelProbe,dumpFrames,hashMode,renderFrom,
    sourceHashes,harnessSha256:sha256(await readFile(fileURLToPath(import.meta.url))),
    stepsSha256:sha256(await readFile(stepsFile)),inputsSha256:sha256(await readFile(path.join(recording,'inputs.jsonl'))),
    recordingParametersSha256:sha256(await readFile(path.join(recording,'parameters.json'))),
    frameMapping: 'app update j (1-based) is compared with recording frame startAfter+videoOffset+j; inputs: tape frame j', states: 'none injected; Survival started from seed' }, null, 2));

let child, client;
const stderrChunks = [];
try {
    child = spawn(electronPath, ['--mute-audio', `--remote-debugging-port=${debugPort}`, '.'], {
        cwd: root, windowsHide: true, env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stderr.on('data', c => stderrChunks.push(c.toString()));
    const page = await waitFor(getPage, 'renderer'); client = new Client(page.webSocketDebuggerUrl); await client.connect();
    await waitFor(() => client.evaluate('Boolean(window.app?.gameLoader?.games?.length)'), 'games');
    console.log(await client.evaluate(`(async()=>{
        window.app.settingsManager.save=async()=>{};
        const config=window.app.gameLoader.games.find(g=>g._id==='eggo-mania');if(!config)throw Error('Missing game card');
        await window.app.launchGame(config);window.app._isPaused=true;
        const {waitForPixelAssets}=await import('./games/eggo-mania/pixel-renderer.js');await waitForPixelAssets();
        const g=window.app.currentGame;
        g.p={...g.p,mode:'survival',difficulty:'hard',character:${JSON.stringify(character)},columns:7,hazards:true,seed:${seed}};
        g.seed=${seed};
        // Deterministic input: the tape provides the player's control each emulated frame.
        window.__eggo={control:{},previous:new Set(),hashPrefix:null};
        g.readPlayerControl=()=>window.__eggo.control;
        // Replay result-page confirmation too; suppress only unmapped app actions.
        g.input.isActionJustDown=action=>(action==='place'||action==='continue')&&Boolean(window.__eggo.control.use);
        // This harness compares pictures only. Do not run a second game's
        // audio CPU alongside an accelerated visual replay or queue its work.
        g.nativeSound?.destroy();g.nativeSound=null;g.music?.stop();g.music=null;g.audio=null;
        g.resetSurvival();
        return {phase:g.phase,startingStage:g.startingStage,round:g.round};
    })()`));
    await client.evaluate(`(()=>{
        const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
        const W=new Uint32Array(64);
        window.__eggo.sha256=bytes=>{
            const len=bytes.length,padded=new Uint8Array(((len+9+63)>>6)<<6);padded.set(bytes);padded[len]=0x80;
            const view=new DataView(padded.buffer);view.setUint32(padded.length-4,(len*8)>>>0);view.setUint32(padded.length-8,Math.floor(len*8/4294967296));
            let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
            for(let o=0;o<padded.length;o+=64){
                for(let i=0;i<16;i++)W[i]=view.getUint32(o+i*4);
                for(let i=16;i<64;i++){const a=W[i-15],b=W[i-2];
                    const s0=((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3),s1=((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10);
                    W[i]=(W[i-16]+s0+W[i-7]+s1)|0;}
                let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
                for(let i=0;i<64;i++){
                    const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)),ch=(e&f)^(~e&g),t1=(h+S1+ch+K[i]+W[i])|0;
                    const S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)),mj=(a&b)^(a&c)^(b&c),t2=(S0+mj)|0;
                    h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
                h0=(h0+a)|0;h1=(h1+b)|0;h2=(h2+c)|0;h3=(h3+d)|0;h4=(h4+e)|0;h5=(h5+f)|0;h6=(h6+g)|0;h7=(h7+h)|0;}
            return [h0,h1,h2,h3,h4,h5,h6,h7].map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
        };
        // Inverse of the original RGB565 -> RGB888 expansion (v*255//max); colours off that grid are counted.
        const inv5=new Uint8Array(256),inv6=new Uint8Array(256),exact5=new Uint8Array(256),exact6=new Uint8Array(256);
        for(let v=0;v<32;v++){const x=Math.floor(v*255/31);inv5[x]=v;exact5[x]=1;}
        for(let v=0;v<64;v++){const x=Math.floor(v*255/63);inv6[x]=v;exact6[x]=1;}
        for(let x=0;x<256;x++){if(!exact5[x])inv5[x]=Math.round(x*31/255);if(!exact6[x])inv6[x]=Math.round(x*63/255);}
        window.__eggo.frame565=()=>{
            const g=window.app.currentGame,canvas=g.pixelCanvas,data=canvas.getContext('2d').getImageData(0,0,240,160).data,out=new Uint8Array(76800);
            let off=0,j=0;for(let i=0;i<data.length;i+=4){
                if(!exact5[data[i]]||!exact6[data[i+1]]||!exact5[data[i+2]])off++;
                const v=(inv5[data[i]]<<11)|(inv6[data[i+1]]<<5)|inv5[data[i+2]];out[j++]=v&255;out[j++]=v>>8;}
            window.__eggo.offGrid=off;return out;};
    })()`);
    const evalFrames=(arg('eval-frames','')||'').split(',').filter(Boolean).map(Number),evalJs=arg('eval-js',null);
    if(evalJs&&evalFrames.length)await client.evaluate('window.__eggo.evalAt='+JSON.stringify(Object.fromEntries(evalFrames.map(n=>[n,evalJs]))));
    const results = { compared: 0, matched: 0, skippedRenders:0, firstMismatch: null };
    const started = Date.now();
    for (let start = 0; start < total && (noStop || !results.firstMismatch); start += chunk) {
        const slice = tape.slice(start, Math.min(total, start + chunk));
        const hashes = slice.map((_, i) => expectedHash.get(startAfter + videoOffset + start + i + 1));
        if (hashes.some(h => !h)) throw Error('Missing original hash for chunk at ' + (start + 1));
        const r = await client.evaluate(`(async()=>{
            const g=window.app.currentGame,E=window.__eggo,keys=${JSON.stringify(slice)},hashes=${JSON.stringify(hashes)},base=${startAfter+videoOffset+start},dump=new Set(${JSON.stringify(dumpFrames)}),noStop=${noStop},traceUntil=${traceUntil},probe=${JSON.stringify(drawProbe)},probeLog=[],trace=[],found=[],dumps={};
            const settle=()=>new Promise(r=>setTimeout(r,0));
            for(let i=0;i<keys.length;i++){
                const held=new Set(keys[i]?keys[i].split('+'):[]),prev=E.previous;
                E.control={move:Number(held.has('RIGHT'))-Number(held.has('LEFT')),jump:held.has('UP'),float:held.has('UP'),
                    fast:held.has('DOWN'),dive:held.has('L'),discard:held.has('R')&&!prev.has('R'),use:held.has('A')&&!prev.has('A'),
                    rotate:held.has('B')&&!prev.has('B')?1:0};
                E.previous=held;
                g.update(1/60);
                if(base+i+1<${renderFrom})continue;
                if(base+i+1===${pixelProbe[0]??-1}){
                    const c=g.pixelCanvas.getContext('2d'),x=${pixelProbe[1]??0},y=${pixelProbe[2]??0};E.pixelProbe=[];
                    for(const name of ['drawImage','putImageData']){
                        const original=c[name].bind(c);c[name]=(...args)=>{
                            const before=Array.from(c.getImageData(x,y,1,1).data);const result=original(...args);
                            const after=Array.from(c.getImageData(x,y,1,1).data);
                            if(before.some((v,j)=>v!==after[j]))E.pixelProbe.push({method:name,before,after,
                                source:[args[0].width,args[0].height],sourceUrl:args[0].currentSrc||args[0].src||null,
                                stack:new Error().stack,args:args.slice(1)});
                            return result;
                        };
                    }
                }
                g.render();
                if(E.evalAt&&E.evalAt[base+i+1]){E.evalOut??={};try{E.evalOut[base+i+1]=(new Function("g","return ("+E.evalAt[base+i+1]+")"))(g);}catch(e){E.evalOut[base+i+1]=String(e);}}
                const bytes=E.frame565();
                const hash=${JSON.stringify(hashMode)}==='native'?
                    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
                        n=>n.toString(16).padStart(2,'0')).join(''):E.sha256(bytes);
                // Check both implementations on actual framebuffer bytes before
                // trusting the optional native path. Frame conversion is shared.
                if(${JSON.stringify(hashMode)}==='native'&&base+i+1<=${startAfter+3}&&hash!==E.sha256(bytes))
                    throw Error('Native/JS SHA-256 disagreement');
                if(base+i+1<=traceUntil)trace.push([base+i+1,g.phase,g.player.egg.x,g.player.egg.y,g.player.egg.vy,g.cpu.egg.x,g.cpu.egg.y,g.cpu.egg.vy,g.views[0].camera,g.views[1].camera,
                    base+i+1>=${traceDetailFrom} ? structuredClone({control:g.lastModelControl,travel:g.aiTravel,timing:g.aiTiming,
                        keys:g.aiPreviousKeys,held:g.cpu.held,rival:g.cpu.nativeRivalResourcePose,
                        search:g.aiSearch,plan:g.aiPlan,rotation:g.aiRotation,rotationTarget:g.aiRotationTarget,
                        actorRotation:g.cpu.nativeActorRotation,
                        meters:g.views.map(v=>({state:v.meter,pose:v.meterPose,previous:v.previousMeterPose})),
                        projectileCameras:g.views.map(v=>({current:v.nativeCameraPosition,previous:v.previousNativeCameraPosition,previousPrevious:v.previousPreviousNativeCameraPosition})),
                        floors:[g.player,g.cpu].map(t=>({lines:t.lines,incomplete:t.incompleteFloors,
                            divider:t.nativeDividerProgress,pending:t.nativeDividerPendingProgress})),
                        projectiles:[g.player,g.cpu].map(t=>({live:t.bombs,render:t.nativeRenderProjectiles})),
                        enemies:{dragon:g.cpu.dragon,rock:g.cpu.dragonSecondary,
                            castle:g.cpu.castle,thief:g.cpu.castleSecondary},
                        water:{level:g.cpu.water,previous:g.cpu.previousWater,previousPrevious:g.cpu.previousPreviousWater,
                            offset:g.cpu.nativeWaterOffset,recovery:g.cpu.nativeWaterRecovery,creature:g.cpu.nativeWaterCreature,render:g.cpu.nativeWaterCreatureRender},
                        particles:g.player.nativePickupParticles,
                        cpuRows:g.cpu.rows.map(r=>r?{cells:r.cells,owners:r.owners,nativeArt:r.nativeArt}:null),
                        clouds:{player:g.player.nativeRenderClouds,cpu:g.cpu.nativeRenderClouds},
                        playerHazards:{egg:g.player.egg,dragon:g.player.dragon,rock:g.player.dragonSecondary,message:g.player.notice,
                            visual:g.player.actorVisualPose,snapshot:g.player.nativeRenderFrame?.animationPose,clock:g.player.nativeRenderFrame?.animationClock,
                            selector:g.player.nativePlayerAnimationSelector,phase:g.player.nativePlayerAnimationPhase},
                        player:{ground:g.player.egg.ground,animationGround:g.player.nativeAnimationGround,offset:g.views[0].nativeCameraOffset,control:g.player.nativeCameraControl},
                        pickups:g.cpu.crates.map(c=>({kind:c.nativeKind,motion:c.nativeMotion}))}) : null]);
                if(dump.has(base+i+1))dumps[base+i+1]=g.pixelCanvas.toDataURL('image/png').split(',')[1];
                if(hash!==hashes[i]){
                    const info={mismatchAt:i,hash,expected:hashes[i],offGrid:E.offGrid,pixelProbe:E.pixelProbe,png:g.pixelCanvas.toDataURL('image/png').split(',')[1],
                        state:{phase:g.phase,round:g.round,introElapsed:g.introElapsed,player:g.player&&{x:g.player.egg.x,y:g.player.egg.y,vy:g.player.egg.vy,nativeFrame:g.player.nativeFrame},
                            cpu:g.cpu&&{x:g.cpu.egg.x,y:g.cpu.egg.y,vy:g.cpu.egg.vy,nativeFrame:g.cpu.nativeFrame},bg3GlobalFrame:g.bg3GlobalFrame,rng:g.nativeActorRandomSeed}};
                    if(!noStop)return {...info,dumps,trace,probeLog,evalOut:E.evalOut};
                    found.push(i);if(found.length===1)window.__eggoFirst=info;
                }
            }
            if(found.length)return {...window.__eggoFirst,mismatchAt:found[0],mismatches:found,dumps,trace,probeLog};
            return {mismatchAt:null,dumps,trace,probeLog};
        })()`);
        if (r.evalOut) await writeFile(path.join(artifacts, 'eval-out.json'), JSON.stringify(r.evalOut, null, 2));
        if (r.probeLog?.length) await writeFile(path.join(artifacts, 'draw-probe.json'), JSON.stringify(r.probeLog, null, 1));
        if (r.trace?.length) await writeFile(path.join(artifacts, `app-trace-${start}.json`), JSON.stringify(r.trace));
        if (r.pixelProbe) await writeFile(path.join(artifacts,'pixel-probe.json'),JSON.stringify(r.pixelProbe,null,2));
        for (const [n, png] of Object.entries(r.dumps ?? {})) await writeFile(path.join(artifacts, `app-frame-${n}.png`), Buffer.from(png, 'base64'));
        const skipped=Math.max(0,Math.min(slice.length,renderFrom-(startAfter+videoOffset+start+1)));
        results.skippedRenders+=skipped;
        if (r.mismatchAt === null) { results.compared += slice.length-skipped; results.matched += slice.length-skipped; }
        else {
            results.compared += (noStop ? slice.length : r.mismatchAt + 1)-skipped; results.matched += (noStop ? slice.length - r.mismatches.length : r.mismatchAt)-skipped;
            if (noStop) results.mismatchedFrames = (results.mismatchedFrames ?? 0) + r.mismatches.length;
            const frame = startAfter + videoOffset + start + r.mismatchAt + 1;
            results.firstMismatch ??= { recordingFrame: frame, replayFrame: start + r.mismatchAt + 1, appHash: r.hash, expectedHash: r.expected, offGridPixels: r.offGrid, state: r.state,
                keysTail: tape.slice(Math.max(0, start + r.mismatchAt - 8), start + r.mismatchAt + 1) };
            await writeFile(path.join(artifacts, `first-mismatch-app-frame-${frame}.png`), Buffer.from(r.png, 'base64'));
            if (noStop) { results.firstMismatch.note = 'no-stop mode: later chunks still compared'; }
        }

        if ((start / chunk) % 10 === 0) console.log(`replay ${results.matched}/${total} frames identical, ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    if(evalJs&&evalFrames.length)await writeFile(path.join(artifacts,'eval-out.json'),await client.evaluate('JSON.stringify(window.__eggo.evalOut||null,null,1)')||'null');
    results.allMatched = !results.firstMismatch && results.matched === total && results.skippedRenders===0;
    await writeFile(path.join(artifacts, 'report.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
    console.log('artifacts', artifacts);
} finally {
    try { client?.close(); } catch {}
    try { child?.kill(); } catch {}
    if (stderrChunks.length) await writeFile(path.join(artifacts, 'electron-stderr.txt'), stderrChunks.join(''), 'utf8');
}
process.exit(0);
