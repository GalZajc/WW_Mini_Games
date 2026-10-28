// Fixed-size timing log: no screenshots, disk writes, or audio in the frame loop.
export const PERFORMANCE_CAPTURE=Object.freeze({frames:1800,exportKey:'F8',axisPrecision:50,maxSampleAgeMs:1000});
export class EggoPerformanceMonitor {
 constructor(game){
  this.game=game;this.rows=new Array(PERFORMANCE_CAPTURE.frames);this.count=0;this.position=0;this.previousPads=new Map();
  this.key=e=>{if(e.code===PERFORMANCE_CAPTURE.exportKey&&!e.repeat){e.preventDefault();this.export().catch(console.error);}};
  window.addEventListener('keydown',this.key);
 }
 begin(dt,frameDt){
  this.started=performance.now();this.frameMs=frameDt===undefined?null:frameDt*1000;
  this.changedPadAge=null;this.padChanged=false;
  // timestamp is the browser's controller-state update time, not the physical
  // switch time. Only report age when the sampled buttons/axes actually change.
  const connected=new Set();
  for(const gp of this.game.input?._gamepadSamples||[]){
   if(!gp?.connected)continue;connected.add(gp.index);
   const signature=gp.buttons.map(b=>Number(b.pressed)).join('')+':'+gp.axes.map(a=>Math.round(a*PERFORMANCE_CAPTURE.axisPrecision)).join(',');
   const previous=this.previousPads.get(gp.index);this.previousPads.set(gp.index,signature);
   if(previous!==undefined&&signature!==previous){
    this.padChanged=true;const age=this.started-gp.timestamp;
    if(gp.timestamp>0&&age>=0&&age<PERFORMANCE_CAPTURE.maxSampleAgeMs)this.changedPadAge=Math.max(this.changedPadAge??0,age);
   }
  }
  for(const index of this.previousPads.keys())if(!connected.has(index))this.previousPads.delete(index);
 }
 beforeRender(){this.updated=performance.now();}
 finish(){
  if(this.started===undefined)return;
  const end=performance.now(),g=this.game;
  this.rows[this.position]={timeMs:end,frameMs:this.frameMs,updateMs:this.updated-this.started,renderMs:end-this.updated,
   phase:g.phase,round:g.round,controllerChanged:this.padChanged,
   controllerStateToRenderMs:this.changedPadAge===null?null:this.changedPadAge+end-this.started};
  this.position=(this.position+1)%this.rows.length;this.count=Math.min(this.count+1,this.rows.length);
  this.started=undefined;
 }
 snapshot(){
  const frames=Array.from({length:this.count},(_,i)=>this.rows[(this.position-this.count+i+this.rows.length)%this.rows.length]);
  const distribution=key=>{const a=frames.map(r=>r[key]).filter(Number.isFinite).sort((a,b)=>a-b);
   return a.length?{samples:a.length,mean:a.reduce((s,v)=>s+v,0)/a.length,p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.floor((a.length-1)*.95)],max:a.at(-1)}:null;};
  return {parameters:{...PERFORMANCE_CAPTURE,seed:this.game.seed,settings:this.game.p,createdAt:new Date().toISOString(),userAgent:navigator.userAgent,
   limits:'Controller-state timestamp to completed Canvas submission; excludes physical button/Bluetooth transit and actual display presentation. Null if unsupported or unchanged.'},
   summary:Object.fromEntries(['frameMs','updateMs','renderMs','controllerStateToRenderMs'].map(k=>[k,distribution(k)])),frames};
 }
 async export(){
  const report=this.snapshot();
  if(window.api?.writeEggoPerformanceDiagnostic)return window.api.writeEggoPerformanceDiagnostic(report);
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),link=document.createElement('a');
  link.href=url;link.download='eggo-performance-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 destroy(){window.removeEventListener('keydown',this.key);}
}
