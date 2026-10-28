// Silent comparison of the exact portable engine used by the browser worker.
import {createNativeAudioEngine,NATIVE_AUDIO_ENGINE as C} from '../renderer/games/eggo-mania/native-audio-engine.js';
import {PODIUM_VIEW} from '../renderer/games/eggo-mania/result-view.js';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const P={oracle:arg('oracle','scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z'),
 commands:arg('app','scripts/OUTPUT/eggo-sound-model_2026-10-26T20-13-00-295Z'),
 end:Number(arg('end',2000)),initialFrame:400,sampleRate:32768,
 assets:'renderer/games/eggo-mania/assets/native-audio',liveCommands:arg('live-commands',null),stems:arg('stems','false')==='true'};
const out=path.resolve('scripts/OUTPUT','eggo-portable-audio_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
P.hashes={};for(const n of ['native-audio-engine.js','native-sound-vm.js'])P.hashes[n]=createHash('sha256').update(await readFile('renderer/games/eggo-mania/'+n)).digest('hex');
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const events=new Map(),music=new Map(),tempo=new Map(),resets=new Set(),loading=new Set();
const add=(m,f,id)=>{if(!m.has(f))m.set(f,[]);m.get(f).push(id);};
for(const x of JSON.parse(await readFile(path.join(P.commands,'requested-sounds.json'),'utf8')))add(events,x.frame,x.id);
for(const x of JSON.parse(await readFile(path.join(P.commands,'tempo-requests.json'),'utf8')))add(tempo,x.frame,x.value);
for(const x of JSON.parse(await readFile(path.join(P.commands,'music-requests.json'),'utf8'))){
 add(music,x.frame,x.id);if(x.stage==='result-intro')for(let f=x.frame+PODIUM_VIEW.roundTicks+PODIUM_VIEW.entryDelay-1;f<x.frame+PODIUM_VIEW.musicTick-1;f++)loading.add(f);
}
for(const x of JSON.parse(await readFile(path.join(P.commands,'round-loads.json'),'utf8')))if(x.budget){
 resets.add(x.frame);add(music,x.frame,0);add(music,x.frame+x.budget.frames[0],0);
 for(let f=x.frame;f<x.frame+x.budget.ticks;f++)loading.add(f);
}
const live=P.liveCommands?new Map((await readFile(path.join(P.liveCommands,'commands.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(x=>x.frame>P.initialFrame&&x.type==='frame').map(x=>[x.frame,x.commands])):null;
const engine=await createNativeAudioEngine(n=>readFile(path.join(P.assets,n)),{stems:P.stems});
const reference=await open(path.join(P.oracle,'sound-ram.bin'),'r'),stride=C.soundEnd-C.soundStart,expected=Buffer.alloc(stride);
const wav=await open(path.join(out,'reconstruction.wav'),'w');await wav.write(Buffer.alloc(44));
let matched=0,firstMismatch=null,samples=0;const begin=performance.now();
try{for(let frame=P.initialFrame+1;frame<=P.end;frame++){
 if(live&&!live.has(frame))throw Error('Production audio frame missing at '+frame);
 const output=engine.step(live?live.get(frame):{reset:resets.has(frame),music:music.get(frame),effects:events.get(frame),tempo:tempo.get(frame),tick:!loading.has(frame)});
 const pcm=P.stems?output.full:output;
 if(P.stems)for(let i=0;i<pcm.length;i++)if((output.stems[i]+output.stems[pcm.length+i])*32768!==pcm[i])throw Error('Music + effects no longer reconstruct the original mix');
 await wav.write(new Uint8Array(pcm.buffer));samples+=pcm.length/2;
 const {bytesRead}=await reference.read(expected,0,stride,(frame-P.initialFrame-1)*stride);
 if(bytesRead!==stride)throw Error('Incomplete original sound reference');
 for(let i=0;i<stride;i++)if(engine.vm.iwram[C.soundStart+i]!==expected[i]){firstMismatch={frame,address:C.soundStart+i,expected:expected[i],actual:engine.vm.iwram[C.soundStart+i]};break;}
 if(firstMismatch)break;matched++;
 if(frame%10000===0)console.log(`${frame}/${P.end}`);
}}finally{await reference.close();}
const header=Buffer.alloc(44),size=samples*4;header.write('RIFF');header.writeUInt32LE(36+size,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(P.sampleRate,24);header.writeUInt32LE(P.sampleRate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(size,40);await wav.write(header,0,44,0);await wav.close();
const report={matched,firstMismatch,samples,milliseconds:performance.now()-begin,instructions:engine.vm.instructions};
await writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,...report}));if(firstMismatch)process.exitCode=1;
