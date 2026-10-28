"""Make an original checkpoint/input tape from a lossless user recording."""
from pathlib import Path
from datetime import datetime
import argparse,sys,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/eggo-recorder'))
from core import Core,BUTTONS
from capture import frames,rgb_image

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('recording',type=Path)
    parser.add_argument('--start-after',type=int,required=True)
    args=parser.parse_args();recording=args.recording.resolve()
    output=ROOT/'scripts/OUTPUT'/('eggo-user-replay_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
    output.mkdir(parents=True)
    params=json.loads((recording/'parameters.json').read_text(encoding='utf-8'))
    # A moved recording may name a different computer's paths; verify the local copies.
    config=json.loads((ROOT/'tools/eggo-recorder/config.json').read_text(encoding='utf-8'))
    rom=Path(config['rom']);core_path=ROOT/'tools/eggo-recorder/runtime/mgba_libretro.dll'
    for path,key in [(rom,'rom_sha256'),(core_path,'core_sha256')]:
        assert hashlib.sha256(path.read_bytes()).hexdigest()==params[key],key
    core=Core(core_path,rom,output,params['core_options'],True)
    core.restore((recording/'initial.state').read_bytes())
    rows=[json.loads(line) for line in (recording/'inputs.jsonl').read_text(encoding='utf-8').splitlines()]
    prefix=output/'user-initial';exact=0
    try:
        for record,expected,memory in frames(recording):
            f=record['frame']
            actual,_,mapped=core.step(record['mask'])
            if actual[3]!=expected:raise AssertionError(f'Original replay differs at recorded frame {f}')
            exact+=1
            if f%120==0:print(f'Checkpoint: {f}/{args.start_after}',flush=True)
            if f==args.start_after:
                prefix.with_suffix('.state').write_bytes(core.serialize())
                rgb_image(expected,params['width'],params['height'],params['pixel_format']).save(prefix.with_suffix('.png'))
                offset=0
                for name,length in params['layout'][1:]:
                    suffix={'02000000':'ram','06000000':'memory3'}.get(name,hex(int(name,16)))
                    Path(str(prefix)+'.'+suffix).write_bytes(memory[offset:offset+length]);offset+=length
                break
        if exact!=args.start_after:raise ValueError('Recording is shorter than checkpoint offset')
    finally:core.close()
    steps=[]
    for record in rows[args.start_after:]:
        keys='+'.join(name for name,bit in BUTTONS.items() if record['mask']&(1<<bit))
        if steps and steps[-1][1]==keys:steps[-1][0]+=1
        else:steps.append([1,keys])
    (output/'steps.json').write_text(json.dumps(steps,indent=2),encoding='utf-8')
    (output/'parameters.json').write_text(json.dumps({'experiment':'User input tape checkpoint extraction',
        'recording':str(recording),'recording_parameters_sha256':hashlib.sha256((recording/'parameters.json').read_bytes()).hexdigest(),
        'recording_start_after_frame':args.start_after,'frames':len(rows)-args.start_after,
        'verified_original_frames':exact,'checkpoint':str(prefix),'random_seed':'Full initial.state, no memory edits',
        'writes':[]},indent=2),encoding='utf-8')
    print(output)

if __name__=='__main__':main()
