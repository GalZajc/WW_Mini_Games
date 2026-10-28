/* Diagnostic reference with the original ARM/video/DMA/IRQ scheduling.
 * NOT a replacement for the reconstructed game and NOT shipped with it.
 * Cartridge and common machine state are supplied explicitly by the test.
 */
#include <mgba/gba/core.h>
#include <mgba/core/core.h>
#include <mgba/core/blip_buf.h>
#include <mgba/core/log.h>
#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/serialize.h>
#include <mgba-util/vfs.h>
#include <fcntl.h>

enum { ROM_CAPACITY=4*1024*1024, PCM_CAPACITY=4096, HOST_PACKET=512 };
static uint8_t cartridge[ROM_CAPACITY];
static struct GBASerializedState initialState;
static int16_t pcm[PCM_CAPACITY*2];
static unsigned pcmCount;
static bool discardPCM;
static double outputRate=32768;
static struct mCore* core;
static struct mAVStream stream;
static uint16_t pixels[240*160];
static uint8_t saveMemory[128*1024];
#ifdef EGGO_STEMS
void eggo_stem_init(struct GBA*,double);
void eggo_stem_begin_frame(void);
void eggo_stem_post_audio(void);
#endif
static void discardLog(struct mLogger* logger,int category,enum mLogLevel level,const char* format,va_list args) {
 (void)logger;(void)category;(void)level;(void)format;(void)args;
}
static struct mLogger silentLogger={.log=discardLog};

/* No host filesystem or device dependencies in this diagnostic reactor. */
struct VDir* VDirOpen(const char* path) { (void)path;return NULL; }
struct VFile* VFileOpenFD(const char* path,int flags) { (void)path;(void)flags;return NULL; }

static void postAudio(struct mAVStream* unused,blip_t* left,blip_t* right) {
 (void)unused;
 if(discardPCM){pcmCount=0;
#ifdef EGGO_STEMS
  eggo_stem_begin_frame();
#endif
 }
 if(pcmCount+HOST_PACKET>PCM_CAPACITY)__builtin_trap();
 blip_read_samples(left,pcm+pcmCount*2,HOST_PACKET,true);
 blip_read_samples(right,pcm+pcmCount*2+1,HOST_PACKET,true);
#ifdef EGGO_STEMS
 eggo_stem_post_audio();
#endif
 pcmCount+=HOST_PACKET;
}
void* eggo_cycle_rom_buffer(void) { return cartridge; }
void* eggo_cycle_state_buffer(void) { return &initialState; }
unsigned eggo_cycle_state_size(void) { return sizeof(initialState); }
void* eggo_cycle_pcm_buffer(void) { return pcm; }
void* eggo_cycle_video_buffer(void) { return pixels; }
void* eggo_cycle_sound_ram(void) { return (uint8_t*)((struct GBA*)core->board)->memory.iwram+0x2470; }
int eggo_cycle_sample_rate(double rate) {
 if(core||!(rate>=8000&&rate<=192000))return 0;
 outputRate=rate;return 1;
}
int eggo_cycle_init(unsigned romSize,int draw) {
 if(!romSize||romSize>ROM_CAPACITY)return 0;
 mLogSetDefaultLogger(&silentLogger);
 core=GBACoreCreate();if(!core||!core->init(core))return 0;
 mCoreInitConfig(core,NULL);
 struct mCoreOptions opts={.volume=0x100,.useBios=true,.audioBuffers=HOST_PACKET,.sampleRate=(unsigned)outputRate};
 mCoreConfigLoadDefaults(&core->config,&opts);
 mCoreConfigSetDefaultValue(&core->config,"idleOptimization","ignore");
 mCoreLoadConfig(core);
 if(draw)core->setVideoBuffer(core,pixels,240);
 core->setAudioBufferSize(core,HOST_PACKET);
 blip_set_rates(core->getAudioChannel(core,0),core->frequency(core),outputRate);
 blip_set_rates(core->getAudioChannel(core,1),core->frequency(core),outputRate);
 stream.postAudioBuffer=postAudio;core->setAVStream(core,&stream);
 if(!core->loadROM(core,VFileFromConstMemory(cartridge,romSize)))return 0;
 core->reset(core);
 memset(saveMemory,0xff,sizeof(saveMemory));core->loadSave(core,VFileFromMemory(saveMemory,sizeof(saveMemory)));
 if(!core->loadState(core,&initialState))return 0;
#ifdef EGGO_STEMS
 eggo_stem_init(core->board,outputRate);
#endif
 return 1;
}
unsigned eggo_cycle_step(unsigned retroMask) {
 // libretro button positions -> actual GBA keypad bits, same as original host.
 static const unsigned buttons[10]={8,0,2,3,7,6,4,5,11,10};
 unsigned keys=0;for(unsigned i=0;i<10;i++)if(retroMask&(1u<<buttons[i]))keys|=1u<<i;
 pcmCount=0;
#ifdef EGGO_STEMS
 eggo_stem_begin_frame();
#endif
 core->setKeys(core,keys);core->runFrame(core);return pcmCount;
}
uint32_t eggo_cycle_pc(void) {
 struct ARMCore* cpu=core->cpu;
 return cpu->gprs[ARM_PC]-(cpu->executionMode==MODE_THUMB?2:4);
}
uint32_t eggo_cycle_read32(uint32_t address) { return core->busRead32(core,address); }
void eggo_cycle_write32(uint32_t address,uint32_t value) { core->busWrite32(core,address,value); }
void eggo_cycle_save(void) { core->saveState(core,&initialState); }
/* Stop BEFORE an actual instruction, not by adding a timing or RNG patch to
 * the cartridge. This exposes a reproducible initialization boundary. */
unsigned eggo_cycle_seek_frame(unsigned retroMask,uint32_t target,unsigned budget) {
 static const unsigned buttons[10]={8,0,2,3,7,6,4,5,11,10};
 unsigned keys=0;for(unsigned i=0;i<10;i++)if(retroMask&(1u<<buttons[i]))keys|=1u<<i;
 core->setKeys(core,keys);int32_t start=core->frameCounter(core);pcmCount=0;discardPCM=true;
 while(eggo_cycle_pc()!=target&&core->frameCounter(core)==start&&budget--)core->step(core);
 discardPCM=false;return eggo_cycle_pc()==target;
}
unsigned eggo_cycle_seek_ready_frame(unsigned retroMask,unsigned budget) {
 static const unsigned buttons[10]={8,0,2,3,7,6,4,5,11,10};
 unsigned keys=0;for(unsigned i=0;i<10;i++)if(retroMask&(1u<<buttons[i]))keys|=1u<<i;
 core->setKeys(core,keys);int32_t start=core->frameCounter(core);pcmCount=0;discardPCM=true;bool ready=false;
 while(core->frameCounter(core)==start&&budget--){
  uint32_t pc=eggo_cycle_pc();struct ARMCore* cpu=core->cpu;
  if((pc==0x08005e14||pc==0x08020898)&&cpu->gprs[0]==16)ready=true;
  core->step(core);
 }
 discardPCM=false;return ready;
}
