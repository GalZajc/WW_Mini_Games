// Parameterized original initialization; no recorded buttons after the boundary.
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,nativeRandomStep} from '../renderer/games/eggo-mania/model.js';
import {CHARACTER_ART} from '../renderer/games/eggo-mania/assets/characters.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {WASI} from 'node:wasi';
import {createHash} from 'node:crypto';
import path from 'node:path';
const P={build:'scripts/OUTPUT/eggo-cycle-reference-build_2026-10-26T21-46-04_882735Z',
 bootstrap:'scripts/OUTPUT/eggo-cycle-bootstrap_2026-10-27T01-09-22-895Z',
 rom:'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',startFrame:372,
 cases:[{seed:1492,character:1},...Array.from({length:8},(_,i)=>({seed:i+1,character:i}))],
 maxFrames:120,instructionBudgetPerFrame:2000000,inputMask:0};
const out=path.resolve('scripts/OUTPUT','eggo-ready-contexts_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const wasm=await readFile(path.join(P.build,'cycle-reference.wasm')),rom=await readFile(P.rom),state=await readFile(path.join(P.bootstrap,'before-survival.state'));
P.wasmSha256=createHash('sha256').update(wasm).digest('hex');P.romSha256=createHash('sha256').update(rom).digest('hex');P.initialStateSha256=createHash('sha256').update(state).digest('hex');
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const module=await WebAssembly.compile(wasm),results=[];let failed=false;
for(const c of P.cases){
 const wasi=new WASI({version:'preview1',args:[],env:{},preopens:{}}),instance=await WebAssembly.instantiate(module,{wasi_snapshot_preview1:wasi.wasiImport});wasi.initialize(instance);
 const e=instance.exports;new Uint8Array(e.memory.buffer,e.eggo_cycle_rom_buffer(),rom.length).set(rom);
 new Uint8Array(e.memory.buffer,e.eggo_cycle_state_buffer(),e.eggo_cycle_state_size()).set(state);
 if(!e.eggo_cycle_init(rom.length,0))throw Error('Native initialization failed');
 e.eggo_cycle_write32(0x02011aac,c.seed&0xffff);e.eggo_cycle_write32(0x020003d4,c.character);
 let readyAt=null;for(let i=0;i<P.maxFrames;i++)if(e.eggo_cycle_seek_ready_frame(P.inputMask,P.instructionBudgetPerFrame)){readyAt=P.startFrame+i;break;}
 if(readyAt===null)throw Error('READY not reached for '+JSON.stringify(c));
 e.eggo_cycle_save();const initialized=new Uint8Array(e.memory.buffer,e.eggo_cycle_state_buffer(),e.eggo_cycle_state_size()).slice();
 const name=`seed-${c.seed}-character-${c.character}.state`;await writeFile(path.join(out,name),initialized);
 const character=Object.keys(CHARACTER_ART).find(k=>CHARACTER_ART[k].id===c.character),g=new Game();g.seed=c.seed;g.p=settings({character,seed:c.seed});g.resetSurvival();
 const result={...c,characterName:character,state:name,readyAt,stageId:e.eggo_cycle_read32(0x02003294),expectedStageId:nativeRandomStep(c.seed)%8,
  nativeGlobalSeed:e.eggo_cycle_read32(0x02011aac),modelGlobalSeed:g.nativeActorRandomSeed,
  stateSha256:createHash('sha256').update(initialized).digest('hex')};
 result.stageMatches=result.stageId===result.expectedStageId;result.globalSeedMatches=result.nativeGlobalSeed===result.modelGlobalSeed;
 failed||=!result.stageMatches||!result.globalSeedMatches;results.push(result);console.log(`${results.length}/${P.cases.length}: ${character}, seed${c.seed}, stage${result.stageId}, RNGmatch=${result.globalSeedMatches}`);
}
await writeFile(path.join(out,'contexts.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({out,cases:results.length,failed}));if(failed)process.exitCode=1;
