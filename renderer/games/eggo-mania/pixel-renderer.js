import {RULES,SURVIVAL_STAGES,survivalStage,cloudStriking,cloudScale,fillerPhase,nativePickupAffineMatrix,nativePreviewAngleMatrix,nativeSkeletalFishMatrix,nativeFlightSpriteMatrix} from './model.js';
import {NATIVE_WATER} from './native-water.js';
import {NATIVE_BOMB_ART} from './assets/bomb-fuse.js';
import {NATIVE_RESCUE,NATIVE_INTRO,nativeRescueBoat} from './native-rescue.js';
import {NATIVE_CHARACTER_RESOURCES} from './native-character-resources.js';
import {VIEW,METER_VIEW,ACTOR_VIEW,THROW_VIEW,PLACED_VIEW,throwPiecePose,actorPose,rivalPose,nativeHeldItemOffset,backgroundOffset,nativeBg3ScrollOffset,nativeStageRingScroll,pickupAngle,countdownPose,introBackgroundOffset,collapseWavePose,nativeAffineMatrix,nativeAffinePixelMap} from './view.js';
import {itemIcon} from './icons.js';
import {NATIVE_ITEMS} from './assets/native-items.js';
import {NATIVE_PIECE_MASKS} from './assets/native-piece-masks.js';
import {CHARACTER_ART} from './assets/characters.js';
import {CHARACTER_MENU_ART} from './assets/character-menu.js';
import {MENU_ANIMATION} from './assets/character-menu-animation.js';
import {FACTORY_BACKGROUND_FIELD_SAMPLES,FACTORY_BACKGROUND_ATLAS_COLUMNS,FACTORY_BACKGROUND_HEIGHT_TOLERANCE} from './assets/factory-background-timeline.js';
import {NATIVE_AMBIENT} from './native-ambient.js';
import {BG3_STREAMS} from './assets/background-rings.js';
import {WATER_SURFACE_PHASE_OFFSETS} from './assets/water-animation-phases.js';
import {PREVIEW_PRIOR_PALETTE,PIECE_MATERIAL_PALETTES,THROW_MATERIAL_PALETTES,PIECE_INITIAL_OBJ_PALETTE} from './assets/preview-palettes.js';
import {createResultView,resultGlyphPosition,PODIUM_VIEW,podiumPose,resultOpacity} from './result-view.js';
// Original-resolution renderer. Local-ROM artwork provenance is in assets/README.md.
// Procedural drawings remain as a fallback while bitmap assets load.
const {tile:TILE,height:HEIGHT,floor:FLOOR,divider:DIVIDER}=VIEW;
const BG3_TILE_PIXELS=8;
const STAGES=SURVIVAL_STAGES;
const ART={};
const READY_ART=new WeakSet();
const ART_LOADS=[];
const NATIVE_DIVIDER={xOffsets:[0,8],waterlineScale:27,waterlineDivisor:128,
    progressRows:47,progressDivisor:8,verticalOffset:-9,surfaceOverhang:8};
const NATIVE_PROGRESS_PORTRAIT={heightScale:27,heightDivisor:128,verticalOffset:-16};
const PANEL_CACHE=new Map();
const BG3_RING_CACHE=new Map();
const NATIVE_PREVIEW_CACHE=new Map();
const NATIVE_AFFINE_CACHE=new Map();
const NATIVE_PREVIEW_SOURCE_CACHE=new Map();
const NATIVE_PICKUP_AFFINE_CACHE=new Map();
const TILE_ALPHA_MASK_CACHE=new WeakMap();
const NATIVE_PICKUP_SOURCE_CACHE=new Map();
const NATIVE_THROW_AFFINE_CACHE=new Map();
const NATIVE_THROW_SOURCE_CACHE=new Map();
const NATIVE_EFFECT_AFFINE_CACHE=new Map();
const NATIVE_EFFECT_SOURCE_CACHE=new Map();
// Keep only the current fade level for each immutable source, not 32 atlases.
const NATIVE_PALETTE_IMAGE_CACHE=new WeakMap();
const NATIVE_PALETTE_PIXELS_CACHE=new WeakMap();
const IMMUTABLE_FADE_SOURCES=new WeakSet();
export const NATIVE_FADE_FRAMES=32;
const NATIVE_FADE_FULL_ATLAS_PIXELS=131072;
const NATIVE_FADE_SOURCE_CACHE_BYTES=32*1024*1024;
const NATIVE_FADE_SOURCE_PIXELS=new Map();
let nativeFadeSourceBytes=0;
// Reuse the exact native channel rounding instead of repeating its arithmetic per pixel.
const NATIVE_FADE_RED_BLUE=Array.from({length:NATIVE_FADE_FRAMES+1},(_,step)=>
    Uint8Array.from({length:256},(_,value)=>Math.floor(((Math.round(value*31/255)*step)>>5)*255/31)));
const NATIVE_FADE_GREEN=Array.from({length:NATIVE_FADE_FRAMES+1},(_,step)=>
    Uint8Array.from({length:256},(_,value)=>Math.floor((((Math.round(value*63/255)>>1)*step)>>5)*2*255/63)));
function paletteFadePixels(source,step){
    if(step>=32)return source;
    const cached=NATIVE_PALETTE_PIXELS_CACHE.get(source);
    if(cached?.step===step)return cached.pixels;
    const pixels=new Uint8ClampedArray(source);
    const rb=NATIVE_FADE_RED_BLUE[step],green=NATIVE_FADE_GREEN[step];
    for(let i=0;i<pixels.length;i+=4){
        pixels[i]=rb[source[i]];pixels[i+1]=green[source[i+1]];pixels[i+2]=rb[source[i+2]];
    }
    NATIVE_PALETTE_PIXELS_CACHE.set(source,{step,pixels});return pixels;
}
function immutableFadePixels(source,sx,sy,width,height){
    let cached=NATIVE_FADE_SOURCE_PIXELS.get(source);
    const key=`${sx},${sy},${width},${height}`,size=width*height*4;
    if(cached){
        NATIVE_FADE_SOURCE_PIXELS.delete(source);NATIVE_FADE_SOURCE_PIXELS.set(source,cached);
        if(cached.crops.has(key))return cached.crops.get(key);
    }
    if(size>NATIVE_FADE_SOURCE_CACHE_BYTES)return null;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(source,sx,sy,width,height,0,0,width,height);
    const data=context.getImageData(0,0,width,height).data;
    // Partial-alpha sources retain the original Canvas round-trip path.
    for(let i=3;i<data.length;i+=4)if(data[i]!==0&&data[i]!==255)return null;
    while(nativeFadeSourceBytes+size>NATIVE_FADE_SOURCE_CACHE_BYTES){
        const oldest=NATIVE_FADE_SOURCE_PIXELS.keys().next().value;
        nativeFadeSourceBytes-=NATIVE_FADE_SOURCE_PIXELS.get(oldest).bytes;NATIVE_FADE_SOURCE_PIXELS.delete(oldest);
    }
    cached=NATIVE_FADE_SOURCE_PIXELS.get(source)||{crops:new Map(),bytes:0};
    cached.crops.set(key,data);cached.bytes+=size;
    NATIVE_FADE_SOURCE_PIXELS.set(source,cached);nativeFadeSourceBytes+=size;return data;
}
function paletteFadeArtwork(source,step,sx=0,sy=0,width=sourceWidth(source),height=sourceHeight(source)){
    const immutable=READY_ART.has(source)||IMMUTABLE_FADE_SOURCES.has(source),key=`${sx},${sy},${width},${height}`;
    let cached=immutable&&NATIVE_PALETTE_IMAGE_CACHE.get(source);
    if(cached?.step===step&&cached.crops.has(key))return cached.crops.get(key);
    const image=document.createElement('canvas');image.width=width;image.height=height;
    const ctx=image.getContext('2d',{willReadFrequently:true});
    const raw=immutable?immutableFadePixels(source,sx,sy,width,height):null;
    if(raw){
        const pixels=ctx.createImageData(width,height),rb=NATIVE_FADE_RED_BLUE[step],green=NATIVE_FADE_GREEN[step];
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const from=(y*width+x)*4,to=from;
            pixels.data[to]=rb[raw[from]];pixels.data[to+1]=green[raw[from+1]];
            pixels.data[to+2]=rb[raw[from+2]];pixels.data[to+3]=raw[from+3];
        }
        ctx.putImageData(pixels,0,0);
    }else{
        ctx.drawImage(source,sx,sy,width,height,0,0,width,height);
        const pixels=ctx.getImageData(0,0,image.width,image.height);
        pixels.data.set(paletteFadePixels(pixels.data,step));ctx.putImageData(pixels,0,0);
    }
    if(immutable){
        if(!cached||cached.step!==step){cached={step,crops:new Map()};NATIVE_PALETTE_IMAGE_CACHE.set(source,cached);}
        cached.crops.set(key,image);
    }
    return image;
}
function paletteFadeContext(context,step){
    // Palette changes precede hardware alpha blending. Fading the completed
    // framebuffer instead gives different rounding beneath water/lava.
    return new Proxy(context,{
        get(target,key){
            if(key==='nativePaletteFadeStep')return step;
            if(key==='drawImage')return(source,...args)=>{
                // Small immutable tile atlases are cheaper to convert once than
                // to allocate/read back dozens of separate 16px cells.
                if((READY_ART.has(source)||IMMUTABLE_FADE_SOURCES.has(source))&&
                    sourceWidth(source)*sourceHeight(source)<=NATIVE_FADE_FULL_ATLAS_PIXELS)
                    return target.drawImage(paletteFadeArtwork(source,step),...args);
                // Native atlas coordinates are integer rectangles. Fade the cel,
                // not the entire multi-megapixel atlas on each palette step.
                if(args.length===8){
                    const [sx,sy,sw,sh,...destination]=args;
                    if([sx,sy,sw,sh].every(Number.isInteger)&&sx>=0&&sy>=0&&sw>0&&sh>0&&
                        sx+sw<=sourceWidth(source)&&sy+sh<=sourceHeight(source))
                        return target.drawImage(paletteFadeArtwork(source,step,sx,sy,sw,sh),0,0,sw,sh,...destination);
                }
                return target.drawImage(paletteFadeArtwork(source,step),...args);
            };
            const value=Reflect.get(target,key,target);
            return typeof value==='function'?value.bind(target):value;
        },
        set(target,key,value){return Reflect.set(target,key,value,target);}
    });
}

// The GBA stores green in 5 bits, but mGBA exposes the framebuffer as RGB565
// with the native green bit shifted into an extra low bit. Decode ROM-derived
// PNGs into those same 32 display levels once when they load.
const RGB565_GREEN_LEVEL=new Uint8Array(256);
const RGB565_GREEN_DISPLAY_LEVEL=new Uint8Array(256);
for(let green5=0;green5<32;green5++){
    const nativeLevel=((green5*2)*255/63)|0;
    RGB565_GREEN_LEVEL[nativeLevel]=1;
    RGB565_GREEN_DISPLAY_LEVEL[green5*255/31|0]=nativeLevel;
}
for(let green8=0;green8<256;green8++){
    if(RGB565_GREEN_LEVEL[green8])RGB565_GREEN_DISPLAY_LEVEL[green8]=green8;
    else RGB565_GREEN_DISPLAY_LEVEL[green8]=RGB565_GREEN_DISPLAY_LEVEL[Math.round(green8*31/255)*255/31|0];
}
function nativeRgb565Artwork(image){
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    context.drawImage(image,0,0);
    const pixels=context.getImageData(0,0,canvas.width,canvas.height);
    let changed=false;
    for(let i=0;i<pixels.data.length;i+=4){
        if(!pixels.data[i+3])continue;
        const green=pixels.data[i+1],nativeGreen=RGB565_GREEN_DISPLAY_LEVEL[green];
        if(green!==nativeGreen){pixels.data[i+1]=nativeGreen;changed=true;}
    }
    if(!changed)return image;
    context.putImageData(pixels,0,0);
    return canvas;
}
function loadArt(name){
    const img=new Image();
    const loaded=new Promise(resolve=>{
        const finish=()=>{
            if(ART[name]===img){
                let decoded=img;
                try{decoded=nativeRgb565Artwork(img);}catch{}
                ART[name]=decoded;READY_ART.add(decoded);
            }
            resolve();
        };
        img.onload=()=>{
            let decode;
            try{decode=typeof img.decode==='function'?img.decode():Promise.resolve();}
            catch{decode=Promise.resolve();}
            Promise.resolve(decode).then(finish,finish);
        };
        img.onerror=resolve;
    });
    ART[name]=img;ART_LOADS.push(loaded);
    img.src=new URL(`./assets/${name}.png`,import.meta.url).href;
}
export function waitForPixelAssets(){
    assets();
    return Promise.all(ART_LOADS);
}
export function pixelAssetStatus(name){
    assets();
    const image=ART[name];
    return {ready:ready(image),width:sourceWidth(image),height:sourceHeight(image)};
}
function assets(){
    for(const stage of NATIVE_AMBIENT.stages){const name=`ambient-${stage}`;if(!ART[name])loadArt(name);}
    for(const field of ['player','cpu'])for(const phase of ['short','long']){
        const name=`bg3-pirate-${field}-weather-${phase}`;if(!ART[name])loadArt(name);
    }
    for(const stage of STAGES)if(!ART[`platform-${stage}`])loadArt(`platform-${stage}`);
    for(const stage of STAGES)if(!ART[`${stage}-rival-specials`])loadArt(`${stage}-rival-specials`);
    for(const stage of STAGES)for(const name of ['intro-balloon','rescue-blimp','airship-flame'])if(!ART[`${name}-${stage}`])loadArt(`${name}-${stage}`);
    if(!ART['character-menu-animation'])loadArt('character-menu-animation');
    for(const stage of STAGES)if(!ART[`${stage}-water-bg3-body`])loadArt(`${stage}-water-bg3-body`);
    for(const name of ['character-menu-background','character-menu-sprites',...Object.keys(CHARACTER_ART).map(name=>`${name}-native-poses`)])if(!ART[name])loadArt(name);
    if(!ART['water-creature-phases'])loadArt('water-creature-phases');
    if(!ART['bomb-parts'])loadArt('bomb-parts');
    if(!ART['native-blast'])loadArt('native-blast');
    if(!ART['impact-spark'])loadArt('impact-spark');
    for(const stage of STAGES)if(stage!=='factory')for(const layer of ['surface','body','bg3'])
        if(!ART[`${stage}-water-${layer}`])loadArt(`${stage}-water-${layer}`);
    for(const stage of STAGES)if(!ART[`water-splash-${stage}`])loadArt(`water-splash-${stage}`);
    for(const stage of STAGES)if(!ART[`bonus-${stage}`])loadArt(`bonus-${stage}`);
    if(!ART['factory-rival-native'])loadArt('factory-rival-native');
    if(!ART['electric-bubble-burst'])loadArt('electric-bubble-burst');
    for(const name of Object.keys(CHARACTER_ART))for(const suffix of ['rival-native','player-native'])if(!ART[`${name}-${suffix}`])loadArt(`${name}-${suffix}`);
    for(const stage of STAGES)if(!ART[`${stage}-rival-specials`])loadArt(`${stage}-rival-specials`);
    if(!ART.factory)for(const name of [...STAGES,...STAGES.map(s=>`${s}-water-overhang`),...STAGES.flatMap(s=>[`bg3-${s}-player`,`bg3-${s}-cpu`,`bg3-streams-${s}-player`,`bg3-streams-${s}-cpu`]),...STAGES.map(s=>`placed-${s}`),...STAGES.map(s=>`filler-${s}`),...STAGES.map(s=>`${s}-intro`),...STAGES.map(s=>`${s}-rival-poses`),'countdown','result-letters','intro-balloon','yolko','yolko-poses','yolko-native-poses','item-icons','native-items','throw-pieces','bomb-armed','bomb-explosion','progress-portraits','rival',...STAGES.filter(s=>s!=='factory').map(s=>`${s}-rival`),'cloud-phases','hammer-flight','electric-bubble','beanstalk-enemy','beanstalk-secondary','beanstalk-secondary-vine','jungle-enemy','jungle-secondary','space-enemy','space-secondary','dragon-enemy','dragon-secondary','castle-enemy','castle-secondary','pirate-enemy','pirate-secondary','park-secondary','park-enemy','factory-secondary','factory-secondary-wings','factory-water-surface','factory-water-body','factory-waterline-bg3','factory-background-atlas','solid-tile','orange-tile','rescue-blimp','water-creature','meter-bars','meter-pointer','completed-floor-star','panel-atlas','platform','destructive-wave','water-warning'])loadArt(name);
    for(const name of ['progress-divider','native-divider-waterline','native-divider-progress','player-portraits',...Object.keys(CHARACTER_ART).flatMap(name=>[`${name}-player-poses`,`${name}-podium-win`,`${name}-podium-loss`]),'podium-background','podium-wins','podium-digits','podium-game-over','podium-win-actor','podium-loss-actor'])if(!ART[name])loadArt(name);
    return ART;
}
function sourceWidth(img){return img?.naturalWidth||img?.width||0;}
function sourceHeight(img){return img?.naturalHeight||img?.height||0;}
function ready(img){return Boolean(img&&READY_ART.has(img)&&sourceWidth(img)>0);}
export function nativePiecePreviewArt(kind){
    if(!Number.isInteger(kind)||kind<0||kind>7)return null;
    if(NATIVE_PREVIEW_CACHE.has(kind))return NATIVE_PREVIEW_CACHE.get(kind);
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const context=canvas.getContext('2d',{willReadFrequently:true});context.imageSmoothingEnabled=false;context.fillStyle='#fff';
    const cells=NATIVE_PIECE_MASKS[kind],occupied=new Set(cells.map(([x,y])=>`${x},${y}`));
    for(const [cx,cy] of cells){
        const x=8+cx*16,y=8+cy*16;
        if(!occupied.has(`${cx},${cy-1}`))context.fillRect(x,y,16,2);
        if(!occupied.has(`${cx+1},${cy}`))context.fillRect(x+14,y,2,16);
        if(!occupied.has(`${cx},${cy+1}`))context.fillRect(x,y+14,16,2);
        if(!occupied.has(`${cx-1},${cy}`))context.fillRect(x,y,2,16);
    }
    // The ROM joins the two sides of each concave turn with a 2×2 pixel cap.
    // This is why its connected-piece outline has no per-cell interior seams.
    for(let vx=0;vx<=3;vx++)for(let vy=0;vy<=3;vy++){
        const around=[[vx-1,vy-1],[vx,vy-1],[vx-1,vy],[vx,vy]];
        const present=around.map(([x,y])=>occupied.has(`${x},${y}`));
        if(present.filter(Boolean).length!==3)continue;
        const missing=present.indexOf(false),opposite=[3,2,1,0][missing];
        const x=8+vx*16+([0,2].includes(opposite)?-2:0);
        const y=8+vy*16+([0,1].includes(opposite)?-2:0);
        context.fillRect(x,y,2,2);
    }
    IMMUTABLE_FADE_SOURCES.add(canvas);NATIVE_PREVIEW_CACHE.set(kind,canvas);return canvas;
}
export function nativePiecePreviewAffineArt(kind,angle,matrixOverride=null,paletteKind=null,paletteColor=null,stage='factory'){
    const matrix=matrixOverride||nativeAffineMatrix(angle),key=`${stage}:${kind}:${matrix.join(',')}:${paletteKind??'white'}:${paletteColor}`;
    const white=Number.isInteger(paletteColor)?paletteColor:Number.isInteger(paletteKind)?
        (PREVIEW_PRIOR_PALETTE[stage]??VIEW.previewPriorPaletteWhite)[paletteKind]:0x7fff;
    const cached=NATIVE_AFFINE_CACHE.get(key);
    if(cached)return cached;
    let source=NATIVE_PREVIEW_SOURCE_CACHE.get(kind);
    if(!source){
        const art=nativePiecePreviewArt(kind),context=art.getContext('2d',{willReadFrequently:true});
        source=context.getImageData(0,0,64,64).data;
        NATIVE_PREVIEW_SOURCE_CACHE.set(kind,source);
    }
    const pixelMap=nativeAffinePixelMap(matrix),canvas=document.createElement('canvas');
    canvas.width=canvas.height=64;
    const context=canvas.getContext('2d',{willReadFrequently:true}),image=context.createImageData(64,64),output=image.data;
    // OBJ texture coordinates are measured from pixel (32, 32), not from
    // Canvas's geometric half-pixel center. Signed >> 8 matches the GBA's
    // fixed-point source-pixel lookup and clips to the original 64px OBJ box.
    for(let destinationPixel=0;destinationPixel<pixelMap.length;destinationPixel++){
        const sourcePixel=pixelMap[destinationPixel];
        if(sourcePixel<0)continue;
        const sourceIndex=sourcePixel*4;
        if(!source[sourceIndex+3])continue;
        const destinationIndex=destinationPixel*4;
        output[destinationIndex]=(white&31)*255/31|0;
        // Captured mGBA frames expose GBA RGB555 green through RGB565.
        output[destinationIndex+1]=((white>>5&31)*2)*255/63|0;
        output[destinationIndex+2]=(white>>10&31)*255/31|0;
        output[destinationIndex+3]=source[sourceIndex+3];
    }
    context.putImageData(image,0,0);
    if(NATIVE_AFFINE_CACHE.size>=512)NATIVE_AFFINE_CACHE.clear();
    IMMUTABLE_FADE_SOURCES.add(canvas);NATIVE_AFFINE_CACHE.set(key,canvas);
    return canvas;
}
function drawNativePiecePreview(c,t,preview,X,Y,left,visualOverride){
    const kind=preview.nativeKind,rotation=preview.nativeRotation;
    const mask=NATIVE_PIECE_MASKS[(rotation&3)*8+kind];
    const maxY=Math.max(...mask.map(([,y])=>y));
    const visual=visualOverride===undefined?
        (t.nativePreviewRotation?.held===t.held?t.nativePreviewRotation:null):visualOverride;
    const origin=nativePreviewGridOrigin(preview,visual);
    const spriteGridX=origin.x,spriteGridY=origin.y;
    const x=Math.floor(X(spriteGridX)-8);
    // Use the same pixel-snapped projection as the grid. A fractional camera
    // during the post-throw ease must not leave this outline between cell rows.
    const y=preview.nativeOrigin?Math.floor(FLOOR-(spriteGridY-(t.nativeRenderFrame?.camera??0))*TILE)-8:Y(spriteGridY)-8;
    const angle=Number.isFinite(preview.rotationAngle)?preview.rotationAngle:rotation*Math.PI/2;
    c.drawImage(nativePiecePreviewAffineArt(kind,angle,visual?.affineMatrix,visual?.paletteKind,visual?.paletteColor,t.artStage??'factory'),x,y);
}
export function nativePreviewRenderState(t){
    const snapshot=t.nativeRenderFrame?.nativePreviewSnapshot;
    const state=snapshot?
        {preview:snapshot.preview,visual:snapshot.rotation}:
        {preview:t.preview(),visual:t.nativePreviewRotation?.held===t.held?t.nativePreviewRotation:null};
    const position=snapshot?snapshot.position:t.nativePreviewPosition;
    if(snapshot)state.visual=snapshot.rotation;
    if(snapshot&&!position)return {preview:null,visual:state.visual};
    if(state.preview&&position)state.preview={...state.preview,nativeOrigin:{
        x:(position.xQ16/RULES.actorFixedScale+RULES.previewPositionOriginBias)/TILE,
        y:(RULES.previewPositionWorldYReference-position.yQ16/RULES.actorFixedScale)/TILE}};
    return state;
}
function sameNativeHeldState(a,b){
    if(!a||!b)return a===b;
    if(a.nativeKind!==b.nativeKind||a.nativeVariant!==b.nativeVariant||a.item!==b.item)return false;
    if(Array.isArray(a.cells)||Array.isArray(b.cells)){
        return Array.isArray(a.cells)&&Array.isArray(b.cells)&&a.cells.length===b.cells.length&&
            a.cells.every((cell,index)=>cell[0]===b.cells[index]?.[0]&&cell[1]===b.cells[index]?.[1]);
    }
    return true;
}
export function nativePreviewGridOrigin(preview,visual=null){
    if(preview?.nativeOrigin)return preview.nativeOrigin;
    if(!preview||!Number.isInteger(preview.nativeKind)||!Number.isInteger(preview.nativeRotation))return null;
    const mask=NATIVE_PIECE_MASKS[(preview.nativeRotation&3)*8+preview.nativeKind],
        minX=Math.min(...mask.map(([x])=>x)),maxY=Math.max(...mask.map(([,y])=>y)),
        x=preview.x-minX,y=preview.y+maxY+1;
    // Physics may move the actor after advanceNativePreviewRotation ran this
    // tick. Outside a captured turn, anchor to the just-computed landing cell
    // instead of retaining that one-tick-old preview origin. During a native
    // affine turn, preserve only its measured OAM Y displacement relative to
    // the current target; the cell-grid anchor itself still follows the live
    // landing result.
    const animatedOffset=visual?.turn?
        visual.spriteGridY-visual.targetSpriteGridY:0;
    return{x,y:y+animatedOffset};
}
export function visibleTowerRowRange(camera,rowCount){
    const floor=FLOOR+VIEW.boardOriginOffsetY;
    // A tile at world row y occupies [Y(y+1),Y(y+1)+TILE). Because the floor
    // sits below the viewport center, lower rows remain visible up to four
    // world rows below the camera. The former cam-1 cutoff hid those tiles.
    const first=Math.max(0,Math.min(rowCount,Math.floor(camera+(floor-HEIGHT)/TILE-1)+1));
    const end=Math.max(first,Math.min(rowCount,Math.ceil(camera+(floor+TILE)/TILE-1)));
    return [first,end];
}
export function bg3StreamFrameIndex(globalCounter,rate,period){
    if(!Number.isFinite(globalCounter)||!Number.isInteger(rate)||rate<=0||!Number.isInteger(period)||period<=0)return 0;
    return Math.floor(Math.max(0,globalCounter)/rate)%period;
}
function animatedStageRing(stage,field,ring,gameFrame){
    const spec=BG3_STREAMS[stage]?.[field];
    const atlas=ART[`bg3-streams-${stage}-${field}`];
    if(!spec?.rows?.length||!ready(ring)||!ready(atlas))return ring;
    const key=`${stage}:${field}`;
    let cache=BG3_RING_CACHE.get(key);
    if(!cache){
        const canvas=typeof OffscreenCanvas!=='undefined'?
            new OffscreenCanvas(sourceWidth(ring),sourceHeight(ring)):document.createElement('canvas');
        canvas.width=sourceWidth(ring);canvas.height=sourceHeight(ring);
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
        ctx.drawImage(ring,0,0);
        cache={canvas,ctx,signature:null};BG3_RING_CACHE.set(key,cache);
    }
    // gameFrame counts completed ticks since round reset; the ROM's
    // 0x02011A9C counter starts at 1. Stream rows are queued from the prior
    // counter, so gameFrame is exactly the counter value used by the DMA.
    // Atlas metadata's nativeFrameCounter belongs to its source capture, not
    // to a new match's starting phase.
    const counter=Math.max(0,Math.floor(gameFrame||0));
    const indexes=spec.rows.map(row=>bg3StreamFrameIndex(counter,row.rate,row.period));
    const signature=indexes.join(',');
    if(signature!==cache.signature){
        for(let i=0;i<spec.rows.length;i++){
            const row=spec.rows[i],index=indexes[i];
            const x=row.xTiles*BG3_TILE_PIXELS,y=row.ringRow*BG3_TILE_PIXELS;
            const width=row.widthTiles*BG3_TILE_PIXELS;
            cache.ctx.clearRect(x,y,width,BG3_TILE_PIXELS);
            cache.ctx.drawImage(atlas,0,row.atlasY+index*BG3_TILE_PIXELS,
                width,BG3_TILE_PIXELS,x,y,width,BG3_TILE_PIXELS);
        }
        cache.signature=signature;
    }
    return cache.canvas;
}
const USE_HEIGHT_KEYED_FACTORY_BG=false;
function factoryBackgroundMapIndex(height,field){
    const samples=FACTORY_BACKGROUND_FIELD_SAMPLES[field?'cpu':'player'];
    if(!samples?.length)return -1;
    let low=0,high=samples.length-1;
    while(low<high){const middle=Math.ceil((low+high)/2);if(samples[middle][0]<=height)low=middle;else high=middle-1;}
    let selected=samples[low];
    if(low+1<samples.length&&Math.abs(samples[low+1][0]-height)<Math.abs(selected[0]-height))selected=samples[low+1];
    return Math.abs(selected[0]-height)<=FACTORY_BACKGROUND_HEIGHT_TOLERANCE?selected[1]:-1;
}
function rect(c,x,y,w,h,color){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
function line(c,x,y,x2,y2,color){c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(Math.round(x)+.5,Math.round(y)+.5);c.lineTo(Math.round(x2)+.5,Math.round(y2)+.5);c.stroke();}
function bolt(c,x,y){rect(c,x,y,2,2,'#161c23');rect(c,x,y,1,1,'#f0ece0');}
function pipe(c,x,y,length,vertical=false){
    const shades=['#22150b','#69401f','#ae6e2f','#f1c276','#fff0ad','#bc7836','#754321','#281b12'];
    shades.forEach((s,i)=>rect(c,x+(vertical?i:0),y+(vertical?0:i),vertical?1:length,vertical?length:1,s));
    for(let d=0;d<length;d+=32){rect(c,x+(vertical?-1:d),y+(vertical?d:-1),vertical?10:3,vertical?3:10,'#382514');rect(c,x+(vertical?0:d+1),y+(vertical?d+1:0),vertical?8:1,vertical?1:8,'#d9a364');}
}
function metal(c,x,y,solid,kind=0,material=0,same=()=>false){
    if(ready(ART['panel-atlas'])){
        const style=solid?1:material;
        const neighbors=[[-1,0],[1,0],[0,1],[0,-1],[-1,1],[1,1],[-1,-1],[1,-1]];
        const mask=neighbors.reduce((bits,[dx,dy],i)=>bits|(same(dx,dy)?1<<i:0),0);
        const key=style*256+mask;
        let tile=PANEL_CACHE.get(key);
        if(!tile){
        tile=document.createElement('canvas');tile.width=tile.height=16;
        const tc=tile.getContext('2d',{willReadFrequently:true});tc.imageSmoothingEnabled=false;
        for(let corner=0;corner<4;corner++){
            const dx=corner%2?1:-1,dy=corner<2?1:-1;
            const h=Boolean(mask&(1<<(dx<0?0:1))),v=Boolean(mask&(1<<(dy>0?2:3)));
            const d=Boolean(mask&(1<<(4+corner)));
            const state=h&&v&&d?4:Number(h)+2*Number(v);
            tc.drawImage(ART['panel-atlas'],(corner*5+state)*8,style*8,8,8,
                dx>0?8:0,dy<0?8:0,8,8);
        }
        IMMUTABLE_FADE_SOURCES.add(tile);PANEL_CACHE.set(key,tile);
        }
        c.drawImage(tile,Math.round(x),Math.round(y));
        return;
    }
    if(ready(ART[solid?'solid-tile':'orange-tile'])){c.drawImage(ART[solid?'solid-tile':'orange-tile'],Math.round(x),Math.round(y));return;}
    const base=solid?'#9d9a88':'#ad6126', hi=solid?'#dcd8be':'#efb761', shadow=solid?'#53574e':'#603015';
    rect(c,x,y,16,16,shadow);rect(c,x+1,y+1,14,14,base);rect(c,x+1,y+1,14,1,hi);rect(c,x+1,y+1,1,14,hi);
    line(c,x+2,y+12,x+12,y+2,solid?'#bab7a3':'#c9833b');line(c,x+4,y+13,x+13,y+4,solid?'#b4b09d':'#bd7939');
    if(solid){line(c,x+3,y+6,x+6,y+3,'#777d72');line(c,x+9,y+12,x+12,y+9,'#d0cbb3');}
    else {line(c,x+3,y+4,x+10,y+4,'#d7944a');line(c,x+3,y+6,x+8,y+6,'#8f4c20');}
    bolt(c,x+2,y+2);bolt(c,x+12,y+12);
}
function factory(c,width,height){
    rect(c,0,0,width,height,'#123b52');
    for(let y=0;y<height;y+=16)for(let x=0;x<width;x+=16){
        const light=(x/16+y/16)%3;rect(c,x+1,y+1,14,14,['#256583','#397b94','#20566f'][light]);
        rect(c,x+2,y+2,12,1,'#568e9c');rect(c,x+2,y+3,1,10,'#417e96');rect(c,x+3,y+13,10,1,'#17485b');bolt(c,x+12,y+3);
        if((x+y)%48===0){rect(c,x+5,y+5,5,6,'#143b4e');rect(c,x+6,y+6,3,1,'#4d9db0');}
    }
    pipe(c,8,0,height,true);pipe(c,width-18,0,height,true);
    for(let y=34;y<height;y+=96){
        pipe(c,0,y,width,false);
        rect(c,24,y+17,43,27,'#10282f');rect(c,26,y+19,39,23,'#285853');
        rect(c,28,y+26,35,11,'#487d08');rect(c,29,y+26,32,5,'#98cf04');rect(c,31,y+26,28,2,'#e1ff28');
        rect(c,29,y+37,33,3,'#886f28');rect(c,32,y+40,27,3,'#38251c');
        pipe(c,22,y+10,16,true);pipe(c,64,y+10,16,true);
        for(let k=0;k<5;k++)rect(c,34+k*5,y+23-(k%2)*4,2,2,'#c8fa4e');
        rect(c,73,y+46,27,26,'#202c32');rect(c,75,y+48,23,22,'#a5a690');
        c.fillStyle='#e7e7d1';c.beginPath();c.arc(86,y+59,9,0,Math.PI*2);c.fill();line(c,86,y+59,88,y+52,'#98252a');
        for(let k=0;k<3;k++){rect(c,28+k*11,y+61,7,14,'#10272a');rect(c,29+k*11,y+60,5,2,'#b5aa6c');rect(c,30+k*11,y+63,2,10,'#697e70');}
    }
}
const EGG=[
'        kk        ',
'      kkwwkk      ',
'     kwwwwwlk     ',
'    kwwwwwwwlk    ',
'   kwwwwwwwwwlk   ',
'   kwwwkwkwwwlk   ',
'  kwwwwkwkwwwwlk  ',
'  kwwwwkwkwwwwlk  ',
'  kwwwwwwwwwwwlk  ',
'  kwwwwwwwwwwwlk  ',
'   kwwwwwwwwwlk   ',
'   kwwwwkkwwwlk   ',
'    kwwwwwwwlk    ',
'     kkwwwlkk     ',
'       kkkk       ',
];
function egg(c,x,y,t,index,stage=t.artStage,renderFacing=t.egg.facing,renderWalking=t.egg.walking,renderPoseState=''){
    // Native OAM truncates the fixed-point actor X coordinate; rounding it to
    // nearest shifted every captured player pose one pixel to the right.
    x=Math.floor(x);y=Math.round(y);
    if(t.nativeRenderFrame?.intro||t.nativeActorState===3){
        const resource=NATIVE_CHARACTER_RESOURCES[index?t.nativeRivalCharacter:t.p.character];
        // EA04 uses a stationary free-air clip in the Space saucer;
        // every other vessel uses the animated hanging clip.
        const space=stage==='space',groupId=space?NATIVE_INTRO.spaceAnimationGroup:NATIVE_INTRO.animationGroup,
            step=space?NATIVE_INTRO.spaceAnimationStep:NATIVE_INTRO.animationStep,
            group=resource?.groups[groupId],sheet=resource&&(index?resource.sheet:resource.playerSheet);
        if(group&&ready(ART[sheet])){
            const frame=Math.floor(Math.max(0,t.nativeFrame-2)*step/65536)%group.period;
            const {size,anchorX,anchorY}=ACTOR_VIEW;
            c.drawImage(ART[sheet],frame*size,group.row*size,size,size,x-anchorX,y-anchorY,size,size);
            return {pose:{nativeGroup:groupId},mirrored:false};
        }
    }
    const pose=index&&rivalPose(t,stage),
        rivalAtlas=index&&ART[pose?.resource?.sheet??`${stage}-rival-poses`];
    if(pose&&ready(rivalAtlas)){
        // Pose pixels come from raw OBJ tiles. Native OAM flips only while
        // moving left in directional poses; the pre-update snapshot preserves
        // the ROM's one-frame OAM handoff and its fixed free-air poses.
        const nativeGroup=Number.isInteger(pose.nativeGroup),
            directionalPose=nativeGroup?
            [3,4,8,9,12,13].includes(pose.nativeGroup):['walk','rise','float','fall'].includes(renderPoseState),
            // A stopped walk finishes its cycle with the same native H-flip.
            mirrorX=pose.mirrorX??Boolean(directionalPose&&(nativeGroup||renderWalking)&&renderFacing<0);
        const {size,anchorX,anchorY}=ACTOR_VIEW;c.save();c.translate(x,y);if(mirrorX)c.scale(-1,1);
        c.drawImage(rivalAtlas,pose.frame*size,pose.row*size,size,size,-anchorX,-anchorY,size,size);c.restore();return {pose,mirrored:mirrorX};
    }
    const playerAtlas=ART[`${t.p.character||'yolko'}-player-poses`]||ART['yolko-poses'];
    if(!index&&ready(playerAtlas)){
        const pose=actorPose(t),{row,frame}=pose,{size,anchorX,anchorY}=ACTOR_VIEW;
        // The ROM keeps some player clips in a fixed screen-facing orientation.
        // Native OAM confirms these exact atlas rows stay unflipped even when
        // the movement-facing flag is left: throw and the free-hand idle/air
        // poses. Walking and held-item motion clips still follow OAM H-flip.
        const facingIndependentPose=['throw','idle','idle-free','rise-free','float-free','fall-free',
            'swim','recovery-free','recovery-held'].includes(pose.state);
        c.save();c.translate(x,y);if(pose.mirrorX??(renderFacing<0&&!facingIndependentPose))c.scale(-1,1);
        const nativeSource=pose.resource&&ART[pose.resource.sheet];
        if(ready(nativeSource))c.drawImage(nativeSource,
            pose.resource.column*size,pose.resource.row*size,size,size,-anchorX,-anchorY,size,size);
        else c.drawImage(playerAtlas,frame*size,row*size,size,size,-anchorX,-anchorY,size,size);
        c.restore();return {pose,mirrored:renderFacing<0&&!facingIndependentPose};
    }
    const name=index?(stage==='factory'?'rival':`${stage}-rival`):'yolko';
    if(ready(ART[name])){c.drawImage(ART[name],x-32,y-56);return;}
    const body=index?'#79d327':'#f291e8',shade=index?'#387719':'#af42a4';
    const flap=Math.round(Math.sin(t.time*12)*2), wet=t.egg.wet>0;
    for(const side of[-1,1]){
        rect(c,x+side*8-2,y-18+flap,5,4,'#151b20');rect(c,x+side*8-1,y-19+flap,3,5,'#e0ded0');rect(c,x+side*8,y-20+flap,2,3,'#fff7dc');
        rect(c,x+side*4-3,y-3,6,3,'#17222a');rect(c,x+side*4-2,y-4,5,2,'#f0e6b7');
    }
    const colors={k:'#252432',w:wet?'#85bde7':body,l:shade};
    EGG.forEach((row,yy)=>[...row].forEach((p,xx)=>{if(colors[p])rect(c,x-9+xx,y-19+yy,1,1,colors[p]);}));
    rect(c,x-3,y-14,1,4,'#fff');rect(c,x,y-14,1,4,'#fff');
    if(t.egg.boost>0){rect(c,x-6,y,4,2,'#ffe55c');rect(c,x+2,y,4,2,'#ffe55c');}
}
export function nativePickupDisplayVariant(item){
    if(Number.isInteger(item?.nativeVariant))return ((item.nativeVariant%4)+4)%4;
    if(!item?.cells||!Number.isInteger(item?.nativeKind))return 0;
    const signature=cells=>cells.map(([x,y])=>`${x},${y}`).sort().join(';');
    const key=signature(item.cells);
    for(let i=0;i<4;i++)if(signature(NATIVE_ITEMS[i*13+item.nativeKind]?.cells||[])===key)return i;
    return 0;
}
function nativePickupAffineArt(kind,variant,matrix,doubleSize=true){
    const source=ART['native-items'],size=VIEW.itemSize,destinationSize=doubleSize?size*2:size,
        key=`${kind}:${variant}:${doubleSize?1:0}:${matrix.join(',')}`;
    const cached=NATIVE_PICKUP_AFFINE_CACHE.get(key);if(cached)return cached;
    const sourceKey=`${kind}:${variant}`;let pixels=NATIVE_PICKUP_SOURCE_CACHE.get(sourceKey);
    if(!pixels){
        const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
        const context=canvas.getContext('2d',{willReadFrequently:true});context.imageSmoothingEnabled=false;
        context.drawImage(source,kind*size,variant*size,size,size,0,0,size,size);
        pixels=context.getImageData(0,0,size,size).data;NATIVE_PICKUP_SOURCE_CACHE.set(sourceKey,pixels);
    }
    const indices=nativeAffinePixelMap(matrix,size,size,destinationSize,destinationSize),
        canvas=document.createElement('canvas');canvas.width=canvas.height=destinationSize;
    const context=canvas.getContext('2d',{willReadFrequently:true}),image=context.createImageData(destinationSize,destinationSize),output=image.data;
    for(let i=0;i<indices.length;i++){
        const sourceIndex=indices[i];if(sourceIndex<0)continue;
        const from=sourceIndex*4,to=i*4;if(!pixels[from+3])continue;
        output[to]=pixels[from];output[to+1]=RGB565_GREEN_DISPLAY_LEVEL[pixels[from+1]];
        output[to+2]=pixels[from+2];output[to+3]=pixels[from+3];
    }
    context.putImageData(image,0,0);
    if(NATIVE_PICKUP_AFFINE_CACHE.size>=256)NATIVE_PICKUP_AFFINE_CACHE.clear();
    IMMUTABLE_FADE_SOURCES.add(canvas);NATIVE_PICKUP_AFFINE_CACHE.set(key,canvas);return canvas;
}
export function nativeThrowAffineArt(kind,matrix,palettePending=false,stage='factory',initialPalette=false,priorPaletteKind=null){
    const source=ART[stage==='factory'?'throw-pieces':`placed-${stage}`],size=THROW_VIEW.size,
        sourceKey=`${stage}:${kind}`,key=`${sourceKey}:${matrix.join(',')}:${palettePending?initialPalette?2:1:0}:${palettePending?priorPaletteKind:null}`;
    const cached=NATIVE_THROW_AFFINE_CACHE.get(key);if(cached)return cached;
    let pixels=NATIVE_THROW_SOURCE_CACHE.get(sourceKey);
    if(!pixels){
        const sourceCanvas=document.createElement('canvas');sourceCanvas.width=sourceCanvas.height=size;
        const sourceContext=sourceCanvas.getContext('2d',{willReadFrequently:true});sourceContext.imageSmoothingEnabled=false;
        // The ROM keeps the piece in its unrotated source orientation. Its
        // signed 8.8 OAM matrix supplies the selected quarter-turn.
        if(stage==='factory')sourceContext.drawImage(source,kind*size,0,size,size,0,0,size,size);
        else sourceContext.drawImage(source,kind*PLACED_VIEW.size,0,PLACED_VIEW.size,PLACED_VIEW.size,
            (size-PLACED_VIEW.size)/2,(size-PLACED_VIEW.size)/2,PLACED_VIEW.size,PLACED_VIEW.size);
        pixels=sourceContext.getImageData(0,0,size,size).data;
        NATIVE_THROW_SOURCE_CACHE.set(sourceKey,pixels);
    }
    const indices=nativeAffinePixelMap(matrix,size,size,size,size),
        canvas=document.createElement('canvas');canvas.width=canvas.height=size;
    const context=canvas.getContext('2d',{willReadFrequently:true}),image=context.createImageData(size,size),output=image.data;
    const sourcePalette=PIECE_MATERIAL_PALETTES[stage][kind],targetPalette=THROW_MATERIAL_PALETTES[stage][kind],
        recolor=!palettePending&&sourcePalette.some((color,index)=>index>0&&color!==targetPalette[index]),
        paletteIndices=(palettePending||recolor)?new Map(sourcePalette.map((color,index)=>{
        const red=Math.floor((color&31)*255/31),green=Math.floor(((color>>5)&31)*510/63),
            blue=Math.floor(((color>>10)&31)*255/31);
        return [(red<<16)|(green<<8)|blue,index];
    })):null;
    for(let i=0;i<indices.length;i++){
        const sourceIndex=indices[i];if(sourceIndex<0)continue;
        const from=sourceIndex*4,to=i*4;if(!pixels[from+3])continue;
        const green=stage==='factory'?RGB565_GREEN_DISPLAY_LEVEL[pixels[from+1]]:pixels[from+1];
        output[to]=pixels[from];output[to+1]=green;
        output[to+2]=pixels[from+2];output[to+3]=pixels[from+3];
        if(recolor){
            const index=paletteIndices.get((pixels[from]<<16)|(green<<8)|pixels[from+2]),
                color=targetPalette[index??0];
            output[to]=Math.floor((color&31)*255/31);
            output[to+1]=Math.floor(((color>>5)&31)*510/63);
            output[to+2]=Math.floor(((color>>10)&31)*255/31);
        }
        // Tile upload precedes material palette upload. A visible outline
        // leaves black/white behind; a culled outline leaves the ROM's
        // initial OBJ palette intact instead.
        if(palettePending){
            const index=paletteIndices.get((pixels[from]<<16)|(green<<8)|pixels[from+2]);
            if(initialPalette||Number.isInteger(priorPaletteKind)){
                // A culled outline retains the last uploaded material palette.
                const palette=initialPalette?PIECE_INITIAL_OBJ_PALETTE:
                    THROW_MATERIAL_PALETTES[stage][priorPaletteKind];
                const color=palette[index??0];
                output[to]=Math.floor((color&31)*255/31);
                output[to+1]=Math.floor(((color>>5)&31)*510/63);
                output[to+2]=Math.floor(((color>>10)&31)*255/31);
            }else{
                const white=index===15;
                output[to]=output[to+2]=white?255:0;output[to+1]=white?250:0;
            }
        }
    }
    context.putImageData(image,0,0);
    if(NATIVE_THROW_AFFINE_CACHE.size>=128)NATIVE_THROW_AFFINE_CACHE.clear();
    IMMUTABLE_FADE_SOURCES.add(canvas);NATIVE_THROW_AFFINE_CACHE.set(key,canvas);return canvas;
}
// Keep every GBA source pixel the same size while the window can fit an
// integer enlargement. This avoids uneven tile borders and camera shimmer.
export function pixelArtScale(sourceWidth,sourceHeight,availableWidth,availableHeight){
    const fit=Math.min(availableWidth/sourceWidth,availableHeight/sourceHeight);
    return fit>=1?Math.floor(fit):fit;
}
const NATIVE_ARMED_BOMB_CACHE=new Map();
export function nativeArmedBombArt(remaining,clock){
    const p=NATIVE_BOMB_ART,size=p.size,body=remaining>p.bodySlowThreshold?(remaining>>5)&1:
        remaining>p.bodyFastThreshold?2:1+((remaining>>3)&1),
        flame=Math.floor(((clock%p.clockPeriod)+p.clockPeriod)%p.clockPeriod/p.flameTicks),
        wick=(p.wickStart-remaining)>>p.wickShift,key=`${body}:${flame}:${wick}`;
    if(NATIVE_ARMED_BOMB_CACHE.has(key))return NATIVE_ARMED_BOMB_CACHE.get(key);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=p.destinationSize;
    const c=canvas.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=false;
    c.drawImage(ART['bomb-parts'],body*size,0,size,size,size/2,size/2,size,size);
    c.drawImage(ART['bomb-parts'],(3+flame)*size,0,size,size,size/2+wick+1,size/2+wick-5,size,size);
    IMMUTABLE_FADE_SOURCES.add(canvas);NATIVE_ARMED_BOMB_CACHE.set(key,canvas);
    return canvas;
}
function crate(c,item,x,y,held=false){
    // GBA writes pickup screen origins from integer-truncated world
    // coordinates. Rounding the center shifted fractional-X pickups by one
    // pixel (the frame-600 kind-0 pickup at x=1.7956 is native x=20, not 21).
    x=Math.floor(x);y=Math.floor(y);
    if(item.item==='hammer'&&item.phase&&ready(ART['hammer-flight'])){
        const size=VIEW.itemSize,angle=item.nativeAngle??
            (Math.round((item.age||0)/RULES.step)*RULES.hammerSpriteAngleStep)%RULES.hammerSpriteAnglePeriod;
        c.drawImage(nativeEffectAffineArt('hammer-flight',0,size,nativePreviewAngleMatrix(angle)),x-size/2,y-size/2);return;
    }
    const icon=itemIcon(item),size=VIEW.itemSize;
    if(item.item==='bomb'&&Number.isFinite(item.fuse)&&ready(ART['bomb-parts'])){
        const image=nativeArmedBombArt(Math.max(0,Math.round(item.fuse/RULES.step)),item.nativeFlameClock??0);
        c.drawImage(image,x-image.width/2,y-image.height/2);return;
    }
    if((item.item==='hammer'||item.nativeKind===11)&&held&&ready(ART['hammer-flight'])){
        c.drawImage(ART['hammer-flight'],x-size/2,y-size/2);return;
    }
    if(Number.isInteger(item.nativeKind)&&ready(ART['native-items'])){
        const variant=nativePickupDisplayVariant(item);
        if(!held&&item.nativeKind>=8){
            const matrix=Array.isArray(item.nativeAffineMatrix)?item.nativeAffineMatrix:
                Number.isInteger(item.nativeSwayFrame)?nativePickupAffineMatrix(item.nativeSwayFrame):nativeAffineMatrix(pickupAngle(item));
            const sprite=nativePickupAffineArt(item.nativeKind,variant,matrix,item.nativeAffineDoubleSize!==false);
            c.drawImage(sprite,Math.round(x)-sprite.width/2,Math.round(y)-sprite.height/2);return;
        }
        c.save();c.translate(Math.round(x),Math.round(y));c.rotate(pickupAngle(item,held));
        c.drawImage(ART['native-items'],item.nativeKind*size,variant*size,size,size,-size/2,-size/2,size,size);c.restore();return;
    }
    if(icon!==null&&ready(ART['item-icons'])){
        c.save();c.translate(Math.round(x),Math.round(y));c.rotate(pickupAngle(item,held));
        c.drawImage(ART['item-icons'],icon*size,0,size,size,-size/2,-size/2,size,size);c.restore();return;
    }
    x=Math.round(x);y=Math.round(y);rect(c,x-6,y-6,12,12,'#231d11');rect(c,x-5,y-5,10,10,'#ffd986');rect(c,x-4,y-4,8,8,'#aa661e');
    rect(c,x-5,y-5,10,1,'#ffffc5');rect(c,x-5,y-5,1,10,'#fff3b9');
    if(item.cells){const w=Math.max(...item.cells.map(p=>p[0]))+1,h=Math.max(...item.cells.map(p=>p[1]))+1;const s=2;
        for(const[a,b]of item.cells){const xx=x-Math.floor(w*s/2)+a*s, yy=y+Math.floor(h*s/2)-(b+1)*s;rect(c,xx,yy,s+1,s+1,'#132943');rect(c,xx,yy,s,s,'#9de7ff');}}
    else{c.fillStyle='#ffffa7';c.font='bold 9px monospace';c.textAlign='center';c.fillText({filler:'F',boots:'↑',cloud:'ϟ',hammer:'T',bomb:'●'}[item.item]||'?',x,y+3);if(item.item==='bomb'){rect(c,x+2,y-8,2,3,'#edb442');rect(c,x+3,y-9,2,2,'#fff2a5');}}
}
function balloon(c,x,y){
    if(ready(ART['rescue-blimp'])){c.drawImage(ART['rescue-blimp'],Math.round(x)-64,Math.round(y)-100);return;}
    c.strokeStyle='#362f22';c.lineWidth=1;c.fillStyle='#e89724';c.beginPath();c.ellipse(x,y-24,18,22,0,0,Math.PI*2);c.fill();c.stroke();
    c.fillStyle='#edd97c';c.beginPath();c.ellipse(x,y-24,7,22,0,0,Math.PI*2);c.fill();
    for(const d of[-8,8])line(c,x+d,y-7,x+d,y+3,'#34291c');rect(c,x-13,y+1,26,8,'#664825');rect(c,x-12,y+2,24,2,'#ccab6c');
    for(let k=0;k<6;k++)rect(c,x-11+k*4,y+4,2,4,'#ac834a');
}
export function drawCollapseWave(c,t,left,Y,width){
    assets();const pose=collapseWavePose(t),art=ART['destructive-wave'];
    if(!pose||!ready(art))return;
    const {destructiveWaveWidth:w,destructiveWaveHeight:h}=VIEW;
    c.drawImage(art,pose.frame*w,0,w,h,left,Y(pose.floor+1)-VIEW.destructiveWaveLift,width,h);
}
export function drawNativeMeter(c,state,left,width){
    assets();if(!ready(ART['meter-bars'])||!ready(ART['meter-pointer']))return false;
    const pose=state?.previousMeterPose||state?.meterPose;
    const {barWidth:w,barHeight:h,fieldWidth}=METER_VIEW,phase=pose?.flashing?2:0,scale=width/fieldWidth;
    c.drawImage(ART['meter-bars'],phase*w,0,w,h,left+8*scale,pose?.barY??152,w*scale,h);
    c.drawImage(ART['meter-bars'],(phase+1)*w,0,w,h,left+72*scale,pose?.barY??152,w*scale,h);
    c.drawImage(ART['meter-pointer'],Math.round(left+(pose?.x??14)*scale),pose?.y??148,8*scale,8);
    return true;
}
function blendFactoryWaterPixel(sourcePixels,si,pixels,i){
    const eva=VIEW.factoryWaterBlendEva,evb=VIEW.factoryWaterBlendEvb;
    // Green has six display bits in RGB565 (the ROM's five bits shifted
    // left once). Recover that channel by decoding RGB565 first; scaling
    // it directly as RGB555 rounds values such as 27 down to 26.
    const sr=Math.round(sourcePixels[si]*31/255),sg=Math.round(sourcePixels[si+1]*63/255)>>1,sb=Math.round(sourcePixels[si+2]*31/255),
        dr=Math.round(pixels[i]*31/255),dg=Math.round(pixels[i+1]*63/255)>>1,db=Math.round(pixels[i+2]*31/255),
        r=Math.min(31,(eva*sr+evb*dr)>>4),green=Math.min(31,(eva*sg+evb*dg)>>4),b=Math.min(31,(eva*sb+evb*db)>>4);
    pixels[i]=Math.floor(r*255/31);
    pixels[i+1]=Math.floor((green*2)*255/63);
    pixels[i+2]=Math.floor(b*255/31);
}
function blendFactoryWaterPixels(c,left,wy,width,height,sourcePixels,sourceWidth,secondTargetMask=null){
    sourcePixels=paletteFadePixels(sourcePixels,c.nativePaletteFadeStep??32);
    const target=c.getImageData(left,wy,width,height),pixels=target.data;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(y*width+x)*4,si=(y*sourceWidth+x)*4;
        if(sourcePixels[si+3]===0){
            if(secondTargetMask&&!secondTargetMask[y*width+x])pixels.set([0,0,0,255],i);
            continue;
        }
        // WIN0 disables BG3 below the waterline. A transparent BG0 texel
        // exposes the backdrop, which is not a second alpha target (BLDCNT
        // 0x1d42). In that case BG1 is opaque, not blended with the dry BG3.
        if(secondTargetMask&&!secondTargetMask[y*width+x])pixels.set(sourcePixels.subarray(si,si+4),i);
        else blendFactoryWaterPixel(sourcePixels,si,pixels,i);
    }
    c.putImageData(target,left,wy);
}
function tileAlphaMask(image,sourceX,sourceY){
    let cache=TILE_ALPHA_MASK_CACHE.get(image);
    if(!cache){
        const canvas=typeof OffscreenCanvas!=='undefined'?
            new OffscreenCanvas(sourceWidth(image),sourceHeight(image)):document.createElement('canvas');
        canvas.width=sourceWidth(image);canvas.height=sourceHeight(image);
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
        ctx.drawImage(image,0,0);
        cache={ctx,masks:new Map()};TILE_ALPHA_MASK_CACHE.set(image,cache);
    }
    const key=`${sourceX}:${sourceY}`;
    let mask=cache.masks.get(key);
    if(!mask){
        const alpha=cache.ctx.getImageData(sourceX,sourceY,TILE,TILE).data;
        mask=new Uint8Array(TILE*TILE);
        for(let i=0;i<mask.length;i++)mask[i]=alpha[i*4+3]>0?1:0;
        cache.masks.set(key,mask);
    }
    return mask;
}
function markPanelPixels(occupied,width,height,left,top,tileMask){
    const x0=Math.max(0,left),x1=Math.min(width,left+TILE),y0=Math.max(0,top),y1=Math.min(height,top+TILE);
    if(x1<=x0||y1<=y0)return;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)
        if(!tileMask||tileMask[(y-top)*TILE+x-left])occupied[y*width+x]=1;
}
function nativeBoardOpaqueMask(t,wy,width,height,boardY){
    const occupied=new Uint8Array(width*height),columns=t.p.columns;
    // BG0 placed cells have higher priority than the late factory layers.
    // Preserve only their opaque texels: transparent BG0 texels reveal BG1,
    // which can still cover lower-priority actors and pickups.
    const renderRows=t.nativeRenderFrame?.rows||t.rows;
    for(let rowIndex=0;rowIndex<renderRows.length;rowIndex++){
        const row=renderRows[rowIndex];if(!row)continue;
        const screenTop=Math.round(boardY(rowIndex+1))-wy;
        for(let column=0;column<columns;column++)if(row.cells[column]){
            let mask=null;
            const filler=row.filler?.[column],fillerAtlas=ART[`${filler?.bonus?'bonus':'filler'}-${t.artStage||'factory'}`];
            if(filler&&ready(fillerAtlas)){
                mask=tileAlphaMask(fillerAtlas,filler.bonus?0:fillerPhase(filler,t.nativeFrame-(t.nativeRenderFrame?1:0))*TILE,0);
            }else{
                const art=row.nativeArt?.[column]||0,atlas=ART[`placed-${t.artStage||'factory'}`];
                if(art&&ready(atlas)){
                    const index=art-1,{cellsPerPiece,cellStride,kinds,size}=PLACED_VIEW,
                        picture=Math.floor(index/cellsPerPiece),cell=index%cellsPerPiece,
                        sourceX=(picture%kinds)*size+(cell%cellStride)*TILE,
                        sourceY=Math.floor(picture/kinds)*size+Math.floor(cell/cellStride)*TILE;
                    mask=tileAlphaMask(atlas,sourceX,sourceY);
                }
            }
            markPanelPixels(occupied,width,height,column*TILE,screenTop,mask);
        }
    }
    return occupied;
}
function blendFactoryLayerOverLowerPrioritySprites(c,t,left,wy,width,height,sourcePixels,baseline,boardY){
    if(!sourcePixels||!baseline||width<=0||height<=0)return;
    sourcePixels=paletteFadePixels(sourcePixels,c.nativePaletteFadeStep??32);
    const target=c.getImageData(left,wy,width,height),pixels=target.data,base=baseline.data;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const i=(y*width+x)*4,si=(y*width+x)*4,bi=((wy+y)*width+x)*4;
        if(sourcePixels[si+3]===0)continue;
        // The first layer pass already covered the background. Only pixels
        // changed by later, lower-priority sprites need it composited again.
        if(pixels[i]===base[bi]&&pixels[i+1]===base[bi+1]&&pixels[i+2]===base[bi+2])continue;
        blendFactoryWaterPixel(sourcePixels,si,pixels,i);
    }
    c.putImageData(target,left,wy);
}
function drawFactoryWaterBlend(c,g,left,wy,width,frame,stage='factory',tower=null,boardY=null){
    const sourceY=stage==='factory'?VIEW.factoryWaterBodySourceY:0,
        bodyHeight=256-VIEW.factoryWaterBodySourceY,frameHeight=stage==='factory'?256:bodyHeight,
        art=ART[`${stage}-water-body`];
    const visibleHeight=Math.min(bodyHeight,HEIGHT-wy);
    if(visibleHeight<=0)return;
    if(!g.factoryWaterSourceCanvas){
        g.factoryWaterSourceCanvas=document.createElement('canvas');
        g.factoryWaterSourceCanvas.width=width;g.factoryWaterSourceCanvas.height=bodyHeight;
        g.factoryWaterSourceContext=g.factoryWaterSourceCanvas.getContext('2d',{willReadFrequently:true});
        g.factoryWaterSourceContext.imageSmoothingEnabled=false;
    }
    if(g.factoryWaterSourceFrame!==frame||g.factoryWaterSourceStage!==stage){
        const source=g.factoryWaterSourceContext;
        source.clearRect(0,0,width,bodyHeight);
        source.drawImage(art,0,frame*frameHeight+sourceY,width,bodyHeight,
            0,0,width,bodyHeight);
        g.factoryWaterSourcePixels=source.getImageData(0,0,width,bodyHeight).data;
        g.factoryWaterSourceFrame=frame;
        g.factoryWaterSourceStage=stage;
    }
    let secondTargetMask=null;
    if(stage!=='factory'&&tower&&boardY){
        secondTargetMask=nativeBoardOpaqueMask(tower,wy,width,visibleHeight,boardY);
        const foundation=ART[`platform-${stage}`]??ART.platform;
        if(ready(foundation))for(let y=0;y<sourceHeight(foundation);y+=TILE)
            for(let x=0;x<width;x+=TILE)
                markPanelPixels(secondTargetMask,width,visibleHeight,x,Math.round(boardY(0))+y-wy,tileAlphaMask(foundation,x,y));
    }
    blendFactoryWaterPixels(c,left,wy,width,visibleHeight,g.factoryWaterSourcePixels,width,secondTargetMask);
}
function drawFactoryWaterlineBg3(c,g,left,splitY,width,frame,stage='factory',tower=null,boardY=null){
    const height=256-VIEW.factoryWaterBodySourceY,
        visibleHeight=Math.min(height,HEIGHT-splitY);
    if(visibleHeight<=0)return;
    if(!g.factoryWaterlineCanvas){
        g.factoryWaterlineCanvas=document.createElement('canvas');
        g.factoryWaterlineCanvas.width=width;g.factoryWaterlineCanvas.height=height;
        g.factoryWaterlineContext=g.factoryWaterlineCanvas.getContext('2d',{willReadFrequently:true});
        g.factoryWaterlineContext.imageSmoothingEnabled=false;
    }
    if(g.factoryWaterlineFrame!==frame||g.factoryWaterlineWidth!==width||g.factoryWaterlineStage!==stage){
        const source=g.factoryWaterlineContext,atlas=ART[`${stage}-water-bg3-body`];
        source.clearRect(0,0,width,height);
        source.drawImage(atlas,0,frame*height,112,height,0,0,width,height);
        g.factoryWaterlinePixels=source.getImageData(0,0,width,height).data;
        g.factoryWaterlineFrame=frame;g.factoryWaterlineWidth=width;
        g.factoryWaterlineStage=stage;
    }
    let secondTargetMask=null;
    if(stage!=='factory'&&tower&&boardY){
        secondTargetMask=nativeBoardOpaqueMask(tower,splitY,width,visibleHeight,boardY);
        const foundation=ART[`platform-${stage}`];
        if(ready(foundation))for(let y=0;y<sourceHeight(foundation);y+=TILE)
            for(let x=0;x<width;x+=TILE)
                markPanelPixels(secondTargetMask,width,visibleHeight,x,Math.round(boardY(0))+y-splitY,tileAlphaMask(foundation,x,y));
    }
    blendFactoryWaterPixels(c,left,splitY,width,visibleHeight,
        g.factoryWaterlinePixels,width,secondTargetMask);
}
export function drawTowerPanels(c,t,X,Y,start=0,end=t.rows.length,stage=t.artStage){
    assets();
    const rows=t.nativeRenderFrame?.rows||t.rows;
    for(let y=start;y<end;y++){
        const row=rows[y];if(!row)continue;
        for(let x=0;x<t.p.columns;x++)if(row.cells[x]){
            const art=row.nativeArt?.[x]||0,atlas=ART[`placed-${stage||'factory'}`];
            const filler=row.filler?.[x],fillerAtlas=ART[`${filler?.bonus?'bonus':'filler'}-${stage||'factory'}`];
            if(filler&&ready(fillerAtlas)){
                // BG tile uploads precede this tick's filler animation update.
                c.drawImage(fillerAtlas,filler.bonus?0:fillerPhase(filler,t.nativeFrame-(t.nativeRenderFrame?1:0))*TILE,0,TILE,TILE,
                    Math.round(X(x)),Math.round(Y(y+1)),TILE,TILE);
                continue;
            }
            if(art&&ready(atlas)){
                const index=art-1,{cellsPerPiece,cellStride,kinds,size}=PLACED_VIEW;
                const picture=Math.floor(index/cellsPerPiece),cell=index%cellsPerPiece;
                c.drawImage(atlas,(picture%kinds)*size+(cell%cellStride)*TILE,
                    Math.floor(picture/kinds)*size+Math.floor(cell/cellStride)*TILE,TILE,TILE,
                    Math.round(X(x)),Math.round(Y(y+1)),TILE,TILE);
                continue;
            }
            const owner=row.owners?.[x]||-row.cells[x];
            const same=(dx,dy)=>{
                const other=t.rows[y+dy];const value=other?.cells[x+dx];
                return Boolean(value&&(other.owners?.[x+dx]||-value)===owner);
            };
            metal(c,X(x),Y(y+1),row.sealed,row.cells[x],row.materials?.[x]||0,same);
        }
    }
}
function drawCompletionStars(c,t,X,Y){
    const rows=t.nativeRenderFrame?.rows||t.rows,
        sparkle=ART['completed-floor-star'],frame=t.nativeFrame||0,star=VIEW.completionStar;
    if(ready(sparkle))for(const effect of t.completedFloorEffects||[]){
        const age=frame-effect.bornFrame,row=rows[effect.row];
        if(age<0||age>=RULES.completionStarDuration||!row)continue;
        const y=Math.round(Y(effect.row)+RULES.nativeActorFloor+TILE-VIEW.nativeCameraReferencePixels-FLOOR+
            star.worldOffset+(age+1)*star.fallPixelsPerFrame),
            cel=Math.min(star.frames-1,Math.floor((age+1)/4));
        for(let x=0;x<t.p.columns;x++)if(row.cells[x])
            c.drawImage(sparkle,cel*star.size,0,star.size,star.size,Math.round(X(x))+star.worldOffset,y,star.size,star.size);
    }
}
function drawWaterSplashes(c,g,stage,width){
    const art=ART[`water-splash-${stage}`],p=NATIVE_WATER;
    if(!ready(art))return;
    // Splash OBJ priority 0 is above water BG1/BG3 and all gameplay bodies.
    // Repaint foreign-field overhang too; the caller clips to its own field.
    for(const index of [1,0]){
        const t=index?g.cpu:g.player;
        if(!t?.nativeWaterSplashes)continue;
        const camera=g.views?.[index]?.previousNativeCameraPosition??
            VIEW.nativeCameraReferencePixels-(g.camera[index]||0)*TILE,
            water=t.previousWater??t.water,
            y=Math.floor(RULES.nativeActorFloor-water*TILE+RULES.bubbleWaterlineBias)-
                Math.floor(camera)+p.splashYBias,
            left=index*(width+DIVIDER),screenWidth=g.cpu?2*width+DIVIDER:width;
        if(y<=-p.splashSize||y>=HEIGHT)continue;
        for(let i=t.nativeWaterSplashes.length-1;i>=0;i--){
            const effect=t.nativeWaterSplashes[i],age=t.nativeFrame-effect.bornFrame;
            if(age<1||age>p.splashFrames*p.splashFrameTicks)continue;
            const frame=Math.floor((age-1)/p.splashFrameTicks),
                x=left+Math.floor(effect.x/RULES.actorFixedScale-effect.width/2)-p.splashSize/2,
                right=x+effect.width+p.splashSize;
            if(x>-p.splashSize&&x<screenWidth)
                c.drawImage(art,frame*p.splashSize,0,p.splashSize,p.splashSize,x,y,p.splashSize,p.splashSize);
            if(right>-p.splashSize&&right<screenWidth){
                c.save();c.translate(right+p.splashSize,y);c.scale(-1,1);
                c.drawImage(art,frame*p.splashSize,0,p.splashSize,p.splashSize,0,0,p.splashSize,p.splashSize);
                c.restore();
            }
        }
    }
}
export function nativeEffectAffineArt(name,frame,size,matrix,destinationSize=size){
    const key=`${name}:${frame}:${matrix}:${destinationSize}`,cached=NATIVE_EFFECT_AFFINE_CACHE.get(key);
    if(cached)return cached;
    const sourceKey=`${name}:${frame}`;
    let source=NATIVE_EFFECT_SOURCE_CACHE.get(sourceKey);
    if(!source){
        const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(ART[name],frame*size,0,size,size,0,0,size,size);
        source=ctx.getImageData(0,0,size,size).data;NATIVE_EFFECT_SOURCE_CACHE.set(sourceKey,source);
    }
    const canvas=document.createElement('canvas');canvas.width=canvas.height=destinationSize;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}),image=ctx.createImageData(destinationSize,destinationSize),
        map=nativeAffinePixelMap(Array.isArray(matrix)?matrix:[matrix,0,0,matrix],size,size,destinationSize,destinationSize);
    for(let i=0;i<map.length;i++)if(map[i]>=0){
        const from=map[i]*4,to=i*4;
        image.data[to]=source[from];image.data[to+1]=source[from+1];
        image.data[to+2]=source[from+2];image.data[to+3]=source[from+3];
    }
    ctx.putImageData(image,0,0);
    if(NATIVE_EFFECT_AFFINE_CACHE.size>=256)NATIVE_EFFECT_AFFINE_CACHE.clear();
    IMMUTABLE_FADE_SOURCES.add(canvas);NATIVE_EFFECT_AFFINE_CACHE.set(key,canvas);return canvas;
}
function drawField(c,g,t,left,width,index){
    c.save();c.beginPath();c.rect(left,0,width,HEIGHT);c.clip();
    const cam=g.camera[index]||0;
    // During gameplay, the native foreground camera scrolls the tower and
    // landing grid together with the actor. Keep the explicit layer value so
    // captured states can supply their decoded camera independently.
    const boardCam=g.views?.[index]?.boardCamera??cam;
    const backgroundCam=g.views?.[index]?.backgroundCamera??cam;
    const X=x=>left+x*TILE,Y=y=>Math.round(FLOOR-(y-cam)*TILE),
        boardY=y=>Math.round(FLOOR+VIEW.boardOriginOffsetY-(y-boardCam)*TILE);
    const offset=Math.floor(cam*TILE*.65)%192;
    const stage=survivalStage(g.round,g.startingStage);
    const field=index?'cpu':'player';
    const weather=stage==='pirate'?g.nativeWeather?.displayPalette:0,
        ringSource=weather?ART[`bg3-pirate-${field}-weather-${weather===1?'short':'long'}`]:ART[`bg3-${stage}-${field}`];
    const ring=animatedStageRing(stage,field,ringSource,g.bg3GlobalFrame);
    // DISABLED: picking captured BG maps by actor height is not how the ROM
    // works (samples alternate map 9/0 at ~equal heights -> flicker, and drop
    // to the ring outside tolerance). Re-enable only when driven by the real
    // native BG3 scroll/map state, not by egg.y.
    const factoryMapIndex=USE_HEIGHT_KEYED_FACTORY_BG&&stage==='factory'&&ready(ART['factory-background-atlas'])?
        factoryBackgroundMapIndex(t.egg.y,index):-1;
    if(g.phase==='countdown'&&g.p.mode!=='survival'&&ready(ART[`${stage}-intro`])){
        const sy=g.phase==='countdown'?0:introBackgroundOffset(t.egg.y,stage,t.p.goal);
        c.drawImage(ART[`${stage}-intro`],index?128:0,sy,112,HEIGHT,left,0,width,HEIGHT);
    }else if(factoryMapIndex>=0){
        // BG3 contains transparent pixels. Rebuild the lower-priority static
        // factory layer first so those pixels never expose an earlier frame.
        const atlasX=(factoryMapIndex%FACTORY_BACKGROUND_ATLAS_COLUMNS)*112;
        const atlasY=Math.floor(factoryMapIndex/FACTORY_BACKGROUND_ATLAS_COLUMNS)*256;
        const sy=backgroundOffset(g.views?.[index]||{backgroundCamera:cam},stage);
        for(let yy=-sy;yy<HEIGHT;yy+=256){
            if(ready(ART[stage]))c.drawImage(ART[stage],index?128:0,0,112,256,left,yy,width,256);
            c.drawImage(ART['factory-background-atlas'],atlasX,atlasY,112,256,left,yy,width,256);
        }
    }else if(ring&&sourceWidth(ring)>0){
        // CPU BG3 uses the prior shared VOFS register; player BG1 uses the
        // prior player camera tracker, written before the actor update.
        const ringHeight=sourceHeight(ring);
        // Across 514 normal-register captures, BG1VOFS equals the previous
        // player camera_y low byte exactly. The streamed ring's map starts at
        // row 256; waterline visibility does not change that origin.
        const playerRingCameraY=g.views?.[index]?.nativeBoardCameraY??
                g.views?.[index]?.nativeCameraY??VIEW.stageRingBasePixels[stage]??VIEW.stageRingBasePixels.factory,
            playerRingVofs=nativeBg3ScrollOffset(playerRingCameraY);
        const ringCameraY=index===1?
            (g.views?.[index]?.nativeBoardCameraY??g.views?.[index]?.nativeCameraY??playerRingCameraY):playerRingCameraY;
        const ringScroll=Number.isFinite(g.nativeBg3Vofs)?
            nativeStageRingScroll(ringCameraY,index===1?g.nativeBg3Vofs:playerRingVofs):
            Math.floor((VIEW.stageRingBasePixels[stage]??VIEW.stageRingBasePixels.factory)-
                backgroundCam*TILE*.5);
        const ringOffset=((ringScroll%ringHeight)+ringHeight)%ringHeight;
        for(let yy=-ringOffset;yy<HEIGHT;yy+=ringHeight){
            // The scrolling ring is 512px tall; only its visible native rows
            // need palette conversion. Keep the same 1:1 source mapping.
            const top=Math.max(0,yy),bottom=Math.min(HEIGHT,yy+ringHeight);
            if(bottom>top)c.drawImage(ring,0,top-yy,sourceWidth(ring),bottom-top,left,top,width,bottom-top);
        }
    }else if(ready(ART[stage])){
        const sy=backgroundOffset(g.views?.[index]||{backgroundCamera:cam},stage);
        for(let yy=-sy;yy<HEIGHT;yy+=256)c.drawImage(ART[stage],index?128:0,0,112,256,left,yy,width,256);
    }else c.drawImage(g.pixelBackground,left,-offset);
    const platform=stage==='factory'?ART.platform:(ART[`platform-${stage}`]??ART.platform);
    if(ready(platform))c.drawImage(platform,left,boardY(0),width,sourceHeight(platform));
    else {rect(c,left,boardY(0),width,4,'#778981');rect(c,left,boardY(0),width,1,'#c6cec1');}
    // The water descriptor retains two water-update ticks but one camera tick.
    // Its native integer conversion truncates downward, including during rise.
    const displayedWater=t.previousPreviousWater??t.previousWater??t.water,
        wy=Math.max(0,Math.floor(FLOOR+VIEW.boardOriginOffsetY-(displayedWater-boardCam)*TILE)-VIEW.waterSurfaceLift);
    const factoryWaterBody=index===0&&ready(ART[`${stage}-water-body`]);
    const factoryBodyY=Math.max(0,Math.floor(FLOOR+VIEW.boardOriginOffsetY-
        ((t.previousWater??t.water)-boardCam)*TILE)-VIEW.waterSurfaceLift);
    let factoryWaterBodyFrame=0;
    let factoryWaterlineBlendState=null;
    if(factoryWaterBody){
        const nativeFrame=Math.floor((t.nativeFrame||0)+(t.nativePickupSwayFrameOffset||0)),cycle=VIEW.factoryWaterBodyFramePeriod,
            phaseTick=((nativeFrame+VIEW.factoryWaterBodyFrameOffset)%cycle+cycle)%cycle,
            frame=stage==='factory'?Math.floor(phaseTick/VIEW.factoryWaterBodyTicksPerFrame):
                (nativeFrame+(WATER_SURFACE_PHASE_OFFSETS[stage]??0))%cycle;
        factoryWaterBodyFrame=frame;
    }
    // Native BG1/BG3 supply the underwater tint, including occupied cells.
    // A procedural
    // tint here changes the BG2 platform before the native BG3 alpha blend.
    if(wy<HEIGHT&&!factoryWaterBody&&stage!=='factory'&&!ready(ART[`${stage}-water-bg3`])){
        c.save();
        c.globalAlpha=ready(ART.platform)?0.18:1;
        rect(c,left,wy,width,HEIGHT-wy,'#245d79');c.globalAlpha=1;
        for(let y=wy;y<HEIGHT;y+=3)for(let x=0;x<width;x+=8){
            const wave=Math.round(Math.sin(x*.3+t.time*4+y)*2);
            rect(c,left+x,y+wave,5,1,y<wy+3?'#b4e7c2':'#318099');
        }
        c.restore();
    }
    if(index===1&&ready(ART[`${stage}-water-bg3-body`])){
        const previousWater=Number.isFinite(t.previousWater)?t.previousWater:t.water,
            previousWaterlinePosition=FLOOR+VIEW.boardOriginOffsetY-
                (previousWater-boardCam)*TILE-VIEW.waterSurfaceLift,
            // Native split is floor(previous screen waterline)+1. The view's
            // board-space waterline already has the native +1 pixel offset,
            // so floor it directly instead of rounding then adding again.
            splitY=Math.max(0,Math.min(HEIGHT,Math.floor(previousWaterlinePosition))),
            frame=(((Math.floor((t.nativeFrame||0)+(t.nativePickupSwayFrameOffset||0))+
                (stage==='factory'?0:(WATER_SURFACE_PHASE_OFFSETS[stage]??0)))%VIEW.factoryWaterlineBg3Frames)+
                VIEW.factoryWaterlineBg3Frames)%VIEW.factoryWaterlineBg3Frames;
        // Alternate BG3 is priority 1 and blends over the priority-3 board.
        const visibleHeight=Math.min(256-VIEW.factoryWaterBodySourceY,HEIGHT-splitY);
        if(visibleHeight>0)factoryWaterlineBlendState={splitY,visibleHeight,frame};
    }
    // Native BG0/BG2 have priority 3: OBJ priorities 2/3 win over their
    // opaque tiles. Factory water uses its separate HBlank priority state.
    const renderRows=t.nativeRenderFrame?.rows||t.rows;
    const [firstVisibleRow,endVisibleRow]=visibleTowerRowRange(boardCam,renderRows.length);
    drawTowerPanels(c,t,X,boardY,firstVisibleRow,endVisibleRow,stage);
    // Native flooded-wall captures show water blending over occupied BG0/BG2
    // texels too. Painting it before the panels hid every underwater pixel
    // behind a solid tower, leaving only the surface OBJ visible.
    const ambientArt=ART[`ambient-${stage}`];
    // Equal-priority OBJ with lower OAM indices win overlapping texels.
    if(ready(ambientArt))for(let slot=(g.nativeAmbient?.length??0)-1;slot>=0;slot--){
        const d=g.nativeAmbient[slot],pose=d.display;if(!pose)continue;
        const camera=g.views?.[d.field]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels,
            x=Math.floor(pose.x/NATIVE_AMBIENT.fixed),y=Math.floor(pose.y/NATIVE_AMBIENT.fixed-camera);
        // ROM accepts Y<256, then the 8-bit OAM coordinate wraps to the top.
        if(x<0||x>255||y<=-16||y>=256)continue;
        const sy=y>=160?y-256:y,size=NATIVE_AMBIENT.size,
            cel=Math.floor(pose.clock/NATIVE_AMBIENT.frameTicks);
        c.save();c.translate(x+(pose.vx>0?size:0),sy);if(pose.vx>0)c.scale(-1,1);
        c.drawImage(ambientArt,cel*size,0,size,size,0,0,size,size);c.restore();
    }
    if(factoryWaterBody)drawFactoryWaterBlend(c,g,left,factoryBodyY,width,factoryWaterBodyFrame,stage,t,boardY);
    if(factoryWaterlineBlendState)drawFactoryWaterlineBg3(c,g,left,
        factoryWaterlineBlendState.splitY,width,factoryWaterlineBlendState.frame,stage,t,boardY);
    const factoryWaterlineBaseline=factoryWaterlineBlendState?
        c.getImageData(left,0,width,HEIGHT):null;
    const factoryWaterBodyBaseline=factoryWaterBody&&factoryBodyY<HEIGHT?
        c.getImageData(left,0,width,HEIGHT):null;
    const {preview,visual}=nativePreviewRenderState(t);
    if(preview){
        if(Number.isInteger(preview.nativeKind)&&preview.nativeKind>=0&&preview.nativeKind<8&&
            Number.isInteger(preview.nativeRotation))
            drawNativePiecePreview(c,t,preview,X,boardY,left,visual);
        else {c.strokeStyle='#fff';c.lineWidth=2;for(const[x,y]of preview.cells)c.strokeRect(X(x+preview.x)+1,boardY(y+preview.y+1)+1,14,14);}
    }
    const nativePlacing=t.nativeRenderFrame?(t.nativeRenderPlacing||null):t.placing;
    if(nativePlacing?.nativeHeld&&ready(ART['throw-pieces'])){
        const p=nativePlacing,pose=throwPiecePose(p,Math.floor(p.ticks+1e-8)-2),r=p.nativeRotation&3;
        const affineMatrix=r===0?[pose.matrix,0,0,pose.matrix]:r===1?[0,pose.matrix,pose.negativeMatrix,0]:
            r===2?[pose.negativeMatrix,0,0,pose.negativeMatrix]:[0,pose.negativeMatrix,pose.matrix,0];
        const art=nativeThrowAffineArt(p.nativeHeld.nativeKind,Number.isInteger(p.nativeAngle)?
                nativePreviewAngleMatrix(p.nativeAngle,pose.reciprocal):affineMatrix,p.ticks<3,stage,p.nativeInitialPalette??(t.nativePreviewPaletteInitialColor===0),
                p.nativePaletteKind!==undefined?p.nativePaletteKind:t.nativePiecePaletteMaterial),
            x=left+pose.x,y=Math.round(boardY((RULES.nativeActorFloor-pose.y)/TILE))-THROW_VIEW.center;
        c.drawImage(art,x,y);
    }else if(t.placing&&!t.placing.nativeHeld){const p=t.placing;const y=p.y+(p.startY-p.y)*Math.max(0,p.time/RULES.throwTime);
        for(const[x,yy]of p.cells)metal(c,X(p.x+x),boardY(y+yy+1),false,p.color,p.material,
            (dx,dy)=>p.cells.some(([cx,cy])=>cx===x+dx&&cy===yy+dy));}
    if(t.pirateSecondary.active&&stage==='pirate'&&ready(ART['pirate-secondary'])){
        const d=t.pirateSecondary,size=RULES.pirateSecondarySpriteSize,frame=d.previousAnimation??d.animation;
        const x=Math.round(X(d.x/TILE)),y=Math.round(Y((RULES.nativeActorFloor-d.y)/TILE))-RULES.castleSpriteLift;
        c.drawImage(ART['pirate-secondary'],frame*size,0,size,size,x,y,size,size);
        if(d.stolen)crate(c,d.stolen,x+RULES.pirateSecondaryItemX,y+RULES.pirateSecondaryItemY,true);
    }
    if(!t.nativeWaterCreature&&t.egg.waterEjected&&t.egg.vy>0&&ready(ART['water-creature']))
        c.drawImage(ART['water-creature'],Math.round(X(t.egg.x))-32,Y(t.egg.y)-6);
    const introBob=g.phase==='countdown'?countdownPose(g.introElapsed)[7]-VIEW.introReferenceWorldY:0,
        nativeRender=t.nativeRenderFrame,
        actorX=nativeRender?left+Math.floor(nativeRender.x*TILE):X(t.egg.x),
        actorY=nativeRender?Math.floor(FLOOR-(nativeRender.y-nativeRender.camera)*TILE):Y(t.egg.y);
    // OBJ sprites can cross the center seam; only the background maps belong
    // to one field. Preserve player-before-rival OAM order in both viewports.
    const drawOtherActor=()=>{
        const side=1-index,other=side?g.cpu:g.player,snapshot=other?.nativeRenderFrame;
        if(!g.cpu||!snapshot)return;
        const x=side*(width+DIVIDER)+Math.floor(snapshot.x*TILE),
            y=Math.floor(FLOOR-(snapshot.y-snapshot.camera)*TILE);
        if(x+ACTOR_VIEW.size-ACTOR_VIEW.anchorX<=left||x-ACTOR_VIEW.anchorX>=left+width)return;
        egg(c,x,y,other,side,stage,snapshot.facing,snapshot.walking,
            snapshot.rivalPoseState??snapshot.pose?.state);
    };
    if(index===0)drawOtherActor();
    const actorDisplay=egg(c,actorX,actorY,t,index,stage,
        nativeRender?.facing,nativeRender?.walking,nativeRender?.rivalPoseState??nativeRender?.pose?.state);
    if(index===1)drawOtherActor();
    // Type7 is priority3, like actors, but its earlier OAM index wins.
    // Priority2 pickups/stars below still cover it (110A0 writes 0x5c00).
    if((t.space.previousActive??t.space.active)&&stage==='space'&&ready(ART['space-enemy'])){
        const s=t.space,size=RULES.spaceSpriteSize,frame=s.previousAnimation??s.animation;
        const camera=g.views?.[index]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE,
            x=left+Math.floor(s.x),y=Math.floor(s.y-camera)-RULES.spaceHitOffsets[frame];
        // ROM 0x080110b0 moves the OBJ origin for each curling-tentacle cel.
        c.save();c.translate(x+(s.variant?0:size),y);if(!s.variant)c.scale(-1,1);
        c.drawImage(ART['space-enemy'],frame*size,0,size,size,0,0,size,size);c.restore();
    }
    // Completion particles are priority 2, above actor/outline OBJ priority 3.
    drawCompletionStars(c,t,X,boardY);
    // Native loose-pickup objects use OBJ priority 2, above the priority-3
    // actors. Draw them after the actor sprites so an overlapping pickup is
    // still visible; the held icon follows and keeps its higher OAM order.
    const pickupCamera=g.views?.[index]?.previousNativeCameraPosition??
        VIEW.nativeCameraReferencePixels-cam*TILE;
    // The first allocated pool slot has the lower OAM index and wins an
    // overlap. Canvas paints in the opposite order.
    if(ready(ART['completed-floor-star']))for(let slot=(t.nativePickupParticles?.length??0)-1;slot>=0;slot--){
        const particle=t.nativePickupParticles[slot];
        if(!particle)continue;
        const source=particle.field?g.cpu:g.player,
            particleLeft=particle.field*(width+DIVIDER),
            particleCamera=g.views?.[particle.field]?.previousNativeCameraPosition??pickupCamera,
            age=(source?.nativeFrame??t.nativeFrame)-particle.bornFrame;
        if(particle.type===3){
            if(age<1||age>=RULES.nativeBlastTicks||!ready(ART['native-blast']))continue;
            const size=VIEW.itemSize,cel=Math.floor(age/RULES.nativeBlastFrameTicks);
            c.drawImage(ART['native-blast'],cel*size,0,size,size,particleLeft+particle.x,
                Math.floor(particle.y-particleCamera),size,size);
            continue;
        }
        if(particle.type===4){
            if(age<1||age>24||!ready(ART['impact-spark']))continue;
            const size=16,cel=age<=4?0:Math.min(4,1+Math.floor((age-5)/5));
            c.drawImage(ART['impact-spark'],cel*size,0,size,size,particleLeft+particle.x,
                Math.floor(particle.y-particleCamera),size,size);
            continue;
        }
        if(age<1||age>RULES.completionStarDuration)continue;
        const size=VIEW.completionStar.size,cel=Math.floor(age/VIEW.completionStar.ticksPerFrame);
        // 0x0801b0d4 rejects the whole OBJ once its right edge passes 240.
        // Allocation still accepts those off-edge particles and occupies a
        // pool slot; clipping their visible part would draw extra sparkles.
        // ROM 0x0801b0d2..1b0e4 culls sprites with screenY <= -8 or screenY > 159.
        const screenY=Math.floor(particle.y+(particle.type===1?age:0)-particleCamera);
        if(screenY<=-8||screenY>159)continue;
        if(particleLeft+particle.x<1-size||particleLeft+particle.x>RULES.nativeParticleView.width-size)continue;
        c.drawImage(ART['completed-floor-star'],cel*size,0,size,size,
            particleLeft+particle.x,screenY,size,size);
    }
    // Affine pickups can overhang into the opposite field too. Native player
    // pickup OAM precedes CPU pickup OAM, so paint player objects last.
    for(const source of g.cpu?[g.cpu,g.player]:[t]){
      const itemLeft=source.fieldIndex*(width+DIVIDER),
          itemCamera=g.views?.[source.fieldIndex]?.previousNativeCameraPosition??pickupCamera;
      for(const item of source.nativeRenderCrates??source.crates){
        if(item.nativeMotion){
            // The ROM prepares pickup OAM before advancing pickup motion and
            // the foreground camera. Draw the captured previous position in
            // that previous camera, then let crate() truncate the OAM origin.
            // ROM 0x0800bd00..bd12 culls the untransformed 16px origin,
            // even when the affine double-size sprite would remain visible.
            const bounds=VIEW.nativePickupViewport,
                x=Math.floor(item.nativeMotion.x),y=Math.floor(item.nativeMotion.y)-Math.floor(itemCamera);
            if(x<bounds.left||x>=bounds.right||y<=bounds.top||y>=bounds.bottom)continue;
            crate(c,item,itemLeft+item.nativeMotion.x+RULES.pickupCenterBias,
                item.nativeMotion.y-itemCamera+RULES.pickupCenterBias);
        }else if(source===t)crate(c,item,X(item.x),Y(item.y));
      }
    }
    const displayedHeld=nativeRender?nativeRender.held:t.held,
        heldOffset=nativeHeldItemOffset(t,actorDisplay?.pose,actorDisplay?.mirrored);
    if(displayedHeld&&nativeRender?.heldReady!==false)crate(c,{...displayedHeld,
        // The flame shares the persistent global animation clock with loose
        // items and water; starting a new arena does not restart its phase.
        nativeFlameClock:t.nativeFrame+(t.nativeAnimationClockOffset??t.nativePickupSwayFrameOffset??0)-NATIVE_BOMB_ART.heldClockOamDelays[index]},
        actorX+heldOffset.x,actorY+heldOffset.y,true);
    // Creature OBJ can cross the divider, just like actors and pickups.
    // It follows enemy OBJ in OAM, so priority-2 enemies cover it on ties.
    for(const source of [g.cpu,g.player]){
      const creature=source?.nativeWaterCreatureRender;
      if(creature&&ready(ART['water-creature-phases'])){
        const size=NATIVE_WATER.spriteSize,
            camera=g.views?.[source.fieldIndex]?.previousNativeCameraPosition??pickupCamera,
            encodedY=(Math.floor(creature.y/RULES.actorFixedScale)-Math.floor(camera))&255,
            screenY=encodedY>=HEIGHT?encodedY-256:encodedY;
        c.drawImage(ART['water-creature-phases'],creature.frame*size,0,size,size,
            source.fieldIndex*(width+DIVIDER)+Math.floor(creature.x/RULES.actorFixedScale),
            screenY,size,size);
      }
    }
    // The Space missile is priority 2, ahead of actors (3) and later
    // pickups (2). Its affine box can also cross a field boundary.
    if(stage==='space'&&ready(ART['space-secondary']))for(const source of g.cpu?[g.cpu,g.player]:[t]){
        const s=source.spaceSecondary;if(!(s.previousActive??s.active))continue;
        const size=RULES.spaceSpriteSize,frame=s.previousAnimation??s.animation,
            camera=g.views?.[source.fieldIndex]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE;
        c.drawImage(nativeEffectAffineArt('space-secondary',frame,size,nativeFlightSpriteMatrix(s.previousAngle??s.angle)),
            source.fieldIndex*(width+DIVIDER)+Math.floor(s.previousX??s.x),
            Math.floor(s.previousY??s.y)-Math.floor(camera));
    }
    // The jumping primary shares the early priority-2 enemy OAM slots.
    if(['jungle','beanstalk'].includes(stage)&&ready(ART[`${stage}-enemy`]))
      for(const source of g.cpu?[g.cpu,g.player]:[t]){
        const j=source.jumper;if(!(j.previousActive??j.active))continue;
        const height=RULES.bubbleSpriteCenter*2,spriteWidth=stage==='jungle'?RULES.jungleSpriteWidth:height,
            vy=j.previousVy??j.vy,
            frame=stage==='beanstalk'?(vy>1.0?2:(vy<-1.0?0:1)):(j.previousAnimation??j.animation),
            camera=g.views?.[source.fieldIndex]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE;
        c.drawImage(ART[`${stage}-enemy`],frame*spriteWidth,0,spriteWidth,height,
            source.fieldIndex*(width+DIVIDER)+Math.floor(j.previousX??j.x),
            Math.floor(j.previousY??j.y)-Math.floor(camera),spriteWidth,height);
      }
    const beanstalkActive=t.beanstalkSecondary.previousActive??t.beanstalkSecondary.active;
    if(beanstalkActive&&stage==='beanstalk'&&ready(ART['beanstalk-secondary'])){
        const d=t.beanstalkSecondary,size=RULES.beanstalkSecondarySpriteSize,frame=d.previousAnimation??d.animation,
            camera=g.views?.[index]?.previousNativeCameraPosition??(VIEW.nativeCameraReferencePixels-cam*TILE),
            x=left+Math.floor(d.previousX??d.x),
            y=Math.floor(d.previousY??d.y)-Math.floor(camera);
        const stolen='previousStolen'in d?d.previousStolen:d.stolen;
        if(stolen)crate(c,stolen,x+RULES.pirateSecondaryItemX,y+RULES.pirateSecondaryItemY,true);
        if(x>-size&&x<(RULES.nativeScreenWidth??240)+size&&y>-size&&y<HEIGHT){
            if(y>0&&ready(ART['beanstalk-secondary-vine'])){
                const w=RULES.beanstalkSecondaryVineWidth,h=RULES.beanstalkSecondaryVineHeight;
                for(let top=y-h;top>-h;top-=h)
                    c.drawImage(ART['beanstalk-secondary-vine'],x+RULES.beanstalkSecondaryVineX,top,w,h);
            }
            c.drawImage(ART['beanstalk-secondary'],frame*size,0,size,size,x,y,size,size);
        }
    }
    // Arc birds also precede pickup and water-creature OBJ at priority 2.
    // Repaint both fields so a foreign-field overhang keeps its source camera.
    if(['park','jungle'].includes(stage))for(const source of g.cpu?[g.cpu,g.player]:[t]){
        const d=stage==='jungle'?source.jungleSecondary:source.parkSecondary,
            art=stage==='jungle'?'jungle-secondary':'park-secondary';
        if(!(d.previousActive??d.active)||!ready(ART[art]))continue;
        const size=stage==='jungle'?RULES.jungleSecondarySpriteSize:RULES.spaceSpriteSize,
            frame=d.previousAnimation??d.animation,
            camera=g.views?.[source.fieldIndex]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE,
            sourceLeft=source.fieldIndex*(width+DIVIDER);
        const stolen='previousStolen'in d?d.previousStolen:d.stolen;
        if(stolen){
            const sign=d.variant?-1:1,lead=RULES.parkSecondaryHitLead,
                bias=stage==='jungle'?RULES.jungleSecondaryHitBias:RULES.parkSecondaryHitBias,
                offsetX=Math.floor(sign*lead*(d.previousVY??d.vy)+bias),
                offsetY=Math.floor(-sign*lead*(d.previousVX??d.vx)+bias),
                x=Math.floor(d.previousX??d.x)+offsetX,
                y=Math.floor(d.previousY??d.y)+offsetY-Math.floor(camera);
            // 11A28 submits integer top-left coordinates, not icon centres,
            // and culls the icon when offsetX > 0x31 (0x08011a32..11a36).
            if(offsetX<=49)crate(c,stolen,sourceLeft+x+RULES.pickupCenterBias,y+RULES.pickupCenterBias,true);
        }
        // The body has the lower OAM index and covers its carried icon.
        c.drawImage(nativeEffectAffineArt(art,frame,size,nativeFlightSpriteMatrix(d.previousAngle??d.angle)),
            sourceLeft+Math.floor(d.previousX??d.x),Math.floor(d.previousY??d.y)-Math.floor(camera));
    }
    if((t.parkPrimary.previousActive??t.parkPrimary.active)&&stage==='park'&&ready(ART['park-enemy'])){
        const d=t.parkPrimary,w=RULES.parkPrimarySpriteWidth,h=RULES.parkPrimarySpriteHeight,frame=d.previousAnimation??d.animation,
            camera=g.views?.[index]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE;
        c.drawImage(ART['park-enemy'],frame*w,(d.previousVX??d.vx)>0?0:h,w,h,
            left+Math.floor(d.previousX??d.x),Math.floor(d.previousY??d.y)-Math.floor(camera)-RULES.parkPrimarySpriteOriginY,w,h);
    }
    // Thief OAM is priority 2 and allocated before pickup/actor objects.
    // It therefore covers both actor priority 3 and later priority-2 pickups.
    for(const source of g.cpu?[g.cpu,g.player]:[t])if(stage==='castle'&&ready(ART['castle-secondary'])&&
        (source.castleSecondary.previousActive??source.castleSecondary.active)){
        const d=source.castleSecondary,size=RULES.castleSpriteSize,frame=d.previousAnimation??d.animation,
            side=source.fieldIndex,
            camera=g.views?.[side]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE,
            x=side*(width+DIVIDER)+Math.floor(d.previousX??d.x),y=Math.floor(d.previousY??d.y)-Math.floor(camera),
            bounds=VIEW.nativeCastleThiefViewport;
        // ROM 0x08011678: prepare OBJ before motion, using signed integer
        // coordinates and the global viewport rather than canvas clipping.
        const stolen='previousStolen'in d?d.previousStolen:d.stolen;
        // The stolen icon has its own OAM submission/culling (0x08011a28).
        // It can remain visible below a body that has exited above the screen.
        if(stolen)crate(c,stolen,x+RULES.castleSecondaryItemX,y+RULES.castleSecondaryItemY,true);
        if(x>=bounds.left&&x<=bounds.right&&y>bounds.top&&y<bounds.bottom){
            const actor=d.previousActorX??(source.nativeRenderFrame?.x??source.egg.x)*TILE-RULES.bubbleActorAnchor,
                mirror=(d.previousX??d.x)>actor;
            // The body has the earlier OAM index and covers the icon where
            // its last row overlaps the icon's first row.
            c.save();c.translate(x+(mirror?size:0),y);if(mirror)c.scale(-1,1);
            c.drawImage(ART['castle-secondary'],frame*size,0,size,size,0,0,size,size);c.restore();
        }
    }
    // Primary fish OAM precedes pickups and water-creature OBJ at priority 2.
    // Preserve its source camera when its 64px affine box crosses fields.
    for(const source of g.cpu?[g.cpu,g.player]:[t])if((source.castle.previousActive??source.castle.active)&&
        ['castle','pirate'].includes(stage)&&ready(ART[`${stage}-enemy`])){
        const d=source.castle,size=RULES.castleSpriteSize,frame=d.previousAnimation??d.animation;
        const camera=g.views?.[source.fieldIndex]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE,
            art=nativeEffectAffineArt(`${stage}-enemy`,frame,size,nativeSkeletalFishMatrix(d.previousAngle??d.angle,d.variant));
        c.drawImage(art,source.fieldIndex*(width+DIVIDER)+Math.floor(d.previousX??d.x),Math.floor(d.previousY??d.y)-Math.floor(camera));
    }
    // Rock OBJ precedes held/pickup OBJ at the same priority and wins overlaps.
    if((t.dragonSecondary.previousActive??t.dragonSecondary.active)&&stage==='dragon'&&ready(ART['dragon-secondary'])){
        const d=t.dragonSecondary,size=RULES.dragonSpriteSize,frame=d.previousAnimation??d.animation;
        const camera=g.views?.[index]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE;
        c.drawImage(ART['dragon-secondary'],frame*size,0,size,size,
            left+Math.floor(d.previousX??d.x),Math.floor(d.previousY??d.y)-Math.floor(camera),size,size);
    }
    if((t.dragon.previousActive??t.dragon.active)&&stage==='dragon'&&ready(ART['dragon-enemy'])){
        const d=t.dragon,size=RULES.dragonSpriteSize,frame=d.previousAnimation??d.animation;
        const camera=g.views?.[index]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE;
        c.drawImage(ART['dragon-enemy'],frame*size,0,size,size,
            left+Math.floor(d.previousX??d.x),Math.floor(d.previousY??d.y)-Math.floor(camera),size,size);
    }
    if(t.factorySecondary.active&&stage==='factory'&&ready(ART['factory-secondary'])){
        const d=t.factorySecondary,size=RULES.castleSpriteSize,frame=d.previousAnimation??d.animation;
        // Native OAM uses the enemy and camera state from before this frame's
        // actor/camera update. The live camera has already advanced by render
        // time, which otherwise shifts the factory robot and both wing pieces
        // by one or two pixels on a moving field.
        const renderCamera=Number.isFinite(t.nativeRenderFrame?.camera)?t.nativeRenderFrame.camera:cam,
            worldY=(RULES.nativeActorFloor-(d.previousY??d.y))/TILE;
        const x=Math.floor(X((d.previousX??d.x)/TILE)),
            y=Math.floor(FLOOR-(worldY-renderCamera)*TILE)-RULES.factorySecondarySpriteLift;
        // Lower-index OBJ29 wins priority-2 ties over its wings, stolen item,
        // and later pickup objects, so its body is drawn on top of those.
        const stolen='previousStolen'in d?d.previousStolen:d.stolen;
        if(stolen)crate(c,stolen,x+RULES.factorySecondaryItemX,y+RULES.factorySecondaryItemY,true);
        if(ready(ART['factory-secondary-wings'])){
            const phase=d.previousWingPhase??d.wingPhase??0,w=RULES.factorySecondaryWingWidth,h=RULES.factorySecondaryWingHeight;
            c.drawImage(ART['factory-secondary-wings'],phase*w,0,w,h,x,y-RULES.factorySecondaryWingLift,w,h);
        }
        c.drawImage(ART['factory-secondary'],frame*size,0,size,size,x,y,size,size);
    }
    // Priority-2 projectile OBJ wins over actor/held pictures at priority 3.
    // A single projectile crosses both independently scrolling fields.
    // Earlier OBJ indices win ties: player-owned slots precede CPU slots,
    // and slot 0 (including its flame) covers later slots at priority 2.
    for(const source of [g.cpu,g.player])if(source)for(const b of
        [...(source.nativeRenderProjectiles??[...source.bombs,...source.hammers])]
            .sort((a,b)=>(b.nativeSlot??0)-(a.nativeSlot??0))){
        if(b.pending||b.nativeSpriteVisible===false)continue;
        if(b.nativeTrajectory&&b.nativeBornFrame===source.nativeFrame)continue;
        const local=b.x-index*(g.p.columns+RULES.bombFieldGap),
            px=Math.floor(b.x*TILE),
            receiverIndex=source.fieldIndex===0?(px>g.p.columns*TILE-1?1:0):(px<=g.p.columns*TILE?0:1);
        const camera=g.views?.[receiverIndex]?.previousPreviousNativeCameraPosition??
            g.views?.[receiverIndex]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE;
        // ROM 0x0801b150 / 0x0801b200: screen Y is clamped to [-7, 159]; anything outside is culled.
        const spriteY=Math.floor(RULES.nativeBoardFloor-(b.nativeSpriteY??b.y)*TILE)-Math.floor(camera);
        if(spriteY<=-16||spriteY>159)continue;
        crate(c,{...b,nativeFlameClock:b.nativeFlameClock??t.nativeFrame+(t.nativeAnimationClockOffset??t.nativePickupSwayFrameOffset??0)-NATIVE_BOMB_ART.clockOamDelay},
            X(local+RULES.bombSize/2),spriteY+VIEW.itemSize/2);
    }
    if(ready(ART['bomb-explosion']))for(const effect of t.explosions){
        const size=VIEW.bombEffectSize,frame=Math.floor(effect.age/RULES.step+1e-7);
        c.drawImage(ART['bomb-explosion'],frame*size,0,size,size,
            Math.round(X(effect.x))-size/2,Y(effect.y)-size/2,size,size);
    }
    if(ready(ART['cloud-phases']))for(const cloud of t.nativeRenderClouds??t.clouds){
        const visible=cloud.renderCounter??cloud.counter+1;
        if(visible<0||visible>=RULES.cloudTicks)continue;
        const size=VIEW.cloudSize,frame=cloudStriking(visible)?1:0,
            matrix=Math.round(256/cloudScale(visible)),
            // Cloud OAM precedes camera integration and the other priority-2
            // objects, so it retains an extra camera tick and covers pickups.
            camera=g.views?.[index]?.previousPreviousNativeCameraPosition??
                g.views?.[index]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE,
            x=Math.floor(X(cloud.x)-size/2),y=Math.floor(RULES.nativeActorFloor-cloud.y*TILE-camera);
        if(x-left>-size&&x-left<256&&y>-size&&y<HEIGHT)
            c.drawImage(nativeEffectAffineArt('cloud-phases',frame,size,matrix),x,y);
    }
    if(t.bird){const x=X(t.bird.x),y=Y(t.bird.y);rect(c,x-5,y,10,5,'#bcc1ba');rect(c,x-8,y-3,5,3,'#e3e5d2');rect(c,x+3,y-3,5,3,'#e3e5d2');rect(c,x+4,y+1,2,1,'#feac22');}
    // Native 0x0801aa90 omits the airship OBJ in Castle (3) and Space
    // (5): their goal vessel is already supplied by the background layer.
    // Drawing the shared balloon here put it on top of the UFO.
    if(!['castle','space'].includes(stage)){
    if(g.phase==='countdown'&&g.p.mode!=='survival'&&ready(ART['intro-balloon'])){
        const top=g.phase==='countdown'?VIEW.introBalloonTop+introBob:Y(t.egg.introOriginY)-VIEW.introActorFoot;
        c.drawImage(ready(ART[`intro-balloon-${stage}`])?ART[`intro-balloon-${stage}`]:ART['intro-balloon'],left+VIEW.introBalloonX*width/112,Math.round(top),128*width/112,128);
    }else if(g.p.mode==='survival'&&ready(ART['rescue-blimp'])){
        const boat=nativeRescueBoat(t.nativeFrame-1,index,t.nativeRescueOrigin,stage),
            verticalOffset=RULES.nativeActorFloor-t.p.goal*TILE-NATIVE_RESCUE.rescuePlane;
        const x=left+Math.floor(boat.x/RULES.actorFixedScale),y=Math.floor(boat.y/RULES.actorFixedScale)+verticalOffset-Math.floor(pickupCamera);
        c.drawImage(ready(ART[`rescue-blimp-${stage}`])?ART[`rescue-blimp-${stage}`]:ART['rescue-blimp'],x,y);
        if(ready(ART[`airship-flame-${stage}`])){
            const f=NATIVE_RESCUE.flame;
            c.drawImage(ART[`airship-flame-${stage}`],((t.nativeFrame-1)&f.phaseBit)?f.width:0,0,f.width,f.height,x+f.x,y+f.y,f.width,f.height);
        }
    }else balloon(c,X(g.p.columns/2),Y(t.p.goal));
    }
    // Factory water sprites 24/25 sit at local X=-8 and 56 in both fields.
    // The atlas crops their native overhang to the 112px field viewport.
    const factorySurface=ready(ART[`${stage}-water-surface`]);
    if(factoryWaterlineBlendState&&factoryWaterlineBaseline){
        // In the CPU field's alternate register phase BG3 has priority 1,
        // above actor/pickup OBJ priorities 2/3. Reapply only over pixels
        // changed by later sprites; placed BG0 cells and the water-surface
        // OBJ are restored above it by their native priorities.
        blendFactoryLayerOverLowerPrioritySprites(c,t,left,
            factoryWaterlineBlendState.splitY,width,factoryWaterlineBlendState.visibleHeight,
            g.factoryWaterlinePixels,factoryWaterlineBaseline,boardY);
    }
    if(factoryWaterBody&&factoryWaterBodyBaseline){
        const bodyHeight=256-VIEW.factoryWaterBodySourceY,
            visibleHeight=Math.min(bodyHeight,HEIGHT-factoryBodyY);
        // BG1 priority 1 covers actors and pickups (OBJ priorities 2/3),
        // including sprites over occupied board texels. The early pass
        // supplies the board/background blend; this late pass only replaces
        // pixels subsequently covered by lower-priority sprites.
        blendFactoryLayerOverLowerPrioritySprites(c,t,left,factoryBodyY,width,visibleHeight,
            g.factoryWaterSourcePixels,factoryWaterBodyBaseline,boardY);
    }
    // Both are priority-1 OBJ, with the bubble allocated before the wave.
    drawCollapseWave(c,t,left,boardY,width);
    if((t.bubble.previousActive??t.bubble.active)&&stage==='factory'&&ready(ART['electric-bubble'])){
        const b=t.bubble,size=RULES.bubbleSpriteCenter*2,life=b.previousLife??b.life,
            bursting=life<RULES.bubbleReleaseLife,
            frame=bursting?Math.floor(life/RULES.bubbleBurstFrameTicks):b.previousAnimation??b.animation,
            source=ART[bursting?'electric-bubble-burst':'electric-bubble'],
            camera=g.views?.[index]?.previousNativeCameraPosition??VIEW.nativeCameraReferencePixels-cam*TILE,
            x=left+Math.floor(b.previousX??b.x),y=Math.floor((b.previousY??b.y)-camera);
        // Priority-1 bubble renders above priority-2/3 pickups, actors and BG0 board.
        c.drawImage(source,frame*size,0,size,size,x,y,size,size);
    }
    drawWaterSplashes(c,g,stage,width);
    let waterSurfaceFrame=null;
    if(wy<HEIGHT&&factorySurface){
        // OAM slots 24/25 compose the player-field strip from x=-8 to x=120,
        // with an 8px overhang into the divider.
        // Waves and pickup sway share the native global counter, which
        // survives round changes; the actor's nativeFrame restarts.
        const nativeFrame=Math.floor((t.nativeFrame||0)+(t.nativePickupSwayFrameOffset||0)),cycle=VIEW.factoryWaterSurfaceFramePeriod,
            phaseTick=((nativeFrame+VIEW.factoryWaterSurfaceFrameOffset)%cycle+cycle)%cycle,
            frame=stage==='factory'?Math.floor(phaseTick/VIEW.factoryWaterSurfaceTicksPerFrame):
                (nativeFrame+(WATER_SURFACE_PHASE_OFFSETS[stage]??0))%cycle;
        waterSurfaceFrame=frame;
        c.drawImage(ART[`${stage}-water-surface`],0,frame*VIEW.factoryWaterSurfaceHeight,112,VIEW.factoryWaterSurfaceHeight,
            left,wy-VIEW.factoryWaterSurfaceYOffset,width,VIEW.factoryWaterSurfaceHeight);
    }
    // Original-style bottom wobble meter: green → amber → red.
    if(!ready(ART['meter-bars'])||!ready(ART['meter-pointer'])){
    rect(c,left+12,153,width-24,6,'#101b24');rect(c,left+13,154,width-26,1,'#fcf7d1');
    const band=(width-28)/3;['#6cab31','#e4cc3e','#d94622'].forEach((color,i)=>rect(c,left+14+i*band,155,Math.ceil(band),2,color));
    const marker=left+14+(width-29)*(t.risk||0);rect(c,marker-2,151,5,2,'#ffffdd');rect(c,marker-1,153,3,1,'#fff');
    }
    if((t.previousPreviousNativeWaterWarning??false)&&
        ((Math.floor(t.nativeFrame||0)-1)&RULES.waterWarningFlashMask)!==0&&ready(ART['water-warning'])){
        const size=VIEW.waterWarningSize;c.drawImage(ART['water-warning'],Math.round(left+(width-size)/2),VIEW.waterWarningY,size,size);
    }
    // The model retains flash timers for gameplay/debug state, but the ROM
    // does not tint the complete field when a floor completes or a hazard hits.
    // Native sprites and captured palette/register effects are rendered above.
    c.restore();
    // Water OBJ extend outside each field's BG window. Their priority is
    // below the divider/portrait OBJ, including at transparent cap corners.
    if(g.cpu&&waterSurfaceFrame!==null&&ready(ART[`${stage}-water-overhang`])){
        const edge=NATIVE_DIVIDER.surfaceOverhang,height=VIEW.factoryWaterSurfaceHeight;
        c.drawImage(ART[`${stage}-water-overhang`],index?0:edge,waterSurfaceFrame*height,edge,height,
            index?left-edge:left+width,wy-VIEW.factoryWaterSurfaceYOffset,edge,height);
    }
}
export function drawPodium(c,g,width){
    const p=PODIUM_VIEW,ticks=Math.max(0,(g.resultTicks||0)-p.roundTicks),won=g.phase==='won';
    c.save();c.scale(width/p.width,1);rect(c,0,0,p.width,p.height,'#263343');
    if(ready(ART['podium-background']))c.drawImage(ART['podium-background'],0,0);
    if(ready(ART['podium-wins']))c.drawImage(ART['podium-wins'],p.winsX,p.winsY);
    const digits=String(g.wins||0).padStart(2,'0');
    if(ready(ART['podium-digits']))for(let i=0;i<digits.length;i++){
        c.drawImage(ART['podium-digits'],Number(digits[i])*p.digitSize,0,p.digitSize,p.digitSize,
            p.digitX-(digits.length-2)*p.digitSpacing/2+i*p.digitSpacing,p.digitY,p.digitSize,p.digitSize);
    }
    const character=g.p.character||'yolko',pose=podiumPose(won,ticks,character),
        actor=ART[character==='yolko'?(won?'podium-win-actor':'podium-loss-actor'):`${character}-podium-${won?'win':'loss'}`];
    if(won&&character==='yolko'){
        // ROM 0x080105c0: idle during fade, intro cels 0/1 once,
        // then loop cels 2..15. The page counter resets on each visit.
        const start=p.entryDelay+p.podiumLoadTicks+p.fadeTicks+1,
            resource=NATIVE_CHARACTER_RESOURCES[character],
            group=resource.groups[ticks<start?p.idleGroup:p.winGroup],
            elapsedFrames=Math.floor(Math.max(0,ticks-start)/p.winFrameTicks),
            frame=ticks<start?0:elapsedFrames<p.winIntroFrames?elapsedFrames:
                p.winIntroFrames+(elapsedFrames-p.winIntroFrames)%(group.period-p.winIntroFrames),
            source=ART[resource.playerSheet];
        if(ready(source))c.drawImage(source,frame*p.actorSize,group.row*p.actorSize,p.actorSize,p.actorSize,
            p.winActorX,p.winActorY,p.actorSize,p.actorSize);
    }else if(pose&&ready(actor))c.drawImage(actor,pose.picture*p.actorSize,0,p.actorSize,p.actorSize,pose.x,pose.y,p.actorSize,p.actorSize);
    if(!won&&ready(ART['podium-game-over'])){
        const lossTicks=Math.max(0,ticks-p.podiumLoadTicks-p.lossOamDelay);
        if(lossTicks>=p.lossTitleTick)c.drawImage(ART['podium-game-over'],p.gameOverX,
            Math.min(p.gameOverY,p.lossTitleStartY+(lossTicks-p.lossTitleTick+1)*p.lossTitleSpeed));
    }
    c.restore();
}
function drawNativeCenterDivider(c,g,fieldWidth){
    if(!g.cpu||!ready(ART['native-divider-waterline'])||!ready(ART['native-divider-progress']))return;
    const waterY=t=>{
        const displayedWater=t.previousPreviousWater??t.previousWater??t.water;
        const waterline=RULES.nativeActorFloor+RULES.bubbleWaterlineBias-
            (Number.isFinite(displayedWater)?displayedWater:-RULES.defaultWaterDepth)*RULES.projectilePixels;
        const integerWaterline=Math.floor(waterline);
        return Math.floor(NATIVE_DIVIDER.waterlineScale*integerWaterline/
            NATIVE_DIVIDER.waterlineDivisor)+NATIVE_DIVIDER.verticalOffset;
    };
    const progressY=t=>{
        const completed=Number.isFinite(t.nativeDividerProgress)?t.nativeDividerProgress:(t.lines||0);
        return Math.floor(NATIVE_DIVIDER.waterlineScale*(NATIVE_DIVIDER.progressRows-completed)/
            NATIVE_DIVIDER.progressDivisor)+NATIVE_DIVIDER.verticalOffset;
    };
    const [playerX,cpuX]=NATIVE_DIVIDER.xOffsets.map(offset=>fieldWidth+offset);
    const playerProgressY=progressY(g.player),cpuProgressY=progressY(g.cpu),
        playerWaterY=waterY(g.player),cpuWaterY=waterY(g.cpu);
    // ROM 0x0801a614 submits 8x32 empty-tube objects for blocks whose top is above water.
    if(ready(ART['progress-divider'])){
        const img=ART['progress-divider'];
        for(let k=0;k<5;k++){
            const y=k*32;
            if(playerWaterY>y)c.drawImage(img,0,y,8,32,playerX,y,8,32);
            if(cpuWaterY>y)c.drawImage(img,8,y,8,32,cpuX,y,8,32);
        }
    }
    // ROM OAM priority is 13, 12, 11, 10: the waterline objects are drawn
    // over the completed-floor markers, with player over CPU at each overlap.
    const bar=(name,x,y)=>{
        const image=ART[name];
        // 0x0801a380 submits additional 8x32 objects down to the bottom.
        // Their body scanline is constant; preserve the original cap and
        // extend its last scanline instead of leaving gaps after 32 pixels.
        if(y+32<HEIGHT)c.drawImage(image,0,31,8,1,x,y+32,8,HEIGHT-y-32);
        c.drawImage(image,x,y);
    };
    bar('native-divider-progress',cpuX,cpuProgressY);
    bar('native-divider-progress',playerX,playerProgressY);
    bar('native-divider-waterline',cpuX,cpuWaterY);
    bar('native-divider-waterline',playerX,playerWaterY);
}
function renderCharacterMenu(g){
    const width=240,height=160;
    if(!g.pixelCanvas||g.pixelCanvas.width!==width||g.pixelCanvas.height!==height){
        g.pixelCanvas=document.createElement('canvas');g.pixelCanvas.width=width;g.pixelCanvas.height=height;
    }
    const c=g.pixelCanvas.getContext('2d',{willReadFrequently:true});c.imageSmoothingEnabled=false;
    c.clearRect(0,0,width,height);
    if(ready(ART['character-menu-background']))c.drawImage(ART['character-menu-background'],0,0);
    const name=CHARACTER_MENU_ART.parameters.order[g.characterMenu.index];
    const tracks=MENU_ANIMATION.tracks[name],tick=Math.floor((g.characterMenu.elapsed||0)/RULES.step+1e-7);
    if(ready(ART['character-menu-animation'])){
        for(const sequence of Object.values(tracks))for(const [cell,x,y,w,h]of sequence[tick%sequence.length]){
            // Survival in WW uses Hard; retain that fixed native label while
            // replaying the selector's independently animated OBJ resources.
            if((x===112||x===176)&&w===64&&y>=60&&y<=68)continue;
            c.drawImage(ART['character-menu-animation'],cell%MENU_ANIMATION.parameters.columns*64,
                Math.floor(cell/MENU_ANIMATION.parameters.columns)*64,w,h,x,y,w,h);
        }
        if(ready(ART['character-menu-sprites']))for(const sprite of CHARACTER_MENU_ART.common.filter(s=>s.y===61))
            c.drawImage(ART['character-menu-sprites'],sprite.cell*64,0,sprite.width,sprite.height,sprite.x,sprite.y,sprite.width,sprite.height);
    }else if(ready(ART['character-menu-sprites']))for(const sprite of [...CHARACTER_MENU_ART.common,...CHARACTER_MENU_ART.characters[name]]){
        c.drawImage(ART['character-menu-sprites'],sprite.cell*64,0,sprite.width,sprite.height,
            sprite.x,sprite.y,sprite.width,sprite.height);
    }
    const out=g.ctx,ratio=g.canvasPixelRatio?.()||1,available=Math.max(1,g.h-38*ratio),
        scale=pixelArtScale(width,height,g.w,available),w=Math.floor(width*scale),h=Math.floor(height*scale),
        x=Math.floor((g.w-w)/2),y=Math.floor((available-h)/2);
    g.characterMenuViewport={x,y,scale};
    out.fillStyle='#151b23';out.fillRect(0,0,g.w,g.h);out.imageSmoothingEnabled=false;
    out.drawImage(g.pixelCanvas,x,y,w,h);
    out.textAlign='center';out.fillStyle='#d4d9dd';out.font=`${11*ratio}px sans-serif`;
    out.fillText('CHOOSE A CHARACTER',g.w/2,g.h-28*ratio);
    out.fillText(`${g.binding('left')}/${g.binding('right')} choose  ·  ${g.binding('continue')}/${g.binding('place')} play  ·  ${g.binding('rotate')} back`,g.w/2,g.h-11*ratio);
}
// Round-start palette fade measured from palette RAM of the original capture (frames 401..432 after the
// round setup): every palette entry is (c5*k)>>5 per 5-bit channel with k = frames since round start,
// reaching the full palette at k=32. The video is RGB565 with green = g5<<1, so work on the 5-bit values.
function applyNativePaletteFade(c,width,height,step){
    const image=c.getImageData(0,0,width,height),data=image.data;
    const rb=NATIVE_FADE_RED_BLUE[step],green=NATIVE_FADE_GREEN[step];
    for(let i=0;i<data.length;i+=4){
        data[i]=rb[data[i]];data[i+1]=green[data[i+1]];data[i+2]=rb[data[i+2]];
    }
    c.putImageData(image,0,0);
}
export function renderPixelGame(g){
    assets();
    if(g.phase==='character-select'){renderCharacterMenu(g);return;}
    const fieldWidth=g.p.columns*TILE, fields=g.cpu?2:1, width=fields*fieldWidth+(fields-1)*DIVIDER;
    const reuseBuffer=Boolean(g.pixelCanvas&&g.pixelCanvas.width===width&&g.pixelCanvas.height===HEIGHT);
    if(!reuseBuffer){
        g.pixelCanvas=document.createElement('canvas');g.pixelCanvas.width=width;g.pixelCanvas.height=HEIGHT;
        g.pixelBackground=document.createElement('canvas');g.pixelBackground.width=fieldWidth;g.pixelBackground.height=HEIGHT+192;
        factory(g.pixelBackground.getContext('2d',{willReadFrequently:true}),fieldWidth,HEIGHT+192);
    }
    // Reset the tiny native-resolution back buffer each frame. Assigning width
    // clears its bitmap and Canvas state together, so an inherited clip or
    // retained alpha pixels can never leak through transparent GBA layers.
    const ending=g.phase==='won'||g.phase==='lost',
        // Native +0x3328 is one signed palette-fade counter. Confirmation
        // reverses its direction even before the incoming fade has finished.
        opacity=ending&&g.p.mode==='survival'?(g.resultExitTicks===null?
            resultOpacity(g.resultTicks||0):Math.max(0,
                (g.resultExitLevel-Math.max(0,g.resultExitTicks))/PODIUM_VIEW.fadeTicks)):1,
        nativeContext=g.pixelCanvas.getContext('2d',{willReadFrequently:true}),
        c=opacity<1?paletteFadeContext(nativeContext,Math.round(opacity*NATIVE_FADE_FRAMES)):nativeContext;
    if(typeof c.reset==='function')c.reset();else g.pixelCanvas.width=width;
    c.imageSmoothingEnabled=false;
    const podium=g.p.mode==='survival'&&ending&&(g.resultTicks||0)>=PODIUM_VIEW.roundTicks;
    if(podium)drawPodium(c,g,width);
    else {
    drawField(c,g,g.player,0,fieldWidth,0);
    if(g.cpu){drawField(c,g,g.cpu,fieldWidth+DIVIDER,fieldWidth,1);
        if(!ready(ART['progress-divider'])){rect(c,fieldWidth,0,DIVIDER,HEIGHT,'#162d29');pipe(c,fieldWidth+1,0,HEIGHT,true);pipe(c,fieldWidth+8,0,HEIGHT,true);}
        drawNativeCenterDivider(c,g,fieldWidth);
        // Meter OBJ6 extends 24 pixels beyond the player field. Hardware
        // draws it above OBJ10..13 and the rails, without a per-field clip.
        drawNativeMeter(c,g.views?.[1],fieldWidth+DIVIDER,fieldWidth);
        drawNativeMeter(c,g.views?.[0],0,fieldWidth);
        for(const [i,t]of [g.player,g.cpu].entries()){
            // FUN_0801a380 uses the actor's previous-frame integer world Y.
            const worldY=Number.isFinite(t.progressWorldY)?t.progressWorldY:
                Math.floor(RULES.nativeActorFloor-t.egg.y*RULES.projectilePixels);
            const top=Math.max(0,Math.floor(NATIVE_PROGRESS_PORTRAIT.heightScale*worldY/NATIVE_PROGRESS_PORTRAIT.heightDivisor)+NATIVE_PROGRESS_PORTRAIT.verticalOffset);
            if(!i&&ready(ART['player-portraits'])){
                const size=VIEW.progressSize,portrait=CHARACTER_ART[g.p.character||'yolko'].id;
                c.drawImage(ART['player-portraits'],portrait*size,0,size,size,fieldWidth-4,top,size,size);
            }else if(ready(ART['progress-portraits'])){
                const size=VIEW.progressSize,portrait=i?1+STAGES.indexOf(survivalStage(g.round,g.startingStage)):0;
                c.drawImage(ART['progress-portraits'],portrait*size,0,size,size,fieldWidth-4+i*8,top,size,size);
            }else{rect(c,fieldWidth+3+i*7,top+5,4,6,i?'#81e222':'#ff6684');rect(c,fieldWidth+4+i*7,top+6,1,3,'#fff6c0');}
        }
    }else drawNativeMeter(c,g.views?.[0],0,fieldWidth);
    if(g.phase==='countdown'&&ready(ART.countdown)){
        const [picture,x,y,pa,pb,pc,pd]=countdownPose(g.introElapsed);
        // Doubled affine OBJ uses integer 8.8 source lookup around (32,32),
        // not the browser's inverse transform around pixel centres.
        const glyph=nativeEffectAffineArt('countdown',picture,64,[pa,pb,pc,pd],128);
        for(let i=0;i<fields;i++){
            const snapshot=(i?g.cpu:g.player)?.nativeRenderFrame;
            const screenY=snapshot?80-(VIEW.nativeCameraReferencePixels-snapshot.camera*TILE):y;
            c.drawImage(glyph,i*(fieldWidth+DIVIDER)+(x-64)*fieldWidth/112,screenY-64,128*fieldWidth/112,128);
        }
    }
    if(g.phase!=='playing'&&g.phase!=='countdown'&&(g.resultTicks||0)>PODIUM_VIEW.entryDelay){
        for(let i=0;i<fields;i++){
            const won=i===0?g.phase==='won':g.phase!=='won',left=i*(fieldWidth+DIVIDER);
            if(ready(ART['result-letters'])){
                const size=VIEW.resultGlyphSize,view=g.resultViews?.[i]||createResultView(won,i);
                for(const [j,state]of view.entries()){
                    const [x,y]=resultGlyphPosition(state),localX=x-i*(112+DIVIDER);
                    c.drawImage(ART['result-letters'],(won?5+j:j)*size,0,size,size,
                        left+localX*fieldWidth/112,y,size,size);
                }
            }else{
                c.textAlign='center';c.fillStyle=won?'#ffe565':'#ff6922';c.font='bold 16px monospace';
                c.fillText(won?'WIN!':'LOSE!',left+fieldWidth/2,VIEW.resultTop+14);
            }
        }
    }
    }
    if(g.p.mode==='survival'&&(g.phase==='countdown'||g.phase==='playing')&&g.bg3GlobalFrame<NATIVE_FADE_FRAMES)
        applyNativePaletteFade(c,width,HEIGHT,Math.max(0,g.bg3GlobalFrame));
    const out=g.ctx,displayRatio=g.canvasPixelRatio?.()||1;out.fillStyle='#151b23';out.fillRect(0,0,g.w,g.h);
    const available=Math.max(1,g.h-38*displayRatio),scale=pixelArtScale(width,HEIGHT,g.w,available);
    const w=Math.floor(width*scale),h=Math.floor(HEIGHT*scale),x=Math.floor((g.w-w)/2),y=Math.floor((available-h)/2);
    out.imageSmoothingEnabled=false;out.drawImage(g.pixelCanvas,x,y,w,h);
    out.textAlign='center';out.fillStyle='#d4d9dd';out.font=`${11*displayRatio}px sans-serif`;
    const status=g.p.mode==='survival'?`SURVIVAL · HARD · WINS ${g.wins||0}`:
        `${g.p.mode==='solo'?'SOLO':'RACE'} · HARD · ${g.elapsed.toFixed(1)} s · ${g.player.score} pts`;
    out.fillText(status,g.w/2,g.h-28*displayRatio);
    out.fillText(ending&&g.p.mode==='survival'&&(g.resultTicks||0)<PODIUM_VIEW.confirmTick?'ROUND COMPLETE…':ending?`${g.binding('continue')}  ${g.phase==='won'?'NEXT RIVAL':'RETRY'}  ·  ${g.binding('restart')}  RESTART SURVIVAL`:`${g.binding('left')}/${g.binding('right')} move  ·  ${g.binding('jump')} jump  ·  ${g.binding('place')} place  ·  ${g.binding('rotateBack')}/${g.binding('rotate')} rotate  ·  ${g.binding('dive')} jump off  ·  ${g.binding('discard')} discard`,g.w/2,g.h-11*displayRatio);
}
