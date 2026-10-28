// Production uses the native shared-channel engine in a worker. The measured
// WAV implementation below remains available to legacy diagnostic harnesses.
import {NATIVE_MUSIC} from './assets/native-music.js';
import {NATIVE_RESULT_AUDIO} from './assets/native-result-audio.js';
import {NATIVE_SFX} from './assets/native-sfx.js';
import {NATIVE_MUSIC_IDS} from './native-sound-events.js';
export const MUSIC_VOLUME=1;
export const NATIVE_AUDIO=Object.freeze({framesPerSecond:60,slots:2,volume:1});
const EFFECT_PLAYERS=new WeakMap();

// Original 08020898..2096e: preserve the two shared SFX slots and compare
// priority only on a replacement. A second empty slot accepts another voice.
export class NativeEffectSlots {
 constructor(){this.frame=0;this.slots=Array.from({length:NATIVE_AUDIO.slots},()=>({voice:0,priority:0,until:0}));}
 advance(frames){this.frame+=Math.max(0,frames);for(const s of this.slots)if(s.voice&&this.frame>=s.until){s.voice=0;s.priority=0;}}
 admit(effect){
  this.advance(0);const [first,second]=this.slots;let selected=null;
  if(effect.voice!==second.voice){
   if(effect.voice!==first.voice&&first.voice===0)selected=first;
   else if(effect.voice!==first.voice&&second.voice===0)selected=second;
   else if(first.priority<=effect.priority)selected=first;
  }
  if(!selected){
   if(effect.voice===first.voice)return null;
   if(second.voice===0||second.priority<=effect.priority)selected=second;
  }
  if(!selected)return null;
  const result={slot:this.slots.indexOf(selected),previousVoice:selected.voice};
  Object.assign(selected,{voice:effect.voice,priority:effect.priority,until:this.frame+effect.busy_frames});
  return result;
 }
}
function effectPlayer(audio){
 let player=EFFECT_PLAYERS.get(audio);
 if(!player){player={slots:new NativeEffectSlots(),voices:new Map(),generation:0};EFFECT_PLAYERS.set(audio,player);}
 return player;
}
export function advanceNativeAudio(audio,dt){
 if(audio?._eggoNative){audio._eggoNative.begin();return;}
 if(audio)effectPlayer(audio).slots.advance(dt*NATIVE_AUDIO.framesPerSecond);
}
export function resetNativeAudio(audio){
 if(audio?._eggoNative){audio._eggoNative.reset();return;}
 const player=audio&&EFFECT_PLAYERS.get(audio);if(!player)return;
 player.generation++;for(const voice of player.voices.values()){try{voice.stop();}catch{}}
 player.voices.clear();player.slots=new NativeEffectSlots();
}
export function playNativeEffect(audio,nativeId){
 audio?._nativeEffectRequest?.(nativeId);
 if(audio?._eggoNative){audio._eggoNative.effect(nativeId);return true;}
 const effect=NATIVE_SFX[nativeId];if(!audio||!effect)return false;
 const player=effectPlayer(audio),admitted=player.slots.admit(effect);if(!admitted)return false;
 const id='eggo-mania-native-sfx-'+nativeId;
 const play=()=>{
  const buffer=audio._soundBuffers?.get(id);
  if(!buffer||!audio._ensureCtx)return audio.playSound?.(id,{volume:NATIVE_AUDIO.volume})??false;
  const ctx=audio._ensureCtx(),source=ctx.createBufferSource(),gain=ctx.createGain();
  // A new stream for the same native sample voice replaces its preceding
  // tail. Do not stop admitted.previousVoice when it is DIFFERENT: 208c8
  // restores its track-table pointer without issuing a PCM note-off. The two
  // dispatch slots are not a two-source mixer limit: the native jump releases
  // its slot after 4 ticks while its sample tail lasts roughly 26 ticks.
  const previous=player.voices.get(effect.voice);if(previous){try{previous.stop();}catch{}}
  source.buffer=buffer;gain.gain.value=NATIVE_AUDIO.volume;source.connect(gain);gain.connect(audio._channels.effects);
  player.voices.set(effect.voice,source);
  source.onended=()=>{if(player.voices.get(effect.voice)===source)player.voices.delete(effect.voice);source.disconnect();gain.disconnect();};
  source.start(ctx.currentTime);return true;
 };
 if(audio._soundBuffers?.has(id))return play();
 const generation=player.generation;
 audio.loadSound?.(id,new URL('./assets/'+effect.file,import.meta.url).href).then(()=>{if(player.generation===generation)play();}).catch(()=>{});
 return true;
}
export const SOUND=Object.freeze({jump:Object.freeze({
 id:'eggo-mania-jump',url:new URL('./assets/jump.wav',import.meta.url).href,volume:1,
})});
export function loadAudio(audio){
 if(audio?._eggoNative)return;
 if(!audio?.loadSound)return;
 for(const sound of Object.values(SOUND))audio.loadSound(sound.id,sound.url).catch(()=>{});
 for(const [nativeId,effect] of Object.entries(NATIVE_SFX))audio.loadSound('eggo-mania-native-sfx-'+nativeId,new URL('./assets/'+effect.file,import.meta.url).href).catch(()=>{});
}
export function playTowerAudio(audio,tower){
 const events=tower.nativeAudioEvents?.splice(0)??[];
 for(const id of events)playNativeEffect(audio,id);
}

// Load the current arena; preload the three small result tracks. A request token prevents a late decode from
// starting music after restart, arena change or leaving the game.
export class NativeMusic {
 constructor(audio){this.audio=audio;this.request=0;this.paused=false;this.offset=0;this.handle=null;this.id=null;this.ready=false;}
 preload(stage){
  if(this.audio?._eggoNative)return Promise.resolve();
  const track=NATIVE_MUSIC[stage]||NATIVE_RESULT_AUDIO[stage];
  if(track&&this.audio?.loadSound)return this.audio.loadSound('eggo-mania-music-'+stage,new URL('./assets/'+track.file,import.meta.url).href).catch(()=>{});
 }
 preloadResults(){
  if(this.audio?._eggoNative)return;
  if(!this.audio?.loadSound)return;
  for(const [name,track] of Object.entries(NATIVE_RESULT_AUDIO))this.audio.loadSound('eggo-mania-music-'+name,new URL('./assets/'+track.file,import.meta.url).href).catch(()=>{});
 }
 start(stage){
  if(this.audio?._eggoNative){this.audio._eggoNative.song(NATIVE_MUSIC_IDS[stage]??0);return;}
  this.stop();this.paused=false;
  const track=NATIVE_MUSIC[stage]||NATIVE_RESULT_AUDIO[stage];this.track=track;
  if(!track||!this.audio?.playLoop||!this.audio?.loadSound)return;
  const request=this.request,id='eggo-mania-music-'+stage;this.id=id;
  if(this.audio._soundBuffers?.has(id)){this.ready=true;this.resume();return Promise.resolve();}
  return this.audio.loadSound(id,new URL('./assets/'+track.file,import.meta.url).href).then(()=>{
   if(request!==this.request)return;
   this.ready=true;if(!this.paused)this.resume();
  }).catch(()=>{});
 }
 pause(){
  if(this.audio?._eggoNative){this.audio._eggoNative.pause();return;}
  this.paused=true;
  if(this.handle){this.offset=this.handle.position();this.handle.stop();this.handle=null;}
 }
 resume(){
  if(this.audio?._eggoNative){this.audio._eggoNative.resume();return;}
  this.paused=false;
  if(this.ready&&this.id&&!this.handle)this.handle=this.audio.playLoop(this.id,{volume:MUSIC_VOLUME,offset:this.offset,loop:this.track?.loop??true,loopStart:this.track?.loop_start_seconds??0});
 }
 stop(){if(this.audio?._eggoNative){this.audio._eggoNative.song(0);return;}this.request++;this.handle?.stop();this.handle=null;this.id=null;this.ready=false;this.offset=0;}
}
