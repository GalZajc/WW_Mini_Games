"""Measure native camera/background motion from existing input-only captures."""
from pathlib import Path
from datetime import datetime
import hashlib, json, struct
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
    'profiles':{
        'float':'scripts/OUTPUT/eggo-reference_2026-10-03_01-32-34_765349/camera-jump',
        'short':'scripts/OUTPUT/eggo-reference_2026-10-03_01-38-27_777795/camera-short-jump',
        'throw':'scripts/OUTPUT/eggo-reference_2026-10-03_01-40-12_808881/camera-throw'},
    'background':'renderer/games/eggo-mania/assets/factory.png','baseline_offset':94,
    'baseline_world_y':720.044,'world_y':0x3bd8,'tile':16,
    'match_width':112,'match_height':112,'channel_error_cap':16,
    'platform_tile':608,'platform_palette':8,'baseline_floor':112,
}
OUTPUT=Path(__file__).resolve().parent/'OUTPUT'/('eggo-camera-measurements_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUTPUT.mkdir(parents=True,exist_ok=True)
(OUTPUT/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
background=np.asarray(Image.open(ROOT/PARAMETERS['background']))[:,:112,:3].astype('i2')
profiles=[]
for name,path in PARAMETERS['profiles'].items():
    base=ROOT/path;folder=base.parent;parameters=json.loads(base.with_suffix('.json').read_text(encoding='utf-8'))
    assert parameters['writes']==[], 'A calibration must be input-only'
    trace=json.loads(Path(str(base)+'.trace.json').read_text(encoding='utf-8'))
    heights=[(PARAMETERS['baseline_world_y']-r['world_y'])/PARAMETERS['tile'] for r in trace]
    samples=[]
    for image_path in sorted(folder.glob(base.name+'.frame*.png')):
        frame=int(image_path.stem[-5:]);pixels=np.asarray(Image.open(image_path))[:112,:112,:3].astype('i2')
        errors=[np.minimum(abs(background[(np.arange(112)+offset)%256]-pixels),PARAMETERS['channel_error_cap']).mean() for offset in range(256)]
        offset=int(np.argmin(errors))
        io=image_path.with_suffix('.0x4000000').read_bytes();vram=image_path.with_suffix('.memory3').read_bytes()
        screenbase=((struct.unpack_from('<H',io,8)[0]>>8)&31)*2048
        descriptors=np.frombuffer(vram[screenbase:screenbase+2048],dtype='<u2').reshape(32,32)
        floor=[y*8 for y in range(32) if descriptors[y,0]&1023==PARAMETERS['platform_tile'] and descriptors[y,0]>>12==PARAMETERS['platform_palette']]
        vofs=struct.unpack_from('<H',io,18)[0]
        foreground=floor[0]-vofs-PARAMETERS['baseline_floor'] if len(floor)==1 else None
        samples.append({'frame':frame,'foreground_pixels':foreground,'background_offset':offset,'match_error':float(min(errors))})
    profiles.append({'name':name,'heights':heights,'samples':samples,'source':path,
        'initial_state_sha256':parameters['initial_state_sha256'],'writes':parameters['writes'],
        'input_trace_sha256':hashlib.sha256(Path(str(base)+'.trace.json').read_bytes()).hexdigest()})
fixture={'parameters':PARAMETERS,'profiles':profiles}
(OUTPUT/'measurements.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
(ROOT/'tests/fixtures/eggo-camera-gba.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
print(OUTPUT)
