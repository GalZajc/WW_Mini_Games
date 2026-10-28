// Decorative insects/bats, ROM 08010708, 08013714 and 08013744.
export const NATIVE_AMBIENT=Object.freeze({fixed:65536,stages:['beanstalk','pirate','jungle'],
 bounds:[[20,91],[148,219],[28,100],[156,228]],ceiling:410,floor:710,
 speed:0x19999,noiseScale:65536,waterlineOffset:-8,frameTicks:4,
 periods:{pirate:20,other:32},size:16});
export function createNativeAmbient(stage){
 return NATIVE_AMBIENT.stages.includes(stage)?NATIVE_AMBIENT.bounds.map(([left,right],i)=>({
  field:i&1,x:right*65536,y:NATIVE_AMBIENT.floor*65536,vx:0,vy:0,
  left:left*65536,right:right*65536,top:NATIVE_AMBIENT.ceiling*65536,
  bottom:NATIVE_AMBIENT.floor*65536,clock:0,display:null})):[];
}
export function advanceNativeAmbient(items,stage,actors,floors){
 const r=NATIVE_AMBIENT,F=r.fixed;
 for(const d of items){
  d.display={x:d.x,y:d.y,vx:d.vx,clock:d.clock};
  const nx=((((d.x+d.y+actors[0].y+actors[1].x+d.field*F)|0)>>16)&3),
   ny=((((d.x+actors[1].y+actors[0].x)|0)>>16)&3);
  d.vx=Math.max(-r.speed,Math.min(r.speed,(2*d.vx+(((nx+1)>>1)-1)*F)>>1));
  d.vy=Math.max(-r.speed,Math.min(r.speed,(2*d.vy+(((ny+1)>>1)-1)*F)>>1));
  d.x+=d.vx;d.y+=d.vy;
  const bottom=(floors[d.field]*16+r.waterlineOffset)*F;
  if(bottom<d.bottom){d.top=Math.max(0,d.top+bottom-d.bottom);d.bottom=bottom;}
  if(d.x<d.left){d.x=d.left;d.vx=-d.vx;}
  if(d.y<d.top){d.y=d.top;d.vy=-d.vy;}
  if(d.x>d.right){d.x=d.right;d.vx=-d.vx;}
  if(d.y>d.bottom){d.y=d.bottom;d.vy=-d.vy;}
  d.clock=(d.clock+1)%r.periods[stage==='pirate'?'pirate':'other'];
 }
}
