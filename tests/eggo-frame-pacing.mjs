import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'tests','OUTPUT','eggo-frame-pacing_'+new Date().toISOString().replace(/[:.]/g,'-'));
const electronPath=path.join(root,'node_modules','electron','dist','electron.exe');
const debugPort=9397;
const frameCount=Number(process.argv.find(v=>v.startsWith('--frames='))?.split('=')[1]||240);
const filledTower=process.argv.includes('--filled-tower');
const uiChecks=process.argv.includes('--ui-checks');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class Client{
 constructor(url){this.socket=new WebSocket(url);this.nextId=1;this.pending=new Map();}
 async connect(){await new Promise((resolve,reject)=>{this.socket.once('open',resolve);this.socket.once('error',reject);});this.socket.on('message',raw=>{const m=JSON.parse(raw.toString()),p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);});}
 call(method,params={}){const id=this.nextId++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const result=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
 close(){this.socket.close();}
}

const child=spawn(electronPath,['--mute-audio','tests/eggo-pacing-main.cjs',`--remote-debugging-port=${debugPort}`],{
 cwd:root,windowsHide:true,env:{...process.env,WW_MINI_GAMES_HEADLESS_TEST:'1',WW_MINI_GAMES_OFFSCREEN_TEST:'1'},stdio:['ignore','pipe','ignore']});
let client;let paintText='';child.stdout.on('data',chunk=>{paintText+=chunk.toString();});
try{
 await mkdir(output,{recursive:true});
 let page;const deadline=Date.now()+20000;
 while(Date.now()<deadline){try{page=(await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(p=>p.type==='page');if(page)break;}catch{}await delay(100);}
 assert.ok(page);client=new Client(page.webSocketDebuggerUrl);await client.connect();
 let ready=false;while(Date.now()<deadline){ready=await client.evaluate('Boolean(window.app?.gameLoader?.games?.length)');if(ready)break;await delay(100);}assert.ok(ready);
 if(process.argv.includes('--profile')){await client.call('Profiler.enable');await client.call('Profiler.setSamplingInterval',{interval:200});await client.call('Profiler.start');}
 const result=await client.evaluate(`(async()=>{
  const app=window.app;app.settingsManager.save=async()=>{};app.settingsManager.saveKeybindings=async()=>{};await app.launchGame(app.gameLoader.games.find(c=>c._id==='eggo-mania'));app._isPaused=true;
  const g=app.currentGame,{waitForPixelAssets}=await import('./games/eggo-mania/pixel-renderer.js');await waitForPixelAssets();
  g.seed=42;g.round=1;g.startingStage=0;g.startRound({intro:false});g.music.stop();
  const pad={index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===12||i===15,value:i===12||i===15?1:0}))};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
  const ui={};
  if(${uiChecks}){
   const wait=()=>new Promise(r=>setTimeout(r,80)),press=(n,on)=>{pad.buttons[n].pressed=on;pad.buttons[n].value=on?1:0;};
   press(12,false);press(15,false);app._isPaused=false;await wait();
   const originalPlayer=g.player;press(9,true);await wait();ui.menuPauses=app._isPaused&&app.pauseMenu.isVisible;
   if(!ui.menuPauses)throw Error('Xbox Menu did not pause');
   const audio=app.audio,previous={...audio.volumes};
   for(const [channel,value] of [['music',37],['effects',61]]){
    const slider=app.pauseMenu.panel.querySelector('[data-volume="'+channel+'"]');
    if(!slider)throw Error('Missing volume slider: '+channel);
    slider.value=String(value);slider.dispatchEvent(new Event('input',{bubbles:true}));
    if(audio.volumes[channel]!==value/100)throw Error('Volume was not applied');
   }
   ui.volumeControls=true;
   for(const channel of Object.keys(previous))audio.setVolume(channel,previous[channel]);
   press(9,false);await wait();press(9,true);await wait();ui.menuResumes=!app._isPaused&&!app.pauseMenu.isVisible;
   press(9,false);await wait();press(8,true);await wait();ui.viewDoesNotRestart=g.player===originalPlayer;
   press(8,false);await wait();if(!ui.menuResumes||!ui.viewDoesNotRestart)throw Error('Controller pause/restart regression');
   app._isPaused=true;g.startRound({intro:false});g.music.stop();
   for(const [i,t] of [g.player,g.cpu].entries()){t.nativeDividerProgress=i?18:20;t.water=-2;t.previousWater=null;t.previousPreviousWater=null;t.egg.y=0;}
   g.render();ui.dividerImage=g.pixelCanvas.toDataURL('image/png');
   g.startRound({intro:false});g.music.stop();press(12,true);press(15,true);
  }
  if(${filledTower})for(const t of [g.player,g.cpu]){
   t.rows=[];for(let y=0;y<20;y++)for(let x=0;x<7;x++)t.setCell(x,y,1,y*7+x+1);
   Object.assign(t.egg,{y:20,vy:0,ground:true,introDescent:false});
  }
  const samples=[],original=g.render;
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{app._isPaused=true;g.render=original;reject(Error('Frame timing timeout: '+JSON.stringify({samples:samples.length,phase:g.phase,state:app.state,paused:app._isPaused,visibility:document.visibilityState})));},Math.max(20000,${frameCount}*40));
   g.render=function(){const start=performance.now();original.call(this);samples.push({epoch:Date.now(),rafTime:app._lastTime,nativeFrame:g.player.nativeFrame,phase:g.phase,drawMillis:performance.now()-start});if(samples.length>=${frameCount}){app._isPaused=true;g.render=original;clearTimeout(timeout);resolve();}};
   app._isPaused=false;
  });
  const warmSamples=samples.slice(30),intervals=warmSamples.slice(1).map((s,i)=>s.rafTime-warmSamples[i].rafTime),steps=warmSamples.slice(1).map((s,i)=>s.nativeFrame-warmSamples[i].nativeFrame),sort=[...intervals].sort((a,b)=>a-b);
  return {samples,ui,rafFps:1000*(warmSamples.length-1)/(warmSamples.at(-1).rafTime-warmSamples[0].rafTime),uniqueStateFps:1000*steps.filter(n=>n>0).length/(warmSamples.at(-1).rafTime-warmSamples[0].rafTime),duplicateStates:steps.filter(n=>n===0).length,skippedStates:steps.filter(n=>n>1).length,maxGapMs:Math.max(...intervals),p95GapMs:sort[Math.floor(sort.length*.95)],averageRenderMs:samples.reduce((a,s)=>a+s.drawMillis,0)/samples.length};
 })()`);
 const paints=[...paintText.matchAll(/EGGO_PAINT (\d+)/g)].map(m=>Number(m[1])).filter(t=>t>=result.samples[30].epoch&&t<=result.samples.at(-1).epoch);result.compositorPaints=paints.length;result.compositorFps=paints.length>1?1000*(paints.length-1)/(paints.at(-1)-paints[0]):0;
 if(process.argv.includes('--profile')){const profile=await client.call('Profiler.stop');await writeFile(path.join(output,'cpu-profile.json'),JSON.stringify(profile));}
 if(result.ui.dividerImage){await writeFile(path.join(output,'divider.png'),Buffer.from(result.ui.dividerImage.split(',')[1],'base64'));delete result.ui.dividerImage;}
 await writeFile(path.join(output,'parameters.json'),JSON.stringify({hidden:true,muted:true,seed:42,frames:frameCount,filledTower,uiChecks,controls:'UP+RIGHT',noPixelReadbackDuringMeasurement:true,offscreenCompositor:true,warmupFrames:30},null,2));
 await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));delete result.samples;console.log(JSON.stringify({output,...result}));
}finally{client?.close();child.kill();}
