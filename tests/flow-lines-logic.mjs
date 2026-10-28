import assert from 'node:assert/strict';
import { proveUniqueRouting } from '../renderer/games/flow-lines/constraint-solver.js';
import { PathCoverChain } from '../renderer/games/flow-lines/path-cover.js';
import { generateUniquePuzzle, seededRandom } from '../renderer/games/flow-lines/puzzle.js';

// Independent reference: enumerate every simple path of every labeled pair,
// then all vertex-disjoint tuples. No component, shortest-path or shortcut
// deductions from the production solver are used here.
function referenceCount(rows, columns, paths, fullCover) {
    const total = rows * columns;
    const terminals = new Int16Array(total).fill(-1);
    paths.forEach((path, color) => { terminals[path[0]] = color; terminals[path.at(-1)] = color; });
    const neighbors = Array.from({ length: total }, (_, cell) => {
        const row = Math.floor(cell / columns);
        const column = cell % columns;
        return [row > 0 ? cell - columns : -1, row + 1 < rows ? cell + columns : -1,
            column > 0 ? cell - 1 : -1, column + 1 < columns ? cell + 1 : -1].filter(next => next >= 0);
    });
    const routes = paths.map(path => {
        const result = [];
        const goal = path.at(-1);
        function walk(cell, mask) {
            if (cell === goal) { result.push(mask); return; }
            for (const next of neighbors[cell]) {
                const bit = 1 << next;
                if (mask & bit || (next !== goal && terminals[next] >= 0)) continue;
                walk(next, mask | bit);
            }
        }
        walk(path[0], 1 << path[0]);
        return result;
    }).sort((a, b) => a.length - b.length);
    let count = 0;
    function combine(index, mask) {
        if (count >= 2) return;
        if (index === routes.length) {
            if (!fullCover || mask === (1 << total) - 1) count++;
            return;
        }
        for (const route of routes[index]) if (!(route & mask)) combine(index + 1, mask | route);
    }
    combine(0, 0);
    return count;
}

// A sole full-cover solution can still have a shortcut leaving cells empty.
// The user's stronger uniqueness rule must reject it.
const shortcut = [[0, 1, 3, 2]];
assert.equal(proveUniqueRouting(2, 2, shortcut).status, 'multiple');
assert.equal(proveUniqueRouting(2, 2, shortcut, { requireFullCover: true }).status, 'unique');
assert.equal(proveUniqueRouting(2, 2, [[0, 2], [1, 3]], { nodeLimit: 0 }).status, 'unknown');

let comparisons = 0;
for (const [rows, columns, colors] of [[2, 2, 2], [2, 3, 2], [3, 3, 2], [3, 3, 3],
    [3, 4, 2], [3, 4, 3], [3, 4, 4], [4, 4, 3], [4, 4, 4], [4, 4, 5]]) {
    for (let seed = 1; seed <= 12; seed++) {
        const chain = new PathCoverChain(rows, columns, colors, seededRandom(seed));
        chain.mix(rows * columns * 20);
        for (const fullCover of [false, true]) {
            const expected = referenceCount(rows, columns, chain.paths, fullCover);
            const actual = proveUniqueRouting(rows, columns, chain.paths, { requireFullCover: fullCover, nodeLimit: 200_000 });
            assert.notEqual(actual.status, 'unknown', `small audit hit limit: ${rows}x${columns}/${colors}/${seed}`);
            assert.equal(actual.solutionCount, expected,
                `counter disagrees: ${rows}x${columns}/${colors}/${seed}/full=${fullCover}`);
            comparisons++;
        }
    }
}

const first = generateUniquePuzzle(6, 6, 3, 5, 42);
const repeated = generateUniquePuzzle(6, 6, 3, 5, 42);
assert.deepEqual(first.paths, repeated.paths, 'seed must reproduce the puzzle');
assert.equal(first.uniquenessProof.includesIncompleteRoutings, true);
assert.ok(first.colorCount >= 3 && first.colorCount <= 5);
assert.ok(first.quality.turns >= first.colorCount);
assert.equal(referenceCount(4, 4, generateUniquePuzzle(4, 4, 3, 4, 42).paths, false), 1);
console.log(`Flow Lines: ${comparisons} independent counter comparisons, shortcut regression and reproducibility passed.`);
