import json
from pathlib import Path
import sys, struct

sys.path.append(str(Path('tools/eggo-recorder').resolve()))
from core import Core

config = json.loads(Path('tools/eggo-recorder/config.json').read_text(encoding='utf-8'))
recording_dir = Path('tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398')

core = Core(
    core='tools/eggo-recorder/runtime/mgba_libretro.dll',
    rom=config['rom'],
    directory='scripts/OUTPUT',
    options=config.get('core_options'),
    capture_memory=True
)

start_frame = 58500
core.restore((recording_dir / f'after-frame-{start_frame:08d}.state').read_bytes())

masks = {}
with open(recording_dir / 'inputs.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        d = json.loads(line)
        if start_frame < d['frame'] <= 58670:
            masks[d['frame']] = d['mask']

for fnum in range(start_frame + 1, 58671):
    frame, audio, mem = core.step(masks.get(fnum, 0))

ewram = mem['02000000']

# CPU actor je v GBA na nekem naslovu, poglejmo FIELD_OBJECTS:
# player field: 0x02003910, cpu field: 0x02004C8C
# Actor pointer v field strukturi je na offsetu 0x0 ali 0x8 ali 0x24:
# V eggo-reference-probed.py: actor = struct.unpack_from('<I', ewram, field_offset + 0xsomething)
# Poglejmo celotno strukturo cpu field na 0x4c8c:
cpu_field = 0x4c8c
print("CPU Field at 0x02004c8c:")
for off in range(0, 0x100, 4):
    val = struct.unpack_from('<I', ewram, cpu_field + off)[0]
    # preverimo če je pointer v EWRAM (0x02000000..0x02040000)
    extra = ""
    if 0x02000000 <= val < 0x02040000:
        extra = f"-> EWRAM +0x{val - 0x02000000:04x}"
    if val != 0:
        print(f"  +0x{off:02x}: 0x{val:08x} ({val}) {extra}")
