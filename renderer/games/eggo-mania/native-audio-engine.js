// Deterministic native sequencer and GBA sound hardware. No DOM, timers,
// wall clock, random numbers, recorded events or game/emulator implementation.
import {NativeSoundVM} from './native-sound-vm.js';
import {NATIVE_SOUND_EVENTS} from './native-sound-events.js';
export const NATIVE_AUDIO_ENGINE=Object.freeze({cpuHz:16777216,frameCycles:280896,
 nativeFPS:16777216/280896,gameFPS:60,sampleRate:32768,soundStart:0x2470,soundEnd:0x3089,
 entries:Object.freeze({init:0x0802070c,song:0x0802053c,effect:0x08020898,
 tempo:0x0801f2cc,tick:0x0801f480,vblank:0x0801f448})});
export async function createNativeAudioEngine(load,{sampleRate=NATIVE_AUDIO_ENGINE.sampleRate,stems=false}={}){
 const names=['manifest.json','sound-driver.bin','driver-initial.bin','driver-io.bin','hardware-initial.bin','audio-hardware.wasm'];
 const [manifestBytes,data,initial,io,bootstrap,wasm]=await Promise.all(names.map(load));
 const manifest=JSON.parse(new TextDecoder().decode(manifestBytes)),rom=new Uint8Array(manifest.romSize),allowed=new Uint8Array(manifest.romSize);
 for(const b of manifest.blocks){rom.set(data.subarray(b.assetOffset,b.assetOffset+b.length),b.offset);allowed.fill(1,b.offset,b.offset+b.length);}
 async function hardware(){
  const {instance}=await WebAssembly.instantiate(wasm,{wasi_snapshot_preview1:{fd_close:()=>8,fd_seek:()=>8,fd_write:()=>8}});
  const h=instance.exports;h._initialize();h.eggo_audio_init(sampleRate);
  new Uint8Array(h.memory.buffer,h.eggo_audio_bootstrap_buffer(),bootstrap.length).set(bootstrap);h.eggo_audio_bootstrap(1);return h;
 }
 const h=await hardware(),musicHardware=stems?await hardware():null;
 const pcmEffects=new Uint8Array(4),psgEffects=new Uint8Array(4);
 const isEffect=voice=>{const track=vm.u32(0x03002470+voice*4);return track===0x03002624||track===0x03002634;};
 const triggerRegisters=[0x64,0x6c,0x74,0x7c];
 const vm=new NativeSoundVM(rom,{onROMRead:i=>{if(!allowed[i])throw Error('Missing native sound resource at 0x'+i.toString(16));},
  onIOWrite:(address,size,value)=>{
   h.eggo_audio_write(address,value,size);
   if(!musicHardware)return;
   const a=address&0x3ff,voice=triggerRegisters.indexOf(a);
   if(voice>=0&&(value&0x8000))psgEffects[voice]=Number(isEffect(voice));
   musicHardware.eggo_audio_write(address,value,size);
   musicHardware.eggo_audio_mute_psg(psgEffects.reduce((mask,on,i)=>mask|(on<<i),0));
  },
  onRAMWrite:stems?(address,size)=>{
   // A PCM note starts when the decoder writes its end pointer. Ownership
   // persists through the sample tail after its dispatch slot is released.
   const i=(address-0x030025f8)/12;if(size===4&&Number.isInteger(i)&&i>=0&&i<4)pcmEffects[i]=Number(isEffect(8+i));
  }:null});
 vm.iwram.set(initial,NATIVE_AUDIO_ENGINE.soundStart);vm.io.set(io,0x60);
 for(let i=0;i<4;i++){pcmEffects[i]=Number(isEffect(8+i));psgEffects[i]=Number(isEffect(i));}
 const musicVM=stems?new NativeSoundVM(rom):null;
 // Music uses the ACTUAL shared voices, including voices stolen by effects.
 // It never runs a hypothetical uninterrupted song. Its separate feedback
 // history excludes the effects' native PCM echo from the music volume path.
 const ringStart=0x264c,ringEnd=0x2f0c,musicRing=new Uint8Array(ringEnd-ringStart);
 // The common bootstrap has music0 and the READY effect, including its
 // already generated FIFO/echo history. None belongs to the music stem.
 if(musicHardware)musicHardware.eggo_audio_clear_pcm();
 const entries=NATIVE_AUDIO_ENGINE.entries;let firstPrime=true;
 const dispatch=({reset=false,music=[],effects=[],tempo=[]})=>{
  if(reset){pcmEffects.fill(0);psgEffects.fill(0);vm.call(entries.init);musicRing.fill(0);}
  for(const id of music)vm.call(entries.song,[id]);
  for(const id of effects)vm.call(entries.effect,[id]);
  for(const value of tempo)vm.call(entries.tempo,[value]);
 };
 return {vm,hardware:h,frames:0,
  prime(commands){
   // The sound-only common initial state is ALREADY after init/song0/READY
   // and its first tick. Reapplying that startup would reset active FIFOs
   // a second time. This consumes only the matching initialization, never
   // skips a subsequent tick/event or substitutes recorded game audio.
   const initialized=firstPrime&&commands.reset&&commands.tick!==false&&
    commands.music?.every(id=>id===0)&&commands.effects?.length===1&&commands.effects[0]===NATIVE_SOUND_EVENTS.ready&&!commands.tempo?.length;
   firstPrime=false;if(initialized)return;
   dispatch(commands);if(commands.tick!==false)vm.call(entries.tick);
  },
  step({reset=false,music=[],effects=[],tempo=[],tick=true}={}){
   vm.call(entries.vblank);
   dispatch({reset,music,effects,tempo});
   if(tick){
    if(musicVM){
     musicVM.iwram.set(vm.iwram);musicVM.io.set(vm.io);musicVM.iwram.set(musicRing,ringStart);
     for(let i=0;i<4;i++)if(pcmEffects[i]){
      const at=0x030025f4+i*12;musicVM.store(at,musicVM.u32(at+4),4);musicVM.store(at+8,0,4);
     }
     musicVM.call(entries.tick);musicRing.set(musicVM.iwram.subarray(ringStart,ringEnd));
    }
    vm.call(entries.tick);
   }
   new Uint8Array(h.memory.buffer,h.eggo_audio_ram_buffer(),vm.iwram.length).set(vm.iwram);
   h.eggo_audio_advance(NATIVE_AUDIO_ENGINE.frameCycles);
   const count=h.eggo_audio_read(32768);this.frames++;
   const full=new Int16Array(h.memory.buffer,h.eggo_audio_output(),count*2).slice();
   if(!musicHardware)return full;
   const musicRAM=new Uint8Array(musicHardware.memory.buffer,musicHardware.eggo_audio_ram_buffer(),vm.iwram.length);
   musicRAM.set(vm.iwram);musicRAM.set(musicRing,ringStart);
   musicHardware.eggo_audio_advance(NATIVE_AUDIO_ENGINE.frameCycles);
   const musicCount=musicHardware.eggo_audio_read(32768);
   if(musicCount!==count)throw Error('Native music/effect clocks diverged');
   const musicPCM=new Int16Array(musicHardware.memory.buffer,musicHardware.eggo_audio_output(),count*2);
   const separated=new Float32Array(count*4);
   for(let i=0;i<count*2;i++){separated[i]=musicPCM[i]/32768;separated[count*2+i]=(full[i]-musicPCM[i])/32768;}
   return {full,stems:separated};
  },
 };
}
