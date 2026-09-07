// World coordinates are grid cells relative to the neutral deck centre.
export const FRAME_INSET = 3;

export function createRockingViewport({ width, height, columns, rows, sag, frameWidth = 0, headroom = 0, leftWidth = 0, rightWidth = 220, margin = 8, gap = 6 }) {
    const span = Math.max(columns, Number(frameWidth) || columns);
    const base = { minX: -span / 2, maxX: span / 2, minY: -rows - Math.max(0, Number(headroom) || 0), maxY: sag };
    const availableWidth = Math.max(1, width - 2 * margin - leftWidth - rightWidth - gap);
    const availableHeight = Math.max(1, height - 2 * margin);
    const scale = Math.max(0.001, Math.min((availableWidth - 2 * FRAME_INSET) / span, (availableHeight - 2 * FRAME_INSET) / (sag - base.minY)));
    const originX = margin + leftWidth + (availableWidth - span * scale) / 2 - base.minX * scale;
    const originY = margin + (availableHeight - (sag - base.minY) * scale) / 2 - base.minY * scale;
    return { base, scale, originX, originY };
}

export function rockingFrame(viewport, scene) {
    const { base, scale, originX, originY } = viewport;
    const view = { minX: Math.min(base.minX, scene.minX), maxX: Math.max(base.maxX, scene.maxX), minY: Math.min(base.minY, scene.minY), maxY: Math.max(base.maxY, scene.maxY) };
    const x = originX + view.minX * scale - FRAME_INSET;
    const y = originY + view.minY * scale - FRAME_INSET;
    const width = (view.maxX - view.minX) * scale + 2 * FRAME_INSET;
    const height = (view.maxY - view.minY) * scale + 2 * FRAME_INSET;
    return { x, y, width, height, size: Math.max(width, height), view };
}
