export const LETTER_DATA = Object.freeze({
    E: [11, 1], A: [10, 1], I: [9, 1], O: [8, 1], N: [7, 1], R: [6, 1], S: [6, 1],
    J: [4, 1], L: [4, 1], T: [4, 1], D: [4, 2], V: [4, 2], K: [3, 3], M: [2, 3],
    P: [2, 3], U: [2, 3], B: [2, 4], G: [2, 4], Z: [2, 4], Č: [1, 5], H: [1, 5],
    Š: [1, 6], C: [1, 8], F: [1, 10], Ž: [1, 10], '?': [2, 0],
});

function makeRandom(seed) {
    let state = seed >>> 0 || 0x6d2b79f5;
    return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}

export function createTileBag(seed = 1) {
    const bag = [];
    for (const [letter, [count, points]] of Object.entries(LETTER_DATA)) for (let index = 0; index < count; index++) {
        bag.push({ id: `${letter}-${index}-${seed}`, letter, points });
    }
    const random = makeRandom(seed);
    for (let index = bag.length - 1; index > 0; index--) { const swap = Math.floor(random() * (index + 1)); [bag[index], bag[swap]] = [bag[swap], bag[index]]; }
    return bag;
}

export function normalizeWord(word) {
    return String(word || '').normalize('NFC').toLocaleLowerCase('sl-SI');
}

export function createWordState(raw = {}, seed = 1) {
    const requestedSize = Number(raw.boardSize);
    const requestedRackSize = Number(raw.rackSize);
    const size = Number.isFinite(requestedSize) ? Math.max(1, Math.round(requestedSize) | 1) : 15;
    const rackSize = Number.isFinite(requestedRackSize) ? Math.max(1, Math.round(requestedRackSize)) : 7;
    const bag = createTileBag(seed);
    const state = {
        seed, size, rackSize, board: Array.from({ length: size }, () => Array(size).fill(null)), bag,
        racks: [null, [], []], scores: [0, 0, 0], player: 1, winner: null, passes: 0, turn: 1,
        lastEvent: 'Player 1 starts.', bingoBonus: Number.isFinite(Number(raw.bingoBonus))
            ? Math.max(0, Math.round(Number(raw.bingoBonus))) : 50,
    };
    refillRack(state, 1); refillRack(state, 2); return state;
}

export function refillRack(state, player) {
    while (state.racks[player].length < state.rackSize && state.bag.length) state.racks[player].push(state.bag.pop());
}

export function boardBonus(size, row, column) {
    const center = Math.floor(size / 2), edge = size - 1;
    if (row === center && column === center) return 'DW';
    if ((row === 0 || row === edge) && (column === 0 || column === edge)) return 'TW';
    const dr = Math.abs(row - center), dc = Math.abs(column - center);
    if (dr === dc && dr > 0 && dr % 4 === 0) return 'DW';
    if (dr === dc && dr % 3 === 0) return 'TL';
    if ((row + column) % 7 === 0) return 'DL';
    return null;
}

const inside = (state, row, column) => row >= 0 && row < state.size && column >= 0 && column < state.size;
const keyOf = (row, column) => `${row}:${column}`;

function tileAt(state, pending, row, column) {
    return pending.get(keyOf(row, column)) || state.board[row]?.[column] || null;
}

function collectWord(state, pending, row, column, dr, dc) {
    let startRow = row, startColumn = column;
    while (inside(state, startRow - dr, startColumn - dc) && tileAt(state, pending, startRow - dr, startColumn - dc)) { startRow -= dr; startColumn -= dc; }
    const cells = []; let r = startRow, c = startColumn;
    while (inside(state, r, c) && tileAt(state, pending, r, c)) { cells.push({ row: r, column: c, tile: tileAt(state, pending, r, c) }); r += dr; c += dc; }
    return cells;
}

function scoreCells(state, pending, cells) {
    let score = 0, wordMultiplier = 1;
    for (const cell of cells) {
        let points = cell.tile.points;
        if (pending.has(keyOf(cell.row, cell.column))) {
            const bonus = boardBonus(state.size, cell.row, cell.column);
            if (bonus === 'DL') points *= 2;
            if (bonus === 'TL') points *= 3;
            if (bonus === 'DW') wordMultiplier *= 2;
            if (bonus === 'TW') wordMultiplier *= 3;
        }
        score += points;
    }
    return score * wordMultiplier;
}

export function evaluateWordMove(state, placements, dictionary) {
    if (!placements?.length || state.winner !== null) return { ok: false, error: 'No tiles placed.' };
    const rack = state.racks[state.player], rackById = new Map(rack.map(tile => [tile.id, tile]));
    const pending = new Map();
    for (const placement of placements) {
        const source = rackById.get(placement.tileId);
        if (!source) return { ok: false, error: 'Tile not on rack.' };
        if (!inside(state, placement.row, placement.column) || state.board[placement.row][placement.column]) return { ok: false, error: 'Square is not empty.' };
        const key = keyOf(placement.row, placement.column);
        if (pending.has(key)) return { ok: false, error: 'Two tiles placed on the same square.' };
        let letter = source.letter;
        if (letter === '?') {
            letter = String(placement.blankLetter || '').toLocaleUpperCase('sl-SI');
            if (!/^[A-ZČŠŽ]$/.test(letter)) return { ok: false, error: 'Assign a letter to the blank tile.' };
        }
        pending.set(key, { ...source, letter, points: source.letter === '?' ? 0 : source.points, blank: source.letter === '?' });
        rackById.delete(source.id);
    }
    const sameRow = placements.every(item => item.row === placements[0].row);
    const sameColumn = placements.every(item => item.column === placements[0].column);
    if (!sameRow && !sameColumn) return { ok: false, error: 'Tiles must be in the same row or column.' };
    const direction = sameRow ? [0, 1] : [1, 0];
    const main = collectWord(state, pending, placements[0].row, placements[0].column, ...direction);
    const expectedSpan = sameRow
        ? Math.max(...placements.map(item => item.column)) - Math.min(...placements.map(item => item.column)) + 1
        : Math.max(...placements.map(item => item.row)) - Math.min(...placements.map(item => item.row)) + 1;
    if (main.length < expectedSpan) return { ok: false, error: 'There is a gap in the word.' };
    const boardEmpty = !state.board.some(row => row.some(Boolean));
    const center = Math.floor(state.size / 2);
    if (boardEmpty && !pending.has(keyOf(center, center))) return { ok: false, error: 'First word must cover the centre square.' };
    if (!boardEmpty) {
        const connected = placements.some(item => [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => state.board[item.row + dr]?.[item.column + dc]));
        if (!connected && main.every(cell => pending.has(keyOf(cell.row, cell.column)))) return { ok: false, error: 'Move must connect to existing words.' };
    }
    const words = [];
    if (main.length > 1) words.push(main);
    const crossDirection = sameRow ? [1, 0] : [0, 1];
    for (const placement of placements) {
        const cross = collectWord(state, pending, placement.row, placement.column, ...crossDirection);
        if (cross.length > 1) words.push(cross);
    }
    if (!words.length) return { ok: false, error: 'Word must be at least two letters long.' };
    const names = words.map(cells => normalizeWord(cells.map(cell => cell.tile.letter).join('')));
    const invalid = names.filter(word => !dictionary.has(word));
    if (invalid.length) return { ok: false, error: `Not in dictionary: ${invalid.join(', ')}`, words: names };
    let score = words.reduce((sum, cells) => sum + scoreCells(state, pending, cells), 0);
    if (placements.length === state.rackSize) score += state.bingoBonus;
    return { ok: true, pending, words: names, score };
}

export function playWordMove(state, placements, dictionary) {
    const result = evaluateWordMove(state, placements, dictionary);
    if (!result.ok) return result;
    const usedIds = new Set(placements.map(item => item.tileId));
    for (const [key, tile] of result.pending.entries()) {
        const [row, column] = key.split(':').map(Number); state.board[row][column] = tile;
    }
    state.racks[state.player] = state.racks[state.player].filter(tile => !usedIds.has(tile.id));
    state.scores[state.player] += result.score; refillRack(state, state.player);
    state.lastEvent = `${result.words.join(' + ')} · ${result.score} pts.`; state.passes = 0;
    finishOrAdvance(state); return result;
}

export function passWordTurn(state) {
    if (state.winner !== null) return false;
    state.passes++; state.lastEvent = `Player ${state.player} passed.`; finishOrAdvance(state); return true;
}

export function exchangeRack(state) {
    if (state.winner !== null || state.bag.length < state.racks[state.player].length) return false;
    state.bag.unshift(...state.racks[state.player]); state.racks[state.player] = []; refillRack(state, state.player);
    state.passes++; state.lastEvent = `Player ${state.player} exchanged rack.`; finishOrAdvance(state); return true;
}

function finishOrAdvance(state) {
    const emptied = !state.racks[state.player].length && !state.bag.length;
    if (emptied || state.passes >= 4) {
        for (let player = 1; player <= 2; player++) state.scores[player] -= state.racks[player].reduce((sum, tile) => sum + tile.points, 0);
        state.winner = state.scores[1] === state.scores[2] ? 0 : (state.scores[1] > state.scores[2] ? 1 : 2);
        state.lastEvent = state.winner ? `Player ${state.winner} wins!` : 'Draw!'; return;
    }
    state.player = 3 - state.player; state.turn++;
}

function rackCounts(rack) {
    const counts = new Map(); rack.forEach(tile => counts.set(tile.letter, (counts.get(tile.letter) || 0) + 1)); return counts;
}

function canBuildWord(word, rack, requiredLetter = null) {
    const counts = rackCounts(rack); let blanks = counts.get('?') || 0, usedRequired = requiredLetter === null;
    for (const rawLetter of word.toLocaleUpperCase('sl-SI')) {
        const letter = rawLetter;
        if (!usedRequired && letter === requiredLetter) { usedRequired = true; continue; }
        const count = counts.get(letter) || 0;
        if (count) counts.set(letter, count - 1);
        else if (blanks) blanks--;
        else return false;
    }
    return usedRequired;
}

function placementsForWord(state, word, startRow, startColumn, dr, dc) {
    const rack = [...state.racks[state.player]], placements = [];
    for (let index = 0; index < word.length; index++) {
        const row = startRow + dr * index, column = startColumn + dc * index;
        if (!inside(state, row, column)) return null;
        const letter = word[index].toLocaleUpperCase('sl-SI'), existing = state.board[row][column];
        if (existing) { if (existing.letter !== letter) return null; continue; }
        let rackIndex = rack.findIndex(tile => tile.letter === letter);
        if (rackIndex < 0) rackIndex = rack.findIndex(tile => tile.letter === '?');
        if (rackIndex < 0) return null;
        const [tile] = rack.splice(rackIndex, 1); placements.push({ row, column, tileId: tile.id, blankLetter: tile.letter === '?' ? letter : null });
    }
    return placements.length ? placements : null;
}

export function chooseWordMove(state, dictionaryWords, dictionary, scanLimit = 60000) {
    const boardEmpty = !state.board.some(row => row.some(Boolean)), center = Math.floor(state.size / 2);
    const candidates = [];
    let scanned = 0;
    for (const word of dictionaryWords) {
        if (++scanned > scanLimit) break;
        if (word.length < 2 || word.length > state.rackSize + (boardEmpty ? 0 : 1)) continue;
        const upper = word.toLocaleUpperCase('sl-SI');
        if (boardEmpty) {
            if (!canBuildWord(upper, state.racks[state.player])) continue;
            const startColumn = center - Math.floor(upper.length / 2);
            const placements = placementsForWord(state, upper, center, startColumn, 0, 1);
            if (placements) { const result = evaluateWordMove(state, placements, dictionary); if (result.ok) candidates.push({ placements, score: result.score }); }
        } else {
            for (let row = 0; row < state.size; row++) for (let column = 0; column < state.size; column++) {
                const anchor = state.board[row][column]; if (!anchor || !upper.includes(anchor.letter)) continue;
                if (!canBuildWord(upper, state.racks[state.player], anchor.letter)) continue;
                for (let letterIndex = 0; letterIndex < upper.length; letterIndex++) {
                    if (upper[letterIndex] !== anchor.letter) continue;
                    for (const [dr, dc] of [[0, 1], [1, 0]]) {
                        const placements = placementsForWord(state, upper, row - dr * letterIndex, column - dc * letterIndex, dr, dc);
                        if (!placements) continue;
                        const result = evaluateWordMove(state, placements, dictionary);
                        if (result.ok) candidates.push({ placements, score: result.score });
                    }
                }
                if (candidates.length > 80) break;
            }
        }
        if (candidates.length > 120) break;
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
}
