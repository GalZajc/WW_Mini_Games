import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { analyzeStructuralStability, normalizeStructuralPhysics } from './structural-stability.js';

// Keep the fixture and all benchmark parameters together so a recorded run is
// easy to reproduce without command-line arguments or ambient state.
const BENCHMARK_CONFIG = Object.freeze({
    experiment: 'rocking-benchmark',
    rows: 10,
    columns: 20,
    bottomFilledRows: 6,
    rigidPieceHeight: 2,
    rigidPieceWidth: 2,
    frame: Object.freeze({ angle: 0.05, omega: 0.1, alpha: 0.1, originX: 5, originY: 20 }),
    physics: Object.freeze({
        cellSizeMeters: 0.3,
        blockMassKg: 1,
        gravity: 9.81,
        pieceFriction: 1,
        wallFriction: 1,
        platformFriction: 1,
        walls: true,
    }),
    warmupRepeats: 10,
    measuredRepeats: 10,
    performanceBudgetMs: 16,
    randomSeed: null,
});

function makeFixture(config) {
    const { rows, columns, bottomFilledRows, rigidPieceHeight, rigidPieceWidth } = config;
    if (bottomFilledRows % rigidPieceHeight !== 0 || columns % rigidPieceWidth !== 0) {
        throw new Error('The benchmark dimensions must tile into complete rigid pieces.');
    }
    const grid = Array.from({ length: rows }, () => new Int32Array(columns));
    let bodyId = 1;
    const firstRow = rows - bottomFilledRows;
    for (let row = firstRow; row < rows; row += rigidPieceHeight) {
        for (let column = 0; column < columns; column += rigidPieceWidth) {
            for (let dr = 0; dr < rigidPieceHeight; dr++) {
                for (let dc = 0; dc < rigidPieceWidth; dc++) grid[row + dr][column + dc] = bodyId;
            }
            bodyId++;
        }
    }
    return { grid, rigidPieceCount: bodyId - 1 };
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function csvCell(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[,"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const { grid, rigidPieceCount } = makeFixture(BENCHMARK_CONFIG);
const physics = normalizeStructuralPhysics({ ...BENCHMARK_CONFIG.physics, frame: BENCHMARK_CONFIG.frame });
const forcedPhysics = { ...physics, forceCoupled: true };

function measurePath(path, rawPhysics) {
    for (let repeat = 0; repeat < BENCHMARK_CONFIG.warmupRepeats; repeat++) {
        analyzeStructuralStability(grid, rawPhysics);
    }
    const measurements = [];
    for (let repeat = 0; repeat < BENCHMARK_CONFIG.measuredRepeats; repeat++) {
        const started = performance.now();
        const result = analyzeStructuralStability(grid, rawPhysics);
        const durationMs = performance.now() - started;
        measurements.push({
            path,
            repeat: repeat + 1,
            durationMs,
            stable: result.stable,
            solver: result.solver,
            virtualWork: Number.isFinite(result.virtualWork) ? result.virtualWork : null,
            bodyCount: result.bodies.length,
            contactReactionCount: result.contactReactions?.length || 0,
        });
    }
    const durations = measurements.map(measurement => measurement.durationMs);
    return {
        measurements,
        summary: {
            medianMs: median(durations),
            meanMs: durations.reduce((sum, value) => sum + value, 0) / durations.length,
            minimumMs: Math.min(...durations),
            maximumMs: Math.max(...durations),
            stableAll: measurements.every(measurement => measurement.stable),
            solvers: [...new Set(measurements.map(measurement => measurement.solver))],
            bodyCount: measurements[0]?.bodyCount || 0,
            contactReactionCount: measurements[0]?.contactReactionCount || 0,
        },
    };
}

const fast = measurePath('certificate', physics);
const forcedCoupled = measurePath('forced-coupled', forcedPhysics);
const measurements = [...fast.measurements, ...forcedCoupled.measurements];
const timestampUtc = new Date().toISOString();
const summary = {
    experiment: BENCHMARK_CONFIG.experiment,
    timestampUtc,
    // Keep the top-level timing fields focused on the production certificate
    // path; the full LP reference is included under forcedCoupled below.
    medianMs: fast.summary.medianMs,
    meanMs: fast.summary.meanMs,
    minimumMs: fast.summary.minimumMs,
    maximumMs: fast.summary.maximumMs,
    stableAll: fast.summary.stableAll && forcedCoupled.summary.stableAll,
    solvers: fast.summary.solvers,
    bodyCount: fast.summary.bodyCount,
    contactReactionCount: fast.summary.contactReactionCount,
    performanceBudgetMs: BENCHMARK_CONFIG.performanceBudgetMs,
    withinPerformanceBudget: fast.summary.medianMs <= BENCHMARK_CONFIG.performanceBudgetMs,
    certificate: fast.summary,
    forcedCoupled: forcedCoupled.summary,
    comparison: {
        medianSpeedup: forcedCoupled.summary.medianMs / fast.summary.medianMs,
        forcedCoupledMedianMs: forcedCoupled.summary.medianMs,
    },
};

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const timestamp = summary.timestampUtc.replaceAll(':', '-').replace('.', '-');
const outputDirectory = join(scriptDirectory, 'OUTPUT', `${BENCHMARK_CONFIG.experiment}_${timestamp}`);
mkdirSync(outputDirectory, { recursive: true });

const parameters = {
    ...BENCHMARK_CONFIG,
    frame: { ...BENCHMARK_CONFIG.frame },
    physics,
    forcedPhysics,
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    fixture: {
        description: 'Deterministic 2×2 rigid pieces filling the bottom six rows of a 20×10 board.',
        rigidPieceCount,
        occupiedCellCount: rigidPieceCount * BENCHMARK_CONFIG.rigidPieceHeight * BENCHMARK_CONFIG.rigidPieceWidth,
    },
    timestampUtc,
};
writeFileSync(join(outputDirectory, 'parameters.json'), `${JSON.stringify(parameters, null, 2)}\n`, 'utf8');
writeFileSync(join(outputDirectory, 'timings.csv'), [
    'path,repeat,durationMs,stable,solver,virtualWork,bodyCount,contactReactionCount',
    ...measurements.map(measurement => [
        measurement.path,
        measurement.repeat,
        measurement.durationMs,
        measurement.stable,
        measurement.solver,
        measurement.virtualWork,
        measurement.bodyCount,
        measurement.contactReactionCount,
    ].map(csvCell).join(',')),
].join('\n') + '\n', 'utf8');
writeFileSync(join(outputDirectory, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ outputDirectory, ...summary }, null, 2));
