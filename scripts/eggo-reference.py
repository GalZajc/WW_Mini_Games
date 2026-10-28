"""Frame-exact local-ROM reference runner using the user's installed RetroArch core.
No ROM or extracted assets are shipped with the game. Inputs and save states stay in tests/artifacts.
"""
import argparse, ctypes as C, json, os, hashlib, csv, struct, wave
from datetime import datetime
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
REFERENCE=ROOT/'tests/artifacts/eggo-reference'
CORE=Path('C:/Users/galza/Documents/nameščeni programi/EMULATORJI/RetroArch-Win64/cores/mgba_libretro.dll')
ROM=Path('C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba')
ROM_BASE=0x08000000
GLOBAL_RNG=0x0800935c
GLOBAL_RNG_CALL_SITES=(0x080006a0,0x080016b4,0x08001864,0x0800194c,
 0x08002222,0x080022a8,0x080022b4,0x0800b21c,0x0800d230,0x0800ed50,
 0x08015ef0,0x08015f14,0x08018d32,0x08018d48,0x08018d56,0x08018d62)
GLOBAL_RNG_PATCH_OFFSET=0x3f9260
GLOBAL_RNG_COUNTER_ADDRESS=0x02031880
GLOBAL_RNG_COUNTER_OFFSET=GLOBAL_RNG_COUNTER_ADDRESS-0x02000000
GLOBAL_RNG_POINTER_OFFSET=GLOBAL_RNG_COUNTER_OFFSET+4*len(GLOBAL_RNG_CALL_SITES)
GLOBAL_RNG_PREVIOUS_POINTER_OFFSET=GLOBAL_RNG_POINTER_OFFSET+4*len(GLOBAL_RNG_CALL_SITES)
FIELD_RNG_CALL_SITES=((0x0800223a,0x08009380),(0x0800b57e,0x080093a4),
 (0x0800b588,0x08009380),(0x0800b5c2,0x080093a4),(0x0800b5d4,0x08009380),
 (0x0800b764,0x080093a4),(0x0800b778,0x08009380),(0x0800b976,0x080093a4),
 (0x0800b980,0x08009380),(0x08012924,0x080093a4),(0x08012934,0x08009380))
FIELD_RNG_PATCH_OFFSET=0x3f9500
# The per-field trace reuses the verified 0x31880..0x31940 EWRAM trace block
# and must run separately from the global-RNG hook.
FIELD_RNG_COUNTER_ADDRESS=0x02031880
def decode_thumb_bl(data,offset,address):
 first,second=struct.unpack_from('<HH',data,offset)
 if first&0xf800!=0xf000 or second&0xf800!=0xf800:raise ValueError(f'Not a Thumb BL at {address:#010x}')
 displacement=((first&0x7ff)<<12)|((second&0x7ff)<<1)
 if displacement&(1<<22):displacement-=1<<23
 return address+4+displacement
def encode_thumb_bl(address,target):
 displacement=target-(address+4)
 if displacement&1 or displacement<-(1<<22) or displacement>=(1<<22):
  raise ValueError(f'Thumb BL out of range: {address:#010x} -> {target:#010x}')
 immediate=(displacement>>1)&0x3fffff
 return struct.pack('<HH',0xf000|((immediate>>11)&0x7ff),0xf800|(immediate&0x7ff))
def instrument_global_rng_calls(source,counter_address=GLOBAL_RNG_COUNTER_ADDRESS):
 image=bytearray(source)
 wrapper_bytes=36
 counter_offset=counter_address-0x02000000
 pointer_offset=counter_offset+4*len(GLOBAL_RNG_CALL_SITES)
 previous_offset=pointer_offset+4*len(GLOBAL_RNG_CALL_SITES)
 required=GLOBAL_RNG_PATCH_OFFSET+wrapper_bytes*len(GLOBAL_RNG_CALL_SITES)
 if len(image)!=0x400000 or required>len(image):raise ValueError('Unexpected ROM size for the verified instrumentation patch.')
 if counter_offset<0 or previous_offset+4*len(GLOBAL_RNG_CALL_SITES)>0x40000:
  raise ValueError('Instrumentation counter RAM address must fit inside EWRAM.')
 if any(value!=0xff for value in image[GLOBAL_RNG_PATCH_OFFSET:required]):
  raise ValueError('The verified ROM code cave is not blank; refusing to patch.')
 wrappers=[]
 for index,site in enumerate(GLOBAL_RNG_CALL_SITES):
  offset=site-ROM_BASE
  if decode_thumb_bl(image,offset,site)!=GLOBAL_RNG:raise ValueError(f'Unexpected RNG caller at {site:#010x}')
  wrapper_offset=GLOBAL_RNG_PATCH_OFFSET+index*wrapper_bytes
  wrapper_address=ROM_BASE+wrapper_offset
  code=bytearray(struct.pack('<HHHHHHHHHHHH',0xb510,0x4907,0x3100+index*4,0x680a,0x3201,0x600a,
   0x3140,0x680a,0x3140,0x600a,0x3940,0x600e))
  code.extend(encode_thumb_bl(wrapper_address+24,GLOBAL_RNG))
  code.extend(struct.pack('<HHI',0xbd10,0x46c0,counter_address))
  if len(code)!=wrapper_bytes:raise AssertionError('RNG wrapper size changed.')
  image[wrapper_offset:wrapper_offset+wrapper_bytes]=code
  image[offset:offset+4]=encode_thumb_bl(site,wrapper_address)
  if decode_thumb_bl(image,offset,site)!=wrapper_address:raise AssertionError('Caller patch did not decode.')
  if decode_thumb_bl(image,wrapper_offset+24,wrapper_address+24)!=GLOBAL_RNG:raise AssertionError('Wrapper target did not decode.')
  wrappers.append({'id':index,'call_site':f'0x{site:08x}','wrapper':f'0x{wrapper_address:08x}',
   'counter_address':f'0x{counter_address+index*4:08x}'})
 return bytes(image),{'method':'In-memory Thumb BL trampolines count each direct caller; source ROM is never modified.',
  'call_sites':wrappers,'patch_offset':f'0x{GLOBAL_RNG_PATCH_OFFSET:06x}',
  'counter_base':f'0x{counter_address:08x}','counter_ram_offset':f'0x{counter_offset:05x}',
  'last_r6_ram_offset':f'0x{pointer_offset:05x}',
  'previous_r6_ram_offset':f'0x{previous_offset:05x}',
  'counter_bytes':12*len(GLOBAL_RNG_CALL_SITES),'cave_bytes':wrapper_bytes*len(GLOBAL_RNG_CALL_SITES)}
def instrument_field_rng_calls(source,counter_address=FIELD_RNG_COUNTER_ADDRESS):
 image=bytearray(source);wrapper_bytes=52
 counter_offset=counter_address-0x02000000
 pointer_offset=counter_offset+4*len(FIELD_RNG_CALL_SITES)
 previous_offset=pointer_offset+4*len(FIELD_RNG_CALL_SITES)
 required=FIELD_RNG_PATCH_OFFSET+wrapper_bytes*len(FIELD_RNG_CALL_SITES)
 if len(image)!=0x400000 or required>len(image):raise ValueError('Unexpected ROM size for field-RNG instrumentation.')
 if counter_offset<0 or previous_offset+4*len(FIELD_RNG_CALL_SITES)>0x40000:
  raise ValueError('Field-RNG counter address must fit inside EWRAM.')
 if any(value!=0xff for value in image[FIELD_RNG_PATCH_OFFSET:required]):
  raise ValueError('The verified field-RNG code cave is not blank; refusing to patch.')
 wrappers=[]
 for index,(site,target) in enumerate(FIELD_RNG_CALL_SITES):
  offset=site-ROM_BASE
  if decode_thumb_bl(image,offset,site)!=target:raise ValueError(f'Unexpected field-RNG caller at {site:#010x}')
  wrapper_offset=FIELD_RNG_PATCH_OFFSET+index*wrapper_bytes
  wrapper_address=ROM_BASE+wrapper_offset
  pointer_delta=4*len(FIELD_RNG_CALL_SITES)
  load_last=0x6800+((pointer_delta//4)<<6)+(1<<3)+2
  store_previous=0x6000+(((2*pointer_delta)//4)<<6)+(1<<3)+2
  store_last=0x6000+((pointer_delta//4)<<6)+(1<<3)+6
  code=bytearray(struct.pack('<20H',0xb50f,0x4660,0xb081,0x9000,
   0x4907,0x680a,0x4b07,0x4694,0x449c,0x4662,0x600a,load_last,store_previous,store_last,
   0x4804,0x9005,0x9800,0x4684,0xb001,0xbd0f))
  code.extend(struct.pack('<III',counter_address+index*4,1,target|1))
  if len(code)!=wrapper_bytes:raise AssertionError('Field-RNG wrapper size changed.')
  image[wrapper_offset:wrapper_offset+wrapper_bytes]=code
  image[offset:offset+4]=encode_thumb_bl(site,wrapper_address)
  if decode_thumb_bl(image,offset,site)!=wrapper_address:raise AssertionError('Field-RNG caller patch did not decode.')
  if struct.unpack_from('<H',image,wrapper_offset+38)[0]!=0xbd0f or struct.unpack_from('<I',image,wrapper_offset+48)[0]!=(target|1):
   raise AssertionError('Field-RNG return-preserving target transfer did not decode.')
  wrappers.append({'id':index,'call_site':f'0x{site:08x}','target':f'0x{target:08x}',
   'wrapper':f'0x{wrapper_address:08x}','counter_address':f'0x{counter_address+index*4:08x}'})
 return bytes(image),{'method':'In-memory Thumb trampolines count direct callers, restore r0-r3/r12 and the original stack, then enter the helper with the original LR; source ROM is never modified.',
  'call_sites':wrappers,'patch_offset':f'0x{FIELD_RNG_PATCH_OFFSET:06x}',
  'counter_base':f'0x{counter_address:08x}','counter_ram_offset':f'0x{counter_offset:05x}',
  'last_r6_ram_offset':f'0x{pointer_offset:05x}','previous_r6_ram_offset':f'0x{previous_offset:05x}',
  'counter_bytes':12*len(FIELD_RNG_CALL_SITES),'cave_bytes':wrapper_bytes*len(FIELD_RNG_CALL_SITES)}
p=argparse.ArgumentParser();p.add_argument('--load');p.add_argument('--writes',default='[]');p.add_argument('--writes-file');p.add_argument('--sample-every',type=int,default=0);p.add_argument('--sample-graphics',action='store_true');p.add_argument('--sample-graphics-at-video',action='store_true',help='Capture RAM and graphics memory inside the callback that supplies each screenshot, so framebuffer and register state share a phase.');p.add_argument('--bot',action='store_true');p.add_argument('--bot-strategy',choices=['build','stack','hunt','mirror-cpu','model-player','shadow-cpu','open-loop-cpu','stateful-cpu'],default='build');p.add_argument('--model-trace',action='store_true');p.add_argument('--name',default='current');p.add_argument('--steps',default='[[240,""]]');p.add_argument('--steps-file');p.add_argument('--board-events',action='store_true');p.add_argument('--snapshot-at',default='[]');p.add_argument('--oam-trace',action='store_true');p.add_argument('--camera-trace',action='store_true',help='Record both native field camera objects alongside frame input/OAM traces.');p.add_argument('--actor-motion-trace',action='store_true',help='Record both native actors\' fixed-point position and velocity per frame.');p.add_argument('--rival-poses',action='store_true');p.add_argument('--item-trace',action='store_true');p.add_argument('--audio',action='store_true');p.add_argument('--arena-trace',action='store_true');p.add_argument('--global-rng-call-trace',action='store_true');p.add_argument('--rng-counter-address',type=lambda value:int(value,0),default=GLOBAL_RNG_COUNTER_ADDRESS,help='Unused EWRAM counter block for RNG tracing; checked against the loaded state.');p.add_argument('--field-rng-call-trace',action='store_true');p.add_argument('--field-rng-counter-address',type=lambda value:int(value,0),default=FIELD_RNG_COUNTER_ADDRESS,help='Unused EWRAM counter block for per-field RNG tracing; checked against the loaded state.');p.add_argument('--projectile-trace',action='store_true');p.add_argument('--enemy-trace',action='store_true');p.add_argument('--pickup-trace',action='store_true');p.add_argument('--collapse-trace',action='store_true');p.add_argument('--music-trace',action='store_true');p.add_argument('--ai-trace',action='store_true');p.add_argument('--podium-trace',action='store_true');p.add_argument('--podium-palette');p.add_argument('--player-poses',action='store_true');p.add_argument('--until-result',action='store_true',help='Stop after native Survival leaves active play.');a=p.parse_args()
if a.sample_graphics_at_video:a.sample_graphics=True
if a.global_rng_call_trace and a.field_rng_call_trace:
 p.error('Run global and per-field RNG call traces separately; they share the only EWRAM block verified not to affect Survival.')
if a.global_rng_call_trace or a.field_rng_call_trace:a.arena_trace=True
RNG_COUNTER_OFFSET=a.rng_counter_address-0x02000000
RNG_POINTER_OFFSET=RNG_COUNTER_OFFSET+4*len(GLOBAL_RNG_CALL_SITES)
RNG_PREVIOUS_POINTER_OFFSET=RNG_POINTER_OFFSET+4*len(GLOBAL_RNG_CALL_SITES)
FIELD_RNG_COUNTER_OFFSET=a.field_rng_counter_address-0x02000000
FIELD_RNG_POINTER_OFFSET=FIELD_RNG_COUNTER_OFFSET+4*len(FIELD_RNG_CALL_SITES)
FIELD_RNG_PREVIOUS_POINTER_OFFSET=FIELD_RNG_POINTER_OFFSET+4*len(FIELD_RNG_CALL_SITES)
ARENA={'stage':0x3294,'rng':0x11aac,'rng_game':0x11ab0,'rng_secondary':0x11ab4,'seed':0xe9a4}
CAMERAS={'player':0x3910,'cpu':0x4c8c,'camera_position':0x04,'camera_scale':0x2c,'camera_y':0x70}
ACTOR_ROOTS={'player':0x3bd4,'cpu':0x4f50}
GAME_STATE_ADDRESS=0x10
SURVIVAL_CONFIG={'root':0xe928,'words':19}
MUSIC={'iwram_base':0x03000000,'track_root':0x2530,'track_stride':16,'tracks':8}
AI={'brain':0x5a40,'words':0x118//4,'keys':0xe9a8,'actor':0x4f50,
 'fields':{'x':0,'y':4,'vx':0x14,'vy':0x18,'inventory':0x864,'variant':0x868,'state':0x874,'next_state':0x878,
  'animation_selector':0x854,'animation_state':0x858,'animation_phase':0x85c,'animation_random_step':0x860,'animation_flags':0x86c,
  'placement_ready_flag':0x880,'preview_anchor_x':0x8f4,'preview_anchor_y':0x8f8}}
PROJECTILES={'field_roots':[0xf404,0x10650],'slots':7,'stride':40,
 'active':0xf80,'kind':0xfa4,'x':0xf84,'y':0xf88,'vy':0xf94,
 'flight_counter':0xf9c,'target_y':0xf98,'fuse':0xfa0,
 'actor_roots':[0x333c,0x46b8],'actor_state':0x110c,'actor_next_state':0x1110}
ENEMIES={'roots':[0x31038,0x310b8,0x31138,0x311b8],'frame_address':0x11a9c,
 'x':0,'y':4,'vx':0x14,'vy':0x18,'animation':0x20,'type':0x24,
 'active':0x48,'life':0x4c,'variant':0x50,'angle':0x54,'speed':0x58,'actor_addresses':[0x3bd4,0x4f50,0x3bd4,0x4f50],
 'escape_counter':0x93c,'waterline':0x87c,'actor_coordinate_offset':0x898}
PICKUPS={'manager_roots':[0x34e4,0x4860],'list_head':0x418,'spawn_clock':0x428,
 'node_offset':0x1c,'next':0x1c,'limit':18,'ram_base':0x02000000,'bag_offset':4,'bag_types':13,'bag_total':0x38,
 'fields':{'x':0,'y':4,'vx':0x14,'vy':0x18,'state':0x24,'kind':0x28,'variant':0x2c,'wait':0x30}}
def native_pickups(ram_ptr):
 fields=[]
 for root in PICKUPS['manager_roots']:
  pointer=C.c_uint32.from_address(ram_ptr+root+PICKUPS['list_head']).value;items=[];seen=set()
  while pointer and len(items)<PICKUPS['limit']:
   offset=pointer-PICKUPS['ram_base']-PICKUPS['node_offset']
   assert 0<=offset<=262144-0x34 and offset not in seen,'Invalid native pickup list'
   seen.add(offset);item={'address':offset}
   for key,delta in PICKUPS['fields'].items():item[key]=C.c_int32.from_address(ram_ptr+offset+delta).value
   items.append(item);pointer=C.c_uint32.from_address(ram_ptr+offset+PICKUPS['next']).value
  fields.append({'spawn_clock':C.c_int32.from_address(ram_ptr+root+PICKUPS['spawn_clock']).value,'bag':[C.c_int32.from_address(ram_ptr+root+PICKUPS['bag_offset']+4*i).value for i in range(PICKUPS['bag_types'])],'remaining':C.c_int32.from_address(ram_ptr+root+PICKUPS['bag_total']).value,'items':items})
 return fields
COLLAPSE={'field_roots':[0x333c,0x46b8],'timer_offset':0x12ac,'timer_rows':50,
 'wave_offset':0x878,'wave_y':4,'wave_vy':0x18,'destructive_offset':0x1378,'delay':0x78,'rise_speed':0x5a3c}
def native_collapse(ram_ptr):
 return {'delay':C.c_int32.from_address(ram_ptr+COLLAPSE['delay']).value,
  'rise_speed':C.c_int32.from_address(ram_ptr+COLLAPSE['rise_speed']).value,
  'fields':[{'timers':[C.c_int32.from_address(ram_ptr+root+COLLAPSE['timer_offset']+4*i).value for i in range(COLLAPSE['timer_rows'])],
   'wave_y':C.c_int32.from_address(ram_ptr+root+COLLAPSE['wave_offset']+COLLAPSE['wave_y']).value,
   'wave_vy':C.c_int32.from_address(ram_ptr+root+COLLAPSE['wave_offset']+COLLAPSE['wave_vy']).value,
   'destructive':C.c_uint8.from_address(ram_ptr+root+COLLAPSE['destructive_offset']).value} for root in COLLAPSE['field_roots']]}
BOARD={'start':0x10084,'field_stride':0x124c,'rows':47,'stride':8,'columns':7,'fields':2}
FIELD_RNG={'objects':[0x333c,0x46b8],'selector_offset':0x1374,
 'rng_game':ARENA['rng_game'],'rng_secondary':ARENA['rng_secondary'],
 'selector_rule':'zero selects rng_game; nonzero selects rng_secondary'}
def native_field_rng(ram_ptr):
 streams=[]
 for field,root in enumerate(FIELD_RNG['objects']):
  selector=C.c_uint32.from_address(ram_ptr+root+FIELD_RNG['selector_offset']).value
  stream='rng_game' if selector==0 else 'rng_secondary'
  streams.append({'field':field,'object_root':root,'selector':selector,'stream':stream,
                  'state':C.c_uint32.from_address(ram_ptr+ARENA[stream]).value})
 return streams
OUT=Path(__file__).resolve().parent/'OUTPUT'/('eggo-reference_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
output_base=OUT;output_collision_index=0
while True:
 try:
  OUT.mkdir(parents=True,exist_ok=False);break
 except FileExistsError:
  output_collision_index+=1
  OUT=output_base.with_name(output_base.name+f'_run{output_collision_index:02d}')
lib=C.CDLL(str(CORE)); pixel=0; frame=None; video_graphics_snapshot=None; video_ram_snapshot=None; keys=set(); variables={}; directory=str(OUT).encode()
audio_writer=None;audio_frames=0;audio_pcm_hash=hashlib.sha256()
class Descriptor(C.Structure):_fields_=[('flags',C.c_uint64),('ptr',C.c_void_p),('offset',C.c_size_t),('start',C.c_size_t),('select',C.c_size_t),('disconnect',C.c_size_t),('length',C.c_size_t),('addrspace',C.c_char_p)]
class MemoryMap(C.Structure):_fields_=[('descriptors',C.POINTER(Descriptor)),('count',C.c_uint)]
maps=[]
class Info(C.Structure):_fields_=[('path',C.c_char_p),('data',C.c_void_p),('size',C.c_size_t),('meta',C.c_char_p)]
class Variable(C.Structure):_fields_=[('key',C.c_char_p),('value',C.c_char_p)]
ENV=C.CFUNCTYPE(C.c_bool,C.c_uint,C.c_void_p)
VIDEO=C.CFUNCTYPE(None,C.c_void_p,C.c_uint,C.c_uint,C.c_size_t)
AUDIO=C.CFUNCTYPE(None,C.c_int16,C.c_int16)
BATCH=C.CFUNCTYPE(C.c_size_t,C.POINTER(C.c_int16),C.c_size_t)
POLL=C.CFUNCTYPE(None)
INPUT=C.CFUNCTYPE(C.c_int16,C.c_uint,C.c_uint,C.c_uint,C.c_uint)
@ENV
def env(cmd,data):
 global pixel,maps
 if cmd&0xffff==36:
  m=C.cast(data,C.POINTER(MemoryMap))[0]
  maps=[(d.start,d.ptr,d.offset,d.length) for d in m.descriptors[:m.count]]
  return True
 if cmd==10:pixel=C.cast(data,C.POINTER(C.c_int))[0];return True
 if cmd in (9,30,31):C.cast(data,C.POINTER(C.c_char_p))[0]=directory;return True
 if cmd==16:
  vs=C.cast(data,C.POINTER(Variable));i=0
  while vs[i].key:
   variables[vs[i].key]=vs[i].value.split(b'; ',1)[-1].split(b'|')[0];i+=1
  return True
 if cmd==15:
  v=C.cast(data,C.POINTER(Variable))[0];v.value=variables.get(v.key);return bool(v.value)
 if cmd==17:C.cast(data,C.POINTER(C.c_bool))[0]=False;return True
 if cmd==3:C.cast(data,C.POINTER(C.c_bool))[0]=False;return True
 if cmd in (1,11,18):return True
 return False
@VIDEO
def video(data,w,h,pitch):
 global frame,video_graphics_snapshot,video_ram_snapshot
 if not data:return
 raw=C.string_at(data,h*pitch)
 if pixel==1:frame=Image.frombytes('RGB',(w,h),raw,'raw','BGRX',pitch)
 else:
  import numpy as np
  vals=np.frombuffer(raw,dtype=np.uint16).reshape(h,pitch//2)[:,:w];g=6 if pixel==2 else 5
  rgb=np.stack((((vals>>(g+5))&31)*255//31,((vals>>5)&((1<<g)-1))*255//((1<<g)-1),(vals&31)*255//31),axis=-1).astype('uint8');frame=Image.fromarray(rgb)
 if a.sample_graphics_at_video:
  video_ram_snapshot=C.string_at(ram_ptr,262144)
  video_graphics_snapshot={start:C.string_at(ptr+offset,length) for start,ptr,offset,length in maps
   if ptr and start in (0x03000000,0x04000000,0x05000000,0x06000000,0x07000000)}
@AUDIO
def audio(l,r):
 global audio_frames
 if audio_writer:
  data=struct.pack('<hh',l,r);audio_writer.writeframesraw(data);audio_pcm_hash.update(data);audio_frames+=1
@BATCH
def batch(data,n):
 global audio_frames
 if audio_writer:
  raw=C.string_at(data,n*4);audio_writer.writeframesraw(raw);audio_pcm_hash.update(raw);audio_frames+=n
 return n
@POLL
def poll():pass
@INPUT
def inp(port,device,index,button):return int(port==0 and button in keys)
for name,cb in [('environment',env),('video_refresh',video),('audio_sample',audio),('audio_sample_batch',batch),('input_poll',poll),('input_state',inp)]:
 fn=getattr(lib,'retro_set_'+name);fn.argtypes=[type(cb)];fn(cb)
lib.retro_init()
original_rom=ROM.read_bytes();original_rom_sha256=hashlib.sha256(original_rom).hexdigest()
emulated_rom=original_rom;global_rng_trace_parameters=None;field_rng_trace_parameters=None
if a.global_rng_call_trace:emulated_rom,global_rng_trace_parameters=instrument_global_rng_calls(emulated_rom,a.rng_counter_address)
if a.field_rng_call_trace:emulated_rom,field_rng_trace_parameters=instrument_field_rng_calls(emulated_rom,a.field_rng_counter_address)
content=C.create_string_buffer(emulated_rom);info=Info(str(ROM).encode(),C.cast(content,C.c_void_p),len(content)-1,None)
lib.retro_load_game.argtypes=[C.POINTER(Info)];lib.retro_load_game.restype=C.c_bool
assert lib.retro_load_game(C.byref(info)),'ROM load failed'
class Geometry(C.Structure):_fields_=[('base_width',C.c_uint),('base_height',C.c_uint),('max_width',C.c_uint),('max_height',C.c_uint),('aspect_ratio',C.c_float)]
class Timing(C.Structure):_fields_=[('fps',C.c_double),('sample_rate',C.c_double)]
class AVInfo(C.Structure):_fields_=[('geometry',Geometry),('timing',Timing)]
av_info=AVInfo();lib.retro_get_system_av_info.argtypes=[C.POINTER(AVInfo)];lib.retro_get_system_av_info(C.byref(av_info))
if a.audio:
 audio_writer=wave.open(str(OUT/(a.name+'.wav')),'wb');audio_writer.setnchannels(2);audio_writer.setsampwidth(2);audio_writer.setframerate(round(av_info.timing.sample_rate))
lib.retro_serialize_size.restype=C.c_size_t
for name in ('serialize','unserialize'):
 fn=getattr(lib,'retro_'+name);fn.argtypes=[C.c_void_p,C.c_size_t];fn.restype=C.c_bool
if a.load:
 state_path=Path(a.load)
 if not state_path.is_file():state_path=REFERENCE/(a.load+'.state')
 blob=state_path.read_bytes();buf=C.create_string_buffer(blob);assert lib.retro_unserialize(buf,len(blob))
buttons={'B':0,'SELECT':2,'START':3,'UP':4,'DOWN':5,'LEFT':6,'RIGHT':7,'A':8,'L':10,'R':11}
lib.retro_get_memory_data.argtypes=[C.c_uint];lib.retro_get_memory_data.restype=C.c_void_p
ram_ptr=lib.retro_get_memory_data(2)
if a.global_rng_call_trace and any(C.string_at(ram_ptr+a.rng_counter_address-0x02000000,12*len(GLOBAL_RNG_CALL_SITES))):
 raise ValueError('Instrumentation counter RAM is not unused in this save state; refusing to continue.')
if a.field_rng_call_trace and any(C.string_at(ram_ptr+FIELD_RNG_COUNTER_OFFSET,12*len(FIELD_RNG_CALL_SITES))):
 raise ValueError('Field-RNG instrumentation counter RAM is not unused in this save state; refusing to continue.')
if a.music_trace:
 trace_music_ptr=next(ptr+offset for start,ptr,offset,length in maps if start==MUSIC['iwram_base'])
if a.oam_trace:
 trace_oam_ptr=next(ptr+offset for start,ptr,offset,length in maps if start==0x07000000)
 trace_vram_ptr=next(ptr+offset for start,ptr,offset,length in maps if start==0x06000000)
writes=json.loads(Path(a.writes_file).read_text(encoding='utf-8') if a.writes_file else a.writes)
for offset,value in writes:
 assert 0<=offset<262140
 C.c_int32.from_address(ram_ptr+offset).value=value
steps=json.loads(Path(a.steps_file).read_text(encoding='utf-8') if a.steps_file else a.steps)
arena_initial={k:C.c_uint32.from_address(ram_ptr+v).value for k,v in ARENA.items()} if a.arena_trace else None
survival_config_initial=[C.c_int32.from_address(ram_ptr+SURVIVAL_CONFIG['root']+4*i).value for i in range(SURVIVAL_CONFIG['words'])] if (a.arena_trace or a.bot) else None
if a.bot and survival_config_initial is not None and not any(survival_config_initial):
 raise SystemExit('--bot requires an active Survival gameplay save state; the loaded state has no Survival round configuration. Start/continue Survival first, then load an in-game checkpoint such as tests/artifacts/eggo-reference/hard-idle.state.')
pickup_initial=native_pickups(ram_ptr) if a.pickup_trace else None
podium_recorder=None
if a.podium_trace:
 from eggo_podium_trace import PodiumRecorder
 podium_recorder=PodiumRecorder(OUT,maps,ram_ptr,a.podium_palette)
trace=[]; elapsed=0;board_events=[];previous_board=None;snapshot_frames=set(json.loads(a.snapshot_at))
terminal_game_state=None
entered_active_play=C.c_int32.from_address(ram_ptr+GAME_STATE_ADDRESS).value==0
def save_snapshot(prefix):
 size=lib.retro_serialize_size();buf=C.create_string_buffer(size);assert lib.retro_serialize(buf,size)
 (OUT/(prefix+'.state')).write_bytes(buf.raw)
 if frame is not None:frame.save(OUT/(prefix+'.png'))
 elif a.load and (REFERENCE/(a.load+'.png')).exists():
  (OUT/(prefix+'.png')).write_bytes((REFERENCE/(a.load+'.png')).read_bytes())
 (OUT/(prefix+'.ram')).write_bytes(video_ram_snapshot if a.sample_graphics_at_video and video_ram_snapshot else C.string_at(ram_ptr,262144))
 if a.sample_graphics_at_video and video_graphics_snapshot:
  for start,data in video_graphics_snapshot.items():
   suffix='memory3' if start==0x06000000 else hex(start)
   (OUT/(prefix+'.'+suffix)).write_bytes(data)
 else:
  for start,ptr,offset,length in maps:
   if ptr and start in (0x03000000,0x04000000,0x05000000,0x06000000,0x07000000):
    suffix='memory3' if start==0x06000000 else hex(start)
    (OUT/(prefix+'.'+suffix)).write_bytes(C.string_at(ptr+offset,length))
if 0 in snapshot_frames:save_snapshot(a.name+'.frame00000')
bot=None
if a.bot:
 from eggo_reference_bot import ReferencePlayer,PARAMETERS as BOT_PARAMETERS
 BOT_PARAMETERS['strategy']=a.bot_strategy
 assert not writes,'Input-only bot must not be combined with RAM writes'
 bot=ReferencePlayer(AI['keys'],OUT,a.model_trace)
 BOT_PARAMETERS['model_trace']=a.model_trace
 oam_ptr=next(ptr+offset for start,ptr,offset,length in maps if start==0x07000000)
 vram_ptr=next(ptr+offset for start,ptr,offset,length in maps if start==0x06000000)
pose_recorder=None
if a.rival_poses or a.player_poses:
 assert not (a.rival_poses and a.player_poses),'Record one actor per replay'
 from eggo_rival_poses import PoseRecorder
 pose_recorder=PoseRecorder(OUT,maps,ram_ptr,field=0 if a.player_poses else 1,sample_steps=1 if a.player_poses else None)
item_recorder=None
if a.item_trace:
 from eggo_item_trace import ItemTrace
 item_recorder=ItemTrace(OUT,maps)
for count,pressed in steps:
 keys={buttons[k] for k in pressed.split('+') if k}
 for _ in range(count):
  actual_pressed=pressed
  if bot:
   names=bot.input(elapsed,ram_ptr,oam_ptr,vram_ptr)
   keys={buttons[k] for k in names};actual_pressed='+'.join(sorted(names))
  lib.retro_run();elapsed+=1
  if pose_recorder:pose_recorder.sample(elapsed)
  if podium_recorder:podium_recorder.sample(elapsed)
  if item_recorder:
   for prefix in item_recorder.sample(elapsed):save_snapshot(prefix)
  if elapsed in snapshot_frames:save_snapshot(a.name+f'.frame{elapsed:05d}')
  if a.board_events:
   boards=[]
   for side in range(BOARD['fields']):
    start=ram_ptr+BOARD['start']+side*BOARD['field_stride']
    data=C.string_at(start,BOARD['rows']*BOARD['stride'])
    boards.append([list(data[y*BOARD['stride']:y*BOARD['stride']+BOARD['columns']]) for y in range(BOARD['rows']-1,-1,-1)])
   if boards!=previous_board:
    counts=[sum(bool(c) for row in board for c in row) for board in boards]
    previous_counts=[sum(bool(c) for row in board for c in row) for board in previous_board] if previous_board else counts
    complete_counts=[sum(all(row) for row in board) for board in boards]
    previous_complete=[sum(all(row) for row in board) for board in previous_board] if previous_board else complete_counts
    loss=[max(0,before-after) for before,after in zip(previous_counts,counts)]
    board_events.append({'frame':elapsed,'keys':actual_pressed,'rows_bottom_up':boards,'cells':counts,
     'complete_floors':complete_counts,'net_cell_loss':loss})
    if any(loss):save_snapshot(a.name+f'.loss{elapsed:05d}')
    if any(after>before for before,after in zip(previous_complete,complete_counts)):save_snapshot(a.name+f'.complete{elapsed:05d}')
    previous_board=boards
  if a.sample_every and elapsed%a.sample_every==0:
   frame.save(OUT/(a.name+f'.frame{elapsed:05d}.png'))
   (OUT/(a.name+f'.frame{elapsed:05d}.ram')).write_bytes(video_ram_snapshot if a.sample_graphics_at_video and video_ram_snapshot else C.string_at(ram_ptr,262144))
   if a.sample_graphics:
    if a.sample_graphics_at_video and video_graphics_snapshot:
     for start,data in video_graphics_snapshot.items():
      suffix='memory3' if start==0x06000000 else hex(start)
      (OUT/(a.name+f'.frame{elapsed:05d}.'+suffix)).write_bytes(data)
    else:
     for start,ptr,offset,length in maps:
      if ptr and start in (0x03000000,0x04000000,0x05000000,0x06000000,0x07000000):
       suffix='memory3' if start==0x06000000 else hex(start)
       (OUT/(a.name+f'.frame{elapsed:05d}.'+suffix)).write_bytes(C.string_at(ptr+offset,length))
  if frame:
   import numpy as np
   arr=np.asarray(frame).astype('int16');r,g,b=arr[:,:,0],arr[:,:,1],arr[:,:,2]
   mask=(r>150)&(b>120)&(g<r*0.75)&(g<b*0.8)
   mask[:,105:]=False
   ys,xs=np.where(mask)
   trace.append({'frame':elapsed,'keys':actual_pressed,'world_x':C.c_int32.from_address(ram_ptr+0x3bd4).value/65536,'world_y':C.c_int32.from_address(ram_ptr+0x3bd8).value/65536,'x':float(np.median(xs)) if len(xs)>5 else None,'y':float(np.median(ys)) if len(ys)>5 else None})
   if a.pickup_trace:trace[-1]['pickups']=native_pickups(ram_ptr)
   if a.camera_trace:
    trace[-1]['native_cameras']={field:{
     'camera_position_q16':C.c_int32.from_address(ram_ptr+base+CAMERAS['camera_position']).value,
     'camera_scale_q16':C.c_int32.from_address(ram_ptr+base+CAMERAS['camera_scale']).value,
     'camera_y':C.c_int32.from_address(ram_ptr+base+CAMERAS['camera_y']).value}
     for field,base in (('player',CAMERAS['player']),('cpu',CAMERAS['cpu']))}
    trace[-1]['camera_follow_state']={}
    for side,field in enumerate(('player','cpu')):
     root=0xf404+side*0x124c
     actor=C.c_uint32.from_address(ram_ptr+root+0x1248).value
     actor_offset=actor-0x02000000
     trace[-1]['camera_follow_state'][field]={
      'field_root':hex(0x02000000+root),'actor_pointer':hex(actor),
      'actor_y':C.c_int16.from_address(ram_ptr+actor_offset+6).value,
      'actor_state_854':C.c_uint32.from_address(ram_ptr+actor_offset+0x854).value,
      'actor_state_874':C.c_uint32.from_address(ram_ptr+actor_offset+0x874).value,
      'field_camera_offset_eb8':C.c_int16.from_address(ram_ptr+root+0xeb8).value,
      'camera_position':C.c_int32.from_address(ram_ptr+CAMERAS[field]+4).value>>16}
    io_ptr=next((ptr+offset for start,ptr,offset,length in maps if start==0x04000000 and ptr),None)
    if io_ptr:
     trace[-1]['native_bg_offsets']={f'bg{index}':{
      'hofs':C.c_uint16.from_address(io_ptr+0x10+index*4).value,
      'vofs':C.c_uint16.from_address(io_ptr+0x12+index*4).value}
      for index in range(4)}
   if a.actor_motion_trace:
    trace[-1]['native_actor_motion']={field:{key:C.c_int32.from_address(ram_ptr+base+offset).value
     for key,offset in (('x_q16',0),('y_q16',4),('vx_q16',0x14),('vy_q16',0x18),('state',0x874),('next_state',0x878))}
     for field,base in ACTOR_ROOTS.items()}
   if a.arena_trace:
    trace[-1]['arena']={k:C.c_uint32.from_address(ram_ptr+v).value for k,v in ARENA.items()}
    trace[-1]['field_rng']=native_field_rng(ram_ptr)
    trace[-1]['survival_config']=[C.c_int32.from_address(ram_ptr+SURVIVAL_CONFIG['root']+4*i).value for i in range(SURVIVAL_CONFIG['words'])]
    if a.global_rng_call_trace:
     trace[-1]['global_rng_call_counts']=list(struct.unpack('<'+str(len(GLOBAL_RNG_CALL_SITES))+'I',
      C.string_at(ram_ptr+RNG_COUNTER_OFFSET,4*len(GLOBAL_RNG_CALL_SITES))))
     trace[-1]['global_rng_last_r6']=[f'0x{x:08x}' for x in struct.unpack('<'+str(len(GLOBAL_RNG_CALL_SITES))+'I',
      C.string_at(ram_ptr+RNG_POINTER_OFFSET,4*len(GLOBAL_RNG_CALL_SITES)))]
     trace[-1]['global_rng_previous_r6']=[f'0x{x:08x}' for x in struct.unpack('<'+str(len(GLOBAL_RNG_CALL_SITES))+'I',
      C.string_at(ram_ptr+RNG_PREVIOUS_POINTER_OFFSET,4*len(GLOBAL_RNG_CALL_SITES)))]
     rng_actor_site=GLOBAL_RNG_CALL_SITES.index(0x0800ed50)
     rng_actor_calls=trace[-1]['global_rng_call_counts'][rng_actor_site]
     last_actor=int(trace[-1]['global_rng_last_r6'][rng_actor_site],16)
     if rng_actor_calls and 0x02000000<=last_actor<0x02040000:
      last_actor_offset=last_actor-0x02000000
      trace[-1]['global_rng_last_actor_words_0x840']={
       f'0x{offset:03x}':C.c_uint32.from_address(ram_ptr+last_actor_offset+offset).value
       for offset in range(0x840,0x880,4)}
      trace[-1]['global_rng_last_actor_enemy_busy']=C.c_uint8.from_address(ram_ptr+last_actor_offset+0x938).value
     previous_actor=int(trace[-1]['global_rng_previous_r6'][rng_actor_site],16)
     if previous_actor and 0x02000000<=previous_actor<0x02040000:
      previous_actor_offset=previous_actor-0x02000000
      trace[-1]['global_rng_previous_actor_words_0x840']={
       f'0x{offset:03x}':C.c_uint32.from_address(ram_ptr+previous_actor_offset+offset).value
       for offset in range(0x840,0x880,4)}
      trace[-1]['global_rng_previous_actor_enemy_busy']=C.c_uint8.from_address(ram_ptr+previous_actor_offset+0x938).value
    if a.field_rng_call_trace:
     trace[-1]['field_rng_call_counts']=list(struct.unpack('<'+str(len(FIELD_RNG_CALL_SITES))+'I',
      C.string_at(ram_ptr+FIELD_RNG_COUNTER_OFFSET,4*len(FIELD_RNG_CALL_SITES))))
     trace[-1]['field_rng_last_r6']=[f'0x{x:08x}' for x in struct.unpack('<'+str(len(FIELD_RNG_CALL_SITES))+'I',
      C.string_at(ram_ptr+FIELD_RNG_POINTER_OFFSET,4*len(FIELD_RNG_CALL_SITES)))]
     trace[-1]['field_rng_previous_r6']=[f'0x{x:08x}' for x in struct.unpack('<'+str(len(FIELD_RNG_CALL_SITES))+'I',
      C.string_at(ram_ptr+FIELD_RNG_PREVIOUS_POINTER_OFFSET,4*len(FIELD_RNG_CALL_SITES)))]
   if a.enemy_trace:
    trace[-1]['native_frame']=C.c_int32.from_address(ram_ptr+ENEMIES['frame_address']).value
    traced_enemies=[]
    for side,root in enumerate(ENEMIES['roots']):
     at=ram_ptr+root
     record={k:C.c_int32.from_address(at+ENEMIES[k]).value for k in ['x','y','vx','vy','animation','type','active','life','variant','angle','speed']}
     record['entity_slot']=side
     record['field']=side%2
     actor=ram_ptr+ENEMIES['actor_addresses'][side]
     record['escape_counter']=C.c_int32.from_address(actor+ENEMIES['escape_counter']).value
     record['waterline']=C.c_int32.from_address(actor-ENEMIES['actor_coordinate_offset']+ENEMIES['waterline']).value
     record['actor_x']=C.c_int32.from_address(actor).value
     record['actor_y']=C.c_int32.from_address(actor+4).value
     record['actor_state']=C.c_int32.from_address(actor+0x874).value
     record['actor_next_state']=C.c_int32.from_address(actor+0x878).value
     record['camera_y']=C.c_int32.from_address(actor-0x1c).value
     # Legacy camera_y is the field's waterline/baseline, NOT viewport scroll.
     record['spawn_reference_y']=record['camera_y']
     record['actor_enemy_busy']=C.c_uint8.from_address(actor+0x938).value
     record['actor_inventory']=C.c_int32.from_address(actor+0x864).value
     record['animation_clock']=C.c_int32.from_address(at+0x28).value
     field_root=C.c_uint32.from_address(at+0x68).value-0x02000000
     record['hit_flash']=C.c_int32.from_address(ram_ptr+field_root+0xebc).value if 0<=field_root<262144-0xebc else 0
     traced_enemies.append(record)
    trace[-1]['enemies']=traced_enemies
   if a.collapse_trace:trace[-1]['collapse']=native_collapse(ram_ptr)
   if a.ai_trace:
    trace[-1]['cpu']={'keys':C.c_uint16.from_address(ram_ptr+AI['keys']).value,
      'words':[C.c_uint32.from_address(ram_ptr+AI['brain']+i*4).value for i in range(AI['words'])],
      'actor':{key:C.c_int32.from_address(ram_ptr+AI['actor']+offset).value for key,offset in AI['fields'].items()}}
   if a.projectile_trace:
    fields=[]
    for side,root in enumerate(PROJECTILES['field_roots']):
     slots=[]
     for slot in range(PROJECTILES['slots']):
      at=ram_ptr+root+slot*PROJECTILES['stride']
      record={k:(C.c_uint8 if k in ['active','kind'] else C.c_int32).from_address(at+PROJECTILES[k]).value for k in ['active','kind','x','y','vy','flight_counter','target_y','fuse']}
      record['slot']=slot
      if record['active'] or record['flight_counter']!=0:slots.append(record)
     actor=ram_ptr+PROJECTILES['actor_roots'][side]
     fields.append({'projectiles':slots,'state':C.c_int32.from_address(actor+PROJECTILES['actor_state']).value,'next_state':C.c_int32.from_address(actor+PROJECTILES['actor_next_state']).value})
    trace[-1]['fields']=fields

   if a.audio:
    trace[-1]['audio_sample_frames']=audio_frames
    trace[-1]['inventory_ids']=[C.c_int32.from_address(ram_ptr+i).value for i in [0x4438,0x57b4]]
   if a.music_trace:
    trace[-1]['music_tracks']=[C.string_at(trace_music_ptr+MUSIC['track_root']+i*MUSIC['track_stride'],MUSIC['track_stride']).hex() for i in range(MUSIC['tracks'])]
   if a.oam_trace:
    traced_oam=C.string_at(trace_oam_ptr,1024)
    trace[-1]['native_frame']=C.c_uint32.from_address(ram_ptr+ENEMIES['frame_address']).value
    active_affine_oam=[]
    for obj in range(128):
     ga0,ga1,ga2=struct.unpack_from('<HHH',traced_oam,obj*8)
     if ga0&0x200 or not ga0&0x100:continue
     matrix_index=(ga1>>9)&31
     matrix=[struct.unpack_from('<h',traced_oam,matrix_index*32+k)[0] for k in [6,14,22,30]]
     active_affine_oam.append({'id':obj,'x':ga1&511,'y':ga0&255,'tile':ga2&1023,
      'palette':ga2>>12,'matrix_index':matrix_index,'matrix':matrix})
    trace[-1]['active_affine_oam']=active_affine_oam
    trace[-1]['result_oam']=[]
    for obj in range(128):
     ga0,ga1,ga2=struct.unpack_from('<HHH',traced_oam,obj*8)
     if ga0&0x300!=0x200 and ga0>>14==0 and ga1>>14==1 and ga2>>12==12:
      trace[-1]['result_oam'].append({'id':obj,'x':ga1&511,'y':ga0&255,'tile':ga2&1023})
    a0,a1,a2=struct.unpack_from('<HHH',traced_oam,16)
    trace[-1]['preview_oam']=[a0,a1,a2]
    mi=(a1>>9)&31
    trace[-1]['preview_matrix']=[struct.unpack_from('<h',traced_oam,mi*32+k)[0] for k in [6,14,22,30]]
    trace[-1]['preview_tile_sha256']=hashlib.sha256(C.string_at(trace_vram_ptr+0x10000+(a2&1023)*32,2048)).hexdigest() if a0&0x300!=0x200 and a0>>14==0 and a1>>14==3 and a2&1023<=960 else None
    # The white held-piece outline is OAM object 36 in the captured Survival
    # scene. Preserve its actual origin and affine matrix at every traced frame
    # so preview pose/flicker regressions can be checked against the ROM.
    piece_id=36
    p0,p1,p2=struct.unpack_from('<HHH',traced_oam,piece_id*8)
    pmi=(p1>>9)&31
    trace[-1]['piece_outline']={'id':piece_id,'attrs':[p0,p1,p2],
     'matrix':[struct.unpack_from('<h',traced_oam,pmi*32+k)[0] for k in [6,14,22,30]]}
    actor_id=33
    a0,a1,a2=struct.unpack_from('<HHH',traced_oam,actor_id*8)
    trace[-1]['player_actor']={'id':actor_id,'attrs':[a0,a1,a2]}
  if a.until_result:
   native_game_state=C.c_int32.from_address(ram_ptr+GAME_STATE_ADDRESS).value
   if native_game_state==0:entered_active_play=True
   elif entered_active_play:
    terminal_game_state=native_game_state
    break
 if terminal_game_state is not None:break
bot_summary=bot.model_summary() if bot and a.bot_strategy in ('model-player','shadow-cpu','open-loop-cpu','stateful-cpu') else None
if bot:bot.close()
size=lib.retro_serialize_size();buf=C.create_string_buffer(size);assert lib.retro_serialize(buf,size);(OUT/(a.name+'.state')).write_bytes(buf.raw)
podium_parameters=podium_recorder.save() if podium_recorder else None
pose_parameters=pose_recorder.save() if pose_recorder else None
item_parameters=item_recorder.save() if item_recorder else None
audio_parameters=None
if audio_writer:
 audio_writer.close();audio_writer=None
 audio_path=OUT/(a.name+'.wav')
 wav_hash=hashlib.sha256()
 with audio_path.open('rb') as audio_file:
  for chunk in iter(lambda:audio_file.read(1024*1024),b''):wav_hash.update(chunk)
 audio_parameters={'sample_rate':round(av_info.timing.sample_rate),'fps':av_info.timing.fps,'channels':2,'sample_width':2,'sample_frames':audio_frames,
  'pcm_sha256':audio_pcm_hash.hexdigest(),'wav_sha256':wav_hash.hexdigest()}
parameters={'podium_trace_parameters':podium_parameters,'collapse_trace_parameters':COLLAPSE if a.collapse_trace else None,'pickup_trace_parameters':PICKUPS if a.pickup_trace else None,'pickup_initial':pickup_initial,'output_collision_index':output_collision_index,'enemy_trace_parameters':ENEMIES if a.enemy_trace else None,'projectile_trace_parameters':PROJECTILES if a.projectile_trace else None,'item_trace_parameters':item_parameters,'rival_pose_parameters':pose_parameters,'load':a.load,'steps':steps,'steps_file':a.steps_file,'writes':writes,'sample_every':a.sample_every,'sample_graphics':a.sample_graphics,'sample_graphics_at_video':a.sample_graphics_at_video,'oam_trace':a.oam_trace,'until_result':a.until_result,'terminal_game_state':terminal_game_state,'game_state_address':hex(GAME_STATE_ADDRESS) if a.until_result else None,'rom':str(ROM),'core':str(CORE),
 'arena_trace_parameters':ARENA if a.arena_trace else None,'field_rng_trace_parameters':FIELD_RNG if a.arena_trace else None,'arena_initial':arena_initial,
 'camera_trace_parameters':({'objects':{k:hex(v) for k,v in CAMERAS.items()},
  'follow_state':{'player_field_root':'0x0200f404','field_stride':'0x124c',
   'actor_pointer_offset':'0x1248','actor_y_offset':'0x6','actor_gate_offsets':['0x854','0x874'],
   'field_camera_offset':'0xeb8','camera_position_offset':'0x4'}} if a.camera_trace else None),
 'actor_motion_trace_parameters':{'objects':{k:hex(v) for k,v in ACTOR_ROOTS.items()},
  'fields':{'x_q16':'0x00','y_q16':'0x04','vx_q16':'0x14','vy_q16':'0x18','state':'0x874','next_state':'0x878'}} if a.actor_motion_trace else None,
 'global_rng_call_trace_parameters':global_rng_trace_parameters,
 'field_rng_call_trace_parameters':field_rng_trace_parameters,
 'global_rng_actor_trace_parameters':({'call_site':'0x0800ed50','base_source':'r6 captured at the call site',
  'word_offsets':[hex(offset) for offset in range(0x840,0x880,4)],'byte_offsets':[hex(0x938)],
  'previous_r6_field':'Per-site pointer buffer stores the previous invocation; compare it with last_r6 and per-frame count deltas.'} if a.global_rng_call_trace else None),
 'survival_config_parameters':SURVIVAL_CONFIG if a.arena_trace else None,'survival_config_initial':survival_config_initial,
 'audio':audio_parameters,'audio_enabled':a.audio,
 'video_pixel_format':{'id':pixel,'name':{0:'0RGB1555',1:'XRGB8888',2:'RGB565'}.get(pixel,'unknown')},
 'board_events':a.board_events,'board_parameters':BOARD,'snapshot_frames':sorted(snapshot_frames),
 'music_trace_parameters':MUSIC if a.music_trace else None,
 'ai_trace_parameters':AI if a.ai_trace else None,
 'bot_parameters':BOT_PARAMETERS if bot else None,'model_bot_summary':bot_summary,
 'bot_observed_shapes':sorted(bot.observed_shapes) if bot else None,
 'rom_sha256':original_rom_sha256,'emulated_rom_sha256':hashlib.sha256(emulated_rom).hexdigest(),
 'core_sha256':hashlib.sha256(CORE.read_bytes()).hexdigest(),
 'initial_state_sha256':hashlib.sha256(blob).hexdigest() if a.load else None,
 'random_seed':'encoded in the initial emulator state','core_options':{k.decode():v.decode() for k,v in variables.items()},'frames':elapsed}
if frame is not None:frame.save(OUT/(a.name+'.png'))
elif a.load and (REFERENCE/(a.load+'.png')).exists():
 (OUT/(a.name+'.png')).write_bytes((REFERENCE/(a.load+'.png')).read_bytes())
(OUT/(a.name+'.json')).write_text(json.dumps(parameters,indent=2,ensure_ascii=False),encoding='utf-8')
(OUT/'parameters.json').write_text(json.dumps(parameters,indent=2,ensure_ascii=False),encoding='utf-8')
(OUT/(a.name+'.trace.json')).write_text(json.dumps(trace),encoding='utf-8')
if a.board_events:(OUT/(a.name+'.board-events.json')).write_text(json.dumps(board_events),encoding='utf-8')
with (OUT/(a.name+'.trace.csv')).open('w',encoding='utf-8',newline='') as output:
 fieldnames=list(dict.fromkeys(key for record in trace for key in record)) if trace else ['frame','keys','world_x','world_y','x','y']
 writer=csv.DictWriter(output,fieldnames=fieldnames);writer.writeheader();writer.writerows(trace)
lib.retro_get_memory_data.argtypes=[C.c_uint];lib.retro_get_memory_data.restype=C.c_void_p
lib.retro_get_memory_size.argtypes=[C.c_uint];lib.retro_get_memory_size.restype=C.c_size_t
ptr=lib.retro_get_memory_data(2);length=lib.retro_get_memory_size(2)
if ptr and length:(OUT/(a.name+'.ram')).write_bytes(C.string_at(ptr,length))
for region in [0,1,3]:
 ptr=lib.retro_get_memory_data(region);length=lib.retro_get_memory_size(region)
 print('Region',region,'length',length)
 if ptr and length:(OUT/(a.name+'.memory'+str(region))).write_bytes(C.string_at(ptr,length))
for start,ptr,offset,length in maps:
 if ptr and length and start in (0x04000000,0x05000000,0x07000000):
  (OUT/(a.name+'.'+hex(start))).write_bytes(C.string_at(ptr+offset,length))
print('Maps',[(hex(s),l) for s,p,o,l in maps])
lib.retro_unload_game();lib.retro_deinit();print(str(OUT/(a.name+'.png')))
