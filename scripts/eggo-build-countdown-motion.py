"""Compile the native countdown's per-frame affine motion into a view asset."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'timing':'scripts/OUTPUT/eggo-reference_2026-10-03_11-43-23_206712/factory-intro-timing',
            'pictures':'scripts/OUTPUT/eggo-reference_2026-10-03_11-09-58_790843/dragon-start',
            'picture_frames':[90,120,180,240],'frame_rate':60,'object':2}
OUT=ROOT/'scripts/OUTPUT'/('eggo-countdown-motion_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True,exist_ok=True)
known={}
for index,n in enumerate(PARAMETERS['picture_frames']):
    b=Path(str(ROOT/PARAMETERS['pictures'])+f'.frame{n:05d}')
    o=Path(str(b)+'.0x7000000').read_bytes();tile=struct.unpack_from('<H',o,PARAMETERS['object']*8+4)[0]&1023
    v=Path(str(b)+'.memory3').read_bytes()
    known[hashlib.sha256(v[0x10000+tile*32:0x10000+tile*32+2048]).hexdigest()]=index
base=ROOT/PARAMETERS['timing'];p=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
assert p['writes']==[] and p['oam_trace']
trace=json.loads(Path(str(base)+'.trace.json').read_text(encoding='utf-8'))
start=next(i for i,s in enumerate(trace) if known.get(s['preview_tile_sha256'])==0)
end=next(i for i in range(start+1,len(trace)) if trace[i]['preview_tile_sha256'] not in known)
rows=[]
for t in trace[start:end]:
    a0,a1,_=t['preview_oam'];x=a1&511;x=x-512 if x>=448 else x
    y=a0&255;y=y-256 if y>=192 else y;half=64 if a0&512 else 32
    rows.append([known[t['preview_tile_sha256']],x+half,y+half,*t['preview_matrix'],t['world_y']])
assert len(rows)==199
manifest={'parameters':PARAMETERS,'writes':p['writes'],'steps':p['steps'],
          'initial_state_sha256':p['initial_state_sha256'],
          'trace_sha256':hashlib.sha256(Path(str(base)+'.trace.json').read_bytes()).hexdigest(),
          'first_frame':start+1,'last_frame':end,'frames':rows}
assets=ROOT/'renderer/games/eggo-mania/assets'
(assets/'intro-countdown.js').write_text('export const INTRO_COUNTDOWN = '+json.dumps(rows)+';\n',encoding='utf-8')
(assets/'intro-countdown.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'parameters.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(OUT,'frames',len(rows))
