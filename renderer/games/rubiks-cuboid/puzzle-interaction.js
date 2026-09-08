export const PUZZLE_PRESENTATION = Object.freeze({
    dragLockPixels: 6,
    ambiguousDirectionRadians: 3 * Math.PI / 180,
    whiteLightIntensity: Math.PI,
    sliceChoiceColors: Object.freeze([0xffd45c, 0x286aaf, 0x78529c]),
    sliceGlowColors: Object.freeze([0xffc94d, 0x53caff, 0xd399ff]),
    sliceGlowStyle: 'dark',
    sliceDarkness: 80,
    sliceTintOpacity: 1,
    sliceBorderFraction: 0.18,
    sliceHaloWidth: 0.08,
    sliceHaloOpacities: Object.freeze([0.85, 0.6, 0.35, 0.15]),
    torusHueOffset: 0,
    torusSaturation: 85,
    torusLightnessMin: 18,
    torusLightnessMax: 82,
});

// Shared by 3D views, unfolded nets and every puzzle mode. Ignore initial
// pointer jitter, then keep the exact same slice until the button is released.
export function chooseDragSlice(candidates, dx, dy, locked = null) {
    if (locked) return locked;
    return dragSliceChoices(candidates, dx, dy)[0] || null;
}

export function dragSliceChoices(candidates, dx, dy) {
    const distance = Math.hypot(dx, dy);
    if (distance < PUZZLE_PRESENTATION.dragLockPixels) return [];
    const ranked = candidates.map(candidate => {
        const x = candidate.direction.x ?? candidate.direction[0];
        const y = candidate.direction.y ?? candidate.direction[1];
        const cosine = Math.abs((dx * x + dy * y) / (distance * Math.hypot(x, y)));
        return { candidate, angle: Math.acos(Math.min(1, cosine)) };
    }).filter(entry => Number.isFinite(entry.angle)).sort((a, b) => a.angle - b.angle);
    if (!ranked.length) return [];
    const bestAngle = ranked[0].angle;
    const crossing = ranked.filter(entry => entry.candidate.changesFace
        && entry.angle <= bestAngle + PUZZLE_PRESENTATION.ambiguousDirectionRadians);
    const choices = [];
    for (const { candidate } of crossing.length ? crossing : [ranked[0]]) {
        // Opposite axis names can describe the SAME physical slab and its
        // inverse turn. They must not produce two identical choice boxes.
        const duplicate = choices.some(other => candidate.move && other.move
            && Math.abs(candidate.move.axis.dot(other.move.axis)) > 1 - 1e-6
            && candidate.move.selected.length === other.move.selected.length
            && candidate.move.selected.every(slot => other.move.selectedSet.has(slot)));
        if (!duplicate) choices.push(candidate);
    }
    return choices;
}
