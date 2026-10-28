"""Build logged, isolated board probes; never touch the ROM or normal saves.

Offsets are candidates calibrated against board-before/board-after. A modified
state is a diagnostic, not evidence of winning a Survival round by playing.
CURRENT LIMITATION: cells refer to live piece entities and cached graphics.
Replacing cell bytes and row gap counts does not create those entities. The
generated sparse/solid results are INVALID for calibrating collapse or erosion;
use eggo-reference.py --bot for input-only original gameplay instead.
"""
from pathlib import Path
from datetime import datetime
import json, struct, subprocess, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PARAMETERS = {
    'baseline': 'scripts/OUTPUT/eggo-reference_2026-10-03_00-45-44_688916/board-before',
    'board_start': 0x10084, 'board_stride': 8, 'floor_row': 47,
    'columns': 7, 'cell_value': 3, 'height_table': 0x102d0,
    'row_gap_counts': 0x10214,
    'top_row': 0x102cc, 'cell_counts': [0x102b4, 0x102bc],
    'player_x': 0x3bd4, 'player_y': 0x3bd8,
    'frames': 480, 'sample_every': 60,
    'cases': [{'name': 'sparse20', 'height': 20, 'columns': [3]},
              {'name': 'solid20', 'height': 20, 'columns': list(range(7))}],
}
folder = HERE/'OUTPUT'/('eggo-board-probe_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
folder.mkdir(parents=True, exist_ok=True)
(folder/'parameters.json').write_text(json.dumps(PARAMETERS, indent=2), encoding='utf-8')
base = ROOT/PARAMETERS['baseline']
original = base.with_suffix('.ram').read_bytes()
for case in PARAMETERS['cases']:
    data = bytearray(original)
    start, stride, floor = (PARAMETERS[k] for k in ('board_start', 'board_stride', 'floor_row'))
    for row in range(floor):
        for column in range(PARAMETERS['columns']):
            data[start+row*stride+column] = PARAMETERS['cell_value'] if row>=floor-case['height'] and column in case['columns'] else 0
        data[PARAMETERS['row_gap_counts']+row] = PARAMETERS['columns']-sum(bool(data[start+row*stride+column]) for column in range(PARAMETERS['columns']))
    struct.pack_into('<i',data,PARAMETERS['top_row'],floor-case['height'])
    # The observed table includes a boundary entry on either side.
    for index in range(PARAMETERS['columns']+1):
        height = floor-case['height'] if index-1 in case['columns'] else floor
        struct.pack_into('<i',data,PARAMETERS['height_table']+4*index,height)
    for offset in PARAMETERS['cell_counts']:
        struct.pack_into('<i',data,offset,case['height']*len(case['columns']))
    struct.pack_into('<i',data,PARAMETERS['player_x'],40*65536)
    struct.pack_into('<i',data,PARAMETERS['player_y'],(720-case['height']*16)*65536)
    writes = [[offset,struct.unpack_from('<i',data,offset)[0]] for offset in range(0,len(data),4) if data[offset:offset+4]!=original[offset:offset+4]]
    write_file = folder/(case['name']+'.writes.json')
    write_file.write_text(json.dumps(writes), encoding='utf-8')
    result = subprocess.run([sys.executable,str(HERE/'eggo-reference.py'),'--load',str(base.with_suffix('.state')),
        '--name',case['name'],'--writes-file',str(write_file),'--sample-every',str(PARAMETERS['sample_every']),
        '--steps',json.dumps([[PARAMETERS['frames'],'']])],capture_output=True,text=True,encoding='utf-8',errors='replace')
    (folder/(case['name']+'.log.txt')).write_text(result.stdout+'\n'+result.stderr, encoding='utf-8')
    if result.returncode: raise RuntimeError(result.stderr)
    print(result.stdout.splitlines()[-1])
print(folder)
