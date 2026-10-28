rom_path = 'scripts/.tools/EggoReference.gba'
with open(rom_path, 'rb') as f:
    rom = f.read()

import capstone
md = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_THUMB)

addr_start = 0x08000000
addr_end = 0x08020000
code = rom[addr_start - 0x08000000 : addr_end - 0x08000000]

print("Searching instructions with 0x40/0x44 collision center:")
for ins in md.disasm(code, addr_start):
    if '#0x40' in ins.op_str and ('ldr' in ins.mnemonic):
        # check if next few instructions have #0x44
        print(f"0x{ins.address:08x}:  {ins.mnemonic:<10} {ins.op_str}")
