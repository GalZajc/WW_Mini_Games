"""Summarize the first mismatch of the newest tests/OUTPUT/eggo-long-replay_* run.

python scripts/eggo-diff-latest.py <recording> [--dir run-dir]
Writes diff-<n>.json and panel-<n>.png (original | app | diff, zoomed around the bounding box) into the run dir.
"""
import argparse, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
ap = argparse.ArgumentParser(); ap.add_argument('recording'); ap.add_argument('--dir'); ap.add_argument('--pad', type=int, default=12)
a = ap.parse_args()
run = Path(a.dir) if a.dir else sorted((ROOT / 'tests' / 'OUTPUT').glob('eggo-long-replay_*'), key=lambda p: p.stat().st_mtime)[-1]
report = json.loads((run / 'report.json').read_text(encoding='utf-8'))
fm = report.get('firstMismatch')
if not fm: print('all matched', report); sys.exit(0)
n = fm['recordingFrame']; app = run / f'first-mismatch-app-frame-{n}.png'
subprocess.run([sys.executable, str(ROOT / 'scripts' / 'eggo-extract-frame.py'), a.recording, str(n), '--app', str(app), '--before', '1'], check=True, stdout=subprocess.DEVNULL)
rep = json.loads((run / f'diff-{n}.json').read_text(encoding='utf-8')); print(json.dumps({'run': str(run), 'matched': report['matched'], **rep}))
if rep['different_pixels']:
    x0, y0, x1, y1 = rep['bbox']; p = a.pad
    box = (max(0, x0 - p), max(0, y0 - p), min(240, x1 + p + 1), min(160, y1 + p + 1))
    o = Image.open(run / f'original-{n}.png').convert('RGB').crop(box); ap_ = Image.open(app).convert('RGB').crop(box)
    d = Image.open(run / f'diff-{n}.png').convert('RGB').crop(box)
    s = max(1, min(12, 360 // max(1, box[2] - box[0])))
    W, H = (box[2] - box[0]) * s, (box[3] - box[1]) * s
    panel = Image.new('RGB', (W * 3 + 20, H), 'white')
    for i, im in enumerate((o, ap_, d)): panel.paste(im.resize((W, H), 0), (i * (W + 10), 0))
    panel.save(run / f'panel-{n}.png'); print('panel', run / f'panel-{n}.png', 'box', box)
