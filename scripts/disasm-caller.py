import capstone

rom_path = 'scripts/.tools/EggoReference.gba'
with open(rom_path, 'rb') as f:
    rom = f.read()

def disasm_thumb(addr, size):
    offset = addr - 0x08000000
    code = rom[offset:offset+size]
    md = capstone.Cs(capstone.CS_ARCH_ARM, capstone.CS_MODE_THUMB)
    for ins in md.disasm(code, addr):
        print(f"0x{ins.address:08x}:  {ins.mnemonic:<10} {ins.op_str}")

print("=== 0x08010880..0x080109b0 ===")
disasm_thumb(0x08010880, 0x080109b0 - 0x08010880)
