import {NATIVE_AUDIO_ENGINE as C} from './native-audio-engine.js';
// One place for live buffering policy; no changes to the native sound data.
export const NATIVE_PLAYBACK=Object.freeze({leadSeconds:2/60,lockedFrames:2});
const empty=()=>({reset:false,music:[],effects:[],tempo:[],tick:true});
export class NativeAudioCommands {
 constructor(send){this.send=send;this.pending=empty();this.inFrame=false;this.loading=null;}
 reset(){this.pending=empty();this.pending.reset=true;}
 song(id){this.pending.music.push(id);}
 effect(id){this.pending.effects.push(id);}
 tempo(value){this.pending.tempo.push(value);}
 begin(){this.inFrame=true;}
 round(budget){
  this.loading=budget?{remaining:budget.ticks,secondReset:budget.ticks-budget.frames[0]}:null;
  if(!this.inFrame){this.pending.tick=!budget;this.send({type:'prime',commands:this.pending});this.pending=empty();}
 }
 loadingFrame(){
  this.begin();if(this.loading&&--this.loading.remaining===this.loading.secondReset)this.song(0);
 }
 end(tick=true){this.pending.tick=tick;this.send({type:'frame',commands:this.pending});this.pending=empty();this.inFrame=false;}
}
export class NativeAudioPlayer extends NativeAudioCommands {
 constructor(audio,{frameRate=C.nativeFPS,workerURL=null,initialization={},readButtons=null}={}){
  let send;super(message=>send(message));this.audio=audio;this.sources=new Set();this.held=[];this.lockedPCM=[];this.nextTime=0;this.paused=false;this.pendingFrames=0;
  this.ctx=audio._ensureCtx();
  this.worker=new Worker(workerURL??new URL('./native-audio-worker.js',import.meta.url),{type:'module'});
  send=message=>{if(this.destroyed)return;if(message.type==='frame'){this.pendingFrames++;if(readButtons)message={...message,buttons:readButtons()};if(this.sessionId!==undefined)message={...message,sessionId:this.sessionId,nonNative:message.commands.nonNative};}this.worker.postMessage(message);};
  this.worker.onmessage=({data})=>{
   if(data.type==='pcm'){
    this.pendingFrames--;this.computeMs=data.computeMs;
    if(data.sessionId!==undefined&&data.sessionId!==this.sessionId)return;
    if(data.original!==undefined)this.original=data.original;
    if(data.divergence)this.divergence=data.divergence;
    if(this.paused)this.held.push({pcm:data.pcm});
    else if(this.ctx.state==='suspended'){this.lockedPCM.push(data.pcm);if(this.lockedPCM.length>NATIVE_PLAYBACK.lockedFrames)this.lockedPCM.shift();}
    else{this.flushUnlocked();this.schedulePCM(data.pcm);}
   }else if(data.type==='ready')this.ready=true;
   else if(data.type==='session-ready'&&data.sessionId===this.sessionId){this.preparing=false;this.original=data.original;}
   else if(data.type==='error'){this.error=data.message;console.error('Eggo native audio:',data.message);this.destroy();}
  };
  this.worker.onerror=event=>{this.error=event.message;console.error('Eggo native audio:',event.message);this.destroy();};
  // Live logical ticks follow the original59.7275Hz hardware clock. Explicit
  // diagnostic frame rates remain available, but production does not change
  // the resampler's rate to speed up the original music to60Hz.
  this.worker.postMessage({...initialization,type:'init',sampleRate:this.ctx.sampleRate*C.nativeFPS/frameRate});
  audio._eggoNative=this;
 }
 begin(){super.begin();this.unlock();}
 unlock(){
  if(this.ctx.state==='suspended')this.audio._ensureCtx();
  else this.flushUnlocked();
 }
 flushUnlocked(){if(!this.paused)for(const pcm of this.lockedPCM.splice(0))this.schedulePCM(pcm);}
 schedulePCM(pcm){
  const count=pcm.length/4,buffers=[];
  for(let stem=0;stem<2;stem++){
   const buffer=this.ctx.createBuffer(2,count,this.ctx.sampleRate);
   for(let channel=0;channel<2;channel++){
    const out=buffer.getChannelData(channel);for(let i=0;i<count;i++)out[i]=pcm[stem*count*2+i*2+channel];
   }buffers.push(buffer);
  }
  this.schedule(buffers,0);
 }
 schedule(buffers,offset){
  // Keep chunk boundaries on one continuous sample clock. Requiring a fresh
  // lead before EVERY chunk introduces fractional gaps when callbacks jitter.
  const when=this.nextTime>this.ctx.currentTime?this.nextTime:
   Math.ceil((this.ctx.currentTime+NATIVE_PLAYBACK.leadSeconds)*this.ctx.sampleRate)/this.ctx.sampleRate;
  const record={buffers,offset,when,nodes:[]};
  for(let i=0;i<2;i++){
   const node=this.ctx.createBufferSource();node.buffer=buffers[i];node.connect(this.audio._channels[i?'effects':'music']);
   node.onended=()=>{node.disconnect();if(i===1)this.sources.delete(record);};node.start(when,offset);record.nodes.push(node);
  }
  this.nextTime=when+buffers[0].duration-offset;this.sources.add(record);
 }
 pause(){
  if(this.paused)return;this.paused=true;
  const now=this.ctx.currentTime;
  for(const record of this.sources){
   const offset=record.offset+Math.max(0,now-record.when);
   if(offset<record.buffers[0].duration)this.held.push({buffers:record.buffers,offset});
   for(const node of record.nodes){node.onended=null;try{node.stop();}catch{}node.disconnect();}
  }this.sources.clear();this.nextTime=0;
 }
 resume(){
  this.unlock();if(!this.paused)return;this.paused=false;
  const held=this.held.splice(0);for(const item of held)if(item.pcm)this.schedulePCM(item.pcm);else this.schedule(item.buffers,item.offset);
 }
 destroy(){
  if(this.destroyed)return;this.pause();this.destroyed=true;this.preparing=false;this.worker.terminate();this.held=[];this.lockedPCM=[];
  if(this.audio._eggoNative===this)delete this.audio._eggoNative;
 }
}
