rom_path = 'scripts/.tools/EggoReference.gba'
with open(rom_path, 'rb') as f:
    rom = f.read()

import capstone
md = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_THUMB)

addr_start = 0x08000000
addr_end = 0x08030000
code = rom[addr_start - 0x08000000 : addr_end - 0x08000000]

print("Searching movs ..., #0x32 in 0x08000000..0x08030000:")
for ins in md.disasm(code, addr_start):
    if ins.mnemonic == 'movs' and '#0x32' in ins.op_str:
        print(f"0x{ins.address:08x}:  {ins.mnemonic:<10} {ins.op_str}")
