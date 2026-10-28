import {createCycleAudioEngine} from './native-program-engine.js';
// Compile hot game/mixer paths on an isolated disposable instance before the
// real game advances. Actual sessions always start from a fresh state.
export const NATIVE_PROGRAM_PRELOAD=Object.freeze({seed:1492,character:6,frames:240,
 directionTicks:80,jumpTicks:48,jumpHeld:32,placeTicks:48,rotateTicks:17});
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
export async function loadNativeProgram(load){
 const manifest=JSON.parse(new TextDecoder().decode(await load('manifest.json')));
 const names=['program.wasm','program-data.bin','before-survival.bin'];
 const [wasm,data,bootstrap]=await Promise.all(names.map(async name=>{
  const bytes=await load(name);
  if(await hash(bytes)!==manifest.assetSha256[name])throw Error('Native program resource hash mismatch: '+name);
  return bytes;
 }));
 const resourceMemory=new Uint8Array(manifest.romSize);
 for(const b of manifest.blocks){
  if(b.offset<0||b.assetOffset<0||b.length<0||b.offset+b.length>resourceMemory.length||b.assetOffset+b.length>data.length)throw Error('Invalid native program resource map');
  resourceMemory.set(data.subarray(b.assetOffset,b.assetOffset+b.length),b.offset);
 }
 const program=await WebAssembly.compile(wasm);
 return {manifest,async warm(sampleRate){
  const p=NATIVE_PROGRAM_PRELOAD,e=await this.create({seed:p.seed,character:p.character,sampleRate});
  for(let i=0;i<p.frames;i++)e.step((Math.floor(i/p.directionTicks)%2?1<<6:1<<7)|
   (i%p.jumpTicks<p.jumpHeld?1<<4:0)|(i%p.placeTicks===0?1<<8:0)|(i%p.rotateTicks===0?1:0));
 },async create({seed,character,sampleRate,initialState=null}={}){
  const engine=await createCycleAudioEngine({program,rom:resourceMemory.slice(),initialState:initialState??bootstrap,sampleRate,expectedROMHash:manifest.sourceRomSha256});
  if(!initialState)engine.initializationFrames=engine.prepareSurvival(seed,character);
  return engine;
 }};
}
