/* Music/effects separation at the actual machine's sample and DMA times.
 * Diagnostic integration stage: no independent oscillator/event clock and no
 * writes to game registers, CPU cycles, or original mixed output.
 */
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/audio.h>
#include <mgba/internal/gba/io.h>
#include <mgba/core/blip_buf.h>

enum { RING_START=0x264c, RING_END=0x2f0c, IRAM_SIZE=0x8000,
       HOST_PACKET=512, OUTPUT_CAPACITY=4096, CPU_HZ=16777216 };
static struct GBA* board;
static struct GBAAudio fifoAudio;
static blip_t *musicLeft,*musicRight;
static uint8_t musicRAM[IRAM_SIZE],preparedRing[RING_END-RING_START];
static uint8_t pcmEffects[8],psgEffects[4];
static int16_t musicPCM[OUTPUT_CAPACITY*2];
static unsigned musicCount,mixerCalls;
static int musicClock,lastLeft,lastRight;
static bool inMixer;
__attribute__((import_module("eggo"),import_name("prepare_music")))
extern void prepareMusic(void);

static uint32_t readWord(unsigned at) {
 uint32_t value;memcpy(&value,(uint8_t*)board->memory.iwram+at,4);return value;
}
static bool effect(unsigned voice) {
 uint32_t owner=readWord(0x2470+voice*4);
 return owner==0x03002624||owner==0x03002634;
}
void* eggo_stem_iwram(void) { return board->memory.iwram; }
void* eggo_stem_io(void) { return board->memory.io; }
void* eggo_stem_prepared_ring(void) { return preparedRing; }
void* eggo_stem_music_ring(void) { return musicRAM+RING_START; }
void* eggo_stem_pcm_owners(void) { return pcmEffects; }
void* eggo_stem_output(void) { return musicPCM; }
unsigned eggo_stem_mixer_calls(void) { return mixerCalls; }
void eggo_stem_init(struct GBA* gba,double rate) {
 board=gba;inMixer=false;mixerCalls=musicCount=0;
 memset(musicRAM,0,sizeof(musicRAM));memset(preparedRing,0,sizeof(preparedRing));
 for(unsigned i=0;i<8;i++)pcmEffects[i]=effect(4+i);
 for(unsigned i=0;i<4;i++)psgEffects[i]=effect(i);
 // Keep native FIFO positions/counts; the common READY bootstrap contains
 // only effects, so its music samples and music echo are zero.
 fifoAudio=gba->audio;memset(fifoAudio.chA.fifo,0,sizeof(fifoAudio.chA.fifo));
 memset(fifoAudio.chB.fifo,0,sizeof(fifoAudio.chB.fifo));
 fifoAudio.chA.internalSample=fifoAudio.chB.internalSample=0;
 fifoAudio.chA.sample=fifoAudio.chB.sample=0;
 fifoAudio.chA.dmaSource=fifoAudio.chB.dmaSource=0;
 if(musicLeft)blip_delete(musicLeft);if(musicRight)blip_delete(musicRight);
 musicLeft=blip_new(32768);musicRight=blip_new(32768);
 blip_set_rates(musicLeft,CPU_HZ,rate);blip_set_rates(musicRight,CPU_HZ,rate);
 blip_clear(musicLeft);blip_clear(musicRight);
 musicClock=gba->audio.clock;lastLeft=lastRight=0;
}
void eggo_stem_begin_frame(void) { musicCount=0; }
void eggo_stem_post_audio(void) {
 if(!board)return;
 if(musicCount+HOST_PACKET>OUTPUT_CAPACITY||blip_samples_avail(musicLeft)<HOST_PACKET)__builtin_trap();
 blip_read_samples(musicLeft,musicPCM+musicCount*2,HOST_PACKET,true);
 blip_read_samples(musicRight,musicPCM+musicCount*2+1,HOST_PACKET,true);
 musicCount+=HOST_PACKET;
}
void eggo_stem_cpu_point(struct ARMCore* cpu,uint32_t site) {
 (void)cpu;if(!board)return;
 if(site==0x0802070c){inMixer=false;memset(pcmEffects,0,sizeof(pcmEffects));memset(psgEffects,0,sizeof(psgEffects));}
 if(site==0x0801f480){prepareMusic();inMixer=true;mixerCalls++;}
}
void eggo_stem_ram_write(struct GBA* gba,uint32_t address,unsigned size) {
 if(gba!=board)return;unsigned at=address&0x7fff;
 static const unsigned ends[8]={0x25c0,0x25d4,0x25e0,0x25ec,0x25f8,0x2604,0x2610,0x261c};
 if(size==4)for(unsigned i=0;i<8;i++)if(at==ends[i])pcmEffects[i]=effect(4+i);
 if(at>=RING_START&&at+size<=RING_END)
  memcpy(musicRAM+at,inMixer?preparedRing+at-RING_START:(uint8_t*)gba->memory.iwram+at,size);
}
void eggo_stem_register(struct GBAAudio* audio,unsigned at,unsigned value) {
 if(!board||audio!=&board->audio)return;
 static const unsigned trigger[4]={0x64,0x6c,0x74,0x7c};
 for(unsigned i=0;i<4;i++)if(at==trigger[i]&&(value&0x8000))psgEffects[i]=effect(i);
 if(at==0x82){
  if(value&0x800)fifoAudio.chA.fifoWrite=fifoAudio.chA.fifoRead=0;
  if(value&0x8000)fifoAudio.chB.fifoWrite=fifoAudio.chB.fifoRead=0;
 }
}
void eggo_stem_fifo_write(struct GBAAudio* audio,int address,uint32_t value) {
 if(!board||audio!=&board->audio)return;
 if(board->performingDMA){
  unsigned number=(board->performingDMA>>1)&3;
  uint32_t source=board->memory.dma[number].nextSource;
  // DMA service updates nextSource AFTER its word store. Mirror that exact
  // transfer, including the overlap between native mixing and DMA reads.
  if((source>>24)==3){unsigned at=source&(IRAM_SIZE-4);memcpy(&value,musicRAM+at,4);}
 }
 GBAAudioWriteFIFO(&fifoAudio,address,value);
}
void eggo_stem_fifo_sample(struct GBAAudio* audio,int fifo,int32_t cycles) {
 if(board&&audio==&board->audio)GBAAudioSampleFIFO(&fifoAudio,fifo,cycles);
}
static int bias(struct GBAAudio* audio,int value) {
 int offset=GBARegisterSOUNDBIASGetBias(audio->soundbias);value+=offset;
 if(value>=0x400)value=0x3ff;else if(value<0)value=0;
 return ((value-offset)*audio->masterVolume*3)>>4;
}
void eggo_stem_sample(struct GBAAudio* audio) {
 if(!board||audio!=&board->audio)return;
 // Full PSG sampling has already updated the noise generator. A local copy
 // filters its current voices without adding events or changing its state.
 struct GBAudio psg=audio->psg;int16_t left=0,right=0;
 for(unsigned i=0;i<4;i++)psg.forceDisableCh[i]|=psgEffects[i];
 GBAudioSamplePSG(&psg,&left,&right);left>>=4-audio->volume;right>>=4-audio->volume;
 if(!audio->externalMixing){
  if(!audio->forceDisableChA){
   if(audio->chALeft)left+=(fifoAudio.chA.sample<<2)>>!audio->volumeChA;
   if(audio->chARight)right+=(fifoAudio.chA.sample<<2)>>!audio->volumeChA;
  }
  if(!audio->forceDisableChB){
   if(audio->chBLeft)left+=(fifoAudio.chB.sample<<2)>>!audio->volumeChB;
   if(audio->chBRight)right+=(fifoAudio.chB.sample<<2)>>!audio->volumeChB;
  }
 }
 left=bias(audio,left);right=bias(audio,right);
 if((size_t)blip_samples_avail(musicLeft)<audio->samples){
  blip_add_delta(musicLeft,musicClock,left-lastLeft);blip_add_delta(musicRight,musicClock,right-lastRight);
  lastLeft=left;lastRight=right;musicClock+=audio->sampleInterval;
  if(musicClock>=0x800){blip_end_frame(musicLeft,0x800);blip_end_frame(musicRight,0x800);musicClock-=0x800;}
 }
}
