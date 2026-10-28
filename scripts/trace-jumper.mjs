import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Game from '../renderer/games/eggo-mania/game.js';
import { settings, RULES } from '../renderer/games/eggo-mania/model.js';
import { NATIVE_WATER } from '../renderer/games/eggo-mania/native-water.js';

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

for (const [count, buttons] of steps) {
    for (let i = 0; i < count; i++) {
        const frame = 400 + (++tick);
        if (frame > 51420) break;
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

        for (const [idx, t] of [g.player, g.cpu].entries()) {
            if (!t) continue;
            const j = t.jumper;
            if (j.captured) {
                const actorY = RULES.nativeActorFloor - t.egg.y * RULES.projectilePixels;
                const waterline = RULES.nativeActorFloor + RULES.bubbleWaterlineBias - t.water * RULES.projectilePixels;
                const wet = actorY + NATIVE_WATER.entryProbePixels > waterline;
                // check if about to release next tick
                // ...
            }
        }

        const pCapBefore = g.player?.jumper?.captured;
        const cCapBefore = g.cpu?.jumper?.captured;

        g.update(RULES.step);

        const pCapAfter = g.player?.jumper?.captured;
        const cCapAfter = g.cpu?.jumper?.captured;

        if (pCapBefore && !pCapAfter) {
            const t = g.player;
            const actorY = RULES.nativeActorFloor - t.egg.y * RULES.projectilePixels;
            const waterline = RULES.nativeActorFloor + RULES.bubbleWaterlineBias - t.water * RULES.projectilePixels;
            console.log(`Frame ${frame} (round ${g.round}): player released. actorY=${actorY.toFixed(2)}, waterline=${waterline.toFixed(2)}, probe=${(actorY + NATIVE_WATER.entryProbePixels).toFixed(2)}, wet=${actorY + NATIVE_WATER.entryProbePixels > waterline}`);
        }
        if (cCapBefore && !cCapAfter) {
            const t = g.cpu;
            const actorY = RULES.nativeActorFloor - t.egg.y * RULES.projectilePixels;
            const waterline = RULES.nativeActorFloor + RULES.bubbleWaterlineBias - t.water * RULES.projectilePixels;
            console.log(`Frame ${frame} (round ${g.round}): cpu released. actorY=${actorY.toFixed(2)}, waterline=${waterline.toFixed(2)}, probe=${(actorY + NATIVE_WATER.entryProbePixels).toFixed(2)}, wet=${actorY + NATIVE_WATER.entryProbePixels > waterline}`);
        }
    }
    if (400 + tick >= 51420) break;
}
