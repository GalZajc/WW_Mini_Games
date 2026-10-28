"""Measure a freely falling native pickup from two input-only OAM captures."""
from pathlib import Path
from datetime import datetime
import csv, hashlib, json, math, struct
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    'sources': [
        ['scripts/OUTPUT/eggo-reference_2026-10-03_02-58-24_529443/filler-frames', 0],
        ['scripts/OUTPUT/eggo-reference_2026-10-03_03-27-09_694429/pickup-continuation', 80],
    ],
    'object_x': 20, 'object_palette': 2, 'object_size': 16,
    'affine_bounds': 32, 'frame_rate': 60, 'tile_pixels': 16,
    'period_frames': 60, 'angle_amplitude': math.pi / 6,
    'fall_pixels_per_frame': 59 / 60,
}
OUT = ROOT/'scripts/OUTPUT'/('eggo-pickup-measurements_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
OUT.mkdir(parents=True, exist_ok=True)
rows, sources = [], []
for relative, offset in PARAMETERS['sources']:
    base = ROOT/relative
    params = json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
    assert params['writes'] == [], 'Only input-only reference captures are valid'
    sources.append({'path': relative, 'frame_offset': offset,
                    'initial_state_sha256': params['initial_state_sha256'],
                    'rom_sha256': params['rom_sha256'], 'core_sha256': params['core_sha256'],
                    'trace_sha256': hashlib.sha256(Path(str(base)+'.trace.json').read_bytes()).hexdigest(),
                    'writes': params['writes'], 'steps': params['steps']})
    for path in sorted(base.parent.glob(base.name+'.frame*.0x7000000')):
        frame = int(path.name.split('.frame')[1][:5])+offset
        data = path.read_bytes()
        for index in range(4, 128):
            a0, a1, a2 = struct.unpack_from('<HHH', data, index*8)
            if (a0 & 0x300 != 0x300 or a0 >> 14 != 0 or a1 >> 14 != 1
                    or a2 >> 12 != PARAMETERS['object_palette'] or a1 & 511 != PARAMETERS['object_x']):
                continue
            matrix = (a1 >> 9) & 31
            pa, pb, pc, pd = [struct.unpack_from('<h', data, matrix*32+k)[0] for k in [6,14,22,30]]
            y = a0 & 255
            if y >= 192: y -= 256
            rows.append({'frame': frame, 'center_x_pixels': (a1 & 511)+16,
                         'center_y_pixels': y+16, 'angle_radians': math.atan2(pb,pa),
                         'inverse_matrix': [pa,pb,pc,pd]})
            break

f = np.array([r['frame'] for r in rows], dtype=float)
y = np.array([r['center_y_pixels'] for r in rows])
angle = np.array([r['angle_radians'] for r in rows])
# Native position is quantized downward by OAM. Fit the fractional starting
# coordinate, keeping the speed independently fixed for both recordings.
age = f-f[0]
best = min((float(np.max(abs(np.floor(age*PARAMETERS['fall_pixels_per_frame']+origin)-y))), float(origin))
           for origin in np.arange(y[0], y[0]+1, .0001))
wave = f*2*math.pi/PARAMETERS['period_frames']
design = np.column_stack([np.sin(wave),np.cos(wave),np.ones(len(f))])
coefs = np.linalg.lstsq(design,angle,rcond=None)[0]
phase = float(math.atan2(coefs[1],coefs[0])+wave[0])
predicted = PARAMETERS['angle_amplitude']*np.sin(age*2*math.pi/PARAMETERS['period_frames']+phase)
fixture = {'parameters': PARAMETERS, 'sources': sources, 'samples': rows,
           'first_frame': int(f[0]), 'initial_center_y_pixels': best[1],
           'initial_phase_radians': phase,
           'maximum_y_error_pixels': best[0],
           'maximum_angle_error_radians': float(max(abs(predicted-angle)))}
assert best[0] <= 1, fixture
assert fixture['maximum_angle_error_radians'] < .015, fixture
(OUT/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2),encoding='utf-8')
(OUT/'measurements.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
with (OUT/'samples.csv').open('w',encoding='utf-8',newline='') as file:
    writer=csv.DictWriter(file,fieldnames=rows[0].keys());writer.writeheader();writer.writerows(rows)
(ROOT/'tests/fixtures/eggo-pickup-gba.json').write_text(json.dumps(fixture,indent=2),encoding='utf-8')
print(json.dumps({'output':str(OUT),'samples':len(rows),'first_frame':int(f[0]),'last_frame':int(f[-1]),
                  'y_error_pixels':best[0],'angle_error_degrees':fixture['maximum_angle_error_radians']*180/math.pi}))
