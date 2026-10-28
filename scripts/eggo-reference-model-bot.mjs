// Research-only bridge: run the reconstructed Survival CPU policy on a live
// native field snapshot. The Python reference runner sends one raw 256 KiB
// GBA RAM image per frame and consumes a 16-bit native key mask in response.
import fs from 'node:fs';
import Game from '../renderer/games/eggo-mania/game.js';
import {settings, RULES, nativePickupItem} from '../renderer/games/eggo-mania/model.js';
import {NativePieceSweep, CPU_PARAMETERS, nativePreview} from '../renderer/games/eggo-mania/native-cpu.js';

const RAM_BYTES = 262144;
// Native RAM fields used to carry player status and the outer play/result gate.
const NATIVE_RAM = Object.freeze({gameState: 0x10, controller: 0x5a40, cpuDifficulty: 0xf0, bootsTimerBase: 0x4500,
  fieldStride: 0x137c, framesPerSecond: 60});
const mode = process.argv[2] ?? 'model-player';
if (!['model-player', 'shadow-cpu', 'open-loop-cpu', 'stateful-cpu'].includes(mode)) throw new Error(`Unknown bridge mode: ${mode}`);
const readI32 = (ram, at) => ram.readInt32LE(at);
const readU32 = (ram, at) => ram.readUInt32LE(at);
const fixed = (ram, at) => readI32(ram, at) / 65536;
const stageNames = ['beanstalk', 'factory', 'dragon', 'castle', 'pirate', 'space', 'jungle', 'park'];
const memory = Buffer.alloc(RAM_BYTES);
let game, towers, nativeConfig, stageName, simulateTower;
let heldKeys = [-2, -2];
let openLoopInitialized = false;
let traceFrame = 0;
const traceStream = ['open-loop-cpu', 'stateful-cpu'].includes(mode) && process.argv[3]
  ? fs.createWriteStream(process.argv[3], {flags: 'w'}) : null;

function initialize(ram) {
  const words = Array.from({length: 19}, (_, i) => readI32(ram, 0xe928 + i * 4));
  nativeConfig = {words, difficulty: 2, level: 1, seed: 1, primary: words[0], secondary: words[1],
    weights: words.slice(2, 15), divisor: words[18], height: words[17]};
  const stageId = ((readI32(ram, 0x3294) % 8) + 8) % 8;
  stageName = stageNames[stageId];
  const stageIndex = stageNames.indexOf(stageName);
  const p = settings({mode: 'survival', difficulty: 'hard', columns: 7, goal: 37,
    waterSpeed: 0, crateInterval: 1.1, aiDelay: 0, hazards: true, seed: 1});
  game = new Game();
  game.p = p;
  game.seed = 1;
  game.round = 1;
  game.startingStage = stageIndex;
  game.startRound({intro: false});
  towers = [game.player, game.cpu];
  game.p.nativeConfig = nativeConfig;
  for (const [field, tower] of towers.entries()) {
    tower.p.nativeConfig = nativeConfig;
    tower.fieldIndex = field;
    tower.artStage = stageName;
    tower.jumper.type = stageName === 'jungle' ? RULES.jungleType : RULES.jumperType;
  }
  game.cpu = towers[mode === 'shadow-cpu' || mode === 'open-loop-cpu' || mode === 'stateful-cpu' ? 1 : 0];
  game.player = towers[mode === 'shadow-cpu' || mode === 'open-loop-cpu' || mode === 'stateful-cpu' ? 0 : 1];
  if (mode === 'open-loop-cpu') {
  simulateTower = game.updateTower.bind(game);
  game.updateTower = (tower, dt, control, opponent) => {
    if (tower === game.cpu) {
      // onRam runs after the original actor tick and returns this frame's
      // newly produced mask for the next mGBA tick. Step the shadow actor with
      // that returned mask so its post-step pose is compared with the next
      // native RAM snapshot, while the live game keeps its own one-tick queue.
      const nextControl = {nativeMotion: true, ...(game.lastModelControl ?? {})};
      if (tower.nativeActorState === 4 && tower.nativeActorNextState === 0)
        nextControl.nativeFreezeActor = true;
      game.lastAppliedControl = nextControl;
      simulateTower(tower, dt, nextControl, opponent);
    }
  };
} else {
    game.updateTower = (_tower, _dt, control) => {
      // Game.stepCPUActor stores the fresh policy decision before advancing
      // the actor with its queued prior input. Keep those two signals separate
      // in shadow/stateful measurements instead of overwriting the decision.
      game.lastAppliedControl = control ?? {};
    };
  }
}

function readPickups(ram, field) {
  const manager = field === 0 ? 0x34e4 : 0x4860;
  let pointer = readU32(ram, manager + 0x418);
  const items = [], seen = new Set();
  while (pointer && items.length < 18) {
    const at = pointer - 0x02000000 - 0x1c;
    if (at < 0 || at > RAM_BYTES - 0x34 || seen.has(at)) break;
    seen.add(at);
    // The list stores signed 16.16 pixels; Tower.nativeMotion uses pixels.
    const motion = {x: fixed(ram, at), y: fixed(ram, at + 4),
      vx: fixed(ram, at + 0x14), vy: fixed(ram, at + 0x18),
      state: readI32(ram, at + 0x24), kind: readI32(ram, at + 0x28),
      variant: readI32(ram, at + 0x2c), wait: readI32(ram, at + 0x30)};
    if (motion.kind >= 0 && motion.kind <= 12) {
      motion.active = motion.state !== 0;
      items.push({...nativePickupItem(motion, 7), age: 0});
    }
    pointer = readU32(ram, at + 0x1c);
  }
  return items;
}

function syncTower(ram, field) {
  const tower = towers[field];
  const actor = field === 0 ? 0x3bd4 : 0x4f50;
  const board = 0x10084 + field * 0x124c;
  const pickupManager = field === 0 ? 0x34e4 : 0x4860;
  const fieldSeed = readU32(ram, field === 0 ? 0x11ab0 : 0x11ab4) & 0xffff;
  tower.nativeEnemySeed = fieldSeed;
  if (tower.nativePickups) {
    tower.nativePickups.seed = fieldSeed;
    tower.nativePickups.clock = readI32(ram, pickupManager + 0x428);
    tower.nativePickups.bag = Array.from({length: 13}, (_, i) => readI32(ram, pickupManager + 4 + i * 4));
    tower.nativePickups.remaining = readI32(ram, pickupManager + 0x38);
    tower.spawn = tower.nativePickups.clock * RULES.step;
    tower.lastNativeSpawn = tower.spawn;
  }
  tower.nativeFrame = readI32(ram, 0x11a9c);
  tower.fieldIndex = field;
  tower.artStage = stageName;
  const worldX = fixed(ram, actor), worldY = fixed(ram, actor + 4);
  tower.nativeActorRotation = readI32(ram, actor + 0x868) & 3;
  tower.nativeActorState = readI32(ram, actor + 0x874);
  tower.nativeActorNextState = readI32(ram, actor + 0x878);
  const nativeVy = fixed(ram, actor + 0x18);
  tower.egg.x = (worldX + 16) / 16;
  tower.egg.y = (RULES.nativeActorFloor - worldY) / 16;
  tower.egg.vy = -nativeVy * 60 / 16;
  tower.egg.facing = fixed(ram, actor + 0x14) < 0 ? -1 : 1;
  // The boots timer is in native frames, while Tower stores remaining seconds.
  tower.egg.boost = readU32(ram, NATIVE_RAM.bootsTimerBase + field * NATIVE_RAM.fieldStride) /
    NATIVE_RAM.framesPerSecond;
  tower.egg.stun = 0;
  tower.egg.bubble = false;
  tower.egg.carried = false;
  tower.egg.swimming = false;
  tower.egg.lightning = null;
  tower.egg.offTower = false;
  tower.placing = null;

  for (let y = 0; y < 47; y++) {
    const rowAt = board + (46 - y) * 8;
    let row = tower.rows[y];
    let count = 0;
    for (let x = 0; x < 7; x++) if (ram[rowAt + x]) count++;
    if (!count && !row) continue;
    row ??= tower.row(y);
    for (let x = 0; x < 7; x++) {
      const cell = ram[rowAt + x];
      row.cells[x] = cell;
      row.owners[x] = cell ? 3 : 0;
      row.materials[x] = 0;
      row.nativeArt[x] = 0;
      row.filler[x] = null;
    }
  }
  tower.water = (RULES.nativeActorFloor + RULES.bubbleWaterlineBias - fixed(ram, actor - 0x1c)) / 16;

  const kind = readI32(ram, actor + 0x864);
  const variant = readI32(ram, actor + 0x868) & 3;
  const key = kind >= 0 && kind <= 12 ? kind * 4 + variant : -1;
  if (key < 0) {
    heldKeys[field] = -1;
    tower.held = null;
  } else {
    const motion = {kind, variant, x: 0, y: 0, vx: 0, vy: 0, state: 1, active: true, wait: 0};
    const nativeHeld = {...nativePickupItem(motion, 7), fuse: 0};
    if (key !== heldKeys[field] || !tower.held) {
      // A same-kind piece can return after a locally simulated commit. Recreate
      // it when the ROM still says one is held, while retaining its identity on
      // ordinary frames so the stateful controller does not restart its sweep.
      heldKeys[field] = key;
      tower.held = nativeHeld;
    } else {
      // Open-loop diagnostics locally advance the tower between RAM snapshots.
      // Always restore the ROM's orientation and piece cells without replacing
      // the object that game.updateCPU uses to detect a new held piece.
      Object.assign(tower.held, nativeHeld);
    }
  }
  // State 4 is the native twenty-eight-frame piece throw. Its half-unit
  // 16.16 counter is already at the current animation frame in the RAM
  // snapshot, so convert it to Tower's pre-update tick count. Importing this
  // state is essential for open-loop physics traces: clearing `placing` here
  // makes the local actor fall through the throw while the ROM follows its
  // stored origin/target arc.
  if (tower.nativeActorState === 4 && tower.held?.cells && tower.held.nativeKind <= 7) {
    const originX = fixed(ram, actor + 0x8d8);
    const originY = fixed(ram, actor + 0x8dc);
    const targetX = fixed(ram, actor + 0x8bc);
    const targetY = fixed(ram, actor + 0x8c0);
    tower.placing = {
      x: 0, y: 0, cells: tower.held.cells, color: tower.held.color,
      material: tower.held.material ?? 0, nativeHeld: tower.held,
      nativeRotation: variant,
      ticks: Math.max(0, Math.round(fixed(ram, actor + 0x87c) * 2)),
      time: RULES.throwTime, startY: tower.egg.y + 1,
      eggX: (originX + 16) / 16,
      eggY: (RULES.nativeActorFloor - originY) / 16,
      targetX: (targetX + 16) / 16,
      targetY: (RULES.nativeActorFloor - targetY) / 16,
    };
  }
  // Tower.crates is creation order (oldest first); the native manager is a
  // newest-first linked list and nativeEmptyControl walks it backwards.
  tower.crates = readPickups(ram, field).reverse();

  const entitySide = field * 0x80;
  const primaryAt = 0x31038 + entitySide;
  const secondaryAt = 0x31138 + entitySide;
  for (const [name, at] of [[stageName === 'factory' ? 'bubble' : stageName, primaryAt],
    [stageName === 'factory' ? 'factorySecondary' : `${stageName}Secondary`, secondaryAt]]) {
    const entity = tower[name];
    if (!entity) continue;
    entity.x = fixed(ram, at);
    entity.y = fixed(ram, at + 4);
    entity.vx = fixed(ram, at + 0x14);
    entity.vy = fixed(ram, at + 0x18);
    entity.animation = readI32(ram, at + 0x20);
    entity.type = readI32(ram, at + 0x24);
    entity.active = readI32(ram, at + 0x48) !== 0;
    entity.life = readI32(ram, at + 0x4c);
    entity.variant = readI32(ram, at + 0x50);
    entity.nativeHitX = fixed(ram, at + 0x40);
    entity.nativeHitY = fixed(ram, at + 0x44);
  }

  const xPx = worldX;
  const column = Math.max(0, Math.min(6, Math.floor((xPx + 17) / 16)));
  tower.egg.ground = Math.abs(nativeVy) < 1e-5 && Math.abs(tower.egg.y - tower.top(column)) < 0.12;
}

function controlMask(control) {
  let mask = 0;
  if (control.move > 0) mask |= 0x010;
  if (control.move < 0) mask |= 0x020;
  if (control.jump || control.float) mask |= 0x040;
  if (control.fast) mask |= 0x080;
  if (control.use) mask |= 0x001;
  if (control.rotate) mask |= 0x002;
  if (control.discard) mask |= 0x100;
  if (control.dive) mask |= 0x200;
  return mask;
}

function syncShadowController(ram) {
  const base = 0x5a40;
  const cpu = game.cpu;
  game.aiDifficulty = readI32(ram, base + 0xf0);
  game.aiTiming.clock = readI32(ram, base + 0xc8);
  game.aiTiming.counterCC = readI32(ram, base + 0xcc);
  game.aiTiming.counterD0 = readI32(ram, base + 0xd0);
  game.aiTiming.period = readI32(ram, base + 0x100);
  game.aiTiming.stall = readI32(ram, base + 0x104);
  game.aiRotation.wait = readI32(ram, base + 0xb4);
  game.aiRotationTarget = readI32(ram, base + 0xb8) & 3;
  game.aiPlacement.wait = readI32(ram, base + 0xfc);
  game.aiPreviousKeys = readI32(ram, base + 0xe8);
  Object.assign(game.aiTravel, {
    targetColumn: readI32(ram, base), waypoint: readI32(ram, base + 4),
    state: readI32(ram, base + 8),
    labels: Array.from({length: 7}, (_, i) => readI32(ram, base + 0xc + i * 4)),
    parents: Array.from({length: 7}, (_, i) => readI32(ram, base + 0x28 + i * 4)),
    counterD4: readI32(ram, base + 0xd4), groundRow: readI32(ram, base + 0xe4),
    idleTarget: readI32(ram, base + 0xf4),
  });
  game.aiTool = {targetColumn: readI32(ram, base), panicTimer: readI32(ram, base + 0xf8)};
  if (cpu.held?.cells && Number.isInteger(cpu.held.nativeKind) && cpu.held.nativeKind <= 7) {
    const search = game.aiSearch ??= new NativePieceSweep();
    Object.assign(search, {state: readI32(ram, base + 8),
      targetColumn: readI32(ram, base), bestRotation: readI32(ram, base + 0xb8),
      anchorX: readI32(ram, base + 0xc0), anchorY: readI32(ram, base + 0xc4),
      clock: readI32(ram, base + 0xc8), bestScore: readI32(ram, base + 0xd8),
      rotation: readI32(ram, base + 0xdc), column: readI32(ram, base + 0xe0)});
    search.best = search.bestScore > CPU_PARAMETERS.initialBestScore ? {
      score: search.bestScore, column: search.targetColumn, rotation: search.bestRotation,
      anchorX: search.anchorX, anchorY: search.anchorY, valid: search.bestScore > 0,
    } : null;
    game.aiHeld = cpu.held;
    if (search.state !== 2) game.aiPlan = null;
  }
}

function modelControllerSnapshot() {
  const t = game.cpu, sweep = game.aiSearch;
  return {
    x: t.egg.x, y: t.egg.y, vy: t.egg.vy, ground: t.egg.ground,
    boost: t.egg.boost, difficulty: game.aiDifficulty ?? CPU_PARAMETERS.hardDifficulty,
    actorRotation: t.nativeActorRotation, heldKind: t.held?.nativeKind ?? -1,
    heldRotation: t.held?.nativeVariant ?? -1,
    nativeActorState: t.nativeActorState ?? null,
    nativeActorNextState: t.nativeActorNextState ?? null,
    localPreview: t.preview(), nativePreview: nativePreview(t),
    placing: t.placing ? {x: t.placing.x, y: t.placing.y, ticks: t.placing.ticks} : null,
    targetRotation: game.aiRotationTarget,
    timing: {clock: game.aiTiming?.clock ?? 0, cc: game.aiTiming?.counterCC ?? 0,
      d0: game.aiTiming?.counterD0 ?? 0, period: game.aiTiming?.period ?? 0,
      stall: game.aiTiming?.stall ?? 0},
    travel: game.aiTravel ? {targetColumn: game.aiTravel.targetColumn,
      waypoint: game.aiTravel.waypoint, state: game.aiTravel.state,
      counterD4: game.aiTravel.counterD4, groundRow: game.aiTravel.groundRow,
      idleTarget: game.aiTravel.idleTarget} : null,
    placementWait: game.aiPlacement?.wait ?? 0,
    rotationWait: game.aiRotation?.wait ?? 0,
    previousKeys: game.aiPreviousKeys ?? 0,
    emptyWait: game.aiEmptyWait ?? 0,
    emptyActive: Boolean(game.aiEmptyActive),
    pickups: t.crates.map((crate, index) => ({
      index, x: crate.x, y: crate.y, kind: crate.nativeKind ?? crate.nativeMotion?.kind ?? -1,
      age: crate.age ?? 0,
      motion: crate.nativeMotion ? {x: crate.nativeMotion.x, y: crate.nativeMotion.y,
        vx: crate.nativeMotion.vx, vy: crate.nativeMotion.vy, state: crate.nativeMotion.state,
        wait: crate.nativeMotion.wait, active: crate.nativeMotion.active} : null,
    })),
    plan: game.aiPlan ? {...game.aiPlan} : null,
    sweep: sweep ? {state: sweep.state, column: sweep.column, rotation: sweep.rotation,
      clock: sweep.clock, bestScore: sweep.bestScore, bestRotation: sweep.bestRotation,
      targetColumn: sweep.targetColumn, anchorX: sweep.anchorX, anchorY: sweep.anchorY} : null,
  };
}

function onRam(ram) {
  if (!game) initialize(ram);
  if (mode !== 'open-loop-cpu' || !openLoopInitialized) {
    syncTower(ram, 0);
    syncTower(ram, 1);
    if (mode === 'shadow-cpu' || mode === 'open-loop-cpu' || (mode === 'stateful-cpu' && !openLoopInitialized)) syncShadowController(ram);
    if (mode === 'open-loop-cpu' || mode === 'stateful-cpu') openLoopInitialized = true;
  } else if (mode === 'open-loop-cpu') {
    // For policy comparison, start each decision from the exact native
    // pre-update state rather than letting motion/collision drift alter it.
    syncTower(ram, 0);
    syncTower(ram, 1);
    syncShadowController(ram);
  }
  // Survival adjusts the opponent's behavior difficulty between stages.
  // This live CPU field is input data, even for the stateful policy replay.
  game.aiDifficulty = readI32(ram, NATIVE_RAM.controller + NATIVE_RAM.cpuDifficulty);
  traceFrame++;
  const actorAt = 0x4f50, controllerAt = 0x5a40;
  const modelBefore = mode === 'open-loop-cpu' || mode === 'stateful-cpu'
    ? modelControllerSnapshot() : null;
  game.lastModelControl = {};
  game.lastAppliedControl = null;
  // Native stops asking the CPU for decisions after entering the result state.
  if (readI32(ram, NATIVE_RAM.gameState) === 0) game.updateCPU(RULES.step);
  else game.lastModelControl = {};
  const mask = controlMask(game.lastModelControl);
  if (traceStream) {
    const nativeRotation = readI32(ram, actorAt + 0x868) & 3;
    traceStream.write(`${JSON.stringify({frame: traceFrame,
      native: {gameState: readI32(ram, NATIVE_RAM.gameState),
        keys: readI32(ram, 0xe9a8) & 0xffff,
        brainKeyState: readI32(ram, controllerAt + 0xe8),
        x: (fixed(ram, actorAt) + 16) / 16,
        y: (RULES.nativeActorFloor - fixed(ram, actorAt + 4)) / 16,
        vy: fixed(ram, actorAt + 0x18),
        throw: {counter: fixed(ram, actorAt + 0x87c),
          originX: fixed(ram, actorAt + 0x8d8), originY: fixed(ram, actorAt + 0x8dc),
          targetX: fixed(ram, actorAt + 0x8bc), targetY: fixed(ram, actorAt + 0x8c0)},
        actorRotation: nativeRotation, heldKind: readI32(ram, actorAt + 0x864),
        controller: {targetColumn: readI32(ram, controllerAt),
          waypoint: readI32(ram, controllerAt + 4), state: readI32(ram, controllerAt + 8),
          counterCC: readI32(ram, controllerAt + 0xcc),
          counterD0: readI32(ram, controllerAt + 0xd0),
          counterD4: readI32(ram, controllerAt + 0xd4),
          groundRow: readI32(ram, controllerAt + 0xe4),
          idleTarget: readI32(ram, controllerAt + 0xf4),
          bestScore: readI32(ram, controllerAt + 0xd8),
          rotation: readI32(ram, controllerAt + 0xdc),
          column: readI32(ram, controllerAt + 0xe0),
          anchorX: readI32(ram, controllerAt + 0xc0),
          anchorY: readI32(ram, controllerAt + 0xc4)},
        target: readI32(ram, controllerAt + 0xb8) & 3,
        gateWait: readI32(ram, controllerAt + 0xb4),
        timingClock: readI32(ram, controllerAt + 0xc8),
        timingCC: readI32(ram, controllerAt + 0xcc),
        timingD0: readI32(ram, controllerAt + 0xd0),
        pickups: readPickups(ram, 1)},
      modelBefore, modelAfter: {...modelControllerSnapshot(), keys: mask,
        control: game.lastModelControl}, appliedControl: game.lastAppliedControl})}\n`);
  }
  return mask;
}

let pending = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
  while (pending.length >= RAM_BYTES) {
    const frame = pending.subarray(0, RAM_BYTES);
    pending = pending.subarray(RAM_BYTES);
    try {
      memory.set(frame);
      const mask = onRam(memory);
      const response = Buffer.allocUnsafe(2);
      response.writeUInt16LE(mask, 0);
      process.stdout.write(response);
    } catch (error) {
      process.stderr.write(`${error?.stack ?? error}\n`);
      process.exit(1);
    }
  }
});
process.stdin.on('end', () => traceStream?.end());
