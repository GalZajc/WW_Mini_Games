"""Stitch native high-altitude backgrounds from overlapping streamed tilemaps."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'sources':{
 'factory':'scripts/OUTPUT/eggo-reference_2026-10-03_11-35-23_945555/factory-start',
 'dragon':'scripts/OUTPUT/eggo-reference_2026-10-03_11-09-58_790843/dragon-start',
 'castle':'scripts/OUTPUT/eggo-reference_2026-10-03_11-09-58_791843/castle-start',
 'pirate':'scripts/OUTPUT/eggo-reference_2026-10-03_11-09-58_790843/pirate-start',
 'space':'scripts/OUTPUT/eggo-reference_2026-10-03_11-10-02_933922/space-start',
 'jungle':'scripts/OUTPUT/eggo-reference_2026-10-03_11-10-02_923963/jungle-start',
 'park':'scripts/OUTPUT/eggo-reference_2026-10-03_11-10-02_928927/park-start',
 'beanstalk':'scripts/OUTPUT/eggo-reference_2026-10-03_11-10-07_122395/beanstalk-start'},
 'landed':{'dragon':'11-11-12_576376','castle':'11-11-12_514995','pirate':'11-11-12_580151',
 'space':'11-11-15_404434','jungle':'11-11-15_417436','park':'11-11-15_425429','beanstalk':'11-11-18_098381'},
 'frames':[120,270,300,330,360,390,420],'height':160,'field_width':112,
 'maximum_step':100,'baseline_world_y':720.044,'tile_pixels':16}
OUT=ROOT/'scripts/OUTPUT'/('eggo-intro-environments_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
def decode(prefix):
    vram=Path(str(prefix)+'.memory3').read_bytes();palraw=Path(str(prefix)+'.0x5000000').read_bytes()
    io=Path(str(prefix)+'.0x4000000').read_bytes();cnt=struct.unpack_from('<H',io,14)[0]
    assert cnt&128,'Expected native 8bpp background'
    charbase=((cnt>>2)&3)*0x4000;screenbase=((cnt>>8)&31)*2048
    raw=np.frombuffer(palraw,dtype='<u2')[:256]
    colors=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31),axis=-1).astype('uint8')
    out=np.zeros((256,256,3),dtype='uint8')
    for y in range(32):
        for x in range(32):
            d=struct.unpack_from('<H',vram,screenbase+2*(y*32+x))[0];start=charbase+(d&1023)*64
            tile=colors[np.frombuffer(vram[start:start+64],dtype='uint8').reshape(8,8)]
            if d&1024:tile=tile[:,::-1]
            if d&2048:tile=tile[::-1]
            out[y*8:y*8+8,x*8:x*8+8]=tile
    frame=np.asarray(Image.open(Path(str(prefix)+'.png')).convert('RGB'))[:112,:112].astype('i2')
    errors=[np.minimum(abs(out[(np.arange(112)+s)%256,:112].astype('i2')-frame),16).mean() for s in range(256)]
    offset=int(np.argmin(errors))
    # During the stationary countdown large opaque sprites dominate the image.
    # The native scroll register is reliable here (zero).
    if prefix.name.endswith('00120'):offset=0
    pixels=out[(np.arange(PARAMETERS['height'])+offset)%256]
    ram=Path(str(prefix)+'.ram').read_bytes();world_y=struct.unpack_from('<i',ram,0x3bd8)[0]/65536
    return pixels,{'source':str(prefix.relative_to(ROOT)),'native_map_offset':offset,
                   'world_height':max(0,(PARAMETERS['baseline_world_y']-world_y)/16),
                   'graphics_sha256':hashlib.sha256(vram+palraw+io).hexdigest()}

manifest={'parameters':PARAMETERS,'stages':{}};rules={}
for stage,relative in PARAMETERS['sources'].items():
    base=ROOT/relative;p=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));assert p['writes']==[]
    prefixes=[Path(str(base)+f'.frame{n:05d}') for n in PARAMETERS['frames']]
    if stage=='factory':prefixes.append(Path(str(base)+'.frame00480'))
    else:prefixes.append(ROOT/f'scripts/OUTPUT/eggo-reference_2026-10-03_{PARAMETERS["landed"][stage]}/{stage}-landed.frame00020')
    strip=np.zeros((900,256,3),dtype='uint8');records=[];previous=None;position=0
    for prefix in prefixes:
        pixels,record=decode(prefix)
        if previous is not None:
            errors=[float(abs(previous[step:,:112].astype('i2')-pixels[:160-step,:112].astype('i2')).mean())
                    for step in range(PARAMETERS['maximum_step']+1)]
            step=int(np.argmin(errors));position+=step
            record.update(step_pixels=step,overlap_error=errors[step])
        strip[position:position+160]=pixels;record['strip_offset']=position;records.append(record);previous=pixels
    image=Image.fromarray(strip[:position+160])
    image.save(ROOT/f'renderer/games/eggo-mania/assets/{stage}-intro.png');image.save(OUT/f'{stage}-intro.png')
    trace=json.loads(Path(str(base)+'.trace.json').read_text(encoding='utf-8'));ys=[r['world_y'] for r in trace]
    release=next(i for i in range(1,len(ys)-16) if all(abs(ys[j]-ys[j-1]-3.5)<.0001 for j in range(i,i+16)))
    rules[stage]={'ground':position,'startHeight':(PARAMETERS['baseline_world_y']-ys[release-1])/16,
                  'samples':[[r['world_height'],r['strip_offset']] for r in records]}
    manifest['stages'][stage]={'records':records,'initial_state_sha256':p['initial_state_sha256'],
                              'rom_sha256':p['rom_sha256'],'core_sha256':p['core_sha256']}
(OUT/'parameters.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(ROOT/'renderer/games/eggo-mania/assets/intro-environments.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(ROOT/'renderer/games/eggo-mania/assets/intro-environments.js').write_text('export const INTRO_ENVIRONMENTS = '+json.dumps(rules)+';\n',encoding='utf-8')
print(json.dumps({'output':str(OUT),'ground':{k:v['ground'] for k,v in rules.items()}}))
