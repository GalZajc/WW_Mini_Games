import {NativeProgramAudioPlayer,originalAudioRules} from './native-program-player.js';
import {NATIVE_AUDIO_ENGINE as NATIVE_CLOCK} from './native-audio-engine.js';
import {EggoPerformanceMonitor} from './performance-monitor.js';
import {NATIVE_INTRO_SOUND_EVENTS,NATIVE_RESULT_SOUND,NATIVE_SOUND_EVENTS as SFX,NATIVE_AUDIO_PROGRESS,NATIVE_SOUND_PHASE,NATIVE_MUSIC_TIMING} from './native-sound-events.js';
import {loadAudio,playTowerAudio,playNativeEffect,advanceNativeAudio,resetNativeAudio,NativeMusic} from './audio.js';
import {renderPixelGame} from './pixel-renderer.js';
import {createResultView,advanceResultView,resultOpacity,PODIUM_VIEW} from './result-view.js';
import {createView,advanceNativeMeter,nativeMeterPose,nativeRivalResourcePose,seedNativeCameraActorY,advanceActorVisual,advanceNativePlayerPose,advanceNativeRivalPose,advanceView,introHeight,VIEW,actorPose,nativePlayerAnimationPose,nativeBg3ScrollOffset} from './view.js';
import {BaseGame} from '../../core/BaseGame.js';
import {InputManager} from '../../core/InputManager.js';
import {DEFAULTS,RULES,COLORS,Tower,settings,randomFrom,plan,survivalStage,startingStageFromSeed,nativeSurvivalRoundStart,reachableTowerColumn,nativeRandomStep,advanceNativeRandom} from './model.js';
import {CHARACTER_ART} from './assets/characters.js';
import {openCharacterMenu,updateCharacterMenu,advanceCharacterMenuAudio} from './character-menu.js';
import {nativeHazards} from './native-hazards.js';
import {NATIVE_INTRO,NATIVE_RESCUE,nativeRescueBoat} from './native-rescue.js';
import {createNativeAmbient,advanceNativeAmbient} from './native-ambient.js';
import {createNativeWeather,advanceNativeWeather} from './native-weather.js';
import {nativeRoundLoadingBudget} from './native-loading.js';
import {finalizeNativeWaterCreatureSprite} from './native-water.js';
import {nativeSurvivalCpuDifficulty,nativeHeldRotation,NativePieceSweep,NativeCpuTiming,NativeRotationGate,NativePlacementGate,nativeBoardContext,nativeSweepDirection,createNativeTravel,advanceNativeTravel,selectNativePickupTarget,nativeAvoidHazards,nativeProjectileTarget,nativeToolDecision,nativeBombCanCommit,nativeColumnGap,nativeSteeringKeys,filterNativeDirection,CPU_PARAMETERS} from './native-cpu.js';
import {NATIVE_PIECE_MASKS} from './assets/native-piece-masks.js';
import {NATIVE_BOMB_ART} from './assets/bomb-fuse.js';
import {NATIVE_PLAYER_AIR_TABLES} from './native-player-animation-map.js';
import {GAMEPAD,CONTROLS,migrateGamepadDefaults,nativePlayerControls,nativeHeldButtons} from './controls.js';
// The ROM field +0x1240 remains set from the rescue creature's release
// request until the constant upward launch clears the cached roof.
const nativeWaterTravelFlag=t=>Boolean(t.nativeWaterRecovery?.releasePending||
 t.egg.nativeWaterReleaseKick||t.egg.nativeWaterRise);
function snapshotNativeBoardRows(rows){
 return rows.map(row=>row?{...row,
  cells:row.cells?.slice(),owners:row.owners?.slice(),nativeArt:row.nativeArt?.slice(),
  materials:row.materials?.slice(),filler:row.filler?.map(filler=>filler?{...filler}:null)}:null);
}
export default class EggoMania extends BaseGame {
 get supportsPauseBinding(){return true;}
 init(){this.performanceMonitor=new EggoPerformanceMonitor(this);this.canvas?.classList.add('eggo-pixel-art');this.onResize(window.innerWidth,window.innerHeight);this.nativeSound=new NativeProgramAudioPlayer(this.audio,{readButtons:()=>nativeHeldButtons(this.input,{confirm:this.phase==='won'||this.phase==='lost'}),nonNative:()=>Boolean(this.input?.isActionDown?.('rotateBack'))});this.music=new NativeMusic(this.audio);this.music.preloadResults();loadAudio(this.audio);this.wantsPointerLock=false;this.p=settings(this.settings);this.p.character=DEFAULTS.character;this.ensureGamepadDefaults();this.seed=this.p.seed||crypto.getRandomValues(new Uint32Array(1))[0];openCharacterMenu(this);this.installOnlineLink();}
 installOnlineLink(){
  if(!window.api?.openEggoOnline)return;
  const button=document.createElement('button');button.textContent='Play online · two players';
  Object.assign(button.style,{position:'fixed',left:'8px',top:'8px',fontSize:'12px',padding:'5px 9px',zIndex:'10'});
  button.onclick=()=>window.api.openEggoOnline();document.body.append(button);this.onlineButton=button;
 }
 canvasPixelRatio(){const ratio=window.devicePixelRatio;return Number.isFinite(ratio)&&ratio>0?ratio:1;}
 onResize(width,height){
  if(!this.canvas)return;
  const ratio=this.canvasPixelRatio();
  const backingWidth=Math.max(1,Math.round(width*ratio)),backingHeight=Math.max(1,Math.round(height*ratio));
  if(this.canvas.width!==backingWidth)this.canvas.width=backingWidth;
  if(this.canvas.height!==backingHeight)this.canvas.height=backingHeight;
 }
 ensureGamepadDefaults(){const bindings=this.app?.currentBindings;if(!migrateGamepadDefaults(bindings))return;this.input?.setActionBindings(bindings);const gameId=this.app?.currentConfig?._id;const saved=gameId?this.app?.settingsManager?.saveKeybindings?.(gameId,bindings):null;saved?.catch?.(()=>{});}
 startRound({intro=true}={}){
  resetNativeAudio(this.audio);
  this.nativeAudioProgress={tempo:0,leadWarned:false};
  this.round??=1;this.wins??=0;this.totalScore??=0;
  // The ROM resets 0x02011A9C at every Survival-round startup; the atlas
  // capture counter is not a valid new-round phase.
  // The loose-tool oscillator survives round loading; its visible clock
  // includes the hidden setup tick as well as the displayed field ticks.
  this.nativePickupSwayFrameOffset=this.round>1?(this.nativePickupSwayFrameOffset??0)+(this.player?.nativeFrame??0):0;
  // Native creature slots survive arena loading. Their body is reset, but
  // the animation word (+0x38) is retained, including across spawns.
  const nativeCreatureCounters=this.round>1?[this.player,this.cpu].map(t=>t?.nativeWaterCreature?.counter??0):[0,0];
  // Projectile visual records (+0x1098 per field, +0x28 flame clock)
  // survive arena setup too. Allocation replaces the projectile, not its clock.
  const nativeProjectileFlameClocks=this.round>1?[this.player,this.cpu].map(t=>
   t?.nativeProjectileFlameClocks?.slice()??Array(CPU_PARAMETERS.projectileSlots).fill(0)):null;
  this.bg3GlobalFrame=0;
  this.roundLoadTicks=intro&&this.p.mode==='survival'&&this.round>1?NATIVE_INTRO.roundLoadTicks:0;
  this.roundLoadAccumulator=0;
  const rng=randomFrom(this.seed+this.round-1);
  const nativeStart=this.p.mode==='survival'?nativeSurvivalRoundStart(this.round,this.nativeActorRandomSeed??this.seed):null;
  const nativeConfig=nativeStart?.config??null;
  this.aiDifficulty=nativeStart?nativeSurvivalCpuDifficulty(nativeConfig,this.round):CPU_PARAMETERS.hardDifficulty;
  if(nativeStart)this.nativeActorRandomSeed=nativeStart.globalSeed;
  const roundSettings={...this.p,nativeConfig,nativeEnemySeed:nativeStart?.fieldSeed,
   nativePickupPrefillPasses:nativeStart&&this.p.hazards?RULES.pickupInitializationPasses:1,
   // The native table's height controls the starting terrain and waterline.
   // It does not move the fixed rescue plane or change the user's goal.
   seed:(this.seed+this.round-1)&0xffff};
  this.player=new Tower(roundSettings,rng);
  this.cpu=this.p.mode!=='solo'?new Tower(roundSettings,randomFrom((this.seed+this.round-1)^0x9e3779b9),1):null;
  if(this.cpu&&nativeStart)this.cpu.nativeRivalCharacter=Object.keys(CHARACTER_ART).find(name=>CHARACTER_ART[name].id===nativeStart.rivalId);
  if(this.cpu)this.cpu.nativePickupParticles=this.player.nativePickupParticles;
  if(nativeStart&&this.p.hazards)this.nativeActorRandomSeed=advanceNativeRandom(this.nativeActorRandomSeed,
   RULES.pickupInitializationPasses*RULES.pickupGlobalRngCallsPerPass);
  const stage=survivalStage(this.round,this.startingStage);
  this.roundLoadingBudget=null;
  if(intro&&nativeStart&&this.round>1&&this.p.columns===RULES.nativeInitialBoardColumns&&this.cpu){
   const fields=[this.player,this.cpu],board=fields.reduce((sum,t)=>({
    pieces:sum.pieces+t.nativeLoadingInitialBoard.pieces,cells:sum.cells+t.nativeLoadingInitialBoard.cells}),{pieces:0,cells:0});
   this.roundLoadingBudget=nativeRoundLoadingBudget(stage,fields.map(t=>t.nativeLoadingWork),board);
   if(this.roundLoadingBudget)this.roundLoadTicks=this.roundLoadingBudget.ticks;
  }
  this.nativeWeather=createNativeWeather();this.nativeLoadingWeatherSounds=0;this.nativeLoadingReadyPlayed=false;this.nativeAmbient=createNativeAmbient(stage);
  this.nativeArenaMusicPending=intro?stage:null;
  if(intro){this.music?.stop();this.music?.preload?.(stage);}else this.music?.start(stage);
  for(const [i,t] of [this.player,this.cpu].entries())if(t){t.artStage=stage;t.jumper.type=stage==='jungle'?RULES.jungleType:RULES.jumperType;t.nativeFrame=0;t.nativePickupSwayFrameOffset=this.nativePickupSwayFrameOffset;t.nativeWaterCreatureInitialCounter=nativeCreatureCounters[i];if(nativeProjectileFlameClocks)t.nativeProjectileFlameClocks=nativeProjectileFlameClocks[i];}
  this.phase='playing';this.elapsed=0;this.accumulator=0;this.aiClock=0;this.aiPlan=null;this.aiHeld=null;this.aiSearch=null;this.nativePlayerPrimed=false;
  this.aiTiming=new NativeCpuTiming();this.aiPendingControl={};this.aiRotation=new NativeRotationGate();this.aiPlacement=new NativePlacementGate();
  // Native controller +0x100 starts armed, not expired. Leaving it zero
  // auto-used the first caught piece instead of evaluating its placements.
  this.aiTiming.period=(CPU_PARAMETERS.periodDifficultyBase-(this.aiDifficulty??CPU_PARAMETERS.hardDifficulty))*CPU_PARAMETERS.periodScale;
  // ROM controller +0xb4 is initialized to 15. It counts down only while
  // the selected rotation differs, rather than expiring during idle/sweeps.
  this.aiRotation.wait=CPU_PARAMETERS.rotationRepeatTicks;
  this.aiRotationTarget=0; // New native controller +0xb8 is cleared each round.
  this.aiTravel=createNativeTravel();this.aiTool={targetColumn:0,panicTimer:0};this.aiPreviousKeys=0;this.aiEmptyActive=false;
  this.camera=[0,0];this.views=[createView(VIEW.nativeCameraOffsetInitial),createView(VIEW.nativeCpuCameraOffsetInitial)];
  this.nativeBg3Vofs=nativeBg3ScrollOffset(this.views[1].nativeCameraY);
  this.resultViews=null;this.resultTicks=0;this.resultExitTicks=null;this.resultExitLevel=null;this.lastLines=0;this.lastHeld=null;
  this.pendingControl={};this.nativeLoadingControl=null;this.introElapsed=0;this.introPickupAccumulator=0;
  if(intro&&this.p.mode==='survival'){
   this.phase='countdown';
   for(const [i,t]of [this.player,this.cpu].entries())if(t){
    // Fixed Castle/Space vessels attach both actors before the first
    // displayed tick; the moving-vessel fallback anchors are different.
    const fixedBoat=['castle','space'].includes(stage)?nativeRescueBoat(NATIVE_INTRO.initialFrame-1,i,t.nativeRescueOrigin,stage):null,
     body=fixedBoat?{x:fixedBoat.x/NATIVE_RESCUE.fixed+NATIVE_RESCUE.targetX,
      y:fixedBoat.y/NATIVE_RESCUE.fixed+(stage==='space'?NATIVE_RESCUE.spaceTargetY:NATIVE_RESCUE.targetY)}:NATIVE_INTRO.bodies[i],
     view=this.views[i];
    // Countdown palette entry 15 is black until the first outline upload.
    t.nativePreviewPaletteInitialColor=0;
    t.advanceIntroPickups();t.nativeFrame=NATIVE_INTRO.initialFrame;t.nativeActorState=t.nativeActorNextState=3;
    const float=i===1;
    t.nativeIntroVelocityQ16=Math.trunc(RULES.gravity*(float?RULES.floatGravity:1)*VIEW.tile*RULES.step**2*RULES.actorFixedScale);
    t.egg.vy=-t.nativeIntroVelocityQ16/RULES.actorFixedScale/(VIEW.tile*RULES.step);
    t.egg.x=body.x/VIEW.tile+1;
    t.egg.y=(RULES.nativeActorFloor-body.y)/VIEW.tile;t.egg.introOriginY=t.egg.y;t.egg.introDescent=true;t.egg.ground=false;
    view.nativeCameraOffset=NATIVE_INTRO.cameraOffset;view.nativeCameraPosition=0;
    view.previousNativeCameraPosition=0;view.previousPreviousNativeCameraPosition=0;
    view.nativeCameraY=0;view.nativeBoardCameraY=0;
    this.camera[i]=view.camera=VIEW.nativeCameraReferencePixels/VIEW.tile;
    view.boardCamera=view.camera;view.previousHeight=t.egg.y;
    advanceNativeMeter(view.meter,t.incompleteFloors||0);
    view.meterPose=nativeMeterPose(view.meter,t.incompleteFloors||0,t.nativeFrame);
   }
   this.nativeBg3Vofs=0;
   this.advanceWeather();
  }
  if(intro&&!this.roundLoadTicks){playNativeEffect(this.audio,SFX.ready);this.nativeLoadingReadyPlayed=true;}
  for(const [i,t]of [this.player,this.cpu].entries())if(t)seedNativeCameraActorY(this.views[i],t);
  if(this.phase==='countdown'){this.updateCPU(RULES.step);this.advanceAmbient();}
  this.nativeSound?.round(this.roundLoadingBudget);
 }
 advanceAmbient(){
  const fields=[this.player,this.cpu??this.player],actors=fields.map(t=>({
   x:Math.round((t.egg.x-1)*VIEW.tile*RULES.actorFixedScale),
   y:Math.round((RULES.nativeActorFloor-t.egg.y*VIEW.tile)*RULES.actorFixedScale)}));
  advanceNativeAmbient(this.nativeAmbient,this.player.artStage,actors,fields.map(t=>Math.min(RULES.nativeInitialBoardRows-t.height(),
   t.nativeCommittedAnchorRow?.frame===t.nativeFrame?t.nativeCommittedAnchorRow.row:Infinity)));
 }
 advanceWeather(){advanceNativeWeather(this.nativeWeather,this.player.artStage,()=>{this.nativeActorRandomSeed=nativeRandomStep(this.nativeActorRandomSeed);return this.nativeActorRandomSeed;},this.cpu?2:1,field=>{if(this.phase==='countdown'&&this.roundLoadTicks>0)this.nativeLoadingWeatherSounds++;else if(this.nativeAudioFrameEvents)this.nativeAudioFrameEvents.push({id:SFX.weather,phase:NATIVE_SOUND_PHASE.board,field,rank:0});else playNativeEffect(this.audio,SFX.weather);}); }
 advanceCountdownFrame(){
  advanceNativeAudio(this.audio,RULES.step);
  this.beginNativeAudioFrame();
  const countdownSound=NATIVE_INTRO_SOUND_EVENTS[this.bg3GlobalFrame+1];
  if(countdownSound)playNativeEffect(this.audio,countdownSound);
  if(this.nativeArenaMusicPending&&this.bg3GlobalFrame+1===NATIVE_MUSIC_TIMING.arenaCountdownTick){this.music?.start(this.nativeArenaMusicPending);this.nativeArenaMusicPending=null;}
  this.advanceWeather();
  // Match the normal native ordering: BG/actor display snapshots, camera,
  // state-3 actor following the old airship, then the next airship phase.
  this.nativeBg3Vofs=nativeBg3ScrollOffset(this.views[1]?.nativeCameraY??this.views[0].nativeCameraY);
  this.updateCPU(RULES.step);
  for(const [i,t]of [this.player,this.cpu].entries())if(t){
   const view=this.views[i];
   t.progressWorldY=Math.floor(RULES.nativeActorFloor-t.egg.y*VIEW.tile);
   t.nativeRenderCrates=t.crates.map(item=>item.nativeMotion?{...item,nativeSwayFrame:t.nativeFrame+(t.nativePickupSwayFrameOffset??0),
       nativeMotion:{...item.nativeMotion}}:item);
   t.nativeRenderFrame={x:t.egg.x,y:t.egg.y,camera:view.camera,held:null,rows:null,intro:true};
   // 0x0800fabc advances Y with its old velocity before camera tracking;
   // state 3 then replaces that position with the airship attachment point.
   t.nativeIntroCameraY=RULES.nativeActorFloor-t.egg.y*VIEW.tile+t.nativeIntroVelocityQ16/RULES.actorFixedScale;
   advanceView(view,t,RULES.step);this.camera[i]=view.camera;
   const boat=nativeRescueBoat(t.nativeFrame,i,t.nativeRescueOrigin,t.artStage);
   t.egg.x=(boat.x/NATIVE_RESCUE.fixed+NATIVE_RESCUE.targetX)/VIEW.tile+1;
   const worldY=boat.y/NATIVE_RESCUE.fixed+(t.artStage==='space'?NATIVE_RESCUE.spaceTargetY:NATIVE_RESCUE.targetY);
   t.egg.y=(RULES.nativeActorFloor-worldY)/VIEW.tile;
   const control=i?(this.introCpuControl??{}):this.readPlayerControl(),
    queued=i?null:this.nativeLoadingControl,
    float=Boolean(control.float||queued?.float),fast=Boolean(control.fast||queued?.fast);
   if(i===0)this.nativeLoadingControl=null;
   const gravity=RULES.gravity*(float?RULES.floatGravity:fast?RULES.fastGravity:1);
   const limit=float?RULES.floatFallSpeed:fast?RULES.fastFallSpeed:RULES.fallSpeed;
   t.nativeIntroVelocityQ16=Math.min(Math.round(limit*VIEW.tile*RULES.step*RULES.actorFixedScale),
       t.nativeIntroVelocityQ16+Math.trunc(gravity*VIEW.tile*RULES.step**2*RULES.actorFixedScale));
   t.egg.vy=-t.nativeIntroVelocityQ16/RULES.actorFixedScale/(VIEW.tile*RULES.step);
   t.advanceIntroPickups();
   const animationStep=t.artStage==='space'?NATIVE_INTRO.spaceAnimationStep:NATIVE_INTRO.animationStep,
    phase=(t.nativeFrame*animationStep)%(2*RULES.actorFixedScale);
   if(i===0){
    t.nativePlayerAnimationSelector=10;t.nativePlayerAnimationPhase=phase;
    t.nativePlayerAnimationStep=animationStep;t.nativePlayerAnimationPeriod=2;
   }else{
    t.nativeRivalAnimationSelector=10;t.nativeRivalAnimationPhase=phase;
    t.nativeRivalResourcePose=nativeRivalResourcePose(t);
   }
  }
  // State 3 already samples player keys. Do not discard held directions
  // on the first ordinary actor tick when the countdown releases it.
  this.nativePlayerPrimed=true;
  this.advanceAmbient();this.flushNativeAudioFrame();this.nativeSound?.end();this.bg3GlobalFrame++;
 }
 beginPlay(){this.phase='playing';const frames=Math.round(this.introElapsed/RULES.step);for(const t of [this.player,this.cpu])if(t?.egg.introDescent){const ticks=t.nativePickups?frames+NATIVE_INTRO.initialFrame:Math.max(0,frames-(RULES.enemyIntroPausedSteps[t.artStage]||0));if(!t.nativePickups)t.nativeFrame+=frames;t.bubble.life=Math.max(1,t.bubble.life-ticks);t.jumper.life=Math.max(1,t.jumper.life-ticks);t.space.life=Math.max(1,t.space.life-ticks);t.spaceSecondary.life=Math.max(1,t.spaceSecondary.life-ticks);t.factorySecondary.life=Math.max(1,t.factorySecondary.life-ticks);t.beanstalkSecondary.life=Math.max(1,t.beanstalkSecondary.life-ticks);t.parkPrimary.life=Math.max(1,t.parkPrimary.life-ticks);t.parkSecondary.life=Math.max(1,t.parkSecondary.life-ticks);t.jungleSecondary.life=Math.max(1,t.jungleSecondary.life-ticks);t.pirateSecondary.life=Math.max(1,t.pirateSecondary.life-ticks);t.castleSecondary.life=Math.max(1,t.castleSecondary.life-ticks);t.castle.life=Math.max(1,t.castle.life-ticks);t.dragon.life=Math.max(1,t.dragon.life-ticks);t.dragonSecondary.life=Math.max(1,t.dragonSecondary.life-ticks);t.egg.ground=false;t.nativeActorState=t.nativeActorNextState=0;t.nativeIntroCameraRelease=true;delete t.nativeIntroCameraY;}}
 resetSurvival(){this.nativeSound?.startSession?.({seed:this.seed,character:CHARACTER_ART[this.p.character].id,original:originalAudioRules(this.p,this.nativeHumanMatch)});this.nativeActorRandomSeed=this.seed&0xffff;if(this.p.mode==='survival')this.nativeActorRandomSeed=nativeRandomStep(this.nativeActorRandomSeed);this.startingStage=startingStageFromSeed(this.seed);this.round=1;this.wins=0;this.totalScore=0;this.startRound();}
 readPlayerControl(){
 const pressed=a=>this.input.isActionJustDown(a),down=a=>this.input.isActionDown(a);const digitalMove=Number(down('right'))-Number(down('left'));const stickX=digitalMove===0?this.input.getFirstGamepadAxis(GAMEPAD.moveAxis):0;const digitalVertical=Number(down('fast'))-Number(down('jump'));const stickY=digitalVertical===0?this.input.getFirstGamepadAxis(GAMEPAD.moveAxisY):0;const analogUp=stickY<=-GAMEPAD.moveDeadzone,analogDown=stickY>=GAMEPAD.moveDeadzone;return {move:digitalMove|| (Math.abs(stickX)>=GAMEPAD.moveDeadzone?Math.sign(stickX):0),jump:down('jump')||analogUp,float:down('jump')||analogUp,fast:down('fast')||analogDown,dive:down('dive'),discard:pressed('discard'),use:pressed('place'),rotate:pressed('rotate')?1:pressed('rotateBack')?-1:0};
 }
 updateResult(dt){
  const control=this.readPlayerControl();let first=true;
  this.accumulator+=dt;
  while(this.accumulator+(this.presentationSlack||0)+1e-9>=RULES.step){
   advanceNativeAudio(this.audio,RULES.step);
   this.beginNativeAudioFrame();
   this.resultTicks++;
   if(this.p.mode==='survival'&&this.resultTicks===(this.phase==='won'?NATIVE_RESULT_SOUND.winTick:NATIVE_RESULT_SOUND.lossTick))
    playNativeEffect(this.audio,this.phase==='won'?SFX.resultWin:SFX.resultLoss);
   if(this.resultExitTicks!==null&&++this.resultExitTicks>(this.resultExitLevel??PODIUM_VIEW.fadeTicks)){
    if(this.phase==='lost'){this.nativeSound?.end();openCharacterMenu(this);return;}
    this.round++;this.startRound();this.nativeSound?.end(false);return;
   }
   if(this.p.mode==='survival'&&this.resultTicks===PODIUM_VIEW.musicTick)this.music?.start(this.phase==='won'?'result-win':'result-loss');
   // Two final actor/OAM ticks run while the display is already black.
   if(this.p.mode==='survival'&&this.resultTicks>=PODIUM_VIEW.roundTicks+PODIUM_VIEW.entryDelay){this.flushNativeAudioFrame();this.nativeSound?.end(!(this.resultTicks>=PODIUM_VIEW.roundTicks+PODIUM_VIEW.entryDelay&&this.resultTicks<PODIUM_VIEW.musicTick));this.accumulator-=RULES.step;continue;}
   // Weather belongs to B074's gameplay camera pass. The podium does not
   // run that pass; ticking it invisibly can spend RNG and alter the next round.
   this.advanceWeather();
   for(const view of this.resultViews||[])advanceResultView(view);
   const sampled=first?control:{move:control.move,float:control.float,fast:control.fast,dive:control.dive};
   const playerControl=this.p.mode==='survival'?{nativeMotion:true,...nativePlayerControls(sampled,this.nativePlayerPrimed)}:sampled;
   this.nativePlayerPrimed=true;first=false;
   this.updateTower(this.player,RULES.step,playerControl,this.cpu,true);
   // The result overlay does not replace the native actor handler: the rival
   // must finish its throw and continue falling while WIN/LOSE is displayed.
   if(this.cpu){
    if(this.p.mode==='survival')this.aiTiming?.begin();
    const cpuControl=this.p.mode==='survival'?{nativeMotion:true}:{};
    if(this.cpu.nativeActorState===4&&this.cpu.nativeActorNextState===0)cpuControl.nativeFreezeActor=true;
    this.updateTower(this.cpu,RULES.step,cpuControl,this.player,true);
   }
   this.nativeBg3Vofs=nativeBg3ScrollOffset(this.views[1]?.nativeCameraY??this.views[0].nativeCameraY);
   for(const [i,t]of [this.player,this.cpu].entries())if(t){advanceView(this.views[i],t,RULES.step);finalizeNativeWaterCreatureSprite(t,RULES,this.views[i].nativeCameraPosition);this.camera[i]=this.views[i].camera;}
   this.advanceAmbient();this.flushNativeAudioFrame();this.nativeSound?.end();this.bg3GlobalFrame++;
   this.accumulator-=RULES.step;
  }
 }
 preparePauseSettings(s){return settings(s);}
 // Real RAF timestamps are quantized: sample the nearest fixed tick rather
 // than alternating repeated frames with two-step jumps around a tick edge.
 // Explicit offline update(step) calls retain their exact frame schedule.
 update(dt,frameDt){this.performanceMonitor?.begin(dt,frameDt);if(this.nativeSound?.preparing)return;if(frameDt!==undefined)dt*=NATIVE_CLOCK.nativeFPS/NATIVE_CLOCK.gameFPS;this.presentationSlack=frameDt===undefined?0:RULES.step*RULES.presentationTickPhase;if(this.phase==='character-select'){updateCharacterMenu(this,dt);if(this.phase==='character-select')advanceCharacterMenuAudio(this,dt);return;}if(this.input.isActionJustDown('restart')){this.resetSurvival();return;}if(this.phase==='countdown'&&this.roundLoadTicks>0){
  // VBlank 3140 ORs keys into 0200008c while the main loop loads assets.
  // The first following actor input consumes even keys released during loading.
  const control=this.readPlayerControl(),queued=this.nativeLoadingControl??={float:false,fast:false};
  queued.float||=Boolean(control.float);queued.fast||=Boolean(control.fast);
  // Loading consumes GBA ticks, not browser paint callbacks. In particular,
  // a144Hz monitor must not run its audio/VBlank passes2.4times too fast.
  this.roundLoadAccumulator=(this.roundLoadAccumulator??0)+dt;
  while(this.roundLoadTicks>0&&this.roundLoadAccumulator+1e-9>=RULES.step){
   this.nativeSound?.loadingFrame();this.roundLoadAccumulator-=RULES.step;
   this.roundLoadTicks--;if(!this.nativeLoadingReadyPlayed&&this.roundLoadTicks===(this.roundLoadingBudget?.ticks-this.roundLoadingBudget?.soundTicks||0)){this.nativeLoadingReadyPlayed=true;for(let i=0;i<(this.nativeLoadingWeatherSounds||0);i++)playNativeEffect(this.audio,SFX.weather);this.nativeLoadingWeatherSounds=0;playNativeEffect(this.audio,SFX.ready);}this.nativeSound?.end(this.roundLoadTicks===0);
  }
  if(this.roundLoadTicks>0)return;
  dt=Math.max(0,this.roundLoadAccumulator);this.roundLoadAccumulator=0;if(dt<=1e-9)return;
 }if(this.phase==='countdown'){const used=Math.min(dt,Math.max(0,VIEW.introDuration-this.introElapsed));this.introElapsed+=used;this.introPickupAccumulator+=used;while(this.introPickupAccumulator+(this.presentationSlack||0)+1e-9>=RULES.step){this.advanceCountdownFrame();this.introPickupAccumulator-=RULES.step;}dt-=used;if(this.introElapsed+1e-9<VIEW.introDuration)return;this.beginPlay();if(dt<=1e-9)return;}if(this.phase!=='playing'){if((this.input.isActionJustDown('continue')||this.input.isActionJustDown('place'))&&(this.p.mode!=='survival'||this.resultTicks>=PODIUM_VIEW.confirmTick)){if(this.p.mode==='survival'){if(this.resultExitTicks===null){this.resultExitLevel=Math.round(resultOpacity(this.resultTicks+1)*PODIUM_VIEW.fadeTicks);this.resultExitTicks=-1;}this.updateResult(dt);}else this.resetSurvival();}else this.updateResult(dt);return;}
 const control=this.readPlayerControl();
 for(const key of ['jump','dive','discard','use','rotate'])if(control[key])this.pendingControl[key]=control[key];Object.assign(control,this.pendingControl);this.accumulator+=dt;let first=true;while(this.accumulator+(this.presentationSlack||0)+1e-9>=RULES.step){advanceNativeAudio(this.audio,RULES.step);this.beginNativeAudioFrame();this.advanceWeather();const sampled=first?control:{move:control.move,float:control.float,fast:control.fast,dive:control.dive};let playerControl=sampled;if(this.p.mode==='survival'){playerControl={nativeMotion:true,...nativePlayerControls(sampled,this.nativePlayerPrimed)};this.nativePlayerPrimed=true;}this.updateTower(this.player,RULES.step,playerControl,this.cpu);// A player rescue commits the result before the CPU input phase in
 // this same tick. Its actor still moves, with neutral result controls.
 if(this.p.mode==='survival'&&(this.player.won||this.player.lost||this.cpu?.won||this.cpu?.lost)){
  if(this.cpu){const neutral={nativeMotion:true};
   if(this.cpu.nativeActorState===4&&this.cpu.nativeActorNextState===0)neutral.nativeFreezeActor=true;
   this.updateTower(this.cpu,RULES.step,neutral,this.player,true);
  }
 }else this.updateCPU(RULES.step);
 this.nativeBg3Vofs=nativeBg3ScrollOffset(this.views[1]?.nativeCameraY??this.views[0].nativeCameraY);for(const [i,t]of [this.player,this.cpu].entries())if(t){advanceView(this.views[i],t,RULES.step);finalizeNativeWaterCreatureSprite(t,RULES,this.views[i].nativeCameraPosition);this.camera[i]=this.views[i].camera;}this.flushNativeParticles();this.advanceAmbient();this.flushNativeAudioFrame();this.advanceNativeAudioProgress();this.bg3GlobalFrame++;this.elapsed+=RULES.step;this.accumulator-=RULES.step;this.pendingControl={};first=false;if(this.player.won||this.player.lost||this.cpu?.won||this.cpu?.lost){this.finish();this.nativeSound?.end();break;}this.nativeSound?.end();}
 this.lastLines=this.player.lines;this.lastHeld=this.player.held;
 }
 beginNativeAudioFrame(){
  this.nativeAudioFrameEvents=[];
  for(const t of [this.player,this.cpu])if(t)t.nativeAudioFrameEvents=this.nativeAudioFrameEvents;
 }
 advanceNativeAudioProgress(){
  if(this.p.mode!=='survival'||!this.cpu)return;
  const p=NATIVE_AUDIO_PROGRESS,state=this.nativeAudioProgress??={tempo:0,leadWarned:false};
  // B074 retains the just-inserted piece's roof for this tick, even when
  // the subsequent loose-owner pass already moved it down by one row.
  const roof=Math.min(RULES.nativeBoardRows-this.cpu.height(),
    this.cpu.nativeCommittedAnchorRow?.frame===this.cpu.nativeFrame?this.cpu.nativeCommittedAnchorRow.row:Infinity);
  const remaining=roof-p.roofBias,
   range=(this.cpu.p.nativeConfig?.height??this.cpu.p.goal)-p.heightBias;
  const adjustment=remaining<(range>>2)?-3:remaining<Math.trunc(range/p.tempoThirdDivisor)?-2:remaining<(range>>1)?-1:0;
  if(state.tempo!==0&&!state.leadWarned&&(this.cpu.nativeDividerPendingProgress??0)>(this.player.nativeDividerPendingProgress??0)){
   state.leadWarned=true;playNativeEffect(this.audio,p.leadCue);
  }
  if(adjustment<state.tempo){
   for(let i=state.tempo;i>adjustment;i--){this.audio?._nativeTempoRequest?.(-1);this.audio?._eggoNative?.tempo(-1);}
   state.tempo=adjustment;
  }
 }
 flushNativeAudioFrame(){
  const events=this.nativeAudioFrameEvents;
  if(!events)return;
  events.sort((a,b)=>a.phase-b.phase||a.field-b.field||a.rank-b.rank);
  for(const event of events)playNativeEffect(this.audio,event.id);
  for(const t of [this.player,this.cpu])if(t)t.nativeAudioFrameEvents=null;
  this.nativeAudioFrameEvents=null;
 }
 flushNativeParticles(){
  const pending=this.nativeParticleQueue;if(!pending)return;
  // ROM 0x08018e70 runs projectile passes / boots (phase 0), then both actor
  // handlers (completion phase 1), then both loose-pickup handlers (phase 2).
  // Their shared pool allocation order is visible when particles overlap or slots fill.
  pending.sort((a,b)=>a.phase-b.phase);
  for(const event of pending){
   const postCamera=this.views?.[event.tower.fieldIndex]?.camera??null;
   event.tower.allocateNativeParticle(event.x,event.y,event.type,event.phase,postCamera,event.beforeCamera);
  }
  for(const tower of [this.player,this.cpu])if(tower)tower.nativeParticleQueue=null;
  this.nativeParticleQueue=null;
 }
 updateTower(t,dt,c,opponent,afterResult=false){if((t.lost||t.won)&&!afterResult){if(t.fieldIndex===1)this.flushNativeParticles();return;}
  // Both BG maps were queued before either field handles an attack. Save
  // the CPU board before the player can remove its cells with a bomb.
  if(t.fieldIndex===0&&opponent?.p.columns===7)
   opponent.nativeBoardRowsBeforePlayerUpdate=snapshotNativeBoardRows(opponent.rows);
  if(t.fieldIndex===0&&c.nativeMotion){
   this.flushNativeParticles();
   this.nativeParticleQueue=[];
   for(const tower of [this.player,this.cpu])if(tower)tower.nativeParticleQueue=this.nativeParticleQueue;
  }
  // Floor accounting (ROM 0x08003020) runs before placements, and the resulting
  // descriptor reaches OAM on the next update. Keep both phases instead of exposing a
  // just-completed floor in the divider one tick before the native counter.
  // 0x08003020 belongs to active play. A throw can still complete during
  // WIN/LOSE, but the displayed full-floor counter stays at the result value.
  if(!afterResult){
   const progress=t.nativeCountFullFloors?t.nativeCountFullFloors():(t.lines||0);
   t.nativeDividerProgress=t.nativeDividerPendingProgress??progress;
   t.nativeDividerPendingProgress=progress;
  }
  t.progressWorldY=Math.floor(RULES.nativeActorFloor-t.egg.y*RULES.projectilePixels);t.nativeCameraControl=c;
  // GBA OAM is built before the actor handler advances position/inventory.
  // Keep that display snapshot so the next render uses the same state as OAM.
  const held=t.held,view=this.views?.[t.fieldIndex],previousPose=actorPose(t),placing=t.placing;
  // The GBA prepares the landing outline before the actor consumes a held
  // piece. Keep that exact preview for this rendered frame; after a throw the
  // live model has already cleared `held`, one update before OAM does.
  const nativePreviewSnapshot=c.nativeMotion&&t.p.columns===7?(()=>{
   const preview=t.preview(),rotation=t.nativePreviewRotation,
    heldSnapshot=held?{...held,cells:Array.isArray(held.cells)?held.cells.map(([x,y])=>[x,y]):held.cells}:null;
   return{held:heldSnapshot,heldIdentity:held,position:t.nativePreviewPosition?{...t.nativePreviewPosition}:null,
    preview:preview?{...preview,cells:preview.cells.map(([x,y])=>[x,y])}:preview,
    rotation:rotation?{...rotation,held:null,
     affineMatrix:Array.isArray(rotation.affineMatrix)?rotation.affineMatrix.slice():rotation.affineMatrix,
     turn:rotation.turn?{...rotation.turn}:null,
     turnQueue:Array.isArray(rotation.turnQueue)?rotation.turnQueue.slice():[]}:null};
  })():null;
  if(nativePreviewSnapshot?.preview&&nativePreviewSnapshot.position&&!placing){
   const position=nativePreviewSnapshot.position,bounds=VIEW.nativePreviewViewport,
    x=Math.floor(position.xQ16/RULES.actorFixedScale),
    y=Math.floor(position.yQ16/RULES.actorFixedScale)-Math.floor(view?.nativeCameraPosition??VIEW.nativeCameraReferencePixels);
   // A culled outline does not upload the white OBJ palette. Logical preview
   // validity alone must not erase the last material palette below the screen.
   if(x>bounds.left&&x<bounds.right&&y>bounds.top&&y<bounds.bottom){
    t.nativePiecePaletteMaterial=null;t.nativePreviewPaletteInitialColor=null;
   }
  }
  // The ROM builds OBJ state before advancing the actor. Preserve the throw
  // sprite through its landing update; its displayed affine pose is the one
  // that update is about to write, even when the model commits the piece.
  t.nativeRenderPlacing=placing?.nativeHeld?{...placing,
   ticks:(placing.ticks??0)+dt/RULES.step}:null;
  // Native pickup OAM is prepared before the actor/pickup update. Preserve the
  // same pre-update position so motion and camera changes appear one frame later.
  t.nativeRenderCrates=t.crates.map(item=>item.nativeMotion?{...item,nativeSwayFrame:t.nativeFrame+(t.nativePickupSwayFrameOffset??0),
   nativeMotion:{...item.nativeMotion}}:item);
  t.nativeRenderFrame={x:t.egg.x,y:t.egg.y,camera:view?.camera??this.camera[t.fieldIndex]??0,
   // The first ordinary actor update still uploads the preceding state-3
   // sprite. Camera release is cleared only after this OAM snapshot.
   intro:Boolean(t.nativeIntroCameraRelease),
   // The ROM's BG board map receives a completed placement on the next tick.
   // Keep the pre-update cells for rendering while gameplay uses the live rows.
   rows:t.p.columns===7?(t.nativeBoardRowsBeforePlayerUpdate??snapshotNativeBoardRows(t.rows)):null,
   pose:previousPose,rivalPoseState:t.nativeRivalPose?.state??t.nativeRivalPoseState??null,
   rivalResourcePose:t.nativeRivalResourcePose?{...t.nativeRivalResourcePose}:null,
   animationPose:t.fieldIndex===0&&c.nativeMotion?nativePlayerAnimationPose(t):null,
   animationClock:t.fieldIndex===0&&c.nativeMotion?{selector:t.nativePlayerAnimationSelector??0,
    state:t.nativePlayerAnimationState??null,table:t.nativePlayerAnimationTable??null,
    period:t.nativePlayerAnimationPeriod??0,phase:t.nativePlayerAnimationPhase??0,
    step:t.nativePlayerAnimationStep??0}:null,
   facing:t.egg.facing,walking:t.egg.walking,heldReady:t.nativeHeldDisplayReady!==false,
   held:held?{...held,cells:Array.isArray(held.cells)?held.cells.map(([x,y])=>[x,y]):held.cells}:null,
   nativePreviewSnapshot};
  t.nativeBoardRowsBeforePlayerUpdate=null;
  const nextRandom=()=>{this.nativeActorRandomSeed=nativeRandomStep(this.nativeActorRandomSeed);return this.nativeActorRandomSeed;};
  const previousPlayerPose=t.fieldIndex===0&&c.nativeMotion?previousPose:null;
  // 0x0801b250 advances the hammer's shared slot angle only when that
  // object is submitted to OAM. Flight outside the viewport freezes it.
  for(const h of t.hammers){
   if(h.nativeSkippedPass)continue;
   if(h.pending){h.nativeSpriteVisible=false;continue;}
   const x=Math.floor(h.x*RULES.projectilePixels),boundary=this.p.columns*RULES.projectilePixels,
    // 0x08004582..459e keeps x=112 on the destination field for
    // a left-moving CPU shot; a player shot changes fields at x=112.
    side=t.fieldIndex===1?(x>boundary?1:0):(x>=boundary?1:0),
    camera=this.views?.[side]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels,
    y=Math.floor(RULES.nativeBoardFloor-h.y*RULES.projectilePixels)-Math.floor(camera);
   h.nativeSpriteVisible=x>=-15&&x<=255&&y>-16&&y<160;
   const angles=t.nativeProjectileVisualAngles??=Array(CPU_PARAMETERS.projectileSlots).fill(0),slot=h.nativeSlot??0;
   if(h.nativeSpriteVisible)angles[slot]=(angles[slot]+RULES.hammerSpriteAngleStep)%RULES.hammerSpriteAnglePeriod;
   h.nativeAngle=angles[slot];
  }
  // Projectile sprites have their own 24-tick flame clock (+0x28), advanced
  // before the visibility test in ROM 0x0801b25e..1b26a.
  const flameClocks=t.nativeProjectileFlameClocks??=Array(CPU_PARAMETERS.projectileSlots).fill(0);
  for(const b of [...t.bombs,...t.hammers])if(!b.pending&&!b.nativeSkippedPass){
   const slot=b.nativeSlot??0;
   flameClocks[slot]=(flameClocks[slot]+1)%NATIVE_BOMB_ART.clockPeriod;
   b.nativeFlameClock=flameClocks[slot];
  }
  t.nativeRenderProjectiles=[...t.bombs,...t.hammers].filter(b=>!b.pending).map(b=>{
   if(b.nativeSkippedPass){
    b.nativeSkippedPass=false;
    // The original builds a fresh OAM list. An aborted slot pass retains
    // object state but does not submit later slots on that queued frame.
    return {...b,nativeSpriteVisible:false};
   }
   return {...b};
  });
  advanceActorVisual(t,nextRandom,Boolean(c.nativeMotion));const before=t.jumpSerial;t.update(dt,c,opponent,afterResult);
  if(t.nativeActorState===6&&t.nativeActorHandlerState!==6&&t.fieldIndex===0)
   t.nativeRenderFrame.animationPose??=previousPlayerPose;
  if(c.nativeMotion&&t.p.columns===7){
   // Pickup allocation follows outline/OAM preparation in the ROM. A newly
   // caught item therefore does not acquire its outline on that same tick.
   // +0x880 (outline valid) is initialized by the actor update after catching,
   // then its OAM becomes visible one update later. Catching during the throw
   // commit is blocked in model.js, rather than hidden with an extra timer.
   if(t.held!==held){
    t.nativePreviewPosition=null;
   }else t.advanceNativePreviewPosition();
   // The held-icon descriptor is prepared before pickup dispatch, then the
   // next OAM upload displays it. Inventory itself becomes available sooner.
   t.nativeHeldDisplayReady=t.held===held||Boolean(t.nativeProjectileCaughtThisTick);
   if(t.placing?.nativeHeld){
    t.nativePiecePaletteMaterial=t.placing.nativeHeld.nativeKind;
    // A throw also replaces the initial OBJ palette, even when no outline
    // has ever entered the viewport. The next outline retains its material.
    if(t.placing.ticks>=3)t.nativePreviewPaletteInitialColor=null;
   }
  }
  if(t.fieldIndex===0&&c.nativeMotion){
   const beforeRandom=this.nativeActorRandomSeed;
   advanceNativePlayerPose(t,previousPlayerPose,nextRandom);
   t.nativePlayerPoseRandomRead=beforeRandom!==this.nativeActorRandomSeed?
    {before:beforeRandom,after:this.nativeActorRandomSeed,frame:t.nativeFrame}:null;
  }else if(t.fieldIndex===1&&c.nativeMotion){
   // Both 4458 projectile passes precede the native actor animation handlers.
   // A late incoming hit replaces the player's idle handler before it reads
   // RNG. Cancel that tentative read before the rival advances its own phase.
   const read=opponent?.nativePlayerPoseRandomRead;
   if(opponent?.egg?.lightning&&opponent.nativePlayerAnimationSelector!==11&&
      read?.frame===opponent.nativeFrame&&this.nativeActorRandomSeed===read.after)
    this.nativeActorRandomSeed=read.before;
   advanceNativeRivalPose(t,nextRandom);
  }
  if(t.fieldIndex===1)t.nativeProjectileCaughtThisTick=false;
  // Incoming bombs can change player inventory after its own update. The
  // native actor's air-table pointer changes on that catch, without another
  // phase step; the already-prepared current OAM picture stays unchanged.
  if(t.fieldIndex===1&&opponent?.nativeProjectileCaughtThisTick){
   const table=NATIVE_PLAYER_AIR_TABLES[opponent.nativePlayerAnimationState];
   if(opponent.nativePlayerAnimationSelector===5&&table&&opponent.held)
    opponent.nativePlayerAnimationTable=table.held;
   else if([3,4].includes(opponent.nativePlayerAnimationSelector)&&opponent.held)
    opponent.nativePlayerAnimationTable='0x083f2248';
   opponent.nativeProjectileCaughtThisTick=false;
  }
  if(t.fieldIndex===1&&opponent?.egg?.lightning&&opponent.nativePlayerAnimationSelector!==11){
   opponent.nativePlayerAnimationSelector=11;
   opponent.nativePlayerAnimationPhase=0x4000;
   opponent.nativePlayerAnimationState=5;
   opponent.nativePlayerAnimationTable='group-5';
   opponent.nativePlayerAnimationStep=0x4000;
   opponent.nativePlayerAnimationPeriod=4;
   opponent.nativePlayerPostThrowPoseTicks=0;
   opponent.nativeActorRandomActive=false;
  }
  
  playTowerAudio(this.audio,t,before);}
 stepCPUActor(t,dt,nextControl,opponent){
  // The CPU controller keeps its route and direction timers running while
  // state 3 attaches its body to the airship; its keys still affect gravity.
  if(this.phase==='countdown'){this.introCpuControl={...nextControl};this.lastModelControl=nextControl;return;}
  if(this.p.mode==='survival'&&t.p.columns===7){
   // The native CPU key word is the actor input for this same update. In the
   // ROM trace, frame 42 emits RIGHT+UP and the actor moves two pixels in that
   // frame; queueing held directions here made the reconstructed actor lag.
   const applied={nativeMotion:true,...(nextControl??{})};
   if(t.nativeActorState===4&&t.nativeActorNextState===0)applied.nativeFreezeActor=true;
   this.aiPendingControl={};
   this.lastModelControl=nextControl??{};
   this.updateTower(t,dt,applied,opponent);return;
  }
  this.updateTower(t,dt,nextControl,opponent);
 }
 nativePieceControl(t,c,orientation,rotationPending,candidateSweep=false){
  const p=CPU_PARAMETERS,context=nativeBoardContext(t),state=this.aiTravel;
  const x=Math.round((t.egg.x*p.cellPixels-p.cellPixels)*p.fixedScale);
  const start=Math.floor((Math.floor(x/p.fixedScale)+p.actorColumnBias)/p.cellPixels);
  const target=Math.floor(this.aiPlan.x),roofRow=context.heights[start];
  const row=Math.floor((Math.floor(p.actorNativeFloor-t.egg.y*p.cellPixels)+p.actorRowBias)/p.cellPixels);
  const vy=Math.round(-t.egg.vy*p.cellPixels/p.framesPerSecond*p.fixedScale);
  const margin=t.egg.boost>0?p.bootsJumpMargin:p.normalJumpMargin;
  // During an incomplete sweep the ROM exits before route/jump planning. Its
  // direction helper ORs the shared default Up mask only when it moves.
  if(candidateSweep){
   const direction=nativeSweepDirection(t);
   c.move=direction;c.jump=c.float=Boolean(direction&&(p.sweepBaseKeys&p.upKey));c.nativeMotion=true;
   c.dive=false;c.use=false;c.nativeEarly=true;return;
  }
  if(vy===0)state.groundRow=row;
  if(start===target)state.waypoint=start;
  let keys=0;c.nativeMotion=true;
  // The ROM's filler branch commits directly once the actor column reaches
  // its selected column. Odd native frames defer; even frames press Use.
  // This bypasses the generic placement counter and route steering.
  if(!rotationPending&&t.held?.nativeKind===10&&start===target){
   c.nativeEarly=true;c.use=((t.nativeFrame+1)&1)===0;c.rotate=0;
   if(c.use)this.aiTiming.clock=0;
   return;
  }
  if(state.waypoint===start&&start===target){
   const tool=t.held.nativeKind>7;
   const bombReady=t.held.nativeKind!==8||nativeBombCanCommit({fuse:Math.round((t.held.fuse??RULES.bombFuse)*p.framesPerSecond),rotation:orientation,roughness:context.roughness,frame:t.nativeFrame+1,pickupTarget:this.aiProjectileTarget,difficulty:this.aiDifficulty??p.hardDifficulty});
   if(tool&&!bombReady)this.aiPlacement.wait=0;
   const preview=t.preview(),best=this.aiSearch?.best;
   let readyPreview=false;
   if(preview){
    if(best){
     const mask=NATIVE_PIECE_MASKS[orientation*8+t.held.nativeKind];
     const minX=Math.min(...mask.map(v=>v[0])),maxY=Math.max(...mask.map(v=>v[1]));
     readyPreview=best.anchorX===preview.x-minX&&best.anchorY<=46-preview.y-maxY;
    }else readyPreview=!this.aiPlan.dive||preview.y===this.aiPlan.gapY;
   }
   // The native routine starts the timer when the projected landing matches
   // the selected candidate, including while the actor is airborne. After Use,
   // the actor enters native action state 4; while that throw is in progress,
   // ROM does not start a second placement timer even though the same preview
   // can remain visible in RAM.
   const actorReady=(t.nativeActorState??0)===0;
   if(!candidateSweep&&!rotationPending&&actorReady&&bombReady&&(tool||(row===roofRow&&vy===0)||readyPreview)){
    const action=this.aiPlacement.step({kind:t.held.nativeKind,targetRotation:orientation,
     actorRow:row,roofRow,frame:t.nativeFrame+1,difficulty:this.aiDifficulty??p.hardDifficulty});
    if(action==='use'||action==='dive'||action==='defer'){
     c.use=action==='use';c.dive=action==='dive';c.nativeEarly=true;c.rotate=0;
     if(c.use&&!tool)this.aiTiming.clock=0;
     return;
    }
   }else if(row>context.heights[target]&&vy<=0){keys|=p.upKey;state.counterD4=0;}
  }else if(state.waypoint!==-1)this.aiProjectileTarget=p.noPickupTarget;
 const travel=advanceNativeTravel(state,{heights:context.heights,start,target,row,vy,margin,
   kind:t.held.nativeKind,keys,sideFlag:nativeWaterTravelFlag(t),frame:t.nativeFrame+1});
 keys=travel.keys;
  if(travel.early){
   c.nativeEarly=true;c.rotate=0;c.use=Boolean(keys&p.useKey);
   if(c.use&&t.held.nativeKind<=7)this.aiTiming.clock=0;
  }else keys=nativeSteeringKeys({x,vy,actorColumn:start,targetColumn:target,
   waypointColumn:state.waypoint,kind:t.held.nativeKind,pickupTarget:this.aiProjectileTarget,keys});
 c.move=Number(Boolean(keys&p.rightKey))-Number(Boolean(keys&p.leftKey));
 c.jump=c.float=Boolean(keys&p.upKey);c.dive=Boolean(keys&p.diveKey);
 }
 nativeToolControl(t,c){
  const p=CPU_PARAMETERS,context=nativeBoardContext(t),state=this.aiTool??={targetColumn:0,panicTimer:0};
  const action=nativeToolDecision(state,{kind:t.held.nativeKind,
   actorColumn:Math.floor((Math.floor(t.egg.x*p.cellPixels-p.cellPixels)+p.actorColumnBias)/p.cellPixels),
   heights:context.heights,enemyHeights:nativeBoardContext({rows:this.player.nativeRenderFrame?.rows??this.player.rows}).heights,
   gaps:context.heights.map((_,col)=>nativeColumnGap(context,col)),
   fuse:Math.round((t.held.fuse??RULES.bombFuse)*p.framesPerSecond),frame:t.nativeFrame+1,fieldIndex:t.fieldIndex,
   pickupTarget:this.aiProjectileTarget,difficulty:this.aiDifficulty??p.hardDifficulty});
  // +0 is shared by piece search, tools and empty-hand pickup routing.
  // A retained best score does not restore an old piece destination.
  this.aiTravel.targetColumn=state.targetColumn;
  if(action!=='plan'){
   c.nativeEarly=true;c.nativeMotion=true;c.use=action==='use';
   if(c.use)this.aiTiming.waitAfterAction(this.aiDifficulty??p.hardDifficulty);
   return;
  }
  this.aiPlan={x:state.targetColumn+0.5,r:0};
  this.nativePieceControl(t,c,t.held.nativeVariant??0,false);
  if(c.use)this.aiTiming.waitAfterAction(this.aiDifficulty??p.hardDifficulty);
 }
 nativeEmptyControl(t,c,projectileChoice){
  const p=CPU_PARAMETERS,state=this.aiTravel,context=nativeBoardContext(t),s=p.fixedScale;
  const x=Math.round((t.egg.x*p.cellPixels-p.cellPixels)*s);
  const y=Math.round((p.actorNativeFloor-t.egg.y*p.cellPixels)*s);
  const start=Math.floor((Math.floor(x/s)+p.actorColumnBias)/p.cellPixels);
  const row=Math.floor((Math.floor(y/s)+p.actorRowBias)/p.cellPixels);
  const vy=Math.round(-t.egg.vy*p.cellPixels/p.framesPerSecond*s);
  const pickups=[];
  // The original linked list inserts newly created pickups at its head.
  for(let i=t.crates.length-1;i>=0;i--){
   const crate=t.crates[i],motion=crate.nativeMotion;
   if(motion?.active===false)continue;
   pickups.push({id:i+1,x:Math.round((motion?.x??crate.x*p.cellPixels-p.pickupActorXBias)*s),
    y:Math.round((motion?.y??p.actorNativeFloor+RULES.pickupActorBias-crate.y*p.cellPixels)*s),
    kind:crate.nativeKind??0});
  }
  const choice=projectileChoice?.action==='catch'?{nearPickup:false}:
   selectNativePickupTarget(state,{actorX:x,actorY:y,heights:context.heights,pickups,
    difficulty:this.aiDifficulty??p.hardDifficulty});
  if(vy===0)state.groundRow=row;
  if(start===state.targetColumn)state.waypoint=start;
  else if(state.waypoint!==-1)this.aiProjectileTarget=p.noPickupTarget;
  // The source's extra mapped button is zero in the captured GBA defaults.
  if(state.counterD4>0)state.counterD4--;
  const travel=advanceNativeTravel(state,{heights:context.heights,start,target:state.targetColumn,
   row,vy,kind:-1,margin:t.egg.boost>0?p.bootsJumpMargin:p.normalJumpMargin,
   nearPickup:choice.nearPickup,sideFlag:nativeWaterTravelFlag(t),frame:t.nativeFrame+1});
  let keys=travel.keys;c.nativeMotion=true;c.nativeEarly=travel.early;
  if(!travel.early)keys=nativeSteeringKeys({x,vy,actorColumn:start,targetColumn:state.targetColumn,
   waypointColumn:state.waypoint,idleTarget:state.idleTarget,kind:-1,pickupTarget:this.aiProjectileTarget,keys});
  c.move=Number(Boolean(keys&p.rightKey))-Number(Boolean(keys&p.leftKey));
  c.jump=c.float=Boolean(keys&p.upKey);c.dive=Boolean(keys&p.diveKey);
 }
 updateCPU(dt){const t=this.cpu;if(!t)return;this.aiClock-=dt;const c={};
 const difficulty=this.aiDifficulty??CPU_PARAMETERS.hardDifficulty;
 const timing=t.p.columns===7?(this.aiTiming??=new NativeCpuTiming()):null;
 if(timing&&(!timing.begin()||t.placing||t.egg.bubble||t.egg.carried)){
  this.stepCPUActor(t,dt,{},this.player);return;
 }
 // Native actor state 4 is the airborne throw animation after Use. The ROM
 // continues its frame timers but emits no CPU movement, rotation, or item
 // commands until that action state ends.
 // ROM 6808 checks the current actor state. The final state-4 handoff
 // still exits before steering/rotation even when its next state is zero.
 if(timing&&t.nativeActorState===4){this.stepCPUActor(t,dt,{},this.player);return;}
 let projectileChoice;this.aiProjectileTarget=CPU_PARAMETERS.noPickupTarget;
 if(timing&&this.p.mode==='survival'){
  const p=CPU_PARAMETERS,s=p.fixedScale;
  // CPU terrain heights, like projectile slots, precede this tick's player
  // placement. Reading live rows changes the discard gate one tick early.
  // CPU planning observes projectile slots before this tick's physics,
  // including the transition from flying (-1) to catchable (>0).
  const incoming=(this.player.nativeRenderProjectiles??[...this.player.bombs,...this.player.hammers]).filter(b=>!b.pending&&b.nativeSlot<p.projectileSlots)
   .sort((a,b)=>a.nativeSlot-b.nativeSlot).map(b=>({active:true,flightCounter:b.flightCounter??-1,
    x:Math.round(b.x*p.cellPixels*s),y:Math.round((RULES.nativeBoardFloor-b.y*p.cellPixels)*s)}));
  projectileChoice=nativeProjectileTarget(this.aiTravel,{projectiles:incoming,
   heights:nativeBoardContext({rows:t.nativeBoardRowsBeforePlayerUpdate??t.rows}).heights,
   enemyHeights:nativeBoardContext({rows:this.player.nativeRenderFrame?.rows??this.player.rows}).heights,fieldIndex:t.fieldIndex,kind:t.held?.nativeKind??-1,
   frame:t.nativeFrame+1,difficulty});
  this.aiProjectileTarget=projectileChoice.pickupTarget;
  if(projectileChoice.action==='discard'||projectileChoice.action==='defer'){
   this.stepCPUActor(t,dt,projectileChoice.action==='discard'?{discard:true}:{},this.player);return;
  }
 }
 if(t.held!==this.aiHeld){const previousHeld=this.aiHeld;this.aiHeld=t.held;this.aiEmptyActive=false;
  if(previousHeld?.cells&&!t.held&&this.aiSearch?.state===2){
   this.aiTravel.state=0;
   // The ROM spends the actor-4 -> actor-0 throw transition frame before
   // empty-hand steering starts. Other empty-hand entries act immediately.
   if(t.nativeActorState===4&&t.nativeActorNextState===0)this.aiEmptyWait=1;
  }
  // The ROM's +0xdc/+0xe0 candidate cursor and best score survive inventory
  // changes. A new native piece resumes that rolling search at its next
  // candidate instead of restarting all 28 positions from column zero.
  if(t.p.columns===7&&nativeHeldRotation(t.held)!==null)this.aiSearch??=new NativePieceSweep();
  else if(t.p.columns!==7)this.aiSearch=null;
  this.aiPlan=this.aiSearch?null:plan(t);
  this.aiTool={targetColumn:this.aiTravel.targetColumn??0,panicTimer:this.aiTool?.panicTimer??0};
  this.aiClock=this.p.aiDelay/(1+(this.round-1)*0.12);}
 if(timing&&Number.isInteger(t.held?.nativeKind)){
  const gate=timing.inventoryGate(t.held.nativeKind,t.nativeFrame+1,difficulty);
  if(gate!=='plan'){
   if(gate==='use')this.aiPlan=null;
   this.stepCPUActor(t,dt,gate==='use'?{use:true}:{},this.player);return;
  }
 }
 // The ROM freezes its rolling candidate cursor while the actor is in the
 // post-Use throw state (native actor state 4). Advancing it during that
 // animation makes later decisions several candidates ahead of the ROM.
 if(this.aiSearch&&t.held?.cells&&!t.placing&&this.aiClock<=0&&(t.nativeActorState??0)!==4){
  const previousBest=this.aiSearch.bestScore;
  const candidate=this.aiSearch.step(t,timing.clock,difficulty);
  // The ROM writes +0xb8 whenever a strictly better partial candidate is
  // found, before the 28-position sweep has completed. Keep the actor's
  // rotation target in sync during that rolling search as well.
  if(this.aiSearch.bestScore>previousBest){
   this.aiRotationTarget=this.aiSearch.bestRotation;
   this.aiTravel.targetColumn=this.aiSearch.targetColumn;
  }
  // ROM 0x08007054..70aa arms the half-square wait whenever the incoming
  // score is still -9999, even if this candidate has no valid placement.
  if(timing&&previousBest===CPU_PARAMETERS.initialBestScore)
   timing.waitAfterScoreImprovement(difficulty);
  if(candidate!==undefined){
   this.aiPlan=candidate?{...candidate,x:this.aiTravel.targetColumn+0.5}:candidate;
   // A completed search with no positive-scoring placement returns null.
   // It is a valid "no plan" result, not a candidate object.
   if(candidate&&!candidate.candidateSweep){
    const current=nativeHeldRotation(t.held);
    if(current!==null)this.aiRotationTarget=(current+(candidate.r||0))&3;
   }
  }
  else if(this.aiSearch.state===1)
   this.aiPlan={x:this.aiSearch.targetColumn+0.5,r:0,candidateSweep:true};
 }
 // ROM 70ac..70e6 retains its rolling candidate cursor when a cached gap
 // fills. Generic replanning here would erase the next candidate and keys.
 if(!this.aiSearch&&t.held?.cells&&this.aiPlan){
  if(this.aiPlan.dive&&t.cell(Math.floor(this.aiPlan.x),this.aiPlan.gapY))this.aiPlan=plan(t);
  else if(t.egg.ground&&!reachableTowerColumn(t,Math.floor(this.aiPlan.x)))this.aiPlan=plan(t);
 }
 if(t.held){if(t.held.item){
  if(timing&&(t.held.nativeKind===8||t.held.nativeKind===10))this.nativeToolControl(t,c);
  else c.use=this.aiClock<=0;
 }else if(this.aiPlan){
 const orientation=nativeHeldRotation(t.held),nativeRotation=Boolean(timing&&orientation!==null);
 const rotationPending=nativeRotation&&Boolean(this.aiPlan.r);
 if(this.aiPlan.r){
  if(nativeRotation){
   c.rotate=(this.aiRotation??=new NativeRotationGate()).request(orientation,(orientation+this.aiPlan.r)&3);
   if(c.rotate)this.aiPlan.r=(this.aiPlan.r+3)&3;
  }else {
   t.held.cells=this.rotatePlan(t.held.cells,this.aiPlan.r);
   if(orientation!==null)t.held.nativeVariant=(orientation+this.aiPlan.r)&3;
   this.aiPlan.r=0;
  }
 }
 if(nativeRotation){this.nativePieceControl(t,c,orientation,rotationPending,Boolean(this.aiPlan.candidateSweep));}
 else {
  const dx=this.aiPlan.x-t.egg.x;c.move=Math.abs(dx)>0.16?Math.sign(dx):0;
  c.jump=t.egg.ground&&(!!c.move||t.egg.y+1>=t.p.goal);
  if(!c.move&&this.aiClock<=0){
   if(this.aiPlan.dive){
    c.jump=false;const preview=t.preview();
    c.use=Boolean(preview&&preview.y===this.aiPlan.gapY);
    c.dive=!c.use&&t.egg.ground&&t.egg.y>this.aiPlan.gapY;
   }else {c.use=true;if(!t.preview())c.jump=t.egg.ground;}
  }
 }
 if(c.use)this.aiClock=this.p.aiDelay;
 }else if(!this.aiSearch||this.aiSearch.state===2){
  // ROM 0x08007762..778c discards an exhausted nonpositive plan only
  // on an even native frame; odd frames exit without steering/avoidance.
  c.discard=!timing||((t.nativeFrame+1)&1)===0;c.nativeEarly=Boolean(timing);
 }}
 else if(timing&&t.p.mode==='survival'){
  if(this.aiEmptyWait>0){this.aiEmptyWait--;c.nativeEarly=true;this.aiEmptyActive=false;}
  else {
   this.nativeEmptyControl(t,c,projectileChoice);
   const active=Boolean(c.move||c.jump||c.dive);
   // 691E..6922 / 6A14..6A24 clear the empty-handed search even when
   // steering emits no keys (for example during water recovery). Incoming
   // projectile pursuit selects state2 at 6854 and bypasses that reset.
   if(projectileChoice?.action!=='catch'&&this.aiSearch){
    Object.assign(this.aiSearch,{state:0,column:0,rotation:0,
     bestScore:CPU_PARAMETERS.initialBestScore,best:null});this.aiPlan=null;
   }
   this.aiEmptyActive=active;
  }
 }
 else {let closest=null;for(const crate of t.crates){if(crate.y<t.egg.y-0.5)continue;const cost=Math.abs(crate.x-t.egg.x)+Math.abs(crate.y-t.egg.y-1)*0.3;if(!closest||cost<closest.cost)closest={...crate,cost};}const x=t.egg.y+3>=t.p.goal?this.p.columns/2:closest?.x??this.p.columns/2;c.move=Math.abs(x-t.egg.x)>0.2?Math.sign(x-t.egg.x):0;c.jump=t.egg.ground&&(!!c.move||!!closest||t.egg.y+3>=t.p.goal);c.float=!!closest&&closest.y>t.egg.y;}
 // Carrying a piece must not turn an Up hold into a single-frame jump.
 if(t.held?.cells&&!c.nativeMotion)c.float=Boolean(c.move||c.jump||(!this.aiPlan?.dive&&!t.preview()));
 const heldRotation=nativeHeldRotation(t.held);
 if(heldRotation!==null)t.nativeActorRotation=heldRotation;
 if(timing&&!c.use&&!c.nativeEarly){
  const p=CPU_PARAMETERS,s=p.fixedScale;
  const avoided=nativeAvoidHazards({actorX:Math.round((t.egg.x*p.cellPixels-p.cellPixels)*s),
   actorY:Math.round((p.actorNativeFloor-t.egg.y*p.cellPixels)*s),
   actorVy:Math.round(-t.egg.vy*p.cellPixels/p.framesPerSecond*s),
   kind:t.held?.nativeKind??-1,frame:t.nativeFrame+1,hazards:nativeHazards(t),difficulty,
   keys:(c.move>0?p.rightKey:c.move<0?p.leftKey:0)|(c.jump||c.float?p.upKey:0)|(c.dive?p.diveKey:0)});
  c.move=Number(Boolean(avoided&p.rightKey))-Number(Boolean(avoided&p.leftKey));
  c.jump=c.float=Boolean(avoided&p.upKey);
  if(!t.held?.cells&&Number.isInteger(this.aiRotationTarget)){
   const current=t.nativeActorRotation??0;
   c.rotate=(this.aiRotation??=new NativeRotationGate()).request(current,this.aiRotationTarget);
  }
  const keys=(c.move>0?p.rightKey:c.move<0?p.leftKey:0);
  this.aiPreviousKeys=filterNativeDirection(timing,keys,this.aiPreviousKeys);
  c.move=Number(Boolean(this.aiPreviousKeys&p.rightKey))-Number(Boolean(this.aiPreviousKeys&p.leftKey));
 }
 if(timing&&c.use&&nativeHeldRotation(t.held)!==null)timing.waitAfterAction(difficulty);
  this.stepCPUActor(t,dt,c,this.player);
 }
 rotatePlan(cells,r){for(let i=0;i<r;i++){const a=cells.map(([x,y])=>[y,-x]),min=Math.min(...a.map(p=>p[1]));cells=a.map(([x,y])=>[x,y-min]);}return cells;}
 // ROM result initialization only installs glyph positions/velocities; the
 // first 0x080142e8 integration belongs to the following fixed tick.
 finish(){if(this.p.mode==='survival')this.music?.start('result-intro');else this.music?.stop();const won=this.player.won||this.cpu?.lost;this.phase=won?'won':'lost';this.resultTicks=1;this.resultViews=[createResultView(Boolean(won),0),...(this.cpu?[createResultView(!won,1)]:[])];if(won)this.wins++;this.totalScore=(this.totalScore||0)+this.player.score;this.submitScore({score:this.p.mode==='survival'?this.wins:this.player.score,wins:this.wins,won:Boolean(won),floors:this.player.lines,height:this.player.height(),time:Number(this.elapsed.toFixed(2)),round:this.round,seed:this.seed});if(this.p.mode!=='survival'){if(won)this.audio?.playSuccess();else this.audio?.playBeep(140,0.3,0.15);}}
 layout(){const panels=this.cpu?2:1;const footer=78,header=76;const gap=28;const cell=Math.min((this.w-60-gap*(panels-1))/(panels*this.p.columns),(this.h-header-footer)/18);const width=cell*this.p.columns;return{cell,width,top:header,bottom:this.h-footer,height:this.h-header-footer,start:(this.w-panels*width-gap*(panels-1))/2,gap};}
 render(){this.performanceMonitor?.beforeRender();if(this.onlineButton)this.onlineButton.hidden=this.phase!=='character-select';renderPixelGame(this);this.performanceMonitor?.finish();}
 binding(action){const bindings=this.app?.currentBindings?.[action]||EggoMania.getControlsSchema().find(c=>c.action===action)?.defaultBindings||[];const b=(this.input?.hasGamepad?.()?bindings.find(binding=>binding.type==='gamepad'):null)||bindings.find(binding=>binding.type==='keyboard')||bindings[0];return b?InputManager.bindingName(b):'—';} destroy(){this.nativeSound?.destroy();this.performanceMonitor?.destroy();this.onlineButton?.remove();resetNativeAudio(this.audio);this.music?.stop();this.canvas?.classList.remove('eggo-pixel-art');}
 onPause(){this.music?.pause();}
 onResume(){this.music?.resume();}
 static getControlsSchema(){return CONTROLS.map(([action,label,codes,buttons])=>({action,label,defaultBindings:[...codes.map(code=>({type:'keyboard',code})),...buttons.map(code=>({type:'gamepad',code}))]}));}
 static getSettingsSchema(){return[
 {key:'character',label:'Character',type:'select',default:DEFAULTS.character,options:['yolko','funky','robo','bebub','coolio','eggo','spike','astro'].map(value=>({value,label:CHARACTER_ART[value].label}))},...[ 
 ['columns','Tower width [cells]',1],['goal','Balloon height [cells]',1],['waterSpeed','Extra water rise [cells/s]',0.01],['crateInterval','Crate interval [s]',0.1],['aiDelay','Extra CPU thinking delay [s]',0.05],['seed','Random seed (0 = random)',1]].map(([key,label,step])=>({key,label,type:'number',step,default:DEFAULTS[key]})),{key:'hazards',label:'Items and arena hazards',type:'toggle',default:true}];}
}
