// ROM 0x08013fb0 / 0x080140e0 initialize; 0x080142e8 advances each glyph.
import {PODIUM_MOTION} from './assets/podium-motion.js';
import {CHARACTER_ART,CHARACTER_PODIUM} from './assets/characters.js';
export const RESULT_VIEW=Object.freeze({
    fixed:65536,top:50,bottom:56,halfWidth:2,
    loseStart:[8,136],winStart:[8,137],loseSpacing:19,winSpacing:17,
    loseVelocityDivisor:4,winVelocityDivisor:8,
    rightKick:0x2666,leftKick:0x2e14,bottomKick:0x23d7,topKick:0x30a3,
});
export const PODIUM_VIEW=Object.freeze({
    roundTicks:220,fadeStart:157,fadeTicks:32,entryDelay:2,podiumLoadTicks:3,confirmTick:225,musicTick:226,
    width:240,height:160,actorSize:64,winCycle:56,lossTitleTick:122,
    lossOamDelay:1,lossFrameTicks:4,lossPictures:16,lossPhaseOrigin:2,
    lossTitleStartY:-64,lossTitleSpeed:2,lossActorFallStart:146,lossActorFallSpeed:4,idleGroup:1,winGroup:19,winFrameTicks:4,winIntroFrames:2,winActorX:88,winActorY:1,
    winsX:88,winsY:88,winsWidth:64,winsHeight:32,
    digitSize:16,digitX:104,digitY:128,digitSpacing:13,
    gameOverX:88,gameOverY:4,gameOverSize:64,
});
export function podiumPose(won,ticks,character='yolko'){
    // The loss OBJ upload displays the preceding animation-counter tick.
    ticks=Math.max(0,ticks-PODIUM_VIEW.podiumLoadTicks-(!won?PODIUM_VIEW.lossOamDelay:0));
    const custom=character!=='yolko'&&CHARACTER_PODIUM[character];
    const sequence=(custom||PODIUM_MOTION)[won?'win':'loss'];
    const rules=custom?CHARACTER_ART[character]:PODIUM_VIEW;
    const index=won?Math.max(0,ticks-PODIUM_VIEW.entryDelay-1)%rules.winCycle:
        Math.max(0,Math.min(sequence.length-1,ticks-sequence[0][0]));
    let [,picture,x,y]=sequence[index];
    if(!won){
        if(!custom){
            const p=PODIUM_VIEW,phase=Math.floor(Math.max(0,ticks-p.lossPhaseOrigin)/p.lossFrameTicks)%(2*p.lossPictures);
            picture=phase<p.lossPictures?phase:2*p.lossPictures-1-phase;
        }
        y+=Math.max(0,ticks-PODIUM_VIEW.lossActorFallStart)*PODIUM_VIEW.lossActorFallSpeed;
    }
    return {picture,x,y};
}
export function resultOpacity(ticks){
    const p=PODIUM_VIEW;
    if(ticks<p.roundTicks)return Math.max(0,Math.min(1,1-(ticks-p.fadeStart-p.entryDelay+1)/p.fadeTicks));
    return Math.max(0,Math.min(1,(ticks-p.roundTicks-p.entryDelay-p.podiumLoadTicks)/p.fadeTicks));
}
export function createResultView(won,side){
    const p=RESULT_VIEW,s=p.fixed;
    return Array.from({length:won?4:5},(_,j)=>{
        const i=won?j+1:j,center=(won?p.winStart[side]:p.loseStart[side])+i*(won?p.winSpacing:p.loseSpacing);
        const x=(center-p.halfWidth)*s,y=p.top*s;
        return {x,y,previousX:x,previousY:y,
            vx:won?(6-i)*s/p.winVelocityDivisor:i*s/p.loseVelocityDivisor,
            vy:won?i*s/p.winVelocityDivisor:(5-i)*s/p.loseVelocityDivisor,
            minX:x,maxX:(center+p.halfWidth)*s,minY:y,maxY:p.bottom*s};
    });
}
export function advanceResultGlyph(s){
    const p=RESULT_VIEW;
    s.previousX=s.x;s.previousY=s.y;
    s.x+=s.vx;
    if(s.x>s.maxX){s.x=s.maxX;s.vx=-s.vx;s.vy+=p.rightKick;}
    if(s.x<s.minX){s.x=s.minX;s.vx=-s.vx;s.vy-=p.leftKick;}
    s.y+=s.vy;
    if(s.y>s.maxY){s.y=s.maxY;s.vy=-s.vy;s.vx+=p.bottomKick;}
    if(s.y<s.minY){s.y=s.minY;s.vy=-s.vy;s.vx-=p.topKick;}
    return s;
}
export function advanceResultView(states){for(const state of states)advanceResultGlyph(state);}
export function resultGlyphPosition(s){return [Math.floor(s.previousX/RESULT_VIEW.fixed),Math.floor(s.previousY/RESULT_VIEW.fixed)];}
