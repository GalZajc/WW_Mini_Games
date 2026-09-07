import assert from 'node:assert/strict';
import { countSudokuSolutions, generateUniqueSudoku } from '../renderer/games/sudoku/game.js';

for (const [m, n, ratio] of [[2, 2, 0.38], [2, 3, 0.42], [3, 3, 0.42], [4, 4, 0.55]]) {
    for (let sample = 0; sample < 3; sample++) {
        const generated = generateUniqueSudoku(m, n, ratio, 20260820 + m * 100 + n * 10 + sample);
        assert.equal(generated.size, m * n);
        assert.equal(countSudokuSolutions(generated.puzzle, m, n, 2), 1);
        assert.ok(generated.puzzle.every((row, r) => row.every((value, c) =>
            value === 0 || value === generated.solution[r][c]
        )));
    }
}

console.log('Sudoku uniqueness tests passed.');
