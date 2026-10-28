"""Build connected panel tiles from input-only original-game captures.

Preserves original pixels, orientation and lighting. It does not paint generated
textures or distribute a ROM. Missing corner cases are recorded explicitly.
"""
from pathlib import Path
from datetime import datetime
import json, struct, hashlib, shutil
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
    'source':'scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942',
    'captures':['bot-tower.frame00120','bot-tower.frame00600','bot-tower.frame00840'],
    'board_start':0x10084,'board_stride':8,'floor_row':47,'columns':7,
    'floor_tile':0x260,'floor_palette':8,
    'materials':['bronze','silver','gold'],'silver_saturation':0.25,'bronze_green_ratio':0.67,
    'corner_size':8,'states':5,
    'platform_source':'scripts/OUTPUT/eggo-reference_2026-10-03_00-45-44_688916/board-before.bg0.png',
    'platform_rectangle':[0,200,112,248],
}
OUTPUT=Path(__file__).resolve().parent/'OUTPUT'/('eggo-panel-atlas_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUTPUT.mkdir(parents=True,exist_ok=True)
(OUTPUT/'parameters.json').write_text(json.dumps({'parameters':PARAMETERS,'status':'started'},indent=2),encoding='utf-8')
source=ROOT/PARAMETERS['source'];samples={};piece_materials={};hashes={}
for name in PARAMETERS['captures']:
    files={suffix:(source/(name+'.'+suffix)).read_bytes() for suffix in ['ram','memory3','0x5000000','0x4000000']}
    hashes[name]={suffix:hashlib.sha256(blob).hexdigest() for suffix,blob in files.items()}
    ram,vram,io=files['ram'],files['memory3'],files['0x4000000']
    raw=np.frombuffer(files['0x5000000'],dtype='<u2')
    palette=np.stack(((raw&31)*255//31,((raw>>5)&31)*255//31,((raw>>10)&31)*255//31,np.full(raw.shape,255)),axis=1).astype('uint8')
    control=struct.unpack_from('<H',io,8)[0];charbase=((control>>2)&3)*0x4000;screenbase=((control>>8)&31)*0x800
    descriptors=np.frombuffer(vram[screenbase:screenbase+2048],dtype='<u2').reshape(32,32)
    candidates=[y*8 for y in range(32) if descriptors[y,0]&1023==PARAMETERS['floor_tile'] and descriptors[y,0]>>12==PARAMETERS['floor_palette']]
    assert len(candidates)==1,(name,candidates)
    floor=candidates[0]
    board=np.array([list(ram[PARAMETERS['board_start']+r*8:PARAMETERS['board_start']+r*8+7]) for r in range(47)])
    def quadrant(tx,ty):
        descriptor=int(descriptors[ty%32,tx]);number=descriptor&1023;bank=descriptor>>12
        start=charbase+number*32
        data=np.frombuffer(vram[start:start+32],dtype='uint8')
        indices=np.stack((data&15,data>>4),axis=1).reshape(8,8)
        pixels=palette[indices.astype(int)+bank*16].copy();pixels[indices==0,3]=0
        if descriptor&1024:pixels=pixels[:,::-1]
        if descriptor&2048:pixels=pixels[::-1,:]
        return pixels
    cells={}
    for r,x in zip(*np.where(board)):
        py=(floor-(47-int(r))*16)%256;tx=int(x)*2;ty=py//8
        cell=np.concatenate([np.concatenate([quadrant(tx+dx,ty+dy) for dx in range(2)],axis=1) for dy in range(2)],axis=0)
        cells[int(r),int(x)]=cell
    for owner in set(board.flat)-{0}:
        pixels=np.concatenate([p.reshape(-1,4) for (r,x),p in cells.items() if board[r,x]==owner])
        color=pixels[pixels[:,3]>0,:3].mean(axis=0)
        material='silver' if (color.max()-color.min())/max(1,color.max())<PARAMETERS['silver_saturation'] else 'bronze' if color[1]/max(1,color[0])<PARAMETERS['bronze_green_ratio'] else 'gold'
        piece_materials[str(int(owner))]=material
    for (r,x),cell in cells.items():
        owner=board[r,x];material=piece_materials[str(int(owner))]
        same=lambda rr,xx:0<=rr<47 and 0<=xx<7 and board[rr,xx]==owner
        for corner,(dx,dy) in enumerate([(-1,-1),(1,-1),(-1,1),(1,1)]):
            h,v,d=same(r,x+dx),same(r+dy,x),same(r+dy,x+dx)
            state=4 if h and v and d else int(h)+2*int(v)
            samples.setdefault((material,corner,state),cell[(8 if dy>0 else 0):(16 if dy>0 else 8),(8 if dx>0 else 0):(16 if dx>0 else 8)])
    top=min(r for r,x in cells)
    reference=np.zeros(((47-top)*16,112,4),dtype='uint8')
    for (r,x),cell in cells.items():reference[(r-top)*16:(r-top+1)*16,x*16:(x+1)*16]=cell
    Image.fromarray(reference).save(OUTPUT/(name+'.panels.png'))
    if name==PARAMETERS['captures'][-1]:
        Image.fromarray(reference).save(ROOT/'tests/fixtures/eggo-panels-gba.png')
atlas=np.zeros((24,160,4),dtype='uint8');fallbacks=[]
for mi,material in enumerate(PARAMETERS['materials']):
    for corner in range(4):
        for state in range(5):
            key=(material,corner,state)
            if key in samples:actual=key
            else:
                options=[k for k in samples if k[:2]==key[:2]]
                assert options,(key,'no source corner')
                actual=min(options,key=lambda k:bin((3 if state==4 else state)^(3 if k[2]==4 else k[2])).count('1')+int((state==4)!=(k[2]==4)))
                fallbacks.append({'requested':key,'source':actual})
            atlas[mi*8:(mi+1)*8,(corner*5+state)*8:(corner*5+state+1)*8]=samples[actual]
Image.fromarray(atlas).save(OUTPUT/'panel-atlas.png')
metadata={'parameters':PARAMETERS,'source_hashes':hashes,'piece_materials':piece_materials,'exact_samples':len(samples),'fallbacks':fallbacks}
(OUTPUT/'parameters.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
target=ROOT/'renderer/games/eggo-mania/assets'
platform_source=ROOT/PARAMETERS['platform_source']
Image.open(platform_source).crop(PARAMETERS['platform_rectangle']).save(OUTPUT/'platform.png')
metadata['platform_sha256']=hashlib.sha256(platform_source.read_bytes()).hexdigest()
(OUTPUT/'parameters.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
shutil.copyfile(OUTPUT/'platform.png',target/'platform.png')
shutil.copyfile(OUTPUT/'panel-atlas.png',target/'panel-atlas.png')
(target/'panel-atlas.json').write_text(json.dumps(metadata,indent=2),encoding='utf-8')
print(json.dumps({'output':str(OUTPUT),'exact_samples':len(samples),'fallbacks':len(fallbacks),'piece_materials':piece_materials}))
