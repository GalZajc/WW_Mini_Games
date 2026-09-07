export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function randomFactory(seed) {
    let state = seed >>> 0 || 0x9e3779b9;
    return () => {
        state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
        return (state >>> 0) / 0x100000000;
    };
}

export function shuffledDeck(seed = 1, copies = 1) {
    const cards = [];
    for (let copy = 0; copy < copies; copy++) for (let suit = 0; suit < 4; suit++) for (let rank = 0; rank < 13; rank++) {
        cards.push({ id: `${copy}-${suit}-${rank}`, suit, rank });
    }
    const random = randomFactory(seed);
    for (let index = cards.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [cards[index], cards[swap]] = [cards[swap], cards[index]];
    }
    return cards;
}

export function cardLabel(card) { return `${RANKS[card.rank]}${SUITS[card.suit]}`; }
export function cardColor(card) { return card.suit === 1 || card.suit === 2 ? '#d83c3c' : '#20272b'; }

export function createWar(seed = 1) {
    const deck = shuffledDeck(seed);
    return {
        mode: 'war', seed, player: 1, winner: null, round: 0, lastBattle: [], lastEvent: 'Obrni naslednji karti.',
        hands: [null, deck.filter((_, i) => i % 2 === 0), deck.filter((_, i) => i % 2 === 1)],
    };
}

export function playWarRound(state) {
    if (state.winner !== null) return false;
    const pot = [];
    while (true) {
        if (!state.hands[1].length || !state.hands[2].length) break;
        const first = state.hands[1].shift(), second = state.hands[2].shift(); pot.push(first, second);
        state.lastBattle = [first, second]; state.round++;
        if (first.rank !== second.rank) {
            const winner = first.rank > second.rank ? 1 : 2;
            state.hands[winner].push(...pot);
            state.lastEvent = `Igralec ${winner} dobi ${pot.length} kart.`;
            break;
        }
        state.lastEvent = 'Vojna! Vsak zastavi še tri karte.';
        for (let hidden = 0; hidden < 3; hidden++) {
            if (state.hands[1].length) pot.push(state.hands[1].shift());
            if (state.hands[2].length) pot.push(state.hands[2].shift());
        }
    }
    if (!state.hands[1].length || !state.hands[2].length) {
        state.winner = state.hands[1].length > state.hands[2].length ? 1 : 2;
        state.lastEvent = `Zmagal je igralec ${state.winner}.`;
    }
    return true;
}

export function createCrazyEights(seed = 1, handSize = 7) {
    const deck = shuffledDeck(seed);
    const hands = [null, [], []];
    for (let i = 0; i < handSize; i++) { hands[1].push(deck.pop()); hands[2].push(deck.pop()); }
    let top = deck.pop();
    if (top.rank === 6) { deck.unshift(top); top = deck.pop(); }
    return { mode: 'eights', seed, player: 1, winner: null, drawPile: deck, discard: [top], hands, chosenSuit: top.suit, lastEvent: 'Igralec 1 začne.' };
}

export function canPlayEight(state, card) {
    const top = state.discard.at(-1);
    return card.rank === 6 || card.suit === state.chosenSuit || card.rank === top.rank;
}

function refillEightsDeck(state) {
    if (state.drawPile.length || state.discard.length <= 1) return;
    const top = state.discard.pop();
    state.drawPile = state.discard.reverse(); state.discard = [top];
}

export function playEightCard(state, cardIndex, chosenSuit = null) {
    const hand = state.hands[state.player], card = hand[cardIndex];
    if (!card || !canPlayEight(state, card) || state.winner !== null) return false;
    hand.splice(cardIndex, 1); state.discard.push(card);
    state.chosenSuit = card.rank === 6 ? (Number.isInteger(chosenSuit) ? chosenSuit : mostCommonSuit(hand)) : card.suit;
    if (!hand.length) { state.winner = state.player; state.lastEvent = `Zmagal je igralec ${state.winner}.`; return true; }
    state.lastEvent = card.rank === 6 ? `Osmica spremeni barvo v ${SUITS[state.chosenSuit]}.` : `${cardLabel(card)} je odigrana.`;
    state.player = 3 - state.player; return true;
}

export function drawEightCard(state) {
    if (state.winner !== null) return false;
    refillEightsDeck(state);
    const card = state.drawPile.pop();
    if (card) state.hands[state.player].push(card);
    state.lastEvent = card ? `Igralec ${state.player} vleče karto.` : 'Kup je prazen.';
    state.player = 3 - state.player; return true;
}

function mostCommonSuit(hand) {
    const counts = [0, 0, 0, 0]; hand.forEach(card => counts[card.suit]++);
    return counts.indexOf(Math.max(...counts));
}

export function chooseEightAction(state) {
    const playable = state.hands[state.player].map((card, index) => ({ card, index })).filter(item => canPlayEight(state, item.card));
    if (!playable.length) return { kind: 'draw' };
    playable.sort((a, b) => (b.card.rank === 6 ? -1 : b.card.rank) - (a.card.rank === 6 ? -1 : a.card.rank));
    const best = playable[0]; return { kind: 'play', cardIndex: best.index, chosenSuit: mostCommonSuit(state.hands[state.player]) };
}

export function blackjackValue(hand) {
    let value = hand.reduce((sum, card) => sum + (card.rank <= 8 ? card.rank + 2 : card.rank === 12 ? 11 : 10), 0);
    let aces = hand.filter(card => card.rank === 12).length;
    while (value > 21 && aces-- > 0) value -= 10;
    return value;
}

export function createBlackjack(seed = 1, deckCount = 1) {
    const deck = shuffledDeck(seed, deckCount), state = { mode: 'blackjack', seed, deck, playerHand: [], dealerHand: [], phase: 'player', winner: null, lastEvent: 'Vzemi karto ali ostani.' };
    state.playerHand.push(deck.pop()); state.dealerHand.push(deck.pop()); state.playerHand.push(deck.pop()); state.dealerHand.push(deck.pop());
    if (blackjackValue(state.playerHand) === 21) standBlackjack(state);
    return state;
}

export function hitBlackjack(state) {
    if (state.phase !== 'player') return false;
    state.playerHand.push(state.deck.pop());
    const value = blackjackValue(state.playerHand);
    state.lastEvent = `Tvoja vsota je ${value}.`;
    if (value > 21) { state.phase = 'gameover'; state.winner = 2; state.lastEvent = 'Presegel si 21. Delivec zmaga.'; }
    return true;
}

export function standBlackjack(state, dealerHitsSoft17 = false) {
    if (state.phase !== 'player') return false;
    state.phase = 'dealer';
    while (blackjackValue(state.dealerHand) < 17 || (dealerHitsSoft17 && blackjackValue(state.dealerHand) === 17 && state.dealerHand.some(card => card.rank === 12))) state.dealerHand.push(state.deck.pop());
    const player = blackjackValue(state.playerHand), dealer = blackjackValue(state.dealerHand);
    state.phase = 'gameover'; state.winner = dealer > 21 || player > dealer ? 1 : (player === dealer ? 0 : 2);
    state.lastEvent = state.winner === 1 ? 'Zmagal si.' : state.winner === 2 ? 'Delivec je zmagal.' : 'Neodločeno.';
    return true;
}

export function createMemory(seed = 1, pairs = 8) {
    pairs = Math.round(Number(pairs));
    const source = shuffledDeck(seed).slice(0, pairs);
    const cards = source.flatMap((card, pair) => [{ ...card, id: `${pair}-a`, pair }, { ...card, id: `${pair}-b`, pair }]);
    const random = randomFactory(seed ^ 0xa5a5a5a5);
    for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
    return { mode: 'memory', seed, cards, player: 1, winner: null, scores: [0, 0, 0], open: [], matched: [], phase: 'pick', lastEvent: 'Igralec 1 začne.' };
}

export function flipMemoryCard(state, index) {
    if (state.phase !== 'pick' || state.open.includes(index) || state.matched.includes(index) || state.winner !== null) return false;
    state.open.push(index);
    if (state.open.length === 2) {
        const [a, b] = state.open;
        if (state.cards[a].pair === state.cards[b].pair) {
            state.matched.push(a, b); state.scores[state.player]++; state.open = [];
            state.lastEvent = `Igralec ${state.player} najde par in igra znova.`;
            if (state.matched.length === state.cards.length) {
                state.winner = state.scores[1] === state.scores[2] ? 0 : (state.scores[1] > state.scores[2] ? 1 : 2);
                state.lastEvent = state.winner ? `Zmagal je igralec ${state.winner}.` : 'Neodločeno.';
            }
        } else { state.phase = 'resolve'; state.lastEvent = 'Kartici se ne ujemata.'; }
    }
    return true;
}

export function resolveMemory(state) {
    if (state.phase !== 'resolve') return false;
    state.open = []; state.phase = 'pick'; state.player = 3 - state.player; return true;
}

export function chooseMemoryCard(state, memory = new Map()) {
    for (const [pair, indices] of memory.entries()) {
        const choices = indices.filter(index => !state.matched.includes(index) && !state.open.includes(index));
        if (choices.length >= 2 || (state.open.length === 1 && state.cards[state.open[0]].pair === pair && choices.length)) return choices[0];
    }
    const hidden = state.cards.map((_, index) => index).filter(index => !state.matched.includes(index) && !state.open.includes(index));
    return hidden.length ? hidden[Math.floor(Math.random() * hidden.length)] : null;
}
