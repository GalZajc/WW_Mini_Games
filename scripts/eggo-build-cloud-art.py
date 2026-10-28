"""Preserve original cloud phases and native counter evidence without guessed collision rules."""
from pathlib import Path
from datetime import datetime
import hashlib,json,struct,csv
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
PARAMETERS={'sources':[
 ['scripts/OUTPUT/eggo-reference_2026-10-03_18-33-28_689905/cloud-stay.frame00004',26,283],
 ['scripts/OUTPUT/eggo-reference_2026-10-03_18-33-28_689905/cloud-stay.frame00024',26,263],
 ['scripts/OUTPUT/eggo-reference_2026-10-03_18-33-28_689905/cloud-stay.frame00064',27,223],
 ['scripts/OUTPUT/eggo-reference_2026-10-03_18-34-06_756390/cloud-stay-long.frame00020',27,167],
 ['scripts/OUTPUT/eggo-reference_2026-10-03_19-06-59_360101/cloud-jump-hit.frame00087',27,200]],
 'palette':3,'sprite_size':64,'counter_address':0x10378,
 'position_addresses':[0x1037c,0x10380],
 'input_replay':'scripts/OUTPUT/eggo-reference_2026-10-03_18-32-01_021801/cloud-native',
 'first_frame':'scripts/OUTPUT/eggo-reference_2026-10-03_18-44-25_623063/cloud-start.frame00001'}
out=ROOT/'scripts/OUTPUT'/('eggo-cloud-art_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
records=[];pictures={}
for i,(path,number,counter) in enumerate(PARAMETERS['sources']):
 base=ROOT/path;sprites=Path(str(base)+'.sprites')
 objects=json.loads((sprites/'objects.json').read_text(encoding='utf-8'))
 obj=next(o for o in objects if o['id']==number)
 assert obj['w']==obj['h']==PARAMETERS['sprite_size'] and obj['palette']==PARAMETERS['palette']
 ram=Path(str(base)+'.ram').read_bytes()
 assert struct.unpack_from('<i',ram,PARAMETERS['counter_address'])[0]==counter
 image=Image.open(sprites/f'{number:03d}.png').convert('RGBA')
 digest=hashlib.sha256(image.tobytes()).hexdigest()
 if digest not in pictures:pictures[digest]=image.copy()
 stem=path.split('.frame')[0]
 source=json.loads((ROOT/(stem+'.json')).read_text(encoding='utf-8'));assert source['writes']==[]
 records.append({'source':path,'object':obj,'counter':counter,'atlas_frame':list(pictures).index(digest),
 'position':list(struct.unpack_from('<ii',ram,PARAMETERS['position_addresses'][0])),
 'image_sha256':hashlib.sha256(image.tobytes()).hexdigest(),
 'source_parameters':source,'ram_sha256':hashlib.sha256(ram).hexdigest()})
assert len(set(tuple(r['position']) for r in records))==1,'Cloud stays fixed in world coordinates'
assert len(pictures)==2,'One normal texture and one strike texture'
atlas=Image.new('RGBA',(PARAMETERS['sprite_size']*len(pictures),PARAMETERS['sprite_size']))
for i,picture in enumerate(pictures.values()):atlas.paste(picture,(i*PARAMETERS['sprite_size'],0))
first=Path(str(ROOT/PARAMETERS['first_frame'])+'.ram').read_bytes()
first_counter=struct.unpack_from('<i',first,PARAMETERS['counter_address'])[0]
manifest={'parameters':PARAMETERS,'records':records,'first_displayed_counter':first_counter,
 'image_sha256':hashlib.sha256(atlas.tobytes()).hexdigest(),
 'limits':'Normal/strike textures. Visible texture follows the previous physics counter because of native sprite-buffer latency. Environmental electric bubble is a separate effect.'}
for dest in [out,ROOT/'renderer/games/eggo-mania/assets']:
 atlas.save(dest/'cloud-phases.png')
 (dest/'cloud-phases.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(out/'parameters.json').write_text(json.dumps(PARAMETERS,indent=2)+'\n',encoding='utf-8')
with (out/'samples.csv').open('w',encoding='utf-8',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=['source','counter','world_x_fixed','world_y_fixed'])
 writer.writeheader()
 writer.writerows({'source':r['source'],'counter':r['counter'],'world_x_fixed':r['position'][0],
                  'world_y_fixed':r['position'][1]} for r in records)
print(out)
