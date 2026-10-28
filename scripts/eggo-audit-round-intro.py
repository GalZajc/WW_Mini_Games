"""Inspect recorded round startup at video_refresh, without replaying or changing it."""
from pathlib import Path
from datetime import datetime
import argparse, hashlib, json, struct, sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/eggo-recorder'))
from capture import frames, rgb_image

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('recording', type=Path)
    ap.add_argument('--first', type=int, default=400)
    ap.add_argument('--last', type=int, default=650)
    ap.add_argument('--pictures', default='401,402,403,432,450,500,600,650')
    a = ap.parse_args()
    p = json.loads((a.recording / 'parameters.json').read_text(encoding='utf-8'))
    out = ROOT / 'scripts/OUTPUT' / ('eggo-round-intro_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
    out.mkdir(parents=True)
    (out/'parameters.json').write_text(json.dumps({**vars(a), 'recording':str(a.recording),
        'source_parameters_sha256':hashlib.sha256((a.recording/'parameters.json').read_bytes()).hexdigest(),
        'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'sampling':'recorded video_refresh; no writes'}, indent=2, default=str), encoding='utf-8')
    offsets = {}; pos = 0
    for name, size in p['layout'][1:]:
        offsets[name] = (pos, size); pos += size
    rows = []; palettes = {}; pictures = set(map(int,a.pictures.split(',')))
    for record, video, mem in frames(a.recording, first=a.first, last=a.last):
        n = record['frame']
        if n < a.first: continue
        data = {name:mem[o:o+s] for name,(o,s) in offsets.items()}
        ew,io,pa,oa = [data[name] for name in ['02000000','04000000','05000000','07000000']]
        u = lambda offset: struct.unpack_from('<I',ew,offset)[0]
        i = lambda offset: struct.unpack_from('<i',ew,offset)[0]
        row = {'frame':n,'native_frame':u(0x11a9c),'clock':u(0x16c),'rng':u(0x11aac)&65535,
               'cpu_keys':u(0xe9a8),
               'podium':{'counter':u(0x318f4),'gate':u(0x328c),'mode':u(0x20),'globalClock':u(0xc8)},
               'palette_fade':{'level':i(0x3328),'outgoing':ew[0x3334]},
               'throw_targets':[[i(base+off) for off in [0x8bc,0x8c0,0x8d8,0x8dc]] for base in [0x3bd4,0x4f50]],
               'actor_rotations':[i(base+0x868) for base in [0x3bd4,0x4f50]],
               'cpu_controller':{name:i(0x5a40+off) for name,off in
                   {'target':0,'waypoint':4,'state':8,'rotation_wait':0xb4,'rotation_target':0xb8,'clock':0xc8,
                    'best_score':0xd8,'rotation_cursor':0xdc,'column_cursor':0xe0,
                    'stall':0x104,'period':0x100,'difficulty':0xf0,'counterCC':0xcc,'counterD0':0xd0}.items()},
               'actors':[[i(base+off) for off in [0,4,0x14,0x18,0x874,0x838,0x854,0x85c,0x860]] for base in [0x3bd4,0x4f50]],
               'cameras':[[i(base+off) for off in [0,4,0x70]] for base in [0x3910,0x4c8c]],
               'io':list(struct.unpack_from('<48H',io)),
               'objects':[list(struct.unpack_from('<3H',oa,k*8)) for k in range(8)]}
        # Emit physical coordinates in pixels as well as raw actor words, so
        # subpixel discrepancies are not hidden by comparing Q16 integers to
        # the app's floating-point pixel coordinates by eye.
        row['enemies'] = [
            {**{key:i(base+off)/65536 for key,off in
                {'x':0,'y':4,'vx':0x14,'vy':0x18}.items()},
             **{key:i(base+off) for key,off in
                {'animation':0x20,'kind':0x24,'animationClock':0x28,
                 'active':0x48,'life':0x4c,'variant':0x50,'angle':0x54,'speed':0x58}.items()}}
            for base in [0x31038,0x310b8,0x31138,0x311b8]]
        row['inventories'] = [i(base+0x864) for base in [0x3bd4,0x4f50]]
        row['completed_floors'] = [i(base+0x934) for base in [0x3bd4,0x4f50]]
        row['divider_y_10_13'] = [struct.unpack_from('<H',oa,k*8)[0]&255 for k in [10,11,12,13]]
        row['waterlines'] = [i(0x3bb8+side*0x137c)/65536 for side in range(2)]
        row['collapse_timers'] = [[(index, value) for index, value in
            enumerate(struct.unpack_from('<47i', ew, base+0x12ac)) if value >= 0]
            for base in [0x333c, 0x46b8]]
        row['support_bypass'] = [i(board+0xebc) for board in [0xf404,0x10650]]
        row['pickups'] = []
        for manager in [0x34e4, 0x4860]:
            pointer = u(manager+0x418)
            items, seen = [], set()
            while pointer:
                at = pointer-0x02000000-0x1c
                assert 0 <= at <= len(ew)-0x34 and at not in seen and len(seen) < 18
                seen.add(at)
                items.append({'address':hex(at), **{key:i(at+delta) for key,delta in
                    {'x':0,'y':4,'vx':0x14,'vy':0x18,'state':0x24,'kind':0x28,
                     'variant':0x2c,'wait':0x30}.items()}})
                pointer = u(at+0x1c)
            row['pickups'].append(items)
        row['projectile_visuals'] = [[
            {'x':i(field+0x1098+slot*0x3c)/65536,
             'y':i(field+0x109c+slot*0x3c)/65536,
             'clock':i(field+0x10c0+slot*0x3c),
             'angle':i(field+0x10c8+slot*0x3c),
             'type':i(field+0x10cc+slot*0x3c),
             'bodyActive':i(field+0xf80+slot*0x28)&255,
             'bodyX':i(field+0xf84+slot*0x28)/65536,
             'bodyY':i(field+0xf88+slot*0x28)/65536,
             'velocityY':i(field+0xf94+slot*0x28)/65536,
             'travelCounter':i(field+0xf9c+slot*0x28)}
            for slot in range(7)] for field in (0xf404,0x10650)]
        palettes[n] = np.frombuffer(pa,dtype='<u2').copy()
        rows.append(row)
        if n in pictures:
            rgb_image(video,p['width'],p['height'],p['pixel_format']).save(out/f'original-{n}.png')
            for name,b in data.items(): (out/f'frame-{n}.{name}').write_bytes(b)
        if n >= a.last: break
    full = palettes[max(palettes)]
    base = np.stack([((full>>shift)&31).astype(np.int32) for shift in [0,5,10]])
    for row in rows:
        pal = palettes[row['frame']]
        values = np.stack([((pal>>shift)&31).astype(np.int32) for shift in [0,5,10]])
        candidates = []
        for denominator in [16,32]:
            for step in range(denominator+1):
                for rounding in [0,denominator-1]:
                    predicted = (base*step+rounding)//denominator
                    candidates.append((int(np.count_nonzero(predicted!=values)),denominator,step,rounding))
        row['palette_fit'] = list(min(candidates))
    (out/'trace.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
    print(out)
    for row in rows[:36]: print(row['frame'],row['native_frame'],row['palette_fit'],flush=True)

if __name__ == '__main__': main()
