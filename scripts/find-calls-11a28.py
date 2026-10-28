rom_path = 'scripts/.tools/EggoReference.gba'
with open(rom_path, 'rb') as f:
    rom = f.read()

target = 0x08011a28
print(f"Searching BL calls to 0x{target:08x}:")
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
