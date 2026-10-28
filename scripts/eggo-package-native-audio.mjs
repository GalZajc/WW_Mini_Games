// Package ONLY native sound resources and audio hardware; never a game ROM/state.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const P={asset:'scripts/OUTPUT/eggo-sound-driver-extract_2026-10-26T19-33-58-670Z',
 oracle:'scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z',
 build:process.argv.find(x=>x.startsWith('--build='))?.slice(8)??'scripts/OUTPUT/eggo-audio-hardware-build_2026-10-26T21-07-43_398070Z',
 output:'renderer/games/eggo-mania/assets/native-audio',initialFrame:400};
const out=path.resolve(P.output);await mkdir(out,{recursive:true});
const wasm=await readFile(path.join(P.build,'audio-hardware.wasm'));
const {instance}=await WebAssembly.instantiate(wasm,{wasi_snapshot_preview1:{fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8}});
const e=instance.exports;e._initialize();e.eggo_audio_init(32768);
const state=await readFile(path.join(P.oracle,'initial.state'));
new Uint8Array(e.memory.buffer,e.eggo_audio_state_buffer(),e.eggo_audio_state_size()).set(state.subarray(0,e.eggo_audio_state_size()));
const size=e.eggo_audio_bootstrap(0);
await writeFile(path.join(out,'hardware-initial.bin'),new Uint8Array(e.memory.buffer,e.eggo_audio_bootstrap_buffer(),size));
const ram=await readFile(path.join(P.oracle,'initial-iwram.bin'));
await writeFile(path.join(out,'driver-initial.bin'),ram.subarray(0x2470,0x3089));
const io=await readFile(path.join(P.oracle,'initial-io.bin'));
await writeFile(path.join(out,'driver-io.bin'),io.subarray(0x60,0x110));
for(const [source,name] of [[path.join(P.asset,'sound-driver.bin'),'sound-driver.bin'],[path.join(P.asset,'manifest.json'),'manifest.json'],[path.join(P.build,'audio-hardware.wasm'),'audio-hardware.wasm']])await copyFile(source,path.join(out,name));
const hashes={};for(const name of ['hardware-initial.bin','driver-initial.bin','driver-io.bin','sound-driver.bin','manifest.json','audio-hardware.wasm'])hashes[name]=createHash('sha256').update(await readFile(path.join(out,name))).digest('hex');
const version=createHash('sha256').update(Object.values(hashes).join('')).digest('hex').slice(0,16);
await writeFile(path.join(out,'version.js'),`export const NATIVE_AUDIO_ASSET_VERSION='${version}';\n`);
await writeFile(path.join(out,'provenance.json'),JSON.stringify({...P,sha256:hashes,bootstrapBytes:size,containsFullRom:false,containsGameState:false},null,2));
console.log(JSON.stringify({out,bootstrapBytes:size,files:Object.keys(hashes)}));
