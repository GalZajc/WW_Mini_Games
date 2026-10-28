// Actual production game's audio integration, without DOM, speaker or emulator.
import Game from '../renderer/games/eggo-mania/game.js';
import {settings} from '../renderer/games/eggo-mania/model.js';
import {NativeAudioCommands} from '../renderer/games/eggo-mania/native-audio-player.js';
import {NativeMusic} from '../renderer/games/eggo-mania/audio.js';
import {readFile,writeFile,mkdir,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const arg=(k,d)=>process.argv.find(v=>v.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const P={seed:1492,character:'yolko',startAfter:400,end:Number(arg('end',109076)),
 tape:'scripts/OUTPUT/eggo-user-replay_2026-10-19_21-01-20_213557/steps.json',
 settingsSource:'scripts/OUTPUT/eggo-render-profile_2026-10-26T10-15-14-220Z/parameters.json'};
const out=path.resolve('scripts/OUTPUT','eggo-live-audio-commands_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
P.settings=JSON.parse(await readFile(P.settingsSource,'utf8')).gameSettings;P.hashes={};
for(const n of ['game.js','audio.js','native-audio-player.js','native-sound-events.js'])P.hashes[n]=createHash('sha256').update(await readFile('renderer/games/eggo-mania/'+n)).digest('hex');
await writeFile(path.join(out,'parameters.json'),JSON.stringify(P,null,2));
const records=[];let frame=P.startAfter,control={},previous=new Set();
const audio={},g=new Game();g.audio=audio;g.nativeSound=new NativeAudioCommands(message=>records.push({frame,...message}));audio._eggoNative=g.nativeSound;
g.music=new NativeMusic(audio);g.p=settings(P.settings);g.seed=P.seed;g.submitScore=()=>{};
g.input={isActionJustDown:a=>(a==='continue'||a==='place')&&!!control.use};g.readPlayerControl=()=>control;g.resetSurvival();
const file=await open(path.join(out,'commands.jsonl'),'w');let count=0;
try{
 outer:for(const [n,keys]of JSON.parse(await readFile(P.tape,'utf8')))for(let i=0;i<n;i++){
  if(++frame>P.end)break outer;
  const h=new Set(keys?keys.split('+'):[]);control={move:Number(h.has('RIGHT'))-Number(h.has('LEFT')),jump:h.has('UP'),float:h.has('UP'),fast:h.has('DOWN'),dive:h.has('L'),discard:h.has('R')&&!previous.has('R'),use:h.has('A')&&!previous.has('A'),rotate:h.has('B')&&!previous.has('B')?1:0};previous=h;
  g.update(1/60);
  if(records.length>=1000){count+=records.length;await file.write(records.splice(0).map(x=>JSON.stringify(x)).join('\n')+'\n');}
  if(frame%10000===0)console.log(`${frame}/${P.end}`);
 }
 count+=records.length;await file.write(records.map(x=>JSON.stringify(x)).join('\n')+'\n');
}finally{await file.close();}
console.log(JSON.stringify({out,records:count,round:g.round,phase:g.phase}));
