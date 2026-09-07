import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createLudoState, rollLudoDice, legalLudoMoves, applyLudoMove, ludoGlobalField,
} from '../renderer/games/ludo/ludo-model.js';
import {
    createReversi, reversiMoves, playReversi,
    createCheckers, checkersMoves, playCheckers,
    createKalisto, KALISTO_SHAPES, kalistoPlacements, playKalisto, playKalistoPillar, canPlaceKalisto,
    isKalistoPillarForbiddenCell,
} from '../renderer/games/classic-board/board-model.js';
import {
    createWar, playWarRound, createCrazyEights, canPlayEight,
    createBlackjack, blackjackValue, hitBlackjack, createMemory, flipMemoryCard,
} from '../renderer/games/card-lounge/card-model.js';
import { createWordState, playWordMove } from '../renderer/games/word-tiles/word-model.js';
import {
    createChess, chessMoves, playChess, chooseChessMove,
} from '../renderer/games/classic-board/chess-model.js';
import {
    createPictureMemory, flipPictureMemory, resolvePictureMemory,
    layoutPictureMemoryCards, pictureMemoryCardsOverlap,
} from '../renderer/games/classic-memory/memory-model.js';
import { MEMORY_CATALOG } from '../renderer/games/classic-memory/catalog.js';

const memoryCatalogDirectory = path.dirname(fileURLToPath(
    new URL('../renderer/games/classic-memory/catalog.js', import.meta.url),
));
const generatedMemoryCategories = [
    'aliens', 'monsters', 'plants', 'animals', 'buildings', 'cars', 'airplanes',
    'rockets', 'ships', 'transport', 'objects', 'landscapes', 'cities',
];
assert.equal(new Set(MEMORY_CATALOG.map(item => item.id)).size, MEMORY_CATALOG.length, 'ID-ji slik spomina morajo biti enolični.');
for (const item of MEMORY_CATALOG) {
    assert.ok(
        fs.existsSync(path.resolve(memoryCatalogDirectory, item.image)),
        `Slika spomina ne obstaja: ${item.image}`,
    );
}
for (const category of generatedMemoryCategories) {
    assert.equal(
        MEMORY_CATALOG.filter(item => item.category === category).length,
        20,
        `Kategorija ${category} mora vsebovati 20 slik.`,
    );
}

const ludo = createLudoState({ playerCount: 3, trackFields: 24, homeFields: 3, piecesPerPlayer: 2, entryRoll: 1, diceSides: 6 }, 8);
ludo.dice = 1; ludo.phase = 'move';
assert.deepEqual(legalLudoMoves(ludo).map(move => move.piece), [0, 1]);
assert.equal(applyLudoMove(ludo, 0).ok, true);
assert.equal(ludo.players[0].pieces[0], 0);
assert.equal(ludoGlobalField(ludo, 1, 0), 8);
assert.ok(rollLudoDice(ludo) >= 1 && ludo.dice <= 6);

const reversi = createReversi(8);
assert.equal(reversiMoves(reversi).length, 4);
const reversiMove = reversiMoves(reversi)[0];
assert.equal(playReversi(reversi, reversiMove.row, reversiMove.column), true);
assert.equal(reversi.grid.flat().filter(Boolean).length, 5);

const checkers = createCheckers(8, 0);
checkers.grid = Array.from({ length: 8 }, () => Array(8).fill(0));
checkers.grid[5][2] = 1; checkers.grid[4][3] = 2;
const capture = checkersMoves(checkers)[0];
assert.deepEqual(capture.capture, [4, 3]);
assert.equal(playCheckers(checkers, capture), true);
assert.equal(checkers.grid[4][3], 0);

const kalisto = createKalisto(12, 18, 2);
assert.deepEqual(
    KALISTO_SHAPES.reduce((counts, shape) => ({ ...counts, [shape.length]: (counts[shape.length] || 0) + 1 }), {}),
    { 2: 2, 3: 4, 4: 8, 5: 4 },
    'Callisto mora uporabljati originalni komplet 18 poliminov.',
);
assert.equal(
    Array.from({ length: kalisto.size }, (_, row) => Array.from({ length: kalisto.size }, (_, column) =>
        isKalistoPillarForbiddenCell(kalisto, row, column))).flat().filter(Boolean).length,
    5,
    'Osrednji prepovedani del Callista mora biti križ iz petih polj.',
);
assert.equal(kalisto.phase, 'pillars');
assert.equal(playKalistoPillar(kalisto, 3, 3), true);
assert.equal(playKalistoPillar(kalisto, 3, 8), true);
assert.equal(playKalistoPillar(kalisto, 8, 3), true);
assert.equal(playKalistoPillar(kalisto, 8, 8), true);
assert.equal(kalisto.phase, 'pieces');
assert.equal(canPlaceKalisto(kalisto, 1, [[4, 4], [4, 5]]), false, 'Diagonalni stik v Callistu ni dovolj.');
const firstPlacements = kalistoPlacements(kalisto, 1, 10);
assert.ok(firstPlacements.length > 0);
assert.equal(playKalisto(kalisto, firstPlacements[0]), true);
assert.ok(kalisto.grid.flat().includes(1));

const war = createWar(3);
assert.equal(war.hands[1].length + war.hands[2].length, 52);
assert.equal(playWarRound(war), true);
assert.equal(war.hands[1].length + war.hands[2].length, 52);

const eights = createCrazyEights(4, 7);
assert.equal(eights.hands[1].length, 7);
assert.ok(eights.hands[1].some(card => typeof canPlayEight(eights, card) === 'boolean'));

const blackjack = createBlackjack(5);
assert.equal(blackjack.playerHand.length, 2);
assert.ok(blackjackValue(blackjack.playerHand) >= 4);
if (blackjack.phase === 'player') assert.equal(hitBlackjack(blackjack), true);

const memory = createMemory(6, 6);
assert.equal(memory.cards.length, 12);
assert.equal(flipMemoryCard(memory, 0), true);
assert.equal(memory.open.length, 1);

const words = createWordState({ boardSize: 9, rackSize: 7, bingoBonus: 50 }, 7);
words.racks[1] = [
    { id: 'm', letter: 'M', points: 3 }, { id: 'i', letter: 'I', points: 1 },
    { id: 'z', letter: 'Z', points: 4 }, { id: 'a', letter: 'A', points: 1 },
];
const move = playWordMove(words, [
    { tileId: 'm', row: 4, column: 2 }, { tileId: 'i', row: 4, column: 3 },
    { tileId: 'z', row: 4, column: 4 }, { tileId: 'a', row: 4, column: 5 },
], new Set(['miza']));
assert.equal(move.ok, true);
assert.deepEqual(move.words, ['miza']);
assert.ok(words.scores[1] > 0);

const chess = createChess();
assert.equal(chessMoves(chess).length, 20);
assert.ok(chooseChessMove(chess, 1));
for (const [from, to] of [[['f', 2], ['f', 3]], [['e', 7], ['e', 5]], [['g', 2], ['g', 4]], [['d', 8], ['h', 4]]]) {
    const column = letter => letter.charCodeAt(0) - 97;
    assert.equal(playChess(chess, { from: [8 - from[1], column(from[0])], to: [8 - to[1], column(to[0])] }), true);
}
assert.equal(chess.winner, 2);
assert.match(chess.lastEvent, /mat/i);

const pictureMemory = createPictureMemory(MEMORY_CATALOG, { pairCount: 6, category: 'mixed' }, 17);
assert.equal(pictureMemory.cards.length, 12);
const categoryClampedMemory = createPictureMemory(MEMORY_CATALOG, { pairCount: 60, category: 'animals' }, 18);
assert.equal(categoryClampedMemory.cards.length, 40, 'Število parov se mora omejiti na razpoložljive slike kategorije.');
const firstPairId = pictureMemory.cards[0].pairId;
const mate = pictureMemory.cards.findIndex((card, index) => index > 0 && card.pairId === firstPairId);
assert.equal(flipPictureMemory(pictureMemory, 0), true);
assert.equal(flipPictureMemory(pictureMemory, mate), true);
assert.equal(resolvePictureMemory(pictureMemory), true);
assert.equal(pictureMemory.scores[1], 1);
for (const [width, height] of [[1264, 680], [900, 700], [640, 900], [360, 640], [240, 320]]) {
    for (const cardCount of [4, 20, 40, 80, 120]) {
        const scattered = layoutPictureMemoryCards(cardCount, width, height, { scatter: true, maxRotation: 24, seed: 99 });
        assert.equal(scattered.length, cardCount);
        for (const card of scattered) {
            const halfExtent = (Math.abs(Math.cos(card.angle)) + Math.abs(Math.sin(card.angle))) * card.w / 2;
            assert.ok(card.x - halfExtent >= -0.01 && card.x + halfExtent <= width + 0.01
                && card.y - halfExtent >= -0.01 && card.y + halfExtent <= height + 0.01,
            `Razmetana karta je izven vidnega platna pri ${cardCount} kartah na ${width} × ${height}.`);
        }
        for (let a = 0; a < scattered.length; a++) for (let b = a + 1; b < scattered.length; b++) {
            assert.equal(
                pictureMemoryCardsOverlap(scattered[a], scattered[b]),
                false,
                `Razmetani karti ${a} in ${b} se prekrivata pri ${cardCount} kartah na ${width} × ${height}.`,
            );
        }
    }
}

console.log('Tabletop, card and Slovenian word-game logic tests passed.');
