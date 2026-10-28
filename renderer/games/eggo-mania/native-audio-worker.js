import {createNativeAudioEngine} from './native-audio-engine.js';
import {NATIVE_AUDIO_ASSET_VERSION} from './assets/native-audio/version.js';
let engine;
// Message ordering is deterministic even while WASM/resources are loading.
let chain=Promise.resolve();
self.onmessage=({data})=>{
 chain=chain.then(async()=>{
  if(data.type==='init'){
   engine=await createNativeAudioEngine(async name=>{
    const url=new URL('./assets/native-audio/'+name,import.meta.url);url.searchParams.set('v',NATIVE_AUDIO_ASSET_VERSION);
    const response=await fetch(url);
    if(!response.ok)throw Error('Native audio resource '+name+': '+response.status);
    return new Uint8Array(await response.arrayBuffer());
   },{sampleRate:data.sampleRate,stems:true});
   self.postMessage({type:'ready'});
  }else if(data.type==='prime')engine.prime(data.commands);
  else if(data.type==='frame'){
   const start=performance.now(),result=engine.step(data.commands);
   self.postMessage({type:'pcm',pcm:result.stems,computeMs:performance.now()-start},[result.stems.buffer]);
  }
 }).catch(error=>{self.postMessage({type:'error',message:String(error.stack||error)});self.close();});
};
