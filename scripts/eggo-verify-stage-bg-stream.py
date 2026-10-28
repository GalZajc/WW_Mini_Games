"""Verify native stage-camera, BG tile-map and ROM-stream logic against mGBA captures."""
from pathlib import Path
from datetime import datetime
import argparse, csv, hashlib, json, struct

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    'rom': Path('C:/Users/galza/Igre/nintendo/gba/Eggo Mania (E) (M6).gba'),
    'capture_dir': ROOT / 'scripts/OUTPUT/eggo-reference_2026-10-05_17-59-34_990709',
    'capture_name': 'eggo-factory-active-bg',
    'frame_numbers': [840],
    'field_objects': [0x02003910, 0x02004C8C],
    'global_frame_counter': 0x02011A9C,
    'dma_queue': 0x02011AE8,
    'iwram_fixed_multiply': {'address': 0x03000000,
                             'bytes': '9011c0e00008a0e1210880e11eff2fe1'},
    'object_fields': {'camera_position': 0x04, 'camera_scale': 0x2C,
                      'graphics_base': 0x38, 'tile_row_offset': 0x4C,
                      'camera_y': 0x70, 'row_records': 0x74, 'row_stride': 8},
    'config_fields': {'row_count': 0x04, 'row_table_pointer': 0x14},
    'map': {'map_base': 0x34, 'tile_base': 0x3C,
            'forward_map_offset': 0x48, 'backward_map_offset': 0x44,
            'forward_tile_offset': 0x50, 'backward_tile_offset': 0x4C,
            'orientation_flag': 0x274, 'visible_tiles': 14,
            'map_ring_words': 0x400, 'map_step_words': 0x20,
            'tile_ring_bytes': 0x4980, 'tile_step_bytes': 0x380,
            'horizontal_flip_flag': 0x400},
    'stream': {'tile_bytes': 64, 'row_stride_bytes': 0x380,
               'row_offset_wrap_threshold': 0x497F, 'row_offset_wrap_period': 0x4980,
               'max_rows': 64, 'visible_row_lookahead': 0x15, 'dma_records': 128},
    'verification': 'Checks fixed-point camera Y, ROM/RAM row tables, incremental tile-map rows, DMA queue entries, and VRAM bytes with one-frame DMA latency.'
}
parser = argparse.ArgumentParser()
parser.add_argument('--rom', type=Path, default=PARAMETERS['rom'])
parser.add_argument('--capture-dir', type=Path, default=PARAMETERS['capture_dir'])
parser.add_argument('--name', default=PARAMETERS['capture_name'])
parser.add_argument('--frames', default=','.join(map(str, PARAMETERS['frame_numbers'])))
args = parser.parse_args()
frames = [int(value.strip()) for value in args.frames.split(',') if value.strip()]
rom = args.rom.read_bytes()
rom_sha = hashlib.sha256(rom).hexdigest()
results = []
for frame in frames:
    stem = args.capture_dir / f'{args.name}.frame{frame:05d}'
    ram_path, vram_path = Path(str(stem) + '.ram'), Path(str(stem) + '.memory3')
    iwram_path = Path(str(stem) + '.0x3000000')
    ram, vram, iwram = ram_path.read_bytes(), vram_path.read_bytes(), iwram_path.read_bytes()
    previous_path = args.capture_dir / f'{args.name}.frame{frame - 1:05d}.ram'
    previous_ram = previous_path.read_bytes() if frame > 1 and previous_path.is_file() else None
    expected_iwram = bytes.fromhex(PARAMETERS['iwram_fixed_multiply']['bytes'])
    if not iwram.startswith(expected_iwram):
        raise AssertionError(f'Unexpected fixed-point multiply code at frame {frame}')
    counter = struct.unpack_from('<I', ram, PARAMETERS['global_frame_counter'] - 0x02000000)[0]
    stage_id = struct.unpack_from('<I', ram, 0x3294)[0]
    queue_at = PARAMETERS['dma_queue'] - 0x02000000
    queue_count = struct.unpack_from('<I', ram, queue_at)[0]
    queue = {struct.unpack_from('<III', ram, queue_at + 0x0C + i * 12)
             for i in range(min(queue_count, PARAMETERS['stream']['dma_records']))}
    frame_result = {'frame': frame, 'stage': stage_id,
                    'global_counter': counter, 'queue_count': queue_count,
                    'captures': {str(ram_path.name): hashlib.sha256(ram).hexdigest(),
                                 str(vram_path.name): hashlib.sha256(vram).hexdigest(),
                                 str(iwram_path.name): hashlib.sha256(iwram).hexdigest()},
                    'fields': []}
    for object_address in PARAMETERS['field_objects']:
        obj = object_address - 0x02000000
        signed_y = struct.unpack_from('<i', ram, obj + PARAMETERS['object_fields']['camera_y'])[0]
        camera_position = struct.unpack_from('<i', ram, obj + PARAMETERS['object_fields']['camera_position'])[0]
        camera_scale = struct.unpack_from('<i', ram, obj + PARAMETERS['object_fields']['camera_scale'])[0]
        computed_y = (camera_position * camera_scale) >> 32
        if computed_y != signed_y:
            raise AssertionError(f'Camera multiply mismatch at frame {frame}, object {object_address:#x}: {computed_y} != {signed_y}')
        config_pointer = struct.unpack_from('<I', ram, obj + 0x20)[0]
        config_offset = config_pointer - 0x08000000
        row_count = struct.unpack_from('<I', rom, config_offset + PARAMETERS['config_fields']['row_count'])[0]
        row_table = struct.unpack_from('<I', rom, config_offset + PARAMETERS['config_fields']['row_table_pointer'])[0]
        if row_count != PARAMETERS['stream']['max_rows']:
            raise AssertionError(f'Unexpected row count at object {object_address:#x}: {row_count}')
        for descriptor_index in range(row_count):
            ram_at = obj + PARAMETERS['object_fields']['row_records'] + descriptor_index * PARAMETERS['object_fields']['row_stride']
            rom_at = row_table - 0x08000000 + descriptor_index * PARAMETERS['object_fields']['row_stride']
            if ram[ram_at:ram_at + PARAMETERS['object_fields']['row_stride']] != rom[rom_at:rom_at + PARAMETERS['object_fields']['row_stride']]:
                raise AssertionError(f'ROM/RAM row descriptor mismatch at object {object_address:#x}, row {descriptor_index}')
        previous_stage = (struct.unpack_from('<I', previous_ram, 0x3294)[0]
                          if previous_ram is not None else None)
        map_available = previous_ram is not None and previous_stage == stage_id
        map_checks = {'available': map_available, 'delta_rows': 0, 'rows': []}
        if map_available:
            map_cfg = PARAMETERS['map']
            previous_y = struct.unpack_from('<i', previous_ram, obj + PARAMETERS['object_fields']['camera_y'])[0]
            delta_rows = (signed_y >> 3) - (previous_y >> 3)
            map_checks['delta_rows'] = delta_rows
            if delta_rows:
                forward = delta_rows > 0
                count = abs(delta_rows)
                map_field = map_cfg['forward_map_offset'] if forward else map_cfg['backward_map_offset']
                tile_field = map_cfg['forward_tile_offset'] if forward else map_cfg['backward_tile_offset']
                map_offset = struct.unpack_from('<I', previous_ram, obj + map_field)[0]
                tile_offset = struct.unpack_from('<I', previous_ram, obj + tile_field)[0]
                map_base = struct.unpack_from('<I', ram, obj + map_cfg['map_base'])[0]
                tile_base = struct.unpack_from('<I', ram, obj + map_cfg['tile_base'])[0]
                mirrored = ram[obj + map_cfg['orientation_flag']] != 0
                for step in range(count):
                    first_tile = tile_base + (tile_offset >> 6)
                    if mirrored:
                        entries = [(first_tile + map_cfg['visible_tiles'] - 1 - i) |
                                   map_cfg['horizontal_flip_flag']
                                   for i in range(map_cfg['visible_tiles'])]
                    else:
                        entries = [first_tile + i for i in range(map_cfg['visible_tiles'])]
                    destination = map_base + map_offset * 2
                    expected = b''.join(struct.pack('<H', value & 0xFFFF) for value in entries)
                    start = destination - 0x06000000
                    actual = vram[start:start + len(expected)]
                    match = expected == actual
                    row_result = {'step': step, 'map_offset': map_offset,
                                  'tile_offset': tile_offset, 'destination': f'0x{destination:08x}',
                                  'first_tile': first_tile, 'mirrored': mirrored,
                                  'expected_entries': [f'0x{value & 0xffff:04x}' for value in entries],
                                  'actual_entries': [f'0x{value:04x}' for value in struct.unpack('<' + 'H' * map_cfg['visible_tiles'], actual)]
                                                      if len(actual) == len(expected) else [],
                                  'match': match}
                    map_checks['rows'].append(row_result)
                    if not match:
                        raise AssertionError(f'BG map row mismatch at frame {frame}, object {object_address:#x}: {row_result}')
                    direction = 1 if forward else -1
                    map_offset = (map_offset + direction * map_cfg['map_step_words']) % map_cfg['map_ring_words']
                    tile_offset = (tile_offset + direction * map_cfg['tile_step_bytes']) % map_cfg['tile_ring_bytes']
                final_map = struct.unpack_from('<I', ram, obj + map_field)[0]
                final_tile = struct.unpack_from('<I', ram, obj + tile_field)[0]
                if (map_offset, tile_offset) != (final_map, final_tile):
                    raise AssertionError(f'BG map offsets mismatch at frame {frame}, object {object_address:#x}')
            else:
                unchanged_offsets = ('forward_map_offset', 'backward_map_offset',
                                     'forward_tile_offset', 'backward_tile_offset')
                for key in unchanged_offsets:
                    offset = map_cfg[key]
                    before = struct.unpack_from('<I', previous_ram, obj + offset)[0]
                    after = struct.unpack_from('<I', ram, obj + offset)[0]
                    if before != after:
                        raise AssertionError(f'Unexpected BG map offset movement at frame {frame}, object {object_address:#x}, offset {offset:#x}')
        start_row = min(PARAMETERS['stream']['max_rows'], max(0, signed_y >> 3))
        end_row = min(PARAMETERS['stream']['max_rows'], start_row + PARAMETERS['stream']['visible_row_lookahead'])
        base = struct.unpack_from('<I', ram, obj + PARAMETERS['object_fields']['graphics_base'])[0]
        row_offset = struct.unpack_from('<I', ram, obj + PARAMETERS['object_fields']['tile_row_offset'])[0] + PARAMETERS['stream']['row_stride_bytes']
        field = {'object': f'0x{object_address:08x}', 'config': f'0x{config_pointer:08x}',
                 'row_count': row_count, 'row_table': f'0x{row_table:08x}',
                 'rom_ram_descriptors_match': True,
                 'camera_position_q16': camera_position, 'camera_scale_q16': camera_scale,
                 'camera_y': signed_y, 'computed_camera_y': computed_y,
                 'row_start': start_row, 'row_end_exclusive': end_row,
                 'map_update': map_checks,
                 'copies': []}
        for row in range(start_row, end_row):
            at = obj + PARAMETERS['object_fields']['row_records'] + row * PARAMETERS['object_fields']['row_stride']
            x, width, rate, period = struct.unpack_from('<4B', ram, at)
            table = struct.unpack_from('<I', ram, at + 4)[0]
            copy = {'row': row, 'x': x, 'width_tiles': width, 'rate': rate,
                    'period': period, 'pointer_table': f'0x{table:08x}'}
            if width and table and rate and period:
                while row_offset > PARAMETERS['stream']['row_offset_wrap_threshold']:
                    row_offset -= PARAMETERS['stream']['row_offset_wrap_period']
                index = (counter // rate) % period
                pointer_offset = table - 0x08000000 + index * 4
                source = struct.unpack_from('<I', rom, pointer_offset)[0]
                destination = base + row_offset + (x << 6)
                size = width << 6
                if source < 0x08000000 or source + size > 0x08000000 + len(rom):
                    raise ValueError(f'Invalid ROM source at object {object_address:#x}, row {row}')
                vram_offset = destination - 0x06000000
                source_data = rom[source - 0x08000000:source - 0x08000000 + size]
                copied_data = vram[vram_offset:vram_offset + size]
                vram_match_current = source_data == copied_data
                next_stem = args.capture_dir / f'{args.name}.frame{frame + 1:05d}.memory3'
                if next_stem.is_file():
                    next_vram = next_stem.read_bytes()
                    copied_next = next_vram[vram_offset:vram_offset + size]
                    vram_match_next = source_data == copied_next
                else:
                    vram_match_next = False
                copy.update({'frame_index': index, 'source': f'0x{source:08x}',
                             'destination': f'0x{destination:08x}', 'size': size,
                             'queue_match': (source, destination, size) in queue,
                             'vram_match_current': vram_match_current,
                             'vram_match_next_frame': vram_match_next,
                             'vram_match': vram_match_current or vram_match_next,
                             'source_sha256': hashlib.sha256(source_data).hexdigest(),
                             'vram_sha256': hashlib.sha256(copied_data).hexdigest()})
                if not copy['queue_match'] or not copy['vram_match']:
                    raise AssertionError(f'Native mismatch at frame {frame}, object {object_address:#x}, row {row}: {copy}')
            field['copies'].append(copy)
            row_offset += PARAMETERS['stream']['row_stride_bytes']
        frame_result['fields'].append(field)
    results.append(frame_result)

out = ROOT / 'scripts/OUTPUT' / ('eggo-stage-stream-check_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True, exist_ok=False)
parameters = {**PARAMETERS, 'rom': str(args.rom), 'rom_sha256': rom_sha,
              'capture_dir': str(args.capture_dir), 'capture_name': args.name,
              'frame_numbers': frames}
(out / 'parameters.json').write_text(json.dumps(parameters, indent=2) + '\n', encoding='utf-8')
(out / 'verification.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
with (out / 'copies.csv').open('w', encoding='utf-8', newline='') as stream:
    columns = ['frame', 'global_counter', 'object', 'config', 'camera_y', 'row', 'x', 'pointer_table',
               'width_tiles', 'rate', 'period', 'frame_index', 'source', 'destination',
               'size', 'queue_match', 'vram_match_current', 'vram_match_next_frame',
               'vram_match', 'source_sha256', 'vram_sha256']
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for item in results:
        for field in item['fields']:
            for copy in field['copies']:
                if 'source' in copy:
                    writer.writerow({'frame': item['frame'], 'global_counter': item['global_counter'],
                                     'object': field['object'], 'config': field['config'],
                                     'camera_y': field['camera_y'], **copy})
with (out / 'tilemap-rows.csv').open('w', encoding='utf-8', newline='') as stream:
    columns = ['frame', 'stage', 'global_counter', 'object', 'camera_y', 'delta_rows',
               'step', 'map_offset', 'tile_offset', 'destination', 'first_tile', 'mirrored',
               'expected_entries', 'actual_entries', 'match']
    writer = csv.DictWriter(stream, fieldnames=columns)
    writer.writeheader()
    for item in results:
        for field in item['fields']:
            update = field['map_update']
            for row in update['rows']:
                writer.writerow({'frame': item['frame'], 'stage': item['stage'],
                                 'global_counter': item['global_counter'],
                                 'object': field['object'], 'camera_y': field['camera_y'],
                                 'delta_rows': update['delta_rows'], **row,
                                 'expected_entries': ' '.join(row['expected_entries']),
                                 'actual_entries': ' '.join(row['actual_entries'])})
summary = {'frames': frames, 'field_copy_count': sum(sum('source' in c for c in f['copies']) for r in results for f in r['fields']),
           'queue_matches': sum(sum(c.get('queue_match', False) for c in f['copies']) for r in results for f in r['fields']),
           'vram_matches': sum(sum(c.get('vram_match', False) for c in f['copies']) for r in results for f in r['fields']),
           'tilemap_update_rows': sum(len(f['map_update']['rows']) for r in results for f in r['fields']),
           'tilemap_matches': sum(sum(row['match'] for row in f['map_update']['rows']) for r in results for f in r['fields']),
           'output': str(out)}
print(json.dumps(summary, ensure_ascii=False))
