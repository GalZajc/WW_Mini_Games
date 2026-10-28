// Audit ROM affine coefficients directly, without starting a window or audio.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {nativePickupAffineMatrix} from '../renderer/games/eggo-mania/model.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const parameters={capture:'scripts/OUTPUT/eggo-reference_2026-10-08_17-25-52_997177',
    prefix:'eggo-trusted-replay',frames:600,nativeCounterAddress:0x11a9c,
    matrixPhase:'Counter before update (current RAM counter minus one)',randomSeed:null};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const output=path.join(root,'scripts','OUTPUT','eggo-pickup-affine_'+new Date().toISOString().replaceAll(':','-'));
await mkdir(output,{recursive:true});
const rows=[];
for(let frame=1;frame<=parameters.frames;frame++){
    const stem=path.join(root,parameters.capture,parameters.prefix+'.frame'+String(frame).padStart(5,'0'));
    const [oam,ram]=await Promise.all([readFile(stem+'.0x7000000'),readFile(stem+'.ram')]);
    const counter=ram.readUInt32LE(parameters.nativeCounterAddress),app=nativePickupAffineMatrix(counter-1);
    for(let object=0;object<128;object++){
        const a0=oam.readUInt16LE(object*8),a1=oam.readUInt16LE(object*8+2),a2=oam.readUInt16LE(object*8+4);
        if(!(a0&256)||a0>>14!==0||a1>>14!==1||a2>>12!==2)continue;
        const index=(a1>>9)&31,matrix=Array.from({length:4},(_,i)=>oam.readInt16LE(index*32+i*8+6));
        rows.push({frame,object,counter,matrix,app,exact:matrix.every((v,i)=>v===app[i])});
    }
}
parameters.modelSha256=digest(await readFile(path.join(root,'renderer/games/eggo-mania/model.js')));
parameters.sineTableSha256=digest(await readFile(path.join(root,'renderer/games/eggo-mania/assets/native-sine.js')));
parameters.captureMetadataSha256=digest(await readFile(path.join(root,parameters.capture,parameters.prefix+'.json')));
await writeFile(path.join(output,'parameters.json'),JSON.stringify(parameters,null,2)+'\n','utf8');
await writeFile(path.join(output,'matrices.csv'),'frame,object,counter,native_pa,native_pb,native_pc,native_pd,app_pa,app_pb,app_pc,app_pd,exact\n'+
    rows.map(r=>[r.frame,r.object,r.counter,...r.matrix,...r.app,r.exact].join(',')).join('\n')+'\n','utf8');
const summary={samples:rows.length,exact:rows.filter(r=>r.exact).length,firstMismatches:rows.filter(r=>!r.exact).slice(0,8)};
await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n','utf8');
console.log(JSON.stringify({output,...summary},null,2));
