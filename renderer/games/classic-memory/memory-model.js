function mulberry32(seed) {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let result = value;
        result = Math.imul(result ^ result >>> 15, result | 1);
        result ^= result + Math.imul(result ^ result >>> 7, result | 61);
        return ((result ^ result >>> 14) >>> 0) / 4294967296;
    };
}

function shuffle(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
}

export function selectMemoryItems(catalog, category, pairCount, seed) {
    const random = mulberry32(seed ^ 0xA57E10);
    const filtered = category && category !== 'mixed'
        ? catalog.filter(item => item.category === category)
        : [...catalog];
    const source = filtered.length ? filtered : [...catalog];
    const requested = Number(pairCount);
    const count = Math.max(1, Math.min(source.length, Number.isFinite(requested) ? Math.round(requested) : 10));
    return shuffle(source, random).slice(0, count);
}

export function createPictureMemory(catalog, settings = {}, seed = Date.now()) {
    seed = Number(seed) >>> 0;
    const chosen = selectMemoryItems(catalog, settings.category || 'mixed', settings.pairCount, seed);
    const random = mulberry32(seed ^ 0x51F15E);
    const cards = shuffle(chosen.flatMap(item => [0, 1].map(copy => ({
        id: `${item.id}-${copy}`,
        pairId: item.id,
        catalogId: item.id,
    }))), random);
    return {
        mode: 'picture-memory', seed, cards, player: 1, scores: [0, 0, 0],
        open: [], matched: [], phase: 'pick', winner: null, moves: 0,
        lastEvent: `Find ${chosen.length} picture pairs.`,
    };
}

export function flipPictureMemory(state, index) {
    index = Number(index);
    if (state.winner !== null || state.phase !== 'pick' || !Number.isInteger(index)
        || index < 0 || index >= state.cards.length || state.open.includes(index) || state.matched.includes(index)) return false;
    state.open.push(index);
    state.lastEvent = state.open.length === 1 ? 'Select a second card.' : 'Checking pair…';
    if (state.open.length === 2) { state.phase = 'resolve'; state.moves++; }
    return true;
}

export function resolvePictureMemory(state) {
    if (state.phase !== 'resolve' || state.open.length !== 2 || state.winner !== null) return false;
    const [first, second] = state.open;
    if (state.cards[first].pairId === state.cards[second].pairId) {
        state.matched.push(first, second);
        state.scores[state.player]++;
        state.lastEvent = `Player ${state.player} found a match!`;
    } else {
        state.player = 3 - state.player;
        state.lastEvent = `No match. Player ${state.player}'s turn.`;
    }
    state.open = [];
    state.phase = 'pick';
    if (state.matched.length === state.cards.length) {
        state.winner = state.scores[1] === state.scores[2] ? 0 : (state.scores[1] > state.scores[2] ? 1 : 2);
        state.lastEvent = state.winner ? `Player ${state.winner} wins!` : 'All pairs matched. Draw!';
    }
    return true;
}

export function rememberOpenPictureCards(state, knowledge) {
    for (const index of state.open) {
        const pairId = state.cards[index].pairId;
        if (!knowledge.has(pairId)) knowledge.set(pairId, []);
        if (!knowledge.get(pairId).includes(index)) knowledge.get(pairId).push(index);
    }
    for (const [pairId, indices] of knowledge) {
        const active = indices.filter(index => !state.matched.includes(index));
        if (active.length) knowledge.set(pairId, active); else knowledge.delete(pairId);
    }
}

export function choosePictureMemoryCard(state, knowledge) {
    const available = state.cards.map((_, index) => index)
        .filter(index => !state.matched.includes(index) && !state.open.includes(index));
    if (!available.length) return null;
    if (state.open.length === 1) {
        const pairId = state.cards[state.open[0]].pairId;
        const knownMate = (knowledge.get(pairId) || []).find(index => available.includes(index));
        if (knownMate !== undefined) return knownMate;
    } else {
        for (const indices of knowledge.values()) {
            const pair = indices.filter(index => available.includes(index));
            if (pair.length >= 2) return pair[0];
        }
    }
    return available[Math.floor((state.seed + state.moves * 17 + state.open.length * 31) % available.length)];
}

export function layoutPictureMemoryCards(count, width, height, options = {}) {
    count = Math.max(1, Math.round(count));
    const scatter = options.scatter !== false;
    const maxRotation = scatter ? Math.max(0, Number(options.maxRotation) || 0) * Math.PI / 180 : 0;
    const seed = Number(options.seed) >>> 0, random = mulberry32(seed ^ count ^ Math.round(width * 13 + height * 7));
    const bounds = {
        x: Math.max(18, Number(options.x) || 18),
        y: Math.max(64, Number(options.y) || 70),
        w: Math.max(120, width - Math.max(36, Number(options.horizontalMargin) || 36)),
        h: Math.max(120, height - Math.max(100, Number(options.verticalMargin) || 112)),
    };
    const aspect = bounds.w / bounds.h;
    const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
    const rows = Math.ceil(count / columns);
    const cellW = bounds.w / columns, cellH = bounds.h / rows;
    const worstFactor = Math.cos(maxRotation) + Math.sin(maxRotation);
    // The rotated axis-aligned bounding box fits entirely inside one grid cell.
    // Cells are disjoint, so this remains overlap-free even on tiny canvases.
    const side = Math.max(4, Math.min(cellW, cellH) * (scatter ? .78 : .88) / Math.max(1, worstFactor));
    const cells = shuffle(Array.from({ length: rows * columns }, (_, index) => index), random).slice(0, count);

    return cells.map(cellIndex => {
        const row = Math.floor(cellIndex / columns), column = cellIndex % columns;
        const angle = scatter ? (random() * 2 - 1) * maxRotation : 0;
        const scale = scatter ? .9 + random() * .1 : 1;
        const size = side * scale;
        const factor = Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle));
        const halfBounds = size * factor / 2;
        const slackX = Math.max(0, cellW / 2 - halfBounds - 2);
        const slackY = Math.max(0, cellH / 2 - halfBounds - 2);
        const centerX = bounds.x + (column + .5) * cellW + (scatter ? (random() * 2 - 1) * slackX * .94 : 0);
        const centerY = bounds.y + (row + .5) * cellH + (scatter ? (random() * 2 - 1) * slackY * .94 : 0);
        return { x: centerX, y: centerY, w: size, h: size, angle, cell: cellIndex };
    });
}

export function pictureMemoryCardsOverlap(left, right, padding = 0) {
    const axes = [left.angle, left.angle + Math.PI / 2, right.angle, right.angle + Math.PI / 2]
        .map(angle => ({ x: Math.cos(angle), y: Math.sin(angle) }));
    const corners = card => {
        const c = Math.cos(card.angle), s = Math.sin(card.angle), hw = card.w / 2 + padding, hh = card.h / 2 + padding;
        return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({
            x: card.x + x * c - y * s,
            y: card.y + x * s + y * c,
        }));
    };
    const a = corners(left), b = corners(right);
    return axes.every(axis => {
        const project = points => points.map(point => point.x * axis.x + point.y * axis.y);
        const pa = project(a), pb = project(b);
        return Math.max(...pa) >= Math.min(...pb) && Math.max(...pb) >= Math.min(...pa);
    });
}
