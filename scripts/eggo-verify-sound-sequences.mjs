import {NativeSoundVM} from '../renderer/games/eggo-mania/native-sound-vm.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const folder=process.argv.find(x=>x.startsWith('--oracle='))?.slice(9);
if(!folder)throw Error('Missing --oracle= folder');
const p=JSON.parse(await readFile(path.join(folder,'parameters.json'),'utf8'));
const rom=await readFile(p.rom),initial={};
for(const name of Object.keys(p.regions))initial[name]=await readFile(path.join(p.probe,'initial-'+name+'.bin'));
const hash=x=>createHash('sha256').update(x).digest('hex');
let scenario=-1,vm,writes=[],calls=0,instructions=0,mismatch=null;
const begin=performance.now();
for(const line of (await readFile(path.join(folder,'commands.jsonl'),'utf8')).trim().split('\n')){
 const c=JSON.parse(line);
 if(c.scenario!==scenario){
  scenario=c.scenario;vm=new NativeSoundVM(rom,{onIOWrite:(a,s,v)=>writes.push([a,s,v])});
  for(const name of Object.keys(initial))vm[name].set(initial[name]);
 }
 writes=[];const before=vm.instructions;
 try{vm.call(p.entries[c.kind],c.args,p.instruction_limit);}catch(e){mismatch={command:c,error:String(e),pc:vm.pc};break;}
 instructions+=vm.instructions-before;
 const hashes=Object.fromEntries(Object.keys(p.regions).map(name=>[name,hash(vm[name])]));
 if(JSON.stringify(hashes)!==JSON.stringify(c.hashes)||JSON.stringify(writes)!==JSON.stringify(c.writes)){
  mismatch={command:c,actualHashes:hashes,actualWrites:writes};break;
 }
 calls++;
 if(calls%500===0)console.log('Verified '+calls+' driver calls');
}
const out=path.resolve('scripts/OUTPUT','eggo-sound-sequences-verification_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});
const params={oracle:path.resolve(folder),oracleParameters:p,vm_sha256:hash(await readFile('renderer/games/eggo-mania/native-sound-vm.js'))};
await writeFile(path.join(out,'parameters.json'),JSON.stringify(params,null,2));
const report={calls,instructions,milliseconds:performance.now()-begin,match:mismatch===null,mismatch};
await writeFile(path.join(out,'comparison.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({out,...report}));if(mismatch)process.exitCode=1;
