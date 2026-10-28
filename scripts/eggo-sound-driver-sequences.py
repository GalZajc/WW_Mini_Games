"""Bounded, silent native-driver oracle. Saves reproducible command/state hashes.

Unicorn runs only the cartridge's sound routines, not the game or a desktop UI.
Each scenario starts from the same captured memory and exercises channel stealing,
song changes, pauses and tempo changes. The portable JS VM replays these commands.
"""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json, sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/.tools'))
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_THUMB, UC_HOOK_MEM_WRITE, UC_HOOK_MEM_READ, UC_HOOK_CODE
from unicorn.arm_const import UC_ARM_REG_SP, UC_ARM_REG_LR, UC_ARM_REG_CPSR, UC_ARM_REG_PC, UC_ARM_REG_R0

P = {'probe': 'scripts/OUTPUT/eggo-audio-driver-probe_2026-10-26T14-29-50_534104Z',
     'songs': list(range(14)), 'ticks_per_song': 240, 'seed': 1492,
     'entries': {'init': 0x0802070c, 'song': 0x0802053c, 'resume': 0x0801f420,
                 'tick': 0x0801f480, 'effect': 0x08020898, 'tempo': 0x0801f2cc, 'pause': 0x0801f404},
     'effect_period': 17, 'effect_count': 50, 'instruction_limit': 1000000,
     'stack': 0x03007e00, 'stop': 0x0803fff0,
     'memory_model': 'ARM7TDMI: align word/halfword stores; rotate unaligned word loads. Unicorn default ARM926 unaligned accesses are adapted explicitly.',
     'regions': {'ewram': [0x02000000, 0x40000], 'iwram': [0x03000000, 0x8000], 'io': [0x04000000, 0x400]}}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ticks', type=int, default=P['ticks_per_song'])
    parser.add_argument('--songs', default=','.join(map(str,P['songs'])))
    args = parser.parse_args()
    P['ticks_per_song'] = args.ticks
    P['songs'] = [int(x) for x in args.songs.split(',')]
    probe = ROOT / P['probe']
    original = json.loads((probe / 'parameters.json').read_text(encoding='utf-8'))
    rom = Path(original['rom']).read_bytes()
    P['rom'] = original['rom']; P['rom_sha256'] = hashlib.sha256(rom).hexdigest()
    out = ROOT / 'scripts/OUTPUT' / ('eggo-sound-driver-sequences_' + datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'))
    out.mkdir(parents=True)
    (out / 'parameters.json').write_text(json.dumps(P, indent=2), encoding='utf-8')
    count = 0
    with (out / 'commands.jsonl').open('w', encoding='utf-8') as trace:
        for song in P['songs']:
            uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB)
            uc.mem_map(0x08000000, len(rom)); uc.mem_write(0x08000000, rom)
            for name, (base, size) in P['regions'].items():
                uc.mem_map(base, max(size, 4096))
                uc.mem_write(base, (probe / ('initial-' + name + '.bin')).read_bytes())
            writes = []; pending = []
            def flush(cpu, *unused):
                for at, data in pending: cpu.mem_write(at, data)
                pending.clear()
            def read(cpu, access, at, size, value, data):
                if size == 4 and at & 3:
                    word = int.from_bytes(cpu.mem_read(at & ~3, 4), 'little')
                    shift = (at & 3) * 8
                    value = ((word >> shift) | (word << (32 - shift))) & 0xffffffff
                    pending.append((at, bytes(cpu.mem_read(at, 4))))
                    cpu.mem_write(at, value.to_bytes(4, 'little'))
            def write(cpu, access, at, size, value, data):
                value &= (1 << (size * 8)) - 1
                aligned = at & ~(size - 1)
                if aligned != at:
                    pending.append((at, bytes(cpu.mem_read(at, size))))
                    pending.append((aligned, value.to_bytes(size, 'little')))
                if 0x04000000 <= at < 0x04000400: writes.append([aligned, size, value])
            uc.hook_add(UC_HOOK_MEM_WRITE, write)
            uc.hook_add(UC_HOOK_MEM_READ, read)
            uc.hook_add(UC_HOOK_CODE, flush)
            def call(kind, values=()):
                nonlocal count
                writes.clear()
                for i, value in enumerate(values): uc.reg_write(UC_ARM_REG_R0 + i, value & 0xffffffff)
                uc.reg_write(UC_ARM_REG_CPSR, 0x3f)
                uc.reg_write(UC_ARM_REG_SP, P['stack']); uc.reg_write(UC_ARM_REG_LR, P['stop'] | 1)
                uc.emu_start(P['entries'][kind] | 1, P['stop'], count=P['instruction_limit'])
                flush(uc)
                if uc.reg_read(UC_ARM_REG_PC) != P['stop']: raise RuntimeError('Native instruction budget exceeded')
                hashes = {name: hashlib.sha256(uc.mem_read(base, size)).hexdigest() for name, (base, size) in P['regions'].items()}
                if song == 0 and count < 3:
                    for name, (base, size) in P['regions'].items():
                        (out / f'{count}-{name}.bin').write_bytes(bytes(uc.mem_read(base, size)))
                trace.write(json.dumps({'scenario': song, 'index': count, 'kind': kind, 'args': values,
                                        'hashes': hashes, 'writes': list(writes)}) + '\n')
                count += 1
            call('init'); call('song', [song]); call('resume')
            seed = P['seed'] + song
            for tick in range(args.ticks):
                if tick % P['effect_period'] == 0:
                    seed = (1664525 * seed + 1013904223) & 0xffffffff
                    call('effect', [seed % P['effect_count']])
                if tick in (60, 120, 180): call('tempo', [-1])
                if tick == 96: call('pause')
                if tick == 100: call('resume')
                call('tick')
            print(f"{song + 1}/{len(P['songs'])} songs, {count} calls", flush=True)
    (out / 'summary.json').write_text(json.dumps({'calls': count, 'scenarios': len(P['songs']), 'complete': True}, indent=2), encoding='utf-8')
    print(json.dumps({'out': str(out), 'calls': count}))

if __name__ == '__main__': main()
