import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateUniquePuzzle, GENERATION_SETTINGS, GENERATOR_VERSION } from './puzzle.js';
import { CONSTRAINT_SOLVER_LIMITS } from './constraint-solver.js';
import { PATH_COVER_SETTINGS } from './path-cover.js';

const cases = [
    ...[1, 42, 123456789, 987654321, 20261027].map(seed => ({ rows: 15, columns: 17, minimumColors: 15, maximumColors: 23, seed })),
    ...[1, 123456789, 20261027].map(seed => ({ rows: 17, columns: 15, minimumColors: 15, maximumColors: 23, seed })),
    { rows: 6, columns: 6, minimumColors: 3, maximumColors: 5, seed: 42 },
    { rows: 10, columns: 10, minimumColors: 6, maximumColors: 10, seed: 42 },
    { rows: 3, columns: 20, minimumColors: 4, maximumColors: 8, seed: 42 },
    { rows: 3, columns: 3, minimumColors: 2, maximumColors: 3, seed: 42 },
];
const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana', dateStyle: 'short', timeStyle: 'medium' })
    .format(new Date()).replace(/[^0-9]/g, '-');
const output = path.join(path.dirname(fileURLToPath(import.meta.url)), 'OUTPUT', `generator-${stamp}`);
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'parameters.json'), JSON.stringify({
    createdAt: new Date().toISOString(), cases, generation: GENERATION_SETTINGS, solver: CONSTRAINT_SOLVER_LIMITS,
    pathCover: PATH_COVER_SETTINGS, algorithm: GENERATOR_VERSION, node: process.version,
}, null, 2), 'utf8');
const results = [];
for (let index = 0; index < cases.length; index++) {
    const config = cases[index];
    const start = performance.now();
    try {
        const puzzle = generateUniquePuzzle(config.rows, config.columns, config.minimumColors, config.maximumColors, config.seed);
        const result = { ...config, status: 'unique', milliseconds: Math.round(performance.now() - start),
            colors: puzzle.colorCount, ...puzzle.quality, proofNodes: puzzle.uniquenessProof.exploredStates,
            proposals: puzzle.generation.proposals };
        results.push(result);
        await writeFile(path.join(output, `puzzle-${index + 1}.json`), JSON.stringify({
            ...puzzle, endpointByCell: [...puzzle.endpointByCell], targetEdges: puzzle.targetEdges.map(edges => [...edges]),
        }, null, 2), 'utf8');
        console.log(`${index + 1}/${cases.length} ${config.rows}x${config.columns} seed ${config.seed}: ${puzzle.colorCount} colors, ${puzzle.quality.turns} turns, ${result.milliseconds} ms`);
    } catch (error) {
        results.push({ ...config, status: 'failed', milliseconds: Math.round(performance.now() - start), error: error.message });
        console.log(`${index + 1}/${cases.length} FAILED: ${error.message}`);
    }
    await writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
}
const columns = ['rows', 'columns', 'minimumColors', 'maximumColors', 'seed', 'status', 'milliseconds', 'colors',
    'turns', 'straightPaths', 'interiorEndpoints', 'minimumLength', 'maximumLength', 'proofNodes', 'proposals'];
await writeFile(path.join(output, 'results.csv'), [columns.join(','), ...results.map(result =>
    columns.map(column => result[column] ?? '').join(','))].join('\n'), 'utf8');
console.log(`Saved reproducible benchmark to ${output}`);
if (results.some(result => result.status !== 'unique')) process.exitCode = 1;
