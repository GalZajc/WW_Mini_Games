import {RULES,nativePickupAngle,nativeThrowPose} from './model.js';
export {nativePreviewTurnMatrix,NATIVE_PREVIEW_TURN_8_8,NATIVE_PREVIEW_TURNS_BY_ORIENTATION_8_8,
    NATIVE_PREVIEW_OAM_Y_DOWN,NATIVE_PREVIEW_OAM_Y_UP,nativePreviewOamYShift} from './native-affine.js';
import {NATIVE_RECIPROCAL} from './assets/native-reciprocal.js';
import {INTRO_ENVIRONMENTS} from './assets/intro-environments.js';
import {INTRO_COUNTDOWN} from './assets/intro-countdown.js';
import {BG3_RING_ROWS} from './assets/background-rings.js';
import {RIVAL_POSES} from './assets/rival-poses.js';
import {NATIVE_RIVAL_RESOURCES} from './native-rival-resource.js';
import {NATIVE_CHARACTER_RESOURCES} from './native-character-resources.js';
import {CHARACTER_SPECIAL_STATES} from './assets/characters.js';
import {NATIVE_PLAYER_AIR_ART,NATIVE_PLAYER_AIR_TABLES,NATIVE_PLAYER_WALK_ART,NATIVE_PLAYER_WALK_TABLES} from './native-player-animation-map.js';
// Native-pixel view rules, kept apart from gameplay/physics parameters.
// Foreground samples match the previous player's height minus an 8px margin.
// Background response is fitted to two independent input-only GBA jump traces.
export const VIEW = Object.freeze({
    tile:16, height:160, floor:112, divider:16,
    completionStar:{size:8,frames:8,worldOffset:4,fallPixelsPerFrame:1,ticksPerFrame:4},
    // Palette index 15 in the eight native throw palettes (GBA RGB555).
    previewPriorPaletteWhite:[0x7fdf,0x7fdf,0x7fdf,0x6bff,0x6bff,0x7fdf,0x6bff,0x7fdf],
    nativePreviewViewport:{left:-64,right:256,top:-64,bottom:160},
    // Native foreground camera position is a world-pixel coordinate; the
    // renderer's screen offset is measured from this 640px reference.
    nativeCameraReferencePixels:640,
    nativeCameraTargetOffsetPixels:72,
    nativeCameraClampPixels:640,
    nativeCameraPostThrowHoldFrames:18,
    // The camera tracks logical rows in the 512px source ring. The 256px
    // hardware tile map is a streamed window, not the full background.
    nativeBg3CameraScaleQ16:35904,
    nativeBg3SourceTilePixels:8,
    // Factory BG3CNT is 0x1f87: its vertical map is 256px. The IO word is
    // readable as 16 bits, but only the low 8 bits participate in scrolling.
    nativeBg3ScrollPeriodPixels:256,
    nativeCameraOffsetInitial:0,
    nativeCpuCameraOffsetInitial:2,
    nativeCameraOffsetStep:6,
    nativeCameraOffsetMinimum:-100,
    nativeCameraOffsetMaximum:120,
    // BG0's placed-tile origin sits two native pixels above the actor floor.
    boardOriginOffsetY:0,
    foregroundMargin:8, backgroundMargin:2, parallax:0.5,
    backgroundRiseBlend:0.3, backgroundFallBlend:1,
    throwDelayFrames:12, throwBlend:0.3, throwMargin:2, waterSurfaceLift:8,
    // Native factory-water OBJ animation: 15 distinct 112×32 frames, stored
    // vertically in factory-water-surface.png. Each image lasts four native
    // ticks in a 60-tick cycle. The sprite sits 16px above the water surface.
    factoryWaterSurfaceHeight:32, factoryWaterSurfaceYOffset:16,
    factoryWaterSurfaceFrames:15,
    factoryWaterSurfaceFramePeriod:60,
    factoryWaterSurfaceFrameOffset:39,
    factoryWaterSurfaceTicksPerFrame:4,
    // Factory's lower CPU-field BG3 water strip is an 18px window into the
    // 60-phase native text-map cycle, beginning at source row 80.
    factoryWaterlineBg3Frames:60,
    factoryWaterlineBg3FrameHeight:18,
    // BG1's factory water body starts at source row 80; BLDALPHA 0x040c
    // gives the first target (BG1) EVA=12 and the scene EVB=4.
    factoryWaterBodySourceY:80,factoryWaterBlendEva:12,factoryWaterBlendEvb:4,
    factoryWaterBodyFrames:15,factoryWaterBodyFramePeriod:60,
    factoryWaterBodyFrameOffset:39,factoryWaterBodyTicksPerFrame:4,
    itemSize:16,heldItemLift:36,heldItemIdleExtraPixels:3,bombEffectSize:128,cloudSize:64,hammerTurnPeriod:40/60,
    // Selector-10 entry, ROM EA04..EA46: Space uses group 11, others 21.
    arrivedRescueGroups:Object.freeze({space:11,default:21}),
    nativePickupViewport:{left:-15,right:112,top:-16,bottom:160},
    nativeCastleThiefViewport:{left:-63,right:239,top:-64,bottom:160},
    // Descriptor-group anchors from ROM 0x083ef80c, used by 0x0800ef60.
    // They are offsets from the actor's 64px OBJ origin, not its foot anchor.
    heldItemDefaultAnchor:Object.freeze([24,12]),
    heldItemGroupAnchors:Object.freeze({2:Object.freeze([24,15]),
        9:Object.freeze([29,12]),13:Object.freeze([19,12])}),
    resultGlyphSize:16,resultTop:50,
    // Native affine OAM: a sinusoidal +/-30 degree sway over 60 frames.
    pickupSwayAngle:Math.PI/6,pickupSwayPeriod:1,
    progressSize:16,
    introDuration:(INTRO_COUNTDOWN.length+1)*RULES.step,introActorFoot:120,
    introBalloonX:-3,introBalloonTop:-8,introReferenceGoal:37,introReferenceWorldY:88.5440673828125,
    destructiveWaveLift:8,destructiveWaveWidth:112,destructiveWaveHeight:32,
    destructiveWaveFrames:8,destructiveWaveFrameTicks:4,
    waterWarningSize:32,waterWarningY:116,
    // Against decoded 256px maps, measured after the intro fall has landed.
    backgroundOffsets:Object.freeze({factory:94,dragon:94,castle:94,pirate:86,
        space:94,jungle:94,park:94,beanstalk:94}),
    // Native BG3 ring scroll at the default floor camera for each Survival arena.
    stageRingBasePixels:Object.freeze({factory:350,dragon:350,castle:350,pirate:342,
        space:350,jungle:350,park:350,beanstalk:350}),
});
export function collapseWavePose(t){
    const wave=t.previousCollapseWave;
    if(!wave||wave.timer<0||wave.timer>=VIEW.destructiveWaveFrames*VIEW.destructiveWaveFrameTicks)return null;
    return {floor:wave.floor,frame:VIEW.destructiveWaveFrames-1-Math.floor(wave.timer/VIEW.destructiveWaveFrameTicks)};
}
export function introHeight(stage,goal){
    return INTRO_ENVIRONMENTS[stage].startHeight+goal-VIEW.introReferenceGoal;
}
export function countdownPose(elapsed){
    return INTRO_COUNTDOWN[Math.min(INTRO_COUNTDOWN.length-1,Math.max(0,Math.floor(elapsed/RULES.step+1e-7)-1))];
}
export function introBackgroundOffset(height,stage,goal=VIEW.introReferenceGoal){
    const env=INTRO_ENVIRONMENTS[stage],samples=env.samples;
    height-=goal-VIEW.introReferenceGoal;
    for(let i=1;i<samples.length;i++){
        const [high,start]=samples[i-1],[low,end]=samples[i];
        if(height>=low){const fraction=high===low?0:Math.max(0,Math.min(1,(high-height)/(high-low)));return Math.round(start+(end-start)*fraction);}
    }
    return env.ground;
}
export function nativeBg3CameraY(cameraPosition,stage='factory',field=0){
    if(!Number.isFinite(cameraPosition))return 0;
    // ROM AD7E / AE04..AE30: truncate the reciprocal BEFORE multiplying
    // by the source height. Pirate has 63 rows (504px), the others 64.
    const rows=BG3_RING_ROWS[stage]?.[field?'cpu':'player']??BG3_RING_ROWS.factory.player;
    const scale=(rows*VIEW.nativeBg3SourceTilePixels-VIEW.height)*
        Math.floor(RULES.actorFixedScale/VIEW.nativeCameraReferencePixels);
    return Math.floor(cameraPosition*scale/RULES.actorFixedScale);
}
export function nativeBg3ScrollOffset(value){
    if(!Number.isFinite(value))return 0;
    const period=VIEW.nativeBg3ScrollPeriodPixels,integer=Math.trunc(value);
    return ((integer%period)+period)%period;
}
export function nativeStageRingScroll(cameraY,registerOffset=cameraY){
    // VOFS selects a position in the 32-row hardware map; the stream's
    // camera selects which logical 32-row page currently occupies that map.
    const period=VIEW.nativeBg3ScrollPeriodPixels;
    return Math.floor(cameraY/period)*period+nativeBg3ScrollOffset(registerOffset);
}
export function pickupAngle(item,held=false){
    // Native kinds 0..7 (building pieces) use upright, non-affine OBJ.
    // Only the boxed tools use the oscillating affine picture.
    if(held||item.cells)return 0;
    if(Number.isInteger(item.nativeSwayFrame))return nativePickupAngle(item.nativeSwayFrame);
    return VIEW.pickupSwayAngle*Math.sin((item.age||0)*Math.PI*2/VIEW.pickupSwayPeriod+(item.swayPhase||0));
}
export const METER_VIEW=Object.freeze({fixedScale:65536,targetBase:14,targetPerFloor:10,
 targetMax:89,positionMin:10,positionMax:92,accelerationShift:5,friction:0xe14,
 pointerY:148,barY:152,barWidth:64,barHeight:32,fieldWidth:112,
 jitter:Object.freeze([-1,0,1,0]),flashMasks:Object.freeze([64,32,16,8])});
// ROM 0x08014ecc..1502e: signed fixed-point oscillator with Coulomb drag.
export function advanceNativeMeter(state,incomplete){
 const p=METER_VIEW,target=Math.min(p.targetMax,p.targetBase+p.targetPerFloor*incomplete)*p.fixedScale;
 state.velocity+=(target-state.position)>>p.accelerationShift;
 if(state.velocity>p.friction)state.velocity-=p.friction;
 else if(state.velocity<-p.friction)state.velocity+=p.friction;
 else state.velocity=0;
 state.position=Math.max(p.positionMin*p.fixedScale,Math.min(p.positionMax*p.fixedScale,state.position+state.velocity));
 return state;
}
// Original graphics arrive in OAM one draw later. Call with the integer
// draw-call frame, not elapsed wall-clock time.
export function nativeMeterPose(state,incomplete,frame){
 const p=METER_VIEW,shift=incomplete>6?1:incomplete===6?2:incomplete===5?3:null;
 const jitter=shift===null?0:p.jitter[(frame>>shift)&3];
 const mask=incomplete>=5?p.flashMasks[Math.min(3,incomplete-5)]:0;
 return {x:Math.floor(state.position/p.fixedScale),y:p.pointerY+jitter,barY:p.barY+jitter,flashing:Boolean(frame&mask)};
}
const SPECIAL_ACTOR_STATES=Object.fromEntries(Object.entries(CHARACTER_SPECIAL_STATES)
    .map(([name,state])=>[name,[state.row,state.frames,state.ticks_per_frame]]));
export const ACTOR_VIEW=Object.freeze({size:64,anchorX:32,anchorY:56,
    frameSteps:4,
    // Selector 8 keeps the rival's free-air animation for eighteen actor
    // updates after the throw. The OAM trace also shows its pose clock starts
    // two updates later than the model's throw-to-air transition.
    // OAM is updated before the actor handler, so the displayed pose lags the
    // eighteen-tick selector-8 interval by one captured frame.
    rivalPostThrowPoseFrames:VIEW.nativeCameraPostThrowHoldFrames+1,
    rivalPostThrowPoseFrameDelay:2,
    // The player's native OAM continues to display the final throw cel for
    // three updates after action state 4 changes to airborne state 0.
    playerThrowToAirPoseDelay:3,
    // On voluntary jumps from an empty-handed stand, native OAM keeps the
    // free-standing pose for two updates after the actor has entered the air.
    // The Hard replay shows this on both UP-jump transitions; ordinary throws
    // enter their airborne art through a different selector path.
    playerGroundJumpPoseDelay:2,
    // The final native free-air handoff is displayed one OAM update after the
    // camera's 18-tick selector interval ends.
    playerPostThrowPoseFrames:VIEW.nativeCameraPostThrowHoldFrames+1,
    // Selector 8 inherits group 16 at 3.5 cels and selects before adding 1/4.
    nativePostThrowAnimationStartPhase:0x38000,
    nativePostThrowAnimationStep:0x4000,nativePostThrowAnimationPeriod:8,
    nativeSwimAnimationSelector:9,nativeSwimAnimationStep:0x4000,nativeSwimAnimationPeriod:10,
    // The throw animation starts at model tick 2, then advances every two
    // actor updates through the 14 native ROM cels.
    playerThrowPoseFrameDelay:2,
    playerThrowPoseTicksPerFrame:2,
    // Native airborne animation has one phase clock from takeoff through
    // landing. The visual row follows rise/float/fall, while the pose phase
    // continues across those row changes.
    airborneFrameSteps:4,
    airborneFrameOffsets:Object.freeze({rise:0,float:-2,fall:0}),
    // ROM selector 5 uses a separate two-pose falling clip while horizontal
    // movement is held; its source cadence is eight actor updates per image.
    fallMovingFrameSteps:8,
    fallMovingEntryPhaseDelay:2,
    fallMovingDirectFallPhaseDelay:1,
    floatVelocityPixelsPerFrame:1.6,
    // Native held-idle animation is a two-frame 16.16 phase accumulator.
    // ROM 0x0800ed50 adds (globalRandom >> 5) each eligible actor update.
    idleFrameTicks:64,
    // Selector 5's held rise and moving float use Yolko resource group 9.
    states:Object.freeze({idle:[0,2],walk:[1,7],rise:[2,4],
        float:[3,4],fall:[4,4],throw:[5,14],
        // The Survival/Hard replay uses native group-1 picture 0 for the
        // empty-handed grounded idle. That decoded picture is atlas row 13;
        // the older row-6 capture is a different free-idle pose.
        'idle-free':[13,2],
        'walk-free':[7,2],'rise-free':[8,2],'float-free':[9,2],'fall-free':[10,2],
        'fall-moving':[15,2],
        ...SPECIAL_ACTOR_STATES})});
export const NATIVE_ACTOR_ANIMATION=Object.freeze({
    randomShift:5,phaseScale:65536,cycleFrames:2,displayDelayTicks:2,
    initialPhase:0xf43a,fieldPhaseOffset:0x9e37,
    rivalPhaseWrap:0x20000,
    rivalAnimationSteps:Object.freeze({
        1:Object.freeze({period:8,step:0x8000}),
        2:Object.freeze({period:2,step:0}),
        3:Object.freeze({period:7,step:0x4000}),
        4:Object.freeze({period:7,step:0x4000}),
        5:Object.freeze({period:2,step:0x2000}),
        // The selector-8 throw handoff enters the captured Factory table at
        // 0x3c000 after selector 1 switches to its free-actor table.
        8:Object.freeze({period:8,step:0x4000,entryPhase:0x3c000}),
    }),
});
// ROM 0x080da550, indexed by the integer part of the half-frame counter.
export const THROW_VIEW=Object.freeze({size:64,center:32,initialScale:0x4000,scaleSpan:0xc000,
    verticalOffsets:Object.freeze([12,19,23,18,11,7,7,9,10,9,9,46,55,57,57,57,57,57])});
export const PLACED_VIEW=Object.freeze({size:48,kinds:8,cellStride:3,cellsPerPiece:9});
export function nativeReciprocal(value){
    if(!value)return 0;
    const magnitude=Math.abs(value),shift=20-Math.min(19,Math.clz32(magnitude));
    const index=(magnitude>>>shift)>>>2;
    const reciprocal=NATIVE_RECIPROCAL[index]>>>(shift-1);
    return value<0?-reciprocal:reciprocal;
}
// OBJ affine coefficients are signed 8.8 values. The GBA updates these
// integers for each displayed frame; retaining floating-point Canvas angles
// changes the pixel sampling even when the visible angle looks identical.
export function nativeAffineMatrix(angle){
    const cosine=Math.cos(angle),sine=Math.sin(angle);
    const coefficient=value=>Math.abs(value)<1e-10?0:Math.floor(value);
    return [coefficient(cosine*256),coefficient(sine*256),
        coefficient(-sine*256),coefficient(cosine*256)];
}
export function nativeAffinePixelMap(angleOrMatrix,width=64,height=64,destinationWidth=width,destinationHeight=height){
    const [pa,pb,pc,pd]=Array.isArray(angleOrMatrix)?angleOrMatrix:nativeAffineMatrix(angleOrMatrix),
        cx=Math.floor(width/2),cy=Math.floor(height/2),
        destinationCenterX=Math.floor(destinationWidth/2),destinationCenterY=Math.floor(destinationHeight/2),
        sourceIndex=new Int32Array(destinationWidth*destinationHeight);
    sourceIndex.fill(-1);
    for(let y=0;y<destinationHeight;y++){
        const dy=y-destinationCenterY;
        for(let x=0;x<destinationWidth;x++){
            const dx=x-destinationCenterX,sx=cx+((pa*dx+pb*dy)>>8),sy=cy+((pc*dx+pd*dy)>>8);
            if(sx>=0&&sx<width&&sy>=0&&sy<height)sourceIndex[y*destinationWidth+x]=sy*width+sx;
        }
    }
    return sourceIndex;
}
export function throwPiecePose(p,tick){
    tick=Math.max(0,tick);
    const actor=nativeThrowPose(p,tick),fixed=RULES.actorFixedScale;
    const u=Math.min(fixed,Math.floor(tick*RULES.throwReciprocal/2));
    const scale=THROW_VIEW.initialScale+Math.floor(THROW_VIEW.scaleSpan*u/fixed);
    const lift=THROW_VIEW.verticalOffsets[Math.min(THROW_VIEW.verticalOffsets.length-1,Math.floor(tick/2))];
    const nativeY=(45-actor.y)*16+lift-THROW_VIEW.center-THROW_VIEW.center*scale/fixed;
    const reciprocal=nativeReciprocal(scale),matrix=reciprocal>>8;
    return {x:Math.floor((actor.x-1)*16)-16,y:Math.floor(nativeY),
        worldY:nativeY,scale:scale/fixed,matrix,
        negativeMatrix:-Math.ceil(reciprocal/256),renderScale:256/matrix,reciprocal};
}
function actorMotionState(tower){
    const e=tower.egg;
    if(tower.placing)return 'throw';
    if(e.ground||tower.nativeAnimationGround)return e.walking?'walk':'idle';
    if(e.vy>0){
        const pixelsPerFrame=e.vy*RULES.step*VIEW.tile;
        return pixelsPerFrame<ACTOR_VIEW.floatVelocityPixelsPerFrame?'float':'rise';
    }
    return 'fall';
}
function playerMotionState(tower){
    const state=actorMotionState(tower);
    return tower.fieldIndex===0&&state==='fall'&&tower.egg.walking?'fall-moving':state;
}
function actorUsesFreeHands(tower){
    const postThrowFree=tower.fieldIndex===0&&tower.nativePlayerPostThrowPoseTicks>0&&
        tower.nativePlayerPoseDelay===0&&tower.nativePlayerPoseState!=='throw';
    return !tower.held||postThrowFree;
}
export function actorPose(tower){
    const capturedNativePose=tower.fieldIndex===0?tower.nativeRenderFrame?.animationPose:null;
    if(capturedNativePose)return capturedNativePose;
    if(tower.actorVisualPose)return withNativePlayerResourcePose(tower,tower.actorVisualPose);
    const e=tower.egg,p=tower.placing;
    let state=playerMotionState(tower);
    if(!p&&actorUsesFreeHands(tower)&&state!=='fall-moving')state+='-free';
    const [row,count]=ACTOR_VIEW.states[state];
    const steps=p?(RULES.throwTime-p.time)/RULES.step:tower.time/RULES.step;
    const frameTicks=state==='idle'?ACTOR_VIEW.idleFrameTicks:ACTOR_VIEW.frameSteps;
    const nativeIdleFrame=(state==='idle'||state==='idle-free')&&Number.isInteger(tower.nativeActorFrame);
    const frame=p?Math.min(count-1,Math.max(0,Math.floor(steps/ACTOR_VIEW.frameSteps))):
        nativeIdleFrame?tower.nativeActorFrame%count:Math.floor(steps/frameTicks)%count;
    return withNativePlayerResourcePose(tower,{state,row,frame});
}
export function nativeHeldItemOffset(tower,pose,mirrored=false){
    let group=tower.nativeRenderFrame?.animationClock?.state;
    if(tower.fieldIndex===1){
        if(Number.isInteger(pose?.nativeGroup))group=pose.nativeGroup;
        else{
            const states=RIVAL_POSES[tower.artStage]??{};
            const matches=key=>states[key]?.row===pose?.row;
            group=matches('rise-moving')?9:matches('fall-moving')?13:matches('idle')?2:0;
        }
    }else if(!Number.isInteger(group)){
        group=pose?.state==='idle'?2:pose?.state==='fall-moving'?13:
            pose?.state==='rise'&&tower.nativeRenderFrame?.walking?9:0;
    }
    const [x,y]=VIEW.heldItemGroupAnchors[group]??VIEW.heldItemDefaultAnchor;
    const center=ACTOR_VIEW.anchorX-VIEW.itemSize/2;
    return {x:mirrored?center-x:x-center,y:y+VIEW.itemSize/2-ACTOR_VIEW.anchorY};
}
export function nativePlayerAnimationPose(tower){
    if(tower.fieldIndex===0&&tower.nativePlayerAnimationSelector===11){
        const resources=NATIVE_CHARACTER_RESOURCES[tower.p.character],group=resources.groups[5];
        const period=group.period*0x10000,phase=((tower.nativePlayerAnimationPhase-0x4000)%period+period)%period,
            frame=Math.floor(phase/0x10000);
        return {state:'injured',row:group.row,frame,mirrorX:true,
            resource:{sheet:resources.playerSheet,row:group.row,column:frame}};
    }
    if(tower.fieldIndex===0&&tower.nativePlayerAnimationSelector===10){
        const resources=NATIVE_CHARACTER_RESOURCES[tower.p.character],
            group=resources.groups[VIEW.arrivedRescueGroups[tower.artStage]??VIEW.arrivedRescueGroups.default];
        const phase=(tower.nativePlayerAnimationPhase-tower.nativePlayerAnimationStep+group.period*65536)%(group.period*65536);
        const frame=Math.floor(phase/65536);
        // Selector 10 keeps +0x844 from the last attraction pose; its
        // entry does not reset the native OBJ horizontal-flip flag.
        return {state:'float-free',row:group.row,frame,mirrorX:Boolean(tower.nativePlayerRescueMirror),
            resource:{sheet:resources.playerSheet,row:group.row,column:frame}};
    }
    if(tower.fieldIndex===0&&tower.nativePlayerAnimationSelector===2&&tower.egg.nativeDiveMotion){
        const state=tower.held?'idle':'idle-free',[row,count]=ACTOR_VIEW.states[state];
        return {state,row,frame:(tower.nativeActorFrame??0)%count};
    }
    if(tower.fieldIndex===0&&tower.nativePlayerWaterAnimation){
        const swimming=tower.nativePlayerAnimationSelector===ACTOR_VIEW.nativeSwimAnimationSelector,
            state=swimming?'swim':tower.nativePlayerIdleHeld?'recovery-held':'recovery-free',[row,count]=ACTOR_VIEW.states[state],
            modulus=tower.nativePlayerAnimationPeriod*0x10000,
            phase=((tower.nativePlayerAnimationPhase-tower.nativePlayerAnimationStep)%modulus+modulus)%modulus;
        const frame=Math.floor(phase/0x10000)%count,
            resources=NATIVE_CHARACTER_RESOURCES[tower.p.character],
            group=resources.groups[swimming?17:tower.nativePlayerIdleHeld?2:1];
        return {state,row,frame,resource:{sheet:resources.playerSheet,row:group.row,column:frame}};
    }
    if(tower.fieldIndex===0&&tower.nativePlayerAnimationSelector===2){
        const held=tower.nativePlayerIdleHeld??Boolean(tower.held),
            state=held?'idle':'idle-free',[row,count]=ACTOR_VIEW.states[state],
            modulus=count*NATIVE_ACTOR_ANIMATION.phaseScale,
            phase=((tower.nativeActorPhase-(tower.nativeActorRandomStep??0))%modulus+modulus)%modulus;
        return {state,row,frame:Math.floor(phase/NATIVE_ACTOR_ANIMATION.phaseScale)};
    }
    if(tower.fieldIndex!==0||![3,4,5,7,8].includes(tower.nativePlayerAnimationSelector))return null;
    const state=tower.nativePlayerAnimationState,table=tower.nativePlayerAnimationTable;
    const period=tower.nativePlayerAnimationPeriod,phase=tower.nativePlayerAnimationPhase;
    const step=tower.nativePlayerAnimationStep;
    if(!state||!table||!period||!Number.isFinite(phase)||!step)return null;
    const modulus=period*0x10000;
    const oamPhase=((phase-step)%modulus+modulus)%modulus;
    const frameIndex=Math.floor(oamPhase/0x10000);
    if(tower.nativePlayerAnimationSelector===8){
        const resource=NATIVE_CHARACTER_RESOURCES[tower.p.character],group=resource.groups[16];
        return {state:frameIndex<4?'throw':frameIndex<6?'rise-free':'float-free',row:group.row,frame:frameIndex,
            resource:{sheet:resource.playerSheet,row:group.row,column:frameIndex}};
    }
    const isRescue=Boolean(tower.nativeRescueBody||tower.nativeActorState===2);
    const mirrorX=isRescue?Boolean((tower.nativeRescueBody?.animationDx||0)>0):undefined;
    const art=[5,7].includes(tower.nativePlayerAnimationSelector)?
        NATIVE_PLAYER_AIR_ART[`${state}|${table}|${frameIndex}`]:
        NATIVE_PLAYER_WALK_ART[`${state}|${table}|${frameIndex}`];
    if(!art)return null;
    return {state:art.state,row:art.row??0,frame:art.frame??0,
        ...(mirrorX!==undefined?{mirrorX}:{}),
        ...(art.sheet?{resource:{sheet:`${tower.p.character||'yolko'}-native-poses`,row:art.row,column:art.column}}:{})};
}
function withNativePlayerResourcePose(tower,pose){
    const displayedHeld=tower.nativeRenderFrame?tower.nativeRenderFrame.held:tower.held;
    if(tower.fieldIndex===0&&pose.state==='fall-moving'&&displayedHeld){
        // Native held fall-while-moving uses the character's group-13
        // pictures 0 and 1; the compact atlas row was another clip.
        return {...pose,resource:{sheet:`${tower.p.character||'yolko'}-native-poses`,row:0,column:7+(pose.frame&1)}};
    }
    return pose;
}
export function advanceActorVisual(tower,nextRandom,deferNativeAnimation=false){
    const e=tower.egg;
    const state=e.swimming?'swim':e.waterEjected?(tower.held?'recovery-held':'recovery-free'):
        e.lightning?.pending===0?'injured':null;
    if(!state){
        tower.actorVisualPose=null;tower.actorVisualState=null;tower.actorVisualTicks=0;
        if(!deferNativeAnimation&&e.ground&&!e.walking&&nextRandom){
            const p=NATIVE_ACTOR_ANIMATION;
            if(!Number.isInteger(tower.nativeActorPhase))tower.nativeActorPhase=
                ((tower.p.seed||0)+tower.fieldIndex*p.fieldPhaseOffset+p.initialPhase)&(p.phaseScale-1);
            if(!Array.isArray(tower.nativeActorFrameHistory)){
                const initialFrame=(tower.nativeActorPhase/p.phaseScale)|0;
                tower.nativeActorFrameHistory=Array(p.displayDelayTicks).fill(initialFrame);
                tower.nativeActorFrame=initialFrame;
            }
            const period=p.phaseScale*p.cycleFrames;
            tower.nativeActorPhase=(tower.nativeActorPhase+(nextRandom()>>>p.randomShift))%period;
            const frame=(tower.nativeActorPhase/p.phaseScale)|0;
            tower.nativeActorFrameHistory.push(frame);
            tower.nativeActorFrame=tower.nativeActorFrameHistory.shift();
        }
        return null;
    }
    if(state!==tower.actorVisualState){tower.actorVisualState=state;tower.actorVisualTicks=0;}
    const [row,count,ticksPerFrame=ACTOR_VIEW.frameSteps]=ACTOR_VIEW.states[state];
    const frame=Math.floor(tower.actorVisualTicks/ticksPerFrame)%count;
    tower.actorVisualPose={state,row,frame};tower.actorVisualTicks++;
    return tower.actorVisualPose;
}
function advanceNativeActorRandomPhase(tower,nextRandom,continuesPhase){
    if(!nextRandom)return tower.nativeActorPhase??0;
    const p=NATIVE_ACTOR_ANIMATION,period=p.phaseScale*p.cycleFrames;
    let phase=continuesPhase&&Number.isFinite(tower.nativeActorPhase)?tower.nativeActorPhase:0;
    if(!continuesPhase||!Array.isArray(tower.nativeActorFrameHistory)){
        const initialFrame=(phase/p.phaseScale)|0;
        tower.nativeActorFrameHistory=Array(p.displayDelayTicks).fill(initialFrame);
        tower.nativeActorFrame=initialFrame;
    }
    const randomStep=nextRandom()>>>p.randomShift;
    tower.nativeActorRandomStep=randomStep;
    phase=(phase+randomStep)%period;
    const frame=(phase/p.phaseScale)|0;
    tower.nativeActorFrameHistory.push(frame);
    tower.nativeActorFrame=tower.nativeActorFrameHistory.shift();
    tower.nativeActorPhase=phase;
    tower.nativeActorRandomActive=true;
    return phase;
}
export function advanceNativePlayerPose(tower,previousPose,nextRandom){
    if(tower.nativeWaterRecovery||tower.nativeActorState===6){
        const carried=tower.egg.waterEjected,previousSelector=tower.nativePlayerAnimationSelector,
            selector=carried?2:ACTOR_VIEW.nativeSwimAnimationSelector;
        tower.nativePlayerWaterAnimation=true;tower.nativePlayerAnimationSelector=selector;
        tower.nativePlayerAnimationState=selector;
        const held=Boolean(tower.nativeRenderFrame?tower.nativeRenderFrame.held&&tower.held&&tower.nativeHeldDisplayReady!==false:tower.held);
        tower.nativePlayerIdleHeld=held;
        tower.nativePlayerPoseState=carried?(held?'recovery-held':'recovery-free'):'swim';
        tower.nativePlayerPostThrowPoseTicks=0;tower.nativePlayerPoseDelay=0;
        if(carried){
            // The carried actor is standing on the creature. Its normal idle
            // clock still consumes the shared native RNG on every update.
            advanceNativeActorRandomPhase(tower,nextRandom,previousSelector===2);
            tower.nativePlayerAnimationPhase=tower.nativeActorPhase;
            tower.nativePlayerAnimationStep=tower.nativeActorRandomStep??0;
            tower.nativePlayerAnimationPeriod=2;tower.nativePlayerAnimationTable=held?'group-2':'group-1';
        }else{
            const step=ACTOR_VIEW.nativeSwimAnimationStep,period=ACTOR_VIEW.nativeSwimAnimationPeriod;
            const phase=previousSelector===selector?tower.nativePlayerAnimationPhase??0:0;
            tower.nativePlayerAnimationPhase=(phase+step)%(period*0x10000);
            tower.nativePlayerAnimationStep=step;tower.nativePlayerAnimationPeriod=period;
            tower.nativePlayerAnimationTable='group-17';tower.nativeActorRandomActive=false;
        }
        tower.actorVisualPose=nativePlayerAnimationPose(tower);return tower.actorVisualPose;
    }
    if(tower.nativePlayerWaterAnimation){
        tower.nativePlayerWaterAnimation=false;tower.actorVisualPose=null;
        tower.actorVisualState=null;
    }
    if(tower.egg.lightning){
        const previous=tower.nativePlayerAnimationSelector;
        tower.nativePlayerAnimationSelector=11;
        tower.nativePlayerAnimationPhase=((previous===11?tower.nativePlayerAnimationPhase??0:0)+0x4000)%(4*0x10000);
        tower.nativePlayerAnimationState=5;tower.nativePlayerAnimationTable='group-5';
        tower.nativePlayerAnimationStep=0x4000;tower.nativePlayerAnimationPeriod=4;
        tower.nativePlayerPostThrowPoseTicks=0;tower.nativeActorRandomActive=false;
        if(tower.interruptedPlacing){
            const p=tower.interruptedPlacing;
            const throwTicks=Math.max(0,(p.ticks??0)-ACTOR_VIEW.playerThrowPoseFrameDelay);
            const count=ACTOR_VIEW.states.throw[1];
            const frame=Math.min(count-1,Math.floor(throwTicks/ACTOR_VIEW.playerThrowPoseTicksPerFrame));
            tower.actorVisualPose={state:'throw',row:ACTOR_VIEW.states.throw[0],frame};
            return tower.actorVisualPose;
        }
        tower.actorVisualPose=nativePlayerAnimationPose(tower);return tower.actorVisualPose;
    }
    const isRescue=tower.fieldIndex===0&&Boolean(tower.nativeRescueBody||tower.nativeActorState===2);
    if(isRescue){
        tower.nativePlayerPoseState=null;tower.nativePlayerPoseTicks=0;
        tower.nativePlayerAirTicks=0;tower.nativePlayerPoseDelay=0;tower.nativePlayerWalkStopTicks=0;
        tower.nativePlayerFallMovingReleasePending=false;
        tower.nativePlayerPostThrowPoseTicks=0;
        tower.nativeActorRandomActive=false;
        const arrived=Boolean(tower.nativeRescueBody?.arrived);
        const previousSelector=tower.nativePlayerAnimationSelector;
        const selector=arrived?10:7;
        tower.nativePlayerAnimationSelector=selector;
        if(arrived){
            const resources=NATIVE_CHARACTER_RESOURCES[tower.p.character],
                groupId=VIEW.arrivedRescueGroups[tower.artStage]??VIEW.arrivedRescueGroups.default,
                group=resources.groups[groupId];
            const period=group.period||2;
            const step=0x2000;
            const phase=previousSelector===10?(tower.nativePlayerAnimationPhase||0):0;
            tower.nativePlayerAnimationPeriod=period;
            tower.nativePlayerAnimationStep=step;
            tower.nativePlayerAnimationPhase=(phase+step)%(period*0x10000);
            tower.nativePlayerAnimationState=10;
            tower.nativePlayerAnimationTable=`group-${groupId}`;
            tower.actorVisualPose=nativePlayerAnimationPose(tower);
            return tower.actorVisualPose;
        }else{
            // ROM 0x0800eaec..ebfe selects from the attraction target
            // deltas, even when the body momentarily stops on an axis.
            const dx=tower.nativeRescueBody?.animationDx||0,
                dy=tower.nativeRescueBody?.animationDy||0;
            const animationState=dy>0?(dx!==0?9:7):(dx!==0?13:11);
            tower.nativePlayerRescueMirror=dx>0;
            const tableChoice=NATIVE_PLAYER_AIR_TABLES[animationState];
            const table=tableChoice?.free??'0x083f22a4';
            const period=2,step=0x2000;
            // Selector entry starts at phase zero; its first native animation
            // update adds the step once (8688 RAM +85c = 0x2000).
            const phase=previousSelector===7?(tower.nativePlayerAnimationPhase||0):0;
            tower.nativePlayerAnimationState=animationState;
            tower.nativePlayerAnimationTable=table;
            tower.nativePlayerAnimationPeriod=period;
            tower.nativePlayerAnimationStep=step;
            tower.nativePlayerAnimationPhase=(phase+step)%(period*0x10000);
            tower.actorVisualPose=nativePlayerAnimationPose(tower);
            return tower.actorVisualPose;
        }
    }
    if(tower.actorVisualPose){
        tower.nativePlayerPoseState=null;tower.nativePlayerPoseTicks=0;
        tower.nativePlayerAirTicks=0;tower.nativePlayerPoseDelay=0;tower.nativePlayerWalkStopTicks=0;
        tower.nativePlayerFallMovingReleasePending=false;
        tower.nativePlayerPostThrowPoseTicks=0;
        tower.nativePlayerAnimationSelector=0;tower.nativeActorRandomActive=false;
        tower.nativePlayerAnimationState=null;tower.nativePlayerAnimationTable=null;
        tower.nativePlayerAnimationPeriod=0;tower.nativePlayerAnimationPhase=0;
        tower.nativePlayerAnimationStep=0;
        return tower.actorVisualPose;
    }
    const e=tower.egg,p=tower.placing;
    const motionState=actorMotionState(tower);
    const state=playerMotionState(tower);
    const previousState=tower.nativePlayerPoseState;
    // The ROM keeps the moving-fall clip through the first OAM update after
    // horizontal input is released. Preserve that one displayed frame; the
    // next update returns to the ordinary free-fall pose.
    const keepFallMovingReleaseFrame=tower.fieldIndex===0&&state==='fall'&&!e.walking&&
        previousState==='fall-moving'&&!tower.nativePlayerFallMovingReleasePending;
    tower.nativePlayerFallMovingReleasePending=keepFallMovingReleaseFrame;
    const shownState=keepFallMovingReleaseFrame?'fall-moving':state;
    const displayState=!p&&actorUsesFreeHands(tower)&&shownState!=='fall-moving'?
        `${shownState}-free`:shownState;
    const airState=name=>['rise','float','fall','rise-free','float-free','fall-free','fall-moving'].includes(name);
    const previousAir=airState(previousState),currentAir=airState(displayState);
    // At the post-throw selector handoff the ROM shows one last free-standing
    // picture at air tick 17. Keep the simulated air state and phase running;
    // only the visible OAM pose is held for this update.
    const postThrowPoseHandoff=tower.fieldIndex===0&&!p&&currentAir&&
        tower.nativePlayerPostThrowPoseTicks===1&&tower.nativePlayerAirTicks===16;
    const wasWalking=previousState==='walk'||previousState==='walk-free';
    const isWalking=displayState==='walk'||displayState==='walk-free';
    const groundJumpPoseHold=tower.fieldIndex===0&&!p&&currentAir&&!previousAir&&
        state!=='throw'&&Boolean(tower.nativeCameraControl?.jump)&&
        actorUsesFreeHands(tower)&&previousState==='idle-free';
    const walkingTakeoffPoseHold=tower.fieldIndex===0&&!p&&currentAir&&!previousAir&&
        state==='rise'&&Boolean(e.walking)&&previousState==='walk';
    const facingChanged=isWalking&&previousState&&
        (previousState==='walk'||previousState==='walk-free')&&
        tower.nativePlayerPoseFacing!==e.facing;
    const leavingThrow=previousState==='throw'&&currentAir;
    if(displayState==='throw')tower.nativePlayerPostThrowPoseTicks=0;
    else if(leavingThrow)tower.nativePlayerPostThrowPoseTicks=ACTOR_VIEW.playerPostThrowPoseFrames;
    else if(tower.nativePlayerPostThrowPoseTicks>0)tower.nativePlayerPostThrowPoseTicks--;
    const previousAnimationSelector=tower.nativePlayerAnimationSelector;
    // State 4 leaves its previous support/input bytes intact. On the first
    // state-0 handoff, ROM 0x0800e7dc..e850 can therefore replace selector 8
    // with the retained ground-walk selector, before movement resumes.
    const throwGroundHandoff=previousAnimationSelector===8&&
        tower.nativeActorHandlerState===4&&tower.nativeActorState===0&&
        tower.nativeActorSupportAtHandler&&tower.nativeActorInputMove;
    // Ground support installs a walk/idle handler and ends selector8. Its
    // remaining tail must not resume if the actor leaves that ledge again.
    if(throwGroundHandoff||!currentAir&&!p)tower.nativePlayerPostThrowPoseTicks=0;
    let animationSelector;
    // Discard's state-5 handler clears inventory, then goes directly to the
    // pending-selector dispatch (0x0800e040..e05e / e79e..e7a4). Air handler5
    // has queued idle2; an unfinished walk/throw-tail still queues itself.
    // A wrapped clip has already queued idle via 0x0800ee14..ee28.
    if(tower.nativeThrowCancelledThisTick)tower.nativePlayerPostThrowPoseTicks=0;
    if(tower.nativeDiscardedThisTick||tower.nativeThrowCancelledThisTick)animationSelector=
        [3,4,8].includes(previousAnimationSelector)&&tower.nativePlayerAnimationPhase!==0?
            previousAnimationSelector:2;
    else if(tower.nativeActorHandlerState===4&&!p&&previousAnimationSelector===2)
        // E7DC..E850 uses the retained support/input bytes on this handoff.
        animationSelector=!tower.nativeActorSupportAtHandler||e.nativeWaterRise?5:
            tower.nativeActorInputMove<0?3:tower.nativeActorInputMove>0?4:2;
    else if(p)animationSelector=1;
    else if(throwGroundHandoff)animationSelector=tower.nativeActorInputMove<0?3:4;
    else if(currentAir&&e.nativeDiveMotion)animationSelector=5;
    else if(currentAir&&tower.nativePlayerPostThrowPoseTicks>0)
        animationSelector=tower.nativePlayerPostThrowPoseTicks>1?8:2;
    // Selector 4 is the native moving takeoff transition. Leaving a ledge
    // while already falling must enter selector 5 immediately; delaying it
    // by one update shifts the two-cel fall cycle at later phase boundaries.
    // Filler launches already have airborne support state. They enter the
    // air table directly, without the ordinary walking-jump transition.
    else if(currentAir&&!previousAir&&state==='rise'&&!e.nativeFillerMotion&&
        tower.nativeCameraControl?.jump&&(previousState||'').startsWith('walk'))
        // A discard may have queued idle2 on the preceding landing tick.
        // Takeoff with movement still installs the directional walk handler.
        animationSelector=e.walking?(e.facing>0?4:3):previousAnimationSelector;
    else if(currentAir&&!previousAir&&state==='rise'&&!e.nativeFillerMotion&&(previousState||'').startsWith('idle'))animationSelector=e.walking?(e.facing>0?4:3):2;
    else if(currentAir)animationSelector=5;
    else if(e.ground||tower.nativeAnimationGround)animationSelector=e.walking?(e.facing>0?4:3):2;
    else animationSelector=e.facing>0?4:3;
    // With no new direction, +0x858 retains the walk or post-throw selector
    // until its accumulator wraps (E824..E852 / EE14..EE28). Landing does
    // not itself request idle2; it must not consume RNG one tick early.
    if(animationSelector===2&&(e.ground||tower.nativeAnimationGround||currentAir&&!previousAir)&&!e.walking&&
        [3,4,8].includes(previousAnimationSelector)&&tower.nativePlayerAnimationPhase!==0)
        animationSelector=previousAnimationSelector;
    tower.nativePlayerAnimationSelector=animationSelector;
    if(tower.fieldIndex===0&&animationSelector===8){
        tower.nativePlayerAnimationState=16;
        tower.nativePlayerAnimationTable='group-16';
        tower.nativePlayerAnimationPeriod=ACTOR_VIEW.nativePostThrowAnimationPeriod;
        const phase=previousAnimationSelector===8?(tower.nativePlayerAnimationPhase||0):
            ACTOR_VIEW.nativePostThrowAnimationStartPhase;
        tower.nativePlayerAnimationStep=ACTOR_VIEW.nativePostThrowAnimationStep;
        tower.nativePlayerAnimationPhase=(phase+tower.nativePlayerAnimationStep)%
            (tower.nativePlayerAnimationPeriod*0x10000);
    }else if(tower.fieldIndex===0&&animationSelector===5){
        const animationState=(tower.nativeActorAnimationVy??e.vy)>=0?(e.walking?9:7):(e.walking?13:11);
        const heldAtOamUpdate=tower.nativeRenderFrame?tower.nativeRenderFrame.held&&tower.held&&tower.nativeHeldDisplayReady!==false:tower.held;
        const tableChoice=NATIVE_PLAYER_AIR_TABLES[animationState];
        tower.nativePlayerAnimationState=animationState;
        tower.nativePlayerAnimationTable=tableChoice?.[heldAtOamUpdate?'held':'free']??null;
        tower.nativePlayerAnimationPeriod=2;
        const phase=previousAnimationSelector===5?(tower.nativePlayerAnimationPhase||0):0;
        tower.nativePlayerAnimationPhase=(phase+0x2000)%(2*0x10000);
        tower.nativePlayerAnimationStep=0x2000;
    }else if(tower.fieldIndex===0&&(animationSelector===3||animationSelector===4)){
        const heldAtOamUpdate=tower.nativeRenderFrame?tower.nativeRenderFrame.held&&tower.held&&tower.nativeHeldDisplayReady!==false:tower.held;
        const table=heldAtOamUpdate?'0x083f2248':(NATIVE_PLAYER_WALK_TABLES[animationSelector]||NATIVE_PLAYER_WALK_TABLES[4]);
        const period=7,step=0x4000;
        const phase=previousAnimationSelector===animationSelector?
            (tower.nativePlayerAnimationPhase||0):0;
        tower.nativePlayerAnimationState=4;
        tower.nativePlayerAnimationTable=table;
        tower.nativePlayerAnimationPeriod=period;
        tower.nativePlayerAnimationPhase=(phase+step)%(period*0x10000);
        tower.nativePlayerAnimationStep=step;
    }else{
        tower.nativePlayerAnimationState=null;tower.nativePlayerAnimationTable=null;
        tower.nativePlayerAnimationPeriod=0;tower.nativePlayerAnimationPhase=0;
        tower.nativePlayerAnimationStep=0;
    }
    if(animationSelector===2){
        tower.nativePlayerIdleHeld=!tower.nativeDiscardedThisTick&&Boolean(tower.nativeRenderFrame?
            tower.nativeRenderFrame.held&&tower.held&&tower.nativeHeldDisplayReady!==false:tower.held);
        advanceNativeActorRandomPhase(tower,nextRandom,previousAnimationSelector===2);
    }else tower.nativeActorRandomActive=false;
    if(displayState!==previousState||facingChanged){
        const keepWalkPhase=wasWalking&&isWalking&&!facingChanged;
        tower.nativePlayerPoseState=displayState;
        if(!keepWalkPhase)tower.nativePlayerPoseTicks=0;
        if(currentAir&&!previousAir){
            // The native two-frame ground-jump pose hold does not pause the
            // airborne phase clock; start it one update ahead so later rise,
            // float and fall frames retain their measured cadence.
            tower.nativePlayerAirTicks=groundJumpPoseHold?1:0;
            tower.nativePlayerAirFrameDelay=motionState==='fall'?
                ACTOR_VIEW.fallMovingDirectFallPhaseDelay:ACTOR_VIEW.fallMovingEntryPhaseDelay;
        }
        if(!currentAir){tower.nativePlayerAirTicks=0;tower.nativePlayerAirFrameDelay=0;}
        tower.nativePlayerPoseDelay=leavingThrow?ACTOR_VIEW.playerThrowToAirPoseDelay:
            groundJumpPoseHold?ACTOR_VIEW.playerGroundJumpPoseDelay:
            Number(Boolean(previousState&&previousPose&&! (previousAir&&currentAir)));
        tower.nativePlayerPoseDelayPose=leavingThrow?
            {state:'throw',row:ACTOR_VIEW.states.throw[0],frame:ACTOR_VIEW.states.throw[1]-1}:
            groundJumpPoseHold?
            {state:'idle-free',row:ACTOR_VIEW.states['idle-free'][0],frame:0}:
            walkingTakeoffPoseHold?{state:'walk',row:ACTOR_VIEW.states.walk[0],frame:0}:previousPose||null;
        if(wasWalking&&!isWalking&&!currentAir&&previousPose){
            tower.nativePlayerWalkStopState=previousState;
            const [,count]=ACTOR_VIEW.states[previousState];
            tower.nativePlayerWalkStopStartFrame=previousPose.frame+1;
            tower.nativePlayerWalkStopInitialTicks=Math.max(0,count-1-previousPose.frame)*ACTOR_VIEW.frameSteps;
            tower.nativePlayerWalkStopTicks=tower.nativePlayerWalkStopInitialTicks;
        }
        if(isWalking){
            tower.nativePlayerHasWalked=true;
            tower.nativePlayerWalkStopTicks=0;
        }else if(currentAir||state==='throw')tower.nativePlayerWalkStopTicks=0;
        tower.nativePlayerPoseFacing=e.facing;
    }
    if(tower.nativePlayerPoseDelay>0&&tower.nativePlayerPoseDelayPose){
        tower.nativePlayerPoseDelay--;
        tower.actorVisualPose={...tower.nativePlayerPoseDelayPose};
        return tower.actorVisualPose;
    }
    if(tower.nativePlayerWalkStopTicks>0){
        const elapsed=tower.nativePlayerWalkStopInitialTicks-tower.nativePlayerWalkStopTicks;
        const frame=tower.nativePlayerWalkStopStartFrame+
            Math.floor(elapsed/ACTOR_VIEW.frameSteps);
        tower.nativePlayerWalkStopTicks--;
        const stoppedState=tower.nativePlayerWalkStopState||'walk';
        tower.actorVisualPose={state:stoppedState,row:ACTOR_VIEW.states[stoppedState][0],frame};
        return tower.actorVisualPose;
    }
    const [row,count]=ACTOR_VIEW.states[displayState];
    let frame,renderedRow=row,renderedState=displayState;
    if(displayState.startsWith('idle'))frame=Number.isInteger(tower.nativeActorFrame)?tower.nativeActorFrame%count:0;
    else if(displayState==='fall-moving'){
        const phaseTick=(tower.nativePlayerAirTicks||0)+1;
        const delay=tower.nativePlayerAirFrameDelay||ACTOR_VIEW.fallMovingEntryPhaseDelay;
        frame=Math.floor(Math.max(0,phaseTick-delay)/ACTOR_VIEW.fallMovingFrameSteps)%count;
        tower.nativePlayerAirTicks=phaseTick;
    }else if(currentAir){
        const offset=ACTOR_VIEW.airborneFrameOffsets[state]??0;
        frame=((Math.floor((tower.nativePlayerAirTicks||0)/ACTOR_VIEW.airborneFrameSteps)+offset)%count+count)%count;
        tower.nativePlayerAirTicks=(tower.nativePlayerAirTicks||0)+1;
        // With horizontal movement, the ROM holds the walking OAM cel briefly
        // as takeoff enters rise. A standing idle jump uses its separate hold
        // rule above; this only covers the measured moving takeoff transitions.
        if(state==='rise'&&e.walking&&tower.nativePlayerAirTicks===1){
            renderedState='walk';renderedRow=ACTOR_VIEW.states.walk[0];frame=0;
        }
    }else if(state==='throw'){
        const throwTicks=Math.max(0,(p?.ticks??tower.nativePlayerPoseTicks)-ACTOR_VIEW.playerThrowPoseFrameDelay);
        frame=Math.min(count-1,Math.floor(throwTicks/ACTOR_VIEW.playerThrowPoseTicksPerFrame));
    }else frame=Math.floor(tower.nativePlayerPoseTicks/ACTOR_VIEW.frameSteps)%count;
    if(displayState.startsWith('walk'))tower.nativePlayerPoseTicks++;
    tower.actorVisualPose=postThrowPoseHandoff?
        {state:'idle-free',row:ACTOR_VIEW.states['idle-free'][0],frame:0}:
        {state:renderedState,row:renderedRow,frame};
    return tower.actorVisualPose;
}
function rivalClipFrame(group,ticks){
    const durations=group.durations||Array(group.count).fill(ACTOR_VIEW.frameSteps);
    if(!durations.length)return 0;
    const total=durations.reduce((sum,duration)=>sum+duration,0);
    let phase=Math.max(0,Math.floor(ticks));
    phase=group.loop?phase%total:Math.min(total-1,phase);
    for(let frame=0;frame<durations.length-1;frame++){
        if(phase<durations[frame])return frame;
        phase-=durations[frame];
    }
    return durations.length-1;
}
function rivalPhaseFrame(group,phase,selector=5){
    const selectorMap=group.phaseFramesBySelector?.[selector];
    if(selectorMap&&Array.isArray(selectorMap.frames)&&selectorMap.frames.length&&
        Number.isFinite(selectorMap.step)&&selectorMap.step>0&&Number.isFinite(phase)){
        const phaseIndex=((Math.floor(phase/selectorMap.step)%selectorMap.frames.length)+
            selectorMap.frames.length)%selectorMap.frames.length;
        return selectorMap.frames[phaseIndex]??null;
    }
    const phaseFrames=group.phaseFrames;
    if(!Array.isArray(phaseFrames)||phaseFrames.length!==16||!Number.isFinite(phase))return null;
    const phaseIndex=(Math.floor(phase/NATIVE_ACTOR_ANIMATION.rivalAnimationSteps[5].step)&15);
    return phaseFrames[phaseIndex]??null;
}
function advanceRivalAnimationPhase(tower,desired,forceFreeAir=false,priorState=null,nextRandom){
    const p=NATIVE_ACTOR_ANIMATION,airborne=['rise','float','fall','rise-free','float-free','fall-free'].includes(desired);
    const enteringAir=airborne&&!['rise','float','fall','rise-free','float-free','fall-free'].includes(priorState||'');
    let selector;
    // State5 dispatches the animation already queued by the previous
    // handler, just as for P1; it does not run airborne selector5 again.
    if(tower.nativeDiscardedThisTick||tower.nativeThrowCancelledThisTick)selector=
        [3,4,8].includes(tower.nativeRivalAnimationSelector)&&tower.nativeRivalAnimationPhase!==0?
            tower.nativeRivalAnimationSelector:2;
    else if(tower.nativeActorHandlerState===4&&!tower.placing&&tower.nativeRivalAnimationSelector===2)
        selector=!tower.nativeActorSupportAtHandler||tower.egg.nativeWaterRise?5:
            tower.nativeActorInputMove<0?3:tower.nativeActorInputMove>0?4:2;
    else if(tower.placing)selector=1;
    else if(forceFreeAir)selector=(tower.nativeRivalPostThrowPoseTicks||0)>1?8:2;
    else if(airborne&&tower.egg.nativeDiveMotion)selector=5;
    else if(enteringAir&&tower.egg.vy>0&&!tower.egg.nativeFillerMotion&&tower.nativeRivalAnimationSelector!==10&&((priorState||'').startsWith('walk')||tower.egg?.walking))selector=tower.egg.walking?(tower.egg.facing>0?4:3):tower.nativeRivalAnimationSelector;
    else if(enteringAir&&tower.egg.vy>0&&!tower.egg.nativeFillerMotion&&(priorState||'').startsWith('idle'))selector=2;
    else if(airborne)selector=5;
    else if(tower.egg?.ground||tower.nativeAnimationGround)selector=tower.egg.walking?(tower.egg.facing>0?4:3):2;
    else selector=tower.egg.facing>0?4:3;
    if(selector===2&&(tower.egg?.ground||enteringAir)&&!tower.egg.walking&&
        [3,4].includes(tower.nativeRivalAnimationSelector)&&tower.nativeRivalAnimationPhase!==0)
        // Keep the left/right walk handler through a pause until its cycle
        // wraps; resuming in that direction must not restart the animation.
        selector=tower.nativeRivalAnimationSelector;
    const settings=p.rivalAnimationSteps[selector]||p.rivalAnimationSteps[4],
        limit=settings.period*p.phaseScale,previousSelector=tower.nativeRivalAnimationSelector;
    let phase=Number.isFinite(tower.nativeRivalAnimationPhase)?tower.nativeRivalAnimationPhase:
        Number.isFinite(tower.nativeActorPhase)?tower.nativeActorPhase:
        (((((tower.p?.seed||0)+(tower.fieldIndex||0)*p.fieldPhaseOffset+p.initialPhase)%limit)+limit)%limit);
    if((selector===3||selector===4||selector===5)&&previousSelector!==selector){
        // Selector 5 resets +0x85c on entry, then advances once before the
        // newly selected airborne table is displayed. The one-frame selector-4
        // takeoff handler uses the same reset-and-step transition.
        phase=settings.step;
    }else if(selector===8&&previousSelector!==selector){
        // Native selector 8 starts at this phase after the throw tables reset
        // selector 1's accumulator. Continuing selector 1's phase offsets
        // every post-throw air cel by four ROM updates.
        phase=settings.entryPhase??settings.step;
    }else if(selector===1&&previousSelector!==1){
        // Throw setup resets the shared phase; its first selector-1 update
        // leaves the accumulator at zero.
        phase=0;
    }else if(selector===2&&nextRandom){
        // The native selector-2 handler consumes one shared RNG draw per
        // actor update. It resets the phase on entry, then accumulates
        // (random >> 5) while selector 2 remains active.
        phase=advanceNativeActorRandomPhase(tower,nextRandom,previousSelector===2);
    }else if(selector===2&&Number.isFinite(tower.nativeActorPhase)&&!forceFreeAir){
        phase=tower.nativeActorPhase;
    }else{
        phase+=settings.step;
    }
    phase=((phase%limit)+limit)%limit;
    tower.nativeRivalAnimationPhase=phase;
    tower.nativeActorPhase=phase;
    tower.nativeRivalAnimationSelector=selector;
    tower.nativeActorAnimationSelector=selector;
    if(selector!==2)tower.nativeActorRandomActive=false;
    return phase;
}
function rivalAirDirection(desired,vy=0){
    const mode=desired.replace('-free','');
    return mode==='float'?(vy>0?'rise':'fall'):mode;
}
function rivalAirKey(key){
    return typeof key==='string'&&/^(air|rise|fall)-/.test(key);
}
function rivalGroup(states,desired,walking=false,postThrow=false,vy=0){
if(['rise','float','fall','rise-free','float-free','fall-free'].includes(desired)){
    const free=desired.endsWith('-free'),base=free?'air-free':'air';
    // Selector 5 has separate tables for rising/falling, held/free, and
    // moving/still. The float pose uses the table matching the sign of vy.
    const direction=rivalAirDirection(desired,vy),variantName=`${direction}${free?'-free':''}-${walking?'moving':'still'}`;
    const directional=postThrow?null:states[variantName];
    const movement=postThrow?null:states[`${base}-${walking?'moving':'still'}`];
    return directional||movement||states[base]||states[desired]||states[free?'idle-free':'idle'];
}
const free=desired.endsWith('-free')?'-free':'';
return states[desired]||states[(desired.startsWith('float')?'rise':'idle')+free]||states.idle||states['idle-free'];
}
function rivalPoseKey(desired,walking=false,postThrow=false,vy=0){
if(['rise','float','fall','rise-free','float-free','fall-free'].includes(desired)){
    const base=desired.endsWith('-free')?'air-free':'air';
    return postThrow?base:`${rivalAirDirection(desired,vy)}${desired.endsWith('-free')?'-free':''}-${walking?'moving':'still'}`;
}
return desired;
}
function rivalDisplayState(tower,desired=actorPose(tower).state){
    if(!tower.nativeRivalPostThrowPoseActive||!['rise','float','fall','rise-free','float-free','fall-free'].includes(desired))
        return desired;
    return desired.endsWith('-free')?desired:`${desired}-free`;
}
export function rivalPose(tower,artStage=tower.artStage){
    // Special poses are already sampled before the actor update. Adding the
    // ordinary resource snapshot's delay here would postpone every hit cel.
    const special=tower.nativeRivalResourcePose;
    if(special?.resource?.sheet===`${artStage}-rival-specials`)return {...special};
    const native=tower.nativeRenderFrame?.rivalResourcePose??tower.nativeRivalResourcePose;
    if(native&&(tower.nativeRivalCharacter||NATIVE_RIVAL_RESOURCES[artStage]||native.resource?.sheet===`${artStage}-rival-specials`))return {...native};
    const states=RIVAL_POSES[artStage];if(!states)return null;
    // Pickup handling runs after the actor's OBJ/animation preparation. On
    // the first display tick of a catch, keep the free-hand source table even
    // though the live inventory already contains the newly caught item.
    const snapshot=tower.nativeRenderFrame;
    if(snapshot?.held&&snapshot.heldReady===false&&
        tower.nativeRivalAnimationSelector===5&&!tower.nativeRivalPostThrowPoseActive){
        const desired=snapshot.pose?.state??actorPose(tower).state,
            free=desired.endsWith('-free')?desired:`${desired}-free`,
            group=rivalGroup(states,free,Boolean(snapshot.walking),false,tower.egg.vy);
        const frame=group&&rivalPhaseFrame(group,tower.nativeRivalAnimationPhase,
            tower.nativeRivalAnimationSelector??5);
        if(frame!==null&&frame!==undefined)return {row:group.row??group[0],frame};
    }
    if(tower.nativeRivalPoseHoldActive&&tower.nativeRivalPoseHoldPose)
        return {...tower.nativeRivalPoseHoldPose};
    const desired=rivalDisplayState(tower),postThrow=Boolean(tower.nativeRivalPostThrowPoseActive),
        walking=Boolean(tower.egg?.walking),vy=tower.egg?.vy||0,
        key=rivalPoseKey(desired,walking,postThrow,vy),
        group=rivalGroup(states,desired,walking,postThrow,vy);
    if(!group)return null;
    const row=group.row??group[0];
    // The ROM's selector-2 idle handler (0x0800ed50) advances the same
    // random-driven two-frame phase already tracked by advanceActorVisual.
    // Keep the rival on that native phase instead of its fitted clip clock.
    if((key==='idle'||key==='idle-free')&&Number.isInteger(tower.nativeActorFrame)){
        const count=group.durations?.length??group[1];
        const phaseFrame=tower.nativeActorFrame%count;
        // The Factory rival's two selector-2 idle cels are stored in the
        // opposite order from the phase bit: phase 0 displays atlas cel 1,
        // phase 1 displays cel 0. The 600-frame OAM capture confirms this
        // for both held and free-hand idle tables; other stages remain on
        // their existing mapping until their own native traces are checked.
        const frame=artStage==='factory'&&count===2?1-phaseFrame:phaseFrame;
        return {row,frame:Math.min(count-1,Math.max(0,frame))};
    }
    if(tower.nativeRivalPose?.key===key||tower.nativeRivalPose?.state===desired){
        return {row,frame:Math.min((group.durations?.length??group[1])-1,tower.nativeRivalPose.frame)};
    }
    const ticks=desired==='throw'?Math.max(0,(tower.placing?.ticks||0)-1):(tower.nativeRivalPoseTicks||0);
    const phaseFrame=rivalPhaseFrame(group,tower.nativeRivalAnimationPhase??tower.nativeActorPhase,
        tower.nativeRivalAnimationSelector??5);
    return {row,frame:phaseFrame??rivalClipFrame(group,ticks)};
}
export function advanceNativeRivalPose(tower,nextRandom){
    if(tower.nativeRescueBody||tower.nativeActorState===2){
        // Attraction uses selector 7 and target deltas for both actors (EAEC),
        // not the ordinary velocity-based airborne selector 5.
        const body=tower.nativeRescueBody,selector=body?.arrived?10:7,
            previous=tower.nativeRivalAnimationSelector,
            resources=NATIVE_CHARACTER_RESOURCES[tower.nativeRivalCharacter]??NATIVE_RIVAL_RESOURCES[tower.artStage],
            group=resources?.groups[VIEW.arrivedRescueGroups[tower.artStage]??VIEW.arrivedRescueGroups.default],
            period=selector===10?(group?.period??2):2;
        if(selector===7)tower.nativeRivalRescueMirror=(body?.animationDx||0)>0;
        tower.nativeRivalAnimationSelector=selector;
        tower.nativeRivalAnimationPhase=((previous===selector?tower.nativeRivalAnimationPhase||0:0)+0x2000)%(period*0x10000);
        tower.nativeActorAnimationSelector=selector;tower.nativeActorRandomActive=false;
        tower.nativeRivalPostThrowPoseTicks=0;tower.nativeRivalPostThrowPoseActive=false;
        const pose={...nativeRivalResourcePose(tower),mirrorX:Boolean(tower.nativeRivalRescueMirror)};
        tower.nativeRivalResourcePose=pose;tower.nativeRivalPose=pose;
        tower.nativeRivalPoseState='rescue';
        return pose;
    }
    if((tower.nativeWaterRecovery&&tower.egg.swimming||tower.nativeActorState===6)&&tower.nativeRivalCharacter){
        tower.nativeRivalWaterAnimation=true;
        const carried=tower.egg.waterEjected,previousSelector=tower.nativeRivalAnimationSelector;
        tower.nativeRivalAnimationSelector=carried?2:9;
        if(carried){
            advanceNativeActorRandomPhase(tower,nextRandom,previousSelector===2);
            tower.nativeRivalAnimationPhase=tower.nativeActorPhase;
        }else{
            const period=NATIVE_CHARACTER_RESOURCES[tower.nativeRivalCharacter].groups[17].period;
            tower.nativeRivalAnimationPhase=((previousSelector===9?tower.nativeRivalAnimationPhase??0:0)+0x4000)%(period*0x10000);
        }
        const pose=nativeRivalResourcePose(tower);
        tower.nativeRivalResourcePose=pose;tower.nativeRivalPose=pose;
        tower.nativeRivalPoseState=carried?'recovery-free':'swim';
        tower.nativeRivalPostThrowPoseTicks=0;tower.nativeRivalPostThrowPoseActive=false;
        return pose;
    }
    if(tower.nativeRivalWaterAnimation){
        tower.nativeRivalWaterAnimation=false;tower.actorVisualPose=null;tower.actorVisualState=null;
    }
    if(tower.egg.lightning&&tower.nativeRivalCharacter){
        const entering=tower.nativeRivalAnimationSelector!==11;
        tower.nativeRivalAnimationSelector=11;
        tower.nativeRivalAnimationPhase=((entering?0:tower.nativeRivalAnimationPhase??0)+0x4000)%(4*0x10000);
        const pose={...nativeRivalResourcePose(tower),mirrorX:true};
        tower.nativeRivalResourcePose=pose;tower.nativeRivalPose=pose;
        tower.nativeRivalPoseState='injured';
        tower.nativeRivalPostThrowPoseTicks=0;tower.nativeRivalPostThrowPoseActive=false;
        return pose;
    }
    const special=tower.actorVisualPose;
    if(special&&['injured','swim'].includes(special.state)){
        const injured=special.state==='injured',pose={state:special.state,frame:special.frame,
            row:injured?0:1,nativeGroup:injured?5:17,mirrorX:injured,
            resource:{sheet:`${tower.artStage}-rival-specials`,row:injured?0:1,column:special.frame}};
        tower.nativeRivalAnimationSelector=injured?11:9;
        tower.nativeRivalResourcePose=pose;tower.nativeRivalPose=pose;
        tower.nativeRivalPoseState=special.state;
        tower.nativeRivalPostThrowPoseTicks=0;tower.nativeRivalPostThrowPoseActive=false;
        return pose;
    }
    const rawDesired=actorPose(tower).state,airborne=['rise','float','fall','rise-free','float-free','fall-free'].includes(rawDesired);
    const priorState=tower.nativeRivalPoseState;
    const priorPostThrowPoseActive=Boolean(tower.nativeRivalPostThrowPoseActive);
    const priorPose=tower.nativeRivalPose&&{row:tower.nativeRivalPose.row,frame:tower.nativeRivalPose.frame};
    const priorKey=tower.nativeRivalPoseKey;
    const holdingPreviousPose=(tower.nativeRivalPoseHoldRemaining||0)>0;
    tower.nativeRivalPoseHoldActive=holdingPreviousPose;
    if(holdingPreviousPose)tower.nativeRivalPoseHoldRemaining--;
    else tower.nativeRivalPoseHoldPose=null;
    if(rawDesired==='throw'&&priorState!=='throw'&&priorPose&&!tower.nativeRivalPoseHoldActive){
        // OAM is uploaded before selector 1 installs its throw table. The
        // first throw-table update therefore still displays the prior cel.
        tower.nativeRivalPoseHoldPose=priorPose;
        tower.nativeRivalPoseHoldActive=true;
        tower.nativeRivalPoseHoldRemaining=0;
    }
    // Native OAM is updated before the actor handler. A CPU that jumps while
    // walking therefore shows the next walk cel on takeoff, then holds that
    // same cel for one more OAM update before switching to its air clip.
    // The 600-frame Hard capture contains this exact two-frame handoff.
    if(airborne&&(priorState==='walk'||priorState==='walk-free')){
        const states=RIVAL_POSES[tower.artStage],group=states&&rivalGroup(states,priorState,tower.egg?.walking,false,tower.egg?.vy||0);
        if(group){
            const row=group.row??group[0];
            const frame=rivalClipFrame(group,tower.nativeRivalPoseTicks||0);
            tower.nativeRivalPoseHoldPose={row,frame};
            tower.nativeRivalPoseHoldActive=true;
            tower.nativeRivalPoseHoldRemaining=1;
        }
    }
    if(tower.nativeRivalPoseState==='throw'&&airborne)
        tower.nativeRivalPostThrowPoseTicks=ACTOR_VIEW.rivalPostThrowPoseFrames;
    if(rawDesired==='throw')tower.nativeRivalPostThrowPoseTicks=0;
    else if(!airborne){
        tower.nativeRivalPostThrowPoseTicks=0;
        tower.nativeRivalPoseHoldActive=false;
        tower.nativeRivalPoseHoldRemaining=0;
        tower.nativeRivalPoseHoldPose=null;
    }
    if(tower.nativeThrowCancelledThisTick)tower.nativeRivalPostThrowPoseTicks=0;
    const forceFreeAir=airborne&&(tower.nativeRivalPostThrowPoseTicks||0)>0;
    tower.nativeRivalPostThrowPoseActive=forceFreeAir;
    const animationPhase=advanceRivalAnimationPhase(tower,rawDesired,forceFreeAir,priorState,nextRandom);
    const desired=rivalDisplayState(tower,rawDesired),states=RIVAL_POSES[tower.artStage];
    if(!states){tower.nativeRivalPose=null;return null;}
    const walking=Boolean(tower.egg?.walking),vy=tower.egg?.vy||0,
        key=rivalPoseKey(desired,walking,forceFreeAir,vy),
        group=rivalGroup(states,desired,walking,forceFreeAir,vy);
    if(!group){tower.nativeRivalPose=null;return null;}
    const row=group.row??group[0];
    if(key!==tower.nativeRivalPoseKey){
        const keepAirPhase=airborne&&rivalAirKey(priorKey)&&rivalAirKey(key);
        const leavingPostThrowAir=priorPostThrowPoseActive&&!forceFreeAir&&airborne;
        // The ROM switches animation tables as vertical direction or its
        // movement flag changes, but keeps the shared +0x85c phase. OAM is
        // uploaded before that actor update, so the previous cel remains for
        // ordinary table switches. Leaving selector 8 is different: the ROM
        // immediately displays the newly selected rise table rather than the
        // final free-air cel.
        if(keepAirPhase&&!leavingPostThrowAir&&priorPose&&!tower.nativeRivalPoseHoldActive){
            tower.nativeRivalPoseHoldPose=priorPose;
            tower.nativeRivalPoseHoldActive=true;
            tower.nativeRivalPoseHoldRemaining=0;
        }
        tower.nativeRivalPoseState=desired;tower.nativeRivalPoseKey=key;
        if(!keepAirPhase)tower.nativeRivalPoseTicks=0;
    }else{
        tower.nativeRivalPoseState=desired;
    }
    const poseTicks=forceFreeAir?Math.max(0,(tower.nativeRivalPoseTicks||0)-ACTOR_VIEW.rivalPostThrowPoseFrameDelay):
        tower.nativeRivalPoseTicks||0;
    const frame=desired==='throw'?
        rivalClipFrame(group,Math.max(0,(tower.placing?.ticks||0)-1)):
        rivalPhaseFrame(group,animationPhase,tower.nativeRivalAnimationSelector??5)??
            rivalClipFrame(group,poseTicks);
    if(desired!=='throw')tower.nativeRivalPoseTicks=(tower.nativeRivalPoseTicks||0)+1;
    tower.nativeRivalPose={state:desired,key,row,frame};
    tower.nativeRivalResourcePose=nativeRivalResourcePose(tower);
    if(forceFreeAir)tower.nativeRivalPostThrowPoseTicks--;
    return tower.nativeRivalPose;
}
export function nativeRivalResourcePose(tower,descriptor=null){
    const resources=NATIVE_CHARACTER_RESOURCES[tower.nativeRivalCharacter]??NATIVE_RIVAL_RESOURCES[tower.artStage];if(!resources)return null;
    if(descriptor!==null){
        const pointer=typeof descriptor==='string'?descriptor:'0x'+descriptor.toString(16);
        for(const [id,group] of Object.entries(resources.groups)){
            const cel=group.descriptors.indexOf(pointer);
            if(cel>=0)return {row:group.row,frame:cel,nativeGroup:Number(id),
                resource:{sheet:resources.sheet,row:group.row,column:cel}};
        }
        return null;
    }
    const selector=tower.nativeRivalAnimationSelector??5,
        // A projectile catch switches the table after the actor phase without
        // advancing it again; ordinary loose pickups keep their later ordering.
        held=Boolean(tower.nativeProjectileCaughtThisTick?tower.held:
            tower.nativeRenderFrame?tower.nativeRenderFrame.held&&tower.held&&tower.nativeHeldDisplayReady!==false:tower.held),
        phase=tower.nativeRivalAnimationPhase??0;
    let groupId,sourcePhase=phase;
    if(selector===1&&tower.placing){
        let ticks=Math.max(0,(tower.placing.ticks??1)-1);
        groupId=14;
        while(groupId<16&&ticks>=resources.groups[groupId].period*2){
            ticks-=resources.groups[groupId].period*2;groupId++;
        }
        sourcePhase=ticks*0x8000;
    }else if(selector===9){groupId=17;sourcePhase-=0x4000;}
    else if(selector===11){groupId=5;sourcePhase-=0x4000;}
    else if(selector===10){groupId=VIEW.arrivedRescueGroups[tower.artStage]??VIEW.arrivedRescueGroups.default;sourcePhase-=0x2000;}
    else if(selector===7){
        const dx=tower.nativeRescueBody?.animationDx||0,dy=tower.nativeRescueBody?.animationDy||0;
        groupId=dy>0?(dx!==0?8:6):(dx!==0?12:10);sourcePhase-=0x2000;
    }
    else if(selector===8){groupId=16;sourcePhase-=0x4000;}
    else if(selector===2){groupId=held?2:1;sourcePhase-=tower.nativeActorRandomStep??0;}
    else if(selector===3||selector===4){groupId=held?4:3;sourcePhase-=0x4000;}
    else{
        // A falling bonus can launch the actor after its animation handler.
        // Keep that handler's velocity until the following actor update.
        const moving=Boolean(tower.nativeActorInputMove||tower.egg.walking);
        groupId=(tower.nativeActorAnimationVy??tower.egg.vy)>=0?
            (moving?9:7):(moving?13:11);
        if(!held)groupId--;
        sourcePhase-=0x2000;
    }
    const group=resources.groups[groupId];if(!group)return null;
    const period=group.period*0x10000,
        cel=Math.floor(((sourcePhase%period)+period)%period/0x10000);
    return {row:group.row,frame:cel,nativeGroup:groupId,
        resource:{sheet:resources.sheet,row:group.row,column:cel}};
}
export function createView(nativeCameraOffset=VIEW.nativeCameraOffsetInitial){return {camera:0,previousCamera:0,boardCamera:null,backgroundCamera:0,previousHeight:0,
    nativeCameraOffset,nativeCameraPosition:VIEW.nativeCameraReferencePixels,
    previousNativeCameraPosition:VIEW.nativeCameraReferencePixels,
    previousPreviousNativeCameraPosition:VIEW.nativeCameraReferencePixels,
    nativeCameraY:nativeBg3CameraY(VIEW.nativeCameraReferencePixels),nativeCameraHoldActive:false,
    nativeBoardCameraY:nativeBg3CameraY(VIEW.nativeCameraReferencePixels),
    nativeCameraPostThrowActive:false,nativeCameraPostThrowTicks:0,nativeCameraActorY:null,
    throwing:false,postThrow:false,meter:{position:0,velocity:0},meterPose:{x:0,y:148,barY:152,flashing:false},previousMeterPose:null};}
function nativeCameraActorY(tower){
    if(tower.nativeActorState===3&&Number.isFinite(tower.nativeIntroCameraY))return Math.floor(tower.nativeIntroCameraY);
    return Math.floor(tower.egg.nativeWaterCameraY??RULES.nativeActorFloor-tower.egg.y*RULES.projectilePixels);
}
export function seedNativeCameraActorY(state,tower){
    state.nativeCameraActorY=nativeCameraActorY(tower);
    return state.nativeCameraActorY;
}
function advanceNativeCameraOffset(offset,control={},tower){
    const {nativeCameraOffsetStep:step,nativeCameraOffsetMaximum:maximum,nativeCameraOffsetMinimum:minimum}=VIEW;
    const grounded=tower?.nativeCameraSupported??tower?.egg?.ground??false;
    if(control.fast&&grounded){if(offset<maximum)offset+=step;}
    else if(offset>0)offset-=step;
    // ROM reads the separately mapped look-up key at 0x02000164 here. It is
    // unbound (zero) in the GBA defaults; Up is float/jump, not look-up.
    if(tower?.nativeActorState===3||tower?.nativeIntroCameraRelease||control.lookUp){
        if(offset>minimum)offset-=step;
    }else if(offset<0)offset+=step;
    return offset;
}
function nativeCameraTarget(actorY,offset,tower){
    // 04908 reads the field waterline before 19910 raises it this tick.
    const waterline=tower?.water!==undefined?
        Math.floor(RULES.nativeActorFloor-(tower.previousWater??tower.water)*RULES.projectilePixels+RULES.bubbleWaterlineBias):
        VIEW.nativeCameraClampPixels;
    const maxClamp=Number.isFinite(waterline)?Math.min(VIEW.nativeCameraClampPixels,waterline):VIEW.nativeCameraClampPixels;
    return Math.max(0,Math.min(maxClamp,
        actorY+(offset>>1)-VIEW.nativeCameraTargetOffsetPixels));
}
function advanceNativeForegroundCamera(state,tower,control){
    const actorY=nativeCameraActorY(tower),actorState=tower.placing?4:(tower.nativeActorState??0);
    let offset=Number.isFinite(state.nativeCameraOffset)?state.nativeCameraOffset:VIEW.nativeCameraOffsetInitial;
    if(actorState===2){
        if(!state.nativeCameraRescueActive){
            // Rescue begins after this tick's ordinary input callback. Its
            // existing look offset still relaxes before 04908 samples it.
            const inputHeld=tower.nativeActorHandlerState===4||
                [7,8].includes(tower.nativeRenderFrame?.animationClock?.selector);
            if(!inputHeld)offset=advanceNativeCameraOffset(offset,control,tower);
            state.nativeCameraRescueActive=true;
            state.nativeCameraRescueTicks=0;
            state.nativeCameraHoldActive=false;
            state.nativeCameraPostThrowTicks=0;
            // 04908 runs before the first state-2 attraction integration.
            // Keep its existing actor sample on entry, just as on later
            // rescue ticks; rounding the new body Y can shift the camera 1px.
            state.nativeCameraActorY??=actorY;
        }else{
            state.nativeCameraRescueTicks++;
            if(offset>-VIEW.nativeCameraOffsetMaximum)offset-=VIEW.nativeCameraOffsetStep;
        }
    }else{
        state.nativeCameraRescueActive=false;
        state.nativeCameraRescueTicks=0;
    }
    const previousAnimation=tower.nativeRenderFrame?.animationClock;
    // The camera callback precedes the actor animation handler. Use that
    // handler's actual selector (0x08004974..4992), including early exits
    // from selector 8; its duration is not always the full throw clip.
    const holdCamera=actorState!==2&&(tower.nativeActorHandlerState===4||
        (previousAnimation?[7,8].includes(previousAnimation.selector):state.nativeCameraHoldActive));
    if(actorState!==2&&actorState!==6&&tower.nativeActorHandlerState!==6&&(!holdCamera||tower.nativeActorHandlerState!==4))
        offset=advanceNativeCameraOffset(offset,control,tower);
    // During capture the camera callback precedes the enemy's new carry
    // position. Handler 6 also leaves the field's look offset untouched.
    const cameraActorY=(actorState===2||tower.nativeActorHandlerState===6||((actorState===4||tower.nativeRenderPlacing)&&tower.nativeActorHandlerState===4&&state.nativeCameraHoldActive))&&Number.isFinite(state.nativeCameraActorY)?
        state.nativeCameraActorY:(actorState===6&&tower.nativeActorHandlerState!==6&&Number.isFinite(tower.nativePreCaptureCameraActorY)?tower.nativePreCaptureCameraActorY:actorY);
    tower.nativePreCaptureCameraActorY=null;
    const target=nativeCameraTarget(cameraActorY,offset,tower),current=Number.isFinite(state.nativeCameraPosition)?
        state.nativeCameraPosition:Math.round(VIEW.nativeCameraReferencePixels-state.camera*VIEW.tile);
    // ROM 0x08004908 holds the camera while the actor is throwing or using
    // animation handlers 7/8, and feeds the target error back into +0xeb8.
    // `actorPose().row` is a sprite-atlas row, not that native handler index.
    // Selector 8 runs for 18 ticks after a throw; postThrow itself persists
    // through descent, so it needs a separate finite camera-hold clock.
    if(state.postThrow&&!state.nativeCameraPostThrowActive)
        state.nativeCameraPostThrowTicks=VIEW.nativeCameraPostThrowHoldFrames;
    else if(!state.postThrow)state.nativeCameraPostThrowTicks=0;
    state.nativeCameraPostThrowActive=Boolean(state.postThrow);
    const wantsHoldCamera=actorState!==2&&(actorState===4||state.nativeCameraPostThrowTicks>0);
    // The native field camera runs one actor-state phase before the actor
    // handler commits its new state, so transitions enter/leave this path one
    // fixed tick later than the renderer observes the updated actor.
    state.nativeCameraHoldActive=wantsHoldCamera;
    let cameraPosition=target;
    if(holdCamera){
        offset+=2*(current-target);
        if(offset>VIEW.nativeCameraOffsetMaximum){
            offset=VIEW.nativeCameraOffsetMaximum;cameraPosition=target;
        }else if(offset<VIEW.nativeCameraOffsetMinimum){
            offset=VIEW.nativeCameraOffsetMinimum;cameraPosition=target;
        }else cameraPosition=current;
    }
    state.nativeCameraOffset=offset;
    state.nativeCameraPosition=cameraPosition;
    state.nativeCameraY=nativeBg3CameraY(cameraPosition,tower.artStage,tower.fieldIndex);
    state.nativeCameraActorY=actorY;
    // The first falling update still samples state 3 before the actor handler
    // commits its pending state-0 transition (0x08004908 / 0x0800d748).
    tower.nativeIntroCameraRelease=false;
    if(state.nativeCameraPostThrowTicks>0)state.nativeCameraPostThrowTicks--;
    state.camera=(VIEW.nativeCameraReferencePixels-cameraPosition)/VIEW.tile;
}
export function advanceView(state,tower,dt,control=tower.nativeCameraControl||{}){
    state.previousCamera=state.camera;
    state.previousPreviousNativeCameraPosition=state.previousNativeCameraPosition;
    state.previousNativeCameraPosition=state.nativeCameraPosition;
    if(!Number.isFinite(state.boardCamera))state.boardCamera=state.camera||0;
    // The ROM writes the BG0 and player BG1 scroll registers before advancing
    // the actor state for this frame. Keep these layers on the tracker from
    // the start of the tick; the actor and foreground camera use the new state.
    state.boardCamera=state.camera;
    state.nativeBoardCameraY=Number.isFinite(state.nativeCameraY)?state.nativeCameraY:
        nativeBg3CameraY(VIEW.nativeCameraReferencePixels-state.boardCamera*VIEW.tile,tower.artStage,tower.fieldIndex);
    state.previousMeterPose=state.meterPose;
    const incomplete=tower.countIncompleteFloors?tower.countIncompleteFloors():(tower.incompleteFloors||0);
    tower.incompleteFloors=incomplete;
    advanceNativeMeter(state.meter,incomplete);
    state.meterPose=nativeMeterPose(state.meter,incomplete,tower.nativeFrame);
    const e=tower.egg,p=tower.placing;
    const followThrowCamera=Boolean(p&&(RULES.throwTime-p.time)+1e-9>=VIEW.throwDelayFrames*RULES.step);
    if(e.introDescent&&tower.p?.mode!=='survival'){state.camera=Math.max(0,e.y);state.boardCamera=state.camera;state.backgroundCamera=state.camera;
        state.nativeCameraPosition=Math.max(0,Math.min(VIEW.nativeCameraClampPixels,
            Math.round(VIEW.nativeCameraReferencePixels-state.camera*VIEW.tile)));
        state.nativeCameraY=nativeBg3CameraY(state.nativeCameraPosition,tower.artStage,tower.fieldIndex);
        state.nativeBoardCameraY=state.nativeCameraY;
        state.nativeCameraActorY=nativeCameraActorY(tower);
        state.previousHeight=e.y;return state;}
    if(e.lightning||tower.nativeThrowCancelledThisTick||tower.nativeActorState===6){state.throwing=false;state.postThrow=false;}
    if(p){
        state.throwing=true;state.postThrow=false;
    }else{
        if(state.throwing){state.throwing=false;state.postThrow=!e.lightning;}
        if(state.postThrow&&e.ground)state.postThrow=false;
        // The native camera keeps following the actor during the post-throw
        // fall. postThrow marks the landing transition; it must not freeze
        // either camera while the actor is still airborne.
        const target=Math.max(0,e.y*VIEW.tile-VIEW.backgroundMargin)/VIEW.tile;
        const alpha=target>state.backgroundCamera?VIEW.backgroundRiseBlend:VIEW.backgroundFallBlend;
        state.backgroundCamera+=(target-state.backgroundCamera)*(1-Math.pow(1-alpha,dt/RULES.step));
    }
    if(tower.p?.mode==='survival'){
        advanceNativeForegroundCamera(state,tower,control);
        if(p&&followThrowCamera)state.backgroundCamera=state.camera;
    }else if(p){
        if(followThrowCamera){
            const target=Math.max(0,(p.eggY+p.targetY)*VIEW.tile/2-VIEW.throwMargin)/VIEW.tile;
            const blend=1-Math.pow(1-VIEW.throwBlend,dt/RULES.step);
            state.camera+=(target-state.camera)*blend;
            state.backgroundCamera=state.camera;
        }
    }else{
        state.camera=Math.max(0,Math.ceil(state.previousHeight*VIEW.tile-VIEW.foregroundMargin))/VIEW.tile;
    }
    // Board tiles, platform and landing preview retain the pre-actor BG0
    // camera for this tick. This one-step phase offset matters during jumps.
    state.previousHeight=e.y;
    return state;
}
export function backgroundOffset(state,stage){
    const initial=VIEW.backgroundOffsets[stage]??VIEW.backgroundOffsets.factory;
    return ((Math.floor(initial-state.backgroundCamera*VIEW.tile*VIEW.parallax)%256)+256)%256;
}
