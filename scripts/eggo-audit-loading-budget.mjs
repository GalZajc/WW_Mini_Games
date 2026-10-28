// Compare a general work-based GBA loading estimate against recorded gates.
// Recorded seeds only enter the separate workload audit, never a game replay.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeInitialTowerPieces} from '../renderer/games/eggo-mania/model.js';
import {NATIVE_LOADING,nativeRoundLoadingBudget} from '../renderer/games/eggo-mania/native-loading.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PARAMETERS={
 inputs:'scripts/OUTPUT/eggo-prefill-inputs_2026-10-22T09-41-18-635600Z/inputs.json',
 work:'scripts/OUTPUT/eggo-native-prefill-work_2026-10-22T09-52-30-768Z/work.json',
 nativeGates:'scripts/OUTPUT/eggo-loading-audit_2026-10-21_22-55-39/loading.json',
 model:NATIVE_LOADING,
 limits:'A measured cost estimate, not an ARM/IRQ cycle emulator. Validate visible game frames separately with a fresh input-only production replay.',
};
const [inputs,work,native]=await Promise.all([PARAMETERS.inputs,PARAMETERS.work,PARAMETERS.nativeGates].map(async f=>JSON.parse(await readFile(path.join(ROOT,f),'utf8'))));
const stages=['beanstalk','factory','dragon','castle','pirate','space','jungle','park'];
const rows=[];
for(let i=1;i<inputs.length;i++){
 const a=inputs[i],r=work[i],pieces=[0,1].flatMap(field=>nativeInitialTowerPieces({height:a.config[17]},a.round,field));
 const board={pieces:pieces.length,cells:pieces.reduce((n,p)=>n+p.cells.length,0)};
 const fields=[0,1].map(field=>r.passes.map(pass=>pass.fields[field].work));
 const stage=stages[Number(a.arena.split(' ')[1])];
 const budget=nativeRoundLoadingBudget(stage,fields,board);
 rows.push({round:a.round,stage,board,nativeHiddenTicks:native[i-1].hidden_ticks,
  matches:budget.ticks===native[i-1].hidden_ticks,...budget});
}
const out=path.join(ROOT,'scripts/OUTPUT','eggo-loading-budget_'+new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(out,{recursive:true});
const sources=[PARAMETERS.inputs,PARAMETERS.work,PARAMETERS.nativeGates,
 'renderer/games/eggo-mania/native-loading.js','renderer/games/eggo-mania/model.js','scripts/eggo-audit-loading-budget.mjs'];
PARAMETERS.sourceSha256=Object.fromEntries(await Promise.all(sources.map(async f=>[f,createHash('sha256').update(await readFile(path.join(ROOT,f))).digest('hex')])));
await writeFile(path.join(out,'parameters.json'),JSON.stringify(PARAMETERS,null,2)+'\n');
await writeFile(path.join(out,'budgets.json'),JSON.stringify(rows,null,2)+'\n');
await writeFile(path.join(out,'budgets.csv'),['round,stage,native_hidden_ticks,estimated_hidden_ticks,first_phase_frames,second_phase_frames,initial_pieces,initial_cells',
 ...rows.map(r=>[r.round,r.stage,r.nativeHiddenTicks,r.ticks,...r.frames,r.board.pieces,r.board.cells].join(','))].join('\n')+'\n');
const report={compared:rows.length,matched:rows.filter(r=>r.matches).length,mismatches:rows.filter(r=>!r.matches)};
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(report);console.log(out);
if(report.mismatches.length)process.exitCode=1;
