// Portable integration prototype. Explicit program/data/common initial state,
// then ONLY raw held GBA buttons. No recording, fitted timing, or host clock.
// Not selected by the production audio worker until the integration audit.
import {createCycleMusic} from './native-program-music.js';
export const CYCLE_AUDIO=Object.freeze({rate:32768,minRate:8000,maxRate:192000,
 readyBudget:2000000,maxReadyFrames:120,seedAddress:0x02011aac,
 characterAddress:0x020003d4,pcmCapacity:4096});
export async function createCycleAudioEngine({program,rom,initialState,sampleRate=CYCLE_AUDIO.rate,draw=false,expectedROMHash=null}){
 if(!Number.isFinite(sampleRate)||sampleRate<CYCLE_AUDIO.minRate||sampleRate>CYCLE_AUDIO.maxRate)throw Error('Unsupported native output sample rate');
 let e;const music=createCycleMusic(rom,()=>e);
 const word=(at,value)=>new DataView(e.memory.buffer).setUint32(at,value,true);
 const wasi={
  environ_get:()=>0,environ_sizes_get:(count,size)=>{word(count,0);word(size,0);return 0;},
  clock_time_get:(_clock,_precision,at)=>{new DataView(e.memory.buffer).setBigUint64(at,0n,true);return 0;},
  fd_close:()=>8,fd_fdstat_get:()=>8,fd_prestat_get:()=>8,fd_prestat_dir_name:()=>8,fd_seek:()=>8,fd_write:()=>8,
  proc_exit:code=>{throw Error('Native program terminated: '+code);},
 };
 const made=await WebAssembly.instantiate(program,{wasi_snapshot_preview1:wasi,eggo:{prepare_music:()=>music.prepare()}});
 const instance=made instanceof WebAssembly.Instance?made:made.instance;
 e=instance.exports;e._initialize();
 if(initialState.length<e.eggo_cycle_state_size())throw Error('Incomplete common native initial state');
 if(!e.eggo_cycle_sample_rate(sampleRate))throw Error('Native output rate rejected');
 new Uint8Array(e.memory.buffer,e.eggo_cycle_rom_buffer(),rom.length).set(rom);
 if(e.eggo_program_restore_code){
  e.eggo_program_restore_code();
  // The music shadow needs the same instruction/literal bytes as the compiled
  // program's bus. No further native state or recorded events are supplied.
  rom.set(new Uint8Array(e.memory.buffer,e.eggo_cycle_rom_buffer(),rom.length));
 }
 if(expectedROMHash){
  const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rom)),v=>v.toString(16).padStart(2,'0')).join('');
  if(actual!==expectedROMHash)throw Error('Compiled native program and extracted resources do not match');
 }
 new Uint8Array(e.memory.buffer,e.eggo_cycle_state_buffer(),e.eggo_cycle_state_size())
  .set(initialState.subarray(0,e.eggo_cycle_state_size()));
 if(!e.eggo_cycle_init(rom.length,Number(draw)))throw Error('Native program initialization failed');
 if(!e.eggo_stem_output)throw Error('Native audio program must support separate music/effects volumes');
 return {exports:e,sampleRate,frames:0,
  // Use only with the explicit pre-Survival constructor boundary. Replaying
  // an already initialized state does not mutate its seed, character or clock.
  prepareSurvival(seed,character){
   if(this.frames||this.prepared)throw Error('Create a new engine to start another Survival session');
   if(!Number.isInteger(seed)||!Number.isInteger(character)||character<0||character>7)throw Error('Invalid native Survival seed/character');
   this.prepared=true;
   e.eggo_cycle_write32(CYCLE_AUDIO.seedAddress,seed&0xffff);
   e.eggo_cycle_write32(CYCLE_AUDIO.characterAddress,character);
   for(let frame=0;frame<CYCLE_AUDIO.maxReadyFrames;frame++)
    if(e.eggo_cycle_seek_ready_frame(0,CYCLE_AUDIO.readyBudget))return frame+1;
   throw Error('Native Survival initialization did not reach READY');
  },
  step(mask){
   if(!Number.isInteger(mask)||mask<0||mask>0xffff)throw Error('Expected raw held native buttons');
   const n=e.eggo_cycle_step(mask);
   if(n>CYCLE_AUDIO.pcmCapacity)throw Error('Native PCM frame exceeds output capacity');
   const full=new Int16Array(e.memory.buffer,e.eggo_cycle_pcm_buffer(),n*2).slice();
   const m=new Int16Array(e.memory.buffer,e.eggo_stem_output(),n*2),stems=new Float32Array(n*4);
   for(let i=0;i<n*2;i++){stems[i]=m[i]/32768;stems[n*2+i]=(full[i]-m[i])/32768;}
   this.frames++;return {full,stems};
  },
 };
}
