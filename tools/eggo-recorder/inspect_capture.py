"""Stream a recording into diagnostic files without loading a game in RAM."""
from pathlib import Path
from datetime import datetime
import argparse
import json
from capture import frames, rgb_image
from core import BUTTONS

def export(folder, target):
    folder = Path(folder).resolve()
    parameters = json.loads((folder / 'parameters.json').read_text(encoding='utf-8'))
    output = Path(__file__).resolve().parent / 'OUTPUT' / ('eggo-capture-export_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
    output.mkdir(parents=True)
    (output / 'parameters.json').write_text(json.dumps({'recording': str(folder), 'frame': target,
        'source_parameters': parameters}, indent=2, ensure_ascii=False), encoding='utf-8')
    steps, found, count = [], False, 0
    for record, video, memory in frames(folder):
        count += 1
        keys = '+'.join(name for name, bit in BUTTONS.items() if record['mask'] & (1 << bit))
        if steps and steps[-1][1] == keys: steps[-1][0] += 1
        else: steps.append([1, keys])
        if record['frame'] != target: continue
        found = True
        rgb_image(video, parameters['width'], parameters['height'], parameters['pixel_format']).save(output / 'frame.png')
        offset = 0
        for name, length in parameters['layout'][1:]:
            (output / (name + '.bin')).write_bytes(memory[offset:offset+length]); offset += length
        (output / 'frame.json').write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding='utf-8')
    (output / 'steps.json').write_text(json.dumps(steps, indent=2), encoding='utf-8')
    (output / 'summary.json').write_text(json.dumps({'frames': count, 'selected_frame_found': found}, indent=2), encoding='utf-8')
    if not found: raise ValueError(f'Sličice {target} ni v posnetku; na voljo je {count} sličic.')
    print(output)
    return output

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('recording', type=Path)
    parser.add_argument('--frame', type=int, default=1)
    args = parser.parse_args()
    export(args.recording, args.frame)
