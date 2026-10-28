"""Locate native settled stage backgrounds by direct framebuffer comparison."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
    'sources':{
        'dragon':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_576376/dragon-landed',
        'castle':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_514995/castle-landed',
        'pirate':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-12_580151/pirate-landed',
        'space':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_404434/space-landed',
        'jungle':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_417436/jungle-landed',
        'park':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-15_425429/park-landed',
        'beanstalk':'scripts/OUTPUT/eggo-reference_2026-10-03_11-11-18_098381/beanstalk-landed'},
    'width':112,'height':112,'channel_error_cap':16,'period':256,
    'sample_frames':[20,40,60,80,100,120],
}
OUT=ROOT/'scripts/OUTPUT'/('eggo-stage-backgrounds_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
records=[]
for stage,relative in PARAMETERS['sources'].items():
    base=ROOT/relative;p=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
    assert p['writes']==[] and p['steps']==[[120,'']]
    asset=ROOT/f'renderer/games/eggo-mania/assets/{stage}.png'
    background=np.asarray(Image.open(asset).convert('RGB'))[:,:PARAMETERS['width']].astype('i2')
    samples=[]
    for frame in PARAMETERS['sample_frames']:
        path=Path(str(base)+f'.frame{frame:05d}.png')
        image=np.asarray(Image.open(path).convert('RGB'))[:PARAMETERS['height'],:PARAMETERS['width']].astype('i2')
        errors=[float(np.minimum(abs(background[(np.arange(PARAMETERS['height'])+offset)%PARAMETERS['period']]-image),
                                  PARAMETERS['channel_error_cap']).mean()) for offset in range(PARAMETERS['period'])]
        order=np.argsort(errors)
        samples.append({'frame':frame,'offset_pixels':int(order[0]),'match_error':errors[order[0]],
                        'next_match_error':errors[order[1]],'image_sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    assert len(set(s['offset_pixels'] for s in samples))==1,(stage,samples)
    records.append({'stage':stage,'source':relative,'writes':p['writes'],'steps':p['steps'],
                    'initial_state_sha256':p['initial_state_sha256'],
                    'rom_sha256':p['rom_sha256'],'core_sha256':p['core_sha256'],
                    'asset_sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'samples':samples})
fixture={'parameters':PARAMETERS,'stages':records}
(OUT/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
(OUT/'measurements.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
with (OUT/'samples.csv').open('w',encoding='utf-8',newline='') as file:
    writer=csv.DictWriter(file,fieldnames=['stage',*records[0]['samples'][0]]);writer.writeheader()
    for r in records:writer.writerows({'stage':r['stage'],**s} for s in r['samples'])
(ROOT/'tests/fixtures/eggo-stage-backgrounds-gba.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
print(json.dumps({'output':str(OUT),'offsets':{r['stage']:r['samples'][0]['offset_pixels'] for r in records}}))
