"""Read-only native item tracking; snapshot each first observed carried item."""
import ctypes as C
import hashlib,json,struct
from pathlib import Path
import numpy as np
from PIL import Image

PARAMETERS={'item_palette':2,'actor_palettes':[0,1],'held_offset':[24,15],
            'held_tolerance':3,'size':16,'actor_anchor':[32,56],
            'actor_world_addresses':[0x3bd4,0x4f50],
            'capture_unknown_pictures':True,
            'inventory_addresses':[0x4438,0x57b4],'bomb_inventory_id':8,
            'icon_indices':{'bomb':27,'boots':19,'cloud':14,'filler':9,'hammer':29}}

class ItemTrace:
    def __init__(self,output,maps):
        self.output=output;self.records=[];self.observed=set();self.object_records=[];self.pictures=set();self.inventory=[]
        self.picture_folder=output/'item-pictures';self.picture_folder.mkdir(exist_ok=True)
        self.pointers={start:ptr+offset for start,ptr,offset,length in maps if ptr}
        root=Path(__file__).resolve().parents[1]
        icons=json.loads((root/'renderer/games/eggo-mania/assets/item-icons.json').read_text(encoding='utf-8'))
        armed=root/'renderer/games/eggo-mania/assets/bomb-armed.json'
        self.armed_hash=json.loads(armed.read_text(encoding='utf-8'))['image_sha256'] if armed.exists() else None
        self.hashes={icons['icons'][i]['image_sha256']:kind for kind,i in PARAMETERS['icon_indices'].items()}

        if self.armed_hash:self.hashes[self.armed_hash]='bomb'

    def sample(self,frame):
        oam=C.string_at(self.pointers[0x07000000],1024)
        objects=[];actors={}
        for i in range(128):
            a0,a1,a2=struct.unpack_from('<HHH',oam,i*8)
            if a0&0x300==0x200:continue
            x,y=a1&511,a0&255
            if x>=448:x-=512
            if y>=192:y-=256
            obj={'object':i,'x':x,'y':y,'attributes':[a0,a1,a2]}
            if a0>>14==0 and a1>>14==3 and a2>>12 in PARAMETERS['actor_palettes']:
                actors[a2>>12]=obj
            if a0>>14==0 and a1>>14==1 and a2>>12==PARAMETERS['item_palette']:objects.append(obj)
        palette=np.frombuffer(C.string_at(self.pointers[0x05000000]+(256+32)*2,32),dtype='<u2').astype(np.uint32)
        colors=np.stack(((palette&31)*255//31,((palette>>5)&31)*255//31,((palette>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
        stride=2 if C.c_uint16.from_address(self.pointers[0x04000000]).value&64 else 32
        snapshots=[]
        ids=[C.c_int32.from_address(self.pointers[0x02000000]+address).value for address in PARAMETERS['inventory_addresses']]
        self.inventory.append({'frame':frame,'ids':ids})
        for side,kind in enumerate(ids):
            if kind==PARAMETERS['bomb_inventory_id'] and ('inventory-bomb',side) not in self.observed:
                self.observed.add(('inventory-bomb',side));snapshots.append(f'inventory-bomb-{side}.frame{frame:05d}')
        for obj in objects:
            a0,a1,a2=obj['attributes'];number=a2&1023
            if number+stride+1>=1024:continue
            pixels=np.zeros((16,16,4),dtype='uint8')
            for ty in range(2):
                for tx in range(2):
                    raw=np.frombuffer(C.string_at(self.pointers[0x06000000]+0x10000+(number+ty*stride+tx)*32,32),dtype='uint8')
                    indices=np.stack((raw&15,raw>>4),axis=1).reshape(8,8)
                    tile=colors[indices].copy();tile[indices==0]=0
                    pixels[ty*8:ty*8+8,tx*8:tx*8+8]=tile
            digest=hashlib.sha256(pixels.tobytes()).hexdigest();kind=self.hashes.get(digest)
            side=next((side for side,actor in actors.items() if abs(obj['x']-actor['x']-PARAMETERS['held_offset'][0])<=PARAMETERS['held_tolerance'] and abs(obj['y']-actor['y']-PARAMETERS['held_offset'][1])<=PARAMETERS['held_tolerance']),None)
            if PARAMETERS['capture_unknown_pictures']:
                self.object_records.append({'frame':frame,'kind':kind,'held_by':side,'image_sha256':digest,**obj})
                if digest not in self.pictures:
                    self.pictures.add(digest);Image.fromarray(pixels).save(self.picture_folder/(digest+'.png'))
            if not kind:continue
            field=0 if obj['x']<112 else 1
            actor=actors.get(field);world=None
            if actor:
                address=self.pointers[0x02000000]+PARAMETERS['actor_world_addresses'][field]
                actor_x,actor_y=struct.unpack('<ii',C.string_at(address,8))
                center=16 if a0&0x300==0x300 else 8
                world=[actor_x/65536+obj['x']+center-actor['x']-PARAMETERS['actor_anchor'][0],
                       actor_y/65536+obj['y']+center-actor['y']-PARAMETERS['actor_anchor'][1]]
            self.records.append({'frame':frame,'kind':kind,'held_by':side,'field':field,
                                 'world_pixels':world,'bomb_phase':('armed' if digest==self.armed_hash else 'boxed') if kind=='bomb' else None,'image_sha256':digest,**obj})
            if kind=='bomb' and ('free-bomb',field) not in self.observed:
                self.observed.add(('free-bomb',field));snapshots.append(f'bomb-first-{field}.frame{frame:05d}')
            if side is not None and (kind,side) not in self.observed:
                self.observed.add((kind,side));snapshots.append(f'{kind}-held-{side}.frame{frame:05d}')
        return snapshots

    def save(self):
        (self.output/'item-trace.json').write_text(json.dumps({'parameters':PARAMETERS,'records':self.records},indent=2),encoding='utf-8')
        (self.output/'item-objects.json').write_text(json.dumps({'parameters':PARAMETERS,'records':self.object_records},indent=2),encoding='utf-8')
        (self.output/'inventory-trace.json').write_text(json.dumps({'parameters':PARAMETERS,'records':self.inventory},indent=2),encoding='utf-8')
        return PARAMETERS
