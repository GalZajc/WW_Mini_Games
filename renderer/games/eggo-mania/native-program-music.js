// Shared-voice music mixer for the cycle-accurate integration prototype.
// Runs only at the real native mixer entry. The C host publishes its bytes
// one native store at a time, so concurrent FIFO DMA sees the correct history.
import {NativeSoundVM} from './native-sound-vm.js';
export const CYCLE_MUSIC=Object.freeze({ringStart:0x264c,ringEnd:0x2f0c,
 tick:0x0801f480,iwramBytes:0x8000,ioBytes:0x400,
 pcmEnd:Object.freeze([0x25c0,0x25d4,0x25e0,0x25ec,0x25f8,0x2604,0x2610,0x261c])});
export function createCycleMusic(rom,getExports){
 const vm=new NativeSoundVM(rom),C=CYCLE_MUSIC;
 return {vm,prepare(){
  const e=getExports(),memory=e.memory.buffer;
  vm.iwram.set(new Uint8Array(memory,e.eggo_stem_iwram(),C.iwramBytes));
  vm.io.set(new Uint8Array(memory,e.eggo_stem_io(),C.ioBytes));
  vm.iwram.set(new Uint8Array(memory,e.eggo_stem_music_ring(),C.ringEnd-C.ringStart),C.ringStart);
  const owners=new Uint8Array(memory,e.eggo_stem_pcm_owners(),8);
  for(let i=0;i<8;i++)if(owners[i]){
   const end=0x03000000+C.pcmEnd[i];
   if(i<2)vm.store(end-8,0,4); // Resampled voice: zero frequency/active step.
   else{vm.store(end-4,vm.u32(end),4);if(i>=4)vm.store(end+4,0,4);}
  }
  vm.call(C.tick);
  new Uint8Array(memory,e.eggo_stem_prepared_ring(),C.ringEnd-C.ringStart)
   .set(vm.iwram.subarray(C.ringStart,C.ringEnd));
 }};
}
