// Exact Numberlink counter using edge domains, degree propagation and path
// components. No corner/self-touch heuristic is assumed by this verifier.
import { CONSTRAINT_SOLVER_LIMITS } from './parameters.js';
export { CONSTRAINT_SOLVER_LIMITS };

export function makeGridGraph(rows, columns) {
    const total = rows * columns;
    const ends = [];
    const incident = Array.from({ length: total }, () => []);
    const neighbors = Array.from({ length: total }, () => []);
    for (let cell = 0; cell < total; cell++) {
        const row = Math.floor(cell / columns);
        const column = cell % columns;
        for (const next of [column + 1 < columns ? cell + 1 : -1, row + 1 < rows ? cell + columns : -1]) {
            if (next < 0) continue;
            const edge = ends.length;
            ends.push([cell, next]);
            incident[cell].push(edge);
            incident[next].push(edge);
            neighbors[cell].push(next);
            neighbors[next].push(cell);
        }
    }
    return { total, ends, incident, neighbors };
}

function validateCover(graph, paths) {
    const terminals = new Int16Array(graph.total).fill(-1);
    const owner = new Int16Array(graph.total).fill(-1);
    const occupied = new Uint8Array(graph.total);
    const target = new Uint8Array(graph.ends.length).fill(1);
    const edgeByCells = new Map(graph.ends.map(([a, b], edge) => [a * graph.total + b, edge]));
    if (!Array.isArray(paths) || !paths.length) return null;
    for (let color = 0; color < paths.length; color++) {
        const path = paths[color];
        if (!Array.isArray(path) || path.length < 2) return null;
        for (let index = 0; index < path.length; index++) {
            const cell = path[index];
            if (!Number.isInteger(cell) || cell < 0 || cell >= graph.total || occupied[cell]) return null;
            occupied[cell] = 1;
            owner[cell] = color;
            if (index) {
                const previous = path[index - 1];
                const key = Math.min(previous, cell) * graph.total + Math.max(previous, cell);
                const edge = edgeByCells.get(key);
                if (edge === undefined) return null;
                target[edge] = 2;
            }
        }
        terminals[path[0]] = color;
        terminals[path.at(-1)] = color;
    }
    if (occupied.some(value => !value)) return null;
    return { terminals, target, owner };
}

/**
 * The known cover contributes one solution. Search exhaustively for a second
 * edge set. requireFullCover=false also admits unused nonterminal cells, so a
 * unique result proves the stronger property: the only routing of all pairs
 * is the given full cover. A node-limit result never certifies uniqueness.
 */
export function proveUniqueRouting(rows, columns, paths, options = {}) {
    if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1) {
        return { status: 'invalid', solutionCount: 0, nodes: 0 };
    }
    const graph = makeGridGraph(rows, columns);
    const validated = validateCover(graph, paths);
    if (!validated) return { status: 'invalid', solutionCount: 0, nodes: 0 };
    const { terminals, target, owner } = validated;
    const { total, ends, incident } = graph;
    const requireFullCover = options.requireFullCover === true;
    // Shortcut lemma: every routing can be shortened to induced paths. If the
    // known induced routing already uses ALL cells, shortening any different
    // routing cannot produce that known routing. Thus it suffices to search
    // induced alternatives even when unused cells are legal. This reduction
    // must NOT be applied when counting only full-cover alternatives.
    const inducedReduction = !requireFullCover && options.inducedReduction !== false;
    if (inducedReduction && ends.some(([a, b], edge) => owner[a] === owner[b] && target[edge] !== 2)) {
        return { status: 'multiple', solutionCount: 2, nodes: 0, reason: 'known-cover-has-a-shortcut' };
    }
    const nodeLimit = options.nodeLimit ?? CONSTRAINT_SOLVER_LIMITS.nodeLimit;
    let nodes = 0;
    let propagations = 0;
    let limited = false;
    let alternative = null;

    const propagate = state => {
        for (;;) {
            propagations++;
            let changed = false;
            const selected = new Uint8Array(total);
            const undecided = new Uint8Array(total);
            for (let edge = 0; edge < ends.length; edge++) {
                const [a, b] = ends[edge];
                if (state[edge] === 2) { selected[a]++; selected[b]++; }
                else if (state[edge] === 0) { undecided[a]++; undecided[b]++; }
            }
            for (let cell = 0; cell < total; cell++) {
                const degree = selected[cell];
                const free = undecided[cell];
                const endpoint = terminals[cell] !== -1;
                const required = endpoint ? 1 : 2;
                if (degree > required) return null;
                if (endpoint || requireFullCover || degree > 0) {
                    if (degree + free < required) return null;
                    if (free && (degree === required || degree + free === required)) {
                        const value = degree === required ? 1 : 2;
                        for (const edge of incident[cell]) {
                            if (state[edge] === 0) { state[edge] = value; changed = true; }
                        }
                    }
                } else if (free === 1) {
                    // Optional unused cell: degree one is forbidden.
                    for (const edge of incident[cell]) {
                        if (state[edge] === 0) { state[edge] = 1; changed = true; }
                    }
                }
            }
            if (changed) continue;

            const parent = Int16Array.from({ length: total }, (_, cell) => cell);
            const size = new Uint16Array(total).fill(1);
            const color = Int16Array.from(terminals);
            const terminalCount = Uint8Array.from(terminals, value => value < 0 ? 0 : 1);
            const find = cell => {
                while (parent[cell] !== cell) { parent[cell] = parent[parent[cell]]; cell = parent[cell]; }
                return cell;
            };
            for (let edge = 0; edge < ends.length; edge++) {
                if (state[edge] !== 2) continue;
                let a = find(ends[edge][0]);
                let b = find(ends[edge][1]);
                if (a === b) return null; // Selected cycle, never a path.
                if (color[a] >= 0 && color[b] >= 0 && color[a] !== color[b]) return null;
                if (terminalCount[a] + terminalCount[b] > 2) return null;
                if (size[a] < size[b]) [a, b] = [b, a];
                parent[b] = a;
                size[a] += size[b];
                if (color[a] < 0) color[a] = color[b];
                terminalCount[a] += terminalCount[b];
            }
            const root = Int16Array.from({ length: total }, (_, cell) => find(cell));
            const contacts = new Map();
            if (inducedReduction) {
                for (let edge = 0; edge < ends.length; edge++) {
                    const a = root[ends[edge][0]];
                    const b = root[ends[edge][1]];
                    if (a === b) {
                        if (state[edge] !== 2) return null;
                    } else {
                        const key = Math.min(a, b) * total + Math.max(a, b);
                        contacts.set(key, (contacts.get(key) || 0) + 1);
                    }
                }
            }
            for (let edge = 0; edge < ends.length; edge++) {
                if (state[edge] !== 0) continue;
                const a = root[ends[edge][0]];
                const b = root[ends[edge][1]];
                if (a === b || (color[a] >= 0 && color[b] >= 0 && color[a] !== color[b])
                    || terminalCount[a] === 2 || terminalCount[b] === 2
                    || (inducedReduction && contacts.get(Math.min(a, b) * total + Math.max(a, b)) > 1)) {
                    state[edge] = 1;
                    changed = true;
                }
            }
            if (changed) continue;

            // Each unfinished terminal component must still reach its mate
            // through unlabeled components. Foreign terminal paths are walls.
            const componentNeighbors = Array.from({ length: total }, () => []);
            for (let edge = 0; edge < ends.length; edge++) {
                if (state[edge] !== 0) continue;
                const a = root[ends[edge][0]];
                const b = root[ends[edge][1]];
                componentNeighbors[a].push(b);
                componentNeighbors[b].push(a);
            }
            const distances = [];
            let distanceSum = 0;
            const bfs = (start, pairColor) => {
                const distance = new Uint16Array(total).fill(65535);
                const queue = [start];
                distance[start] = 0;
                for (let index = 0; index < queue.length; index++) {
                    const component = queue[index];
                    for (const next of componentNeighbors[component]) {
                        if (distance[next] !== 65535 || (color[next] >= 0 && color[next] !== pairColor)) continue;
                        distance[next] = distance[component] + 1;
                        queue.push(next);
                    }
                }
                return distance;
            };
            for (let pairColor = 0; pairColor < paths.length; pairColor++) {
                const a = root[paths[pairColor][0]];
                const b = root[paths[pairColor].at(-1)];
                if (a === b) continue;
                const from = bfs(a, pairColor);
                if (from[b] === 65535) return null;
                const to = bfs(b, pairColor);
                distanceSum += from[b];
                distances.push({ from, to, distance: from[b] });
            }
            // Every routing of k pairs has at most N-k edges. Already selected
            // edges plus independent shortest connections give a safe lower
            // bound. An edge exceeding the remaining shared slack for EVERY
            // pair cannot occur in a solution.
            const selectedEdges = selected.reduce((sum, degree) => sum + degree, 0) / 2;
            const slack = total - paths.length - selectedEdges - distanceSum;
            if (slack < 0) return null;
            for (let edge = 0; edge < ends.length; edge++) {
                if (state[edge] !== 0) continue;
                const a = root[ends[edge][0]];
                const b = root[ends[edge][1]];
                let possible = false;
                for (const { from, to, distance } of distances) {
                    if (Math.min(from[a] + 1 + to[b], from[b] + 1 + to[a]) <= distance + slack) {
                        possible = true;
                        break;
                    }
                }
                if (!possible) { state[edge] = 1; changed = true; }
            }
            if (changed) continue;

            // A component with selected cells but no possible exit and no
            // terminals cannot belong to any terminal-to-terminal path.
            const possible = Array.from({ length: total }, () => []);
            for (let edge = 0; edge < ends.length; edge++) {
                if (state[edge] === 1) continue;
                const [a, b] = ends[edge];
                possible[a].push(b); possible[b].push(a);
            }
            const visited = new Uint8Array(total);
            for (let start = 0; start < total; start++) {
                if (visited[start] || (!requireFullCover && selected[start] === 0 && !possible[start].length)) continue;
                const queue = [start];
                visited[start] = 1;
                let hasTerminal = false;
                let hasSelected = false;
                for (let index = 0; index < queue.length; index++) {
                    const cell = queue[index];
                    hasTerminal ||= terminals[cell] !== -1;
                    hasSelected ||= selected[cell] > 0;
                    for (const next of possible[cell]) if (!visited[next]) { visited[next] = 1; queue.push(next); }
                }
                if (!hasTerminal && (requireFullCover || hasSelected)) return null;
                if (!hasTerminal) {
                    for (const cell of queue) for (const edge of incident[cell]) {
                        if (state[edge] === 0) { state[edge] = 1; changed = true; }
                    }
                }
            }
            if (changed) continue;
            return { selected, undecided, root, color, terminalCount };
        }
    };

    const visit = state => {
        if (alternative || limited) return;
        if (++nodes > nodeLimit) { limited = true; return; }
        const info = propagate(state);
        if (!info) return;
        let chosen = -1;
        let best = Infinity;
        for (let cell = 0; cell < total; cell++) {
            if (!info.undecided[cell]) continue;
            const required = terminals[cell] < 0 ? 2 : 1;
            const needed = required - info.selected[cell];
            const free = info.undecided[cell];
            let score = free * 8;
            if (info.selected[cell] > 0 || terminals[cell] >= 0) score -= 20;
            if (info.color[info.root[cell]] >= 0) score -= 4;
            score += needed === 1 ? 0 : 1;
            if (score >= best) continue;
            for (const edge of incident[cell]) {
                if (state[edge] === 0) { chosen = edge; best = score; break; }
            }
        }
        if (chosen < 0) {
            // Propagation enforces degrees and matching terminals, while
            // union rejects all cycles. This leaf is exactly a path matching.
            for (let edge = 0; edge < state.length; edge++) {
                if (state[edge] !== target[edge]) { alternative = state.slice(); return; }
            }
            return;
        }
        const other = target[chosen] === 2 ? 1 : 2;
        for (const value of [other, target[chosen]]) {
            const branch = state.slice();
            branch[chosen] = value;
            visit(branch);
            if (alternative || limited) break;
        }
    };

    visit(new Uint8Array(ends.length));
    return {
        status: alternative ? 'multiple' : limited ? 'unknown' : 'unique',
        solutionCount: alternative ? 2 : 1,
        nodes,
        propagations,
        requireFullCover,
        inducedReduction,
        alternativeEdges: alternative ? ends.filter((_, edge) => alternative[edge] === 2) : null,
        reason: limited ? 'constraint-search-limit' : null,
    };
}
