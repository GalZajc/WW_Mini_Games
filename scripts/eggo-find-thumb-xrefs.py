"""Find verified direct Thumb BL references to selected ROM functions."""
from pathlib import Path
from datetime import datetime
import argparse, csv, hashlib, json, struct, sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/.tools'))
from capstone import Cs, CS_ARCH_ARM, CS_MODE_THUMB

parser = argparse.ArgumentParser()
parser.add_argument('--source', default='C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba')
parser.add_argument('--base', type=lambda value: int(value, 0), default=0x08000000)
parser.add_argument('--targets', required=True, help='Comma-separated ROM addresses, e.g. 0x0800b480,0x0800b39c')
args = parser.parse_args()
rom_path = Path(args.source)
rom = rom_path.read_bytes()
targets = {int(item.strip(), 0) & ~1 for item in args.targets.split(',')}
decoder = Cs(CS_ARCH_ARM, CS_MODE_THUMB)

def signed(value, bits):
    sign = 1 << (bits - 1)
    return value - (1 << bits) if value & sign else value

calls = []
for offset in range(0, len(rom) - 3, 2):
    first, second = struct.unpack_from('<HH', rom, offset)
    if first & 0xf800 != 0xf000 or second & 0xf800 != 0xf800:
        continue
    displacement = signed(((first & 0x7ff) << 12) | ((second & 0x7ff) << 1), 23)
    address = args.base + offset
    destination = address + 4 + displacement
    if destination not in targets:
        continue
    decoded = list(decoder.disasm(rom[offset:offset + 4], address))
    if len(decoded) != 1 or decoded[0].mnemonic != 'bl':
        continue
    start, stop = max(0, offset - 16), min(len(rom), offset + 20)
    context = [{'address': f'0x{i.address:08x}', 'bytes': i.bytes.hex(),
                'mnemonic': i.mnemonic, 'operands': i.op_str}
               for i in decoder.disasm(rom[start:stop], args.base + start)]
    calls.append({'rom_offset': offset, 'address': f'0x{address:08x}',
                  'target': f'0x{destination:08x}', 'context': context})

parameters = {
    'source': str(rom_path),
    'source_sha256': hashlib.sha256(rom).hexdigest(),
    'base': f'0x{args.base:08x}',
    'targets': [f'0x{target:08x}' for target in sorted(targets)],
    'method': 'Scan aligned Thumb BL encodings and confirm each candidate with Capstone.',
    'limits': 'Finds direct Thumb BL calls only; indirect pointers and ARM-state calls need separate analysis.'
}
out = ROOT / 'scripts' / 'OUTPUT' / ('eggo-thumb-xrefs_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out / 'parameters.json').write_text(json.dumps(parameters, indent=2) + '\n', encoding='utf-8')
(out / 'callers.json').write_text(json.dumps(calls, indent=2) + '\n', encoding='utf-8')
with (out / 'callers.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=['rom_offset', 'address', 'target'])
    writer.writeheader()
    writer.writerows({key: call[key] for key in writer.fieldnames} for call in calls)
print(json.dumps({'count': len(calls), 'addresses': [call['address'] for call in calls],
                  'output': str(out)}, ensure_ascii=False))
