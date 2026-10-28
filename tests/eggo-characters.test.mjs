import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import Game from '../renderer/games/eggo-mania/game.js';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
import {ACTOR_VIEW,actorPose,advanceNativePlayerPose,advanceNativeRivalPose,rivalPose} from '../renderer/games/eggo-mania/view.js';
import {RIVAL_POSES} from '../renderer/games/eggo-mania/assets/rival-poses.js';
import {podiumPose} from '../renderer/games/eggo-mania/result-view.js';
import {CHARACTER_ART} from '../renderer/games/eggo-mania/assets/characters.js';
const fixture=JSON.parse(readFileSync(new URL('../renderer/games/eggo-mania/assets/characters.json',import.meta.url),'utf8'));
const recorded=JSON.parse(readFileSync(new URL('./fixtures/eggo-character-podium-gba.json',import.meta.url),'utf8'));
const walkTrace=JSON.parse(readFileSync(new URL('./fixtures/eggo-player-walk-gba.json',import.meta.url),'utf8'));
const animationProbe=JSON.parse(readFileSync(new URL('./fixtures/eggo-player-animation-probe.json',import.meta.url),'utf8'));

test('selected default-menu character persists across Survival rounds and validated settings',()=>{
 const choices=Game.getSettingsSchema().find(s=>s.key==='character').options;
 assert.equal(choices.length,8);assert.equal(settings().character,'yolko');
 for(const {value,label} of choices){
  assert.equal(label,CHARACTER_ART[value].label);
  const g=new Game();g.p=settings({character:value});g.seed=1;g.resetSurvival();
  assert.equal(g.player.p.character,value);g.round++;g.startRound();assert.equal(g.player.p.character,value);
  const source=fixture.characters[value].game;
  const path=source.load;
  assert.match(path,/survival-hard/);assert.deepEqual(source.writes,[[0x3d4,CHARACTER_ART[value].id]]);
 }
 assert.throws(()=>settings({character:'__proto__'}),/Unknown character/);
});

test('each added character follows its own recorded native podium cycle and whole loss sequence',()=>{
 for(const [name,entry]of Object.entries(fixture.characters)){
  if(name==='yolko')continue; // Its existing entry phase is retained and checked by the result test.
  for(const kind of ['win','loss']){
   const original=recorded.sequences[name][kind];
   const start=kind==='win'?fixture.parameters.win_warmup:0;
   for(let i=start;i<original.length;i++){
    const [frame,picture,x,y]=original[i],ticks=kind==='win'?i-start+3:frame;
    assert.deepEqual(podiumPose(kind==='win',ticks,name),{picture,x,y},`${name} ${kind} native frame ${frame}`);
   }
  }
  assert.equal(podiumPose(false,CHARACTER_ART[name].lossTitleTick,name),null);
 }
});

test('default Yolko walk uses all seven native frames, including the last three decoded ROM poses',()=>{
 const nativeFrames=walkTrace.native_walk_frames;
 assert.equal(ACTOR_VIEW.states.walk[1],nativeFrames.length);
 assert.deepEqual(fixture.parameters.pose_templates.walk,nativeFrames.map((_,frame)=>[4,frame]));
 assert.deepEqual(nativeFrames.map(sample=>sample.pose),[0,1,2,3,4,5,6]);
 const tower={egg:{ground:true,walking:true,facing:1},held:{cells:[]},placing:null};
 const tick=()=>{const previous=tower.actorVisualPose;tower.actorVisualPose=null;return advanceNativePlayerPose(tower,previous);};
 const frames=[];
 const cycleTicks=nativeFrames.length*walkTrace.native_walk_ticks_per_pose;
 for(let index=0;index<cycleTicks;index++)frames.push(tick()?.frame);
 assert.deepEqual(frames,Array.from({length:cycleTicks},(_,tick)=>Math.floor(tick/walkTrace.native_walk_ticks_per_pose)%nativeFrames.length));
 const last=structuredClone(tower.actorVisualPose);
 tower.egg.facing=-1;
 tower.actorVisualPose=null;
 assert.equal(advanceNativePlayerPose(tower,last).frame,6,'turn holds the last facing pose for the native one-frame OAM delay');
 const reverse=[];
 for(let index=0;index<4;index++)reverse.push(tick().frame);
 assert.deepEqual(reverse,[0,0,0,0],'a direction change restarts the seven-frame cycle');
});

test('walk animation continues against a wall and plays the native remaining cycle after release',()=>{
 const blocked=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(17));
 blocked.spawn=Infinity;blocked.egg.x=2.95;blocked.egg.y=0;blocked.egg.ground=true;
 blocked.setCell(3,0,1,1);
 blocked.setCell(3,1,1,2);
 blocked.update(RULES.step,{nativeMotion:true,move:1});
 assert.equal(blocked.egg.x,2.95,'the occupied cell blocks movement');
 assert.equal(blocked.egg.walking,true,'holding into the obstacle still runs the native walk animation');

 const tower={egg:{ground:true,walking:true,facing:1},held:{cells:[]},placing:null};
 const tick=()=>{const previous=tower.actorVisualPose;tower.actorVisualPose=null;return advanceNativePlayerPose(tower,previous);};
 for(let index=0;index<3*walkTrace.native_walk_ticks_per_pose;index++)tick();
 const previous=structuredClone(tower.actorVisualPose);
 assert.equal(previous.frame,2);
 tower.egg.walking=false;
 tower.actorVisualPose=null;
 assert.equal(advanceNativePlayerPose(tower,previous).frame,2,'release displays the last moving pose first');
 const tail=[];
 const tailTicks=(walkTrace.native_walk_frames.length-1-previous.frame)*walkTrace.native_walk_ticks_per_pose;
 for(let index=0;index<tailTicks;index++)tail.push(tick().frame);
 assert.deepEqual(tail,Array.from({length:tailTicks},(_,tick)=>previous.frame+1+Math.floor(tick/walkTrace.native_walk_ticks_per_pose)));
 assert.equal(tower.nativePlayerWalkStopTicks,0);
});

test('Yolko airborne pose phase and row transitions match the captured Hard Survival jump',()=>{
 const tower={egg:{ground:true,walking:false,facing:1,vy:0},held:{cells:[[0,0]]},placing:null,nativeActorFrame:0};
 let previous=null;
 const tick=()=>{
  tower.actorVisualPose=null;
  previous=advanceNativePlayerPose(tower,previous);
  return previous;
 };
 tick();
 tower.egg.ground=false;tower.egg.vy=13.125;
 const takeoff=tick();
 assert.deepEqual({row:takeoff.row,frame:takeoff.frame},
  {row:animationProbe.samples[0].atlas_row,frame:animationProbe.samples[0].atlas_frame},
  'the first jump update keeps the prior OAM pose for one frame');
 const nativeAirTicks=new Map([[36,0],[40,4],[44,8],[48,12],[52,16],[60,24],[68,32]]);
 for(const sample of animationProbe.samples.slice(1)){
  const target=nativeAirTicks.get(sample.native_frame);
  while((tower.nativePlayerAirTicks||0)<target){
   const phase=tower.nativePlayerAirTicks||0;
   tower.egg.vy=phase<12?13.125:phase<24?2.5:-2.5;
   tick();
  }
  tower.egg.vy=target<12?13.125:target<24?2.5:-2.5;
  const pose=tick();
  assert.deepEqual({row:pose.row,frame:pose.frame},
   {row:sample.atlas_row,frame:sample.atlas_frame},`ROM frame ${sample.native_frame}`);
 }
});

test('the player uses the decoded two-frame ROM pose while falling with horizontal movement',()=>{
 const tower={fieldIndex:0,egg:{ground:false,walking:true,facing:1,vy:-2},held:{cells:[]},placing:null};
 let previous=null;
 const frames=[];
 for(let tick=0;tick<17;tick++){
  tower.actorVisualPose=null;
  previous=advanceNativePlayerPose(tower,previous);
  frames.push({state:previous.state,row:previous.row,frame:previous.frame});
 }
 assert.deepEqual(ACTOR_VIEW.states['fall-moving'],[15,2]);
 assert.ok(frames.every(pose=>pose.state==='fall-moving'&&pose.row===15));
 assert.deepEqual(frames.map(pose=>pose.frame),[
  ...Array(8).fill(0),...Array(8).fill(1),0,
 ]);
});

test('rival animation replays ROM pose holds and the complete two-tick throw sequence',()=>{
 const tower={artStage:'factory',time:600,egg:{ground:true,walking:false,vy:0,facing:1},held:{cells:[[0,0]]},placing:null};
 const idle=RIVAL_POSES.factory.idle;
 for(let tick=0;tick<idle.durations[0];tick++){
  advanceNativeRivalPose(tower);assert.equal(rivalPose(tower).frame,0,'first source idle pose keeps its captured duration');
 }
 advanceNativeRivalPose(tower);
 assert.equal(rivalPose(tower).frame,1,'the idle changes only after the recorded hold');

 tower.placing={ticks:0};
 const throwClip=RIVAL_POSES.factory.throw;
 assert.equal(throwClip.durations.reduce((sum,ticks)=>sum+ticks,0),28,'source throw clip spans the full ROM action');
 const frames=[];
 for(let tick=1;tick<=28;tick++){
  tower.placing.ticks=tick;frames.push(advanceNativeRivalPose(tower).frame);
 }
 const expected=[];
 for(let frame=0;frame<throwClip.durations.length;frame++)
  for(let tick=0;tick<throwClip.durations[frame];tick++)expected.push(frame);
 assert.deepEqual(frames,expected,'every native throw pose is shown for its measured number of GBA frames');
});

test('rival idle uses the ROM random animation phase instead of the fitted clip clock',()=>{
 const tower={artStage:'factory',egg:{ground:true,walking:false,vy:0,facing:1},
  held:{cells:[[0,0]]},placing:null,nativeActorFrame:1,
  nativeRivalPose:{state:'idle',key:'idle',frame:0},nativeRivalPoseTicks:0};
 assert.deepEqual(rivalPose(tower),{row:RIVAL_POSES.factory.idle.row,frame:0},
  'Factory selector-2 phase 1 selects the first atlas cel despite the fallback rival clip clock');
 tower.held=null;tower.nativeActorFrame=0;
 tower.nativeRivalPose={state:'idle-free',key:'idle-free',frame:1};
 assert.deepEqual(rivalPose(tower),{row:RIVAL_POSES.factory['idle-free'].row,frame:1},
  'Factory selector-2 phase 0 selects the second free-hand idle cel');
});

test('an empty-handed actor uses the free animation without mutating a constant state',()=>{
 const tower={egg:{ground:true,walking:false,vy:0,facing:1},held:null,placing:null};
 assert.equal(actorPose(tower).state,'idle-free');
 tower.egg.walking=true;
 assert.equal(actorPose(tower).state,'walk-free');
});

test('a walking rival keeps the native walk cel for two OAM updates after takeoff',()=>{
 const tower={artStage:'factory',egg:{ground:true,walking:true,vy:0,facing:1},held:{cells:[[0,0]]},placing:null};
 advanceNativeRivalPose(tower);
 assert.deepEqual(rivalPose(tower),{row:RIVAL_POSES.factory.walk.row,frame:0});
 for(let tick=0;tick<6;tick++)advanceNativeRivalPose(tower);
 tower.egg.ground=false;tower.egg.walking=false;tower.egg.vy=4;tower.time=900;
 advanceNativeRivalPose(tower);
 assert.deepEqual(rivalPose(tower),{row:RIVAL_POSES.factory.walk.row,frame:1},'takeoff draws the next walk cel from the pre-update OAM phase');
 advanceNativeRivalPose(tower);
 assert.deepEqual(rivalPose(tower),{row:RIVAL_POSES.factory.walk.row,frame:1},'the prior cel remains for the second native OAM update');
 advanceNativeRivalPose(tower);
 assert.equal(rivalPose(tower).row,RIVAL_POSES.factory['rise-still'].row,
  'the rising still-air ROM table takes over after the measured two-frame handoff');
});

test('rival air animation switches direction and movement tables without resetting phase',()=>{
 const tower={artStage:'factory',egg:{ground:false,walking:false,vy:4,facing:1},
  held:{cells:[[0,0]]},placing:null};
 advanceNativeRivalPose(tower);
 assert.equal(tower.nativeRivalPoseKey,'rise-still');
 const initialPose=rivalPose(tower);
 assert.equal(initialPose.row,RIVAL_POSES.factory['rise-still'].row);
 tower.egg.walking=true;advanceNativeRivalPose(tower);
 assert.equal(tower.nativeRivalPoseKey,'rise-moving');
 assert.equal(tower.nativeRivalPoseTicks,2,'the shared ROM animation phase continues while the table changes');
 assert.deepEqual(rivalPose(tower),initialPose,'OAM shows the prior cel on the table-switch frame');
 advanceNativeRivalPose(tower);
 assert.equal(tower.nativeRivalPoseTicks,3);
 assert.equal(rivalPose(tower).row,RIVAL_POSES.factory['rise-moving'].row);
 const movingPose=rivalPose(tower);
 tower.egg.walking=false;advanceNativeRivalPose(tower);
 assert.equal(tower.nativeRivalPoseKey,'rise-still');
 assert.equal(tower.nativeRivalPoseTicks,4,'returning to stillness keeps advancing the shared phase');
 assert.deepEqual(rivalPose(tower),movingPose,'the prior moving cel remains visible on the reverse table-switch frame');
 advanceNativeRivalPose(tower);
 assert.equal(rivalPose(tower).row,RIVAL_POSES.factory['rise-still'].row);
});

test('rival post-throw selector 8 follows the captured native phase bins',()=>{
 const tower={artStage:'factory',time:0,
  egg:{ground:false,walking:false,vy:4,facing:1},held:null,placing:null,
  nativeRivalPoseState:'throw',nativeRivalPoseKey:'throw',
  nativeRivalPose:{state:'throw',key:'throw',row:3,frame:0},
  nativeRivalAnimationSelector:1,nativeRivalAnimationPhase:0x20000};
 const frames=[];
 for(let tick=0;tick<4;tick++){
  advanceNativeRivalPose(tower);
  frames.push([tower.nativeRivalAnimationPhase,rivalPose(tower)]);
 }
 assert.deepEqual(frames,[
  [0x3c000,{row:RIVAL_POSES.factory['air-free'].row,frame:0}],
  [0x40000,{row:RIVAL_POSES.factory['air-free'].row,frame:0}],
  [0x44000,{row:RIVAL_POSES.factory['air-free'].row,frame:0}],
  [0x48000,{row:RIVAL_POSES.factory['air-free'].row,frame:1}],
 ],'selector 8 starts after the native selector-1 table reset and advances at the measured OAM boundaries');
});

test('leaving post-throw free-air art switches directly to the native rise cel',()=>{
 const tower={artStage:'factory',time:0,fieldIndex:1,
  egg:{ground:false,walking:false,vy:1,facing:1},held:null,placing:null,
  nativeRivalPoseState:'float-free',nativeRivalPoseKey:'air-free',
  nativeRivalPose:{state:'float-free',key:'air-free',row:6,frame:4},
  nativeRivalPoseTicks:19,nativeRivalPostThrowPoseTicks:0,
  nativeRivalPostThrowPoseActive:true,nativeRivalAnimationSelector:2,
  nativeRivalAnimationPhase:0x20000};
 advanceNativeRivalPose(tower);
 assert.equal(tower.nativeRivalPoseHoldActive,false,
  'selector 8 exit must not carry its final free-air cel into the rise table');
 assert.deepEqual(rivalPose(tower),{row:RIVAL_POSES.factory['rise-free-still'].row,frame:1},
  'the ROM displays the new rise table on the selector-5 handoff');
});

test('rival OAM keeps the previous cel for the first throw-table update',()=>{
 const idleRow=RIVAL_POSES.factory.idle.row,throwRow=RIVAL_POSES.factory.throw.row;
 const tower={artStage:'factory',time:0,
  egg:{ground:true,walking:false,vy:0,facing:1},held:{cells:[[0,0]]},placing:{ticks:2},
  nativeRivalPoseState:'idle',nativeRivalPoseKey:'idle',
  nativeRivalPose:{state:'idle',key:'idle',row:idleRow,frame:1},nativeRivalPoseTicks:2,
  nativeRivalAnimationSelector:2,nativeRivalAnimationPhase:0x8000};
 advanceNativeRivalPose(tower);
 assert.deepEqual(rivalPose(tower),{row:idleRow,frame:1},
  'the new throw animation table is selected after this frame’s OAM upload');
 tower.placing.ticks=3;
 advanceNativeRivalPose(tower);
 assert.deepEqual(rivalPose(tower),{row:throwRow,frame:1},
  'the next OAM upload uses the active throw table');
});

test('rival air pose selects separate rise and fall tables and keeps phase across float',()=>{
 for(const [stage,poses] of Object.entries(RIVAL_POSES)){
  const tower={artStage:stage,egg:{ground:false,walking:false,vy:4,facing:1},held:{cells:[[0,0]]},placing:null};
  const rising=poses['rise-still']||poses['air-still']||poses.air;
  const falling=poses['fall-still']||poses['air-still']||poses.air;
  assert.ok(rising.durations.length>1,`${stage} keeps multiple rising poses from the source`);
  assert.ok(falling.durations.length>1,`${stage} keeps multiple falling poses from the source`);
  advanceNativeRivalPose(tower);
  assert.equal(tower.nativeRivalPoseTicks,1,`${stage} ascent starts at the first captured pose`);
  assert.equal(tower.nativeRivalPoseKey,'rise-still');
  tower.egg.vy=.01;advanceNativeRivalPose(tower);
  assert.equal(actorPose(tower).state,'float');
  assert.equal(tower.nativeRivalPoseTicks,2,`${stage} near-apex transition retains the ROM animation phase`);
  assert.equal(tower.nativeRivalPoseKey,'rise-still',`${stage} remains on the rising ROM table before the apex`);
  const priorPose=rivalPose(tower);
  tower.egg.vy=-4;advanceNativeRivalPose(tower);
  assert.equal(actorPose(tower).state,'fall');
  assert.equal(tower.nativeRivalPoseTicks,3,`${stage} descent transition retains the ROM animation phase`);
  assert.equal(tower.nativeRivalPoseKey,'fall-still');
  assert.deepEqual(rivalPose(tower),priorPose,`${stage} keeps the prior cel visible on the direction-table handoff`);
  advanceNativeRivalPose(tower);
  assert.equal(rivalPose(tower).row,falling.row,`${stage} changes to its captured falling table`);
 }
});
