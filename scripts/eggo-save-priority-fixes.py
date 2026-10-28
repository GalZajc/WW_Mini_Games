"""Hash-verified source checkpoint and the bounded evidence for priority fixes."""
from pathlib import Path
from datetime import datetime
import json,hashlib,zipfile,shutil
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'experiment':'Eggo Mania priority water/throw/rescue/fish/bomb corrections',
 'full_frame_audit':'scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_20-04-46_531423',
 'render_audit':'tests/OUTPUT/eggo-mania-visual_2026-10-18T18-07-42-685Z',
 'water_continuation':'scripts/OUTPUT/eggo-arena-water-audit_2026-10-18_20-07-32_447527',
 'seed':'Original checkpoint RNG; diagnostic setup writes in native capture JSON',
 'muted':True,'desktop_automation':False}
stamp=datetime.now().strftime('%Y-%m-%d_%H-%M-%S');out=ROOT/'scripts/OUTPUT'/('eggo-priority-checkpoint_'+stamp);out.mkdir(parents=True)
full=json.loads((ROOT/PARAMETERS['full_frame_audit']/'results.json').read_text(encoding='utf-8'))
assert full['exact_frames']==600 and full['different_pixels_over_all_frames']==0
reports={}
for name in ['arena-water-report.json','arena-throw-report.json','bomb-fuse-report.json','fish-affine-report.json','shark-affine-report.json']:
 data=json.loads((ROOT/PARAMETERS['render_audit']/name).read_text(encoding='utf-8'));assert data['differentPixels']==0;reports[name]=data
 shutil.copyfile(ROOT/PARAMETERS['render_audit']/name,out/name)
log=ROOT/'scripts/OUTPUT/current-priority-model-tests.log';shutil.copyfile(log,out/log.name)
assert 'pass 20' in log.read_text(encoding='utf-8') and 'fail 0' in log.read_text(encoding='utf-8')
baseline=Path.home()/'Downloads/Eggo Mania verified tall-water fixes 2026-10-18_17-39-23.zip'
with zipfile.ZipFile(baseline)as saved:names={n for n in saved.namelist()if n!='backup-manifest.json'and(ROOT/n).is_file()}
for folder,pattern in [('renderer/games/eggo-mania','**/*'),('scripts','eggo*'),('tests','eggo*'),('tests/fixtures','eggo*')]:
 for path in (ROOT/folder).glob(pattern):
  if path.is_file()and'OUTPUT'not in path.parts and path.suffix in {'.js','.json','.png','.mjs','.py','.ps1','.md'}:names.add(path.relative_to(ROOT).as_posix())
manifest={name:{'bytes':(ROOT/name).stat().st_size,'sha256':hashlib.sha256((ROOT/name).read_bytes()).hexdigest()}for name in sorted(names)}
archive=Path.home()/'Downloads'/('Eggo Mania priority fixes '+stamp+'.zip')
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6)as saved:
 for name in sorted(names):saved.write(ROOT/name,name)
 saved.writestr('backup-manifest.json',json.dumps({'parameters':PARAMETERS,'files':manifest},indent=2))
with zipfile.ZipFile(archive)as saved:
 assert saved.testzip()is None
 for name,data in manifest.items():assert hashlib.sha256(saved.read(name)).hexdigest()==data['sha256']
PARAMETERS.update({'backup':str(archive),'backup_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
 'source_files':len(names),'full_frame_results':full,'render_results':reports,'model_checks_passed':20})
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
print(archive);print(out)
