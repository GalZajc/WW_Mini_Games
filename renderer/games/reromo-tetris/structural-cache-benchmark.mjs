import { mkdir, writeFile } from 'node:fs/promises';
import { analyzeStructuralStability as analyze } from './structural-stability.js';

const grid = Array.from({ length: 20 }, () => Array(10).fill(0));
let id = 1;
for (let row = 2; row < 20; row += 2) for (let column = 0; column < 10; column += 2) {
    grid[row][column] = grid[row + 1][column] = grid[row + 1][column + 1] = id++;
    grid[row][column + 1] = id++;
}
const parameters = { experiment: 'structural-reaction-cache', seed: null, grid,
    physics: { pieceFriction: .5, platformFriction: 1, wallFriction: .5, walls: true,
        frame: { angle: .03, omega: .04, alpha: -.015, originX: 5, originY: 20 } },
    angles: Array.from({ length: 15 }, (_, i) => .03 + .001 * Math.sin(i)), warmup: 3,
    node: process.version, platform: process.platform, arch: process.arch };
const directory = new URL(`./OUTPUT/${parameters.experiment}_${new Date().toISOString().replace(/[:.]/g, '-')}/`, import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('parameters.json', directory), JSON.stringify(parameters, null, 2), 'utf8');
const timings = [], summary = [];
for (const reuseReactions of [false, true]) {
    console.log(reuseReactions ? '[2/2] Reusing verified reactions' : '[1/2] Full solves');
    const samples = [];
    let hits = 0;
    for (const [i, angle] of parameters.angles.entries()) {
        const start = performance.now();
        const result = analyze(grid, { ...parameters.physics, reuseReactions,
            frame: { ...parameters.physics.frame, angle } });
        const ms = performance.now() - start;
        if (!result.stable) throw new Error('Benchmark unexpectedly unstable');
        if (i >= parameters.warmup) samples.push(ms);
        hits += result.reusedReactions ? 1 : 0;
        timings.push([reuseReactions, i, ms, Boolean(result.reusedReactions)]);
    }
    samples.sort((a, b) => a - b);
    summary.push({ reuseReactions, medianMs: samples[Math.floor(samples.length / 2)], hits });
}
await writeFile(new URL('timings.csv', directory), 'reuse,sample,milliseconds,cache_hit\n' + timings.map(row => row.join(',')).join('\n') + '\n', 'utf8');
await writeFile(new URL('summary.json', directory), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify({ directory: directory.href, summary }, null, 2));
