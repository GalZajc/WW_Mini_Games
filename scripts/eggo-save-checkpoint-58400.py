import os
import shutil
import json
import hashlib
from datetime import datetime
from pathlib import Path

root = Path('.').resolve()
ts = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
chk_dir = root / 'scripts' / 'OUTPUT' / f'eggo-source-checkpoint_{ts}'
chk_dir.mkdir(parents=True, exist_ok=True)

prev_checkpoints = sorted(list((root / 'scripts' / 'OUTPUT').glob('eggo-source-checkpoint_*')))
prev = [p for p in prev_checkpoints if p != chk_dir][-1]
prev_manifest = json.loads((prev / 'manifest.json').read_text(encoding='utf-8'))

files_to_copy = list(prev_manifest['files'].keys())
manifest_files = {}

for rel_path in files_to_copy:
    src_file = root / rel_path
    if not src_file.is_file():
        continue
    dst_file = chk_dir / rel_path
    dst_file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src_file, dst_file)
    data = dst_file.read_bytes()
    manifest_files[rel_path] = {
        'sha256': hashlib.sha256(data).hexdigest(),
        'bytes': len(data)
    }

replay_dirs = sorted(list((root / 'tests' / 'OUTPUT').glob('eggo-long-replay_*')))
verified_report = None
verified_params = None
if replay_dirs:
    verified_run = replay_dirs[-1]
    verified_report = verified_run / 'report.json'
    if verified_report.is_file():
        shutil.copy2(verified_report, chk_dir / 'verified-report.json')
    verified_params = verified_run / 'parameters.json'
    if verified_params.is_file():
        shutil.copy2(verified_params, chk_dir / 'verified-parameters.json')

if (root / 'EGGO_REPLAY_STATUS.md').is_file():
    shutil.copy2(root / 'EGGO_REPLAY_STATUS.md', chk_dir / 'EGGO_REPLAY_STATUS.md')

rep_data = json.loads(verified_report.read_text(encoding='utf-8')) if (verified_report and verified_report.is_file()) else {}
matched = rep_data.get('matched', 0)
first_mismatch = rep_data.get('firstMismatch')

manifest = {
    'created_at': ts,
    'source_checkpoint': str(chk_dir.name),
    'verified_matched_frames': matched,
    'first_mismatch': first_mismatch,
    'verified_run': verified_run.name if replay_dirs else None,
    'files': manifest_files
}

(chk_dir / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
print(f"Checkpoint saved: {chk_dir.name} ({len(manifest_files)} files, matched: {matched})")
