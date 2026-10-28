// Compare actual reconstructed-game requests with the original timing context.
// Unlike the recording PCM proof, both sides consume the live controls here.
import {Worker} from 'node:worker_threads';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings} from '../renderer/games/eggo-mania/model.js';
import {NativeAudioCommands} from '../renderer/games/eggo-mania/native-audio-player.js';
import {NativeMusic} from '../renderer/games/eggo-mania/audio.js';
import {nativeHeldButtons} from '../renderer/games/eggo-mania/controls.js';
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const P={seed:Number(arg('seed',7)),character:'eggo',characterID:6,frames:Number(arg('frames',6000)),sampleRate:32768,enforce:arg('enforce','false')==='true',traceAfter:Number(arg('trace-after',0)),
 input:{directionPeriod:80,jumpPeriod:97,jumpHold:30,placePeriod:37,rotatePeriod:41},sourceHashes:{}};
const out=path.resolve('scripts/OUTPUT','eggo-audio-alignment_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
for(const name of ['game','character-menu','controls','native-program-worker','native-program-engine','native-program-sync'])P.sourceHashes[name]=createHash('sha256').update(await readFile('renderer/games/eggo-mania/'+name+'.js')).digest('hex');
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const w=new Worker(new URL('./native-audio/native-program-node-host.mjs',import.meta.url),{workerData:{module:new URL('../renderer/games/eggo-mania/native-program-worker.js',import.meta.url).href}});
let waiter;w.on('message',d=>{if(d.type==='error')waiter?.reject(Error(d.message));else if(d.type===waiter?.type){const a=waiter;waiter=null;a.resolve(d);}});w.on('error',e=>waiter?.reject(e));
const send=(message,type)=>new Promise((resolve,reject)=>{if(waiter)throw Error('Concurrent request');const t=setTimeout(()=>reject(Error('Worker timeout')),60000);waiter={type,resolve:d=>{clearTimeout(t);resolve(d);},reject:e=>{clearTimeout(t);reject(e);}};w.postMessage(message);});
let down=new Set(),previous=new Set(),records=[],frame=0;
const g=new Game(),audio={};g.audio=audio;g.nativeSound=new NativeAudioCommands(m=>records.push({...m,buttons:nativeHeldButtons(g.input,{confirm:g.phase==='won'||g.phase==='lost'})}));audio._eggoNative=g.nativeSound;
g.music=new NativeMusic(audio);g.p=settings({seed:P.seed,character:P.character});g.seed=P.seed;g.submitScore=()=>{};
g.input={isActionDown:a=>down.has(a),isActionJustDown:a=>down.has(a)&&!previous.has(a),getFirstGamepadAxis:()=>0};
let firstDivergence=null,checked=0,guardedFrames=0,finalOriginal=true;const timeline=[];
try{
 await send({type:'init',sampleRate:P.sampleRate,diagnosticCompareOnly:!P.enforce},'ready');
 await send({type:'session',sessionId:1,seed:P.seed,character:P.characterID,original:true},'session-ready');g.resetSurvival();
 for(frame=1;frame<=P.frames;frame++){
  const p=P.input;down=new Set([Math.floor(frame/p.directionPeriod)%2?'left':'right',...(frame%p.jumpPeriod<p.jumpHold?['jump']:[]),...(frame%p.placePeriod===0?['place']:[]),...(frame%p.rotatePeriod===0?['rotate']:[])]);
  g.update(1/60);previous=new Set(down);
  for(const r of records.splice(0)){
   if(r.type==='prime'){w.postMessage(r);continue;}
   const data=await send({...r,sessionId:1},'pcm');checked++;
   finalOriginal=data.original;
   if(data.divergence&&P.enforce){if(data.original)throw Error('Divergent original audio was not suppressed');guardedFrames++;}
   if(['music','effects','tempo'].some(k=>r.commands[k]?.length||data.actualCommands?.[k]?.length))timeline.push({frame,expected:r.commands,actual:data.actualCommands});
   if(data.divergence&&!firstDivergence)firstDivergence={frame,phase:g.phase,round:g.round,playerHeight:g.player.height(),cpuHeight:g.cpu?.height(),...data.divergence};
  }
  if(firstDivergence&&frame>=firstDivergence.frame+P.traceAfter)break;
  if(frame%1000===0)console.log(`${frame}/${P.frames}: ${guardedFrames?'visible-game audio enforced':'events aligned'}`);
 }
}finally{await w.terminate();}
const report={checked,firstDivergence,guardedFrames,finalOriginal,phase:g.phase,round:g.round,timeline};await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,...report}));
