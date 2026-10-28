import {NATIVE_SINE} from './assets/native-sine.js';
// ROM 0x0801aa90 (airship) and 0x0800dc28 (actor attraction).
// Phase anchors at native frame 360, checked against both fields in all arenas.
// An explicit origin preserves the independently initialized clocks in saves.
export const NATIVE_RESCUE=Object.freeze({fixed:65536,turnMask:0xfffffff,startFrame:360,
    playerPhase:0x7fffff8,cpuPhase:0xffffff0,playerYPhase:0xfffffd0,cpuYPhase:0x7ffffc8,
    xStep:0x5b05b,yStep:0x222222,
    base:-0x80000,amplitude:8,fixedX:-5*65536,targetX:48,targetY:96,spaceTargetY:80,
    accelerationX:0x2000,accelerationY:0x8000,speedLimit:0x40000,
    arrivalDistance:0x10000,rescuePlane:128,
    flame:Object.freeze({x:56,y:43,width:16,height:8,phaseBit:8})});
// Round setup runs one hidden tick before the first displayed countdown tick.
// Actor state 3 follows the previous airship position (0x0800d814), before
// 0x0801aa90 advances the airship. These are world pixels, not screen positions.
export const NATIVE_INTRO=Object.freeze({initialFrame:1,roundLoadTicks:28,cameraOffset:-6,animationGroup:21,animationStep:0x2000,
    spaceAnimationGroup:11,spaceAnimationStep:0,
    bodies:Object.freeze([Object.freeze({x:40,y:88}),Object.freeze({x:48,y:96})])});
export function nativeRescueBoat(frame,side=0,origin=null,stage='factory'){
    const p=NATIVE_RESCUE,ticks=origin?frame-origin.frame:frame-p.startFrame,
        phase=origin?.phaseX??(side?p.cpuPhase:p.playerPhase),
        phaseY=origin?.phaseY??(side?p.cpuYPhase:p.playerYPhase);
    const coordinate=(step,initial)=>{
        const angle=(initial+ticks*step)&p.turnMask,index=((angle>>16)&4095)>>2,
            sine=NATIVE_SINE[index];
        return p.base+((sine+p.fixed)>>1)*p.amplitude;
    };
    return {x:stage==='castle'||stage==='space'?p.fixedX:coordinate(p.xStep,phase),
        y:stage==='castle'?p.base:coordinate(p.yStep,phaseY),stage};
}
export function advanceNativeRescueBody(body,boat){
    const p=NATIVE_RESCUE,dx=boat.x+p.targetX*p.fixed-body.x,
        dy=boat.y+(boat.stage==='space'?p.spaceTargetY:p.targetY)*p.fixed-body.y;
    // The actor animation handler (0x0800eaec) reads these target deltas
    // from the same stack slots as attraction; it does not read velocity.
    body.animationDx=dx;body.animationDy=dy;
    if(Math.abs(dx)<p.arrivalDistance&&Math.abs(dy)<p.arrivalDistance){
        body.x+=dx;body.y+=dy;body.vx=body.vy=0;body.arrived=true;return body;
    }
    body.vx+=Math.sign(dx)*p.accelerationX;body.vy+=Math.sign(dy)*p.accelerationY;
    // ROM DDAC..DE52 stops only strictly opposing signs. At zero target
    // delta the existing velocity remains; crossing the axis is not arrival.
    if(body.vx*dx<0)body.vx=0;
    if(body.vy*dy<0)body.vy=0;
    body.vx=Math.max(-p.speedLimit,Math.min(p.speedLimit,body.vx));
    body.vy=Math.max(-p.speedLimit,Math.min(p.speedLimit,body.vy));
    body.x+=body.vx;body.y+=body.vy;return body;
}
