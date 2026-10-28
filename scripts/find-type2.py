rom_path = 'scripts/.tools/EggoReference.gba'
with open(rom_path, 'rb') as f:
    rom = f.read()

import struct

def dump_words(addr, count):
    offset = addr - 0x08000000
    for i in range(count):
        val = struct.unpack('<I', rom[offset+i*4:offset+i*4+4])[0]
        print(f"0x{addr+i*4:08x}: 0x{val:08x}")

dump_words(0x08011c50, 24)
