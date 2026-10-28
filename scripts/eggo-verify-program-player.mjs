// Full production PLAYER + Worker replay with a streaming audio boundary.
// Executes createBuffer/channel copies/source.start/sample scheduling for every
// packet, without retaining a half-hour OfflineAudioContext graph in memory.
// Real WebAudio summation/resampling is separately checked by the Electron
// OfflineAudioContext prefix. No physical speakers or desktop input are used.
import {Worker as NodeWorker} from 'node:worker_threads';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {NativeProgramAudioPlayer} from '../renderer/games/eggo-mania/native-program-player.js';
import {NATIVE_AUDIO_ENGINE as CLOCK} from '../renderer/games/eggo-mania/native-audio-engine.js';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const P={oracle:'scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z',
 commands:'scripts/OUTPUT/eggo-live-audio-commands_2026-10-26T21-06-30-342Z/commands.jsonl',
 end:Number(arg('end',109076)),startAfter:400,seed:1492,character:1,characterName:'yolko',
 sampleRate:32768,frameRate:CLOCK.nativeFPS,musicGain:1,effectsGain:1,
 transport:'Unchanged production player/Worker. Streaming AudioBuffer/source boundary; exact continuous sample clock required.',sourceHashes:{}};
const root=process.cwd(),out=path.join(root,'scripts/OUTPUT','eggo-program-player_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const site=JSON.parse(await readFile('sites/eggo-mania/source-manifest.json','utf8'));
for(const name of ['native-program-player','native-program-worker','native-program-assets','native-program-engine','native-program-music','native-program-stream','native-audio-player','native-audio-engine','native-sound-vm','native-sound-events','controls','game']){
 const file='renderer/games/eggo-mania/'+name+'.js',bytes=await readFile(file);P.sourceHashes[file]=sha(bytes);
 if(site.game_source_hashes[file]!==P.sourceHashes[file])throw Error('Player proof must match the published Site source: '+file);
}
for(const file of ['renderer/games/eggo-mania/assets/native-program/manifest.json','renderer/games/eggo-mania/assets/native-audio/manifest.json','scripts/eggo-verify-program-player.mjs','scripts/native-audio/native-program-node-host.mjs'])P.sourceHashes[file]=sha(await readFile(file));
const source=JSON.parse(await readFile(path.join(P.oracle,'parameters.json'),'utf8'));P.originalReference=source;
const commands=await readFile(P.commands,'utf8'),tape=await readFile(path.join(source.recording,'inputs.jsonl'),'utf8');
P.commandsSha256=sha(commands);P.inputsSha256=sha(tape);P.initialStateSha256=sha(await readFile(path.join(P.oracle,'initial.state')));
const masks=new Map(tape.trim().split('\n').map(line=>{const r=JSON.parse(line);return[r.frame,r.mask];}));
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
let bridge;
const previousWorker=globalThis.Worker;
globalThis.Worker=class {
 constructor(module){
  bridge=this;this.waiter=null;this.node=new NodeWorker(new URL('./native-audio/native-program-node-host.mjs',import.meta.url),{workerData:{module:module.href}});
  this.node.on('message',data=>{try{this.onmessage?.({data});}catch(error){this.waiter?.reject(error);return;}if(data.type==='error')this.waiter?.reject(Error(data.message));else if(data.type===this.waiter?.type){const w=this.waiter;this.waiter=null;w.resolve(data);}});
  this.node.on('error',error=>{this.onerror?.({message:error.message});this.waiter?.reject(error);});
 }
 postMessage(message){this.node.postMessage(message);}
 terminate(){this.node.terminate();}
 wait(type){return new Promise((resolve,reject)=>{if(this.waiter)throw Error('Concurrent player wait');const timer=setTimeout(()=>reject(Error('Player timed out: '+type)),60000);this.waiter={type,resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};});}
};
let rawMask=0,currentFrame=400,nextSample=null,firstSample=null,pair={},packet=null,sources=0,gaps=0;
const ctx={state:'running',sampleRate:P.sampleRate,currentTime:0,
 createBuffer(channels,n,rate){return {length:n,sampleRate:rate,duration:n/rate,data:Array.from({length:channels},()=>new Float32Array(n)),getChannelData(c){return this.data[c];}};},
 createBufferSource(){return {connect(channel){this.channel=channel;},disconnect(){},stop(){},start(when,offset){
  if(offset!==0)throw Error('Unexpected replay source offset');
  const at=Math.round(when*P.sampleRate),n=this.buffer.length;
  if(this.channel.name==='music'){
   if(firstSample===null){firstSample=at;nextSample=at;}
   if(at!==nextSample){gaps++;throw Error('Noncontinuous actual player schedule at frame'+currentFrame+': '+at+' vs '+nextSample);}
   pair={at,n,music:this.buffer};
  }else{
   if(pair.at!==at||pair.n!==n)throw Error('Music/effects source clocks differ');
   const pcm=Buffer.alloc(n*4);
   for(let i=0;i<n;i++)for(let c=0;c<2;c++)pcm.writeInt16LE(Math.round((pair.music.data[c][i]+this.buffer.data[c][i])*32768),(i*2+c)*2);
   if(packet)throw Error('Undrained player packet');packet=pcm;nextSample+=n;pair={};
  }
  sources++;queueMicrotask(()=>this.onended?.());
 }};},
};
const audio={_ensureCtx:()=>ctx,_channels:{music:{name:'music'},effects:{name:'effects'}}};
const player=new NativeProgramAudioPlayer(audio,{readButtons:()=>rawMask,initialization:{diagnosticInitialStateURL:pathToFileURL(path.resolve(P.oracle,'initial.state')).href}});
const reference=await open(path.join(P.oracle,'reference.wav'),'r'),output=await open(path.join(out,'reconstruction.wav'),'w');await output.write(Buffer.alloc(44));
let matched=0,samples=0,firstMismatch=null,peakRSS=process.memoryUsage().rss;const pcmHash=createHash('sha256'),times=[],begin=performance.now();
try{
 const ready=bridge.wait('session-ready');player.startSession({seed:P.seed,character:P.character,original:true});await ready;
 if(player.preparing||!player.original||player.error)throw Error('Current player did not initialize original audio');
 for(const line of commands.trim().split('\n')){
  const record=JSON.parse(line);if(record.frame>P.end)break;
  if(record.type==='prime'){player.send({type:'prime',commands:record.commands});continue;}
  if(record.type!=='frame'||record.frame<=P.startAfter)continue;
  currentFrame=record.frame;rawMask=masks.get(currentFrame);ctx.currentTime=(currentFrame-P.startAfter)/P.frameRate;
  const received=bridge.wait('pcm');player.pending=record.commands;player.begin();player.end(record.commands.tick);const message=await received;
  if(player.error||player.pendingFrames||!message.original||!packet)throw Error('Current player stream failed at'+currentFrame);
  const actual=packet;packet=null;const n=actual.length/4,expected=Buffer.alloc(actual.length);
  const read=await reference.read(expected,0,expected.length,44+samples*4);if(read.bytesRead!==expected.length)throw Error('Original reference ended');
  if(!actual.equals(expected))for(let i=0;i<n*2;i++)if(actual.readInt16LE(i*2)!==expected.readInt16LE(i*2)){firstMismatch={frame:currentFrame,sample:samples+Math.floor(i/2),channel:i%2,actual:actual.readInt16LE(i*2),expected:expected.readInt16LE(i*2)};break;}
  pcmHash.update(actual);await output.write(actual);samples+=n;times.push(message.computeMs);if(firstMismatch)break;matched++;
  if(currentFrame%10000===0){peakRSS=Math.max(peakRSS,process.memoryUsage().rss);console.log(`${currentFrame}/${P.end}, continuous clock, exact PCM`);}
 }
}finally{player.destroy();await bridge.node.terminate();globalThis.Worker=previousWorker;await reference.close();}
const h=Buffer.alloc(44),size=samples*4;h.write('RIFF');h.writeUInt32LE(36+size,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(P.sampleRate,24);h.writeUInt32LE(P.sampleRate*4,28);h.writeUInt16LE(4,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(size,40);await output.write(h,0,44,0);await output.close();
const sorted=[...times].sort((a,b)=>a-b),report={matched,samples,firstMismatch,gaps,sourceNodes:sources,knownTransportOffsetSamples:firstSample,
 finalScheduledSample:nextSample,expectedFinalScheduledSample:firstSample+samples,pcmSha256:pcmHash.digest('hex'),peakRSS,milliseconds:performance.now()-begin,
 workerMeanComputeMs:times.reduce((a,b)=>a+b,0)/times.length,workerP95ComputeMs:sorted[Math.floor(sorted.length*.95)],workerMaxComputeMs:sorted.at(-1)};
await writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2));await writeFile(path.join(out,'compute-ms.json'),JSON.stringify(times));console.log(JSON.stringify({out,...report}));if(firstMismatch||gaps||matched!==P.end-P.startAfter)process.exitCode=1;
