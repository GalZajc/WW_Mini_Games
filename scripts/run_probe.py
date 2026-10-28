import struct, subprocess
from pathlib import Path

def encode_thumb_bl(address, target):
    displacement = target - (address + 4)
    immediate = (displacement >> 1) & 0x3fffff
    return struct.pack('<HH', 0xf000 | ((immediate >> 11) & 0x7ff), 0xf800 | (immediate & 0x7ff))

rom_path = 'scripts/.tools/EggoReference.gba'
rom = bytearray(open(rom_path, 'rb').read())

hook_addr = 0x08011cc0
wrapper_addr = 0x083f9800

insts = [
    0xb50c, # push {r2, r3, lr}
    0x4a05, # ldr r2, [pc, #20]
    0x6010, # str r0, [r2]
    0x686b, # ldr r3, [r5, #4]
    0x6053, # str r3, [r2, #4]
    0x6cf3, # ldr r3, [r6, #0x4c]
    0x6093, # str r3, [r2, #8]
    0x60d6, # str r6, [r2, #12]
    0x2400, # movs r4, #0
    0x6869, # ldr r1, [r5, #4]
    0xbd0c, # pop {r2, r3, pc}
    0x46c0, # nop
]
blob = struct.pack('<12HI', *insts, 0x02031900)

wrapper_off = wrapper_addr - 0x08000000
rom[wrapper_off : wrapper_off + len(blob)] = blob
hook_off = hook_addr - 0x08000000
rom[hook_off : hook_off + 4] = encode_thumb_bl(hook_addr, wrapper_addr)

patched_rom_path = 'scripts/OUTPUT/EggoPatched.gba'
open(patched_rom_path, 'wb').write(rom)
print('Patched ROM created.')

cmd = [
    'python', 'scripts/eggo-reference-probed.py',
    '--load=scripts/OUTPUT/eggo-reference_2026-10-20_23-13-39_014355/ref_spawn_trace.frame00011.state',
    '--steps-file=scripts/scratch_steps.json',
    '--sample-every=1'
]
res = subprocess.run(cmd, capture_output=True, text=True)
print('STDOUT:', res.stdout)
if res.stderr:
    print('STDERR:', res.stderr)

for line in res.stdout.splitlines():
    if line.endswith('current.png'):
        out_dir = Path(line).parent
        ram1 = (out_dir / 'current.frame00001.ram').read_bytes()
        t, y, l, e = struct.unpack('<IIII', ram1[0x31900 : 0x31910])
        print(f'Frame 1: threshold={t/65536.0:.4f} actor_y={y/65536.0:.4f} life={l} enemy=0x{e:08x}')
        ram2 = (out_dir / 'current.frame00002.ram').read_bytes()
        t, y, l, e = struct.unpack('<IIII', ram2[0x31900 : 0x31910])
        print(f'Frame 2: threshold={t/65536.0:.4f} actor_y={y/65536.0:.4f} life={l} enemy=0x{e:08x}')
