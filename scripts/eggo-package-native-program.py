"""Package the timing context as compiled program + extracted resources.

This is not a claim of a completely decompiled game. The original platform
still executes RAM-resident ARM graphics helpers. No recording or subsequent
machine states are packaged, and no complete cartridge file is copied.
"""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json,shutil,zipfile
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--build',required=True);parser.add_argument('--install',action='store_true');args=parser.parse_args()
build=Path(args.build).resolve();bp=json.loads((build/'parameters.json').read_text(encoding='utf-8'));ap=bp['aotParameters']
P={'build':str(build.relative_to(ROOT)),'bootstrap':'scripts/OUTPUT/eggo-cycle-bootstrap_2026-10-27T01-09-22-895Z/before-survival.state',
 'bootstrapPC':0x080016b4,'bootstrapFrame':372,'seedAddress':0x02011aac,'characterAddress':0x020003d4,
 'programData':'Extracted original non-compiled ranges, including graphics, literals and RAM-resident code.',
 'execution':'Known ROM Thumb/ARM and fixed EWRAM IRQ code statically specialized; all remaining BIOS/RAM/ROM code uses the original platform CPU decoder.',
 'romIncluded':False,'fullCartridgeMemoryReconstructedAtRuntime':True,'recordedEventsOrAudioIncluded':False,
 'sourceRomSha256':ap['romSha256'],'compiledImageRanges':ap['compiledImageRanges'],'install':args.install}
rom=Path(ap['rom']).read_bytes();assert hashlib.sha256(rom).hexdigest()==P['sourceRomSha256']
out=ROOT/'scripts/OUTPUT'/('eggo-native-program-package_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
assets=out/'assets';assets.mkdir();blocks=[];data=bytearray();cursor=0
for start,end in sorted(P['compiledImageRanges'])+[(len(rom),len(rom))]:
 if start>cursor:
  blocks.append({'offset':cursor,'assetOffset':len(data),'length':start-cursor});data.extend(rom[cursor:start])
 cursor=max(cursor,end)
(assets/'program-data.bin').write_bytes(data)
shutil.copy2(build/'cycle-reference.wasm',assets/'program.wasm');shutil.copy2(ROOT/P['bootstrap'],assets/'before-survival.bin')
# Corresponding source for all linked platform units, headers and generated
# program units. The proprietary input cartridge and toolchain are not copied.
source=ROOT/bp['source'];paths={ROOT/k for k in bp['sourceSha256']}
paths.update(p for p in (source/'include').rglob('*')if p.is_file())
paths.update(source.glob('src/**/*.h'))
paths.update(p for p in (ROOT/'scripts/.tools/mgba-native-audio-build/include').rglob('*')if p.is_file())
paths.update([Path(__file__),ROOT/'scripts/eggo-recompile-thumb-program.py',ROOT/'scripts/eggo-build-cycle-reference.py',build/'parameters.json',
 ROOT/'scripts/native-audio/mgba-cycle-stems.c',ROOT/'scripts/native-audio/cycle-audio-engine.mjs',ROOT/'scripts/native-audio/cycle-music-shadow.mjs'])
paths.update((ROOT/'renderer/games/eggo-mania').glob('native-program-*.js'))
paths.add(ROOT/'renderer/games/eggo-mania/native-sound-vm.js')
paths.update(p for p in source.glob('*')if p.is_file()and ('LICENSE'in p.name.upper()or'COPYING'in p.name.upper()))
with zipfile.ZipFile(assets/'program-source.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9)as z:
 for p in sorted(paths):
  if p.exists():z.write(p,p.relative_to(ROOT).as_posix())
description=('Original-game audio timing context.\n'+P['execution']+'\n'+
 'The runtime reconstructs cartridge bus memory from compiled instruction constants and extracted data.\n'+
 'This is not a sound-only engine or a completely decompiled replacement game.\n'+
 'Initial state is before the Survival constructor; seed and character are selected at runtime.\n'+
 'No recorded future states, sound events, input tape or PCM stream are included.\n'+
 'Platform sources retain their individual MPL/LGPL notices; corresponding source: program-source.zip.\n')
(assets/'README.txt').write_text(description,encoding='utf-8')
hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(assets.iterdir())}
version=hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest()[:16]
manifest={**P,'version':version,'romSize':len(rom),'blocks':blocks,'assetSha256':hashes}
(assets/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(assets/'version.js').write_text("export const NATIVE_PROGRAM_VERSION="+json.dumps(version)+";\n",encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
if args.install:
 target=ROOT/'renderer/games/eggo-mania/assets/native-program';target.mkdir(parents=True,exist_ok=True)
 for p in assets.iterdir():shutil.copy2(p,target/p.name)
print(json.dumps({'out':str(out),'dataBytes':len(data),'compiledCodeBytes':len(rom)-len(data),'assets':list(hashes),'version':version,'installed':args.install}))
