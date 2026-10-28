"""Read-only native rival pose recorder used by the reference host."""
import ctypes as C
import hashlib,json,struct
from pathlib import Path
import numpy as np
from PIL import Image

# Record every native frame so short grounded movement bursts and their exact
# sprite cadence are not hidden between two-frame samples.
PARAMETERS={'palette':1,'size':64,'sample_steps':1,'world_x':0x4f50,'world_y':0x4f54,
            'boots_timer':0x587c,'skip_boots':True,'position_epsilon':.02,
            'float_rise_pixels_per_sample':1,'board_start':0x10084+0x124c,
            'board_rows':47,'board_stride':8,'board_columns':7,'throw_steps':28,
            'animation_fields':{'free_group_index':'0x83c','held_group_index':'0x840',
                'group_period':'0x848','animation_table':'0x84c','animation_frame':'0x850',
                'selector':'0x854','state':'0x858','phase':'0x85c','random_step':'0x860',
                'flags':'0x86c','actor_state':'0x874','next_state':'0x878'}}
class PoseRecorder:
    def __init__(self,output,maps,ram,field=1,sample_steps=None):
        self.p={**PARAMETERS,'palette':field,'world_x':0x3bd4+field*0x137c,'world_y':0x3bd8+field*0x137c,'boots_timer':0x4500+field*0x137c,'board_start':0x10084+field*0x124c,'sample_steps':sample_steps or PARAMETERS['sample_steps']}
        self.p['actor_base']=self.p['world_x']
        self.output=Path(output)/('rival-poses' if field else 'player-poses');self.output.mkdir(exist_ok=True)
        self.pointers={start:ptr+offset for start,ptr,offset,length in maps if ptr}
        self.ram=ram;self.records=[];self.images={};self.previous=None
    def sample(self,frame):
        if frame%self.p['sample_steps']:return
        oam=C.string_at(self.pointers[0x07000000],1024)
        objects=[]
        for i in range(128):
            a0,a1,a2=struct.unpack_from('<HHH',oam,i*8)
            if a0&0x300==0x200:continue
            if a0>>14==0 and a1>>14==3:objects.append((i,a0,a1,a2))
        actor=next((o for o in objects if o[3]>>12==self.p['palette'] and not o[1]&256),None)
        if actor is None:return
        x=C.c_int32.from_address(self.ram+self.p['world_x']).value/65536
        y=C.c_int32.from_address(self.ram+self.p['world_y']).value/65536
        actor_base_ptr=self.ram+self.p['actor_base']
        animation={name:C.c_int32.from_address(actor_base_ptr+offset).value for name,offset in {
            'selector':0x854,'state':0x858,'phase':0x85c,'random_step':0x860,
            'flags':0x86c,'actor_state':0x874,'next_state':0x878,
        }.items()}
        for name,offset in {'free_group_index':0x83c,'held_group_index':0x840,
                            'group_period':0x848}.items():
            animation[name]=C.c_uint32.from_address(actor_base_ptr+offset).value
        for name,offset in {'table':0x84c,'frame':0x850}.items():
            animation[name]=f'0x{C.c_uint32.from_address(actor_base_ptr+offset).value:08x}'
        boosted=C.c_uint32.from_address(self.ram+self.p['boots_timer']).value>0
        board=C.string_at(self.ram+self.p['board_start'],self.p['board_rows']*self.p['board_stride'])
        occupied=sum(bool(board[r*8+c]) for r in range(47) for c in range(7))
        held=any(o[3]>>12==14 for o in objects)
        previous=self.previous or (x,y,occupied)
        dx,dy=x-previous[0],y-previous[1];self.previous=(x,y,occupied)
        if boosted and self.p['skip_boots']:return
        _,a0,a1,a2=actor;first=a2&1023
        io=C.string_at(self.pointers[0x04000000],2);stride=8 if struct.unpack('<H',io)[0]&64 else 32
        if first+7*stride+7>=1024:return
        palette=np.frombuffer(C.string_at(self.pointers[0x05000000]+512+self.p['palette']*32,32),dtype='<u2')
        colors=np.stack(((palette&31)*255//31,((palette>>5)&31)*255//31,((palette>>10)&31)*255//31,np.full(16,255)),axis=-1).astype('uint8')
        image=np.zeros((64,64,4),dtype='uint8')
        for row in range(8):
            for col in range(8):
                raw=np.frombuffer(C.string_at(self.pointers[0x06000000]+0x10000+(first+row*stride+col)*32,32),dtype='uint8')
                indices=np.stack((raw&15,raw>>4),axis=1).reshape(8,8)
                pixels=colors[indices].copy();pixels[indices==0]=0
                image[row*8:row*8+8,col*8:col*8+8]=pixels
        digest=hashlib.sha256(image.tobytes()).hexdigest()
        if digest not in self.images:
            Image.fromarray(image).save(self.output/(digest+'.png'));self.images[digest]=True
        if dy<-self.p['position_epsilon']:
            state='float' if -dy<self.p['float_rise_pixels_per_sample'] else 'rise'
        elif dy>self.p['position_epsilon']:state='fall'
        else:state='walk' if abs(dx)>self.p['position_epsilon'] else 'idle'
        if not held:state+='-free'
        self.records.append({'frame':frame,'image_sha256':digest,'state':state,'x':x,'y':y,
                             'captured_flip_x':bool(a1&4096),'object':actor[0],
                             'held_preview':held,'net_added_cells':max(0,occupied-previous[2]),
                             'animation':animation})
    def save(self):
        # Placement finish provides a retrospective throw window. Filling six
        # gaps is an instant item effect and is deliberately excluded.
        events=[r['frame'] for r in self.records if 0<r['net_added_cells']<=5]
        for frame in events:
            for record in self.records:
                if frame-self.p['throw_steps']<record['frame']<=frame:record['state']='throw'
        (self.output/'poses.json').write_text(json.dumps({'parameters':self.p,'records':self.records},indent=2),encoding='utf-8')
        return self.p
