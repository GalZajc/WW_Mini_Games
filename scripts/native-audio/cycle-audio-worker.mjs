// Unshipped integration worker. Uses the real production playback transport;
// program, cartridge data, and initial state are explicitly supplied by audit.
import {createCycleAudioEngine} from './cycle-audio-engine.mjs';
let engine,chain=Promise.resolve();
async function resource(data,key){
 if(data[key])return new Uint8Array(data[key]);
 if(!data[key+'URL'])throw Error('Missing native program resource '+key);
 const response=await fetch(data[key+'URL']);
 if(!response.ok)throw Error('Native program resource '+key+': '+response.status);
 return new Uint8Array(await response.arrayBuffer());
}
self.onmessage=({data})=>{
 chain=chain.then(async()=>{
  if(data.type==='init'){
   const [program,rom,initialState]=await Promise.all(['program','rom','initialState'].map(key=>resource(data,key)));
   engine=await createCycleAudioEngine({program,rom,initialState,sampleRate:data.sampleRate});
   if(data.prepareSurvival)engine.prepareSurvival(data.prepareSurvival.seed,data.prepareSurvival.character);
   self.postMessage({type:'ready'});
  }else if(data.type==='frame'){
   const start=performance.now(),result=engine.step(data.buttons);
   self.postMessage({type:'pcm',pcm:result.stems,computeMs:performance.now()-start},[result.stems.buffer]);
  }else if(data.type!=='prime')throw Error('Unknown native program message '+data.type);
 }).catch(error=>{self.postMessage({type:'error',message:String(error.stack||error)});self.close();});
};
