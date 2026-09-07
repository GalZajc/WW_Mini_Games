// A detached stack can descend on the integer grid without ending the run.
// Bodies supported by the deck, or by another retained body, stay frozen.
export function findGridFallBodies(cells, rows, columns, physics) {
    const occupied = new Map(cells.map(c => [`${c.row},${c.column}`, c]));
    const candidates = new Set(cells.map(c => c.bodyId));
    const supported = new Map([...candidates].map(id => [id, new Set()]));
    const queue = [];
    const retain = id => { if (candidates.delete(id)) queue.push(id); };
    for (const cell of cells) {
        const below = occupied.get(`${cell.row + 1},${cell.column}`);
        const deck = cell.row + 1 >= rows && cell.column >= 0 && cell.column < columns;
        if (deck) retain(cell.bodyId);
        if (below && below.bodyId !== cell.bodyId) supported.get(below.bodyId).add(cell.bodyId);
        // Gameplay rule: a body without support underneath descends on the
        // integer grid. Side friction must not route that descent into the
        // rigid solver and turn a falling square into a wedged tilted body.
    }
    // Traverse each support edge once, rather than repeatedly scanning every
    // row of a tall stack until grounded support reaches its top.
    for (let head = 0; head < queue.length; head++) for (const id of supported.get(queue[head])) retain(id);
    return candidates;
}
