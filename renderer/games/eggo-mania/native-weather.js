// ROM 0800b1ee..0800b27e. The two camera handlers share BG palette RAM.
export const NATIVE_WEATHER=Object.freeze({stage:'pirate',waitBias:255,waitMask:1023,
 shortFlashMax:3,longFlashMax:11,normal:0,shortFlash:1,longFlash:2});
export function createNativeWeather(){return {counters:[0,0],queuedPalette:0,displayPalette:0};}
export function advanceNativeWeather(weather,stage,nextRandom,fields=2,onRestart){
 if(stage!==NATIVE_WEATHER.stage)return;
 weather.displayPalette=weather.queuedPalette;
 for(let i=0;i<fields;i++){
  if(weather.counters[i]===0){
   weather.queuedPalette=NATIVE_WEATHER.normal;
   weather.counters[i]=(nextRandom()+NATIVE_WEATHER.waitBias)&NATIVE_WEATHER.waitMask;
   onRestart?.(i);
  }
  const remaining=--weather.counters[i];
  if(remaining<=NATIVE_WEATHER.shortFlashMax)weather.queuedPalette=NATIVE_WEATHER.shortFlash;
  else if(remaining<=NATIVE_WEATHER.longFlashMax)weather.queuedPalette=NATIVE_WEATHER.longFlash;
 }
}
