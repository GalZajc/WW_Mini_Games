// ARM7TDMI Thumb execution for the isolated native sound driver. No game code,
// renderer, browser globals, ROM acquisition or audio output is implemented here.
// Used by the live audio worker and independent state/I/O comparisons.
export const SOUND_VM=Object.freeze({romBase:0x08000000,ewramBase:0x02000000,ewramSize:0x40000,
 iwramBase:0x03000000,iwramSize:0x8000,ioBase:0x04000000,ioSize:0x400,
 stack:0x03007e00,stop:0x0803fff0,instructionLimit:1000000});
const sign=(v,bits)=>(v<<(32-bits))>>(32-bits);
export class NativeSoundVM {
 constructor(rom,{onIOWrite=null,onROMRead=null,onRAMWrite=null}={}){
  this.rom=rom;this.ewram=new Uint8Array(SOUND_VM.ewramSize);this.iwram=new Uint8Array(SOUND_VM.iwramSize);this.io=new Uint8Array(SOUND_VM.ioSize);
  this.r=new Uint32Array(16);this.n=this.z=this.c=this.v=0;this.onIOWrite=onIOWrite;this.onROMRead=onROMRead;this.onRAMWrite=onRAMWrite;this.instructions=0;
 }
 region(a){
  switch(a>>>24){case 2:return[this.ewram,a&0x3ffff];case 3:return[this.iwram,a&0x7fff];case 4:if((a&0xffffff)<SOUND_VM.ioSize)return[this.io,a&0xffffff];break;
   case 8:case 9:case 10:case 11:case 12:case 13:if((a&0x1ffffff)<this.rom.length)return[this.rom,a&0x1ffffff];}
  throw Error('Unmapped sound-driver memory 0x'+a.toString(16));
 }
 u8(a){const [b,i]=this.region(a>>>0);if(b===this.rom)this.onROMRead?.(i);return b[i];}
 u16(a){return this.u8(a)|(this.u8(a+1)<<8);}
 u32(a){const p=a&~3,x=(this.u16(p)|(this.u16(p+2)<<16))>>>0,n=(a&3)*8;return n?((x>>>n)|(x<<(32-n)))>>>0:x;}
 store(a,x,size){
  a>>>=0;if(size===4)a&=~3;else if(size===2)a&=~1;
  const [b,i]=this.region(a);if(b===this.rom)throw Error('Sound driver attempted ROM write');
  for(let j=0;j<size;j++)b[i+j]=x>>>(j*8);
  if(b===this.io)this.onIOWrite?.(a,size,size===1?x&255:size===2?x&65535:x>>>0,this.instructions);
  else this.onRAMWrite?.(a,size,x>>>0);
 }
 nz(x){x>>>=0;this.n=x>>>31;this.z=Number(x===0);return x;}
 add(a,b,carry=0){a>>>=0;b>>>=0;const wide=a+b+carry,x=wide>>>0;this.c=Number(wide>0xffffffff);this.v=((~(a^b)&(a^x))>>>31);return this.nz(x);}
 sub(a,b,borrow=0){a>>>=0;b>>>=0;const wide=a-b-borrow,x=wide>>>0;this.c=Number(wide>=0);this.v=(((a^b)&(a^x))>>>31);return this.nz(x);}
 shift(a,n,kind){
  a>>>=0;if(n===0)return this.nz(a);let x;
  if(kind===0){this.c=n<32?(a>>>(32-n))&1:n===32?a&1:0;x=n<32?a<<n:0;}
  else if(kind===1){this.c=n<=32?(a>>>(n-1))&1:0;x=n<32?a>>>n:0;}
  else if(kind===2){this.c=n<32?(a>>>(n-1))&1:a>>>31;x=n<32?(a|0)>>n:(a|0)>>31;}
  else{const bits=n&31;this.c=(a>>>((n-1)&31))&1;x=bits?(a>>>bits)|(a<<(32-bits)):a;}
  return this.nz(x);
 }
 condition(cond){
  switch(cond){case 0:return this.z;case 1:return!this.z;case 2:return this.c;case 3:return!this.c;
   case 4:return this.n;case 5:return!this.n;case 6:return this.v;case 7:return!this.v;
   case 8:return this.c&&!this.z;case 9:return!this.c||this.z;case 10:return this.n===this.v;
   case 11:return this.n!==this.v;case 12:return!this.z&&this.n===this.v;case 13:return this.z||this.n!==this.v;case 14:return true;}
  throw Error('Unsupported sound-driver software interrupt');
 }
 call(entry,args=[],limit=SOUND_VM.instructionLimit){
  for(let i=0;i<args.length;i++)this.r[i]=args[i];this.r[13]=SOUND_VM.stack;this.r[14]=SOUND_VM.stop|1;
  this.pc=entry&~1;const start=this.instructions;
  while(this.pc!==SOUND_VM.stop){if(this.instructions-start>=limit)throw Error('Sound driver exceeded instruction budget');this.step();}
  return this.r[0];
 }
 step(){
  const at=this.pc,op=this.u16(at),r=this.r;this.pc=at+2;this.instructions++;
  const reg=i=>i===15?at+4:r[i],put=(i,x)=>{if(i===15)this.pc=x&~1;else r[i]=x;};
  if(op<0x1800){const kind=(op>>>11)&3,n=(op>>>6)&31;r[op&7]=this.shift(r[(op>>>3)&7],kind&&n===0?32:n,kind);return;}
  if(op<0x2000){const a=r[(op>>>3)&7],b=op&0x400?(op>>>6)&7:r[(op>>>6)&7];r[op&7]=op&0x200?this.sub(a,b):this.add(a,b);return;}
  if(op<0x4000){const d=(op>>>8)&7,v=op&255;switch((op>>>11)&3){case 0:r[d]=this.nz(v);break;case 1:this.sub(r[d],v);break;case 2:r[d]=this.add(r[d],v);break;case 3:r[d]=this.sub(r[d],v);}return;}
  if(op<0x4400){
   const d=op&7,b=r[(op>>>3)&7],a=r[d];let x;
   switch((op>>>6)&15){case 0:x=this.nz(a&b);break;case 1:x=this.nz(a^b);break;
    case 2:x=this.shift(a,b&255,0);break;case 3:x=this.shift(a,b&255,1);break;case 4:x=this.shift(a,b&255,2);break;
    case 5:x=this.add(a,b,this.c);break;case 6:x=this.sub(a,b,1-this.c);break;case 7:x=this.shift(a,b&255,3);break;
    case 8:this.nz(a&b);return;case 9:x=this.sub(0,b);break;case 10:this.sub(a,b);return;case 11:this.add(a,b);return;
    case 12:x=this.nz(a|b);break;case 13:x=this.nz(Math.imul(a,b));break;case 14:x=this.nz(a&~b);break;case 15:x=this.nz(~b);}
   r[d]=x;return;
  }
  if(op<0x4800){const d=(op&7)|((op>>>4)&8),s=(op>>>3)&15,b=reg(s);
   switch((op>>>8)&3){case 0:put(d,(reg(d)+b)>>>0);break;case 1:this.sub(reg(d),b);break;case 2:put(d,b);break;
    case 3:if(!(b&1))throw Error('Unexpected ARM-mode sound branch 0x'+b.toString(16));this.pc=b&~1;}
   return;
  }
  if(op<0x5000){r[(op>>>8)&7]=this.u32(((at+4)&~3)+(op&255)*4);return;}
  if(op<0x6000){const a=(r[(op>>>3)&7]+r[(op>>>6)&7])>>>0,d=op&7;
   switch((op>>>9)&7){case 0:this.store(a,r[d],4);break;case 1:this.store(a,r[d],2);break;case 2:this.store(a,r[d],1);break;
    case 3:r[d]=sign(this.u8(a),8);break;case 4:r[d]=this.u32(a);break;case 5:r[d]=this.u16(a);break;case 6:r[d]=this.u8(a);break;case 7:r[d]=a&1?sign(this.u8(a),8):sign(this.u16(a),16);}
   return;
  }
  if(op<0x8000){const byte=!!(op&0x1000),a=(r[(op>>>3)&7]+((op>>>6)&31)*(byte?1:4))>>>0,d=op&7;
   if(op&0x800)r[d]=byte?this.u8(a):this.u32(a);else this.store(a,r[d],byte?1:4);return;
  }
  if(op<0x9000){const a=(r[(op>>>3)&7]+((op>>>6)&31)*2)>>>0,d=op&7;if(op&0x800)r[d]=this.u16(a);else this.store(a,r[d],2);return;}
  if(op<0xa000){const a=(r[13]+(op&255)*4)>>>0,d=(op>>>8)&7;if(op&0x800)r[d]=this.u32(a);else this.store(a,r[d],4);return;}
  if(op<0xb000){r[(op>>>8)&7]=((op&0x800?r[13]:(at+4)&~3)+(op&255)*4)>>>0;return;}
  if((op&0xff00)===0xb000){r[13]=(r[13]+(op&0x80?-1:1)*(op&127)*4)>>>0;return;}
  if((op&0xf600)===0xb400){
   const pop=!!(op&0x800),list=op&255,extra=!!(op&0x100);let count=Number(extra);for(let i=0;i<8;i++)count+=(list>>>i)&1;
   let a=pop?r[13]:(r[13]-count*4)>>>0,base=a;
   for(let i=0;i<8;i++)if(list&(1<<i)){if(pop)r[i]=this.u32(a);else this.store(a,r[i],4);a+=4;}
   if(extra){if(pop)this.pc=this.u32(a)&~1;else this.store(a,r[14],4);a+=4;}
   r[13]=pop?a:base;return;
  }
  if((op&0xf000)===0xc000){
   const load=!!(op&0x800),b=(op>>>8)&7,list=op&255;if(!list)throw Error('Empty sound-driver block transfer');
   let a=r[b],count=0;for(let i=0;i<8;i++)count+=(list>>>i)&1;
   for(let i=0;i<8;i++)if(list&(1<<i)){if(load)r[i]=this.u32(a);else this.store(a,r[i],4);a+=4;}
   if(!load||!(list&(1<<b)))r[b]=a;return;
  }
  if((op&0xf000)===0xd000){if(this.condition((op>>>8)&15))this.pc=(at+4+sign(op&255,8)*2)>>>0;return;}
  if((op&0xf800)===0xe000){this.pc=(at+4+sign(op&2047,11)*2)>>>0;return;}
  if((op&0xf800)===0xf000){r[14]=(at+4+sign(op&2047,11)*4096)>>>0;return;}
  if((op&0xf800)===0xf800){this.pc=(r[14]+(op&2047)*2)&~1;r[14]=(at+2)|1;return;}
  throw Error('Unsupported sound Thumb opcode '+op.toString(16)+' at '+at.toString(16));
 }
}
