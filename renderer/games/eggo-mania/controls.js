// RetroArch's stock Xbox XInput profile maps GBA A to the physical Xbox B
// button and GBA B to Xbox A. GBA L/R stay on LB/RB, respectively.
export const GAMEPAD=Object.freeze({
    moveAxis:0,moveAxisY:1,moveDeadzone:0.22,
    buttons:Object.freeze({a:1,b:0,x:3,y:2,leftShoulder:4,rightShoulder:5,
        leftTrigger:6,rightTrigger:7,select:8,start:9,up:12,down:13,left:14,right:15}),
});

export const CONTROLS=Object.freeze([
    ['left','Move left (stick / D-pad)',['ArrowLeft','KeyA'],[GAMEPAD.buttons.left]],
    ['right','Move right (stick / D-pad)',['ArrowRight','KeyD'],[GAMEPAD.buttons.right]],
    ['jump','Jump / hold to float (stick / D-pad)',['ArrowUp','KeyW'],[GAMEPAD.buttons.up]],
    ['place','Place block / use item',['Space'],[GAMEPAD.buttons.a]],
    ['rotate','Rotate clockwise',['KeyX'],[GAMEPAD.buttons.b]],
    ['rotateBack','Rotate anticlockwise',['KeyZ'],[GAMEPAD.buttons.x]],
    ['dive','Drop through floor',['KeyQ'],[GAMEPAD.buttons.leftShoulder]],
    ['fast','Fast descent (stick / D-pad)',['ArrowDown','KeyS'],[GAMEPAD.buttons.down]],
    ['discard','Discard item',['KeyR'],[GAMEPAD.buttons.rightShoulder]],
    ['restart','Restart round',['F5'],[]],
    ['continue','Next round',['Enter'],[]],
    ['pause','Pause / resume',[],[GAMEPAD.buttons.start]],
]);
// Held buttons, rather than action edges: even holding A through an idle
// animation can change the original CPU/IRQ phase without a new sound event.
export function nativeHeldButtons(input,{confirm=false}={}){
 const down=action=>Boolean(input?.isActionDown?.(action));
 const horizontal=Number(down('right'))-Number(down('left')),vertical=Number(down('fast'))-Number(down('jump'));
 const x=horizontal?0:(input?.getFirstGamepadAxis?.(GAMEPAD.moveAxis)??0),y=vertical?0:(input?.getFirstGamepadAxis?.(GAMEPAD.moveAxisY)??0);
 return (down('place')||(confirm&&down('continue'))?1<<8:0)|(down('rotate')?1:0)|(down('dive')?1<<10:0)|(down('discard')?1<<11:0)|
  (down('right')||x>=GAMEPAD.moveDeadzone?1<<7:0)|(down('left')||x<=-GAMEPAD.moveDeadzone?1<<6:0)|
  (down('jump')||y<=-GAMEPAD.moveDeadzone?1<<4:0)|(down('fast')||y>=GAMEPAD.moveDeadzone?1<<5:0);
}

// One-time migration of the earlier gamepad defaults. rotateBack also had a
// saved LB+Xbox-A pair, so recognize that exact old chord without rewriting
// user-created combinations.
const PREVIOUS_GAMEPAD_DEFAULTS=Object.freeze({
    jump:[[0]],place:[[2]],rotate:[[5]],rotateBack:[[0],[4],[4,0]],dive:[[6]],fast:[[7]],discard:[[3]],
});

export function migrateGamepadDefaults(bindings){
    if(!bindings)return false;
    let changed=false;
    // These were shipped as defaults before Start was wired to the framework
    // pause menu. View must never restart a live round accidentally.
    for(const [action,code] of [['restart',GAMEPAD.buttons.select],['continue',GAMEPAD.buttons.start]]){
        const current=bindings[action];
        if(!Array.isArray(current))continue;
        const retained=current.filter(b=>b.type!=='gamepad'||b.code!==code);
        if(retained.length!==current.length){current.splice(0,current.length,...retained);changed=true;}
    }
    for(const [action,,,buttons] of CONTROLS){
        if(!buttons?.length)continue;
        const current=Array.isArray(bindings[action])?bindings[action]:(bindings[action]=[]);
        const gamepadBindings=current.filter(binding=>binding.type==='gamepad');
        if(gamepadBindings.length===0){
            current.push(...buttons.map(code=>({type:'gamepad',code})));
            changed=true;
            continue;
        }
        const oldMappings=PREVIOUS_GAMEPAD_DEFAULTS[action];
        const codes=gamepadBindings.map(item=>item.code).sort((a,b)=>a-b);
        const isPreviousDefault=oldMappings?.some(mapping=>
            mapping.length===codes.length&&[...mapping].sort((a,b)=>a-b).every((code,index)=>code===codes[index]));
        if(isPreviousDefault&&(!buttons.length||codes.length!==buttons.length||
            !buttons.every((code,index)=>code===codes[index]))){
            const retained=current.filter(binding=>binding.type!=='gamepad');
            current.splice(0,current.length,...retained,...buttons.map(code=>({type:'gamepad',code})));
            changed=true;
        }
    }
    return changed;
}

// The first actor tick after starting a Survival round only consumes the
// initial keypad sample. Subsequent movement uses that tick's sample directly;
// the native trace stops immediately on release and moves immediately on a
// later press. Inventory/action buttons always apply on their pressed frame.
export function nativePlayerControls(sampled,actorTickPrimed){
    const controls={...sampled};
    if(!actorTickPrimed){
        controls.move=0;controls.jump=false;controls.float=false;controls.fast=false;
    }
    return controls;
}
