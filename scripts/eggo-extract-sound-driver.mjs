// Extract just executed sound code/data from a locally owned ROM. No game CPU,
// artwork or complete cartridge is exported. This is a diagnostic asset draft.
import {NativeSoundVM} from '../renderer/games/eggo-mania/native-sound-vm.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const parameters={rom:'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',songs:14,
 soundCodeAndTables:{start:0x1f2cc,end:0x21b14},
 initialSoundRam:'scripts/OUTPUT/eggo-audio-driver-probe_2026-10-26T14-29-50_534104Z/initial-iwram.bin',soundStart:0x2470,soundEnd:0x3089,
 songTicks:8000,effects:50,effectTicks:240,alignment:32,
 entries:{init:0x0802070c,song:0x0802053c,resume:0x0801f420,vblank:0x0801f448,tick:0x0801f480,effect:0x08020898,tempo:0x0801f2cc,pause:0x0801f404},
 limits:'Observed sound-only reads across complete songs and isolated effects. Must verify sparse replay before installation; never distribute the full ROM.'};
const rom=await readFile(parameters.rom),used=new Uint8Array(rom.length);
const initial=await readFile(parameters.initialSoundRam);
const hash=x=>createHash('sha256').update(x).digest('hex');parameters.rom_sha256=hash(rom);
const out=path.resolve('scripts/OUTPUT','eggo-sound-driver-extract_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
await writeFile(path.join(out,'parameters.json'),JSON.stringify(parameters,null,2));
let instructions=0;
const augment=process.argv.find(x=>x.startsWith('--augment='))?.slice(10);
if(augment){
 const prior=JSON.parse(await readFile(path.join(augment,'manifest.json'),'utf8'));
 for(const b of prior.blocks)used.fill(1,b.offset,b.offset+b.length);
 parameters.augments=path.resolve(augment);instructions=prior.instructions;
}
used.fill(1,parameters.soundCodeAndTables.start,parameters.soundCodeAndTables.end);
function make(){const vm=new NativeSoundVM(rom,{onROMRead:i=>{used[i]=1;}});vm.iwram.set(initial.subarray(parameters.soundStart,parameters.soundEnd),parameters.soundStart);vm.call(parameters.entries.init);return vm;}
function tick(vm){vm.call(parameters.entries.tick);vm.call(parameters.entries.vblank);}
for(let song=0;!augment&&song<parameters.songs;song++){
 const vm=make();vm.call(parameters.entries.song,[song]);vm.call(parameters.entries.resume);
 for(let i=0;i<parameters.songTicks;i++)tick(vm);
 vm.call(parameters.entries.tempo,[-1]);vm.call(parameters.entries.pause);vm.call(parameters.entries.resume);tick(vm);
 instructions+=vm.instructions;console.log(`Song ${song+1}/${parameters.songs}`);
}
for(let effect=0;!augment&&effect<parameters.effects;effect++){
 const vm=make();vm.call(parameters.entries.song,[0]);vm.call(parameters.entries.resume);vm.call(parameters.entries.effect,[effect]);
 for(let i=0;i<parameters.effectTicks;i++)tick(vm);
 instructions+=vm.instructions;if((effect+1)%10===0)console.log(`Effect ${effect+1}/${parameters.effects}`);
}
// Round only read blocks to 32-byte boundaries, then merge adjacent blocks.
const blocks=[];for(let i=0;i<used.length;i++)if(used[i])used[i&~(parameters.alignment-1)]=1;
for(let i=0;i<used.length;i+=parameters.alignment)if(used[i]){
 const previous=blocks.at(-1);if(previous&&previous.offset+previous.length===i)previous.length+=parameters.alignment;
 else blocks.push({offset:i,length:parameters.alignment});
}
let offset=0;const chunks=blocks.map(block=>{const data=rom.subarray(block.offset,block.offset+block.length);block.assetOffset=offset;offset+=block.length;return data;});
const data=Buffer.concat(chunks);await writeFile(path.join(out,'sound-driver.bin'),data);
await writeFile(path.join(out,'sound-initial-ram.bin'),initial.subarray(parameters.soundStart,parameters.soundEnd));
parameters.initial_sound_ram_sha256=hash(initial.subarray(parameters.soundStart,parameters.soundEnd));
await writeFile(path.join(out,'parameters.json'),JSON.stringify(parameters,null,2));
await writeFile(path.join(out,'manifest.json'),JSON.stringify({romSize:rom.length,bytes:data.length,sha256:hash(data),instructions,blocks},null,2));
console.log(JSON.stringify({out,bytes:data.length,blocks:blocks.length,instructions}));
