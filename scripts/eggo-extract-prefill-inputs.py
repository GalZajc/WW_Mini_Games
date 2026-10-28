"""Extract each native loader pass's real inputs from the user's recorded RAM."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools/eggo-recorder'))
from capture import frames

PARAMETERS = {
    'recording': 'tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398',
    'phase_map': 'scripts/OUTPUT/eggo-index_2026-10-19_20-46-32_908010/phase-map.json',
    'cycle_audit': 'scripts/OUTPUT/eggo-round-component-audit_2026-10-21T22-22-55-077521Z/summary.json',
    'config_offset': 0xE928,
    'field_rng_offsets': [0x11AB0, 0x11AB4],
    'camera_offsets': [0x3914, 0x4C90],
    'sample_ticks': [2, 3, 4],
    'method': 'Read-only recorded EWRAM. Sample stable field RNG/config during resource loading before each prefill loop; no synthetic inter-round RNG and no writes to the production model.',
}


def main():
    recording = ROOT / PARAMETERS['recording']
    phases = json.loads((ROOT / PARAMETERS['phase_map']).read_text(encoding='utf-8'))
    timing = json.loads((ROOT / PARAMETERS['cycle_audit']).read_text(encoding='utf-8'))
    segments = phases['survival_gameplay_segments_1189c_65537']
    out = ROOT / 'scripts/OUTPUT' / ('eggo-prefill-inputs_' + datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ'))
    out.mkdir(parents=True)
    p = json.loads((recording / 'parameters.json').read_text(encoding='utf-8'))
    offsets, pos = {}, 0
    for name, size in p['layout'][1:]:
        offsets[name] = pos
        pos += size
    params = dict(PARAMETERS)
    params['sha256'] = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in [PARAMETERS['phase_map'], PARAMETERS['cycle_audit'],
                     PARAMETERS['recording'] + '/parameters.json',
                     PARAMETERS['recording'] + '/inputs.jsonl',
                     'scripts/eggo-extract-prefill-inputs.py']}
    (out / 'parameters.json').write_text(json.dumps(params, indent=2) + '\n', encoding='utf-8')
    results = []
    for index, ((start, _, arena), call) in enumerate(zip(segments, timing['loader_calls']), 1):
        first_ticks = [start + t for t in PARAMETERS['sample_ticks']]
        second_ticks = [call['entry_frame'] + t for t in PARAMETERS['sample_ticks']]
        last = call['first_display_frame'] - 1
        sample_ticks = set(first_ticks + second_ticks + [call['return_frame'], last])
        samples = {}
        for record, _, memory in frames(recording, first=min(sample_ticks), last=max(sample_ticks)):
            n = record['frame']
            if n not in sample_ticks:
                continue
            ew = memory[offsets['02000000']:offsets['02000000'] + 0x40000]
            samples[n] = {'frame': n,
                'seeds': [struct.unpack_from('<I', ew, a)[0] & 0xFFFF for a in PARAMETERS['field_rng_offsets']],
                'config': list(struct.unpack_from('<19i', ew, PARAMETERS['config_offset'])),
                'camera_y': [struct.unpack_from('<i', ew, a)[0] / 65536 for a in PARAMETERS['camera_offsets']]}
        first, second = samples[first_ticks[0]], samples[second_ticks[0]]
        for ticks, expected in [(first_ticks, first), (second_ticks, second)]:
            assert all(samples[n]['seeds'] == expected['seeds'] and samples[n]['config'] == expected['config'] for n in ticks), (index, ticks, samples)
        results.append({'round': index, 'arena': arena, 'start': start,
            'first_pass': {'samples': [samples[n] for n in first_ticks], 'initial_seeds': first['seeds'], 'expected_final_seeds': second['seeds']},
            'second_pass': {'samples': [samples[n] for n in second_ticks], 'initial_seeds': second['seeds'], 'expected_final_seeds': samples[last]['seeds'],
                'return_sample': samples[call['return_frame']], 'last_hidden_sample': samples[last]},
            'config': first['config'], 'second_prefill_cycles': call['prefill_elapsed_cycles']})
        print(f'[{index}/{len(segments)}] round {index}: first {first["seeds"]}, second {second["seeds"]}', flush=True)
    (out / 'inputs.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
    print(out)


if __name__ == '__main__':
    main()
