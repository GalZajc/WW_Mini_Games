import test from 'node:test';
import assert from 'node:assert/strict';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
import {HumanMatch,matchFinished,packControl,unpackControl} from '../renderer/games/eggo-mania/human-match.js';
test('eight full rounds, ninth only for a 4:4 tie',()=>{
 assert.equal(matchFinished(7,[7,0]),false);assert.equal(matchFinished(8,[5,3]),true);
 assert.equal(matchFinished(8,[4,4]),false);assert.equal(matchFinished(9,[5,4]),true);
});
test('complete tied series advances through all eight rounds and finishes after the ninth',()=>{
 const g=new Game();g.p=settings({seed:1492,character:'eggo',hazards:false});g.seed=1492;
 g.input={isActionDown:()=>false,isActionJustDown:()=>false,getFirstGamepadAxis:()=>0};
 const transport={side:0,onMessage(){},send(){},close(){}};
 const m=new HumanMatch(g,transport,g.input,()=>{});m.start(1492,['eggo','astro']);
 for(let round=1;round<=9;round++){
  assert.equal(g.round,round);const leftWins=round%2===1;
  g.player.won=leftWins;g.player.lost=!leftWins;g.cpu.won=!leftWins;g.cpu.lost=leftWins;g.finish();
  for(let tick=0;tick<400&&g.round===round&&!m.done;tick++){
   m.receive({type:'input',start:m.frame,values:Array(18).fill(0)});m.update(RULES.step);
  }
  if(round<9)assert.equal(m.done,undefined);
  if(round===8){assert.equal(g.round,9);assert.deepEqual(m.scores,[4,4]);}
 }
 assert.equal(m.done,true);assert.deepEqual(m.scores,[5,4]);assert.equal(g.round,9);
});
test('independent human inputs produce identical games over queued reliable batches',()=>{
 const transports=[0,1].map(side=>({side,listeners:[],onMessage(fn){this.listeners.push(fn);},send(data){for(const fn of transports[1-side].listeners)fn(structuredClone(data));},close(){}}));
 const states=[{mask:0,previous:0},{mask:0,previous:0}];
 const bit={left:1,right:2,jump:4,fast:8,dive:16,discard:32,place:64,rotate:128,rotateBack:256};
 const games=states.map(s=>{const g=new Game();g.p=settings({seed:1492,character:'eggo'});g.seed=1492;g.input={isActionDown:a=>!!(s.mask&(bit[a]??0)),isActionJustDown:a=>!!((s.mask&~s.previous)&(bit[a]??0)),getFirstGamepadAxis:()=>0};return g;});
 const matches=games.map((g,i)=>new HumanMatch(g,transports[i],g.input,()=>{}));
 for(const m of matches)m.start(1492,['eggo','astro']);
 assert.equal(games[0].cpu.nativeRivalCharacter,'astro');
 for(let tick=0;tick<2400;tick++){
  for(let side=0;side<2;side++){
   const s=states[side];s.previous=s.mask;s.mask=(Math.floor((tick+side*23)/55)%2?1:2)|((tick%90)<42?4:0)|((tick+side)%101===0?64:0)|(tick%71===0?128:0);
   matches[side].update(RULES.step);
  }
 }
 matches.forEach(m=>m.flush());for(let i=0;i<4;i++)matches.forEach(m=>m.update(0));
 assert.equal(matches[0].frame,matches[1].frame);
 assert.ok(matches[0].frame>=2300);
 assert.equal(matches[0].error,undefined);assert.equal(matches[1].error,undefined);
 for(const key of ['round','nativeActorRandomSeed','bg3GlobalFrame'])assert.equal(games[0][key],games[1][key]);
 for(const field of ['player','cpu']){
  assert.deepEqual(games[0][field].rows,games[1][field].rows);
  assert.deepEqual(games[0][field].egg,games[1][field].egg);
 }
 for(let mask=0;mask<512;mask++){if((mask&3)===3||(mask&384)===384)continue;assert.equal(packControl(unpackControl(mask)),mask);}
});
