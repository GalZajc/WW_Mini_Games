// Offline native sequencer + original mGBA audio-only hardware. No speaker output.
import {NativeSoundVM} from '../renderer/games/eggo-mania/native-sound-vm.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const arg=k=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3);
const oracle=arg('oracle'),build=arg('build'),musicPath=arg('music');
if(!oracle||!build||!musicPath)throw Error('Required --oracle=, --build= and --music= folders');
const p=JSON.parse(await readFile(path.join(oracle,'parameters.json'),'utf8'));
const wasm=await readFile(path.join(build,'audio-hardware.wasm'));
const {instance}=await WebAssembly.instantiate(wasm,{wasi_snapshot_preview1:{fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8}});
const e=instance.exports;e._initialize();e.eggo_audio_init(p.sample_rate);
const state=await readFile(path.join(oracle,'initial.state'));
new Uint8Array(e.memory.buffer,e.eggo_audio_state_buffer(),e.eggo_audio_state_size()).set(state.subarray(0,e.eggo_audio_state_size()));
e.eggo_audio_restore(0);
const vm=new NativeSoundVM(await readFile(p.rom),{onIOWrite:(address,size,value)=>e.eggo_audio_write(address,value,size)});
for(const name of ['iwram','ewram','io'])vm[name].set(await readFile(path.join(oracle,'initial-'+name+'.bin')));
const events=new Map((await readFile(p.sound_events,'utf8')).trim().split('\n').map(x=>JSON.parse(x)).map(x=>[x.frame,x.ids]));
const music=new Map((await readFile(path.join(musicPath,'events.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x)).map(x=>[x.frame,x.ids]));
const chunks=[];let samples=0;const begin=performance.now();
for(let f=p.start_after+1;f<=p.end;f++){
 vm.call(0x0801f448);
 for(const id of music.get(f)??[])vm.call(0x0802053c,[id]);
 for(const id of events.get(f)??[])vm.call(0x08020898,[id]);
 vm.call(0x0801f480);
 new Uint8Array(e.memory.buffer,e.eggo_audio_ram_buffer(),vm.iwram.length).set(vm.iwram);
 e.eggo_audio_advance(280896);
 const count=e.eggo_audio_read(32768);
 chunks.push(Buffer.from(new Uint8Array(e.memory.buffer,e.eggo_audio_output(),count*4)));samples+=count;
 if(f%500===0)console.log(f+'/'+p.end);
}
const data=Buffer.concat(chunks),header=Buffer.alloc(44);
header.write('RIFF');header.writeUInt32LE(36+data.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(p.sample_rate,24);header.writeUInt32LE(p.sample_rate*4,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);
const out=path.resolve('scripts/OUTPUT','eggo-game-sound-pcm_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});await writeFile(path.join(out,'reconstruction.wav'),Buffer.concat([header,data]));
const params={oracle:path.resolve(oracle),build:path.resolve(build),music:path.resolve(musicPath),sourceParameters:p,wasm_sha256:createHash('sha256').update(wasm).digest('hex'),frame_cycles:280896,limits:'Driver I/O is applied at the frame boundary; intra-frame CPU register-write times are not yet reconstructed.'};
await writeFile(path.join(out,'parameters.json'),JSON.stringify(params,null,2));
console.log(JSON.stringify({out,samples,milliseconds:performance.now()-begin}));
