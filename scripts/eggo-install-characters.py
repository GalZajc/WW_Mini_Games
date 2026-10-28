"""Install reference-backed player sheets, portraits and character result cycles."""
from pathlib import Path
from datetime import datetime
import argparse,hashlib,json,struct,csv,shutil
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];ASSETS=ROOT/'renderer/games/eggo-mania/assets'
p=argparse.ArgumentParser();p.add_argument('captures');p.add_argument('--decoded');a=p.parse_args()
CAPTURES=ROOT/a.captures;captures=json.loads((CAPTURES/'captures.json').read_text(encoding='utf-8'))
parameters=json.loads((CAPTURES/'parameters.json').read_text(encoding='utf-8'))
decoded=ROOT/(a.decoded or parameters['decoded']);resources=json.loads((decoded/'measurement.json').read_text(encoding='utf-8'))
PARAMETERS={'captures':a.captures,'decoded':parameters['decoded'],'menu_source':'scripts/OUTPUT/eggo-reference_2026-10-04_22-24-52_823457',
 'pose_templates':{'idle':[[2,0],[2,1]],'walk':[[4,0],[4,1],[4,2],[4,3],[4,4],[4,5],[4,6]],
 # The native selector-5 held rise and moving float use Yolko ROM group 9.
 # Group 7 is a different cel set and only looked close in the first captures.
 'rise':[[9,0],[9,0],[9,1],[9,1]],'float':[[9,0],[9,1],[9,0],[9,0]],
 'fall':[[11,0],[11,0],[11,1],[11,1]],
 'throw':[[14,0],[14,1],[14,2],[14,3],[14,4],[14,5],[14,6],[14,7],
          [15,0],[15,1],[16,0],[16,1],[16,2],[16,3]],
 'idle-free':[[1,1],[1,1]],'walk-free':[[3,0],[3,1]],'rise-free':[[16,4],[16,5]],
 'float-free':[[16,6],[16,7]],'fall-free':[[10,1],[10,1]],
 'injured':[[5,i] for i in range(4)],'swim':[[17,i] for i in range(10)],
 'recovery-free':[[1,0],[1,1]],'recovery-held':[[2,0],[2,1]],
 'fall-moving':[[12,0],[12,1]]},
 'selection_address':0x3d4,'active_character_address':0x3d8,'win_warmup':200,'period_limit':512,
 'special_frame_ticks':4,
 'podium_display_conversion':'mGBA RGB565 green5 << 1, then floor(green6 * 255 / 63)',
 'seed':'encoded in each original checkpoint; diagnostic character ID writes recorded in captures'}
out=ROOT/'scripts/OUTPUT'/('eggo-character-install_'+datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'));out.mkdir(parents=True)
records={};runtime={};portraits=Image.new('RGBA',(8*16,16));motion={};original_sequences={}
def visible(image):
 pixels=np.array(image.convert('RGBA'));pixels[pixels[:,:,3]==0]=0;return pixels.tobytes()
def native_color(image):
 pixels=np.array(image.convert('RGBA'));green5=np.rint(pixels[:,:,1].astype('float64')*31/255).astype('uint16')
 pixels[:,:,1]=(green5*2*255//63).astype('uint8');return Image.fromarray(pixels)
for name,character in resources['characters'].items():
 atlas=Image.open(decoded/(name+'.png')).convert('RGBA')
 def cell(group,frame):return atlas.crop((frame*64,(group-1)*64,(frame+1)*64,group*64))
 sheet=Image.new('RGBA',(max(map(len,PARAMETERS['pose_templates'].values()))*64,
                         len(PARAMETERS['pose_templates'])*64))
 for row,(state,templates) in enumerate(PARAMETERS['pose_templates'].items()):
  for frame,(group,picture) in enumerate(templates):sheet.paste(cell(group,picture),(frame*64,row*64))
 if name=='yolko':
  previous=Image.open(ASSETS/'yolko-poses.png').convert('RGBA')
  for row,(state,templates) in enumerate(PARAMETERS['pose_templates'].items()):
   if row>=11:continue
   if state=='throw':
    # The old row sampled every other native throw cel. Keep those original
    # reference images byte-identical at their corresponding expanded slots.
    for old_frame,new_frame in enumerate(range(1,14,2)):
     old_region=(old_frame*64,row*64,(old_frame+1)*64,(row+1)*64)
     new_region=(new_frame*64,row*64,(new_frame+1)*64,(row+1)*64)
     assert visible(sheet.crop(new_region))==visible(previous.crop(old_region)),(state,old_frame,new_frame)
    continue
   if state in ('rise','float'):
    # These measured rows intentionally replace the earlier group-7 guesses.
    continue
   existing_frames=4 if state=='walk' else len(templates)
   for frame in range(existing_frames):
    region=(frame*64,row*64,(frame+1)*64,(row+1)*64)
    assert visible(sheet.crop(region))==visible(previous.crop(region)),(state,frame)
 sheet.save(ASSETS/(name+'-player-poses.png'))
 if name=='yolko':sheet.save(ASSETS/'yolko-poses.png')
 base=ROOT/captures[name]['game'];snapshot=Path(str(base)+'.frame00428')
 meta=json.loads(Path(str(base)+'.json').read_text(encoding='utf-8'));ram=Path(str(snapshot)+'.ram').read_bytes()
 assert meta['writes']==[[PARAMETERS['selection_address'],character['id']]]
 assert struct.unpack_from('<I',ram,PARAMETERS['active_character_address'])[0]==character['id']
 vram=Path(str(snapshot)+'.memory3').read_bytes();oam=Path(str(snapshot)+'.0x7000000').read_bytes()
 io=Path(str(snapshot)+'.0x4000000').read_bytes();pal=np.frombuffer(Path(str(snapshot)+'.0x5000000').read_bytes(),dtype='<u2')[256:]
 palette=np.stack(((pal&31)*255//31,((pal>>5)&31)*255//31,((pal>>10)&31)*255//31,np.full(256,255)),axis=-1).astype('uint8')
 objects={}
 for index in range(128):
  aa,bb,cc=struct.unpack_from('<3H',oam,index*8)
  if aa&0x300==0x200 or aa>>14 or aa&256:continue
  size=[8,16,32,64][bb>>14];image=np.zeros((size,size,4),dtype='uint8');stride=size//8 if struct.unpack_from('<H',io)[0]&64 else 32
  for y in range(size//8):
   for x in range(size//8):
    at=0x10000+((cc&1023)+y*stride+x)*32;raw=np.frombuffer(vram[at:at+32],dtype='uint8')
    indices=np.stack((raw&15,raw>>4),axis=1).reshape(8,8);tile=palette[indices+(cc>>12)*16].copy();tile[indices==0]=0
    image[y*8:y*8+8,x*8:x*8+8]=tile
  objects[index]=(Image.fromarray(image),cc>>12)
 portrait=objects[2][0];assert portrait.size==(16,16)
 portraits.paste(portrait,(character['id']*16,0))
 actor=next(image for image,palette_id in objects.values() if image.size==(64,64) and palette_id==0)
 actor_hash=hashlib.sha256(actor.tobytes()).hexdigest()
 assert actor_hash in {r['pixels_sha256'] for rs in character['groups'].values() for r in rs},name
 outcome_records={};motion[name]={};original_sequences[name]={};runtime[name]={'id':character['id'],'label':name.capitalize()}
 for kind in ['win','loss']:
  source=ROOT/captures[name][kind];folder=source.parent/'podium';data=json.loads((folder/'poses.json').read_text(encoding='utf-8'))
  native_meta=json.loads(Path(str(source)+'.json').read_text(encoding='utf-8'))
  assert native_meta['writes']==[[PARAMETERS['selection_address'],character['id']],[PARAMETERS['active_character_address'],character['id']]]
  sequence=data['records'];keys=[(r['picture'],r['x'],r['y']) for r in sequence]
  original_sequences[name][kind]=[[r['frame'],r['picture'],r['x'],r['y']] for r in sequence]
  if kind=='win':
   start=PARAMETERS['win_warmup'];period=next((n for n in range(1,PARAMETERS['period_limit']+1) if len(keys)>start+2*n and all(keys[i]==keys[i+n] for i in range(start,len(keys)-n))),None)
   assert period is not None,name
   sequence=sequence[start:start+period];runtime[name]['winCycle']=period
  else:runtime[name]['lossTitleTick']=sequence[-1]['frame']+1
  # Each full-color native image must belong to this character's exact ROM resources.
  hashes={r['pixels_sha256'] for rs in character['groups'].values() for r in rs}
  used={r['picture'] for r in sequence};assert all(h in hashes for h,i in data['images'].items() if i in used),(name,kind)
  native_color(Image.open(folder/'actor-atlas.png')).save(ASSETS/(name+'-podium-'+kind+'.png'))
  motion[name][kind]=[[r['frame'],r['picture'],r['x'],r['y']] for r in sequence]
  outcome_records[kind]={'source':str(source.relative_to(ROOT)),'metadata':native_meta,'poses_sha256':hashlib.sha256((folder/'poses.json').read_bytes()).hexdigest(),'frames':len(sequence)}
 records[name]={'native_id':character['id'],'game':meta,'actor_sha256':actor_hash,'portrait_sha256':hashlib.sha256(visible(portrait)).hexdigest(),'results':outcome_records}
portraits.save(ASSETS/'player-portraits.png')
default_portraits=Image.open(ASSETS/'progress-portraits.png');assert visible(portraits.crop((16,0,32,16)))==visible(default_portraits.crop((0,0,16,16)))
special_names=['injured','swim','recovery-free','recovery-held']
special_states={name:{'row':11+i,'frames':len(PARAMETERS['pose_templates'][name]),'ticks_per_frame':PARAMETERS['special_frame_ticks']}
 for i,name in enumerate(special_names)}
data={'parameters':PARAMETERS,'runtime':runtime,'characters':records,'motions':motion,
 'special_states':special_states,
 'limits':'Eight default menu characters; unlockable characters remain open. Pose templates preserve the previous Yolko phase fitting; this does not prove every live actor state/phase or character voices. Podium cycles are taken after warmup, so exact entry phase is not proven.'}
for dest,obj in [(out/'parameters.json',PARAMETERS),(out/'measurement.json',data),(ASSETS/'characters.json',data)]:dest.write_text(json.dumps(obj,indent=2)+'\n',encoding='utf-8')
fixture={'parameters':PARAMETERS,'sources':records,'sequences':original_sequences}
(ROOT/'tests/fixtures/eggo-character-podium-gba.json').write_text(json.dumps(fixture,separators=(',',':'))+'\n',encoding='utf-8')
(ASSETS/'characters.js').write_text('// Original character resources and native OAM result cycles; provenance in characters.json.\nexport const CHARACTER_ART='+json.dumps(runtime,separators=(',',':'))+';\nexport const CHARACTER_PODIUM='+json.dumps(motion,separators=(',',':'))+';\nexport const CHARACTER_SPECIAL_STATES='+json.dumps(data['special_states'],separators=(',',':'))+';\n',encoding='utf-8')
with (out/'characters.csv').open('w',encoding='utf-8',newline='') as file:
 writer=csv.writer(file);writer.writerow(['character','native_id','win_cycle','loss_title_tick'])
 for name,entry in runtime.items():writer.writerow([name,entry['id'],entry['winCycle'],entry['lossTitleTick']])
print(out)
