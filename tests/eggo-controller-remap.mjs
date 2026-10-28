import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import WebSocket from 'ws';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'tests','OUTPUT','eggo-controller-remap_'+new Date().toISOString().replace(/[:.]/g,'-'));
const electronPath=path.join(root,'node_modules','electron','dist','electron.exe');
const debugPort=9398;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

class Client{
 constructor(url){this.socket=new WebSocket(url);this.nextId=1;this.pending=new Map();}
 async connect(){await new Promise((resolve,reject)=>{this.socket.once('open',resolve);this.socket.once('error',reject);});this.socket.on('message',raw=>{const m=JSON.parse(raw.toString()),p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);});}
 call(method,params={}){const id=this.nextId++;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.socket.send(JSON.stringify({id,method,params}));});}
 async evaluate(expression){const result=await this.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
 close(){this.socket.close();}
}

const child=spawn(electronPath,['--mute-audio','.',`--remote-debugging-port=${debugPort}`],{
 cwd:root,windowsHide:true,env:{...process.env,WW_MINI_GAMES_HEADLESS_TEST:'1'},stdio:['ignore','pipe','pipe'],
});
let client;
let stderr='';
child.stderr.on('data',chunk=>{stderr+=chunk.toString();});
try{
 await mkdir(output,{recursive:true});
 await writeFile(path.join(output,'parameters.json'),JSON.stringify({game:'Eggo Mania Survival',input:'standard Xbox-compatible Gamepad API',remapFrom:'GBA B / keyboard X',remapTo:'Xbox X',buttonIndex:2,seed:42,debugPort},null,2));
 let page;
 const deadline=Date.now()+20000;
 while(Date.now()<deadline){
  try{const response=await fetch(`http://127.0.0.1:${debugPort}/json`);if(response.ok){page=(await response.json()).find(item=>item.type==='page'&&item.webSocketDebuggerUrl);if(page)break;}}catch{}
  await delay(100);
 }
 assert.ok(page,'Electron renderer becomes available');
 client=new Client(page.webSocketDebuggerUrl);await client.connect();
 let appReady=false;const appDeadline=Date.now()+20000;
 while(Date.now()<appDeadline&&!appReady){try{appReady=await client.evaluate('Boolean(window.app?.gameLoader?.games?.length)');}catch{}if(!appReady)await delay(100);}
 assert.ok(appReady,'The game launcher finishes loading');
 await client.evaluate(`(async()=>{window.app.settingsManager.save=async()=>{};const config=window.app.gameLoader.games.find(item=>item._id==='eggo-mania');await window.app.launchGame(config);window.app.currentGame.startingStage=0;window.app.currentGame.startRound({intro:false});return true;})()`);
 await client.evaluate(`(()=>{
  const app=window.app,buttons=Array.from({length:17},()=>({pressed:false,value:0,touched:false}));
  const pad={index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
  app.settingsManager.saveKeybindings=async()=>{};
  app.input.update();app.pauseGame();
  const controls=app.pauseMenu.panel.querySelector('[data-action="controls"]');
  if(!controls)throw Error('Pause menu Controls item is missing');
  controls.click();
  const binding=[...app.pauseMenu.panel.querySelectorAll('.control-key')]
   .find(element=>element.dataset.action==='rotate'&&element.dataset.index==='0');
  if(!binding)throw Error('Rotate binding is missing');
  binding.click();
  if(!app.input._listening)throw Error('Clicking the binding did not start input capture');
  window.__eggoRemapPad=pad;
  return {listening:true,oldBinding:app.pauseMenu._tempBindings.rotate[0]};
 })()`);
 let captured;
 const captureDeadline=Date.now()+5000;
 while(Date.now()<captureDeadline){
  captured=await client.evaluate(`(()=>{
   const app=window.app,pad=window.__eggoRemapPad;if(!pad)return false;
   pad.buttons[2].pressed=true;
   const binding=app.pauseMenu._tempBindings.rotate?.[0];
   return !app.input._listening&&binding?.type==='gamepad'&&binding.code===2
    ?{binding,display:[...app.pauseMenu.panel.querySelectorAll('.control-key')].find(item=>item.dataset.action==='rotate'&&item.dataset.index==='0')?.textContent}
    :false;
  })()`);
  if(captured)break;
  await delay(50);
 }
 assert.ok(captured,'Pressing Xbox X is captured by the remapping UI');
 assert.match(captured.display,/X/,'The control table displays the newly captured button');
 const applied=await client.evaluate(`(async()=>{
  const app=window.app,pad=window.__eggoRemapPad;
  await app.pauseMenu._saveControls();
  const binding=app.currentBindings.rotate[0];
  pad.buttons[2].pressed=false;app.input.update();
  pad.buttons[2].pressed=true;app.input.update();
  return {binding,actionTriggered:app.input.isActionJustDown('rotate')};
 })()`);
 assert.deepEqual(applied.binding,{type:'gamepad',code:2});
 assert.equal(applied.actionTriggered,true,'Saved Xbox X now triggers rotation');
 await writeFile(path.join(output,'result.json'),JSON.stringify({captured,applied},null,2));
 console.log(JSON.stringify({captured,applied,output}));
}catch(error){
 console.error(error);
 if(stderr)console.error(stderr.slice(-3000));
 process.exitCode=1;
}finally{
 client?.close();child.kill();
}
