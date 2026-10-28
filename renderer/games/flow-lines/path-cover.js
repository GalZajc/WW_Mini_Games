import { makeGridGraph } from './constraint-solver.js';
import { PATH_COVER_SETTINGS } from './parameters.js';
export { PATH_COVER_SETTINGS };

function chordCount(path, neighbors, positions) {
    positions.fill(-1);
    for (let index = 0; index < path.length; index++) positions[path[index]] = index;
    let count = 0;
    for (let index = 0; index < path.length; index++) {
        for (const next of neighbors[path[index]]) if (positions[next] > index + 1) count++;
    }
    return count;
}

function snake(rows, columns, vertical) {
    const result = [];
    const outer = vertical ? columns : rows;
    const inner = vertical ? rows : columns;
    for (let line = 0; line < outer; line++) for (let offset = 0; offset < inner; offset++) {
        const position = line % 2 ? inner - offset - 1 : offset;
        result.push(vertical ? position * columns + line : line * columns + position);
    }
    return result;
}

function initialPaths(rows, columns, count, random) {
    const minimum = rows * columns < PATH_COVER_SETTINGS.smallBoardThreshold
        ? PATH_COVER_SETTINGS.intermediateMinimumCells : PATH_COVER_SETTINGS.minimumPathCells;
    const orientations = [false, true].filter(vertical => {
        const stripes = vertical ? columns : rows;
        const length = vertical ? rows : columns;
        return stripes <= count && stripes * Math.floor(length / minimum) >= count;
    });
    if (orientations.length) {
        const vertical = orientations[Math.floor(random() * orientations.length)];
        const paths = Array.from({ length: vertical ? columns : rows }, (_, stripe) =>
            Array.from({ length: vertical ? rows : columns }, (_, index) =>
                vertical ? index * columns + stripe : stripe * columns + index));
        while (paths.length < count) {
            const choices = paths.map((path, index) => path.length >= minimum * 2 ? index : -1).filter(index => index >= 0);
            const selected = choices[Math.floor(random() * choices.length)];
            const path = paths[selected];
            const cut = minimum + Math.floor(random() * (path.length - minimum * 2 + 1));
            paths.splice(selected, 1, path.slice(0, cut), path.slice(cut));
        }
        return paths;
    }
    const route = snake(rows, columns, random() < 0.5);
    const paths = [];
    let cursor = 0;
    for (let index = 0; index < count; index++) {
        const length = Math.floor((route.length - cursor) / (count - index));
        paths.push(route.slice(cursor, cursor + length));
        cursor += length;
    }
    return paths;
}

/** Markov tail splices preserve the path count and cover every cell exactly
 * once. Once chord-free, all later accepted states remain chord-free. A chord
 * would give an immediate shortcut, contradicting strict unique routing. */
export class PathCoverChain {
    constructor(rows, columns, count, random) {
        this.rows = rows;
        this.columns = columns;
        this.random = random;
        this.graph = makeGridGraph(rows, columns);
        this.paths = initialPaths(rows, columns, count, random);
        this.owner = new Int16Array(rows * columns);
        this.positions = new Int16Array(rows * columns);
        this.chords = this.paths.map(path => chordCount(path, this.graph.neighbors, this.positions));
        this.totalChords = this.chords.reduce((sum, count) => sum + count, 0);
        this.accepted = 0;
        for (let color = 0; color < count; color++) for (const cell of this.paths[color]) this.owner[cell] = color;
    }

    snapshot() {
        return this.paths.map(path => [...path]);
    }

    restore(paths) {
        this.paths = paths.map(path => [...path]);
        this.owner.fill(-1);
        this.chords = this.paths.map(path => chordCount(path, this.graph.neighbors, this.positions));
        this.totalChords = this.chords.reduce((sum, count) => sum + count, 0);
        for (let color = 0; color < this.paths.length; color++) for (const cell of this.paths[color]) this.owner[cell] = color;
    }

    mergeCandidates() {
        const candidates = [];
        for (let a = 0; a < this.paths.length; a++) for (let b = a + 1; b < this.paths.length; b++) {
            for (const reverseA of [false, true]) for (const reverseB of [false, true]) {
                const first = reverseA ? [...this.paths[a]].reverse() : this.paths[a];
                const second = reverseB ? [...this.paths[b]].reverse() : this.paths[b];
                if (!this.graph.neighbors[first.at(-1)].includes(second[0])) continue;
                const merged = first.concat(second);
                if (chordCount(merged, this.graph.neighbors, this.positions)) continue;
                const next = this.paths.filter((_, index) => index !== a && index !== b);
                next.push(merged);
                candidates.push(next);
            }
        }
        return candidates;
    }

    mix(attempts) {
        const { paths, owner, random, graph, positions } = this;
        // Intermediate certified covers may briefly contain a two-cell path;
        // this lets tightly packed covers exchange space. The generator only
        // returns covers satisfying its final minimum-length quality rule.
        const minimum = graph.total <= PATH_COVER_SETTINGS.smallBoardThreshold
            ? PATH_COVER_SETTINGS.intermediateMinimumCells : PATH_COVER_SETTINGS.minimumPathCells;
        for (let attempt = 0; attempt < attempts; attempt++) {
            const a = Math.floor(random() * paths.length);
            const originalA = paths[a];
            const reverse = random() < 0.5;
            const endpoint = reverse ? originalA[0] : originalA.at(-1);
            const choices = graph.neighbors[endpoint];
            const touching = choices[Math.floor(random() * choices.length)];
            const b = owner[touching];
            if (a === b) continue;
            const originalB = paths[b];
            const cut = originalB.indexOf(touching);
            const takeSuffix = random() < 0.5;
            const branch = takeSuffix ? originalB.slice(cut) : originalB.slice(0, cut + 1).reverse();
            const nextB = takeSuffix ? originalB.slice(0, cut) : originalB.slice(cut + 1);
            if (nextB.length < minimum) continue;
            const nextA = (reverse ? [...originalA].reverse() : originalA).concat(branch);
            const nextAChords = chordCount(nextA, graph.neighbors, positions);
            const nextBChords = chordCount(nextB, graph.neighbors, positions);
            const delta = nextAChords + nextBChords - this.chords[a] - this.chords[b];
            const temperature = this.totalChords ? PATH_COVER_SETTINGS.annealingTemperature : 0;
            if (delta > 0 && (!temperature || random() >= Math.exp(-delta / temperature))) continue;
            paths[a] = nextA;
            paths[b] = nextB;
            for (const cell of branch) owner[cell] = a;
            this.totalChords += delta;
            this.chords[a] = nextAChords;
            this.chords[b] = nextBChords;
            this.accepted++;
        }
    }

    quality() {
        let turns = 0;
        let straightPaths = 0;
        let interiorEndpoints = 0;
        let minimumLength = Infinity;
        let maximumLength = 0;
        for (const path of this.paths) {
            let pathTurns = 0;
            for (let index = 2; index < path.length; index++) {
                if (path[index] - path[index - 1] !== path[index - 1] - path[index - 2]) pathTurns++;
            }
            turns += pathTurns;
            if (!pathTurns) straightPaths++;
            minimumLength = Math.min(minimumLength, path.length);
            maximumLength = Math.max(maximumLength, path.length);
            for (const cell of [path[0], path.at(-1)]) {
                const row = Math.floor(cell / this.columns);
                const column = cell % this.columns;
                if (row > 0 && row < this.rows - 1 && column > 0 && column < this.columns - 1) interiorEndpoints++;
            }
        }
        return { turns, straightPaths, interiorEndpoints, minimumLength, maximumLength, chords: this.totalChords };
    }
}
