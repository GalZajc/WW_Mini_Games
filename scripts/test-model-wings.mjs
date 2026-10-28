import { RULES, advanceCastleSecondaryMotion } from '../renderer/games/eggo-mania/model.js';

// Simulate factorySecondary with default starting state
const d = {
    side: 1, active: false, life: 1, x: 0, y: 760,
    vx: 0, vy: 0, animation: 0, animationClock: 0, stolen: null,
    type: RULES.factorySecondaryType,
    wingClock: RULES.factorySecondaryWingClock,
    wingPhase: 0,
    poseForward: true
};

console.log("Initial:", { wingClock: d.wingClock, wingPhase: d.wingPhase });

// At frame 58357, life hits 0, it activates (spawns)
// In ROM: vy = 0 at spawn
advanceCastleSecondaryMotion(d, 0, 500, 700, 0, false);
console.log("After spawn tick 58357:", { active: d.active, wingClock: d.wingClock, wingPhase: d.wingPhase, prevPhase: d.previousWingPhase });
