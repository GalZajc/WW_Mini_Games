import {RULES} from './model.js';
import {CPU_PARAMETERS} from './native-cpu.js';
// Native entity order is primary left/right, secondary left/right. Filtering
// to one field therefore keeps its primary before its secondary.
export const NATIVE_HAZARDS=Object.freeze({
 factory:Object.freeze([['bubble',5],['factorySecondary',2]]),
 dragon:Object.freeze([['dragon',6],['dragonSecondary',12]]),
 castle:Object.freeze([['castle',0],['castleSecondary',13]]),
 pirate:Object.freeze([['castle',9],['pirateSecondary',11]]),
 space:Object.freeze([['space',7],['spaceSecondary',15]]),
 jungle:Object.freeze([['jumper',4],['jungleSecondary',10]]),
 park:Object.freeze([['parkPrimary',16],['parkSecondary',1]]),
 beanstalk:Object.freeze([['jumper',14],['beanstalkSecondary',8]])});
// +0x40/+0x44 are persistent collision centers, not always sprite origins.
// Short jumps and non-contact animation phases leave the previous center.
export function updateNativeHitCenter(d,kind,contactBlocked=false){
 const r=RULES,phase=d.previousAnimation??d.animation??0;
 let x,y;
 if(!d.active)return;
 if(contactBlocked&&!CPU_PARAMETERS.emptySafeHazardKinds.includes(kind))return;
 if(kind===14||kind===4){
  if(d.variant)return;
  x=d.x+(kind===4?r.jungleHitX:r.jumperHitX);y=d.y+(kind===4?r.jungleHitY:r.jumperHitY);
 }else if(kind===7){
  if(phase<r.spaceHitFirst||phase>r.spaceHitLast)return;
  x=d.x+r.spaceHitAnchor;y=d.y+r.spaceHitAnchor-r.spaceHitOffsets[phase];
 }else if(kind===16){
  if(phase===0)return;
  x=d.x+(d.vx>0?r.parkPrimaryHitRight:r.parkPrimaryHitLeft);y=d.y+r.parkPrimaryHitY-r.parkPrimaryHitOffsets[phase];
 }else if(kind===5){
  if(d.life<=r.bubbleReleaseLife||d.life===r.bubbleLife)return;
  x=d.x+r.bubbleActorAnchor;y=d.y+r.bubbleActorAnchor;
 }else if(kind===6||kind===12){x=d.x;y=d.y;
 }else if(kind===0||kind===9){x=d.x+r.castleHitLead*d.vx+r.castleHitX;y=d.y+r.castleHitLead*d.vy+r.castleHitY;
 }else if(kind===15){
  if(d.life>=r.spaceSecondaryCharge)return;
  x=d.x-d.vx*r.spaceSecondaryHitLead+r.spaceSecondaryHitX;y=d.y-d.vy*r.spaceSecondaryHitLead+r.spaceSecondaryHitY;
 }else if(kind===1||kind===10){
  const sign=d.variant?-1:1,bias=kind===10?r.jungleSecondaryHitBias:r.parkSecondaryHitBias;
  x=d.x+sign*r.parkSecondaryHitLead*d.vy+bias+r.parkSecondaryHitXCorrection;
  y=d.y-sign*r.parkSecondaryHitLead*d.vx+bias+r.parkSecondaryHitYCorrection;
 }else if(kind===2){x=d.x+r.factorySecondaryHitX;y=d.y+r.factorySecondaryHitY;
 }else if(kind===13){x=d.x+r.castleSecondaryHitX;y=d.y+r.castleSecondaryHitY;
 }else if(kind===11){x=d.x+r.pirateSecondaryHitX;y=d.y+r.pirateSecondaryHitY;
 }else if(kind===8){x=d.x+r.beanstalkSecondaryHitX;y=d.y+r.beanstalkSecondaryHitY;}
 if(x!==undefined){d.nativeHitX=x;d.nativeHitY=y;}
}
export function advanceNativeHazardCenters(t,blocked){
 for(const [name,kind] of NATIVE_HAZARDS[t.artStage]??[])updateNativeHitCenter(t[name],kind,blocked);
}
export function nativeHazards(t){
 if(!t.p.hazards)return [];
 const s=CPU_PARAMETERS.fixedScale;
 return (NATIVE_HAZARDS[t.artStage]??[]).map(([name,kind])=>{
  const d=t[name];return{kind,active:Boolean(d.active),collisionActive:d.active?1:0,
   sameField:true,life:d.life,x:Math.round((d.nativeHitX??0)*s),y:Math.round((d.nativeHitY??0)*s),
   vx:Math.round(d.vx*s),vy:Math.round(d.vy*s)};
 });
}
