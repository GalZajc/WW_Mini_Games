"""Input-only reference player. It observes OAM/board RAM, never writes them.

This is research automation, not the rival implementation in the mini-game.
"""
import ctypes as C
import struct
import subprocess
from pathlib import Path
from collections import deque
import numpy as np

PARAMETERS = {
    'board_start': 0x10084, 'board_stride': 8,
    'floor_row': 47, 'columns': 7, 'tile_size': 16,
    'player_palette': 0, 'preview_palette': 13, 'crate_palette': 2,
    'decision_frames': 1, 'jump_cycle': 40, 'jump_press': 32,
    'place_press': 8, 'place_release': 24, 'align_pixels': 3,
    'score_hole': 9, 'score_height': 1.5, 'score_roughness': 1,
    'score_line': 18,
    'strategy': 'build', 'stack_target': 40,
    'player_anchor_x':32,'player_world_margin':16,
    'player_y':0x3bd8,'baseline_y':720.044,'reachable_rise':4,
    'score_travel':0.3,'rotate_press':4,'rotate_release':4,
    'held_icon_offset_y':15,'held_icon_offset_x':24,'held_icon_tolerance':3,
    'excluded_oam_objects':[2,3],
    'inventory_address':0x4438,'bomb_inventory_id':8,'hunt_discard_release':32,
    'hunt_world_bounds':[0,88],
    # GBA KEYINPUT bit masks used by the native CPU's emitted input word.
    'native_key_bits':{'A':0x001,'B':0x002,'SELECT':0x004,'START':0x008,
        'RIGHT':0x010,'LEFT':0x020,'UP':0x040,'DOWN':0x080,'R':0x100,'L':0x200},
}

class ReferencePlayer:
    def __init__(self,cpu_key_address=None,output_dir=None,trace_model=False):
        self.cached = set()
        self.place = 0
        self.release = 0
        self.shape_cache = {}
        self.observed_shapes = set()
        self.goal=None;self.rotating=0;self.rotate_wait=0
        self.cpu_key_address=cpu_key_address
        self.model_process=None
        self.model_trace_path=(Path(output_dir)/(PARAMETERS['strategy']+'-model.jsonl')
                               if trace_model and output_dir and PARAMETERS['strategy'] in ('open-loop-cpu','stateful-cpu') else None)
        self.model_predictions=0
        self.shadow_compared=0
        self.shadow_matches=0
        self.shadow_mismatches=[]
        self.shadow_same_state_compared=0
        self.shadow_same_state_matches=0
        self.shadow_same_state_mismatches=[]
        self.previous_model_mask=None

    def close(self):
        if self.model_process is not None:
            self.model_process.stdin.close()
            self.model_process.wait()
            self.model_process=None

    def model_summary(self):
        return {'model_predictions':self.model_predictions,'shadow_compared':self.shadow_compared,
                'shadow_matches':self.shadow_matches,'shadow_mismatches':self.shadow_mismatches,
                'shadow_same_state_compared':self.shadow_same_state_compared,
                'shadow_same_state_matches':self.shadow_same_state_matches,
                'shadow_same_state_mismatches':self.shadow_same_state_mismatches}

    def input(self, frame, ram_ptr, oam_ptr, vram_ptr):
        if frame % PARAMETERS['decision_frames'] and not self.place and not self.release:
            return self.cached
        ram = C.string_at(ram_ptr, 262144)
        if PARAMETERS['strategy']=='mirror-cpu':
            if self.cpu_key_address is None:
                raise ValueError('mirror-cpu requires the native CPU key-word address')
            mask=struct.unpack_from('<H',ram,self.cpu_key_address)[0]
            return {name for name,bit in PARAMETERS['native_key_bits'].items() if mask&bit}
        if PARAMETERS['strategy'] in ('model-player','shadow-cpu','open-loop-cpu','stateful-cpu'):
            if self.model_process is None:
                helper=Path(__file__).with_name('eggo-reference-model-bot.mjs')
                command=['node',str(helper),PARAMETERS['strategy']]
                if self.model_trace_path is not None:command.append(str(self.model_trace_path))
                self.model_process=subprocess.Popen(command,
                    stdin=subprocess.PIPE,stdout=subprocess.PIPE,bufsize=0)
            self.model_process.stdin.write(ram)
            self.model_process.stdin.flush()
            raw=self.model_process.stdout.read(2)
            if len(raw)!=2:
                raise RuntimeError('The model-policy helper stopped before returning its key mask.')
            mask=struct.unpack('<H',raw)[0]
            self.model_predictions+=1
            if PARAMETERS['strategy'] in ('shadow-cpu','open-loop-cpu','stateful-cpu'):
                native=struct.unpack_from('<H',ram,self.cpu_key_address)[0]
                self.shadow_same_state_compared+=1
                if mask==native:self.shadow_same_state_matches+=1
                elif len(self.shadow_same_state_mismatches)<20:
                    self.shadow_same_state_mismatches.append({'frame':frame,'predicted':mask,'native':native})
                if self.previous_model_mask is not None:
                    self.shadow_compared+=1
                    if self.previous_model_mask==native:self.shadow_matches+=1
                    elif len(self.shadow_mismatches)<20:
                        self.shadow_mismatches.append({'frame':frame,'predicted':self.previous_model_mask,'native':native})
                self.previous_model_mask=mask
                if PARAMETERS['strategy'] in ('shadow-cpu','stateful-cpu'):return set()
            return {name for name,bit in PARAMETERS['native_key_bits'].items() if mask&bit}
        oam = C.string_at(oam_ptr, 1024)
        objects = []
        for i in range(128):
            if i in PARAMETERS['excluded_oam_objects']:continue
            a0,a1,a2 = struct.unpack_from('<HHH',oam,i*8)
            if a0&0x300==0x200: continue
            x,y = a1&511,a0&255
            if x>=448:x-=512
            if y>=192:y-=256
            if x>=112 or y>=160: continue
            objects.append((a0,a1,a2,x,y))
        player = next((o for o in objects if o[0]>>14==0 and o[1]>>14==3 and o[2]>>12==PARAMETERS['player_palette']),None)
        preview = next((o for o in objects if o[0]>>14==0 and o[1]>>14==3 and o[2]>>12==PARAMETERS['preview_palette']),None)
        keys = set()
        # Control the displayed object without coupling steering to a fixed RAM
        # entity layout. This field never scrolls horizontally.
        if player is None:return set()
        x = player[3]+PARAMETERS['player_anchor_x']-PARAMETERS['player_world_margin']
        if PARAMETERS['strategy']=='hunt':
            inventory=struct.unpack_from('<i',ram,PARAMETERS['inventory_address'])[0]
            if inventory==PARAMETERS['bomb_inventory_id']:return set()
            if self.release:self.release-=1;return set()
            if inventory>=0:
                self.release=PARAMETERS['hunt_discard_release'];return {'R'}
            crates=[o for o in objects if o[0]>>14==0 and o[1]>>14==1
                    and o[2]>>12==PARAMETERS['crate_palette'] and -32<o[4]<136]
            if not crates:return set()
            foot=player[4]+56
            def center(o):return 16 if o[0]&0x300==0x300 else 8
            crate=min(crates,key=lambda o:abs(o[3]+center(o)-PARAMETERS['player_world_margin']-x)
                      +abs(o[4]+center(o)-foot)*0.5)
            target=max(PARAMETERS['hunt_world_bounds'][0],min(PARAMETERS['hunt_world_bounds'][1],
                       crate[3]+center(crate)-PARAMETERS['player_world_margin']))
            return {'RIGHT' if target>x else 'LEFT'} if abs(target-x)>PARAMETERS['align_pixels'] else set()
        if self.place:
            keys.add('A');self.place-=1
            if not self.place:self.release=PARAMETERS['place_release']
        elif self.release:
            self.release-=1
        elif preview:
            cells = self.shape(preview[2]&1023,vram_ptr)
            if self.goal is None:self.goal=self.target(cells,ram,x)
            if self.rotating:
                keys.add('B');self.rotating-=1
                if not self.rotating:self.rotate_wait=PARAMETERS['rotate_release']
            elif self.rotate_wait:self.rotate_wait-=1
            elif self.goal and self.goal['rotations']:
                keys.add('B');self.rotating=PARAMETERS['rotate_press']-1;self.goal['rotations']-=1
            target=self.goal['target'] if self.goal else None
            if self.rotating or self.rotate_wait or 'B' in keys:return keys
            if target is not None:
                if abs(target-x)<=PARAMETERS['align_pixels']:
                    keys.add('A');self.place=PARAMETERS['place_press']-1;self.goal=None
                else:
                    keys.add('RIGHT' if target>x else 'LEFT')
                    if frame%PARAMETERS['jump_cycle']<PARAMETERS['jump_press']:keys.add('UP')
        else:
            self.goal=None
            crates = [o for o in objects if o[0]>>14==0 and o[1]>>14==1 and o[2]>>12==PARAMETERS['crate_palette'] and o[4]<136]
            held=next((o for o in crates if
                abs(o[3]-player[3]-PARAMETERS['held_icon_offset_x'])<=PARAMETERS['held_icon_tolerance'] and
                abs(o[4]-player[4]-PARAMETERS['held_icon_offset_y'])<=PARAMETERS['held_icon_tolerance']),None)
            if held:
                # A carried item has no placement-preview sprite. Use it rather
                # than waiting forever for another pickup with occupied hands.
                keys.add('A');self.place=PARAMETERS['place_press']-1;return keys
            if crates:
                # Catch the nearest visible crate, considering vertical travel.
                foot = player[4]+56 if player else 112
                def center(o):return 16 if o[0]&0x300==0x300 else 8
                crate = min(crates,key=lambda o:abs(o[3]+center(o)-PARAMETERS['player_world_margin']-x)+abs(o[4]+center(o)-foot)*0.5)
                target = crate[3]+center(crate)-PARAMETERS['player_world_margin']
                if abs(target-x)>PARAMETERS['align_pixels']:keys.add('RIGHT' if target>x else 'LEFT')
                if frame%PARAMETERS['jump_cycle']<PARAMETERS['jump_press']:keys.add('UP')
        self.cached=keys
        return keys

    def shape(self,tile,vram_ptr):
        data=C.string_at(vram_ptr+0x10000+tile*32,2048)
        if data in self.shape_cache:return self.shape_cache[data]
        raw = np.frombuffer(data,dtype='uint8')
        pixels = np.stack((raw&15,raw>>4),axis=1).reshape(8,8,8,8).transpose(0,2,1,3).reshape(64,64)
        occupied=pixels!=0
        # Preview outlines enclose the shape; flood-fill its exterior so shared
        # cell edges need not be drawn to identify the union's interior.
        outside=np.zeros((64,64),dtype=bool);q=deque([(0,0)]);outside[0,0]=True
        while q:
            y,x=q.popleft()
            for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
                if 0<=yy<64 and 0<=xx<64 and not outside[yy,xx] and not occupied[yy,xx]:
                    outside[yy,xx]=True;q.append((yy,xx))
        ys,xs=np.where(occupied)
        if not len(xs):return []
        startx,starty=int(xs.min()),int(ys.min())
        width,height=(int(xs.max())-startx+16)//16,(int(ys.max())-starty+16)//16
        cells=[(x,y) for y in range(height) for x in range(width)
            if startx+8+x*16<64 and starty+8+y*16<64 and not outside[starty+8+y*16,startx+8+x*16]]
        if not cells:return []
        minx,miny=min(x for x,y in cells),min(y for x,y in cells)
        maxy=max(y for x,y in cells)
        cells=[(x-minx,maxy-y) for x,y in cells]
        self.observed_shapes.add(tuple(sorted(cells)))
        self.shape_cache[data]=cells
        return cells

    def target(self,cells,ram,current_x):
        if not cells:return None
        if PARAMETERS['strategy']=='stack':return {'target':PARAMETERS['stack_target'],'rotations':0}
        board=[]
        for y in range(PARAMETERS['floor_row']):
            offset=PARAMETERS['board_start']+(PARAMETERS['floor_row']-1-y)*PARAMETERS['board_stride']
            board.append(list(ram[offset:offset+PARAMETERS['columns']]))
        heights=[max((y+1 for y,row in enumerate(board) if row[x]),default=0) for x in range(PARAMETERS['columns'])]
        best=None
        foot=(PARAMETERS['baseline_y']-struct.unpack_from('<i',ram,PARAMETERS['player_y'])[0]/65536)/16
        current_column=max(0,min(6,int((current_x+16)//16)))
        for rotation in range(4):
            width=max(x for x,y in cells)+1
            for x in range(PARAMETERS['columns']-width+1):
                target=(x+width//2)*16-8
                target_column=max(0,min(6,int((target+16)//16)))
                route=heights[min(current_column,target_column):max(current_column,target_column)+1]
                if max(route,default=0)>foot+PARAMETERS['reachable_rise']:continue
                y=max(heights[x+cx]-cy for cx,cy in cells)
                if y>foot+PARAMETERS['reachable_rise']:continue
                new=heights.copy();holes=0
                for cx,cy in cells:
                    holes+=max(0,y+cy-heights[x+cx]);new[x+cx]=max(new[x+cx],y+cy+1)
                lines=sum(all(board[yy][xx] or (xx-x,yy-y) in cells for xx in range(PARAMETERS['columns'])) for yy in range(max(0,y),min(len(board),y+max(cy for cx,cy in cells)+1)))
                score=holes*PARAMETERS['score_hole']+max(new)*PARAMETERS['score_height']+sum(abs(new[i]-new[i-1]) for i in range(1,len(new)))*PARAMETERS['score_roughness']-lines*PARAMETERS['score_line']+abs(target-current_x)/16*PARAMETERS['score_travel']
                if best is None or score<best[0]:best=(score,{'target':target,'rotations':rotation})
            cells=[(y,-x) for x,y in cells];minx=min(x for x,y in cells);miny=min(y for x,y in cells)
            cells=[(x-minx,y-miny) for x,y in cells]
        return best[1] if best else None
