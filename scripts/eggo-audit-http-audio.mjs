// Cold, muted HTTP Site smoke check through the actual production modules.
// No desktop input, OS screen capture, controller takeover, or settings writes.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import WebSocket from 'ws';
const root=process.cwd(),P={url:'http://127.0.0.1:8766',port:9396,frames:320,seed:7,character:'eggo',restartSeed:8,restartCharacter:'spike',muted:true,
 inputPattern:{directionTicks:60,jumpPeriod:40,jumpHold:20,placePeriod:47,rotatePeriod:31}};
const out=path.join(root,'scripts/OUTPUT','eggo-http-audio_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
P.manifestSha256=createHash('sha256').update(await readFile('sites/eggo-mania/source-manifest.json')).digest('hex');await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const child=spawn(path.join(root,'node_modules/electron/dist/electron.exe'),['--mute-audio','--remote-debugging-port='+P.port,'--user-data-dir='+path.join(out,'browser-profile'),'.'],{cwd:root,windowsHide:true,env:{...process.env,WW_MINI_GAMES_HEADLESS_TEST:'1'},stdio:'ignore'});
let socket;const errors=[];let id=0;const pending=new Map();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let page;for(let i=0;i<150&&!page;i++){try{page=(await(await fetch('http://127.0.0.1:'+P.port+'/json')).json()).find(p=>p.type==='page');}catch{}if(!page)await pause(100);}
 if(!page)throw Error('Hidden HTTP audit renderer unavailable');
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.once('open',r));
 socket.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(Error(m.error.message)):p?.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);});
 socket.on('close',()=>{for(const p of pending.values())p.reject(Error('HTTP audit browser closed'));pending.clear();});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>{pending.delete(n);reject(Error('HTTP audit timed out: '+method));},45000);pending.set(n,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;};
 await call('Runtime.enable');await call('Page.enable');
 await call('Page.addScriptToEvaluateOnNewDocument',{source:'window.requestAnimationFrame=()=>0;'});
 await call('Page.navigate',{url:P.url});
 let loaded=false;for(let i=0;i<300;i++){if(await evaluate('Boolean(window.eggo?.game&&!document.getElementById("loading"))')){loaded=true;break;}await pause(100);}if(!loaded)throw Error('HTTP Site did not finish loading');
 const initial=await evaluate('({phase:eggo.game.phase,character:eggo.game.p.character})');if(initial.character!=='eggo')throw Error('Default character changed');
 const snap=await evaluate("eggo.game.render();eggo.game.canvas.toDataURL('image/png')");await writeFile(path.join(out,'initial-menu.png'),Buffer.from(snap.split(',')[1],'base64'));
 await evaluate(`(async()=>{const g=eggo.game,{settings}=await import('./renderer/games/eggo-mania/model.js');window.audit={down:new Set(),previous:new Set()};g.input={isActionDown:a=>audit.down.has(a),isActionJustDown:a=>audit.down.has(a)&&!audit.previous.has(a),getFirstGamepadAxis:()=>0};g.p=settings({seed:${P.seed},character:${JSON.stringify(P.character)}});g.seed=${P.seed};await eggo.audio._ensureCtx().resume();g.resetSurvival();})()`);
 const waitSession=async()=>{for(let i=0;i<600;i++){const s=await evaluate('({preparing:eggo.game.nativeSound.preparing,error:eggo.game.nativeSound.error})');if(s.error)throw Error(s.error);if(!s.preparing)return;await pause(50);}throw Error('HTTP audio session initialization timed out');};
 await waitSession();
 const playing=await evaluate(`(async()=>{const g=eggo.game,p=${JSON.stringify(P.inputPattern)};for(let i=0;i<${P.frames};i++){audit.down=new Set([Math.floor(i/p.directionTicks)%2?'left':'right',...(i%p.jumpPeriod<p.jumpHold?['jump']:[]),...(i%p.placePeriod===0?['place']:[]),...(i%p.rotatePeriod===0?['rotate']:[])]);g.update(1/60);audit.previous=new Set(audit.down);const end=performance.now()+10000;while(g.nativeSound.pendingFrames&&!g.nativeSound.error&&performance.now()<end)await new Promise(r=>setTimeout(r,1));if(g.nativeSound.error||g.nativeSound.pendingFrames)throw Error(g.nativeSound.error??'HTTP audio stalled');}g.render();return {phase:g.phase,original:g.nativeSound.original,frames:${P.frames},pending:g.nativeSound.pendingFrames,rate:g.nativeSound.ctx.sampleRate,computeMs:g.nativeSound.computeMs};})()`);
 if(!playing.original||playing.phase!=='playing')throw Error('HTTP Site did not reach original-rule gameplay');
 const shot=await evaluate("eggo.game.canvas.toDataURL('image/png')");await writeFile(path.join(out,'playing.png'),Buffer.from(shot.split(',')[1],'base64'));
 const fallback=await evaluate(`(async()=>{const g=eggo.game;audit.down=new Set(['rotateBack']);audit.previous=new Set();g.update(1/60);while(g.nativeSound.pendingFrames&&!g.nativeSound.error)await new Promise(r=>setTimeout(r,1));if(g.nativeSound.error)throw Error(g.nativeSound.error);return {original:g.nativeSound.original,pending:g.nativeSound.pendingFrames};})()`);if(fallback.original)throw Error('Extension fallback failed');
 await evaluate(`audit.down=new Set();audit.previous=new Set();eggo.game.p.character=${JSON.stringify(P.restartCharacter)};eggo.game.seed=${P.restartSeed};eggo.game.resetSurvival();`);await waitSession();
 const restart=await evaluate('({original:eggo.game.nativeSound.original,sessionId:eggo.game.nativeSound.sessionId,character:eggo.game.p.character})');if(!restart.original||restart.character!==P.restartCharacter)throw Error('Fresh HTTP audio restart failed');
 await evaluate('eggo.game.nativeHumanMatch=true;eggo.game.resetSurvival();');
 const custom=await evaluate(`(async()=>{const g=eggo.game;if(g.nativeSound.preparing)throw Error('Network simulation blocked on sound');g.update(1/60);while(g.nativeSound.pendingFrames&&!g.nativeSound.error)await new Promise(r=>setTimeout(r,1));if(g.nativeSound.error)throw Error(g.nativeSound.error);const r={original:g.nativeSound.original,pending:g.nativeSound.pendingFrames};g.nativeSound.destroy();return r;})()`);if(custom.original)throw Error('Network game used original CPU opponent audio');
 const report={initial,playing,fallback,restart,custom,errors};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,...report}));if(errors.length)process.exitCode=1;
}finally{socket?.close();child.kill();}
