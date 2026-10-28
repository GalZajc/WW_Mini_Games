import {NativeSoundVM,SOUND_VM} from '../renderer/games/eggo-mania/native-sound-vm.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const arg=(k,d)=>process.argv.find(x=>x.startsWith('--'+k+'='))?.slice(k.length+3)??d;
const probe=arg('probe','scripts/OUTPUT/eggo-audio-driver-probe_2026-10-26T14-29-50_534104Z');
const p=JSON.parse(await readFile(path.join(probe,'parameters.json'),'utf8')),writes=[];
const vm=new NativeSoundVM(await readFile(p.rom),{onIOWrite:(address,size,value)=>writes.push({address:'0x'+address.toString(16),size,value})});
vm.iwram.set(await readFile(path.join(probe,'initial-iwram.bin')));vm.ewram.set(await readFile(path.join(probe,'initial-ewram.bin')));vm.io.set(await readFile(path.join(probe,'initial-io.bin')));
const t=performance.now();vm.call(p.entry);const ms=performance.now()-t;
const mismatches=[];for(const [name,data]of [['iwram',vm.iwram],['io',vm.io]]){const expected=await readFile(path.join(probe,'result-'+name+'.bin'));for(let i=0;i<data.length;i++)if(data[i]!==expected[i])mismatches.push({region:name,offset:i,actual:data[i],expected:expected[i]});}
const native=JSON.parse(await readFile(path.join(probe,'summary.json'),'utf8'));
const report={parameters:{probe,entry:p.entry,memory:SOUND_VM},milliseconds:ms,instructions:vm.instructions,mismatchingBytes:mismatches.length,firstMismatches:mismatches.slice(0,20),ioWritesEqual:JSON.stringify(writes)===JSON.stringify(native.io_writes),writes};
const out=path.resolve('scripts/OUTPUT','eggo-sound-vm-verification_'+new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});await writeFile(path.join(out,'parameters.json'),JSON.stringify(report.parameters,null,2));await writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({out,...report}));if(mismatches.length||!report.ioWritesEqual)process.exitCode=1;
