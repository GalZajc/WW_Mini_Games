// Generate native READY states from parameters, not recorded timing schedules.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {WASI} from 'node:wasi';
import {createHash} from 'node:crypto';
import path from 'node:path';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const P={build:arg('build','scripts/OUTPUT/eggo-cycle-reference-build_2026-10-26T21-46-04_882735Z'),
 bootstrap:'scripts/OUTPUT/eggo-cycle-bootstrap_2026-10-27T01-09-22-895Z',
 sourceReady:'scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z',
 sourceRecording:'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398',
 rom:'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
 seed:Number(arg('seed',1492)),character:Number(arg('character',1)),replayPrelude:arg('replay-prelude','false')==='true',
 startFrame:372,instructionBudgetPerFrame:2000000,maxFrames:120,quietInputMask:0};
const out=path.resolve('scripts/OUTPUT','eggo-ready-bootstrap_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const wasm=await readFile(path.join(P.build,'cycle-reference.wasm')),rom=await readFile(P.rom),state=await readFile(path.join(P.bootstrap,'before-survival.state'));
P.wasmSha256=createHash('sha256').update(wasm).digest('hex');P.romSha256=createHash('sha256').update(rom).digest('hex');P.stateSha256=createHash('sha256').update(state).digest('hex');
const controls=P.replayPrelude?new Map((await readFile(path.join(P.sourceRecording,'inputs.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).map(f=>[f.frame,f.mask])):null;
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const wasi=new WASI({version:'preview1',args:[],env:{},preopens:{}}),{instance}=await WebAssembly.instantiate(wasm,{wasi_snapshot_preview1:wasi.wasiImport});wasi.initialize(instance);
const e=instance.exports;new Uint8Array(e.memory.buffer,e.eggo_cycle_rom_buffer(),rom.length).set(rom);
new Uint8Array(e.memory.buffer,e.eggo_cycle_state_buffer(),e.eggo_cycle_state_size()).set(state.subarray(0,e.eggo_cycle_state_size()));
if(!e.eggo_cycle_init(rom.length,0))throw Error('READY reference initialization failed');
e.eggo_cycle_write32(0x02011aac,P.seed&0xffff);e.eggo_cycle_write32(0x020003d4,P.character&7);
let readyAt=null;
for(let i=0;i<P.maxFrames;i++)if(e.eggo_cycle_seek_ready_frame(controls?.get(P.startFrame+i)??P.quietInputMask,P.instructionBudgetPerFrame)){readyAt=P.startFrame+i;break;}
if(readyAt===null)throw Error('Native initialization did not reach READY');
e.eggo_cycle_save();const initialized=new Uint8Array(e.memory.buffer,e.eggo_cycle_state_buffer(),e.eggo_cycle_state_size()).slice();await writeFile(path.join(out,'ready.state'),initialized);
const sound=new Uint8Array(e.memory.buffer,e.eggo_cycle_sound_ram(),0x3089-0x2470).slice();await writeFile(path.join(out,'ready-sound.bin'),sound);
let firstSoundDifference=null;
if(P.replayPrelude){const expected=await readFile(path.join(P.sourceReady,'initial-iwram.bin'));for(let i=0;i<sound.length;i++)if(sound[i]!==expected[0x2470+i]){firstSoundDifference={address:0x03002470+i,actual:sound[i],expected:expected[0x2470+i]};break;}}
const report={readyAt,stageId:e.eggo_cycle_read32(0x02003294),seed:P.seed,character:P.character,firstSoundDifference,
 readyStateSha256:createHash('sha256').update(initialized).digest('hex'),soundSha256:createHash('sha256').update(sound).digest('hex')};
await writeFile(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,...report}));if(firstSoundDifference)process.exitCode=1;
