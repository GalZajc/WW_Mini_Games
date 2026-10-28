// Compatibility entry point for callers that specifically count full covers.
// The generator uses proveUniqueRouting instead, which also checks alternatives
// leaving cells unused and thus proves the stronger Numberlink property.
import { proveUniqueRouting, CONSTRAINT_SOLVER_LIMITS } from './constraint-solver.js';

export { proveUniqueRouting };

export function proveUniqueFullCoverPuzzle(rows, columns, paths, limits = {}) {
    return proveUniqueRouting(rows, columns, paths, {
        requireFullCover: true,
        nodeLimit: limits.nodeLimit ?? limits.searchNodeLimit ?? CONSTRAINT_SOLVER_LIMITS.nodeLimit,
    });
}
