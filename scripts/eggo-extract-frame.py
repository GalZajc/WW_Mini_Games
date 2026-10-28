"""Extract original frames (and optional diff vs an app PNG) from a long capture.

python scripts/eggo-extract-frame.py <recording> <frame> [--app app.png] [--before N] [--out dir]
Frame numbers are recording frame numbers (1-based). Writes original-<n>.png, and diff-<n>.png/report if --app.
"""
import argparse, json, sys
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools' / 'eggo-recorder'))
import capture

ap = argparse.ArgumentParser(); ap.add_argument('recording'); ap.add_argument('frame', type=int)
ap.add_argument('--app'); ap.add_argument('--before', type=int, default=0); ap.add_argument('--out', default=None)
a = ap.parse_args()
rec = Path(a.recording); p = json.loads((rec / 'parameters.json').read_text(encoding='utf-8'))
out = Path(a.out) if a.out else Path(a.app).parent if a.app else ROOT / 'scripts' / 'OUTPUT' / 'eggo-frames'
out.mkdir(parents=True, exist_ok=True)
first = max(1, a.frame - a.before)
for record, video, mem in capture.frames(rec, first=first, last=a.frame):
    n = record['frame']
    if n < first: continue
    img = capture.rgb_image(video, p['width'], p['height'], p['pixel_format']); img.save(out / f'original-{n}.png')
    if n == a.frame:
        if a.app:
            app = np.asarray(Image.open(a.app).convert('RGB')).astype(int); org = np.asarray(img).astype(int)
            d = np.any(app != org, axis=2); ys, xs = np.nonzero(d)
            rep = {'frame': n, 'different_pixels': int(d.sum())}
            if d.any():
                rep.update(bbox=[int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())], first=[int(xs[0]), int(ys[0])],
                           first_app=app[ys[0], xs[0]].tolist(), first_original=org[ys[0], xs[0]].tolist())
            Image.fromarray((d * 255).astype('uint8')).save(out / f'diff-{n}.png')
            (out / f'diff-{n}.json').write_text(json.dumps(rep, indent=2), encoding='utf-8'); print(json.dumps(rep))
        break
print('saved to', out)
