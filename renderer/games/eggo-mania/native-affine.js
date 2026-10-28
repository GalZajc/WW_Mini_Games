// Captured GBA OAM matrices for clockwise turns from each starting orientation.
// Every entry is signed 8.8 [pa, pb, pc, pd] for one displayed frame.
export const NATIVE_PREVIEW_TURNS_BY_ORIENTATION_8_8=Object.freeze([
    Object.freeze([
        Object.freeze([236,97,-98,236]),Object.freeze([197,162,-163,197]),
        Object.freeze([157,201,-202,157]),Object.freeze([122,225,-226,122]),
        Object.freeze([93,238,-239,93]),Object.freeze([71,245,-246,71]),
        Object.freeze([54,250,-251,54]),Object.freeze([40,252,-253,40]),
        Object.freeze([31,254,-255,31]),Object.freeze([23,254,-255,23]),
        Object.freeze([17,255,-256,17]),Object.freeze([0,256,-256,0]),
    ]),
    Object.freeze([
        Object.freeze([-98,236,-237,-98]),Object.freeze([-163,197,-198,-163]),
        Object.freeze([-202,157,-158,-202]),Object.freeze([-226,122,-123,-226]),
        Object.freeze([-239,93,-94,-239]),Object.freeze([-246,71,-72,-246]),
        Object.freeze([-251,54,-55,-251]),Object.freeze([-253,40,-41,-253]),
        Object.freeze([-255,31,-32,-255]),Object.freeze([-255,23,-24,-255]),
        Object.freeze([-256,17,-18,-256]),Object.freeze([-256,0,0,-256]),
    ]),
    Object.freeze([
        Object.freeze([-237,-98,97,-237]),Object.freeze([-198,-163,162,-198]),
        Object.freeze([-158,-202,201,-158]),Object.freeze([-123,-226,225,-123]),
        Object.freeze([-94,-239,238,-94]),Object.freeze([-72,-246,245,-72]),
        Object.freeze([-55,-251,250,-55]),Object.freeze([-41,-253,252,-41]),
        Object.freeze([-32,-255,254,-32]),Object.freeze([-24,-255,254,-24]),
        Object.freeze([-18,-256,255,-18]),Object.freeze([0,-256,256,0]),
    ]),
    Object.freeze([
        Object.freeze([97,-237,236,97]),Object.freeze([162,-198,197,162]),
        Object.freeze([201,-158,157,201]),Object.freeze([225,-123,122,225]),
        Object.freeze([238,-94,93,238]),Object.freeze([245,-72,71,245]),
        Object.freeze([250,-55,54,250]),Object.freeze([252,-41,40,252]),
        Object.freeze([254,-32,31,254]),Object.freeze([254,-24,23,254]),
        Object.freeze([255,-18,17,255]),Object.freeze([256,0,0,256]),
    ]),
]);
export const NATIVE_PREVIEW_TURN_8_8=NATIVE_PREVIEW_TURNS_BY_ORIENTATION_8_8[0];

// The OAM object's screen Y origin is eased independently of its affine
// matrix. These signed-pixel offsets are measured from the same twelve-frame
// ROM capture: one sequence for moving down and one for moving up.
export const NATIVE_PREVIEW_OAM_Y_DOWN=Object.freeze([4,7,9,10,12,13,13,14,16,16,16,16]);
export const NATIVE_PREVIEW_OAM_Y_UP=Object.freeze([4,7,10,11,13,14,14,15,16,16,16,16]);

const IDENTITY=Object.freeze([256,0,0,256]);
const CARDINAL=Object.freeze([
    IDENTITY,Object.freeze([0,256,-256,0]),Object.freeze([-256,0,0,-256]),
    Object.freeze([0,-256,256,0]),
]);

export function nativePreviewTurnMatrix(orientation,direction,tick){
    const turns=((orientation%4)+4)%4;
    const frame=Math.max(0,Math.min(NATIVE_PREVIEW_TURN_8_8.length,Math.trunc(tick)));
    if(direction<0){
        const previous=(turns+3)&3,remaining=NATIVE_PREVIEW_TURN_8_8.length-frame;
        return remaining===0?CARDINAL[previous]:NATIVE_PREVIEW_TURNS_BY_ORIENTATION_8_8[previous][remaining-1];
    }
    return frame===0?CARDINAL[turns]:NATIVE_PREVIEW_TURNS_BY_ORIENTATION_8_8[turns][frame-1];
}

export function nativePreviewOamYShift(tick,screenDirection){
    if(!screenDirection)return 0;
    const offsets=screenDirection>0?NATIVE_PREVIEW_OAM_Y_DOWN:NATIVE_PREVIEW_OAM_Y_UP;
    return offsets[Math.max(0,Math.min(offsets.length-1,Math.trunc(tick)-1))]||0;
}
