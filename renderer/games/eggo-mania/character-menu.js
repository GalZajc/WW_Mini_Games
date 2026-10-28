import {CHARACTER_MENU_ART} from './assets/character-menu.js';
import {GAMEPAD} from './controls.js';

export const CHARACTER_SELECT=Object.freeze({
    order:CHARACTER_MENU_ART.parameters.order,
    repeatDelay:0.35,repeatInterval:0.12,
    arrows:{left:[103,32,25,32],right:[220,32,20,32]},
    confirm:[65,128,48,32],back:[8,128,48,32],
    // ROM menu song: 08000d72..d74 / 08001b10..b12.
    // Menu navigation effect: 08000c42..c44 / 08000c82..c84.
    audio:{song:1,navigate:10,tickSeconds:1/60},
});

export function openCharacterMenu(game){
    game.phase='character-select';game.music?.stop();
    // Menus use the native sequencer; gameplay creates its own fresh session.
    if(game.nativeSound?.startSession){
        game.nativeSound.startSession({seed:game.seed??0,character:0,original:false});
        game.nativeSound.reset();game.nativeSound.song(CHARACTER_SELECT.audio.song);
    }
    game.characterMenu={index:Math.max(0,CHARACTER_SELECT.order.indexOf(game.p.character)),
        direction:0,repeat:0,armed:false,elapsed:0,audioAccumulator:0};
}

export function advanceCharacterMenuAudio(game,dt){
    if(!game.nativeSound?.startSession)return;
    const menu=game.characterMenu,step=CHARACTER_SELECT.audio.tickSeconds;
    menu.audioAccumulator+=dt;
    while(menu.audioAccumulator+1e-9>=step){
        game.nativeSound.begin();game.nativeSound.end();menu.audioAccumulator-=step;
    }
}

export function updateCharacterMenu(game,dt){
    const menu=game.characterMenu,input=game.input;
    menu.elapsed+=dt;
    const digital=Number(input.isActionDown('right'))-Number(input.isActionDown('left'));
    const axis=digital?0:input.getFirstGamepadAxis(GAMEPAD.moveAxis);
    const direction=digital||(Math.abs(axis)>=GAMEPAD.moveDeadzone?Math.sign(axis):0);
    const confirming=input.isActionDown('continue')||input.isActionDown('place')||input.isActionDown('pause');
    // Ignore the launcher click/button which opened the game.
    if(!menu.armed){if(!confirming&&!input.isMouseDown?.(0))menu.armed=true;return;}
    let move=0,confirm=false,back=false;
    if(direction!==menu.direction){move=direction;menu.repeat=CHARACTER_SELECT.repeatDelay;}
    else if(direction){menu.repeat-=dt;if(menu.repeat<=0){move=direction;menu.repeat+=CHARACTER_SELECT.repeatInterval;}}
    menu.direction=direction;
    if(input.isMouseJustDown?.(0)&&game.characterMenuViewport){
        const pos=input.getMousePos(),v=game.characterMenuViewport;
        const ratio=game.canvasPixelRatio?.()||1,x=(pos.x*ratio-v.x)/v.scale,y=(pos.y*ratio-v.y)/v.scale;
        const inside=([a,b,w,h])=>x>=a&&x<a+w&&y>=b&&y<b+h;
        if(inside(CHARACTER_SELECT.arrows.left))move=-1;
        else if(inside(CHARACTER_SELECT.arrows.right))move=1;
        else if(inside(CHARACTER_SELECT.confirm))confirm=true;
        else if(inside(CHARACTER_SELECT.back))back=true;
    }
    if(move){menu.index=(menu.index+move+CHARACTER_SELECT.order.length)%CHARACTER_SELECT.order.length;menu.elapsed=0;game.nativeSound?.effect(CHARACTER_SELECT.audio.navigate);}
    if(back||input.isActionJustDown('rotate')){game.app?.exitGame();return;}
    if(confirm||input.isActionJustDown('continue')||input.isActionJustDown('place')||input.isActionJustDown('pause')){
        game.p.character=CHARACTER_SELECT.order[menu.index];
        game.settings.character=game.p.character;
        const id=game.app?.currentConfig?._id;
        if(id)game.app.settingsManager?.save?.(id,{...game.settings})?.catch?.(()=>{});
        // A finished online match pauses audio; confirming a new game resumes it.
        game.music?.resume?.();
        game.resetSurvival();
    }
}
