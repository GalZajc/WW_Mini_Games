import { requireInteger } from '../../core/SettingsValidation.js';

export const LUDO_COLORS = ['#e8463f', '#3d87e8', '#f0c52e', '#3eaf5b', '#9c5bd6', '#ef8737'];

const integer = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

export function validateLudoRules(raw = {}) {
    const requested = raw || {};
    const value = (key, fallback, label, options = {}) => requested[key] === undefined
        ? fallback
        : requireInteger(requested[key], label, options);
    const playerCount = value('playerCount', 4, 'Player count');
    const diceSides = value('diceSides', 6, 'Dice sides');
    const trackFields = value('trackFields', 40, 'Shared track fields');
    const homeFields = value('homeFields', 4, 'Home-lane fields');
    const piecesPerPlayer = value('piecesPerPlayer', 4, 'Pieces per player');
    const entryRoll = value('entryRoll', diceSides, 'Entry roll');
    if (playerCount < 2 || playerCount > LUDO_COLORS.length) {
        throw new Error(`Ludo supports between 2 and ${LUDO_COLORS.length} players.`);
    }
    if (diceSides < 2) throw new Error('Dice sides must be at least 2.');
    if (trackFields < playerCount * 4) throw new Error('The shared Ludo track must provide four start fields per player.');
    if (homeFields < 1) throw new Error('The home lane must contain at least one field.');
    if (piecesPerPlayer < 1) throw new Error('Each player must have at least one piece.');
    if (entryRoll < 1 || entryRoll > diceSides) throw new Error('The entry roll must be between 1 and the number of dice sides.');
    return { playerCount, diceSides, trackFields, homeFields, piecesPerPlayer, entryRoll };
}

export function normalizeLudoRules(raw = {}) {
    const playerCount = integer(raw.playerCount, 4);
    const diceSides = integer(raw.diceSides, 6);
    return {
        playerCount,
        trackFields: integer(raw.trackFields, 40),
        homeFields: integer(raw.homeFields, 4),
        piecesPerPlayer: integer(raw.piecesPerPlayer, 4),
        diceSides,
        entryRoll: integer(raw.entryRoll, diceSides),
        extraTurnOnMaximum: raw.extraTurnOnMaximum !== false,
        extraTurnOnCapture: raw.extraTurnOnCapture !== false,
        safeStartFields: raw.safeStartFields !== false,
    };
}

export function createLudoState(rawRules = {}, seed = 1) {
    const rules = normalizeLudoRules(rawRules);
    return {
        rules,
        seed: seed >>> 0,
        randomState: seed >>> 0 || 0x6d2b79f5,
        players: Array.from({ length: rules.playerCount }, (_, index) => ({
            index,
            color: LUDO_COLORS[index],
            pieces: Array(rules.piecesPerPlayer).fill(-1),
        })),
        turn: 0,
        dice: null,
        phase: 'roll',
        winner: null,
        lastEvent: 'Roll the dice to begin.',
        turnNumber: 1,
    };
}

function nextRandom(state) {
    let value = state.randomState >>> 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    state.randomState = value >>> 0;
    return state.randomState / 0x100000000;
}

export function rollLudoDice(state) {
    if (state.winner !== null || state.phase !== 'roll') return null;
    state.dice = 1 + Math.floor(nextRandom(state) * state.rules.diceSides);
    state.phase = 'move';
    state.lastEvent = `Player ${state.turn + 1} rolled ${state.dice}.`;
    return state.dice;
}

export function ludoGlobalField(state, playerIndex, position) {
    if (position < 0 || position >= state.rules.trackFields) return null;
    const start = Math.floor(playerIndex * state.rules.trackFields / state.rules.playerCount);
    return (start + position) % state.rules.trackFields;
}

export function legalLudoMoves(state, playerIndex = state.turn, dice = state.dice) {
    if (state.winner !== null || dice === null || dice === undefined) return [];
    const limit = state.rules.trackFields + state.rules.homeFields - 1;
    const pieces = state.players[playerIndex].pieces;
    const moves = [];
    pieces.forEach((position, piece) => {
        if (position === -1 && dice === state.rules.entryRoll) {
            if (!pieces.includes(0)) moves.push({ piece, from: -1, to: 0 });
        } else if (position >= 0 && position < limit && position + dice <= limit) {
            const targetPos = position + dice;
            if (targetPos === limit || !pieces.includes(targetPos)) {
                moves.push({ piece, from: position, to: targetPos });
            }
        }
    });
    return moves;
}

function isSafeGlobalField(state, globalField) {
    if (!state.rules.safeStartFields) return false;
    for (let player = 0; player < state.rules.playerCount; player++) {
        if (ludoGlobalField(state, player, 0) === globalField) return true;
    }
    return false;
}

export function applyLudoMove(state, pieceIndex) {
    if (state.phase !== 'move' || state.winner !== null) return { ok: false };
    const move = legalLudoMoves(state).find(candidate => candidate.piece === pieceIndex);
    if (!move) return { ok: false };
    const playerIndex = state.turn;
    state.players[playerIndex].pieces[pieceIndex] = move.to;
    let captured = 0;
    const destination = ludoGlobalField(state, playerIndex, move.to);
    if (destination !== null && !isSafeGlobalField(state, destination)) {
        state.players.forEach((player, opponent) => {
            if (opponent === playerIndex) return;
            player.pieces.forEach((position, index) => {
                if (ludoGlobalField(state, opponent, position) === destination) {
                    player.pieces[index] = -1;
                    captured++;
                }
            });
        });
    }
    const finish = state.rules.trackFields + state.rules.homeFields - 1;
    if (state.players[playerIndex].pieces.every(position => position === finish)) {
        state.winner = playerIndex;
        state.phase = 'gameover';
        state.lastEvent = `Player ${playerIndex + 1} wins!`;
        return { ok: true, captured, won: true, extraTurn: false };
    }
    const extraTurn = (state.rules.extraTurnOnMaximum && state.dice === state.rules.diceSides)
        || (state.rules.extraTurnOnCapture && captured > 0);
    state.lastEvent = captured
        ? `Player ${playerIndex + 1} captured ${captured} token${captured === 1 ? '' : 's'}.`
        : `Player ${playerIndex + 1} moved a token.`;
    state.dice = null;
    state.phase = 'roll';
    if (!extraTurn) {
        state.turn = (state.turn + 1) % state.rules.playerCount;
        state.turnNumber++;
    }
    return { ok: true, captured, won: false, extraTurn };
}

export function passLudoTurn(state) {
    if (state.winner !== null) return;
    state.lastEvent = `Player ${state.turn + 1} has no legal moves.`;
    state.dice = null;
    state.phase = 'roll';
    state.turn = (state.turn + 1) % state.rules.playerCount;
    state.turnNumber++;
}

export function chooseLudoMove(state) {
    const moves = legalLudoMoves(state);
    if (!moves.length) return null;
    const player = state.turn;
    const finish = state.rules.trackFields + state.rules.homeFields - 1;
    const scored = moves.map(move => {
        let score = move.to + nextRandom(state) * 0.1;
        if (move.to === finish) score += 1000;
        if (move.from === -1) score += 40;
        const destination = ludoGlobalField(state, player, move.to);
        if (destination !== null) {
            for (let opponent = 0; opponent < state.rules.playerCount; opponent++) {
                if (opponent === player) continue;
                for (const position of state.players[opponent].pieces) {
                    if (ludoGlobalField(state, opponent, position) === destination) score += 180;
                }
            }
            if (isSafeGlobalField(state, destination)) score += 20;
        }
        return { ...move, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].piece;
}
