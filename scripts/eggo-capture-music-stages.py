"""Capture music without SFX or gameplay interruptions using native Pause.

Arena discovery and capture use ordinary controller input, never RAM writes.
The retained menu state has NO SFX selected and Survival / Hard selected.
"""
from pathlib import Path
from datetime import datetime
import argparse, hashlib, json, struct, subprocess, sys

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--frames', type=int, default=9600)
parser.add_argument('--discover-only', action='store_true')
args = parser.parse_args()
PARAMETERS = {
    'menu_state': 'scripts/OUTPUT/eggo-reference_2026-10-03_17-45-50_639603/music-only-hard.state',
    'arena_names': ['beanstalk', 'factory', 'dragon', 'castle', 'pirate', 'space', 'jungle', 'park'],
    'arena_address': 0x3294, 'delays': list(range(8)),
    'entry_press_frames': 8, 'entry_wait_frames': 300, 'pause_press_frames': 1,
    'capture_frames': args.frames, 'discover_only': args.discover_only,
    'option': 'NO SFX', 'mode': 'Survival / Hard',
}
menu = ROOT / PARAMETERS['menu_state']
PARAMETERS['menu_state_sha256'] = hashlib.sha256(menu.read_bytes()).hexdigest()
out = ROOT / 'scripts/OUTPUT' / ('eggo-music-stages_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out / 'parameters.json').write_text(json.dumps(PARAMETERS, indent=2) + '\n', encoding='utf-8')
profiles = []; seen = set()

def run(name, load, steps, capture=False):
    command = [sys.executable, str(ROOT/'scripts/eggo-reference.py'), '--name', name, '--load', str(load), '--steps', json.dumps(steps)]
    if capture:
        command += ['--audio', '--music-trace']
    result = subprocess.run(command, cwd=ROOT, check=True, capture_output=True, encoding='utf-8')
    return Path(result.stdout.strip().splitlines()[-1]).with_suffix('')

for delay in PARAMETERS['delays']:
    steps = ([[delay, '']] if delay else []) + [[8, 'A'], [300, ''], [1, 'START'], [1, '']]
    probe = run(f'music-arena-delay-{delay}', menu, steps, True)
    raw = Path(str(probe)+'.ram').read_bytes()
    arena_id = struct.unpack_from('<I', raw, PARAMETERS['arena_address'])[0]
    assert arena_id < len(PARAMETERS['arena_names']), arena_id
    arena = PARAMETERS['arena_names'][arena_id]
    record = {'delay': delay, 'arena_id': arena_id, 'arena': arena, 'probe': probe.relative_to(ROOT).as_posix()}
    if arena not in seen and not args.discover_only:
        capture = run(f'{arena}-paused-music', Path(str(probe)+'.state'), [[args.frames, '']], True)
        record['source'] = capture.relative_to(ROOT).as_posix()
    seen.add(arena); profiles.append(record)
    (out/'profiles.json').write_text(json.dumps(profiles, indent=2)+'\n', encoding='utf-8')
    print(f'{delay+1}/{len(PARAMETERS["delays"])}: {arena}', flush=True)
print(out, flush=True)
