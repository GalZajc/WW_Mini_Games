# Eggo Mania — Survival / Hard reconstruction

Survival rounds now open with native 3/2/1/GO art, the introductory balloon and
the high-altitude environment. After the countdown, the descent accepts normal
movement and floating controls. Reaching the ground ends the initial-descent
state; merely starting above the rescue height cannot win the round.

Work in progress toward parity with the local GBA game, not an emulator wrapper. The default is Survival/Hard. Physics, board state and rival logic run in JavaScript inside WW Mini Games. The supplied ROM is used only by the reference tools, never by the running mini-game. Survival uses the original fixed-step actor coordinates. The first movement sample at round startup is consumed; after that, movement applies on the current actor tick and stops on release. Yolko's walk cycle uses all seven captured ROM poses at four actor ticks per pose, continues while pushing against a wall, and finishes the remaining poses after release. A direction change preserves the one-tick old-facing OAM delay before restarting at pose zero. Held-piece pictures retain the selected rotation even for symmetric shapes. Rotation and item actions occur on the input frame.

## Current implementation

Character settings now offer the eight original default-menu characters:
Yolko, Funky, Robo, Bebub, Coolio, Eggo, Spike and Astro. The selected player
uses that character's native motion pictures, height-indicator portrait and
distinct win/loss animations, and retains the selection across Survival rounds.
Character images are decoded with the original ARM sprite decoder and checked
against native emulator captures; the running game needs no emulator or ROM.
Unlockable characters, voices and complete damage/contact pose timing remain
unfinished. The previous Yolko animation phase fitting is preserved.

The result screen uses native WIN!/LOSE! glyphs in the two fields. The world
continues moving after the result, so existing bombs and their particle effects
finish while the race time and submitted result remain fixed. Enter continues
or retries; F5 restarts Survival.

Seven-column building fields, original-resolution pixel rendering, eight reference-derived backgrounds and rival images, catching and rotating pieces, a throw arc, retained complete floors, row bonuses, water erosion, wobble meter, filler, boots, lightning, hammer, returnable timed bombs, rival AI and consecutive Survival rounds. Arrows move/jump; Space places/uses; X/Z rotate; Q drops through; R discards; Enter continues; F5 begins a new run. Bindings are remappable. Xbox defaults follow the original GBA actions: physical B places, A rotates clockwise, LB drops through, and RB discards. Previously saved default mappings, including the old LB+Xbox-A reverse-rotation chord, migrate to the corrected layout; custom bindings are retained.

The piece set includes the reference's small one-, two- and three-cell pieces.
Default drops use the eight observed families (single, double, straight/bent
three-cell pieces, both zigzags, bridge and cross); four unreferenced shapes
from the initial prototype are excluded from the default pickup pool.
Seven incomplete floors remain stable. The eighth can start a destructive-water
chain that removes the penultimate floor, then continues below that threshold.
Its six measured row removals reproduce the original no-input continuation,
with time depending on occupied cells. Activation during throws and retargeting
when more pieces are added remain provisional. The meter uses original bitmap
parts. The initial waterline and its native delayed rise now follow the
Survival table: the selected round controls the start delay, fixed-point rise
rate and final row-aligned waterline. The optional extra-rise setting remains
an independent addition to the original motion.

Regular pieces now use connected bronze, silver or gold panels made from native
bitmap quarters. Separate piece IDs preserve the outline between independent
pieces, even when they share a color. Completed floors retain their native placed-cell textures.
Composed tiles are cached, so ordinary rendering draws one image per cell.

Bird-dropped pieces now use the original fixed-point air drag, initial upward
velocity, underwater buoyancy and outward drift. Default Hard pickups now use the native weighted bag, random clock,
initial launch, 320-step field preparation and ordinary item motion.
They keep advancing during countdown. All 52 native inventory pictures
are available in their original orientations. Building-piece pictures
stay upright, while tool pictures sway as in the original.

Camera and background positions now advance in fixed simulation steps. Two
jump sequences and a throw sequence match measured first-stage scrolling within
two native pixels. The view follows the player with a margin and delay, rather
than the tower's top or the full throw arc. The native platform scrolls with
its world position. Yolko uses reference pose strips with separate empty-hand
poses, and observed items use native 16px pictures. Native small portraits now
follow the eggs' heights in the central indicator.

Filler adds up to six cells using the original supported-gap walk. The native six-cell example matches both the positions and
creation order. Completing its floor adds no invented two-cell bonus. Filler
has its own native trowel icon; the hammer uses the original help-page picture.

Movement constants now reproduce measured GBA displacement samples: two pixels per frame horizontally and 0.1/0.2/0.35 px per frame² vertically when holding Up, neutral, or Down. The simulation uses 60 fixed steps per second. Rescue height is calibrated from the ROM's initial coordinate and winning threshold. Throw movement uses the original fixed-point sine arc and reciprocal table.

Jumping off can now descend below the base into water. The first-stage water
motion and the creature's return throw reproduce measured GBA samples within
0.025 native pixel; a water visit no longer means an automatic drowning defeat.
The creature is rendered with a reference-derived pose. Later-stage recovery
and the complete creature animation remain unverified.

## Fidelity status — incomplete

The original has been run in RetroArch and in a frame-stepped host using the same installed mGBA core. Reference inputs, save states, framebuffer captures and traces are in `tests/artifacts/eggo-reference`. See `REFERENCE.md` for measurements and outstanding differences.

Normal play uses decoded, field-specific 112×512 BG3 ring artwork for all eight
arenas. Factory map captures are retained as reference data, but the runtime
does not select them by actor height: repeated native samples at the same height
can contain different maps. Live map selection still needs to follow the ROM's
camera and row-ring updates. Streamed tile-row variants use decoded ROM pointer
tables, with the native rate/period selection and a match-wide frame counter;
their absolute boot-time phase is not calibrated against one continuous native
run yet.

Cloud attacks now use the original three strike pulses and a local hit box,
aligned with the attacker's column rather than automatically hitting the rival.
The paired native hit/miss jumps match through frame 120 within 0.01 pixels.
Their original normal/strike textures and affine scale are also installed;
Electron captures cover growth, a miss and a successful hit.

Factory capture bubbles, the beanstalk/jungle jumping creatures and the space
primary hazard and dragon fireball now use original motion, timing and sprite phases.
Castle/pirate primary creatures and thieves, the factory robot, park spring
duck/flying thief, beanstalk spider and jungle flying thief are also installed
with native sprite atlases and measured flight/contact behavior. Space also
has its original secondary missile, with native fixed-point flight/turn rules
and shared enemy occupancy. Dragon also has its original falling-rock secondary hazard. Height gates use
the waterline rather than the rendering camera. Exact internal spawn anchors
during water recovery and throwing remain open.

Still open: exact water progression; collapse activation under changing loads;
Solo scoring and combo bonuses; later-round environmental enemy progression;
some item collision boundaries and hammer viewport animation phase;
damage animations and roster selection; original CPU decisions and later-cycle
Survival changes; full audio fidelity. Passing implementation tests does not
establish feature parity. The game must not yet be described as a completed
reconstruction.

Camera rules are calibrated only for the measured first-stage sequences. Other
camera states, full rival/creature
animation and panel variants for unobserved shapes/corners remain incomplete.

## Files and verification

- `model.js`: shared rules, parameters, board simulation and placement planner.
- `game.js`: lifecycle, bindings, Survival progression, scores and AI control.
- `pixel-renderer.js`: low-resolution rendering with nearest-neighbour scaling and whole-pixel enlargement whenever the window can fit it; the display canvas also uses pixelated compositor scaling while this game is active.
- `view.js`: camera, parallax and native-pixel animation/HUD parameters.
- `icons.js`: source icon geometry and cached orientation matching.
- `assets/`: art decoded from the user's local ROM; provenance in `assets/README.md`.
- `scripts/eggo-reference.py`: frame-stepped reference harness, isolated saves; optional explicitly logged RAM probes. New runs save parameters, state hashes, captures and CSV/JSON traces in timestamped `scripts/OUTPUT` folders; `--load` accepts an existing reference name or a full state-file path.
- `scripts/eggo-decode-reference.py`: GBA layer/sprite decoder for reference dumps.
- `node --test tests/eggo-mania.test.mjs`: model and measured-movement checks.
- `node tests/eggo-mania-visual.mjs`: Electron discovery, real keyboard-event placement and screenshots in `tests/OUTPUT`; `--water-only` checks recovery and `--reference-only` checks the measured seven-floor board.
- `scripts/eggo_reference_bot.py`: input-only original-game research player for the reference host's `--bot` option. Its `mirror-cpu` strategy verifies native GBA key masks, but CPU decisions target the CPU's field and are not a substitute for the player-side Survival policy; traces are reproducible.
- `scripts/eggo-build-panel-atlas.py`: reproducible connected-panel extraction with source hashes, reference images and explicit missing-case records.
- `scripts/eggo-measure-camera.py`: input-only camera measurements and fixture.
- `scripts/eggo-build-actor-atlas.py`, `scripts/eggo-build-icon-atlas.py`, `scripts/eggo-build-progress-atlas.py`: reproducible native pose/item/portrait extraction with provenance and timestamped OUTPUT records.
- `scripts/eggo-build-wave.py`: original destructive-water pose and warning icon.
- `node tests/eggo-mania-visual.mjs --surge-only`: focused active-wave rendering check.
- `node tests/eggo-mania-visual.mjs --filler-only`: keyboard filler action and native item rendering check.
- `scripts/eggo-measure-pickups.py`: native free-fall and affine sway measurements from two input-only captures.
- `scripts/eggo-measure-boots.py`: input-only boots motion and native effect countdown measurements.
- `scripts/eggo-measure-stage-backgrounds.py`: settled native stage offsets, measured against six framebuffer captures per stage.
- `scripts/eggo-measure-fall.py`: full native airborne profiles and downward speed limits, with and without boots.
- `scripts/eggo-build-intro-art.py`: native 3/2/1/GO pictures and introductory balloon composition, with provenance.
- `scripts/eggo-build-countdown-motion.py`, `scripts/eggo-build-intro-environments.py`: native affine countdown and streamed high-altitude environment reconstruction.
- `node tests/eggo-mania-visual.mjs --intro-only`: real keyboard-controlled descent, landing, and four opening screenshots.
- `node tests/eggo-mania-visual.mjs --stages-only`: render all eight backgrounds without replacing the thumbnail.
- `node tests/eggo-mania-visual.mjs --pickup-only`: free/held pickup rendering without changing the thumbnail.
- `scripts/eggo_item_trace.py`: read-only item tracking and first-carried-item checkpoints (`--item-trace` on the reference host); detection and attack-calibration limits are recorded in REFERENCE.md.
- `scripts/eggo_rival_poses.py`, `scripts/eggo-build-rival-atlas.py`: input-only rival pose recording and reproducible native sprite sheets. Ghidra inspection has mapped the actor-state jump table and random-driven idle handler; other animation-state transitions remain under reconstruction.
- `scripts/eggo-ghidra-controller.ps1`, `scripts/eggo-ghidra-survival.ps1`, `scripts/eggo-ghidra-export-survival.ps1`: headless, ROM-hash-tracked Ghidra analysis. Use the explicitly seeded CPU/controller and actor-state results; the broad auto-analysis is known to misclassify ROM data and is not a whole-game decompilation.
- `node tests/eggo-mania-visual.mjs --rivals-only`: eight rivals in grounded, rising and falling states; preserves the thumbnail.

Initial research sources: [GBA overview](https://www.gamesdatabase.org/game/nintendo-game-boy-advance/eggo-mania), [GBA controls](https://www.freezenet.ca/review-egg-mania-game-boy-advance/), [hands-on description](https://www.nintendoworldreport.com/hands-on-preview/2917/egg-mania-eggstreme-madness-gamecube). Direct reference-game evidence now takes precedence over those summaries.

The boxed bomb no longer starts a fuse merely by spawning. Native inert-bomb
lifetime is recorded by scripts/eggo-measure-bomb.py. A naturally caught bomb
now has the measured 250-frame armed countdown. Both players throw bombs
through the measured vertical lift and cross-field arc; the first edge-contact
bounce and full rebound/rest profile match a native capture, including renewed
fall when support disappears. Blast damage removes whole touched pieces.
Alternate collisions, catches and the exact blast footprint still need broader
calibration. scripts/eggo-build-bomb-art.py extracts
the carried native bomb; `node tests/eggo-mania-visual.mjs --bomb-only` checks both
boxed and carried pictures without changing the thumbnail.

Explosion rendering now uses the native eight-particle burst rather than a
full-field yellow flash. scripts/eggo-build-explosion.py preserves the source
probe and affine transform provenance. `--bomb-only` also captures the burst.

`scripts/eggo-measure-water-inventory.py` records inventory loss on water entry
(native frame 14). `scripts/eggo-measure-armed-bomb.py` records the naturally
caught bomb's counter, input-only throw and first burst, including RAM hashes.
`scripts/eggo-measure-bomb-launch.py` preserves every pre-collision trajectory
sample and the first rebound. `scripts/eggo-measure-bomb-target.py` verifies
the native destination-height lookup across three different input-only throws.
`scripts/eggo-measure-bomb-rebounds.py` verifies the complete rebound profile;
`scripts/eggo-measure-bomb-damage.py` preserves the original before/after board.
`scripts/eggo-build-result-art.py` extracts native result glyphs with provenance;
`node tests/eggo-mania-visual.mjs --result-only` captures both outcomes and an
explosion continuing underneath the result text.
The reference runner's `--audio` option streams original stereo WAV recordings
with rate, sample count and hashes. `scripts/eggo-measure-audio-differences.py`
compares input-only profiles; these diagnostic differences are not yet validated
as standalone gameplay sound assets.
Native Options includes NO SFX, permitting direct music-only captures. Their
actual arena labels and source provenance are recorded by
`scripts/eggo-measure-music-captures.py`; playback assets and seamless loop
boundaries are still pending. Newly observed starting arenas also show that
the original starting arena is drawn randomly. This selection is now matched
to the native 16-bit generator, followed by its observed eight-arena cycle;
`scripts/eggo-measure-arena-selection.py` records the evidence. Later-cycle
difficulty selection still requires calibration. The Survival starting-tower
builder follows the decoded round-height and vertical-piece rules; the
round-nine grid matches both native fields after normalizing the ROM's global
piece IDs.
The original normal jump sound is now included, extracted from a clean
NO MUSIC capture by `scripts/eggo-build-jump-sound.py`. It follows accepted
player and CPU jumps; original shared-channel priorities remain uncalibrated.

Hammer flight/contact and staged incomplete-floor damage are now ROM-backed.
`scripts/eggo-measure-hammer.py` preserves the input-only flight and paired
board controls. `--hammer-only` captures flight, destruction and actor hit.
The factory electric bubble now follows the decoded native motion, capture,
release and A/B escape timer, with original animation. Place/use or either
rotation key shortens capture; holding a key does not repeat the event.
`scripts/eggo-measure-bubble.py` preserves both complete traces and source art;
`node tests/eggo-mania-visual.mjs --bubble-only` verifies the keyboard binding.
Other arenas' enemy mechanics, original AI, roster, complete music and sound
coverage remain incomplete; the current recreation does not have full parity.

The beanstalk creature now replaces the provisional bird on that arena. It
alternates native short/long jumps, can capture and carry the player into the
water, and uses eight original animation frames. Both arcs, capture/release,
animation timing and Hard rest periods are checked against input-only native
profiles by `scripts/eggo-measure-jumper.py`. `--jumper-only` captures the result.
The initial factory/beanstalk hazard timer is now the verified 1480 frames.
Secondary enemies and later-round enemy difficulty progression remain open.

Jungle also replaces its provisional bird with the native jumping hazard:
its long arc captures the player, its bite timer repeats every 20 frames,
and the original eight 32x64 frames are installed. A native input-only
walk-away control verifies that the second jump keeps the first jump's X;
the shared beanstalk routine was corrected accordingly.
`scripts/eggo-measure-jungle-enemy.py` retains the evidence; `--jungle-only`
checks stage selection and visual rendering. Bite audio and special actor
poses still need reconstruction.

Discard now releases every carried piece/tool using original ROM coordinates,
velocity and 30-frame pickup protection. Discarded bombs become inert again;
returned thrown bombs keep their fuse. Native pickups use the original strict
contact rectangle, including boots caught while holding another piece.
`scripts/eggo-measure-discard.py` preserves two input-only discard traces and
nine natural catches. `--native-pickups-only` also captures the live discard.

Survival now applies the original Hard configuration table per round:
pickup distributions/rates, enemy difficulty and disabled enemies. After the
eighth round it selects from the original continuing configurations; balloon
height follows that configuration. `scripts/eggo-build-round-config.py`
retains all eight Hard RAM comparisons and one ninth-round transition. A paired
native RNG trace now confirms the two setup draws, the copied field seed, and
the later difficulty/level draws; Survival startup and round configuration use
the same evolving global stream as the measured idle animation. The full RNG
schedule across all gameplay consumers, CPU/character selection and other
configuration effects remain under reconstruction.

Floor destruction now uses the original per-floor counters and index order,
including the animation tail and preservation of existing requests. The
highest unfinished roof survives; a completed floor does not shield other
unfinished floors below it. A 414-frame ordinary-input onset and every timer
in its 600-frame idle continuation are preserved by
`scripts/eggo-measure-collapse-queue.py`. A second 600-frame comparison also
matches counters and board removals while recorded placements and loose-cell
movements are prescribed. The native code that generates those movements and
the native CPU policy still need reconstruction.

All eight arenas now play original stereo music. Native Pause freezes the
game but keeps music running, enabling clean NO SFX captures. Exact cycle
lengths come from comparing all eight original sequencer states for every
frame of a full repetition, not from a guessed audio cut. Sources, controller
inputs and measurements are retained by `scripts/eggo-capture-music-stages.py`
and `scripts/eggo-build-music.py`. Pause preserves playback position; changing
rounds or leaving stops playback, including late-loading audio.
`node --test tests/eggo-mania-audio.test.mjs` checks the exported PCM and lifecycle;
`node tests/eggo-mania-visual.mjs --music-only` checks actual Electron decoding,
playback, pause/resume and cleanup. Native entry/result music and shared-channel
SFX mixing remain incomplete.

Unsupported pieces now follow the original discrete support pass: one row is
examined per native frame, and a whole unsupported owner drops one cell.
Mutually supporting owners merge during placement. Both operations are checked
against direct execution of the original ARM helper, including seeded diagnostic
grids. Floor deletion stops at the first empty row above it, keeps higher islands
in place and no longer teleports the builder down a tile. Original ARM execution
also verifies those deletion cases. The changing-board 600-frame comparison now
generates the observed loose-cell drop itself; only external placements are
prescribed. `node tests/eggo-mania-visual.mjs --loose-only` verifies/render-captures
the complete native before/after board.
`scripts/eggo-measure-piece-support.py` retains the instruction oracle, parameters,
source hashes and seed. A moving piece hitting the actor's exact native probe
now launches the builder upwards at 5 pixels/frame without teleporting it;
six original Thumb instruction cases verify this response and boundaries.
Exact throw/placement trajectories still need reconstruction.

The original CPU policy is now executable in the research oracle. Fifteen
real checkpoint calls reproduce the original next-frame commands. Its bounded
placement search and integer candidate score are transcribed in native-cpu.js;
54 native cases match both helpers. Native inventory previews/placements now
preserve the masks' 3x3 padding, and regular native pieces use the original
candidate score in gameplay. The single-cell branch now uses the original
five-row buried-gap scan and score; the CPU drops through the roof to reach
the opening before placing it. CPU movement, timing and pickup/item decisions
still need reconstruction. This is not yet full native CPU parity.
`node --test tests/eggo-native-cpu.test.mjs` checks the instruction-derived
fixture; `scripts/eggo-measure-cpu-candidates.py` regenerates it.
`node tests/eggo-native-cpu-replay.mjs` runs a seeded integration through the
actual native pickup bag and arena hazards, retaining configuration, source
hashes, placement events and trajectory CSV. Seed 42 reaches the rescue
balloon after 66 placements. This is a gameplay integration check, not an
original CPU trajectory comparison.

Drop-through uses the native nine-frame support bypass and initial downward
velocity, accepts the input only on support, and preserves the original
velocity-before-displacement order. Held input no longer restarts a dive in
midair. Two ordinary-input ROM captures match every position, velocity and
counter for the first twenty frames; the existing native water-entry/recovery
checks also pass. `node --test tests/eggo-dive.test.mjs` includes an actual CPU
buried-gap placement. Final native placements now recheck the native search,
so a valid hole preview is not rejected by the old roof-only landing routine.
The combined model, native CPU and dive run passes 84 checks. A subsequent
seed-42 integration reaches the balloon at frame 10716 after 82 placements;
its complete configuration and trajectory are saved under tests/OUTPUT.

Known native pieces now use an incremental candidate sweep in live gameplay:
one column/orientation per simulation frame, actions after the first full
sweep, then continued evaluation with a retained strict best score. The
prototype's artificial 0.65-second wait is no longer a default; a separate
extra delay can still be configured. Native search no longer filters targets
with the prototype's reachability heuristic or runs a second instantaneous
sweep when that heuristic rejects a target. Fourteen instruction comparisons
verify counter advancement, wrap, strict improvements, anchors and scores
through the gameplay board bridge. The CPU's full cooldown/clock-reset
lifecycle and locomotion remain provisional. The latest seed-42 integration
places 75 pieces and reaches rescue at frame 10689 with finite positions.
`scripts/eggo-measure-cpu-candidates.py --sweep-only` regenerates the independent
native state-transition fixture; `node --test tests/eggo-native-cpu.test.mjs`
checks it and the live incremental planner.

The ordinary-piece CPU timer lifecycle now persists across inventories.
Its clock advances during idle/throw frames, pauses during the native decision
wait, and resets only when the native longer counter expires. Expiry presses
Use immediately, reloads the counter to 1280 and sets the Hard wait to 36
frames; the world and throw continue during that wait. Ordinary native Use
also sets this wait. Eight original-instruction boundary cases and gameplay
pause/expiry/inventory-change checks pass in `tests/eggo-cpu-timing.test.mjs`.
Native special-item timer branches and complete movement/RNG policy still
need reconstruction. Seed 42 now reaches rescue at frame 14589 after 86
placements. The integration capture allows up to five simulated minutes and
records CPU timers as well as positions, rather than imposing the earlier
prototype's three-minute limit.

Native CPU rotations now issue separate clockwise player-control inputs.
The original mismatch gate emits one input, waits fifteen eligible calls,
then can emit the next; matching orientation preserves the remaining wait.
The CPU cannot throw on the same frame as its final required rotation.
This gate is checked against six executions of the original instruction
segment and a three-turn gameplay sequence. Single-cell gap choices also
select the original special orientation before descending. Complete native
movement/hazard avoidance, pickup/item decisions and shared RNG order remain
unfinished. The latest seed-42 integration reaches rescue after 76 placements
at frame 12958; fifteen focused CPU timing/search/dive checks pass.

The player's native piece throw now uses the original fixed-point sinusoidal
actor arc, including its first-frame origin, twenty-eighth-frame commit and
3.5-pixel/frame hop. It matches every actor coordinate in the recorded
ordinary-input throw to the original fixed-point precision. Mask padding
also determines the actor's landing position. Placement rechecking uses the
throw origin so a buried single-cell opening is not replaced by its roof.
`node --test tests/eggo-throw.test.mjs tests/eggo-dive.test.mjs
tests/eggo-cpu-timing.test.mjs` checks the native trace and related gameplay.
Attack-during-throw target behavior and other actor states still need exact
comparison; this does not establish complete Survival feature parity.

Native placed pieces now use their original per-environment placement
templates instead of reconstructing their corner patterns from neighbours.
The texture stays with a cell through whole-piece falls and floor removal,
including after owners are merged. All 256 stage/kind/rotation maps match
the original masks; a live Electron placement matches the original template
pixel-for-pixel. `tests/eggo-placed-art.test.mjs` checks orientation padding
and texture preservation during drops/removal. Native completed floors retain
their placed-cell textures; generic custom pieces use the older artwork path.

Filler now follows the original supported-gap walk instead of sorting empty
cells by distance to the egg. Its six independently owned cells grow through
three original pictures, with staggered transitions measured in all eight
environments. Both that creation order and the separate ordinary-input CPU
capture agree. The Electron filler scene matches all twenty-four phase
pictures to the decoded original art with zero differing visible pixels.
`tests/eggo-filler-art.test.mjs` checks creation order, timing and metadata
preservation; `node tests/eggo-mania-visual.mjs --filler-only` checks integration.
Filling directly beneath the actor also applies the original next-frame hop
and twenty-two float ticks. Three native 70-frame traces agree at fixed-point
precision, including the first landing's preserved velocity and fractional
pixel coordinate. Other actor interactions and full Survival parity remain
unverified.

Floor destruction now displays all eight original water-wave pictures in
the native thirty-two-tick window. It follows the preceding draw update,
stays at the original offset above the affected row, and no longer adds a
fitted vertical bob or shows the same picture during the long countdown.
The eighty-frame original OAM trace agrees with the live floor queue, and
the Electron phase strip matches every decoded picture pixel-for-pixel.
`tests/eggo-wave-art.test.mjs` checks visibility, phase progression and
the completed-floor cancellation; `--surge-only` renders the phase strip.

The wobble pointer now follows the original integer spring, friction deadzone
and bounds, including during countdown. Native bar flashing and vertical
jitter replace the static meter, using full original sprites rather than a
cropped approximation. All eighty observed updates match original RAM/OAM;
twelve live Electron crops match the independently decoded original pixels.
`tests/eggo-meter.test.mjs` checks motion and draw timing; `--surge-only` also
renders the meter strip, compared by `scripts/eggo-compare-meter.py`.

CPU building-piece movement now uses the original integer target window,
with the native opposite-direction cooldown instead of seeking an exact
column centre. Its ready-to-place counter, even-frame commit and special
single-cell dive also follow the original instruction segments. Independent
instruction execution agrees in 118 diagnostic cases; live rotation/dive
checks pass and a native-bag/hazard run reaches the balloon. Later capture-backed
work below also reconstructs the original route, pickup and special-item
policies. These checks are in
`tests/eggo-cpu-steering.test.mjs`, with reproducible research tools
`eggo-measure-cpu-steering.py` and `eggo-measure-cpu-placement.py`.

Ordinary CPU building-piece travel now follows the native bounded three-span
route search, including intermediate roofs, persistent route state, Up holds
and dive fallback. Original instruction calls agree on varied diagnostic
towers and on actual intermediate states from ordinary-input game checkpoints.
The live stepped-roof and buried-gap checks pass; a native-bag/hazard run
still reaches rescue. `tests/eggo-cpu-route.test.mjs` and the route/travel-replay
research scripts record the evidence. The isolated route checks do not establish
full CPU or Survival parity.

Survival CPU pickup targeting now follows the original height/roof/distance
rules and native list-order tie behavior. With no acceptable item it heads
to the highest roof using the original tie order. Empty-handed travel and
steering use the selected native target and near-pickup flag. Direct native
instruction boundaries and actual ordinary-game decisions agree; the live
reachable/buried pickup check and CPU rescue integration pass.
`tests/eggo-cpu-pickups.test.mjs` and `eggo-measure-cpu-pickup-targets.py`
record this evidence. Subsequent work below reconstructs special-item and
hazard policies; whole-match parity remains open.

Survival special-item dispatch now uses the original inventory period,
even-frame input gate and squared difficulty pause. Bombs/filler bypass
ordinary period expiry, choose native targets, and use the native route.
Bombs retain their fuse, wait before committing and use the original urgent
throw countdown; filler uses the original one-tick commit wait. Native
instruction execution checks 64 dispatch cases, 48 target/urgency cases,
20 bomb fuse boundaries and 16 tool commit cases. The integrated native-bag
CPU still reaches rescue. Later work below also reconstructs threat targeting
and avoidance; shared RNG order and whole-match native-controller parity
remain unfinished.

CPU enemy avoidance now follows the original 512-frame window, held-item
type filtering, approach direction, horizontal/vertical proximity and jump
rules. It runs after native steering and before direction latching. Original
instruction execution matches 119 boundary cases. A separate adapter keeps
the native persistent contact centers for each arena's primary/secondary
enemy, including short-jump and inactive-animation phases. Captured nonzero
centers and a two-frame mGBA continuation agree in the tested states; a live
incoming-enemy check reverses the CPU and jumps. Whole-match avoidance and
all contact phase transitions still need verification. Shared RNG ordering
remains unfinished.

The CPU now also scans incoming projectiles in original slot order, rejects
inactive/in-flight/under-roof candidates, prioritizes the first eligible
bomb with empty hands and can discard an ordinary piece before catching.
Held bombs use that explicit target in their urgency and commit gates;
grounded steering preserves the original precise target coordinates.
85 diagnostic scan cases and one ordinary-input mGBA policy checkpoint
agree with original instructions. The live checks cover discard parity,
catch priority, slot reuse, saturation and the separate post-landing catch
counter. Full synchronized matches and all shared RNG consumers still require
validation.

Held/empty-hand idle poses now use the ROM's `0x0800ED50` random phase
accumulator and measured two-frame display delay instead of a fixed animation
timer. The 600-frame native sprite trace matched the phase-derived pose on all
594 post-startup frames. The same global stream now advances through measured
round setup and table selection. Mapping the ROM's hardware-derived initial
seed and every remaining consumer is still open.

An additional 360-frame `shadow-cpu` replay from the original Hard-idle
checkpoint compared the reconstructed controller against the ROM while
reloading the exact native RAM state before each decision. The model's previous
frame key mask matched the ROM's emitted mask on all 359 comparable frames;
same-frame comparisons have a one-frame handoff and should not be counted as
policy errors. This confirms the reconstructed decisions on that checkpoint
trajectory, not a complete synchronized match. The trace is recorded in
`scripts/OUTPUT/eggo-reference_2026-10-05_13-48-11_753871`.

The next Hard-idle replay now checks the actor as well as the CPU decisions.
On 399 consecutive one-step predictions, both actor positions and the
next-frame CPU masks match the original RAM exactly, including the captured
piece throws, landings and jump starts. This is a checkpoint-backed local
step comparison with native state reloaded each frame; it is not yet a
free-running full Survival match. Initial hardware seed, shared random-stream
consumers, other arenas and opponent/hazard interactions remain to be
reconstructed and checked.

A separate 1,200-frame Hard Survival controller replay matches the original
CPU key word on all 1,199 comparable next-frame checks while carrying the
reconstructed controller state forward. The runner still reloads the original
actor and board RAM each frame, so complete autonomous Survival parity
remains open.
