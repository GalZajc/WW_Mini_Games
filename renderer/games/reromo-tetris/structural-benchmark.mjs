import { mkdir, writeFile } from 'node:fs/promises';
import { analyzeStructuralStability, STRUCTURAL_PHYSICS_DEFAULTS } from './structural-stability.js';

const parameters = {
    experiment: 'structural-stability', seed: null, // Deterministic grids; no random sampling.
    physics: STRUCTURAL_PHYSICS_DEFAULTS,
    warmup: 3, repeats: 20, maximumBoardRepeats: 3,
    sizes: [[20, 10], [64, 64], [256, 256]],
    bridge: [[1,1,1,1,1,1,1],[2,2,2,3,4,4,4],[0,0,2,3,4,0,0],[0,0,2,3,4,0,0],[0,0,2,3,4,0,0]],
    node: process.version, platform: process.platform, arch: process.arch,
};
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = new URL(`./OUTPUT/${parameters.experiment}_${timestamp}/`, import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('parameters.json', directory), JSON.stringify(parameters, null, 2), 'utf8');
const cases = parameters.sizes.map(([rows, columns]) => ({
    name: `columns-${rows}x${columns}`,
    grid: Array.from({ length: rows }, (_, r) => Int32Array.from({ length: columns }, (_, c) => r * columns + c + 1)),
    repeats: rows === 256 ? parameters.maximumBoardRepeats : parameters.repeats,
}));
cases.push({ name: 'coupled-bridge', grid: parameters.bridge, repeats: parameters.repeats });
const measurements = [], summary = [];
for (const [index, entry] of cases.entries()) {
    console.log(`[${index + 1}/${cases.length}] ${entry.name}`);
    for (let i = 0; i < parameters.warmup; i++) analyzeStructuralStability(entry.grid, parameters.physics);
    const samples = [];
    for (let i = 0; i < entry.repeats; i++) {
        const start = performance.now();
        const result = analyzeStructuralStability(entry.grid, parameters.physics);
        const ms = performance.now() - start;
        if (!result.stable) throw new Error(`Unexpected unstable benchmark ${entry.name}`);
        samples.push(ms);
        measurements.push([entry.name, i, ms, process.memoryUsage().rss, result.solver]);
    }
    samples.sort((a, b) => a - b);
    summary.push({ name: entry.name, medianMs: samples[Math.floor(samples.length / 2)], maxMs: samples.at(-1) });
}
await writeFile(new URL('timings.csv', directory), 'case,sample,milliseconds,rss_bytes,solver\n' + measurements.map(row => row.join(',')).join('\n') + '\n', 'utf8');
await writeFile(new URL('summary.json', directory), JSON.stringify(summary, null, 2), 'utf8');
console.log(JSON.stringify({ directory: directory.pathname, summary }, null, 2));
