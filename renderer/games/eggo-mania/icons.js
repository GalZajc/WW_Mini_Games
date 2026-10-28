// Original pictures, indexed in assets/item-icons.png. Geometry was checked
// against the source pixels; x points right and y points up as in the board.
// Icon 9 is the filler, confirmed by the native six-cell filling action.
// The hammer picture comes from the original help page, not the filler.
export const ITEM_ICONS=Object.freeze({filler:9,hammer:29,boots:19,cloud:14,bomb:27});
export const PIECE_ICONS=Object.freeze([
    [0,[[0,1],[1,1],[1,0],[2,0]]],
    [1,[[0,2],[0,1],[1,1],[1,0]]],
    [2,[[1,2],[0,1],[1,1],[0,0]]],
    [3,[[0,1],[1,1],[1,0]]],
    [4,[[0,0],[0,1],[0,2]]],
    [5,[[0,0],[1,0],[2,0],[0,1],[2,1]]],
    [6,[[0,0],[1,0],[2,0]]],
    [7,[[0,0],[1,0],[1,1],[0,2],[1,2]]],
    [8,[[1,0],[0,1],[1,1],[2,1],[1,2]]],
    [11,[[0,0],[2,0],[0,1],[1,1],[2,1]]],
    [13,[[0,0]]],
    [15,[[1,1],[2,1],[0,0],[1,0]]],
    [16,[[0,1],[1,1],[0,0]]],
    [18,[[1,1],[0,0],[1,0]]],
    [20,[[0,0],[0,1]]],
    [21,[[0,0],[1,0]]],
    [22,[[0,0],[1,0],[0,1],[0,2],[1,2]]],
    [24,[[0,1],[1,1],[1,2],[0,0]]],
    // This orientation is a recorded horizontal flip of original icon 18;
    // its source pixels were not independently observed in that orientation.
    [28,[[0,1],[0,0],[1,0]]],
]);
function signature(cells){
    const minX=Math.min(...cells.map(p=>p[0])),minY=Math.min(...cells.map(p=>p[1]));
    return cells.map(([x,y])=>`${x-minX},${y-minY}`).sort().join(';');
}
const lookup=new Map(PIECE_ICONS.map(([index,cells])=>[signature(cells),index]));
const cache=new WeakMap();
export function itemIcon(item){
    if(!item.cells)return ITEM_ICONS[item.item]??null;
    if(!cache.has(item.cells))cache.set(item.cells,lookup.get(signature(item.cells))??null);
    return cache.get(item.cells);
}
