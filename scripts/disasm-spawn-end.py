import capstone

with open('scripts/.tools/EggoReference.gba', 'rb') as f:
    rom = f.read()

md = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_THUMB)
start = 0x08012168
offset = start - 0x08000000
code = rom[offset:offset+0x20]

for ins in md.disasm(code, start):
    print(f'0x{ins.address:08x}: {ins.mnemonic:8s} {ins.op_str}')
