// Test model.js simulation of factory secondary from spawn to frame 58427
import { RULES } from '../renderer/games/eggo-mania/model.js';

// Simulirajmo d kot v model.js
const d = {
    type: RULES.factorySecondaryType,
    side: 1,
    active: false,
    life: 624,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    animation: 0,
    wingPhase: 0,
    wingClock: 8
};

console.log('RULES.factorySecondaryType:', RULES.factorySecondaryType);
console.log('RULES.factorySecondaryWingDrain:', RULES.factorySecondaryWingDrain);
console.log('RULES.factorySecondaryWingSpeedScale:', RULES.factorySecondaryWingSpeedScale);
console.log('RULES.factorySecondaryWingClock:', RULES.factorySecondaryWingClock);
console.log('RULES.factorySecondaryWingFrames:', RULES.factorySecondaryWingFrames);

// Poglejmo: če d začne z life = 624:
// Ko life doseže 0 (po 624 tickih), se aktivira.
// Nato teče 70 tickov.
// Kaj se zgodi z d.wingPhase?
