import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONTROLS,GAMEPAD,migrateGamepadDefaults,nativePlayerControls} from '../renderer/games/eggo-mania/controls.js';
import {NATIVE_ITEMS} from '../renderer/games/eggo-mania/assets/native-items.js';
import {NATIVE_PIECE_MASKS} from '../renderer/games/eggo-mania/assets/native-piece-masks.js';
import {Tower,settings,randomFrom,RULES} from '../renderer/games/eggo-mania/model.js';
import {nativeHeldRotation} from '../renderer/games/eggo-mania/native-cpu.js';
import {NATIVE_PREVIEW_TURN_8_8} from '../renderer/games/eggo-mania/native-affine.js';

const gamepadCode=action=>CONTROLS.find(([name])=>name===action)[3][0];
const binding=code=>({type:'gamepad',code});
const signature=cells=>cells.map(cell=>cell.join(',')).sort().join(';');

test('Xbox defaults follow the original GBA and RetroArch button positions',()=>{
    assert.equal(gamepadCode('place'),GAMEPAD.buttons.a);       // GBA A: Xbox B
    assert.equal(gamepadCode('rotate'),GAMEPAD.buttons.b);      // GBA B: Xbox A
    assert.equal(gamepadCode('dive'),GAMEPAD.buttons.leftShoulder); // GBA L: LB
    assert.equal(gamepadCode('discard'),GAMEPAD.buttons.rightShoulder); // GBA R: RB
    assert.notEqual(gamepadCode('rotate'),gamepadCode('rotateBack'));
});

test('saved earlier gamepad defaults migrate to the corrected GBA actions',()=>{
    for(const previousReverse of [0,4]){
        const controls={
            jump:[binding(0)],place:[binding(2)],rotate:[binding(5)],rotateBack:[binding(previousReverse)],
            dive:[binding(6)],fast:[binding(7)],discard:[binding(3)],
            left:[binding(GAMEPAD.buttons.left)],right:[binding(GAMEPAD.buttons.right)],
            continue:[binding(GAMEPAD.buttons.start)],restart:[binding(GAMEPAD.buttons.select)],
        };
        assert.equal(migrateGamepadDefaults(controls),true);
        for(const action of ['jump','place','rotate','rotateBack','dive','fast','discard'])
            assert.equal(controls[action].find(item=>item.type==='gamepad').code,gamepadCode(action),action);
    }
});

test('the former two-button reverse-rotation default migrates without changing custom chords',()=>{
    const formerDefaults={
        rotateBack:[{type:'keyboard',code:'KeyZ'},binding(4),binding(0)],
        jump:[binding(12),binding(13)],
    };
    assert.equal(migrateGamepadDefaults(formerDefaults),true);
    assert.deepEqual(formerDefaults.rotateBack,[{type:'keyboard',code:'KeyZ'},binding(GAMEPAD.buttons.x)]);
    assert.deepEqual(formerDefaults.jump,[binding(12),binding(13)]);
});

test('only the first actor tick consumes movement input; later movement and actions are immediate',()=>{
    const sampled={move:-1,jump:false,float:false,fast:true,dive:true,use:true,rotate:1,discard:true};
    assert.deepEqual(nativePlayerControls(sampled,false),{
        move:0,jump:false,float:false,fast:false,dive:true,use:true,rotate:1,discard:true,
    });
    assert.deepEqual(nativePlayerControls(sampled,true),sampled);
});

test('one original GBA B press advances the held piece to native orientation one',()=>{
    const cells=NATIVE_ITEMS[6].cells.map(cell=>[...cell]);
    const tower=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));
    tower.spawn=Infinity;
    tower.held={nativeKind:6,nativeVariant:0,cells};
    tower.update(RULES.step,{rotate:1});
    assert.equal(nativeHeldRotation(tower.held),1);
    assert.equal(signature(tower.held.cells),signature(NATIVE_ITEMS[13+6].cells));
});

test('the native piece outline follows the twelve captured GBA affine frames and settles exactly',()=>{
    const tower=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));
    tower.spawn=Infinity;tower.held={nativeKind:6,nativeVariant:0,cells:NATIVE_ITEMS[6].cells.map(cell=>[...cell])};
    assert.equal(tower.preview().rotationAngle,0);
    tower.update(RULES.step,{rotate:1});
    assert.equal(tower.preview().rotationAngle,0,'the original OAM keeps its prior transform on the input frame');
    for(let frame=0;frame<NATIVE_PREVIEW_TURN_8_8.length;frame++){
        tower.update(RULES.step,{});
        assert.deepEqual(tower.nativePreviewRotation.affineMatrix,NATIVE_PREVIEW_TURN_8_8[frame],
            `native OAM matrix on turn frame ${frame+1}`);
    }
    assert.equal(tower.preview().rotationAngle,Math.PI/2,'the settled outline aligns exactly with native orientation one');
    tower.held={nativeKind:1,nativeVariant:0,cells:NATIVE_ITEMS[1].cells.map(cell=>[...cell])};
    tower.update(RULES.step,{});
    assert.equal(tower.preview().rotationAngle,0,'a newly caught piece starts from its own native orientation');
});

test('clockwise player rotation matches every native shape in all four orientations',()=>{
    for(let kind=0;kind<8;kind++)for(let rotation=0;rotation<4;rotation++){
        const toModelCells=mask=>{
            const minX=Math.min(...mask.map(([x])=>x)),maxY=Math.max(...mask.map(([,y])=>y));
            return mask.map(([x,y])=>[x-minX,maxY-y]);
        };
        const tower=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(kind*4+rotation+1));
        tower.spawn=Infinity;
        tower.held={nativeKind:kind,nativeVariant:rotation,
            cells:toModelCells(NATIVE_PIECE_MASKS[rotation*8+kind])};
        tower.update(RULES.step,{rotate:1,nativeMotion:true});
        assert.equal(nativeHeldRotation(tower.held),(rotation+1)&3,`kind ${kind}, rotation ${rotation}`);
        assert.equal(signature(tower.held.cells),signature(toModelCells(NATIVE_PIECE_MASKS[((rotation+1)&3)*8+kind])),
            `kind ${kind}, rotation ${rotation}`);
    }
});

test('native Survival movement follows the captured walk, stop, and re-press without snapping',()=>{
    const tower=new Tower(settings({hazards:false,waterSpeed:0}),randomFrom(1));
    tower.spawn=Infinity;
    tower.egg.x=(49.9410400390625+16)/16;
    tower.egg.y=(720-720.0440673828125)/16;
    tower.egg.ground=true;
    tower.held={nativeKind:6,nativeVariant:0,cells:NATIVE_ITEMS[6].cells.map(cell=>[...cell])};
    const trace=JSON.parse(readFileSync(new URL('./fixtures/eggo-player-input-gba.json',import.meta.url),'utf8'));
    let actorTickPrimed=false;
    for(const sample of trace.frames){
        const sampled={move:sample.keys==='RIGHT'?1:sample.keys==='LEFT'?-1:0,jump:false,float:false,fast:false};
        tower.update(RULES.step,{nativeMotion:true,...nativePlayerControls(sampled,actorTickPrimed)});
        actorTickPrimed=true;
        assert.ok(Math.abs((tower.egg.x-1)*16-sample.worldX)<1e-9,`frame ${sample.frame} X ${sample.worldX}`);
        assert.ok(Math.abs(720-tower.egg.y*16-sample.worldY)<1e-9,`frame ${sample.frame} Y ${sample.worldY}`);
        assert.ok(Math.abs(720-tower.egg.y*16-720.0440673828125)<1e-9,'standing height remains subpixel-stable');
    }
    assert.equal(trace.frames[0].keys,'RIGHT');
    assert.equal(trace.frames[12].keys,'','the ROM stops as soon as the direction is released');
    assert.equal(trace.frames[44].keys,'LEFT','a later direction press is applied on its first frame');
});
