// Planar stereo stems, with a sample ledger across unequal native host packets.
// Keeps the existing reconstructed-mode audio warm for non-original controls.
export class NativeStemQueue {
 constructor(){this.parts=[];this.frames=0;this.debt=0;}
 append(pcm){const frames=pcm.length/4;if(!Number.isInteger(frames))throw Error('Invalid stereo stems');if(frames){this.parts.push({pcm,frames,offset:0});this.frames+=frames;}if(this.debt){const n=Math.min(this.debt,this.frames);this.debt-=n;this.skip(n);}}
 skip(frames){
  while(frames&&this.parts.length){const p=this.parts[0],n=Math.min(frames,p.frames-p.offset);p.offset+=n;frames-=n;this.frames-=n;if(p.offset===p.frames)this.parts.shift();}
  this.debt+=frames;
 }
 drain(){
  const out=new Float32Array(this.frames*4);let at=0;
  for(const p of this.parts){const n=p.frames-p.offset;out.set(p.pcm.subarray(p.offset*2,p.frames*2),at*2);out.set(p.pcm.subarray(p.frames*2+p.offset*2,p.frames*4),this.frames*2+at*2);at+=n;}
  this.parts=[];this.frames=0;return out;
 }
}
