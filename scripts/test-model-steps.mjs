import { readFileSync } from 'fs';
import { advanceCastleSecondaryMotion, RULES } from '../renderer/games/eggo-mania/model.js';

const steps = JSON.parse(readFileSync('scripts/OUTPUT/enemy_steps.json', 'utf8'));

// Nastavimo d tako kot je bil na frame 58201 pred klicem modela
const first = steps[0];
const d = {
    type: RULES.factorySecondaryType,
    side: 1,
    active: false,
    life: 156, // life na frame 58201
    x: 0,
    y: 760,
    vx: 0,
    vy: -1,
    animation: 0,
    wingPhase: 0,
    wingClock: 8,
    difficulty: 9,
    startRight: RULES.castleSecondaryStartRight
};

console.log('Starting simulation from frame 58201...');
for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    // Kličemo advanceCastleSecondaryMotion
    // V model.js:
    // advanceCastleSecondaryMotion(d, actorX, actorY, waterline, motionSeed, busy)
    // actorX = act_x - bubbleActorAnchor
    // actorY = act_y
    advanceCastleSecondaryMotion(d, s.actorX - RULES.bubbleActorAnchor, s.actorY, s.water + RULES.bubbleWaterlineBias, s.secRng, false);
    
    if (s.frame in [58356, 58357, 58358, 58420, 58426, 58427] || s.active !== d.active || s.life !== d.life) {
        if (s.frame <= 58362 || s.frame >= 58425) {
            console.log(`Frame ${s.frame}:`);
            console.log(`  GBA: active=${s.active}, life=${s.life}, vx=${s.vx.toFixed(4)}, vy=${s.vy.toFixed(4)}, phase=${s.wingPhase}, clock=${s.wingClock.toFixed(4)}, anim=${s.anim}`);
            console.log(`  APP: active=${d.active}, life=${d.life}, vx=${d.vx.toFixed(4)}, vy=${d.vy.toFixed(4)}, phase=${d.wingPhase}, clock=${d.wingClock?.toFixed(4)}, anim=${d.animation}`);
            if (s.wingPhase !== d.wingPhase) {
                console.log(`  --> MISMATCH IN WING PHASE! GBA=${s.wingPhase} vs APP=${d.wingPhase}`);
            }
        }
    }
}
