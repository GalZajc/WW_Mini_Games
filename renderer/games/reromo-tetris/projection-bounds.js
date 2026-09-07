import { FRAME_INSET } from './rocking-viewport.js';

export function fitMobiusTemplate(template, board) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    const data = template.boundaryData;
    const include = (axis, value) => {
        bounds[axis] = Math.min(bounds[axis], value);
        bounds[axis + 2] = Math.max(bounds[axis + 2], value);
    };
    for (let offset = 0; offset < data.length; offset += template.boundaryStride) {
        const controls = offset + (template.subdivisions + 1) * 2;
        for (let segment = 0; segment < template.subdivisions; segment++) {
            for (let axis = 0; axis < 2; axis++) {
                const a = data[offset + segment * 2 + axis];
                const b = data[controls + segment * 2 + axis];
                const c = data[offset + (segment + 1) * 2 + axis];
                include(axis, a); include(axis, c);
                const denominator = a - 2 * b + c;
                const t = denominator === 0 ? -1 : (a - b) / denominator;
                if (t > 0 && t < 1) include(axis, (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c);
            }
        }
    }
    const width = board.width ?? board.size, height = board.height ?? board.size;
    const size = Math.min((width - 2 * FRAME_INSET) / (bounds[2] - bounds[0]), (height - 2 * FRAME_INSET) / (bounds[3] - bounds[1]));
    return { x: board.x + width / 2 - (bounds[0] + bounds[2]) / 2 * size,
        y: board.y + height / 2 - (bounds[1] + bounds[3]) / 2 * size, size };
}
