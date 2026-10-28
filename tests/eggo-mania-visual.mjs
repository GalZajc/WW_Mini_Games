import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const looseOnly = process.argv.includes('--loose-only');
const resultAudioOnly=process.argv.includes('--result-audio-only');
const musicOnly = process.argv.includes('--music-only')||resultAudioOnly;
const waterOnly = process.argv.includes('--water-only');
const referenceOnly = process.argv.includes('--reference-only');
const throwOnly = process.argv.includes('--throw-only');
const surgeOnly = process.argv.includes('--surge-only');
const introOnly = process.argv.includes('--intro-only');
const stagesOnly = process.argv.includes('--stages-only');
const rivalsOnly = process.argv.includes('--rivals-only');
const charactersOnly=process.argv.includes('--characters-only');
const pickupOnly = process.argv.includes('--pickup-only');
const nativePickupOnly = process.argv.includes('--native-pickups-only');
const fillerOnly = process.argv.includes('--filler-only');
const bombOnly = process.argv.includes('--bomb-only');
const resultOnly = process.argv.includes('--result-only');
const arenaOnly = process.argv.includes('--arena-only');
const cloudOnly = process.argv.includes('--cloud-only');
const hammerOnly = process.argv.includes('--hammer-only');
const bubbleOnly = process.argv.includes('--bubble-only');
const jumperOnly = process.argv.includes('--jumper-only');
const jumpStackOnly = process.argv.includes('--jump-stack-only');
const jumpStackEveryFrame = process.argv.includes('--jump-stack-every-frame');
const jumpStackWaterActive = process.argv.includes('--jump-stack-water-active');
const inputPrefixOnly = process.argv.includes('--input-prefix-only');
const inputReplayAutonomous = process.argv.includes('--input-replay-autonomous');
const inputReplayOnly = process.argv.includes('--input-replay-only') || inputReplayAutonomous;
const inputReplayCaptureFrames = process.argv.includes('--input-replay-capture-frames');
const pixelWriteProbeArg=process.argv.find(arg=>arg==='--pixel-write-probe'||arg.startsWith('--pixel-write-probe='));
const pixelWriteProbe=pixelWriteProbeArg?pixelWriteProbeArg.includes('=')?
 pixelWriteProbeArg.split('=')[1].split(',').map(Number):[469,138,0,6,3]:null;
const replayCapturePrefix=process.argv.find(arg=>arg.startsWith('--replay-capture='))?.slice('--replay-capture='.length)??null;
const replayInitialPrefix=process.argv.find(arg=>arg.startsWith('--replay-initial-prefix='))?.slice('--replay-initial-prefix='.length)??null;
const replayInventoryDiagnostic=process.argv.includes('--diagnostic-inventory');
const replayIntroDescent=process.argv.includes('--replay-intro-descent');
const replayFrameLimit=Number(process.argv.find(arg=>arg.startsWith('--replay-frame-limit='))?.split('=')[1]??Infinity);
const jungleOnly = process.argv.includes('--jungle-only');
const jungleThiefOnly = process.argv.includes('--jungle-thief-only');
const spaceOnly = process.argv.includes('--space-only');
const factoryEnemyOnly = process.argv.includes('--factory-enemy-only');
const beanstalkThiefOnly = process.argv.includes('--beanstalk-thief-only');
const parkOnly = process.argv.includes('--park-only');
const priorityArtOnly=process.argv.includes('--priority-art-only');
const fishAffineOnly=process.argv.includes('--fish-affine-only')||priorityArtOnly;
const pirateOnly = process.argv.includes('--pirate-only')||fishAffineOnly;
const castleOnly = process.argv.includes('--castle-only');
const dragonOnly = process.argv.includes('--dragon-only');
const artifacts = path.join(root,'tests','OUTPUT','eggo-mania-visual_'+new Date().toISOString().replace(/[:.]/g,'-'));
const electronPath = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const debugPort = 9397;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class Client {
    constructor(url) {
        this.socket = new WebSocket(url);
        this.nextId = 1;
        this.pending = new Map();
        this.events = [];
    }
    async connect() {
        await new Promise((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
        });
        this.socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
            if (!message.id) { this.events.push(message); return; }
            const pending = this.pending.get(message.id);
            if (!pending) return;
            this.pending.delete(message.id);
            if (message.error) pending.reject(new Error(message.error.message));
            else pending.resolve(message.result);
        });
    }
    call(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }
    async evaluate(expression) {
        const result = await this.call('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    close() { this.socket.close(); }
}

async function waitFor(callback, description, timeout = 20000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const value = await callback();
            if (value) return value;
        } catch {}
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}`);
}

async function getPage() {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`);
    if (!response.ok) return null;
    const pages = await response.json();
    return pages.find(page => page.type === 'page' && page.webSocketDebuggerUrl);
}

let stdout = '';
let stderr = '';
const child = spawn(electronPath, ['--mute-audio', `--remote-debugging-port=${debugPort}`, '.'], {
    cwd: root,
    windowsHide: true,
    env: { ...process.env, WW_MINI_GAMES_HEADLESS_TEST: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => { stdout += chunk.toString(); });
child.stderr.on('data', chunk => { stderr += chunk.toString(); });

let client;
try {
 await mkdir(artifacts,{recursive:true});
 const jumpStackFixture=jumpStackOnly?JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-grounded-stack-jump.json'),'utf8')):null;
 const inputPrefixFixture=inputPrefixOnly?JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-input-replay-prefix.json'),'utf8')):null;
 const initialPrefix=path.resolve(root,replayInitialPrefix??'scripts/OUTPUT/eggo-reference_2026-10-07_05-25-02_007845/screen-replay-io.frame00000');
 const replayInitialRam=inputReplayOnly?await readFile(initialPrefix+'.ram'):null;
 const replayInitialIo=inputReplayOnly?await readFile(initialPrefix+'.0x4000000'):null;
 const replayInitialOam=inputReplayOnly?await readFile(initialPrefix+'.0x7000000'):null;
 const replayStage=inputReplayOnly?['beanstalk','factory','dragon','castle','pirate','space','jungle','park'][replayInitialRam.readUInt32LE(0x3294)]:'factory';
 const initialArtByQuad=new Map();
 if(inputReplayOnly&&replayInitialPrefix){
  const placed=JSON.parse(await readFile(path.join(root,'renderer/games/eggo-mania/assets/placed-pieces.json'),'utf8'));
  for(const entry of placed.entries.filter(item=>item.stage===replayStage))for(let y=0;y<3;y++)for(let x=0;x<3;x++){
   const quad=[0,1].flatMap(dy=>[0,1].map(dx=>entry.descriptors[(y*2+dy)*8+x*2+dx]));
   if(quad.some(Boolean)&&!initialArtByQuad.has(String(quad)))
    initialArtByQuad.set(String(quad),1+(entry.rotation*8+entry.kind)*9+y*3+x);
  }
 }
  const replayInitialCpuPieceTemplates=inputReplayOnly?
   JSON.parse(await readFile(path.join(root,'tests/fixtures/eggo-input-replay-initial-cpu-art.json'),'utf8')).piece_templates:null;
  const replayGraphicsTrace=inputReplayOnly?
   JSON.parse(await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.trace.json'),'utf8')):null;
  const replayBg3ControlTrace=inputReplayOnly?await Promise.all(Array.from({length:600},(_,index)=>
   readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876',
    `eggo-replay-full-graphics.frame${String(index+1).padStart(5,'0')}.0x4000000`))
    .then(io=>io.readUInt16LE(0x0e)))):null;
  const replayData=inputReplayOnly?{
   steps:JSON.parse(await readFile(path.join(root,'tests/OUTPUT/eggo-input-replay_2026-10-07_03-16-26_086460/steps.json'),'utf8')),
  nativeTrace:JSON.parse(await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_05-25-02_007845/screen-replay-io.trace.json'),'utf8'))
    .map((sample,index)=>({...sample,...replayGraphicsTrace[index],native_bg3_control:replayBg3ControlTrace[index]})),
  rngTrace:JSON.parse(await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_14-03-16_233449/eggo-replay-rng-audit.trace.json'),'utf8')),
  enemyTrace:JSON.parse(await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_06-54-48_926040/cpu-hazard-alignment.trace.json'),'utf8')),
   boardEvents:JSON.parse(await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.board-events.json'),'utf8')),
  initial:JSON.parse(await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_05-25-02_007845/parameters.json'),'utf8')),
  initialNativeRam:replayInitialRam,
  initialNativeIo:replayInitialIo,
  initialCpuPieceTemplates:replayInitialCpuPieceTemplates,
  initialFields:[0,1].map(side=>{
   const actorBase=side===0?0x3bd4:0x4f50,cameraBase=side===0?0x3910:0x4c8c,ram=replayInitialRam;
   const read=(offset)=>ram.readInt32LE(actorBase+offset);
   return{
    actor:{xQ16:read(0),yQ16:read(4),vxQ16:read(0x14),vyQ16:read(0x18),inventory:read(0x864),variant:read(0x868),poseState:read(0x854),state:read(0x874),nextState:read(0x878),
     animation:{table:ram.readUInt32LE(actorBase+0x84c),frame:ram.readUInt32LE(actorBase+0x850),selector:ram.readUInt32LE(actorBase+0x854),
      state:ram.readUInt32LE(actorBase+0x858),phase:ram.readUInt32LE(actorBase+0x85c),randomStep:ram.readUInt32LE(actorBase+0x860),flags:ram.readUInt32LE(actorBase+0x86c)}},
    resourceRoot:read(0x838),bootsTicks:read(0x92c),completedFloorCount:read(0x934),previewPosition:{xQ16:read(0x8a0),yQ16:read(0x8a4),angle:read(0x8a8)},
    rescueOrigin:{frame:ram.readUInt32LE(0x11a9c),phaseX:ram.readUInt32LE(actorBase-0x898+0x850+0x20),
     phaseY:ram.readUInt32LE(actorBase-0x898+0x850+0x24)},
    meter:{position:ram.readInt32LE(0x31418+side*4)-side*128*65536,
     velocity:ram.readInt32LE(0x31410+side*4),count:read(0x82c),
     pose:(()=>{const pointer=(side===0?4:7)*8,bar=(side===0?5:8)*8;
      return{x:(replayInitialOam.readUInt16LE(pointer+2)&0x1ff)-side*128,
       y:replayInitialOam.readUInt16LE(pointer)&0xff,barY:replayInitialOam.readUInt16LE(bar)&0xff};})()},
    rowsBottomUp:Array.from({length:47},(_,y)=>Array.from({length:7},(_,x)=>ram[0x10084+side*0x124c+(46-y)*8+x])),
    nativeArtwork:replayInitialPrefix?Array.from({length:47},(_,y)=>Array.from({length:7},(_,x)=>{
     const field=side===0?0xf404:0x10650,quad=[0,1].flatMap(dy=>[0,1].map(dx=>
      ram.readUInt16LE(field+((46-y)*2+dy)*32+x*4+dx*2)));
     return initialArtByQuad.get(String(quad))??null;
    })):null,
    camera:{positionQ16:ram.readInt32LE(cameraBase+4),scaleQ16:ram.readInt32LE(cameraBase+0x2c),y:ram.readInt32LE(cameraBase+0x70),
     offset:ram.readInt16LE((side===0?0xf404:0x10650)+0xeb8)}
   };
  }),
  initialHazards:[0x31038,0x310b8,0x31138,0x311b8].map((at,index)=>{
   const read=offset=>replayInitialRam.readInt32LE(at+offset);
   return{field:index%2,type:read(0x24),x:read(0),y:read(4),vx:read(0x14),vy:read(0x18),
    animation:read(0x20),animationClock:read(0x28),active:Boolean(read(0x48)),life:read(0x4c),
    variant:read(0x50),angle:read(0x54),speed:read(0x58),hitX:read(0x40),hitY:read(0x44),
    wingClock:read(0x74)/65536,wingPhase:read(0x78),poseForward:Boolean(replayInitialRam[at+0x7c])};
  }),
  initialCpuKeys:replayInitialRam.readUInt16LE(0xe9a8),
  initialParticles:Array.from({length:14},(_,slot)=>{
   const at=0x31510+slot*0x3c,ram=replayInitialRam,type=ram.readUInt32LE(at+0x34);
   if(!ram[at+0x38]||![1,2].includes(type))return null;
   const field=ram.readUInt32LE(at+0x24)===0x02004c8c?1:0,
    age=ram.readUInt32LE(at+0x28)*2+2-ram.readUInt32LE(at+0x2c);
   return{field,type,x:ram.readInt32LE(at)/65536-field*128,
    y:ram.readInt32LE(at+4)/65536-(type===1?age:0),bornFrame:ram.readUInt32LE(0x11a9c)-age};
  }),
  initialCpuControllerWords:Array.from({length:0x108/4},(_,index)=>replayInitialRam.readInt32LE(0x5a40+index*4)),
  initialNativeScreenshotBase64:(await readFile(initialPrefix+'.png')).toString('base64'),
   finalNativeScreenshotBase64:(await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.frame00600.png'))).toString('base64'),
  finalNativeRam:await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_05-25-02_007845/screen-replay-io.frame00600.ram')),
  initialNativeScreenshot:await readFile(initialPrefix+'.png'),
   finalNativeScreenshot:await readFile(path.join(root,'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.frame00600.png')),
  actor:JSON.parse(await readFile(path.join(root,'tests/fixtures/eggo-input-replay-prefix.json'),'utf8')).initial_actor,
  inputSource:'tests/OUTPUT/eggo-input-replay_2026-10-07_03-16-26_086460/steps.json',
 }:null;
 if(replayCapturePrefix){
  if(!inputReplayOnly)throw Error('--replay-capture requires an input-replay mode');
  const prefix=path.resolve(root,replayCapturePrefix),parameters=JSON.parse(await readFile(prefix+'.json','utf8'));
  const diagnosticWrites=replayInventoryDiagnostic&&parameters.writes.every(([at,value])=>
   (at===0x3bd4+0x864&&Number.isInteger(value)&&value>=0&&value<13)||
   (at===0x3bd4+0x868&&Number.isInteger(value)&&value>=0&&value<4));
  const expectedStateSha=replayInitialPrefix?createHash('sha256').update(await readFile(initialPrefix+'.state')).digest('hex'):
   replayData.initial.initial_state_sha256;
  if(parameters.initial_state_sha256!==expectedStateSha||
     parameters.writes.length&&!diagnosticWrites)
   throw Error('Custom replay must use hard-idle; diagnostic mode permits only initial inventory/orientation writes');
  if(diagnosticWrites)for(const [at,value] of parameters.writes)
   replayData.initialFields[0].actor[at===0x3bd4+0x864?'inventory':'variant']=value;
  const trace=JSON.parse(await readFile(prefix+'.trace.json','utf8')).slice(0,replayFrameLimit);
  let remaining=trace.length;
  const steps=parameters.steps.flatMap(([n,keys])=>{
   const count=Math.min(n,remaining);remaining-=count;return count?[[count,keys]]:[];
  });
  const io=await Promise.all(trace.map((_,i)=>readFile(prefix+'.frame'+String(i+1).padStart(5,'0')+'.0x4000000')));
  const last=prefix+'.frame'+String(trace.length).padStart(5,'0');
  Object.assign(replayData,{steps,initial:parameters,inputSource:path.relative(root,prefix+'.json'),
   nativeTrace:trace.map((sample,index)=>({...sample,native_bg3_control:io[index].readUInt16LE(0x0e)})),
   enemyTrace:trace,rngTrace:trace,boardEvents:JSON.parse(await readFile(prefix+'.board-events.json','utf8')),
   finalNativeRam:await readFile(last+'.ram'),finalNativeScreenshot:await readFile(last+'.png'),
   finalNativeScreenshotBase64:(await readFile(last+'.png')).toString('base64')});
 }
 const scenes=inputReplayOnly?['input-replay']:inputPrefixOnly?['input-prefix']:jumpStackOnly?['jump-stack']:looseOnly?['loose-before','loose-after']:(musicOnly||charactersOnly)?['start']:nativePickupOnly?['native-prefill','native-discard','survival-round-nine']:jungleThiefOnly?['jungle-thief','jungle-stolen','jungle-drop']:beanstalkThiefOnly?['beanstalk-thief','beanstalk-stolen']:parkOnly?['park-bird','park-duck','park-caught']:factoryEnemyOnly?['factory-robot','factory-stolen']:pirateOnly?['pirate-fish','pirate-stolen']:castleOnly?['castle-rise','castle-caught','castle-thief','castle-stolen']:dragonOnly?['dragon-rise','dragon-rock']:spaceOnly?['space-attack','space-missile']:jungleOnly?['jungle-caught']:jumperOnly?['jumper-rise','jumper-caught']:bubbleOnly?['bubble-caught','bubble-escape']:hammerOnly?['hammer-flight','hammer-collapse','hammer-hit']:cloudOnly?['cloud-small','cloud-miss','cloud-hit']:arenaOnly?['arena-factory','arena-space']:resultOnly?['result-won','result-lost','result-burst','podium-won','podium-lost','podium-game-over']:bombOnly?['bomb','bomb-flight','bomb-explosion']:introOnly?['intro-three','intro-go','intro-descent','intro-landed']:stagesOnly?['start']:pickupOnly?['pickup']:fillerOnly?['filler-held','filler-filled']:surgeOnly?['surge']:waterOnly?['water-priority','water']:referenceOnly?['reference']:['start','tower','balloon'];
 if(fishAffineOnly)scenes.length=0;
 await writeFile(path.join(artifacts,'parameters.json'),JSON.stringify({audioOutputMuted:true,fishAffineOnly,replayInitialPrefix,replayCapturePrefix,replayFrameLimit,throwOnly,looseOnly,musicOnly,resultAudioOnly,charactersOnly,waterOnly,referenceOnly,jumpStackOnly,jumpStackEveryFrame,inputPrefixOnly,inputReplayOnly,inputReplayAutonomous,inputReplayCaptureFrames,inputPrefixFixture:inputPrefixOnly?'tests/fixtures/eggo-input-replay-prefix.json':null,inputPrefixFrames:inputPrefixOnly?inputPrefixFixture.frames:null,inputReplaySources:inputReplayOnly?{tape:'tests/OUTPUT/eggo-input-replay_2026-10-07_03-16-26_086460/steps.json',actorMotionTrace:'scripts/OUTPUT/eggo-reference_2026-10-07_05-25-02_007845/screen-replay-io.trace.json',cameraStateTrace:'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.trace.json',enemyTrace:'scripts/OUTPUT/eggo-reference_2026-10-07_06-54-48_926040/cpu-hazard-alignment.trace.json',boardEvents:'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.board-events.json',nativeFrames:'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.frame*.png',nativeGraphics:'scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/eggo-replay-full-graphics.frame*.memory3',checkpoint:'tests/artifacts/eggo-reference/hard-idle.state',initialNativeFrame:replayData.initialNativeRam.readUInt32LE(0x11a9c),initialNativeGlobalRandomSeed:replayData.initialNativeRam.readUInt16LE(0x11aac),initialMeterState:'position/velocity from RAM 0x02031418/0x02031410; displayed pointer/bar pose from initial OAM objects 4-9',finalNativeFrame:replayData.finalNativeRam.readUInt32LE(0x11a9c),cameraTrace:'native_cameras and camera_follow_state for each replay frame'}:null,inputReplayFrames:inputReplayOnly?replayData.nativeTrace.length:null,surgeOnly,fillerOnly,pickupOnly,nativePickupOnly,stagesOnly,introOnly,rivalsOnly,bombOnly,resultOnly,arenaOnly,cloudOnly,hammerOnly,bubbleOnly,jumperOnly,jungleOnly,jungleThiefOnly,spaceOnly,dragonOnly,castleOnly,pirateOnly,factoryEnemyOnly,parkOnly,beanstalkThiefOnly,referenceFixture:referenceOnly?'tests/fixtures/eggo-mania-gba.json':null,referenceNativePlacementTiles:referenceOnly,referenceStartingStage:0,jumpStackRows:jumpStackOnly?jumpStackFixture.rows_bottom_up.length:null,jumpStackCells:jumpStackOnly?jumpStackFixture.cells:null,jumpStackNativeFixture:jumpStackOnly?'tests/fixtures/eggo-grounded-stack-jump.json':null,jumpStackPreviewProbe:jumpStackOnly?jumpStackFixture.preview_probe:null,jumpStackNativeCameraStartQ16:jumpStackOnly?jumpStackFixture.camera_position_q16_before_input:null,jumpStackNativeCameraSampleCount:jumpStackOnly?(jumpStackFixture.native_camera_samples?.length||0):null,jumpStackSource:jumpStackOnly?'ROM-derived supported stack and jump trajectory; placed cells share the actor camera and scroll out of view when native captures do':null,jumpStackActorStart:jumpStackOnly?jumpStackFixture.actor:null,jumpStackWaterline:jumpStackOnly?jumpStackFixture.waterline:null,jumpStackBg3GlobalFrame:jumpStackOnly?jumpStackFixture.bg3_global_frame_before_input:null,jumpStackCellVisibilityMethod:jumpStackOnly?'per-frame viewport visibility from the previous native BG0 camera position, tile rendering and same-state rerender checks':null,jumpStackJumpHoldFrames:jumpStackOnly?40:null,jumpStackTotalFrames:jumpStackOnly?90:null,simulatedDevicePixelRatio:jumpStackOnly?1.25:null,debugPort,seed:42,scenes,simulationStep:1/60},null,2));
 if(inputReplayOnly){
  const replayParameterPath=path.join(artifacts,'parameters.json'),replayParameters=JSON.parse(await readFile(replayParameterPath,'utf8'));
  replayParameters.inputReplaySources.initialCpuPieceArtwork='tests/fixtures/eggo-input-replay-initial-cpu-art.json';
  replayParameters.inputReplaySources.initialCpuPieceArtworkMethod='Per-cell BG2 descriptor quads from native capture index 0 / native frame 563 matched against ROM-decoded placed-factory maps.';
  if(replayCapturePrefix){
   const prefix=path.relative(root,path.resolve(root,replayCapturePrefix));
   Object.assign(replayParameters.inputReplaySources,{tape:prefix+'.json',
    actorMotionTrace:prefix+'.trace.json',cameraStateTrace:prefix+'.trace.json',enemyTrace:prefix+'.trace.json',
    boardEvents:prefix+'.board-events.json',nativeFrames:prefix+'.frame*.png',nativeGraphics:prefix+'.frame*.memory3',
    comparisonCapture:prefix,frameLimit:Number.isFinite(replayFrameLimit)?replayFrameLimit:null,
    checkpoint:replayInitialPrefix?path.relative(root,initialPrefix+'.state'):'tests/artifacts/eggo-reference/hard-idle.state',
    initialStateRestoration:replayInitialPrefix?'Logged diagnostic checkpoint: restore its actor, board descriptor quads, RNG and controller state':
     'Same hard-idle checkpoint as the original 600-frame replay'});
  }
  await writeFile(replayParameterPath,JSON.stringify(replayParameters,null,2));
 }
 if(jumpStackWaterActive){const parameterPath=path.join(artifacts,'parameters.json'),parameters=JSON.parse(await readFile(parameterPath,'utf8'));
  parameters.jumpStackWaterActive=true;parameters.jumpStackWaterline='mid-stack (synthetic rendering stress case)';
  await writeFile(parameterPath,JSON.stringify(parameters,null,2));}
 const page=await waitFor(getPage,'renderer');client=new Client(page.webSocketDebuggerUrl);await client.connect();
 await waitFor(()=>client.evaluate('Boolean(window.app?.gameLoader?.games?.length)'),'games');
 // Reference scenes deliberately use factory; ordinary gameplay draws its first arena from the seed.
 console.log(await client.evaluate(`(async()=>{window.app.settingsManager.save=async()=>{};const config=window.app.gameLoader.games.find(g=>g._id==='eggo-mania');if(!config)throw Error('Missing game card');await window.app.launchGame(config);window.app._isPaused=true;const current=window.app.currentGame;current.startingStage=0;current.startRound({intro:false});if(getComputedStyle(current.canvas).imageRendering!=='pixelated')throw Error('GBA display canvas is not using pixelated compositor scaling');return {name:config.name,phase:current.phase,pixelScaling:getComputedStyle(current.canvas).imageRendering};})()`));
 if(jumpStackOnly){const dpi=await client.evaluate(`(async()=>{Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:1.25});const g=window.app.currentGame;window.app._resizeCanvas();g.ctx.globalAlpha=.73;window.app._resizeCanvas();const stableContext=g.ctx.globalAlpha===.73;g.ctx.globalAlpha=1;const expectedWidth=Math.round(window.innerWidth*1.25),expectedHeight=Math.round(window.innerHeight*1.25);await g.onLayoutSettingsApplied(g.settings);const layoutSettingsStable=g.canvas.width===expectedWidth&&g.canvas.height===expectedHeight;return{ratio:window.devicePixelRatio,width:g.canvas.width,height:g.canvas.height,expectedWidth,expectedHeight,stableContext,layoutSettingsStable,cssRect:{width:g.canvas.getBoundingClientRect().width,height:g.canvas.getBoundingClientRect().height}};})()`);
 if(dpi.width!==dpi.expectedWidth||dpi.height!==dpi.expectedHeight||!dpi.stableContext||!dpi.layoutSettingsStable)throw Error('Eggo backing canvas does not remain at a stable fractional device scale: '+JSON.stringify(dpi));
  await client.evaluate(`window.__eggoDpiReport=${JSON.stringify(dpi)}`);
 }
 if(fishAffineOnly){
  for(const animal of ['fish','shark']){
  const fixture=JSON.parse(await readFile(path.join(root,`tests/fixtures/eggo-${animal}-affine-gba.json`),'utf8'));
  const expected=(await readFile(path.join(root,`tests/fixtures/eggo-${animal}-affine-gba.png`))).toString('base64');
  const audit=await client.evaluate(`(async()=>{
   const {waitForPixelAssets,nativeEffectAffineArt}=await import('./games/eggo-mania/pixel-renderer.js');
   const {nativeSkeletalFishMatrix}=await import('./games/eggo-mania/model.js');
   await waitForPixelAssets();
   const cases=${JSON.stringify(fixture.cases)},canvas=document.createElement('canvas');
   canvas.width=64;canvas.height=cases.length*64;const c=canvas.getContext('2d');
   cases.forEach((sample,i)=>c.drawImage(nativeEffectAffineArt((sample.stage??'pirate')+'-enemy',sample.animation,64,
    nativeSkeletalFishMatrix(sample.angle,sample.variant)),0,i*64));
   const image=new Image();image.src='data:image/png;base64,${expected}';await image.decode();
   const ref=document.createElement('canvas');ref.width=canvas.width;ref.height=canvas.height;
   const rc=ref.getContext('2d');rc.drawImage(image,0,0);
   const a=c.getImageData(0,0,canvas.width,canvas.height).data,b=rc.getImageData(0,0,canvas.width,canvas.height).data;
   let differentPixels=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])differentPixels++;
   return {cases:cases.length,pixels:canvas.width*canvas.height,differentPixels,
    nativePngVisiblePixels:cases.reduce((sum,s)=>sum+s.visible_native_png_pixels,0),png:canvas.toDataURL('image/png').split(',')[1]};
  })()`);
  await writeFile(path.join(artifacts,animal+'-affine.png'),Buffer.from(audit.png,'base64'));
  delete audit.png;await writeFile(path.join(artifacts,animal+'-affine-report.json'),JSON.stringify(audit,null,2));
  console.log('Native fish affine audit:',audit);if(audit.differentPixels)throw Error('Native fish artwork differs');
  }
 }
 if(priorityArtOnly){
  const throwFixture=JSON.parse(await readFile(path.join(root,'tests/fixtures/eggo-arena-throw-gba.json'),'utf8'));
  const throwExpected=(await readFile(path.join(root,'tests/fixtures/eggo-arena-throw-gba.png'))).toString('base64');
  const throwAudit=await client.evaluate(`(async()=>{
   const {waitForPixelAssets,nativeThrowAffineArt}=await import('./games/eggo-mania/pixel-renderer.js');await waitForPixelAssets();
   const cases=${JSON.stringify(throwFixture.cases)},canvas=document.createElement('canvas');canvas.width=64;canvas.height=64*cases.length;
   const c=canvas.getContext('2d');cases.forEach((s,i)=>c.drawImage(nativeThrowAffineArt(s.kind,s.matrix,false,s.stage),0,64*i));
   const image=new Image();image.src='data:image/png;base64,${throwExpected}';await image.decode();
   const ref=document.createElement('canvas');ref.width=canvas.width;ref.height=canvas.height;const r=ref.getContext('2d');r.drawImage(image,0,0);
   const a=c.getImageData(0,0,canvas.width,canvas.height).data,b=r.getImageData(0,0,canvas.width,canvas.height).data;
   let differentPixels=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])differentPixels++;
   return {cases:cases.length,differentPixels,png:canvas.toDataURL('image/png').split(',')[1]};
  })()`);
  await writeFile(path.join(artifacts,'arena-throw.png'),Buffer.from(throwAudit.png,'base64'));delete throwAudit.png;
  await writeFile(path.join(artifacts,'arena-throw-report.json'),JSON.stringify(throwAudit,null,2));console.log('Native arena throw audit:',throwAudit);
  if(throwAudit.differentPixels)throw Error('Arena throw texture differs from native OAM');
  const waterAudit=await client.evaluate(`(async()=>{
   const {waitForPixelAssets}=await import('./games/eggo-mania/pixel-renderer.js');
   const {SURVIVAL_STAGES}=await import('./games/eggo-mania/model.js');await waitForPixelAssets();
   const stages=SURVIVAL_STAGES.slice(1),sheet=document.createElement('canvas');sheet.width=112*stages.length;sheet.height=160;
   const out=sheet.getContext('2d'),cases=[];
   for(const stage of stages){
    const g=window.app.currentGame;g.startingStage=SURVIVAL_STAGES.indexOf(stage);g.round=1;g.startRound({intro:false});g.cpu=null;
    g.camera=[0,0];Object.assign(g.views[0],{camera:0,boardCamera:0,previousNativeCameraPosition:640});
    const t=g.player;Object.assign(t,{nativeFrame:600,water:2,previousWater:2,previousPreviousWater:2,crates:[]});t.egg.y=20;g.render();
    const image=new Image();image.src='./games/eggo-mania/assets/'+stage+'-water-surface.png';await image.decode();
    const ref=document.createElement('canvas');ref.width=112;ref.height=32;const rc=ref.getContext('2d');rc.drawImage(image,0,0,112,32,0,0,112,32);
    const a=rc.getImageData(0,0,112,32).data,b=g.pixelCanvas.getContext('2d').getImageData(0,56,112,32).data;
    let differentPixels=0,opaquePixels=0;for(let j=0;j<a.length;j+=4)if(a[j+3]){opaquePixels++;if(a[j]!==b[j]||a[j+1]!==b[j+1]||a[j+2]!==b[j+2])differentPixels++;}
    cases.push({stage,differentPixels,opaquePixels});out.drawImage(g.pixelCanvas,(cases.length-1)*112,0);
   }
   return {cases,differentPixels:cases.reduce((sum,c)=>sum+c.differentPixels,0),png:sheet.toDataURL('image/png').split(',')[1]};
  })()`);
  await writeFile(path.join(artifacts,'arena-water.png'),Buffer.from(waterAudit.png,'base64'));delete waterAudit.png;
  await writeFile(path.join(artifacts,'arena-water-report.json'),JSON.stringify(waterAudit,null,2));console.log('Arena water surface gameplay audit:',waterAudit);
  if(waterAudit.differentPixels)throw Error('Native water surface missing or obscured in gameplay');
  const fixture=JSON.parse(await readFile(path.join(root,'renderer/games/eggo-mania/assets/bomb-fuse.json'),'utf8'));
  const expected=(await readFile(path.join(root,'renderer/games/eggo-mania/assets/bomb-fuse.png'))).toString('base64');
  const audit=await client.evaluate(`(async()=>{
   const {waitForPixelAssets,nativeArmedBombArt}=await import('./games/eggo-mania/pixel-renderer.js');
   const {NATIVE_BOMB_ART}=await import('./games/eggo-mania/assets/bomb-fuse.js');await waitForPixelAssets();
   const cases=${JSON.stringify(fixture.sources)},canvas=document.createElement('canvas');
   canvas.width=64;canvas.height=cases.length*32;const c=canvas.getContext('2d');
   const image=new Image();image.src='data:image/png;base64,${expected}';await image.decode();
   let differentPixels=0;
   cases.forEach((s,i)=>{c.drawImage(image,s.image*32,0,32,32,0,i*32,32,32);
    c.drawImage(nativeArmedBombArt(s.remaining,s.clock-NATIVE_BOMB_ART.clockOamDelay),32,i*32);
    const a=c.getImageData(0,i*32,32,32).data,b=c.getImageData(32,i*32,32,32).data;
    for(let j=0;j<a.length;j+=4)if(a[j]!==b[j]||a[j+1]!==b[j+1]||a[j+2]!==b[j+2]||a[j+3]!==b[j+3])differentPixels++;
   });return {cases:cases.length,differentPixels,png:canvas.toDataURL('image/png').split(',')[1]};
  })()`);
  await writeFile(path.join(artifacts,'bomb-fuse-audit.png'),Buffer.from(audit.png,'base64'));delete audit.png;
  await writeFile(path.join(artifacts,'bomb-fuse-report.json'),JSON.stringify(audit,null,2));console.log('Native bomb fuse audit:',audit);
  if(audit.differentPixels)throw Error('Bomb animation differs from native OAM');
  await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=0;g.round=1;g.startRound({intro:false});})()`);
 }
 if(inputPrefixOnly){
  const report=await client.evaluate(`(async()=>{
   const fixture=${JSON.stringify(inputPrefixFixture)};
   const g=window.app.currentGame;
   g.p={...g.p,mode:'survival',difficulty:'hard',columns:7,hazards:false,seed:42};
   g.seed=42;g.round=1;g.startingStage=0;g.nativeActorRandomSeed=42;g.startRound({intro:false});
   const t=g.player;t.rows=[];t.crates=[];t.nativePickups=null;t.spawn=Infinity;t.water=-2;t.nativeFrame=600;
   Object.assign(t.egg,{x:fixture.initial_actor.game_x,y:fixture.initial_actor.game_y,vy:fixture.initial_actor.velocity_y,
    ground:fixture.initial_actor.grounded,offTower:false,swimming:false,waterTime:0,waterEjected:false,
    dive:0,wet:0,boost:0,stun:0,dropTicks:0,nativeDiveMotion:false,nativeFillerMotion:false});
   g.nativePlayerPrimed=true;
   const frames=[];
   for(const sample of fixture.actor_samples){
    const keys=new Set(sample.keys.split('+'));
    const control={move:Number(keys.has('RIGHT'))-Number(keys.has('LEFT')),jump:keys.has('UP'),float:keys.has('UP'),
     fast:keys.has('DOWN'),dive:keys.has('L'),discard:keys.has('R'),use:keys.has('A'),rotate:keys.has('B')?1:0};
    g.updateTower(t,1/60,{nativeMotion:true,...control},null);
    const worldX=(t.egg.x-1)*16,worldY=720-t.egg.y*16;
    frames.push({frame:sample.frame,keys:sample.keys,world_x:worldX,world_y:worldY,
     error_x:worldX-sample.world_x,error_y:worldY-sample.world_y,grounded:t.egg.ground,velocity_y:t.egg.vy});
   }
   const maxErrorX=Math.max(...frames.map(s=>Math.abs(s.error_x))),maxErrorY=Math.max(...frames.map(s=>Math.abs(s.error_y)));
   return{frames:frames.length,maxErrorX,maxErrorY,final:frames.at(-1),frames_detail:frames};
  })()`);
  await writeFile(path.join(artifacts,'input-prefix-replay.json'),JSON.stringify(report,null,2));
  console.log('ROM input-prefix actor replay:',{frames:report.frames,maxErrorX:report.maxErrorX,maxErrorY:report.maxErrorY,final:report.final});
  if(report.maxErrorX>0.02||report.maxErrorY>0.02)throw Error('App actor trajectory diverged from the native 19-frame input prefix: '+JSON.stringify({maxErrorX:report.maxErrorX,maxErrorY:report.maxErrorY,frames:report.frames_detail}));
  client.close();client=null;child.kill();
  process.exit(0);
 }
 if(inputReplayOnly){
  const report=await client.evaluate(`(async()=>{
   const {nativeCellArt,nativePickupItem,RULES,nativePreviewAngleMatrix}=await import('./games/eggo-mania/model.js');
   const {NATIVE_CHARACTER_RESOURCES}=await import('./games/eggo-mania/native-character-resources.js');
   const {NATIVE_PIECE_MASKS}=await import('./games/eggo-mania/assets/native-piece-masks.js');
   const {NATIVE_HAZARDS,updateNativeHitCenter}=await import('./games/eggo-mania/native-hazards.js');
  const {advanceView,seedNativeCameraActorY,VIEW,nativeBg3ScrollOffset,nativeStageRingScroll,nativeMeterPose,actorPose,rivalPose,nativeRivalResourcePose}=await import('./games/eggo-mania/view.js');
   const {nativePreviewRenderState,nativePreviewGridOrigin}=await import('./games/eggo-mania/pixel-renderer.js');
  const capture=${JSON.stringify({steps:replayData.steps,trace:replayData.nativeTrace,rngTrace:replayData.rngTrace,enemyTrace:replayData.enemyTrace,boardEvents:replayData.boardEvents,initial:replayData.initial,initialFields:replayData.initialFields,initialHazards:replayData.initialHazards,
    initialCpuKeys:replayData.initialCpuKeys,initialCpuControllerWords:replayData.initialCpuControllerWords,initialParticles:replayData.initialParticles,
    initialCpuPieceTemplates:replayData.initialCpuPieceTemplates,
    initialNativeScreenshotBase64:replayData.initialNativeScreenshotBase64,finalNativeScreenshotBase64:replayData.finalNativeScreenshotBase64,
    startNativeFrame:replayData.initialNativeRam.readUInt32LE(0x11a9c),finalNativeFrame:replayData.finalNativeRam.readUInt32LE(0x11a9c),startGlobalRandomSeed:replayData.initialNativeRam.readUInt16LE(0x11aac),startEnemySeed:replayData.initialNativeRam.readUInt32LE(0x11ab0),
    startCpuSeed:replayData.initialNativeRam.readUInt32LE(0x11ab4),
    startPlayerCameraPositionQ16:replayData.initialNativeRam.readInt32LE(0x3910+4),startCpuCameraPositionQ16:replayData.initialNativeRam.readInt32LE(0x4c8c+4),
    startPlayerCameraY:replayData.initialNativeRam.readInt32LE(0x3910+0x70),startCpuCameraY:replayData.initialNativeRam.readInt32LE(0x4c8c+0x70),
    startAnimationClock:replayData.initialNativeRam.readUInt32LE(0x16c),
    nativeStage:replayStage,startBg3Vofs:replayData.initialNativeIo.readUInt16LE(0x1e)})};
   capture.inputSource=${JSON.stringify(replayData?.inputSource??null)};
   const autonomous=${inputReplayAutonomous};
   const g=window.app.currentGame;
   const controlsFromGba=bits=>({move:Number(Boolean(bits&16))-Number(Boolean(bits&32)),jump:Boolean(bits&64),float:Boolean(bits&64),
    fast:Boolean(bits&128),discard:Boolean(bits&256),dive:Boolean(bits&512),use:Boolean(bits&1),rotate:bits&2?1:0});
   const controlsToGba=control=>(control?.use?1:0)|(control?.rotate?2:0)|(control?.move>0?16:control?.move<0?32:0)|
    (control?.jump||control?.float?64:0)|(control?.fast?128:0)|(control?.discard?256:0)|(control?.dive?512:0);
   g.p={...g.p,mode:'survival',difficulty:'hard',character:'yolko',columns:7,hazards:autonomous,seed:42};
   g.seed=42;g.round=1;g.startingStage=['factory','dragon','castle','pirate','space','jungle','park','beanstalk'].indexOf(capture.nativeStage);g.nativeActorRandomSeed=42;g.startRound({intro:false});
   // The ROM counter is initialized to 1 while the app's phase counter is the
   // number of completed updates since that reset. Resume at nativeCounter-1
   // so streamed BG rows use the same preceding-counter DMA phase.
   g.bg3GlobalFrame=Math.max(0,capture.startNativeFrame-1);g.elapsed=capture.startNativeFrame/60;
   const initial=capture.initial,scale=65536,fields=[g.player,g.cpu];
   if(!g.cpu)throw Error('The full replay requires both Survival fields');
   const syncHazardsFromNative=(tower,sample)=>{
    for(const [name,kind] of NATIVE_HAZARDS[tower.artStage]??[]){
     const native=sample?.enemies?.find(enemy=>enemy.field===tower.fieldIndex&&enemy.type===kind),d=tower[name];
     if(!native||!d)continue;
     Object.assign(d,{active:Boolean(native.active),life:native.life,x:native.x/scale,y:native.y/scale,
      vx:native.vx/scale,vy:native.vy/scale,animation:native.animation,previousAnimation:native.animation,
      animationClock:native.animationClock??native.animation_clock??d.animationClock,
      variant:native.variant,angle:native.angle,speed:native.speed});
     updateNativeHitCenter(d,kind);
     if(kind===2&&Number.isFinite(native.wingClock))Object.assign(d,{wingClock:native.wingClock,
      wingPhase:native.wingPhase,previousWingPhase:native.wingPhase,poseForward:native.poseForward});
     if(Number.isFinite(native.hitX))d.nativeHitX=native.hitX/scale;
     if(Number.isFinite(native.hitY))d.nativeHitY=native.hitY/scale;
    }
   };
   const syncCpuHazardsFromNative=sample=>{g.cpu.p.hazards=true;syncHazardsFromNative(g.cpu,sample);};
   const syncPickupsFromNative=(tower,sample,side,previousManager)=>{
    const manager=sample?.pickups?.[side];if(!manager)return;
    const displayedFrame=(sample.native_frame??capture.startNativeFrame)-1;
     const restoreItems=items=>items.slice().reverse().map(item=>{
     const crate=nativePickupItem({x:item.x/scale,y:item.y/scale,vx:item.vx/scale,vy:item.vy/scale,
      state:item.state,kind:item.kind,variant:item.variant,wait:item.wait,active:true},7);
     crate.nativeSwayFrame=displayedFrame;return crate;
    });
    tower.crates=restoreItems(manager.items);
    // The captured OAM is built before the native frame advances these items.
    tower.nativeRenderCrates=restoreItems(previousManager?.items??manager.items);
   if(tower.nativePickups)Object.assign(tower.nativePickups,{bag:[...manager.bag],remaining:manager.remaining,clock:manager.spawn_clock});
   tower.spawn=manager.spawn_clock/60;tower.lastNativeSpawn=tower.spawn;
   };
   const nativeHazardComparison=new Map(),nativePickupComparison=[0,1].map(field=>({field,comparedFrames:0,exactFrames:0,firstMismatch:null})),
    nativeRngComparison=[0,1].map(field=>({field,comparedFrames:0,exactFrames:0,firstMismatch:null})),
    nativeGlobalRngComparison={comparedFrames:0,exactFrames:0,firstMismatch:null};
   const comparePickupsWithNative=(tower,sample,side,frame)=>{
    const native=sample?.pickups?.[side],d=tower.nativePickups,stats=nativePickupComparison[side];
    if(!native||!d)return;
    const actual={clock:d.clock,bag:[...d.bag],remaining:d.remaining,crateCount:tower.crates.length,seed:d.seed};
    const expected={clock:native.spawn_clock,bag:native.bag,remaining:native.remaining,crateCount:native.items.length};
    const exact=actual.clock===expected.clock&&actual.remaining===expected.remaining&&actual.bag.length===expected.bag.length&&
     actual.bag.every((value,index)=>value===expected.bag[index])&&actual.crateCount===expected.crateCount;
    stats.comparedFrames++;if(exact)stats.exactFrames++;
    if(!exact&&!stats.firstMismatch)stats.firstMismatch={frame,expected,actual};
   };
   const compareRngWithNative=(tower,sample,side,frame)=>{
    const native=sample?.field_rng?.[side],actual=tower.nativeEnemySeed,stats=nativeRngComparison[side];
    if(!native||!Number.isInteger(actual))return;
    stats.comparedFrames++;if(actual===native.state)stats.exactFrames++;
    if(actual!==native.state&&!stats.firstMismatch)stats.firstMismatch={frame,expected:{state:native.state,stream:native.stream,selector:native.selector},actual};
   };
   const compareHazardsWithNative=(tower,sample,frame)=>{
    for(const [name,kind] of NATIVE_HAZARDS[tower.artStage]??[]){
     const native=sample?.enemies?.find(enemy=>enemy.field===tower.fieldIndex&&enemy.type===kind),d=tower[name];
     if(!native||!d)continue;
     const target={active:Boolean(native.active),life:native.life,x:native.x/scale,y:native.y/scale,
      vx:native.vx/scale,vy:native.vy/scale,animation:native.animation,variant:native.variant,
      angle:native.angle,speed:native.speed};
     const errors={x:Math.abs((d.x??0)-target.x),y:Math.abs((d.y??0)-target.y),
      vx:Math.abs((d.vx??0)-target.vx),vy:Math.abs((d.vy??0)-target.vy)};
     const exact=d.active===target.active&&d.life===target.life&&Object.entries(errors).every(([,error])=>error<=1/scale)&&
      ['animation','variant','angle','speed'].every(key=>d[key]===target[key]);
     const key=tower.fieldIndex+':'+kind;
     let stats=nativeHazardComparison.get(key);
     if(!stats){stats={field:tower.fieldIndex,type:kind,comparedFrames:0,exactFrames:0,firstMismatch:null,
      maxAbsError:{x:0,y:0,vx:0,vy:0}};nativeHazardComparison.set(key,stats);}
     stats.comparedFrames++;if(exact)stats.exactFrames++;
     for(const [field,error] of Object.entries(errors))stats.maxAbsError[field]=Math.max(stats.maxAbsError[field],error);
     if(!exact&&!stats.firstMismatch)stats.firstMismatch={frame,expected:target,actual:{active:d.active,life:d.life,
      x:d.x,y:d.y,vx:d.vx,vy:d.vy,animation:d.animation,variant:d.variant,angle:d.angle,speed:d.speed}};
    }
   };
    const restoreField=(tower,side)=>{
    tower.nativeAnimationClockOffset=capture.startAnimationClock-capture.startNativeFrame;
    const source=capture.initialFields[side],native=source.actor,manager=initial.pickup_initial[side],config=tower.p.nativeConfig;
    if(side===1)tower.nativeRivalCharacter=Object.keys(NATIVE_CHARACTER_RESOURCES).find(name=>NATIVE_CHARACTER_RESOURCES[name].root===source.resourceRoot);
    tower.nativeRescueOrigin=source.rescueOrigin;
    tower.rows=[];tower.nextOwner=1;
    const owners=Array.from({length:47},()=>Array(7).fill(0));let nextOwner=1;
    for(let y=0;y<47;y++)for(let x=0;x<7;x++)if(source.rowsBottomUp[y][x]&&!owners[y][x]){
     const color=source.rowsBottomUp[y][x],owner=nextOwner++,stack=[[x,y]];owners[y][x]=owner;
     while(stack.length){const [cx,cy]=stack.pop();for(const [nx,ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]])
      if(nx>=0&&nx<7&&ny>=0&&ny<47&&!owners[ny][nx]&&source.rowsBottomUp[ny][nx]===color){owners[ny][nx]=owner;stack.push([nx,ny]);}}
    }
    for(let y=0;y<47;y++){
     let row=null;
     for(let x=0;x<7;x++)if(source.rowsBottomUp[y][x]){
      row=tower.row(y);tower.setCell(x,y,source.rowsBottomUp[y][x],owners[y][x],0,0);
     }
     if(row)row.sealed=row.cells.every(Boolean);
    }
    if(side===1){
     const byNativeOwner=new Map();
     for(let y=0;y<47;y++)for(let x=0;x<7;x++){
      const owner=source.rowsBottomUp[y][x];if(!owner)continue;
      if(!byNativeOwner.has(owner))byNativeOwner.set(owner,[]);byNativeOwner.get(owner).push([x,y]);
     }
     for(const [owner,cells] of byNativeOwner){
      const template=capture.initialCpuPieceTemplates[String(owner)];
      if(!template)throw Error('Missing native art template for initial CPU owner '+owner);
      const minX=Math.min(...cells.map(p=>p[0])),minY=Math.min(...cells.map(p=>p[1])),maxY=Math.max(...cells.map(p=>p[1]));
      const mask=NATIVE_PIECE_MASKS[(template.rotation&3)*8+template.kind],maskMinX=Math.min(...mask.map(p=>p[0])),maskMinY=Math.min(...mask.map(p=>p[1]));
      const actualShape=cells.map(([x,y])=>String(x-minX)+','+String(maxY-y)).sort(),
       expectedShape=mask.map(([x,y])=>String(x-maskMinX)+','+String(y-maskMinY)).sort();
      if(actualShape.length!==expectedShape.length||actualShape.some((cell,i)=>cell!==expectedShape[i]))
       throw Error('Initial CPU owner '+owner+' does not match its native placement template');
       for(const [x,y] of cells)tower.rows[y].nativeArt[x]=nativeCellArt(template.kind,template.rotation,x-minX,y-minY);
      }
     }
    if(source.nativeArtwork)for(let y=0;y<47;y++)for(let x=0;x<7;x++)
     if(tower.rows[y]?.cells[x]&&source.nativeArtwork[y][x]!==null)
      tower.rows[y].nativeArt[x]=source.nativeArtwork[y][x];
    tower.nextOwner=nextOwner;tower.lines=source.completedFloorCount;tower.nativeDividerProgress=source.completedFloorCount;
    tower.water=-2;tower.nativeFrame=capture.startNativeFrame;tower.time=capture.startNativeFrame/60;
    tower.nativeEnemySeed=side===0?capture.startEnemySeed:capture.startCpuSeed;
    tower.nativePickups={seed:tower.nativeEnemySeed,bag:[...manager.bag],remaining:manager.remaining,clock:manager.spawn_clock,
     weights:config.weights,divisor:config.divisor};
    tower.spawn=manager.spawn_clock/60;tower.lastNativeSpawn=tower.spawn;
     // Native allocation prepends to the linked list; Tower stores oldest
     // first so reverse iteration updates/submits the newest pickup first.
     tower.crates=manager.items.slice().reverse().map(item=>nativePickupItem({x:item.x/scale,y:item.y/scale,vx:item.vx/scale,vy:item.vy/scale,
      state:item.state,kind:item.kind,variant:item.variant,wait:item.wait,active:true},7));
     for(const crate of tower.crates)crate.nativeSwayFrame=capture.startNativeFrame-1;
    Object.assign(tower.egg,{x:native.xQ16/scale/16+1,y:(720-native.yQ16/scale)/16,
     vy:-native.vyQ16/(RULES.actorFixedScale*RULES.projectilePixels*RULES.step),
     ground:native.vyQ16===0,offTower:false,swimming:false,waterTime:0,waterEjected:false,
     dive:0,wet:0,boost:Math.max(0,source.bootsTicks)/60,stun:0,dropTicks:0,nativeDiveMotion:false,nativeFillerMotion:false,
     introDescent:${replayIntroDescent}});
    tower.progressWorldY=Math.floor(native.yQ16/scale);
    tower.nativeActorRotation=native.variant;tower.nativeActorState=native.state;tower.nativeActorNextState=native.nextState;
    if(side===1){tower.nativeRivalAnimationPhase=native.animation.phase;tower.nativeActorPhase=native.animation.phase;
     tower.nativeRivalAnimationSelector=native.animation.selector;
     tower.nativeRivalResourcePose=nativeRivalResourcePose(tower,native.animation.frame);}
    tower.nativePreviewRotation=null;
    tower.nativePreviewPosition={...capture.initialFields[side].previewPosition};
    if(native.inventory>=0&&native.inventory<13){const held=nativePickupItem({x:0,y:0,vx:0,vy:0,state:1,kind:native.inventory,
     variant:native.variant,wait:0,active:true},7);delete held.nativeMotion;tower.held=held;}else tower.held=null;
    if(tower.held?.cells&&Number.isInteger(source.previewPosition.angle)){
     const angle=source.previewPosition.angle;
     tower.nativePreviewRotation={held:tower.held,nativeAngle:angle,
      angle:angle/RULES.nativeFullTurn*Math.PI*2,affineMatrix:nativePreviewAngleMatrix(angle)};
    }
    if(side===0&&native.vyQ16===0){
     // The checkpoint OAM was built from a grounded idle actor before the
     // first taped input. Seed that native animation state so its first
     // post-update render does not jump directly to the airborne atlas row.
     tower.nativePlayerPoseState=tower.held?'idle':'idle-free';
     tower.nativePlayerPoseTicks=0;tower.nativePlayerAnimationSelector=native.animation.selector;
     tower.nativeActorPhase=native.animation.phase;tower.nativeActorFrame=native.animation.phase>>>16;
     tower.nativeActorRandomStep=native.animation.randomStep;
     tower.nativeActorFrameHistory=Array(2).fill(tower.nativeActorFrame);
     tower.nativePlayerPoseFacing=tower.egg.facing;
    }
    const view=g.views[side],ringBase=VIEW.stageRingBasePixels[tower.artStage]??VIEW.stageRingBasePixels.factory;
    seedNativeCameraActorY(view,tower);
    view.camera=Math.max(0,(VIEW.nativeCameraReferencePixels-source.camera.positionQ16/scale)/RULES.projectilePixels);
    view.nativeCameraPosition=source.camera.positionQ16/scale;
    view.previousNativeCameraPosition=view.nativeCameraPosition;
    view.nativeCameraY=Math.floor(view.nativeCameraPosition*VIEW.nativeBg3CameraScaleQ16/65536);
    view.nativeCameraOffset=source.camera.offset;
    view.nativeCameraHoldActive=source.actor.state!==2&&(source.actor.state===4||source.actor.poseState===7||source.actor.poseState===8);
    view.boardCamera=view.camera;
    view.backgroundCamera=Math.max(0,(ringBase-source.camera.y)/(RULES.projectilePixels*VIEW.parallax));
    view.meter={position:source.meter.position,velocity:source.meter.velocity};
    view.meterPose={...nativeMeterPose(view.meter,source.meter.count,capture.startNativeFrame),...source.meter.pose};
    view.previousMeterPose={...view.meterPose};tower.incompleteFloors=source.meter.count;
    view.previousHeight=tower.egg.y;g.camera[side]=view.camera;
   };
   fields.forEach((tower,side)=>{
    restoreField(tower,side);
    if(autonomous)tower.p.hazards=true;
    // Keep native hazards visible in the input-only replay without enabling
    // their physics; the next frame's captured state replaces them directly.
    syncHazardsFromNative(tower,{enemies:capture.initialHazards.filter(enemy=>enemy.field===side)});
   });
   g.player.nativePickupParticles=capture.initialParticles;
   g.cpu.nativePickupParticles=g.player.nativePickupParticles;
   // The actor idle handler consumes the shared global RNG. The replay starts
   // from a mid-game RAM checkpoint, so the app's startup seed is unrelated to
   // the captured run; restore the exact native state before the first replay
   // update to keep idle animation phase and all later global draws aligned.
   g.nativeActorRandomSeed=capture.startGlobalRandomSeed;
   g.nativeBg3Vofs=nativeBg3ScrollOffset(capture.startBg3Vofs);
   const controller=capture.initialCpuControllerWords,controllerValue=offset=>controller[offset>>>2]??0;
   g.aiDifficulty=controllerValue(0xf0);
   Object.assign(g.aiTiming,{clock:controllerValue(0xc8),counterCC:controllerValue(0xcc),counterD0:controllerValue(0xd0),
    period:controllerValue(0x100),stall:controllerValue(0x104)});
   Object.assign(g.aiRotation,{wait:controllerValue(0xb4)});g.aiRotationTarget=controllerValue(0xb8)&3;
   Object.assign(g.aiPlacement,{wait:controllerValue(0xfc)});g.aiPreviousKeys=controllerValue(0xe8);
   Object.assign(g.aiTravel,{targetColumn:controllerValue(0),waypoint:controllerValue(4),state:controllerValue(8),
    labels:Array.from({length:7},(_,index)=>controllerValue(0xc+index*4)),
    parents:Array.from({length:7},(_,index)=>controllerValue(0x28+index*4)),
    counterD4:controllerValue(0xd4),groundRow:controllerValue(0xe4),idleTarget:controllerValue(0xf4)});
   g.aiTool={targetColumn:controllerValue(0),panicTimer:controllerValue(0xf8)};
   if(g.cpu.held?.cells&&Number.isInteger(g.cpu.held.nativeKind)&&g.cpu.held.nativeKind<=7){
    const {NativePieceSweep}=await import('./games/eggo-mania/native-cpu.js'),search=new NativePieceSweep();
    Object.assign(search,{state:controllerValue(8),targetColumn:controllerValue(0),bestRotation:controllerValue(0xb8),
     anchorX:controllerValue(0xc0),anchorY:controllerValue(0xc4),clock:controllerValue(0xc8),bestScore:controllerValue(0xd8),
     rotation:controllerValue(0xdc),column:controllerValue(0xe0)});
    search.best=search.bestScore>-9999?{score:search.bestScore,column:search.targetColumn,rotation:search.bestRotation,
     anchorX:search.anchorX,anchorY:search.anchorY,valid:search.bestScore>0}:null;
    g.aiSearch=search;g.aiHeld=g.cpu.held;
    if(search.state!==2)g.aiPlan=null;
   }
   g.aiPendingControl=controlsFromGba(capture.initialCpuKeys);
   g.nativePlayerPrimed=true;
   const {waitForPixelAssets,pixelAssetStatus}=await import('./games/eggo-mania/pixel-renderer.js');await waitForPixelAssets();
   const updateTower=g.updateTower.bind(g);let cpuActorAppliedKeys=0;
   g.updateTower=(tower,...args)=>{if(tower===g.cpu)cpuActorAppliedKeys=controlsToGba(args[1]);return updateTower(tower,...args);};
   const ringBase=VIEW.stageRingBasePixels.factory;
   g.render();const initialPng=g.pixelCanvas.toDataURL('image/png').split(',')[1];
   const keys=[];for(const [count,value] of capture.steps)for(let i=0;i<count;i++)keys.push(value);
   if(keys.length!==capture.trace.length)throw Error('Input tape and native trace frame counts differ');
   const boardByFrame=new Map(capture.boardEvents.map(event=>[event.frame,event]));
    const samples=[],actorSeries=[[],[]],cameraSeries=[[],[]],firstBoardMismatch=[null,null],maxErrorX=[0,0],maxErrorY=[0,0],cpuKeyCurrentMismatches=[],cpuKeyAdjacentMismatches=[],cpuActorInputCurrentMismatches=[],cpuActorInputAdjacentMismatches=[],cpuDecisionStates=[];let previous=new Set(),cpuKeyCurrentMatches=0,cpuKeyCurrentCompared=0,cpuKeyAdjacentMatches=0,cpuKeyAdjacentCompared=0,cpuActorInputCurrentMatches=0,cpuActorInputCurrentCompared=0,cpuActorInputAdjacentMatches=0,cpuActorInputAdjacentCompared=0,frame219RenderState=null,frame219Png=null;
     const appFrameColumns=10,appFrameSheet=${inputReplayCaptureFrames?'document.createElement("canvas")':'null'};
    if(appFrameSheet){appFrameSheet.width=appFrameColumns*240;appFrameSheet.height=Math.ceil(keys.length/appFrameColumns)*160;}
    const appFrameSheetContext=appFrameSheet?.getContext('2d')??null;
   for(let frame=1;frame<=keys.length;frame++){
    const held=new Set(keys[frame-1]?keys[frame-1].split('+'):[]),expected=capture.trace[frame-1];
     const control={move:Number(held.has('RIGHT'))-Number(held.has('LEFT')),jump:held.has('UP'),float:held.has('UP'),
      fast:held.has('DOWN'),dive:held.has('L'),discard:held.has('R'),use:held.has('A')&&!previous.has('A'),rotate:held.has('B')&&!previous.has('B')?1:0};
     if(!autonomous&&frame>1)syncHazardsFromNative(g.player,capture.enemyTrace[frame-2]);
     g.updateTower(g.player,1/60,{nativeMotion:true,...control},g.cpu);
     if(!autonomous&&frame>1)syncCpuHazardsFromNative(capture.enemyTrace[frame-2]);
     cpuActorAppliedKeys=0;g.updateCPU(1/60);const cpuAppliedKeys=cpuActorAppliedKeys;
     const globalExpected=capture.rngTrace[frame-1]?.arena?.rng;
     if(Number.isInteger(globalExpected)){
      nativeGlobalRngComparison.comparedFrames++;
      if(g.nativeActorRandomSeed===globalExpected)nativeGlobalRngComparison.exactFrames++;
      else nativeGlobalRngComparison.firstMismatch??={frame,expected:globalExpected,actual:g.nativeActorRandomSeed};
     }
     fields.forEach((tower,side)=>{
      if(autonomous)compareHazardsWithNative(tower,capture.enemyTrace[frame-1],frame);
      else{
       syncHazardsFromNative(tower,capture.enemyTrace[frame-1]);
       syncPickupsFromNative(tower,expected,side,frame===1?initial.pickup_initial[side]:capture.trace[frame-2]?.pickups?.[side]);
      }
      if(autonomous)comparePickupsWithNative(tower,expected,side,frame);
      if(autonomous)compareRngWithNative(tower,capture.rngTrace[frame-1],side,frame);
     });
    const cpuEmittedKeys=controlsToGba(g.lastModelControl);
    const nativeCurrentCpuKeys=expected.cpu?.keys,nativeNextCpuKeys=capture.trace[frame]?.cpu?.keys;
    if(frame<=8||(frame>=38&&frame<=50)||(frame>=250&&frame<=265)){
     const words=capture.trace[frame]?.cpu?.words??[],word=offset=>words[offset>>>2]??null,search=g.aiSearch??{};
     cpuDecisionStates.push({frame,nativeCurrentKeys:nativeCurrentCpuKeys,nativeNextKeys:nativeNextCpuKeys,appEmittedKeys:cpuEmittedKeys,appAppliedKeys:cpuAppliedKeys,
      nativeController:{targetColumn:word(0),waypoint:word(4),state:word(8),rotationWait:word(0xb4),targetRotation:word(0xb8)&3,
       anchorX:word(0xc0),anchorY:word(0xc4),clock:word(0xc8),counterCC:word(0xcc),counterD0:word(0xd0),counterD4:word(0xd4),
       bestScore:word(0xd8),rotation:word(0xdc),column:word(0xe0),groundRow:word(0xe4),previousKeys:word(0xe8),
       placementWait:word(0xfc),period:word(0x100),stall:word(0x104)},
      appController:{targetColumn:g.aiTravel?.targetColumn??null,waypoint:g.aiTravel?.waypoint??null,state:g.aiTravel?.state??null,
       rotationWait:g.aiRotation?.wait??null,targetRotation:g.aiRotationTarget??null,anchorX:search.anchorX??null,anchorY:search.anchorY??null,
       clock:g.aiTiming?.clock??null,counterCC:g.aiTiming?.counterCC??null,counterD0:g.aiTiming?.counterD0??null,
       counterD4:g.aiTravel?.counterD4??null,bestScore:search.bestScore??null,rotation:search.rotation??null,column:search.column??null,
       groundRow:g.aiTravel?.groundRow??null,previousKeys:g.aiPreviousKeys??null,placementWait:g.aiPlacement?.wait??null,
       period:g.aiTiming?.period??null,stall:g.aiTiming?.stall??null,plan:g.aiPlan?{...g.aiPlan}:null}});
    }
    if(Number.isInteger(nativeCurrentCpuKeys)){
     cpuKeyCurrentCompared++;
     if(cpuEmittedKeys===nativeCurrentCpuKeys)cpuKeyCurrentMatches++;else if(cpuKeyCurrentMismatches.length<24)
      cpuKeyCurrentMismatches.push({frame,nativeKeys:nativeCurrentCpuKeys,appKeys:cpuEmittedKeys,appliedKeys:cpuAppliedKeys});
    }
    // The adjacent-frame comparison below is only a command-transition diagnostic:
    // this app output is emitted and applied during this frame, so it is not a
    // prediction of the native command for the following frame.
    if(Number.isInteger(nativeNextCpuKeys)){
     cpuKeyAdjacentCompared++;
     if(cpuEmittedKeys===nativeNextCpuKeys)cpuKeyAdjacentMatches++;else if(cpuKeyAdjacentMismatches.length<24)
      cpuKeyAdjacentMismatches.push({frame,nativeFrame:frame+1,nativeKeys:nativeNextCpuKeys,appKeys:cpuEmittedKeys,appliedKeys:cpuAppliedKeys});
    }
    if(Number.isInteger(nativeCurrentCpuKeys)){
     cpuActorInputCurrentCompared++;
     if(cpuAppliedKeys===nativeCurrentCpuKeys)cpuActorInputCurrentMatches++;else if(cpuActorInputCurrentMismatches.length<24)
      cpuActorInputCurrentMismatches.push({frame,nativeKeys:nativeCurrentCpuKeys,appAppliedKeys:cpuAppliedKeys,appEmittedKeys:cpuEmittedKeys});
    }
    if(Number.isInteger(nativeNextCpuKeys)){
     cpuActorInputAdjacentCompared++;
     if(cpuAppliedKeys===nativeNextCpuKeys)cpuActorInputAdjacentMatches++;else if(cpuActorInputAdjacentMismatches.length<24)
      cpuActorInputAdjacentMismatches.push({frame,nativeFrame:frame+1,nativeKeys:nativeNextCpuKeys,appAppliedKeys:cpuAppliedKeys,appEmittedKeys:cpuEmittedKeys});
    }
    g.nativeBg3Vofs=nativeBg3ScrollOffset(g.views[1].nativeCameraY);
    for(const [side,tower] of [g.player,g.cpu].entries()){
     const nativeActor=expected.native_actor_motion[side===0?'player':'cpu'];
     const worldX=(tower.egg.x-1)*16,worldY=720-tower.egg.y*16,nativeX=nativeActor.x_q16/65536,nativeY=nativeActor.y_q16/65536,
      errorX=worldX-nativeX,errorY=worldY-nativeY;
     maxErrorX[side]=Math.max(maxErrorX[side],Math.abs(errorX));maxErrorY[side]=Math.max(maxErrorY[side],Math.abs(errorY));
     actorSeries[side].push({frame,keys:side===0?expected.keys:cpuAppliedKeys,cpuEmittedKeys:side===1?cpuEmittedKeys:undefined,worldX,worldY,nativeX,nativeY,errorX,errorY,
     vy:tower.egg.vy,ground:tower.egg.ground,held:tower.held?.nativeKind??null,heldVariant:tower.held?.nativeVariant??null,
      offTower:tower.egg.offTower,swimming:tower.egg.swimming,dive:tower.egg.dive,dropTicks:tower.egg.dropTicks,
      placing:tower.placing?{targetX:tower.placing.targetX,targetY:tower.placing.targetY,eggX:tower.placing.eggX,eggY:tower.placing.eggY,
       ticks:tower.placing.ticks,nativeKind:tower.placing.nativeHeld?.nativeKind??null,nativeRotation:tower.placing.nativeRotation,
       previewX:tower.placing.x,previewY:tower.placing.y}:null});
     const nativeField=side===0?'player':'cpu',nativeCamera=expected.native_cameras[nativeField],
      nativeFollow=expected.camera_follow_state?.[nativeField],nativeVofs=expected.native_bg_offsets?.bg3?.vofs??null,
      nativeRingY=nativeVofs===null?null:nativeCamera.camera_y+(((nativeVofs-nativeCamera.camera_y)%256)+256)%256,view=g.views[side];
     advanceView(view,tower,1/60);g.camera[side]=view.camera;
     const appMotionPose=actorPose(tower),appSpritePose=side===1?rivalPose(tower,tower.artStage):appMotionPose;
     const previewState=nativePreviewRenderState(tower),previewOrigin=nativePreviewGridOrigin(previewState.preview,previewState.visual);
     cameraSeries[side].push({frame,appCamera:view.camera,appBoardCamera:view.boardCamera,appBackgroundCamera:view.backgroundCamera,
      appNativeCameraPosition:view.nativeCameraPosition,appNativeCameraOffset:view.nativeCameraOffset,
      appNativeCameraHold:view.nativeCameraHoldActive,appActorPoseRow:tower.actorVisualPose?.row??null,
      appActorPoseState:tower.actorVisualPose?.state??null,appHeld:tower.held?.nativeKind??null,
      appSpritePoseRow:appSpritePose?.row??null,appSpritePoseFrame:appSpritePose?.frame??null,
      appSpritePoseResourceSheet:appSpritePose?.resource?.sheet??null,
      appSpritePoseResourceRow:appSpritePose?.resource?.row??null,
      appSpritePoseResourceColumn:appSpritePose?.resource?.column??null,
      appMotionPoseRow:appMotionPose?.row??null,appMotionPoseFrame:appMotionPose?.frame??null,
      appNativePlayerPoseState:tower.nativePlayerPoseState??null,
      appNativePlayerPoseTicks:tower.nativePlayerPoseTicks??null,
      appNativePlayerPoseDelay:tower.nativePlayerPoseDelay??null,
      appNativePlayerAirTicks:tower.nativePlayerAirTicks??null,
      appNativePlayerPostThrowPoseTicks:tower.nativePlayerPostThrowPoseTicks??null,
      appNativePlayerAnimationSelector:tower.nativePlayerAnimationSelector??null,
      appNativePlayerAnimationClock:tower.nativeRenderFrame?.animationClock??null,
      appNativeWaterCreature:tower.nativeWaterCreature?{...tower.nativeWaterCreature}:null,
      appNativeWaterCreatureRender:tower.nativeWaterCreatureRender?{...tower.nativeWaterCreatureRender}:null,
      appNativeRivalPoseState:tower.nativeRivalPoseState??null,
      appNativeRivalPoseKey:tower.nativeRivalPose?.key??null,
      appNativeRivalPose:tower.nativeRivalPose?{state:tower.nativeRivalPose.state,key:tower.nativeRivalPose.key,
       row:tower.nativeRivalPose.row,frame:tower.nativeRivalPose.frame}:null,
      appNativeRivalPoseHoldActive:Boolean(tower.nativeRivalPoseHoldActive),
      appNativeRivalPoseHoldRemaining:tower.nativeRivalPoseHoldRemaining??0,
      appNativeRivalPoseHoldPose:tower.nativeRivalPoseHoldPose?{...tower.nativeRivalPoseHoldPose}:null,
      appNativeRivalPoseTicks:tower.nativeRivalPoseTicks??null,
      appNativeActorAnimationPhase:tower.nativeActorPhase??null,
      appNativeActorAnimationFrame:tower.nativeActorFrame??null,
      appNativeActorAnimationFrameHistory:Array.isArray(tower.nativeActorFrameHistory)?[...tower.nativeActorFrameHistory]:null,
      appNativeRivalAnimationPhase:tower.nativeRivalAnimationPhase??null,
      appNativeRivalAnimationSelector:tower.nativeRivalAnimationSelector??null,
      appNativeActorAnimationSelector:tower.nativeActorAnimationSelector??null,
      appNativeActorRandomActive:Boolean(tower.nativeActorRandomActive),
      appNativeRivalPostThrowTicks:tower.nativeRivalPostThrowPoseTicks??null,
      appNativeRivalPostThrowActive:Boolean(tower.nativeRivalPostThrowPoseActive),
      appPreview:previewState.preview?{x:previewState.preview.x,y:previewState.preview.y,
       nativeKind:previewState.preview.nativeKind,nativeRotation:previewState.preview.nativeRotation,
       origin:previewOrigin,visual:previewState.visual?{spriteGridX:previewState.visual.spriteGridX,
        spriteGridY:previewState.visual.spriteGridY,targetSpriteGridY:previewState.visual.targetSpriteGridY,
        matrix:previewState.visual.affineMatrix,turn:previewState.visual.turn}:null}:null,
      appGlobalRandomSeed:g.nativeActorRandomSeed??null,
      appActorState:tower.nativeActorState??0,appActorNextState:tower.nativeActorNextState??0,
      appTowerFlash:tower.flash,appWater:tower.water,
      appPlacing:Boolean(tower.placing),appActorVy:tower.egg.vy,appActorGround:tower.egg.ground,
      appEggX:tower.egg.x,appEggFacing:tower.egg.facing,
      appCrates:frame===600?tower.crates.map(item=>({x:item.x,y:item.y,nativeKind:item.nativeKind??null,
       nativeVariant:item.nativeVariant??null,item:item.item??null,age:item.age??null,angle:item.angle??null})):undefined,
      appPlacingTicks:tower.placing?.ticks??null,
      appActorWalking:Boolean(tower.egg.walking),appActorOffTower:Boolean(tower.egg.offTower),
      appActorSwimming:Boolean(tower.egg.swimming),appActorDive:tower.egg.dive,
      nativeFollowCameraPosition:Number.isFinite(nativeCamera.camera_position_q16)?
       Math.floor(nativeCamera.camera_position_q16/65536):(nativeFollow?.camera_position??null),
      nativeFollowCameraOffset:nativeFollow?.field_camera_offset_eb8??null,
      nativeAnimationSelector:nativeFollow?.actor_state_854??null,
      nativeActionState:nativeFollow?.actor_state_874??null,
      appRingScroll:nativeStageRingScroll(view.nativeBoardCameraY,side===1?g.nativeBg3Vofs:view.nativeBoardCameraY),
      appBg3Vofs:g.nativeBg3Vofs,
      nativeCameraY:nativeCamera.camera_y,nativeBg3Vofs:nativeVofs,
      nativeEffectiveBg3Vofs:nativeBg3ScrollOffset(nativeVofs),
      nativeBg3Control:expected.native_bg3_control??null,
      nativeVisibleRingY:nativeRingY,actorY:tower.egg.y,throwing:view.throwing,postThrow:view.postThrow});
    }
    if(frame===219)frame219RenderState=fields.map((tower,side)=>({field:side?'cpu':'player',stage:tower.artStage,
     placedFactoryAsset:pixelAssetStatus('placed-factory'),nativeFrame:tower.nativeFrame,
     camera:g.camera[side],boardCamera:g.views[side].boardCamera,backgroundCamera:g.views[side].backgroundCamera,water:tower.water,
     placedCells:tower.rows.flatMap((row,y)=>row?row.cells.flatMap((value,x)=>value?[{x,y,value,owner:row.owners?.[x]??0,
      nativeArt:row.nativeArt?.[x]??0,material:row.materials?.[x]??0}]:[]):[])}));
    if(frame===${JSON.stringify(pixelWriteProbe?.[0]??-1)}){
     const proto=CanvasRenderingContext2D.prototype,original=proto.drawImage,writes=[];
     const probeRect=${JSON.stringify(pixelWriteProbe?.slice(1)??[138,0,6,3])};
     proto.drawImage=function(...args){
      const tracked=this.canvas===g.pixelCanvas,before=tracked?Array.from(this.getImageData(...probeRect).data):null;
      const result=original.apply(this,args);
      if(tracked){const after=Array.from(this.getImageData(...probeRect).data);
       if(after.some((v,i)=>v!==before[i]))writes.push({image:args[0]?.src??'canvas',args:args.slice(1),before,after});}
      return result;
     };
     try{g.render();window.eggoPixelWrites=writes;
      window.eggoPixelState=fields.map((tower,side)=>({side,water:tower.water,
       previousWater:tower.previousWater,previousPreviousWater:tower.previousPreviousWater,
       view:{...g.views[side]},renderCrates:tower.nativeRenderCrates?.map(item=>({
        nativeKind:item.nativeKind,nativeVariant:item.nativeVariant,nativeMotion:{...item.nativeMotion}}))}));
     }finally{proto.drawImage=original;}
    }
    if(frame===219){g.render();frame219Png=g.pixelCanvas.toDataURL('image/png').split(',')[1];}
    const nativeBoard=boardByFrame.get(frame);
    if(nativeBoard){const boardSummary=[];
     for(const [side,tower] of [g.player,g.cpu].entries()){
      const nativeRows=nativeBoard.rows_bottom_up[side];let appCells=0,nativeCells=0,different=0;const differentCells=[];
      for(let y=0;y<47;y++)for(let x=0;x<7;x++){
       const a=Number(Boolean(tower.rows[y]?.cells[x])),b=Number(Boolean(nativeRows[y][x]));appCells+=a;nativeCells+=b;
       if(a!==b){different++;if(differentCells.length<12)differentCells.push({x,y,app:a,native:b});}
      }
      if(different&&!firstBoardMismatch[side])firstBoardMismatch[side]={frame,keys:side===0?expected.keys:expected.cpu.keys,different,appCells,nativeCells,differentCells};
      boardSummary.push({different,appCells,nativeCells});
     }
     if([1,47,110,191,231,384,471,600].includes(frame))samples.push({frame,keys:expected.keys,cpuKeys:cpuAppliedKeys,cpuEmittedKeys,
      actor:actorSeries.map(series=>series.at(-1)),board:boardSummary,held:[g.player.held?.nativeKind??null,g.cpu.held?.nativeKind??null],
      placing:[Boolean(g.player.placing),Boolean(g.cpu.placing)],lost:[g.player.lost,g.cpu.lost]});
    }
     g.bg3GlobalFrame++;g.elapsed+=1/60;
     if(appFrameSheetContext){
      g.render();appFrameSheetContext.drawImage(g.pixelCanvas,((frame-1)%appFrameColumns)*240,Math.floor((frame-1)/appFrameColumns)*160);
     }
    previous=held;
   }
   const actorMismatchWindow=actorSeries.map(series=>{const first=series.findIndex(sample=>Math.abs(sample.errorX)>0.02||Math.abs(sample.errorY)>0.02);return first<0?[]:series.slice(Math.max(0,first-3),first+5);});
   const lastNativeBoard=capture.boardEvents.at(-1)?.rows_bottom_up??[[],[]];
   const nativeFinalCells=lastNativeBoard.map(rows=>rows.flat().filter(Boolean).length);
   const compareScreen=async(referenceBase64,appBase64)=>{const image=new Image(),appImage=new Image();image.src='data:image/png;base64,'+referenceBase64;appImage.src='data:image/png;base64,'+appBase64;await Promise.all([image.decode(),appImage.decode()]);
    const source=document.createElement('canvas'),actual=document.createElement('canvas');source.width=actual.width=240;source.height=actual.height=160;
    const sc=source.getContext('2d'),ac=actual.getContext('2d');sc.drawImage(image,0,0);ac.drawImage(appImage,0,0);
    const a=sc.getImageData(0,0,240,160).data,b=ac.getImageData(0,0,240,160).data,
     diff=document.createElement('canvas');diff.width=240;diff.height=160;const dc=diff.getContext('2d'),out=dc.createImageData(240,160);
    const regions={player:0,divider:0,cpu:0};let differentPixels=0,minX=240,minY=160,maxX=-1,maxY=-1;
    for(let y=0;y<160;y++)for(let x=0;x<240;x++){const p=(y*240+x)*4,different=a[p]!==b[p]||a[p+1]!==b[p+1]||a[p+2]!==b[p+2];
     if(different){differentPixels++;regions[x<112?'player':x<128?'divider':'cpu']++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      out.data[p]=255;out.data[p+1]=0;out.data[p+2]=255;out.data[p+3]=255;
     }else{out.data[p]=a[p];out.data[p+1]=a[p+1];out.data[p+2]=a[p+2];out.data[p+3]=255;}}
    dc.putImageData(out,0,0);return{differentPixels,regions,bounds:maxX<0?null:{minX,minY,maxX,maxY},diffPng:diff.toDataURL('image/png').split(',')[1]};
   };
   const initialComparison=await compareScreen(capture.initialNativeScreenshotBase64,initialPng);
   g.render();const appPng=g.pixelCanvas.toDataURL('image/png').split(',')[1];
   const cameraPositionComparison=cameraSeries.map(series=>{const errors=series
    .filter(sample=>Number.isFinite(sample.nativeFollowCameraPosition))
    .map(sample=>Math.abs(sample.appNativeCameraPosition-sample.nativeFollowCameraPosition));
    return{compared:errors.length,exact:errors.filter(error=>error===0).length,
     maxAbsoluteError:Math.max(0,...errors),meanAbsoluteError:errors.length?
      Number((errors.reduce((sum,error)=>sum+error,0)/errors.length).toFixed(3)):null};});
   const finalNativeCamera=capture.trace.at(-1).native_cameras.player;
   const lastNativeTrace=capture.trace.at(-1),nativeBg3VofsRaw=lastNativeTrace.native_bg_offsets?.bg3?.vofs??0,
    nativeBg3Vofs=nativeBg3ScrollOffset(nativeBg3VofsRaw),
    finalVisibleRingY=nativeStageRingScroll(finalNativeCamera.camera_y,nativeBg3Vofs);
   const bg3OffsetSamples=cameraSeries[1].map(sample=>({frame:sample.frame,app:sample.appBg3Vofs,native:sample.nativeEffectiveBg3Vofs,control:sample.nativeBg3Control})),
    bg3OffsetMatches=bg3OffsetSamples.filter(sample=>sample.app===sample.native).length,
    firstBg3OffsetMismatch=bg3OffsetSamples.find(sample=>sample.app!==sample.native)??null;
   const bg3OffsetByControl={};for(const sample of bg3OffsetSamples){const key='0x'+Number(sample.control??0).toString(16).padStart(4,'0');
    const group=bg3OffsetByControl[key]??(bg3OffsetByControl[key]={compared:0,matches:0});group.compared++;if(sample.app===sample.native)group.matches++;}
   const finalComparison=await compareScreen(capture.finalNativeScreenshotBase64,appPng);
   return{pixelWriteProbe:window.eggoPixelWrites??null,pixelProbeState:window.eggoPixelState??null,initialPng,appPng,frame219Png,appFrameSheetPng:appFrameSheet?.toDataURL('image/png').split(',')[1]??null,
    initialComparison,finalComparison,cameraPositionComparison,renderState:{cameras:g.camera,views:g.views.map(v=>({camera:v.camera,boardCamera:v.boardCamera,backgroundCamera:v.backgroundCamera})),
    pixelAssets:{factoryRival:pixelAssetStatus('factory-rival-poses'),yolkoPlayer:pixelAssetStatus('yolko-player-poses'),yolkoFallback:pixelAssetStatus('yolko-poses')},
    nativeFrame:g.player.nativeFrame,bg3GlobalFrame:g.bg3GlobalFrame},cameraSeries,cameraSummary:{initial:capture.trace[0].native_cameras,final:lastNativeTrace.native_cameras,
     initialVofs:capture.startBg3Vofs,initialPlayerCameraPositionQ16:capture.startPlayerCameraPositionQ16,
     initialCpuCameraPositionQ16:capture.startCpuCameraPositionQ16,
     initialPlayerCameraPixels:VIEW.nativeCameraReferencePixels-capture.startPlayerCameraPositionQ16/65536,
     initialCpuCameraPixels:VIEW.nativeCameraReferencePixels-capture.startCpuCameraPositionQ16/65536,
     initialPlayerCameraY:capture.startPlayerCameraY,initialCpuCameraY:capture.startCpuCameraY,
     finalVofs:nativeBg3VofsRaw,finalEffectiveVofs:nativeBg3Vofs,finalPlayerCameraY:finalNativeCamera.camera_y,finalVisibleRingY,
     bg3OffsetComparison:{compared:bg3OffsetSamples.length,matches:bg3OffsetMatches,firstMismatch:firstBg3OffsetMismatch,byBg3Control:bg3OffsetByControl},
     appNativeCameraMapping:'Both fields retain the pre-update native camera_y. Its high page selects the streamed source ring, and the low byte uses the per-field hardware offset. Alternate HBlank phases are reported separately.'},
    nativeHazardComparison:[...nativeHazardComparison.values()],nativePickupComparison,nativeRngComparison,nativeGlobalRngComparison,frame219RenderState,
    replayCoverage:{kind:autonomous?'autonomous replay from a partially restored checkpoint; native traces are comparison-only':'diagnostic partial-state replay, not a matched native-state replay',nativeCheckpointFrame:capture.startNativeFrame,frames:keys.length,inputSource:capture.inputSource,
      restored:['player inputs and actor state','approximate board occupancy grouped by adjacent equal-valued cells','pickup manager and pickup motion','CPU timing/travel/search controller words and initial CPU key mask','initial foreground camera position from native RAM and background camera from native camera_y','both 16.16 meter positions and velocities plus the initial OAM pointer/bar pose','BG3 phase counter initialized to native match frame counter minus one, matching the ROM stream queue phase'],
     synchronizedDuringReplay:autonomous?[]:['native CPU initial per-cell artwork recovered from the placement templates','CPU-field enemy/hazard state copied from the native trace before each CPU decision','both fields: enemy/hazard and pickup render state copied from matching native trace samples after each update'],
     notRestored:['all transient OAM/VRAM descriptors in the initial checkpoint image','native internal state outside the reconstructed model'],
     cpuKeys:'the app CPU policy runs from restored controller words; its emitted masks are recorded for comparison',
     frameScreenshotsCaptured:${inputReplayCaptureFrames},initialCheckpointImageFullyRestored:false,fullGameParityEstablished:false},
    frames:keys.length,maxErrorX,maxErrorY,firstActorMismatch:actorMismatchWindow,final:[g.player,g.cpu].map(tower=>({worldX:(tower.egg.x-1)*16,worldY:720-tower.egg.y*16,
     held:tower.held?.nativeKind??null,placedCells:tower.rows.reduce((sum,row)=>sum+(row?.cells.filter(Boolean).length||0),0),lost:tower.lost,won:tower.won,nativeFrame:tower.nativeFrame})),
    nativeFinalCells,firstBoardMismatch,cpuKeyComparisons:{currentFrame:{compared:cpuKeyCurrentCompared,matches:cpuKeyCurrentMatches,mismatches:cpuKeyCurrentMismatches},
     adjacentFrameTransitionDiagnostic:{compared:cpuKeyAdjacentCompared,matches:cpuKeyAdjacentMatches,mismatches:cpuKeyAdjacentMismatches},
     note:'currentFrame compares emitted masks with the matching native frame. adjacentFrameTransitionDiagnostic compares the frame-n app mask with native frame n+1; it measures natural input transitions and is not a prediction or parity check.'},
    cpuActorInputComparisons:{currentFrame:{compared:cpuActorInputCurrentCompared,matches:cpuActorInputCurrentMatches,mismatches:cpuActorInputCurrentMismatches},
     adjacentFrameTransitionDiagnostic:{compared:cpuActorInputAdjacentCompared,matches:cpuActorInputAdjacentMatches,mismatches:cpuActorInputAdjacentMismatches}},cpuDecisionStates,samples};
  })()`);
  const {initialPng,appPng,frame219Png,appFrameSheetPng,initialComparison,finalComparison,...summary}=report;
  summary.initialComparison={...initialComparison,diffPng:'input-replay-initial-diff.png'};
  summary.finalComparison={...finalComparison,diffPng:'input-replay-final-diff.png'};
  await writeFile(path.join(artifacts,'input-replay-report.json'),JSON.stringify(summary,null,2));
  await writeFile(path.join(artifacts,'input-replay-initial-app.png'),Buffer.from(initialPng,'base64'));
  await writeFile(path.join(artifacts,'input-replay-initial-diff.png'),Buffer.from(initialComparison.diffPng,'base64'));
  await writeFile(path.join(artifacts,'input-replay-native-start.png'),replayData.initialNativeScreenshot);
  await writeFile(path.join(artifacts,'input-replay-final-app.png'),Buffer.from(appPng,'base64'));
  await writeFile(path.join(artifacts,'input-replay-final-diff.png'),Buffer.from(finalComparison.diffPng,'base64'));
  await writeFile(path.join(artifacts,'input-replay-native.png'),replayData.finalNativeScreenshot);
  if(frame219Png)await writeFile(path.join(artifacts,'input-replay-frame219-app.png'),Buffer.from(frame219Png,'base64'));
  if(appFrameSheetPng)await writeFile(path.join(artifacts,'input-replay-app-frames.png'),Buffer.from(appFrameSheetPng,'base64'));
  console.log('ROM two-field input replay:',{frames:summary.frames,maxErrorX:summary.maxErrorX,maxErrorY:summary.maxErrorY,
   firstActorMismatch:summary.firstActorMismatch.map(w=>w[3]||null),nativeFinalCells:summary.nativeFinalCells,firstBoardMismatch:summary.firstBoardMismatch,
   initialPixels:summary.initialComparison.differentPixels,finalPixels:summary.finalComparison.differentPixels,
   cpuKeyComparisons:{currentFrame:`${summary.cpuKeyComparisons.currentFrame.matches}/${summary.cpuKeyComparisons.currentFrame.compared}`,
    adjacentFrameTransitionDiagnostic:`${summary.cpuKeyComparisons.adjacentFrameTransitionDiagnostic.matches}/${summary.cpuKeyComparisons.adjacentFrameTransitionDiagnostic.compared}`},
   cpuActorInputComparisons:{currentFrame:`${summary.cpuActorInputComparisons.currentFrame.matches}/${summary.cpuActorInputComparisons.currentFrame.compared}`,
    adjacentFrameTransitionDiagnostic:`${summary.cpuActorInputComparisons.adjacentFrameTransitionDiagnostic.matches}/${summary.cpuActorInputComparisons.adjacentFrameTransitionDiagnostic.compared}`},
   cameraPositionComparison:summary.cameraPositionComparison,nativeHazardComparison:summary.nativeHazardComparison.map(({field,type,comparedFrames,exactFrames,firstMismatch,maxAbsError})=>({field,type,comparedFrames,exactFrames,firstMismatch,maxAbsError})),nativePickupComparison:summary.nativePickupComparison,nativeRngComparison:summary.nativeRngComparison,
   cameraSummary:summary.cameraSummary,renderState:summary.renderState});
  if(!inputReplayAutonomous&&(summary.frames!==replayData.nativeTrace.length||summary.maxErrorX.some(error=>error>0.02)||summary.maxErrorY.some(error=>error>0.02)||
    summary.firstBoardMismatch.some(Boolean)||summary.cpuKeyComparisons.currentFrame.matches!==summary.cpuKeyComparisons.currentFrame.compared||
    summary.cpuActorInputComparisons.currentFrame.matches!==summary.cpuActorInputComparisons.currentFrame.compared))
   throw Error('ROM input replay behavioral parity regressed: '+JSON.stringify({frames:summary.frames,maxErrorX:summary.maxErrorX,
    maxErrorY:summary.maxErrorY,firstBoardMismatch:summary.firstBoardMismatch,cpuKeyComparisons:summary.cpuKeyComparisons.currentFrame,
    cpuActorInputComparisons:summary.cpuActorInputComparisons.currentFrame}));
  client.close();client=null;child.kill();
  process.exit(0);
 }
 const sound=await client.evaluate(`(async()=>{const {SOUND}=await import('./games/eggo-mania/audio.js');const a=window.app.currentGame.audio;const b=await a.loadSound(SOUND.jump.id,SOUND.jump.url);if(b.numberOfChannels!==2||b.duration<.4||b.duration>.5)throw Error('Native stereo jump did not decode');if(!a.playSound(SOUND.jump.id,{volume:SOUND.jump.volume}))throw Error('Native jump could not play');return {channels:b.numberOfChannels,duration:b.duration,decodedSampleRate:b.sampleRate};})()`);
 await writeFile(path.join(artifacts,'audio-check.json'),JSON.stringify(sound,null,2));
 // Exercise real DOM key events through the app's input manager.
 console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.player.crates=[{x:g.player.egg.x,y:1,cells:[[0,0],[1,0],[2,0],[3,0]],color:2}];g.update(1/60);if(!g.player.held)throw Error('Crate was not caught');window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));g.input.update();g.update(1/60);window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));g.input.update();for(let n=0;n<30;n++){g.input.update();g.update(1/60);}if(g.player.score!==20)throw Error('Space did not place held piece');g.startRound({intro:false});return 'Keyboard placement passed';})()`));
 if(musicOnly){
  const music=await client.evaluate(`(async()=>{const g=window.app.currentGame;await g.music.start('factory');const buffer=g.audio._soundBuffers.get(g.music.id);if(!g.music.handle||!buffer||buffer.numberOfChannels!==2||buffer.duration<111||buffer.duration>112)throw Error('Native factory music failed to decode/play');await new Promise(r=>setTimeout(r,120));const playing=g.music.handle.position();if(playing<=0)throw Error('Music clock did not advance');g.onPause();const paused=g.music.offset;await new Promise(r=>setTimeout(r,120));if(g.music.handle||g.music.offset!==paused)throw Error('Music continued during pause');g.onResume();if(!g.music.handle||g.music.handle.position()<paused)throw Error('Music resumed at the wrong position');const resumed=g.music.handle.position();g.destroy();if(g.music.id||g.music.handle)throw Error('Music survived game destruction');return {channels:buffer.numberOfChannels,duration:buffer.duration,contextState:g.audio._ctx.state,playing,paused,resumed,stopped:true};})()`);
  await writeFile(path.join(artifacts,'music-check.json'),JSON.stringify(music,null,2));console.log('Native music lifecycle:',music);
  if(resultAudioOnly){
   const resultAudio=await client.evaluate(`(async()=>{const g=window.app.currentGame,{NATIVE_RESULT_AUDIO}=await import('./games/eggo-mania/assets/native-result-audio.js'),ctx=g.audio._ctx,create=ctx.createBufferSource.bind(ctx);let source;ctx.createBufferSource=()=>source=create();const records=[];try{for(const [name,track] of Object.entries(NATIVE_RESULT_AUDIO)){await g.music.start(name);const buffer=g.audio._soundBuffers.get(g.music.id);if(!buffer||!g.music.handle||buffer.numberOfChannels!==2||Math.abs(buffer.duration-track.duration_seconds)>0.0001)throw Error('Result PCM decode/play failed '+name);if(source.loop!==track.loop||source.loopStart!==track.loop_start_seconds)throw Error('Wrong result loop region '+name);await new Promise(r=>setTimeout(r,30));g.onPause();const offset=g.music.offset;if(offset<=0||g.music.handle)throw Error('Result audio pause failed '+name);g.onResume();if(!g.music.handle||g.music.handle.position()<offset)throw Error('Result audio resume failed '+name);records.push({name,channels:buffer.numberOfChannels,duration:buffer.duration,loop:source.loop,loopStart:source.loopStart,pauseOffset:offset});g.music.stop();}return records;}finally{g.destroy();ctx.createBufferSource=create;}})()`);
   await writeFile(path.join(artifacts,'result-audio-check.json'),JSON.stringify(resultAudio,null,2));console.log('Native result audio lifecycle:',resultAudio);
  }

 }
 for(const scene of scenes){
  if(scene==='water-priority'){
   const report=await client.evaluate(`(async()=>{
    const {waitForPixelAssets}=await import('./games/eggo-mania/pixel-renderer.js');await waitForPixelAssets();
    const g=window.app.currentGame;g.p={...g.p,hazards:false};g.startingStage=0;g.round=2;g.startRound({intro:false});
    const t=g.player;t.rows=[];t.crates=[];t.spawn=Infinity;t.nativeFrame=0;
    for(let y=0;y<3;y++)for(let x=0;x<t.p.columns;x++)t.setCell(x,y,1,1+y*t.p.columns+x,0);
    const {VIEW}=await import('./games/eggo-mania/view.js');let differingPixels=0,differingFrames=0;
    const samples=[];
    for(let frame=0;frame<90;frame++){
     const camera=2.5*Math.min(frame/24,1);g.camera=[camera,0];g.views[0].camera=camera;g.views[0].backgroundCamera=camera;
     t.time=frame/60;t.nativeFrame=frame;t.water=-2;g.render();
     const top=Math.round(VIEW.floor-(3-camera)*VIEW.tile),dry=Array.from(g.pixelCanvas.getContext('2d').getImageData(48,top,16,16).data);
     t.water=2.5;g.render();const wet=Array.from(g.pixelCanvas.getContext('2d').getImageData(48,top,16,16).data);
     let changed=0;for(let p=0;p<dry.length;p+=4)if(dry[p]!==wet[p]||dry[p+1]!==wet[p+1]||dry[p+2]!==wet[p+2]||dry[p+3]!==wet[p+3])changed++;
     differingPixels+=changed;if(changed)differingFrames++;
     if(frame%15===0)samples.push({frame,camera,cellTop:top,differingPixels:changed});
    }
    return{stage:t.artStage,placedRows:3,waterline:2.5,cell:{x:3,y:2},cameraRange:[0,2.5],frames:90,differingPixels,differingFrames,samples};
   })()`);
   await writeFile(path.join(artifacts,'water-tile-priority.json'),JSON.stringify(report,null,2));
   if(report.differingPixels)throw Error('Water changed pixels in an opaque placed tile: '+report.differingPixels);
   console.log('Underwater placed-cell pixel comparison:',{stage:report.stage,placedRows:report.placedRows,waterline:report.waterline,cell:report.cell,differingPixels:report.differingPixels});
   continue;
  }
  if(fillerOnly&&scene==='filler-held'){
   const stages=JSON.parse(await readFile(path.join(root,'tests/fixtures/eggo-filler-art-gba.json'),'utf8')).stages.map(s=>s.stage);
   const grid=await client.evaluate(`(async()=>{const {Tower,settings,randomFrom,RULES}=await import('./games/eggo-mania/model.js');const {drawTowerPanels}=await import('./games/eggo-mania/pixel-renderer.js');const stages=${JSON.stringify(stages)};await Promise.all(stages.map(async stage=>{const i=new Image();i.src='./games/eggo-mania/assets/filler-'+stage+'.png';await i.decode();}));const canvas=document.createElement('canvas');canvas.width=128;canvas.height=48;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;for(const [i,stage] of stages.entries()){const t=new Tower(settings({hazards:false}),randomFrom(1));t.artStage=stage;t.setCell(0,0,7,4,1,0,{born:0,index:0});t.rows[0].sealed=true;for(const [phase,frame] of [0,RULES.fillerGrowTicks[0],RULES.fillerFinishTicks[0]].entries()){t.nativeFrame=frame;drawTowerPanels(c,t,x=>i*16+x*16,y=>(phase+1-y)*16);}}return canvas.toDataURL('image/png').split(',')[1];})()`);
   await writeFile(path.join(artifacts,'filler-phases.native.png'),Buffer.from(grid,'base64'));
  }
  if(throwOnly){
   const fixture=JSON.parse(await readFile(path.join(root,'tests/fixtures/eggo-throw-gba.json'),'utf8'));
   const image=await client.evaluate(`(async()=>{const g=window.app.currentGame;const {NATIVE_PIECE_MASKS}=await import('./games/eggo-mania/assets/native-piece-masks.js');const art=new Image();art.src='./games/eggo-mania/assets/throw-pieces.png';await art.decode();g.p.hazards=false;g.startRound({intro:false});const t=g.player;t.spawn=Infinity;t.crates=[];t.egg.x=(${fixture.start_x}+16)/16;t.egg.y=(720-${fixture.start_y})/16;const mask=NATIVE_PIECE_MASKS[6];t.held={nativeKind:6,nativeVariant:0,color:1,cells:mask.map(([x,y])=>[x,1-y])};t.use();const grid=document.createElement('canvas');grid.width=480;grid.height=160;const c=grid.getContext('2d');for(let frame=1;frame<=24;frame++){t.update(1/60);g.render();if([4,8,16,24].includes(frame))c.drawImage(g.pixelCanvas,0,0,112,160,[4,8,16,24].indexOf(frame)*120,0,112,160);}if(t.placing.nativeRotation!==0)throw Error('Wrong native throw orientation');return grid.toDataURL('image/png').split(',')[1];})()`);
   await writeFile(path.join(artifacts,'throw-grid.native.png'),Buffer.from(image,'base64'));
   const panels=await client.evaluate(`(async()=>{const g=window.app.currentGame,t=g.player;const {drawTowerPanels}=await import('./games/eggo-mania/pixel-renderer.js');const art=new Image();art.src='./games/eggo-mania/assets/placed-factory.png';await art.decode();for(let frame=0;frame<4;frame++)t.update(1/60);const image=document.createElement('canvas');image.width=48;image.height=32;const c=image.getContext('2d');c.imageSmoothingEnabled=false;drawTowerPanels(c,t,x=>x*16-32,y=>(2-y)*16);return image.toDataURL('image/png').split(',')[1];})()`);
   await writeFile(path.join(artifacts,'placed-piece.native.png'),Buffer.from(panels,'base64'));
   break;
  }
  if(scene==='loose-before'||scene==='loose-after'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-collapse-queue-gba.json'),'utf8'));
   const before=fixture.profiles.building.events.find(e=>e.frame===336).rows_bottom_up[0];
   const after=fixture.profiles.building.events.find(e=>e.frame===343).rows_bottom_up[0];
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.p.hazards=false;g.startRound({intro:false});const t=g.player;t.rows=[];t.crates=[];t.spawn=Infinity;t.nativeFrame=1319;${JSON.stringify(before)}.forEach((row,y)=>row.forEach((owner,x)=>{if(owner)t.setCell(x,y,owner,owner,2);}));Object.assign(t.egg,{y:6,ground:false});if('${scene}'==='loose-after')t.update(1/60);const expected=${JSON.stringify(scene==='loose-after'?after:before)};if(JSON.stringify(expected)!==JSON.stringify(expected.map((row,y)=>row.map((_,x)=>t.rows[y]?.cells[x]||0))))throw Error('Loose-piece scene differs from native board');g.render();return {scene:'${scene}',nativeFrame:t.nativeFrame,owner9:t.rows.flatMap((row,y)=>row?Array.from(row.owners,(v,x)=>v===9?[x,y]:null).filter(Boolean):[])};})()`));
   await delay(300);
  }
  if(scene==='factory-robot'||scene==='factory-stolen'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-factory-secondary-gba.json'),'utf8'));
   const stolen=scene==='factory-stolen',sample=stolen?fixture.theft_probe[9]:fixture.samples.find(s=>s.frame===750);
   const previous=stolen?fixture.theft_probe[8]:fixture.samples.find(s=>s.frame===749);
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=0;g.startRound({intro:false});const t=g.cpu;Object.assign(t.factorySecondary,${JSON.stringify(sample)},{active:true,type:2,side:1,previousAnimation:${previous.animation},previousWingPhase:0,stolen:${stolen}?{cells:[[0,0],[0,1],[0,2]],color:2}:null});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false});g.camera=[0,3.15625];g.render();return {stage:t.artStage,stolen:Boolean(t.factorySecondary.stolen)};})()`));await delay(300);
  }
  if(scene==='pirate-fish'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-pirate-gba.json'),'utf8'));
   const sample=fixture.profiles[0].samples[49],previous=fixture.profiles[0].samples[48];
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=3;g.startRound({intro:false});Object.assign(g.player.castle,${JSON.stringify(sample)},{active:true,previousAnimation:${previous.animation}});g.camera=[0,0];g.render();return {stage:g.player.artStage,animation:g.player.castle.animation};})()`));await delay(300);
  }
  if(scene==='pirate-stolen'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-pirate-secondary-gba.json'),'utf8'));
   const sample=fixture.samples.find(s=>s.frame===770),previous=fixture.samples.find(s=>s.frame===769);
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=3;g.startRound({intro:false});const t=g.cpu;Object.assign(t.pirateSecondary,${JSON.stringify(sample)},{active:true,side:1,previousAnimation:${previous.animation},stolen:{cells:[[1,2],[0,1],[1,1],[0,0]],color:2}});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false});g.camera=[0,4];g.render();return {stage:t.artStage,stolen:Boolean(t.pirateSecondary.stolen)};})()`));await delay(300);
  }
  if(scene==='survival-round-nine'){
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.p.hazards=true;g.seed=42;g.round=9;g.survivalConfigSeed=64756;g.startingStage=0;g.startRound();g.render();return {round:g.round,primary:g.player.p.nativeConfig.primary,secondary:g.player.p.nativeConfig.secondary,goal:g.player.p.goal,divisor:g.player.nativePickups.divisor};})()`));await delay(300);
  }
  if(scene==='native-discard'){
   console.log(await client.evaluate(`(async()=>{const {nativePickupItem}=await import('./games/eggo-mania/model.js');const g=window.app.currentGame;g.p.hazards=true;g.seed=34340;g.startingStage=0;g.startRound({intro:false});const t=g.player;t.crates=[];t.spawn=100;t.egg.y=5;t.egg.ground=false;t.held=nativePickupItem({kind:6,variant:0,x:40,y:600,vx:0,vy:0,state:1,active:true});delete t.held.nativeMotion;t.update(1/60,{discard:true,move:1});g.render();return {held:t.held,pickups:t.crates.length,wait:t.crates[0]?.nativeMotion.wait,kind:t.crates[0]?.nativeKind};})()`));await delay(300);
  }
  if(scene==='native-prefill'){
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.p.hazards=true;g.seed=34340;g.startingStage=0;g.startRound();for(const t of [g.player,g.cpu])t.advanceIntroPickups();g.render();return {stage:g.player.artStage,phase:g.phase,pickups:g.player.crates.length,seed:g.player.nativeEnemySeed};})()`));await delay(300);
  }
  if(scene==='jungle-drop'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-pickup-motion-gba.json'),'utf8'));
   const sample=fixture.profiles[1].samples.find(s=>s.frame===400);
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=5;g.startRound({intro:false});const t=g.cpu;t.crates=[{x:(${sample.x}+8)/16,y:(744-${sample.y})/16,cells:[[1,1],[2,1],[0,0],[1,0]],color:5,nativeMotion:{...${JSON.stringify(sample)},active:true},age:0}];g.camera=[0,1.625];g.render();return {stage:t.artStage,dropX:t.crates[0].x,dropY:t.crates[0].y};})()`));await delay(300);
  }
  if(scene==='jungle-thief'||scene==='jungle-stolen'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-jungle-secondary-gba.json'),'utf8'));
   const stolen=scene==='jungle-stolen',sample=stolen?fixture.theft_probe[9]:fixture.flights[0].samples.find(s=>s.frame===730),previous=stolen?fixture.theft_probe[8]:fixture.flights[0].samples.find(s=>s.frame===729);
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=5;g.startRound({intro:false});const t=g.cpu;Object.assign(t.jungleSecondary,${JSON.stringify(sample)},{active:true,previousX:${previous.x},previousY:${previous.y},previousAngle:${previous.angle},previousAnimation:${previous.animation},stolen:${stolen}?{cells:[[0,0]],color:2}:null});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false});g.camera=[0,4];g.render();return {stage:t.artStage,stolen:Boolean(t.jungleSecondary.stolen)};})()`));await delay(300);
  }
  if(scene==='beanstalk-thief'||scene==='beanstalk-stolen'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-beanstalk-secondary-gba.json'),'utf8'));
   const stolen=scene==='beanstalk-stolen',sample=stolen?fixture.theft_probe[9]:fixture.samples.find(s=>s.frame===900),previous=stolen?fixture.theft_probe[8]:fixture.samples.find(s=>s.frame===899);
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=7;g.startRound({intro:false});const t=g.cpu;Object.assign(t.beanstalkSecondary,${JSON.stringify(sample)},{active:true,previousX:${previous.x},previousY:${previous.y},previousAnimation:${previous.animation},stolen:${stolen}?{cells:[[0,0]],color:2}:null});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false});g.camera=[0,4];g.render();return {stage:t.artStage,stolen:Boolean(t.beanstalkSecondary.stolen)};})()`));await delay(300);
  }
  if(scene==='park-duck'||scene==='park-caught'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-park-gba.json'),'utf8'));
   const caught=scene==='park-caught',sample=fixture.samples.find(s=>s.frame===(caught?1620:1600)),previous=fixture.samples.find(s=>s.frame===(caught?1619:1599));
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=6;g.startRound({intro:false});const t=g.player;Object.assign(t.parkPrimary,${JSON.stringify(sample)},{active:true,side:0,captured:${caught},previousAnimation:${previous.animation}});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false,carried:${caught}});g.camera=[0,0];g.render();return {stage:t.artStage,captured:t.parkPrimary.captured};})()`));await delay(300);
  }
  if(scene==='park-bird'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-park-secondary-gba.json'),'utf8'));
   const sample=fixture.samples.find(s=>s.frame===745),previous=fixture.samples.find(s=>s.frame===744);
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=6;g.startRound({intro:false});const t=g.cpu;Object.assign(t.parkSecondary,${JSON.stringify(sample)},{active:true,turnY:${fixture.turn_y},previousAnimation:${previous.animation},previousAngle:${previous.angle},previousX:${previous.x},previousY:${previous.y}});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false});g.camera=[0,5];g.render();return {stage:t.artStage,animation:t.parkSecondary.animation};})()`));await delay(300);
  }
  if(scene==='castle-thief' ||scene==='castle-stolen'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-castle-secondary-gba.json'),'utf8'));
   const stolen=scene==='castle-stolen',sample=stolen?fixture.theft_probe[9]:fixture.samples.find(s=>s.frame===750);
   const previous=stolen?fixture.theft_probe[8]:fixture.samples.find(s=>s.frame===749);
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=2;g.startRound({intro:false});const t=g.cpu;Object.assign(t.castleSecondary,${JSON.stringify(sample)},{active:true,side:1,previousAnimation:${previous.animation},stolen:${stolen}?{cells:[[0,0],[0,1],[0,2]],color:2}:null});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false});g.camera=[0,${stolen?1.75:3.25}];g.render();return {stage:t.artStage,stolen:Boolean(t.castleSecondary.stolen)};})()`));await delay(300);
  }
  if(scene==='castle-rise'||scene==='castle-caught'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-castle-gba.json'),'utf8'));
   const caught=scene==='castle-caught',sample=caught?fixture.capture[14]:fixture.profiles[0].samples[49];
   const previous=caught?fixture.capture[13]:fixture.profiles[0].samples[48];
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=2;g.startRound({intro:false});const t=g.player;Object.assign(t.castle,${JSON.stringify(sample)},{active:true,captured:${caught},previousAnimation:${previous.animation}});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false,carried:${caught}});g.camera=[0,0];g.render();return {stage:t.artStage,captured:t.castle.captured};})()`));await delay(300);
  }
  if(scene==='dragon-rock'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-dragon-secondary-gba.json'),'utf8'));
   const sample=fixture.profiles[0].samples.find(s=>s.frame===200),previous=fixture.profiles[0].samples.find(s=>s.frame===199);
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=1;g.startRound({intro:false});Object.assign(g.player.dragonSecondary,${JSON.stringify(sample)},{active:true,previousAnimation:${previous.animation}});g.camera=[0,0];g.render();return {stage:g.player.artStage,animation:g.player.dragonSecondary.animation};})()`));await delay(300);
  }
  if(scene==='dragon-rise'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-dragon-gba.json'),'utf8'));
   const sample=fixture.profiles[0].samples[49],previous=fixture.profiles[0].samples[48];
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=1;g.startRound({intro:false});Object.assign(g.player.dragon,${JSON.stringify(sample)},{active:true,previousAnimation:${previous.animation}});g.camera=[0,0];g.render();return {stage:g.player.artStage,animation:g.player.dragon.animation};})()`));await delay(300);
  }
  if(scene==='space-missile'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-space-secondary-gba.json'),'utf8'));
   const sample=fixture.profiles[0].samples[199],previous=fixture.profiles[0].samples[198];
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=4;g.startRound({intro:false});const t=g.player;Object.assign(t.spaceSecondary,${JSON.stringify(sample)},{active:true,previousX:${previous.x},previousY:${previous.y},previousAngle:${previous.angle},previousAnimation:${previous.animation}});g.camera=[8,0];g.render();return {stage:t.artStage,angle:t.spaceSecondary.angle};})()`));await delay(300);
  }
  if(scene==='space-attack'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-space-enemy-gba.json'),'utf8'));
   const sample=fixture.samples[63],previous=fixture.samples[62];
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=4;g.startRound({intro:false});const t=g.player;Object.assign(t.space,${JSON.stringify(sample)},{active:true,previousAnimation:${previous.animation}});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,ground:false});g.camera=[0,0];g.render();return {stage:t.artStage,animation:t.space.animation};})()`));await delay(300);
  }

  if(scene==='jungle-caught'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-jungle-enemy-gba.json'),'utf8'));
   const sample=fixture.samples[199],previous=fixture.samples[198];
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=5;g.startRound({intro:false});const t=g.player;Object.assign(t.jumper,${JSON.stringify(sample)},{active:true,captured:true,previousAnimation:${previous.animation}});if(t.jumper.type!==4)throw Error('Wrong jungle enemy');Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,carried:true,ground:false,offTower:true});g.camera=[3.8125,0];g.render();return {stage:t.artStage,captured:t.jumper.captured};})()`));await delay(300);
  }
  if(scene.startsWith('jumper-')){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-jumper-gba.json'),'utf8'));
   const sample=fixture.samples[scene==='jumper-rise'?918:939];
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startingStage=7;g.startRound({intro:false});const t=g.player;Object.assign(t.jumper,${JSON.stringify(sample)},{active:true,captured:true,previousAnimation:${sample.animation}});Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,carried:true,ground:false,offTower:true});g.camera=[5.625,0];g.render();return {stage:t.artStage,captured:t.jumper.captured};})()`));await delay(300);
  }
  if(scene.startsWith('bubble-')){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-bubble-gba.json'),'utf8'));
   const sample=fixture.native[112];
   console.log(await client.evaluate(`(async()=>{const g=window.app.currentGame;const {RULES}=await import('./games/eggo-mania/model.js');g.startRound({intro:false});g.player.spawn=g.cpu.spawn=Infinity;const t=g.player;Object.assign(t.bubble,${JSON.stringify(sample)},{active:true,captured:true,escapeCounter:0});t.nativeFrame=${sample.nativeFrame};Object.assign(t.egg,{x:(${sample.actor_x}+16)/16,y:(720-${sample.actor_y})/16,bubble:true,ground:false,offTower:true});if('${scene}'==='bubble-escape'){window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));g.input.update();g.update(RULES.step);window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));g.input.update();for(let n=1;n<10;n++){g.input.update();g.update(RULES.step);}if(t.bubble.life!==278)throw Error('Keyboard escape timer mismatch: '+t.bubble.life);}g.camera=[0,0];g.render();return {scene:'${scene}',life:t.bubble.life,captured:t.bubble.captured};})()`));await delay(300);
  }
  if(scene.startsWith('hammer-')){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-hammer-gba.json'),'utf8'));
   console.log(await client.evaluate(`(async()=>{const g=window.app.currentGame;const {RULES}=await import('./games/eggo-mania/model.js');g.startRound({intro:false});g.player.spawn=g.cpu.spawn=Infinity;g.player.water=g.cpu.water=-10;const t=g.cpu;${JSON.stringify(fixture.gap_target_rows)}.forEach((row,y)=>row.forEach((v,x)=>{if(v)t.setCell(x,y,1,v)}));if('${scene}'==='hammer-flight'){Object.assign(g.player.egg,{x:${fixture.initial_actor.x},y:${fixture.initial_actor.y}+RULES.gravity*RULES.step**2,vy:0,ground:false});g.player.held={item:'hammer'};window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));g.input.update();g.update(RULES.step);window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));g.input.update();if(g.player.hammers.length!==1)throw Error('Keyboard hammer launch failed');t.egg.x=-100;for(let n=0;n<39;n++)g.player.update(RULES.step,{},t);t.egg.x=4.5;t.egg.y=6;g.camera=[6,8];if(g.player.hammers.length!==1)throw Error('Hammer disappeared during flight');}else if('${scene}'==='hammer-collapse'){t.startHammerCollapse(t.time);for(let n=0;n<40;n++)t.update(RULES.step);g.camera=[0,6];if(!t.hammerCollapse||!t.collapse.active)throw Error('Hammer destruction did not start');}else{Object.assign(t.egg,{x:4.5,y:5.8,ground:false});g.player.hammers=[{item:'hammer',x:202/16,y:(752-627.3)/16,vy:-15,phase:'arc',targetX:204/16}];g.player.update(RULES.step,{},t);if(!t.egg.lightning)throw Error('Hammer did not stun target');g.camera=[0,6];}g.render();return {scene:'${scene}',projectiles:g.player.hammers.length,stunned:Boolean(t.egg.lightning)};})()`));await delay(300);
  }
  if(scene.startsWith('cloud-')){
   console.log(await client.evaluate(`(async()=>{const g=window.app.currentGame;const {RULES}=await import('./games/eggo-mania/model.js');g.startRound({intro:false});g.player.spawn=g.cpu.spawn=Infinity;g.player.water=-10;g.cpu.egg.x=5;g.cpu.held={item:'cloud'};g.cpu.use(g.player);const end='${scene}'==='cloud-small'?4:'${scene}'==='cloud-miss'?87:100;g.player.clouds[0].bornAt=RULES.step;for(let f=1;f<=end;f++)g.player.update(RULES.step,{jump:'${scene}'==='cloud-hit'&&f===72,float:'${scene}'==='cloud-hit'&&f>=71&&f<=99});if(Boolean(g.player.egg.lightning)!==('${scene}'==='cloud-hit'))throw Error('Wrong cloud hit state');g.render();return {scene:'${scene}',counter:g.player.clouds[0].counter,hit:Boolean(g.player.egg.lightning)};})()`));await delay(300);
  }
  if(scene.startsWith('arena-')){
   const seed=scene==='arena-factory'?1137:1197;
   console.log(await client.evaluate(`(async()=>{const g=window.app.currentGame;const {survivalStage}=await import('./games/eggo-mania/model.js');g.seed=${seed};g.resetSurvival();const stage=survivalStage(g.round,g.startingStage);if(stage!=='${scene.slice(6)}')throw Error('Wrong native initial arena');g.render();return {seed:g.seed,stage,introHeight:g.player.egg.y};})()`));await delay(300);
  }
  if(scene.startsWith('podium-')){
   await client.evaluate(`(()=>{const g=window.app.currentGame;g.startRound({intro:false});g.phase='${scene==='podium-won'?'won':'lost'}';g.wins=${scene==='podium-won'?4:0};g.resultTicks=220+${scene==='podium-game-over'?180:80};g.render();})()`);await delay(300);
  }
  if(scene==='result-won'||scene==='result-lost'){
   await client.evaluate(`(()=>{const g=window.app.currentGame;g.startRound({intro:false});g.phase='${scene==='result-won'?'won':'lost'}';g.player.won=g.phase==='won';g.player.lost=g.phase==='lost';g.player.spawn=g.cpu.spawn=Infinity;g.elapsed=15;g.render();})()`);await delay(300);
  }
  if(scene==='result-burst'){
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.player.held={item:'bomb',fuse:2/60};for(let n=0;n<11;n++)g.update(1/60);if(g.phase!=='lost'||g.elapsed!==15||!g.player.explosions.length)throw Error('Post-result explosion or frozen race timer failed');g.render();return 'Post-result world and explosion passed';})()`));
  }
  if(scene==='bomb'){
   await client.evaluate(`(()=>{const g=window.app.currentGame;g.startRound({intro:false});g.player.spawn=100;g.player.held={item:'bomb',fuse:1.5};g.player.crates=[{item:'bomb',x:1.5,y:4,age:0.1}];g.render();})()`);await delay(300);
  }
  if(scene==='bomb-explosion'){
   await client.evaluate(`(async()=>{const {RULES}=await import('./games/eggo-mania/model.js');const g=window.app.currentGame;g.startRound({intro:false});g.player.held=null;g.player.explode(g.player.egg.x,g.player.egg.y,RULES.bombHeldEffectLift);g.player.explosions[0].age=9*RULES.step;g.render();})()`);
  }
  if(scene==='bomb-flight'){
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startRound({intro:false});g.player.spawn=g.cpu.spawn=Infinity;for(let y=0;y<7;y++)for(let x=0;x<7;x++)g.cpu.setCell(x,y,1);g.player.egg.x=1.5;g.player.egg.y=3;g.player.egg.ground=false;g.player.held={item:'bomb',fuse:4};window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));g.input.update();g.player.update(1/60,{use:g.input.isActionJustDown('place')},g.cpu);window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));g.input.update();if(g.player.bombs.length!==1||g.cpu.attacks.length)throw Error('Bomb did not launch as a projectile');for(let n=0;n<56;n++)g.player.update(1/60,{},g.cpu);if(g.player.bombs.length!==1)throw Error('Projectile disappeared during flight');g.camera=[7,7];g.render();return 'Keyboard bomb launch and visible cross-field flight passed';})()`));
  }
  if(scene==='intro-three'){await client.evaluate(`(()=>{const g=window.app.currentGame;g.startRound();g.introElapsed=10/60;g.render();})()`);await delay(300);}
  if(scene==='intro-go'){await client.evaluate(`(()=>{const g=window.app.currentGame;g.introElapsed=130/60;g.render();})()`);}
  if(scene==='intro-descent'){
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;g.startRound();for(let n=0;n<260;n++){g.input.update();g.update(1/60);}if(g.phase!=='playing'||!g.player.egg.introDescent||g.player.won)throw Error('Intro did not hand off into descent');const before={x:g.player.egg.x,y:g.player.egg.y};window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowLeft',key:'ArrowLeft',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp',key:'ArrowUp',bubbles:true}));for(let n=0;n<8;n++){g.input.update();g.update(1/60);}window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowLeft',key:'ArrowLeft',bubbles:true}));window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowUp',key:'ArrowUp',bubbles:true}));g.input.update();if(Math.abs(before.x-g.player.egg.x-1)>.001||Math.abs((before.y-g.player.egg.y)*16-14)>.001)throw Error('Descent did not respond to real left/up controls');g.render();return 'Interactive intro descent passed';})()`));
  }
  if(scene==='intro-landed'){console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;for(let n=0;n<240&&g.player.egg.introDescent;n++){g.input.update();g.update(1/60);}if(g.player.egg.introDescent||g.phase!=='playing'||g.player.won)throw Error('Intro landing failed');g.render();return 'Intro landing passed';})()`));}
  if(scene==='pickup'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-pickup-gba.json'),'utf8'));
   const sample=fixture.samples.find(s=>s.frame===53);
   await client.evaluate(`(()=>{const g=window.app.currentGame;g.startRound({intro:false});g.player.spawn=100;g.player.held={cells:[[0,0],[1,0],[1,1],[2,1]],color:5};g.player.crates=[{x:${sample.center_x_pixels/16},y:${(112-sample.center_y_pixels)/16},cells:[[0,0],[1,0],[2,0]],color:11,age:${(53-fixture.first_frame)/60},swayPhase:${fixture.initial_phase_radians}}];g.render();})()`);
   await delay(300);
  }
  if(scene==='filler-held'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-filler-gba.json'),'utf8'));
   await client.evaluate(`(async()=>{const {advanceView}=await import('./games/eggo-mania/view.js');const g=window.app.currentGame;g.p={...g.p,waterSpeed:0,hazards:false,seed:42};g.seed=42;g.startRound({intro:false});const rows=${JSON.stringify(fixture.before_rows_bottom_up)};rows.forEach((cells,y)=>{const row=g.player.row(y);row.cells=cells;row.owners.set(cells);row.materials.fill(1);});g.player.nextOwner=4;Object.assign(g.player.egg,{x:3.5,y:2,ground:true});g.player.spawn=100;g.player.held={item:'filler'};g.player.crates=[{x:1.5,y:4.2,item:'hammer'}];for(let n=0;n<60;n++)advanceView(g.views[0],g.player,1/60);g.camera[0]=g.views[0].camera;g.render();})()`);
   await delay(300);
  }
  if(scene==='filler-filled'){
   console.log(await client.evaluate(`(()=>{const g=window.app.currentGame;window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true}));g.input.update();g.update(1/60);window.dispatchEvent(new KeyboardEvent('keyup',{code:'Space',key:' ',bubbles:true}));g.input.update();const count=g.player.rows.reduce((n,row)=>n+row.cells.filter(Boolean).length,0);if(count!==10||g.player.lines!==1)throw Error('Filler keyboard action did not match the original board');g.render();return 'Keyboard filler passed';})()`));
  }
  if(scene==='surge'){
   const meterFixture=JSON.parse(await readFile(path.join(root,'tests/fixtures/eggo-meter-gba.json'),'utf8'));
   const meterStrip=await client.evaluate(`(async()=>{const {createView,advanceView,nativeMeterPose}=await import('./games/eggo-mania/view.js');const {drawNativeMeter}=await import('./games/eggo-mania/pixel-renderer.js');await Promise.all(['meter-bars','meter-pointer'].map(async name=>{const i=new Image();i.src='./games/eggo-mania/assets/'+name+'.png';await i.decode();}));const f=${JSON.stringify(meterFixture)};const frames=[1,3,30,40,60,80];const grid=document.createElement('canvas');grid.width=672;grid.height=28;const gc=grid.getContext('2d');for(let side=0;side<2;side++){const state=createView();Object.assign(state.meter,{position:f.initial.meters[side].position-side*128*65536,velocity:f.initial.meters[side].velocity});state.meterPose=nativeMeterPose(state.meter,f.initial.meters[side].count,f.initial.frame);for(const sample of f.samples){advanceView(state,{egg:{y:0,ground:true},incompleteFloors:sample.meters[side].count,nativeFrame:sample.native_frame},1/60);if(frames.includes(sample.frame)){const canvas=document.createElement('canvas');canvas.width=112;canvas.height=160;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;if(!drawNativeMeter(c,state,0,112))throw Error('Native meter assets not loaded');gc.drawImage(canvas,0,146,112,14,frames.indexOf(sample.frame)*112,side*14,112,14);}}}return grid.toDataURL('image/png').split(',')[1];})()`);
   await writeFile(path.join(artifacts,'meter-trace.native.png'),Buffer.from(meterStrip,'base64'));
   const strip=await client.evaluate(`(async()=>{const {Tower,settings,randomFrom}=await import('./games/eggo-mania/model.js');const {VIEW}=await import('./games/eggo-mania/view.js');const {drawCollapseWave}=await import('./games/eggo-mania/pixel-renderer.js');const i=new Image();i.src='./games/eggo-mania/assets/destructive-wave.png';await i.decode();const t=new Tower(settings({hazards:false}),randomFrom(1));const canvas=document.createElement('canvas');canvas.width=224;canvas.height=128;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;for(let phase=0;phase<8;phase++){t.previousCollapseWave={floor:0,timer:(7-phase)*4};drawCollapseWave(c,t,(phase%2)*112,y=>Math.floor(phase/2)*32+VIEW.destructiveWaveLift,112);}return canvas.toDataURL('image/png').split(',')[1];})()`);
   await writeFile(path.join(artifacts,'wave-phases.native.png'),Buffer.from(strip,'base64'));
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-surge-gba.json'),'utf8'));
   await client.evaluate(`(async()=>{const {advanceView}=await import('./games/eggo-mania/view.js');const g=window.app.currentGame;g.p={...g.p,waterSpeed:0,hazards:false,seed:42};g.seed=42;g.startRound({intro:false});const rows=${JSON.stringify(fixture.initial_rows_bottom_up)};rows.forEach((cells,y)=>{if(cells.some(Boolean)){const row=g.player.row(y);row.cells=cells;row.owners.set(cells);row.materials.fill(2);}});Object.assign(g.player.egg,{x:3.5,y:7,ground:true});g.player.spawn=100;g.player.collapse.active=true;for(let frame=0;frame<20;frame++){g.player.update(1/60);advanceView(g.views[0],g.player,1/60);g.camera[0]=g.views[0].camera;}g.render();})()`);
   await delay(300);
  }
  if(scene==='reference'){
   await client.evaluate(`(async()=>{const {waitForPixelAssets}=await import('./games/eggo-mania/pixel-renderer.js');await waitForPixelAssets();return true;})()`);
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-mania-gba.json'),'utf8'));
   await client.evaluate(`(async()=>{const {nativeCellArt}=await import('./games/eggo-mania/model.js');const {nativeBg3CameraY,nativeBg3ScrollOffset}=await import('./games/eggo-mania/view.js');const g=window.app.currentGame;g.p={...g.p,waterSpeed:0,hazards:false,seed:42};g.seed=42;g.startRound({intro:false});const rows=${JSON.stringify(fixture.rows_bottom_up)},styles=${JSON.stringify(fixture.piece_materials)},templates=${JSON.stringify(fixture.piece_templates)},egg=${JSON.stringify(fixture.egg)},view=${JSON.stringify(fixture.view)},cameraState=${JSON.stringify(fixture.native_camera_state)},frame=${fixture.native_frame},progressMarkers=${JSON.stringify(fixture.progress_marker_world_y_pixels)},meter=${JSON.stringify(fixture.view.meter)};rows.forEach((cells,y)=>{const row=g.player.row(y);row.cells=cells;row.owners.set(cells);row.materials.set(cells.map(id=>styles[id]||0));row.nativeArt.fill(0);});const groups=new Map();rows.forEach((row,y)=>row.forEach((owner,x)=>{if(owner){if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push([x,y]);}}));for(const [owner,cells] of groups){const template=templates[owner];if(!template)throw Error('Missing captured tile orientation for owner '+owner);const minX=Math.min(...cells.map(p=>p[0])),minY=Math.min(...cells.map(p=>p[1]));for(const [x,y] of cells)g.player.rows[y].nativeArt[x]=nativeCellArt(template.kind,template.rotation,x-minX,y-minY);}g.player.nextOwner=10;g.camera[0]=g.views[0].camera=view.foreground_pixels/16;g.views[0].backgroundCamera=view.background_pixels/16;g.views[0].nativeCameraPosition=cameraState.player_camera_position_q16/65536;g.views[0].nativeCameraY=nativeBg3CameraY(g.views[0].nativeCameraPosition);g.views[0].nativeBoardCameraY=cameraState.player_bg3_camera_y;g.views[0].previousNativeCameraPosition=g.views[0].nativeCameraPosition;g.views[1].nativeCameraPosition=cameraState.cpu_camera_position_q16/65536;g.views[1].nativeCameraY=nativeBg3CameraY(g.views[1].nativeCameraPosition);g.views[1].nativeBoardCameraY=cameraState.cpu_bg3_camera_y;g.views[1].previousNativeCameraPosition=g.views[1].nativeCameraPosition;g.nativeBg3Vofs=nativeBg3ScrollOffset(g.views[1].nativeCameraY);g.player.spawn=100;g.player.update(1/60);Object.assign(g.player.egg,egg);g.player.progressWorldY=progressMarkers.player;g.player.crates=${JSON.stringify(fixture.crates||[])};g.player.nativeFrame=frame;g.bg3GlobalFrame=${fixture.bg3_global_frame};g.player.time=frame/60;g.elapsed=${fixture.captured_at_frame}/60;g.player.incompleteFloors=meter.incomplete_floors;g.views[0].meter={position:meter.position,velocity:meter.velocity};g.views[0].meterPose=meter.pose;g.views[0].previousMeterPose=meter.pose;
    const cpu=${JSON.stringify(fixture.cpu_capture)},cpuRows=cpu.rows_bottom_up,cpuTemplates=cpu.piece_templates,t=g.cpu;if(!t)throw Error('The reference game must include the captured CPU field');t.rows=[];t.completedFloorEffects=(cpu.completion_effects||[]).map(effect=>({row:effect.row,bornFrame:effect.started_at_native_frame}));t.crates=cpu.crates.map(({nativeKind,nativeVariant,nativeSwayFrame,nativeAffineMatrix,nativeAffineDoubleSize,x,y})=>({nativeKind,nativeVariant,nativeSwayFrame,nativeAffineMatrix,nativeAffineDoubleSize,x,y,age:0}));t.spawn=Infinity;t.placing=null;cpuRows.forEach((cells,y)=>{const row=t.row(y);row.cells=cells;row.owners.set(cells);row.materials.fill(0);row.nativeArt.fill(0);});const cpuGroups=new Map();cpuRows.forEach((row,y)=>row.forEach((owner,x)=>{if(owner){if(!cpuGroups.has(owner))cpuGroups.set(owner,[]);cpuGroups.get(owner).push([x,y]);}}));for(const [owner,cells]of cpuGroups){const template=cpuTemplates[owner];if(!template)throw Error('Missing captured CPU tile orientation for owner '+owner);const minX=Math.min(...cells.map(p=>p[0])),minY=Math.min(...cells.map(p=>p[1]));for(const [x,y]of cells)t.rows[y].nativeArt[x]=nativeCellArt(template.kind,template.rotation,x-minX,y-minY);}Object.assign(t.egg,cpu.actor);t.progressWorldY=progressMarkers.cpu;t.nativeRivalPose={...cpu.actor.pose};t.nativeRivalPoseKey=cpu.actor.pose.key;t.nativeRivalPoseState=cpu.actor.pose.state;t.nativeRivalPostThrowPoseActive=cpu.actor.pose.key==='air-free';t.nativeFrame=cpu.native_frame;t.time=frame/60;t.incompleteFloors=cpu.view.meter.incomplete_floors;const cv=g.views[1];cv.camera=cpu.view.camera;cv.boardCamera=cpu.view.board_camera;cv.previousHeight=t.egg.y;cv.backgroundCamera=cpu.view.background_camera;cv.meter={position:cpu.view.meter.position*65536,velocity:cpu.view.meter.velocity};cv.meterPose=cpu.view.meter.pose;cv.previousMeterPose=cpu.view.meter.pose;g.camera[1]=cv.camera;g.update=()=>{};g.render();})()`);
   await client.evaluate(`(()=>{const g=window.app.currentGame,p=${JSON.stringify(fixture.native_divider_progress)};g.player.lines=p.player;g.player.nativeDividerProgress=p.player;g.cpu.lines=p.cpu;g.cpu.nativeDividerProgress=p.cpu;g.render();})()`);
   await delay(300);
  }
  if(scene==='jump-stack'){
   await client.evaluate(`(async()=>{const {waitForPixelAssets}=await import('./games/eggo-mania/pixel-renderer.js');await waitForPixelAssets();return true;})()`);
   const probe=await client.evaluate(`(async()=>{
    const {RULES,nativeCellArt}=await import('./games/eggo-mania/model.js');
    const {NATIVE_PIECE_MASKS}=await import('./games/eggo-mania/assets/native-piece-masks.js');
    const {FACTORY_BACKGROUND_FIELD_SAMPLES}=await import('./games/eggo-mania/assets/factory-background-timeline.js');
    const {nativePreviewGridOrigin,visibleTowerRowRange,pixelArtScale}=await import('./games/eggo-mania/pixel-renderer.js');
    const {VIEW,seedNativeCameraActorY}=await import('./games/eggo-mania/view.js');
    const g=window.app.currentGame,fixture=${JSON.stringify(jumpStackFixture)},everyFrame=${jumpStackEveryFrame},dpr=window.devicePixelRatio||1,cssWidth=window.innerWidth,cssHeight=window.innerHeight;
    g.onResize(640,480);if(g.canvas.width!==Math.round(640*dpr)||g.canvas.height!==Math.round(480*dpr))throw Error('Eggo canvas did not resize to physical device pixels');
    g.onResize(cssWidth,cssHeight);const display={...window.__eggoDpiReport,cssWidth,cssHeight,
      pixelScale:pixelArtScale(112,160,g.canvas.width,Math.max(1,g.canvas.height-38*dpr))};
    if(display.pixelScale>=1&&!Number.isInteger(display.pixelScale))throw Error('Native pixel art is being enlarged at a fractional display scale');
    g.p={...g.p,waterSpeed:0,hazards:false,seed:42};g.seed=42;g.startingStage=0;
    g.startRound({intro:false});g.cpu=null;g.camera=[0];const t=g.player;t.rows=[];t.crates=[];t.spawn=Infinity;t.placing=null;
    const layout=fixture.rows_bottom_up,groups=new Map();
    layout.forEach((cells,y)=>{const row=t.row(y);for(let x=0;x<cells.length;x++)if(cells[x]){t.setCell(x,y,cells[x],cells[x]);if(!groups.has(cells[x]))groups.set(cells[x],[]);groups.get(cells[x]).push([x,y]);}});
    for(const [owner,cells] of groups){const template=fixture.piece_templates[owner];if(!template)throw Error('Missing authentic native piece template for owner '+owner);const minX=Math.min(...cells.map(p=>p[0])),minY=Math.min(...cells.map(p=>p[1]));for(const [x,y] of cells)t.rows[y].nativeArt[x]=nativeCellArt(template.kind,template.rotation,x-minX,y-minY);}
    // The captured grounded checkpoint has no held piece. Exercise the same
    // native landing-outline renderer during the jump with a deterministic
    // ROM shape so the fractional-origin check cannot silently pass with
    // zero preview frames.
    const kind=Number.isInteger(fixture.held_kind)?fixture.held_kind:fixture.preview_probe?.held_kind;
    const heldRotation=Number.isInteger(fixture.held_rotation)?fixture.held_rotation:(fixture.preview_probe?.rotation||0);
    if(Number.isInteger(kind)){
      const mask=NATIVE_PIECE_MASKS[(heldRotation&3)*8+kind],minX=Math.min(...mask.map(([x])=>x)),maxY=Math.max(...mask.map(([,y])=>y));
      t.held={nativeKind:kind,nativeVariant:heldRotation,cells:mask.map(([x,y])=>[x-minX,maxY-y]),color:4};
    }else t.held=null;
    t.p={...t.p,nativeConfig:null,nativeRound:null};
    Object.assign(t.egg,{x:fixture.actor.x,y:fixture.actor.y,vy:fixture.actor.vy,ground:fixture.actor.ground,offTower:false,swimming:false});
    seedNativeCameraActorY(g.views[0],t);
    t.nativeFrame=fixture.actor.native_frame_before_input;g.bg3GlobalFrame=fixture.bg3_global_frame_before_input;g.nativePlayerPrimed=true;t.water=fixture.waterline;
    const initialWaterline=t.water,renderWaterline=${jumpStackWaterActive}?Math.max(0,t.height()/2):t.water,
      startingCamera=Number.isFinite(fixture.camera_position_q16_before_input)?
      Math.max(0,(640-fixture.camera_position_q16_before_input/65536)/VIEW.tile):
      Math.max(0,Math.ceil(fixture.actor.y*VIEW.tile-VIEW.foregroundMargin))/VIEW.tile;
    const cellsBefore=t.rows.reduce((n,row)=>n+(row?.cells.filter(Boolean).length||0),0);
    g.views[0].camera=startingCamera;g.views[0].boardCamera=startingCamera;g.views[0].backgroundCamera=(fixture.actor.y*VIEW.tile-VIEW.backgroundMargin)/VIEW.tile;g.views[0].previousHeight=fixture.actor.y;
    g.views[0].nativeCameraOffset=fixture.camera_offset_before_input;g.views[0].nativeCameraPosition=Math.floor(fixture.camera_position_q16_before_input/65536);g.camera[0]=startingCamera;
    const down=g.input.isActionDown.bind(g.input);let jumpFrame=0;g.input.isActionDown=action=>action==='jump'?jumpFrame>0&&jumpFrame<=fixture.input.hold_frames:down(action);
    t.water=renderWaterline;g.render();
    const copy=()=>{const canvas=document.createElement('canvas');canvas.width=112;canvas.height=160;canvas.getContext('2d').drawImage(g.pixelCanvas,0,0,112,160,0,0,112,160);return canvas;};
    const frames=everyFrame?Array.from({length:91},(_,frame)=>frame):[0,1,2,4,8,12,18,24,32,40,48,56,64,72,80,90],shots=[],samples=[],actorSamples=[],
      nativeSamples=new Map(fixture.native_samples.map(sample=>[sample.frame,sample])),
      nativeCameraSamples=new Map((fixture.native_camera_samples||[]).map(sample=>[sample.frame,sample])),cameraSamples=[],boardCameraSamples=[];
    shots.push(copy());t.water=initialWaterline;let peakHeight=t.egg.y,displayAtJumpPeak=null;
    const boardState=()=>t.rows.flatMap((row,y)=>row?row.cells.flatMap((cell,x)=>cell?[[x,y,cell,row.owners[x],row.nativeArt[x]]]:[]):[]);
    let lastBoardState=JSON.stringify(boardState());const boardMotionEvents=[];
    const ctx=g.pixelCanvas.getContext('2d');let maxHistoryDifference=0,totalHistoryDifference=0,omittedVisibleRows=0,outlineFrames=0,maxOutlineGridFraction=0,maxOutlineSnapError=0,maxOutlineCanvasPositionFraction=0,unrenderedVisibleCells=0,minimumRenderedCellPixels=Infinity;const historyEvents=[],unrenderedCellSamples=[];
    for(let frame=1;frame<=90;frame++){
      const expectedBoardCameraPixels=frame===1?
        VIEW.nativeCameraReferencePixels-fixture.camera_position_q16_before_input/65536:
        nativeCameraSamples.get(frame-1)?.camera_pixels;
      jumpFrame=frame;g.update(RULES.step);peakHeight=Math.max(peakHeight,t.egg.y);
      const appBoardCameraPixels=(g.views[0].boardCamera??g.camera[0])*VIEW.tile;
      if(Number.isFinite(expectedBoardCameraPixels))boardCameraSamples.push({frame,expectedPreviousNativeCameraPixels:expectedBoardCameraPixels,
        appBoardCameraPixels,errorPixels:appBoardCameraPixels-expectedBoardCameraPixels});
      if(nativeSamples.has(frame)){const expected=nativeSamples.get(frame),errorY=Math.abs(t.egg.y-expected.y),errorVy=Math.abs(t.egg.vy-expected.vy);actorSamples.push({frame,expected:{x:expected.x,y:expected.y,vy:expected.vy},actual:{x:t.egg.x,y:t.egg.y,vy:t.egg.vy},error:{x:Math.abs(t.egg.x-expected.x),y:errorY,vy:errorVy}});}
      if(nativeCameraSamples.has(frame)){const expected=nativeCameraSamples.get(frame),appPixels=g.views[0].camera*VIEW.tile;
        cameraSamples.push({frame,nativeCameraPixels:expected.camera_pixels,appCameraPixels:appPixels,errorPixels:appPixels-expected.camera_pixels});}
      const nextBoardState=JSON.stringify(boardState());if(nextBoardState!==lastBoardState){if(boardMotionEvents.length<32)boardMotionEvents.push({frame,before:JSON.parse(lastBoardState),after:JSON.parse(nextBoardState)});lastBoardState=nextBoardState;}
      const simulationWaterline=t.water;t.water=renderWaterline;g.render();const beforeCanvas=copy(),before=ctx.getImageData(0,0,112,160).data.slice();
      const boardCamera=g.views[0].boardCamera??g.camera[0],
        [firstVisibleRow,endVisibleRow]=visibleTowerRowRange(boardCamera,t.rows.length);
      for(let y=0;y<t.rows.length;y++)if(t.rows[y]?.cells.some(Boolean)){
        const top=Math.round(VIEW.floor+VIEW.boardOriginOffsetY-(y+1-boardCamera)*VIEW.tile),visiblyOnscreen=top<160&&top+16>0;
        if(visiblyOnscreen&&(y<firstVisibleRow||y>=endVisibleRow))omittedVisibleRows++;
      }
      // Compare the rendered board against this exact frame with its cells
      // removed. Alpha alone is not a visibility check because the stage
      // background is opaque behind every board cell.
      const rowCells=t.rows.map(row=>row?.cells.slice()||null),held=t.held;
      for(const row of t.rows)if(row)row.cells.fill(0);t.held=null;g.render();
      const background=ctx.getImageData(0,0,112,160).data;
      for(let y=0;y<t.rows.length;y++)if(t.rows[y])for(let x=0;x<rowCells[y].length;x++)t.rows[y].cells[x]=rowCells[y][x];t.held=held;g.render();
      const after=ctx.getImageData(0,0,112,160).data;
      let different=0,minDiffX=112,minDiffY=160,maxDiffX=-1,maxDiffY=-1;const points=[];
      for(let p=0;p<before.length;p+=4)if(before[p]!==after[p]||before[p+1]!==after[p+1]||before[p+2]!==after[p+2]||before[p+3]!==after[p+3]){
        different++;const i=p/4,x=i%112,y=Math.floor(i/112);minDiffX=Math.min(minDiffX,x);minDiffY=Math.min(minDiffY,y);maxDiffX=Math.max(maxDiffX,x);maxDiffY=Math.max(maxDiffY,y);
        if(points.length<24)points.push({x,y,before:Array.from(before.slice(p,p+4)),after:Array.from(after.slice(p,p+4))});
      }
      maxHistoryDifference=Math.max(maxHistoryDifference,different);totalHistoryDifference+=different;
      let frameMinimumRenderedCellPixels=Infinity,frameVisibleBoardCells=0;
      for(let y=0;y<t.rows.length;y++)for(let x=0;x<t.p.columns;x++)if(t.rows[y]?.cells[x]){
        const top=Math.round(VIEW.floor+VIEW.boardOriginOffsetY-(y+1-boardCamera)*VIEW.tile),bottom=Math.min(VIEW.height,top+VIEW.tile),
          topVisible=Math.max(0,top),left=Math.max(0,x*VIEW.tile),right=Math.min(112,left+VIEW.tile);
        // A source tile can have transparent pixels at its edge. Only test
        // complete on-screen cells here; a cell clipped by the viewport can
        // legitimately expose no opaque source pixels in its clipped slice.
        if(top<0||top+VIEW.tile>VIEW.height||left>=right)continue;
        frameVisibleBoardCells++;let changed=0;
        for(let py=topVisible;py<bottom;py++)for(let px=left;px<right;px++){
          const p=(py*112+px)*4;
          if(before[p]!==background[p]||before[p+1]!==background[p+1]||before[p+2]!==background[p+2]||before[p+3]!==background[p+3])changed++;
        }
        frameMinimumRenderedCellPixels=Math.min(frameMinimumRenderedCellPixels,changed);
        if(!changed){unrenderedVisibleCells++;if(unrenderedCellSamples.length<32)unrenderedCellSamples.push({frame,x,y,top,camera:g.camera[0]});}
      }
      minimumRenderedCellPixels=Math.min(minimumRenderedCellPixels,frameMinimumRenderedCellPixels);
      if(different){const samples=FACTORY_BACKGROUND_FIELD_SAMPLES.player;let nearest=samples[0];for(const sample of samples)if(Math.abs(sample[0]-t.egg.y)<Math.abs(nearest[0]-t.egg.y))nearest=sample;
        const pair=document.createElement('canvas');pair.width=224;pair.height=160;const pc=pair.getContext('2d');pc.drawImage(beforeCanvas,0,0);pc.drawImage(g.pixelCanvas,0,0,112,160,112,0,112,160);
        historyEvents.push({frame,height:t.egg.y,camera:g.camera[0],nativeFrame:t.nativeFrame,backgroundMap:nearest[1],differentPixels:different,bounds:{minX:minDiffX,minY:minDiffY,maxX:maxDiffX,maxY:maxDiffY},points,
          comparison:pair.toDataURL('image/png').split(',')[1]});}
      const preview=t.preview(),visual=t.nativePreviewRotation?.held===t.held?t.nativePreviewRotation:null,
        gridOrigin=nativePreviewGridOrigin(preview,visual),spriteGridX=gridOrigin?.x,spriteGridY=gridOrigin?.y;
      const outlineOrigin=preview?{x:Math.round(spriteGridX*16-8),y:Math.round(VIEW.floor+VIEW.boardOriginOffsetY-(spriteGridY-boardCamera)*16)-8}:null,
        frameScale=display.pixelScale,frameX=Math.floor((g.canvas.width-112*frameScale)/2),
        frameY=Math.floor((g.canvas.height-38*dpr-160*frameScale)/2),
        outlineDestination=outlineOrigin?{x:frameX+outlineOrigin.x*frameScale,y:frameY+outlineOrigin.y*frameScale}:null;
      if(preview){outlineFrames++;maxOutlineGridFraction=Math.max(maxOutlineGridFraction,Math.abs(spriteGridX-Math.round(spriteGridX)),Math.abs(spriteGridY-Math.round(spriteGridY)));maxOutlineSnapError=Math.max(maxOutlineSnapError,Math.abs((outlineOrigin.x+8)-spriteGridX*16),Math.abs((outlineOrigin.y+8)-Math.round(VIEW.floor+VIEW.boardOriginOffsetY-(spriteGridY-boardCamera)*16)));maxOutlineCanvasPositionFraction=Math.max(maxOutlineCanvasPositionFraction,Math.abs(outlineDestination.x-Math.round(outlineDestination.x)),Math.abs(outlineDestination.y-Math.round(outlineDestination.y)));}
      t.water=simulationWaterline;
      if(!frames.includes(frame))continue;
      if(frame===40)displayAtJumpPeak=g.canvas.toDataURL('image/png').split(',')[1];
      const occupied=[];for(let y=0;y<t.rows.length;y++)for(let x=0;x<7;x++)if(t.cell(x,y))occupied.push([x,y]);
      let visibleCells=0;for(const [x,y]of occupied){const cy=Math.round(112-(y+.5-g.camera[0])*16);if(cy>=0&&cy<160&&after[(cy*112+x*16+8)*4+3])visibleCells++;}
      samples.push({frame,height:t.egg.y,camera:g.camera[0],cameraPixels:g.camera[0]*16,boardCamera,boardCameraPixels:boardCamera*16,
        expectedBoardCameraPixels,boardOriginOffsetY:VIEW.boardOriginOffsetY,differentPixelsAfterClear:different,
        cells:occupied.length,visibleCells,visibleBoardCells:frameVisibleBoardCells,minimumRenderedCellPixels:frameMinimumRenderedCellPixels,
        visibleRowRange:[firstVisibleRow,endVisibleRow],outlineOrigin,outlineDestination});shots.push(copy());
    }
    const sheetColumns=everyFrame?10:5,sheet=document.createElement('canvas');sheet.width=sheetColumns*112;sheet.height=Math.ceil(shots.length/sheetColumns)*160;const sc=sheet.getContext('2d');
    shots.forEach((image,i)=>sc.drawImage(image,(i%sheetColumns)*112,Math.floor(i/sheetColumns)*160));
    const cellsAfter=t.rows.reduce((n,row)=>n+(row?.cells.filter(Boolean).length||0),0);
    return{display,displayAtJumpPeak,initialCells:cellsBefore,finalCells:cellsAfter,initialWaterline,renderWaterline,finalWaterline:t.water,peakHeight,frames:samples,nativeActorSamples:actorSamples,
      nativeCameraStartPixels:Number.isFinite(fixture.camera_position_q16_before_input)?VIEW.nativeCameraReferencePixels-fixture.camera_position_q16_before_input/65536:null,
      nativeCameraSamples:cameraSamples,maxNativeCameraErrorPixels:cameraSamples.reduce((m,s)=>Math.max(m,Math.abs(s.errorPixels)),0),
      boardCameraSamples,boardCameraComparison:{frames:boardCameraSamples.length,exactFrames:boardCameraSamples.filter(s=>s.errorPixels===0).length,
        maxAbsErrorPixels:boardCameraSamples.reduce((m,s)=>Math.max(m,Math.abs(s.errorPixels)),0)},
      settledNativeCameraSamples:cameraSamples.filter(sample=>sample.frame>=3).length,
      maxSettledNativeCameraErrorPixels:cameraSamples.filter(sample=>sample.frame>=3).reduce((m,s)=>Math.max(m,Math.abs(s.errorPixels)),0),
      nativeActorToleranceCells:fixture.tolerance_cells,maxHistoryDifference,totalHistoryDifference,omittedVisibleRows,unrenderedVisibleCells,unrenderedCellSamples,minimumRenderedCellPixels,boardMotionEvents,outlineFrames,maxOutlineGridFraction,maxOutlineSnapError,maxOutlineCanvasPositionFraction,historyEvents,
      maximumCamera:g.camera[0],sheet:sheet.toDataURL('image/png').split(',')[1]};
   })()`);
   const {sheet,displayAtJumpPeak,...analysis}=probe;await writeFile(path.join(artifacts,'jump-stack-jump-frames.png'),Buffer.from(sheet,'base64'));
   await writeFile(path.join(artifacts,'jump-stack-display-at-frame40.png'),Buffer.from(displayAtJumpPeak,'base64'));
   for(const [index,event]of analysis.historyEvents.entries())await writeFile(path.join(artifacts,`jump-stack-history-diff-${String(index+1).padStart(2,'0')}.png`),Buffer.from(event.comparison,'base64'));
   analysis.historyEvents=analysis.historyEvents.map(({comparison,...event})=>event);
   await writeFile(path.join(artifacts,'jump-stack-jump-frames.json'),JSON.stringify(analysis,null,2));
   console.log('Stack jump and rerender comparison:',{frames:analysis.frames.length,
    initialCells:analysis.initialCells,finalCells:analysis.finalCells,initialWaterline:analysis.initialWaterline,
    renderWaterline:analysis.renderWaterline,finalWaterline:analysis.finalWaterline,
    boardCameraComparison:analysis.boardCameraComparison,maxHistoryDifference:analysis.maxHistoryDifference,
    omittedVisibleRows:analysis.omittedVisibleRows,unrenderedVisibleCells:analysis.unrenderedVisibleCells,
    boardMotionEvents:analysis.boardMotionEvents.length,outlineFrames:analysis.outlineFrames,
    maxOutlineGridFraction:analysis.maxOutlineGridFraction,maxOutlineSnapError:analysis.maxOutlineSnapError});
   if(analysis.initialCells!==jumpStackFixture.cells||analysis.finalCells!==analysis.initialCells)throw Error('The ROM-derived supported stack changed while the actor jumped');
   if(analysis.boardMotionEvents.length)throw Error('The stable reference stack moved during the jump: '+JSON.stringify(analysis.boardMotionEvents));
   if(analysis.nativeActorSamples.length!==jumpStackFixture.native_samples.length||analysis.nativeActorSamples.some(sample=>sample.error.x>jumpStackFixture.tolerance_cells||sample.error.y>jumpStackFixture.tolerance_cells||sample.error.vy>jumpStackFixture.tolerance_cells))throw Error('Player jump trajectory diverges from the native ROM samples: '+JSON.stringify(analysis.nativeActorSamples));
   if(Math.abs(analysis.peakHeight-jumpStackFixture.native_peak_height)>jumpStackFixture.tolerance_cells)throw Error('Jump peak height diverges from the native ROM: '+analysis.peakHeight+' vs '+jumpStackFixture.native_peak_height);
   if(analysis.maxHistoryDifference)throw Error('Jump frames depend on previous canvas contents: '+analysis.maxHistoryDifference+' pixels');
   if(analysis.omittedVisibleRows)throw Error('Visible placed rows were skipped during the jump: '+analysis.omittedVisibleRows);
   if(analysis.unrenderedVisibleCells)throw Error('Visible placed cells match the empty stage background during the jump: '+JSON.stringify(analysis.unrenderedCellSamples));
   if(analysis.frames.some(sample=>{
     const expected=jumpStackFixture.rows_bottom_up.reduce((count,row,y)=>{
       const top=Math.round(112+sample.boardOriginOffsetY-(y+1-sample.boardCamera)*16);
       return count+(top>=0&&top+16<=160?row.filter(Boolean).length:0);
     },0);
      return sample.boardCameraPixels!==sample.expectedBoardCameraPixels||sample.visibleBoardCells!==expected;
   }))throw Error('Placed cells do not follow the previous-frame native BG0 camera: '+JSON.stringify(analysis.frames.map(sample=>({frame:sample.frame,camera:sample.camera,boardCamera:sample.boardCamera,expectedBoardCameraPixels:sample.expectedBoardCameraPixels,visibleBoardCells:sample.visibleBoardCells}))));
   if(analysis.boardCameraComparison.frames!==90||analysis.boardCameraComparison.exactFrames!==90)
     throw Error('Board BG0 camera is not one native update behind the actor camera: '+JSON.stringify(analysis.boardCameraComparison));
    if(jumpStackFixture.expect_preview_outline!==false){
      if(!analysis.outlineFrames)throw Error('No native landing outline was rendered during the jump');
      if(jumpStackFixture.preview_probe&&analysis.outlineFrames!==jumpStackFixture.input.total_frames)
        throw Error('The preview-outline jump probe did not render on every simulated frame: '+analysis.outlineFrames);
      if(analysis.maxOutlineGridFraction||analysis.maxOutlineSnapError)throw Error('The landing outline moved off the integer cell grid: '+analysis.maxOutlineGridFraction+'/'+analysis.maxOutlineSnapError);
    }
   if(analysis.maxOutlineCanvasPositionFraction)throw Error('The landing outline reached a fractional output-canvas coordinate: '+analysis.maxOutlineCanvasPositionFraction);
   break;
  }
  if(scene==='water'){
   await client.evaluate(`(async()=>{const {advanceView}=await import('./games/eggo-mania/view.js');const g=window.app.currentGame;g.p={...g.p,waterSpeed:0,hazards:false,seed:42};g.seed=42;g.startRound({intro:false});g.player.spawn=100;for(let frame=1;frame<=90;frame++){g.player.update(1/60,{dive:frame===2});advanceView(g.views[0],g.player,1/60);g.camera[0]=g.views[0].camera;}g.render();})()`);
   await delay(300);
  }
  await client.evaluate(`(()=>{const g=window.app.currentGame;if('${scene}'==='tower'){for(const [i,t] of [g.player,g.cpu].entries()){for(let y=0;y<7-i*2;y++){const row=t.row(y);for(let x=0;x<t.p.columns;x++)row.cells[x]=1+(Math.floor(x/2)+y)%8;row.sealed=true;}t.egg.y=t.height();t.held={cells:[[0,0],[1,0],[2,0],[1,1]],color:4};t.crates=[{x:2,y:t.height()+5,cells:[[0,0],[1,0],[2,0],[3,0]],color:2},{x:6,y:t.height()+8,item:'bomb'}];t.water=2;t.score=640;t.lines=t.height();t.notice='Complete floors keep the water out';t.noticeTime=5;}}g.render();})()`);
  if(scene==='balloon')await client.evaluate(`(()=>{const g=window.app.currentGame;for(const t of [g.player,g.cpu]){for(let y=t.height();y<g.p.goal-2;y++){t.row(y).cells.fill(y%8+1);t.rows[y].sealed=true;}t.egg.y=t.height();}g.render();})()`);
  if(scene==='tower'||scene==='balloon')await client.evaluate(`(async()=>{const {advanceView}=await import('./games/eggo-mania/view.js');const g=window.app.currentGame;for(const [i,t] of [g.player,g.cpu].entries()){for(let n=0;n<60;n++)advanceView(g.views[i],t,1/60);g.camera[i]=g.views[i].camera;}g.render();})()`);
  const wake=setInterval(()=>client.call('Page.captureScreenshot',{format:'png',fromSurface:false}).catch(()=>{}),700);
  const shot=await client.call('Page.captureScreenshot',{format:'png',fromSurface:true});clearInterval(wake);await writeFile(path.join(artifacts,scene+'.png'),Buffer.from(shot.data,'base64'));
  const pixel=await client.evaluate(`window.app.currentGame.pixelCanvas.toDataURL('image/png').split(',')[1]`);
  await writeFile(path.join(artifacts,scene+'.native.png'),Buffer.from(pixel,'base64'));
  if(scene==='podium-game-over'){
   const source='scripts/OUTPUT/eggo-reference_2026-10-04_21-52-47_847032/survival-podium.frame00360.png';
   const reference=await readFile(path.join(root,source));
   const comparison=await client.evaluate(`(async()=>{const i=new Image();i.src='data:image/png;base64,${reference.toString('base64')}';await i.decode();const g=window.app.currentGame,canvas=document.createElement('canvas');canvas.width=240;canvas.height=160;const c=canvas.getContext('2d');c.drawImage(i,0,0);const a=c.getImageData(0,0,240,160).data,b=g.pixelCanvas.getContext('2d').getImageData(0,0,240,160).data;let differentPixels=0;for(let p=0;p<a.length;p+=4)if(a[p]!==b[p]||a[p+1]!==b[p+1]||a[p+2]!==b[p+2])differentPixels++;return {width:240,height:160,differentPixels};})()`);
   await writeFile(path.join(artifacts,'podium-comparison.json'),JSON.stringify({...comparison,source,sourceSha256:createHash('sha256').update(reference).digest('hex')},null,2));
   if(comparison.differentPixels)throw Error('Podium differs from original: '+comparison.differentPixels+' pixels');
  }
  if(scene==='reference'){
   const fixture=JSON.parse(await readFile(path.join(root,'tests','fixtures','eggo-mania-gba.json'),'utf8'));
   const source=path.join(root,fixture.source,`bot-tower.frame${String(fixture.captured_at_frame).padStart(5,'0')}.png`);
   const reference=await readFile(source);
   const comparison=await client.evaluate(`(async()=>{
    const image=new Image();image.src='data:image/png;base64,${reference.toString('base64')}';await image.decode();
    const canvas=document.createElement('canvas');canvas.width=112;canvas.height=160;const context=canvas.getContext('2d');
    context.drawImage(image,0,0,112,160,0,0,112,160);const a=context.getImageData(0,0,112,160).data;
    const {VIEW}=await import('./games/eggo-mania/view.js');
    const g=window.app.currentGame,t=g.player,baseFrame=t.nativeFrame,output=g.pixelCanvas.getContext('2d');
    let differentPixels=0,absoluteChannelError=0;let b=output.getImageData(0,0,112,160).data;
    for(let p=0;p<a.length;p+=4){let different=false;for(let c=0;c<3;c++){const delta=Math.abs(a[p+c]-b[p+c]);absoluteChannelError+=delta;if(delta)different=true;}if(different)differentPixels++;}
    const cycle=VIEW.factoryWaterSurfaceFramePeriod,
      phaseTick=((baseFrame+VIEW.factoryWaterSurfaceFrameOffset)%cycle+cycle)%cycle,
      atlasFrame=Math.floor(phaseTick/VIEW.factoryWaterSurfaceTicksPerFrame);
    let waterError=0,lowerError=0;
    for(let y=136;y<148;y++)for(let x=0;x<112;x++){const p=(y*112+x)*4;for(let c=0;c<3;c++)waterError+=Math.abs(a[p+c]-b[p+c]);}
    for(let y=148;y<153;y++)for(let x=0;x<112;x++){const p=(y*112+x)*4;for(let c=0;c<3;c++)lowerError+=Math.abs(a[p+c]-b[p+c]);}
    const best={offset:0,atlasFrame,meanAbsoluteChannelError:waterError/(112*12*3),lowerWaterAndMeterMeanAbsoluteChannelError:lowerError/(112*5*3)},
      bestLower={...best},phases=[best];
    const stableFrame=output.getImageData(0,0,240,160).data;let renderInstabilityPixels=0;
    for(let repeat=0;repeat<8;repeat++){
      g.render();const repeated=output.getImageData(0,0,240,160).data;
      for(let p=0;p<stableFrame.length;p+=4)if(stableFrame[p]!==repeated[p]||stableFrame[p+1]!==repeated[p+1]||stableFrame[p+2]!==repeated[p+2])renderInstabilityPixels++;
    }
    if(renderInstabilityPixels)throw Error('Identical game state rendered differently: '+renderInstabilityPixels+' pixel samples');
    g.render();
    const sourceFull=document.createElement('canvas');sourceFull.width=240;sourceFull.height=160;const sf=sourceFull.getContext('2d');sf.drawImage(image,0,0);const sourcePixels=sf.getImageData(0,0,240,160).data;g.views[1].boardCamera=${fixture.cpu_capture.view.board_camera};g.render();const renderPixels=output.getImageData(0,0,240,160).data,diffCanvas=document.createElement('canvas');diffCanvas.width=240;diffCanvas.height=160;const dc=diffCanvas.getContext('2d'),diffPixels=dc.createImageData(240,160);let fullDifferentPixels=0,leftFieldDifferentPixels=0,dividerDifferentPixels=0,rightFieldDifferentPixels=0,minX=240,minY=160,maxX=-1,maxY=-1;for(let y=0;y<160;y++)for(let x=0;x<240;x++){const p=(y*240+x)*4,different=sourcePixels[p]!==renderPixels[p]||sourcePixels[p+1]!==renderPixels[p+1]||sourcePixels[p+2]!==renderPixels[p+2];if(different){fullDifferentPixels++;if(x<112)leftFieldDifferentPixels++;else if(x<128)dividerDifferentPixels++;else rightFieldDifferentPixels++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);diffPixels.data[p]=255;diffPixels.data[p+1]=0;diffPixels.data[p+2]=255;diffPixels.data[p+3]=255;}else{diffPixels.data[p]=sourcePixels[p];diffPixels.data[p+1]=sourcePixels[p+1];diffPixels.data[p+2]=sourcePixels[p+2];diffPixels.data[p+3]=255;}}dc.putImageData(diffPixels,0,0);const fullDiff=diffCanvas.toDataURL('image/png').split(',')[1],fullNative=sourceFull.toDataURL('image/png').split(',')[1],renderNative=g.pixelCanvas.toDataURL('image/png').split(',')[1];
    const occupied=${JSON.stringify(fixture.rows_bottom_up.flatMap((row,y)=>row.flatMap((owner,x)=>owner?[[x,y]]:[])))},actor=${JSON.stringify(fixture.egg_measurement)},crates=${JSON.stringify(fixture.crates||[])};let placedCellDifferentPixels=0,placedCellPixelsChecked=0;
    const overlays=[{x:actor.screen_x-actor.anchor_x,y:actor.screen_y-actor.anchor_y,w:64,h:64},...crates.map(item=>({x:Math.round(item.x*VIEW.tile)-VIEW.itemSize/2,y:Math.round(VIEW.floor-(item.y-${fixture.view.foreground_pixels}/16)*VIEW.tile)-VIEW.itemSize/2,w:VIEW.itemSize,h:VIEW.itemSize}))];
    for(const [x,y] of occupied){const top=Math.round(VIEW.floor-(y+1-${fixture.view.foreground_pixels}/16)*VIEW.tile);for(let py=top;py<top+VIEW.tile;py++)for(let px=x*VIEW.tile;px<(x+1)*VIEW.tile;px++){if(overlays.some(o=>px>=o.x&&px<o.x+o.w&&py>=o.y&&py<o.y+o.h))continue;placedCellPixelsChecked++;const p=(py*112+px)*4;if(a[p]!==b[p]||a[p+1]!==b[p+1]||a[p+2]!==b[p+2])placedCellDifferentPixels++;}}
    if(placedCellDifferentPixels)throw Error('Unoccluded placed-cell artwork differs from ROM: '+placedCellDifferentPixels+' pixels');
    return {width:112,height:160,differentPixels,meanAbsoluteChannelError:absoluteChannelError/(112*160*3),placedCellDifferentPixels,placedCellPixelsChecked,repeatedRenderChecks:8,renderInstabilityPixels,fullScreen:{width:240,height:160,differentPixels:fullDifferentPixels,leftFieldDifferentPixels,dividerDifferentPixels,rightFieldDifferentPixels,bounds:maxX<0?null:{minX,minY,maxX,maxY},cpuBoardCamera:${fixture.cpu_capture.view.board_camera},cpuPickups:g.cpu.crates.map(({nativeKind,nativeVariant,x,y})=>({nativeKind,nativeVariant,x,y})),diagnosticOnly:true,diffPng:fullDiff,sourcePng:fullNative,renderPng:renderNative},factoryWaterPhase:{nativeFrame:baseFrame,predictedAtlasPhase:atlasFrame,best,bestLower,bestOffsetFromNativeFrame:best.offset,lowerBestOffset:bestLower.offset,roi:{x:0,y:136,width:112,height:12},lowerRoi:{x:0,y:148,width:112,height:5},candidates:phases}};
   })()`);
   const {diffPng,sourcePng,renderPng,...comparisonReport}=comparison.fullScreen;await writeFile(path.join(artifacts,'reference-fullscreen-diff.png'),Buffer.from(diffPng,'base64'));await writeFile(path.join(artifacts,'reference-fullscreen.source.png'),Buffer.from(sourcePng,'base64'));await writeFile(path.join(artifacts,'reference-fullscreen.render.png'),Buffer.from(renderPng,'base64'));
   await writeFile(path.join(artifacts,'reference-comparison.json'),JSON.stringify({...comparison,fullScreen:comparisonReport,source:path.relative(root,source),sourceSha256:createHash('sha256').update(reference).digest('hex')},null,2));
   if(comparison.differentPixels)throw Error('Reference screenshot differs from the ROM: '+comparison.differentPixels+' player-field pixels; comparison artifacts were saved');
   const panels=await client.evaluate(`(async()=>{const {drawTowerPanels}=await import('./games/eggo-mania/pixel-renderer.js');const t=window.app.currentGame.player;const image=document.createElement('canvas');image.width=t.p.columns*16;image.height=t.height()*16;const c=image.getContext('2d');c.imageSmoothingEnabled=false;drawTowerPanels(c,t,x=>x*16,y=>(t.height()-y)*16);return image.toDataURL('image/png').split(',')[1];})()`);
   await writeFile(path.join(artifacts,'panels.native.png'),Buffer.from(panels,'base64'));
   const waterPriority=await client.evaluate(`(async()=>{
    const {nativeCellArt}=await import('./games/eggo-mania/model.js');
    const {NATIVE_PIECE_MASKS}=await import('./games/eggo-mania/assets/native-piece-masks.js');
    const {drawTowerPanels}=await import('./games/eggo-mania/pixel-renderer.js');
    const g=window.app.currentGame;g.startingStage=0;g.round=1;g.startRound({intro:false});g.camera=[0,0];
    const t=g.player;t.rows=[];t.nativeFrame=0;t.water=2.5;t.held=null;t.placing=null;t.crates=[];t.spawn=Infinity;
    Object.assign(t.egg,{x:5,y:20,ground:false,walking:false});
    const mask=NATIVE_PIECE_MASKS[6],minX=Math.min(...mask.map(([x])=>x)),maxY=Math.max(...mask.map(([,y])=>y));
    const cells=mask.map(([x,y])=>[x-minX,maxY-y]);
    for(const [x,y] of cells)t.setCell(x,y,1,19,0,nativeCellArt(6,0,x,y));
    const expected=document.createElement('canvas');expected.width=112;expected.height=160;
    const ec=expected.getContext('2d');ec.imageSmoothingEnabled=false;drawTowerPanels(ec,t,x=>x*16,y=>112-y*16,0,2);
    const a=ec.getImageData(0,0,112,160).data;
    const water=new Image();water.src='./games/eggo-mania/assets/factory-water-body.png';await water.decode();
    const source=document.createElement('canvas');source.width=112;source.height=16;const sc=source.getContext('2d');
    let blendedTilePixels=0,changedTilePixels=0,waterAlphaPixels=0;
    for(let frame=0;frame<32;frame++){
     t.nativeFrame=frame;g.render();const b=g.pixelCanvas.getContext('2d').getImageData(0,0,112,160).data;
     sc.clearRect(0,0,112,16);sc.drawImage(water,0,frame*256+112,112,16,0,0,112,16);
     const alpha=sc.getImageData(0,0,112,16).data;
     for(const [x,y] of cells){const top=112-(y+1)*16;for(let py=Math.max(top,96);py<Math.min(top+16,112);py++)for(let px=x*16;px<(x+1)*16;px++){
      const p=(py*112+px)*4,q=((py-96)*112+px)*4;if(!a[p+3])continue;blendedTilePixels++;
      if(alpha[q+3])waterAlphaPixels++;
      if(a[p]!==b[p]||a[p+1]!==b[p+1]||a[p+2]!==b[p+2])changedTilePixels++;
     }}
    }
    if(!waterAlphaPixels||changedTilePixels)throw Error('Filled blocks changed across factory-water animation: '+changedTilePixels+'/'+blendedTilePixels);
    return{waterFrames:32,waterSurfaceY:72,blendedTilePixels,waterAlphaPixels,changedTilePixels,
     expected:'Opaque board cells remain unchanged across all animated water frames'};
   })()`);
   await writeFile(path.join(artifacts,'water-tile-priority.json'),JSON.stringify(waterPriority,null,2));
   const outlineManifestPath='tests/fixtures/eggo-piece-outlines-gba.json';
   const outlineManifest=JSON.parse(await readFile(path.join(root,outlineManifestPath),'utf8'));
   const outlineReferences=await Promise.all(outlineManifest.captures.map(async capture=>({
    kind:capture.kind,source:capture.fixture,sha256:capture.sha256,
    data:(await readFile(path.join(root,capture.fixture))).toString('base64'),
   })));
   const outlineComparison=await client.evaluate(`(async()=>{
    const {nativePiecePreviewArt}=await import('./games/eggo-mania/pixel-renderer.js');
    const captures=${JSON.stringify(outlineReferences)},perKind=[];
    for(const capture of captures){
     const reference=new Image();reference.src='data:image/png;base64,'+capture.data;await reference.decode();
     const actual=nativePiecePreviewArt(capture.kind),expected=document.createElement('canvas');expected.width=expected.height=64;
     const context=expected.getContext('2d');context.drawImage(reference,0,0);const a=context.getImageData(0,0,64,64).data;
     const b=actual.getContext('2d').getImageData(0,0,64,64).data;let differentPixels=0;
     for(let p=0;p<a.length;p+=4)if(a[p]!==b[p]||a[p+1]!==b[p+1]||a[p+2]!==b[p+2]||a[p+3]!==b[p+3])differentPixels++;
     perKind.push({kind:capture.kind,differentPixels});
    }
    return{width:64,height:64,totalDifferentPixels:perKind.reduce((sum,item)=>sum+item.differentPixels,0),perKind};
   })()`);
   await writeFile(path.join(artifacts,'piece-outline-comparison.json'),JSON.stringify({
    ...outlineComparison,reference:outlineManifestPath,romSha256:outlineManifest.rom_sha256,
    captures:outlineManifest.captures.map(({kind,source,fixture,sha256})=>({kind,source,fixture,sha256})),
   },null,2));
   if(outlineComparison.totalDifferentPixels)throw Error('Native connected-piece outline differs from captured OAM: '+JSON.stringify(outlineComparison.perKind));
   const affineManifestPath='tests/fixtures/eggo-preview-affine-pixels-gba.json';
   const affineManifest=JSON.parse(await readFile(path.join(root,affineManifestPath),'utf8'));
   const affineReferences=await Promise.all(affineManifest.contact_sheets.map(async name=>{
    const image=await readFile(path.join(root,'tests/fixtures',name));
    const sha256=createHash('sha256').update(image).digest('hex');
    if(sha256!==affineManifest.contact_sheet_sha256[name])throw Error('Affine pixel fixture hash changed: '+name);
    return{name,data:image.toString('base64')};
   }));
   const affineComparison=await client.evaluate(`(async()=>{
    const {nativePiecePreviewAffineArt}=await import('./games/eggo-mania/pixel-renderer.js');
    const captures=${JSON.stringify(affineManifest.captures)},references=${JSON.stringify(affineReferences)};
    const images=[];
    for(const reference of references){const image=new Image();image.src='data:image/png;base64,'+reference.data;await image.decode();images.push(image);}
    const contactSheets=Array.from({length:4},()=>{const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;return canvas;});
    const differentByOrientation=Array(4).fill(0),differentSamples=[];let comparedPixels=0;
    for(const capture of captures){
     const expectedSheet=images[capture.orientation],expected=document.createElement('canvas');expected.width=expected.height=64;
     const ec=expected.getContext('2d'),sheetCanvas=contactSheets[capture.orientation],sc=sheetCanvas.getContext('2d');
     for(const frame of capture.frames){
      ec.clearRect(0,0,64,64);ec.drawImage(expectedSheet,(frame.tick-1)*64,capture.kind*64,64,64,0,0,64,64);
      const expectedPixels=ec.getImageData(0,0,64,64).data;
      const actual=nativePiecePreviewAffineArt(capture.kind,0,frame.matrix),actualPixels=actual.getContext('2d').getImageData(0,0,64,64).data;
      let differentPixels=0,firstDifferences=[];
      for(let p=0;p<expectedPixels.length;p+=4){
       if(expectedPixels[p]!==actualPixels[p]||expectedPixels[p+1]!==actualPixels[p+1]||expectedPixels[p+2]!==actualPixels[p+2]||expectedPixels[p+3]!==actualPixels[p+3]){
        differentPixels++;if(firstDifferences.length<12)firstDifferences.push({x:(p/4)%64|0,y:Math.floor(p/256),expected:Array.from(expectedPixels.slice(p,p+4)),actual:Array.from(actualPixels.slice(p,p+4))});
       }
      }
      comparedPixels+=4096;differentByOrientation[capture.orientation]+=differentPixels;
      if(differentPixels)differentSamples.push({orientation:capture.orientation,kind:capture.kind,tick:frame.tick,differentPixels,firstDifferences});
      sc.drawImage(actual,(frame.tick-1)*64,capture.kind*64);
     }
    }
    return{width:64,height:64,captures:captures.reduce((sum,capture)=>sum+capture.frames.length,0),comparedPixels,
     totalDifferentPixels:differentByOrientation.reduce((sum,value)=>sum+value,0),differentByOrientation,differentSamples,
     contactSheets:contactSheets.map(canvas=>canvas.toDataURL('image/png').split(',')[1])};
   })()`);
   for(const [orientation,data] of affineComparison.contactSheets.entries())
    await writeFile(path.join(artifacts,`preview-affine-app-orientation-${orientation}.png`),Buffer.from(data,'base64'));
   const {contactSheets,...affineReport}=affineComparison;
   await writeFile(path.join(artifacts,'preview-affine-comparison.json'),JSON.stringify({
    ...affineReport,reference:affineManifestPath,romSha256:affineManifest.rom_sha256,
    matrixFixture:affineManifest.matrix_fixture,matrixFixtureSha256:affineManifest.matrix_fixture_sha256,
    outlineSourceSha256:affineManifest.outline_source_sha256,
   },null,2));
   if(affineComparison.totalDifferentPixels)throw Error('Rotated outline pixels differ from ROM-derived reference: '+JSON.stringify(affineComparison.differentSamples.slice(0,8)));
  }
 }
 if(charactersOnly){
 await client.evaluate(`(async()=>{const {CHARACTER_ART}=await import('./games/eggo-mania/assets/characters.js');await Promise.all(Object.keys(CHARACTER_ART).flatMap(name=>['player-poses','podium-win','podium-loss'].map(suffix=>{const image=new Image();image.src='./games/eggo-mania/assets/'+name+'-'+suffix+'.png';return image.decode();})));})()`);
 await delay(100);
 const png=await client.evaluate(`(async()=>{const {CHARACTER_ART}=await import('./games/eggo-mania/assets/characters.js');const {settings}=await import('./games/eggo-mania/model.js');const g=window.app.currentGame;const grid=document.createElement('canvas');grid.width=960;grid.height=960;const c=grid.getContext('2d');let index=0;for(const name of Object.keys(CHARACTER_ART)){g.p=settings({...g.p,character:name});g.startRound({intro:false});g.player.held={cells:[[0,0]],color:8};for(let phase=0;phase<3;phase++){g.phase=phase===0?'playing':phase===1?'won':'lost';g.resultTicks=270;g.render();c.drawImage(g.pixelCanvas,(index%4)*240,Math.floor(index/4)*480+phase*160,240,160);}index++;}return grid.toDataURL('image/png').split(',')[1];})()`);
 await writeFile(path.join(artifacts,'characters-grid.png'),Buffer.from(png,'base64'));
 }
 if(rivalsOnly){
 await client.evaluate(`(async()=>{const {SURVIVAL_STAGES}=await import('./games/eggo-mania/model.js');await Promise.all(SURVIVAL_STAGES.map(stage=>{const image=new Image();image.src='./games/eggo-mania/assets/'+stage+'-rival-poses.png';return image.decode();}));})()`);
 await delay(300);
 const grid=await client.evaluate(`(async()=>{const {SURVIVAL_STAGES}=await import('./games/eggo-mania/model.js');const {rivalPose}=await import('./games/eggo-mania/view.js');const g=window.app.currentGame;const grid=document.createElement('canvas');grid.width=960;grid.height=480;const c=grid.getContext('2d');for(let phase=0;phase<3;phase++)for(let i=0;i<8;i++){g.round=i+1;g.startRound({intro:false});const t=g.cpu;t.artStage=SURVIVAL_STAGES[i];t.held={cells:[[0,0]],color:8};Object.assign(t.egg,{ground:phase===0,walking:phase===0,vy:phase===1?3:-3,floating:false});t.time=phase*8/60;const pose=rivalPose(t);if(!pose||!Number.isInteger(pose.frame))throw Error('Missing rival pose: '+t.artStage);g.render();c.drawImage(g.pixelCanvas,128,0,112,160,(i%8)*120,phase*160,112,160);}return grid.toDataURL('image/png').split(',')[1];})()`);
 await writeFile(path.join(artifacts,'rivals-grid.png'),Buffer.from(grid,'base64'));
 }
 if(stagesOnly||(!throwOnly&&!looseOnly&&!musicOnly&&!dragonOnly&&!castleOnly&&!pirateOnly&&!beanstalkThiefOnly&&!parkOnly&&!factoryEnemyOnly&&!spaceOnly&&!jungleOnly&&!jungleThiefOnly&&!jumperOnly&&!bubbleOnly&&!hammerOnly&&!cloudOnly&&!arenaOnly&&!resultOnly&&!bombOnly&&!rivalsOnly&&!charactersOnly&&!waterOnly&&!referenceOnly&&!surgeOnly&&!fillerOnly&&!pickupOnly&&!nativePickupOnly&&!introOnly&&!jumpStackOnly)){
 const grid=await client.evaluate(`(()=>{const g=window.app.currentGame;const grid=document.createElement('canvas');grid.width=960;grid.height=320;const c=grid.getContext('2d');for(let i=0;i<8;i++){g.round=i+1;g.render();c.drawImage(g.pixelCanvas,(i%4)*240,Math.floor(i/4)*160,240,160);}g.round=1;g.render();return grid.toDataURL('image/png').split(',')[1];})()`);
 await writeFile(path.join(artifacts,'stage-grid.png'),Buffer.from(grid,'base64'));
 if(!stagesOnly){const png=await client.evaluate(`window.app.currentGame.canvas.toDataURL('image/png').split(',')[1]`);await writeFile(path.join(root,'renderer/games/eggo-mania/thumbnail.png'),Buffer.from(png,'base64'));}
 }
 console.log('Screenshots saved:',artifacts);
}finally{client?.close();child.kill();}
