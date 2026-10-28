import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-bomb-walls-gba.json',import.meta.url),'utf8'));
const launches=JSON.parse(readFileSync(new URL('./fixtures/eggo-bomb-launch-geometry-gba.json',import.meta.url),'utf8'));
test('native launch height uses the origin column and the board/actor offset',()=>{
    for(const c of launches.cases){
        const source=new Tower(settings({hazards:false}),randomFrom(1));
        const target=new Tower(settings({hazards:false}),randomFrom(2),1);
        c.rows.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)target.setCell(x,y,1,owner);}));
        source.egg.x=c.origin/16+0.5;
        const b={item:'bomb'};assert.ok(source.launchProjectile(b,target));
        assert.equal(b.nativeTrajectory,true);
        assert.equal(RULES.nativeActorFloor-b.liftY*RULES.projectilePixels,c.target);
    }
});
for(const c of fixture.cases)test(`native bomb geometry: ${c.name}`,()=>{
    const source=new Tower(settings({hazards:false}),randomFrom(1));
    const target=new Tower(settings({hazards:false}),randomFrom(2),1);
    const towers=[source,target];
    const geometry=sample=>sample.geometry.forEach((g,i)=>{
        towers[i].rows=[];
        g.rows.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)towers[i].setCell(x,y,1,owner);}));
        towers[i].water=(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-g.water)/RULES.projectilePixels;
    });
    const [first,...samples]=c.samples;geometry(first);
    const b={item:'bomb',nativeTrajectory:true,x:first.x/16,y:(720-first.y)/16,
        liftY:(720-first.target)/16,vy:-first.vy*60/16,flightCounter:first.flightCounter};
    // Only the surrounding board/water is supplied by the oracle. Every
    // subsequent projectile position, velocity and counter evolves locally.
    for(const sample of samples){
        assert.ok(source.advanceNativeBomb(b,target),`active frame ${sample.frame}`);
        for(const [label,actual,expected] of [['x',b.x*16,sample.x],['y',720-b.y*16,sample.y],['vy',-b.vy*16/60,sample.vy]])
            assert.ok(Math.abs(actual-expected)<1e-5,`${label} frame ${sample.frame}: ${actual} vs ${expected}`);
        assert.equal(b.flightCounter,sample.flightCounter,`flight counter frame ${sample.frame}`);
        geometry(sample);
    }
});
