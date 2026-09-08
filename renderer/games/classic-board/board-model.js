const inside = (size, row, column) => row >= 0 && row < size && column >= 0 && column < size;
const cloneGrid = grid => grid.map(row => [...row]);

export function createReversi(size = 8) {
    size = Math.round(Number(size));
    const grid = Array.from({ length: size }, () => Array(size).fill(0));
    const middle = size / 2;
    grid[middle - 1][middle - 1] = grid[middle][middle] = 2;
    grid[middle - 1][middle] = grid[middle][middle - 1] = 1;
    return { mode: 'reversi', size, grid, player: 1, winner: null, passes: 0, lastEvent: 'Black starts.' };
}

const REVERSI_DIRECTIONS = [-1, 0, 1].flatMap(dr => [-1, 0, 1].map(dc => [dr, dc])).filter(([dr, dc]) => dr || dc);

export function reversiFlips(state, row, column, player = state.player) {
    if (!inside(state.size, row, column) || state.grid[row][column]) return [];
    const result = [];
    for (const [dr, dc] of REVERSI_DIRECTIONS) {
        const line = [];
        let r = row + dr, c = column + dc;
        while (inside(state.size, r, c) && state.grid[r][c] && state.grid[r][c] !== player) {
            line.push([r, c]); r += dr; c += dc;
        }
        if (line.length && inside(state.size, r, c) && state.grid[r][c] === player) result.push(...line);
    }
    return result;
}

export function reversiMoves(state, player = state.player) {
    const moves = [];
    for (let row = 0; row < state.size; row++) for (let column = 0; column < state.size; column++) {
        const flips = reversiFlips(state, row, column, player);
        if (flips.length) moves.push({ row, column, flips });
    }
    return moves;
}

export function playReversi(state, row, column) {
    const flips = reversiFlips(state, row, column);
    if (!flips.length || state.winner !== null) return false;
    state.grid[row][column] = state.player;
    flips.forEach(([r, c]) => { state.grid[r][c] = state.player; });
    state.player = 3 - state.player;
    state.passes = 0;
    if (!reversiMoves(state).length) {
        state.player = 3 - state.player; state.passes++;
        if (!reversiMoves(state).length) finishReversi(state);
        else state.lastEvent = 'Opponent has no legal move and passes.';
    } else state.lastEvent = `Discs flipped: ${flips.length}.`;
    return true;
}

function finishReversi(state) {
    const counts = [0, 0, 0];
    state.grid.flat().forEach(value => counts[value]++);
    state.winner = counts[1] === counts[2] ? 0 : (counts[1] > counts[2] ? 1 : 2);
    state.lastEvent = state.winner ? `Player ${state.winner} wins!` : 'Draw.';
}

export function chooseReversiMove(state) {
    const moves = reversiMoves(state);
    if (!moves.length) return null;
    const edge = state.size - 1;
    const score = move => move.flips.length
        + ((move.row === 0 || move.row === edge) && (move.column === 0 || move.column === edge) ? 100 : 0)
        + (move.row === 0 || move.row === edge || move.column === 0 || move.column === edge ? 8 : 0)
        - (([1, edge - 1].includes(move.row) && [1, edge - 1].includes(move.column)) ? 18 : 0);
    return moves.sort((a, b) => score(b) - score(a))[0];
}

export function createCheckers(size = 8, rowsPerSide = 3) {
    size = Math.round(Number(size));
    rowsPerSide = Math.round(Number(rowsPerSide));
    const grid = Array.from({ length: size }, () => Array(size).fill(0));
    for (let row = 0; row < rowsPerSide; row++) for (let column = 0; column < size; column++) {
        if ((row + column) % 2) grid[row][column] = 2;
    }
    for (let row = size - rowsPerSide; row < size; row++) for (let column = 0; column < size; column++) {
        if ((row + column) % 2) grid[row][column] = 1;
    }
    return { mode: 'checkers', size, grid, player: 1, winner: null, forced: null, lastEvent: 'White starts.' };
}

const owner = piece => Math.abs(piece);
const isKing = piece => piece < 0;

export function checkersMoves(state, player = state.player, onlyFrom = null) {
    const captures = [], quiet = [];
    const scan = (row, column) => {
        const piece = state.grid[row][column];
        if (owner(piece) !== player) return;
        const directions = isKing(piece) ? [-1, 1] : [player === 1 ? -1 : 1];
        for (const dr of directions) for (const dc of [-1, 1]) {
            const r = row + dr, c = column + dc;
            if (inside(state.size, r, c) && !state.grid[r][c]) quiet.push({ from: [row, column], to: [r, c], capture: null });
            const rr = row + dr * 2, cc = column + dc * 2;
            if (inside(state.size, rr, cc) && !state.grid[rr][cc] && state.grid[r]?.[c] && owner(state.grid[r][c]) !== player) {
                captures.push({ from: [row, column], to: [rr, cc], capture: [r, c] });
            }
        }
    };
    if (onlyFrom) scan(onlyFrom[0], onlyFrom[1]);
    else for (let row = 0; row < state.size; row++) for (let column = 0; column < state.size; column++) scan(row, column);
    return captures.length ? captures : quiet;
}

export function playCheckers(state, move) {
    const legal = checkersMoves(state, state.player, state.forced).find(candidate =>
        candidate.from[0] === move.from[0] && candidate.from[1] === move.from[1]
        && candidate.to[0] === move.to[0] && candidate.to[1] === move.to[1]);
    if (!legal || state.winner !== null) return false;
    const [fr, fc] = legal.from, [tr, tc] = legal.to;
    let piece = state.grid[fr][fc]; state.grid[fr][fc] = 0; state.grid[tr][tc] = piece;
    if (legal.capture) state.grid[legal.capture[0]][legal.capture[1]] = 0;
    const wasKing = isKing(piece);
    if ((owner(piece) === 1 && tr === 0) || (owner(piece) === 2 && tr === state.size - 1)) state.grid[tr][tc] = -owner(piece);
    const crowned = !wasKing && isKing(state.grid[tr][tc]);
    if (!crowned && legal.capture && checkersMoves(state, state.player, [tr, tc]).some(candidate => candidate.capture)) {
        state.forced = [tr, tc]; state.lastEvent = 'Continue multi-jump.'; return true;
    }
    state.forced = null; state.player = 3 - state.player;
    const next = checkersMoves(state);
    if (!next.length) { state.winner = 3 - state.player; state.lastEvent = `Player ${state.winner} wins!`; }
    else state.lastEvent = crowned ? 'King crowned!' : (legal.capture ? 'Piece captured.' : 'Turn completed.');
    return true;
}

export function chooseCheckersMove(state) {
    const moves = checkersMoves(state);
    if (!moves.length) return null;
    const score = move => (move.capture ? 100 : 0)
        + (move.to[0] === 0 || move.to[0] === state.size - 1 ? 25 : 0)
        - Math.abs(move.to[1] - (state.size - 1) / 2) * .2;
    return moves.sort((a, b) => score(b) - score(a))[0];
}

// Original 2009 Callisto inventory: two dominoes, two copies of each of
// the two trominoes, two copies of each of the four supplied tetrominoes,
// and the X, W, T and U pentominoes. Duplicates deliberately remain
// separate inventory entries. Pillars never count as penalty points.
export const KALISTO_SHAPES = [
    [[0, 0], [0, 1]],
    [[0, 0], [0, 1]],
    [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1]],
    [[0, 0], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
    [[0, 0], [0, 1], [0, 2], [1, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 1]],
    [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
    [[0, 2], [1, 1], [1, 2], [2, 0], [2, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],
    [[0, 0], [0, 1], [1, 1], [2, 0], [2, 1]],
];

function normalizeCells(cells) {
    const minRow = Math.min(...cells.map(cell => cell[0]));
    const minCol = Math.min(...cells.map(cell => cell[1]));
    return cells.map(([r, c]) => [r - minRow, c - minCol]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function transformKalistoShape(shape, rotation = 0, flipped = false) {
    let cells = shape.map(([r, c]) => [r, flipped ? -c : c]);
    for (let turn = 0; turn < ((rotation % 4) + 4) % 4; turn++) cells = cells.map(([r, c]) => [c, -r]);
    return normalizeCells(cells);
}

export function createKalisto(size = 16, shapeCount = KALISTO_SHAPES.length, playerCount = 2) {
    size = Math.round(Number(size));
    shapeCount = Math.round(Number(shapeCount));
    playerCount = Math.round(Number(playerCount));
    return {
        mode: 'kalisto', size, grid: Array.from({ length: size }, () => Array(size).fill(0)),
        playerCount, player: 1, winner: null, phase: 'pillars', setupPillarsPlaced: 0,
        lastEvent: 'Player 1: place the first pillar.', pillars: [],
        pillarsRemaining: [0, ...Array(playerCount).fill(3)],
        remaining: [null, ...Array.from({ length: playerCount }, () => Array.from({ length: shapeCount }, (_, index) => index))],
        eliminated: [false, ...Array(playerCount).fill(false)], scores: null,
    };
}

export function isKalistoPlayableCell(state, row, column) {
    if (!inside(state.size, row, column)) return false;
    const inset = state.playerCount === 2 ? Math.max(2, Math.round(state.size * 0.13)) : (state.playerCount === 3 ? 1 : 0);
    if (row < inset || column < inset || row >= state.size - inset || column >= state.size - inset) return false;
    const localRow = row - inset, localColumn = column - inset;
    const span = state.size - inset * 2;
    const cut = Math.max(1, Math.floor(span * 0.2));
    if (localRow + localColumn < cut) return false;
    if (localRow + (span - 1 - localColumn) < cut) return false;
    if ((span - 1 - localRow) + localColumn < cut) return false;
    return (span - 1 - localRow) + (span - 1 - localColumn) >= cut;
}

export function isKalistoPillarForbiddenCell(state, row, column) {
    // The printed board marks a five-cell cross as the central section.
    // Flat tiles may cover it, but none of the three pillars may be placed
    // there. For an even custom board the cross uses the upper-left of the
    // four mathematical centre cells as its stable grid anchor.
    const center = Math.floor((state.size - 1) / 2);
    const rowDistance = Math.abs(row - center);
    const columnDistance = Math.abs(column - center);
    return rowDistance + columnDistance <= 1;
}

export function canPlaceKalistoPillar(state, row, column) {
    return state.winner === null && isKalistoPlayableCell(state, row, column)
        && !isKalistoPillarForbiddenCell(state, row, column) && !state.grid[row][column];
}

export function canPlaceKalisto(state, player, cells) {
    if (state.phase !== 'pieces' || cells.some(([r, c]) => !isKalistoPlayableCell(state, r, c) || state.grid[r][c])) return false;
    for (const [r, c] of cells) {
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (state.grid[r + dr]?.[c + dc] === player) return true;
        }
    }
    return false;
}

export function kalistoPlacements(state, player = state.player, stopAfter = Infinity) {
    const result = [];
    for (const shapeIndex of state.remaining[player]) {
        const seen = new Set();
        for (let flip = 0; flip < 2; flip++) for (let rotation = 0; rotation < 4; rotation++) {
            const shape = transformKalistoShape(KALISTO_SHAPES[shapeIndex], rotation, Boolean(flip));
            const key = JSON.stringify(shape); if (seen.has(key)) continue; seen.add(key);
            const height = Math.max(...shape.map(cell => cell[0])) + 1;
            const width = Math.max(...shape.map(cell => cell[1])) + 1;
            for (let row = 0; row <= state.size - height; row++) for (let column = 0; column <= state.size - width; column++) {
                const cells = shape.map(([r, c]) => [r + row, c + column]);
                if (canPlaceKalisto(state, player, cells)) {
                    result.push({ shapeIndex, rotation, flipped: Boolean(flip), row, column, cells });
                    if (result.length >= stopAfter) return result;
                }
            }
        }
    }
    return result;
}

export function playKalisto(state, placement) {
    const shapeIndex = Number(placement.shapeIndex);
    if (!state.remaining[state.player].includes(shapeIndex) || state.winner !== null) return false;
    const shape = transformKalistoShape(KALISTO_SHAPES[shapeIndex], Number(placement.rotation) || 0, Boolean(placement.flipped));
    const cells = shape.map(([r, c]) => [r + Number(placement.row), c + Number(placement.column)]);
    if (!canPlaceKalisto(state, state.player, cells)) return false;
    cells.forEach(([r, c]) => { state.grid[r][c] = state.player; });
    state.remaining[state.player] = state.remaining[state.player].filter(index => index !== shapeIndex);
    state.lastEvent = `Player ${state.player} placed a ${cells.length}-cell tile.`;
    advanceKalistoTurn(state);
    return true;
}

export function playKalistoPillar(state, row, column) {
    if (!canPlaceKalistoPillar(state, row, column) || state.pillarsRemaining[state.player] <= 0) return false;
    const player = state.player;
    state.grid[row][column] = player;
    state.pillars.push({ row, column, player });
    state.pillarsRemaining[player]--;
    if (state.phase === 'pillars') {
        state.setupPillarsPlaced++;
        if (state.setupPillarsPlaced >= state.playerCount * 2) {
            state.phase = 'pieces'; state.player = 1;
            state.lastEvent = 'Pillars placed. Player 1: place a tile.';
        } else {
            state.player = state.player % state.playerCount + 1;
            const round = Math.floor(state.setupPillarsPlaced / state.playerCount) + 1;
            state.lastEvent = `Player ${state.player}: place ${round === 1 ? 'first' : 'second'} pillar.`;
        }
        return true;
    }
    state.lastEvent = `Player ${player} placed a third pillar.`;
    advanceKalistoTurn(state);
    return true;
}

function finishKalisto(state) {
    state.scores = [0, ...Array.from({ length: state.playerCount }, (_, offset) =>
        state.remaining[offset + 1].reduce((sum, shapeIndex) => sum + KALISTO_SHAPES[shapeIndex].length, 0))];
    const best = Math.min(...state.scores.slice(1));
    const winners = state.scores.slice(1).map((score, index) => ({ score, player: index + 1 })).filter(item => item.score === best);
    // The original rule resolves a tie in favour of the tied player who
    // started later. Player 1 starts this single-round implementation.
    state.winner = Math.max(...winners.map(item => item.player));
    state.lastEvent = winners.length === 1
        ? `Player ${state.winner} wins with ${best} penalty points!`
        : `Tie at ${best} penalty points; later starting player ${state.winner} wins!`;
}

function kalistoHasMove(state, player) {
    if (state.pillarsRemaining[player] > 0) {
        for (let row = 0; row < state.size; row++) for (let column = 0; column < state.size; column++) {
            if (canPlaceKalistoPillar(state, row, column)) return true;
        }
    }
    return kalistoPlacements(state, player, 1).length > 0;
}

function advanceKalistoTurn(state) {
    const previous = state.player;
    for (let step = 1; step <= state.playerCount; step++) {
        const candidate = (previous - 1 + step) % state.playerCount + 1;
        if (kalistoHasMove(state, candidate)) {
            state.player = candidate;
            return;
        }
        state.eliminated[candidate] = true;
    }
    finishKalisto(state);
}

export function chooseKalistoPillar(state, player = state.player) {
    if (state.pillarsRemaining[player] <= 0) return null;
    const own = state.pillars.filter(pillar => pillar.player === player);
    const candidates = [];
    for (let row = 0; row < state.size; row++) for (let column = 0; column < state.size; column++) {
        if (!canPlaceKalistoPillar(state, row, column)) continue;
        let open = 0;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (isKalistoPlayableCell(state, row + dr, column + dc) && !state.grid[row + dr][column + dc]) open++;
        }
        const separation = own.length ? Math.min(...own.map(pillar => Math.abs(row - pillar.row) + Math.abs(column - pillar.column))) : 0;
        const center = (state.size - 1) / 2;
        const centrality = state.size - Math.abs(row - center) - Math.abs(column - center);
        candidates.push({ row, column, score: open * 20 + separation * 3 + centrality });
    }
    candidates.sort((a, b) => b.score - a.score || a.row - b.row || a.column - b.column);
    return candidates[0] ? { row: candidates[0].row, column: candidates[0].column } : null;
}

export function chooseKalistoMove(state) {
    const placements = kalistoPlacements(state, state.player, 2500);
    if (!placements.length) return null;
    const center = (state.size - 1) / 2;
    const score = move => move.cells.length * 100
        + move.cells.reduce((sum, [r, c]) => sum + [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .filter(([dr, dc]) => state.grid[r + dr]?.[c + dc] && state.grid[r + dr][c + dc] !== state.player).length * 8, 0)
        - move.cells.reduce((sum, [r, c]) => sum + Math.abs(r - center) + Math.abs(c - center), 0) / move.cells.length;
    return placements.sort((a, b) => score(b) - score(a))[0];
}

export function cloneBoardState(state) {
    return { ...state, grid: cloneGrid(state.grid) };
}
