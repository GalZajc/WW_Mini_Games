import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'tests','OUTPUT','eggo-character-menu_'+new Date().toISOString().replace(/[:.]/g,'-'));
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
 const text=await readFile(path.join(root,'renderer/games/eggo-mania/assets/character-menu-animation.js'),'utf8');
 const animation=JSON.parse(text.split('export const MENU_ANIMATION=')[1].trim().replace(/;$/,''));
 const oracle={};for(const [name,prefix] of Object.entries(animation.sources))oracle[name]=await Promise.all([1,8,24,60,120,240,512,1024].map(async frame=>({frame,png:(await readFile(path.join(root,prefix+'.frame'+String(frame).padStart(5,'0')+'.png'))).toString('base64')})));
 await client.evaluate('window.__menuOracle='+JSON.stringify(oracle));
 const result=await client.evaluate(`(async()=>{
  const app=window.app;app.settingsManager.save=async()=>{};
  await app.launchGame(app.gameLoader.games.find(c=>c._id==='eggo-mania'));app._isPaused=true;
  const g=app.currentGame;g.seed=42;g.p.seed=42;const {waitForPixelAssets,pixelAssetStatus}=await import('./games/eggo-mania/pixel-renderer.js');
  const {openCharacterMenu,CHARACTER_SELECT}=await import('./games/eggo-mania/character-menu.js');
  const {actorPose}=await import('./games/eggo-mania/view.js');
  if(g.phase!=='character-select')throw Error('Game skipped the selector');
  await waitForPixelAssets();
  const menu=document.createElement('canvas');menu.width=960;menu.height=320;const mc=menu.getContext('2d');
  const gameplay=document.createElement('canvas');gameplay.width=960;gameplay.height=320;const gc=gameplay.getContext('2d');
  const pad={index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
  function tick(){app.input.update();g.update(1/60);}
  function key(code){window.dispatchEvent(new KeyboardEvent('keydown',{code,bubbles:true}));tick();window.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));tick();}
  function button(index){pad.buttons[index].pressed=true;tick();pad.buttons[index].pressed=false;tick();}
  const records=[];
  for(let i=0;i<8;i++){
   const name=CHARACTER_SELECT.order[i];g.p.character='yolko';openCharacterMenu(g);tick();
   for(let n=0;n<i;n++){if(i%2)button(15);else key('ArrowRight');}
   if(g.characterMenu.index!==i)throw Error('Cannot choose '+name);
   let menuDifferentPixels=0;
   for(const sample of window.__menuOracle[name]){
    g.characterMenu.elapsed=(sample.frame-1)/60;g.render();
    const image=new Image();image.src='data:image/png;base64,'+sample.png;await image.decode();
    const ref=document.createElement('canvas');ref.width=240;ref.height=160;const rc=ref.getContext('2d');rc.drawImage(image,0,0);
    const a=g.pixelCanvas.getContext('2d').getImageData(0,0,240,160).data,b=rc.getImageData(0,0,240,160).data;
    let diff=0;for(let y=0;y<160;y++)for(let x=0;x<240;x++){if(x>=110&&y>=60&&y<96)continue;const q=(y*240+x)*4;if(a[q]!==b[q]||a[q+1]!==b[q+1]||a[q+2]!==b[q+2])diff++;}
    menuDifferentPixels+=diff;if(diff)throw Error('Native menu differs '+name+' frame '+sample.frame+': '+diff);
   }
   g.render();mc.drawImage(g.pixelCanvas,i%4*240,Math.floor(i/4)*160);
   if(i%2)button(1);else key('Enter');
   if(g.phase!=='countdown'||g.player.p.character!==name)throw Error('Selection not applied '+name);
   g.startRound({intro:false});g.music.stop();
   let nativePoses=0;
   for(let f=0;f<90;f++){
    pad.buttons[15].pressed=f<25;pad.buttons[12].pressed=f<40;tick();
    if(f===20){g.render();gc.drawImage(g.pixelCanvas,i%4*240,Math.floor(i/4)*160);}
    const pose=actorPose(g.player);
    if(pose.resource){nativePoses++;if(pose.resource.sheet!==name+'-native-poses')throw Error('Wrong airborne actor '+name);}
   }
   if(!nativePoses)throw Error('No native poses exercised '+name);
   if(!pixelAssetStatus(name+'-native-poses').ready)throw Error('Missing actor resource '+name);
   pad.buttons[15].pressed=false;pad.buttons[12].pressed=false;app.input.update();
   g.round++;g.startRound({intro:false});g.music.stop();if(g.player.p.character!==name)throw Error('Next round lost selection');
   records.push({name,nativePoses,menuFramesCompared:8,menuDifferentPixels,phase:g.phase});
  }
  openCharacterMenu(g);tick();key('ArrowLeft');if(g.characterMenu.index!==6)throw Error('Selector did not wrap');
  g.render();const v=g.characterMenuViewport,r=g.canvasPixelRatio();
  window.dispatchEvent(new MouseEvent('mousemove',{clientX:(v.x+231*v.scale)/r,clientY:(v.y+46*v.scale)/r,bubbles:true}));
  window.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));tick();
  window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));app.input.update();
  if(g.characterMenu.index!==7)throw Error('Mouse arrow failed');
  return {records,keyboard:true,controller:true,mouse:true,menu:menu.toDataURL().split(',')[1],gameplay:gameplay.toDataURL().split(',')[1]};
 })()`);
 for(const name of ['menu','gameplay']){await writeFile(path.join(output,name+'.png'),Buffer.from(result[name],'base64'));delete result[name];}
 await writeFile(path.join(output,'parameters.json'),JSON.stringify({audioOutputMuted:true,hidden:true,seed:42,debugPort},null,2));
 await writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({output,...result}));
}finally{client?.close();child.kill();}
