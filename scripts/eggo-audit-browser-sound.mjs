// Real browser autoplay policy, real production assets, muted device output.
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
const root=process.cwd(),args=Object.fromEntries(process.argv.slice(2).map(a=>a.replace(/^--/,'').split(/=(.*)/s))),P={url:args.url??'https://eggo-mania-survival-ww.lightraven257.chatgpt.site',port:9397,seed:7,frames:190,muted:true,autoplayPolicy:'document-user-activation-required'};
const out=path.join(root,'scripts/OUTPUT','eggo-browser-sound_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const browserArgs=['--mute-audio','--autoplay-policy='+P.autoplayPolicy,'--remote-debugging-port='+P.port,'--user-data-dir='+path.join(out,'browser-profile')];
P.browser=args.browser??'electron';
const executable=P.browser==='brave'?path.join(process.env.LOCALAPPDATA,'BraveSoftware/Brave-Browser/Application/brave.exe'):path.join(root,'node_modules/electron/dist/electron.exe');
const child=spawn(executable,P.browser==='brave'?[...browserArgs,'--headless=new','--no-first-run','--no-default-browser-check','about:blank']:[...browserArgs,'scripts/eggo-browser-audio-host.cjs'],{cwd:root,windowsHide:true,stdio:'ignore'});
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),errors=[];let socket,id=0;const pending=new Map();
try{
 let page;for(let i=0;i<150&&!page;i++){try{page=(await(await fetch('http://127.0.0.1:'+P.port+'/json')).json()).find(p=>p.type==='page');}catch{}if(!page)await sleep(100);}if(!page)throw Error('Hidden test browser unavailable');
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.once('open',r));
 socket.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'){const e=m.params.entry;if(!/\/(?:favicon\.ico|apple-touch-icon[^/]*|\.well-known\/appspecific\/)/.test(e.url??''))errors.push(e.text+' '+(e.url??''));}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('Timeout: '+method));},60000);pending.set(n,{resolve:r=>{clearTimeout(t);resolve(r);},reject:e=>{clearTimeout(t);reject(e);}});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:false});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
 await call('Runtime.enable');await call('Log.enable');await call('Page.enable');await call('Page.addScriptToEvaluateOnNewDocument',{source:'window.requestAnimationFrame=()=>0;'});await call('Page.navigate',{url:P.url});
 let loaded=false;for(let i=0;i<400;i++){if(await evaluate('Boolean(window.eggo?.game&&!document.getElementById("loading"))')){loaded=true;break;}await sleep(100);}if(!loaded)throw Error('Page did not load: '+JSON.stringify(errors));
 const state=()=>evaluate(`({context:eggo.audio._ctx.state,activation:navigator.userActivation.hasBeenActive,phase:eggo.game.phase,error:eggo.game.nativeSound.error??null,paused:eggo.game.nativeSound.paused,sources:eggo.game.nativeSound.sources.size,prompt:!!document.querySelector('#enable-sound:not([hidden])')})`);
 const initial=await state();
 // Controller actions enter through the game loop, without browser activation.
 P.menuFirst=args['menu-first']==='true';P.actualMenuSeed=await evaluate('eggo.game.seed');
 await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
 if(!P.menuFirst)await evaluate(`{const g=eggo.game;g.seed=${P.seed};g.resetSurvival();}`);
 for(let i=0;i<600;i++){const s=await evaluate('({preparing:eggo.game.nativeSound.preparing,error:eggo.game.nativeSound.error})');if(s.error)throw Error(s.error);if(!s.preparing)break;if(i===599)throw Error('Audio preparation timed out');await sleep(50);}
 await evaluate(`(async()=>{for(let i=0;i<10;i++){eggo.game.update(1/60);while(eggo.game.nativeSound.pendingFrames)await new Promise(r=>setTimeout(r,1));}})()`);
 const controllerOnly=await state();console.log(JSON.stringify({out,initial,controllerOnly}));
 const target=await evaluate(`(()=>{const e=document.querySelector('#enable-sound:not([hidden])')??document.querySelector('#menu-button'),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...target});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...target});await sleep(100);
 // Close a menu if this older version has no explicit sound-unlock button.
 await evaluate(`if(document.querySelector('#menu').open)document.querySelector('#resume').click();window.soundAudit={max:0};const a=eggo.audio._ctx.createAnalyser();a.fftSize=2048;for(const g of Object.values(eggo.audio._channels))g.connect(a);soundAudit.analyser=a;`);
 const samples=await evaluate(`(async()=>{for(let i=0;i<${P.frames};i++){eggo.game.update(1/60);while(eggo.game.nativeSound.pendingFrames)await new Promise(r=>setTimeout(r,1));await new Promise(r=>setTimeout(r,17));const b=new Float32Array(2048);soundAudit.analyser.getFloatTimeDomainData(b);for(const v of b)soundAudit.max=Math.max(soundAudit.max,Math.abs(v));}return soundAudit.max;})()`);
 const afterClick=await state();let gameplay=null;
 if(P.menuFirst){
  if(afterClick.phase!=='character-select')throw Error('Menu audio test bypassed character selection');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  await evaluate('eggo.input.update();eggo.game.update(1/60);eggo.input.postUpdate();');
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
  for(let i=0;i<600;i++){const s=await evaluate('({preparing:eggo.game.nativeSound.preparing,error:eggo.game.nativeSound.error})');if(s.error)throw Error(s.error);if(!s.preparing)break;if(i===599)throw Error('Gameplay audio preparation timed out');await sleep(50);}
  gameplay=await evaluate(`(async()=>{soundAudit.max=0;for(let i=0;i<190;i++){eggo.input.update();eggo.game.update(1/60);eggo.input.postUpdate();while(eggo.game.nativeSound.pendingFrames)await new Promise(r=>setTimeout(r,1));await new Promise(r=>setTimeout(r,17));const b=new Float32Array(2048);soundAudit.analyser.getFloatTimeDomainData(b);for(const v of b)soundAudit.max=Math.max(soundAudit.max,Math.abs(v));}return {phase:eggo.game.phase,original:eggo.game.nativeSound.original,divergence:eggo.game.nativeSound.divergence??null,error:eggo.game.nativeSound.error??null,peakPCM:soundAudit.max};})()`);
  console.log(JSON.stringify({menuPeakPCM:samples,afterClick,gameplay}));
  await writeFile(path.join(out,'transition.json'),JSON.stringify({menuPeakPCM:samples,afterClick,gameplay},null,2));
  // The native introduction length depends on the initial arena. Countdown
  // is already a valid game round with its own audible intro/READY sequence.
  if(!['countdown','playing'].includes(gameplay.phase)||(!gameplay.original&&!gameplay.divergence)||gameplay.error||!gameplay.peakPCM)throw Error('Menu-to-gameplay audio transition failed');
 }
 const report={initial,controllerOnly,afterClick,peakPCM:samples,gameplay,errors};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,...report}));
 if(afterClick.context!=='running'||samples===0||errors.length)process.exitCode=1;
 if(args.fixed==='true'&&(controllerOnly.context!=='suspended'||!controllerOnly.prompt||afterClick.prompt))process.exitCode=1;
}finally{socket?.close();child.kill();}
