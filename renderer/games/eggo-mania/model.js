// Distances: tile widths; time: seconds. Reference-backed values and tunable
// estimates are kept together. See REFERENCE.md for source evidence and limits.
import {NATIVE_SINE} from './assets/native-sine.js';
import {NATIVE_SOUND_EVENTS as SFX,NATIVE_SOUND_WARNING,NATIVE_SOUND_EVENT_PHASE,NATIVE_SOUND_PHASE,NATIVE_ENEMY_SPAWN_SOUND,NATIVE_ENEMY_STEAL_SOUND} from './native-sound-events.js';
import {NATIVE_ITEMS} from './assets/native-items.js';
import {NATIVE_ROUNDS} from './assets/native-rounds.js';
import {NATIVE_PIECE_MASKS} from './assets/native-piece-masks.js';
import {CHARACTER_ART} from './assets/characters.js';
import {nativePreview,planNativePiece,nativeHeldRotation,CPU_PARAMETERS} from './native-cpu.js';
import {advanceNativeHazardCenters} from './native-hazards.js';
import {NATIVE_WATER,beginNativeWaterRecovery,advanceNativeWaterCreature,advanceNativeWaterActor,splash as emitNativeWaterSplash} from './native-water.js';
import {NATIVE_RESCUE,nativeRescueBoat,advanceNativeRescueBody} from './native-rescue.js';
import {NATIVE_PREVIEW_TURN_8_8,nativePreviewTurnMatrix,nativePreviewOamYShift} from './native-affine.js';
import {createNativeLoadingWork,recordNativeLoadingPickup} from './native-loading.js';
export const DEFAULTS = Object.freeze({
    mode: 'survival', difficulty: 'hard', character: 'eggo', columns: 7, goal: 37,
    waterSpeed: 0, crateInterval: 1.1, aiDelay: 0, hazards: true, seed: 0,
});
// Native arena IDs are beanstalk=0, factory=1, ... park=7. After the
// initial random selection the original advances the arena ID modulo eight.
export const SURVIVAL_STAGES = Object.freeze(['factory','dragon','castle','pirate','space','jungle','park','beanstalk']);
export function survivalStage(round,startingStage=0) {
    return SURVIVAL_STAGES[(round-1+startingStage)%SURVIVAL_STAGES.length];
}
// ROM 0x08009338..0x08009376: native 16-bit random step. First draw modulo
// eight selects the arena (0x080016b4..0x080016d4). The ROM has two field
// stream helpers: 0x08009380 advances 0x02011ab0 and 0x080093a4 advances
// 0x02011ab4. Pickups and randomized hazards use the corresponding field's
// stream; randomFrom below is reserved for non-native AI planning/fallbacks.
export function nativeRandomStep(seed){
    const product=(seed&0xffff)*75,high=product>>>16,low=product&0xffff;
    return (product-high-(high<=low?1:0))&0xffff;
}
export function advanceNativeRandom(seed,draws){
    let state=seed&0xffff;
    for(let i=0;i<draws;i++)state=nativeRandomStep(state);
    return state;
}
export function startingStageFromSeed(seed){
    return (nativeRandomStep(seed)%8+7)%8;
}
export const RULES = Object.freeze({
    // Reference frame deltas: walk 2 px; jump starts at 3.5 px after the
    // first gravity step; gravity is 0.1 / 0.2 / 0.35 px per frame².
    step: 1 / 60, presentationTickPhase:0.5, speed: 7.5, gravity: 45, jump: 13.5, startOffset:0.5,
    nativePostThrowFreezeTicks:1,
    completionStarDuration:29,
    // Native affine coefficients and per-frame OAM origins are captured in
    // native-affine.js; only non-turn preview tracking uses this blend.
    previewRotationFrames:NATIVE_PREVIEW_TURN_8_8.length,
    // ROM 0x0800cc04: signed 16.16 tracking, quarter of the error until
    // within two pixels, then the exact target. Screen OAM truncates later.
    previewPositionSnapPixels:2,previewPositionBlendShift:2,previewAngleSnap:0x38e38e,
    previewPositionWorldYReference:744,previewPositionOriginBias:8,
    floatGravity: 0.5, fastGravity: 1.75, throwArc: 4, throwTime: 28 / 60,
    // Actor state four: half-tick counter / fourteen, using the ROM's
    // reciprocal lookup and sine table rather than a fitted parabola.
    throwTicks:28,throwReciprocal:4681,throwHalfTurn:2048,
    throwLandingSpeed:13.125,throwActorXBias:1.5,
    // Native collision edge zones are 3/12 px. Support samples the 32px sprite;
    // horizontal probes use the native actor body and test Y-6px before the
    // 16px cell lookup (ROM 0x0800386c/0x080038e0).
    nativeActorEdgeOffsetPixels:32,
    nativeSupportEdgeLow:3,nativeSupportEdgeHigh:12,nativeSupportContactPixels:6,
    // ROM directional collision: edge point X±7, map Y-6, then the adjacent
    // tile selected from the actor's within-cell X phase (0x0800386c/e0).
    nativeActorWallSideProbePixels:7,nativeActorWallProbeOffsetPixels:6,
    nativeActorWallMapColumnBias:1,nativeActorWallMapRowBias:2,
    nativeActorWallNeighborPhasePixels:32,nativeActorWallNeighborThreshold:4,
    nativeActorLeftEdgeGuard:-12,nativeActorRightEdgeGuardExclusive:0x59,
    nativeActorMapColumns:7,nativeActorMapRows:47,nativeActorMapBottomRow:46,
    nativeActorNegativeMapProbeLimit:16,
    // This inner body sample is distinct from the sprite-sized support probe.
    nativeActorWallSampleBiasPixels:11,
    actorWallRowBias:1/16,
    // Native descent caps in px/frame: normal 3.5, Up 1.75, Down 5.5;
    // boots change normal to 5 and Down to 6, retaining the same Up cap.
    fallSpeed:13.125,floatFallSpeed:6.5625,fastFallSpeed:20.625,
    boostFallSpeed:18.75,boostFastFallSpeed:22.5,
    // 147 native frames: 59/60 px per frame, constant horizontal center.
    crateSpeed: 59 / 16, catchRadius: 0.8, spawnHeight: 10,
    // ROM 0x0800b9fc: signed 16.16 gravity, drag and edge reflection.
    pickupFixedScale:65536,pickupGravity:0x400/65536,pickupDrag:0xfc00,
    pickupRightEdge:95,pickupWaterEntry:8,pickupWaterTurn:12,
    pickupWaterGravity:0x2000/65536,pickupWaterBuoyancy:0x4000/65536,
    pickupWaterHorizontal:0x400/65536,pickupWaterMidpoint:47,pickupWaterDrag:0xf800,
    pickupExitLeft:-16,pickupExitRight:127,pickupCenterBias:8,pickupActorBias:24,
    stolenPickupX:8,stolenPickupY:16,stolenPickupVelocity:-2,
    discardPickupX:8,discardPickupY:24,discardPickupVelocity:4,discardPickupWait:30,
    pickupCatchDistance:12,pickupCatchBias:8,
    pickupSparklePeriod:32,nativeParticleCapacity:14,nativeParticleInset:4,
    nativeParticleView:Object.freeze({cameraReference:640,fieldPitch:128,width:240,height:160,top:-7}),
    pickupWeights:Object.freeze([5,6,6,6,6,5,5,5,1,2,2,1,1]),
    pickupMaterials:Object.freeze([2,0,1,0,0,1,0,2]),
    pickupToolKinds:Object.freeze(['bomb','boots','filler','hammer','cloud']),
    pickupConfigOffsets:Object.freeze([0x1c,0x30,0x38,0x2c,0x34,0x24,0x28,0x20,0x10,8,0xc,0x14,0x18]),
    survivalHardDifficulty:2,survivalTierRounds:8,survivalRandomClockMinimum:10,survivalHeightBase:47,
    // A native round setup makes two global RNG calls before copying the
    // resulting state into both field-local streams (call sites 0x0800194c
    // and 0x08002222). Later rounds then draw difficulty and level globally.
    nativeRoundSetupRngDraws:2,
    pickupRestrictedKinds:Object.freeze([8,11]),pickupRestrictedUntil:1500,
    pickupSpawnX:54,pickupSpawnY:48,pickupSpawnVY:-1,pickupVXCenter:32767,
    pickupClockMinimum:64,pickupClockMask:127,pickupClockMultiplier:8,pickupClockDivisor:9,
    // ROM 0x08018c38 performs two 320-update passes per round; each pass
    // advances both field managers and makes 642 shared-RNG calls total.
    pickupPrefillSteps:320,pickupInitializationPasses:2,
    pickupGlobalRngCallsPerPass:642,pickupPoolSize:18,
    pickupSwayFrequency:0x444444,pickupSwayAmplitude:0x1555555,
    // All eight families observed in native Hard pickups/previews. The first
    // four legacy prototype shapes have no supporting GBA capture.
    shapePool:Object.freeze([4,5,6,7,8,9,10,11]),
    diveTicks:9, diveVelocity:-60/16, actorFixedScale:65536,
    drownTime: 2.5, erosionTime: 0.65,
    // Measured from Survival/Hard's first-stage L-button dive (60 Hz).
    // Water motion is a damped approach to a terminal velocity, changing
    // direction below the waterline; the water creature ejects the player.
    waterEntryOffset: 0.25, waterTurnDepth: 1, waterDrag: 15 / 16,
    waterSinkVelocity: -56.25, waterRiseVelocity: 28.125,
    waterEntryAcceleration: 22.5, waterRecoveryTime: 48 / 60,
    waterEjectVelocity: 20.7, waterEjectLift: 6.75 / 16,
    waterEjectGravity: 18,
    hazardInterval: 15, birdSpeed: 5, itemChance: 0.16,
    // Input-only boots captures: automatic pickup, 600-frame timer,
    // 5.1px initial jump, 2.25px walk, gravity .1/.3/.5px per frame².
    powerTime: 10, jumpBoost: 17 / 12, speedBoost: 9 / 8,
    bootsSparklePeriod:4,bootsSparkleY:28,
    boostGravity:67.5,boostFloatGravity:1 / 3,boostFastGravity:5 / 3,
    stunTime: 0.8,
    // Naturally caught bomb: counter 250 at pickup, zero at frame 250;
    // the native burst begins on frame 251 (input-only replay).
    bombFuse: 250 / 60, projectileCatchTicks:250, attackTravel: 0.65, fillerCells: 6,
    // Original per-cell filler graphics transitions, measured in all eight
    // arenas and an independent ordinary-input CPU filler capture.
    fillerAnimationCapacity:6,
    fillerAnimationTimers:Object.freeze([25,29,33,37,41,45]),fillerAnimationGrowTimer:20,
    fillerGrowTicks:Object.freeze([4,8,12,16,20,25]),
    fillerFinishTicks:Object.freeze([24,29,34,39,44,49]),
    fillerColumnBias:1/16,
    fillerFootPixels:26,fillerFloatTicks:22,fillerHopSpeed:13.125,
    // Native bomb launch: 4 px/frame upward until the target height, then
    // 2 px/frame horizontally with 0.125 px/frame² downward acceleration.
    bombLaunchSpeed:15,bombFlightSpeed:7.5,bombFlightGravity:28.125,
    bombLaunchOffset:0.5,bombFieldGap:1,bombSize:1,bombRestitution:0.5,
    bombNativeHeightBias:2,bombNativeGravityQ16:0x2000,
    bombNativeContactQ16:0x2666,bombNativeFallLimitQ16:0x40000,
    // Actor coordinates describe an anchor 32 px above the board floor;
    // projectile coordinates describe its top-left corner. Keep that offset
    // when converting the native launch to the board's upward tile system.
    projectileActorLift:2,projectilePixels:16,hammerHitRadius:14/16,hammerHitLift:1,
    // Whole-piece removal is native-backed; footprint and knockback radius
    // remain provisional until several independent blast positions agree.
    bombBlastCells:1,bombKnockRadius:2.5,bombNativeCatchRadius:14,nativeBlastRadius:2,nativeBlastTicks:25,nativeBlastFrameTicks:5,
    // Native zero-fuse visual probe: eight particles, visible frames 2..25.
    bombEffectTime:25/60,bombHeldEffectLift:1,
    // ROM-backed cloud: three ten-frame pulses, aligned with its user's column.
    cloudTicks:287,cloudHeight:3.5,cloudHitLift:2,cloudRadius:20/16,
    cloudPulsePeriod:64,cloudPulseLast:9,cloudPulseMin:33,cloudPulseMax:221,
    cloudColumnBias:1/16,cloudScaleGrowEnd:222,cloudScaleGrowSteps:64,cloudScaleShrinkSteps:32,
    nativeActorFloor:720,nativeBoardFloor:752,defaultWaterDepth:2,survivalWaterlineHeightBias:8,
    nativeRescueReadyFrame:350,
    nativeWaterStartMinimum:1100,nativeWaterStartBase:1900,nativeWaterStartRate:40,
    nativeWaterRateWord:15,nativeWaterRiseBaseRaw:0x8000,nativeWaterRiseWordRaw:0x2000,
    nativeWaterFixedScale:65536,nativeWaterStepShift:6,
    nativeInitialBoardRows:47,nativeInitialBoardColumns:7,nativeInitialBoardLastRow:46,
    nativeInitialBoardOpponentWeight:8,nativeInitialBoardOpponentCount:2,nativeInitialBoardOffset:24,
    nativeInitialBoardColumnBias:6,nativeInitialBoardFirstOwner:3,nativeInitialBoardKinds:Object.freeze({one:2,two:4,three:1}),
    bubbleInitialWait:1480,nativeEnemyInitialWait:{primary:1800,secondary:1200,difficultyStep:64},enemyIntroPausedSteps:Object.freeze({factory:14,beanstalk:13,jungle:13,space:13,dragon:13,castle:13,pirate:13,park:13}),bubbleLife:360,bubbleReleaseLife:16,
    bubbleRestBase:1400,bubbleDifficultyStep:50,bubbleHardDifficulty:5,
    bubbleStartVelocity:-1,bubbleVelocityNoise:0.25,bubbleXNoiseCenter:1.5,bubbleYNoiseCenter:2,
    bubbleHorizontalSpeed:1,bubbleVerticalSpeed:1.5,bubbleFadeAcceleration:0.5,
    bubbleSpawnBelowWater:24,bubbleWaterlineBias:8,bubbleCeiling:192,
    bubbleLeftBoundary:0,bubbleRightBoundary:64,bubbleStartMask:31,bubbleStartScale:2,
    bubbleHitRadius:16,bubbleActorAnchor:16,bubbleSpriteCenter:32,
    bubbleEscapeFrames:10,bubbleEscapeReduction:2,bubbleAnimationFrames:5,bubbleFrames:4,bubbleBurstFrameTicks:8,
    // ROM enemies 14 (beanstalk) and 4 (jungle): alternating short/long jumps. Exact 16.16
    // constants avoid accumulating rounding drift across the complete arc.
    jumperGravity:0x1999/65536,jumperShortVelocity:-0x2e666/65536,
    jumperLongVelocity:-0x66666/65536,jumperSpawnBias:4,jumperSpriteBias:16,
    jumperLeftBoundary:-8,jumperRightBoundary:82,jumperSpawnDepth:24,
    jumperFinishDepth:10,jumperShortRest:90,jumperRestBase:1300,
    jumperDifficultyStep:50,jumperAnimationFrames:5,jumperFrames:8,
    jumperHitX:16,jumperHitY:40,jumperHitRadius:16,
    jumperType:14,jungleType:4,jungleSpriteBias:0,jungleHitX:2,jungleHitY:0,
    jungleBiteFrames:20,jungleSpriteWidth:32,
    // Type 7 is stationary, with two 91-frame animation cycles per visit.
    spaceLife:182,spaceSpawnDepth:-80,spaceSpawnX:48,spacePrimaryHeightGate:120,
    spaceAnimationFrames:7,spaceFrames:13,spaceRestBase:1400,spaceDifficultyStep:50,
    spaceHitFirst:4,spaceHitLast:7,spaceHitRadius:26,spaceHitAnchor:16,
    spaceHitOffsets:Object.freeze([33,30,30,30,27,0,0,0,10,20,30,30,30]),
    spaceHitFlash:25/60,spaceSpriteSize:64,
    spaceSecondaryInitialWait:624,spaceSecondaryCharge:150,spaceSecondarySpeed:0x1333,
    spaceSecondaryAcceleration:0xf5c,spaceSecondaryMaxSpeed:0x40000,
    spaceSecondaryStartX:-63,spaceSecondaryFieldStride:174,spaceSecondaryStartAngle:0x8000000,
    nativeFullTurn:0x10000000,nativeHalfTurn:0x8000000,nativeQuarterTurn:0x4000000,
    flightSpriteFlipAngleUpper:0xbfffff4,
    spaceSecondaryTurnLeft:-16,spaceSecondaryTurnRight:80,spaceSecondaryHeightGate:120,
    spaceSecondaryFinishLift:160,spaceSecondaryRestBase:1300,spaceSecondaryDifficultyStep:50,
    spaceSecondaryDifficulty:9,spaceSecondaryAnimationFrames:5,spaceSecondaryFrames:3,
    spaceSecondaryHitLead:8,spaceSecondaryHitX:16,spaceSecondaryHitY:8,spaceSecondaryHitRadius:16,
    // Piecewise native turn rates, all angles in the ROM's fixed-point units.
    spaceTurnSlow:0xb60b6,spaceTurnMiddle:0x16c16c,spaceTurnFast:0x222222,
    spaceTurnWrap:0xff49f3a,
    spaceTurnBounds:Object.freeze([0x1555554,0x2aaaaa8,0x5555550,0x6aaaaa4,0x7fffff8,0x955554c,0xaaaaaa0,0xbfffff4,0xd555548,0xeaaaa9c]),
    dragonBaseX:80,dragonVariantStride:99,dragonLeftOffset:8,dragonFrameSpawnStep:16,
    dragonStartAngle:0x3f49f46,dragonVariantAngle:0x16c16c,dragonStartSpeed:0x40000,
    dragonAcceleration:0xf5c,dragonSpawnDepth:10,dragonFinishDepth:10,
    dragonRestBase:1500,dragonDifficultyStep:50,dragonAnimationFrames:5,
    dragonAnimationLast:12,dragonAnimationLoop:11,dragonHitRadius:16,
    dragonSpriteSize:32,dragonSpriteLift:32,
    pirateAnimationFrames:2,pirateSecondaryStartX:-31,pirateSecondaryFieldStride:142,
    pirateSecondarySpawnLift:36,pirateSecondaryHorizontalSpeed:1,pirateSecondaryReverseX:80,
    pirateSecondaryExitLeft:-36,pirateSecondaryExitRight:113,pirateSecondaryPeriodMask:127,
    pirateSecondaryWaveAngle:0x222222,pirateSecondaryWaveScale:2,pirateSecondaryFrames:8,
    pirateSecondaryHitX:0,pirateSecondaryHitY:42,pirateSecondaryHitRadius:15,
    pirateSecondarySpriteSize:32,pirateSecondaryItemX:16,pirateSecondaryItemY:36,castleWarningLife:120,castleFrames:5,castleBiteFrames:20,castleHitLead:8,
    castleHitX:8,castleHitY:16,castleActorMinX:-12,castleActorMaxX:88,castleActorMinY:20,
    castleSpriteSize:64,castleSpriteLift:32,
    // Native OAM anchors the 64x64 factory robot 16px below its world point;
    // the castle enemy's 32px center offset does not apply to this sprite.
    factorySecondaryType:2,factorySecondaryAcceleration:0x2000,factorySecondaryTargetY:0,
    factorySecondarySpriteLift:16,
    factorySecondaryHitX:17,factorySecondaryHitY:62,factorySecondaryHitRadius:8,
    factorySecondaryFrames:16,factorySecondaryPoseScale:2,factorySecondaryItemX:33,factorySecondaryItemY:40,
    factorySecondaryWingClock:8,factorySecondaryWingDrain:4.25,factorySecondaryWingSpeedScale:2,factorySecondaryWingFrames:8,
    factorySecondaryWingLift:16,factorySecondaryWingWidth:64,factorySecondaryWingHeight:16,
    castleSecondaryChaseBase:100,castleSecondaryDifficultyStep:25,castleSecondarySpawnLift:125,
    castleSecondaryStartLeft:-64,castleSecondaryStartRight:112,castleSecondaryExitRight:118,
    castleSecondaryAcceleration:0x1999,castleSecondaryExitAcceleration:0x2000,
    castleSecondaryMaxVelocity:2,castleSecondaryTargetY:24,
    castleSecondaryNear:16,castleSecondaryFar:48,castleSecondaryStopLeft:72,castleSecondaryStopRight:-8,
    castleSecondaryWaterLift:40,castleSecondaryRestBase:1300,castleSecondaryStealLife:50,
    castleSecondaryAnimationFrames:9,castleSecondaryFrames:4,
    castleSecondaryHitX:16,castleSecondaryHitY:77,castleSecondaryHitRadius:11,castleSecondaryItemX:32,castleSecondaryItemY:71,
    dragonSecondaryVariantX:104,dragonSecondaryStartX:-8,dragonSecondarySpawnLift:160,
    dragonSecondaryHorizontalSpeed:0.25,dragonSecondaryFallSpeed:0x13333/65536,
    dragonSecondaryLeft:0,dragonSecondaryRight:80,dragonSecondaryFrames:8,
    // ROM type 1: park bird follows a reflected native angular arc, with
    // a fixed turning ceiling established at spawn, rather than chasing Y.
    parkSecondarySpawnLift:160,parkSecondaryTurnLift:148,parkSecondaryFrames:8,
    jungleSecondaryType:10,jungleSecondarySpawnLift:144,jungleSecondaryTurnLift:132,
    jungleSecondarySpawnBias:16,jungleSecondaryFrames:2,jungleSecondarySpriteSize:32,jungleSecondaryHitBias:16,
    parkSecondaryStartAngle:0xbfffff4,parkSecondaryTurnDown:0xbf49f3e,parkSecondaryTurnUp:0xc0b60aa,
    parkSecondaryTopLeft:0x3fffffc,parkSecondaryHitLead:6,parkSecondaryHitBias:32,
    parkSecondaryHitXCorrection:-8,parkSecondaryHitYCorrection:14,
    parkSecondaryHitRadius:14,parkSecondaryDropLift:140,parkSecondaryItemX:-8,parkSecondaryItemY:14,
    parkPrimaryStartX:-64,parkPrimaryFieldStride:176,parkPrimarySpawnLift:4,
    parkPrimaryLifeBase:40,parkPrimaryLifeMask:63,parkPrimaryLoopLife:75,
    parkPrimaryVelocity:1,parkPrimaryWaveScale:4,parkPrimaryLowerLift:6,
    parkPrimaryBuoyancyDown:0x2666/65536,parkPrimaryBuoyancyUp:0x1eb8/65536,
    parkPrimaryReverseLeft:-16,parkPrimaryReverseRight:64,parkPrimaryExitLeft:-64,parkPrimaryExitRight:112,
    parkPrimaryRestBase:1100,parkPrimaryFrames:18,parkPrimaryAnimationFrames:4,
    parkPrimaryHitLeft:3,parkPrimaryHitRight:13,parkPrimaryHitY:-8,parkPrimaryHitRadius:22,
    parkPrimaryHitOffsets:Object.freeze([2,14,32,47,58,64,65,58,42,30,23,22,28,32,35,33,26,17]),
    parkPrimarySpriteWidth:64,parkPrimarySpriteHeight:128,parkPrimarySpriteOriginY:65,
    beanstalkSecondarySpawnLift:170,beanstalkSecondaryLife:175,beanstalkSecondaryVelocity:1,
    beanstalkSecondaryClampDepth:48,beanstalkSecondaryFrames:4,beanstalkSecondaryStealLife:1,
    beanstalkSecondaryHitX:0,beanstalkSecondaryHitY:42,beanstalkSecondaryHitRadius:12,
    beanstalkSecondarySpriteSize:32,beanstalkSecondaryVineX:16,beanstalkSecondaryVineWidth:8,beanstalkSecondaryVineHeight:32,
    // ROM 0x08003f2a: a committed placement with >7 incomplete floors
    // requests destruction. Each queued floor gets 24*n-7, clamped to 17;
    // old counter 16 removes it, then 16 tail ticks precede the next floor.
    warningFloors: 9, unstableFloors: 8,
    nativeWaterDefeatReadyFrame:400,
    hammerSpriteAngleStep:0x666666,hammerSpriteAnglePeriod:0xffffff0,
    collapseCellSteps:24,
    nativeBoardRows:47,nativePieceNeighborhood:3,
    looseActorProbeX:17,looseActorProbeY:4,looseActorLaunchPixels:5,
    collapseTimerLead:7,collapseMinimumTimer:17,collapseRemoveTick:16,collapseCancelTick:32,collapseTailTicks:16,
    completeScore: 100, cellScore: 5,
    completionBonusGap:1,completionBonusColor:7,completionBonusMaterial:1,
    waterWarningFlashMask:0x30,
    safetyRows: 20, maxCells: 1000000,
});
// ROM 0x080020b6..0x080020d0 prepares the start frame from round word 15;
// 0x08019910 applies the signed 16.16 rise step. Frame values and thresholds
// are native ticks, and the waterline is in screen pixels.
export function nativeWaterlineAtFrame(config,nativeFrame){
    const rate=config?.words?.[RULES.nativeWaterRateWord],height=config?.height;
    if(!Number.isInteger(rate)||!Number.isInteger(height)||!Number.isFinite(nativeFrame))return null;
    const start=Math.max(RULES.nativeWaterStartMinimum,RULES.nativeWaterStartBase-RULES.nativeWaterStartRate*rate);
    const riseRaw=-(RULES.nativeWaterRiseBaseRaw+RULES.nativeWaterRiseWordRaw*rate);
    const stepRaw=riseRaw>>RULES.nativeWaterStepShift;
    const frames=Math.max(0,Math.floor(nativeFrame)-start);
    const initialRaw=(height*RULES.projectilePixels+RULES.survivalWaterlineHeightBias)*RULES.nativeWaterFixedScale;
    // Free rise only: the live field clamps against its current incomplete
    // row. A completed bottom row lets water continue rising through it.
    return (initialRaw+frames*stepRaw)/RULES.nativeWaterFixedScale;
}
export const COLORS = ['#ffb347','#5cd6e8','#bf89f5','#f478a1','#7ed967','#638df2','#f2da60','#64dbc0'];
export const PANEL_MATERIALS = ['bronze','silver','gold'];
// Observed Z/L3 pieces are bronze, mirrored S pieces silver, U/plus gold,
// and the single-cell piece silver. Other shapes retain the bronze default
// until their reference appearance has been independently observed.
export const SHAPE_MATERIALS = [0,0,0,0,1,0,2,2,1,0,0,0];
export const SHAPES = [
    [[0,0],[1,0],[2,0],[3,0]], [[0,0],[1,0],[2,0],[1,1]],
    [[0,0],[1,0],[2,0],[0,1]], [[0,0],[1,0],[2,0],[2,1]],
    [[0,0],[1,0],[1,1],[2,1]], [[1,0],[2,0],[0,1],[1,1]],
    [[1,0],[0,1],[1,1],[2,1],[1,2]], [[0,0],[1,0],[2,0],[0,1],[2,1]],
    // Also observed directly in the GBA placement previews and board cells.
    [[0,0]], [[0,0],[1,0]], [[0,0],[1,0],[2,0]], [[0,0],[1,0],[1,1]],
];
// ROM 0x0800e154..e244: signed fixed-point multiply rounds down,
// and the sine lookup discards the two lowest integer angle bits.
export function nativeThrowPose(p,tick) {
    const scale=RULES.actorFixedScale;
    const u=Math.min(scale,Math.floor(Math.max(0,tick)*RULES.throwReciprocal/2));
    const interpolate=(start,end)=>start+Math.floor((end-start)*u/scale);
    const sx=Math.round((p.eggX-1)*16*scale),sy=Math.round((45-p.eggY)*16*scale);
    const tx=Math.round((p.targetX-1)*16*scale),ty=Math.round((45-p.targetY)*16*scale);
    const sine=NATIVE_SINE[(Math.floor(RULES.throwHalfTurn*u/scale)>>2)&1023];
    return {x:interpolate(sx,tx)/scale/16+1,
        y:45-(interpolate(sy,ty)-RULES.throwArc*16*sine)/scale/16};
}
// The placement map is immutable artwork, not a function of the current
// owner's neighbours. Native drops copy its cell textures along with cells.
export function nativeCellArt(kind,rotation,cx,cy){
    // Raw template lookup also serves captured filler/bonus art. Ordinary
    // singleton placement selects map row 0 at commit, not a filler phase.
    const mask=NATIVE_PIECE_MASKS[rotation*8+kind];
    const x=cx+Math.min(...mask.map(c=>c[0])),y=Math.max(...mask.map(c=>c[1]))-cy;
    return 1+(rotation*8+kind)*9+y*3+x;
}
// ROM 0x080053e4 clears both fields, then builds field 0 and field 1 in
// separate passes. ROM 0x080052b4 places only vertical 1-, 2-, and 3-cell
// pieces. Coordinates here are converted from the ROM's top-down RAM rows to
// the model's bottom-up tower rows. A later round adds its extra field-1 rows
// across columns using the original integer division and persistent counter.
export function nativeInitialTowerPieces(config,round,fieldIndex=0){
    const {nativeInitialBoardRows:rows,nativeInitialBoardColumns:columns,nativeInitialBoardLastRow:lastRow,
        nativeInitialBoardOpponentWeight:opponentWeight,nativeInitialBoardOpponentCount:opponentCount,
        nativeInitialBoardOffset:offset,nativeInitialBoardColumnBias:columnBias,
        nativeInitialBoardFirstOwner:firstOwner,nativeInitialBoardKinds:kinds}=RULES;
    const height=config?.height;
    if(!Number.isInteger(height)||!Number.isInteger(round)||round<1||!Number.isInteger(fieldIndex)||fieldIndex<0||fieldIndex>1)return [];
    let extra=fieldIndex===1?Math.max(0,round+opponentWeight*opponentCount-offset):0;
    const pieces=[];let owner=firstOwner;
    for(let x=0;x<columns;x++){
        let ramY=height;
        if(fieldIndex===1){
            ramY-=Math.floor((extra+columnBias)/columns);
        }
        while(ramY<=lastRow){
            // 055FA..05606 consumes one handicap unit per vertical piece
            // starting above the base, not once per column or per cell.
            if(fieldIndex===1&&ramY<height)extra--;
            const selector=(x+ramY)*(1+x*ramY);
            let length,kind;
            if((selector&6)===0||ramY+1>=rows){length=1;kind=kinds.one;}
            else if(ramY+2>=rows){length=2;kind=kinds.two;}
            else if(selector&1){length=3;kind=kinds.three;}
            else {length=2;kind=kinds.two;}
            const cells=[];
            for(let offset=0;offset<length;offset++){
                const nativeRow=ramY+offset;
                if(nativeRow>lastRow)continue;
                const y=lastRow-nativeRow,localY=length-1-offset;
                cells.push({x,y,nativeArt:nativeCellArt(kind,0,0,localY)});
            }
            pieces.push({owner,kind,rotation:0,ramX:x,ramY,height:length,cells});
            owner++;ramY+=length;
        }
    }
    return pieces;
}
export function fillerPhase(filler,nativeFrame){
    if(Number.isInteger(filler.nativePhase))return filler.nativePhase;
    if(filler.finished)return 2;
    const age=nativeFrame-filler.born,index=filler.index;
    return age>=RULES.fillerFinishTicks[index]?2:age>=RULES.fillerGrowTicks[index]?1:0;
}
export function rotate(cells, direction = 1) {
    const a = cells.map(([x,y]) => direction > 0 ? [y,-x] : [-y,x]);
    const x = Math.min(...a.map(p => p[0])), y = Math.min(...a.map(p => p[1]));
    return a.map(p => [p[0]-x,p[1]-y]);
}
export function randomFrom(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; };
}
// Heights increase upwards, as in the tower. Collision handling belongs to
// the caller: this advances only the measured unobstructed flight, using the
// native position-before-velocity order. Call at the fixed 60 Hz game step.
export function advanceBombFlight(bomb) {
    const dt=RULES.step;
    if(bomb.phase==='lift'&&bomb.y>=bomb.liftY)bomb.phase='arc';
    if(bomb.phase==='lift') {
        bomb.y+=RULES.bombLaunchSpeed*dt;
        bomb.vy=RULES.bombLaunchSpeed;
    }else {
        const direction=Math.sign(bomb.targetX-bomb.x);
        bomb.x+=direction*Math.min(Math.abs(bomb.targetX-bomb.x),RULES.bombFlightSpeed*dt);
        bomb.y+=bomb.vy*dt;
        bomb.vy-=RULES.bombFlightGravity*dt;
    }
    return bomb;
}
export function cloudStriking(counter){
    return counter>=RULES.cloudPulseMin&&counter<=RULES.cloudPulseMax&&
        counter%RULES.cloudPulsePeriod<=RULES.cloudPulseLast;
}
export function cloudScale(counter){
    const inverse=counter>RULES.cloudScaleGrowEnd?
        1+(counter-RULES.cloudScaleGrowEnd)/RULES.cloudScaleGrowSteps:
        counter<RULES.cloudScaleShrinkSteps?
        1+(RULES.cloudScaleShrinkSteps-counter)/RULES.cloudScaleShrinkSteps:1;
    return 1/inverse;
}
// Native enemy type 5, ROM 0x08011e48, 0x0801217c and 0x08012e58.
// These coordinates are native pixels (positive y down), and velocities are
// pixels per fixed frame. The quarter-pixel motion uses no random generator.
export function advanceBubbleMotion(b,actorX,nativeFrame,waterline,escape=false,busy=false,actorY=waterline){
    b.previousActive=b.active;b.previousX=b.x;b.previousY=b.y;
    b.previousLife=b.life;
    b.previousAnimation=b.animation||0;
    if(!b.active){
        if(--b.life>0)return b;
        if(busy||actorY<waterline-RULES.spaceSecondaryHeightGate){b.life=1;return b;}
        Object.assign(b,{active:true,variant:1-(b.variant||0),life:RULES.bubbleLife,x:(Math.floor(actorX)&RULES.bubbleStartMask)*RULES.bubbleStartScale,
            y:waterline+RULES.bubbleSpawnBelowWater,vx:0,vy:RULES.bubbleStartVelocity,animation:0,animationClock:1});
        return b;
    }
    b.animationClock=(b.animationClock??0)+1;
    if(b.animationClock>=RULES.bubbleAnimationFrames){
        b.animationClock=0;b.animation=((b.animation??0)+1)%RULES.bubbleFrames;
    }
    b.vy+=((Math.floor(nativeFrame+actorX+b.x)&3)-RULES.bubbleYNoiseCenter)*RULES.bubbleVelocityNoise;
    if(b.life<=RULES.bubbleReleaseLife-1)b.vy+=RULES.bubbleFadeAcceleration;
    else b.vx+=((Math.floor(nativeFrame+actorX+b.y)&3)-RULES.bubbleXNoiseCenter)*RULES.bubbleVelocityNoise;
    b.vx=Math.max(-RULES.bubbleHorizontalSpeed,Math.min(RULES.bubbleHorizontalSpeed,b.vx));
    b.vy=Math.max(-RULES.bubbleVerticalSpeed,Math.min(RULES.bubbleVerticalSpeed,b.vy));
    b.x+=b.vx;b.y+=b.vy;
    if(b.x<RULES.bubbleLeftBoundary){b.x=RULES.bubbleLeftBoundary;b.vx=-b.vx;}
    if(b.x>(b.rightBoundary??RULES.bubbleRightBoundary)){b.x=b.rightBoundary??RULES.bubbleRightBoundary;b.vx=-b.vx;}
    if(b.y<(b.ceiling??RULES.bubbleCeiling)){b.y=b.ceiling??RULES.bubbleCeiling;b.vy=-b.vy;}
    b.life--;
    if(escape)b.escapeCounter=RULES.bubbleEscapeFrames;
    if(b.escapeCounter>0){b.escapeCounter--;if(b.life>RULES.bubbleReleaseLife)b.life-=RULES.bubbleEscapeReduction;}
    if(b.life<=0){b.active=false;b.life=RULES.bubbleRestBase-RULES.bubbleDifficultyStep*(b.difficulty??RULES.bubbleHardDifficulty);}
    return b;
}
// Native types 14 and 4. Like the bubble, these use original pixel anchors.
export function advanceJumperMotion(j,actorX,waterline,busy=false,actorY=waterline){
    j.previousActive=j.active;j.previousX=j.x;j.previousY=j.y;j.previousVy=j.vy;
    j.previousAnimation=j.animation||0;
    let spawned=false;
    if(!j.active){
        if(--j.life>0)return j;
        if(busy||actorY<waterline-RULES.spaceSecondaryHeightGate){j.life=1;return j;}
        j.variant=1-(j.variant||0);
        if(j.variant)j.x=Math.max(RULES.jumperLeftBoundary,Math.min(j.rightBoundary??RULES.jumperRightBoundary,actorX+RULES.jumperSpawnBias))-
            (j.type===RULES.jungleType?RULES.jungleSpriteBias:RULES.jumperSpriteBias);
        Object.assign(j,{active:true,life:0,
            y:waterline+RULES.jumperSpawnDepth,vx:0,
            vy:j.variant?RULES.jumperShortVelocity:RULES.jumperLongVelocity});
        j.previousVy=j.vy;
        spawned=true;
    }
    if(!spawned){j.vy+=RULES.jumperGravity;j.y+=j.vy;}
    if(!spawned&&j.vy>0&&j.y>waterline+RULES.jumperFinishDepth){
        j.active=false;
        j.life=j.variant?RULES.jumperShortRest:RULES.jumperRestBase-RULES.jumperDifficultyStep*(j.difficulty??RULES.bubbleHardDifficulty);
    }
    if(j.active){
        j.animationClock=(j.animationClock||0)+1;
        if(j.animationClock>=RULES.jumperAnimationFrames){j.animationClock=0;j.animation=((j.animation||0)+1)%RULES.jumperFrames;}
    }
    return j;
}
export function advanceSpaceMotion(s,waterline,busy=false,actorY=Infinity){
    s.previousActive=s.active;s.previousAnimation=s.animation||0;
    if(!s.active){
        if(--s.life>0)return s;
        // Native type7 takes 11CA8: a near-water hazard must wait while
        // its actor is more than 120 pixels above the current waterline.
        if(busy||actorY<waterline-RULES.spacePrimaryHeightGate){s.life=1;return s;}
        s.variant=1-(s.variant||0);
        Object.assign(s,{active:true,life:RULES.spaceLife,x:s.variant?(s.spawnX??RULES.spaceSpawnX):0,
            y:waterline+RULES.spaceSpawnDepth,vx:0,vy:0,animation:0});
    }else if(--s.life<=0){
        s.active=false;s.life=RULES.spaceRestBase-RULES.spaceDifficultyStep*(s.difficulty??RULES.bubbleHardDifficulty);
        return s;
    }
    s.animationClock=(s.animationClock||0)+1;
    if(s.animationClock>=RULES.spaceAnimationFrames){s.animationClock=0;s.animation=(s.animation+1)%RULES.spaceFrames;}
    return s;
}
// Shared native lookup/multiply order; this preserves the ROM's angle
// quantization instead of introducing a floating-point sine approximation.
export function nativeFlightVector(angle,speed){
    const index=((angle>>16)&4095)>>2;
    return {vx:-Math.floor(speed*NATIVE_SINE[(index+256)&1023]/65536)/65536||0,
        vy:-Math.floor(speed*NATIVE_SINE[index]/65536)/65536||0};
}
function nativeEnemyTurn(a){
    const b=RULES.spaceTurnBounds;
    if(a<RULES.nativeQuarterTurn){
        a-=a>b[1]?RULES.spaceTurnSlow:a>b[0]?RULES.spaceTurnMiddle:RULES.spaceTurnFast;
        if(a<0)a=RULES.spaceTurnWrap;
    }else if(a>b[7])a-=a>b[9]?RULES.spaceTurnFast:a>b[8]?RULES.spaceTurnMiddle:RULES.spaceTurnSlow;
    else if(a>=b[4])a+=a>b[6]?RULES.spaceTurnSlow:a>b[5]?RULES.spaceTurnMiddle:RULES.spaceTurnFast;
    else a+=a>b[3]?RULES.spaceTurnFast:a>b[2]?RULES.spaceTurnMiddle:RULES.spaceTurnSlow;
    return a;
}
export function advanceSpaceSecondaryMotion(s,actorY,spawnReferenceY,busy=false){
    s.previousActive=s.active;s.previousAnimation=s.animation||0;s.previousX=s.x;s.previousY=s.y;s.previousAngle=s.angle;
    if(!s.active){
        if(--s.life>0)return s;
        if(busy||actorY>spawnReferenceY-RULES.spaceSecondaryHeightGate){s.life=1;return s;}
        Object.assign(s,{active:true,life:RULES.spaceSecondaryCharge,x:RULES.spaceSecondaryStartX+
            s.side*(s.fieldStride??RULES.spaceSecondaryFieldStride),y:actorY,vx:0,vy:0,
            // 12044..12076 resets flight, retaining the sprite animation clock.
            angle:RULES.spaceSecondaryStartAngle-s.side*RULES.nativeHalfTurn,speed:RULES.spaceSecondarySpeed});
    }else{
        if(s.life>0)s.life--;
        else if(s.speed<RULES.spaceSecondaryMaxSpeed)s.speed+=RULES.spaceSecondaryAcceleration;
        const turning=s.side?s.x<(s.turnRight??RULES.spaceSecondaryTurnRight):s.x>RULES.spaceSecondaryTurnLeft;
        if(turning){
            const a=nativeEnemyTurn((RULES.nativeFullTurn-s.angle)%RULES.nativeFullTurn);
            s.angle=(RULES.nativeFullTurn-a)%RULES.nativeFullTurn;
        }
        Object.assign(s,nativeFlightVector(s.angle,s.speed));s.x+=s.vx;s.y+=s.vy;
        if(s.vy<0&&s.y<actorY-RULES.spaceSecondaryFinishLift){
            s.active=false;s.life=RULES.spaceSecondaryRestBase-RULES.spaceSecondaryDifficultyStep*(s.difficulty??RULES.spaceSecondaryDifficulty);
            return s;
        }
    }
    s.animationClock=(s.animationClock||0)+1;
    if(s.animationClock>=RULES.spaceSecondaryAnimationFrames){s.animationClock=0;s.animation=(s.animation+1)%RULES.spaceSecondaryFrames;}
    return s;
}
export function advanceBeanstalkSecondaryMotion(d,actorX,actorY,waterline,busy=false,heightGate=true){
    d.previousActive=d.active;d.previousStolen=d.stolen??null;d.previousAnimation=d.animation||0;d.previousX=d.x;d.previousY=d.y;
    if(!d.active){
        if(--d.life>0)return d;
        if(busy||heightGate&&actorY>waterline-RULES.spaceSecondaryHeightGate){d.life=1;return d;}
        Object.assign(d,{active:true,x:actorX,y:actorY-RULES.beanstalkSecondarySpawnLift,life:RULES.beanstalkSecondaryLife,vx:0,stolen:null});
    }else{
        d.vy=d.life>0?RULES.beanstalkSecondaryVelocity:-RULES.beanstalkSecondaryVelocity;
        d.x+=d.vx;d.y=Math.min(d.y+d.vy,actorY+RULES.beanstalkSecondaryClampDepth);
        if(d.life<=0&&d.y<actorY-RULES.beanstalkSecondarySpawnLift){
            d.active=false;d.life=RULES.spaceSecondaryRestBase-RULES.spaceSecondaryDifficultyStep*(d.difficulty??RULES.spaceSecondaryDifficulty);d.stolen=null;return d;
        }
        if(d.life>0)d.life--;
        d.speed-=RULES.dragonAcceleration;
    }
    d.animationClock=(d.animationClock||0)+1;
    if(d.animationClock>=RULES.dragonAnimationFrames){d.animationClock=0;d.animation=(d.animation+1)%RULES.beanstalkSecondaryFrames;}
    return d;
}
// Native item coordinates increase downwards and locate the 16px picture's
// top-left. Keep them separate from the tower's upward tile coordinates.
export function advancePickupMotion(d,waterline){
    d.previousX=d.x;d.previousY=d.y;
    if(d.wait>0)d.wait--;
    const scale=RULES.pickupFixedScale;
    const multiply=(value,drag)=>Math.floor(value*drag)/scale;
    if(d.state===1){
        d.vx=multiply(d.vx,RULES.pickupDrag);
        d.vy=multiply(d.vy+RULES.pickupGravity,RULES.pickupDrag);
        d.x+=d.vx;d.y+=d.vy;
        if(d.x<0){d.x=0;d.vx=-d.vx;}
        const edge=d.rightEdge??RULES.pickupRightEdge;
        if(d.x>edge){d.x=edge;d.vx=-d.vx;}
        if(d.y>waterline+RULES.pickupWaterEntry)d.state=2;
    }else if(d.state===2){
        d.vy+=d.y>waterline+RULES.pickupWaterTurn?-RULES.pickupWaterBuoyancy:RULES.pickupWaterGravity;
        d.vx+=d.x>(d.midpoint??RULES.pickupWaterMidpoint)?RULES.pickupWaterHorizontal:-RULES.pickupWaterHorizontal;
        d.vx=multiply(d.vx,RULES.pickupWaterDrag);d.vy=multiply(d.vy,RULES.pickupWaterDrag);
        d.x+=d.vx;d.y+=d.vy;
        if(d.x<RULES.pickupExitLeft||d.x>(d.exitRight??RULES.pickupExitRight))d.active=false;
    }
    return d;
}
export function nextNativePickup(state,nativeFrame){
    const draw=()=>{state.seed=nativeRandomStep(state.seed);return state.seed;};
    const vx=(draw()-RULES.pickupVXCenter)*2/RULES.pickupFixedScale;
    if(!state.remaining){state.bag=[...(state.weights??RULES.pickupWeights)];state.remaining=state.bag.reduce((a,b)=>a+b,0);}
    let choice=draw()%state.remaining,kind=-1;
    for(let i=0;i<state.bag.length;i++){
        const count=state.bag[i];
        if(choice>count){choice-=count;continue;}
        if(!count||nativeFrame<=RULES.pickupRestrictedUntil&&RULES.pickupRestrictedKinds.includes(i))continue;
        kind=i;state.bag[i]--;state.remaining--;break;
    }
    const variant=(draw()>>12)&3;
    state.clock=Math.floor(Math.max(RULES.pickupClockMinimum,(draw()>>8)&RULES.pickupClockMask)*RULES.pickupClockMultiplier/(state.divisor??RULES.pickupClockDivisor));
    return kind<0?null:{kind,variant,x:RULES.pickupSpawnX,y:RULES.pickupSpawnY,vx,vy:RULES.pickupSpawnVY,state:1,active:true};
}
function nativePickupTurn(frame){
    const wave=NATIVE_SINE[((((frame*RULES.pickupSwayFrequency)%RULES.nativeFullTurn)>>16)&4095)>>2];
    return Math.trunc(wave*RULES.pickupSwayAmplitude/RULES.pickupFixedScale);
}
export function nativePickupAngle(frame){
    return nativePickupTurn(frame)/RULES.nativeFullTurn*Math.PI*2;
}
export function nativePickupAffineMatrix(frame){
    const angle=nativePickupTurn(frame)>>16,
        sine=NATIVE_SINE[(angle&4095)>>2],cosine=NATIVE_SINE[((angle+1024)&4095)>>2];
    // ROM affine preparation performs a second sine-table lookup. Analytic
    // Math.sin/cos differs by one coefficient and changes edge texels.
    return [cosine>>8,sine>>8,(-sine)>>8,cosine>>8];
}
// FUN_0800cc04: signed shortest-arc approach, followed by the ROM sine LUT.
export function nativePreviewAngleStep(angle,target){
    let delta=target-angle;
    while(delta>RULES.nativeHalfTurn)delta-=RULES.nativeFullTurn;
    while(delta< -RULES.nativeHalfTurn)delta+=RULES.nativeFullTurn;
    return angle+(Math.abs(delta)>RULES.previewAngleSnap?delta>>RULES.previewPositionBlendShift:delta);
}
export function nativePreviewAngleMatrix(angle,inverseScale=RULES.actorFixedScale){
    const index=((angle>>16)&4095)>>2,sine=NATIVE_SINE[index],cosine=NATIVE_SINE[(index+256)&1023];
    const coefficient=value=>Math.floor(value*inverseScale/(RULES.actorFixedScale*256))||0;
    return [coefficient(cosine),coefficient(sine),coefficient(-sine),coefficient(cosine)];
}
export function nativeSkeletalFishMatrix(angle,variant=1){
    const index=((angle>>16)&4095)>>2,sine=NATIVE_SINE[index],cosine=NATIVE_SINE[(index+256)&1023];
    return [cosine>>8,sine>>8,variant?sine>>8:(-sine)>>8,variant?(-cosine)>>8:cosine>>8];
}
// 0x08011998..11a00: birds and missiles change texture reflection as their
// flight direction crosses the vertical axis. A permanent horizontal flip
// turns the bird upside down during the opposite half of its arc.
export function nativeFlightSpriteMatrix(angle){
    const index=((angle>>16)&4095)>>2,sine=NATIVE_SINE[index],cosine=NATIVE_SINE[(index+256)&1023];
    const reversed=angle>RULES.nativeQuarterTurn&&angle<RULES.flightSpriteFlipAngleUpper;
    return [(-cosine)>>8,(-sine)>>8,(reversed?sine:-sine)>>8,(reversed?-cosine:cosine)>>8];
}
export function nativePickupItem(motion,columns=7){
    const {kind,variant}=motion,record=NATIVE_ITEMS[variant*13+kind];
    Object.assign(motion,{rightEdge:RULES.pickupRightEdge+(columns-7)*RULES.projectilePixels,
        midpoint:RULES.pickupWaterMidpoint+(columns-7)*RULES.projectilePixels/2,
        exitRight:RULES.pickupExitRight+(columns-7)*RULES.projectilePixels});
    return {nativeKind:kind,nativeVariant:variant,nativeMotion:motion,age:0,
        cells:record.cells?.map(p=>[...p])??null,item:kind>=8?RULES.pickupToolKinds[kind-8]:null,
        color:kind+1,material:RULES.pickupMaterials[kind]??0,
        x:(motion.x+RULES.pickupCenterBias)/RULES.projectilePixels,
        y:(RULES.nativeActorFloor-motion.y+RULES.pickupActorBias)/RULES.projectilePixels};
}
// Survival mode 5: ROM 0x08002250..22f6 selects table entries, then
// 0x0800207e adjusts heights congruent to 2 modulo 5. The seed is the global
// state after round setup has copied field-local streams; callers modeling a
// complete transition should use nativeSurvivalRoundStart.
export function nativeSurvivalConfig(round,seed){
    let difficulty=RULES.survivalHardDifficulty,level=round;
    if(round>RULES.survivalTierRounds){
        seed=nativeRandomStep(seed);difficulty=seed%NATIVE_ROUNDS.length;
        seed=nativeRandomStep(seed);level=seed%(RULES.survivalTierRounds-1)+2;
    }
    const words=[...NATIVE_ROUNDS[difficulty][level-1]];
    if(words[17]%5===2&&words[17]<=46)words[17]++;
    if(round>RULES.survivalTierRounds)words[18]=Math.max(RULES.survivalRandomClockMinimum,words[18]);
    return {round,words,difficulty,level,seed,primary:words[0],secondary:words[1],
        weights:RULES.pickupConfigOffsets.map(offset=>words[offset/4]),divisor:words[18],height:words[17]};
}
// ROM round transitions first make two setup draws and copy that state to
// both field RNGs. The optional round-9+ table selection then consumes two
// further draws from the global stream. Keep the copied field seed separate
// from the global state left after table selection.
export function nativeSurvivalRoundStart(round,seed){
    let rivalId;
    for(let i=0;i<RULES.nativeRoundSetupRngDraws;i++){
        seed=nativeRandomStep(seed);
        // 0x0800194c..1952 selects the rival from the first setup draw.
        if(i===0)rivalId=seed&7;
    }
    const fieldSeed=seed,config=nativeSurvivalConfig(round,fieldSeed);
    return {config,fieldSeed,globalSeed:config.seed,rivalId};
}
// ROM 0x0800c470..c4e0: discard creates an inert pickup, not a thrown attack.
// Coordinates and velocity here are native pixels and pixels per frame.
export function discardedPickup(item,actorX,actorY,actorVX,columns=7){
    const signature=cells=>cells?.map(p=>p.join(',')).sort().join(';');
    let kind=item.nativeKind,variant=item.nativeVariant??0;
    if(item.cells){
        const shape=signature(item.cells);
        // Symmetric shapes can have identical cells but distinct icon texels.
        // Retain the held orientation instead of replacing it with the first
        // geometrically equivalent entry when the actor discards the piece.
        const heldIndex=variant*13+kind;
        const index=Number.isInteger(kind)&&signature(NATIVE_ITEMS[heldIndex]?.cells)===shape?
            heldIndex:NATIVE_ITEMS.findIndex((r,i)=>(!Number.isInteger(kind)||i%13===kind)&&signature(r.cells)===shape);
        if(index>=0){kind=index%13;variant=Math.floor(index/13);}
    }else kind=8+RULES.pickupToolKinds.indexOf(item.item);
    if(!Number.isInteger(kind)||kind<0||kind>=13)return null;
    const motion={kind,variant,x:actorX+RULES.discardPickupX,y:actorY+RULES.discardPickupY,
        vx:actorVX,vy:RULES.discardPickupVelocity,wait:RULES.discardPickupWait,state:1,active:true};
    return {...item,...nativePickupItem(motion,columns),fuse:undefined};
}
export function nativePickupCanCatch(motion,actorX,actorY){
    return motion.state===1&&!(motion.wait>0)&&
        Math.abs(actorX-motion.x+RULES.pickupCatchBias)<RULES.pickupCatchDistance&&
        Math.abs(actorY-motion.y+RULES.pickupCatchBias)<RULES.pickupCatchDistance;
}
export function advanceParkPrimaryMotion(d,actorY,waterline,nativeFrame,busy=false,heightGate=true){
    d.previousActive=d.active;d.previousAnimation=d.animation||0;d.previousX=d.x;d.previousY=d.y;d.previousVX=d.vx;d.animationWrapped=false;
    if(!d.active){
        if(--d.life>0)return d;
        if(busy||heightGate&&actorY<waterline-RULES.spaceSecondaryHeightGate){d.life=1;return d;}
        d.variant=1-(d.variant||0);
        Object.assign(d,{active:true,x:RULES.parkPrimaryStartX+d.side*(d.fieldStride??RULES.parkPrimaryFieldStride),
            y:waterline-RULES.parkPrimarySpawnLift,vx:(1-2*d.side)*RULES.parkPrimaryVelocity,vy:0,
            life:RULES.parkPrimaryLifeBase+(nativeFrame&RULES.parkPrimaryLifeMask),captured:false});
    }else{
        if(d.animation===0){
            const angle=(nativeFrame&RULES.pirateSecondaryPeriodMask)*RULES.pirateSecondaryWaveAngle;
            d.vy=Math.floor(NATIVE_SINE[((angle>>16)&4095)>>2]/RULES.parkPrimaryWaveScale)/65536;
        }else if(d.animation===1)d.vy=-RULES.parkPrimaryVelocity*2;
        if(d.y>waterline-RULES.parkPrimaryLowerLift)d.vy-=RULES.parkPrimaryBuoyancyDown;
        else if(d.y<waterline-RULES.parkPrimarySpawnLift){
            d.vy+=RULES.parkPrimaryBuoyancyUp;
            if(d.animation===0)d.y=waterline-RULES.parkPrimarySpawnLift;
        }
        if(d.side&&d.x<RULES.parkPrimaryReverseLeft&&d.vx<0||!d.side&&d.x>(d.reverseRight??RULES.parkPrimaryReverseRight)&&d.vx>0)d.vx=-d.vx;
        d.x+=d.vx;d.y+=d.vy;
        if(d.x<RULES.parkPrimaryExitLeft&&d.vx<0||d.x>(d.exitRight??RULES.parkPrimaryExitRight)&&d.vx>0){
            d.active=false;d.life=RULES.parkPrimaryRestBase-RULES.bubbleDifficultyStep*(d.difficulty??RULES.bubbleHardDifficulty);d.animation=0;return d;
        }
        d.speed-=RULES.dragonAcceleration;
    }
    d.animationClock=(d.animationClock||0)+1;
    if(d.life>0)d.life--;
    else if(d.animationClock>=RULES.parkPrimaryAnimationFrames){d.animation++;d.animationClock=0;}
    if(d.animation>=RULES.parkPrimaryFrames){d.animation=0;d.life=RULES.parkPrimaryLoopLife;d.animationWrapped=true;}
    return d;
}
export function advanceParkSecondaryMotion(d,actorY,waterline,busy=false){
    const jungle=d.type===RULES.jungleSecondaryType;
    d.previousActive=d.active;
    d.previousStolen=d.stolen??null;d.previousVX=d.vx;d.previousVY=d.vy;
    d.previousAnimation=d.animation||0;d.previousX=d.x;d.previousY=d.y;d.previousAngle=d.angle;
    if(!d.active){
        if(--d.life>0)return d;
        if(busy||actorY>waterline-RULES.spaceSecondaryHeightGate){d.life=1;return d;}
        d.variant=1-(d.variant||0);
        Object.assign(d,{active:true,life:0,x:(d.baseX??RULES.dragonBaseX)-RULES.dragonVariantStride*d.variant-(d.side?0:RULES.dragonLeftOffset)+(jungle?RULES.jungleSecondarySpawnBias:0),
            y:actorY-(jungle?RULES.jungleSecondarySpawnLift:RULES.parkSecondarySpawnLift),turnY:actorY-(jungle?RULES.jungleSecondaryTurnLift:RULES.parkSecondaryTurnLift),
            angle:RULES.parkSecondaryStartAngle,speed:RULES.dragonStartSpeed,stolen:null});
    }else{
        d.angle=(RULES.nativeFullTurn-nativeEnemyTurn((RULES.nativeFullTurn-d.angle)%RULES.nativeFullTurn))%RULES.nativeFullTurn;
        if(d.y<d.turnY){d.angle=d.angle>=RULES.nativeHalfTurn?RULES.parkSecondaryStartAngle:RULES.parkSecondaryTopLeft;}
        else if(!d.variant&&d.angle===RULES.parkSecondaryTurnDown)d.angle=RULES.parkSecondaryTurnUp;
        Object.assign(d,nativeFlightVector(d.angle,d.speed));d.x+=d.vx;d.y+=d.vy;
        if(d.y>d.turnY)d.speed+=d.angle>RULES.nativeHalfTurn?-RULES.dragonAcceleration:RULES.dragonAcceleration;
        if(d.vy<0&&d.y<actorY-RULES.spaceSecondaryFinishLift){
            d.active=false;d.life=RULES.spaceSecondaryRestBase-RULES.spaceSecondaryDifficultyStep*(d.difficulty??RULES.spaceSecondaryDifficulty);return d;
        }
    }
    d.animationClock=(d.animationClock||0)+1;
    if(d.animationClock>=RULES.dragonAnimationFrames){d.animationClock=0;d.animation=(d.animation+1)%(jungle?RULES.jungleSecondaryFrames:RULES.parkSecondaryFrames);}
    return d;
}
export function advanceDragonMotion(d,actorY,spawnReferenceY,waterline,nativeFrame,busy=false){
    d.previousActive=d.active;d.previousX=d.x;d.previousY=d.y;
    d.previousAnimation=d.animation||0;
    if(!d.active){
        if(--d.life>0)return d;
        if(busy||actorY<spawnReferenceY-RULES.spaceSecondaryHeightGate){d.life=1;return d;}
        d.variant=1-(d.variant||0);
        const phase=nativeFrame&3;
        const x=(d.baseX??RULES.dragonBaseX)-RULES.dragonVariantStride*d.variant-(d.side?0:RULES.dragonLeftOffset)+
            RULES.dragonFrameSpawnStep*(d.variant?phase+1:1-phase);
        Object.assign(d,{active:true,x,y:waterline+RULES.dragonSpawnDepth,vx:0,vy:0,
            angle:RULES.dragonStartAngle+RULES.dragonVariantAngle*d.variant,speed:RULES.dragonStartSpeed,animation:0,splashed:false});
    }else{
        d.angle=nativeEnemyTurn(d.angle);
        Object.assign(d,nativeFlightVector(d.angle,d.speed));
        d.vx=Math.floor(d.vx*65536/2)/65536;d.x+=d.vx;d.y+=d.vy;
        const descending=d.angle>RULES.nativeHalfTurn;
        if(descending)d.speed+=RULES.dragonAcceleration;
        else if(d.y>(d.speedDecreaseHeight??0))d.speed-=RULES.dragonAcceleration;
        if(descending&&d.y>waterline+RULES.dragonFinishDepth){
            d.active=false;d.life=RULES.dragonRestBase-RULES.dragonDifficultyStep*(d.difficulty??RULES.bubbleHardDifficulty);return d;
        }
    }
    d.animationClock=(d.animationClock||0)+1;
    if(d.animationClock>=RULES.dragonAnimationFrames){d.animationClock=0;d.animation++;
        if(d.animation>RULES.dragonAnimationLast)d.animation=RULES.dragonAnimationLoop;}
    return d;
}
// ROM types 0 / 9: shark / skeletal fish share the full horizontal arc.
export function advanceCastleMotion(d,actorY,waterline,busy=false){
    d.previousActive=d.active;d.previousAnimation=d.animation||0;
    d.previousX=d.x;d.previousY=d.y;d.previousAngle=d.angle;
    if(!d.active){
        --d.life;
        if(d.life===RULES.castleWarningLife&&actorY<waterline-RULES.spaceSecondaryHeightGate)d.life++;
        if(d.life>0)return d;
        if(busy){d.life=1;return d;}
        d.variant=1-(d.variant||0);
        Object.assign(d,{active:true,x:(d.baseX??RULES.dragonBaseX)-RULES.dragonVariantStride*d.variant-(d.side?0:RULES.dragonLeftOffset),
            y:waterline+RULES.dragonSpawnDepth,vx:0,vy:0,life:0,captured:false,biteStarted:false,
            // Types 0/9 retain +0x20/+0x28 across flights; only type 6
            // takes the animation reset at ROM 0x08011f60..fcc.
            angle:RULES.dragonStartAngle+RULES.dragonVariantAngle*d.variant,speed:RULES.dragonStartSpeed});
    }else{
        d.angle=nativeEnemyTurn(d.angle);Object.assign(d,nativeFlightVector(d.angle,d.speed));
        d.x+=d.vx;d.y+=d.vy;
        const descending=d.angle>RULES.nativeHalfTurn;
        if(descending)d.speed+=RULES.dragonAcceleration;
        else if(d.y>(d.speedDecreaseHeight??0))d.speed-=RULES.dragonAcceleration;
        if(descending&&d.y>waterline+RULES.dragonFinishDepth){
            d.active=false;d.life=RULES.jumperRestBase-RULES.jumperDifficultyStep*(d.difficulty??RULES.bubbleHardDifficulty);return d;
        }
    }
    d.animationClock=(d.animationClock||0)+1;
    if(d.animationClock>=(d.animationFrames??RULES.dragonAnimationFrames)){d.animationClock=0;d.animation=(d.animation+1)%RULES.castleFrames;}
    return d;
}
export function advanceDragonSecondaryMotion(d,actorY,waterline,busy=false){
    d.previousActive=d.active;d.previousX=d.x;d.previousY=d.y;
    d.previousAnimation=d.animation||0;
    if(!d.active){
        if(--d.life>0)return d;
        if(busy||actorY>waterline-RULES.spaceSecondaryHeightGate){d.life=1;return d;}
        d.variant=1-(d.variant||0);
        Object.assign(d,{active:true,life:0,x:RULES.dragonSecondaryStartX+(d.variant?(d.variantX??RULES.dragonSecondaryVariantX):0),
            y:actorY-RULES.dragonSecondarySpawnLift,vx:(1-2*d.variant)*RULES.dragonSecondaryHorizontalSpeed,
            // ROM 0x08011e14..11e3e retains the animation across flights.
            vy:RULES.dragonSecondaryFallSpeed});
    }else{
        if(d.x<RULES.dragonSecondaryLeft&&d.vx<0||d.x>(d.rightBoundary??RULES.dragonSecondaryRight)&&d.vx>0)d.vx=-d.vx;
        d.x+=d.vx;d.y+=d.vy;d.speed+=RULES.dragonAcceleration;
        if(d.y>waterline+RULES.dragonFinishDepth){
            d.active=false;d.life=RULES.dragonRestBase-RULES.dragonDifficultyStep*(d.difficulty??RULES.spaceSecondaryDifficulty);return d;
        }
    }
    d.animationClock=(d.animationClock||0)+1;
    if(d.animationClock>=RULES.dragonAnimationFrames){d.animationClock=0;d.animation=(d.animation+1)%RULES.dragonSecondaryFrames;}
    return d;
}
// Type 13: steering uses integer 16.16 velocity, including half-acceleration rounding.
export function advanceCastleSecondaryMotion(d,actorX,actorY,waterline,randomValue,busy=false){
    d.previousActive=!!d.active;
    d.previousStolen=d.stolen??null;
    d.previousAnimation=d.animation||0;d.previousWingPhase=d.wingPhase||0;
    d.previousX=d.x;d.previousY=d.y;
    if(!d.active){
        if(--d.life>0)return d;
        if(busy||actorY>waterline-RULES.spaceSecondaryHeightGate){d.life=1;return d;}
        Object.assign(d,{active:true,life:RULES.castleSecondaryChaseBase+RULES.castleSecondaryDifficultyStep*(d.difficulty??RULES.spaceSecondaryDifficulty),
            x:d.side?(d.startRight??RULES.castleSecondaryStartRight):RULES.castleSecondaryStartLeft,
            // Type 13 preserves both animation accumulators on respawn
            // (0x08011f60 bypasses the type-6-only +0x20 reset).
            y:actorY-RULES.castleSecondarySpawnLift,vx:0,vy:0,variant:1-(d.variant||0),stolen:null});
        d.previousX=d.x;d.previousY=d.y;
    }else{
        let vx=Math.round(d.vx*65536),vy=Math.round(d.vy*65536);
        if(d.life){
            d.life--;
            const acceleration=d.type===RULES.factorySecondaryType?RULES.factorySecondaryAcceleration:RULES.castleSecondaryAcceleration;
            const direction=delta=>delta>RULES.castleSecondaryFar?2:delta>RULES.castleSecondaryNear?1:delta< -RULES.castleSecondaryNear?-1:0;
            const steer=(v,target)=>{
                if(target===2||target===1&&v>0)return v+(v>0?acceleration>>1:acceleration);
                if(target===-1||target===0&&v<0)return v-(v<0?acceleration>>1:acceleration);
                return v;
            };
            if((randomValue&7)===7)vx-=acceleration;
            if((randomValue&56)===0)vy+=acceleration;else if((randomValue&56)===56)vy-=acceleration;
            const max=RULES.castleSecondaryMaxVelocity*65536;
            vx=Math.max(-max,Math.min(max,steer(vx,direction(actorX-d.x))));
            vy=Math.max(-max,Math.min(max,steer(vy,direction(actorY-d.y-(d.type===RULES.factorySecondaryType?RULES.factorySecondaryTargetY:RULES.castleSecondaryTargetY)))));
        }else{
            vx+=d.side?RULES.castleSecondaryExitAcceleration:-RULES.castleSecondaryExitAcceleration;
            vx=Math.max(-RULES.castleSecondaryMaxVelocity*65536,Math.min(RULES.castleSecondaryMaxVelocity*65536,vx));
            if(d.side?d.x>(d.exitRight??RULES.castleSecondaryExitRight):d.x<RULES.castleSecondaryStartLeft){
                d.active=false;d.life=RULES.castleSecondaryRestBase-RULES.castleSecondaryDifficultyStep*(d.difficulty??RULES.spaceSecondaryDifficulty);d.stolen=null;return d;
            }
        }
        d.vx=vx/65536;d.vy=vy/65536;d.x+=d.vx;d.y+=d.vy;
        if(d.side?d.x<RULES.castleSecondaryStopRight&&d.vx<0:d.x>(d.stopLeft??RULES.castleSecondaryStopLeft)&&d.vx>0)d.vx=0;
        if(d.y>waterline-RULES.castleSecondaryWaterLift&&d.vy>0)d.vy=0;
    }
    if(d.type===RULES.factorySecondaryType){
        d.wingClock=(d.wingClock??RULES.factorySecondaryWingClock)-(RULES.factorySecondaryWingDrain-RULES.factorySecondaryWingSpeedScale*d.vy);
        if(d.wingClock<=0){d.wingClock=RULES.factorySecondaryWingClock;d.wingPhase=((d.wingPhase||0)+1)%RULES.factorySecondaryWingFrames;}
        if(d.poseForward!==false){
            d.animation=Math.max(-RULES.factorySecondaryFrames/4,Math.min(RULES.factorySecondaryFrames/4,Math.floor(d.vx*RULES.factorySecondaryPoseScale)))&(RULES.factorySecondaryFrames-1);
            if(d.animation===RULES.factorySecondaryFrames/4)d.poseForward=false;
        }else{
            d.animation=Math.max(RULES.factorySecondaryFrames/4,Math.min(RULES.factorySecondaryFrames*3/4,Math.floor(RULES.factorySecondaryFrames/2-d.vx*RULES.factorySecondaryPoseScale)));
            if(d.animation===RULES.factorySecondaryFrames*3/4)d.poseForward=true;
        }
        return d;
    }
    d.animationClock=(d.animationClock||0)+1;
    if(d.animationClock>=RULES.castleSecondaryAnimationFrames){d.animationClock=0;d.animation=(d.animation+1)%RULES.castleSecondaryFrames;}
    return d;
}
export function advancePirateSecondaryMotion(d,actorY,waterline,nativeFrame,busy=false){
    d.previousAnimation=d.animation||0;
    if(!d.active){
        if(--d.life>0)return d;
        if(busy||actorY>waterline-RULES.spaceSecondaryHeightGate){d.life=1;return d;}
        Object.assign(d,{active:true,life:0,x:RULES.pirateSecondaryStartX+(d.side?(d.fieldStride??RULES.pirateSecondaryFieldStride):0),
            y:actorY-RULES.pirateSecondarySpawnLift,vx:(1-2*d.side)*RULES.pirateSecondaryHorizontalSpeed,vy:0,animation:0,stolen:null});
    }else{
        // Native type 11 still integrates position/speed on its departure tick.
        if(d.side?d.x>(d.exitRight??RULES.pirateSecondaryExitRight):d.x<RULES.pirateSecondaryExitLeft){
            d.active=false;d.life=RULES.castleSecondaryRestBase-RULES.castleSecondaryDifficultyStep*(d.difficulty??RULES.spaceSecondaryDifficulty);d.stolen=null;
        }
        if(d.side?d.x<=0:d.x>=(d.reverseX??RULES.pirateSecondaryReverseX))d.vx=d.side?RULES.pirateSecondaryHorizontalSpeed:-RULES.pirateSecondaryHorizontalSpeed;
        const angle=(nativeFrame&RULES.pirateSecondaryPeriodMask)*RULES.pirateSecondaryWaveAngle;
        d.vy=RULES.pirateSecondaryWaveScale*NATIVE_SINE[((angle>>16)&4095)>>2]/65536;
        d.x+=d.vx;d.y+=d.vy;
        if(d.y>(d.speedDecreaseHeight??0))d.speed-=RULES.dragonAcceleration;
        if(!d.active)return d;
    }
    d.animationClock=(d.animationClock||0)+1;
    if(d.animationClock>=RULES.dragonAnimationFrames){d.animationClock=0;d.animation=(d.animation+1)%RULES.pirateSecondaryFrames;}
    return d;
}
export function settings(input = {}) {
    const s = {...DEFAULTS,...input};
    for (const k of ['columns','goal','seed']) {
        s[k] = Number(s[k]);
        if (!Number.isSafeInteger(s[k]) || s[k] < (k === 'seed' ? 0 : 4))
            throw Error(`${k}: enter a whole number at least ${k === 'seed' ? 0 : 4}.`);
    }
    for (const k of ['waterSpeed','crateInterval','aiDelay']) {
        s[k] = Number(s[k]);
        if (!Number.isFinite(s[k]) || s[k] < (k === 'crateInterval' ? 0.01 : 0)) throw Error(`${k}: invalid value.`);
    }
    if (s.columns*(s.goal+RULES.safetyRows)>RULES.maxCells) throw Error('This board exceeds the one-million-cell memory budget.');
    // Older previews exposed experimental race/solo variants. Migrate saved
    // settings to the only supported reconstruction: native Hard Survival.
    s.mode = 'survival';
    if (s.difficulty !== 'hard') throw Error('Only the Hard reconstruction is available.');
    if (!Object.hasOwn(CHARACTER_ART,s.character)) throw Error('Unknown character.');
    return s;
}

function nativeActorMapCell(tower,mapColumn,mapRow){
    if(mapColumn<0||mapColumn>=RULES.nativeActorMapColumns)return true;
    if(mapRow<0||mapRow>=RULES.nativeActorMapRows)return false;
    // The ROM's one-based pixel-to-column conversion selects byte 1 for
    // in-game pixel X=0; byte 0 is still the first playable Tower column.
    // Rows run from the ceiling down in the ROM and bottom-up in Tower.
    const x=mapColumn,
        y=RULES.nativeActorMapBottomRow-mapRow;
    return Boolean(tower.cell(x,y));
}
function nativeActorMapAtPixels(tower,x,y){
    if(x<-RULES.nativeActorNegativeMapProbeLimit)return true;
    const mapColumn=Math.floor(x/RULES.projectilePixels)+RULES.nativeActorWallMapColumnBias,
        mapRow=Math.floor(y/RULES.projectilePixels)+RULES.nativeActorWallMapRowBias;
    return nativeActorMapCell(tower,mapColumn,mapRow);
}
function nativeActorBodyMapOccupied(tower,x,y){
    const mapColumn=Math.floor(x/RULES.projectilePixels)+RULES.nativeActorWallMapColumnBias,
        mapRow=Math.floor(y/RULES.projectilePixels)+RULES.nativeActorWallMapRowBias,
        phase=((x+RULES.nativeActorWallNeighborPhasePixels)%RULES.projectilePixels+
            RULES.projectilePixels)%RULES.projectilePixels;
    const primary=nativeActorMapCell(tower,mapColumn,mapRow);
    // FUN_08003620 samples the neighbor only inside the 4px edge zones.
    // Sampling it throughout the tile lets an unrelated block on the far
    // side cancel a real side collision (e.g. X=70px, within-cell phase 6).
    const overlapLeft=phase<RULES.nativeActorWallNeighborThreshold&&mapColumn>0,
        overlapRight=phase>RULES.nativeSupportEdgeHigh&&mapColumn<RULES.nativeActorMapColumns-1;
    if(!overlapLeft&&!overlapRight)return primary;
    let neighbor;
    if(overlapLeft)
        neighbor=mapColumn<1?true:nativeActorMapCell(tower,mapColumn-1,mapRow);
    else
        neighbor=mapColumn>RULES.nativeActorMapColumns-2?true:nativeActorMapCell(tower,mapColumn+1,mapRow);
    return primary||neighbor;
}
function nativeActorCanMoveHorizontally(tower,direction){
    const actorX=Math.floor((tower.egg.x-1)*RULES.projectilePixels),
        actorY=Math.floor(RULES.nativeActorFloor-tower.egg.y*RULES.projectilePixels),
        probeY=actorY-RULES.nativeActorWallProbeOffsetPixels;
    if(direction<0&&actorX<RULES.nativeActorLeftEdgeGuard)return false;
    if(direction>0&&actorX>=RULES.nativeActorRightEdgeGuardExclusive)return false;
    const candidateX=actorX+Math.sign(direction)*RULES.nativeActorWallSideProbePixels,
        candidate=nativeActorMapAtPixels(tower,candidateX,probeY);
    const body=candidate?nativeActorBodyMapOccupied(tower,actorX,probeY):null;
    return !candidate||body;
}

function nativePreviewSpriteOrigin(preview){
    if(!preview||!Number.isInteger(preview.nativeKind)||!Number.isInteger(preview.nativeRotation))return null;
    const mask=NATIVE_PIECE_MASKS[(preview.nativeRotation&3)*8+preview.nativeKind];
    const minX=Math.min(...mask.map(([x])=>x)),maxY=Math.max(...mask.map(([,y])=>y));
    // The 64px GBA outline keeps the full 3x3 mask's padded origin. In
    // particular, subtracting minY here double-shifts centered one-row pieces
    // when they rotate (the I and short bar jump by an extra tile).
    return{x:preview.x-minX,y:preview.y+maxY+1};
}

export class Tower {
    constructor(p, random, fieldIndex=0) {
        this.p=p; this.random=random; this.rows=[];this.nextOwner=1;
        this.egg={x:p.columns/2+RULES.startOffset,y:0,vy:0,ground:true,dive:0,wet:0,boost:0,stun:0,facing:1,
            offTower:false,swimming:false,waterTime:0,waterEjected:false,
            walking:false,floating:false};
        this.crates=[]; this.held=null; this.placing=null; this.interruptedPlacing=null; this.nativePreviewRotation=null; this.attacks=[];this.explosions=[];
        this.completedFloorEffects=[];
        this.nativeFillerAnimations=[];
        this.nativePickupParticles=Array(RULES.nativeParticleCapacity).fill(null);
        this.bombs=[];this.hammers=[];this.clouds=[];this.fieldIndex=fieldIndex;this.jumpSerial=0;
        this.nativeProjectileVisualAngles=Array(CPU_PARAMETERS.projectileSlots).fill(0);
        this.nativeFrame=0;
        this.nativePostThrowFreezeTicks=0;
        this.nativeLoadingInitialBoard={pieces:0,cells:0};
        if(p.nativeConfig&&p.columns===RULES.nativeInitialBoardColumns){
            const round=p.nativeRound??p.nativeConfig.round;
            const pieces=nativeInitialTowerPieces(p.nativeConfig,round,fieldIndex);
            this.nativeLoadingInitialBoard={pieces:pieces.length,cells:pieces.reduce((n,piece)=>n+piece.cells.length,0)};
            for(const piece of pieces)for(const cell of piece.cells)
                this.setCell(cell.x,cell.y,piece.kind+1,piece.owner,0,cell.nativeArt);
            if(pieces.length){
                this.nextOwner=Math.max(...pieces.map(piece=>piece.owner))+1;
                // These are terrain already present at round start; they do
                // not earn a new line score when the player later places a piece.
                for(const row of this.rows)if(row?.cells.every(Boolean))row.sealed=true;
            }
        }
        this.bubble={active:false,life:RULES.bubbleInitialWait,x:0,y:RULES.nativeBoardFloor+RULES.bubbleWaterlineBias,vx:0,vy:0,animation:0,escapeCounter:0,captured:false,
            rightBoundary:Math.max(0,(p.columns-3)*RULES.projectilePixels),
            ceiling:RULES.nativeActorFloor-(p.goal-4)*RULES.projectilePixels};
        this.jumper={type:RULES.jumperType,active:false,life:RULES.bubbleInitialWait,x:0,y:RULES.nativeBoardFloor+RULES.bubbleWaterlineBias,
            vx:0,vy:0,variant:0,animation:0,animationClock:0,captured:false,splashed:false,
            rightBoundary:RULES.jumperRightBoundary+(p.columns-7)*RULES.projectilePixels};
        this.space={active:false,life:RULES.bubbleInitialWait,x:0,y:RULES.nativeBoardFloor+RULES.bubbleWaterlineBias,
            vx:0,vy:0,variant:fieldIndex,animation:0,animationClock:0,
            spawnX:RULES.spaceSpawnX+(p.columns-7)*RULES.projectilePixels};
        this.spaceSecondary={side:fieldIndex,active:false,life:RULES.spaceSecondaryInitialWait,x:0,y:RULES.nativeBoardFloor+RULES.bubbleWaterlineBias,
            vx:0,vy:0,angle:0,speed:0,animation:0,animationClock:0,
            fieldStride:RULES.spaceSecondaryFieldStride+(p.columns-7)*RULES.projectilePixels,
            turnRight:RULES.spaceSecondaryTurnRight+(p.columns-7)*RULES.projectilePixels};
        this.dragon={side:fieldIndex,active:false,life:RULES.bubbleInitialWait,x:0,y:RULES.nativeBoardFloor+RULES.bubbleWaterlineBias,
            vx:0,vy:0,angle:0,speed:0,animation:0,animationClock:0,variant:fieldIndex,
            baseX:RULES.dragonBaseX+(p.columns-7)*RULES.projectilePixels,splashed:false};
        this.castle={...this.dragon,captured:false,biteStarted:false};
        this.pirateSecondary={side:fieldIndex,active:false,life:RULES.spaceSecondaryInitialWait,x:0,y:RULES.nativeBoardFloor+RULES.bubbleWaterlineBias,
            vx:0,vy:0,speed:0,animation:0,animationClock:0,stolen:null,
            fieldStride:RULES.pirateSecondaryFieldStride+(p.columns-7)*RULES.projectilePixels,
            exitRight:RULES.pirateSecondaryExitRight+(p.columns-7)*RULES.projectilePixels,
            reverseX:RULES.pirateSecondaryReverseX+(p.columns-7)*RULES.projectilePixels};
        // One native stream per field. In the captured Survival layout field
        // 0 selects 0x02011ab0 and field 1 selects 0x02011ab4; both begin from
        // the same seed in the measured hard-idle state.
        this.nativeEnemySeed=(p.nativeEnemySeed??p.seed)&0xffff;
        this.castleSecondary={side:fieldIndex,active:false,life:RULES.spaceSecondaryInitialWait,x:0,y:RULES.nativeBoardFloor+RULES.bubbleWaterlineBias,
            vx:0,vy:0,animation:0,animationClock:0,stolen:null,
            startRight:RULES.castleSecondaryStartRight+(p.columns-7)*RULES.projectilePixels,
            exitRight:RULES.castleSecondaryExitRight+(p.columns-7)*RULES.projectilePixels,
            stopLeft:RULES.castleSecondaryStopLeft+(p.columns-7)*RULES.projectilePixels};
        this.dragonSecondary={active:false,life:RULES.spaceSecondaryInitialWait,x:0,y:RULES.nativeBoardFloor+RULES.bubbleWaterlineBias,
            vx:0,vy:0,angle:0,speed:0,animation:0,animationClock:0,variant:fieldIndex,
            variantX:RULES.dragonSecondaryVariantX+(p.columns-7)*RULES.projectilePixels,
            rightBoundary:RULES.dragonSecondaryRight+(p.columns-7)*RULES.projectilePixels};
        this.factorySecondary={...this.castleSecondary,type:RULES.factorySecondaryType,
            wingClock:RULES.factorySecondaryWingClock,wingPhase:0,poseForward:true};
        this.parkSecondary={...this.dragon,life:RULES.spaceSecondaryInitialWait,stolen:null};
        this.jungleSecondary={...this.parkSecondary,type:RULES.jungleSecondaryType};
        this.parkPrimary={...this.dragon,captured:false,
            fieldStride:RULES.parkPrimaryFieldStride+(p.columns-7)*RULES.projectilePixels,
            reverseRight:RULES.parkPrimaryReverseRight+(p.columns-7)*RULES.projectilePixels,
            exitRight:RULES.parkPrimaryExitRight+(p.columns-7)*RULES.projectilePixels};
        this.beanstalkSecondary={...this.dragon,life:RULES.spaceSecondaryInitialWait,stolen:null};
        // The ROM initializes the water surface from the Survival table's
        // height word: screenY = height * 16 + 8. Keep the board-space value
        // used by erosion/hazards consistent with that field baseline.
        const nativeWaterline=nativeWaterlineAtFrame(p.nativeConfig,this.nativeFrame);
        this.water=nativeWaterline===null?-RULES.defaultWaterDepth:
            (RULES.nativeActorFloor+RULES.bubbleWaterlineBias-nativeWaterline)/RULES.projectilePixels;
        this.previousWater=null;
        this.time=0; this.spawn=0.25; this.erode=0;this.nativeWaterOffset=0;
        this.score=0; this.lines=0;
        // Round 9+ configurations can start with completed floors. Seed both
        // display latches from that board before the first countdown sprite.
        this.nativeDividerProgress=this.nativeCountFullFloors();
        this.nativeDividerPendingProgress=this.nativeDividerProgress;
        this.lost=false; this.won=false;
        this.flash=0; this.bird=null; this.hazard=RULES.hazardInterval;
        this.notice='Catch a crate!'; this.noticeTime=4; this.risk=0;
        this.incompleteFloors=this.countIncompleteFloors();this.unstableTime=0;
        this.collapse={active:false,floor:null,clock:0,duration:0};this.collapseTimers=new Map();
        this.collapseWave=null;this.previousCollapseWave=null;
        if(p.nativeConfig){
            // ROM0x080025de: initial delays depend on this round's config,
            // not the first Hard arena's difficulty-five baseline.
            const wait=RULES.nativeEnemyInitialWait;
            for(const key of ['bubble','jumper','space','dragon','castle','parkPrimary']){
                this[key].difficulty=p.nativeConfig.primary;
                this[key].life=wait.primary-wait.difficultyStep*p.nativeConfig.primary;
            }
            for(const key of ['spaceSecondary','pirateSecondary','castleSecondary','dragonSecondary','factorySecondary','parkSecondary','jungleSecondary','beanstalkSecondary']){
                this[key].difficulty=p.nativeConfig.secondary;
                this[key].life=wait.secondary-wait.difficultyStep*p.nativeConfig.secondary;
            }
        }
        this.nativePickups=p.hazards&&p.difficulty==='hard'?{seed:this.nativeEnemySeed,bag:[],remaining:0,clock:0,
            weights:p.nativeConfig?.weights,divisor:p.nativeConfig?.divisor}:null;
        this.nativeLoadingWork=[];
        if(this.nativePickups){
            const passes=Math.max(1,Math.min(RULES.pickupInitializationPasses,
                Math.trunc(p.nativePickupPrefillPasses??1)));
            for(let pass=0;pass<passes;pass++){
                const loadingWork=createNativeLoadingWork();this.nativeLoadingWork.push(loadingWork);
                if(pass>0){
                    this.crates=[];
                    this.nativePickups={seed:this.nativeEnemySeed,bag:[],remaining:0,clock:0,
                        weights:p.nativeConfig?.weights,divisor:p.nativeConfig?.divisor};
                }
                for(let frame=0;frame<RULES.pickupPrefillSteps;frame++){
                    this.advancePickupSpawn();
                    for(const c of this.crates){const m=advancePickupMotion(c.nativeMotion,RULES.nativeBoardFloor+RULES.bubbleWaterlineBias);
                        recordNativeLoadingPickup(loadingWork,m,c.nativeKind);
                        c.x=(m.x+RULES.pickupCenterBias)/RULES.projectilePixels;c.y=(RULES.nativeActorFloor-m.y+RULES.pickupActorBias)/RULES.projectilePixels;c.age+=RULES.step;}
                }
            }
            this.spawn=this.nativePickups.clock*RULES.step;this.lastNativeSpawn=this.spawn;
        }
    }
    advancePickupSpawn(){
        const s=this.nativePickups;
        if(--s.clock>=0)return;
        s.seed=this.nativeEnemySeed;const motion=nextNativePickup(s,this.nativeFrame);this.nativeEnemySeed=s.seed;
        if(this.p.crateInterval!==DEFAULTS.crateInterval)s.clock=Math.max(0,Math.round(s.clock*this.p.crateInterval/DEFAULTS.crateInterval));
        if(motion&&this.crates.length<RULES.pickupPoolSize)this.crates.push(nativePickupItem(motion,this.p.columns));
    }
    advanceIntroPickups(){
        if(!this.nativePickups)return;
        this.nativeFrame++;this.advancePickupSpawn();
        for(const c of this.crates){
            const m=advancePickupMotion(c.nativeMotion,RULES.nativeActorFloor-this.water*RULES.projectilePixels+RULES.bubbleWaterlineBias);
            c.x=(m.x+RULES.pickupCenterBias)/RULES.projectilePixels;
            c.y=(RULES.nativeActorFloor-m.y+RULES.pickupActorBias)/RULES.projectilePixels;c.age+=RULES.step;
            c.nativeSwayFrame=this.nativeFrame-1+(this.nativePickupSwayFrameOffset??0);
            if(c.nativeKind>=8&&this.nativeFrame%RULES.pickupSparklePeriod===0&&Math.floor(m.x)>=-15&&Math.floor(m.x)<112)
                this.emitNativeParticle(Math.floor(m.x)+RULES.nativeParticleInset,Math.floor(m.y+RULES.nativeParticleInset),2,2);
        }
        this.spawn=this.nativePickups.clock*RULES.step;this.lastNativeSpawn=this.spawn;
    }
    cell(x,y) { return y<0 ? 1 : this.rows[y]?.cells[x]||0; }
    height() { let y=this.rows.length; while(y&&!this.rows[y-1]?.cells.some(Boolean))y--; return y; }
    top(x) { for(let y=this.height()-1;y>=0;y--)if(this.cell(x,y))return y+1; return 0; }
    row(y) { return this.rows[y]||(this.rows[y]={cells:Array(this.p.columns).fill(0),
        owners:new Uint32Array(this.p.columns),materials:new Uint8Array(this.p.columns),
        nativeArt:new Uint16Array(this.p.columns),filler:Array(this.p.columns).fill(null),sealed:false}); }
    setCell(x,y,color,owner=0,material=0,nativeArt=0,filler=null) {
        const row=this.row(y);row.cells[x]=color;
        row.owners[x]=color?(owner||this.nextOwner++):0;row.materials[x]=color?material:0;
        (row.nativeArt??=new Uint16Array(this.p.columns))[x]=color?nativeArt:0;
        (row.filler??=Array(this.p.columns).fill(null))[x]=color?filler:null;
    }
    say(text) { this.notice=text; this.noticeTime=2; }
    queueNativeSound(id,phase=this.nativeAudioPhase??NATIVE_SOUND_EVENT_PHASE[id]??NATIVE_SOUND_PHASE.actor,rank=1) {
        if(this.nativeAudioFrameEvents)this.nativeAudioFrameEvents.push({id,phase,field:this.fieldIndex,rank});
        else (this.nativeAudioEvents??=[]).push(id);
    }
    emitNativeParticle(x,y,type=2,phase=1,beforeCamera=false){
        if(this.nativeParticleQueue){this.nativeParticleQueue.push({tower:this,x,y,type,phase,beforeCamera});return;}
        this.allocateNativeParticle(x,y,type,phase,null,beforeCamera);
    }
    allocateNativeParticle(x,y,type=2,phase=1,postCamera=null,beforeCamera=false){
        const view=RULES.nativeParticleView,
            // ROM 0x080190d0 runs piece placement (completion bonus / row sparks)
            // and loose pickups after camera update 0x0801904e. Only boots sparkles
            // (phase 0, 0x0800f73c) run in actor motion before camera update.
            effectiveCamera=phase>=1&&!beforeCamera&&postCamera!==null?postCamera:(this.nativeRenderFrame?.camera??0),
            camera=view.cameraReference-effectiveCamera*RULES.projectilePixels,
            screenX=this.fieldIndex*view.fieldPitch+x,screenY=Math.round(y-camera);
        if(screenX<0||screenX>=view.width||screenY<view.top||screenY>=view.height)return;
        const slot=this.nativePickupParticles.findIndex(p=>!p||(p.type===3?
            this.nativeFrame-p.bornFrame>=RULES.nativeBlastTicks:
            p.type===4?
            this.nativeFrame-p.bornFrame>=25:
            this.nativeFrame-p.bornFrame>RULES.completionStarDuration));
        if(slot>=0)this.nativePickupParticles[slot]={field:this.fieldIndex,x,y,type,bornFrame:this.nativeFrame};
    }
    landing(cells,x,ceiling=this.height()+5) {
        if(cells.some(([cx])=>x+cx<0||x+cx>=this.p.columns))return null;
        let y=Math.min(this.p.goal+RULES.safetyRows-4,Math.floor(ceiling));
        const fits=yy=>cells.every(([cx,cy])=>yy+cy>=0&&!this.cell(x+cx,yy+cy));
        if(!fits(y))return null;
        while(y>0&&fits(y-1))y--;
        return y;
    }
    preview() {
        if(!this.held?.cells)return null;
        const native=nativePreview(this);if(native!==undefined)return native;
        const cells=this.held.cells, width=Math.max(...cells.map(p=>p[0]))+1;
        const x=Math.max(0,Math.min(this.p.columns-width,Math.floor(this.egg.x)-(width>>1)));
        const y=this.landing(cells,x,this.egg.y+1);
        return y===null?null:{cells,x,y};
    }
    advanceNativePreviewRotation() {
        const orientation=nativeHeldRotation(this.held);
        if(orientation===null){this.nativePreviewRotation=null;return;}
        let state=this.nativePreviewRotation;
        if(!state||state.held!==this.held){
            const angle=orientation*Math.PI/2;
            const origin=nativePreviewSpriteOrigin(nativePreview(this));
            if(!origin){this.nativePreviewRotation=null;return;}
            state=this.nativePreviewRotation={held:this.held,angle,target:angle,
                spriteGridX:origin.x,spriteGridY:origin.y,targetSpriteGridY:origin.y,
                lastLogicalGridX:origin.x,lastLogicalGridY:origin.y,
                affineMatrix:nativePreviewTurnMatrix(orientation,1,0),turn:null,turnQueue:[]};
            return;
        }
        if(!state.turn&&state.turnQueue.length){
            const direction=state.turnQueue.shift();
            state.turn={direction,tick:0,startAngle:state.angle,
                orientation:Math.round(state.angle/(Math.PI/2)),
                startSpriteGridY:state.spriteGridY,targetSpriteGridY:state.targetSpriteGridY,
                screenYDelta:(state.spriteGridY-state.targetSpriteGridY)*RULES.projectilePixels};
        }
        let activeTurn=state.turn;
        if(state.turn){
            const turn=state.turn;
            turn.tick=Math.min(RULES.previewRotationFrames,turn.tick+1);
            state.affineMatrix=nativePreviewTurnMatrix(turn.orientation,turn.direction,turn.tick);
            const progress=turn.tick===RULES.previewRotationFrames?Math.PI/2:
                Math.atan2(Math.abs(state.affineMatrix[1]),state.affineMatrix[0]);
            state.angle=turn.startAngle+turn.direction*progress;
            if(turn.tick===RULES.previewRotationFrames){
                state.angle=turn.startAngle+turn.direction*Math.PI/2;
                state.turn=null;
            }
        }
        // The landing outline is anchored to a discrete board placement column,
        // not the actor's sub-cell X coordinate. Following egg.x here made the
        // 64px outline slide between grid columns while the ROM keeps it snapped.
        const origin=nativePreviewSpriteOrigin(nativePreview(this));
        if(origin){
            const logicalDeltaX=origin.x-state.lastLogicalGridX;
            if(logicalDeltaX)state.spriteGridX+=logicalDeltaX;
            state.lastLogicalGridX=origin.x;
            const logicalDelta=origin.y-state.lastLogicalGridY;
            if(logicalDelta){
                state.spriteGridY+=logicalDelta;state.targetSpriteGridY+=logicalDelta;
                if(activeTurn){activeTurn.startSpriteGridY+=logicalDelta;activeTurn.targetSpriteGridY+=logicalDelta;}
            }
            state.lastLogicalGridY=origin.y;
        }
        if(activeTurn){
            const shift=nativePreviewOamYShift(activeTurn.tick,Math.sign(activeTurn.screenYDelta));
            state.spriteGridY=activeTurn.startSpriteGridY-Math.sign(activeTurn.screenYDelta)*
                shift/RULES.projectilePixels;
            if(activeTurn.tick===RULES.previewRotationFrames)state.spriteGridY=activeTurn.targetSpriteGridY;
        }else{
            // Outside a captured quarter-turn, the outline follows the exact
            // integer landing cell. Easing this anchor created fractional-cell
            // positions whenever the landing row changed during a jump.
            state.spriteGridX=origin?.x??state.spriteGridX;
            state.spriteGridY=origin?.y??state.targetSpriteGridY;
        }
    }
    advanceNativePreviewPosition(){
        const origin=nativePreviewSpriteOrigin(nativePreview(this));
        if(!origin){this.nativePreviewPosition=null;this.nativePreviewRotation=null;return;}
        const fixed=RULES.actorFixedScale,
            targetX=Math.round((origin.x*RULES.projectilePixels-RULES.previewPositionOriginBias)*fixed),
            targetY=Math.round((RULES.previewPositionWorldYReference-origin.y*RULES.projectilePixels)*fixed);
        const previous=this.nativePreviewPosition;
        const approach=(current,target)=>{
            const delta=target-current;
            return current+(Math.abs(delta)>RULES.previewPositionSnapPixels*fixed?
                Math.floor(delta/2**RULES.previewPositionBlendShift):delta);
        };
        this.nativePreviewPosition=previous?{xQ16:approach(previous.xQ16,targetX),
            yQ16:approach(previous.yQ16,targetY)}:{xQ16:targetX,yQ16:targetY};
        const targetAngle=nativeHeldRotation(this.held)*RULES.nativeQuarterTurn,
            oldRotation=this.nativePreviewRotation,
            angle=previous&&oldRotation?.held===this.held&&Number.isInteger(oldRotation.nativeAngle)?
                nativePreviewAngleStep(oldRotation.nativeAngle,targetAngle):targetAngle;
        this.nativePreviewRotation={held:this.held,nativeAngle:angle,angle:angle/RULES.nativeFullTurn*Math.PI*2,
            paletteKind:Number.isInteger(this.nativePiecePaletteMaterial)?this.nativePiecePaletteMaterial:null,
            paletteColor:Number.isInteger(this.nativePreviewPaletteInitialColor)?this.nativePreviewPaletteInitialColor:null,
            target:targetAngle/RULES.nativeFullTurn*Math.PI*2,affineMatrix:nativePreviewAngleMatrix(angle),
            spriteGridX:origin.x,spriteGridY:origin.y,targetSpriteGridY:origin.y,turn:null,turnQueue:[]};
    }
    complete({allowBonus=true,completedRow=null,emitSparks=true,bonusCount=null}={}) {
        let count=0,highestCompleted=-1;
        for(let y=0;y<this.rows.length;y++){
            const row=this.rows[y];
            if(row&&!row.sealed&&row.cells.every(Boolean)){
                row.sealed=true;count++;
                highestCompleted=y;
            }
        }
        const incomplete=this.rows.filter(row=>row?.cells.some(Boolean)&&!row.cells.every(Boolean)).length;
        if(incomplete>=RULES.unstableFloors){this.requestFloorCollapse(this.time);if(this.placing)this.queueNativeSound(14,NATIVE_SOUND_PHASE.board);}
        // 0800e6c0..e6d8 uses the ordinary placement cue when this throw
        // completes no row. Filler scans are not a normal piece landing.
        if(!count){if(this.placing)this.queueNativeSound(SFX.place);return;}
        const sparkRow=completedRow??highestCompleted;
        // 0x0800e440 emits one row of seven sparks, even for a multi-floor
        // completion. These share the fourteen native slots with loose tools.
        // ROM 0x0800c2bc keeps the first completed row found (stored at 0x02030ea4).
        // Filler placement does not run 0x0800e40e ([0x02030ea4] == 0) and does not emit row sparks.
        if(emitSparks){
            for(let x=0;x<this.p.columns;x++)this.emitNativeParticle(
                x*RULES.projectilePixels+RULES.nativeParticleInset,
                RULES.nativeBoardFloor-(sparkRow+1)*RULES.projectilePixels+RULES.nativeParticleInset,1);
        }
        this.lines+=count; this.score+=count*RULES.completeScore;
        this.flash=0.5; this.say(`${count} complete floor${count>1?'s':''}!`);const awardedBonusCount=bonusCount??count;
        if(emitSparks&&awardedBonusCount>0)this.queueNativeSound(awardedBonusCount===3?SFX.completeTriple:awardedBonusCount===2?SFX.completeDouble:SFX.completeSingle);
        if(allowBonus&&awardedBonusCount>=2)this.addCompletionBonus(awardedBonusCount);
    }
    // ROM 0x0800d5a8: each free cell is an independent owner, one empty row
    // above its own column. The normal row scan subsequently makes it fall.
    addCompletionBonus(count){
        const kind=this.placing?.nativeHeld?.nativeKind;
        for(let x=0;x<this.p.columns;x++){
            const selected=count===2?x%2===0:kind===0?x!==3:
                kind===7?x!==2&&x!==4:kind===5||kind===6?x%2===1:true;
            if(!selected)continue;
            const y=this.top(x)+RULES.completionBonusGap;
            this.setCell(x,y,RULES.completionBonusColor,0,RULES.completionBonusMaterial,0,{bonus:true});
            this.emitNativeParticle(x*RULES.projectilePixels+RULES.nativeParticleInset,
                RULES.nativeBoardFloor-(y+2)*RULES.projectilePixels+RULES.nativeParticleInset,1);
        }
    }
    knockOff() {
        this.egg.stun=RULES.stunTime; this.egg.dive=RULES.stunTime;
        this.egg.ground=false; this.egg.vy=-4; this.held=null;
        // Native support-hold ignores off-tower actors; without this the
        // actor was re-grounded immediately and the knock-off did nothing.
        this.egg.offTower=true;this.egg.nativeFillerMotion=false;
    }
    strikeLightning(actorPosition=null,soundPhase){
        const e=this.egg;
        if(e.lightning||e.bubble||e.carried||e.swimming||e.nativeWaterRise||e.nativeWaterReleaseKick||e.stun>0)return false;
        // Native state 7 preserves momentum. Its control/gravity change appears
        // one physics tick after the hit; no invented downward velocity kick.
        const interruptedItem=this.held??this.placing?.nativeHeld;
        if(this.placing){
            if(actorPosition){e.x=actorPosition.x;e.y=actorPosition.y;}
            if(Number.isFinite(this.placing.nativeVelocityY))e.vy=this.placing.nativeVelocityY;
            this.interruptedPlacing=this.placing;
            this.placing=null;
        }
        if(interruptedItem&&this.nativePickups){
            const dropped=discardedPickup(interruptedItem,(e.x-1)*RULES.projectilePixels,
                RULES.nativeActorFloor-e.y*RULES.projectilePixels,this.nativeActorVelocityX??0,this.p.columns);
            if(dropped&&this.crates.length<RULES.pickupPoolSize){
                // Late enemy contact needs the pickup tick already missed.
                // Clouds/projectiles can hit BEFORE the regular pass: then
                // that pass will advance the new item, so do not do it twice.
                if(!this.nativePickupMotionPassPending)advancePickupMotion(dropped.nativeMotion,
                    RULES.nativeActorFloor-this.water*RULES.projectilePixels+RULES.bubbleWaterlineBias);
                this.crates.push(dropped);
            }
        }
        this.held=null;
        this.nativeActorState=this.nativeActorNextState=7;
        e.lightning={pending:1};this.queueNativeSound(SFX.injury,soundPhase);this.say('Lightning!');return true;
    }
    advanceClouds(){
        // The last two OAM submissions outlive the active gameplay timer.
        this.nativeRenderClouds=this.clouds.length?[]:(this.nativeRenderClouds??[])
            .filter(cloud=>cloud.renderCounter===1).map(cloud=>({...cloud,renderCounter:0}));
        if(this.nativeReplacedCloudDisplay){
            this.nativeRenderClouds.push(...this.nativeReplacedCloudDisplay);
            this.nativeReplacedCloudDisplay=null;
        }
        for(let i=this.clouds.length-1;i>=0;i--){
            const cloud=this.clouds[i];
            const rawCounter=RULES.cloudTicks-1-Math.max(0,Math.round((this.time-cloud.bornAt)/RULES.step));
            cloud.counter=Math.max(0,rawCounter);
            if(cloudStriking(cloud.counter)&&cloud.counter%RULES.cloudPulsePeriod===RULES.cloudPulseLast)
                this.queueNativeSound(SFX.thunder);
            this.nativeRenderClouds.push({...cloud,renderCounter:rawCounter+1});
            if(!cloud.counter){this.clouds.splice(i,1);continue;}
            // 0x0801af88..afc2 calls the strict INTEGER-pixel hit box at
            // 0x080049ec. Comparing continuous tile coordinates can hit one
            // update early when the actor is still exactly 20 pixels away.
            const scale=RULES.projectilePixels,radius=RULES.cloudRadius*scale,
                dx=Math.floor(cloud.x*scale)-Math.floor(this.egg.x*scale),
                dy=Math.floor(RULES.nativeActorFloor-(cloud.y-RULES.cloudHitLift)*scale)-
                    Math.floor(RULES.nativeActorFloor-this.egg.y*scale);
            if(cloudStriking(cloud.counter)&&Math.abs(dx)<radius&&Math.abs(dy)<radius)this.strikeLightning(null,NATIVE_SOUND_PHASE.cloud);
        }
    }
    contactNativeProjectile(b,source){
        const projectiles=b.item==='hammer'?source.hammers:source.bombs,
            index=projectiles.indexOf(b),span=this.p.columns+RULES.bombFieldGap,
            local=b.x-this.fieldIndex*span,scale=RULES.projectilePixels;
        if(index<0||b.item!=='hammer'&&(this.held||this.placing?.nativeHeld)||local<0||local>=this.p.columns)return false;
        // Shared contact runs after both actor handlers but before carry alters
        // the target's position. Preserve that swimming sample when present.
        if(Math.abs(Math.floor(local*scale)-scale/2-Math.floor((this.egg.x-1)*scale))>=RULES.bombNativeCatchRadius||
            Math.abs(Math.floor(RULES.nativeBoardFloor-b.y*scale)-scale-
                Math.floor(this.egg.nativeWaterCameraY??RULES.nativeActorFloor-this.egg.y*scale))>=RULES.bombNativeCatchRadius)return false;
        if(b.item==='hammer')this.strikeLightning(null,NATIVE_SOUND_PHASE.projectile);
        else{
            this.held={item:'bomb',nativeKind:8,nativeVariant:0,fuse:b.fuse};
            this.nativeProjectileCaughtThisTick=true;
        }
        projectiles.splice(index,1);return true;
    }
    availableProjectileSlot(exclude=null){
        const occupied=new Set([...this.bombs,...this.hammers].filter(p=>p!==exclude).map(p=>p.nativeSlot));
        for(let i=0;i<CPU_PARAMETERS.projectileSlots;i++)if(!occupied.has(i))return i;
        return null;
    }
    launchProjectile(b,opponent){
        const occupied=new Set([...this.bombs,...this.hammers].filter(p=>p!==b).map(p=>p.nativeSlot));
        if(!Number.isInteger(b.nativeSlot)||occupied.has(b.nativeSlot))b.nativeSlot=this.availableProjectileSlot(b);
        if(b.nativeSlot===null)return false;
        b.flightCounter=-1;
        const span=this.p.columns+RULES.bombFieldGap,direction=this.fieldIndex===0?1:-1;
        const local=Math.max(0,Math.floor((this.egg.x-RULES.bombLaunchOffset)*RULES.projectilePixels)/RULES.projectilePixels);
        b.nativeTrajectory=(b.item==='bomb'||b.item==='hammer')&&this.p.columns===RULES.nativeActorMapColumns;
        // Use dispatch observes the integrated water body before the creature
        // overwrites its carry position, as do camera and enemy contacts.
        const launchY=b.nativeTrajectory&&Number.isFinite(this.egg.nativeWaterCameraY)?
            (RULES.nativeActorFloor-this.egg.nativeWaterCameraY)/RULES.projectilePixels:this.egg.y;
        b.x=local+this.fieldIndex*span;b.y=launchY+RULES.projectileActorLift;b.vy=RULES.bombLaunchSpeed;
        // Native horizontal travel stops after crossing the 128 px boundary,
        // with screen-edge clamps; equality still permits one final step.
        b.targetX=Math.max(0,Math.min(this.p.columns*2,b.x+direction*(span+RULES.bombFlightSpeed*RULES.step)));
        b.nativeBornFrame=this.nativeFrame;
        // Visual slots survive projectile destruction/catching. Reusing a
        // slot resumes its flame clock rather than starting the atlas over.
        (this.nativeProjectileVisualAngles??=Array(CPU_PARAMETERS.projectileSlots).fill(0))[b.nativeSlot]=0;
        b.nativeFlameClock=this.nativeProjectileFlameClocks?.[b.nativeSlot]??0;
        b.liftY=(opponent?.top(Math.min(this.p.columns-1,Math.floor(local+RULES.bombSize/2)))??0)-
            (b.nativeTrajectory?RULES.bombNativeHeightBias:0);
        // ROM 0x080043d4..4414 saves min(launch Y, target Y)-64;
        // 0x080044e6..44f2 adds those 64 back for the flight gate. Our
        // launch sample includes its first -4px step, so undo that step.
        b.nativeTravelStopY=Math.floor(Math.min(
            RULES.nativeBoardFloor-b.y*RULES.projectilePixels+RULES.bombLaunchSpeed*RULES.projectilePixels*RULES.step,
            RULES.nativeActorFloor-b.liftY*RULES.projectilePixels));
        b.phase='lift';b.pending=false;
        return true;
    }
    advanceNativeBomb(b,opponent){
        // ROM 0x08004458..04890 uses the occupied map cell, not a skyline.
        const q=RULES.actorFixedScale,px=RULES.projectilePixels,
            oldY=Math.round((RULES.nativeBoardFloor-b.y*px)*q),
            oldV=Math.round(-b.vy*px*RULES.step*q),wasLanded=b.flightCounter>0;
        let x=Math.round(b.x*px*q),y=oldY,v=oldV;
        if(wasLanded){
            b.flightCounter--;y+=v;v=Math.min(v+RULES.bombNativeGravityQ16,RULES.bombNativeFallLimitQ16);
        }else if(b.flightCounter===-1){
            y+=v;
            if(Math.floor(oldY/q)<b.nativeTravelStopY){
                v+=RULES.bombNativeGravityQ16;
                x=Math.max(0,Math.min(this.p.columns*2*px*q,
                    x+(this.fieldIndex===0?1:-1)*RULES.bombFlightSpeed*RULES.step*px*q));
            }
        }
        const span=this.p.columns+RULES.bombFieldGap,
            receiverIndex=this.fieldIndex===0?
                (Math.floor(x/q)>this.p.columns*px-1?1:0):
                (Math.floor(x/q)<=this.p.columns*px?0:1),
            receiver=receiverIndex===this.fieldIndex?this:opponent,
            probeY=wasLanded?oldY:y,
            column=Math.trunc((Math.floor(x/q)+px/2)/px)-receiverIndex*span,
            clamped=Math.max(0,Math.min(this.p.columns-1,column)),
            row=RULES.nativeActorMapBottomRow-1-Math.trunc(Math.floor(probeY/q)/px);
        if(receiver){
            const water=(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-receiver.water*px)*q;
            if(probeY>water)return false;
            // 0x08018e70 runs both 4458 projectile passes before 0x0800b074 placements.
            // Projectiles probe the tower map as it existed at the start of the tick.
            const sampleCell=(col,r)=>{
                if(r<0)return 1;
                if(receiver.nativeRenderFrame?.rows)return receiver.nativeRenderFrame.rows[r]?.cells[col]||0;
                return receiver.cell(col,r);
            };
            if(sampleCell(clamped,row)){
                if(wasLanded){
                    if(v>0){v=Math.floor(-v/2);if(v>-RULES.bombNativeContactQ16)v=0;}
                    else if(sampleCell(clamped,row+1))v-=RULES.bombNativeContactQ16;
                }else if(receiver!==this&&column>=0&&column<this.p.columns){
                    if(b.item==='hammer'){receiver.emitNativeParticle(clamped*px,Math.trunc(Math.floor(probeY/q)/px)*px,4,0);receiver.startHammerCollapse(this.time);this.queueNativeSound(SFX.hammerHit,NATIVE_SOUND_PHASE.projectile);receiver.say('Hammer!');return false;}
                    b.flightCounter=RULES.projectileCatchTicks;v=Math.floor(-v/2);b.landed=true;
                }
            }else if(wasLanded&&receiver!==this&&this.time>receiver.time+RULES.step/2){
                // Both native input handlers (including filler) precede the
                // projectile passes. Recheck an empty contact cell after the
                // destination's input has had a chance to fill it this tick.
                (receiver.nativePendingBombTerrain??=[]).push({source:this,bomb:b,row,column:clamped});
            }
        }
        // The screen-Y argument is sampled before rebound integration
        // (0x080045f4..460a), but after the initial airborne integration.
        b.nativeSpriteY=wasLanded?b.y:(RULES.nativeBoardFloor-y/q)/px;
        b.x=x/q/px;b.y=(RULES.nativeBoardFloor-y/q)/px;
        b.vy=-v/q/px/RULES.step;
        return true;
    }
    advanceBubble(escape=false,enemyActorPosition=null){
        if(this.p.nativeConfig?.primary===0)return;
        const b=this.bubble,e=this.egg,scale=RULES.projectilePixels;
        const actorPos=enemyActorPosition??e;
        const actorX=actorPos.x*scale-RULES.bubbleActorAnchor;
        // 13974 spawns the bubble before 19910 advances the field waterline.
        // A subpixel spawn offset later changes the coordinate-based motion.
        advanceBubbleMotion(b,actorX,this.nativeFrame,RULES.nativeActorFloor-(this.previousWater??this.water)*scale+RULES.bubbleWaterlineBias,escape&&b.captured,this.factorySecondary.active,RULES.nativeActorFloor-actorPos.y*scale);
        if(!b.active||b.life<=RULES.bubbleReleaseLife){
            if(b.captured){b.captured=false;e.bubble=false;e.ground=false;e.offTower=false;
                this.nativeActorState=this.nativeActorNextState=0;}
            return;
        }
        const actorY=RULES.nativeActorFloor-actorPos.y*scale;
        if(!e.lightning&&!e.swimming&&!e.introDescent&&e.stun<=0&&
            Math.abs(b.x+RULES.bubbleActorAnchor-actorX)<RULES.bubbleHitRadius&&
            Math.abs(b.y+RULES.bubbleActorAnchor-actorY)<RULES.bubbleHitRadius){
            if(!b.captured){this.nativePreCaptureCameraActorY=Math.floor(actorY);
                this.say('Caught! Place or rotate to escape');}
            b.captured=true;e.bubble=true;
        }
        if(b.captured){
            const interruptedItem=this.held??this.placing?.nativeHeld;
            // Throw interpolation leaves native +0x18 unchanged. Retain that
            // velocity during capture so ordinary motion resumes with it.
            if(Number.isFinite(this.placing?.nativeVelocityY))e.vy=this.placing.nativeVelocityY;
            // 136B8 switches even an interrupted throw to captured handler 6.
            this.nativeActorState=this.nativeActorNextState=6;
            e.x=(b.x+RULES.bubbleSpriteCenter)/scale;
            e.y=(RULES.nativeActorFloor-b.y-RULES.bubbleActorAnchor)/scale;
            e.ground=false;e.offTower=true;this.held=null;this.placing=null;
            // The shared capture handler drops inventory after the pickup pass,
            // including a piece whose throw was interrupted (11AC4 / BE88).
            if(interruptedItem&&this.nativePickups){
                const dropped=discardedPickup(interruptedItem,e.x*scale-RULES.bubbleActorAnchor,
                    RULES.nativeActorFloor-e.y*scale,this.nativeActorVelocityX??0,this.p.columns);
                if(dropped&&this.crates.length<RULES.pickupPoolSize){
                    advancePickupMotion(dropped.nativeMotion,
                        RULES.nativeActorFloor-(this.previousWater??this.water)*scale+RULES.bubbleWaterlineBias);
                    this.crates.push(dropped);
                }
            }
        }
    }
    advanceDragonSecondary(actorPosition=null){
        if(this.p.nativeConfig?.secondary===0)return;
        const d=this.dragonSecondary,e=this.egg,scale=RULES.projectilePixels;
        const y=RULES.nativeActorFloor-(actorPosition?.y??e.y)*scale;
        const line=RULES.nativeActorFloor-(this.previousWater??this.water)*scale+RULES.bubbleWaterlineBias;
        advanceDragonSecondaryMotion(d,y,line,this.dragon.active);
        // 0x08012f44..12fa0: a falling rock creates one surface splash when
        // its Y+17 probe enters water. The +0x72 latch, like animation,
        // survives rock respawns; 0x08011e18..11e3e does not clear it.
        if(d.active&&!d.splashed&&d.y+NATIVE_WATER.enemySplashProbePixels>line){
            emitNativeWaterSplash(this,Math.round((d.x+NATIVE_WATER.enemySplashX)*RULES.actorFixedScale),NATIVE_WATER.enemySplashWidth);
            d.splashed=true;
        }
        if(!d.active||e.lightning||e.swimming||e.introDescent||e.stun>0)return;
        const x=(actorPosition?.x??e.x)*scale-RULES.bubbleActorAnchor;
        if(Math.abs(Math.floor(d.x)-Math.floor(x))<RULES.dragonHitRadius&&Math.abs(Math.floor(d.y)-Math.floor(y))<RULES.dragonHitRadius){
            if(this.strikeLightning(actorPosition)){this.queueNativeSound(SFX.explode);this.say('Rock!');}
        }
    }
    advanceDragon(actorPosition=null){
        if(this.p.nativeConfig?.primary===0)return;
        const d=this.dragon,e=this.egg,scale=RULES.projectilePixels;
        const y=RULES.nativeActorFloor-(actorPosition?.y??e.y)*scale;
        const line=RULES.nativeActorFloor-(this.previousWater??this.water)*scale+RULES.bubbleWaterlineBias;
        advanceDragonMotion(d,y,line,line,this.nativeFrame,this.dragonSecondary.active);
        const descending=d.angle>RULES.nativeHalfTurn;
        if(d.active&&descending&&!d.splashed&&d.y+NATIVE_WATER.enemySplashProbePixels>line){
            emitNativeWaterSplash(this,Math.round((d.x+NATIVE_WATER.enemySplashX)*RULES.actorFixedScale),NATIVE_WATER.enemySplashWidth);
            d.splashed=true;
        }
        if(!d.active||e.lightning||e.swimming||e.introDescent||e.stun>0)return;
        const x=e.x*scale-RULES.bubbleActorAnchor;
        if(Math.abs(Math.floor(d.x)-Math.floor(x))<RULES.dragonHitRadius&&Math.abs(Math.floor(d.y)-Math.floor(y))<RULES.dragonHitRadius){
            if(this.strikeLightning())this.say('Dragon!');
        }
    }
    advanceSpaceSecondary(actorPosition=null){
        if(this.p.nativeConfig?.secondary===0)return;
        const s=this.spaceSecondary,e=this.egg,scale=RULES.projectilePixels;
        const y=RULES.nativeActorFloor-(actorPosition?.y??e.y)*scale;
        advanceSpaceSecondaryMotion(s,y,RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias,this.space.active);
        if(!s.active||e.lightning||e.swimming||e.bubble||e.carried||e.introDescent||e.stun>0)return;
        const x=(actorPosition?.x??e.x)*scale-RULES.bubbleActorAnchor;
        if(Math.abs(Math.floor(s.x-s.vx*RULES.spaceSecondaryHitLead+RULES.spaceSecondaryHitX)-Math.floor(x))<RULES.spaceSecondaryHitRadius&&
            Math.abs(Math.floor(s.y-s.vy*RULES.spaceSecondaryHitLead+RULES.spaceSecondaryHitY)-Math.floor(y))<RULES.spaceSecondaryHitRadius){
            if(this.strikeLightning(actorPosition)){this.queueNativeSound(SFX.explode);this.say('Missile!');}
        }
    }
    advanceSpace(actorPosition=null){
        if(this.p.nativeConfig?.primary===0)return;
        const s=this.space,e=this.egg,scale=RULES.projectilePixels;
        advanceSpaceMotion(s,RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias,
            this.spaceSecondary.active,RULES.nativeActorFloor-e.y*scale);
        const phase=s.previousAnimation;
        if(!s.active||phase<RULES.spaceHitFirst||phase>RULES.spaceHitLast||e.lightning||e.swimming||e.introDescent||e.stun>0)return;
        const x=(actorPosition?.x??e.x)*scale-RULES.bubbleActorAnchor,
            y=RULES.nativeActorFloor-(actorPosition?.y??e.y)*scale;
        if(Math.abs(Math.floor(s.x+RULES.spaceHitAnchor)-Math.floor(x))<RULES.spaceHitRadius&&
            Math.abs(Math.floor(s.y+RULES.spaceHitAnchor-RULES.spaceHitOffsets[phase])-Math.floor(y))<RULES.spaceHitRadius){
            this.flash=RULES.spaceHitFlash;
            this.nativeSupportBypassTicks=Math.round(RULES.spaceHitFlash/RULES.step);
            if(this.held||this.placing?.nativeHeld){
                const stolen=this.held??this.placing.nativeHeld;
                // Type7 clears the native inventory even during state4.
                // E0E8/E778 then aborts before interpolating the actor again.
                if(this.placing?.nativeHeld){
                    if(actorPosition){e.x=actorPosition.x;e.y=actorPosition.y;}
                    e.vy=this.placing.nativeVelocityY??0;
                    this.nativeThrowCancelledThisTick=true;
                    this.nativeActorState=4;this.nativeActorNextState=0;
                    this.nativePostThrowFreezeTicks=RULES.nativePostThrowFreezeTicks;
                }
                // BE88 releases the inventory into the ordinary pickup pool;
                // the tentacle does not delete its boxed item. This contact
                // follows pickup dispatch, so include its first motion tick.
                if(this.nativePickups){
                    const dropped=discardedPickup(stolen,(e.x-1)*scale,
                        RULES.nativeActorFloor-e.y*scale,this.nativeActorVelocityX??0,this.p.columns);
                    if(dropped&&this.crates.length<RULES.pickupPoolSize){
                        advancePickupMotion(dropped.nativeMotion,
                            RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias);
                        this.crates.push(dropped);
                    }
                }
                this.held=null;this.placing=null;this.say('Piece stolen!');
            }
        }
    }
    nativeTheftProtected(){
        // Shared thief contact (0x080132f2..13320) rejects throw states and
        // current/pending animation selectors 7/8, including the tail after
        // state 4 has finished. Enemy contact also precedes fresh pickup dispatch.
        const selector=this.fieldIndex===0?this.nativePlayerAnimationSelector:
            this.nativeRivalAnimationSelector;
        return this.nativePickupCaughtThisTick||selector===7||selector===8;
    }
    advanceFactorySecondary(randomSeed=undefined,enemyActorPosition=null){
        if(this.p.nativeConfig?.secondary===0)return;
        const d=this.factorySecondary,e=this.egg,scale=RULES.projectilePixels;
        // Throw-state (native state 4) changes the actor anchor after the
        // secondary enemy update; that state must use the saved prior anchor.
        const actorX=(enemyActorPosition?.x??e.x)*scale-RULES.bubbleActorAnchor,
            actorY=e.nativeWaterCameraY??RULES.nativeActorFloor-(enemyActorPosition?.y??e.y)*scale,
            contactX=e.x*scale-RULES.bubbleActorAnchor,contactY=RULES.nativeActorFloor-e.y*scale;
        const motionSeed=d.active&&d.life?(randomSeed===undefined?
            (this.nativeEnemySeed=nativeRandomStep(this.nativeEnemySeed)):randomSeed):this.nativeEnemySeed;
        advanceCastleSecondaryMotion(d,actorX,actorY,RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias,motionSeed,this.bubble.active);
        if(!d.active||d.stolen||!this.held||this.nativeTheftProtected()||this.placing||e.lightning||e.swimming||e.bubble||e.carried||e.introDescent||e.stun>0)return;
        if(Math.abs(Math.floor(d.x+RULES.factorySecondaryHitX)-Math.floor(contactX))<RULES.factorySecondaryHitRadius&&
            Math.abs(Math.floor(d.y+RULES.factorySecondaryHitY)-Math.floor(contactY))<RULES.factorySecondaryHitRadius){
            d.stolen=this.held.item==='bomb'?{...this.held,fuse:undefined}:this.held;this.held=null;d.life=RULES.castleSecondaryStealLife;this.say('Piece stolen!');
        }
    }
    advanceBeanstalkSecondary(actorPosition=null){
        if(this.p.nativeConfig?.secondary===0)return;
        const d=this.beanstalkSecondary,e=this.egg,scale=RULES.projectilePixels;
        const actorX=(actorPosition?.x??e.x)*scale-RULES.bubbleActorAnchor,
            actorY=e.nativeWaterCameraY??RULES.nativeActorFloor-(actorPosition?.y??e.y)*scale;
        // Shared spawn gate 11C3C..11C48 requires BOTH enemy types enabled.
        advanceBeanstalkSecondaryMotion(d,actorX,actorY,RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias,this.jumper.active,
            this.p.nativeConfig?.primary!==0);
        if(!d.active||d.stolen||!this.held||this.nativeTheftProtected()||this.placing||e.lightning||e.swimming||e.bubble||e.carried||e.introDescent||e.stun>0)return;
        if(Math.abs(Math.floor(d.x+RULES.beanstalkSecondaryHitX)-Math.floor(actorX))<RULES.beanstalkSecondaryHitRadius&&
            Math.abs(Math.floor(d.y+RULES.beanstalkSecondaryHitY)-Math.floor(actorY))<RULES.beanstalkSecondaryHitRadius){
            d.stolen=this.held.item==='bomb'?{...this.held,fuse:undefined}:this.held;this.held=null;d.life=RULES.beanstalkSecondaryStealLife;this.say('Piece stolen!');
        }
    }
    advanceParkPrimary(water=this.water){
        if(this.p.nativeConfig?.primary===0)return;
        const d=this.parkPrimary,e=this.egg,scale=RULES.projectilePixels;
        const actorX=e.x*scale-RULES.bubbleActorAnchor,actorY=RULES.nativeActorFloor-e.y*scale;
        const waterline=RULES.nativeActorFloor-water*scale+RULES.bubbleWaterlineBias;
        // 11C3C..11C48 skips the shared height gate when the configured
        // secondary enemy is disabled; the duck can then spawn earlier.
        advanceParkPrimaryMotion(d,actorY,waterline,this.nativeFrame,this.parkSecondary.active,
            this.p.nativeConfig?.secondary!==0);
        const phase=d.previousAnimation;
        const hitX=d.x+(d.vx>0?RULES.parkPrimaryHitRight:RULES.parkPrimaryHitLeft);
        const hitY=d.y+RULES.parkPrimaryHitY-RULES.parkPrimaryHitOffsets[phase];
        const hit=d.active&&phase>0&&!e.lightning&&!e.swimming&&!e.introDescent&&e.stun<=0&&
            Math.abs(Math.floor(hitX)-Math.floor(actorX))<RULES.parkPrimaryHitRadius&&
            Math.abs(Math.floor(hitY)-Math.floor(actorY))<RULES.parkPrimaryHitRadius;
        if(hit){
            if(!d.captured)this.flash=RULES.spaceHitFlash;
            d.captured=true;e.carried=true;e.ground=false;e.offTower=true;this.held=null;this.placing=null;
            e.x=(Math.max(RULES.castleActorMinX,Math.min(RULES.castleActorMaxX+(this.p.columns-7)*scale,hitX))+RULES.bubbleActorAnchor)/scale;
            e.y=(RULES.nativeActorFloor-Math.max(RULES.castleActorMinY,Math.min(waterline,hitY)))/scale;
        }
        if(!hit||d.animationWrapped){
            if(d.captured){d.captured=false;e.carried=false;e.ground=false;e.offTower=false;}
        }
    }
    advanceParkSecondary(jungle=false,actorPosition=null){
        if(this.p.nativeConfig?.secondary===0)return;
        const d=jungle?this.jungleSecondary:this.parkSecondary,e=this.egg,scale=RULES.projectilePixels;
        const actorX=(actorPosition?.x??e.x)*scale-RULES.bubbleActorAnchor,
            actorY=e.nativeWaterCameraY??RULES.nativeActorFloor-(actorPosition?.y??e.y)*scale;
        advanceParkSecondaryMotion(d,actorY,RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias,jungle?this.jumper.active:this.parkPrimary.active);
        // The native bird drops its stolen pickup after climbing above the
        // player; it retains its arc and does not begin a new pursuit.
        if(d.stolen&&d.y<actorY-RULES.parkSecondaryDropLift){
            const motion={kind:d.stolen.nativeKind,variant:d.stolen.nativeVariant??0,
                x:d.x+RULES.stolenPickupX,y:d.y+RULES.stolenPickupY,
                vx:0,vy:RULES.stolenPickupVelocity,state:1,active:true,
                rightEdge:RULES.pickupRightEdge+(this.p.columns-7)*scale,
                midpoint:RULES.pickupWaterMidpoint+(this.p.columns-7)*scale/2,
                exitRight:RULES.pickupExitRight+(this.p.columns-7)*scale};
            // Original item update follows enemy AI, so the creation tick
            // includes its first gravity/drag step.
            advancePickupMotion(motion,RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias);
            // 0x0801311a creates a fresh inert item from kind/variant. The
            // actor's armed-bomb fuse is not part of the enemy inventory.
            const returned=Number.isInteger(motion.kind)?nativePickupItem(motion,this.p.columns):
                {nativeMotion:motion,age:0,x:(motion.x+RULES.pickupCenterBias)/scale,
                    y:(RULES.nativeActorFloor-motion.y+RULES.pickupActorBias)/scale};
            this.crates.push({...d.stolen,...returned,fuse:undefined});d.stolen=null;
        }
        if(!d.active||d.stolen||!this.held||this.nativeTheftProtected()||this.placing||e.lightning||e.swimming||e.bubble||e.carried||e.introDescent||e.stun>0)return;
        const sign=d.variant?-1:1,lead=RULES.parkSecondaryHitLead;
        const bias=jungle?RULES.jungleSecondaryHitBias:RULES.parkSecondaryHitBias;
        const hitX=d.x+sign*lead*d.vy+bias+RULES.parkSecondaryHitXCorrection;
        const hitY=d.y-sign*lead*d.vx+bias+RULES.parkSecondaryHitYCorrection;
        if(Math.abs(Math.floor(hitX)-Math.floor(actorX))<RULES.parkSecondaryHitRadius&&
            Math.abs(Math.floor(hitY)-Math.floor(actorY))<RULES.parkSecondaryHitRadius){
            d.stolen=this.held.item==='bomb'?{...this.held,fuse:undefined}:this.held;this.held=null;d.life=RULES.castleSecondaryStealLife;this.say('Piece stolen!');
        }
    }
    advancePirateSecondary(){
        if(this.p.nativeConfig?.secondary===0)return;
        const d=this.pirateSecondary,e=this.egg,scale=RULES.projectilePixels;
        const actorX=e.x*scale-RULES.bubbleActorAnchor,actorY=RULES.nativeActorFloor-e.y*scale;
        advancePirateSecondaryMotion(d,actorY,RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias,this.nativeFrame,this.castle.active);
        if(!d.active||d.stolen||!this.held||this.nativeTheftProtected()||this.placing||e.lightning||e.swimming||e.bubble||e.carried||e.introDescent||e.stun>0)return;
        if(Math.abs(Math.floor(d.x+RULES.pirateSecondaryHitX)-Math.floor(actorX))<RULES.pirateSecondaryHitRadius&&
            Math.abs(Math.floor(d.y+RULES.pirateSecondaryHitY)-Math.floor(actorY))<RULES.pirateSecondaryHitRadius){
            d.stolen=this.held.item==='bomb'?{...this.held,fuse:undefined}:this.held;this.held=null;d.life=RULES.castleSecondaryStealLife;this.say('Piece stolen!');
        }
    }
    advanceCastleSecondary(randomSeed=undefined,enemyActorPosition=null){
        if(this.p.nativeConfig?.secondary===0)return;
        const d=this.castleSecondary,e=this.egg,scale=RULES.projectilePixels;
        const actorX=(enemyActorPosition?.x??e.x)*scale-RULES.bubbleActorAnchor,
            // Enemy steering precedes the water creature's carry overwrite,
            // just as the factory secondary's shared steering routine does.
            actorY=e.nativeWaterCameraY??RULES.nativeActorFloor-(enemyActorPosition?.y??e.y)*scale,
            contactX=e.x*scale-RULES.bubbleActorAnchor,contactY=RULES.nativeActorFloor-e.y*scale;
        const motionSeed=d.active&&d.life?(randomSeed===undefined?
            (this.nativeEnemySeed=nativeRandomStep(this.nativeEnemySeed)):randomSeed):this.nativeEnemySeed;
        // OBJ compares the actor at the enemy phase, before state 4 rewrites
        // its throw trajectory. Preserve that sample alongside previousX/Y.
        d.previousActorX=d.nativeActorX??actorX;d.nativeActorX=actorX;
        advanceCastleSecondaryMotion(d,actorX,actorY,RULES.nativeActorFloor-this.water*scale+RULES.bubbleWaterlineBias,motionSeed,this.castle.active);
        // Native enemy contact precedes pickup dispatch. The motion is applied
        // later here, but an item caught this tick was not yet available to steal.
        if(!d.active||d.stolen||!this.held||this.nativeTheftProtected()||this.placing||e.lightning||e.swimming||e.bubble||e.carried||e.introDescent||e.stun>0)return;
        if(Math.abs(Math.floor(d.x+RULES.castleSecondaryHitX)-Math.floor(contactX))<RULES.castleSecondaryHitRadius&&
            Math.abs(Math.floor(d.y+RULES.castleSecondaryHitY)-Math.floor(contactY))<RULES.castleSecondaryHitRadius){
            d.stolen=this.held.item==='bomb'?{...this.held,fuse:undefined}:this.held;this.held=null;d.life=RULES.castleSecondaryStealLife;this.say('Piece stolen!');
        }
    }
    advanceCastle(){
        if(this.p.nativeConfig?.primary===0)return;
        const d=this.castle,e=this.egg,scale=RULES.projectilePixels;
        const actorX=e.x*scale-RULES.bubbleActorAnchor,actorY=RULES.nativeActorFloor-e.y*scale;
        // Enemy AI runs before this tick's water update. An unblocked rising
        // waterline otherwise shifts the entire next flight by one water step.
        const waterline=RULES.nativeActorFloor-(this.previousWater??this.water)*scale+RULES.bubbleWaterlineBias;
        d.animationFrames=this.artStage==='pirate'?RULES.pirateAnimationFrames:RULES.dragonAnimationFrames;
        const wasActive=d.active;
        advanceCastleMotion(d,actorY,waterline,this.artStage==='pirate'?this.pirateSecondary.active:this.castleSecondary.active);
        if(!wasActive&&d.active)d.nativeAudioSplashed=false;
        if(this.artStage==='castle'&&d.active&&!d.nativeAudioSplashed&&d.angle>RULES.nativeHalfTurn&&d.y+NATIVE_WATER.enemySplashProbePixels>waterline){d.nativeAudioSplashed=true;this.queueNativeSound(SFX.waterSplash);}
        const hitX=d.x+RULES.castleHitLead*d.vx+RULES.castleHitX,hitY=d.y+RULES.castleHitLead*d.vy+RULES.castleHitY;
        const hit=d.active&&!e.lightning&&!e.swimming&&!e.introDescent&&e.stun<=0&&
            Math.abs(Math.floor(hitX)-Math.floor(actorX))<RULES.dragonHitRadius&&
            Math.abs(Math.floor(hitY)-Math.floor(actorY))<RULES.dragonHitRadius;
        if(!hit){if(d.captured){d.captured=false;e.carried=false;e.ground=false;e.offTower=false;}return;}
        if(!d.biteStarted){d.biteStarted=true;d.life=RULES.castleBiteFrames;}
        else if(--d.life<=0)d.life=RULES.castleBiteFrames;
        d.captured=true;e.carried=true;e.ground=false;e.offTower=true;this.held=null;this.placing=null;
        e.x=(Math.max(RULES.castleActorMinX,Math.min(RULES.castleActorMaxX+(this.p.columns-7)*scale,hitX))+RULES.bubbleActorAnchor)/scale;
        e.y=(RULES.nativeActorFloor-Math.max(RULES.castleActorMinY,Math.min(waterline,hitY)))/scale;
    }
    advanceJumper(actorPosition=null){
        if(this.p.nativeConfig?.primary===0)return;
        const j=this.jumper,e=this.egg,scale=RULES.projectilePixels;
        const actorX=(actorPosition?.x??e.x)*scale-RULES.bubbleActorAnchor,
            actorY=e.nativeWaterCameraY??RULES.nativeActorFloor-(actorPosition?.y??e.y)*scale;
        const waterline=RULES.nativeActorFloor-(this.previousWater??this.water)*scale+RULES.bubbleWaterlineBias;
        advanceJumperMotion(j,actorX,waterline,this.artStage==='beanstalk'?this.beanstalkSecondary.active:this.jungleSecondary.active,actorY);
        if(j.active&&j.vy>0&&!j.splashed&&j.y+NATIVE_WATER.enemySplashProbePixels>waterline){
            emitNativeWaterSplash(this,Math.round((j.x+NATIVE_WATER.enemySplashX)*RULES.actorFixedScale),NATIVE_WATER.enemySplashWidth);
            j.splashed=true;
        }
        const jungle=j.type===RULES.jungleType,hitX=jungle?RULES.jungleHitX:RULES.jumperHitX,hitY=jungle?RULES.jungleHitY:RULES.jumperHitY;
        const hit=j.active&&j.variant===0&&!e.lightning&&!e.swimming&&!e.introDescent&&e.stun<=0&&
            Math.abs(Math.floor(j.x+hitX)-Math.floor(actorX))<RULES.jumperHitRadius&&
            Math.abs(Math.floor(j.y+hitY)-Math.floor(actorY))<RULES.jumperHitRadius;
        if(!hit){if(j.captured){j.captured=false;e.carried=false;e.ground=false;e.offTower=false;
            this.nativeActorState=this.nativeActorNextState=0;
            // The carry handler releases directly into state 1 when wet.
            // Deferring this to ordinary movement adds a dry physics tick.
            if(!j.active&&actorY+NATIVE_WATER.entryProbePixels>waterline)beginNativeWaterRecovery(this,RULES,false);
        }return;}
        if(!j.captured)j.nativeAudioMouthClosed=false;
        if(jungle&&--j.life<=0){j.mouthClosed=!j.mouthClosed;j.life=RULES.jungleBiteFrames;j.nativeAudioMouthClosed=!j.nativeAudioMouthClosed;this.queueNativeSound(j.nativeAudioMouthClosed?27:SFX.injury);}
        const interruptedItem=this.held??this.placing?.nativeHeld;
        if(!j.captured){this.nativePreCaptureCameraActorY=Math.floor(actorY);if(!jungle)this.queueNativeSound(32);}
        j.captured=true;e.carried=true;e.ground=false;e.offTower=true;this.held=null;this.placing=null;
        // Captured actors use handler 6 / selector 9, not the interrupted
        // throw handler (ROM 0x0800e068..e098).
        this.nativeActorState=this.nativeActorNextState=6;
        e.x=(j.x+hitX+RULES.bubbleActorAnchor)/scale;
        e.y=(RULES.nativeActorFloor-Math.min(waterline,j.y+hitY))/scale;
        if(interruptedItem&&this.nativePickups){
            const dropped=discardedPickup(interruptedItem,e.x*scale-RULES.bubbleActorAnchor,
                RULES.nativeActorFloor-e.y*scale,this.nativeActorVelocityX??0,this.p.columns);
            if(dropped&&this.crates.length<RULES.pickupPoolSize){
                // Capture dispatch follows the ordinary pickup pass. BE88
                // drops the interrupted inventory and advances its first tick.
                advancePickupMotion(dropped.nativeMotion,waterline);
                this.crates.push(dropped);
            }
        }
    }
    removeFloor(y) {
        this.queueNativeSound(SFX.floorRemoved);
        // ARM 0x03001840 stops copying at the first empty row above the
        // removed floor. Separate higher islands retain their coordinates.
        for(let r=y;;r++){
            const above=this.rows[r+1];
            if(!above?.cells.some(Boolean)){this.rows[r]=null;this.row(r);break;}
            this.rows[r]=above;
        }
        this.egg.ground=false; this.flash=0.35;
    }
    nativePieceGroup(owner,anchorY){
        const cells=[],radius=RULES.nativePieceNeighborhood;
        for(let y=Math.max(0,anchorY-radius);y<=Math.min(this.rows.length-1,anchorY+radius);y++){
            const row=this.rows[y];if(!row)continue;
            for(let x=0;x<this.p.columns;x++)if(row.cells[x]&&row.owners[x]===owner)
                cells.push({x,y,color:row.cells[x],owner,material:row.materials[x],nativeArt:row.nativeArt?.[x]||0,filler:row.filler?.[x]||null});
        }
        return cells;
    }
    nativePieceSupports(group){
        const supports=[],seen=new Set();
        for(const c of group){
            if(c.y>0&&!this.cell(c.x,c.y-1))continue;
            const owner=c.y===0?-1:this.rows[c.y-1]?.owners[c.x]||0;
            if(owner===c.owner||seen.has(owner))continue;
            seen.add(owner);supports.push({owner,x:c.x,y:c.y-1});
        }
        return supports;
    }
    mergeMutualSupports(owner,anchorY){
        // Native placement merges owners that directly support one another,
        // then queries the enlarged owner again (ARM 0x03001b90..1c64).
        if(!owner)return;
        for(;;){
            const group=this.nativePieceGroup(owner,anchorY);
            const support=this.nativePieceSupports(group).find(s=>s.owner>0&&
                this.nativePieceSupports(this.nativePieceGroup(s.owner,s.y)).some(other=>other.owner===owner));
            if(!support)return;
            for(const c of this.nativePieceGroup(support.owner,support.y))this.rows[c.y].owners[c.x]=owner;
        }
    }
    advanceLoosePieces(ownerLimit=Infinity){
        // ROM 0x0800cdb0 checks one row per native frame, left to right.
        // IWRAM 0x03001a34 gathers whole owners within three rows either side;
        // a different occupied owner directly below any cell prevents falling.
        const period=Math.max(RULES.nativeBoardRows,this.p.goal+RULES.nativeBoardRows-DEFAULTS.goal);
        const y=this.nativeFrame%period,row=this.rows[y],seen=new Set(),moves=[];
        if(!row)return moves;
        const scale=RULES.projectilePixels;
        const actorX=this.egg.x*scale-RULES.bubbleActorAnchor;
        const actorY=RULES.nativeActorFloor-this.egg.y*scale;
        const probeX=Math.floor((actorX+RULES.looseActorProbeX)/scale);
        const probeY=RULES.nativeBoardRows-1-Math.floor((actorY+RULES.looseActorProbeY)/scale);
        for(let x=0;x<this.p.columns;x++){
            const owner=row.owners[x];
            if(!row.cells[x]||!owner||owner>=ownerLimit||seen.has(owner))continue;
            seen.add(owner);
            const group=this.nativePieceGroup(owner,y);
            if(this.nativePieceSupports(group).length)continue;
            // CDB0 -> 3C8C (CEB8): before the first unsupported owner moves,
            // finish every pending filler tile, including tiles outside it.
            if(!moves.length){
                for(const entry of this.nativeFillerAnimations)entry.filler.nativePhase=2;
                this.nativeFillerAnimations.length=0;
            }
            // Bottom-to-top order preserves vertically adjacent cells.
            for(const c of group){
                this.setCell(c.x,c.y,0);
                this.setCell(c.x,c.y-1,c.color,c.owner,c.material,c.nativeArt,c.filler);
                this.rows[c.y].sealed=false;
            }
            for(const c of group){
                const r=this.rows[c.y-1];
                if(r&&!r.sealed&&r.cells.every(Boolean)){
                    r.sealed=true;
                    this.lines++;
                }
            }
            if(group.some(c=>c.x===probeX&&c.y===probeY)){
                this.egg.vy=RULES.looseActorLaunchPixels/(scale*RULES.step);
                this.egg.ground=false;
            }
            moves.push({owner,cells:group.map(c=>[c.x,c.y]),dy:-1});
        }
        return moves;
    }
    countIncompleteFloors(){
        let count=0;
        for(let y=0;y<this.height();y++)if(this.rows[y]?.cells.some(Boolean)&&!this.rows[y].cells.every(Boolean))count++;
        return count;
    }
    nativeCountFullFloors(){
        let count=0;
        for(let y=0;y<this.rows.length;y++){
            const row=this.rows[y];
            if(!row||!row.cells?.some(Boolean))break;
            if(row.cells.every(Boolean))count++;
        }
        return count;
    }
    advanceCollapse(dt){
        // Compatibility for explicit loaded active states: reconstruct the native
        // queue with a finished floor's remaining 16 animation ticks.
        if(this.collapse.active&&!this.collapseTimers.size){
            this.requestFloorCollapse(this.time-RULES.step,false);
            const highest=Math.max(...this.collapseTimers.keys());
            if(Number.isFinite(highest))this.collapseTimers.set(highest+1,{timer:RULES.collapseTailTicks-1,initial:RULES.collapseTailTicks-1});
        }
        if(this.time>(this.collapseBornAt??-Infinity)+1e-9)this.advanceCollapseCounter();
    }
    advanceCollapseCounter(){
        // Field updates run consecutively here, whereas ROM 18E70 runs BOTH
        // projectile passes before either destruction queue. A later field's
        // hammer can therefore replace a counter selection already made below.
        this.nativeCollapseCounterPass={time:this.time,floor:Math.max(...this.collapseTimers.keys()),
            wave:this.collapseWave,previousWave:this.previousCollapseWave};
        this.previousCollapseWave=this.collapseWave;
        const y=Math.max(...this.collapseTimers.keys()),entry=this.collapseTimers.get(y);
        this.nativeCollapseCounterPass.entry=entry;
        this.nativeCollapseCounterPass.timer=entry?.timer;
        this.collapseWave=entry&&entry.timer>=0&&entry.timer<RULES.collapseCancelTick?{floor:y,timer:entry.timer}:null;
        if(!entry){Object.assign(this.collapse,{active:false,floor:null,clock:0});this.hammerCollapse=null;return;}
        const old=entry.timer;entry.timer--;
        const row=this.rows[y],complete=row?.cells.every(Boolean);
        if(old===RULES.collapseCancelTick&&complete||old===0){this.collapseTimers.delete(y);}
        else if(old===RULES.collapseRemoveTick&&!complete){
            this.removeFloor(y);this.say('An incomplete floor collapsed!');
        }
        this.collapse.active=this.collapseTimers.size>0;this.collapse.floor=y;
        this.collapse.clock=(entry.initial-entry.timer)*RULES.step;
        this.collapse.duration=Math.max(1,entry.initial-RULES.collapseRemoveTick+1)*RULES.step;
        this.unstableTime=this.collapse.clock;
        if(!this.collapse.active)this.hammerCollapse=null;
    }
    requestFloorCollapse(eventTime,immediate=false){
        // ROM 0x08005bdc skips the highest INCOMPLETE floor, then queues
        // every lower incomplete floor, including those below complete floors.
        let roof=true;
        for(let y=this.height()-1;y>=0;y--){
            const count=this.rows[y]?.cells.filter(Boolean).length||0;
            if(!count||count===this.p.columns)continue;
            if(roof){roof=false;continue;}
            if(this.collapseTimers.has(y))continue;
            const timer=Math.max(RULES.collapseMinimumTimer,count*RULES.collapseCellSteps-RULES.collapseTimerLead);
            this.collapseTimers.set(y,{timer,initial:timer});
        }
        if(this.collapseTimers.size){
            this.collapse.active=true;this.collapseBornAt=eventTime;
            if(immediate)this.advanceCollapseCounter();
        }
    }
    startHammerCollapse(eventTime){
        const pass=this.nativeCollapseCounterPass,
            sameTick=pass&&Math.abs(pass.time-eventTime)<RULES.step/2;
        this.requestFloorCollapse(eventTime,false);
        if(sameTick){
            const highest=Math.max(...this.collapseTimers.keys());
            // Only a newly queued higher floor changes which timer was due.
            if(highest>pass.floor&&pass.entry&&pass.timer>RULES.collapseRemoveTick&&
                this.collapseTimers.get(pass.floor)===pass.entry&&pass.entry.timer===pass.timer-1){
                pass.entry.timer=pass.timer;
                this.collapseWave=pass.wave;
                this.previousCollapseWave=pass.previousWave;
                this.advanceCollapseCounter();
            }else this.advanceCollapseCounter();
        }else this.advanceCollapseCounter();
        if(this.collapseTimers.size)this.hammerCollapse={native:true,bornAt:eventTime};
    }
    explode(x,y,effectLift=0,eventTime=this.time,beforeCamera=false) {
        this.queueNativeSound(SFX.explode,NATIVE_SOUND_PHASE.projectile);
        const audioBlastCanHit=!this.egg.lightning&&!this.egg.bubble&&!this.egg.carried&&!this.egg.swimming&&!this.egg.nativeWaterRise&&!this.egg.nativeWaterReleaseKick&&this.egg.stun<=0;
        if(this.p.columns===RULES.nativeActorMapColumns){
            // 3F74 calls 3C8C before damage: pending filler cells become full
            // tiles, including cells outside the blast's destroyed footprint.
            for(const entry of this.nativeFillerAnimations)entry.filler.nativePhase=2;
            this.nativeFillerAnimations.length=0;
            const cx=Math.floor(x),cy=Math.floor(y),radius=RULES.nativeBlastRadius;
            const clear=(col,row)=>{if(this.cell(col,row)){this.setCell(col,row,0);this.rows[row].sealed=false;}};
            const flood=(col,row)=>{
                const owner=this.rows[row]?.owners?.[col],color=this.cell(col,row);
                if(!color)return;
                const pending=[[col,row]];
                while(pending.length){
                    const [a,b]=pending.pop(),r=this.rows[b];
                    if(!r?.cells[a]||(owner?r.owners?.[a]!==owner:r.cells[a]!==color))continue;
                    clear(a,b);
                    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])
                        if(a+dx>=0&&a+dx<this.p.columns&&b+dy>=0&&b+dy<this.rows.length)pending.push([a+dx,b+dy]);
                }
            };
            // ROM 0x08003ff4..416e: the inner cross removes individual
            // cells; the eight outer cells remove connected piece remnants.
            for(let col=cx-radius;col<=cx+radius;col++)for(let row=cy+radius;row>=cy-radius;row--){
                if(Math.abs(col-cx)===radius&&row!==cy||Math.abs(row-cy)===radius&&col!==cx)continue;
                if(col<0||col>=this.p.columns||row<0||row>RULES.nativeActorMapBottomRow)continue;
                if(Math.abs(col-cx)+Math.abs(row-cy)<=1)clear(col,row);else flood(col,row);
                // 0x08004094..409a omits effects for the four inner arms.
                if(Math.abs(col-cx)+Math.abs(row-cy)!==1)this.emitNativeParticle(col*RULES.projectilePixels,
                    (RULES.nativeActorMapBottomRow-row)*RULES.projectilePixels,3,1,beforeCamera);
                // 0x08003fda..3ff2 / 4148..4162: damage uses the actor's
                // two occupied grid cells, intersected with this blast diamond.
                // A radial distance from its feet misses the head at the edge.
                const actorRow=Math.ceil(this.egg.y);
                if(col===Math.floor(this.egg.x)&&(row===actorRow||row===actorRow+1)){
                    // The source Tower can be one tick ahead of its opponent.
                    // Native projectiles hit after both actor handlers: commit
                    // injury after the target's ordinary movement this tick.
                    if(eventTime>this.time+RULES.step/2){this.nativePendingBlastHit=true;this.nativePendingBlastSoundHits=(this.nativePendingBlastSoundHits??0)+Number(audioBlastCanHit);}
                    else if(!this.strikeLightning(null,NATIVE_SOUND_PHASE.projectile)&&audioBlastCanHit)this.queueNativeSound(SFX.injury,NATIVE_SOUND_PHASE.projectile);
                }
            }
            this.flash=0;this.say('BOOM!');
            if(this.placing?.nativeHeld){
                const projected=nativePreview(this,this.placing.nativeHeld,this.placing.nativeProjectionOrigin??{x:this.egg.x,y:this.egg.y});
                if(projected){
                    const mask=NATIVE_PIECE_MASKS[this.placing.nativeRotation*8+this.placing.nativeHeld.nativeKind],
                        maxY=Math.max(...mask.map(([,y])=>y));
                    this.placing.x=projected.x;this.placing.y=projected.y;
                    this.placing.targetX=this.placing.x-Math.min(...mask.map(([x])=>x))+RULES.throwActorXBias;
                    this.placing.targetY=this.placing.y+Math.max(...mask.filter(([x])=>x===Math.floor(RULES.throwActorXBias)).map(([,y])=>maxY-y))+1;
                    const pose=nativeThrowPose(this.placing,Math.floor(this.placing.ticks+1e-8)-1);
                    this.egg.x=pose.x;this.egg.y=pose.y;
                }
            }
            this.incompleteFloors=this.countIncompleteFloors();
            if(this.fieldIndex===0&&this.incompleteFloors>(this.nativeAudioIncompleteFloors??0)&&this.incompleteFloors>=NATIVE_SOUND_WARNING.minimumIncompleteFloors&&this.incompleteFloors<=NATIVE_SOUND_WARNING.maximumIncompleteFloors&&this.nativeAudioWarningFrame!==this.nativeFrame){this.queueNativeSound(SFX.towerWarning);this.nativeAudioWarningFrame=this.nativeFrame;}
            this.nativeAudioIncompleteFloors=this.incompleteFloors;
            this.risk=Math.min(1,this.incompleteFloors/RULES.warningFloors);
            return;
        }
        const hitOwners=new Set();
        for(let r=Math.max(0,Math.floor(y)-RULES.bombBlastCells);r<=Math.floor(y)+RULES.bombBlastCells;r++)
            for(let c=Math.max(0,Math.floor(x)-RULES.bombBlastCells);c<=Math.min(this.p.columns-1,Math.floor(x)+RULES.bombBlastCells);c++){
                const row=this.rows[r];if(row?.cells[c]){
                    if(row.owners[c])hitOwners.add(row.owners[c]);
                    else {this.setCell(c,r,0);row.sealed=false;}
                }
            }
        // Native cells reference whole piece entities. A blast destroys each
        // touched entity, including its cells outside the immediate footprint.
        for(let r=0;r<this.rows.length;r++){
            const row=this.rows[r];if(!row)continue;
            for(let c=0;c<this.p.columns;c++)if(hitOwners.has(row.owners[c])){
                this.setCell(c,r,0);row.sealed=false;
            }
        }
        if(Math.hypot(this.egg.x-x,this.egg.y-y)<RULES.bombKnockRadius){
            // Native blast damage enters the shared injury handler (0xf634),
            // retaining current momentum; the generic knock-off adds a kick.
            if(this.p.columns===RULES.nativeActorMapColumns)this.strikeLightning();
            else this.knockOff();
        }
        this.explosions.push({x,y:y+effectLift,age:0,birthTime:eventTime});
        this.flash=0; this.say('BOOM!');
    }
    use(opponent, nativeProjectionOrigin=null) {
        if(!this.held||this.placing)return false;
        const h=this.held;
        if(h.cells){
            const rejected=()=>{if(this.fieldIndex===0)this.queueNativeSound(SFX.toolUse);return false;};
            if(this.egg.nativeWaterRise||this.nativeWaterCreature?.carrying)return false;
            // FFFC tests the outline-valid flag prepared by the preceding
            // pass. Catching inventory alone has not prepared that flag yet.
            // Game clears nativePreviewPosition on a catch and prepares it
            // after the next input pass, matching this one-tick rejection.
            if(nativeProjectionOrigin&&this.p.columns===RULES.nativeActorMapColumns&&
                !this.nativePreviewPosition)return rejected();
            // C51C prepares the logical destination before actor movement;
            // FFFC consumes that destination after movement. The throw starts
            // from the new actor position, but must retain the old projection.
            const pos=nativeProjectionOrigin?nativePreview(this,h,nativeProjectionOrigin):this.preview();
            if(!pos){this.say('Jump or move to make room');return rejected();}
            const orientation=this.p.columns===7?nativeHeldRotation(h):null;
            const mask=orientation!==null?NATIVE_PIECE_MASKS[orientation*8+h.nativeKind]:null;
            const maskMaxY=mask?Math.max(...mask.map(([,y])=>y)):0;
            const nativeTargetHeight=mask?Math.max(...mask
                .filter(([x])=>x===Math.floor(RULES.throwActorXBias))
                .map(([,y])=>maskMaxY-y))+1:null;
            this.placing={...pos,color:h.color,material:h.material??SHAPE_MATERIALS[(h.color||1)-1]??0,
                nativeHeld:mask?h:null,nativeRotation:orientation,
                // Retain the actual palette before the throw queues its new
                // material upload. Culled outlines do not replace it with white.
                nativePaletteKind:this.nativePiecePaletteMaterial??null,
                nativeInitialPalette:this.nativePreviewPaletteInitialColor===0,
                nativeAngle:mask?(this.nativePreviewRotation?.nativeAngle??orientation*RULES.nativeQuarterTurn):null,ticks:0,
                time:RULES.throwTime,startY:this.egg.y+1,
                eggX:this.egg.x,eggY:this.egg.y,nativeVelocityY:this.egg.vy,
                nativeProjectionOrigin:mask?(nativeProjectionOrigin??{x:this.egg.x,y:this.egg.y}):null,
                targetX:mask?pos.x-Math.min(...mask.map(c=>c[0]))+RULES.throwActorXBias:Math.floor(this.egg.x)+0.5,
                // The actor lands on the highest occupied cell in the mask's
                // center column; the raw 3x3 mask's Y axis is inverted.
                targetY:mask?pos.y+nativeTargetHeight:
                    pos.y+Math.max(...pos.cells.map(c=>c[1]))+1};
            if(mask){this.nativeActorState=4;this.nativeActorNextState=4;}
            this.held=null;
            this.egg.vy=0;
            this.nativeActorVelocityX=0;
            this.egg.ground=false;
            this.egg.nativeFillerMotion=false;
            // Placement takes over the actor handler from a preceding L drop.
            // Its completion must enter the post-throw clip, not resume that
            // stale drop's airborne animation/integration path.
            this.egg.nativeDiveMotion=false;
            return true;
        }
        if(h.item==='boots'){this.queueNativeSound(SFX.boots);this.egg.boost=RULES.powerTime;this.say('Super boots!');}
        else if(h.item==='filler'){
            // 3CF8 keeps six pending cell animations. Before a seventh is
            // registered, 3C8C completes every existing entry and empties it.
            const animations=this.nativeFillerAnimations;
            // ROM 0x08003d50..3f14 walks supported gaps, preferring the
            // outside edge of the actor's half of the field. It is neither
            // a distance sort nor a scan limited to the actor's height.
            const center=Math.max(0,Math.min(this.p.columns-1,Math.floor(this.egg.x+RULES.fillerColumnBias)));
            const leftFirst=center<=Math.floor(this.p.columns/2);
            const footRow=RULES.nativeBoardRows-1-Math.floor((Math.floor(RULES.nativeActorFloor-this.egg.y*RULES.projectilePixels)+RULES.fillerFootPixels)/RULES.projectilePixels);
            let count=0,x=center,y=-1,highest=-4;
            const empty=(cx,cy)=>cx>=0&&cx<this.p.columns&&cy>=0&&cy<RULES.nativeBoardRows&&!this.cell(cx,cy);
            while(count<RULES.fillerCells){
                if(empty(x,y-1)){y--;continue;}
                if(empty(x,y)){
                    if(animations.length>=RULES.fillerAnimationCapacity){
                        for(const entry of animations)entry.filler.nativePhase=2;
                        animations.length=0;
                    }
                    const filler={born:this.nativeFrame,index:count,nativePhase:0};
                    this.setCell(x,y,7,0,1,0,filler);
                    animations.push({filler,timer:RULES.fillerAnimationTimers[count]});count++;
                    // FUN_08003e46 emits one falling star at each filled gap,
                    // independently of whether that cell completes a row.
                    this.emitNativeParticle(x*RULES.projectilePixels+RULES.nativeParticleInset,
                        (RULES.nativeBoardRows-1-y)*RULES.projectilePixels,1);
                    if(x===center&&y===footRow){
                        this.egg.vy=RULES.fillerHopSpeed;this.egg.ground=false;
                        this.egg.fillerFloatTicks=RULES.fillerFloatTicks;this.egg.nativeFillerMotion=true;
                    }
                    highest=Math.max(highest,y);
                }
                const first=x+(leftFirst?-1:1),second=x+(leftFirst?1:-1);
                if(empty(first,y))x=first;
                else if(empty(second,y))x=second;
                else if((x===center||y<highest&&empty(x,y+1))&&y+1<RULES.nativeBoardRows)y++;
                else if(x!==center)x=center;
                else break;
            }
            this.complete({allowBonus:false,emitSparks:false});
            // Filler commits the completed-floor counter in its use handler;
            // unlike a thrown piece, its marker is ready on the next OAM tick.
            // Historical completions include rows subsequently destroyed by
            // bombs. The native counter scans the currently occupied board.
            this.nativeDividerPendingProgress=this.nativeCountFullFloors();
            this.queueNativeSound(SFX.filler);
            this.say(`Filled ${count} gaps`);
        } else if(h.item==='cloud'&&opponent){
            this.queueNativeSound(SFX.toolUse);
            const column=Math.max(0,Math.min(this.p.columns-1,Math.floor(this.egg.x+RULES.cloudColumnBias)));
            const x=opponent.fieldIndex===0?Math.min(this.egg.x,this.p.columns-1):Math.max(this.egg.x,1);
            // The native field owns one cloud slot; another use replaces it.
            // Global cloud OAM is prepared before either actor can replace
            // its slot. P1 uses the item before the target Tower's update;
            // retain the old cloud's submission through that later update.
            if(opponent.nativeFrame<this.nativeFrame)opponent.nativeReplacedCloudDisplay=
                opponent.clouds.map(cloud=>({...cloud,renderCounter:cloud.counter}));
            opponent.clouds=[{x,y:opponent.top(column)+RULES.cloudHeight,bornAt:this.time,counter:RULES.cloudTicks-1}];
        } else if(h.item==='bomb'&&opponent){
            this.queueNativeSound(SFX.toolUse);
            const nativeSlot=this.availableProjectileSlot();
            if(nativeSlot===null)return false;
            this.bombs.push({item:'bomb',fuse:h.fuse??RULES.bombFuse,pending:true,nativeSlot});
        } else if(h.item==='hammer'&&opponent){
            this.queueNativeSound(SFX.toolUse);
            const nativeSlot=this.availableProjectileSlot();
            if(nativeSlot===null)return false;
            this.hammers.push({item:'hammer',pending:true,nativeSlot});
        } else if(opponent){
            opponent.attacks.push({item:h.item,delay:RULES.attackTravel,fuse:h.fuse??RULES.bombFuse,
                x:opponent.egg.x,y:opponent.egg.y+3});
        } else if(h.item==='bomb') {
            this.crates.push({...h,x:this.egg.facing>0?this.p.columns-0.5:0.5,y:this.egg.y+2});
        }
        this.held=null; return true;
    }
    update(dt,control={},opponent=null,afterResult=false) {
        if((this.lost||this.won)&&!afterResult)return;
        this.nativePickupMotionPassPending=true;
        // The native loose-owner scan precedes placement and bonus creation.
        // Our late-applied scan must not move owners created later this tick.
        const nativeLooseOwnerLimit=control.nativeMotion?this.nextOwner:Infinity;
        this.nativeActorHandlerState=this.nativeActorState??0;
        this.nativePickupCaughtThisTick=false;
        this.previousPreviousWater=this.previousWater??this.water;
        this.previousWater=this.water;
        this.previousPreviousNativeWaterWarning=this.previousNativeWaterWarning??this.nativeWaterWarning??false;
        this.previousNativeWaterWarning=this.nativeWaterWarning??false;
        if(!control.nativeMotion)this.advanceNativePreviewRotation();
        this.time+=dt;this.nativeFrame++; this.noticeTime-=dt; this.flash=Math.max(0,this.flash-dt);
        // The native water clock advances before actor/enemy/pickup motion.
        // A stale line can flip a floating pickup's buoyancy for a whole tick.
        let nativeWaterline=nativeWaterlineAtFrame(this.p.nativeConfig,this.nativeFrame);
        let nativeWaterlineCandidate=null;
        if(nativeWaterline!==null){
            const previousLine=RULES.nativeActorFloor+RULES.bubbleWaterlineBias-
                (this.water-this.nativeWaterOffset)*RULES.projectilePixels,
                rise=nativeWaterline-nativeWaterlineAtFrame(this.p.nativeConfig,this.nativeFrame-1);
            nativeWaterline=previousLine+rise;
            nativeWaterlineCandidate=nativeWaterline;
            const nativeRow=Math.floor((nativeWaterline-1)/RULES.projectilePixels)+1,
                y=RULES.nativeActorMapBottomRow-nativeRow;
            if(y>=0&&y<RULES.nativeActorMapRows&&
                (this.rows[y]?.cells.filter(Boolean).length??0)<this.p.columns)
                nativeWaterline=nativeRow*RULES.projectilePixels;
            this.water=(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-nativeWaterline)/RULES.projectilePixels+this.nativeWaterOffset;
        }
        // 0x08019910 warns only when water reaches a partly occupied row.
        // The number of incomplete floors controls a different destruction.
        const warningLine=RULES.nativeActorFloor-this.water*RULES.projectilePixels+RULES.bubbleWaterlineBias;
        let warningRow=RULES.nativeActorMapBottomRow-(Math.floor((warningLine-1)/RULES.projectilePixels)+1);
        const
            submergedCells=warningRow<0?this.p.columns:
                this.rows[warningRow]?.cells.filter(Boolean).length??0;
        this.nativeWaterWarning=submergedCells>0&&submergedCells<this.p.columns;
        // 19910 sets the result flag before the rival actor reads its keys.
        // The controller timers still advance, but an empty wet row releases
        // Up in this same tick rather than one update after defeat.
        const nativeWaterDefeatPending=nativeWaterline!==null&&warningRow>=0&&
            warningRow<RULES.nativeActorMapRows&&submergedCells===0&&
            this.nativeFrame>RULES.nativeWaterDefeatReadyFrame;
        if(control.nativeMotion&&this.fieldIndex===1&&nativeWaterDefeatPending){
            control={nativeMotion:true};this.nativeCameraControl=control;
        }
        // Native particle counter 0..14 advances every two updates.
        this.completedFloorEffects=this.completedFloorEffects.filter(effect=>this.nativeFrame<effect.bornFrame+RULES.completionStarDuration);
        for(const effect of this.explosions)effect.age=Math.max(0,this.time-effect.birthTime);
        this.explosions=this.explosions.filter(effect=>effect.age<RULES.bombEffectTime);
        this.interruptedPlacing=null;
        this.nativeThrowCancelledThisTick=false;
        const e=this.egg,actorAtFrameStart={x:this.egg.x,y:this.egg.y};
        // 0x0800f764..0x0800f9e0: states 1, 2, 4, 6 and field +0x1240 take
        // different branches (states 2 and 4 early-exit at 0x08010070) and
        // cannot win while airborne or during ascent through the tower.
        const nativeRescueEligible=control.nativeMotion&&this.nativeFrame>RULES.nativeRescueReadyFrame&&
            (this.nativeActorState??0)===0&&!e.swimming&&!e.nativeWaterRise&&!e.nativeWaterReleaseKick&&
            RULES.nativeActorFloor-actorAtFrameStart.y*RULES.projectilePixels+NATIVE_WATER.entryProbePixels<=
                RULES.nativeActorFloor-(this.previousWater??this.water)*RULES.projectilePixels+RULES.bubbleWaterlineBias;
        const nativeRescueRequested=nativeRescueEligible&&actorAtFrameStart.y>this.p.goal&&
            !e.introDescent&&!e.lightning&&!e.bubble&&!e.carried;
        this.nativeAnimationGround=false;
        let nativeLandingContact=false,enterNativeWater=false,nativeJumpSupported=false,nativeDiveSoundPlayed=false;
        e.nativeWaterCameraY=null;
        if(control.nativeMotion){
            advanceNativeWaterCreature(this,RULES,!(this.lost||opponent?.won||nativeWaterDefeatPending));
            if(e.nativeWaterReleaseKick){
                e.vy=-NATIVE_WATER.releaseKickVelocity/RULES.actorFixedScale/(RULES.projectilePixels*RULES.step);
                e.nativeWaterReleaseKick=false;e.nativeWaterRise=true;
            }
        }
        const enemyActorPosition=this.nativeActorState===4?actorAtFrameStart:null;
        if(control.nativeMotion&&this.nativePostThrowFreezeTicks>0){
            this.nativePostThrowFreezeTicks--;
            control={...control,nativeFreezeActor:true};
        }
        const bubbleEscape=Boolean(control.use||control.rotate);
        if(e.bubble||e.carried)control={};
        if(e.lightning){
            e.nativeInjuryMove=control.move??0;
            if(e.lightning.pending>0)e.lightning.pending--;
            control={nativeMotion:control.nativeMotion,move:control.move,fast:control.fast};
            this.nativeActorState=7;this.nativeActorNextState=7;
        }
        e.walking=false;e.floating=Boolean(control.float);
        // Native frame 4103/4104 of the long capture: the CPU activates boots while swimming and the ROM
        // zeroes the counter on the next update, so no sparkle or speed bonus is applied.
        if(control.nativeMotion&&e.swimming)e.boost=0;
        const hadBoost=e.boost>0;
        for(const key of ['boost','stun','dive'])e[key]=control.nativeMotion&&key==='boost'?
            Math.max(0,Math.round(e[key]/RULES.step)-1)*RULES.step:Math.max(0,e[key]-dt);
        const boostTicks=Math.round(e.boost/RULES.step);
        if(hadBoost&&boostTicks%RULES.bootsSparklePeriod===0)this.emitNativeParticle(
            Math.floor((e.x-1)*RULES.projectilePixels)+RULES.nativeParticleInset+
                ((boostTicks&RULES.bootsSparklePeriod)?RULES.projectilePixels:0),
            Math.floor(RULES.nativeActorFloor-e.y*RULES.projectilePixels)+RULES.bootsSparkleY,1,0);
        const discard=control.discard&&this.held?this.held:null,previousActorX=e.x;
        this.nativeDiscardedThisTick=Boolean(discard);
        if(discard)this.held=null;
        if(control.rotate&&this.held){
            if(this.held.cells){
                const orientation=nativeHeldRotation(this.held);
                const previewRotation=!control.nativeMotion&&orientation!==null&&this.nativePreviewRotation?.held===this.held?
                    this.nativePreviewRotation:null;
                if(previewRotation){
                    const direction=Math.sign(control.rotate);
                    const turns=Math.abs(Math.trunc(control.rotate));
                    previewRotation.target+=control.rotate*Math.PI/2;
                    for(let turn=0;turn<turns;turn++)previewRotation.turnQueue.push(direction);
                }
                this.held.cells=rotate(this.held.cells,control.rotate);
                if(orientation!==null)this.held.nativeVariant=(orientation+control.rotate+8)&3;
                if(previewRotation){
                    const origin=nativePreviewSpriteOrigin(nativePreview(this));
                    if(origin){
                        previewRotation.lastLogicalGridY=origin.y;
                        previewRotation.targetSpriteGridY=origin.y;
                    }
                }
            }else if(Number.isInteger(this.held.nativeVariant)){
                this.held.nativeVariant=(this.held.nativeVariant+control.rotate+8)&3;
            }
            this.nativeActorRotation=((this.nativeActorRotation??0)+control.rotate+8)&3;
        }
        // Original Use dispatch follows actor movement. The newly assigned
        // throw/filler state therefore starts from the post-movement position.
        // Native simultaneous B+A rotates inventory without using it, including
        // tools. A fresh A on the following tick is accepted during rotation.
        const use=control.use&&!(control.nativeMotion&&control.rotate&&this.held);
        const deferredFiller=Boolean(use&&this.held?.item==='filler');
        const deferredPieceUse=Boolean(use&&this.held?.cells);
        const deferredCloudUse=Boolean(control.nativeMotion&&use&&this.held?.item==='cloud');
        const deferredNativeJump=Boolean(control.nativeMotion&&control.jump&&e.ground&&e.stun===0&&!control.nativeFreezeActor);
        let nativeJumpGravity=RULES.gravity;
        if(use&&!deferredFiller&&!deferredPieceUse&&!deferredCloudUse)this.use(opponent);
        if(!this.placing&&!e.bubble&&!e.carried&&!control.nativeFreezeActor){
        // L is handled after movement in the original. Airborne inputs cannot
        // restart the floor bypass or replace a jump's upward velocity.
        const requestDive=Boolean(control.dive&&!e.swimming);
        if(control.jump&&e.ground&&e.stun===0&&!deferredNativeJump){e.vy=RULES.jump*(e.boost>0?RULES.jumpBoost:1);e.ground=false;e.nativeFillerMotion=false;this.jumpSerial++;this.queueNativeSound(e.boost>0?SFX.jumpBoost:SFX.jump);}
        if(control.move)e.facing=Math.sign(control.move);
        const speed=RULES.speed*(e.boost>0?RULES.speedBoost:1);
        const proposedX=e.x+((e.stun&&!(control.nativeMotion&&e.lightning))?0:(control.move||0))*speed*dt;
        const nativeEdges=control.nativeMotion&&this.p.columns===RULES.nativeActorMapColumns,
            actorPixelX=Math.floor((e.x-1)*RULES.projectilePixels),
            nativeEdgeBlocked=nativeEdges&&(control.move<0?actorPixelX<RULES.nativeActorLeftEdgeGuard:
                control.move>0&&actorPixelX>=RULES.nativeActorRightEdgeGuardExclusive);
        const nx=nativeEdges?proposedX:Math.max(0.3,Math.min(this.p.columns-0.3,proposedX));
        const col=Math.floor(nx);
        const nativeFootprintColumns=(actorX=e.x)=>{
            const pixelX=Math.floor(actorX*RULES.projectilePixels-RULES.projectilePixels);
            const column=Math.floor(pixelX/RULES.projectilePixels)+RULES.nativeActorWallMapColumnBias;
            const edge=(pixelX+RULES.nativeActorEdgeOffsetPixels)%RULES.projectilePixels;
            const columns=[column];
            if(edge>RULES.nativeSupportEdgeHigh&&column<this.p.columns-1)columns.push(column+1);
            else if(edge<=RULES.nativeSupportEdgeLow&&column>0)columns.push(column-1);
            return columns;
        };
        let wall;
        if(control.nativeMotion&&this.p.columns===RULES.nativeActorMapColumns&&control.move){
            // ROM 0x0800386c/0x080038e0 first probes the current position ±7 px
            // at integer Y−6. If that map byte is occupied, FUN_08003620 then
            // checks the current tile plus the neighbor selected by the actor's
            // within-cell X phase; an occupied tile under the actor is allowed
            // to remain overlapped while walking along its top.
            wall=!nativeActorCanMoveHorizontally(this,control.move);
        }else{
            const nativeWallRow=Math.floor(e.y+
                RULES.nativeActorWallProbeOffsetPixels/RULES.projectilePixels);
            const actorRow=control.nativeMotion?nativeWallRow:Math.floor(e.y+RULES.actorWallRowBias);
            const wallPixelX=Math.floor(nx*RULES.projectilePixels-RULES.projectilePixels);
            const wallColumn=control.nativeMotion?
                Math.floor((wallPixelX+RULES.nativeActorWallSampleBiasPixels)/RULES.projectilePixels):col;
            wall=this.cell(wallColumn,actorRow);
        }
        if(wall&&e.ground&&!control.nativeMotion&&!deferredNativeJump&&!this.cell(col,Math.floor(e.y+1.05))){e.y=Math.floor(e.y)+1;wall=false;}
        e.walking=Boolean(control.move&&e.stun===0);
        // ROM 0x0800f7ce..f868 stores the directional input separately from
        // sprite facing. State 4 skips this handler, retaining these bytes
        // through the throw and its motionless handoff update.
        if(control.nativeMotion)this.nativeActorInputMove=Math.sign(control.move||0);
        // While dropping off the tower (L) the actor passes in front of the
        // cells, so the original still allows left/right steering.
        const bypassNativeWall=control.nativeMotion?Boolean(e.nativeWaterRise):e.offTower;
        if(!nativeEdgeBlocked&&(!wall||!control.nativeMotion&&e.dive>0||bypassNativeWall))e.x=nx;
        if(control.nativeMotion)this.nativeActorVelocityX=(e.x-previousActorX)*RULES.projectilePixels;
        const nativeWaterDropsHeld=this.nativeWaterRecovery?.timer>NATIVE_WATER.discardWhileTimerAbove;
        const nativeWaterHandled=control.nativeMotion&&advanceNativeWaterActor(this,RULES);
        if(nativeRescueRequested&&!this.nativeRescueBody){
            if(this.held){
                const dropped=discardedPickup(this.held,e.x*RULES.projectilePixels-RULES.bubbleActorAnchor,
                    RULES.nativeActorFloor-actorAtFrameStart.y*RULES.projectilePixels,
                    (e.x-previousActorX)*RULES.projectilePixels,this.p.columns);
                if(dropped&&this.crates.length<RULES.pickupPoolSize)this.crates.push(dropped);
            }
            // Entry keeps this handler's input-dependent gravity. UP uses
            // 0x1999, not the neutral 0x3333, before attraction adds -0x8000.
            const entryGravity=e.boost>0?RULES.boostGravity*
                (control.float?RULES.boostFloatGravity:control.fast?RULES.boostFastGravity:1):
                RULES.gravity*(control.float?RULES.floatGravity:control.fast?RULES.fastGravity:1);
            this.nativeRescueBody={x:Math.round((e.x-1)*RULES.projectilePixels*RULES.actorFixedScale),
                y:Math.round((RULES.nativeActorFloor-actorAtFrameStart.y*RULES.projectilePixels)*RULES.actorFixedScale),
                vx:Math.round((e.x-previousActorX)*RULES.projectilePixels*RULES.actorFixedScale),
                vy:Math.trunc(entryGravity*RULES.projectilePixels*RULES.step**2*RULES.actorFixedScale)};
            this.held=null;this.placing=null;
            this.nativePlayerPostThrowPoseTicks=0;
        }
        const nativeRescueHandled=Boolean(this.nativeRescueBody);
        if(nativeRescueHandled){
            const boat=nativeRescueBoat(this.nativeFrame-1,this.fieldIndex,this.nativeRescueOrigin,this.artStage);
            boat.y+=(RULES.nativeActorFloor-this.p.goal*RULES.projectilePixels-NATIVE_RESCUE.rescuePlane)*RULES.actorFixedScale;
            const body=advanceNativeRescueBody(this.nativeRescueBody,boat);
            e.x=1+body.x/RULES.actorFixedScale/RULES.projectilePixels;
            e.y=(RULES.nativeActorFloor-body.y/RULES.actorFixedScale)/RULES.projectilePixels;
            e.vy=-body.vy/RULES.actorFixedScale/(RULES.projectilePixels*RULES.step);
            e.ground=false;e.walking=false;e.offTower=true;
            this.nativeActorState=this.nativeActorNextState=2;
            this.nativePlayerPostThrowPoseTicks=0;
        }
        if(nativeWaterHandled&&nativeWaterDropsHeld&&this.held&&Number.isFinite(e.nativeWaterCameraY)){
            // DEE6..DF12 discards caught inventory while the recovery timer
            // exceeds 45, even after the creature has lifted the actor above
            // water. Sample the timer before its carry-handler decrement and
            // the body before the carry-position overwrite.
            const dropped=discardedPickup(this.held,e.x*RULES.projectilePixels-RULES.bubbleActorAnchor,
                e.nativeWaterCameraY,(e.x-previousActorX)*RULES.projectilePixels,this.p.columns);
            if(dropped&&this.crates.length<RULES.pickupPoolSize)this.crates.push(dropped);
            this.held=null;
        }
        if(!nativeWaterHandled&&!nativeRescueHandled){
        const old=e.y;
        const nativeFootprintHasCell=row=>nativeFootprintColumns().some(x=>this.cell(x,row-1));
        // FUN_08003778 uses both OR and AND probes across the feet. A solid
        // row above the support cannot be a landing surface inside the pile.
        const nativeFootprintCanLand=row=>{
            const columns=nativeFootprintColumns(),below=columns.map(x=>Boolean(this.cell(x,row-1))),
                above=columns.map(x=>Boolean(this.cell(x,row)));
            return below.some(Boolean)&&!above.every(Boolean)&&
                (!above.some(Boolean)||below.every(Boolean));
        };
        const nativeYQ16=control.nativeMotion?
            Math.round((RULES.nativeActorFloor-e.y*RULES.projectilePixels)*RULES.actorFixedScale):null;
        const nativeY=control.nativeMotion?nativeYQ16/RULES.actorFixedScale:
            RULES.nativeActorFloor-e.y*RULES.projectilePixels;
        const nativePixelY=Math.floor(nativeY);
        const nativeEnteringWater=control.nativeMotion&&nativeYQ16+NATIVE_WATER.entryProbePixels*RULES.actorFixedScale>
            Math.round((RULES.nativeActorFloor-(this.previousWater??this.water)*RULES.projectilePixels+RULES.bubbleWaterlineBias)*RULES.actorFixedScale);
        enterNativeWater=nativeEnteringWater;
        const alignedNativeSupport=(nativePixelY%RULES.projectilePixels+RULES.projectilePixels)%RULES.projectilePixels<
            RULES.nativeSupportContactPixels;
        nativeJumpSupported=Boolean(alignedNativeSupport&&nativeFootprintCanLand(Math.round(e.y)));
        // The original checks support in native pixel coordinates before it
        // advances a falling actor. Its prior collision correction can leave
        // a subpixel remainder at an integer 16-pixel boundary. That alignment
        // distinguishes an already-corrected contact from a near miss above it.
        const nativeSupportHold=Boolean(control.nativeMotion&&!e.lightning&&!control.nativeFreezeActor&&!deferredNativeJump&&
            !(this.nativeSupportBypassTicks>0)&&
            !e.dropTicks&&
            // 0x08003814 accepts native VY >= 0, including rest. Releasing
            // a carry can clear the ground flag while leaving exactly zero VY.
            (e.ground||e.vy<=0)&&
            alignedNativeSupport&&
            nativeFootprintCanLand(Math.round(e.y)));
        if(nativeSupportHold){
            // 0x08003848 removes the low four INTEGER Y bits, preserving the
            // Q16 fractional part. Keeping those 0..5px leaves the actor sunk
            // into a ledge after walking onto it.
            e.y+=((nativePixelY%RULES.projectilePixels+RULES.projectilePixels)%RULES.projectilePixels)/RULES.projectilePixels;
            e.vy=0;e.ground=true;e.waterEjected=false;e.introDescent=false;e.nativeDiveMotion=false;
            e.nativeFillerMotion=false;
        }
        const submerged=!e.waterEjected&&e.y<this.water+RULES.waterEntryOffset;
        if(submerged&&!control.nativeMotion){
            if(!e.swimming){
                e.nativeFillerMotion=false;
                // Native carried inventory disappears on entering the water.
                this.held=null;
                if(!e.nativeDiveMotion)e.vy-=RULES.waterEntryAcceleration*dt;
                e.waterTime=0;
            }
            e.swimming=true;e.waterTime+=dt;e.offTower=true;
            const target=e.y<this.water-RULES.waterTurnDepth?RULES.waterRiseVelocity:RULES.waterSinkVelocity;
            e.vy=target+(e.vy-target)*Math.pow(RULES.waterDrag,dt/RULES.step);
            if(e.waterTime+1e-9>=RULES.waterRecoveryTime){
                e.vy=RULES.waterEjectVelocity;
                e.y+=RULES.waterEjectLift;
                e.swimming=false;e.waterTime=0;e.waterEjected=true;
                e.dive=0;e.dropTicks=0;e.nativeDiveMotion=false;
                if(e.lightning){e.lightning=null;e.stun=0;e.dive=0;}
            }
        }else if(!control.nativeMotion){e.swimming=false;e.waterTime=0;}
        const fillerStanding=(e.nativeFillerMotion||deferredFiller)&&e.ground;
        if(fillerStanding)e.vy=0;
        const diveDisplacement=(e.nativeDiveMotion||e.nativeFillerMotion||fillerStanding)&&!e.swimming&&!e.waterEjected?e.vy*dt:null;
        const fillerFloat=e.fillerFloatTicks>0;
        let gravity=e.waterEjected?RULES.waterEjectGravity:
            (e.boost>0?RULES.boostGravity*(control.float?RULES.boostFloatGravity:control.fast?RULES.boostFastGravity:1):
            RULES.gravity*(control.float?RULES.floatGravity:control.fast?RULES.fastGravity:1));
        if(fillerFloat&&!control.fast)gravity=RULES.gravity*RULES.floatGravity;
        nativeJumpGravity=gravity;
        if(diveDisplacement!==null){
            const units=RULES.actorFixedScale*RULES.projectilePixels*RULES.step*RULES.step;
            gravity=Math.trunc(gravity*units)/units;
        }
        // ROM 0x0800fabc integrates Y with the preceding velocity, then applies
        // this tick's gravity. The player path retains its separately measured
        // input timing; native Survival CPU motion uses the original ordering.
        const velocityForPosition=e.vy;
        const nativeFixedMotion=Boolean(control.nativeMotion&&diveDisplacement===null&&!e.swimming&&!e.waterEjected);
        const nativeVelocityForPositionQ16=nativeFixedMotion?
            Math.round(-velocityForPosition*RULES.projectilePixels*RULES.step*RULES.actorFixedScale):null;
        const nativeGravityQ16=nativeFixedMotion?
            Math.trunc(gravity*RULES.projectilePixels*RULES.step*RULES.step*RULES.actorFixedScale):null;
        if(!e.swimming&&!fillerStanding&&!nativeSupportHold){
            if(nativeFixedMotion){
                const nativeVelocityAfterQ16=nativeVelocityForPositionQ16+nativeGravityQ16;
                e.vy=-nativeVelocityAfterQ16/RULES.actorFixedScale/(RULES.projectilePixels*RULES.step);
            }else e.vy-=gravity*dt;
        }
        if(!e.swimming&&!e.waterEjected){
            const limit=control.float?RULES.floatFallSpeed:control.fast?
                (e.boost>0?RULES.boostFastFallSpeed:RULES.fastFallSpeed):
                (e.boost>0?RULES.boostFallSpeed:RULES.fallSpeed);
            e.vy=Math.max(e.vy,-limit);
        }
        if(fillerFloat&&!control.fast&&!e.ground)e.fillerFloatTicks--;
        if(!nativeSupportHold){
            if(nativeFixedMotion){
                const nextNativeYQ16=nativeYQ16+nativeVelocityForPositionQ16;
                e.y=(RULES.nativeActorFloor-nextNativeYQ16/RULES.actorFixedScale)/RULES.projectilePixels;
            }else e.y+=diveDisplacement??(control.nativeMotion?velocityForPosition:e.vy)*dt;
        }
        if(!nativeSupportHold)e.ground=false;
        // Inventory reacts to the boundary crossed this frame, before the
        // water-force integration begins on the following frame.
        if(!control.nativeMotion&&!e.waterEjected&&e.y<this.water+RULES.waterEntryOffset){
            this.held=null;
        }
        if(!e.swimming&&!nativeSupportHold&&!deferredNativeJump&&e.vy<=0&&
            !(control.nativeMotion&&this.nativeSupportBypassTicks>0)){
            let surface=control.nativeMotion||e.offTower?-Infinity:0;
            if((e.dive<=0||e.waterEjected)&&!e.dropTicks)for(let y=fillerStanding?Math.ceil(old):Math.floor(old);y>=Math.max(0,Math.floor(e.y));y--){
                // ROM FAD8 calls the same 3778 two-foot support probe after
                // filler takeoff too. The slow-gravity counter does not
                // replace ledge contact with a single-column legacy probe.
                const nativeContact=control.nativeMotion;
                const support=nativeContact?nativeFootprintCanLand(y):this.cell(Math.floor(e.x),y-1);
                // A dropping/rescued actor is in front of the tower: it must not
                // stop inside solid cells, only on a ledge with free space above.
                const blocked=!nativeContact&&(e.offTower||e.waterEjected)&&this.cell(Math.floor(e.x),y);
                if(support&&!blocked){surface=y;break;}
            }
            if(e.y<=surface){
                if(Number.isFinite(surface))e.offTower=false;
                // 0x08003848 removes the integer-pixel remainder, retaining
                // fractional position; velocity is cleared at next support
                // check rather than during the first contact correction.
                const nativeFiller=!control.nativeMotion&&(e.nativeFillerMotion||fillerStanding);
                const nativeY=RULES.nativeActorFloor-e.y*RULES.projectilePixels;
                if(control.nativeMotion&&!nativeFiller){
                    nativeLandingContact=true;
                    // The ROM aligns the integer actor Y to the tile's 16-pixel
                    // boundary while retaining its 16.16 subpixel fraction.
                    // Contact velocity is cleared by the next support check.
                    const subpixel=nativeY-Math.floor(nativeY);
                    e.y=surface-subpixel/RULES.projectilePixels;
                }else{
                    e.y=surface-(nativeFiller?(nativeY-Math.floor(nativeY))/RULES.projectilePixels:0);
                    if(!nativeFiller||fillerStanding)e.vy=0;
                    e.ground=true;e.waterEjected=false;e.introDescent=false;e.nativeDiveMotion=false;
                }
            }
        }
        // FAC4..FAFE: only ordinary actor integration consumes this counter;
        // water and throw handlers bypass it. Late contact can reset it again.
        if(control.nativeMotion&&this.nativeSupportBypassTicks>0)this.nativeSupportBypassTicks--;
        }
        if(e.dropTicks)e.dropTicks--;
        // Animation selection observes support before L replaces its velocity.
        this.nativeAnimationGround=Boolean(control.nativeMotion&&e.ground);
        if(control.nativeMotion)this.nativeActorSupportAtHandler=this.nativeAnimationGround;
        if(requestDive&&(e.ground||nativeLandingContact)){
            e.dropTicks=RULES.diveTicks;e.nativeDiveMotion=true;
            e.vy=RULES.diveVelocity;e.ground=false;e.offTower=true;this.queueNativeSound(SFX.jump);nativeDiveSoundPlayed=true;
        }
        if(enterNativeWater){
            // Dry collision and a same-tick L drop precede the water-state
            // transition. Preserve their corrected position/velocity/bypass.
            if(this.held){
                const dropped=discardedPickup(this.held,e.x*RULES.projectilePixels-RULES.bubbleActorAnchor,
                    RULES.nativeActorFloor-e.y*RULES.projectilePixels,
                    (e.x-previousActorX)*RULES.projectilePixels,this.p.columns);
                if(dropped&&this.crates.length<RULES.pickupPoolSize)this.crates.push(dropped);
            }
            this.queueNativeSound(SFX.enterWater);
            beginNativeWaterRecovery(this,RULES);
        }
        if(!control.nativeMotion&&e.offTower&&e.y>=0&&e.vy>0&&!e.lightning&&!e.waterEjected)e.offTower=false;
        }
        // Actor collision reads the standing floor before this tick's removal;
        // the queue still advances before a throw can request new removals.
        this.advanceCollapse(dt);
        // ROM 18E70: CDB0 moves unsupported owners after destruction but
        // BEFORE the state-4 handler samples its current landing target.
        // Retain pre-launch velocity for the animation sample below.
        const nativeLooseAnimationVy=e.vy;
        const nativeLooseMoves=control.nativeMotion?this.advanceLoosePieces(nativeLooseOwnerLimit):null;
        // Row destruction can expose a completed row to the water during
        // this update. Native 0x08019910 sees that changed map, not the row
        // that existed before the actor/destruction handlers ran.
        if(nativeWaterlineCandidate!==null){
            const nativeRow=Math.floor((nativeWaterlineCandidate-1)/RULES.projectilePixels)+1,
                row=RULES.nativeActorMapBottomRow-nativeRow,
                blocked=row>=0&&row<RULES.nativeActorMapRows&&
                    (this.rows[row]?.cells.filter(Boolean).length??0)<this.p.columns,
                line=blocked?nativeRow*RULES.projectilePixels:nativeWaterlineCandidate;
            this.water=(RULES.nativeActorFloor+RULES.bubbleWaterlineBias-line)/RULES.projectilePixels+this.nativeWaterOffset;
            warningRow=RULES.nativeActorMapBottomRow-(Math.floor((line-1)/RULES.projectilePixels)+1);
            const submerged=warningRow<0?this.p.columns:this.rows[warningRow]?.cells.filter(Boolean).length??0;
            this.nativeWaterWarning=submerged>0&&submerged<this.p.columns;
        }
        // 0x0800fa84..fae8 retains the support-probe result for camera keys.
        // A first downward contact counts even though its landing animation
        // and zero-velocity ground hold begin on the following tick.
        // State 1 (swimming) branches directly to 0x0800fbd2 (0x0800f8fc),
        // leaving sb=0 so camera offset advances freely in water.
        this.nativeCameraSupported=Boolean(control.nativeMotion&&(this.nativeActorHandlerState===1||((this.nativeAnimationGround||nativeLandingContact)&&e.vy<=0)));
        // FBD2 updates the camera offset before Use/jump can replace the
        // body's support and velocity (e.g. a same-tick filler hop).
        if(deferredFiller||deferredPieceUse||deferredCloudUse)this.use(opponent,
            deferredPieceUse&&control.nativeMotion&&this.p.columns===7?actorAtFrameStart:null);
        if(deferredNativeJump&&nativeJumpSupported&&!e.swimming&&!e.waterEjected&&!e.bubble&&!e.carried&&e.stun===0){
            // FCB6's drop cue precedes FD3E's jump cue when both input
            // flags are present, even though the jump replaces the velocity.
            if(control.dive&&!nativeDiveSoundPlayed)this.queueNativeSound(SFX.jump);
            e.vy=RULES.jump*(e.boost>0?RULES.jumpBoost:1)-nativeJumpGravity*dt;
            e.ground=false;e.nativeFillerMotion=false;this.jumpSerial++;this.queueNativeSound(e.boost>0?SFX.jumpBoost:SFX.jump);
        }
        else if(control.nativeMotion&&control.jump&&e.nativeWaterRise&&!e.swimming&&!e.waterEjected&&!e.bubble&&!e.carried&&e.stun===0)
            this.queueNativeSound(e.boost>0?SFX.jumpBoost:SFX.jump);
        if(discard){
            const dropped=discardedPickup(discard,e.x*RULES.projectilePixels-RULES.bubbleActorAnchor,
                e.nativeWaterCameraY??RULES.nativeActorFloor-e.y*RULES.projectilePixels,
                (e.x-previousActorX)*RULES.projectilePixels, this.p.columns);
            if(dropped&&this.crates.length<RULES.pickupPoolSize)this.crates.push(dropped);
            this.say('Discarded');
        }
        if(this.placing){
            const p=this.placing; p.time-=dt;
            p.ticks=(p.ticks??0)+dt/RULES.step;
            if(p.nativeHeld){
                const projected=nativePreview(this,p.nativeHeld,p.nativeProjectionOrigin??{x:p.eggX,y:p.eggY});
                if(projected){
                    const mask=NATIVE_PIECE_MASKS[p.nativeRotation*8+p.nativeHeld.nativeKind],
                        maxY=Math.max(...mask.map(([,y])=>y));
                    p.x=projected.x;p.y=projected.y;
                    p.targetX=p.x-Math.min(...mask.map(([x])=>x))+RULES.throwActorXBias;
                    p.targetY=p.y+Math.max(...mask.filter(([x])=>x===Math.floor(RULES.throwActorXBias)).map(([,y])=>maxY-y))+1;
                }
                p.nativeAngle=nativePreviewAngleStep(p.nativeAngle,p.nativeRotation*RULES.nativeQuarterTurn);
                const pose=nativeThrowPose(p,Math.floor(p.ticks+1e-8)-1);
                e.x=pose.x;e.y=pose.y;
            }else{
                const u=Math.min(1,1-p.time/RULES.throwTime);
                e.x=p.eggX+(p.targetX-p.eggX)*u;
                e.y=p.eggY+(p.targetY-p.eggY)*u+4*RULES.throwArc*u*(1-u);
            }
            if(p.nativeHeld?p.ticks+1e-8>=RULES.throwTicks:p.time<=0){
                if(p.nativeHeld){e.x=p.targetX;e.y=p.targetY;}
                // Re-evaluate the landing if an attack changed the tower during the throw.
                // The airborne actor has moved above its intended opening.
                // Reproject from the throw's origin, not from the hop apex;
                // otherwise a padded single-cell mask jumps onto the roof.
                const final=p.nativeHeld?nativePreview(this,p.nativeHeld,p.nativeProjectionOrigin??{x:p.eggX,y:p.eggY}):null;
                const y=p.nativeHeld?(final?.y??null):this.landing(p.cells,p.x,p.startY);
                const x=p.nativeHeld?final?.x:p.x;
                if(y!==null){const owner=this.nextOwner++,artRotation=p.cells.length===1?0:p.nativeRotation;
                    // ROM C42C..C43C retains the raw template anchor until
                    // next tick's height scan, including empty padded rows.
                    if(p.nativeHeld)this.nativeCommittedAnchorRow={frame:this.nativeFrame,
                        row:RULES.nativeInitialBoardLastRow-y-Math.max(...NATIVE_PIECE_MASKS[
                            p.nativeRotation*8+p.nativeHeld.nativeKind].map(([,cy])=>cy))};
                    const sortedCells=[...p.cells].sort((a,b)=>a[0]!==b[0]?a[0]-b[0]:b[1]-a[1]);
                    let nativeFirstCompleted=-1;
                    const placementCompletedRows=new Set();
                    for(const [cx,cy]of sortedCells){
                        this.setCell(x+cx,y+cy,p.color,owner,p.material,
                            p.nativeHeld?nativeCellArt(p.nativeHeld.nativeKind,artRotation,cx,cy):0);
                        const row=this.rows[y+cy];
                        if(row&&!row.sealed&&row.cells.every(Boolean)){
                            if(nativeFirstCompleted===-1)nativeFirstCompleted=y+cy;
                            placementCompletedRows.add(y+cy);
                        }
                    }
                    this.mergeMutualSupports(owner,y);
                    // ROM +0x2030ea4 records only a row completed by this
                    // placement. An already-full row found by the later scan
                    // still counts, but must not invent row sparks or a bonus
                    // when that placement record is zero (0x0800e40e..e416).
                    const placementCompleted=!p.nativeHeld||nativeFirstCompleted>=0;
                    this.score+=p.cells.length*RULES.cellScore;this.complete({
                        completedRow:nativeFirstCompleted>=0?nativeFirstCompleted:null,
                        emitSparks:placementCompleted,allowBonus:placementCompleted&&(!p.nativeHeld||placementCompletedRows.size>=2),
                        bonusCount:p.nativeHeld?placementCompletedRows.size:null});}
                e.vy=p.nativeHeld?RULES.throwLandingSpeed:RULES.jump;
                this.placing=null;
                if(p.nativeHeld){
                    this.nativeActorState=4;this.nativeActorNextState=0;
                    if(p.cells.length===1)this.nativeActorRotation=0;
                    this.nativePostThrowFreezeTicks=RULES.nativePostThrowFreezeTicks;
                }
            }
        }
        // 3B98 advances entries in order, stopping after the first completion.
        // Later entries miss that tick, so elapsed-age formulas lose the
        // queue's timing whenever 3C8C flushes it during another filler use.
        for(let i=0;i<this.nativeFillerAnimations.length;i++){
            const entry=this.nativeFillerAnimations[i];entry.timer--;
            if(entry.timer===0){entry.filler.nativePhase=2;this.nativeFillerAnimations.splice(i,1);break;}
            if(entry.timer===RULES.fillerAnimationGrowTimer)entry.filler.nativePhase=1;
        }
        // 4660..4684 returns from the entire slot pass when a bomb expires.
        // Later slots retain their motion and do not submit a new OBJ descriptor.
        const nativeAbortSlot=Math.min(Infinity,...this.bombs.filter(b=>b.nativeTrajectory&&!b.pending&&b.fuse<=dt+1e-9).map(b=>b.nativeSlot));
        for(let i=this.bombs.length-1;i>=0;i--){
            const b=this.bombs[i],span=this.p.columns+RULES.bombFieldGap;
            if(b.nativeTrajectory&&b.nativeSlot>nativeAbortSlot){b.nativeSkippedPass=true;continue;}
            const destination=1-this.fieldIndex;
            if(b.pending){
                this.launchProjectile(b,opponent);
            }else if(b.fuse>0){
                if(b.nativeTrajectory){
                    if(!this.advanceNativeBomb(b,opponent)){this.bombs.splice(i,1);continue;}
                }else{
                if(b.flightCounter>0)b.flightCounter--;
                const oldY=b.y;
                advanceBombFlight(b);
                const local=b.x-destination*span;
                if(opponent&&local>=0&&local<this.p.columns&&b.phase==='arc'&&b.vy<0){
                    // Native contact uses the sprite's centre column. During
                    // horizontal travel it probes the new position; subsequent
                    // stationary rebounds probe the previous vertical position.
                    const column=Math.min(this.p.columns-1,Math.floor(local+RULES.bombSize/2));
                    const surface=opponent.top(column),contactY=b.landed?oldY:b.y;
                    if(contactY-RULES.bombSize<=surface){
                        b.vy=Math.abs(b.vy)<=RULES.bombFlightGravity*dt+1e-9?0:-b.vy*RULES.bombRestitution;
                        if(!b.landed)b.flightCounter=RULES.projectileCatchTicks;
                        b.targetX=b.x;b.landed=true;
                    }
                }
                }
            }
            b.fuse-=dt;
            const local=b.x-destination*span;
            if(b.fuse<=1e-9){
                const target=opponent&&local>=0&&local<this.p.columns?opponent:this;
                if(target===opponent)target.explode(local+RULES.bombSize/2,b.y-(b.nativeTrajectory?0:RULES.bombSize/2),0,this.time,true);
                else target.explode(b.x-this.fieldIndex*span+RULES.bombSize/2,b.y-(b.nativeTrajectory?0:RULES.bombSize/2),0,this.time,true);
                // 18E70 calls both projectile passes (4458) before floor
                // accounting (3020), then actor/placement dispatch. Keep the
                // queued counter current even when the target Tower has
                // already run its update; current OAM keeps the old counter.
                // If the target has not updated yet, its ordinary accounting
                // will see the damage. Replacing its pending value now would
                // also expose it in the current OAM, one tick too early.
                if(b.nativeTrajectory&&!afterResult&&target.time>=this.time-RULES.step/2)
                    target.nativeDividerPendingProgress=target.nativeCountFullFloors();
                this.bombs.splice(i,1);
            }else if(b.nativeTrajectory&&opponent){
                // The player Tower is updated before the CPU Tower here. The
                // ROM tests projectiles after both actors have moved, so defer
                // an ahead-of-target contact until that target finishes its tick.
                if(this.time>opponent.time+RULES.step/2)
                    (opponent.nativePendingProjectileContacts??=[]).push({source:this,bomb:b});
                else opponent.contactNativeProjectile(b,this);
            }else if(opponent&&local>=0&&local<this.p.columns&&!opponent.held&&
                Math.abs(local+RULES.bombSize/2-opponent.egg.x)<RULES.catchRadius&&
                b.y>opponent.egg.y-0.2&&b.y<opponent.egg.y+1.8){
                opponent.held={item:'bomb',nativeKind:8,nativeVariant:0,fuse:b.fuse};
                opponent.nativeProjectileCaughtThisTick=true;this.bombs.splice(i,1);
            }
        }
        for(let i=this.hammers.length-1;i>=0;i--){
            const h=this.hammers[i],span=this.p.columns+RULES.bombFieldGap,destination=1-this.fieldIndex;
            if(h.nativeTrajectory&&h.nativeSlot>nativeAbortSlot){h.nativeSkippedPass=true;continue;}
            if(h.pending)this.launchProjectile(h,opponent);
            else if(h.nativeTrajectory){if(!this.advanceNativeBomb(h,opponent)){this.hammers.splice(i,1);continue;}}else advanceBombFlight(h);
            h.age=(h.age||0)+dt;
            // Native hammers share the strict projectile/actor contact square,
            // even while the actor is holding inventory. A contact consumes the
            // hammer even when the common injury handler grants immunity.
            if(h.nativeTrajectory&&opponent){
                if(this.time>opponent.time+RULES.step/2)
                    (opponent.nativePendingProjectileContacts??=[]).push({source:this,bomb:h});
                else opponent.contactNativeProjectile(h,this);
            }
            if(!h.nativeTrajectory){
            const local=h.x-destination*span;
            if(opponent&&local>=0&&local<this.p.columns){
                const column=Math.min(this.p.columns-1,Math.floor(local+RULES.bombSize/2));
                if(h.vy<0&&h.y-RULES.bombSize<=opponent.top(column)){
                    // The native hammer starts destruction of incomplete
                    // floors; complete floors survive, as with a water surge.
                    opponent.startHammerCollapse(this.time);
                    this.hammers.splice(i,1);opponent.say('Hammer!');continue;
                }
                if(Math.abs(local+RULES.bombSize/2-opponent.egg.x)<RULES.hammerHitRadius&&
                    Math.abs(h.y-RULES.hammerHitLift-opponent.egg.y)<RULES.hammerHitRadius){
                    opponent.strikeLightning();this.hammers.splice(i,1);continue;
                }
            }
            if(h.y<(opponent?.water??this.water)-1)this.hammers.splice(i,1);
            }
        }
        if(e.lightning&&e.lightning.pending===0){e.stun=Infinity;e.dive=Infinity;e.offTower=true;e.ground=false;this.held=null;}
        this.advanceClouds();
        for(let i=this.attacks.length-1;i>=0;i--){
            const a=this.attacks[i];a.delay-=dt;if(a.delay>0)continue;
            if(a.item==='bomb')this.crates.push({...a,y:Math.max(a.y,e.y+2)});
            this.attacks.splice(i,1);
        }
        // The target has moved; incoming contact precedes its held fuse pass.
        const pendingTerrain=this.nativePendingBombTerrain;this.nativePendingBombTerrain=null;
        for(const {source,bomb,row,column} of pendingTerrain??[]){
            if(!source.bombs.includes(bomb)||!this.cell(column,row))continue;
            let velocity=Math.round(-bomb.vy*RULES.projectilePixels*RULES.step*RULES.actorFixedScale);
            if(velocity>0){
                velocity=Math.floor(-velocity/2);
                if(velocity>-RULES.bombNativeContactQ16)velocity=0;
            }else if(this.cell(column,row+1))velocity-=RULES.bombNativeContactQ16;
            bomb.vy=-velocity/RULES.actorFixedScale/RULES.projectilePixels/RULES.step;
        }
        const pendingBombContacts=this.nativePendingProjectileContacts;
        this.nativePendingProjectileContacts=null;
        for(const contact of pendingBombContacts??[])this.contactNativeProjectile(contact.bomb,contact.source);
        if(this.held?.item==='bomb'){
            this.held.fuse=(this.held.fuse??RULES.bombFuse)-dt;
            if(this.held.fuse<=1e-9){
                this.held=null;
                // 426C/4458 use the actor position after input integration,
                // expressed relative to the board's 752px floor rather than
                // the actor's 720px floor. Animation dispatch follows later.
                const boardOffset=control.nativeMotion?
                        (RULES.nativeBoardFloor-RULES.nativeActorFloor)/RULES.projectilePixels:0;
                this.explode(e.x,e.y+boardOffset,RULES.bombHeldEffectLift,this.time,true);
                if(control.nativeMotion&&!afterResult)
                    this.nativeDividerPendingProgress=this.nativeCountFullFloors();
            }
        }
        // In Survival, the active factory/castle secondary enemy draws from
        // this field's RNG before the pickup manager on the same native tick.
        // Reserve its draw now but apply its motion at the normal hazard phase.
        // 13974 keeps active enemies moving during rescue/results. In 11BA4
        // only inactive respawn countdowns stop when the result flag is set.
        const nativeResultHazards=control.nativeMotion&&Boolean(afterResult||
            this.nativeRescueBody||opponent?.nativeRescueBody);
        const advanceHazard=(name,advance)=>{
            const enemy=this[name];
            if(!nativeResultHazards||enemy.active){
                const before={active:enemy.active,life:enemy.life,stolen:enemy.stolen};
                const phase=['bubble','jumper','space','dragon','castle','parkPrimary'].includes(name)?3:4;
                this.nativeAudioPhase=phase;advance();this.nativeAudioPhase=undefined;
                const spawn=NATIVE_ENEMY_SPAWN_SOUND[name];
                if(!before.active&&enemy.active&&spawn&&(!spawn.local||this.fieldIndex===0)&&
                    (spawn.variant===undefined||enemy.variant===spawn.variant))this.queueNativeSound(spawn.id,phase,0);
                if(!before.stolen&&enemy.stolen&&NATIVE_ENEMY_STEAL_SOUND[name])this.queueNativeSound(NATIVE_ENEMY_STEAL_SOUND[name],phase);
                if(name==='castle'&&this.artStage==='castle'&&this.fieldIndex===0&&!before.active&&
                    before.life===RULES.castleWarningLife+1&&enemy.life===RULES.castleWarningLife)this.queueNativeSound(8,phase);
                if(before.active&&before.life===1&&enemy.life===0&&name==='spaceSecondary')this.queueNativeSound(31,phase);
                if(before.active&&before.life===101&&enemy.life===100&&name==='factorySecondary')this.queueNativeSound(26,phase);
                if(name==='bubble'&&before.active&&before.life===RULES.bubbleReleaseLife)this.queueNativeSound(43,phase);
            }else enemy.previousActive=false;
        };
        let secondaryMotionSeed;
        if(this.nativePickups&&this.p.nativeConfig?.secondary!==0){
            const secondary=this.artStage==='factory'?this.factorySecondary:
                this.artStage==='castle'?this.castleSecondary:null;
            if(secondary?.active&&secondary.life)
                secondaryMotionSeed=this.nativeEnemySeed=nativeRandomStep(this.nativeEnemySeed);
        }
        if(this.nativePickups){
            if(this.spawn!==this.lastNativeSpawn)this.nativePickups.clock=Math.round(this.spawn/RULES.step);
            this.advancePickupSpawn();this.spawn=this.nativePickups.clock*RULES.step;this.lastNativeSpawn=this.spawn;
        }else this.spawn-=dt;
        if(!this.nativePickups&&this.spawn<=0){
            this.spawn+=this.p.crateInterval;
            const isItem=this.p.hazards&&this.random()<RULES.itemChance;
            const index=RULES.shapePool[Math.floor(this.random()*RULES.shapePool.length)];
            const item=isItem?['bomb','hammer','boots','cloud','filler'][Math.floor(this.random()*5)]:null;
            this.crates.push({x:0.5+this.random()*(this.p.columns-1),y:Math.max(this.height(),e.y)+RULES.spawnHeight,
                cells:isItem?null:SHAPES[index].map(p=>[...p]),color:index+1,material:SHAPE_MATERIALS[index],
                item});
        }
        this.nativePickupMotionPassPending=false;
        const deferredCarryPickupPass=Boolean(this.nativePickups&&(e.bubble||e.carried));
        for(let i=this.crates.length-1;i>=0;i--){
            const c=this.crates[i];
            if(c.nativeMotion){
                const m=advancePickupMotion(c.nativeMotion,RULES.nativeActorFloor-this.water*RULES.projectilePixels+RULES.bubbleWaterlineBias);
                c.x=(m.x+RULES.pickupCenterBias)/RULES.projectilePixels;
                c.y=(RULES.nativeActorFloor-m.y+RULES.pickupActorBias)/RULES.projectilePixels;
                c.nativeSwayFrame=this.nativeFrame-1+(this.nativePickupSwayFrameOffset??0);
                if(!m.active){
                    if(this.nativePickups&&Number.isInteger(c.nativeKind)){this.nativePickups.bag[c.nativeKind]++;this.nativePickups.remaining++;}
                    this.crates.splice(i,1);continue;
                }
            }else c.y-=RULES.crateSpeed*dt;
            c.age=(c.age||0)+dt;
            // Native boxed bombs fall inert; catching starts their fuse.
            // A returned thrown bomb keeps its fuse; explicit discard resets it.
            if(c.item==='bomb'&&Number.isFinite(c.fuse)){
                c.fuse-=dt;if(c.fuse<=1e-9){this.crates.splice(i,1);this.explode(c.x,c.y);continue;}
            }
            const catches=c.nativeMotion?nativePickupCanCatch(c.nativeMotion,e.x*RULES.projectilePixels-RULES.bubbleActorAnchor,
                RULES.nativeActorFloor-e.y*RULES.projectilePixels):
                Math.abs(c.x-e.x)<RULES.catchRadius&&c.y>e.y-0.2&&c.y<e.y+1.8;
            // 0x0800bae2..bafa rejects rescue (2), intro (3), throw (4),
            // and injury (7). The throw's 4 -> 0 recovery handler runs on
            // the next tick; nativeFreezeActor identifies that transition.
            const nativeStateBlocksCatch=c.nativeMotion&&control.nativeMotion&&
                ([2,3,7].includes(this.nativeActorState)||
                 this.nativeActorState===4&&!control.nativeFreezeActor);
            if(catches&&!nativeStateBlocksCatch&&(!this.held||c.item==='boots')&&!e.bubble&&!e.carried&&
                // BAE2..BAFA allows state1 (water recovery) to catch. The
                // next water handler discards it again if still submerged.
                (control.nativeMotion||!e.swimming||e.waterEjected)&&!e.lightning&&!this.placing){
                if(c.item==='bomb'&&!Number.isFinite(c.fuse))c.fuse=RULES.bombFuse;
                delete c.nativeMotion;
                const previousHeld=this.held;
                this.held=c;this.crates.splice(i,1);this.say(c.item||'Place the outlined piece');
                if(control.nativeMotion&&c.item!=='boots')this.nativePickupCaughtThisTick=true;
                // Actor +0x868 retains the variant/orientation selected at
                // pickup, including tools. The CPU compares it even with no
                // rotatable piece, so update it at the same point as inventory.
                if(c.item!=='boots'&&Number.isInteger(c.nativeVariant))this.nativeActorRotation=c.nativeVariant&3;
                if(c.item==='boots'){this.use(opponent);this.held=previousHeld;}
            }else if(!c.nativeMotion&&c.y<Math.max(-1,this.water-1))this.crates.splice(i,1);
            // 0x0800bcd8: visible loose tools emit a stationary sparkle every
            // 32 global ticks; this consumes no random numbers.
            if(c.nativeMotion&&c.nativeKind>=8&&this.nativeFrame%RULES.pickupSparklePeriod===0){
                const m=c.nativeMotion,px=Math.floor(m.x);
                if(px>=-15&&px<112)this.emitNativeParticle(px+RULES.nativeParticleInset,Math.floor(m.y+RULES.nativeParticleInset),2,2);
            }
        }
        const incomplete=this.countIncompleteFloors();
        // 08014fe2..14ff4: warn only on an increase through counts 5..7.
        if(this.fieldIndex===0&&incomplete>(this.nativeAudioIncompleteFloors??0)&&
            incomplete>=NATIVE_SOUND_WARNING.minimumIncompleteFloors&&incomplete<=NATIVE_SOUND_WARNING.maximumIncompleteFloors)
            {this.queueNativeSound(SFX.towerWarning);this.nativeAudioWarningFrame=this.nativeFrame;}
        this.nativeAudioIncompleteFloors=incomplete;
        this.incompleteFloors=incomplete;
        this.risk=Math.min(1,incomplete/RULES.warningFloors);
        const wetRow=this.rows[Math.max(0,Math.floor(this.water))];
        const extraRise=this.p.waterSpeed*(wetRow?.sealed?0.22:1+this.risk*2)*dt;
        this.water+=extraRise;
        if(nativeWaterline!==null)this.nativeWaterOffset+=extraRise;
        this.erode+=dt;
        if(nativeWaterline===null&&this.erode>=RULES.erosionTime){
            this.erode=0;
            for(let y=0;y<Math.min(this.height(),Math.floor(this.water)+1);y++){
                const row=this.rows[y];
                if(row&&!row.cells.every(Boolean)&&row.cells.some(Boolean)){
                    this.removeFloor(y);this.say('Water breached a floor!');break;
                }
            }
        }
        if(nativeWaterline!==null){
            // 0x08019910 queues the wet incomplete row through 0x0801a340.
            // It shares the ordinary destruction counters, rather than using
            // an unrelated periodic erosion timer. Requeue only after expiry.
            const line=RULES.nativeActorFloor-this.water*RULES.projectilePixels+RULES.bubbleWaterlineBias,
                y=RULES.nativeActorMapBottomRow-(Math.floor((line-1)/RULES.projectilePixels)+1),
                count=this.rows[y]?.cells.filter(Boolean).length??0;
            if(count>0&&count<this.p.columns&&!this.collapseTimers.has(y)){
                const timer=Math.max(RULES.collapseMinimumTimer,count*RULES.collapseCellSteps-RULES.collapseTimerLead);
                this.collapseTimers.set(y,{timer,initial:timer});
                this.collapse.active=true;this.collapseBornAt=this.time;
            }
        }
        const hazardContactBlocked=Boolean(e.lightning||e.swimming||e.stun>0);
        if(this.p.hazards||e.bubble||e.carried){
            if(this.artStage==='factory'){advanceHazard('bubble',()=>this.advanceBubble(bubbleEscape,enemyActorPosition));advanceHazard('factorySecondary',()=>this.advanceFactorySecondary(secondaryMotionSeed,enemyActorPosition));}
            else if(this.artStage==='beanstalk'){advanceHazard('jumper',()=>this.advanceJumper(enemyActorPosition));advanceHazard('beanstalkSecondary',()=>this.advanceBeanstalkSecondary(enemyActorPosition));}
            else if(this.artStage==='jungle'){advanceHazard('jumper',()=>this.advanceJumper(enemyActorPosition));advanceHazard('jungleSecondary',()=>this.advanceParkSecondary(true,enemyActorPosition));}
            else if(this.artStage==='space'){advanceHazard('space',()=>this.advanceSpace(enemyActorPosition));advanceHazard('spaceSecondary',()=>this.advanceSpaceSecondary(enemyActorPosition));}
            else if(this.artStage==='dragon'){advanceHazard('dragon',()=>this.advanceDragon(enemyActorPosition));advanceHazard('dragonSecondary',()=>this.advanceDragonSecondary(enemyActorPosition));}
            else if(this.artStage==='castle'){advanceHazard('castle',()=>this.advanceCastle());advanceHazard('castleSecondary',()=>this.advanceCastleSecondary(secondaryMotionSeed,enemyActorPosition));}
            else if(this.artStage==='pirate'){advanceHazard('castle',()=>this.advanceCastle());advanceHazard('pirateSecondary',()=>this.advancePirateSecondary());}
            else if(this.artStage==='park'){advanceHazard('parkPrimary',()=>this.advanceParkPrimary(nativeWaterline!==null?this.previousWater:this.water));advanceHazard('parkSecondary',()=>this.advanceParkSecondary(false,enemyActorPosition));}
            else {
            this.hazard-=dt;
            if(this.hazard<=0){this.hazard=RULES.hazardInterval;this.bird={x:-1,y:e.y+1};}
            if(this.bird){
                this.bird.x+=RULES.birdSpeed*dt;
                if(Math.abs(this.bird.x-e.x)<0.6&&Math.abs(this.bird.y-e.y-0.6)<0.7){this.held=null;e.vy=-3;this.say('Thief!');this.bird=null;}
                else if(this.bird.x>this.p.columns+1)this.bird=null;
            }
            }
        }
        advanceNativeHazardCenters(this,hazardContactBlocked);
        if(deferredCarryPickupPass||(this.nativePickups&&(e.bubble||e.carried))){
            // ROM 0x0801909e..19152 runs primary hazards and state 5/6 discard
            // before 0x0800b944's pickup catch pass, which allows state 5/6.
            const nativeStateBlocksCatch=[2,3,7].includes(this.nativeActorState)||
                (this.nativeActorState===4&&!control.nativeFreezeActor);
            if(!nativeStateBlocksCatch&&!e.lightning&&!this.placing){
                const actorX=e.x*RULES.projectilePixels-RULES.bubbleActorAnchor,
                    actorY=RULES.nativeActorFloor-e.y*RULES.projectilePixels;
                for(let i=this.crates.length-1;i>=0;i--){
                    const c=this.crates[i];
                    if(!c.nativeMotion||(this.held&&c.item!=='boots'))continue;
                    if(!nativePickupCanCatch(c.nativeMotion,actorX,actorY))continue;
                    if(c.item==='bomb'&&!Number.isFinite(c.fuse))c.fuse=RULES.bombFuse;
                    delete c.nativeMotion;
                    const previousHeld=this.held;
                    this.held=c;this.crates.splice(i,1);this.say(c.item||'Place the outlined piece');
                    if(c.item!=='boots')this.nativePickupCaughtThisTick=true;
                    if(c.item!=='boots'&&Number.isInteger(c.nativeVariant))this.nativeActorRotation=c.nativeVariant&3;
                    if(c.item==='boots'){this.use(opponent);this.held=previousHeld;}
                }
            }
        }
        if(this.nativePendingBlastHit){
            this.nativePendingBlastHit=false;
            // Native projectile injury precedes the state-4 interpolation.
            // Ordinary input motion still precedes projectiles and is retained.
            const hitApplied=this.strikeLightning(this.nativeActorHandlerState===4?actorAtFrameStart:null,NATIVE_SOUND_PHASE.projectile);
            const hits=this.nativePendingBlastSoundHits??1;this.nativePendingBlastSoundHits=0;
            for(let i=Number(hitApplied);i<hits;i++)this.queueNativeSound(SFX.injury,NATIVE_SOUND_PHASE.projectile);
        }

        // Native row support is processed after actor movement/hazard contact;
        // a forced launch changes velocity now, without translating the actor.
        this.nativeActorAnimationVy=nativeLooseMoves?.length?nativeLooseAnimationVy:e.vy;
        if((nativeLooseMoves??this.advanceLoosePieces(nativeLooseOwnerLimit)).length){
            // The meter reads the board after unsupported owners descend.
            // A merged/emptied row changes its target in this same update.
            this.incompleteFloors=this.countIncompleteFloors();
            if(this.fieldIndex===0&&this.incompleteFloors>(this.nativeAudioIncompleteFloors??0)&&this.incompleteFloors>=NATIVE_SOUND_WARNING.minimumIncompleteFloors&&this.incompleteFloors<=NATIVE_SOUND_WARNING.maximumIncompleteFloors&&this.nativeAudioWarningFrame!==this.nativeFrame){this.queueNativeSound(SFX.towerWarning);this.nativeAudioWarningFrame=this.nativeFrame;}
            this.nativeAudioIncompleteFloors=this.incompleteFloors;
            this.risk=Math.min(1,this.incompleteFloors/RULES.warningFloors);
        }
        e.wet=e.y+0.75<this.water?e.wet+dt:Math.max(0,e.wet-dt*2);
        // The first-stage water creature returns the player to play. Merely
        // being underwater is not a timed defeat in this measured sequence.
        // 0x08019910: an empty row reached by the rising water ends the
        // round after the startup grace period, independently of swimming.
        // Complete submerged rows remain valid; returning from the water
        // must not make a destroyed field immortal.
        const waterDefeat=nativeWaterline!==null&&warningRow>=0&&warningRow<RULES.nativeActorMapRows&&
            submergedCells===0&&this.nativeFrame>RULES.nativeWaterDefeatReadyFrame;
        this.lost=this.lost||waterDefeat||e.wet>=RULES.drownTime&&!e.swimming&&!e.waterEjected;
        // Native rescue plane is screen Y<128 px. From the 720 px actor floor
        // and 16 px cells, that is a strict rise above 37 cells; equality does
        // not rescue. The setting moves this plane while preserving strictness.
        const actorScreenY=RULES.nativeActorFloor-(control.nativeMotion?actorAtFrameStart.y:e.y)*RULES.projectilePixels;
        const rescuePlaneY=RULES.nativeActorFloor-this.p.goal*RULES.projectilePixels;
        this.won=Boolean(this.nativeRescueBody)||(afterResult&&this.won)||(!e.introDescent&&!e.lightning&&!e.bubble&&!e.carried&&
            (!control.nativeMotion||nativeRescueEligible)&&actorScreenY<rescuePlaneY);
        if(control.nativeFreezeActor&&this.nativeActorState===4&&this.nativeActorNextState===0){
            this.nativeActorState=0;this.nativeActorNextState=0;
        }
    }
}
export function reachableTowerColumn(tower,column){
    const start=Math.max(0,Math.min(tower.p.columns-1,Math.floor(tower.egg.x))),direction=Math.sign(column-start);
    const maxRise=RULES.jump**2/(2*RULES.gravity*RULES.floatGravity);
    let surface=tower.top(start);
    for(let x=start+direction;direction&&direction*(column-x)>=0;x+=direction){
        const next=tower.top(x);if(next-surface>maxRise+1e-6)return false;surface=next;
    }
    return true;
}
export function plan(tower){if(!tower.held?.cells)return null;const native=planNativePiece(tower,column=>reachableTowerColumn(tower,column));if(native!==undefined)return native;let cells=tower.held.cells,best=null;for(let r=0;r<4;r++){for(let x=0;x<tower.p.columns;x++){const center=x+(Math.max(...cells.map(p=>p[0]))+1>>1);if(!reachableTowerColumn(tower,Math.min(center,tower.p.columns-1)))continue;const y=tower.landing(cells,x);if(y===null)continue;const heights=Array.from({length:tower.p.columns},(_,i)=>tower.top(i));let holes=0;for(const [cx,cy]of cells){holes+=Math.max(0,y+cy-heights[x+cx]);heights[x+cx]=Math.max(heights[x+cx],y+cy+1);}let lines=0;for(let yy=y;yy<=y+3;yy++){if(Array.from({length:tower.p.columns},(_,xx)=>tower.cell(xx,yy)||cells.some(([cx,cy])=>x+cx===xx&&y+cy===yy)).every(Boolean))lines++;}const score=holes*9+Math.max(...heights)*1.5+heights.reduce((a,h,i)=>a+(i?Math.abs(h-heights[i-1]):0),0)-lines*18;if(!best||score<best.score)best={score,x:x+(Math.max(...cells.map(p=>p[0]))+1>>1)+0.5,r};}cells=rotate(cells);}return best;}

