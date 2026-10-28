/* Isolated mGBA 70ed83c audio hardware. No CPU, cartridge or game is linked.
 * mGBA sources retain their MPL-2.0 notices and are built without modifications.
 * Used by the native audio worker and silent differential diagnostics.
 */
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/audio.h>
#include <mgba/internal/gba/io.h>
#include <mgba/internal/gba/dma.h>
#include <mgba/internal/gba/serialize.h>
#include <mgba/core/blip_buf.h>
#include <mgba/core/sync.h>

enum { OUTPUT_CAPACITY = 32768, CPU_HZ = 16777216 };
static struct GBA gba;
static int32_t relativeCycles, nextEvent;
static int initialized;
static int16_t output[OUTPUT_CAPACITY * 2];
static struct GBASerializedState savedState;
static uint8_t soundRam[0x8000];
static struct mTimingEvent timerEvents[2];
static int timerPeriods[2];
static uint32_t sampleLateness[2048];
static unsigned latenessCount,latenessIndex;
static uint32_t diagnosticMix[2048];
static uint32_t diagnosticPCM[2048];
static unsigned diagnosticMixCount;
void eggo_audio_diagnostic_mix(int left,int right,int a,int b) { unsigned i=diagnosticMixCount++; if(i<2048){diagnosticMix[i]=(uint16_t)left|((uint32_t)(uint16_t)right<<16);diagnosticPCM[i]=(uint8_t)a|((unsigned)(uint8_t)b<<8);} }
static void (*originalSample)(struct mTiming*,void*,uint32_t);
static void sampleWithHostTiming(struct mTiming* timing,void* user,uint32_t cyclesLate) {
 unsigned late=latenessIndex<latenessCount?sampleLateness[latenessIndex++]:cyclesLate;
 relativeCycles+=(int)late-(int)cyclesLate;
 originalSample(timing,user,late);
 relativeCycles-=(int)late-(int)cyclesLate;
}

/* Host-only services are deliberately absent. Scheduling/PSG/resampling use the
 * original implementation; FIFO bytes are supplied by the native sound VM. */
int mLogGenerateCategory(const char* name, const char* id) { (void) name; (void) id; return 0; }
void mLog(int category, enum mLogLevel level, const char* format, ...) { (void) category; (void) level; (void) format; }
void mCoreSyncLockAudio(struct mCoreSync* sync) { (void) sync; }
void mCoreSyncUnlockAudio(struct mCoreSync* sync) { (void) sync; }
bool mCoreSyncProduceAudio(struct mCoreSync* sync, const struct blip_t* blip, size_t samples) { (void) sync; (void) blip; (void) samples; return true; }
void mCoreSyncConsumeAudio(struct mCoreSync* sync) { (void) sync; }
void GBADMASchedule(struct GBA* g, int number, struct GBADMA* info) {
 /* In this sound-only host a refill is serviced immediately. The original
  * requests while >= one FIFO word remains; its four-word IWRAM DMA completes
  * long before the next 1596-cycle sample. No CPU bus state is emulated here. */
 (void)number;
 for(int i=0;i<4;i++) {
  unsigned at=info->nextSource & 0x7fff;
  uint32_t word=(uint32_t)soundRam[at] | ((uint32_t)soundRam[at+1]<<8) | ((uint32_t)soundRam[at+2]<<16) | ((uint32_t)soundRam[at+3]<<24);
  GBAAudioWriteFIFO(&g->audio,info->nextDest & 0x3ff,word);
  info->nextSource+=4;
 }
 info->nextCount=0;
}
static void timerSample(struct mTiming* timing, void* context, uint32_t late) {
 int timer=(int)(uintptr_t)context;
 if(gba.audio.enable && (gba.audio.chALeft||gba.audio.chARight) && gba.audio.chATimer==timer)GBAAudioSampleFIFO(&gba.audio,0,late);
 if(gba.audio.enable && (gba.audio.chBLeft||gba.audio.chBRight) && gba.audio.chBTimer==timer)GBAAudioSampleFIFO(&gba.audio,1,late);
 mTimingSchedule(timing,&timerEvents[timer],timerPeriods[timer]-late);
}

void eggo_audio_init(double sampleRate) {
 if (initialized) GBAAudioDeinit(&gba.audio);
 memset(&gba, 0, sizeof(gba)); relativeCycles = 0; nextEvent = INT_MAX;
 mTimingInit(&gba.timing, &relativeCycles, &nextEvent);
 gba.audio.p = &gba;
 GBAAudioInit(&gba.audio, OUTPUT_CAPACITY);
 GBAAudioReset(&gba.audio);
 originalSample=gba.audio.sampleEvent.callback;gba.audio.sampleEvent.callback=sampleWithHostTiming;
 latenessCount=latenessIndex=0;
 for(int i=0;i<2;i++) {
  timerEvents[i]=(struct mTimingEvent){.context=(void*)(uintptr_t)i,.name="Sound-only PCM timer",.callback=timerSample,.priority=0x20+i};
  timerPeriods[i]=0;
 }
 blip_set_rates(gba.audio.psg.left, CPU_HZ, sampleRate);
 blip_set_rates(gba.audio.psg.right, CPU_HZ, sampleRate);
 /* libretro applies the output rate before its final reset. clear() derives
  * its fractional starting phase from that rate, not Init's 96 kHz default. */
 blip_clear(gba.audio.psg.left); blip_clear(gba.audio.psg.right);
 initialized = 1;
}

void eggo_audio_write(int address, uint32_t value, int size) {
 address &= 0x3ff;
 if (size == 4 && (address < REG_WAVE_RAM0_LO || address >= REG_WAVE_RAM0_LO + 16) && address < REG_FIFO_A_LO) {
  eggo_audio_write(address, value & 0xffff, 2);
  eggo_audio_write(address + 2, value >> 16, 2); return;
 }
 switch(address) {
  case REG_SOUND1CNT_LO: GBAAudioWriteSOUND1CNT_LO(&gba.audio,value); break;
  case REG_SOUND1CNT_HI: GBAAudioWriteSOUND1CNT_HI(&gba.audio,value); break;
  case REG_SOUND1CNT_X: GBAAudioWriteSOUND1CNT_X(&gba.audio,value); break;
  case REG_SOUND2CNT_LO: GBAAudioWriteSOUND2CNT_LO(&gba.audio,value); break;
  case REG_SOUND2CNT_HI: GBAAudioWriteSOUND2CNT_HI(&gba.audio,value); break;
  case REG_SOUND3CNT_LO: GBAAudioWriteSOUND3CNT_LO(&gba.audio,value); break;
  case REG_SOUND3CNT_HI: GBAAudioWriteSOUND3CNT_HI(&gba.audio,value); break;
  case REG_SOUND3CNT_X: GBAAudioWriteSOUND3CNT_X(&gba.audio,value); break;
  case REG_SOUND4CNT_LO: GBAAudioWriteSOUND4CNT_LO(&gba.audio,value); break;
  case REG_SOUND4CNT_HI: GBAAudioWriteSOUND4CNT_HI(&gba.audio,value); break;
  case REG_SOUNDCNT_LO: GBAAudioWriteSOUNDCNT_LO(&gba.audio,value); break;
  case REG_SOUNDCNT_HI: GBAAudioWriteSOUNDCNT_HI(&gba.audio,value); break;
  case REG_SOUNDCNT_X: GBAAudioWriteSOUNDCNT_X(&gba.audio,value); break;
  case REG_SOUNDBIAS: GBAAudioWriteSOUNDBIAS(&gba.audio,value); break;
  case REG_FIFO_A_LO: case REG_FIFO_B_LO: GBAAudioWriteFIFO(&gba.audio,address,value); break;
  default:
   if (address >= REG_WAVE_RAM0_LO && address < REG_WAVE_RAM0_LO + 16) {
    int i = (address - REG_WAVE_RAM0_LO) >> 2;
    if (size == 4) GBAAudioWriteWaveRAM(&gba.audio,i,value);
    else {
     uint32_t old = GBAAudioReadWaveRAM(&gba.audio,i);
     int shift = (address & 3) * 8, mask = size == 1 ? 0xff : 0xffff;
     GBAAudioWriteWaveRAM(&gba.audio,i,(old & ~((uint32_t)mask << shift)) | ((value & mask) << shift));
    }
   }
 }
 if (size == 1) ((uint8_t*)gba.memory.io)[address] = value;
 else if (size == 2) gba.memory.io[address >> 1] = value;
 else if (size == 4) { gba.memory.io[address >> 1] = value; gba.memory.io[(address >> 1) + 1] = value >> 16; }
 for(int i=1;i<=2;i++) {
  int control=REG_DMA0CNT_HI+i*12;
  if(address+size>control && address<=control) {
   struct GBADMA* dma=&gba.memory.dma[i]; bool was=GBADMARegisterIsEnable(dma->reg);
   dma->reg=gba.memory.io[control >> 1];
   if(!was && GBADMARegisterIsEnable(dma->reg)) {
    int source=(REG_DMA0SAD_LO+i*12)>>1;
    dma->nextSource=gba.memory.io[source]|((uint32_t)gba.memory.io[source+1]<<16);
    dma->nextDest=gba.memory.io[source+2]|((uint32_t)gba.memory.io[source+3]<<16);
   }
  }
 }
}

void eggo_audio_advance(int cycles) {
 while(cycles > 0) {
  int until = mTimingNextEvent(&gba.timing);
  if (until <= 0) { mTimingTick(&gba.timing,0); continue; }
  int step = until < cycles ? until : cycles;
  mTimingTick(&gba.timing,step); cycles -= step;
 }
}
/* For isolated-driver PCM, caller supplies each DMA timer byte at its native
 * clock edge. This does not introduce an extra interpolation/volume stage. */
void eggo_audio_pcm(int channel, int sample) {
 if (channel == 0) gba.audio.chA.sample = (int8_t)sample;
 else if (channel == 1) gba.audio.chB.sample = (int8_t)sample;
}
int eggo_audio_read(int maximum) {
 int count = blip_samples_avail(gba.audio.psg.left);
 if (count > maximum) count = maximum;
 if (count > OUTPUT_CAPACITY) count = OUTPUT_CAPACITY;
 blip_read_samples(gba.audio.psg.left,output,count,true);
 blip_read_samples(gba.audio.psg.right,output + 1,count,true);
 return count;
}
int16_t* eggo_audio_output(void) { return output; }
void* eggo_audio_state_buffer(void) { return &savedState; }
void* eggo_audio_ram_buffer(void) { return soundRam; }
void eggo_audio_trace_mode(void) { gba.audio.chA.dmaSource=0; gba.audio.chB.dmaSource=0; }
void eggo_audio_manual_mode(void) {
 eggo_audio_trace_mode();mTimingDeschedule(&gba.timing,&gba.audio.sampleEvent);
 for(int i=0;i<2;i++)mTimingDeschedule(&gba.timing,&timerEvents[i]);
}
void eggo_audio_manual_sample(unsigned late) {
 originalSample(&gba.timing,&gba.audio,late);mTimingDeschedule(&gba.timing,&gba.audio.sampleEvent);
}
void eggo_audio_manual_fifo(int fifo,unsigned late) { GBAAudioSampleFIFO(&gba.audio,fifo,late); }
uint32_t eggo_audio_clock(void) { return mTimingCurrentTime(&gba.timing); }
void* eggo_audio_lateness_buffer(void) { return sampleLateness; }
void eggo_audio_set_lateness(unsigned count) { latenessCount=count<2048?count:2048; latenessIndex=0; diagnosticMixCount=0; }
void* eggo_audio_mix_buffer(void) { return diagnosticMix; }
void* eggo_audio_pcm_debug_buffer(void) { return diagnosticPCM; }
unsigned eggo_audio_mix_count(void) { return diagnosticMixCount; }
/* Compact sound-only bootstrap. Never package CPU registers, game memory,
 * video, cartridge, or a complete emulator save-state with the application. */
void eggo_audio_restore(int applyPsgControls);
static uint8_t bootstrap[4096];
void* eggo_audio_bootstrap_buffer(void) { return bootstrap; }
int eggo_audio_bootstrap(int restore) {
 uint8_t* p=bootstrap;
 if(restore)memset(&savedState,0,sizeof(savedState));
#define FIELD(f) do { if(restore)memcpy(&(f),p,sizeof(f));else memcpy(p,&(f),sizeof(f));p+=sizeof(f); } while(0)
 FIELD(savedState.masterCycles);FIELD(savedState.cpu.cycles);FIELD(savedState.audio);
 for(int i=REG_SOUND1CNT_LO>>1;i<0x110/2;i++)FIELD(savedState.io[i]);
 for(int i=1;i<=2;i++)FIELD(savedState.dma[i]);
 for(int i=0;i<2;i++)FIELD(savedState.timers[i]);
#undef FIELD
 if(restore)eggo_audio_restore(0);
 return (int)(p-bootstrap);
}
void eggo_audio_mute_psg(unsigned mask) {
 for(int i=0;i<4;i++)gba.audio.psg.forceDisableCh[i]=!!(mask&(1u<<i));
}
void eggo_audio_clear_pcm(void) {
 memset(gba.audio.chA.fifo,0,sizeof(gba.audio.chA.fifo));
 memset(gba.audio.chB.fifo,0,sizeof(gba.audio.chB.fifo));
 gba.audio.chA.internalSample=gba.audio.chB.internalSample=0;
 gba.audio.chA.sample=gba.audio.chB.sample=0;
}
int eggo_audio_state_size(void) { return sizeof(savedState); }
void eggo_audio_restore(int applyPsgControls) {
 mTimingClear(&gba.timing);
 gba.timing.masterCycles = savedState.masterCycles + savedState.cpu.cycles;
 relativeCycles = 0; nextEvent = INT_MAX;
 eggo_audio_write(REG_SOUNDCNT_X,savedState.io[REG_SOUNDCNT_X >> 1],2);
 /* Match this exact mGBA version's GBAIODeserialize special-register list.
  * Most PSG controls are stored without invoking write handlers on restore.
  * Applying them here changes frequency/duty compared with a fresh core load. */
 const int restored[] = { REG_SOUND3CNT_HI, REG_SOUNDCNT_LO, REG_SOUNDCNT_HI, REG_SOUNDBIAS };
 for(unsigned i = 0; i < sizeof(restored)/sizeof(restored[0]); ++i)
  eggo_audio_write(restored[i],savedState.io[restored[i] >> 1],2);
 if(applyPsgControls)for(int a=REG_SOUND1CNT_LO;a<REG_SOUNDCNT_LO;a+=2)
  eggo_audio_write(a,savedState.io[a>>1],2);
 memcpy(gba.memory.io,savedState.io,sizeof(savedState.io));
 GBAAudioDeserialize(&gba.audio,&savedState);
 memcpy(soundRam,savedState.iwram,sizeof(soundRam));
 for(int i=1;i<=2;i++) {
  struct GBADMA* dma=&gba.memory.dma[i];
  dma->reg=savedState.io[(REG_DMA0CNT_HI+i*12)>>1];
  dma->nextSource=savedState.dma[i].nextSource; dma->nextDest=savedState.dma[i].nextDest;
 }
 for(int i=0;i<2;i++) {
  timerPeriods[i]=0x10000-savedState.timers[i].reload;
  if(GBATimerFlagsIsEnable(savedState.timers[i].flags))mTimingSchedule(&gba.timing,&timerEvents[i],savedState.timers[i].nextEvent);
 }
}
