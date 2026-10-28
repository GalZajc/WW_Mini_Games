// Deterministic online adapter. Survival's original single-player path is untouched.
import {RULES} from './model.js';
import {PODIUM_VIEW} from './result-view.js';
import {NATIVE_AUDIO_ENGINE as NATIVE_CLOCK} from './native-audio-engine.js';
export const MATCH_RULES=Object.freeze({rounds:8,tiebreakRound:9,resultHoldTicks:90,inputBatch:3,maxLead:18,maxCatchup:5,checksumEvery:300,disconnectSeconds:15});
export function matchFinished(round,scores){return round>=MATCH_RULES.rounds&&(scores[0]!==scores[1]||round>=MATCH_RULES.tiebreakRound);}
export function packControl(c){return (c.move<0?1:c.move>0?2:0)|(c.float?4:0)|(c.fast?8:0)|(c.dive?16:0)|(c.discard?32:0)|(c.use?64:0)|(c.rotate>0?128:c.rotate<0?256:0);}
export function unpackControl(mask){return {move:mask&1?-1:mask&2?1:0,jump:!!(mask&4),float:!!(mask&4),fast:!!(mask&8),dive:!!(mask&16),discard:!!(mask&32),use:!!(mask&64),rotate:mask&128?1:mask&256?-1:0};}
function checksum(game){
 let h=2166136261;const add=n=>{h=Math.imul(h^(n|0),16777619)>>>0;};
 add(game.round);add(game.nativeActorRandomSeed);add(game.bg3GlobalFrame);
 for(const t of [game.player,game.cpu]){add(t.nativeFrame);add(t.nativeActorState);add(t.egg.x*65536);add(t.egg.y*65536);add(t.egg.vy*65536);add(t.held?.nativeKind??-1);for(const row of t.rows)for(const c of row.cells)add(c);}
 return h;
}
export class HumanMatch {
 constructor(game,transport,input,onStatus){
  this.game=game;this.transport=transport;this.input=input;this.onStatus=onStatus;this.side=transport.side;
  this.maps=[new Map(),new Map()];this.nextSample=0;this.frame=0;this.batch=[];this.clock=0;this.scores=[0,0];this.controls=[{},{}];this.checks=new Map();this.peerChecks=new Map();
  this.original={startRound:game.startRound,updateCPU:game.updateCPU,finish:game.finish,readPlayerControl:game.readPlayerControl};
  transport.onMessage(data=>this.receive(data));
 }
 start(seed,characters){
  if(this.started)return;this.started=true;this.characters=characters;
  const g=this.game;g.nativeHumanMatch=true;g.p.character=characters[0];g.p.seed=seed;g.seed=seed;g.nativeActorRandomSeed=seed;
  g.startRound=(...args)=>{this.original.startRound.apply(g,args);this.prepareRound();};
  g.readPlayerControl=()=>this.controls[0];
  g.updateCPU=dt=>g.stepCPUActor(g.cpu,dt,this.controls[1],g.player);
  g.finish=()=>{const won=Boolean(g.player.won||g.cpu?.lost);this.scores[won?0:1]++;this.original.finish.call(g);};
  g.resetSurvival();this.onStatus(this.summary());
 }
 prepareRound(){
  const g=this.game,t=g.cpu;if(!t)return;
  // Two humans start on identical terrain; CPU survival handicaps do not apply.
  t.rows=structuredClone(g.player.rows);t.nextOwner=g.player.nextOwner;
  for(const key of ['water','previousWater','previousPreviousWater'])t[key]=g.player[key];
  t.nativeRivalCharacter=this.characters[1];
  this.onStatus(this.summary());
 }
 summary(){return {round:this.game.round,scores:[...this.scores],side:this.side,done:!!this.done,error:this.error,waiting:this.waiting};}
 receive(data){
  if(data.type==='input'){
   if(!Number.isSafeInteger(data.start)||!Array.isArray(data.values)||data.values.length>MATCH_RULES.maxLead)return;
   for(let j=0;j<data.values.length;j++){const f=data.start+j,m=data.values[j];if(f>=this.frame&&f<=this.frame+MATCH_RULES.maxLead*3&&Number.isInteger(m)&&m>=0&&m<512)this.maps[1-this.side].set(f,m);}
  }else if(data.type==='check'){
   this.peerChecks.set(data.frame,data.hash);this.compareCheck(data.frame);
  }else if(data.type==='closed'){this.error=data.message;this.onStatus(this.summary());}
 }
 compareCheck(frame){
  if(!this.checks.has(frame)||!this.peerChecks.has(frame))return;
  if(this.checks.get(frame)!==this.peerChecks.get(frame)){this.error='Simulaciji se ne ujemata. Tekma je ustavljena.';this.onStatus(this.summary());}
  this.checks.delete(frame);this.peerChecks.delete(frame);
 }
 sample(){
  const c={...this.heldControl,...this.edges};this.edges={};
  const mask=packControl(c);this.maps[this.side].set(this.nextSample,mask);
  if(!this.batch.length)this.batchStart=this.nextSample;this.batch.push(mask);this.nextSample++;
  if(this.batch.length>=MATCH_RULES.inputBatch)this.flush();
 }
 flush(){if(this.batch.length){this.transport.send({type:'input',start:this.batchStart,values:this.batch});this.batch=[];}}
 update(dt){
  if(!this.started||this.done||this.error)return;
  const c=this.suspendInput?{}:this.original.readPlayerControl.call({...this.game,input:this.input});
  this.heldControl={move:c.move??0,float:!!c.float,fast:!!c.fast,dive:!!c.dive};
  this.edges??={};for(const key of ['use','discard','rotate'])if(c[key])this.edges[key]=c[key];
  this.clock=Math.min(this.clock+dt*NATIVE_CLOCK.nativeFPS/NATIVE_CLOCK.gameFPS,.25);
  while(this.clock>=RULES.step&&this.nextSample-this.frame<MATCH_RULES.maxLead){this.sample();this.clock-=RULES.step;}
  let count=0;
  while(this.maps[0].has(this.frame)&&this.maps[1].has(this.frame)&&count++<MATCH_RULES.maxCatchup){
   this.controls=this.maps.map(m=>unpackControl(m.get(this.frame)));this.maps.forEach(m=>m.delete(this.frame));
   const g=this.game,liveInput=g.input;
   // Network frames contain explicit edge buttons; local menu/restart keys never enter the match simulation.
   g.input={isActionJustDown:()=>false,isActionDown:()=>false,getFirstGamepadAxis:()=>0};
   try{g.update(RULES.step);}finally{g.input=liveInput;}
   this.frame++;
   if(this.frame%MATCH_RULES.checksumEvery===0){const hash=checksum(g);this.checks.set(this.frame,hash);this.transport.send({type:'check',frame:this.frame,hash});this.compareCheck(this.frame);}
   if(['won','lost'].includes(g.phase)&&g.resultTicks>=PODIUM_VIEW.confirmTick+MATCH_RULES.resultHoldTicks){
    if(matchFinished(g.round,this.scores)){this.done=true;g.music?.pause();this.onStatus(this.summary());break;}
    g.round++;g.startRound();this.onStatus(this.summary());
   }
  }
  const waiting=this.nextSample-this.frame>=MATCH_RULES.maxLead;
  if(waiting){this.waitSeconds=(this.waitSeconds??0)+dt;if(this.waitSeconds>MATCH_RULES.disconnectSeconds){this.error='Your opponent has stopped sending inputs. The match connection was lost.';this.onStatus(this.summary());}}
  else this.waitSeconds=0;
  if(waiting!==this.waiting){this.waiting=waiting;this.onStatus(this.summary());}
 }
 destroy(){this.flush();Object.assign(this.game,this.original);this.game.nativeHumanMatch=false;this.transport.close();}
}
