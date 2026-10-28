// Offline hardware-only PCM. No audio device is opened.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const oracle=arg('oracle'),build=arg('build');
if(!oracle||!build)throw Error('Required --oracle= folder and --build= folder');
const p=JSON.parse(await readFile(path.join(oracle,'parameters.json'),'utf8'));
const wasm=await readFile(path.join(build,'audio-hardware.wasm'));
const {instance}=await WebAssembly.instantiate(wasm,{wasi_snapshot_preview1:{fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8}});
const e=instance.exports;e._initialize();e.eggo_audio_init(p.sample_rate);
const state=await readFile(path.join(oracle,'initial.state'));
new Uint8Array(e.memory.buffer,e.eggo_audio_state_buffer(),e.eggo_audio_state_size()).set(state.subarray(0,e.eggo_audio_state_size()));
e.eggo_audio_restore();
const chunks=[];let samples=0;
const begin=performance.now();
for(let i=0;i<p.frames;i++){
 e.eggo_audio_advance(p.frame_cycles);
 const count=e.eggo_audio_read(32768);
 chunks.push(Buffer.from(new Uint8Array(e.memory.buffer,e.eggo_audio_output(),count*4)));samples+=count;
}
const data=Buffer.concat(chunks),header=Buffer.alloc(44);
header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(p.sample_rate,24);header.writeUInt32LE(p.sample_rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
const out=path.resolve('scripts/OUTPUT','eggo-audio-hardware-pcm_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});await writeFile(path.join(out,'reconstruction.wav'),Buffer.concat([header,data]));
const params={oracle:path.resolve(oracle),build:path.resolve(build),sourceParameters:p,wasm_sha256:createHash('sha256').update(wasm).digest('hex')};
await writeFile(path.join(out,'parameters.json'),JSON.stringify(params,null,2));
console.log(JSON.stringify({out,samples,milliseconds:performance.now()-begin}));
