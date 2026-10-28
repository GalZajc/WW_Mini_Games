"""Preserve native hammer flight, contact and the paired tower-damage control."""
from pathlib import Path
from datetime import datetime
import csv,hashlib,json,struct
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={
 'flight':'scripts/OUTPUT/eggo-reference_2026-10-03_19-34-21_885506/hammer-flight',
 'gaps_control':'scripts/OUTPUT/eggo-reference_2026-10-03_22-29-18_362290/hammer-gaps-control',
 'solid_control':'scripts/OUTPUT/eggo-reference_2026-10-03_22-28-30_337200/hammer-board',
 'art':'scripts/OUTPUT/eggo-reference_2026-10-03_19-31-29_660583/hammer-use.frame00060.sprites',
 'actor_baseline':720,'projectile_baseline':752,'pixels_per_cell':16,
 'actor_addresses':[0x3bd4,0x4f50],'hit_frame':66,
 'tower_contact_frame':75,'first_floor_removed':172,'second_floor_removed':286,
 'art_object':30,'art_palette':2}
sources=[];traces={};events={}
for name in ['flight','gaps_control','solid_control']:
 base=ROOT/PARAMETERS[name];raw=Path(str(base)+'.trace.json').read_bytes()
 meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'))
 assert meta['writes']==([[0x57b4,-1]] if name=='gaps_control' else [])
 traces[name]=json.loads(raw)
 events[name]=json.loads(Path(str(base)+'.board-events.json').read_text(encoding='utf-8'))
 sources.append({'kind':name,'parameters':meta,'trace_sha256':hashlib.sha256(raw).hexdigest()})
samples=[]
for record in traces['flight']:
 p=record['fields'][0]['projectiles']
 if p:
  assert len(p)==1 and p[0]['kind']==1
  s=p[0]
  samples.append({'frame':record['frame'],'x':s['x']/65536/16,
   'y':(PARAMETERS['projectile_baseline']-s['y']/65536)/16,
   'vy':-s['vy']/65536*60/16})
assert samples[-1]['frame']==65
assert traces['flight'][65]['fields'][1]['state']==7
assert all(r['fields'][1]['state']!=7 for r in traces['flight'][:65])
losses=[{'frame':r['frame'],'loss':r['net_cell_loss'][1]} for r in events['gaps_control'] if r['net_cell_loss'][1]]
assert losses[:2]==[{'frame':172,'loss':5},{'frame':286,'loss':5}]
assert not any(r['net_cell_loss'][1] for r in events['solid_control'])
hit_ram=Path(str(ROOT/PARAMETERS['flight'])+'.frame00066.ram').read_bytes()
x,y=struct.unpack_from('<ii',hit_ram,PARAMETERS['actor_addresses'][1])
target_at_hit={'x':(x/65536+16)/16,'y':(PARAMETERS['actor_baseline']-y/65536)/16}
art=ROOT/PARAMETERS['art'];objects=json.loads((art/'objects.json').read_text(encoding='utf-8'))
obj=next(o for o in objects if o['id']==PARAMETERS['art_object'])
assert obj['w']==obj['h']==16 and obj['palette']==PARAMETERS['art_palette']
picture=Image.open(art/f"{PARAMETERS['art_object']:03d}.png").convert('RGBA')
fixture={'parameters':PARAMETERS,'sources':sources,'samples':samples,
 'initial_actor':{'x':(traces['flight'][0]['world_x']+16)/16,'y':(720-traces['flight'][0]['world_y'])/16},
 'target_at_hit':target_at_hit,'initial_target_rows':events['flight'][0]['rows_bottom_up'][1],
 'gap_target_rows':events['gaps_control'][0]['rows_bottom_up'][1],'gap_losses':losses,
 'art':{'object':obj,'image_sha256':hashlib.sha256(picture.tobytes()).hexdigest()},
 'limits':'Unedited flight and actor hit; tower collapse comparison removes CPU inventory diagnostically. Later mixed-floor damage and view-dependent rotation phase still need independent validation.'}
out=ROOT/'scripts/OUTPUT'/('eggo-hammer-measurement_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
for dest in [out/'measurements.json',ROOT/'tests/fixtures/eggo-hammer-gba.json']:
 dest.write_text(json.dumps(fixture,indent=2)+'\n',encoding='utf-8')
picture.save(ROOT/'renderer/games/eggo-mania/assets/hammer-flight.png')
(ROOT/'renderer/games/eggo-mania/assets/hammer-flight.json').write_text(json.dumps(fixture['art'],indent=2)+'\n',encoding='utf-8')
with (out/'samples.csv').open('w',encoding='utf-8',newline='') as file:
 writer=csv.DictWriter(file,fieldnames=list(samples[0]));writer.writeheader();writer.writerows(samples)
print(out)
