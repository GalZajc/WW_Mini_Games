// Sound-event differential replay: production model, no Electron, screen or output device.
import Game from '../renderer/games/eggo-mania/game.js';
import {Tower,settings} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_SFX} from '../renderer/games/eggo-mania/assets/native-sfx.js';
import {NATIVE_MUSIC_IDS} from '../renderer/games/eggo-mania/native-sound-events.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const parameters={seed:1492,startAfter:400,end:Number(arg('end',109076)),character:'yolko',
 tape:'scripts/OUTPUT/eggo-user-replay_2026-10-19_21-01-20_213557/steps.json',
 settingsSource:'scripts/OUTPUT/eggo-render-profile_2026-10-26T10-15-14-220Z/parameters.json'};
const actual=JSON.parse(await readFile(parameters.settingsSource,'utf8')).gameSettings;
const inspect=new Set(arg('inspect','')?JSON.parse(await readFile(arg('inspect',''),'utf8')):[]);
const out=path.resolve('scripts/OUTPUT','eggo-sound-model_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});parameters.settings=actual;parameters.sourceHashes={};
for(const name of ['game.js','model.js','audio.js','native-sound-events.js','native-water.js','native-weather.js'])parameters.sourceHashes[name]=createHash('sha256').update(await readFile('renderer/games/eggo-mania/'+name)).digest('hex');
await writeFile(path.join(out,'parameters.json'),JSON.stringify(parameters,null,2));
let frame=400,control={};const requested=[],admitted=[],towerEvents=[],roundLoads=[],inspections=[],dives=[],leads=[],blasts=[],leadCandidates=[];let soundTempo=0,tempoRound=0,soundLeadWarned=false;let wasLeading=false,leadRound=0;
const context={currentTime:0,createGain:()=>({gain:{value:1},connect(){},disconnect(){}}),createBufferSource:()=>({connect(){},disconnect(){},stop(){},start(){admitted.push({frame,id:this.buffer.nativeId});}})};
const audio={_nativeEffectRequest:id=>requested.push({frame,id}),_soundBuffers:new Map(Object.keys(NATIVE_SFX).map(id=>['eggo-mania-native-sfx-'+id,{nativeId:Number(id)}])),_ensureCtx:()=>context,_channels:{effects:{}}};
const musicRequests=[],tempoRequests=[];
audio._nativeTempoRequest=value=>tempoRequests.push({frame,value});
const g=new Game();g.p=settings(actual);g.seed=parameters.seed;g.audio=audio;g.submitScore=()=>{};
g.music={start:stage=>musicRequests.push({frame,id:NATIVE_MUSIC_IDS[stage],stage}),stop(){},pause(){},resume(){}};
g.input={isActionJustDown:a=>(a==='place'||a==='continue')&&!!control.use};g.readPlayerControl=()=>control;
const startRound=g.startRound;g.startRound=function(...args){const result=startRound.apply(this,args);roundLoads.push({frame,round:this.round,stage:this.player.artStage,budget:this.roundLoadingBudget});return result;};
const queue=Tower.prototype.queueNativeSound;Tower.prototype.queueNativeSound=function(id,...args){towerEvents.push({frame,field:this.fieldIndex,id});return queue.call(this,id,...args);};
const explode=Tower.prototype.explode;Tower.prototype.explode=function(x,y,lift,eventTime,...args){const record={frame,field:this.fieldIndex,x,y,eventTime,time:this.time,egg:{...this.egg},snapshot:this.nativeRenderFrame?{x:this.nativeRenderFrame.x,y:this.nativeRenderFrame.y}:null};const result=explode.call(this,x,y,lift,eventTime,...args);blasts.push(record);return result;};
const update=Tower.prototype.update;Tower.prototype.update=function(dt,c,...args){
 const row=c.dive?{frame,field:this.fieldIndex,control:{...c},ground:this.egg.ground,swimming:this.egg.swimming,stun:this.egg.stun,state:this.nativeActorState,
  lightning:!!this.egg.lightning,bubble:!!this.egg.bubble,carried:!!this.egg.carried}:null;
 const result=update.call(this,dt,c,...args);if(row){Object.assign(row,{supported:this.nativeActorSupportAtHandler,nextState:this.nativeActorState});dives.push(row);}return result;
};
g.resetSurvival();let previous=new Set();
const keys=['bubble','jumper','space','spaceSecondary','dragon','dragonSecondary','castle','castleSecondary','factorySecondary','parkPrimary','parkSecondary','jungleSecondary','pirateSecondary','beanstalkSecondary'];
outer:for(const [n,mask] of JSON.parse(await readFile(parameters.tape,'utf8')))for(let j=0;j<n;j++){
 if(++frame>parameters.end)break outer;
 const h=new Set(mask?mask.split('+'):[]);control={move:Number(h.has('RIGHT'))-Number(h.has('LEFT')),jump:h.has('UP'),float:h.has('UP'),fast:h.has('DOWN'),dive:h.has('L'),discard:h.has('R')&&!previous.has('R'),use:h.has('A')&&!previous.has('A'),rotate:h.has('B')&&!previous.has('B')?1:0};previous=h;
 context.currentTime=(frame-parameters.startAfter-1)/60;
 if(g.round!==tempoRound){soundTempo=0;soundLeadWarned=false;tempoRound=g.round;}
 if(g.phase==='playing'){
  const remaining=47-g.cpu.height()-10,range=(g.player.p.nativeConfig?.height??37)-12;
  const change=remaining<(range>>2)?-3:remaining<Math.trunc(range/3)?-2:remaining<(range>>1)?-1:0;
  if(soundTempo!==0&&!soundLeadWarned&&g.cpu.nativeCountFullFloors()>g.player.nativeCountFullFloors()){
   soundLeadWarned=true;leadCandidates.push({frame,round:g.round,soundTempo,remaining,range,counts:[g.player.nativeCountFullFloors(),g.cpu.nativeCountFullFloors()]});}
  soundTempo=Math.min(soundTempo,change);
 }
 g.update(1/60);
 const leading=(g.cpu?.nativeDividerPendingProgress??0)>(g.player?.nativeDividerPendingProgress??0);
 if(leading&&(!wasLeading||leadRound!==g.round))leads.push({frame,round:g.round,phase:g.phase,pending:[g.player.nativeDividerPendingProgress,g.cpu?.nativeDividerPendingProgress],shown:[g.player.nativeDividerProgress,g.cpu?.nativeDividerProgress],actual:[g.player.nativeCountFullFloors(),g.cpu?.nativeCountFullFloors()]});wasLeading=leading;leadRound=g.round;
 if(inspect.has(frame))inspections.push({frame,phase:g.phase,round:g.round,intro:g.bg3GlobalFrame,fields:[g.player,g.cpu].filter(Boolean).map(t=>({field:t.fieldIndex,egg:{...t.egg},state:t.nativeActorState,incomplete:t.incompleteFloors,warning:t.nativeWaterWarning,roof:t.height(),hazards:Object.fromEntries(keys.map(k=>[k,{...t[k]}]))}))});
 if(frame%10000===0)console.log(`${frame}/${parameters.end}`);
}
for(const [file,value] of Object.entries({'tempo-requests.json':tempoRequests,'music-requests.json':musicRequests,'requested-sounds.json':requested,'admitted-sounds.json':admitted,'sound-events.json':towerEvents,'lead-candidates.json':leadCandidates,'blasts.json':blasts,'leads.json':leads,'round-loads.json':roundLoads,'inspections.json':inspections,'dives.json':dives}))await writeFile(path.join(out,file),JSON.stringify(value,null,2));
console.log(JSON.stringify({out,requested:requested.length,round:g.round,phase:g.phase}));
