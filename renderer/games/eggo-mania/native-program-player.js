import {NativeAudioPlayer} from './native-audio-player.js';
import {DEFAULTS} from './model.js';
// Native fidelity applies to the original single-player rules and buttons.
// Extensions retain the existing model-driven sound engine.
export function originalAudioRules(p,multiplayer=false){
 return !multiplayer&&p.mode==='survival'&&['columns','goal','waterSpeed','crateInterval','aiDelay','hazards','difficulty'].every(key=>p[key]===DEFAULTS[key]);
}
export class NativeProgramAudioPlayer extends NativeAudioPlayer {
 constructor(audio,{readButtons,nonNative=()=>false,initialization={},frameRate}={}){
  super(audio,{frameRate,workerURL:new URL('./native-program-worker.js',import.meta.url),initialization,readButtons});
  this.sessionId=0;this.nonNative=nonNative;
 }
 startSession({seed,character,original}){
  const paused=this.paused;this.pause();this.held=[];this.lockedPCM=[];this.paused=paused;this.nextTime=0;
  this.sessionId++;this.preparing=Boolean(original);this.original=Boolean(original);this.send({type:'session',sessionId:this.sessionId,seed,character,original});
 }
 end(tick=true){
  this.pending.nonNative=Boolean(this.nonNative());super.end(tick);
 }
}
