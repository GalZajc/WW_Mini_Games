"""Copy a playable Windows snapshot, preserving remote user data and old files."""
from pathlib import Path
from datetime import datetime, timezone
import os, json, hashlib, shutil, subprocess

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    'destination': r'\\192.168.112.83\C$\Users\galza\Downloads\WW Mini Games',
    'directories': ['renderer', 'node_modules', 'data'],
    'root_files': ['main.js', 'preload.js', 'package.json', 'package-lock.json', 'icon.ico',
                   'WW Mini Games - launch.vbs', 'setup_and_run.bat', 'README.md'],
    'excluded_directories': ['OUTPUT', '__pycache__', '.git', 'reromo-tetris-projection-cache'],
    'excluded_files': ['mobile_controller_state.json', 'tetris-physics-last.json'],
    'preserve_existing_remote_data': True,
    'verify_sha256': True,
}

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

if __name__ == '__main__':
    destination = Path(PARAMETERS['destination'])
    if not destination.parent.is_dir():
        raise RuntimeError('Garey Downloads is not accessible')
    out = ROOT / 'scripts/OUTPUT' / ('garey-app-copy_' + datetime.now(timezone.utc).strftime('%Y-%m-%d_%H-%M-%SZ'))
    out.mkdir(parents=True)
    PARAMETERS['source'] = str(ROOT)
    PARAMETERS['source_commit_before_copy'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    (out / 'parameters.json').write_text(json.dumps(PARAMETERS, indent=2), encoding='utf-8')
    files = [ROOT / name for name in PARAMETERS['root_files'] if (ROOT / name).is_file()]
    for directory in PARAMETERS['directories']:
        for base, dirs, names in os.walk(ROOT / directory):
            dirs[:] = [d for d in dirs if d not in PARAMETERS['excluded_directories']]
            files.extend(Path(base) / n for n in names if n not in PARAMETERS['excluded_files'])
    destination.mkdir(exist_ok=True)
    manifest, copied, preserved, total_bytes = {}, [], [], 0
    for index, src in enumerate(files, 1):
        relative = src.relative_to(ROOT)
        dst = destination / relative
        if relative.parts[0] == 'data' and dst.exists():
            preserved.append(relative.as_posix())
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        source_hash = digest(src)
        if not dst.exists() or dst.stat().st_size != src.stat().st_size or digest(dst) != source_hash:
            shutil.copy2(src, dst)
            copied.append(relative.as_posix())
        if digest(dst) != source_hash:
            raise RuntimeError('Copy verification failed: ' + str(relative))
        manifest[relative.as_posix()] = source_hash
        total_bytes += src.stat().st_size
        if index % 200 == 0 or index == len(files):
            print(f'{index}/{len(files)} files verified ({total_bytes / 2**20:.1f} MiB)', flush=True)
    report = {'destination': str(destination), 'verified_files': len(manifest), 'bytes': total_bytes,
              'copied_files': copied, 'preserved_remote_data': preserved, 'sha256': manifest}
    (out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (destination / 'snapshot.json').write_text(json.dumps({'copied_utc': datetime.now(timezone.utc).isoformat(),
        'verified_files': len(manifest), 'source': 'WW Mini Games working copy', 'manifest': manifest}, indent=2), encoding='utf-8')
    print(json.dumps({'output': str(out), 'destination': str(destination), 'verified_files': len(manifest)}), flush=True)
