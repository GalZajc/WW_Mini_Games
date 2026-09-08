const BOARD_SIZE = 8;
const inside = (row, column) => row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE;
const cloneBoard = board => board.map(row => [...row]);
const sideCode = player => player === 1 ? 'w' : 'b';
const owner = piece => piece?.[0] === 'w' ? 1 : (piece?.[0] === 'b' ? 2 : 0);
const kind = piece => piece?.[1] || '';
const pawnDirection = player => player === 1 ? -1 : 1;

const GLYPHS = Object.freeze({
    wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
    bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
});

export function chessPieceGlyph(piece) { return GLYPHS[piece] || ''; }

export function createChess() {
    const board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    board[0] = back.map(piece => `b${piece}`);
    board[1] = Array(BOARD_SIZE).fill('bP');
    board[6] = Array(BOARD_SIZE).fill('wP');
    board[7] = back.map(piece => `w${piece}`);
    return {
        mode: 'chess', size: BOARD_SIZE, board, player: 1, winner: null,
        result: null, turn: 1, halfmoveClock: 0, enPassant: null,
        castling: {
            1: { kingSide: true, queenSide: true },
            2: { kingSide: true, queenSide: true },
        },
        lastMove: null, lastEvent: 'White starts.',
    };
}

function copyState(state) {
    return {
        ...state,
        board: cloneBoard(state.board),
        enPassant: state.enPassant ? { ...state.enPassant } : null,
        castling: {
            1: { ...state.castling[1] },
            2: { ...state.castling[2] },
        },
        lastMove: state.lastMove ? structuredClone(state.lastMove) : null,
    };
}

function findKing(board, player) {
    const target = `${sideCode(player)}K`;
    for (let row = 0; row < BOARD_SIZE; row++) for (let column = 0; column < BOARD_SIZE; column++) {
        if (board[row][column] === target) return [row, column];
    }
    return null;
}

export function chessSquareAttacked(state, row, column, attacker) {
    const board = state.board, side = sideCode(attacker);
    const pawnRow = row - pawnDirection(attacker);
    for (const dc of [-1, 1]) if (board[pawnRow]?.[column + dc] === `${side}P`) return true;

    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) {
        if (board[row + dr]?.[column + dc] === `${side}N`) return true;
    }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if ((dr || dc) && board[row + dr]?.[column + dc] === `${side}K`) return true;
    }

    const scan = (directions, accepted) => {
        for (const [dr, dc] of directions) {
            let r = row + dr, c = column + dc;
            while (inside(r, c)) {
                const piece = board[r][c];
                if (piece) {
                    if (owner(piece) === attacker && accepted.includes(kind(piece))) return true;
                    break;
                }
                r += dr; c += dc;
            }
        }
        return false;
    };
    return scan([[-1, 0], [1, 0], [0, -1], [0, 1]], ['R', 'Q'])
        || scan([[-1, -1], [-1, 1], [1, -1], [1, 1]], ['B', 'Q']);
}

export function chessInCheck(state, player = state.player) {
    const king = findKing(state.board, player);
    return !king || chessSquareAttacked(state, king[0], king[1], 3 - player);
}

function pseudoMoves(state, player) {
    const moves = [], board = state.board, side = sideCode(player);
    const push = (from, to, extras = {}) => {
        if (!inside(to[0], to[1]) || owner(board[to[0]][to[1]]) === player) return;
        moves.push({ from, to, ...extras });
    };
    const slide = (from, directions) => {
        for (const [dr, dc] of directions) {
            let row = from[0] + dr, column = from[1] + dc;
            while (inside(row, column)) {
                if (!board[row][column]) moves.push({ from, to: [row, column] });
                else {
                    if (owner(board[row][column]) !== player) moves.push({ from, to: [row, column] });
                    break;
                }
                row += dr; column += dc;
            }
        }
    };

    for (let row = 0; row < BOARD_SIZE; row++) for (let column = 0; column < BOARD_SIZE; column++) {
        const piece = board[row][column];
        if (owner(piece) !== player) continue;
        const from = [row, column], type = kind(piece);
        if (type === 'P') {
            const direction = pawnDirection(player), next = row + direction, promotionRow = player === 1 ? 0 : 7;
            if (inside(next, column) && !board[next][column]) {
                push(from, [next, column], next === promotionRow ? { promotion: 'Q' } : {});
                const start = player === 1 ? 6 : 1, doubleRow = row + direction * 2;
                if (row === start && !board[doubleRow][column]) push(from, [doubleRow, column], { doublePawn: true });
            }
            for (const dc of [-1, 1]) {
                const target = [next, column + dc];
                if (!inside(target[0], target[1])) continue;
                if (board[target[0]][target[1]] && owner(board[target[0]][target[1]]) !== player) {
                    push(from, target, target[0] === promotionRow ? { promotion: 'Q' } : {});
                } else if (state.enPassant?.row === target[0] && state.enPassant?.column === target[1]
                    && state.enPassant.player !== player) {
                    push(from, target, { enPassantCapture: [row, target[1]] });
                }
            }
        } else if (type === 'N') {
            for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) push(from, [row + dr, column + dc]);
        } else if (type === 'B') slide(from, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
        else if (type === 'R') slide(from, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
        else if (type === 'Q') slide(from, [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]);
        else if (type === 'K') {
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) push(from, [row + dr, column + dc]);
            const homeRow = player === 1 ? 7 : 0;
            if (row === homeRow && column === 4 && !chessInCheck(state, player)) {
                const enemy = 3 - player, rights = state.castling[player] || {};
                if (rights.kingSide && board[homeRow][7] === `${side}R` && !board[homeRow][5] && !board[homeRow][6]
                    && !chessSquareAttacked(state, homeRow, 5, enemy) && !chessSquareAttacked(state, homeRow, 6, enemy)) {
                    moves.push({ from, to: [homeRow, 6], castle: 'kingSide' });
                }
                if (rights.queenSide && board[homeRow][0] === `${side}R` && !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3]
                    && !chessSquareAttacked(state, homeRow, 3, enemy) && !chessSquareAttacked(state, homeRow, 2, enemy)) {
                    moves.push({ from, to: [homeRow, 2], castle: 'queenSide' });
                }
            }
        }
    }
    return moves;
}

function boardAfterMove(state, move) {
    const board = cloneBoard(state.board), [fromRow, fromColumn] = move.from, [toRow, toColumn] = move.to;
    let piece = board[fromRow][fromColumn];
    board[fromRow][fromColumn] = null;
    if (move.enPassantCapture) board[move.enPassantCapture[0]][move.enPassantCapture[1]] = null;
    if (move.castle) {
        const rookFrom = move.castle === 'kingSide' ? 7 : 0, rookTo = move.castle === 'kingSide' ? 5 : 3;
        board[toRow][rookTo] = board[toRow][rookFrom]; board[toRow][rookFrom] = null;
    }
    if (move.promotion && kind(piece) === 'P') piece = `${piece[0]}${move.promotion}`;
    board[toRow][toColumn] = piece;
    return board;
}

export function chessMoves(state, player = state.player) {
    return pseudoMoves(state, player).filter(move => {
        const candidate = { ...state, board: boardAfterMove(state, move) };
        return !chessInCheck(candidate, player);
    });
}

function sameMove(left, right) {
    return left.from[0] === right.from[0] && left.from[1] === right.from[1]
        && left.to[0] === right.to[0] && left.to[1] === right.to[1];
}

function disableRookRight(state, player, row, column) {
    const homeRow = player === 1 ? 7 : 0;
    if (row !== homeRow) return;
    if (column === 0) state.castling[player].queenSide = false;
    if (column === 7) state.castling[player].kingSide = false;
}

function insufficientMaterial(board) {
    const material = board.flat().filter(piece => piece && kind(piece) !== 'K');
    if (!material.length) return true;
    if (material.length === 1 && ['B', 'N'].includes(kind(material[0]))) return true;
    return false;
}

export function playChess(state, requestedMove) {
    if (state.winner !== null) return false;
    const move = chessMoves(state).find(candidate => sameMove(candidate, requestedMove));
    if (!move) return false;
    const [fromRow, fromColumn] = move.from, [toRow, toColumn] = move.to;
    const movingPiece = state.board[fromRow][fromColumn], captured = state.board[toRow][toColumn];
    const player = state.player;

    if (kind(movingPiece) === 'K') {
        state.castling[player].kingSide = false;
        state.castling[player].queenSide = false;
    }
    if (kind(movingPiece) === 'R') disableRookRight(state, player, fromRow, fromColumn);
    if (kind(captured) === 'R') disableRookRight(state, 3 - player, toRow, toColumn);

    state.board = boardAfterMove(state, move);
    state.enPassant = move.doublePawn
        ? { row: (fromRow + toRow) / 2, column: fromColumn, player }
        : null;
    state.halfmoveClock = kind(movingPiece) === 'P' || captured || move.enPassantCapture ? 0 : state.halfmoveClock + 1;
    state.lastMove = move;
    state.turn++;
    state.player = 3 - player;

    const nextMoves = chessMoves(state);
    if (!nextMoves.length) {
        if (chessInCheck(state)) {
            state.winner = player; state.result = 'checkmate'; state.lastEvent = `Checkmate. Player ${player} wins.`;
        } else {
            state.winner = 0; state.result = 'stalemate'; state.lastEvent = 'Stalemate. Draw.';
        }
    } else if (insufficientMaterial(state.board)) {
        state.winner = 0; state.result = 'insufficient'; state.lastEvent = 'Draw: insufficient material for checkmate.';
    } else if (chessInCheck(state)) state.lastEvent = `Check on player ${state.player}.`;
    else state.lastEvent = captured || move.enPassantCapture ? 'Piece captured.' : (move.castle ? 'Castling.' : 'Move completed.');
    return true;
}

const VALUES = Object.freeze({ P: 100, N: 320, B: 335, R: 500, Q: 900, K: 20000 });

function evaluate(state, rootPlayer) {
    if (state.winner !== null) return state.winner === 0 ? 0 : (state.winner === rootPlayer ? 100000 : -100000);
    let score = 0;
    for (let row = 0; row < BOARD_SIZE; row++) for (let column = 0; column < BOARD_SIZE; column++) {
        const piece = state.board[row][column]; if (!piece) continue;
        const sign = owner(piece) === rootPlayer ? 1 : -1;
        const centrality = 3.5 - (Math.abs(row - 3.5) + Math.abs(column - 3.5)) * .5;
        const advancement = kind(piece) === 'P' ? (owner(piece) === 1 ? 6 - row : row - 1) * 5 : 0;
        score += sign * (VALUES[kind(piece)] + centrality * (kind(piece) === 'N' || kind(piece) === 'B' ? 8 : 2) + advancement);
    }
    score += (chessMoves(state, rootPlayer).length - chessMoves(state, 3 - rootPlayer).length) * 2;
    return score;
}

function orderedMoves(state) {
    return chessMoves(state).sort((a, b) => {
        const capturedA = state.board[a.to[0]][a.to[1]], capturedB = state.board[b.to[0]][b.to[1]];
        return (VALUES[kind(capturedB)] || 0) - (VALUES[kind(capturedA)] || 0)
            || Number(Boolean(b.promotion)) - Number(Boolean(a.promotion));
    });
}

function search(state, depth, rootPlayer, alpha, beta) {
    if (depth <= 0 || state.winner !== null) return evaluate(state, rootPlayer);
    const maximizing = state.player === rootPlayer, moves = orderedMoves(state);
    if (!moves.length) return evaluate(state, rootPlayer);
    let best = maximizing ? -Infinity : Infinity;
    for (const move of moves) {
        const child = copyState(state); playChess(child, move);
        const score = search(child, depth - 1, rootPlayer, alpha, beta);
        if (maximizing) { best = Math.max(best, score); alpha = Math.max(alpha, best); }
        else { best = Math.min(best, score); beta = Math.min(beta, best); }
        if (beta <= alpha) break;
    }
    return best;
}

export function chooseChessMove(state, depth = 2) {
    const moves = orderedMoves(state);
    if (!moves.length) return null;
    const rootPlayer = state.player;
    // ClassicBoardGame validates this as a positive integer before gameplay.
    // Do not silently cap a requested search depth at the old slider maximum;
    // a deeper search is slower, but it is still a well-defined setting.
    depth = Math.max(1, Math.round(Number(depth) || 2));
    let bestMove = moves[0], bestScore = -Infinity;
    for (const move of moves) {
        const child = copyState(state); playChess(child, move);
        const score = search(child, depth - 1, rootPlayer, -Infinity, Infinity);
        if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    return bestMove;
}
