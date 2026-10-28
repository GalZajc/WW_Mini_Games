import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'tests','OUTPUT','eggo-water-depth_'+new Date().toISOString().replace(/[:.]/g,'-'));
const electronPath=path.join(root,'node_modules','electron','dist','electron.exe');
const debugPort=9397;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class Client{
 constructor(url){this.socket=new WebSocket(url);this.nextId=1;this.pending=new Map();}
 async connect(){await new Promise((resolve,reject)=>{this.socket.once('open',resolve);this.socket.once('error',reject);});this.socket.on('message',raw=>{const m=JSON.parse(raw.toString()),p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);});}
 call(method,params={}){const id=this.nextId++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const result=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
 close(){this.socket.close();}
}

const child=spawn(electronPath,['--mute-audio','.',`--remote-debugging-port=${debugPort}`],{
 cwd:root,windowsHide:true,env:{...process.env,WW_MINI_GAMES_HEADLESS_TEST:'1'},stdio:'ignore'});
let client;
try{
 await mkdir(output,{recursive:true});
 let page;const deadline=Date.now()+20000;
 while(Date.now()<deadline){try{page=(await(await fetch(`http://127.0.0.1:${debugPort}/json`)).json()).find(p=>p.type==='page');if(page)break;}catch{}await delay(100);}
 assert.ok(page);client=new Client(page.webSocketDebuggerUrl);await client.connect();
 let ready=false;while(Date.now()<deadline){ready=await client.evaluate('Boolean(window.app?.gameLoader?.games?.length)');if(ready)break;await delay(100);}assert.ok(ready);
 const result=await client.evaluate(`(async()=>{
  const app=window.app;app.settingsManager.save=async()=>{};await app.launchGame(app.gameLoader.games.find(c=>c._id==='eggo-mania'));app._isPaused=true;
  const g=app.currentGame,{waitForPixelAssets}=await import('./games/eggo-mania/pixel-renderer.js'),{SURVIVAL_STAGES}=await import('./games/eggo-mania/model.js');await waitForPixelAssets();
  const grid=document.createElement('canvas');grid.width=960;grid.height=320;const out=grid.getContext('2d'),records=[];
  for(let i=0;i<8;i++){
   g.seed=42;g.round=1;g.startingStage=i;g.startRound({intro:false});g.music.stop();
   function setWater(water){for(let side=0;side<2;side++){const t=[g.player,g.cpu][side];Object.assign(t,{nativeFrame:600,water,previousWater:water,previousPreviousWater:water,crates:[],rows:[]});for(let y=0;y<20;y++)for(let x=0;x<7;x++)t.setCell(x,y,1,y*7+x+1);t.egg.y=40;Object.assign(g.views[side],{camera:6,boardCamera:6,previousNativeCameraPosition:544,nativeCameraY:298});g.camera[side]=6;}}
   const minimum=[Infinity,Infinity];let phases=0;
   for(let phase=0;phase<60;phase++){
    setWater(8);g.player.nativeFrame=g.cpu.nativeFrame=600+phase;g.render();const wet=g.pixelCanvas.getContext('2d').getImageData(0,0,240,160).data;if(!phase)out.drawImage(g.pixelCanvas,i%4*240,Math.floor(i/4)*160);
    setWater(-20);g.player.nativeFrame=g.cpu.nativeFrame=600+phase;g.render();const dry=g.pixelCanvas.getContext('2d').getImageData(0,0,240,160).data;
    const counts=[0,0];for(let side=0;side<2;side++)for(let y=100;y<140;y++)for(let x=8;x<104;x++){
     const at=(y*240+x+side*128)*4;if(wet[at]!==dry[at]||wet[at+1]!==dry[at+1]||wet[at+2]!==dry[at+2])counts[side]++;
    }
    if(counts.some(n=>n<3000))throw Error('Missing deep water '+SURVIVAL_STAGES[i]+' phase '+phase+': '+counts);
    minimum[0]=Math.min(minimum[0],counts[0]);minimum[1]=Math.min(minimum[1],counts[1]);phases++;
   }
   records.push({stage:SURVIVAL_STAGES[i],phases,minimumUnderwaterChangedPixels:minimum});
  }
  g.startRound({intro:false});g.music.stop();g.cpu.lost=true;g.finish();const phase=g.phase,elapsed=g.elapsed,x=g.player.egg.x;
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',bubbles:true}));app.input.update();for(let i=0;i<10;i++)g.update(1/60);
  window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',bubbles:true}));app.input.update();
  if(g.phase!=='won'||g.player.egg.x<=x||g.elapsed!==elapsed)throw Error('Post-win movement blocked or score timer advanced');
  const x2=g.player.egg.x;g.resultTicks=220;window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',bubbles:true}));app.input.update();g.update(1/60);
  if(g.player.egg.x!==x2)throw Error('Control continued into podium');
  return {records,postWin:{phase,moved:g.player.egg.x-x,timerFrozen:true,podiumStopsMovement:true},png:grid.toDataURL().split(',')[1]};
 })()`);
 await writeFile(path.join(output,'water-depth.png'),Buffer.from(result.png,'base64'));delete result.png;
 await writeFile(path.join(output,'parameters.json'),JSON.stringify({muted:true,hidden:true,seed:42,water:8,rows:'20 full rows',camera:6,nativeFrames:[600,659],region:[8,100,104,140]},null,2));
 await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,...result}));
}finally{client?.close();child.kill();}
