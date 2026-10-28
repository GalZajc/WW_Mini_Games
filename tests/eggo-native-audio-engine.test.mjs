import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createNativeAudioEngine} from '../renderer/games/eggo-mania/native-audio-engine.js';
import {NativeAudioPlayer,NativeAudioCommands,NATIVE_PLAYBACK} from '../renderer/games/eggo-mania/native-audio-player.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_AUDIO_ENGINE as CLOCK} from '../renderer/games/eggo-mania/native-audio-engine.js';
import {NativeStemQueue} from '../renderer/games/eggo-mania/native-program-stream.js';
import {NativeProgramAudioPlayer,originalAudioRules} from '../renderer/games/eggo-mania/native-program-player.js';
import {nativeHeldButtons} from '../renderer/games/eggo-mania/controls.js';
import {updateCharacterMenu,CHARACTER_SELECT} from '../renderer/games/eggo-mania/character-menu.js';
const load=name=>readFile(new URL('../renderer/games/eggo-mania/assets/native-audio/'+name,import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
test('portable engine reproduces independent original PCM prefix and all sound RAM, with lossless separate volume stems',async()=>{
 const f=JSON.parse(await readFile(new URL('./fixtures/eggo-audio-native-prefix.json',import.meta.url),'utf8'));
 const engine=await createNativeAudioEngine(load,{stems:true}),chunks=[];let musicActive=false;
 engine.prime({reset:true,music:[0],effects:[16],tempo:[],tick:true});
 for(const record of f.commands){
  const out=engine.step(record.commands);chunks.push(Buffer.from(out.full.buffer));
  for(let i=0;i<out.full.length;i++)assert.equal((out.stems[i]+out.stems[out.full.length+i])*32768,out.full[i]);
  if(record.frame<459)assert.ok(out.stems.subarray(0,out.full.length).every(x=>x===0),'READY/countdown effects must not leak into music volume');
  else musicActive||=out.stems.subarray(0,out.full.length).some(x=>x!==0);
 }
 assert.ok(musicActive);assert.equal(hash(Buffer.concat(chunks).subarray(0,f.parameters.pcmSampleFrames*4)),f.pcmSha256);
 assert.equal(hash(engine.vm.iwram.subarray(0x2470,0x3089)),f.finalSoundRamSha256);
});
test('native PSG effect is absent from the music stem and present in the full output',async()=>{
 const engine=await createNativeAudioEngine(load,{stems:true});let audible=false;
 for(let i=0;i<40;i++){
  const out=engine.step(i?{}:{reset:true,music:[0],effects:[34]});
  assert.ok(out.stems.subarray(0,out.full.length).every(x=>x===0));audible||=out.full.some(x=>x!==0);
 }assert.ok(audible);
});
test('round loading selects music0 after its first native loading pass',()=>{
 const sent=[],a=new NativeAudioCommands(x=>sent.push(x));a.begin();a.reset();a.song(0);a.round({ticks:28,frames:[14,14]});a.end(false);
 for(let i=1;i<=28;i++){a.loadingFrame();a.end(i===28);}
 assert.deepEqual(sent[14].commands.music,[0]);assert.equal(sent[27].commands.tick,false);assert.equal(sent[28].commands.tick,true);
});
test('pause retains queued and in-flight PCM, resumes at the exact sample offset, and disconnects on exit',()=>{
 const previous=globalThis.Worker,nodes=[],messages=[];
 globalThis.Worker=class{postMessage(x){messages.push(x);}terminate(){this.terminated=true;}};
 try{
  const ctx={sampleRate:48000,currentTime:10,createBuffer:(_,n,rate)=>({duration:n/rate,getChannelData:()=>new Float32Array(n)}),
   createBufferSource:()=>{const node={connect(x){this.channel=x;},start(...x){this.started=x;},stop(){this.stopped=true;},disconnect(){}};nodes.push(node);return node;}};
  const audio={_ensureCtx:()=>ctx,_channels:{music:{id:'music'},effects:{id:'effects'}}},player=new NativeAudioPlayer(audio);
  player.worker.onmessage({data:{type:'pcm',pcm:new Float32Array(4800*4),computeMs:1}});
  assert.equal(nodes[0].channel,audio._channels.music);assert.equal(nodes[1].channel,audio._channels.effects);
  ctx.currentTime=10.05;player.pause();const offset=10.05-nodes[0].started[0];
  player.worker.onmessage({data:{type:'pcm',pcm:new Float32Array(480*4),computeMs:1}});
  ctx.currentTime=20;player.resume();assert.ok(Math.abs(nodes[2].started[1]-offset)<1e-12);
  assert.equal(player.held.length,0);assert.equal(messages[0].type,'init');assert.equal(messages[0].sampleRate,ctx.sampleRate,'live playback retains the original pitch');player.destroy();assert.equal(audio._eggoNative,undefined);assert.ok(player.worker.terminated);
 }finally{globalThis.Worker=previous;}
});
function clockGame(){
 const messages=[],g=new Game();g.p=settings({hazards:false});g.seed=1492;
 g.input={isActionJustDown:()=>false};g.readPlayerControl=()=>({});g.submitScore=()=>{};
 g.nativeSound=new NativeAudioCommands(message=>messages.push(message));g.audio={_eggoNative:g.nativeSound};g.resetSurvival();
 return {g,messages};
}
test('live sound ticks follow the original hardware frequency at30,60and144Hz display refresh',()=>{
 for(const hz of [30,60,144]){
  const {g,messages}=clockGame();g.phase='won';g.resultTicks=227;g.resultExitTicks=null;messages.length=0;
  for(let i=0;i<10*hz;i++)g.update(1/hz,1/hz);
  assert.equal(messages.filter(x=>x.type==='frame').length,Math.floor(10*CLOCK.nativeFPS+RULES.presentationTickPhase));
 }
});
test('loading uses fixed ticks, retains partial time, and does not consume one tick per144Hz paint',()=>{
 const {g,messages}=clockGame();g.roundLoadTicks=28;g.roundLoadAccumulator=0;
 g.roundLoadingBudget={ticks:28,soundTicks:28,frames:[14,14]};g.nativeSound.round(g.roundLoadingBudget);messages.length=0;
 for(let i=0;i<14;i++)g.update(1/144,1/144);
 const elapsed=14/144*CLOCK.nativeFPS/CLOCK.gameFPS;
 assert.equal(g.roundLoadTicks,28-Math.floor(elapsed/RULES.step+1e-9));
 assert.equal(messages.filter(x=>x.type==='frame').length,Math.floor(elapsed/RULES.step+1e-9));
 assert.ok(g.roundLoadAccumulator>=0&&g.roundLoadAccumulator<RULES.step);
});

test('unequal native packets switch to model-driven audio without losing, repeating or crossing stereo stems',()=>{
 const q=new NativeStemQueue(),packet=(start,n)=>{
  const p=new Float32Array(n*4);for(let i=0;i<n;i++){p[i*2]=start+i;p[i*2+1]=-(start+i);p[n*2+i*2]=100+start+i;p[n*2+i*2+1]=-100-start-i;}return p;
 };
 q.append(packet(0,7));q.skip(5);q.append(packet(7,7));q.skip(8);q.append(packet(14,7));
 const result=q.drain();assert.equal(result.length,8*4);
 for(let i=0;i<8;i++){assert.equal(result[i*2],13+i);assert.equal(result[i*2+1],-13-i);assert.equal(result[16+i*2],113+i);assert.equal(result[16+i*2+1],-113-i);}
 q.skip(2);q.append(packet(21,4));assert.equal(q.debt,0);assert.deepEqual(Array.from(q.drain().subarray(0,4)),[23,-23,24,-24]);
});

test('native input retains held buttons across frames and original fidelity excludes modified rules/multiplayer',()=>{
 const held=new Set(['place','right']),input={isActionDown:a=>held.has(a),getFirstGamepadAxis:()=>0};
 assert.equal(nativeHeldButtons(input),384);assert.equal(nativeHeldButtons(input),384);
 held.add('left');assert.equal(nativeHeldButtons(input),448);held.clear();assert.equal(nativeHeldButtons(input),0);
 held.add('continue');assert.equal(nativeHeldButtons(input),0);assert.equal(nativeHeldButtons(input,{confirm:true}),256);
 assert.ok(originalAudioRules(settings({})));assert.equal(originalAudioRules(settings({columns:8})),false);assert.equal(originalAudioRules(settings({}),true),false);
});

test('restarting discards stale in-flight PCM and non-original controls retain their explicit fallback flag',()=>{
 const previous=globalThis.Worker,messages=[],nodes=[];let nonNative=false;
 globalThis.Worker=class{postMessage(x){messages.push(x);}terminate(){}};
 try{
  const ctx={state:'running',sampleRate:32768,currentTime:1,createBuffer:(_,n,r)=>({duration:n/r,getChannelData:()=>new Float32Array(n)}),createBufferSource:()=>{const n={connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};nodes.push(n);return n;}};
  const audio={_ensureCtx:()=>ctx,_channels:{music:{},effects:{}}},p=new NativeProgramAudioPlayer(audio,{readButtons:()=>384,nonNative:()=>nonNative});
  p.startSession({seed:7,character:6,original:true});assert.ok(p.preparing);p.begin();p.end();
  p.worker.onmessage({data:{type:'pcm',sessionId:1,pcm:new Float32Array(16),computeMs:1}});assert.equal(nodes.length,2);
  p.begin();p.end();p.startSession({seed:8,character:7,original:true});assert.ok(nodes.every(n=>n.stopped));
  p.worker.onmessage({data:{type:'pcm',sessionId:1,pcm:new Float32Array(16),computeMs:1}});assert.equal(nodes.length,2);assert.equal(p.pendingFrames,0);
  p.worker.onmessage({data:{type:'session-ready',sessionId:2,original:true}});assert.equal(p.preparing,false);
  nonNative=true;p.begin();p.end();assert.equal(messages.at(-1).nonNative,true);assert.equal(messages.at(-1).buttons,384);assert.equal(messages.at(-1).sessionId,2);
  p.startSession({seed:7,character:6,original:false});assert.equal(p.preparing,false,'network/model simulation must not wait for an audio worker');p.destroy();
 }finally{globalThis.Worker=previous;}
});

test('new game from the character menu resumes audio left paused by a finished online match',()=>{
 const previous=globalThis.Worker;
 globalThis.Worker=class{postMessage(){}terminate(){}};
 try{
  const ctx={state:'running',sampleRate:32768,currentTime:1},audio={_ensureCtx:()=>ctx,_channels:{music:{},effects:{}}};
  const p=new NativeProgramAudioPlayer(audio,{readButtons:()=>0});p.pause();
  let reset=false;const g={p:{character:'eggo'},settings:{},
   characterMenu:{index:CHARACTER_SELECT.order.indexOf('eggo'),armed:true,direction:0,repeat:0,elapsed:0},
   input:{isActionDown:a=>a==='place',isActionJustDown:a=>a==='place',getFirstGamepadAxis:()=>0},
   music:{resume:()=>p.resume()},resetSurvival(){reset=true;p.startSession({seed:7,character:6,original:true});}};
  updateCharacterMenu(g,1/60);assert.ok(reset);assert.equal(p.paused,false);p.destroy();
 }finally{globalThis.Worker=previous;}
});
