export const TETRIS_MODES = Object.freeze(['rectangular', 'circular', 'mobius', 'structural', 'rocking', 'rocking-pressure']);
export function formatSprintTime(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const centiseconds = Math.floor(Math.max(0, seconds) * 100);
    return `${Math.floor(centiseconds / 6000)}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}
export const ROCKING_MODES = Object.freeze(['rocking', 'rocking-pressure']);
export const STRUCTURAL_MODES = Object.freeze(['structural', ...ROCKING_MODES]);
export const isRockingMode = mode => ROCKING_MODES.includes(mode);
export const isStructuralMode = mode => STRUCTURAL_MODES.includes(mode);
export const isCartesianMode = mode => mode === 'rectangular' || isStructuralMode(mode);
