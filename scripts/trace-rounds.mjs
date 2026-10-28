import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Game from '../renderer/games/eggo-mania/game.js';
import { settings, RULES } from '../renderer/games/eggo-mania/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const steps = JSON.parse(await fs.readFile(path.join(root, 'scripts/OUTPUT/eggo-user-replay_2026-10-19_21-01-20_213557/steps.json')));

const g = new Game();
g.p = settings({ seed: 1492 });
g.seed = 1492;
let control = {}, previous = new Set();
g.readPlayerControl = () => control;
g.input = { isActionJustDown: action => (action === 'place' || action === 'continue') && Boolean(control.use) };
g.resetSurvival();

let tick = 0;
let lastPhase = g.phase, lastRound = g.round;

for (const [count, buttons] of steps) {
    for (let i = 0; i < count; i++) {
        const frame = 400 + (++tick);
        if (frame > 112000) break;
        const held = new Set(buttons ? buttons.split('+') : []);
        control = {
            move: Number(held.has('RIGHT')) - Number(held.has('LEFT')),
            jump: held.has('UP'),
            float: held.has('UP'),
            fast: held.has('DOWN'),
            dive: held.has('L'),
            discard: held.has('R') && !previous.has('R'),
            use: held.has('A') && !previous.has('A'),
            rotate: held.has('B') && !previous.has('B') ? 1 : 0
        };
        previous = held;
        g.update(RULES.step);

        if (g.round !== lastRound || g.phase !== lastPhase) {
            console.log(`Frame ${frame}: round ${lastRound}->${g.round}, phase ${lastPhase}->${g.phase}`);
            lastRound = g.round;
            lastPhase = g.phase;
        }
    }
    if (400 + tick >= 112000) break;
}
