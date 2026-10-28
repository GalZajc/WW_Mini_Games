import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AudioManager} from '../renderer/core/AudioManager.js';
import {NativeMusic,playNativeEffect} from '../renderer/games/eggo-mania/audio.js';
import {NATIVE_MUSIC} from '../renderer/games/eggo-mania/assets/native-music.js';
import {NATIVE_RESULT_AUDIO} from '../renderer/games/eggo-mania/assets/native-result-audio.js';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings,RULES} from '../renderer/games/eggo-mania/model.js';
import {PODIUM_VIEW} from '../renderer/games/eggo-mania/result-view.js';

test('tempo uses the placement roof retained for the current native pass, including a one-frame peak',()=>{
 // Native frame73842: config height33, roof19 at the tempo scan; the later
 // loose-piece pass leaves roof20. Native tempo changes0 -> -1 that frame.
 const g=new Game(),changes=[];g.p={mode:'survival'};g.player={};
 g.cpu={height:()=>RULES.nativeBoardRows-20,p:{nativeConfig:{height:33}},nativeFrame:100,
  nativeCommittedAnchorRow:{frame:100,row:19}};
 g.audio={_nativeTempoRequest:value=>changes.push(value)};
 g.advanceNativeAudioProgress();assert.deepEqual(changes,[-1]);
 g.cpu.nativeFrame++;g.advanceNativeAudioProgress();assert.deepEqual(changes,[-1],'tempo does not undo its previous minimum');
 g.nativeAudioProgress={tempo:0,leadWarned:false};g.advanceNativeAudioProgress();
 assert.equal(g.nativeAudioProgress.tempo,0,'a stale placement roof does not affect a later frame');
});

test('an arena can decode during countdown without playing; cached music starts in the requested game tick',async()=>{
 const buffers=new Map(),plays=[];
 const audio={_soundBuffers:buffers,loadSound:async id=>{buffers.set(id,{});},playLoop:id=>{plays.push(id);return {stop(){},position:()=>0};}};
 const music=new NativeMusic(audio);
 await music.preload('dragon');assert.deepEqual(plays,[]);
 const pending=music.start('dragon');assert.deepEqual(plays,['eggo-mania-music-dragon']);
 await pending;music.stop();
});

test('native SFX dispatch advances on game ticks, independent of presentation refresh',()=>{
 for(const refresh of [30,60,144]){
  const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1492;g.round=1;g.startRound({intro:false});
  g.input={isActionJustDown:()=>false};g.readPlayerControl=()=>({});
  g.phase='won';g.resultTicks=PODIUM_VIEW.musicTick+1;g.resultExitTicks=null;
  g.audio={loadSound:()=>new Promise(()=>{})};
  assert.equal(playNativeEffect(g.audio,34),true);
  assert.equal(playNativeEffect(g.audio,29),true);
  for(let i=0;i<refresh/30;i++)g.update(1/refresh);
  assert.equal(playNativeEffect(g.audio,1),false,'voice still occupied after two native ticks');
  while(g.resultTicks<PODIUM_VIEW.musicTick+5)g.update(1/refresh);
  assert.equal(playNativeEffect(g.audio,1),true,'voice available after four native ticks');
 }
});

test('result audio preserves every source PCM sample and the winning loop repeats all native sequencer tracks',()=>{
 const f=JSON.parse(readFileSync(new URL('./fixtures/eggo-result-audio-gba.json',import.meta.url),'utf8'));
 for(const m of f.measurements){
  const asset=NATIVE_RESULT_AUDIO[m.name];
  const wav=readFileSync(new URL('../renderer/games/eggo-mania/assets/'+asset.file,import.meta.url));
  const source=readFileSync(new URL('../'+m.source+'.wav',import.meta.url));
  assert.deepEqual(wav.subarray(44),source.subarray(44+m.start_sample*4,44+m.end_sample*4));
  assert.equal(createHash('sha256').update(wav.subarray(44)).digest('hex'),asset.pcm_sha256);
  assert.equal(wav.readUInt32LE(24),asset.sample_rate);
 }
 const win=f.measurements.find(m=>m.name==='result-win');
 const trace=JSON.parse(readFileSync(new URL('../'+win.source+'.trace.json',import.meta.url),'utf8'));
 const period=NATIVE_RESULT_AUDIO['result-win'].period_frames;
 assert.equal(period,768);assert.equal(NATIVE_RESULT_AUDIO['result-win'].verified_frames,period);
 // The first repeated whole native state is index 593, independently of PCM seam selection.
 for(let i=593;i<593+period;i++)assert.deepEqual(trace[i].music_tracks,trace[i+period].music_tracks);
 assert.equal(NATIVE_RESULT_AUDIO['result-intro'].loop,false);assert.equal(NATIVE_RESULT_AUDIO['result-loss'].loop,false);
});

test('Survival selects native intro then the proper podium audio once, without prototype result tones',()=>{
 for(const won of [true,false]){
  const g=new Game();g.p=settings({hazards:false,waterSpeed:0});g.seed=1;g.round=1;g.startRound({intro:false});
  g.readPlayerControl=()=>({});
  const calls=[];g.music={start:name=>calls.push(name)};g.audio={playSuccess(){assert.fail('prototype result chime');},playBeep(){assert.fail('prototype result beep');}};
  g.player.won=won;g.player.lost=!won;g.submitScore=()=>{};g.finish();
  assert.deepEqual(calls,['result-intro']);
  for(let i=1;i<PODIUM_VIEW.musicTick+10;i++)g.updateResult(RULES.step);
  assert.deepEqual(calls,['result-intro',won?'result-win':'result-loss']);
 }
});

test('audio handles finite endings and an initial phrase before the repeating region',()=>{
 const sources=[],audio=new AudioManager();
 audio._ctx={state:'running',currentTime:0,destination:{},createBufferSource(){
  const s={stops:0,disconnects:0,connect(){},start(t,o){this.offset=o;},stop(){this.stops++;},disconnect(){this.disconnects++;}};sources.push(s);return s;
 },createGain(){return {gain:{value:0},connect(){},disconnect(){}};}};
 audio._soundBuffers.set('finite',{duration:20});
 const finite=audio.playLoop('finite',{loop:false});audio._ctx.currentTime=25;
 assert.equal(finite.position(),20);sources[0].onended();finite.stop();assert.equal(sources[0].stops,0);assert.equal(sources[0].disconnects,1);
 assert.equal(audio.playLoop('finite',{loop:false,offset:20}),null,'resuming an ended phrase cannot replay it');
 audio._ctx.currentTime=0;const loop=audio.playLoop('finite',{loopStart:6});
 assert.equal(sources.at(-1).offset,0);assert.equal(sources.at(-1).loopStart,6);
 audio._ctx.currentTime=25;assert.equal(loop.position(),11);loop.stop();
 const resumed=audio.playLoop('finite',{loopStart:6,offset:11});audio._ctx.currentTime=35;assert.equal(resumed.position(),7);
});

test('all eight arena loops retain measured native PCM and complete sequencer periods',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/eggo-music-gba.json',import.meta.url),'utf8'));
 assert.equal(fixture.tracks.length,8);
 for(const track of fixture.tracks){
  const asset=NATIVE_MUSIC[track.arena];assert.equal(asset.period_frames,track.verified_frames);
  const wav=readFileSync(new URL('../renderer/games/eggo-mania/assets/'+asset.file,import.meta.url));
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
  assert.equal(wav.readUInt16LE(22),2);assert.equal(wav.readUInt32LE(24),asset.sample_rate);
  assert.equal(wav.length-44,asset.sample_frames*4);
  assert.equal(createHash('sha256').update(wav.subarray(44)).digest('hex'),asset.pcm_sha256);
  assert.equal(asset.sample_frames,Math.round(asset.period_frames*fixture.parameters.native_frame_cycles*asset.sample_rate/fixture.parameters.native_cpu_hz));
 }
});

test('music handles pending decode, pause/resume, arena changes and exit without stale playback',async()=>{
 const loads=[],plays=[];
 const audio={loadSound(id){return new Promise(resolve=>loads.push({id,resolve}));},playLoop(id,options){
  const handle={position:()=>12.25,stops:0,stop(){this.stops++;}};plays.push({id,options,handle});return handle;
 }};
 const music=new NativeMusic(audio);
 const first=music.start('factory');music.pause();loads[0].resolve();await first;
 assert.equal(plays.length,0,'loading during pause must stay silent');
 music.resume();assert.equal(plays.length,1);music.pause();assert.equal(plays[0].handle.stops,1);
 music.resume();assert.equal(plays[1].options.offset,12.25);
 const second=music.start('castle');assert.equal(plays[1].handle.stops,1);
 const third=music.start('park');loads[1].resolve();await second;
 assert.equal(plays.length,2,'previous arena decode must not start a second source');
 loads[2].resolve();await third;assert.equal(plays.at(-1).id,'eggo-mania-music-park');
 music.stop();assert.equal(plays.at(-1).handle.stops,1);
 const fourth=music.start('dragon');music.stop();loads[3].resolve();await fourth;
 assert.equal(plays.length,3,'leaving during decode must stay silent');
});

test('shared audio loop handle wraps playback position and stops/disconnects once',()=>{
 const sources=[],gains=[];const audio=new AudioManager();
 audio._channels={music:{},effects:{}};
 audio._ctx={state:'running',currentTime:10,destination:{},createBufferSource(){
  const source={stops:0,disconnects:0,connect(){},start(time,offset){this.startTime=time;this.offset=offset;},stop(){this.stops++;},disconnect(){this.disconnects++;}};
  sources.push(source);return source;
 },createGain(){const gain={gain:{value:0},disconnects:0,connect(){},disconnect(){this.disconnects++;}};gains.push(gain);return gain;}};
 audio._soundBuffers.set('song',{duration:20});
 const handle=audio.playLoop('song',{offset:18,volume:0.75});
 assert.equal(sources[0].loop,true);assert.equal(gains[0].gain.value,0.75);
 audio._ctx.currentTime=15;assert.equal(handle.position(),3);
 handle.stop();handle.stop();audio._ctx.currentTime=30;
 assert.equal(handle.position(),3);assert.equal(sources[0].stops,1);
 assert.equal(sources[0].disconnects,1);assert.equal(gains[0].disconnects,1);
});
