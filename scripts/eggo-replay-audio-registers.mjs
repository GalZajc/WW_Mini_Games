// Test original hardware against transparent native I/O times, without speakers.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const trace=arg('trace'),build=arg('build');
const manual=process.argv.includes('--manual');
if(!trace||!build)throw Error('Required --trace= and --build= folders');
const p=JSON.parse(await readFile(path.join(trace,'parameters.json'),'utf8'));
const wasm=await readFile(path.join(build,'audio-hardware.wasm'));
const {instance}=await WebAssembly.instantiate(wasm,{wasi_snapshot_preview1:{fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8}});
const e=instance.exports;e._initialize();e.eggo_audio_init(p.sample_rate);
const state=await readFile(path.join(p.oracle,'initial.state'));
new Uint8Array(e.memory.buffer,e.eggo_audio_state_buffer(),e.eggo_audio_state_size()).set(state.subarray(0,e.eggo_audio_state_size()));
e.eggo_audio_restore(0);e.eggo_audio_trace_mode();
if(manual)e.eggo_audio_manual_mode();
const chunks=[];let samples=0,frames=0,writes=0,firstMixMismatch=null;const begin=performance.now();
function advanceTo(time){const delta=(time-(e.eggo_audio_clock()>>>0))>>>0;if(delta>1000000)throw Error('Non-monotonic register clock '+delta);e.eggo_audio_advance(delta);}
for(const line of (await readFile(path.join(trace,'registers.jsonl'),'utf8')).trim().split('\n')){
 const f=JSON.parse(line);
 if(f.sample_lateness){new Uint32Array(e.memory.buffer,e.eggo_audio_lateness_buffer(),f.sample_lateness.length).set(f.sample_lateness);e.eggo_audio_set_lateness(f.sample_lateness.length);}
 for(const w of f.writes){
  advanceTo(w.time);
  if(w.size)e.eggo_audio_write(w.address,w.value,w.size);
  else if(manual){if(w.address===0x200)e.eggo_audio_manual_sample(f.sample_lateness[w.value]);else e.eggo_audio_manual_fifo(w.address-0x100,w.value);}
  writes++;
 }
 advanceTo(f.end_clock);frames++;
 if(f.sample_mix&&!firstMixMismatch){const actual=new Uint32Array(e.memory.buffer,e.eggo_audio_mix_buffer(),e.eggo_audio_mix_count()),pcm=new Uint32Array(e.memory.buffer,e.eggo_audio_pcm_debug_buffer(),e.eggo_audio_mix_count());for(let i=0;i<Math.max(actual.length,f.sample_mix.length);i++)if(actual[i]!==f.sample_mix[i]){firstMixMismatch={frame:f.frame,index:i,actual:actual[i],expected:f.sample_mix[i],pcmActual:pcm[i],pcmExpected:f.sample_pcm?.[i],counts:[actual.length,f.sample_mix.length]};break;}}
 const count=e.eggo_audio_read(32768);
 chunks.push(Buffer.from(new Uint8Array(e.memory.buffer,e.eggo_audio_output(),count*4)));samples+=count;
}
const data=Buffer.concat(chunks),header=Buffer.alloc(44);
header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(p.sample_rate,24);header.writeUInt32LE(p.sample_rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
const out=path.resolve('scripts/OUTPUT','eggo-audio-register-replay_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});await writeFile(path.join(out,'reconstruction.wav'),Buffer.concat([header,data]));
await writeFile(path.join(out,'parameters.json'),JSON.stringify({trace:path.resolve(trace),build:path.resolve(build),manual,sourceParameters:p,wasm_sha256:createHash('sha256').update(wasm).digest('hex')},null,2));
await writeFile(path.join(out,'mix-comparison.json'),JSON.stringify({firstMixMismatch},null,2));
console.log(JSON.stringify({out,samples,frames,writes,firstMixMismatch,milliseconds:performance.now()-begin}));
