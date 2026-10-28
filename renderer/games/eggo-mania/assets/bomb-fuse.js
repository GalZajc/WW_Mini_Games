// ROM 0x0800efc0..f090: body blink, shortened wick, independent global flame clock.
// The two held-item OAM submissions straddle the global clock update.
export const NATIVE_BOMB_ART=Object.freeze({"size":16,"destinationSize":32,"clockPeriod":24,"clockOamDelay":2,"heldClockOamDelays":[2,1],"flameTicks":8,"bodySlowThreshold":120,"bodyFastThreshold":50,"wickStart":270,"wickShift":6});
