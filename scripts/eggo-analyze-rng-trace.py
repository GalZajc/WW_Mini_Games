"""Count native RNG advances between frame-exact Survival checkpoints."""
from pathlib import Path
from collections import Counter
from datetime import datetime
import argparse, csv, hashlib, json

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--folder',required=True,help='eggo-reference OUTPUT folder')
parser.add_argument('--name',default='survival-rng-audit')
parser.add_argument('--max-draws',type=int,default=64)
args=parser.parse_args()
folder=Path(args.folder)
trace_path=folder/(args.name+'.trace.json')
source=trace_path.read_bytes()
trace=json.loads(source)

def step(seed):
    product=(seed&0xffff)*75
    high=product>>16
    low=product&0xffff
    return (product-high-(high<=low))&0xffff

def distance(old,new):
    value=old&0xffff
    for draws in range(args.max_draws+1):
        if value==(new&0xffff):
            return draws
        value=step(value)
    return -1

streams=('rng','rng_game','rng_secondary')
transitions=[]
draw_histograms={name:Counter() for name in streams}
unmatched={name:[] for name in streams}
correlation_keys=('active_enemy_types','cpu_actor_state','pickup_birth','enemy_spawn')
stream_correlations={name:{key:Counter() for key in correlation_keys} for name in streams}
field_rng_mappings=Counter()
field_correlations={str(field):{key:Counter() for key in ('active_enemy_types','pickup_birth','enemy_spawn')}
                    for field in range(2)}
for previous,current in zip(trace,trace[1:]):
    row={'frame':current['frame'],'native_frame':current.get('native_frame'),
         'cpu_keys':current.get('cpu',{}).get('keys')}
    for name in streams:
        before=previous.get('arena',{}).get(name)
        after=current.get('arena',{}).get(name)
        count=distance(before,after) if before is not None and after is not None else None
        row[name+'_before']=before
        row[name+'_after']=after
        row[name+'_draws']=count
        if count is not None:
            draw_histograms[name][str(count)]+=1
            if count<0:
                unmatched[name].append(current['frame'])
    old_pickups=previous.get('pickups',[])
    new_pickups=current.get('pickups',[])
    row['pickup_manager_spawn_clocks_changed']=[i for i,(a,b) in enumerate(zip(old_pickups,new_pickups)) if a.get('spawn_clock')!=b.get('spawn_clock')]
    row['pickup_counts']=[len(manager.get('items',[])) for manager in new_pickups]
    row['pickup_births']=[sum(1 for item in manager.get('items',[])
        if item.get('address') not in {old.get('address') for old in old_pickups[index].get('items',[])})
        for index,manager in enumerate(new_pickups) if index<len(old_pickups)]
    old_enemies=previous.get('enemies',[])
    new_enemies=current.get('enemies',[])
    row['enemy_spawns']=[i for i,(a,b) in enumerate(zip(old_enemies,new_enemies)) if not a.get('active') and b.get('active')]
    row['cpu_actor_state']=current.get('cpu',{}).get('actor',{}).get('state')
    active_types=','.join(map(str,sorted({enemy.get('type') for enemy in new_enemies if enemy.get('active')}))) or 'none'
    observations=(('active_enemy_types',active_types),
                  ('cpu_actor_state',str(row['cpu_actor_state'])),
                  ('pickup_birth','yes' if any(row['pickup_births']) else 'no'),
                  ('enemy_spawn','yes' if row['enemy_spawns'] else 'no'))
    for stream in streams:
        draws=row[stream+'_draws']
        if draws is None:
            continue
        for key,value in observations:
            stream_correlations[stream][key][f'{value}|draws={draws}']+=1
    field_streams={}
    for field_state in current.get('field_rng',[]):
        field_index=field_state['field']
        stream=field_state['stream']
        field_streams[field_index]=stream
        field_rng_mappings[f"field={field_index} selector={field_state['selector']} stream={stream}"]+=1
        if stream not in streams or str(field_index) not in field_correlations:
            continue
        field_draws=row[stream+'_draws']
        if field_draws is None:
            continue
        enemy_records=[(index,enemy) for index,enemy in enumerate(new_enemies)
                       if enemy.get('field',index%2)==field_index]
        active_field_types=','.join(map(str,sorted({enemy.get('type') for _,enemy in enemy_records if enemy.get('active')}))) or 'none'
        field_spawns=[index for index in row['enemy_spawns'] if index%2==field_index]
        observations=(('active_enemy_types',active_field_types),
                      ('pickup_birth','yes' if row['pickup_births'][field_index] else 'no'),
                      ('enemy_spawn','yes' if field_spawns else 'no'))
        for key,value in observations:
            field_correlations[str(field_index)][key][f'{value}|draws={field_draws}']+=1
    transitions.append(row)

summary={'parameters':{'trace':str(trace_path),'trace_sha256':hashlib.sha256(source).hexdigest(),
                       'frames':len(trace),'max_draws_searched':args.max_draws,
                       'step':'(75*s - high - (high <= low)) mod 65536',
                       'stream_addresses':{'rng':'0x02011aac (global Survival/game RNG; advanced by ROM helper 0x0800935c)',
                                           'rng_game':'0x02011ab0 (updated by ROM helper 0x08009380)',
                                           'rng_secondary':'0x02011ab4 (updated by ROM helper 0x080093a4)'}},
         'draw_count_histograms':{name:dict(counter) for name,counter in draw_histograms.items()},
         'stream_draw_correlations':{stream:{key:dict(counter) for key,counter in features.items()}
                                    for stream,features in stream_correlations.items()},
         'field_rng_mapping_observations':dict(field_rng_mappings),
         'per_field_stream_correlations':{field:{key:dict(counter) for key,counter in features.items()}
                                          for field,features in field_correlations.items()},
         'unmatched_transition_frames':unmatched,
         'limits':'Per-frame advance counts are inferred from captured state transitions. Correlations are descriptive only. Direct helper addresses are confirmed by ROM disassembly; the selector that chooses a helper is documented only for captured field states.'}
out=folder/'rng-analysis'
out.mkdir(exist_ok=True)
(out/'parameters.json').write_text(json.dumps(summary['parameters'],indent=2)+'\n',encoding='utf-8')
(out/'analysis.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
with (out/'transitions.csv').open('w',encoding='utf-8',newline='') as stream:
    writer=csv.DictWriter(stream,fieldnames=list(transitions[0]))
    writer.writeheader()
    writer.writerows(transitions)
print(json.dumps({'frames':len(trace),'draw_count_histograms':summary['draw_count_histograms'],
                  'unmatched':{name:len(frames) for name,frames in unmatched.items()},'output':str(out)},ensure_ascii=False))
