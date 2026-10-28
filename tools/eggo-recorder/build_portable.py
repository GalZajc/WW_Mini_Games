"""Build a self-contained Windows snapshot; never copy existing play recordings."""
from pathlib import Path
from datetime import datetime
import hashlib
import json
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
PARAMETERS = {'python_components': ['DLLs', 'Lib', 'tcl'],
              'packages': ['numpy', 'numpy.libs', 'PIL'],
              'random_seed': None, 'include_user_recordings': False}

def build():
    folder = ROOT / 'OUTPUT' / ('eggo-portable_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
    package = folder / 'Eggo Mania - zajem originala'
    source = package / 'tools/eggo-recorder'; source.mkdir(parents=True)
    for path in ROOT.iterdir():
        if path.is_file() and path.suffix in ('.py', '.json', '.md'):
            shutil.copy2(path, source / path.name)
    shutil.copytree(ROOT / 'runtime', source / 'runtime')
    config = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))
    rom = Path(config['rom'])
    shutil.copy2(rom, source / 'runtime/Eggo Mania.gba')
    config['rom'] = 'runtime/Eggo Mania.gba'
    (source / 'config.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    shutil.copy2(ROOT.parents[1] / 'Eggo Mania - zajem originala.vbs', package)
    python = Path(sys.base_prefix)
    runtime = package / 'runtime/python'; runtime.mkdir(parents=True)
    for pattern in ('python*.exe', '*.dll', 'LICENSE*'):
        for path in python.glob(pattern): shutil.copy2(path, runtime / path.name)
    for name in PARAMETERS['python_components']:
        print('Python:', name, flush=True)
        shutil.copytree(python / name, runtime / name,
            ignore=shutil.ignore_patterns('site-packages', '__pycache__', 'test', 'tests'))
    site = runtime / 'Lib/site-packages'; site.mkdir()
    for name in PARAMETERS['packages']:
        print('Package:', name, flush=True)
        shutil.copytree(python / 'Lib/site-packages' / name, site / name,
                        ignore=shutil.ignore_patterns('__pycache__', 'tests'))
    for pattern in ('numpy-*.dist-info', 'pillow-*.dist-info'):
        for path in (python / 'Lib/site-packages').glob(pattern): shutil.copytree(path, site / path.name)
    (package / 'PREBERI.txt').write_text(
        'Dvoklikni Eggo Mania - zajem originala.vbs. Namestitev ni potrebna.\n'
        'Originalni ROM, jedro in Python so vključeni v tem zasebnem paketu.\n'
        'Vsaka igra se samodejno shrani v tools/eggo-recorder/OUTPUT.\n'
        'Igraj in zapri okno. Ne briši posnetkov. Zvok je utišan.\n'
        'Xbox: smeri/palica, B=A, A=B, LB/RB=L/R, Menu=pavza.\n'
        'Tipkovnica: puščice, Space/Z=A, X=B, Q/R=L/R, Enter=pavza.\n'
        'Esc=premor zajema; F5=nova igra.\n', encoding='utf-8')
    files = {str(path.relative_to(package)): hashlib.sha256(path.read_bytes()).hexdigest()
             for path in package.rglob('*') if path.is_file()}
    parameters = {**PARAMETERS, 'python': str(python), 'source': str(ROOT), 'files': files}
    (folder / 'parameters.json').write_text(json.dumps(parameters, ensure_ascii=False, indent=2), encoding='utf-8')
    archive = folder / (package.name + '.zip')
    print('Pakiram', len(files), 'datotek …', flush=True)
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=1) as zipped:
        for path in package.rglob('*'):
            if path.is_file(): zipped.write(path, path.relative_to(folder))
    (folder / 'summary.json').write_text(json.dumps({'package': str(package), 'archive': str(archive),
        'bytes': sum(p.stat().st_size for p in package.rglob('*') if p.is_file()),
        'archive_sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, indent=2), encoding='utf-8')
    print(package)
    return package

if __name__ == '__main__': build()
