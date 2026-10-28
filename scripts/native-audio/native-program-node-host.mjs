// Headless Worker host for the UNCHANGED production audio worker. Only browser
// message/fetch plumbing is adapted; no native state/timing/audio is patched.
import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const networkFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
 const url=new URL(input);
 if(url.protocol!=='file:')return networkFetch(input,options);
 try{return new Response(await readFile(fileURLToPath(url)),{status:200});}
 catch{return new Response(null,{status:404});}
};
globalThis.self=globalThis;globalThis.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
globalThis.close=()=>parentPort.close();
await import(workerData.module);
parentPort.on('message',data=>self.onmessage({data}));
