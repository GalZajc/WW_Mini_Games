// ROM sound IDs, kept together independently of playback/physics.
export const NATIVE_SOUND_EVENTS=Object.freeze({
 jump:1,jumpBoost:13,place:3,completeSingle:2,completeDouble:37,completeTriple:36,
 boots:4,toolUse:5,filler:34,explode:7,floorRemoved:12,
 enterWater:29,waterSplash:11,thunder:44,injury:45,towerWarning:33,
 dragonArrive:30,rockArrive:40,hammerHit:14,weather:14,ready:16,resultWin:38,resultLoss:39,
});
export const NATIVE_INTRO_SOUND_EVENTS=Object.freeze({39:17,79:18,119:19});
export const NATIVE_SOUND_WARNING=Object.freeze({minimumIncompleteFloors:5,maximumIncompleteFloors:7});
export const NATIVE_RESULT_SOUND=Object.freeze({winTick:52,lossTick:112});
// 18E70's global passes: both actors, projectiles, clouds, primary/secondary
// enemies, creatures, destruction, board work, pickups. These are scheduling
// phases, not sound-admission priorities.
export const NATIVE_SOUND_PHASE=Object.freeze({actor:0,projectile:1,cloud:2,enemy:3,secondary:4,creature:5,destruction:6,board:7,pickup:8});
export const NATIVE_SOUND_EVENT_PHASE=Object.freeze({
 44:2,3:7,2:7,36:7,37:7,33:7,12:6,4:8,30:3,40:3,11:5,
});
export const NATIVE_ENEMY_SPAWN_SOUND=Object.freeze({
 bubble:{id:40,local:true},jumper:{id:8,local:true,variant:1},space:{id:32},spaceSecondary:{id:40,local:true},
 dragon:{id:30,local:true},dragonSecondary:{id:40,local:true},beanstalkSecondary:{id:40,local:true},
 jungleSecondary:{id:20},parkPrimary:{id:21},parkSecondary:{id:25},castleSecondary:{id:24},factorySecondary:{id:26},
});
export const NATIVE_ENEMY_STEAL_SOUND=Object.freeze({factorySecondary:26,castleSecondary:24,jungleSecondary:20,parkSecondary:25});
export const NATIVE_AUDIO_PROGRESS=Object.freeze({roofBias:10,heightBias:12,tempoThirdDivisor:3,leadCue:41});
// 08018e70 starts the arena song at countdown tick 59, not at board creation.
export const NATIVE_MUSIC_TIMING=Object.freeze({arenaCountdownTick:59});
export const NATIVE_MUSIC_IDS=Object.freeze({dragon:5,castle:11,pirate:6,space:8,jungle:2,park:7,beanstalk:3,factory:13,
 'result-intro':4,'result-win':10,'result-loss':12});
