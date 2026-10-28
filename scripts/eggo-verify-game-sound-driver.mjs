import {NativeSoundVM} from '../renderer/games/eggo-mania/native-sound-vm.js';
import {PODIUM_VIEW} from '../renderer/games/eggo-mania/result-view.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const oracle=process.argv.find(x=>x.startsWith('--oracle='))?.slice(9);
if(!oracle)throw Error('Missing --oracle=');
const p=JSON.parse(await readFile(path.join(oracle,'parameters.json'),'utf8'));
const app=process.argv.find(x=>x.startsWith('--app='))?.slice(6);
const asset=process.argv.find(x=>x.startsWith('--asset='))?.slice(8);
let rom,allowed;
if(asset){
 const manifest=JSON.parse(await readFile(path.join(asset,'manifest.json'),'utf8')),data=await readFile(path.join(asset,'sound-driver.bin'));
 rom=new Uint8Array(manifest.romSize);allowed=new Uint8Array(manifest.romSize);
 for(const b of manifest.blocks){rom.set(data.subarray(b.assetOffset,b.assetOffset+b.length),b.offset);allowed.fill(1,b.offset,b.offset+b.length);}
}else rom=await readFile(p.rom);
const vm=new NativeSoundVM(rom,{onROMRead:allowed?i=>{if(!allowed[i])throw Error('Sound asset missing ROM byte 0x'+i.toString(16));}:null});
for(const name of ['iwram','ewram','io'])vm[name].set(await readFile(path.join(oracle,'initial-'+name+'.bin')));
const events=new Map();
if(app){for(const x of JSON.parse(await readFile(path.join(app,'requested-sounds.json'),'utf8'))){if(!events.has(x.frame))events.set(x.frame,[]);events.get(x.frame).push(x.id);}}
else for(const x of (await readFile(p.sound_events,'utf8')).trim().split('\n').map(x=>JSON.parse(x)))events.set(x.frame,x.ids);
const musicPath=process.argv.find(x=>x.startsWith('--music='))?.slice(8);
const music=new Map(),tempo=new Map(),loading=new Set(),resets=new Set();
function add(map,frame,value){if(!map.has(frame))map.set(frame,[]);map.get(frame).push(value);}
if(app){
 for(const x of JSON.parse(await readFile(path.join(app,'music-requests.json'),'utf8'))){
  add(music,x.frame,x.id);
  if(x.stage==='result-intro')for(let f=x.frame+PODIUM_VIEW.roundTicks+PODIUM_VIEW.entryDelay-1;f<x.frame+PODIUM_VIEW.musicTick-1;f++)loading.add(f);
 }
 for(const x of JSON.parse(await readFile(path.join(app,'tempo-requests.json'),'utf8')))add(tempo,x.frame,x.value);
 for(const x of JSON.parse(await readFile(path.join(app,'round-loads.json'),'utf8')))if(x.budget){
  resets.add(x.frame);
  add(music,x.frame,0);add(music,x.frame+x.budget.frames[0],0);
  for(let f=x.frame;f<x.frame+x.budget.ticks;f++)loading.add(f);
 }
}else if(musicPath)for(const x of (await readFile(path.join(musicPath,'events.jsonl'),'utf8')).trim().split('\n').map(x=>JSON.parse(x)))music.set(x.frame,x.ids);
const reference=await readFile(path.join(oracle,'sound-ram.bin')),stride=p.sound_end-p.sound_start;
const end=Number(process.argv.find(x=>x.startsWith('--end='))?.slice(6)??p.end);
if((end-p.start_after)*stride>reference.length)throw Error('Native reference is not complete through requested end');
let matched=0,firstMismatch=null;const begin=performance.now();
for(let f=p.start_after+1;f<=end;f++){
 vm.call(0x0801f448);
 if(resets.has(f))vm.call(0x0802070c);
 for(const id of music.get(f)??[])vm.call(0x0802053c,[id]);
 for(const id of events.get(f)??[])vm.call(0x08020898,[id]);
 for(const value of tempo.get(f)??[])vm.call(0x0801f2cc,[value]);
 if(!loading.has(f))vm.call(0x0801f480);
 const offset=(f-p.start_after-1)*stride,differences=[];
 for(let i=0;i<stride;i++)if(vm.iwram[p.sound_start+i]!==reference[offset+i])differences.push({address:0x03000000+p.sound_start+i,expected:reference[offset+i],actual:vm.iwram[p.sound_start+i]});
 if(differences.length){firstMismatch={frame:f,count:differences.length,differences:differences.slice(0,40)};break;}
 matched++;
}
const out=path.resolve('scripts/OUTPUT','eggo-game-sound-driver_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
await writeFile(path.join(out,'parameters.json'),JSON.stringify({oracle:path.resolve(oracle),end,app:app?path.resolve(app):null,asset:asset?path.resolve(asset):null,sourceParameters:p},null,2));
const report={matched,firstMismatch,instructions:vm.instructions,milliseconds:performance.now()-begin};
await writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,...report}));if(firstMismatch)process.exitCode=1;
