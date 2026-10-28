import fs from 'node:fs';
import path from 'node:path';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
const root=path.resolve(import.meta.dirname,'..'),prefix=process.argv[2];
if(!prefix)throw Error('Supply the native capture prefix.');
const trace=JSON.parse(fs.readFileSync(path.resolve(root,prefix+'.trace.json'),'utf8'));
const height=Number(process.argv[3]??0),gap=Number(process.argv[4]??-1);
const t=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));t.spawn=Infinity;
for(let y=0;y<height;y++)for(let x=0;x<7;x++)if(y!==gap||![3,4].includes(x))t.setCell(x,y,1,y+1);
Object.assign(t.egg,{x:(trace[0].world_x+16)/16,y:(720-trace[0].world_y)/16,vy:0,ground:true});
const rows=[];let first=null,maxY=0,maxVelocity=0;
for(const native of trace){
 t.update(RULES.step,{nativeMotion:true,dive:native.keys.includes('L')});
 const actualY=(720-t.egg.y*16)*65536,actualV=-t.egg.vy*16/60*65536;
 const expected=native.native_actor_motion.player;
 const error=(actualY-expected.y_q16)/65536,velocityError=(actualV-expected.vy_q16)/65536;
 maxY=Math.max(maxY,Math.abs(error));maxVelocity=Math.max(maxVelocity,Math.abs(velocityError));
 if(Math.abs(error)>1/65536)first??={frame:native.frame,error,actualY:actualY/65536,expectedY:expected.y_q16/65536};
 rows.push({frame:native.frame,actualY:actualY/65536,expectedY:expected.y_q16/65536,error,
  actualV:actualV/65536,expectedV:expected.vy_q16/65536,velocityError,
  swimming:t.egg.swimming,offTower:t.egg.offTower,ground:t.egg.ground,
  timer:t.nativeWaterRecovery?.timer??null,creatureY:t.nativeWaterCreature?.y/65536,
  nativeState:expected.state,state:t.nativeActorState});
}
const out=path.join(root,'scripts/OUTPUT/eggo-water-parity_'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'parameters.json'),JSON.stringify({prefix,height,gap,settings:t.p,random_seed:1},null,2));
fs.writeFileSync(path.join(out,'frames.json'),JSON.stringify(rows,null,2));
const summary={frames:rows.length,maxY,maxVelocity,first};
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({out,...summary},null,2));
