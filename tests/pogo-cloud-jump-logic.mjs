import assert from 'node:assert/strict';

import PogoCloudJumpGame, {
    POGO_CLOUD_JUMP_DEFAULTS,
    computeSpringContact,
    readPogoCloudJumpSettings,
    validatePogoCloudJumpSettings,
} from '../renderer/games/pogo-cloud-jump/game.js';

// 1. Settings validation & reading
const defaults = readPogoCloudJumpSettings(POGO_CLOUD_JUMP_DEFAULTS);
assert.equal(defaults.monsterMass, POGO_CLOUD_JUMP_DEFAULTS.monsterMass);
assert.equal(defaults.springStiffness, POGO_CLOUD_JUMP_DEFAULTS.springStiffness);
assert.equal(defaults.lockMouseYToTop, true);
const withLocked = readPogoCloudJumpSettings({ lockMouseYToTop: false });
assert.equal(withLocked.lockMouseYToTop, false);

assert.throws(
    () => validatePogoCloudJumpSettings({ ...defaults, monsterMass: 0 }),
    /greater than zero/,
);
assert.throws(
    () => validatePogoCloudJumpSettings({ ...defaults, springStiffness: -10 }),
    /greater than zero/,
);

// 2. Spring contact calculation & Hooke's law direction
const stateAirborne = {
    x: 0,
    y: 3.0,
    vx: 0,
    vy: -2,
    angle: 0,
    legLength: defaults.legBentLength,
};
const airborneContact = computeSpringContact(stateAirborne, defaults, 0, -2, 2);
assert.equal(airborneContact.inContact, false);
assert.equal(airborneContact.compression, 0);

// Foot touching surface
const stateTouching = {
    x: 0,
    y: defaults.legBentLength + defaults.springRestLength - 0.1, // 0.1m compression
    vx: 0,
    vy: -1.5,
    angle: 0,
    legLength: defaults.legBentLength,
};
const touchingContact = computeSpringContact(stateTouching, defaults, 0, -2, 2);
assert.equal(touchingContact.inContact, true);
assert.ok(Math.abs(touchingContact.compression - 0.1) < 1e-4);
assert.ok(touchingContact.forceMagnitude > 0);

// Hooke's law direction test:
// Tilting right (angle > 0) must produce positive horizontal force (pushing RIGHT)
const stateTiltedRight = {
    ...stateTouching,
    angle: 0.25, // tilted right
};
const rightContact = computeSpringContact(stateTiltedRight, defaults, 0, -2, 2);
assert.equal(rightContact.inContact, true);
assert.ok(rightContact.unitX > 0, 'Tilting right must produce positive unitX (pushing body right).');
assert.ok(rightContact.unitY > 0, 'Must produce upward unitY force.');

// Tilting left (angle < 0) must produce negative horizontal force (pushing LEFT)
const stateTiltedLeft = {
    ...stateTouching,
    angle: -0.25, // tilted left
};
const leftContact = computeSpringContact(stateTiltedLeft, defaults, 0, -2, 2);
assert.equal(leftContact.inContact, true);
assert.ok(leftContact.unitX < 0, 'Tilting left must produce negative unitX (pushing body left).');
assert.ok(leftContact.unitY > 0, 'Must produce upward unitY force.');

// Outside platform bounds horizontally
const stateMiss = {
    ...stateTouching,
    x: 5.0, // far right
};
const missContact = computeSpringContact(stateMiss, defaults, 0, -2, 2);
assert.equal(missContact.inContact, false);

// 3. Game simulation step test
class MockAudio {
    playClick() {}
    playPlasticImpact() {}
}

const mockCanvas = {
    parentElement: null,
    width: 720,
    height: 960,
    style: { cursor: 'default' },
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 720, height: 960 }; },
};

const game = new PogoCloudJumpGame();
game._setup(mockCanvas, null, {}, new MockAudio(), { lockMouseYToTop: true }, () => {}, () => {}, null, { records: { getBest: async () => null, addRecord: async () => {} } });

assert.equal(game.phase, 'ready');
assert.equal(game.monster.inContact, false);
assert.equal(mockCanvas.style.cursor, 'default', 'Cursor must be default in ready phase.');

game._startRun();
assert.equal(game.phase, 'running');
assert.equal(mockCanvas.style.cursor, 'none', 'Cursor must be hidden in running phase when lockMouseYToTop is active.');

game.onPause();
assert.equal(mockCanvas.style.cursor, 'default', 'Cursor must be default in pause/escape menu.');

game.onResume();
assert.equal(mockCanvas.style.cursor, 'none', 'Cursor must be hidden again when resuming.');

// Step simulation: monster starts airborne, falls, touches plank, bounces, lifts off
let touchedGround = false;
let verifiedAirborneRetraction = false;
let maxRecordedHeight = 0;

for (let i = 0; i < 480; i++) {
    game._step(1 / 240);
    if (game.monster.inContact) {
        touchedGround = true;
        game.isExtendRequested = true;
    } else if (touchedGround && !game.monster.inContact) {
        // Airborne after contact: verify legs are strictly retracted in V-position!
        assert.equal(game.monster.legLength, defaults.legBentLength, 'Legs must be retracted when airborne.');
        verifiedAirborneRetraction = true;
    }
    maxRecordedHeight = Math.max(maxRecordedHeight, game.monster.y);
}

assert.ok(touchedGround, 'Monster should make contact with the starting plank.');
assert.ok(verifiedAirborneRetraction, 'Legs must retract immediately upon liftoff.');
assert.ok(maxRecordedHeight >= 1.6, 'Spring bounce and leg extension should launch monster upwards.');
assert.ok(game.maxHeight > 0);

// 4. Plank clearance unit test:
// Ensure that jumping from below doesn't catch if foot has not cleared above plank top
const clearanceGame = new PogoCloudJumpGame();
clearanceGame._setup(mockCanvas, null, {}, new MockAudio(), {}, () => {}, () => {}, null, { records: { getBest: async () => null, addRecord: async () => {} } });
clearanceGame._startRun();

// Add a high plank at y = 5.0
const testPlank = { id: 999, x: 0, y: 5.0, width: 3.0, height: 0.35, cleared: false };
clearanceGame.planks.push(testPlank);

// Monster reaches y = 5.4, but bent leg + spring = 1.05m, so foot is at 4.35m (has NOT cleared plank top y=5.0)
clearanceGame.monster.x = 0;
clearanceGame.monster.y = 5.4;
clearanceGame.monster.vx = 0;
clearanceGame.monster.vy = -0.5; // falling downwards
clearanceGame.monster.inContact = false;

clearanceGame._step(1 / 60);
assert.equal(testPlank.cleared, false, 'Plank should not be cleared because spring foot is below plank top.');
assert.equal(clearanceGame.monster.inContact, false, 'Plank must not catch monster if spring foot has not cleared top.');

// Now monster jumps high enough that uncompressed foot clears above plank top (e.g. y = 6.2 -> foot = 5.15 > 5.0)
clearanceGame.monster.y = 6.2;
clearanceGame.monster.vy = 1.0;
clearanceGame._step(1 / 60);
assert.equal(testPlank.cleared, true, 'Plank must be marked cleared once spring foot rises above plank top.');

// Now falling back down: foot penetrates plank top
clearanceGame.monster.y = 5.8; // foot at 4.75 <= 5.0
clearanceGame.monster.vy = -1.0;
clearanceGame._step(1 / 60);
assert.equal(clearanceGame.monster.inContact, true, 'Plank should catch monster now that foot cleared top and fell onto it.');

console.log('Pogo Cloud Jump logic tests passed.');

