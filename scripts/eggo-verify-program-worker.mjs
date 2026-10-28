// Complete production audio-worker replay, streamed and muted. No Web Audio
// graph retained for the whole half-hour: its linear transport is separately
// checked with the actual Electron player/OfflineAudioContext.
import {Worker} from 'node:worker_threads';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const P={oracle:arg('oracle','scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z'),
 commands:arg('commands','scripts/OUTPUT/eggo-live-audio-commands_2026-10-26T21-06-30-342Z/commands.jsonl'),
 end:Number(arg('end',109076)),sampleRate:32768,sessionId:1,original:true,sourceHashes:{}};
const out=path.resolve('scripts/OUTPUT','eggo-program-worker_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const source=JSON.parse(await readFile(path.join(P.oracle,'parameters.json'),'utf8'));P.sourceParameters=source;P.startAfter=source.start_after??400;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nativeFiles=['native-program-worker','native-program-assets','native-program-engine','native-program-music','native-program-stream','native-audio-engine','native-sound-vm','native-sound-events'];
for(const name of nativeFiles){const f='renderer/games/eggo-mania/'+name+'.js';P.sourceHashes[f]=sha(await readFile(f));}
for(const f of ['scripts/eggo-verify-program-worker.mjs','scripts/native-audio/native-program-node-host.mjs','renderer/games/eggo-mania/assets/native-program/manifest.json','renderer/games/eggo-mania/assets/native-audio/manifest.json'])P.sourceHashes[f]=sha(await readFile(f));
const commands=await readFile(P.commands,'utf8');P.commandsSha256=sha(commands);
const tape=await readFile(path.join(source.recording,'inputs.jsonl'),'utf8');P.inputsSha256=sha(tape);
const masks=new Map(tape.trim().split('\n').map(line=>{const r=JSON.parse(line);return[r.frame,r.mask];}));
const initialState=pathToFileURL(path.resolve(P.oracle,'initial.state')).href;P.initialStateSha256=sha(await readFile(path.join(P.oracle,'initial.state')));
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const worker=new Worker(new URL('./native-audio/native-program-node-host.mjs',import.meta.url),{workerData:{module:new URL('../renderer/games/eggo-mania/native-program-worker.js',import.meta.url).href}});
let waiting;
worker.on('message',data=>{if(data.type==='error')waiting?.reject(Error(data.message));else if(data.type===waiting?.type){const w=waiting;waiting=null;w.resolve(data);}});
worker.on('error',error=>waiting?.reject(error));
worker.on('exit',code=>waiting?.reject(Error('Native audio worker exited: '+code)));
const request=(message,type)=>new Promise((resolve,reject)=>{if(waiting)throw Error('Concurrent worker request');waiting={type,resolve,reject};worker.postMessage(message);});
const reference=await open(path.join(P.oracle,'reference.wav'),'r'),output=await open(path.join(out,'reconstruction.wav'),'w');await output.write(Buffer.alloc(44));
const times=[],pcmHash=createHash('sha256');let matched=0,samples=0,firstMismatch=null,peakRSS=process.memoryUsage().rss;
const begin=performance.now();
try{
 await request({type:'init',sampleRate:P.sampleRate,diagnosticInitialStateURL:initialState},'ready');
 await request({type:'session',sessionId:P.sessionId,seed:1492,character:1,original:true},'session-ready');
 for(const line of commands.trim().split('\n')){
  const record=JSON.parse(line);if(record.frame>P.end)break;
  if(record.type==='prime'){worker.postMessage({...record,sessionId:P.sessionId});continue;}
  if(record.type!=='frame'||record.frame<=P.startAfter)continue;
  const response=await request({...record,sessionId:P.sessionId,buttons:masks.get(record.frame),nonNative:false},'pcm');
  if(!response.original)throw Error('Original audio backend unexpectedly disabled');
  const pcm=response.pcm,n=pcm.length/4,actual=Buffer.alloc(n*4),expected=Buffer.alloc(n*4);
  for(let i=0;i<n*2;i++)actual.writeInt16LE(Math.round((pcm[i]+pcm[n*2+i])*32768),i*2);
  const read=await reference.read(expected,0,expected.length,44+samples*4);if(read.bytesRead!==expected.length)throw Error('Native reference ended');
  if(!actual.equals(expected))for(let i=0;i<n*2;i++)if(actual.readInt16LE(i*2)!==expected.readInt16LE(i*2)){firstMismatch={frame:record.frame,sample:samples+Math.floor(i/2),channel:i%2,actual:actual.readInt16LE(i*2),expected:expected.readInt16LE(i*2)};break;}
  pcmHash.update(actual);await output.write(actual);samples+=n;times.push(response.computeMs);
  if(firstMismatch)break;matched++;
  if(record.frame%10000===0){peakRSS=Math.max(peakRSS,process.memoryUsage().rss);console.log(`${record.frame}/${P.end}`);}
 }
}finally{await worker.terminate();await reference.close();}
const header=Buffer.alloc(44),size=samples*4;header.write('RIFF');header.writeUInt32LE(36+size,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(P.sampleRate,24);header.writeUInt32LE(P.sampleRate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(size,40);await output.write(header,0,44,0);await output.close();
const ordered=[...times].sort((a,b)=>a-b);
const report={matched,samples,firstMismatch,pcmSha256:pcmHash.digest('hex'),milliseconds:performance.now()-begin,peakRSS,
 workerMeanComputeMs:times.reduce((a,b)=>a+b,0)/times.length,workerP95ComputeMs:ordered[Math.floor(ordered.length*.95)],workerMaxComputeMs:ordered.at(-1)};
await writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2));await writeFile(path.join(out,'compute-ms.json'),JSON.stringify(times));console.log(JSON.stringify({out,...report}));if(firstMismatch||matched!==P.end-P.startAfter)process.exitCode=1;
