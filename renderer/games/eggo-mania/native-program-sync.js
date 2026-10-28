// A timing context may only supply audio while it follows the visible game.
// Original input replay alone does not prove alignment with live game state.
export function nativeAudioDivergence(expected,actual){
 if(!actual)return null; // Historical diagnostic builds have no event trace.
 if(Boolean(expected.reset)!==Boolean(actual.reset))return {kind:'reset',expected:Boolean(expected.reset),actual:Boolean(actual.reset)};
 for(const kind of ['music','effects','tempo']){
  const a=expected[kind]??[],b=actual[kind]??[];
  if(a.length!==b.length||a.some((id,i)=>id!==b[i]))return {kind,expected:a,actual:b};
 }
 return null;
}
