import {loadNativeProgram} from './native-program-assets.js';
import {createNativeAudioEngine} from './native-audio-engine.js';
import {NativeStemQueue} from './native-program-stream.js';
import {NATIVE_PROGRAM_VERSION} from './assets/native-program/version.js';
import {NATIVE_AUDIO_ASSET_VERSION} from './assets/native-audio/version.js';
let chain=Promise.resolve(),programPromise,program,warmed=false,legacy,native,queue,sampleRate,sessionId,diagnosticState;
const cache=new Map();
async function resource(folder,name,version){
 const key=folder+'/'+name;
 if(!cache.has(key))cache.set(key,(async()=>{const url=new URL('./assets/'+key,import.meta.url);url.searchParams.set('v',version);const r=await fetch(url);if(!r.ok)throw Error('Native resource '+key+': '+r.status);return new Uint8Array(await r.arrayBuffer());})());
 return cache.get(key);
}
self.onmessage=({data})=>{
 chain=chain.then(async()=>{
  if(data.type==='init'){
   sampleRate=data.sampleRate;
   if(data.diagnosticInitialStateURL){const r=await fetch(data.diagnosticInitialStateURL);if(!r.ok)throw Error('Diagnostic initial state unavailable');diagnosticState=new Uint8Array(await r.arrayBuffer());}
   self.postMessage({type:'ready'});
  }else if(data.type==='session'){
   sessionId=data.sessionId;queue=new NativeStemQueue();
   legacy=await createNativeAudioEngine(name=>resource('native-audio',name,NATIVE_AUDIO_ASSET_VERSION),{sampleRate,stems:true});
   // Custom/network games neither download nor wait for an unused game JIT.
   if(data.original){programPromise??=loadNativeProgram(name=>resource('native-program',name,NATIVE_PROGRAM_VERSION));program=await programPromise;if(!warmed){await program.warm(sampleRate);warmed=true;}}
   native=data.original?await program.create({seed:data.seed,character:data.character,sampleRate,initialState:diagnosticState}):null;
   self.postMessage({type:'session-ready',sessionId,original:!!native});
  }else if(data.type==='prime')legacy.prime(data.commands);
  else if(data.type==='frame'){
   if(data.sessionId!==sessionId)throw Error('Out-of-order native audio session');
   const start=performance.now(),old=legacy.step(data.commands);queue.append(old.stems);
   // Anticlockwise rotation is an extension to the GBA controls. Retain the
   // reconstructed game's sound behavior if it is used, without replaying
   // old samples or resetting the song/echo. Custom modes use this path too.
   if(data.nonNative)native=null;
   let pcm;
   if(native){const result=native.step(data.buttons);queue.skip(result.full.length/2);pcm=result.stems;}
   else pcm=queue.drain();
   if(!pcm.length)throw Error('Native audio produced an empty packet');
   self.postMessage({type:'pcm',sessionId,pcm,original:!!native,computeMs:performance.now()-start},[pcm.buffer]);
  }else throw Error('Unknown native audio message '+data.type);
 }).catch(error=>{self.postMessage({type:'error',message:String(error.stack||error)});self.close();});
};
