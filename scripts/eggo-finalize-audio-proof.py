"""Collect verified results and pin the exact historical full-replay sources."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
P={'completeWorker':'scripts/OUTPUT/eggo-program-worker_2026-10-27T02-59-34-583Z',
 'completePlayer':'scripts/OUTPUT/eggo-program-player_2026-10-27T10-00-06-622Z',
 'completePackage':'scripts/OUTPUT/eggo-native-program-package_2026-10-27T02-59-32_101723Z/assets',
 'finalPrefix':'scripts/OUTPUT/eggo-program-worker_2026-10-27T03-45-23-255Z',
 'actualPlayer':'scripts/OUTPUT/eggo-pcm-stream-comparison_2026-10-27T02-48-28_431023Z',
 'genericStartup':'scripts/OUTPUT/eggo-cycle-reference_2026-10-27T02-41-54-951Z',
 'http':'scripts/OUTPUT/eggo-http-audio_2026-10-27T03-32-16-952Z',
 'visualPrefix':'tests/OUTPUT/eggo-long-replay_2026-10-27T03-07-55-527Z',
 'publication':'scripts/OUTPUT/eggo-site-audio-publish_2026-10-27_10-28-29Z/deployment.json',
 'targetedTests':22,'originalSeed':1492,'originalCharacter':'yolko',
 'otherStartupSeed':7,'otherStartupCharacter':'eggo','otherStartupArena':'pirate',
 'sampleRate':32768,'originalFrames':[401,109076]}
out=ROOT/'scripts/OUTPUT'/('eggo-sound-verification_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
read=lambda p:json.loads(p.read_text(encoding='utf-8'))
reports={k:read(ROOT/P[k]/'comparison.json')for k in ['completeWorker','completePlayer','finalPrefix','actualPlayer','genericStartup']}
reports['http']=read(ROOT/P['http']/'report.json');reports['visualPrefix']=read(ROOT/P['visualPrefix']/'report.json');reports['publication']=read(ROOT/P['publication'])
assert reports['completeWorker']['matched']==108676 and reports['completeWorker']['samples']==59621888 and reports['completeWorker']['firstMismatch']is None
assert reports['completePlayer']['matched']==108676 and reports['completePlayer']['samples']==59621888 and reports['completePlayer']['firstMismatch']is None
assert reports['completePlayer']['gaps']==0 and reports['completePlayer']['sourceNodes']==217352
assert reports['completePlayer']['finalScheduledSample']==reports['completePlayer']['expectedFinalScheduledSample']
assert reports['finalPrefix']['matched']==600 and reports['finalPrefix']['firstMismatch']is None
assert reports['genericStartup']['matched']==600 and reports['genericStartup']['firstMismatch']is None
assert reports['actualPlayer']['exactMatchOverCommonSamples']and reports['actualPlayer']['comparedSampleFrames']==328704
assert not reports['http']['errors']and reports['http']['playing']['original']and reports['http']['playing']['phase']=='playing'
assert reports['visualPrefix']['allMatched']and reports['publication']['status']=='succeeded'
expected=read(ROOT/P['completeWorker']/'parameters.json')['sourceHashes'];recovered={}
package=ROOT/P['completePackage']
with zipfile.ZipFile(package/'program-source.zip')as source:
 for name,digest in expected.items():
  relative=Path(name);assert not relative.is_absolute()and'..'not in relative.parts
  current=ROOT/relative;data=current.read_bytes()if current.exists()else b'';origin='current source'
  if hashlib.sha256(data).hexdigest()!=digest:
   if name.endswith('assets/native-program/manifest.json'):data=(package/'manifest.json').read_bytes();origin='full-replay package manifest'
   elif name.replace('\\','/')in source.namelist():data=source.read(name.replace('\\','/'));origin='full-replay corresponding source archive'
   else:raise ValueError('Missing exact historical proof source: '+name)
  assert hashlib.sha256(data).hexdigest()==digest,name
  target=out/'complete-replay-sources'/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  recovered[name]={'sha256':digest,'recoveredFrom':origin}
P['completeReplaySourceSnapshot']=recovered
currentExpected=read(ROOT/P['completePlayer']/'parameters.json')['sourceHashes']
for name,digest in currentExpected.items():
 relative=Path(name);assert not relative.is_absolute()and'..'not in relative.parts
 data=(ROOT/relative).read_bytes();assert hashlib.sha256(data).hexdigest()==digest,name
 target=out/'current-player-sources'/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
P['completeCurrentPlayerSourceSnapshot']=currentExpected
P['currentAssetManifest']=read(ROOT/'renderer/games/eggo-mania/assets/native-program/manifest.json')
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
(out/'verification.json').write_text(json.dumps(reports,indent=2),encoding='utf-8')
print(json.dumps({'out':str(out),'fullStereoSamples':reports['completeWorker']['samples'],'differences':0,'version':reports['publication']['version_number'],'historicalSourcesPinned':len(recovered)}))
