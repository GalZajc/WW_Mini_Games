"""Provide corresponding source, licenses and reproducible build instructions."""
from pathlib import Path
import json,zipfile
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'scripts/.tools/mgba-audio-source/mgba-70ed83c'
out=ROOT/'renderer/games/eggo-mania/assets/native-audio'
readme='''Eggo native sound hardware\n\nmGBA upstream70ed83c: https://github.com/mgba-emu/mgba/tree/70ed83c\nOriginal sources retain MPL-2.0 notices. blip_buf is LGPL-2.1-or-later.\nCorresponding sources and build script are in audio-hardware-source.zip.\n\nRebuild with wasi-sdk27, placing it at scripts/.tools/wasi-sdk-27.0-x86_64-windows\nand the upstream checkout at scripts/.tools/mgba-audio-source/mgba-70ed83c.\nPlace pristine src/gba/audio.c at scripts/.tools/mgba-audio-source/70ed83c/src/gba/audio.c.\nRun python scripts/eggo-build-audio-hardware.py from the project root.\nReplace audio-hardware.wasm with the rebuilt module to relink modified blip_buf.\nNo signature or installation restriction prevents replacement/relinking.\nThe audio-only module contains no cartridge, video renderer or emulated CPU.\n'''
(out/'LICENSES.txt').write_text(readme,encoding='utf-8')
with zipfile.ZipFile(out/'audio-hardware-source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
 for p in (source/'include').rglob('*.h'):z.write(p,'scripts/.tools/mgba-audio-source/mgba-70ed83c/'+p.relative_to(source).as_posix())
 for rel in ['LICENSE','src/gb/audio.c','src/core/timing.c','src/third-party/blip_buf/blip_buf.c','src/third-party/blip_buf/license.txt']:
  z.write(source/rel,'scripts/.tools/mgba-audio-source/mgba-70ed83c/'+rel)
 for rel in ['scripts/eggo-build-audio-hardware.py','scripts/native-audio/mgba-audio-bridge.c']:
  z.write(ROOT/rel,rel)
 z.write(ROOT/'scripts/.tools/mgba-audio-source/70ed83c/src/gba/audio.c','scripts/.tools/mgba-audio-source/70ed83c/src/gba/audio.c')
 z.writestr('README.txt',readme)
print(json.dumps({'sourceZip':str(out/'audio-hardware-source.zip'),'bytes':(out/'audio-hardware-source.zip').stat().st_size}))
