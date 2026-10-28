"""Recover the fixed height-indicator rails from original framebuffer captures."""
from pathlib import Path
from datetime import datetime
import hashlib
import json
import argparse
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--render',help='Optional native-resolution Electron screenshot to compare')
args=parser.parse_args()
PARAMETERS = {
    'source': 'scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower.frame00840.png',
    'rectangle': [112, 0, 128, 1],
    'height': 160,
    'comparisons': ['dragon-assets', 'castle-assets', 'pirate-assets', 'round5', 'round6', 'round7', 'round8'],
    'seed': None,
}
OUT = ROOT/'scripts/OUTPUT'/('eggo-divider_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
OUT.mkdir(parents=True, exist_ok=True)
source = ROOT/PARAMETERS['source']
strip = Image.open(source).convert('RGB').crop(PARAMETERS['rectangle'])
records = []
for name in PARAMETERS['comparisons']:
    path = ROOT/'tests/artifacts/eggo-reference'/f'{name}.png'
    comparison = Image.open(path).convert('RGB').crop(PARAMETERS['rectangle'])
    equal = comparison.tobytes() == strip.tobytes()
    records.append({'source': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'equal': equal})
    assert equal, name
divider = strip.resize((strip.width, PARAMETERS['height']), Image.Resampling.NEAREST)
divider.save(ROOT/'renderer/games/eggo-mania/assets/progress-divider.png')
divider.save(OUT/'progress-divider.png')
metadata = {'parameters': PARAMETERS, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'script_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), 'comparisons': records,
            'limits': 'Fixed rails only; portrait positions and foreground overlap are separate.'}
if args.render:
    path=ROOT/args.render
    rectangle=[112,0,128,96]
    rendered=Image.open(path).convert('RGB').crop(rectangle)
    original=Image.open(source).convert('RGB').crop(rectangle)
    differences=sum(a!=b for a,b in zip(rendered.getdata(),original.getdata()))
    metadata['render_check']={'source':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                             'rectangle':rectangle,'different_pixels':differences}
    assert differences==0,metadata['render_check']
(OUT/'parameters.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
(ROOT/'renderer/games/eggo-mania/assets/progress-divider.json').write_text(json.dumps(metadata, indent=2), encoding='utf-8')
print(OUT)
