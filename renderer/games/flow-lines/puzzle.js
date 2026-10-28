import { proveUniqueRouting } from './constraint-solver.js';
import { PathCoverChain } from './path-cover.js';
import { MAX_BOARD_DIMENSION, MAX_BOARD_CELLS, MAX_COLOR_COUNT, GENERATOR_VERSION,
    GENERATION_SETTINGS, PATH_COVER_SETTINGS } from './parameters.js';
export { MAX_BOARD_DIMENSION, MAX_BOARD_CELLS, MAX_COLOR_COUNT, GENERATOR_VERSION, GENERATION_SETTINGS };

export function minimumPathCells(rows, columns) {
    return rows * columns < PATH_COVER_SETTINGS.smallBoardThreshold
        ? PATH_COVER_SETTINGS.intermediateMinimumCells : PATH_COVER_SETTINGS.minimumPathCells;
}

export function makePuzzleSeed() {
    if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
    return Date.now() >>> 0;
}

export function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}

function shuffle(values, random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
        const other = Math.floor(random() * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
}

export function theoreticalColorCounts(rows, columns) {
    const a = Number(rows);
    const b = Number(columns);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1
        || a > MAX_BOARD_DIMENSION || b > MAX_BOARD_DIMENSION || a * b > MAX_BOARD_CELLS || a * b < 2) return [];
    // A full rectangular 2D grid has more edges than a spanning simple path.
    // With only one pair, some unused grid edge is therefore a shortcut. Such
    // a puzzle cannot have a unique routing which also covers the rectangle.
    const minimum = a > 1 && b > 1 ? 2 : 1;
    const maximum = Math.floor(a * b / minimumPathCells(a, b));
    return Array.from({ length: Math.max(0, maximum - minimum + 1) }, (_, index) => minimum + index);
}

export function verifyUniqueTemplate(rows, columns, template) {
    return Boolean(template?.paths && proveUniqueRouting(rows, columns, template.paths).status === 'unique');
}

function qualityScore(quality) {
    return quality.turns + quality.interiorEndpoints * 1.5 - quality.straightPaths * 5
        + Math.min(quality.minimumLength, 8) * 0.2;
}

function interestingEnough(rows, columns, paths, quality) {
    if (rows === 1 || columns === 1 || rows * columns < 9) return true;
    const colors = paths.length;
    const targetTurns = Math.ceil(Math.min(rows * columns * GENERATION_SETTINGS.targetTurnFraction, colors * 3));
    const interiorCapacity = Math.max(0, rows - 2) * Math.max(0, columns - 2);
    const targetInterior = Math.min(interiorCapacity, Math.ceil(colors * GENERATION_SETTINGS.interiorEndpointFraction));
    return quality.chords === 0 && quality.minimumLength >= minimumPathCells(rows, columns) && quality.turns >= targetTurns
        && quality.straightPaths <= Math.floor(colors * GENERATION_SETTINGS.straightPathFraction)
        && quality.interiorEndpoints >= targetInterior;
}

function buildPuzzleData(rows, columns, paths, seed, proof, quality, generation) {
    const total = rows * columns;
    const shuffledPaths = shuffle(paths, seededRandom(seed ^ 0x5e2d58d1)).map(path => [...path]);
    const endpointByCell = new Map();
    const targetEdges = shuffledPaths.map((path, color) => {
        endpointByCell.set(path[0], color);
        endpointByCell.set(path.at(-1), color);
        return new Set(path.slice(1).map((cell, index) => makeEdgeKey(path[index], cell, total)));
    });
    return {
        rows, columns, seed: seed >>> 0, colorCount: shuffledPaths.length,
        paths: shuffledPaths, endpointByCell, targetEdges, quality, generation,
        uniquenessProof: {
            method: 'izčrpno iskanje druge povezave z robnimi omejitvami in dokazano redukcijo bližnjic',
            acceptanceRule: 'natanko ena povezava vseh parov, tudi če dovolimo prazna polja; ta edina pokrije vso mrežo',
            solutionCount: proof.solutionCount,
            fullCoverSolutionCount: 1,
            includesIncompleteRoutings: true,
            exploredStates: proof.nodes,
            inducedReduction: proof.inducedReduction,
        },
    };
}

/**
 * Start with a known full cover, then move endpoints by exchanging path tails.
 * Every accepted proposal receives its own completed exhaustive proof. Failed
 * and over-limit proposals are rolled back; they never destroy the last
 * certified puzzle. Randomness changes the puzzle, not the acceptance rule.
 */
export function generateUniquePuzzle(rows, columns, minimumColors, maximumColors, seed = makePuzzleSeed(), options = {}) {
    rows = Number(rows);
    columns = Number(columns);
    minimumColors = Number(minimumColors);
    maximumColors = Number(maximumColors);
    const total = rows * columns;
    if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1
        || rows > MAX_BOARD_DIMENSION || columns > MAX_BOARD_DIMENSION || total < 2 || total > MAX_BOARD_CELLS) {
        throw new Error(`The grid must have 2–${MAX_BOARD_CELLS} cells and at most ${MAX_BOARD_DIMENSION} rows or columns.`);
    }
    if (!Number.isInteger(minimumColors) || !Number.isInteger(maximumColors) || minimumColors < 1
        || minimumColors > maximumColors || maximumColors > MAX_COLOR_COUNT) {
        throw new Error('The color range must contain positive integers in ascending order.');
    }
    // Use the same random construction for a rectangle and its transpose.
    // This removes an arbitrary orientation bias from mutation neighbor order.
    if (rows > columns) {
        const canonical = generateUniquePuzzle(columns, rows, minimumColors, maximumColors, seed, options);
        const transposed = canonical.paths.map(path => path.map(cell => (cell % rows) * columns + Math.floor(cell / rows)));
        return buildPuzzleData(rows, columns, transposed, seed, {
            solutionCount: 1, nodes: canonical.uniquenessProof.exploredStates,
            inducedReduction: canonical.uniquenessProof.inducedReduction,
        }, canonical.quality, { ...canonical.generation, transposed: true });
    }
    const counts = theoreticalColorCounts(rows, columns).filter(count => count >= minimumColors && count <= maximumColors);
    if (!counts.length) {
        if (rows > 1 && columns > 1 && maximumColors === 1) {
            throw new Error('A single color on a two-dimensional rectangular grid cannot have just one connection covering every cell: a shortcut always exists.');
        }
        throw new Error(`The selected range is not possible for this grid with at least ${minimumPathCells(rows, columns)} cells per color.`);
    }
    const random = seededRandom(seed);
    const targetCount = counts[0];
    const initialCount = Math.max(targetCount, Math.min(rows, columns));
    const chain = new PathCoverChain(rows, columns, initialCount, random);
    const maximumProposals = options.maximumProposals ?? GENERATION_SETTINGS.maximumProposals;
    const nodeLimit = options.proofNodeLimit ?? GENERATION_SETTINGS.proofNodeLimit;
    const report = (fraction, stage, extra = {}) => options.onProgress?.({ fraction, stage, ...extra });
    report(0, 'Initial path coverage');
    if (chain.totalChords) chain.mix(total * GENERATION_SETTINGS.initialRepairPerCell);
    let proof = proveUniqueRouting(rows, columns, chain.paths, { nodeLimit: Math.max(GENERATION_SETTINGS.initialProofNodeLimit, nodeLimit) });
    let certified = proof.status === 'unique' ? chain.snapshot() : null;
    let best = null;
    let accepted = 0;
    let unknown = 0;
    let proofNodes = proof.nodes;
    const mutations = Math.max(GENERATION_SETTINGS.minimumMutationAttempts, Math.round(total * GENERATION_SETTINGS.mutationFraction));

    const remember = () => {
        if (!certified || chain.paths.length < minimumColors || chain.paths.length > maximumColors) return;
        const quality = chain.quality();
        if (quality.minimumLength < minimumPathCells(rows, columns)) return;
        if (!best || qualityScore(quality) > qualityScore(best.quality)) {
            best = { paths: chain.snapshot(), proof, quality };
        }
    };
    remember();
    for (let proposal = 0; proposal < maximumProposals; proposal++) {
        report(proposal / maximumProposals, 'Prepletanje in dokazovanje', {
            proposal, accepted, colors: chain.paths.length, proofNodes,
        });
        const before = certified || chain.snapshot();
        chain.mix(mutations);
        const budget = proposal < maximumProposals / 2 ? nodeLimit : Math.max(nodeLimit, GENERATION_SETTINGS.deeperProofNodeLimit);
        const nextProof = chain.totalChords ? { status: 'multiple', nodes: 0 }
            : proveUniqueRouting(rows, columns, chain.paths, { nodeLimit: budget });
        proofNodes += nextProof.nodes;
        if (nextProof.status === 'unique') {
            proof = nextProof;
            certified = chain.snapshot();
            accepted++;
        } else if (certified) {
            if (nextProof.status === 'unknown') unknown++;
            chain.restore(before);
        }
        if (certified && chain.paths.length > targetCount) {
            for (const merged of shuffle(chain.mergeCandidates(), random).slice(0, GENERATION_SETTINGS.maximumMergeCandidates)) {
                const mergedProof = proveUniqueRouting(rows, columns, merged, { nodeLimit: budget });
                proofNodes += mergedProof.nodes;
                if (mergedProof.status !== 'unique') continue;
                chain.restore(merged);
                proof = mergedProof;
                certified = chain.snapshot();
                break;
            }
        }
        remember();
        if (best && proposal + 1 >= GENERATION_SETTINGS.minimumProposals
            && interestingEnough(rows, columns, best.paths, best.quality)) {
            report(1, 'Unique solution confirmed', { colors: best.paths.length });
            return buildPuzzleData(rows, columns, best.paths, seed, best.proof, best.quality, {
                algorithm: GENERATOR_VERSION, proposals: proposal + 1, accepted, rejectedByProofLimit: unknown,
                proofNodes, parameters: { ...GENERATION_SETTINGS, maximumProposals, proofNodeLimit: nodeLimit },
            });
        }
    }
    // Retain useful certified work even when the preferred quality target was
    // not reached; never return the untouched straight stripe initialization.
    if (best && (rows === 1 || columns === 1 || total < 9
        || (best.quality.turns >= best.paths.length && best.quality.straightPaths < best.paths.length / 2))) {
        report(1, 'Unique solution confirmed', { colors: best.paths.length });
        return buildPuzzleData(rows, columns, best.paths, seed, best.proof, best.quality, {
            algorithm: GENERATOR_VERSION, proposals: maximumProposals, accepted,
            rejectedByProofLimit: unknown, proofNodes, parameters: { ...GENERATION_SETTINGS, maximumProposals, proofNodeLimit: nodeLimit },
        });
    }
    throw new Error('Could not generate a sufficiently interwoven puzzle with a proven unique solution for this color count. Try a slightly wider color range.');
}

export function edgeCells(edge, total) {
    const first = Math.floor(edge / total);
    return [first, edge - first * total];
}

export function makeEdgeKey(first, second, total) {
    return Math.min(first, second) * total + Math.max(first, second);
}
