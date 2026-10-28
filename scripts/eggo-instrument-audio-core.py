"""Instrument a disposable source checkout; never edit installed emulator/ROM."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'scripts/.tools/mgba-audio-source/mgba-70ed83c/src/gba/io.c'
pristine=ROOT/'scripts/.tools/mgba-audio-source/70ed83c-io-original.c'
if not pristine.exists():pristine.write_bytes(source.read_bytes())
text=pristine.read_text(encoding='utf-8')
include=(ROOT/'scripts/native-audio/mgba-register-log.inc').read_text(encoding='utf-8')
text=text.replace('void GBAIOWrite(struct GBA* gba, uint32_t address, uint16_t value) {',include+'\nvoid GBAIOWrite(struct GBA* gba, uint32_t address, uint16_t value) {\n if(address>=0x60 && address<0x90)eggoSoundWrite(gba,address,value,2);',1)
text=text.replace('void GBAIOWrite32(struct GBA* gba, uint32_t address, uint32_t value) {','void GBAIOWrite32(struct GBA* gba, uint32_t address, uint32_t value) {\n if(address>=0x90 && address<0xa8)eggoSoundWrite(gba,address,value,4);',1)
assert 'eggo_sound_log_reset' in text
source.write_text(text,encoding='utf-8')
audio=source.with_name('audio.c')
original_audio=ROOT/'scripts/.tools/mgba-audio-source/70ed83c/src/gba/audio.c'
audio_text=original_audio.read_text(encoding='utf-8')
audio_text=audio_text.replace('static void _sample(struct mTiming* timing, void* user, uint32_t cyclesLate) {',
 'extern void eggo_sound_sample_late(uint32_t);\nextern void eggo_sound_sample_context(int);\nstatic void _sample(struct mTiming* timing, void* user, uint32_t cyclesLate) {\n eggo_sound_sample_late(cyclesLate);eggo_sound_sample_context(*timing->relativeCycles);',1)
audio_text=audio_text.replace('\tsampleRight = _applyBias(audio, sampleRight);','\tsampleRight = _applyBias(audio, sampleRight);\n extern void eggo_sound_sample_mix(int,int,int,int); eggo_sound_sample_mix(sampleLeft,sampleRight,audio->chA.sample,audio->chB.sample);',1)
audio_text=audio_text.replace('void GBAAudioSampleFIFO(struct GBAAudio* audio, int fifoId, int32_t cycles) {','extern void eggo_sound_fifo_clock(struct GBA*,int,int);\nvoid GBAAudioSampleFIFO(struct GBAAudio* audio, int fifoId, int32_t cycles) {\n eggo_sound_fifo_clock(audio->p,fifoId,cycles);',1)
audio.write_text(audio_text,encoding='utf-8')
gba=source.with_name('gba.c');pristine_gba=ROOT/'scripts/.tools/mgba-audio-source/70ed83c-gba-original.c'
if not pristine_gba.exists():pristine_gba.write_bytes(gba.read_bytes())
gba_text=pristine_gba.read_text(encoding='utf-8').replace('\t\tARMRaiseIRQ(gba->cpu);','\t\tuint32_t eggoPC=gba->cpu->gprs[15],eggoCPSR=gba->cpu->cpsr.packed;\n\t\tARMRaiseIRQ(gba->cpu);\n extern void eggo_sound_irq_context(struct GBA*,uint32_t,uint32_t,uint32_t); eggo_sound_irq_context(gba,cyclesLate,eggoPC,eggoCPSR);',1)
gba.write_text(gba_text,encoding='utf-8')
arm=source.parents[0].parent/'arm/arm.c';pristine_arm=ROOT/'scripts/.tools/mgba-audio-source/70ed83c-arm-original.c'
if not pristine_arm.exists():pristine_arm.write_bytes(arm.read_bytes())
arm_text=pristine_arm.read_text(encoding='utf-8').replace('static inline void ThumbStep(struct ARMCore* cpu) {',
 'extern void eggo_sound_cpu_point(struct ARMCore*,unsigned);\nstatic inline void ThumbStep(struct ARMCore* cpu) {\n if(cpu->gprs[15]==0x080031ae)eggo_sound_cpu_point(cpu,0x202);\n else if(cpu->gprs[15]==0x0801f482)eggo_sound_cpu_point(cpu,0x203);',1)
arm.write_text(arm_text,encoding='utf-8')
print(json.dumps({'source':str(source),'original_sha256':hashlib.sha256(pristine.read_bytes()).hexdigest(),'instrumented_sha256':hashlib.sha256(source.read_bytes()).hexdigest()}))
