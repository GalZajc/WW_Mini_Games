// All construction, proof-budget and quality parameters live here.
export const MAX_BOARD_DIMENSION = 30;
export const MAX_BOARD_CELLS = 400;
export const GENERATOR_VERSION = 'certified-tail-splice-v2';

export const PATH_COVER_SETTINGS = Object.freeze({
    minimumPathCells: 3,
    intermediateMinimumCells: 2,
    smallBoardThreshold: 9,
    annealingTemperature: 0.35,
});
export const MAX_COLOR_COUNT = Math.floor(MAX_BOARD_CELLS / PATH_COVER_SETTINGS.minimumPathCells);

export const GENERATION_SETTINGS = Object.freeze({
    maximumProposals: 180,
    proofNodeLimit: 150,
    deeperProofNodeLimit: 600,
    minimumProposals: 12,
    mutationFraction: 1 / 8,
    straightPathFraction: 0.2,
    targetTurnFraction: 0.25,
    interiorEndpointFraction: 0.5,
    initialRepairPerCell: 80,
    initialProofNodeLimit: 2000,
    maximumMergeCandidates: 4,
    minimumMutationAttempts: 8,
});
export const CONSTRAINT_SOLVER_LIMITS = Object.freeze({ nodeLimit: 300_000 });
