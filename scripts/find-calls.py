rom_path = 'scripts/.tools/EggoReference.gba'
with open(rom_path, 'rb') as f:
    rom = f.read()

target = 0x08010e40
print(f"Searching BL/BLX calls to 0x{target:08x}...")

# In THUMB, BL is two 16-bit instructions:
# 11110xxxxxxxxxxx (first half)
# 11111xxxxxxxxxxx (second half)
for i in range(0, len(rom) - 4, 2):
    w1 = int.from_bytes(rom[i:i+2], 'little')
    w2 = int.from_bytes(rom[i+2:i+4], 'little')
    if (w1 & 0xf800) == 0xf000 and (w2 & 0xf800) == 0xf800:
        s_imm11 = w1 & 0x7ff
        if s_imm11 & 0x400:
            s_imm11 -= 0x800
        imm11 = w2 & 0x7ff
        offset = (s_imm11 << 12) | (imm11 << 1)
        pc = 0x08000000 + i + 4
        dest = pc + offset
        if dest == target:
            print(f"Call from 0x{pc-4:08x} (THUMB)")

# Also search word references (pointers)
import struct
for i in range(0, len(rom) - 4, 4):
    val = struct.unpack('<I', rom[i:i+4])[0]
    if val == target or val == target + 1:
        print(f"Pointer at 0x{0x08000000 + i:08x} -> 0x{val:08x}")
