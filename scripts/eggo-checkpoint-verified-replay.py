"""Back up an explicitly selected full replay only if its source hashes still match."""
from pathlib import Path
from datetime import datetime
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--run', type=Path, required=True)
    parser.add_argument('--previous', type=Path, required=True)
    args = parser.parse_args()
    run = (ROOT / args.run).resolve()
    previous = (ROOT / args.previous).resolve()
    report = json.loads((run / 'report.json').read_text(encoding='utf-8'))
    parameters = json.loads((run / 'parameters.json').read_text(encoding='utf-8'))
    assert report.get('skippedRenders') == 0, 'A diagnostic suffix is not full-prefix evidence'
    assert report['matched'] > 0
    assert report['compared'] == report['matched'] + int(bool(report.get('firstMismatch')))
    for relative, expected in parameters['sourceHashes'].items():
        assert digest(ROOT / relative.replace('\\', '/')) == expected, f'Unverified source: {relative}'
    old = json.loads((previous / 'manifest.json').read_text(encoding='utf-8'))
    files = {relative.replace('\\', '/') for relative in
        set(old['files']) | set(parameters['sourceHashes'])} | {
        'EGGO_REPLAY_STATUS.md', 'scripts/eggo-checkpoint-verified-replay.py',
        'scripts/eggo-audit-round-intro.py', 'scripts/eggo-replay-model-state.mjs'}
    assert all((ROOT / relative).is_file() for relative in files), 'Missing checkpoint source'
    out = ROOT / 'scripts/OUTPUT' / ('eggo-source-checkpoint_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
    out.mkdir(parents=True)
    copied = {}
    for relative in sorted(files):
        source = ROOT / relative
        destination = out / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        assert digest(destination) == digest(source), f'Copy verification failed: {relative}'
        copied[relative] = {'sha256': digest(destination), 'bytes': destination.stat().st_size}
    first = parameters['startAfter'] + parameters.get('videoOffset', 0) + 1
    manifest = {
        'verified_recording_frames': [first, first + report['matched'] - 1],
        'first_mismatch': (report.get('firstMismatch') or {}).get('recordingFrame'),
        'matched_frames': report['matched'], 'seed': parameters['seed'],
        'start_after': parameters['startAfter'], 'report': str(run / 'report.json'),
        'previous_checkpoint': str(previous), 'production_hashes_match_verified_run': True,
        'all_copied_hashes_verified': True, 'files': copied}
    for name in ['report', 'parameters']:
        shutil.copy2(run / (name + '.json'), out / ('verified-' + name + '.json'))
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(out)
    print(f"Verified {report['matched']} exact frames: {manifest['verified_recording_frames']}")


if __name__ == '__main__':
    main()
