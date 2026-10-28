import capstone, struct

with open('scripts/.tools/EggoReference.gba', 'rb') as f:
    rom = f.read()

md = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_THUMB)
start = 0x080116fc
offset = start - 0x08000000
code = rom[offset:offset+0x100]

for ins in md.disasm(code, start):
    extra = ''
    if ins.mnemonic == 'ldr' and '[pc,' in ins.op_str:
        # izračunaj pc naslov
        # v Thumb je pc = (address + 4) & ~2
        pc = (ins.address + 4) & ~2
        # offset v op_str
        imm = int(ins.op_str.split('#')[1].rstrip(']'), 0)
        target = pc + imm
        val = struct.unpack_from('<I', rom, target - 0x08000000)[0]
        extra = f'  ; [0x{target:08x}] = 0x{val:08x}'
    print(f'0x{ins.address:08x}: {ins.mnemonic:8s} {ins.op_str:20s}{extra}')
