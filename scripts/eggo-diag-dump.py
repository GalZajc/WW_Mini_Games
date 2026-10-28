import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools' / 'eggo-recorder'))
import capture

rec = Path('tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398')
target_frame = int(sys.argv[1]) if len(sys.argv) > 1 else 33199
out = ROOT / 'tests' / 'OUTPUT' / f'diag_{target_frame}'
out.mkdir(parents=True, exist_ok=True)

params = json.loads((rec / 'parameters.json').read_text(encoding='utf-8'))
layout = params['layout']
video_bytes = layout[0][1]

for record, video, mem in capture.frames(rec, first=target_frame, last=target_frame):
    if record['frame'] != target_frame: continue
    print(f"Dumping frame {target_frame}")
    offset = 0
    for name, size in layout[1:]:
        chunk = mem[offset:offset+size]
        offset += size
        (out / f'{name}.bin').write_bytes(chunk)
        print(f"  {name}: {len(chunk)} bytes")
    # Also save original PNG
    img = capture.rgb_image(video, params['width'], params['height'], params['pixel_format'])
    img.save(out / f'gba_frame_{target_frame}.png')
    print("Done")
    break
