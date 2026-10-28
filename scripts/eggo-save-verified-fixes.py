"""Save the latest parity evidence and a hash-verified portable source backup."""
from pathlib import Path
from datetime import datetime
import zipfile,json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'experiment':'Singleton, tall-tower water recovery and skeletal-fish fixes',
 'tall_app':'tests/OUTPUT/eggo-mania-visual_2026-10-18T15-32-25-620Z',
 'tall_diff':'scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_17-34-11_212476',
 'tall_setup':'scripts/OUTPUT/eggo-tall-water_2026-10-18_14-14-27_096411',
 'fish_app':'tests/OUTPUT/eggo-mania-visual_2026-10-18T15-36-51-868Z',
 'singleton_cases':'scripts/OUTPUT/eggo-singleton-placement_2026-10-18_13-43-17_757686',
 'seed':'Original checkpoints; all diagnostic setup writes retained in source captures.',
 'muted':True,'desktop_automation':False}
stamp=datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
out=ROOT/'scripts/OUTPUT'/('eggo-verified-fixes_'+stamp);out.mkdir(parents=True)
# Correct the descriptive checkpoint label in the saved diagnostic report;
# measurements and screenshots are retained byte-for-byte.
setup=json.loads((ROOT/PARAMETERS['tall_setup']/'parameters.json').read_text(encoding='utf-8'))
metadata=ROOT/PARAMETERS['tall_app']/'parameters.json'
values=json.loads(metadata.read_text(encoding='utf-8'))
values['replayInitialPrefix']=setup['initial_prefix'];values['replayCapturePrefix']=setup['prefix']
values['inputReplaySources']['checkpoint']=setup['initial_prefix']+'.state'
values['inputReplaySources']['initialStateRestoration']='Logged 15-row diagnostic setup: board/art, roof caches and actor start on the roof; autonomous ordinary-input replay thereafter.'
metadata.write_text(json.dumps(values,indent=2)+'\n',encoding='utf-8')
report=json.loads((ROOT/PARAMETERS['tall_diff']/'results.json').read_text(encoding='utf-8'))
assert report['exact_frames']==600 and report['different_pixels_over_all_frames']==0
fish=json.loads((ROOT/PARAMETERS['fish_app']/'fish-affine-report.json').read_text(encoding='utf-8'))
assert fish['differentPixels']==0 and fish['cases']==10
PARAMETERS['tall_results']=report;PARAMETERS['fish_results']=fish
for name in ['current-focused-tests.log','current-water-rise-tests.log']:
 shutil.copyfile(ROOT/'scripts/OUTPUT'/name,out/name)
old=Path.home()/'Downloads/Eggo Mania verified source backup 2026-10-18_04-35-46.zip'
with zipfile.ZipFile(old)as baseline:
 names={name for name in baseline.namelist()if name!='backup-manifest.json'and(ROOT/name).is_file()}
for folder,pattern in [('renderer/games/eggo-mania','**/*'),('scripts','eggo*'),('tests','eggo*'),('tests/fixtures','eggo*')]:
 for path in (ROOT/folder).glob(pattern):
  if path.is_file()and'OUTPUT'not in path.parts and path.suffix in {'.js','.json','.png','.mjs','.py','.ps1','.md'}:
   names.add(path.relative_to(ROOT).as_posix())
manifest={name:{'bytes':(ROOT/name).stat().st_size,'sha256':hashlib.sha256((ROOT/name).read_bytes()).hexdigest()}
 for name in sorted(names)}
archive=Path.home()/'Downloads'/('Eggo Mania verified tall-water fixes '+stamp+'.zip')
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as backup:
 for name in sorted(names):backup.write(ROOT/name,name)
 backup.writestr('backup-manifest.json',json.dumps({'parameters':PARAMETERS,'files':manifest},indent=2))
with zipfile.ZipFile(archive)as backup:
 assert backup.testzip()is None
 for name,entry in manifest.items():assert hashlib.sha256(backup.read(name)).hexdigest()==entry['sha256']
PARAMETERS['backup']={'path':str(archive),'files':len(names),'bytes':archive.stat().st_size,
 'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'all_file_hashes_verified':True}
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(json.dumps(PARAMETERS['backup'],indent=2));print(out)
