/* Read-only diagnostic callback at the emulator I/O boundary. It never changes
 * emulated registers, memory, cycles, event scheduling or cartridge contents. */
struct EggoSoundRegisterRecord { uint32_t time, address, value, size, pc; };
enum { EGGO_SOUND_LOG_CAPACITY = 2048 };
static struct EggoSoundRegisterRecord eggoSoundLog[EGGO_SOUND_LOG_CAPACITY];
static unsigned eggoSoundLogCount;
static uint32_t eggoSoundSampleLate[2048];
static unsigned eggoSoundSampleCount;
static uint32_t eggoSoundSampleMix[2048];
static uint32_t eggoSoundSamplePCM[2048];
static uint32_t eggoSoundSampleClock[2048];
static struct GBA* eggoSoundGba;
struct EggoIRQContext {
 uint32_t time,when,relative,late,pc,cpsr,vcount,dispstat,ie,flags,lastPrefetchedPc;
};
static struct EggoIRQContext eggoIRQs[64];
static unsigned eggoIRQCount;
__declspec(dllexport) void eggo_sound_log_reset(void) { eggoSoundLogCount=0; eggoSoundSampleCount=0;eggoIRQCount=0; }
void eggo_sound_sample_late(uint32_t late) {
 unsigned i=eggoSoundSampleCount++,j=eggoSoundLogCount++;
 uint32_t time=mTimingCurrentTime(&eggoSoundGba->timing);
 if(i<2048){eggoSoundSampleLate[i]=late;eggoSoundSampleClock[i]=time;}
 if(j<EGGO_SOUND_LOG_CAPACITY)eggoSoundLog[j]=(struct EggoSoundRegisterRecord){time,0x200,i,0,0};
}
void eggo_sound_sample_mix(int left,int right,int a,int b) { unsigned i=eggoSoundSampleCount-1; if(i<2048){eggoSoundSampleMix[i]=(uint16_t)left|((uint32_t)(uint16_t)right<<16);eggoSoundSamplePCM[i]=(uint8_t)a|((unsigned)(uint8_t)b<<8);} }
__declspec(dllexport) unsigned eggo_sound_sample_count(void) { return eggoSoundSampleCount; }
__declspec(dllexport) const uint32_t* eggo_sound_sample_data(void) { return eggoSoundSampleLate; }
__declspec(dllexport) const uint32_t* eggo_sound_mix_data(void) { return eggoSoundSampleMix; }
__declspec(dllexport) const uint32_t* eggo_sound_pcm_data(void) { return eggoSoundSamplePCM; }
__declspec(dllexport) const uint32_t* eggo_sound_sample_clocks(void) { return eggoSoundSampleClock; }
__declspec(dllexport) unsigned eggo_sound_log_count(void) { return eggoSoundLogCount; }
__declspec(dllexport) const void* eggo_sound_log_data(void) { return eggoSoundLog; }
__declspec(dllexport) uint32_t eggo_sound_current_time(void) { return eggoSoundGba ? mTimingCurrentTime(&eggoSoundGba->timing) : 0; }
static void eggoSoundWrite(struct GBA* gba,uint32_t address,uint32_t value,unsigned size) {
 unsigned i=eggoSoundLogCount++;
 eggoSoundGba=gba;
 if(i<EGGO_SOUND_LOG_CAPACITY)eggoSoundLog[i]=(struct EggoSoundRegisterRecord){mTimingCurrentTime(&gba->timing),address,value,size,gba->cpu->gprs[15]};
}
void eggo_sound_fifo_clock(struct GBA* gba,int fifo,int cycles) { eggoSoundWrite(gba,0x100+fifo,(uint32_t)cycles,0); }
void eggo_sound_sample_context(int relative) {
 if(eggoSoundLogCount&&eggoSoundLogCount<=EGGO_SOUND_LOG_CAPACITY)
  eggoSoundLog[eggoSoundLogCount-1].pc=(uint32_t)relative;
}
void eggo_sound_irq_context(struct GBA* gba,uint32_t late,uint32_t pc,uint32_t cpsr) {
 unsigned i=eggoIRQCount++;
 if(i<64)eggoIRQs[i]=(struct EggoIRQContext){mTimingCurrentTime(&gba->timing),gba->irqEvent.when,
  gba->cpu->cycles,late,pc,cpsr,gba->video.vcount,gba->memory.io[2],gba->memory.io[0x200/2],
  gba->memory.io[0x202/2],gba->memory.lastPrefetchedPc};
 eggoSoundWrite(gba,0x201,(uint32_t)gba->cpu->cycles,0);
}
__declspec(dllexport) unsigned eggo_sound_irq_count(void) { return eggoIRQCount; }
__declspec(dllexport) const void* eggo_sound_irq_data(void) { return eggoIRQs; }
void eggo_sound_cpu_point(struct ARMCore* cpu,unsigned point) {
 eggoSoundWrite((struct GBA*)cpu->master,point,(uint32_t)cpu->cycles,0);
}
