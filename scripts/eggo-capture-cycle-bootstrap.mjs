// Find the original Survival initialization boundary for configurable seeds.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {WASI} from 'node:wasi';
import {createHash} from 'node:crypto';
import path from 'node:path';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const P={build:arg('build','scripts/OUTPUT/eggo-cycle-reference-build_2026-10-26T21-46-04_882735Z'),
 recording:'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398',
 rom:'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',restoreAfter:300,end:400,
 target:0x080016b4,rngAddress:0x02011aac,characterAddress:0x020003d4,instructionBudgetPerFrame:2000000};
const out=path.resolve('scripts/OUTPUT','eggo-cycle-bootstrap_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const wasm=await readFile(path.join(P.build,'cycle-reference.wasm')),rom=await readFile(P.rom),
 state=await readFile(path.join(P.recording,`after-frame-${String(P.restoreAfter).padStart(8,'0')}.state`)),tape=await readFile(path.join(P.recording,'inputs.jsonl'),'utf8');
P.wasmSha256=createHash('sha256').update(wasm).digest('hex');P.originalStateSha256=createHash('sha256').update(state).digest('hex');P.romSha256=createHash('sha256').update(rom).digest('hex');
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const wasi=new WASI({version:'preview1',args:[],env:{},preopens:{}}),{instance}=await WebAssembly.instantiate(wasm,{wasi_snapshot_preview1:wasi.wasiImport});wasi.initialize(instance);
const e=instance.exports;new Uint8Array(e.memory.buffer,e.eggo_cycle_rom_buffer(),rom.length).set(rom);
new Uint8Array(e.memory.buffer,e.eggo_cycle_state_buffer(),e.eggo_cycle_state_size()).set(state.subarray(0,e.eggo_cycle_state_size()));
if(!e.eggo_cycle_init(rom.length,0))throw Error('Bootstrap reference init failed');
let reached=null;
for(const line of tape.trim().split('\n')){
 const f=JSON.parse(line);if(f.frame<=P.restoreAfter)continue;if(f.frame>P.end)break;
 if(e.eggo_cycle_seek_frame(f.mask,P.target,P.instructionBudgetPerFrame)){
  reached={frame:f.frame,pc:e.eggo_cycle_pc(),seed:e.eggo_cycle_read32(P.rngAddress),character:e.eggo_cycle_read32(P.characterAddress),mask:f.mask};
  e.eggo_cycle_save();const bytes=new Uint8Array(e.memory.buffer,e.eggo_cycle_state_buffer(),e.eggo_cycle_state_size()).slice();
  await writeFile(path.join(out,'before-survival.state'),bytes);reached.stateSha256=createHash('sha256').update(bytes).digest('hex');break;
 }
}
await writeFile(path.join(out,'result.json'),JSON.stringify({reached},null,2));console.log(JSON.stringify({out,reached}));if(!reached)process.exitCode=1;
