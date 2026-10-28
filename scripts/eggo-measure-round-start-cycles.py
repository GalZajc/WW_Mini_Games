"""Measure the native stage-loader call using a temporary ROM wrapper.

The wrapper replaces only the BL at 0x08018E3A and calls the original function
with the same arguments and returns the same values. It reads Timer 2/3 before
and after that call, storing the cycle delta in unused high EWRAM. The ROM copy
and all results are saved under scripts/OUTPUT; the original is never modified.
"""
from datetime import datetime, timezone
from pathlib import Path
import ctypes as C
import csv
import hashlib
import json
import struct
import sys
import argparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/eggo-recorder'))
from core import Core, VIDEO

PARAMETERS = {
    'recording': 'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398',
    'rom': 'C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba',
    'core': 'tools/eggo-recorder/runtime/mgba_libretro.dll',
    'patch_file_offset': 0x18E3A,
    'outer_patch_file_offset': 0x19470,
    'trampoline_file_offset': 4166240,
    'timer2_io_offset': 0x108,
    'timer3_io_offset': 0x10C,
    'loader_function': '0x08018E3A call site',
    'loader_called': '0x08018C38',
    'frame_cycles': 280896,
    'progress_interval': 1200,
}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def encode_thumb_b_w(source, target):
    offset = target - (source + 4)
    if offset & 1 or not -(1 << 24) <= offset < (1 << 24):
        raise ValueError(f'Thumb B.W out of range: {source:#x} -> {target:#x}')
    value = offset & 0x01FFFFFF
    s = (value >> 24) & 1
    i1 = (value >> 23) & 1
    i2 = (value >> 22) & 1
    j1 = (~(i1 ^ s)) & 1
    j2 = (~(i2 ^ s)) & 1
    first = 0xF000 | (s << 10) | ((value >> 12) & 0x03FF)
    second = 0x9000 | (j1 << 13) | (j2 << 11) | ((value >> 1) & 0x07FF)
    return struct.pack('<HH', first, second)


def encode_thumb_bl(source, target):
    offset = target - (source + 4)
    if offset & 1 or not -(1 << 22) <= offset < (1 << 22):
        raise ValueError(f'Thumb BL out of range: {source:#x} -> {target:#x}')
    value = offset & 0x007FFFFF
    first = 0xF000 | ((value >> 12) & 0x07FF)
    second = 0xF800 | ((value >> 1) & 0x07FF)
    return struct.pack('<HH', first, second)


def instrument_rom(original):
    # Use a verified 28 KiB 0xFF run inside the original ROM image so its mapped
    # cartridge size and mirrored address ranges remain unchanged.
    cave_offset = PARAMETERS['trampoline_file_offset']
    outer_cave_offset = cave_offset + 0x80
    if original[cave_offset:cave_offset + 64] != b'\xFF' * 64:
        raise ValueError('The expected unused ROM cave is no longer blank.')
    cave_address = 0x08000000 + cave_offset
    loader_address = 0x08000000 + PARAMETERS['patch_file_offset']
    if original[PARAMETERS['patch_file_offset']:PARAMETERS['patch_file_offset'] + 4] != bytes.fromhex('fff7fdfe'):
        raise ValueError('Unexpected BL at FUN_08018E38; refusing to patch.')
    if original[PARAMETERS['outer_patch_file_offset']:PARAMETERS['outer_patch_file_offset'] + 4] != bytes.fromhex('fff7e2fc'):
        raise ValueError('Unexpected BL to FUN_08018E38; refusing to patch.')
    if original[outer_cave_offset:outer_cave_offset + 64] != b'\xFF' * 64:
        raise ValueError('The second ROM cave is no longer blank.')

    words = [
        0xB503, 0x4800, 0x2101, 0x6001,  # save args; marker = 1
        0x4800, 0x2100, 0x8001, 0x8081,  # timer counters = 0 on first call
        0x2184, 0x80C1, 0x2180, 0x8041,  # enable cascaded timers (Timer 2 last)
        0x4800, 0x8801, 0x8882, 0x0412, 0x430A,  # read combined timer start value
        0x4800, 0x6042, 0xBC03,  # save start; restore native call arguments
    ]
    code = bytearray(struct.pack('<' + 'H' * len(words), *words))
    code += encode_thumb_bl(cave_address + len(code), 0x08018C38)
    code += struct.pack('<HHHHHHHHHHHHHH',
                        0xB403, 0x4800, 0x8801, 0x8882, 0x0412, 0x430A,
                        0x4800, 0x6843, 0x1AD2, 0x6082, 0x2102, 0x6001,
                        0xBC03, 0xBD00)  # store elapsed cycles and marker = 2; return
    while len(code) % 4:
        code += struct.pack('<H', 0xBF00)
    timer_literal_offset = len(code)
    code += struct.pack('<I', 0x04000108)
    marker_literal_offset = len(code)
    code += struct.pack('<I', 0x0203FFF0)

    def patch_ldr_literal(buffer, instruction_offset, register, literal_offset):
        pc = (instruction_offset + 4) & ~3
        delta = literal_offset - pc
        if delta < 0 or delta % 4 or delta // 4 > 255:
            raise ValueError('Thumb literal LDR is out of range or unaligned.')
        struct.pack_into('<H', buffer, instruction_offset, 0x4800 | (register << 8) | (delta // 4))

    for instruction_offset in (8, 24, 46):
        patch_ldr_literal(code, instruction_offset, 0, timer_literal_offset)
    for instruction_offset in (2, 34, 56):
        patch_ldr_literal(code, instruction_offset, 0, marker_literal_offset)
    if len(code) != marker_literal_offset + 4 or timer_literal_offset != 72:
        raise AssertionError('Unexpected loader wrapper layout.')

    outer_cave_address = 0x08000000 + outer_cave_offset
    outer_words = [
        0xB503, 0x4800, 0x2101, 0x6001,  # save args; outer marker = 1
        0x4800, 0x8801, 0x8882, 0x0412, 0x430A,  # read timer start
        0x4800, 0x6042, 0xBC03,  # save start; restore native arguments
    ]
    outer_code = bytearray(struct.pack('<' + 'H' * len(outer_words), *outer_words))
    outer_code += encode_thumb_bl(outer_cave_address + len(outer_code), 0x08018E38)
    outer_code += struct.pack('<HHHHHHHHHHHHHH',
                              0xB403, 0x4800, 0x8801, 0x8882, 0x0412, 0x430A,
                              0x4800, 0x6843, 0x1AD2, 0x6082, 0x2102, 0x6001,
                              0xBC03, 0xBD00)
    while len(outer_code) % 4:
        outer_code += struct.pack('<H', 0xBF00)
    outer_timer_literal_offset = len(outer_code)
    outer_code += struct.pack('<I', 0x04000108)
    outer_marker_literal_offset = len(outer_code)
    outer_code += struct.pack('<I', 0x0203FFE0)
    for instruction_offset in (8, 30):
        patch_ldr_literal(outer_code, instruction_offset, 0, outer_timer_literal_offset)
    for instruction_offset in (2, 18, 40):
        patch_ldr_literal(outer_code, instruction_offset, 0, outer_marker_literal_offset)
    if outer_timer_literal_offset != 56 or len(outer_code) != 64:
        raise AssertionError('Unexpected outer-wrapper layout.')

    patched = bytearray(original)
    patched[PARAMETERS['patch_file_offset']:PARAMETERS['patch_file_offset'] + 4] = encode_thumb_bl(loader_address, cave_address)
    outer_callsite = 0x08000000 + PARAMETERS['outer_patch_file_offset']
    patched[PARAMETERS['outer_patch_file_offset']:PARAMETERS['outer_patch_file_offset'] + 4] = encode_thumb_bl(outer_callsite, outer_cave_address)
    patched[cave_offset:cave_offset + len(code)] = code
    patched[outer_cave_offset:outer_cave_offset + len(outer_code)] = outer_code
    return bytes(patched), cave_offset, bytes(code), outer_cave_offset, bytes(outer_code)


def read_u16(data, offset):
    return struct.unpack_from('<H', data, offset)[0]


def read_u32(data, offset):
    return struct.unpack_from('<I', data, offset)[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frames', type=int, default=None, help='optional frame cap for a short smoke run')
    args = parser.parse_args()
    recording = ROOT / PARAMETERS['recording']
    rom_path = ROOT / PARAMETERS['rom'] if not Path(PARAMETERS['rom']).is_absolute() else Path(PARAMETERS['rom'])
    core_path = ROOT / PARAMETERS['core']
    original = rom_path.read_bytes()
    patched_rom, cave_offset, trampoline, outer_cave_offset, outer_trampoline = instrument_rom(original)
    run_dir = ROOT / 'scripts/OUTPUT' / ('eggo-round-cycle-audit_' + datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ'))
    run_dir.mkdir(parents=True)
    patched_path = run_dir / 'eggo-instrumented.gba'
    patched_path.write_bytes(patched_rom)

    capture_params = json.loads((recording / 'parameters.json').read_text(encoding='utf-8'))
    input_path = recording / 'inputs.jsonl'
    records = [json.loads(line) for line in input_path.read_text(encoding='utf-8').splitlines() if line]
    if args.frames is not None:
        records = records[:max(0, args.frames)]
    params = {
        **PARAMETERS,
        'recording': str(recording),
        'rom': str(rom_path),
        'core': str(core_path),
        'output': str(run_dir),
        'trampoline_file_offset': cave_offset,
        'trampoline_address': f'0x{0x08000000 + cave_offset:08X}',
        'outer_trampoline_file_offset': outer_cave_offset,
        'outer_trampoline_address': f'0x{0x08000000 + outer_cave_offset:08X}',
        'patched_rom': patched_path.name,
        'rom_sha256': sha256(original),
        'patched_rom_sha256': sha256(patched_rom),
        'trampoline_hex': trampoline.hex(),
        'outer_trampoline_hex': outer_trampoline.hex(),
        'recording_initial_state_sha256': sha256((recording / 'initial.state').read_bytes()),
        'recording_inputs_sha256': sha256(input_path.read_bytes()),
        'recording_parameters_sha256': sha256((recording / 'parameters.json').read_bytes()),
        'core_sha256': sha256(core_path.read_bytes()),
        'frame_count': len(records),
        'frame_limit_override': args.frames,
        'first_frame': records[0]['frame'] if records else None,
        'last_frame': records[-1]['frame'] if records else None,
        'seed': 'complete native RNG state is preserved in initial.state',
        'timer_controls': {'timer2': '0x0080 (enabled, 1 CPU cycle/tick)', 'timer3': '0x0084 (enabled, cascaded from timer 2)'},
        'measurement': 'A Thumb wrapper replaces the original BL to 0x08018C38 and another wrapper surrounds the one-per-round BL to 0x08018E38. Both record modulo-2^32 deltas from the free-running cascaded Timer 3:Timer 2 in unused EWRAM; every video frame is compared against the source RGB565 hash.',
        'core_options': capture_params.get('core_options', {}),
    }
    (run_dir / 'parameters.json').write_text(json.dumps(params, indent=2) + '\n', encoding='utf-8')

    csv_path = run_dir / 'cycles.csv'
    first_pixel_mismatch = None
    timer_wraps = []
    loader_events = []
    round_setup_events = []
    previous_cycles = None
    previous_marker = 0
    previous_outer_marker = 0
    current_setup = None
    current_round = -1
    current_loader = None
    last_video_hash = None
    as_core = Core(core_path, patched_path, recording, capture_params.get('core_options', {}), capture_memory=False)
    maps = {start: (ptr + offset, length) for start, ptr, offset, length in as_core.maps if ptr}
    if 0x02000000 not in maps or 0x04000000 not in maps:
        as_core.close()
        raise RuntimeError('mGBA did not expose EWRAM and IO memory maps.')
    pending = {'record': None, 'sample': None}
    debug_stack = []

    def video_refresh(data, width, height, pitch):
        nonlocal last_video_hash
        if not data:
            return
        try:
            bpp = 4 if as_core.pixel_format == 1 else 2
            raw = C.string_at(data, height * pitch)
            if pitch != width * bpp:
                raw = b''.join(raw[y * pitch:y * pitch + width * bpp] for y in range(height))
            last_video_hash = sha256(raw)
            io_ptr, _ = maps[0x04000000]
            ew_ptr, _ = maps[0x02000000]
            timer_bytes = C.string_at(io_ptr + PARAMETERS['timer2_io_offset'], 8)
            timer2 = read_u16(timer_bytes, 0)
            timer2_control = read_u16(timer_bytes, 2)
            timer3 = read_u16(timer_bytes, 4)
            timer3_control = read_u16(timer_bytes, 6)
            ew_head = C.string_at(ew_ptr + 0x328C, 4)
            native_frame = read_u32(C.string_at(ew_ptr + 0x11A9C, 4), 0)
            iw_ptr, _ = maps[0x03000000]
            iwram = C.string_at(iw_ptr + 0x7D00, 0x100)
            marker = read_u32(C.string_at(ew_ptr + 0x3FFF0, 4), 0)
            start_cycles = read_u32(C.string_at(ew_ptr + 0x3FFF4, 4), 0)
            measured_cycles = read_u32(C.string_at(ew_ptr + 0x3FFF8, 4), 0)
            outer_marker = read_u32(C.string_at(ew_ptr + 0x3FFE0, 4), 0)
            outer_start_cycles = read_u32(C.string_at(ew_ptr + 0x3FFE4, 4), 0)
            outer_elapsed_cycles = read_u32(C.string_at(ew_ptr + 0x3FFE8, 4), 0)
            pending['sample'] = {
                'hash': last_video_hash,
                'timer': (timer3 << 16) | timer2,
                'start_cycles': start_cycles,
                'measured_cycles': measured_cycles,
                'timer2_control': timer2_control,
                'timer3_control': timer3_control,
                'gate': read_u32(ew_head, 0),
                'native_frame': native_frame,
                'dispcnt': read_u16(C.string_at(io_ptr, 2), 0),
                'marker': marker,
                'outer_marker': outer_marker,
                'outer_start_cycles': outer_start_cycles,
                'outer_elapsed_cycles': outer_elapsed_cycles,
                'iwram': iwram,
            }
        except BaseException as exc:
            as_core.callback_error = exc

    callback = VIDEO(video_refresh)
    as_core.lib.retro_set_video_refresh.argtypes = [VIDEO]
    as_core.lib.retro_set_video_refresh(callback)
    try:
        as_core.restore((recording / 'initial.state').read_bytes())
        with csv_path.open('w', newline='', encoding='utf-8') as stream:
            writer = csv.writer(stream)
            writer.writerow(['frame', 'timer_cycles', 'loader_start_cycles', 'loader_elapsed_cycles', 'round_setup_start_cycles', 'round_setup_elapsed_cycles', 'timer2_control', 'timer3_control', 'native_frame', 'gate', 'dispcnt', 'marker', 'outer_marker', 'video_matches', 'timer_wrap', 'first_display'])
            for index, record in enumerate(records, start=1):
                pending['record'] = record
                pending['sample'] = None
                as_core.mask = record['mask']
                as_core.audio.clear()
                as_core.lib.retro_run()
                if as_core.callback_error:
                    raise as_core.callback_error
                sample = pending['sample']
                if sample is None:
                    raise RuntimeError(f'mGBA did not provide a video_refresh sample on frame {record["frame"]}')
                timer = sample['timer']
                timer_wrap = previous_cycles is not None and timer < previous_cycles and previous_cycles - timer > 10000
                if timer_wrap:
                    timer_wraps.append(record['frame'])
                if sample['marker'] == 1 and previous_marker != 1:
                    current_round += 1
                    current_loader = {
                        'round_index': current_round,
                        'entry_frame': record['frame'],
                        'start_cycles': sample['start_cycles'],
                        'return_frame': None,
                        'elapsed_cycles': None,
                        'first_display_frame': None,
                    }
                    loader_events.append(current_loader)
                if sample['marker'] == 2 and previous_marker == 1 and current_loader:
                    current_loader['return_frame'] = record['frame']
                    current_loader['elapsed_cycles'] = sample['measured_cycles']
                if sample['outer_marker'] == 1 and previous_outer_marker != 1:
                    current_setup = {
                        'round_index': len(round_setup_events) + 1,
                        'entry_frame': record['frame'],
                        'start_cycles': sample['outer_start_cycles'],
                        'return_frame': None,
                        'elapsed_cycles': None,
                        'first_display_frame': None,
                    }
                    round_setup_events.append(current_setup)
                if sample['outer_marker'] == 2 and previous_outer_marker == 1 and current_setup:
                    current_setup['return_frame'] = record['frame']
                    current_setup['elapsed_cycles'] = sample['outer_elapsed_cycles']
                video_matches = sample['hash'] == record['video_sha256']
                if not video_matches and first_pixel_mismatch is None:
                    first_pixel_mismatch = record['frame']
                if 390 <= record['frame'] <= 410:
                    iwram = sample['iwram']
                    stack = []
                    for sp in range(0, 0x100, 4):
                        value = read_u32(iwram, sp)
                        if 0x08000000 <= value < 0x08400000:
                            stack.append([f'0x{sp + 0x7D00:04X}', f'0x{value:08X}'])
                    debug_stack.append({
                        'frame': record['frame'], 'native_frame': sample['native_frame'],
                        'gate': f"0x{sample['gate']:08X}", 'dispcnt': f"0x{sample['dispcnt']:04X}",
                        'marker': sample['marker'],
                        'timer': sample['timer'], 'timer_controls': [sample['timer2_control'], sample['timer3_control']],
                        'saved_rom_addresses': stack,
                    })
                first_display = bool(current_loader and current_loader['first_display_frame'] is None and sample['dispcnt'] != 0 and sample['native_frame'] >= 2)
                if first_display:
                    current_loader['first_display_frame'] = record['frame']
                    current_loader['entry_to_display_frames'] = record['frame'] - current_loader['entry_frame']
                    if current_setup:
                        current_setup['first_display_frame'] = record['frame']
                writer.writerow([record['frame'], timer, sample['start_cycles'], sample['measured_cycles'], sample['outer_start_cycles'], sample['outer_elapsed_cycles'], sample['timer2_control'], sample['timer3_control'], sample['native_frame'], sample['gate'], sample['dispcnt'], sample['marker'], sample['outer_marker'], int(video_matches), int(timer_wrap), int(first_display)])
                previous_cycles = timer
                previous_marker = sample['marker']
                previous_outer_marker = sample['outer_marker']
                pending['record'] = None
                if index % PARAMETERS['progress_interval'] == 0:
                    print(f'{index}/{len(records)} native frames instrumented', flush=True)
    finally:
        as_core.close()

    summary = {
        'frames': len(records),
        'first_visual_mismatch_from_instrumentation': first_pixel_mismatch,
        'timer_wrap_frames': timer_wraps,
        'loader_call_count': len(loader_events),
        'loader_calls': loader_events,
        'round_setup_call_count': len(round_setup_events),
        'round_setup_calls': round_setup_events,
        'cycle_rows': str(csv_path),
        'note': 'The wrapper replaces only the original BL to 0x08018C38, preserving arguments, return values, stack, and code flow. Every sampled frame is checked against the original RGB565 hash; any visual mismatch invalidates later timing claims.',
    }
    (run_dir / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    (run_dir / 'debug-stack.json').write_text(json.dumps(debug_stack, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary, indent=2))
    print(run_dir)


if __name__ == '__main__':
    main()
