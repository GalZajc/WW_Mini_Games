// Water actor: 0x0800df16 / 0x0800f878. Creature: 0x08013a7c.
import {NATIVE_SOUND_EVENTS as SFX} from './native-sound-events.js';
// Native positions and velocities use signed 16.16 pixels and pixels/tick.
export const NATIVE_WATER=Object.freeze({
    entryProbePixels:17,entryTimer:90,discardWhileTimerAbove:45,creatureSpawnTimer:49,deepForce:-0x4000,shallowForce:0x8000,
    dragNumerator:15,dragShift:4,forceProbePixels:8,
    creatureDepth:60,shortStageDepth:108,shortStageHeight:23,
    creatureStartY:-1,creatureStartX:-8,creatureFollowX:-17,
    creatureStartVelocity:-0x60000,creatureAcceleration:0x147a,
    creatureRiseThreshold:-0x20000,creatureFallThreshold:0x60000,
    creatureCatchDepth:30,actorCarryOffset:26,releaseAcceleration:0x4000,
    releaseFadeThreshold:0x20000,releaseKickVelocity:-0x38000,boostedReleaseKickVelocity:-0x50000,
    spriteSize:64,spriteCullBottom:201,animationFrames:8,animationShift:1,releaseAnimationStart:15,
    splashSize:32,splashFrames:16,splashFrameTicks:2,splashYBias:-4,
    entrySplashWidth:8,creatureSplashWidth:16,creatureSplashX:16,
    enemySplashProbePixels:17,enemySplashX:16,enemySplashWidth:16,
});
const worldY=(t,r)=>Math.round((r.nativeActorFloor-t.egg.y*r.projectilePixels)*r.actorFixedScale);
const waterline=(t,r)=>Math.round((r.nativeActorFloor-t.water*r.projectilePixels+r.bubbleWaterlineBias)*r.actorFixedScale);
const previousWaterline=(t,r)=>Math.round((r.nativeActorFloor-(t.previousWater??t.water)*r.projectilePixels+
    r.bubbleWaterlineBias)*r.actorFixedScale);
const force=(y,line,r)=>y-NATIVE_WATER.forceProbePixels*r.actorFixedScale>line?NATIVE_WATER.deepForce:
    y-NATIVE_WATER.forceProbePixels*r.actorFixedScale<line?NATIVE_WATER.shallowForce:0;
export function splash(t,x,width,playSound=true){
    if(playSound)t.queueNativeSound?.(SFX.waterSplash,t.nativeAudioPhase??5);
    (t.nativeWaterSplashes??=[]).unshift({x,width,bornFrame:t.nativeFrame});
}
export function beginNativeWaterRecovery(t,r,entrySplash=true){
    const e=t.egg,y=worldY(t,r),velocity=Math.round(-e.vy*r.projectilePixels*r.step*r.actorFixedScale);
    t.nativeWaterRecovery={timer:NATIVE_WATER.entryTimer,velocity:velocity+force(y,previousWaterline(t,r),r),releasePending:false};
    if(entrySplash)splash(t,Math.round((e.x*r.projectilePixels-r.projectilePixels)*r.actorFixedScale),NATIVE_WATER.entrySplashWidth,false);
    e.swimming=true;e.waterEjected=false;e.waterTime=0;e.offTower=true;e.ground=false;
    e.lightning=null;e.stun=0;e.dive=0;
    e.nativeFillerMotion=false;e.nativeDiveMotion=false;
    t.held=null;t.nativeActorState=1;t.nativeActorNextState=1;
    e.vy=-t.nativeWaterRecovery.velocity/r.actorFixedScale/(r.projectilePixels*r.step);
}
export function advanceNativeWaterCreature(t,r,allowSpawn=true){
    const e=t.egg,s=t.nativeWaterRecovery,p=NATIVE_WATER,fixed=r.actorFixedScale;
    const c=t.nativeWaterCreature??={active:false,carrying:false,y:0,x:0,velocity:0,fade:false,
        counter:t.nativeWaterCreatureInitialCounter??0,splashed:false};
    c.nativeSpriteSamplePrepared=false;
    if(t.nativeWaterSplashes)t.nativeWaterSplashes=t.nativeWaterSplashes.filter(s=>
        t.nativeFrame-s.bornFrame<=p.splashFrames*p.splashFrameTicks);
    // OAM displays the previous submitted descriptor, not the newly advanced body.
    t.nativeWaterCreatureRender=c.spriteVisible?{x:c.x,y:c.y,frame:c.spriteFrame}:null;
    c.spriteVisible=false;
    const line=previousWaterline(t,r);
    const base=line+((t.p.nativeConfig?.height??r.survivalHeightBase)<p.shortStageHeight?
        p.shortStageDepth:p.creatureDepth)*fixed;
    if(e.swimming&&s){
        if(!c.active){
            // 13ACA..13AE8 permits a new rescue only on the winning field
            // after the result flag is set; existing creatures still advance.
            if(!allowSpawn)return;
            if(s.timer>p.creatureSpawnTimer){s.timer--;return;}
            Object.assign(c,{active:true,carrying:false,fade:false,splashed:false,y:base+p.creatureStartY*fixed,
                x:Math.round((e.x*r.projectilePixels-r.projectilePixels+p.creatureStartX)*fixed),velocity:p.creatureStartVelocity});
        }else if(!c.carrying&&c.y<base-p.creatureCatchDepth*fixed&&c.velocity<0)c.carrying=true;
    }else if(c.active){
        if(!c.fade&&c.velocity<0){c.fade=true;c.counter=p.releaseAnimationStart;}
        if(c.velocity>0)c.carrying=false;
        if(c.velocity>0&&c.y>line&&!c.splashed){
            splash(t,c.x+p.creatureSplashX*fixed,p.creatureSplashWidth);c.splashed=true;
        }
    }
    if(!c.active)return;
    const followActorX=c.velocity<=0;
    if(c.fade){c.velocity+=p.releaseAcceleration;if(c.velocity>=p.releaseFadeThreshold)c.fade=false;}
    if(followActorX)c.x=Math.round((e.x*r.projectilePixels-r.projectilePixels+p.creatureFollowX)*fixed);
    if(c.velocity<=0){
        if(c.velocity<p.creatureRiseThreshold)c.velocity+=p.creatureAcceleration;
    }else if(c.velocity<p.creatureFallThreshold)c.velocity+=p.creatureAcceleration;
    // Native OAM keeps the preceding vertical sample, but horizontal follow
    // is installed before submission (0x08013a7c). It has no extra X delay.
    if(t.nativeWaterCreatureRender)t.nativeWaterCreatureRender.x=c.x;
    c.y+=c.velocity;
    if(c.y>base)c.active=false;
    c.nativeSpriteSamplePrepared=true;c.nativeSpriteCounterBefore=c.counter;
    const camera=r.nativeParticleView.cameraReference-(t.nativeRenderFrame?.camera??0)*r.projectilePixels;
    finalizeNativeWaterCreatureSprite(t,r,camera);
}
export function finalizeNativeWaterCreatureSprite(t,r,camera){
    const c=t.nativeWaterCreature,p=NATIVE_WATER;
    if(!c?.nativeSpriteSamplePrepared)return;
    c.counter=c.nativeSpriteCounterBefore;c.spriteVisible=false;
    if(Math.floor(c.y/r.actorFixedScale)-Math.floor(camera)<p.spriteCullBottom){
        c.counter++;
        const cel=(c.counter>>p.animationShift)&(p.animationFrames-1);
        c.spriteFrame=c.fade?p.animationFrames+cel:c.velocity>0?p.animationFrames*2-1:cel;
        c.spriteVisible=true;
    }
}
export function advanceNativeWaterActor(t,r){
    const e=t.egg,s=t.nativeWaterRecovery;
    if(!s||!e.swimming){
        if(!e.nativeWaterRise)return false;
        // 0x0800f91c..f97a: field +0x1240 keeps a constant upward
        // velocity until old Y clears (roof map row - 2) * 16. The
        // native cached roof row is 47 - current tower height.
        const y=worldY(t,r),velocity=e.boost>0?NATIVE_WATER.boostedReleaseKickVelocity:
            NATIVE_WATER.releaseKickVelocity,
            roof=(r.nativeActorFloor-t.height()*r.projectilePixels)*r.actorFixedScale;
        e.vy=-velocity/r.actorFixedScale/(r.projectilePixels*r.step);
        if(y<=roof){e.nativeWaterRise=false;return false;}
        e.y=(r.nativeActorFloor-(y+velocity)/r.actorFixedScale)/r.projectilePixels;
        e.ground=false;e.offTower=true;return true;
    }
    // The state-1 handler reads the preceding field waterline. Its newly
    // advanced value reaches RAM later in the frame. At a force boundary,
    // using the new line reverses the force one tick early.
    const line=previousWaterline(t,r),y=worldY(t,r),p=NATIVE_WATER;
    s.velocity=Math.floor((s.velocity+force(y,line,r))*p.dragNumerator/2**p.dragShift);
    let nextY=y+s.velocity;
    // The foreground camera sees the integrated swimming body before the
    // creature's carry handler overwrites its displayed position.
    e.nativeWaterCameraY=nextY/r.actorFixedScale;
    if(s.releasePending){
        e.swimming=false;e.waterEjected=false;e.nativeWaterReleaseKick=true;
        t.nativeWaterRecovery=null;t.nativeActorState=0;t.nativeActorNextState=0;
    }else{
        s.velocity+=force(nextY,line,r);
        const c=t.nativeWaterCreature;
        if(c?.active&&c.carrying){
            nextY=c.y-p.actorCarryOffset*r.actorFixedScale;e.waterEjected=true;
            if(--s.timer===0){s.timer=-1;s.releasePending=true;c.carrying=false;t.nativeActorNextState=0;}
        }
    }
    e.y=(r.nativeActorFloor-nextY/r.actorFixedScale)/r.projectilePixels;
    e.vy=-s.velocity/r.actorFixedScale/(r.projectilePixels*r.step);
    e.ground=false;e.offTower=true;return true;
}
