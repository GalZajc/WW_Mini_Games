import test from 'node:test';
import assert from 'node:assert/strict';
import {Tower,SHAPES,DEFAULTS,RULES,rotate,randomFrom,settings,plan,advanceBombFlight,nativeRandomStep,startingStageFromSeed,survivalStage,nativeSurvivalRoundStart,nativeWaterlineAtFrame,nativeInitialTowerPieces,cloudStriking,cloudScale,advanceBubbleMotion,advanceJumperMotion,advanceSpaceSecondaryMotion,advanceDragonMotion,advanceDragonSecondaryMotion,advanceCastleMotion,advanceCastleSecondaryMotion,advancePirateSecondaryMotion} from '../renderer/games/eggo-mania/model.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {SOUND} from '../renderer/games/eggo-mania/audio.js';
import {readFileSync} from 'node:fs';
import {createView,advanceView,backgroundOffset,actorPose,pickupAngle} from '../renderer/games/eggo-mania/view.js';
import {itemIcon} from '../renderer/games/eggo-mania/icons.js';
import {bg3StreamFrameIndex} from '../renderer/games/eggo-mania/pixel-renderer.js';
import {BG3_STREAMS} from '../renderer/games/eggo-mania/assets/background-rings.js';
import {NATIVE_ITEMS} from '../renderer/games/eggo-mania/assets/native-items.js';
import {advanceParkSecondaryMotion,advanceParkPrimaryMotion,advanceBeanstalkSecondaryMotion,advancePickupMotion,nextNativePickup,nativePickupAngle,discardedPickup,nativePickupCanCatch,nativeSurvivalConfig} from '../renderer/games/eggo-mania/model.js';
const gba=JSON.parse(readFileSync(new URL('./fixtures/eggo-mania-gba.json',import.meta.url),'utf8'));
const cameraGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-camera-gba.json',import.meta.url),'utf8'));
const surgeGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-surge-gba.json',import.meta.url),'utf8'));
const fillerGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-filler-gba.json',import.meta.url),'utf8'));
const pickupGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-pickup-gba.json',import.meta.url),'utf8'));
const bootsGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-boots-gba.json',import.meta.url),'utf8'));
const stageBackgroundGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-stage-backgrounds-gba.json',import.meta.url),'utf8'));
const bg3PhaseGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-bg3-phase-gba.json',import.meta.url),'utf8'));
const fallGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-fall-gba.json',import.meta.url),'utf8'));
const bombGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-bomb-gba.json',import.meta.url),'utf8'));
const waterInventoryGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-water-inventory-gba.json',import.meta.url),'utf8'));
const armedBombGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-armed-bomb-gba.json',import.meta.url),'utf8'));
const bombLaunchGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-bomb-launch-gba.json',import.meta.url),'utf8'));
const bombReboundsGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-bomb-rebounds-gba.json',import.meta.url),'utf8'));
const bombDamageGba=JSON.parse(readFileSync(new URL('./fixtures/eggo-bomb-damage-gba.json',import.meta.url),'utf8'));
const make=(overrides={})=>new Tower(settings({...DEFAULTS,hazards:false,...overrides}),randomFrom(42));

test('whole-piece support and mutual-owner merges match direct original ARM execution',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-piece-support-gba.json',import.meta.url),'utf8'));
 for(const c of fixture.cases){
  const tower=make();
  c.rows.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)tower.setCell(x,y,owner,owner);}));
  const [x,y]=c.anchor,owner=tower.rows[y]?.owners[x]||0;
  if(c.merge)tower.mergeMutualSupports(owner,y);
  const group=owner?tower.nativePieceGroup(owner,y):[];
  assert.deepEqual(group.map(p=>[p.x,p.y]),c.cells,`${c.name}: group, merge=${c.merge}`);
  assert.deepEqual(tower.nativePieceSupports(group),c.supports,`${c.name}: supports, merge=${c.merge}`);
  assert.deepEqual(c.rows.map((row,y)=>row.map((_,x)=>tower.rows[y]?.owners[x]||0)),c.after,`${c.name}: merged owners`);
 }
});

test('native floor deletion stops at an empty row and leaves actor coordinates unchanged',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-piece-support-gba.json',import.meta.url),'utf8'));
 for(const c of fixture.floor_cases){
  const tower=make();c.rows.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)tower.setCell(x,y,owner,owner);}));
  tower.egg.y=6;const before={x:tower.egg.x,y:tower.egg.y};
  tower.removeFloor(c.remove);
  assert.deepEqual(c.rows.map((row,y)=>row.map((_,x)=>tower.rows[y]?.owners[x]||0)),c.after,c.name);
  assert.deepEqual({x:tower.egg.x,y:tower.egg.y},before,'deleting a floor must not teleport the builder');
 }
});

test('loose-block actor response matches the original Thumb pass and exact probe boundaries',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-loose-actor-gba.json',import.meta.url),'utf8'));
 const queue=JSON.parse(readFileSync(new URL('./fixtures/eggo-collapse-queue-gba.json',import.meta.url),'utf8'));
 const before=queue.profiles.building.events.find(e=>e.frame===336).rows_bottom_up[0];
 for(const c of fixture.cases){
  const tower=make();before.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)tower.setCell(x,y,owner,owner);}));
  const scale=RULES.projectilePixels;
  Object.assign(tower.egg,{x:(c.before_actor[0]/65536+RULES.bubbleActorAnchor)/scale,
   y:(RULES.nativeActorFloor-c.before_actor[1]/65536)/scale,vy:-c.before_velocity/65536/(scale*RULES.step)});
  tower.nativeFrame=fixture.parameters.frame;const position=[tower.egg.x,tower.egg.y];
  tower.advanceLoosePieces();
  assert.deepEqual(position,[tower.egg.x,tower.egg.y],c.name+': the pass must not translate the actor');
  assert.equal(tower.egg.vy,-c.after_velocity/65536/(scale*RULES.step),c.name+': exact native velocity');
  assert.deepEqual(c.rows_after.map((row,y)=>row.map((_,x)=>tower.rows[y]?.owners[x]||0)),c.rows_after,c.name+': complete owner map');
 }
});

test('native collapse queues all lower incomplete floors and reproduces 600 exact timer states',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-collapse-queue-gba.json',import.meta.url),'utf8'));
 const onset=f.profiles.onset,rows=onset.events.find(e=>e.frame===f.parameters.onset_frame).rows_bottom_up[0];
 const t=make();t.spawn=Infinity;
 rows.forEach((row,y)=>{if(row.some(Boolean))t.row(y).cells=[...row];});t.complete();
 const timers=tower=>[...tower.collapseTimers].sort((a,b)=>b[0]-a[0]).map(([y,e])=>[y,e.timer]);
 assert.deepEqual(timers(t),onset.samples[f.parameters.onset_frame-1].timers);
 for(const s of onset.samples.slice(f.parameters.onset_frame)){t.update(RULES.step);assert.deepEqual(timers(t),s.timers,`onset ${s.frame}`);}
 const c=make();c.spawn=Infinity;surgeGba.initial_rows_bottom_up.forEach((row,y)=>{if(row.some(Boolean))c.row(y).cells=[...row];});
 c.collapseTimers=new Map(f.continuation_initial_timers.map(([y,timer])=>[y,{timer,initial:timer}]));c.collapse.active=true;
 for(const s of f.profiles.continuation.samples){c.update(RULES.step);assert.deepEqual(timers(c),s.timers,`queue ${s.frame}`);}
 const building=make();building.spawn=Infinity;
 surgeGba.initial_rows_bottom_up.forEach((row,y)=>{if(row.some(Boolean)){building.row(y).cells=[...row];building.row(y).owners.set(row);}});
 building.nativeFrame=f.parameters.initial_native_frame;
 building.collapseTimers=new Map(f.continuation_initial_timers.map(([y,timer])=>[y,{timer,initial:timer}]));building.collapse.active=true;
 const edits=new Map(f.profiles.building.external_edits.map(e=>[e.frame,e]));
 const events=new Map(f.profiles.building.events.map(e=>[e.frame,e.rows_bottom_up[0]]));let expected=surgeGba.initial_rows_bottom_up;
 for(const s of f.profiles.building.samples){
  building.update(RULES.step);
  const edit=edits.get(s.frame);
  if(edit){for(const [y,x,value] of edit.edits)building.setCell(x,y,value,value);if(edit.occupied_changed)building.complete();}
  if(events.has(s.frame))expected=events.get(s.frame);
  assert.deepEqual(timers(building),s.timers,`building queue ${s.frame}`);
  assert.deepEqual(Array.from({length:expected.length},(_,y)=>building.rows[y]?.cells||Array(7).fill(0)),expected,`building board ${s.frame}`);
 }
 const shield=make();for(let y=0;y<4;y++)shield.setCell(0,y,1);shield.row(2).cells.fill(1);shield.requestFloorCollapse(0);
 assert.deepEqual([...shield.collapseTimers.keys()],[1,0],'complete floors do not shield unfinished floors below');
 const unchanged=shield.collapseTimers.get(1).timer;shield.setCell(1,1,1);shield.requestFloorCollapse(0);
 assert.equal(shield.collapseTimers.get(1).timer,unchanged,'a repeated request preserves an existing counter');
});

test('Survival Hard round configuration matches all eight original RAM snapshots',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-survival-config-gba.json',import.meta.url),'utf8'));
 for(const source of f.sources){
  const c=nativeSurvivalConfig(source.round,42);assert.deepEqual(c.words,source.config);
  const t=make({hazards:true,nativeConfig:c});assert.equal(t.bubble.difficulty,c.primary);
  assert.equal(t.factorySecondary.difficulty,c.secondary);assert.equal(t.nativePickups.divisor,c.divisor);
  const s={seed:34340,bag:[],remaining:0,weights:c.weights,divisor:c.divisor};
  const m=nextNativePickup(s,1600);assert.ok(m);assert.equal(s.remaining,c.weights.reduce((a,b)=>a+b,0)-1);
 }
 assert.deepEqual(nativeSurvivalConfig(9,f.ninth.selection_seed).words,f.ninth.words);
 const t=make({nativeConfig:nativeSurvivalConfig(3,42)});t.artStage='castle';t.castle.life=1;t.castleSecondary.life=1;
 for(let i=0;i<100;i++)t.update(RULES.step);assert.equal(t.castle.active,false);assert.equal(t.castleSecondary.active,false);
 const game=new Game();game.p=settings({...DEFAULTS,seed:42});game.seed=42;game.round=8;game.startingStage=0;game.startRound({intro:false});
 assert.equal(game.player.p.nativeConfig.primary,9);assert.equal(game.cpu.p.nativeConfig.primary,9);
 assert.equal(game.player.nativePickups.divisor,14);
});

test('Survival round setup carries field RNG forward before later difficulty draws',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-survival-config-gba.json',import.meta.url),'utf8'));
 const rng=f.rng_transitions;
 const eighth=nativeSurvivalRoundStart(8,rng.round8.before.global_rng);
 assert.equal(eighth.fieldSeed,rng.round8.after.field_rng[0],'round eight copies the state after its two setup RNG calls');
 assert.deepEqual(eighth.config.words,rng.round8.after.config);
 assert.equal(eighth.globalSeed,rng.round8.after.global_rng,'the first eight rounds do not draw random table entries');
 const ninth=nativeSurvivalRoundStart(9,rng.round9.before.global_rng);
 assert.equal(ninth.fieldSeed,rng.round9.after.field_rng[0],'round nine field streams are seeded before the two table draws');
 assert.deepEqual(ninth.config.words,f.ninth.words);
 assert.deepEqual([ninth.config.difficulty,ninth.config.level,ninth.globalSeed],
  [f.ninth.difficulty,f.ninth.level,rng.round9.after.global_rng]);
 const game=new Game();game.p=settings({...DEFAULTS,seed:42,hazards:false});game.seed=42;game.resetSurvival();
 const fieldSeed=nativeRandomStep(nativeRandomStep(nativeRandomStep(42)));
 assert.equal(game.player.nativeEnemySeed,fieldSeed,'pickup and field randomness starts from the post-setup global state');
 assert.equal(game.nativeActorRandomSeed,fieldSeed,'round setup and animation share the evolving global stream');
 const later=new Game();later.p=settings({...DEFAULTS,seed:rng.round9.before.global_rng,hazards:false});later.seed=rng.round9.before.global_rng;
 later.round=9;later.startingStage=0;later.nativeActorRandomSeed=rng.round9.before.global_rng;later.startRound({intro:false});
 assert.deepEqual(later.player.p.nativeConfig.words,f.ninth.words);
 assert.equal(later.player.nativeEnemySeed,f.ninth.selection_seed);
 assert.equal(later.nativeActorRandomSeed,rng.round9.after.global_rng,'later-round table draws advance the shared global stream after field seeding');
});

test('Survival water starts at the native height configured for each round',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-survival-config-gba.json',import.meta.url),'utf8'));
 const samples=[
  [nativeSurvivalConfig(3,42),f.sources[2].native_waterline_y],
  [nativeSurvivalConfig(9,f.ninth.selection_seed),f.ninth.native_initial_waterline_y]
 ];
 for(const [config,expectedY] of samples){
  const tower=make({nativeConfig:config});
  const waterlineY=RULES.nativeActorFloor-tower.water*RULES.projectilePixels+RULES.bubbleWaterlineBias;
  assert.equal(waterlineY,expectedY,`round height ${config.height}`);
  assert.equal(waterlineY,config.height*RULES.projectilePixels+RULES.survivalWaterlineHeightBias,
   `round height ${config.height}: native table formula`);
 }
});

test('Survival water rise matches ROM thresholds and clamps against incomplete rows only',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-survival-config-gba.json',import.meta.url),'utf8'));
 for(const source of f.sources){
  const rate=source.config[RULES.nativeWaterRateWord];
  assert.equal(source.water_start_frame,Math.max(RULES.nativeWaterStartMinimum,RULES.nativeWaterStartBase-RULES.nativeWaterStartRate*rate),`round ${source.round}: threshold`);
  assert.equal(source.water_rise_speed_raw,-(RULES.nativeWaterRiseBaseRaw+RULES.nativeWaterRiseWordRaw*rate),`round ${source.round}: raw speed`);
  const config=nativeSurvivalConfig(source.round,42);
  assert.equal(nativeWaterlineAtFrame(config,source.native_frame),source.native_waterline_y,`round ${source.round}: captured initial line`);
 }
 const first=nativeSurvivalConfig(1,42),third=nativeSurvivalConfig(3,42),ninth=nativeSurvivalConfig(9,f.ninth.selection_seed);
 assert.equal(nativeWaterlineAtFrame(first,1540),760);
 assert.equal(nativeWaterlineAtFrame(first,1541),759.974609375);
 assert.equal(nativeWaterlineAtFrame(first,1763),754.337890625);
 assert.equal(nativeWaterlineAtFrame(third,1100),760);
 assert.equal(nativeWaterlineAtFrame(third,1101),759.9453125);
 assert.equal(nativeWaterlineAtFrame(third,1520),737.03125);
 assert.equal(nativeWaterlineAtFrame(third,1521),736.9765625);
 assert.equal(nativeWaterlineAtFrame(third,2500),683.4375);
 assert.equal(nativeWaterlineAtFrame(first,2527),734.939453125,'native CPU water under a completed bottom row');
 assert.equal(nativeWaterlineAtFrame(ninth,1700),696);
 assert.equal(nativeWaterlineAtFrame(ninth,1701),695.982421875);
 assert.equal(nativeWaterlineAtFrame(ninth,3008),673.0078125);
 assert.equal(nativeWaterlineAtFrame(ninth,3009),672.990234375);
 for(const filled of [1,7]){
  const field=make({nativeConfig:third});field.rows=[];field.nativePickups=null;field.spawn=Infinity;
  field.nativeFrame=1520;
  field.water=(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-nativeWaterlineAtFrame(third,1520))/16;
  for(let x=0;x<filled;x++)field.setCell(x,0,1,x+1);
  field.update(RULES.step);
  assert.equal(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-field.water*16,
   filled===7?736.9765625:736,`bottom row containing ${filled} cells`);
 }
 const live=make({nativeConfig:third});live.nativeFrame=1100;live.spawn=Infinity;live.update(RULES.step);
 assert.equal(live.nativeFrame,1101);
 assert.equal(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-live.water*RULES.projectilePixels,759.9453125,
  'Tower publishes the newly advanced native line during its update');
 const extra=make({nativeConfig:third,waterSpeed:0.15});extra.nativeFrame=1100;extra.spawn=Infinity;
 extra.update(RULES.step);extra.update(RULES.step);
 assert.ok(Math.abs(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-extra.water*RULES.projectilePixels-
  (nativeWaterlineAtFrame(third,1102)-0.08))<1e-10,
  'the optional extra rise accumulates on top of the native baseline');
});

test('round nine native starting board is preserved from the clean Survival transition',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-survival-config-gba.json',import.meta.url),'utf8'));
 const start=f.ninth.initial_board.fields;
 assert.deepEqual(start.map(field=>field.occupied_cells),[28,29]);
 assert.deepEqual(start.map(field=>field.complete_rows),[4,4]);
 assert.deepEqual(start.map(field=>field.ram_rows.reduce((n,row)=>n+Number(row.some(Boolean)),0)),[4,5]);
 assert.deepEqual(start[0].ram_rows.slice(43),[
  [19,21,24,26,29,31,33],[19,22,24,26,29,32,33],
  [19,23,24,27,29,32,33],[20,23,25,28,30,32,34]
 ]);
 assert.deepEqual(start[1].ram_rows.slice(42,47),[
  [20,0,0,0,0,0,0],[20,23,26,28,31,33,35],[21,24,26,28,31,34,35],
  [21,25,26,29,31,34,35],[22,25,27,30,32,34,36]
 ]);
});

test('Survival starting towers reproduce the native piece groups and row occupancy',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-survival-config-gba.json',import.meta.url),'utf8'));
 const config=nativeSurvivalConfig(9,f.ninth.selection_seed),start=f.ninth.initial_board.fields;
 const groupShape=grid=>{const ids=new Map();let next=1;return grid.map(row=>row.map(id=>{
  if(!id)return 0;if(!ids.has(id))ids.set(id,next++);return ids.get(id);
 }));};
 for(let side=0;side<2;side++){
  const pieces=nativeInitialTowerPieces(config,9,side),owners=Array.from({length:RULES.nativeInitialBoardRows},()=>Array(RULES.nativeInitialBoardColumns).fill(0));
  for(const piece of pieces)for(const cell of piece.cells)owners[RULES.nativeInitialBoardLastRow-cell.y][cell.x]=piece.owner;
  assert.deepEqual(groupShape(owners),groupShape(start[side].ram_rows),`vertical piece groups, field ${side}`);
  assert.deepEqual(pieces.map(piece=>piece.kind),pieces.map(piece=>piece.height===1?2:piece.height===2?4:1),`vertical template type, field ${side}`);
  assert.equal(pieces[0].owner,RULES.nativeInitialBoardFirstOwner);
  assert.deepEqual(pieces.map(piece=>piece.cells.length).reduce((counts,n)=>{counts[n]=(counts[n]||0)+1;return counts;},{}),
   side===0?{1:9,2:2,3:5}:{1:9,2:4,3:4},`visible piece lengths, field ${side}`);
 }
 assert.deepEqual([0,1].map(side=>nativeInitialTowerPieces(nativeSurvivalConfig(8,42),8,side).length),[0,0],
  'the first eight Hard round configurations begin with empty boards');
 const taller={...config,height:45};
 assert.deepEqual([0,1].map(side=>nativeInitialTowerPieces(taller,9,side).reduce((n,piece)=>n+piece.cells.length,0)),[14,15],
  'the controlled height-45 ROM probe creates two rows plus the opponent extra cell');
 const deeper=nativeInitialTowerPieces(config,15,1),perColumn=Array(RULES.nativeInitialBoardColumns).fill(0);
 for(const piece of deeper)for(const cell of piece.cells)perColumn[cell.x]++;
 assert.deepEqual(perColumn,Array(RULES.nativeInitialBoardColumns).fill(5),
  'the controlled d=7 ROM probe adds one row in every opponent column');
 const tower=new Tower(settings({...DEFAULTS,nativeConfig:config}),randomFrom(42),0);
 assert.equal(tower.height(),4);assert.equal(tower.lines,0);assert.equal(tower.score,0);
 assert.ok(tower.rows.slice(0,4).every(row=>row.sealed),'preexisting complete rows do not score again on the next placement');
});

test('idle and walking discards match the original trajectories and 30-frame protection',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-discard-gba.json',import.meta.url),'utf8'));
 for(const profile of f.profiles){
  assert.deepEqual(profile.source_parameters.writes,[]);
  const a=profile.initial,c=discardedPickup({nativeKind:a.kind,nativeVariant:a.variant},a.actor_x,a.actor_y,a.actor_vx);
  for(const s of profile.samples){
   advancePickupMotion(c.nativeMotion,s.waterline);
   for(const key of ['x','y','vx','vy'])assert.equal(c.nativeMotion[key]*65536,s[key],`${key}, frame ${s.frame}`);
   for(const key of ['state','wait'])assert.equal(c.nativeMotion[key],s[key]);
  }
 }
 assert.deepEqual(f.catch_source_parameters.writes,[]);
 for(const s of f.catches){
  const m={...s.item,active:true};for(const k of ['x','y','vx','vy'])m[k]/=65536;
  advancePickupMotion(m,s.waterline/65536);
  assert.equal(nativePickupCanCatch(m,s.actor_x/65536,s.actor_y/65536),true,`catch ${s.frame}/${s.side}`);
 }
 const t=make();t.spawn=100;t.crates=[];t.egg.y=5;t.egg.ground=false;
 t.held={nativeKind:6,nativeVariant:0,cells:[[0,1],[1,0],[1,1],[2,0]]};
 const x=t.egg.x;t.update(RULES.step,{discard:true,move:1});
 assert.equal(t.held,null);assert.equal(t.crates.length,1);
 assert.equal(t.crates[0].nativeMotion.wait,29);
 assert.equal(t.crates[0].nativeMotion.vx,Math.floor((t.egg.x-x)*16*RULES.pickupDrag)/65536);
 const bomb=discardedPickup({item:'bomb',fuse:0.01},40,500,0);
 assert.equal(bomb.fuse,undefined);assert.equal(bomb.nativeMotion.wait,30);
 const m={state:1,wait:1,x:48,y:508};assert.equal(nativePickupCanCatch(m,40,500),false);
 m.wait=0;assert.equal(nativePickupCanCatch(m,40,500),true);
 m.x+=12;assert.equal(nativePickupCanCatch(m,40,500),false);
 m.x-=1/65536;assert.equal(nativePickupCanCatch(m,40,500),true);
});

test('native weighted bag, orientation, velocity and clock match 17 original births',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-pickup-bags-gba.json',import.meta.url),'utf8'));
 for(const source of Object.values(f.sources))assert.deepEqual(source.parameters.writes,[]);
 for(const birth of f.births){
  const s={seed:birth.seed,bag:[...birth.bag],remaining:birth.remaining},m=nextNativePickup(s,birth.native_frame);
  advancePickupMotion(m,birth.waterline);
  for(const k of ['x','y','vx','vy'])assert.equal(m[k]*65536,birth.item[k],`${k}, spawn ${birth.frame}/${birth.side}`);
  assert.equal(m.kind,birth.item.kind);assert.equal(m.variant,birth.item.variant);assert.equal(s.clock,birth.clock);
  for(const kind of birth.returned_kinds){s.bag[kind]++;s.remaining++;}
  assert.deepEqual(s.bag,birth.after_bag);assert.equal(s.remaining,birth.after_remaining);
 }
});

test('Survival pickup spawn consumes the active factory RNG draw first, as in the ROM',()=>{
 const weights=[5,6,4,3,5,4,3,3,1,2,1,1,1];
 const nativeConfig={primary:1,secondary:2,weights,divisor:9};
 const t=new Tower(settings({...DEFAULTS,hazards:true,seed:9850,nativeConfig}),randomFrom(42));
 t.artStage='factory';t.nativeFrame=1846;t.nativeEnemySeed=9850;t.crates=[];
 t.nativePickups={seed:9850,bag:[...weights],remaining:39,clock:0,weights,divisor:9};
 t.spawn=0;t.lastNativeSpawn=0;
 Object.assign(t.factorySecondary,{active:true,life:319,x:-4100096,y:19058664,vx:20480,vy:20480});
 t.update(RULES.step);
 const item=t.crates.find(c=>c.nativeKind===0&&c.nativeVariant===3);
 assert.ok(item,'the native seed sequence creates the captured kind/orientation pair');
 assert.equal(item.nativeMotion.x*65536,3528395,'the item receives the captured same-tick motion');
 assert.equal(item.nativeMotion.vx*65536,-10549);
 assert.equal(t.nativePickups.clock,56);
 assert.equal(t.nativeEnemySeed,14505,'robot draw plus four pickup draws');
});

test('Hard field preparation reproduces all six native starting pickups after 320 steps',()=>{
 const p=JSON.parse(readFileSync(new URL('./fixtures/eggo-pickup-bags-gba.json',import.meta.url),'utf8')).prefill;
 const t=new Tower(settings({...DEFAULTS,seed:p.seed}),randomFrom(p.seed));
 // The reference ready frame includes the first ordinary update following
 // the initializer's 320-step preparation.
 t.update(RULES.step);
 assert.equal(t.nativeFrame,p.native_frame);assert.equal(t.nativeEnemySeed,p.expected_seed);
 assert.equal(t.nativePickups.clock,p.expected.spawn_clock);
 assert.deepEqual(t.nativePickups.bag,p.expected.bag);assert.equal(t.nativePickups.remaining,p.expected.remaining);
 assert.equal(t.crates.length,p.expected.items.length);
 for(const original of p.expected.items){
  const c=t.crates.find(c=>c.nativeKind===original.kind&&c.nativeVariant===original.variant);
  assert.ok(c,'original starting item exists');
  for(const k of ['x','y','vx','vy'])assert.equal(c.nativeMotion[k]*65536,original[k],`prepared ${original.kind}/${original.variant} ${k}`);
 }
});

test('native pickups reproduce air drag, water buoyancy and departure without a fitted speed',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-pickup-motion-gba.json',import.meta.url),'utf8'));
 for(const profile of f.profiles){
  assert.deepEqual(profile.source_parameters.writes,[]);
  const d={...profile.samples[0],active:true};
  for(const row of profile.samples.slice(1)){
   advancePickupMotion(d,row.waterline);
   for(const k of ['x','y','vx','vy','state'])assert.equal(d[k],row[k],`${k}, pickup ${profile.parameters.address} frame ${row.frame}`);
   assert.equal(d.active,true);
  }
  advancePickupMotion(d,profile.samples.at(-1).waterline);
  assert.equal(d.active,false,'item returns to native pool on its exact departure tick');
 }
});

test('countdown keeps native pickups advancing with the original shared tool sway',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-pickup-bags-gba.json',import.meta.url),'utf8'));
 const t=new Tower(settings({...DEFAULTS,seed:f.prefill.seed}),randomFrom(f.prefill.seed));
 for(const row of f.intro_samples){
  if(row.native_frame>t.nativeFrame)t.advanceIntroPickups();assert.equal(t.nativeFrame,row.native_frame);assert.equal(t.nativeEnemySeed,row.seed);
  assert.equal(t.nativePickups.clock,row.pickups.spawn_clock);assert.equal(t.crates.length,row.pickups.items.length);
  for(const original of row.pickups.items){
   const c=t.crates.find(c=>c.nativeKind===original.kind&&c.nativeVariant===original.variant);
   assert.ok(c);for(const k of ['x','y','vx','vy'])assert.equal(c.nativeMotion[k]*65536,original[k],`intro ${row.frame} ${k}`);
  }
 }
 for(const sample of f.angle_samples)assert.ok(Math.abs(Math.round(nativePickupAngle(sample.frame)/Math.PI/2*RULES.nativeFullTurn)-sample.angle)<=2,`native tool sway frame ${sample.frame}, within two angle units`);
});

test('jungle stolen item launches on the native frame, at the native anchor and velocity',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-pickup-motion-gba.json',import.meta.url),'utf8'));
 const flight=JSON.parse(readFileSync(new URL('./fixtures/eggo-jungle-secondary-gba.json',import.meta.url),'utf8')).flights[0];
 const p=f.profiles[1],b=p.enemy_baseline,t=make(),held={cells:[[0,0]],color:2};
 Object.assign(t.jungleSecondary,b,{active:true,side:1,stolen:held,turnY:flight.turn_y,animationClock:b.animation_clock});
 for(const k of ['x','y','vx','vy'])t.jungleSecondary[k]/=65536;
 for(const row of p.enemy_samples){
  Object.assign(t.egg,{x:(row.actor_x/65536+16)/16,y:(720-row.actor_y/65536)/16,ground:false});
  t.water=(728-row.waterline/65536)/16;t.advanceParkSecondary(true);
  if(row.frame<24)assert.equal(t.crates.length,0);
 }
 assert.equal(t.jungleSecondary.stolen,null);assert.equal(t.crates.length,1);
 const c=t.crates[0],expected=p.samples[0];
 for(const k of ['x','y','vx','vy','state'])assert.equal(c.nativeMotion[k],expected[k],`new pickup ${k}`);
 assert.equal(c.x,(expected.x+8)/16);assert.equal(c.y,(744-expected.y)/16);
 assert.deepEqual(c.cells,held.cells);
});

test('jungle thief reproduces both full native right flights',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-jungle-secondary-gba.json',import.meta.url),'utf8'));
 assert.deepEqual(f.source_parameters.writes,[]);
 for(const flight of f.flights){
  const b=flight.baseline,d={...b,type:RULES.jungleSecondaryType,side:1,active:Boolean(b.active),turnY:flight.turn_y,animationClock:b.animation_clock};
  for(const k of ['x','y','vx','vy'])d[k]/=65536;
  for(const row of flight.samples){
   advanceParkSecondaryMotion(d,row.actor_y,row.waterline,Boolean(row.primary_active));
   for(const k of ['x','y','vx','vy','angle','speed','life','animation'])assert.equal(d[k],row[k],`${k}, jungle frame ${row.frame}`);
   assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
  }
 }
});

test('jungle thief steals using its smaller native contact offset',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-jungle-secondary-gba.json',import.meta.url),'utf8'));
 const t=make(),flight=f.flights[0],b=flight.samples.find(s=>s.frame===740);
 Object.assign(t.jungleSecondary,b,{active:true,side:1,turnY:flight.turn_y,animationClock:b.animation_clock});
 const held={cells:[[0,0]],color:2};t.held=held;
 for(const row of f.theft_probe.slice(0,12)){
  Object.assign(t.egg,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,ground:false,stun:0});
  t.water=(728-row.waterline)/16;t.advanceParkSecondary(true);
  assert.equal(t.held,null);assert.equal(t.jungleSecondary.stolen,held);
  for(const k of ['x','y','vx','vy','angle','speed','life','animation'])assert.equal(t.jungleSecondary[k],row[k],`${k}, jungle theft ${row.frame}`);
 }
});

test('beanstalk thief reproduces its full native descent and retreat',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-beanstalk-secondary-gba.json',import.meta.url),'utf8'));
 assert.deepEqual(f.source_parameters.writes,[]);
 const b=f.samples[0],d={...b,active:true,animationClock:b.animation_clock};
 for(const row of f.samples.slice(1)){
  advanceBeanstalkSecondaryMotion(d,row.actor_x,row.actor_y,row.waterline,Boolean(row.primary_active));
  for(const k of ['x','y','vx','vy','life','speed','animation'])assert.equal(d[k],row[k],`${k}, beanstalk thief ${row.frame}`);
  assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
 }
});

test('beanstalk thief steals at the native contact and switches to retreat',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-beanstalk-secondary-gba.json',import.meta.url),'utf8'));
 const t=make(),b=f.samples.find(s=>s.frame===810);
 Object.assign(t.beanstalkSecondary,b,{active:true,animationClock:b.animation_clock});
 t.held={cells:[[0,0]],color:2};const held=t.held;
 for(const row of f.theft_probe){
  Object.assign(t.egg,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,ground:false,stun:0});
  t.water=(728-row.waterline)/16;t.advanceBeanstalkSecondary();const d=t.beanstalkSecondary;
  for(const k of ['x','y','vx','vy','life','speed','animation'])assert.equal(d[k],row[k],`${k}, beanstalk theft ${row.frame}`);
  assert.equal(d.active,Boolean(row.active));assert.equal(d.animationClock,row.animation_clock);
  if(row.frame===1){assert.equal(t.held,null);assert.equal(d.stolen,held);assert.equal(d.life,1);}
 }
});

test('park primary matches native hovering, dive, cycle and departure',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-park-gba.json',import.meta.url),'utf8'));
 assert.deepEqual(f.source_parameters.writes,[]);
 for(const [side,b,samples] of [[0,f.baseline,f.samples],[1,f.right_baseline,f.right_samples]]){
 const d={...b,side,active:Boolean(b.active),animationClock:b.animation_clock};
 for(const row of samples){
  advanceParkPrimaryMotion(d,row.actor_y,row.previous_waterline,row.native_frame,Boolean(row.secondary_active));
  for(const k of ['x','y','vx','vy','life','variant','speed','animation'])assert.equal(d[k],row[k],`${k}, park primary frame ${row.frame}`);
  assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
 }
 }
});

test('park spring duck captures at the native head position and releases at cycle end',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-park-gba.json',import.meta.url),'utf8'));
 assert.deepEqual(RULES.parkPrimaryHitOffsets,f.hit_offsets);
 const t=make(),b=f.samples.find(s=>s.frame===1605);
 Object.assign(t.parkPrimary,b,{active:true,side:0,animationClock:b.animation_clock});
 t.held={cells:[[0,0]],color:2};
 let previous=b;
 for(const row of f.samples.filter(s=>s.frame>=1606&&s.frame<=1642)){
  Object.assign(t.egg,{x:(previous.actor_x+16)/16,y:(720-previous.actor_y)/16,ground:false,stun:0});
  t.nativeFrame=row.native_frame;t.water=(728-row.previous_waterline)/16;t.advanceParkPrimary();
  assert.ok(Math.abs(t.egg.x*16-16-row.actor_x)<1e-9,`actor X, frame ${row.frame}`);
  assert.ok(Math.abs(720-t.egg.y*16-row.actor_y)<1e-9,`actor Y, frame ${row.frame}`);
  assert.equal(Boolean(t.egg.carried),row.actor_state===6,`capture, frame ${row.frame}`);
  previous=row;
 }
 assert.equal(t.held,null);assert.equal(t.parkPrimary.life,75);
});

test('park bird reproduces both native arcs, acceleration and exit',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-park-secondary-gba.json',import.meta.url),'utf8'));
 assert.deepEqual(f.source_parameters.writes,[]);
 for(const [side,samples,turnY] of [[1,f.samples,f.turn_y],[0,f.left_samples,f.left_turn_y]]){
 const b=samples[0],d={...b,side,active:true,turnY,animationClock:b.animation_clock};
 for(const row of samples.slice(1)){
  advanceParkSecondaryMotion(d,row.actor_y,row.waterline,Boolean(row.primary_active));
  for(const k of ['x','y','vx','vy','angle','speed','life','animation'])assert.equal(d[k],row[k],`${k}, park frame ${row.frame}`);
  assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
 }
 }
});

test('park bird theft uses the native velocity-dependent contact point',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-park-secondary-gba.json',import.meta.url),'utf8'));
 const t=make(),b=f.samples.find(s=>s.frame===745);
 Object.assign(t.parkSecondary,b,{active:true,side:1,turnY:f.turn_y,animationClock:b.animation_clock});
 const held={cells:[[0,0]],color:2};t.held=held;
 for(const row of f.theft_probe.slice(0,6)){
  Object.assign(t.egg,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,ground:false,stun:0});
  t.water=(728-row.waterline)/16;t.advanceParkSecondary();
  assert.equal(t.held,row.actor_inventory===5?held:null,`inventory, probe frame ${row.frame}`);
  for(const k of ['x','y','vx','vy','angle','speed','life','animation'])assert.equal(t.parkSecondary[k],row[k],`${k}, theft ${row.frame}`);
 }
 assert.equal(t.parkSecondary.stolen,held);
});

test('factory robot matches normal-state pursuit, velocity poses and the full left continuation',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-factory-secondary-gba.json',import.meta.url),'utf8'));
 assert.deepEqual(f.source_parameters.writes,[]);assert.deepEqual(f.left_parameters.writes,[]);
 // Native throwing mutates its actor anchor after the enemy update; exclude
 // that unresolved internal anchor from the right-side equation comparison.
 for(let i=1;i<f.samples.length;i++){
  const row=f.samples[i],b=f.samples[i-1];if(row.actor_state===4)continue;
  const d={...b,type:2,side:1,active:true,animationClock:b.animation_clock};
  advanceCastleSecondaryMotion(d,row.actor_x,row.actor_y,row.waterline,row.random_value,Boolean(row.primary_active));
  for(const k of ['x','y','vx','vy','life','animation'])assert.equal(d[k],row[k],`${k}, right robot frame ${row.frame}`);
  assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
 }
 const b=f.left_baseline,d={...b,type:2,side:0,active:true,animationClock:b.animation_clock};
 for(const row of f.left_samples){
  assert.notEqual(row.actor_state,4);
  advanceCastleSecondaryMotion(d,row.actor_x,row.actor_y,row.waterline,row.random_value,Boolean(row.primary_active));
  for(const k of ['x','y','vx','vy','life','animation'])assert.equal(d[k],row[k],`${k}, left robot frame ${row.frame}`);
  assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
  if(f.native_graphics[row.frame])for(const k of ['wingClock','wingPhase','poseForward'])assert.equal(d[k],f.native_graphics[row.frame][k],`${k}, frame ${row.frame}`);
 }
});

test('factory robot theft has the native hit point and fifty-frame pursuit timer',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-factory-secondary-gba.json',import.meta.url),'utf8'));
 const row=f.theft_probe[0],t=make(),b=f.samples.find(s=>s.frame===750);
 Object.assign(t.factorySecondary,b,f.theft_graphics,{active:true,type:2,side:1,animationClock:b.animation_clock});
 Object.assign(t.egg,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,ground:false,stun:0});
 t.nativeEnemySeed=f.theft_seed;t.held={cells:[[0,0],[0,1],[0,2]],color:2};const held=t.held;
 t.water=(728-row.waterline)/16;t.advanceFactorySecondary();
 assert.equal(t.held,null);assert.equal(t.factorySecondary.stolen,held);assert.equal(t.factorySecondary.life,50);
 const d={...t.factorySecondary};
 for(const sample of f.theft_probe.slice(1)){
  advanceCastleSecondaryMotion(d,sample.actor_x,sample.actor_y,sample.waterline,sample.random_value);
  for(const k of ['x','y','vx','vy','life','animation'])assert.equal(d[k],sample[k],`${k}, stolen robot flight ${sample.frame}`);
 }
});

test('castle thief reproduces the full native pursuit, RNG perturbations and departure',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-castle-secondary-gba.json',import.meta.url),'utf8'));
 assert.deepEqual(f.source_parameters.writes,[]);
 const b=f.samples[0],d={...b,side:1,active:true,animationClock:b.animation_clock};
 for(const row of f.samples.slice(1)){
  advanceCastleSecondaryMotion(d,row.actor_x,row.actor_y,row.waterline,row.random_value,Boolean(row.primary_active));
  for(const k of ['x','y','vx','vy','life','animation'])assert.equal(d[k],row[k],`${k}, thief frame ${row.frame}`);
  assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
 }
});

test('castle thief steals once and keeps the native fifty-frame post-contact pursuit',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-castle-secondary-gba.json',import.meta.url),'utf8'));
 const row=f.theft_probe[0],t=make(),b=f.samples.find(s=>s.frame===750);
 Object.assign(t.castleSecondary,b,{active:true,side:1,animationClock:b.animation_clock});
 Object.assign(t.egg,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,ground:false,stun:0});
 t.nativeEnemySeed=f.theft_seed;
 t.held={cells:[[0,0],[0,1],[0,2]],color:2};const held=t.held;
 t.water=(728-row.waterline)/16;t.advanceCastleSecondary();
 assert.equal(t.held,null);assert.equal(t.castleSecondary.stolen,held);assert.equal(t.castleSecondary.life,50);
 const d={...t.castleSecondary};
 for(const sample of f.theft_probe.slice(1)){
  advanceCastleSecondaryMotion(d,sample.actor_x,sample.actor_y,sample.waterline,sample.random_value);
  for(const k of ['x','y','vx','vy','life','animation'])assert.equal(d[k],sample[k],`${k}, stolen flight ${sample.frame}`);
 }
});

 test('pirate thief follows the native wave, reverses, steals inventory and exits',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-pirate-secondary-gba.json',import.meta.url),'utf8'));
 assert.deepEqual(f.source_parameters.writes,[]);
 const b=f.samples[0],t=make();Object.assign(t.pirateSecondary,b,{active:true,side:1,animationClock:b.animation_clock});
 for(let i=1;i<f.samples.length;i++){
  const row=f.samples[i],previous=f.samples[i-1],e=t.egg;
  Object.assign(e,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,ground:false,stun:0,lightning:row.actor_state===7,swimming:row.actor_state===1});
  t.nativeFrame=row.native_frame;t.water=(728-row.waterline)/16;
  t.held=previous.actor_inventory>=0?{cells:[[0,0]],color:2}:null;t.placing=row.actor_state===4?{pending:true}:null;
  t.advancePirateSecondary();const d=t.pirateSecondary;
  for(const k of ['x','y','vx','vy','speed','life','animation'])assert.equal(d[k],row[k],`${k}, pirate thief frame ${row.frame}`);
  assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
  if(row.frame===755){assert.equal(t.held,null);assert.ok(d.stolen);assert.equal(row.actor_inventory,-1);}
 }
});

test('pirate skeletal fish arcs and capture reproduce native flight, bite and release',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-pirate-gba.json',import.meta.url),'utf8'));
    assert.deepEqual(f.source_parameters.writes,[]);assert.deepEqual(f.capture_parameters.writes,[]);
    for(const p of f.profiles){
        const d={...p.baseline,side:p.side,active:Boolean(p.baseline.active),animationFrames:RULES.pirateAnimationFrames};
        for(const k of ['x','y','vx','vy','speedDecreaseHeight'])d[k]/=65536;
        for(const row of p.samples){
            advanceCastleMotion(d,row.actor_y,row.waterline,Boolean(row.secondary_active));
            for(const k of ['x','y','vx','vy','life','variant','animation','angle','speed'])assert.equal(d[k],row[k],`${k}, fish side ${p.side} frame ${row.frame}`);
            assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
        }
    }
    const t=make(),rows=f.capture,b=f.profiles[0].samples[79];t.artStage='pirate';
    t.held={cells:[[0,0]],color:2};t.placing={pending:true};
    Object.assign(t.castle,b,{active:true,animationClock:b.animation_clock});
    for(let i=0;i<44;i++){
        const row=rows[i],previous=rows[i-1];
        const actor=t.castle.captured&&previous?previous:row;
        Object.assign(t.egg,{x:(actor.actor_x+16)/16,y:(720-actor.actor_y)/16,ground:true,stun:0});
        // Enemy update precedes the native water update within the frame.
        const waterline=previous?.waterline??760;
        t.water=(720+RULES.bubbleWaterlineBias-waterline)/16;t.advanceCastle();
        assert.equal(t.castle.captured,row.actor_state===6,`Fish grip at frame ${row.frame}`);
        assert.equal(t.castle.life,row.life,`Bite timer at frame ${row.frame}`);
        if(t.castle.captured){
            assert.equal(t.egg.x*16-16,row.actor_x);assert.equal(720-t.egg.y*16,row.actor_y);
            assert.equal(t.held,null);assert.equal(t.placing,null);
        }
    }
});

test('castle shark arcs and capture reproduce native flight, bite and release',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-castle-gba.json',import.meta.url),'utf8'));
    assert.deepEqual(f.source_parameters.writes,[]);assert.deepEqual(f.capture_parameters.writes,[]);
    for(const p of f.profiles){
        const d={...p.baseline,side:p.side,active:Boolean(p.baseline.active)};
        for(const k of ['x','y','vx','vy','speedDecreaseHeight'])d[k]/=65536;
        for(const row of p.samples){
            advanceCastleMotion(d,row.actor_y,row.waterline,Boolean(row.secondary_active));
            for(const k of ['x','y','vx','vy','life','variant','animation','angle','speed'])assert.equal(d[k],row[k],`${k}, shark side ${p.side} frame ${row.frame}`);
            assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
        }
    }
    const t=make(),rows=f.capture,b=f.profiles[0].samples[99];
    t.held={cells:[[0,0]],color:2};t.placing={pending:true};
    Object.assign(t.castle,b,{active:true,animationClock:b.animation_clock});
    for(let i=0;i<30;i++){
        const row=rows[i],previous=rows[i-1];
        const actor=t.castle.captured&&previous?previous:row;
        Object.assign(t.egg,{x:(actor.actor_x+16)/16,y:(720-actor.actor_y)/16,ground:true,stun:0});
        // Enemy update precedes the native water update within the frame.
        const waterline=previous?.waterline??760;
        t.water=(720+RULES.bubbleWaterlineBias-waterline)/16;t.advanceCastle();
        assert.equal(t.castle.captured,row.actor_state===6,`Shark grip at frame ${row.frame}`);
        assert.equal(t.castle.life,row.life,`Bite timer at frame ${row.frame}`);
        if(t.castle.captured){
            assert.equal(t.egg.x*16-16,row.actor_x);assert.equal(720-t.egg.y*16,row.actor_y);
            assert.equal(t.held,null);assert.equal(t.placing,null);
        }
    }
});

test('both dragon rocks reproduce native drift, fall, animation and exit',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-dragon-secondary-gba.json',import.meta.url),'utf8'));
    for(const p of f.profiles){
        assert.deepEqual(p.source_parameters.writes,[]);
        const d={...p.baseline,animationClock:p.baseline.animation_clock,active:true};
        for(const row of p.samples){
            advanceDragonSecondaryMotion(d,row.actor_y,row.waterline,Boolean(row.primary_active));
            for(const k of ['x','y','vx','vy','life','variant','animation','speed'])assert.equal(d[k],row[k],`${k}, rock side ${p.side} frame ${row.frame}`);
            assert.equal(d.animationClock,row.animation_clock);assert.equal(d.active,Boolean(row.active));
        }
    }
});

test('secondary height gate is relative to waterline and survives viewport scrolling',()=>{
    for(const height of [0,5]){
        const g=new Game(),t=make({hazards:true});t.artStage='space';t.spawn=100;
        t.space.life=10000;t.spaceSecondary.life=1;
        for(let y=0;y<height;y++)t.setCell(1,y,1);
        Object.assign(t.egg,{x:1.5,y:height,ground:true});
        g.views=[{camera:height}];g.updateTower(t,RULES.step,{},null);
        assert.equal(t.spaceSecondary.active,height===5);
        if(height===5)assert.equal(t.spaceSecondary.y,640);
    }
});

test('dragon rock contact respects the exact native integer-pixel boundary',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-dragon-secondary-gba.json',import.meta.url),'utf8'));
    const samples=f.profiles[0].samples,t=make(),b=samples.find(row=>row.frame===199);
    Object.assign(t.dragonSecondary,b,{active:true,animationClock:b.animation_clock});
    for(const row of samples.filter(row=>row.frame>=200&&row.frame<=206)){
        Object.assign(t.egg,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,vy:0,ground:true});
        t.water=(720+RULES.bubbleWaterlineBias-row.waterline)/16;t.advanceDragonSecondary();
        assert.equal(Boolean(t.egg.lightning),row.actor_next_state===7,`Rock contact at native frame ${row.frame}`);
        assert.equal(t.egg.vy,0);
    }
});

test('both dragon arcs reproduce native spawn, turn, speed and animation',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-dragon-gba.json',import.meta.url),'utf8'));
    assert.deepEqual(f.source_parameters.writes,[]);
    for(const p of f.profiles){
        const d={...p.baseline,side:p.side,active:Boolean(p.baseline.active)};
        for(const k of ['x','y','vx','vy','speedDecreaseHeight'])d[k]/=65536;
        for(const row of p.samples){
            advanceDragonMotion(d,row.actor_y,row.camera_y,row.waterline,row.native_frame,Boolean(row.secondary_active));
            for(const k of ['x','y','vx','vy','life','variant','animation','angle','speed'])assert.equal(d[k],row[k],`${k}, dragon side ${p.side} frame ${row.frame}`);
            assert.equal(d.animationClock,row.animation_clock);
            assert.equal(d.active,Boolean(row.active));
        }
    }
});

test('descending dragon damages on the exact native contact frame',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-dragon-gba.json',import.meta.url),'utf8'));
    const p=f.profiles[0],t=make();Object.assign(t.dragon,p.baseline,{active:Boolean(p.baseline.active)});
    for(const k of ['x','y','vx','vy','speedDecreaseHeight'])t.dragon[k]/=65536;
    for(const row of p.samples.slice(0,117)){
        Object.assign(t.egg,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,ground:true,vy:0});
        t.nativeFrame=row.native_frame;t.water=(720+RULES.bubbleWaterlineBias-row.waterline)/16;
        t.advanceDragon();
        assert.equal(Boolean(t.egg.lightning),row.actor_next_state===7,`Dragon contact at native frame ${row.frame}`);
        assert.equal(t.egg.vy,0,'Contact must preserve velocity');
    }
});

test('space missile eligibility on land and both flights match native charge, turn and exit',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-space-secondary-gba.json',import.meta.url),'utf8'));
    assert.deepEqual(f.source_parameters.writes,[]);
    for(const p of f.profiles){
        // Right-side spawning occurs during water recovery: its internal actor
        // anchor differs from the final frame's visible anchor. Validate that
        // flight from the recorded spawn; land-side spawning is tested directly.
        const start=p.side?p.samples.findIndex(row=>row.active): -1;
        const baseline=p.side?p.samples[start]:p.baseline;
        const s={...baseline,side:p.side,active:Boolean(baseline.active),animationClock:baseline.animation_clock??baseline.animationClock};
        if(!p.side)for(const k of ['x','y','vx','vy'])s[k]/=65536;
        for(const row of p.samples.slice(start+1)){
            advanceSpaceSecondaryMotion(s,row.actor_y,row.camera_y,Boolean(row.primary_active));
            for(const k of ['x','y','vx','vy','life','animation','angle','speed'])assert.equal(s[k],row[k],`${k}, missile side ${p.side} frame ${row.frame}`);
            assert.equal(s.animationClock,row.animation_clock,`Animation clock, missile side ${p.side} frame ${row.frame}`);
            assert.equal(s.active,Boolean(row.active));
        }
    }
});

test('space missile contact enters native damage state without a velocity kick',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-space-secondary-gba.json',import.meta.url),'utf8'));
    assert.deepEqual(f.contact_source_parameters.writes,[[15316,0],[15320,39321600],[15340,0]]);
    const t=make({hazards:true});t.artStage='space';t.spawn=100;t.space.life=10000;
    Object.assign(t.spaceSecondary,f.profiles[0].samples[199],{active:true,animationClock:f.profiles[0].samples[199].animation_clock});
    Object.assign(t.egg,{x:1,y:7.5,vy:0,ground:false});
    // Inspect contact at the probe's fixed actor position, then compare all
    // following damage ticks. A collision must preserve that initial velocity.
    t.advanceSpaceSecondary();
    assert.ok(t.egg.lightning);assert.equal(t.egg.vy,0);
    assert.equal(720-t.egg.y*16,f.contact_samples[0].actor_y);
    for(const row of f.contact_samples.slice(1)){
        t.update(RULES.step);
        assert.equal(Boolean(t.egg.lightning),row.actor_state===7);
        assert.ok(Math.abs(720-t.egg.y*16-row.actor_y)<.001,`Damage Y at native frame ${row.frame}`);
    }
});

test('stationary space enemy matches native full visit, animation and inventory theft',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-space-enemy-gba.json',import.meta.url),'utf8'));
    assert.deepEqual(f.source_parameters.writes,[]);
    assert.deepEqual([...RULES.spaceHitOffsets],f.hit_offsets);
    const t=make(),s=t.space;Object.assign(s,f.baseline,{active:Boolean(f.baseline.active)});
    for(const k of ['x','y','vx','vy'])s[k]/=65536;
    let previousInventory=f.samples[0].actor_inventory;
    for(const row of f.samples){
        Object.assign(t.egg,{x:(row.actor_x+16)/16,y:(720-row.actor_y)/16,swimming:row.actor_state===1});
        t.water=(720+RULES.bubbleWaterlineBias-row.waterline)/16;
        const held=previousInventory>=0?{}:null;t.held=held;t.flash=0;t.advanceSpace();
        for(const k of ['x','y','vx','vy','life','animation','variant'])assert.equal(s[k],row[k],`${k}, space frame ${row.frame}`);
        assert.equal(s.animationClock,row.animation_clock,`Animation clock, space frame ${row.frame}`);
        assert.equal(s.active,Boolean(row.active));
        if(held&&row.actor_inventory<0)assert.equal(t.held,null,`Theft at native frame ${row.frame}`);
        else if(held)assert.equal(t.held,held,`No premature theft at frame ${row.frame}`);
        if(t.flash)assert.equal(row.hit_flash,25,`No false space hit at frame ${row.frame}`);
        previousInventory=row.actor_inventory;
    }
});

test('jungle arcs, capture, bite timer and avoiding a jump match native Hard',()=>{
    const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-jungle-enemy-gba.json',import.meta.url),'utf8'));
    for(const [b,samples] of [[f.baseline,f.samples],[f.moved_baseline,f.moved_samples]]){
    const t=make(),j=t.jumper;Object.assign(j,b,{active:Boolean(b.active)});
    for(const k of ['x','y','vx','vy'])j[k]/=65536;
    let previous={actor_x:b.actor_x/65536,actor_y:b.actor_y/65536,waterline:b.waterline/65536};
    for(const s of samples){
        Object.assign(t.egg,{x:(previous.actor_x+16)/16,y:(720-previous.actor_y)/16,swimming:false});
        t.water=(720+RULES.bubbleWaterlineBias-previous.waterline)/16;t.advanceJumper();
        for(const k of ['x','y','vx','vy','life','animation','variant'])assert.equal(j[k],s[k],`${k}, jungle frame ${s.frame}`);
        assert.equal(j.active,Boolean(s.active));assert.equal(Boolean(t.egg.carried),s.actor_state===6,`jungle capture frame ${s.frame}`);
        if(s.actor_state===6){assert.equal(t.egg.x,(s.actor_x+16)/16);assert.equal(t.egg.y,(720-s.actor_y)/16);}
        previous=s;
    }
    }
});

test('beanstalk enemy matches both complete native arcs and capture/release',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-jumper-gba.json',import.meta.url),'utf8'));
    const t=make(),j=t.jumper;j.life=fixture.parameters.initial_life;j.difficulty=fixture.parameters.difficulty;
    let water=fixture.parameters.initial_waterline,previous=fixture.samples[0];
    for(const sample of fixture.samples){
        Object.assign(t.egg,{x:(previous.actor_x+16)/16,y:(720-previous.actor_y)/16,swimming:false});
        t.water=(720+RULES.bubbleWaterlineBias-water)/16;
        t.advanceJumper();
        for(const key of ['x','y','vx','vy','life','animation','variant'])assert.equal(j[key],sample[key],`${key}, frame ${sample.frame}`);
        assert.equal(j.active,Boolean(sample.active));
        assert.equal(Boolean(t.egg.carried),sample.actor_state===6,`capture frame ${sample.frame}`);
        if(sample.actor_state===6){assert.equal(t.egg.x,(sample.actor_x+16)/16);assert.equal(t.egg.y,(720-sample.actor_y)/16);}
        previous=sample;water=sample.waterline;
    }
});

test('first-stage Hard beanstalk uses the native long arc and 1050-frame rest',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-jumper-gba.json',import.meta.url),'utf8'));
    const t=make(),j=t.jumper,b=fixture.hard_baseline;
    Object.assign(j,b,{active:Boolean(b.active)});
    for(const key of ['x','y','vx','vy'])j[key]/=65536;
    let previous={actor_x:b.actor_x/65536,actor_y:b.actor_y/65536,waterline:b.waterline/65536};
    for(const sample of fixture.hard_samples){
        Object.assign(t.egg,{x:(previous.actor_x+16)/16,y:(720-previous.actor_y)/16,swimming:false});
        t.water=(720+RULES.bubbleWaterlineBias-previous.waterline)/16;
        t.advanceJumper();
        for(const key of ['x','y','vx','vy','life','animation','variant'])assert.equal(j[key],sample[key],`${key}, Hard frame ${sample.frame}`);
        assert.equal(j.active,Boolean(sample.active));
        assert.equal(Boolean(t.egg.carried),sample.actor_state===6,`Hard capture frame ${sample.frame}`);
        previous=sample;
    }
    assert.ok(fixture.hard_samples.some(s=>!s.active&&s.life===1050));
});

test('factory bubble matches the complete native lifetime, capture and release',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-bubble-gba.json',import.meta.url),'utf8'));
    const t=make();t.bubble.life=fixture.parameters.initial_life;
    let actorX=fixture.native[0].actor_x;
    for(const sample of fixture.native){
        // Motion runs before the native actor is attached to the bubble.
        if(sample.frame>1)actorX=fixture.native[sample.frame-2].actor_x;
        t.nativeFrame=sample.nativeFrame;
        Object.assign(t.egg,{x:(actorX+16)/16,y:(720-(sample.frame>1?fixture.native[sample.frame-2].actor_y:sample.actor_y))/16});
        t.advanceBubble();
        const b=t.bubble;
        for(const key of ['x','y','vx','vy','life','animation'])assert.equal(b[key],sample[key],`${key}, frame ${sample.frame}`);
        assert.equal(b.active,Boolean(sample.active));
        assert.equal(Boolean(t.egg.bubble),sample.actor_state===6,`capture frame ${sample.frame}`);
        if(sample.actor_state===6){assert.equal(t.egg.x,(sample.actor_x+16)/16);assert.equal(t.egg.y,(720-sample.actor_y)/16);}
    }
});

test('bubble escape responds to a press and subtracts the native twenty frames',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-bubble-gba.json',import.meta.url),'utf8'));
    const initial=fixture.native[112],b={...initial,active:true,escapeCounter:0,
        animationClock:fixture.parameters.escape_initial_animation_clock};
    let actorX=initial.actor_x;
    for(const sample of fixture.escape){
        advanceBubbleMotion(b,actorX,sample.nativeFrame,fixture.parameters.waterline,sample.frame===1);
        for(const key of ['x','y','vx','vy','life','animation'])assert.equal(b[key],sample[key],`${key}, escape frame ${sample.frame}`);
        assert.equal(b.escapeCounter,sample.escape_counter);
        actorX=sample.actor_x;
    }
});

test('hammer launches at the native anchor and reproduces its arc and actor hit',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-hammer-gba.json',import.meta.url),'utf8'));
    const source=make({waterSpeed:0}),target=make({waterSpeed:0});source.spawn=target.spawn=Infinity;
    target.fieldIndex=1;
    fixture.initial_target_rows.forEach((row,y)=>row.forEach((value,x)=>{if(value)target.setCell(x,y,1,value)}));
    Object.assign(source.egg,{x:fixture.initial_actor.x,y:fixture.initial_actor.y+RULES.gravity*RULES.step**2,vy:0,ground:false});
    source.held={item:'hammer'};target.egg.x=-100;
    for(const sample of fixture.samples){
        source.update(RULES.step,{use:sample.frame===1},target);
        assert.equal(source.hammers.length,1,`hammer frame ${sample.frame}`);
        const h=source.hammers[0];
        for(const key of ['x','y','vy'])assert.ok(Math.abs(h[key]-sample[key])<1e-8,`${key} frame ${sample.frame}: ${h[key]} vs ${sample[key]}`);
        assert.equal(target.egg.lightning,undefined);
    }
    Object.assign(target.egg,fixture.target_at_hit);
    source.update(RULES.step,{},target);
    assert.equal(source.hammers.length,0);assert.ok(target.egg.lightning);
    assert.equal(target.rows.reduce((n,row)=>n+row.cells.filter(Boolean).length,0),38,'actor hit does not delete a tower row');
});

test('hammer collapse retains the roof and matches both measured floor removal times',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-hammer-gba.json',import.meta.url),'utf8'));
    const target=make({waterSpeed:0});target.spawn=Infinity;
    fixture.gap_target_rows.forEach((row,y)=>row.forEach((value,x)=>{if(value)target.setCell(x,y,1,value)}));
    target.time=fixture.parameters.tower_contact_frame*RULES.step;
    target.startHammerCollapse(target.time);
    let before=38;const losses=[];
    for(let frame=fixture.parameters.tower_contact_frame+1;frame<=fixture.parameters.second_floor_removed;frame++){
        target.update(RULES.step);
        const count=target.rows.reduce((n,row)=>n+row.cells.filter(Boolean).length,0);
        if(count<before)losses.push({frame,loss:before-count});before=count;
    }
    assert.deepEqual(losses,fixture.gap_losses.slice(0,2));
    // Native bounded row copying clears the old last row instead of shrinking
    // the sparse board array. Inspect the occupied roof, not allocation length.
    assert.equal(target.rows[target.height()-1].cells.filter(Boolean).length,2,'highest incomplete roof survives');
    const solid=make();for(let y=0;y<4;y++)for(let x=0;x<7;x++)solid.setCell(x,y,1);
    solid.startHammerCollapse(0);assert.equal(solid.hammerCollapse,undefined,'solid floors stay intact');
});

test('cloud hit and miss reproduce the paired native jump trajectories',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-cloud-gba.json',import.meta.url),'utf8'));
    for(const hit of [false,true]){
        const t=make({waterSpeed:0});t.spawn=Infinity;t.egg.x=fixture.initial_x;
        if(hit)t.clouds.push({x:fixture.parameters.cloud_x,y:fixture.parameters.cloud_y,bornAt:RULES.step,counter:286});
        for(let frame=1;frame<=120;frame++){
            t.update(RULES.step,{jump:frame===fixture.parameters.jump_frame,
                float:frame>=fixture.parameters.float_frames[0]&&frame<=fixture.parameters.float_frames[1]});
            const sample=fixture.samples.find(s=>s.frame===frame);
            if(sample)assert.ok(Math.abs(t.egg.y*16-sample[hit?'hit_height_pixels':'control_height_pixels'])<.01,`height frame ${frame}, hit ${hit}`);
            assert.equal(Boolean(t.egg.lightning),hit&&frame>=fixture.parameters.first_hit_frame,`state frame ${frame}`);
        }
        if(hit){
            for(let frame=0;frame<180&&t.egg.lightning;frame++)t.update(RULES.step);
            assert.equal(t.egg.lightning,null,'water recovery restores player control');
            assert.equal(t.egg.stun,0);
        }
    }
});

test('cloud targets the user column, pulses three times and respects strict hit bounds',()=>{
    const source=make(),target=make();source.fieldIndex=1;target.fieldIndex=0;
    source.egg.x=2.5;target.egg.x=5;target.setCell(2,3,1);source.held={item:'cloud'};
    assert.equal(source.use(target),true);
    assert.equal(target.clouds[0].x,2.5);assert.equal(target.clouds[0].y,7.5);
    assert.equal(source.held,null);
    source.egg.x=1.5;source.held={item:'cloud'};source.use(target);
    assert.equal(target.clouds.length,1,'native field has a single replaceable cloud slot');
    assert.equal(target.clouds[0].x,1.5);
    const pulses=[];for(let counter=286;counter>0;counter--)if(cloudStriking(counter))pulses.push(counter);
    assert.deepEqual(pulses,[201,200,199,198,197,196,195,194,193,192,137,136,135,134,133,132,131,130,129,128,73,72,71,70,69,68,67,66,65,64]);
    assert.equal(cloudScale(286),.5);assert.equal(cloudScale(222),1);assert.equal(cloudScale(0),.5);
    for(const [dx,dy,hit] of [[0,0,true],[1.25,0,false],[0,1.25,false],[1.2,1.2,true]]){
        const t=make();Object.assign(t.egg,{x:3+dx,y:1.5+dy,vy:4,ground:false});
        t.clouds=[{x:3,y:3.5,bornAt:0,counter:286}];t.time=85*RULES.step;t.advanceClouds();
        assert.equal(Boolean(t.egg.lightning),hit);assert.equal(t.egg.vy,4,'strike preserves velocity');
    }
    target.time=286*RULES.step;target.advanceClouds();assert.equal(target.clouds.length,0);
});

test('initial Survival arena reproduces native RNG traces, then cycles from that arena',()=>{
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-arena-selection-gba.json',import.meta.url),'utf8'));
    for(const sample of fixture.samples){
        assert.equal(nativeRandomStep(sample.seed),sample.first_draw);
        assert.equal(nativeRandomStep(nativeRandomStep(sample.first_draw)),sample.third_draw);
        const initial=startingStageFromSeed(sample.seed);
        assert.equal(survivalStage(1,initial),sample.stage);
        for(let round=1;round<=9;round++){
            const expected=fixture.parameters.native_stage_names[(sample.stage_id+round-1)%8];
            assert.equal(survivalStage(round,initial),expected);
        }
        const g=new Game();g.p=settings({hazards:false});g.seed=sample.seed;g.resetSurvival();
        assert.equal(g.startingStage,initial);
    }
});

test('Survival startup reproduces both native pickup-manager initialization passes',()=>{
    const game=new Game();game.p=settings();game.seed=1137;game.resetSurvival();
    const nativeStart={seed:37606,clock:56,
        bag:[5,6,5,5,6,4,3,5,1,2,1,1,1],remaining:45,
        newestFirstItems:[
            [5,3,1,3500748,3082224,-38196,-63504,0],
            [6,1,1,5035038,2126488,12670,19215,0],
            [3,3,1,4393650,4112246,2222,46033,0],
            [6,0,1,3836848,7099023,263,56961,0],
            [2,0,1,5306663,10493784,649,61419,0],
            [10,3,1,1877018,15641327,-203,63638,0],
        ]};
    const snapshot=tower=>({seed:tower.nativeEnemySeed,clock:tower.nativePickups.clock,
        bag:[...tower.nativePickups.bag],remaining:tower.nativePickups.remaining,
        newestFirstItems:[...tower.crates].reverse().map(crate=>{
            const m=crate.nativeMotion,fixed=value=>Math.round(value*65536);
            return [crate.nativeKind,crate.nativeVariant,m.state,fixed(m.x),fixed(m.y),
                fixed(m.vx),fixed(m.vy),m.wait??0];
        })});
    assert.deepEqual(snapshot(game.player),nativeStart);
    assert.deepEqual(snapshot(game.cpu),nativeStart);
    assert.equal(game.nativeActorRandomSeed,24248);
    assert.equal(game.player.artStage,'factory');

    game.round=9;game.nativeActorRandomSeed=18525;game.startRound({intro:false});
    assert.equal(game.player.nativeEnemySeed,59501);
    assert.equal(game.cpu.nativeEnemySeed,59501);
    assert.equal(game.nativeActorRandomSeed,3020);
    assert.deepEqual(game.player.p.nativeConfig.words,
        [0,9,3,2,1,0,0,3,3,3,3,6,6,6,6,5,7,43,10]);
});

test('native jump cue follows an accepted jump, never an airborne or stunned input',()=>{
    const game=new Game(),tower=make();tower.spawn=Infinity;
    const played=[];game.audio={playSound:(...args)=>played.push(args)};
    game.updateTower(tower,RULES.step,{jump:true});
    assert.deepEqual(played,[[SOUND.jump.id,{volume:SOUND.jump.volume}]]);
    for(let i=0;i<8;i++)game.updateTower(tower,RULES.step,{jump:true,float:true});
    assert.equal(played.length,1);
    tower.egg.y=0;tower.egg.ground=true;tower.egg.stun=1;
    game.updateTower(tower,RULES.step,{jump:true});
    assert.equal(played.length,1);
    Object.assign(tower.egg,{y:0,vy:0,ground:true,stun:0});
    game.updateTower(tower,RULES.step,{jump:true});
    assert.equal(played.length,2);
});

test('bomb lift and unobstructed arc reproduce every captured native frame',()=>{
    const [initial,...samples]=bombLaunchGba.samples;
    const scale=bombLaunchGba.parameters.pixels_per_cell;
    const bomb={x:initial.x/scale,y:-initial.y/scale,vy:-initial.vy*60/scale,
        liftY:-initial.target_y/scale,targetX:(initial.x+128)/scale,phase:'lift'};
    for(const sample of samples){
        advanceBombFlight(bomb);
        assert.ok(Math.abs(bomb.x-sample.x/scale)<1e-9,`x frame ${sample.frame}`);
        assert.ok(Math.abs(bomb.y+sample.y/scale)<1e-9,`y frame ${sample.frame}`);
        assert.ok(Math.abs(bomb.vy+sample.vy*60/scale)<1e-9,`vy frame ${sample.frame}`);
    }
});

test('naturally armed bomb follows the measured native countdown',()=>{
    const t=make();t.spawn=Infinity;
    assert.equal(RULES.bombFuse,armedBombGba.armed_frames/armedBombGba.parameters.rate);
    t.held={item:'bomb',fuse:RULES.bombFuse};
    for(let n=0;n<armedBombGba.armed_frames-1;n++)t.update(RULES.step);
    assert.equal(t.explosions.length,0);
    t.update(RULES.step);
    assert.equal(t.held,null);assert.equal(t.explosions.length,1);
    assert.equal(t.explosions[0].age,0,'damage begins before the first visible particle frame');
});

test('playable bomb flight matches the native arc and its first edge contact bounce',()=>{
    const t=make(),opponent=make();t.spawn=opponent.spawn=Infinity;
    const initial=bombLaunchGba.samples[0],scale=bombLaunchGba.parameters.pixels_per_cell;
    for(const [x,height]of bombLaunchGba.collision_samples[0].surface_heights.entries())
        for(let y=0;y<height;y++)opponent.setCell(x,y,1);
    t.bombs=[{item:'bomb',x:initial.x/scale,y:(720-initial.y)/scale,
        liftY:(720-initial.target_y)/scale,targetX:(initial.x+128)/scale,
        vy:-initial.vy*60/scale,phase:'lift',fuse:10}];
    for(const sample of [...bombLaunchGba.samples.slice(1),...bombLaunchGba.collision_samples]){
        t.update(RULES.step,{},opponent);
        const b=t.bombs[0];assert.ok(b,`in flight frame ${sample.frame}`);
        assert.ok(Math.abs(b.x-sample.x/scale)<1e-9,`x frame ${sample.frame}`);
        assert.ok(Math.abs(b.y-(720-sample.y)/scale)<1e-9,`y frame ${sample.frame}`);
        assert.ok(Math.abs(b.vy+sample.vy*60/scale)<1e-9,`vy frame ${sample.frame}`);
    }
});

test('both players launch a moving bomb and preserve its remaining fuse',()=>{
    for(const side of [0,1]){
        const source=new Tower(settings({...DEFAULTS,hazards:false}),randomFrom(42),side),target=make();
        source.spawn=target.spawn=Infinity;source.egg.x=1;source.egg.y=2;
        source.held={item:'bomb',fuse:2};
        source.update(RULES.step,{use:true},target);
        assert.equal(source.held,null);assert.equal(source.bombs.length,1);assert.equal(target.attacks.length,0);
        const b=source.bombs[0],x=b.x;
        assert.ok(Math.abs(b.fuse-(2-RULES.step))<1e-12);
        for(let n=0;n<3;n++)source.update(RULES.step,{},target);
        assert.equal(Math.sign(b.x-x),side===0?1:-1);
        assert.ok(b.fuse<2-RULES.step);
    }
});

test('bomb rebounds, rest, renewed fall and expiry match the full native replay',()=>{
    const t=make(),opponent=make();t.spawn=opponent.spawn=Infinity;
    const [initial,...samples]=bombReboundsGba.samples;
    const {baseline_world_y:origin,baseline_row:baseline,field_span_pixels:span}=bombReboundsGba.parameters;
    const setSurface=sample=>{
        opponent.rows=[];
        for(const [x,row]of sample.height_table.slice(1).entries())
            for(let y=0;y<baseline-row;y++)opponent.setCell(x,y,1);
    };
    setSurface(initial);
    t.bombs=[{item:'bomb',x:initial.x/16,y:(origin-initial.y)/16,
        liftY:(origin-initial.lift_y)/16,targetX:(initial.x+span)/16,
        vy:-initial.vy*60/16,phase:'lift',fuse:initial.remaining_frames*RULES.step}];
    for(const sample of samples.filter(s=>s.remaining_frames>0)){
        t.update(RULES.step,{},opponent);
        const b=t.bombs[0];assert.ok(b,`bomb frame ${sample.frame}`);
        assert.ok(Math.abs(b.x-sample.x/16)<2e-6,`x frame ${sample.frame}`);
        assert.ok(Math.abs(b.y-(origin-sample.y)/16)<2e-6,`y frame ${sample.frame}`);
        assert.ok(Math.abs(b.vy+sample.vy*60/16)<2e-6,`vy frame ${sample.frame}`);
        setSurface(sample);
    }
    assert.equal(opponent.explosions.length,0);
    t.update(RULES.step,{},opponent);
    assert.equal(t.bombs.length,0);assert.equal(opponent.explosions.length,1);
});

test('native blast removes entire touched pieces, including cells beyond the blast centre',()=>{
    const t=make(),[before,after]=bombDamageGba.captures;
    const offset=bombDamageGba.parameters.physical_row_offset;
    for(let y=offset;y<before.rows.length;y++)for(let x=0;x<t.p.columns;x++){
        const owner=before.rows[y][x];if(owner)t.setCell(x,y-offset,1,owner);
    }
    t.explode(...bombDamageGba.blast_center);
    for(let y=offset;y<before.rows.length;y++)for(let x=0;x<t.p.columns;x++)
        assert.equal(t.rows[y-offset]?.owners[x]||0,after.rows[y][x],`cell ${x},${y}`);
});

test('Survival ranks consecutive wins independently of prototype cell points',()=>{
    const g=new Game();g.p=settings({hazards:false});g.seed=42;g.round=1;g.wins=4;
    g.startRound({intro:false});g.player.score=9999;g.player.won=true;
    const results=[];g.submitScore=result=>results.push(result);g.finish();
    assert.equal(results[0].score,5);assert.equal(results[0].wins,5);
    g.round++;g.startRound({intro:false});g.player.score=54321;g.player.lost=true;g.finish();
    assert.equal(results[1].score,5);assert.equal(results[1].wins,5);
    g.resetSurvival();assert.equal(g.wins,0);
});

test('result screen keeps the world and bomb effects moving without resubmitting the result',()=>{
    const g=new Game();g.p=settings({hazards:false});g.seed=42;g.round=1;g.wins=0;g.startRound({intro:false});
    g.player.spawn=g.cpu.spawn=Infinity;g.elapsed=12.5;
    g.input={isActionJustDown:()=>false};let submissions=0;g.submitScore=()=>submissions++;
    g.player.held={item:'bomb',fuse:2*RULES.step};g.player.lost=true;g.finish();
    assert.equal(g.phase,'lost');assert.equal(submissions,1);
    for(let n=0;n<4;n++)g.update(RULES.step);
    assert.equal(g.elapsed,12.5);assert.equal(submissions,1);assert.equal(g.phase,'lost');
    assert.equal(g.player.held,null);assert.equal(g.player.explosions.length,1);
    assert.ok(g.player.explosions[0].age>=RULES.step);
    assert.ok(g.player.time>0&&g.cpu.time>0);
});
test('carried inventory disappears on the native water-entry frame without detonating',()=>{
    for(const held of [{cells:SHAPES[6],color:7},{item:'bomb',fuse:10}]){
        const t=make();t.spawn=100;t.held=held;
        for(let frame=1;frame<=waterInventoryGba.lost_on_frame;frame++){
            t.update(RULES.step,{dive:frame<=2});
            if(frame<=waterInventoryGba.carried_through_frame)assert.equal(t.held,held);
            else assert.equal(t.held,null);
        }
        assert.equal(t.explosions.length,0);
    }
});
test('a native boxed bomb remains inert beyond the prototype three-second fuse',()=>{
    const t=make();t.spawn=100;
    const bomb={item:'bomb',x:0.5,y:20};t.crates=[bomb];
    assert.ok(bombGba.minimum_unarmed_frames/60>3);
    for(let n=0;n<bombGba.minimum_unarmed_frames;n++)t.update(RULES.step);
    assert.ok(t.crates.includes(bomb));assert.equal(bomb.fuse,undefined);
    bomb.x=t.egg.x;bomb.y=t.egg.y+1;t.update(RULES.step);
    assert.equal(t.held,bomb);assert.equal(bomb.fuse,RULES.bombFuse);
    t.update(RULES.step);assert.ok(bomb.fuse<RULES.bombFuse);
});
test('four rotations preserve every piece',()=>{const norm=a=>a.map(p=>p.join(',')).sort();for(const s of SHAPES){let a=s;for(let i=0;i<4;i++)a=rotate(a);assert.deepEqual(norm(a),norm(s));}});
test('placing a caught piece raises the builder; completed floors remain',()=>{const t=make({columns:4});t.egg.x=2;t.held={cells:SHAPES[0],color:1};assert.ok(t.use());assert.equal(t.rows.length,0);assert.ok(t.placing);for(let i=0;i<Math.ceil(RULES.throwTime/RULES.step)+1;i++)t.update(RULES.step);assert.ok(t.rows[0].sealed);assert.equal(t.lines,1);assert.ok(t.egg.y>=1);assert.equal(t.rows[0].cells.filter(Boolean).length,4);});
test('water erodes incomplete floors but not solid floors',()=>{const t=make({waterSpeed:0});t.row(0).cells.fill(1);t.row(0).sealed=true;t.row(1).cells[0]=2;t.row(2).cells[0]=3;t.water=1.2;t.update(RULES.erosionTime);assert.ok(t.rows[0].sealed);assert.equal(t.rows[1].cells[0],3);});
test('collision catches the egg on a platform and a dive descends through it',()=>{const t=make({waterSpeed:0});t.row(2).cells.fill(1);t.egg.y=4;for(let i=0;i<120;i++)t.update(RULES.step);assert.equal(t.egg.y,3);t.update(RULES.step,{dive:true});for(let i=0;i<30;i++)t.update(RULES.step);assert.ok(t.egg.y<3);assert.equal(t.egg.ground,false);});
test('catch, discard, item use and goal contact anywhere across the field',()=>{const t=make();t.crates=[{x:t.egg.x,y:1,cells:SHAPES[1],color:2}];t.update(RULES.step);assert.ok(t.held);t.update(RULES.step,{discard:true});assert.equal(t.held,null);t.held={item:'boots'};t.use();assert.ok(t.egg.boost>0);t.egg.x=0;t.egg.y=t.p.goal+0.25;t.update(RULES.step);assert.ok(t.won);});
test('rescue plane is strict at exactly the configured height',()=>{
    const t=make({hazards:false});t.egg.x=0;t.egg.y=t.p.goal;
    t.update(RULES.step,{nativeFreezeActor:true});
    assert.equal(t.won,false,'touching the rescue plane is not enough');
    t.egg.y=t.p.goal+1/1024;
    t.update(RULES.step,{nativeFreezeActor:true});
    assert.equal(t.won,true,'the actor rescues once it crosses the plane at any X');
});
test('CPU plays through the same model without overlaps or nonfinite positions',()=>{const g=new Game();g.p=settings({waterSpeed:0.015,hazards:false,goal:16});g.seed=123;g.round=1;g.startRound({intro:false});let highest=0;for(let i=0;i<120*150&&!g.cpu.won&&!g.cpu.lost;i++){g.updateCPU(RULES.step);highest=Math.max(highest,g.cpu.height());}assert.ok(highest>5,`CPU reached only ${highest} before surge removals`);assert.ok(Number.isFinite(g.cpu.egg.y));assert.ok(g.cpu.won,'CPU must cross the stair obstruction and reach the rescue balloon');console.log('CPU:',g.cpu.height(),'cells,',g.cpu.lines,'floors, rescued:',g.cpu.won);});
test('settings reject invalid board and timings',()=>{assert.throws(()=>settings({columns:3}));assert.throws(()=>settings({crateInterval:0}));assert.throws(()=>settings({goal:4.5}));});
test('Eggo Mania settings expose only Survival and migrate old preview modes',()=>{
 assert.equal(settings({mode:'race'}).mode,'survival');
 assert.equal(settings({mode:'solo'}).mode,'survival');
 assert.equal(DEFAULTS.mode,'survival');
 assert.equal(DEFAULTS.difficulty,'hard');
 assert.equal(Game.getSettingsSchema().some(field=>field.key==='mode'),false);
});

test('movement reproduces measured GBA frame displacements',()=>{
    const t=make({waterSpeed:0});
    const originalX=t.egg.x;
    for(let i=0;i<8;i++)t.update(1/60,{move:1});
    assert.equal((t.egg.x-originalX)*16,16);
    const samples=new Map([[8,697.644],[16,680.844],[22,676.644],[24,676.844]]);
    const jump=make({waterSpeed:0});
    for(let frame=1;frame<=24;frame++){
        // Original reference input is sampled one frame after the host key event.
        jump.update(1/60,{jump:frame===2,float:frame<=9});
        if(samples.has(frame))assert.ok(Math.abs(720.044-jump.egg.y*16-samples.get(frame))<0.02,`GBA jump frame ${frame}`);
    }
    const fast=make({waterSpeed:0});
    for(let frame=1;frame<=16;frame++)fast.update(1/60,{jump:frame===2,float:frame<=9,fast:frame>=10});
    assert.ok(Math.abs(720.044-fast.egg.y*16-685.043)<0.02);
});

test('Survival player consumes only the initial movement sample, then applies live input immediately',()=>{
    const game=new Game();game.p=settings({...DEFAULTS,hazards:false});game.seed=42;game.resetSurvival();game.startRound({intro:false});game.cpu=null;
    const updatePlayer=game.player.update.bind(game.player);let nativeMotionUsed=false;
    game.player.update=(dt,control,...rest)=>{nativeMotionUsed=Boolean(control.nativeMotion);return updatePlayer(dt,control,...rest);};
    let held=new Set(),rotatePressed=false;game.input={isActionJustDown:action=>action==='rotate'&&rotatePressed,isActionDown:action=>held.has(action),getFirstGamepadAxis:()=>0};
    const x=game.player.egg.x;held=new Set(['right','jump']);game.update(RULES.step);
    assert.equal(nativeMotionUsed,true,'the live Survival player uses the native-coordinate path');
    assert.equal(game.player.egg.x,x,'round startup consumes its first movement sample');
    assert.equal(game.player.jumpSerial,0,'round startup consumes its first jump sample');
    game.update(RULES.step);
    assert.ok(Math.abs(game.player.egg.x-x-RULES.speed*RULES.step)<1e-12,'held movement applies on this actor tick');
    assert.equal(game.player.jumpSerial,1,'held jump applies on this actor tick');
    held.clear();const stoppedX=game.player.egg.x;game.update(RULES.step);
    assert.equal(game.player.egg.x,stoppedX,'movement stops on the release frame');
    held=new Set(['right']);game.update(RULES.step);
    assert.ok(Math.abs(game.player.egg.x-stoppedX-RULES.speed*RULES.step)<1e-12,'a later press moves on its first frame');
    game.player.held={nativeKind:6,nativeVariant:0,cells:[[0,1],[1,0],[1,1],[2,0]]};
    rotatePressed=true;game.update(RULES.step);
    assert.equal(game.player.held.nativeVariant,1,'GBA B rotates on its pressed frame');
});

test('player walk animation follows the ROM, completes its last step, and restarts after idling',()=>{
    const game=new Game();game.p=settings({...DEFAULTS,hazards:false});game.seed=42;game.resetSurvival();game.startRound({intro:false});game.cpu=null;
    const t=game.player;t.rows=[];t.crates=[];t.spawn=Infinity;
    t.egg.x=(49.9410400390625+16)/16;t.egg.y=(720-720.0440673828125)/16;t.egg.ground=true;
    t.held={nativeKind:6,nativeVariant:0,cells:NATIVE_ITEMS[6].cells};
    let held=new Set();game.input={isActionJustDown:()=>false,isActionDown:action=>held.has(action),getFirstGamepadAxis:()=>0};
    const step=move=>{held=new Set(move>0?['right']:move<0?['left']:[]);game.update(RULES.step);return actorPose(t);};
    assert.equal(step(1).state,'idle','the first round sample is consumed while the player is initialized');
    for(let frame=2;frame<=5;frame++){const pose=step(1);assert.equal(pose.state,'walk');assert.equal(pose.frame,0,`frame ${frame}`);}
    for(let frame=6;frame<=9;frame++){const pose=step(1);assert.equal(pose.state,'walk');assert.equal(pose.frame,1,`frame ${frame}`);}
    for(let frame=10;frame<=12;frame++){const pose=step(1);assert.equal(pose.state,'walk');assert.equal(pose.frame,2,`frame ${frame}`);}
    const release=step(0);assert.equal(release.state,'walk');assert.equal(release.frame,2,'native drawing holds the last walk pose for one frame');
    for(let frame=14;frame<=17;frame++){const pose=step(0);assert.equal(pose.state,'walk');assert.equal(pose.frame,3,`ROM walk-stop tail, frame ${frame}`);}
    for(const [first,last,poseIndex] of [[18,21,4],[22,25,5],[26,29,6]])
        for(let frame=first;frame<=last;frame++){
            const pose=step(0);assert.equal(pose.state,'walk');assert.equal(pose.frame,poseIndex,`ROM walk-stop tail, frame ${frame}`);
        }
    assert.equal(step(0).state,'idle','idle starts after all remaining native walk poses have completed');
    for(let frame=31;frame<=44;frame++)step(0);
    assert.equal(step(-1).state,'idle','a later movement sample moves before its new walk pose is drawn');
    for(let frame=46;frame<=49;frame++){const pose=step(-1);assert.equal(pose.state,'walk');assert.equal(pose.frame,0,`frame ${frame}`);}
    for(let frame=50;frame<=53;frame++){const pose=step(-1);assert.equal(pose.state,'walk');assert.equal(pose.frame,1,`frame ${frame}`);}
});

test('jumping off reaches the water and reproduces the measured automatic recovery',()=>{
    const t=make({waterSpeed:0});
    const samples=new Map([[8,731.244],[20,779.129],[40,763.396],[60,764.054],
        [62,753.240],[64,742.599],[90,633.392]]);
    for(let frame=1;frame<=240;frame++){
        t.update(RULES.step,{dive:frame<=2});
        if(samples.has(frame))assert.ok(Math.abs(720.044-t.egg.y*16-samples.get(frame))<0.025,
            `GBA dive/recovery frame ${frame}`);
        assert.equal(t.lost,false,'the reference water visit is recoverable');
    }
    assert.equal(t.egg.y,0);
    assert.equal(t.egg.ground,true);
});

test('reference-observed small pieces exist, and the reference seven-floor tower does not collapse prematurely',()=>{
    const signature=cells=>cells.map(p=>p.join(',')).sort().join(';');
    const available=new Set();
    for(const shape of SHAPES){let cells=shape;for(let i=0;i<4;i++){available.add(signature(cells));cells=rotate(cells);}}
    for(const shape of gba.observed_shapes)assert.ok(available.has(signature(shape)),`Missing GBA shape ${signature(shape)}`);
    assert.deepEqual(gba.writes,[],'fixture must come from input-only original play');
    const t=make();t.spawn=100;
    gba.rows_bottom_up.forEach((cells,y)=>{t.row(y).cells=[...cells];});
    t.egg.y=t.height();
    const before=t.rows.map(row=>[...row.cells]);
    for(let i=0;i<20/RULES.step;i++)t.update(RULES.step);
    assert.deepEqual(t.rows.map(row=>row.cells),before);
    assert.equal(t.water,-2,'unrequested water drift must not erase the stable reference tower');
});

test('independent pieces keep separate identities and damage clears panel ownership',()=>{
    const t=make();t.spawn=100;
    for(const x of [1.5,2.5]){
        t.egg.x=x;t.egg.y=0;t.held={cells:[[0,0]],color:1,material:2};
        assert.ok(t.use());
        for(let i=0;i<Math.ceil(RULES.throwTime/RULES.step)+1;i++)t.update(RULES.step);
    }
    const row=t.rows[0];
    assert.notEqual(row.owners[1],row.owners[2],'touching same-color pieces must retain their boundary');
    assert.equal(row.materials[1],2);
    t.explode(1.5,0);
    assert.equal(row.owners[1],0);
    assert.equal(row.materials[1],0);
});

test('foreground and parallax match independently observed GBA jumps and throws',()=>{
    for(const profile of cameraGba.profiles){
        assert.deepEqual(profile.writes,[]);
        const state=createView(),samples=new Map(profile.samples.map(s=>[s.frame,s]));
        for(let i=0;i<profile.heights.length;i++){
            const frame=i+1;
            const placing=profile.name==='throw'&&frame>=2&&frame<=28?
                {eggY:0,targetY:2,time:RULES.throwTime-(frame-1)/60}:null;
            advanceView(state,{egg:{y:profile.heights[i],ground:frame===1},placing},1/60);
            const sample=samples.get(frame);if(!sample)continue;
            if(sample.foreground_pixels!==null)assert.ok(Math.abs(state.camera*16-sample.foreground_pixels)<=2,
                `${profile.name} foreground frame ${frame}: ${state.camera*16} vs ${sample.foreground_pixels}`);
            assert.ok(Math.abs(backgroundOffset(state,'factory')-sample.background_offset)<=2,
                `${profile.name} background frame ${frame}`);
        }
    }
});

test('player BG1 ring retains the camera tracker from before the actor update',()=>{
    const state=createView(),previousCameraY=state.nativeCameraY;
    advanceView(state,{p:{mode:'survival'},egg:{y:4,ground:false},incompleteFloors:0},RULES.step);
    assert.equal(state.nativeBoardCameraY,previousCameraY);
    assert.notEqual(state.nativeCameraY,previousCameraY,
        'the BG1 ring should keep the register value written before this camera update');
});

test('native actor poses distinguish empty hands and a throw uses its own progress',()=>{
    const t=make();t.spawn=100;
    assert.equal(actorPose(t).state,'idle-free');
    t.held={cells:[[0,0]],color:1};
    assert.equal(actorPose(t).state,'idle');
    t.time=63*RULES.step;assert.deepEqual(actorPose(t),{state:'idle',row:0,frame:0});
    t.time=64*RULES.step;assert.deepEqual(actorPose(t),{state:'idle',row:0,frame:1});
    t.time=128*RULES.step;assert.deepEqual(actorPose(t),{state:'idle',row:0,frame:0});
    t.update(RULES.step,{move:1});
    assert.equal(actorPose(t).state,'walk');
    t.use();t.placing.time=RULES.throwTime-27*RULES.step;
    assert.deepEqual(actorPose(t),{state:'throw',row:5,frame:6});
    t.placing=null;t.egg.ground=false;t.egg.vy=1;t.egg.floating=true;
    assert.equal(actorPose(t).state,'float-free');
});

test('all reference-observed pieces have native icons in each playable orientation',()=>{
    for(const shape of gba.observed_shapes){
        let cells=shape;
        for(let r=0;r<4;r++){
            assert.notEqual(itemIcon({cells}),null,`Missing original icon: ${JSON.stringify(cells)}`);
            cells=rotate(cells);
        }
    }
    assert.ok(Math.abs(make().egg.x*16-63.9375)<1,'starting actor anchor matches the native screen');
});

test('an active surge reproduces the original six row removals and preserves the final roof',()=>{
    assert.deepEqual(surgeGba.writes,[]);
    assert.deepEqual(surgeGba.steps,[[600,'']],'reference continues without placing more pieces');
    const t=make();t.spawn=100;t.egg.y=7;t.collapse.active=true;
    surgeGba.initial_rows_bottom_up.forEach((cells,y)=>{if(cells.some(Boolean))t.row(y).cells=[...cells];});
    const samples=new Map(surgeGba.events.map(e=>[e.frame,e.rows_bottom_up]));
    let expected=surgeGba.initial_rows_bottom_up;
    for(let frame=1;frame<=surgeGba.stable_final_through_frame;frame++){
        t.update(RULES.step);
        if(samples.has(frame))expected=samples.get(frame);
        const actual=Array.from({length:expected.length},(_,y)=>t.rows[y]?.cells||Array(7).fill(0));
        assert.deepEqual(actual,expected,`Original surge board at frame ${frame}`);
    }
    assert.equal(t.height(),1);assert.equal(t.collapse.active,false);
});

test('six-gap filling matches native positions and order without invented completion blocks',()=>{
    assert.deepEqual(fillerGba.writes,[]);
    const t=make();t.spawn=100;t.nextOwner=4;
    fillerGba.before_rows_bottom_up.forEach((cells,y)=>{
        const row=t.row(y);row.cells=[...cells];row.owners.set(cells);
    });
    Object.assign(t.egg,{x:3.5,y:2});t.held={item:'filler'};
    assert.ok(t.use());
    assert.deepEqual(t.rows.map(row=>Array.from(row.owners)),fillerGba.after_rows_bottom_up);
    assert.equal(t.rows.reduce((n,row)=>n+row.cells.filter(Boolean).length,0),10);
    assert.equal(t.lines,fillerGba.completed_rows_after);
    assert.equal(t.rows[0].sealed,true);
});

test('default falling pieces use the eight families independently observed in native Hard',()=>{
    const norm=c=>c.map(p=>p.join(',')).sort().join(';'),observed=new Set();
    for(const shape of gba.observed_shapes){let c=shape;for(let r=0;r<4;r++){observed.add(norm(c));c=rotate(c);}}
    const t=make({crateInterval:RULES.step});t.spawn=0;
    for(let i=0;i<180;i++){
        t.update(RULES.step);
        for(const c of t.crates)assert.ok(observed.has(norm(c.cells)),`Unreferenced falling piece ${norm(c.cells)}`);
    }
});

test('free pickup motion matches 147 original frames and held pictures remain upright',()=>{
    for(const source of pickupGba.sources)assert.deepEqual(source.writes,[]);
    const t=make();t.spawn=100;
    const crate={x:pickupGba.samples[0].center_x_pixels/16,
        y:(112-pickupGba.initial_center_y_pixels)/16,item:'filler',color:11,
        age:0,swayPhase:pickupGba.initial_phase_radians};
    t.crates=[crate];
    let frame=pickupGba.first_frame;
    for(const s of pickupGba.samples){
        // Surface disappearance is a separate uncalibrated rule. Validate free
        // flight above the current model's water cutoff, and sway for all frames.
        if(s.center_y_pixels<128){
            while(frame<s.frame){t.update(RULES.step);frame++;}
            assert.ok(t.crates.includes(crate),'Reference free pickup should not be caught');
            assert.equal(crate.x*16,s.center_x_pixels);
            assert.ok(Math.abs(Math.floor(112-crate.y*16)-s.center_y_pixels)<=1,`Pickup Y at ${frame}`);
        }
        const pose={...crate,age:(s.frame-pickupGba.first_frame)/60};
        assert.ok(Math.abs(pickupAngle(pose)-s.angle_radians)<.015,`Pickup angle at ${s.frame}`);
        assert.equal(pickupAngle(crate,true),0);
        assert.equal(pickupAngle({cells:SHAPES[10],age:0.25}),0,'native building icons stay upright');
    }
});

test('boots reproduce original jump, neutral/fast gravity and horizontal speed',()=>{
    for(const profile of bootsGba.profiles){
        assert.deepEqual(profile.writes,[]);
        const t=make();t.spawn=100;t.egg.boost=10;
        if(profile.kind==='walk'){
            t.egg.x=(profile.samples[0].world_x-2.25)/16;t.egg.y=10;t.egg.ground=false;
            for(const s of profile.samples){t.update(RULES.step,{move:1});assert.ok(Math.abs(t.egg.x*16-s.world_x)<.001);}
        }else{
            const initial=profile.samples[0].world_y,samples=new Map(profile.samples.map(s=>[s.frame,s]));
            for(let frame=1;frame<=24;frame++){
                t.update(RULES.step,{jump:frame===2,float:frame<=9,fast:profile.kind==='fast'&&frame>=10});
                if(samples.has(frame))assert.ok(Math.abs(initial-t.egg.y*16-samples.get(frame).world_y)<.03,`${profile.kind} boots jump at ${frame}`);
            }
        }
    }
});

test('boots activate on contact without a use key and last the native 600 frames',()=>{
    assert.deepEqual(bootsGba.automatic_catch.writes,[]);
    assert.ok(bootsGba.automatic_catch.steps.every(([,keys])=>!keys.split('+').includes('A')));
    const t=make();t.spawn=100;t.crates=[{x:t.egg.x,y:1,item:'boots'}];
    t.update(RULES.step);
    assert.equal(t.held,null);assert.equal(t.crates.length,0);
    assert.equal(t.egg.boost*60,bootsGba.automatic_catch.duration_frames);
    for(let frame=0;frame<600;frame++)t.update(RULES.step);
    assert.ok(t.egg.boost<1e-8);assert.equal(bootsGba.expiry.observed_remaining_frames,0);
});

test('all later Survival backgrounds match settled native stage captures',()=>{
    for(const stage of stageBackgroundGba.stages){
        assert.deepEqual(stage.writes,[]);
        assert.equal(stage.samples.length,6);
        for(const sample of stage.samples){
            assert.equal(backgroundOffset(createView(),stage.stage),sample.offset_pixels);
            assert.ok(sample.match_error<sample.next_match_error,'Measured offset must be distinguishable');
        }
    }
});

test('animated BG3 rows start from the native Survival counter, not an atlas capture offset',()=>{
    const entry=bg3PhaseGba.entry_samples;
    const row=bg3PhaseGba.factory_stream_row;
    assert.deepEqual(entry.slice(0,3).map(s=>s.counter),[1,1,2]);
    assert.equal(bg3StreamFrameIndex(row.counter,row.rate,row.period),row.native_frame_index);
    const allStreamRows=Object.values(BG3_STREAMS).flatMap(stage=>Object.values(stage)).flatMap(field=>field.rows);
    assert.equal(allStreamRows.length,128);
    assert.ok(allStreamRows.every(stream=>stream.rate>=2&&bg3StreamFrameIndex(1,stream.rate,stream.period)===0),
        'all native stage streams begin at atlas frame zero for counter 1');
    assert.equal(bg3PhaseGba.round_transition.samples[0].counter,1,'the native counter resets when the next round is initialized');
    const game=new Game();game.p=settings({...DEFAULTS,mode:'survival',seed:42,hazards:false});game.seed=42;game.resetSurvival();
    assert.equal(game.bg3GlobalFrame,0);
    assert.equal(bg3StreamFrameIndex(game.bg3GlobalFrame,row.rate,row.period),0,'initial render shares native counter 1 frame');
    game.input={isActionJustDown:()=>false};
    game.update(RULES.step);assert.equal(game.bg3GlobalFrame,1);
    game.update(RULES.step);assert.equal(game.bg3GlobalFrame,2);
    assert.equal(bg3StreamFrameIndex(game.bg3GlobalFrame,row.rate,row.period),1,'second intro tick advances the native rate-2 stream');
    game.bg3GlobalFrame=bg3PhaseGba.round_transition.samples.at(-1).counter;
    game.round++;
    game.startRound();
    assert.equal(game.bg3GlobalFrame,0,'each Survival round restarts the native BG3 counter');
});

test('complete airborne trajectories reproduce native downward speed caps',()=>{
    for(const profile of fallGba.profiles){
        assert.deepEqual(profile.writes,[]);
        const t=make({goal:100});t.spawn=100;
        if(profile.boosted)t.egg.boost=10;
        if(profile.initial_velocity_pixels){t.egg.y=50;t.egg.ground=false;t.egg.vy=-profile.initial_velocity_pixels*60/16;}
        const initialY=t.egg.y,worldStart=profile.samples[0].world_y-(profile.initial_velocity_pixels||0);
        for(const sample of profile.samples){
            const frame=sample.frame;
            t.update(RULES.step,{jump:frame===profile.jump_frame,
                float:frame<=profile.float_through_frame,
                fast:profile.fast&&frame>=(profile.fast_from_frame||profile.float_through_frame+1)});
            assert.ok(Math.abs(worldStart-(t.egg.y-initialY)*16-sample.world_y)<.03,`${profile.name} Y at frame ${frame}`);
        }
    }
});
