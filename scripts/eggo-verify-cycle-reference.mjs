// Original CPU/IRQ/DMA reference, diagnostic only. No speaker or desktop access.
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {WASI} from 'node:wasi';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createCycleMusic} from './native-audio/cycle-music-shadow.mjs';
import {createCycleAudioEngine} from './native-audio/cycle-audio-engine.mjs';
import {loadNativeProgram} from '../renderer/games/eggo-mania/native-program-assets.js';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const P={build:arg('build',null),oracle:arg('oracle','scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z'),
 initialFrame:400,end:Number(arg('end',1000)),draw:arg('draw','false')==='true',portableHost:arg('portable','false')==='true',package:arg('package',null),sampleRate:32768,branchReference:arg('branch-reference',null),initialState:arg('initial-state',null)};
if(!P.build)throw Error('Required --build=');
const out=path.resolve('scripts/OUTPUT','eggo-cycle-reference_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const original=JSON.parse(await readFile(path.join(P.oracle,'parameters.json'),'utf8')),wasm=await readFile(path.join(P.build,'cycle-reference.wasm'));
P.initialFrame=Number(original.start_after??P.initialFrame);
if(P.branchReference){
 P.branchParameters=JSON.parse(await readFile(path.join(P.branchReference,'parameters.json'),'utf8'));
 P.branchExpected=JSON.parse(await readFile(path.join(P.branchReference,'summary.json'),'utf8'));
 if(P.end!==P.branchParameters.end)throw Error('Branch hash comparison must cover its entire original native window');
}
P.sourceParameters=original;P.wasmSha256=createHash('sha256').update(wasm).digest('hex');
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const wasi=new WASI({version:'preview1',args:[],env:{},preopens:{}});
const rom=await readFile(original.rom),state=await readFile(P.initialState??path.join(P.oracle,'initial.state'));
let e,portable;
if(P.package){
 if(P.draw)throw Error('Packaged audio-only context does not render video');
 const resources=await loadNativeProgram(async name=>new Uint8Array(await readFile(path.join(P.package,name))));
 portable=await resources.create(original.initialization?{seed:original.seed,character:original.character,sampleRate:P.sampleRate}:{initialState:state,sampleRate:P.sampleRate});e=portable.exports;
 if(original.initialization&&portable.initializationFrames!==original.initialization.warmupFrames)throw Error('Native startup reached READY at a different time');
}else if(P.portableHost){portable=await createCycleAudioEngine({program:wasm,rom,initialState:state,sampleRate:P.sampleRate,draw:P.draw});e=portable.exports;}
else{
 const music=createCycleMusic(rom,()=>e);
 const {instance}=await WebAssembly.instantiate(wasm,{wasi_snapshot_preview1:wasi.wasiImport,eggo:{prepare_music:()=>music.prepare()}});wasi.initialize(instance);e=instance.exports;
}
P.romSha256=createHash('sha256').update(rom).digest('hex');P.initialStateSha256=createHash('sha256').update(state).digest('hex');
const tape=await readFile(path.join(original.recording,'inputs.jsonl'),'utf8');P.inputTapeSha256=createHash('sha256').update(tape).digest('hex');
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
if(!portable){
 new Uint8Array(e.memory.buffer,e.eggo_cycle_rom_buffer(),rom.length).set(rom);
 new Uint8Array(e.memory.buffer,e.eggo_cycle_state_buffer(),e.eggo_cycle_state_size()).set(state.subarray(0,e.eggo_cycle_state_size()));
 if(!e.eggo_cycle_init(rom.length,Number(P.draw)))throw Error('Native cycle reference initialization failed');
}
const reference=await open(path.join(P.oracle,'reference.wav'),'r'),ramReference=await open(path.join(P.oracle,'sound-ram.bin'),'r');
const output=await open(path.join(out,'reconstruction.wav'),'w');await output.write(Buffer.alloc(44));
const separated=e.eggo_stem_output?await open(path.join(out,'music.pcm'),'w'):null;
let matched=0,samples=0,firstMismatch=null,firstRamMismatch=null,videoMatched=0,stemSumMismatches=0,musicNonzeroSamples=0;const begin=performance.now(),stride=0x3089-0x2470,ram=Buffer.alloc(stride),pcmHash=createHash('sha256');
try{
 for(const line of tape.trim().split('\n')){
  const f=JSON.parse(line);if(f.frame<=P.initialFrame)continue;if(f.frame>P.end)break;
  const branched=P.branchReference&&f.frame>P.branchParameters.branchAfter;
  const mask=branched?({neutral:0,right:1<<7,jump:1<<4}[P.branchParameters.variant]??f.mask):f.mask;
  let n,result;try{if(portable){result=portable.step(mask);n=result.full.length/2;}else n=e.eggo_cycle_step(mask);}catch(error){throw Error(String(error)+'; AOT missingPC='+e.eggo_aot_missing_pc?.().toString(16));}
  const actual=Buffer.from(result?new Uint8Array(result.full.buffer):new Uint8Array(e.memory.buffer,e.eggo_cycle_pcm_buffer(),n*4)),expected=Buffer.alloc(n*4);pcmHash.update(actual);
  if(separated){
   const musicPCM=Buffer.from(new Uint8Array(e.memory.buffer,e.eggo_stem_output(),n*4));await separated.write(musicPCM);
   for(let i=0;i<n*2;i++){
    const full=actual.readInt16LE(i*2),m=musicPCM.readInt16LE(i*2);
    if(m)musicNonzeroSamples++;
    const musicFloat=result?result.stems[i]:Math.fround(m/32768),effectFloat=result?result.stems[n*2+i]:Math.fround((full-m)/32768);
    if(musicFloat+effectFloat!==full/32768)stemSumMismatches++;
   }
  }
  const read=await reference.read(expected,0,expected.length,44+samples*4);
  if(read.bytesRead!==expected.length)throw Error('Original PCM reference ended');
  if(!branched&&!firstMismatch&&!actual.equals(expected)){
   for(let i=0;i<n*2;i++){const a=actual.readInt16LE(i*2),b=expected.readInt16LE(i*2);if(a!==b){firstMismatch={frame:f.frame,sample:samples+Math.floor(i/2),channel:i%2,actual:a,expected:b};break;}}
  }
  await output.write(actual);samples+=n;
  await ramReference.read(ram,0,stride,(f.frame-P.initialFrame-1)*stride);
  const ownRam=new Uint8Array(e.memory.buffer,e.eggo_cycle_sound_ram(),stride);
  if(!branched&&!firstRamMismatch)for(let i=0;i<stride;i++)if(ownRam[i]!==ram[i]){firstRamMismatch={frame:f.frame,address:0x03002470+i,actual:ownRam[i],expected:ram[i]};break;}
  if(P.draw&&!branched){const video=new Uint8Array(e.memory.buffer,e.eggo_cycle_video_buffer(),240*160*2);if(createHash('sha256').update(video).digest('hex')!==f.video_sha256)throw Error('Cycle reference video mismatch at '+f.frame);videoMatched++;}
  if(firstMismatch||firstRamMismatch)break;matched++;
  if(f.frame%10000===0)console.log(`${f.frame}/${P.end}`);
 }
}finally{await reference.close();await ramReference.close();if(separated)await separated.close();}
const header=Buffer.alloc(44),size=samples*4;header.write('RIFF');header.writeUInt32LE(36+size,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(P.sampleRate,24);header.writeUInt32LE(P.sampleRate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(size,40);await output.write(header,0,44,0);await output.close();
const pcmSha256=pcmHash.digest('hex'),branchMatch=P.branchReference?pcmSha256===P.branchExpected.pcmSha256:null;
const report={matched,samples,firstMismatch,firstRamMismatch,videoMatched,pcmSha256,branchMatch,
 aotInstructions:e.eggo_aot_executed?Number(e.eggo_aot_executed()):null,
 aotLoopInstructions:e.eggo_aot_loop_executed?Number(e.eggo_aot_loop_executed()):null,
 mixerCalls:e.eggo_stem_mixer_calls?.()??null,musicNonzeroSamples,stemSumMismatches,
 milliseconds:performance.now()-begin,wasmMemoryBytes:e.memory.buffer.byteLength};
await writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,...report}));if(firstMismatch||firstRamMismatch||branchMatch===false||stemSumMismatches)process.exitCode=1;
