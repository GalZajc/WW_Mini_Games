// Muted, hidden production renderer benchmark. No desktop input or settings writes.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import WebSocket from 'ws';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const settings={seed:1492,character:arg('character','yolko'),start:Number(arg('start',8550)),end:Number(arg('end',9010)),startAfter:400,port:9398};
const samples=arg('samples','')?arg('samples','').split(',').map(Number):null;
const compare=arg('compare','false')==='true';
const inspectFrames=arg('inspect','')?JSON.parse(await readFile(arg('inspect',''),'utf8')):[];
const offlineAudio=arg('offline-audio','false')==='true',audioFPS=Number(arg('audio-fps',60));
const nativeOffline=arg('native-offline','false')==='true';
const programOffline=arg('program-offline','false')==='true';
const cycleBuild=arg('cycle-build',null),cycleOracle=arg('cycle-oracle','scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z');
if((cycleBuild||programOffline)&&(!offlineAudio||!nativeOffline))throw Error('Native program audit requires --offline-audio=true --native-offline=true');
let cycleInitialization=null,programInitialization=null,rawButtons=null;
if(cycleBuild||programOffline){
 const p=JSON.parse(await readFile(path.join(root,cycleOracle,'parameters.json'),'utf8'));
 if(cycleBuild)cycleInitialization={programURL:pathToFileURL(path.resolve(root,cycleBuild,'cycle-reference.wasm')).href,
  romURL:pathToFileURL(p.rom).href,initialStateURL:pathToFileURL(path.resolve(root,cycleOracle,'initial.state')).href};
 if(programOffline)programInitialization={diagnosticInitialStateURL:pathToFileURL(path.resolve(root,cycleOracle,'initial.state')).href};
 rawButtons=Object.fromEntries((await readFile(path.join(p.recording,'inputs.jsonl'),'utf8')).trim().split('\n').map(line=>{const f=JSON.parse(line);return[f.frame,f.mask];}));
}
const out=path.join(root,'scripts/OUTPUT','eggo-render-profile_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});
const files=['renderer/games/eggo-mania/pixel-renderer.js','renderer/games/eggo-mania/game.js','renderer/core/InputManager.js',
 'renderer/games/eggo-mania/model.js','renderer/games/eggo-mania/audio.js','renderer/games/eggo-mania/native-water.js',
 'renderer/games/eggo-mania/native-sound-events.js','renderer/games/eggo-mania/performance-monitor.js','renderer/games/eggo-mania/assets/native-sfx.js',
 ...['native-program-player','native-program-worker','native-program-engine','native-program-assets','native-program-music','native-program-stream','native-audio-player','native-audio-engine','controls'].map(name=>'renderer/games/eggo-mania/'+name+'.js'),
 'renderer/games/eggo-mania/assets/native-program/manifest.json'];
const hashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(path.join(root,f))).digest('hex')])));
await writeFile(path.join(out,'parameters.json'),JSON.stringify({...settings,samples,compare,cycleBuild,cycleOracle,cycleInitialization,programOffline,programInitialization,sourceHashes:hashes,method:'Fresh taped production game, update/render CPU timing and render-only pixel readback area; no sleep in timed section, audio muted'},null,2));
const tape=[];for(const [n,keys]of JSON.parse(await readFile(path.join(root,'scripts/OUTPUT/eggo-user-replay_2026-10-19_21-01-20_213557/steps.json'),'utf8')))for(let j=0;j<n;j++)tape.push(keys);
const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),['--mute-audio','--remote-debugging-port='+settings.port,'.'],{cwd:root,windowsHide:true,env:{...process.env,WW_MINI_GAMES_HEADLESS_TEST:'1'},stdio:'ignore'});
let socket;
try{
 let page;for(let n=0;n<150&&!page;n++){try{page=(await(await fetch(`http://127.0.0.1:${settings.port}/json`)).json()).find(p=>p.type==='page');}catch{}if(!page)await new Promise(r=>setTimeout(r,100));}
 if(!page)throw Error('No headless renderer');socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.once('open',r));
 let seq=0;const pending=new Map();socket.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 for(let n=0;n<150;n++){if(await evaluate('Boolean(window.app?.gameLoader?.games?.length)'))break;await new Promise(r=>setTimeout(r,100));}
 await evaluate(`(async()=>{window.app.settingsManager.save=async()=>{};await window.app.launchGame(window.app.gameLoader.games.find(g=>g._id==='eggo-mania'));window.app._isPaused=true;cancelAnimationFrame(window.app._animFrame);await(await import('./games/eggo-mania/pixel-renderer.js')).waitForPixelAssets();const g=window.app.currentGame;g.p={...g.p,character:${JSON.stringify(settings.character)},seed:1492,mode:'survival',columns:7,hazards:true};g.seed=1492;window.E={control:{},previous:new Set(),frames:[]};g.readPlayerControl=()=>E.control;g.input.isActionJustDown=a=>(a==='place'||a==='continue')&&!!E.control.use;g.resetSurvival();})()`);
 const parameters=JSON.parse(await readFile(path.join(out,'parameters.json'),'utf8'));
 await writeFile(path.join(out,'parameters.json'),JSON.stringify({...parameters,gameSettings:await evaluate('window.app.currentGame.p')},null,2));
 if(compare)await evaluate(`(async()=>{E.reference=await import('./games/eggo-mania/.eggo-render-reference.mjs');await E.reference.waitForPixelAssets();})()`);
 if(arg('sound-trace','false')==='true')await evaluate(`(async()=>{const {Tower}=await import('./games/eggo-mania/model.js'),original=Tower.prototype.queueNativeSound,complete=Tower.prototype.complete;E.soundEvents=[];E.completions=[];E.uses=[];const use=Tower.prototype.use;Tower.prototype.use=function(...args){const event={frame:E.currentFrame,field:this.fieldIndex,item:this.held?.item,kind:this.held?.nativeKind};const result=use.apply(this,args);E.uses.push({...event,result});return result;};Tower.prototype.queueNativeSound=function(id,...args){E.soundEvents.push({frame:E.currentFrame,field:this.fieldIndex,id});return original.call(this,id,...args);};Tower.prototype.complete=function(options){E.completions.push({frame:E.currentFrame,field:this.fieldIndex,options,placing:!!this.placing});return complete.call(this,options);};})()`);
 if(arg('sound-trace','false')==='true')await evaluate(`(async()=>{const {Tower}=await import('./games/eggo-mania/model.js');E.hazardSpawns=[];
 for(const [method,key] of [['advanceBubble','bubble'],['advanceDragon','dragon'],['advanceDragonSecondary','dragonSecondary'],['advanceSpace','space'],['advanceSpaceSecondary','spaceSecondary'],['advanceFactorySecondary','factorySecondary'],['advanceBeanstalkSecondary','beanstalkSecondary'],['advanceParkPrimary','parkPrimary'],['advancePirateSecondary','pirateSecondary'],['advanceCastleSecondary','castleSecondary'],['advanceCastle','castle'],['advanceJumper','jumper'],['advanceParkSecondary','parkSecondary']]){
  const original=Tower.prototype[method];Tower.prototype[method]=function(...args){const name=method==='advanceParkSecondary'&&args[0]?'jungleSecondary':key,before=this[name]?.active;const result=original.apply(this,args);if(!before&&this[name]?.active)E.hazardSpawns.push({frame:E.currentFrame,field:this.fieldIndex,stage:this.artStage,name,state:{...this[name]}});return result;};}})()`);
 if(arg('sound-trace','false')==='true')await evaluate(`(async()=>{const {Tower}=await import('./games/eggo-mania/model.js'),update=Tower.prototype.update;E.dives=[];Tower.prototype.update=function(dt,control,...rest){const event=control?.dive?{frame:E.currentFrame,field:this.fieldIndex,control:{...control},ground:this.egg.ground,swimming:this.egg.swimming,stun:this.egg.stun,state:this.nativeActorState,lightning:!!this.egg.lightning,bubble:!!this.egg.bubble,carried:!!this.egg.carried}:null;const result=update.call(this,dt,control,...rest);if(event){event.supported=this.nativeActorSupportAtHandler;event.nextState=this.nativeActorState;E.dives.push(event);}return result;};})()`);
 await evaluate(`E.inspectFrames=new Set(${JSON.stringify(inspectFrames)});E.inspections=[];`);
 if(arg('sound-trace','false')==='true')await evaluate(`(async()=>{const {NATIVE_SFX}=await import('./games/eggo-mania/assets/native-sfx.js');E.admittedSounds=[];E.requestedSounds=[];
  const context={currentTime:0,createGain:()=>({gain:{value:1},connect(){},disconnect(){}}),createBufferSource:()=>({connect(){},disconnect(){},stop(){},start(){E.admittedSounds.push({frame:E.currentFrame,id:this.buffer.nativeId});}})};
  window.app.currentGame.audio={_nativeEffectRequest:id=>E.requestedSounds.push({frame:E.currentFrame,id}),_soundBuffers:new Map(Object.entries(NATIVE_SFX).map(([id])=>['eggo-mania-native-sfx-'+id,{nativeId:Number(id)}])),_ensureCtx:()=>context,_channels:{effects:{}}};})()`);
 if(offlineAudio)await evaluate(`(async()=>{
  const {AudioManager}=await import('./core/AudioManager.js'),{NativeMusic}=await import('./games/eggo-mania/audio.js'),
   {NATIVE_SFX}=await import('./games/eggo-mania/assets/native-sfx.js'),{NATIVE_MUSIC}=await import('./games/eggo-mania/assets/native-music.js'),
   {NATIVE_RESULT_AUDIO}=await import('./games/eggo-mania/assets/native-result-audio.js'),
   {NativeAudioPlayer}=await import('./games/eggo-mania/native-audio-player.js'),
   {NativeProgramAudioPlayer}=await import('./games/eggo-mania/native-program-player.js');
  E.audioTime=0;E.audioStarts=[];E.offline=new OfflineAudioContext(2,Math.ceil(((${settings.end-settings.startAfter})/${audioFPS}+2)*32768),32768);
  const clock={state:'running',sampleRate:32768,get currentTime(){return E.audioTime;},createGain:()=>E.offline.createGain(),createBuffer:(...args)=>E.offline.createBuffer(...args),
   createBufferSource:()=>{const node=E.offline.createBufferSource(),start=node.start.bind(node),stop=node.stop.bind(node);node.start=(...args)=>{E.audioStarts.push({frame:E.currentFrame,label:node.buffer?.auditLabel,time:args[0]??0,offset:args[1]??0,loop:node.loop,loopStart:node.loopStart});return start(...args);};node.stop=(when=E.audioTime)=>stop(when);return node;}};
  const audio=new AudioManager();audio._ctx=clock;audio._ensureCtx=()=>clock;
  audio._channels=Object.fromEntries(['music','effects'].map(key=>{const gain=E.offline.createGain();gain.connect(E.offline.destination);return[key,gain];}));
  if(!${nativeOffline})for(const [id,track] of [...Object.entries(NATIVE_SFX).map(([id,track])=>['eggo-mania-native-sfx-'+id,track]),...Object.entries({...NATIVE_MUSIC,...NATIVE_RESULT_AUDIO}).map(([id,track])=>['eggo-mania-music-'+id,track])]){
   const bytes=await(await fetch(new URL('./games/eggo-mania/assets/'+track.file,location.href))).arrayBuffer(),buffer=await E.offline.decodeAudioData(bytes);buffer.auditLabel=id;audio._soundBuffers.set(id,buffer);
  }
  const g=window.app.currentGame;g.music?.stop();g.nativeSound?.destroy();g.nativeSound=null;g.audio=audio;
  if(${programOffline})g.nativeSound=new NativeProgramAudioPlayer(audio,{frameRate:${audioFPS},initialization:${JSON.stringify(programInitialization)},readButtons:()=>E.rawButtons});
  else if(${nativeOffline})g.nativeSound=new NativeAudioPlayer(audio,{frameRate:${audioFPS},
   ...(${cycleInitialization?JSON.stringify(cycleInitialization):'null'}?{workerURL:new URL('../scripts/native-audio/cycle-audio-worker.mjs',location.href),initialization:${JSON.stringify(cycleInitialization)},readButtons:()=>E.rawButtons}: {})});
  g.music=new NativeMusic(audio);g.resetSurvival();await Promise.resolve();
  if(${programOffline}){const deadline=performance.now()+30000;while(g.nativeSound.preparing&&!g.nativeSound.error&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));if(g.nativeSound.error||g.nativeSound.preparing||!g.nativeSound.original)throw Error('Production native audio initialization failed: '+g.nativeSound.error);}
 })()`);
 for(let start=0;start<settings.end-settings.startAfter;start+=1000){
  const batch=tape.slice(start,Math.min(start+1000,settings.end-settings.startAfter));
  const buttons=rawButtons?batch.map((_,j)=>rawButtons[start+settings.startAfter+j+1]):null;
  const data=await evaluate(`(async()=>{const g=window.app.currentGame,batch=${JSON.stringify(batch)},rows=[];
   const proto=CanvasRenderingContext2D.prototype,original=proto.getImageData;let active=false,calls=0,pixels=0;
   proto.getImageData=function(...a){if(active){calls++;pixels+=Math.abs(a[2]*a[3]);if(${arg('trace','false')}&&g.phase==='won'&&g.resultTicks===165)(E.readbackTrace??=[]).push({width:a[2],height:a[3],stack:new Error().stack});}return original.apply(this,a);};
   try{for(let j=0;j<batch.length;j++){
    const f=${start+settings.startAfter}+j+1,h=new Set(batch[j]?batch[j].split('+'):[]),p=E.previous;
    E.currentFrame=f;E.rawButtons=${JSON.stringify(buttons)}?.[j];E.audioTime=(f-${settings.startAfter})/${audioFPS};E.control={move:Number(h.has('RIGHT'))-Number(h.has('LEFT')),jump:h.has('UP'),float:h.has('UP'),fast:h.has('DOWN'),dive:h.has('L'),discard:h.has('R')&&!p.has('R'),use:h.has('A')&&!p.has('A'),rotate:h.has('B')&&!p.has('B')?1:0};E.previous=h;
    const t0=performance.now();g.update(1/60);if(${offlineAudio})await Promise.resolve();
    if(${nativeOffline}){const timeout=performance.now()+10000;while(g.nativeSound.pendingFrames&&!g.nativeSound.error&&performance.now()<timeout)await new Promise(r=>setTimeout(r,1));if(g.nativeSound.error||g.nativeSound.pendingFrames)throw Error('Offline native sound worker failed: '+g.nativeSound.error);(E.audioCompute??=[]).push(g.nativeSound.computeMs);}
    const t1=performance.now();
    if(E.inspectFrames.has(f)){const keys=['bubble','jumper','space','spaceSecondary','dragon','dragonSecondary','castle','castleSecondary','factorySecondary','parkPrimary','parkSecondary','jungleSecondary','pirateSecondary','beanstalkSecondary'];E.inspections.push({frame:f,phase:g.phase,round:g.round,intro:g.bg3GlobalFrame,fields:[g.player,g.cpu].filter(Boolean).map(t=>({field:t.fieldIndex,egg:{...t.egg},state:t.nativeActorState,incomplete:t.incompleteFloors,warning:t.nativeWaterWarning,roof:t.height(),hazards:Object.fromEntries(keys.map(k=>[k,{...t[k]}]))}))});}
    if(f<${settings.start}||(${JSON.stringify(samples)}&&!${JSON.stringify(samples)}?.includes(f)))continue;
    active=true;calls=0;pixels=0;g.render();active=false;const t2=performance.now();
    const canvas=g.pixelCanvas,rgba=original.call(canvas.getContext('2d'),0,0,canvas.width,canvas.height).data;
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba)),v=>v.toString(16).padStart(2,'0')).join('');
    let referenceSha256=null;if(${compare}){E.reference.renderPixelGame(g);const reference=original.call(canvas.getContext('2d'),0,0,canvas.width,canvas.height).data;
      referenceSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',reference)),v=>v.toString(16).padStart(2,'0')).join('');}
    rows.push({frame:f,phase:g.phase,resultTicks:g.resultTicks,round:g.round,introFrame:g.bg3GlobalFrame,introElapsed:g.introElapsed,updateMs:t1-t0,renderMs:t2-t1,readbacks:calls,readbackPixels:pixels,rgbaSha256:hash,referenceSha256});
   }}finally{proto.getImageData=original;}return rows;})()`);
  await writeFile(path.join(out,`frames-${start}.json`),JSON.stringify(data));
  console.log(`${Math.min(start+batch.length,settings.end-settings.startAfter)}/${settings.end-settings.startAfter}`);
 }
 if(arg('native-audio-audit','false')==='true'){
  const audit=await evaluate(`(async()=>{const a=window.app.currentGame.nativeSound;for(let i=0;i<300&&!a.error&&(!a.ready||a.pendingFrames);i++)await new Promise(r=>setTimeout(r,50));const report={ready:a.ready??false,error:a.error??null,pendingFrames:a.pendingFrames,computeMs:a.computeMs,queuedSources:a.sources.size,contextState:a.ctx.state,sampleRate:a.ctx.sampleRate};a.destroy();return report;})()`);
  await writeFile(path.join(out,'native-audio.json'),JSON.stringify(audit,null,2));
  if(audit.error||!audit.ready||audit.pendingFrames)throw Error('Native audio worker failed: '+JSON.stringify(audit));
 }
 await writeFile(path.join(out,'inspections.json'),JSON.stringify(await evaluate('E.inspections'),null,2));
 if(arg('sound-trace','false')==='true')await writeFile(path.join(out,'dives.json'),JSON.stringify(await evaluate('E.dives'),null,2));
 await writeFile(path.join(out,'readback-trace.json'),JSON.stringify(await evaluate('E.readbackTrace??[]'),null,2));
 if(offlineAudio){
  const pcm=await evaluate(`(async()=>{E.offlineBuffer=await E.offline.startRendering();return {frames:E.offlineBuffer.length,rate:E.offlineBuffer.sampleRate,starts:E.audioStarts};})()`);
  await writeFile(path.join(out,'audio-parameters.json'),JSON.stringify({audioFPS,nativeOffline,originFrame:settings.startAfter,firstReplayedFrame:settings.startAfter+1,sampleRate:pcm.rate,frames:pcm.frames,transportOffsetSamples:nativeOffline?Math.round(pcm.starts[0].time*pcm.rate):null,starts:pcm.starts},null,2));
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.frames*4,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(pcm.rate,24);header.writeUInt32LE(pcm.rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.frames*4,40);
  const {open}=await import('node:fs/promises'),stream=await open(path.join(out,'reconstruction.wav'),'w');try{await stream.write(header);
   for(let at=0;at<pcm.frames;at+=32768){const base64=await evaluate(`(()=>{const b=E.offlineBuffer,l=b.getChannelData(0),r=b.getChannelData(1),n=Math.min(32768,b.length-${at}),v=new DataView(new ArrayBuffer(n*4));for(let i=0;i<n;i++){v.setInt16(i*4,Math.max(-32768,Math.min(32767,Math.round(l[${at}+i]*32768))),true);v.setInt16(i*4+2,Math.max(-32768,Math.min(32767,Math.round(r[${at}+i]*32768))),true);}const bytes=new Uint8Array(v.buffer);let s='';for(let i=0;i<bytes.length;i+=4096)s+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(s);})()`);await stream.write(Buffer.from(base64,'base64'));}
  }finally{await stream.close();}
 }
 if(arg('sound-trace','false')==='true')await writeFile(path.join(out,'sound-events.json'),JSON.stringify(await evaluate('E.soundEvents'),null,2));
 if(arg('sound-trace','false')==='true')await writeFile(path.join(out,'completions.json'),JSON.stringify(await evaluate('E.completions'),null,2));
 if(arg('sound-trace','false')==='true')await writeFile(path.join(out,'hazard-spawns.json'),JSON.stringify(await evaluate('E.hazardSpawns'),null,2));
 if(arg('sound-trace','false')==='true')await writeFile(path.join(out,'uses.json'),JSON.stringify(await evaluate('E.uses'),null,2));
 if(arg('sound-trace','false')==='true')await writeFile(path.join(out,'requested-sounds.json'),JSON.stringify(await evaluate('E.requestedSounds'),null,2));
 if(arg('sound-trace','false')==='true')await writeFile(path.join(out,'admitted-sounds.json'),JSON.stringify(await evaluate('E.admittedSounds'),null,2));
 if(arg('diagnostic','false')==='true'){
  const diagnostic=await evaluate(`(async()=>{const m=window.app.currentGame.performanceMonitor;return {path:await m.export(),summary:m.snapshot().summary};})()`);
  await writeFile(path.join(out,'diagnostic-export.json'),JSON.stringify(diagnostic,null,2));
 }
 const {readdir}=await import('node:fs/promises');const rows=[];for(const f of await readdir(out))if(f.startsWith('frames-'))rows.push(...JSON.parse(await readFile(path.join(out,f),'utf8')));
 const groups={};for(const r of rows){const k=r.phase+(r.phase==='won'||r.phase==='lost'?r.resultTicks<157?'-letters':r.resultTicks<220?'-fade':'-podium':'');(groups[k]??=[]).push(r);}
 const summary={};for(const [key,values]of Object.entries(groups)){const sorted=values.map(r=>r.renderMs).sort((a,b)=>a-b);summary[key]={frames:values.length,meanRenderMs:values.reduce((s,r)=>s+r.renderMs,0)/values.length,p95RenderMs:sorted[Math.floor((sorted.length-1)*.95)],maxRenderMs:sorted.at(-1),meanReadbackPixels:values.reduce((s,r)=>s+r.readbackPixels,0)/values.length};}
 await writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({out,summary},null,2));
}finally{socket?.close();child.kill();}
