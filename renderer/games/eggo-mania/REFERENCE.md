# Survival / Hard reconstruction evidence

## Eight original default-menu characters, 2026-10-04

The input-only survival-roster replay at 22-24-52_823457 cycles all eight
original character choices. Its menu snapshots establish Yolko=1, Funky=2,
Robo=3, Bebub=4, Coolio=5, Eggo=6, Spike=7 and Astro=0 at 0x020003d4.
Starting a round copies this selection to the active player ID at 0x020003d8.
Changing only the menu ID after a round starts does not change the active
podium character; the initial diagnostic batch at 22-34-43_739839 is excluded
from installation. The corrected 22-36-40_316373 batch explicitly records
both ID writes for result probes and only the menu ID write before game entry.

ROM 0x0801845c selects each character's resource root and palette. There are
21 groups of frame descriptors. Their compressed 64x64 images are decoded by
the actual original ARM routine at IWRAM 0x03001638, using Unicorn without
replacement arithmetic or a guessed compression format. eggo-build-characters.py
records source hashes, roots, palettes, descriptors and every decoded pixel
hash in a timestamped OUTPUT folder. The selected original gameplay OBJ matches
its own character's decoded resources for all eight characters. Player portraits
come from each native game-entry snapshot. Yolko's assembled player sheet and
portrait exactly equal the previous default assets.

eggo-install-characters.py preserves the previous eleven-state Yolko frame
templates for every character. It installs original character-specific podium
captures, verifies every used image belongs to that character's ROM resources,
and determines complete repeating win cycles: Astro 128, Yolko 56, Funky 188,
Robo 64, Bebub 256, Coolio 72, Eggo 256 and Spike 72 ticks. All eight loss
actor sequences finish at tick 121, before GAME OVER at 122. Full native
sequences and source metadata are retained in eggo-character-podium-gba.json.
Exact initial win animation phase remains unproven; added characters use a
verified steady cycle, while the existing Yolko entry phase stays unchanged.

The same ROM-decoded sheets also include damage group 5 (4 frames), swim
group 17 (10 frames), and the two one-frame recovery poses from groups 1 and 2.
Native input-only frame traces from the lightning hit at reference frame 87
show injury frames advancing every four game frames, then swimming frames on
the same four-frame cadence, followed by the recovery pose. These states now
select the corresponding original frames for all eight player characters.
The sequence timing is anchored to simulation ticks rather than render FPS.
The palette-1 CPU actor's special states are not yet recolored or integrated.
The 2026-10-05 decoder run at
`scripts/OUTPUT/eggo-characters_2026-10-05_01-58-32_637213` also preserves the
packed 4bpp source bytes and descriptor offsets for every decoded frame. This
keeps original color indices intact for stage-palette reconstruction; the
stage-rival idle palettes are not yet consistently explained by the selectable
character resources, so no guessed CPU special art is installed.

Two focused character checks and the three existing result-motion checks pass.
Electron --characters-only produces playing/win/loss views for all eight at
eggo-mania-visual_2026-10-04T20-41-38-240Z; the contact sheet was inspected.
The runtime settings expose Character, default Yolko, and preserve it through
round continuation and restart. This adds the eight ordinary selectable actors
and the measured injury/water-recovery poses; it does not prove unlockable
roster progression, every contact pose, character collision envelopes, voices,
or integrated gameplay/CPU/RNG parity.
The overall goal remains active.

## Native result music and playback lifecycle, 2026-10-04

Survival replaces the prototype success chime/defeat beep with the original
music transition. The input-only result-music-clean replay from the natural
loss00244 checkpoint starts the native 220 counter on its first frame. A
winning replay uses the previously logged round4 rescue-position probe.
Both use the native music-only option (3), so the captured tracks do not
include character voices or battle SFX. The eight sequencer states agree
through frame 225 and diverge at 226, when the podium selects outcome-specific
music. The live game changes tracks on that same result tick.

Loss plays its native ending once and then remains silent. Win includes its
native initial phrase before looping; a full 768-frame repeating region is
verified against all eight native sequencer tracks. eggo-build-result-audio.py
retains raw stereo samples, including the introductory phrase, and records
all sources/sample ranges/hashes in assets/result-audio.json. The join chooses
an unchanged quiet sample boundary; it does not normalize or crossfade PCM.

The shared playback handle now supports finite tracks and a loop starting
after an initial phrase. Pause/resume preserves position, ended finite tracks
cannot restart, and arena changes or exit cancel pending playback. The three
result tracks are preloaded to avoid decoding at the transition. Nine focused
audio/result checks pass. Electron --result-audio-only confirms stereo decode,
actual WebAudio loop flags/loop starts, pause/resume and cleanup for all three
tracks at eggo-mania-visual_2026-10-04T20-18-41-707Z.

This proves the extracted music and its playback behavior, not full audio
parity. Native announcer cues, battle effects/channel suppression and exact
sub-packet transition latency remain open, alongside character selection and
integrated gameplay/CPU/RNG comparisons. The complete goal remains active.

## Survival podium and result-page flow, 2026-10-04

Survival no longer remains indefinitely on the finished arena. The native
220-tick result counter at 0x02000014, its fade logic at 0x0801bb66 and the
subsequent podium captures establish the transition to the WINS page. The
game now completes that transition, stops the completed arena's simulation,
shows the original podium and decimal font, and continues/restarts only after
the result becomes ready for confirmation. Winning preserves the streak when
entering the next arena; losing displays GAME OVER after the initial actor
animation. Enter or the mapped Place action confirms the result.

Native input-only captures include survival-loss-result at
eggo-reference_2026-10-04_21-46-00_586686 and both podium sequences at
eggo-reference_2026-10-04_21-53-41_653359 / 21-53-43_346639. The winning
source checkpoint was originally reached with a logged diagnostic goal probe;
it establishes display/progression behavior, not a legitimate four-win replay.
The winning actor's 56-frame cycle repeats throughout 240 captured frames.
The losing actor is replaced by the native GAME OVER title. Exact winning
entry-animation phase and fade palette rounding remain less well established
than the steady display and should not be treated as full transition parity.

The entire 240x160 GAME OVER/WINS 00 Electron scene at
tests/OUTPUT/eggo-mania-visual_2026-10-04T20-03-08-719Z matches the original
survival-podium.frame00360.png with zero different pixels. The initial
comparison isolated a green-channel-only error; it was mGBA's RGB565
conversion, now preserved for the podium assets. This is full-frame evidence
for that result page, not for all gameplay frames or other selectable actors.
Three focused result tests pass, covering measured glyph motion and live
Survival score/arena/confirmation flow; result screenshots were inspected.
Remaining broad requirements include original result/music/SFX transitions,
other playable characters, shared RNG consumer order and integrated CPU and
late-arena trajectories. The complete goal remains unproven.

## Native result-letter motion, 2026-10-04

The static result-letter coordinates have been replaced with the original
fixed-point animation. ROM 0x08013fb0 / 0x080140e0 initialize the letter bounds
and velocities; 0x080142e8 updates their positions, reflects them at their
bounds and applies the small cross-axis velocity changes. This is deterministic
motion, with no random draws. result-view.js keeps these parameters together
and preserves the original one-frame framebuffer delay.

An input-only replay from the natural bomb-right-expiry.frame00248 checkpoint
matches all nine visible letters for 186 frames: 1,674 exact pixel positions.
The initializer also reaches that checkpoint's complete position, velocity and
bound state after its three initial ticks. The two focused regression tests
pass, and Electron result screenshots were inspected for both outcomes.
At replay frame 187 the original begins its subsequent result-page transition;
that transition, menu counts and result audio remain separate unfinished work.

## Whole-scene audit and projectile capacity, 2026-10-04

The whole-scene reference comparison exposed a remaining procedural center
divider. It now uses the original fixed rail texture, identical in all eight
arena captures. The Electron reference scene matches the original in its
unobstructed 16x96 divider region (zero differing pixels). This does not prove
full-frame parity: the opponent board/camera differ in the staged reference,
and actor/result/progression transitions still need broader comparison.

The native allocator at 0x0800426c shares seven slots between bombs and hammers.
When all slots are active it returns zero without clearing the held item or
changing any slot. Otherwise it allocates the first free slot and clears the
held item. Thirty-two direct instruction executions cover both fields, both
tools and every free-slot position plus saturation. The game now reserves a
shared slot before consuming inventory and preserves the item when full.
tests/eggo-cpu-projectiles.test.mjs checks these original results through the
live Tower.use/launchProjectile methods. All five focused tests pass.
The reconstruction remains incomplete; these checks do not establish complete
original RNG order, integrated opponent trajectories, roster/round-result
flow or full audio and frame parity.

Reference: local Eggo Mania (E) (M6).gba, 4,194,304 bytes; installed mGBA libretro core (the same core selected in RetroArch). State/input traces and 240×160 framebuffer captures are under this folder. `scripts/eggo-reference.py` resumes a named state and advances exact frame counts; it does not alter the ROM or the user's normal saves.

## Verified directly on 2026-09-18

- Extra Modes → Survival → character → difficulty; `survival-hard.png` proves HARD selected. Short 2-frame menu inputs can be ignored; use 8-frame presses and release delays.
- Hard opens in the industrial laboratory, not the green outdoor training stage. Copper pipes, teal metal plates, acid vessels and electricity; no visible placement grid.
- Native display 240×160; two 112-pixel fields separated by a 16-pixel progress divider. Placed tiles are 16×16 pixels: 7 columns per field.
- Hard stationary reference `hard-idle`; 8 right frames in `walk8`: egg shifts approximately 16 pixels → 2 pixels/frame, about 7.5 grid cells/s at 60 Hz.
- A places, B rotates; Up jumps, L jumps off tower, R discards. Tutorial control screenshot records these mappings.
- `throw-frame4`, `hard-place`, `hard-place60`: placing produces a jump and a falling/expanding piece, not an instantaneous teleport. Incomplete placed pieces look orange/brown; complete floors look silver/gray.
- Help pages: complete rows resist water; too many incomplete rows collapse; a wobble meter indicates risk; water danger symbol flashes before destruction.
- Filler fills up to six gaps below the player.
- Super boots improve speed and jump, not jump alone.
- Lightning knocks the opponent from their tower.
- Hammer destroys incomplete rows or knocks players off the tower.
- Bombs have a fuse; they can be thrown back before exploding.

## Still requiring direct verification

Exact jump trajectory, gravity/float/fast-fall and throw timings; Hard water and crate timings; tower target height; instability accumulator and collapse thresholds; score/combo/bonus algorithm; attack collision and targeting; how Survival carries state, rounds and difficulty; complete inventory of stage enemies and their behavior; victory/defeat and progression. New implementation must not be called feature-complete until these are checked. Existing first-version tests are not proof of original-game parity.

## Measurements and corrections, 2026-09-19

- Survival first cycle observed: factory → dragon → castle → pirate → space → jungle → park → beanstalk; ninth round returns to factory. This was inspected using explicitly logged goal-position RAM probes, not a claim of eight legitimate human-play wins. Later-cycle starting-board behavior remains to be checked.
- Source art decoded from VRAM/palette/OAM, using the original ROM locally. Backgrounds and rivals for all eight stages now load in the renderer. Initial procedural factory remains only as a loading fallback.
- Early `hard-idle` RAM coordinate probes at 0x3bd4/0x3bd8 match the controlled player's movement. These addresses are NOT yet validated as stable during arbitrary later gameplay; do not use them as universal telemetry.
- Neutral vertical acceleration: 0.2 px/frame²; Up: 0.1; Down: 0.35. Jump integration starts at 3.6 px/frame before gravity; first held-Up step moves 3.5 px. Test samples use a one-frame alignment to the ROM's input polling.
- `jump-world`: world Y at frames 8/16/22/24 is 697.644 / 680.844 / 676.644 / 676.844, from a 720.044 baseline. `fast-fall-world`: Down after the same eight-frame Up press gives Y=685.043 at frame 16. Implementation matches these isolated samples within 0.02 pixel.
- Goal probes: Y=127, 120 and 112 trigger a win; Y=128 does not. Baseline Y≈720 implies >37 tiles of vertical rise. A later native run also wins after the actor is moved to the far-left edge, so rescue has no center-alignment requirement.
- Placing also works while airborne (`air-throw`). The throw animation snaps toward the new tower surface and is followed by a hop. Current arc approximates it; exact collision and landing rules remain unverified.
- Current source includes all five help-listed items and a provisional bird hazard. Their presence alone is not evidence of exact fuse, hit, strength or enemy behavior.

## Continuation checkpoint (2026-09-19)

Latest implementation verification: eight model tests pass, including externally measured GBA motion samples; Electron keyboard placement passes; stage-grid and balloon screenshots inspected. All eight backgrounds/rival poses are integrated, with original rescue blimp. Default is Survival/Hard, width 7 and calibrated rescue rise 37. Survival win count is shown and recorded; loss/restart resets the run.

Completion audit remains INCOMPLETE. The available evidence does not prove original water rise/underwater recovery, wobble/collapse thresholds, score and combo rules, all enemy behaviors, timed weapon details, avatar animation/selection, original CPU difficulty or later-cycle starting layouts, or sound parity. Do not mark the goal complete based on the passing eight implementation tests.

Next concrete investigation: use `hard-idle` → `idle600` / `idle1200` captures to identify the original underwater/attack behavior. At long idle, early RAM coordinate offsets may no longer identify the controlled character; revalidate against OAM and inputs before drawing conclusions. Keep the primary coordinate calibration limited to the short controlled `jump-world`, `fast-fall-world`, `walk8`, and goal probes. Direct original behavior is authoritative over the current approximate model.

## Water recovery correction (2026-10-03)

Three short, independent input sequences from `hard-idle` reproduce the same
vertical water behavior: a released L press, a held L press, and L followed by
Right. Up after frame 60 also retains the same recovery trajectory. Screenshots
show the black water creature throwing the player up, rather than a drowning
defeat. These short traces remain consistent with the calibrated player RAM
coordinates and visible movement.

The corrected model allows a dive below the base. Before the water's lower
boundary the measured per-frame downward velocity follows
`v_next = (15/16)*v + 15/16`; below the boundary it follows
`v_next = (15/16)*v - 15/32`, with pixels/frame as units. The water creature
launches the player after 48 water steps. Its upward launch uses 5.52 px/frame
before a 0.08 px/frame² acceleration step and a 6.75 px position lift. Compared
samples at frames 8, 20, 40, 60, 62, 64 and 90 differ by under 0.025 px.
The small remaining discrepancy includes GBA fixed-point rounding. No long
trace or later-stage behavior is claimed as calibrated by this evidence.

Original creature pose: `water-up30.sprites/026.png`. Electron screenshot:
`tests/OUTPUT/eggo-mania-visual_2026-10-02T22-42-22-918Z/water.png`.
Reproducible re-run and parameters:
`scripts/OUTPUT/eggo-reference_2026-10-03_00-42-29_700836/`.
Reference tooling now creates timestamped OUTPUT folders, hashes the ROM,
core and starting state, records core options and exports traces as CSV/JSON.

Nine focused model tests and the Electron water-render/keyboard check passed.
Water rise, erosion, later-stage recovery and enemy animation still need
independent verification. Full Survival parity remains incomplete.

## Input-only tower observations (2026-10-03)

The left field's occupancy is a 47×8 byte array at EWRAM 0x10084 (seven
playable columns plus padding), followed by floor sentinels. Its row gap counts
begin at 0x10214. The second field is offset by 0x124c. Cell values identify
individual piece entities, not merely shape colors. These layouts were checked
against the initial Z and later visible placements.

IMPORTANT: `eggo-board-probe.py`'s sparse20/solid20 memory-injection experiments
are inconclusive. Their cells lacked corresponding live piece entities and
cached graphics. Their decay cannot establish the original collapse rule, even
after setting row gap counts. Do not use those two probes as calibration data.

`scripts/eggo_reference_bot.py` now drives ordinary controller inputs while
observing board/OAM data. It makes NO RAM writes. Its exact inputs, initial
state hash, parameters, framebuffer samples and memory samples are saved by the
reference host. Authoritative runs:

- `scripts/OUTPUT/eggo-reference_2026-10-03_01-01-06_741942/bot-tower`: seven
  incomplete floors are present from frame 240 and remain through frame 1680.
  No full floor forms during this interval. The old six-floor/two-second
  automatic collapse is contradicted by this 24-second sequence.
- `scripts/OUTPUT/eggo-reference_2026-10-03_01-03-59_889966/bot-stack`: a sparse
  tower reaches twelve floors near frame 720 and is reduced afterwards. This
  does NOT isolate tower instability from weapons/enemies. It provides an upper
  reference case, not proof of an exact twelve-floor collapse trigger.

The interim model retains a collapse mechanism but moves its trigger to twelve
incomplete floors and separates the warning meter from the trigger. This fixes
the verified seven-floor counterexample. The original instability accumulator,
weapon contributions and exact threshold remain unverified; this is not a
completed transcription of that system.

Placement previews and the independently read board show single-cell, domino,
straight triomino and bent triomino pieces. They were missing from SHAPES and
are now present. The complete original shape distribution and probabilities
remain open. The input-only observed shapes are captured in
`tests/fixtures/eggo-mania-gba.json`, together with the seven-floor board.

The first-stage baseline water remains visually at the base during these runs;
the previously invented constant 0.065-cell/s rise is now disabled by default.
An optional extra water-rise parameter remains available. This does not prove
the original's entire water/erosion algorithm or later-stage water behavior.

Meter textures are now the decoded original top eight rows of meter-left/right,
with the original eight-pixel pointer (`bot-tower.frame00600.sprites/004.png`).
Electron native render:
`tests/OUTPUT/eggo-mania-visual_2026-10-02T23-10-45-287Z/reference.native.png`.
Ten focused model checks pass, including the external reference's small shapes
and stable seven-floor counterexample; Electron keyboard placement/render pass.

Visual comparison still contradicts full parity: individual original pieces
use bronze, silver and gold panels with shared internal edges, while the current
renderer repeats an orange tile for incomplete cells. Character poses/animation,
stage enemies, exact scoring and original AI also remain incomplete. Next work
should address whole-piece panel rendering and isolate collapse from enemy hits,
using ordinary controller inputs rather than fabricated piece ownership.

## Connected native panels (2026-10-03)

`scripts/eggo-build-panel-atlas.py` now extracts 8×8 quarters from three
input-only captures (frames 120, 600 and 840 of bot-tower). It finds the
foreground map's platform tile to account for the map's shifting vertical
origin, reads original palette/VRAM pixels, and keys each quarter by material,
corner orientation and same-piece horizontal/vertical/diagonal neighbors.
Parameters and hashes are in
`scripts/OUTPUT/eggo-panel-atlas_2026-10-03_01-22-46/parameters.json`.

44 corner/material cases are directly sampled. 16 missing cases use the
nearest available original quarter of the SAME material and orientation;
they are listed explicitly in assets/panel-atlas.json. This is not proof of
pixel identity for every possible future piece shape. Interior square cases
are among the missing samples.

Placed cells now carry an independent piece ID and material, separate from
their old color index. Placement, filler, bonuses, explosion and floor removal
preserve or clear that metadata. Touching independently placed pieces of the
same color retain a boundary. The original-observed Z/L3 bronze, mirrored-S
silver, U/plus gold and monomino silver styles are applied; unobserved styles
remain a bronze fallback. Full floors retain the earlier silver override.

The renderer assembles each connected 16×16 tile once into a small canvas
cache, then uses one draw per cell per frame. No repeated quarter assembly
is performed during ordinary rendering. This is an implementation observation,
not a measured FPS claim.

Eleven focused model checks and Electron keyboard/render passed. Independent
reference comparison uses tests/fixtures/eggo-panels-gba.png decoded directly
from the foreground, versus
`tests/OUTPUT/eggo-mania-visual_2026-10-02T23-22-47-437Z/panels.native.png`.
5,332 of 6,656 visible reference pixels match exactly; mean visible RGB error
is 6.218/255, and alpha mismatches are zero. Both images were inspected: the
connected geometry and three materials now resemble the original, with some
remaining panel-pattern variants.

Full-game visual parity is still contradicted by the camera: the current
reference-board render scrolls far enough to clip most lower rows, while the
GBA frame shows the complete seven-floor tower. Avatar pose/animation, original
foreground platform/water and camera/background scrolling must be calibrated
next. Exact instability, enemies, scoring, AI/progression and sound remain open.

## Camera and native moving objects (2026-10-03)

Factory starts at background offset 94, not 69. New input-only camera-jump,
camera-short-jump and camera-throw runs are in scripts/OUTPUT at
01-32-34_765349, 01-38-27_777795 and 01-40-12_808881 respectively.
scripts/eggo-measure-camera.py measures platform projection and matches the
background against its decoded map. Source hashes, inputs and measurements are
in tests/fixtures/eggo-camera-gba.json and the timestamped measurement output.

Normal foreground follows the preceding egg height with an 8px margin;
background has its own 2px margin, half-rate parallax and fitted rising response.
Throw foreground stays still through frame 12, then rises only about 14px,
despite the much higher visible actor arc. The new view delays that movement,
eases toward the throw endpoints' midpoint, then holds through the following
hop. These three sequences fit within 2 native pixels. View state advances at
the fixed simulation rate, independently of render calls. Other camera states
and later-stage starting offsets are still provisional. platform.png now uses
the native foreground at its world position.

The reference-board fixture's old actor coordinates did not match frame 840.
It now uses that exact OAM object 36: position [72,32], anchor [32,56],
foreground offset 5, yielding visible egg position [6.5,1.8125] cells.
This fixture correction is separate from the camera fix. RAM coordinates may
lead displayed OAM by a frame. An earlier claim that actor-motion changed OAM
while its RAM coordinate stayed unchanged was a research filename error:
Path.with_suffix('.ram') on a frame prefix removed the frame number and read
the final run dump instead. Reading prefix + '.ram' agrees with the visible
movement. Validate addresses against the same frame before using them.

Native Yolko strips now distinguish carrying a piece and empty hands. Sources
are input-only actor-motion (01-58-27_058310), actor-free (02-02-34_170672),
actor-hop (02-03-32_040620) and camera-throw, with inputs/state hashes preserved.
actor-free catches another piece at frame 28, so only earlier frames supply
empty-hand poses. Other airborne empty-hand samples come from the post-throw
hop. Selection/cycling is fitted; full rival/creature animation remains open.
The initial actor anchor is approximately 63.94px; the model now starts at 64px.

Observed item pictures are native 16px icons, held 33px above the actor anchor.
bot-tower supplies 28 distinct pictures, including small pieces, hammer, boots,
lightning and bomb. One missing L3 orientation is a recorded horizontal flip
of source icon 18, not independent pixel evidence for that orientation. Filler
and unobserved pictures retain fallbacks. Ghidra routine `0x0801a380` places
the central progress portraits from the actor's previous-frame integer world Y
with `max(0, floor(27 * worldY / 128) - 16)` in this mode. The app stores the
pre-update world Y and applies the same integer formula. An offline audit matches
all 1,200 player/CPU positions across 600 captured frames. The frame-840
reference fixture matches the full 240×160 image exactly; it uses the captured
portrait OAM positions because that older capture has no previous CPU actor
sample. Full-scene replay parity remains incomplete.

Settled meter samples: empty/one/four/seven incomplete floors give left pointer
X=15/22/52/84. The renderer interpolates these visual samples and caps near 88;
transient captures differ. This does NOT establish collapse accumulation or
timing. The provisional twelve-floor/two-second collapse remains an open
gameplay difference, independently of the improved meter appearance.

Fourteen focused checks passed across the full run and the fixed L3 icon rerun.
Electron keyboard placement/render passed. The final native screenshot was
inspected: tests/OUTPUT/eggo-mania-visual_2026-10-03T00-22-20-672Z/reference.native.png.
Its left-field actor, icon, meter and portrait use the original snapshot; the
right field remains a newly started CPU and is not a same-state comparison.
Full Survival parity remains INCOMPLETE. Next: isolate collapse/erosion from
enemy attacks and record complete-floor bonuses using ordinary inputs. Exact
items, enemies, scoring, AI/progression, later views, full animation, selection,
podium and audio remain open. Targeted checks do not prove full feature parity.

## Destructive-water continuation (2026-10-03)

The reference player now steers from OAM, plans rotations/reachable positions,
waits through throws and uses carried items (which have no placement preview).
All these are ordinary controller inputs, not RAM writes. The host optionally
records each board change and saves exact state/graphics snapshots on cell loss
or at requested frames. Its new board/snapshot parameters are logged with the
usual inputs, hashes and initial state.

Authoritative new runs:

- scripts/OUTPUT/eggo-reference_2026-10-03_02-34-53_832692/build-rotated:
  the board reaches eight incomplete floors at frame 412 and loses row 6 at
  frame 414. This contradicts the old twelve-floor/two-second rule. Later losses
  delete the penultimate floor rather than the bottom floor.
- scripts/OUTPUT/eggo-reference_2026-10-03_02-41-07_573665/after-surge:
  resume that actual frame-414 state, then run 600 frames with no input and no
  RAM writes. The seven-floor board continues collapsing at frames
  42,108,150,240,330,396, leaving its two-cell final roof intact through frame
  600. These are whole-floor removals; the remaining rows shift down.

Each removal interval in the no-input continuation is exactly `24*n-6` frames,
where n is the occupied-cell count of the next penultimate floor: 2,3,2,4,4,3.
The new model retains an active destruction chain, uses those per-floor times,
targets the penultimate floor, and stops at a complete shielding floor or when
only the final roof remains. Starting from the measured active state, a focused
test compares the entire board on every one of the 600 frames and matches it.
The already verified stable seven-floor case still passes.

The eighth-floor activation is an interim fit to the observed onset. Its exact
timing while a piece is in the throw animation and retargeting/progress when
additional pieces are committed during the wave remain unverified. General
water progression and other enemy/item damage are separate open questions.
Do not describe this as recovery of the entire original instability algorithm.

The destructive wave and 32px warning badge now use native graphics. The wave
is a single pose with fitted small bobbing, not the complete original cycle.
Fifteen focused model/reference checks pass. Electron keyboard/render passed;
the wave screenshot was inspected at
tests/OUTPUT/eggo-mania-visual_2026-10-03T00-47-58-915Z/surge.native.png
(captured before replacing the generic exclamation mark with the native badge).

The build-items run at 02-50-39_924144 records more ordinary item use and native
CPU completed-floor changes. It does not complete a player floor. Its board
events can be used next to isolate completion bonuses/item filling, with new
captures from survival-hard rather than assuming hard-idle is the initial game
state: hard-idle includes 180 idle frames after hard-live, which itself includes
420 frames after difficulty selection. CPU progress there is not evidence of
a starting handicap. Full feature parity remains incomplete.

## Filler and removal of unsupported prototype behavior (2026-10-03)

New input-only captures begin at the actual difficulty menu, not hard-idle:

- scripts/OUTPUT/eggo-reference_2026-10-03_02-54-44_146165/hard-origin:
  A for 8 frames, then 420 neutral frames. Both boards are empty at the end;
  the eggs already carry pickups. CPU progress in hard-idle is later gameplay,
  not an initial handicap.
- scripts/OUTPUT/eggo-reference_2026-10-03_02-55-37_060043/first-floor:
  continue 260 neutral frames and log every board change/completion.
- scripts/OUTPUT/eggo-reference_2026-10-03_02-58-24_529443/filler-frames:
  independently repeat the first 80 frames with graphics sampled every frame.

The CPU first places a four-cell zigzag at frame 28. At frame 51, the filler
adds exactly six independently owned cells, increasing total occupancy from
4 to 10 and completing one floor. It fills bottom-row columns 3,2,4,5,6,
then column 3 in the next row. This supports lower-row priority with columns
chosen by distance from the egg, preferring left over right at equal distance.
No extra two cells are added on completion: occupancy stays at 10 through frame
100, while the temporary filler entity IDs change as their animation ends.
The later regular-piece completion in build-items at frame 218 likewise adds
only its four piece cells. The prototype's unconditional two-cell completion
bonus was unsupported and is removed. Exact combo/other bonus rules remain open.

The new model filler reproduces the frame-51 occupied positions AND original
creation order from tests/fixtures/eggo-filler-gba.json. Sprite 27 in the fine
capture is the carried filler. Its picture matches atlas icon 9 (mean visible
RGB difference 0.28/255). Icon 9 had been mistakenly assigned to the hammer;
it now correctly belongs to the filler. The actual hammer's T-shaped picture
is taken from the original help6 page. Its live-game palette still needs a
direct gameplay capture. The model does not reproduce all filler animation yet.

The default pickup pool is limited to eight families directly observed in the
Hard pickups/previews: mono, domino, I3, L3, S, Z, U5 and cross5. Four classic
tetromino shapes from the first prototype had no supporting capture and no
matching native pickup pictures. Their old definitions remain for compatibility
with synthetic tests, but the game no longer spawns them. Native weights and
possible later-round additions require further investigation.

before-surge at 03-08-31_143318 replays the exact original build-rotated input
trace, using the new --steps-file option. Its final RAM is byte-for-byte equal
to the original frame-414 loss snapshot. Its four-frame pickup catalog contains
no hammer picture before that first destruction event; this supports intrinsic
instability as a working hypothesis, but does not prove absence of every attack.

Context only: [Pontus's GameCube TAS notes](https://tasvideos.org/9220S) describe
completion combos, concrete filling and item effects. They explicitly refer to
the eight-column GameCube version and note substantial GBA differences. They
are useful hypotheses, not permission to import their rules into seven-column
GBA Survival without a direct GBA check.

Seventeen focused checks passed. Electron keyboard placement and filler use
passed, and held/filled screenshots were inspected at
tests/OUTPUT/eggo-mania-visual_2026-10-03T01-14-16-030Z.
Remaining priorities include native pickup motion/spawn timing, boots physics,
exact regular completion/combo bonuses and full wave activation/retargeting.
Enemies, complete animation, Survival presentation/progression and audio still
need work; full feature parity is not proved.

## Free pickup motion measured from affine OAM

The filler-frames capture at 02-58-24_529443 and its input-only continuation
pickup-continuation at 03-27-09_694429 follow the same left-field pickup for
147 consecutive frames (12 through 158). Its horizontal center remains 36px;
apparent lateral movement comes from rotation rather than a moving center.
The affine double-size 16px object has a 32px bounding rectangle, so its center
is OAM position plus 16px, not plus 8px. Interpreting the inverse affine matrix
gives a sinusoidal sway of approximately +/-30 degrees with a 60-frame period.

The former 2.9 tiles/s fall rate was incorrect. A rate of 59/60 native pixels
per frame, or 59/16 tiles/s, reproduces every measured integer Y position after
fitting the initial fractional coordinate. Sway differs from native OAM by at
most 0.556 degrees; lookup-table and matrix quantization are not reproduced.
Free native icon pictures now sway; caught pictures remain upright. Initial
spawn phase is still provisional, and spawn cadence, water disappearance and
camera-dependent spawn height still require direct calibration.

scripts/eggo-measure-pickups.py records source state/trace hashes, parameters,
CSV measurements and an independent test fixture in a timestamped OUTPUT
folder. Eighteen targeted checks pass. The CPU check measures peak constructed
height because a surge can lower the final height; it does not prove native
CPU parity or victory. This seed reaches 11 floors then ends the observation
at five after repeated surge removals. Electron pickup rendering and keyboard
placement were inspected at
tests/OUTPUT/eggo-mania-visual_2026-10-03T01-30-14-950Z/pickup.native.png.

## Super boots: automatic activation and measured physics

Replaying bot-tower's recorded inputs through frame 1200 from hard-idle produces
byte-identical RAM (boots-replay at 03-32-25_207193). The boot picture is the
affine object at X=36/Y=15. From that state, boots-catch and boots-held use only
direction/jump/discard buttons to approach it. The latter uses R for two frames,
LEFT+UP for 27 and UP for 21; no A input occurs. The original boots effect
counter at RAM 0x4500 is zero through frame 20, 598 at frame 25, then decreases
one per frame. Thus activation is at frame 23 with a 600-frame duration. The
icon disappears as its pickup particles appear. Unlike the prototype, boots
activate on contact rather than becoming an item awaiting the use button.

boots-jump, boots-fast and boots-speed establish these native values:
initial jump speed 5.1px/frame (5.0 after the first held-Up gravity step),
horizontal speed 2.25px/frame, and upward-positive gravity magnitudes of
0.1px/frame² with Up held, 0.3 without a modifier and 0.5 with Down held.
The previous jump multiplier 1.35, speed multiplier 1.5, unchanged gravity and
eight-second duration were guesses. They are replaced with measured values.
An independent empty-hand capture from hard-origin, empty-jump at
03-36-20_569263, retains the ordinary 3.6px initial jump: empty hands alone
do not explain the higher boots jump. boots-expired at 03-37-55_279613 reads
a zero effect counter after the observed 501 remaining steps. The actor is
underwater then, so its subsequent motion is not used as a post-expiry jump
calibration.

scripts/eggo-measure-boots.py preserves profile inputs, state/ROM/core hashes,
frame samples and countdown observations in timestamped OUTPUT and a fixture.
Twenty focused checks pass, including the measured neutral/fast jumps (less
than .03px error), exact horizontal increments, automatic pickup and expiry.
These checks establish this particular boots behavior, not overall Survival
parity. Pickup behavior while already holding another item, complete boots
artwork/particles, other powerups and attacks still require direct checks.

## Settled backgrounds for all eight Survival stages

The former shared 69px offset for later-stage maps was taken from captures
during the opening descent, rather than the settled ground position. New
input-only stage-start replays at 11-09-58 through 11-10-07 continue the existing
stage-result states with A then neutral input. Stage-landed captures at
11-11-12 through 11-11-18 add 120 neutral frames. All six samples per stage
(20/40/60/80/100/120) have the left actor settled near world Y=720.

Direct framebuffer matching against the decoded 256px map finds a consistent
offset of 94px for dragon, castle, space, jungle, park and beanstalk, and 86px
for pirate. Those values replace the shared guess. The factory 94px calibration
is unchanged. A capped channel comparison avoids opaque actors/pickups dominating
the background match; the fixture retains the best and next-best error for every
sample. Source result states used diagnostic wins to reach later stages, as
previously recorded; this is stage art calibration, not proof of legitimate
Survival progression or later-cycle parity.

scripts/eggo-measure-stage-backgrounds.py writes CSV/JSON measurements, hashes
and a fixture. Its targeted check passed. All eight updated backgrounds were
rendered and visually inspected in Electron at
tests/OUTPUT/eggo-mania-visual_2026-10-03T09-13-21-748Z/stage-grid.png.
The intro descent/countdown itself is not implemented, and camera behavior
outside the calibrated sequences and complete background animation remain open.

## Full falls and interactive intro controls

An input-only replay from goal-after reaches the second-stage descent at frame
300. In intro-controls at 11-20-33_053832, LEFT+UP for sixteen frames moves the
actor horizontally by 32px and changes downward speed from 3.5 to 1.75px/frame.
Therefore the descent must remain interactive; replacing the whole opening
with a prerecorded movie would incorrectly suppress native controls. No intro
movie or noninteractive descent was added.

This check exposed missing terminal speeds in the model. The previously measured
camera-jump and camera-short-jump traces already plateau at 3.5px/frame on a
neutral descent. New fall-float, fall-fast, boots-fall-float and boots-fall-fast
captures at 11-21-47, plus the high-altitude fall-fast-high at 11-22-40_480122,
establish these downward caps: ordinary neutral 3.5px/frame, Up 1.75, Down 5.5;
boots neutral 5, Up still 1.75, Down 6. The boosted Up cap does not increase
with the jump impulse. Caps apply after acceleration and input changes, before
integrating position; upward movement is unaffected. Measured underwater/ejection
rules remain separate and have not been replaced by these dry-flight limits.

scripts/eggo-measure-fall.py preserves six complete pre-collision airborne
profiles, 328 frame positions in total, with parameters and source hashes in
timestamped OUTPUT. Each profile contains at least two observed terminal-speed
steps. Comparison against every retained frame passes with less than .03px
position error. Twenty-one existing checks passed with the physics change; the
new full-trajectory check passed after fixing its high-altitude test goal so
the test would not trigger victory before frame two. The updated synthetic CPU
run ends at seven floors with four sealed rows, but still does not establish
native rival decisions or a complete Survival win.

The original interactive opening/countdown, its streamed background and the
handoff into play still need implementation. These measurements correct normal
play as well as providing the physical rules needed for that opening.

## Intro artwork and streamed background evidence

The large countdown symbols are affine 64px OAM objects using palette 13,
not part of the foreground map. Object 2 at frames 90/120/180/240 of
dragon-start contains 3/2/1/GO respectively. Their raw pictures are now extracted
as countdown.png. The pink introductory balloon is composed from palette-6
objects 26 and 28-31 at frame 120, preserving sprite priority, signed screen
positions and transparent pixels. intro-balloon.png retains the full 128px
composition. scripts/eggo-build-intro-art.py records hashes, writes a manifest
and saves a contact sheet. The sheet at eggo-intro-art_2026-10-03_11-33-21 was
visually inspected. The art is not yet integrated into the playable opening.

The opening uses a different high-altitude part of the environment, streamed
into the native tilemap during descent. Matching the final settled stage bitmap
against frame 300 gives roughly 14.6 capped-channel error; matching that frame's
own decoded map gives 2.23 and a 77px offset. Therefore simply scrolling the
settled 256px stage bitmap upward for the intro would show the wrong scenery.
The playable opening must account for that additional environment as well as
the already measured input-dependent descent and native countdown animation.

## Interactive opening integrated

The reference host's --oam-trace option records object attributes, affine matrix
and tile hash per frame without saving every frame's RAM/VRAM. An input-only
factory-intro-timing run at 11-43-23_206712 identifies native 3/2/1/GO changes
at frames 47/86/126/166, with the countdown disappearing at frame 246.
scripts/eggo-build-countdown-motion.py compiles those 199 visible frames,
preserving their original affine scale/rotation instead of inventing a tween.

scripts/eggo-build-intro-environments.py reconstructs each stage's taller
background by matching overlapping decoded native map crops. All settled
ground offsets land at 350px except pirate at 342px; the final canvas adds
the 160px viewport. Native start heights come from the first continuous 3.5px
descent in each trace. Some overlap errors are nonzero because palette/texture
animation changes between captures. The stage environment keeps original art;
it does not yet reproduce every animated tile or palette fade.

Survival startRound now begins in countdown, then hands off into normal playable
descent. Movement, floating and fast descent use the shared physics. Initial
height is marked as entry descent so it cannot accidentally trigger rescue.
Landing clears that state and returns to the regular camera/environment.
The countdown uses its native affine data and the intro balloon; native high
environment crops follow the measured height path. Gameplay-only tests explicitly
skip the intro. The former hand-drawn factory lightning overlay was removed.

Twenty-two existing checks passed. Electron's --intro-only check passed real
left/up control (16px horizontally and 14px descent over eight frames), phase
handoff, landing and absence of an early victory. Four screenshots were inspected
at tests/OUTPUT/eggo-mania-visual_2026-10-03T09-53-14-379Z. This establishes a
working native-art opening, not full Survival parity. Remaining intro differences
include exact actor/balloon animation, palette fade, pickup timing/initial hand
contents and rival decisions. Countdown movement is blocked until the measured
release; subsequent flight remains interactive.


## Item observation checkpoints (2026-10-03)

The reference host now supports `--item-trace`. `eggo_item_trace.py` reads native
16px palette-2 pictures and matches their RGBA hashes against the verified item
atlas. Carried-item detection uses the actor-relative offset (24,15), with a
three-pixel tolerance. It snapshots the first carried item of each type/side,
without writing emulated memory. Matching depends on the observed palette/art
variant; absence from the trace does not prove absence of an item. Hammer art
is still help-derived and may not match live palette variants.

Input-only `native-items` at
scripts/OUTPUT/eggo-reference_2026-10-03_12-23-33_392157 starts from hard-origin,
runs the current build bot for 6000 frames and records recognized items. It
captures CPU filler at frame 684 and CPU lightning at frame 1037. Bomb pictures
were observed but no carried bomb was recognized. The player was already
incapacitated in the lightning checkpoint, so that checkpoint cannot establish
normal lightning knockback or stun duration. Its replay at 12-24-43_640005 must
not be treated as proof of those rules.

The earlier `bomb-flight` replay at 12-21-07_796234 continues bot-tower.state for
120 neutral frames. It shows a free bomb pickup, not a verified thrown bomb.
Do not fit attack travel or blast behavior from that capture. The help page
explicitly describes bombs exploding when their fuse runs out and being thrown
back quickly. Existing model attack delay, fuse and explosion geometry remain
provisional until an actual caught/thrown live bomb is measured.

`dragon-items` at 12-26-11_077161 records 2400 neutral frames from dragon-landed.
It recognizes free boots and filler but supplies no carried bomb checkpoint.
All successful runs above have writes=[], input sequences, initial-state,
ROM/core hashes and `item-trace.json`; the exploratory invocation with an invalid space key is not used as evidence. No gameplay rules were changed from these
inconclusive attack captures.


## Boxed bomb lifetime and carried art (2026-10-03)

`bomb-lifetime` at 12-34-13_873422 starts from the first free bomb checkpoint
at 12-31-35_687909 and advances 360 neutral frames, writes=[]. A later
identity probe at 12-42-07_974244 changes only X at 0x4bdc by 32 pixels;
the boxed-bomb OAM X changes from 125 to 157 on the second displayed frame.
This confirms CPU bomb entity base 0x4bc4, type 3, position at offsets 24/28
for this checkpoint. A superficially similar left-side entity at 0x387c was
rejected: moving it did not move the observed bomb. Addresses are checkpoint
identities, not yet a universal item allocator map.

The same type-3 entity falls continuously through samples 30..210, retaining
the original boxed-bomb picture at frame 210 (3.5 seconds). Its boxed picture
remains visible up to frame 229. `eggo-measure-bomb.py` reproduces these checks,
records source RAM/picture hashes and the identity probe, and writes
`tests/fixtures/eggo-bomb-gba.json`. This contradicts the prototype's unsupported
three-second fuse starting at spawn. New falling boxes have no active fuse;
catching starts the provisional countdown, and returned/discarded bombs retain
remaining time. The three-second armed duration is still an estimate.

A controlled pickup probe at 12-44-24_578471 positions that existing bomb
inside the empty-handed CPU's bounds just after its piece completes. The native
carried picture becomes an unboxed round blue/gray bomb. Its object 30 at frame
30 is extracted by `eggo-build-bomb-art.py` as bomb-armed.png, with source graphics
hashes and the explicitly logged two position writes. This probe proves carried
art, not natural item targeting, exact throw physics, fuse timing or blast size.
The item trace now recognizes this armed picture separately from the boxed
picture. Actor-based estimated world positions in the item trace are approximate
and are not used to calibrate the lifetime fixture.

The native armed-bomb picture is used after pickup in the renderer. The focused
Electron `--bomb-only` capture shows an unarmed falling box and an armed held
bomb together. Twenty-three model checks passed, including a free bomb lasting
longer than the former prototype fuse; full attack/Survival parity remains open.


## Bomb transition and native burst (2026-10-03)

The armed-bomb replay at 12-52-44_516596 and its frame-exact transition capture
at 12-54-56_949310 show the CPU losing its held item as it falls into the water,
not a verified timed explosion. This is explicitly rejected as a fuse-length
measurement. Native inventory ID is at 0x4438 for the player and 0x57b4 for
this CPU; ID 8 triggers the bomb path. The similarly shaped nearby entity
fields +12 are texture/rotation-like indices, not established universal item
kind IDs. The boxed-bomb lifetime script now labels the verified value as a
native_texture_index rather than claiming a universal bomb type enum.

Additional diagnostic runs at 13-01-06_159910 and 13-03-20_823216 modify a
left-field pickup index/position. They produce a different held graphic and do
not provide a valid naturally initialized bomb or fuse. A direct inventory
ID-8 probe at 13-11-14_976020 explodes immediately; a guess at 0x44f8 at
13-14-30_262351 leaves the bomb exploding immediately and is rejected as a
fuse field. These probes must not be used to fit armed duration or blast
geometry. The three-second prototype armed fuse remains provisional.

`bomb-explosion-art` at 13-22-05_526756 uses the single logged inventory-ID
write to trigger the native zero-fuse bomb effect. All 40 displayed frames and
graphics are recorded. `eggo-build-explosion.py` extracts eight low-opacity-count
16px palette-2 burst sprites, applies native affine matrices and OAM order,
and rejects opaque crate pictures. There are eight particles in frames 2..25,
then none. Native body-centred origin in this stationary view is (64,96).
The 128px effect sheet and JSON record source hashes, selection rules and the
exact diagnostic write; this is visual evidence, not normal fuse initialization.
The renderer now plays this native particle sequence at a held-bomb expiry,
centred one cell above the character's feet, and removes the invented full-field
yellow flash for explosions. Blast damage and throw physics remain provisional.

Armed-bomb transparent RGB was normalized to zero so pixel hashes match the
read-only recorder. `--item-trace` now records all palette-2 16px objects and
unique raw pictures, including unrecognized countdown/flash variants, rather
than silently dropping them. Their labels remain observational, not proof of
item kinds. Estimated actor-based world positions still require calibration.

The focused Electron bomb capture at
 tests/OUTPUT/eggo-mania-visual_2026-10-03T11-25-52-563Z
shows the native held bomb and eight red burst sprites. Twenty-three existing
model checks pass; full Survival parity and bomb fuse/throw/damage remain open.

## Natural bomb checkpoint and water inventory (2026-10-03)

The research bot incorrectly targeted HUD portraits (OAM objects 2 and 3) as
pickups, and aimed eight pixels off the centre of double-size affine pickups.
Both targeting bugs are corrected. The input-only build-corrected replay in
13-32-22_191046 naturally catches inventory ID 8 at frame 3567. Its saved state
is the starting point for the following experiments; none writes to RAM.
That directory also contains delayed-origin because two earlier runners shared
a timestamp. The named replay JSON is authoritative; generic parameters.json
may belong to delayed-origin. Future output directories reject collisions.

dive-inventory in 13-41-42_291613 carries ordinary inventory ID 6 through
frame 13 and loses it on frame 14, crossing the measured water entry boundary.
The native model now clears held inventory on that crossing, including armed
bombs without a burst. eggo-measure-water-inventory.py preserves input history,
RAM hashes and the four boundary samples. This does not establish all underwater
pickup rules or discarded-object trajectories.

natural-bomb-float in 13-43-33_325875 loses the bomb at frame 80 while above
water, with a bee overhead and a bomb-like object below it. This is probable
theft, not a fuse measurement. The earlier neutral hold also loses its bomb
before expiry and cannot establish the timer.

bomb-right-throw in 13-53-08_632076 and bomb-right-expiry in
13-55-10_161647 replay the natural checkpoint with 2 RIGHT, 8 A and neutral
input. The projectile position is at 0x10388, vertical velocity at 0x10398,
and armed counter at 0x103a4. Counter = 250 - elapsed frame until zero at
250; native red burst first appears at 251. The prototype armed fuse is
replaced by 250/60 seconds. Twenty-five model checks pass, including that
countdown and water-boundary inventory loss.
At the natural pickup checkpoint, inventory ID is 8 and the held bomb counter
at 0x10640 is already 250. Neutral-held samples have 245 at frame 5 and 240
at frame 10; throwing preserves elapsed fuse time rather than resetting it.

After initial vertical release, position advances exactly 2 pixels/frame
horizontally and vertical velocity increases by 0.125 pixels/frame each frame
(verified from frames 20..70, excluding later collisions). The bomb crosses
the field divider and bounces on the other tower. eggo-measure-armed-bomb.py
records these observations and source hashes. The native reconstruction still
uses provisional attack transfer/landing rules: these flight constants alone
do not establish initial release, targeting, collision or blast geometry.

bomb-launch-detail in 14-00-49_792819 captures each of the first 80 frames.
The thrown entity initializes on frame 3 at the player's current world Y and
X + 8 pixels, with vertical velocity -4 pixels/frame. While Y > target Y,
only Y changes, by -4. Starting at frame 17 in this capture, X changes by 2,
Y changes by the previous vertical velocity, then vertical velocity increases
by 0.125. These equations reproduce all 74 subsequent pre-collision positions
and velocities exactly, including the lift-to-arc transition. The first bounce
is frame 78; it is excluded from the unobstructed fixture.

eggo-measure-bomb-launch.py preserves the full frame sequence and asserts the
equations against original RAM. advanceBombFlight implements that measured
fixed-step flight in upward-positive tile units; its model test compares each
frame independently. Integration with attack targeting and collision is still
pending; the current playable attack transfer remains provisional.

An independent targeting probe, bomb-target-column in 14-04-30_488582,
uses 20 RIGHT+UP then A. At frame 21 it initializes X=54, Y=564.3425446,
target Y=544 (rather than the earlier 560). The destination column heights
are [9,12,12,13,12,12,12]. A simple same-column surface minus one tile
would predict 512 for column 2 and is contradicted by this capture. Therefore
target Y selection is not yet established and must not be implemented as
that guessed height rule. Both replays retain original RAM and input history.

## Playable cross-field bomb flight (2026-10-03)

The lookup is now established for three player throws: bomb origin X divided
by 16 selects the destination cached height-table column (with its leading
boundary entry). Multiplying that cached row by 16 reproduces target Y=560,
544 and 608 exactly. eggo-measure-bomb-target.py preserves each input-only
source, table and RAM hash. The table's row-to-world origin differs by two rows
from the player's initial world Y; use physical surface heights when mapping
to the native reconstruction, not raw board-array indices.

cpu-bomb-launch in 14-10-15_160568 loads a naturally caught CPU bomb. The CPU
holds it through frame 92, then launches at frame 93 with X=222, origin X=94,
Y=656.1895905 and target Y=640. Its lift advances by -4 pixels/frame until
frame 98; arc starts at 99, moving left by 2 and increasing vertical velocity
by 0.125. This confirms that the full field-to-field horizontal span is 128
pixels. The player's earlier X=142 at impact was a collision stop before its
unobstructed target X=146, not a 124-pixel travel span.

The playable model now launches finite-size bombs from both sides using the
measured lift and arc instead of a delayed direct transfer. The original fuse
continues through flight and return. Rendering projects the same projectile
into each independently scrolling field. At first contact the downward speed
is halved and reversed, and horizontal travel stops. Initial footprint-based
contact was an incomplete explanation; the later full replay below establishes
the native centre-column probe. The integrated model
reproduces every captured frame through that impact and the next two rebound
frames, with no fitted correction impulses or position snapping.

Twenty-eight focused model checks pass. The keyboard-controlled Electron bomb
capture at tests/OUTPUT/eggo-mania-visual_2026-10-03T12-16-01-430Z confirms
launch and cross-field rendering. Later rebounds, item catching geometry,
damage geometry and post-result simulation still need broader native checks;
this is not a completion claim for Survival or all attack behavior.

## Complete natural bomb rebound profile and whole-piece damage (2026-10-03)

bomb-full-flight in 14-19-49_228560 records every native frame through expiry,
without writes. eggo-measure-bomb-rebounds.py reproduces all 246 motion steps
after launch exactly, including both floor-height changes, several rebounds,
rest at frame 162, renewed fall at 224 and the frozen zero-counter frame 250.
The projectile probes its centre column, not the maximum height across its
whole sprite footprint. While travelling horizontally it checks the updated
position; after first landing, stationary rebounds check the previous vertical
position. These observations correct the earlier footprint interpretation.
At supported contact, a new downward speed no greater than the one-frame
gravity increment is zeroed. There is no added damping, position snapping or
arbitrary settling timer. Removing support resumes gravity normally.

The natural blast changes the board on frame 250; the first red burst is frame
251. Native effect frame zero is blank. Damage and effect creation now begin at
counter zero, with the effect age based on the shared simulation timestamp so
one player's update order cannot advance the other's burst prematurely.

eggo-measure-bomb-damage.py compares native frames 249/250: owner 54 loses all
five cells, including those outside the local three-by-three neighbourhood;
owner 62 loses both cells. The model now destroys every cell of each touched
piece entity. A direct full-board comparison reproduces the observed seven
removed cells and all surviving owners. Whole-piece deletion is established;
the precise initial blast footprint and character knockback radius remain
provisional and centralized in RULES. Thirty focused checks pass. Alternate
landing geometries, return catches and post-result effects still need coverage.

## Native result lettering and continuing world (2026-10-03)

The natural bomb-right-expiry capture already has LOSE! in the left field and
WIN! in the right while the bomb remains active; it bursts after those result
letters appear. Freezing the whole model at finish contradicted that sequence.
The game now advances both worlds without player/CPU decisions in its result
phase, preserving bomb timers, rebound motion, water movement and particles.
The race elapsed time and result submission remain fixed; a targeted regression
proves that submission occurs once and the bomb expires after the result.

eggo-build-result-art.py extracts the native nine 16px glyphs (LOSE!WIN!),
palette 12 objects 2..10 at frame 248, with original graphics hashes. The
renderer places the proper title in each field and removes the prototype
central opaque box. Current letter positions use that observed frame;
native title bobbing/animation and exact post-result character behavior remain
unverified. Thirty-one focused checks pass. The Electron --result-only capture
at tests/OUTPUT/eggo-mania-visual_2026-10-03T14-50-17-743Z verifies both titles
and a visible native burst under them, without changing the thumbnail or
submitting an artificial score. Original scoring, progression, enemy behavior
and audio remain incomplete, so full Survival parity is not yet established.

## Deterministic native audio capture (2026-10-03)

The reference host now supports --audio, streaming stereo signed 16-bit PCM to
WAV rather than retaining the entire recording in memory. Rate and frame timing
come from the loaded core's AV info: 32768 Hz and 59.7275009155 frames/s.
Metadata records PCM/WAV hashes, sample count, state/ROM/core hashes and inputs.
New audio traces also record exact emitted sample-frame offsets and inventory
IDs for each emulated frame. The playable physics still uses its documented
60-Hz normalized calibration; exact native wall-clock timing is a separate
remaining parity consideration.

Input-only audio-neutral (16-54-05_065921), audio-jump (16-54-05_063004),
audio-jump-later (16-56-17_622960) and audio-jump-earlier (17-00-13_381159)
all begin from the same hard-origin state. Each records 43520 stereo samples
over 80 native frames. Jump profiles wait 20, 32 and 12 frames respectively,
then hold UP for eight. All produce a real jump in the world-position trace.
The early and middle profiles differ from neutral (peak delta 6144); the later
profile is audio-identical to neutral despite jumping. Therefore an unconditional
"jump sound" interpretation is not established. No derived sound is installed
in the playable game based on these contradictory profiles.

eggo-measure-audio-differences.py checks identical starting state/core/ROM and
zero RAM writes, then preserves full difference WAVs, JSON and CSV measurements
in timestamped OUTPUT. Their classification is deliberately unclassified
jump-input difference. Further work must distinguish sound-driver playback
conditions from simultaneous gameplay events; background music and original
effects remain incomplete.

## Native music-only option and alternate starting arenas (2026-10-03)

Ordinary controller navigation reaches Options from the main menu. RIGHT on
the sound row cycles SOUND ON -> SILENCE -> NO SFX, demonstrated by snapshots
native-options (17-42-20_604827), native-sound-choice (17-42-43_457731) and
native-sound-choice2 (17-42-58_897743). NO SFX provides a native music-only
capture path, avoiding attribution by subtraction of full mixes. No RAM writes
are required. The previous early/middle jump differences remain unclassified;
a small whole-signal sample shift alone does not explain them.

The first music-only entry chose Funky and Hard through the native character
and difficulty screens. Its capture named factory-music-only at
17-46-16_900821 actually shows the castle arena at frame 1800 and reaches the
GAME OVER tally screen by frame 5400. The filename's guessed arena is wrong;
do not use it as factory music. A second ordinary menu entry selects Yolko and
Hard, both visibly confirmed, then begins Survival with NO SFX. Its capture
named yolko-factory-music at 17-49-23_772224 actually shows the park arena at
frame 1400, despite the same avatar/difficulty as the earlier factory reference.
Thus always starting factory is not established as native Survival behavior.
The selection seed, distribution and subsequent opponent order still need
decoding before changing the game's current stage schedule.

eggo-measure-music-captures.py preserves actual arena labels, native option
evidence, source inputs/state hashes, arena framebuffer hashes and RMS CSV.
The castle recording is 90.40625 seconds with sound ending near 50.575 seconds;
the park recording is 70.3125 seconds. Both recordings have clean native
music-only settings, but exact musical loop boundaries remain unverified.
No blindly cut loop or mislabelled factory track is installed in the game.

## Isolated original jump sound (2026-10-03)

One further RIGHT on the ordinary Options sound row selects NO MUSIC, with
EWRAM word 0x3f4 = 2. The four observed values are ON=3, SILENCE=0,
NO SFX=1 and NO MUSIC=2. Changing that setting after a song has started
does not stop it; the option must be present when entering gameplay.

yolko-sfx-origin (18-00-10_876237) starts from the known Yolko/Hard menu
state with only that verified audio-option write. It contains no gameplay
parameter edits. Subsequent first-jump (18-03-02_137738) and clean-neutral
(18-00-47_904566) captures have identical initial states and no new writes.
The control is completely silent until sample 16005. Jump input at frame 1
produces a separate cue over samples 1198..14258, followed by silence before
the CPU sounds. eggo-build-jump-sound.py retains the original stereo PCM,
initial latency and 256 trailing silent samples without normalization.
assets/jump.json includes the ancestor option write, input-only option-screen
evidence, reference hashes and measured intervals.

The playable game now plays that cue on actual voluntary player/CPU jumps,
excluding rejected airborne/stunned inputs. Thirty-two focused checks pass.
The original driver sometimes suppresses a later jump while CPU sounds are
active; its shared-channel priorities and boosted-jump timbre remain pending.
This cue therefore establishes the sound itself, not complete audio scheduling
parity. First-place input produces no additional isolated early sound, so it
is not used to manufacture a placement asset. Music and other effects remain
incomplete.

## Initial random arena and subsequent cycle (2026-10-03)

Two ordinary-input captures start from the identical survival-hard.state:
arena-draw0 (18-19-32_176882) confirms immediately, while arena-draw60
(18-19-32_212884) waits 60 frames before confirmation. They select factory
and space respectively. Independent settled captures at 18-15-26 visually
confirm those backgrounds and rivals. No RAM writes are involved.

EWRAM 0x3294 is the arena ID: beanstalk=0, factory=1, dragon=2, castle=3,
pirate=4, space=5, jungle=6 and park=7. Those values match all eight existing
stage captures and the new ones. Thumb instructions at ROM 0x080016b4..16d4
call the original random generator and store its first result modulo eight.
At 0x08009338..9376, a 16-bit seed s is stepped by p=75*s, h=p>>16,
l=p&65535, then (p-h-[h<=l])&65535. The confirmation seed is 1137 or 1197;
first draws 19737 and 24237 select IDs 1 and 5. Three total selection draws
produce the independently observed final states 871 and 16089.

The subsequent progression at 0x08002bcc..2be0 increments the arena ID modulo
eight, consistent with the earlier complete-cycle diagnostic probes. Thus the
old cycle was correct but always starting factory was not. The playable game
now uses the native first-draw rule with the low 16 bits of its configured seed,
then cycles from that arena. Backgrounds, rival portraits and opening descent
use the same selected arena. eggo-measure-arena-selection.py preserves the
input traces, ROM hashes, relevant instructions and a fixture. Thirty-four
focused checks pass. This does not calibrate pickup weights, original AI
streams or later-cycle difficulty/starting towers.

## Survival result counts wins, not Solo points (2026-10-03)

The native final screen at scripts/OUTPUT/eggo-reference_2026-10-03_17-46-16_900821/
factory-music-only.png shows GAME OVER and WINS 00 after the lost first round.
The filename is mislabelled; this capture's arena is castle, as noted above.
The GBA [review](https://www.freezenet.ca/review-egg-mania-game-boy-advance/)
independently describes Survival as the longest win streak and Solo as the
point/combo mode. The playable Survival HUD and submitted score now count
consecutive wins; losing preserves the completed streak for ranking, while
restarting clears it. Prototype per-cell/completion points no longer determine
Survival rankings. Solo point/combo calibration remains outside this correction.

## CPU carrying jump control correction (2026-10-03)

The existing deterministic native-model CPU check (seed 123, goal 16, no items,
extra water rise 0.015) previously exhausted 300 simulated seconds without
rescue. Inspection found the actor at x=5 trying to reach x=2.5 across a stair.
The held-piece controller issued a one-frame jump but never held float while
travelling, unlike the player input path. Its reduced jump height repeatedly
failed the stair crossing. The carrying controller now holds float while moving,
starting a jump or seeking clearance for a placement. The same deterministic
case reaches the rescue balloon, and the existing check now requires that
outcome rather than merely observing some tower growth. This fixes a playable
controller fault; it does not prove the original Hard AI policy or speed.
The native arena render check at tests/OUTPUT/eggo-mania-visual_2026-10-03T16-26-10-701Z
also confirms factory/space openings from the two measured seeds, with successful
stereo jump decoding/playback in Electron.

## Native lightning-cloud checkpoint (2026-10-03)

The earlier input-only bomb-hunt capture (13-30-15_730918) also contains a CPU
cloud catch at frame 1035: native carried ID 12. The exact recorded controller
inputs, replayed as cloud-native (18-32-01_021801), reproduce that catch and
ID retention through 1036. The inventory is consumed on 1037 and a cloud
appears above the left field. The standalone stay continuation from frame 1036
(18-33-28_689905), followed by another 240 neutral frames (18-34-06_756390),
provides ordinary-input snapshots throughout the effect, without RAM edits.

For this checkpoint, EWRAM 0x10370 marks the cloud active, 0x10378 is its
countdown, and 0x1037c/0x10380 hold fixed-point world coordinates [48,664].
The first displayed counter, from cloud-start frame 1 (18-44-25_623063), is
286. It decreases once per frame: 283 at global frame 1040, 263 at 1060,
223 at 1100, 167 at 1156, then 147,127,87,47,7 and finally zero. The cloud's
world position remains exactly fixed while its screen position shifts with the
camera. The small and large grey clouds are 64x64 sprite canvases in palette 3.
eggo-build-cloud-art.py preserves their source tiles, RAM/ROM/core hashes and
counter samples in assets/cloud-phases.png/json and timestamped OUTPUT.

The bright electric globe is a separate environmental hazard. The paired
control cloud-removed-control (19-02-43_365219) removes only the CPU inventory
before it can use the cloud. Cloud counter stays zero, but the same electric
bubble state 6 starts at continuation frame 113 with identical coordinates.
The earlier speculation that the actor coordinate slot changes during damage
was incorrect: player root 0x0200333c plus 0x898/0x89c remains its position.

## Cloud collision and timing correction (2026-10-03)

Thumb routines 0x080041b4, 0x0801add0, 0x080049ec and 0x0800f634 establish
creation, countdown, hit geometry and player state. Creation follows the
attacker's column, using the target column height plus 3.5 tiles; it does not
follow the target actor. The inner field edge clamps the cloud center to at
least column 1 on the right field and at most column 6 on the left field.
There is one replaceable cloud per field. Counter starts 287 and the first
observed frame shows 286. Strike pulses are 201..192, 137..128 and 73..64.
The strict hit box is 20 pixels either side of the cloud center horizontally
and 2 tiles below it vertically. The native routine compares integer pixels;
the model uses continuous tile coordinates, so subpixel boundary cases still
need calibration. Hits preserve momentum, request state 7 and then suppress
control until water recovery. They do not apply the former invented velocity
kick or an unconditional delayed hit.

The input-only cloud-jump-hit and diagnostic cloud-jump-control captures
(19-06-59_360101 and 19-06-59_380095) use the same checkpoint and controller
sequence: 70 neutral frames, 28 Up frames, 22 neutral. The control removes
only CPU cloud inventory. Their trajectories agree through frame 87. The
cloud counter 201 first requests state 7 on frame 86; frame 87 retains the
previous float acceleration and frame 88 applies normal gravity. All recorded
heights through frame 120 agree with the native model within 0.01 pixels.
Input latency means the accepted jump is frame 72 and release takes effect
on frame 100. eggo-measure-cloud.py preserves both traces, snapshot state
checks, hashes, parameters and CSV in timestamped OUTPUT and a fixture.

The normal and strike source tiles are preserved as a 128x64 atlas. Their
scale grows from 0.5 to 1 and shrinks to 0.5 near expiry. Native OAM uses the
previous physics counter, including the texture change after the first hit.
Electron scenes cloud-small, cloud-miss and cloud-hit are saved under
tests/OUTPUT/eggo-mania-visual_2026-10-03T17-24-49-522Z.
Cloud-specific sounds, damage poses and original enemy/AI policies remain incomplete; these
checks do not establish full Survival feature parity.

Two additional input-only continuations from the no-cloud control's frame-113
snapshot compare 20 frames holding A with 20 neutral frames: bubble-escape-a
(19-27-18_854403) and bubble-stay-control (19-27-45_025091). Both remain state 6
at frames 1, 2, 4, 8 and 20, with identical actor trajectories throughout.
Later lifetime measurements below establish that the press shortened the timer;
it did not release the actor immediately.

## Hammer and factory electric bubble (2026-10-03)

The hammer is inventory 11 and uses projectile initializer 0x0800426c in mode
1; bomb inventory 8 uses mode 0. Update 0x08004458..0x08004890 gives the same
vertical lift, 2px/frame horizontal arc and 0.125px/frame² gravity. Actor and
projectile coordinate anchors differ by 32 pixels vertically. The launcher
previously introduced an erroneous half-tile horizontal shift as well.
The naturally caught hammer replay has no RAM writes. All 65 pre-contact
frames now agree, and frame 66 requests actor state 7 without deleting rows.

Board contact invokes 0x08005bdc. It retains the highest incomplete floor and
queues lower incomplete floors, leaving complete floors untouched. A paired
control removes only CPU inventory to prevent it sealing the gap; the first
two five-cell floors disappear at frames 172 and 286 after contact at 75.
The solid-tower control has no cell loss. eggo-measure-hammer.py preserves
these captures and extracts the native spinning hammer. Its precise rotation
phase when leaving/reentering the viewport remains uncalibrated.

The factory electric globe is enemy type 5, with entity roots 0x02031038 and
0x020310b8. Initial delay is 1480 frames (confirmed in the follow-up below), active lifetime 360, respawn delay
1400 minus 50 times difficulty (1150 in Hard). Spawn 0x08011e48..0x08011e78
places it 24 pixels below the waterline with upward velocity 1px/frame.
Motion 0x0801217c..0x08012296 applies quarter-pixel velocity changes computed
from the frame number and actor/bubble coordinates; velocities clamp to
1px/frame horizontally and 1.5 vertically. Bounds reflect velocity. There
is no independent random draw for this motion.

Collision 0x08013468 and capture 0x080136b8 use a strict 16-pixel square
around the actor anchor. Captured state 6 clears inventory/placement and
attaches the actor to the globe. Input 0x0800f768..0x0800f77a sets a ten-frame
escape counter on an A/B press. Each counter frame subtracts two extra life
frames. Holding the key produces one such event. At life 16 the actor is
released without a teleport, as established by 0x08012e58..0x08012ec2.

eggo-measure-bubble.py preserves the full 430-frame native profile and a
310-frame escape continuation, all motion samples, hashes, original inputs,
and four native 64x64 sprite phases. The native profile prevents CPU cloud
use with one inventory write; the escape continuation has no new writes.
The complete motion/lifetime matches exactly. Capture occurs at frame 113,
release at 405; one A press moves release 20 frames earlier. Electron's
bubble-caught/bubble-escape scenes verify original art and the actual keyboard
binding. Global frame phase includes native menu timing; the local game uses
a reproducible seed phase instead. Custom field bounds scale from the native
7x37 field. Other arenas still have provisional environmental hazards and
AI/roster/audio progression remains incomplete: this is not full feature parity.

## Beanstalk enemy and initial Hard timing (2026-10-03)

ROM table 0x080d7444 maps primary enemy types by native arena ID to
14,5,6,0,9,7,4,16; secondary types are 8,2,12,13,11,15,10,1.
Four entity slots at 0x02031038 with stride 0x80 represent primary left/right
and secondary left/right. The reference runner now traces all four. This
reveals why a universal flying-thief approximation cannot establish parity.

Type 14 is the beanstalk creature. Spawn 0x08011ea4..0x08011f32 alternates
short and long jumps. The short jump uses the actor's X plus 4px, clamped
to -8..82px, then shifted -16px for its sprite anchor; the long jump retains
the short jump's X. It starts 24px below the waterline
with velocity -190054/65536 or -419430/65536 pixels/frame. Motion
0x080123e4..0x080123f8 adds exactly 6553/65536 px/frame². Descent ends
10px below the waterline; the short rest is 90 frames, and the long rest is
1300 minus 50 times difficulty. The eight animation phases advance every
five active frames and retain their phase/clock across inactive periods.
The termination frame does not advance animation.

The collision center is sprite X+16, Y+40 with a strict integer-pixel radius
16. Capture requests state 6, clears inventory/placement, and attaches the
actor there. The native inventory-clear routine clamps the actor to the
waterline. Once the falling creature moves beyond the collision radius it
releases the actor into the water. A/B escape is specific to the bubble;
it does not shorten this jump.

The input-only beanstalk-enemy profile (23-08-14_881993) provides both arcs,
capture and release over 1300 frames at eighth-stage difficulty 9. All
positions, velocities, active timers and animation phases match exactly;
capture begins at 899 and releases at 1003. The short rest is 90 frames and
long rest 850. A fresh Survival/Hard profile selects beanstalk by waiting
five menu frames before A (23-21-05_458588); its continuation
23-23-12_706129 verifies the long arc and 1050-frame rest at difficulty 5.
The original first-stage and later-stage difficulty progression is not yet
fully implemented; the local game currently retains the Hard value 5.

Fresh beanstalk and factory captures initialize the primary timer to 1480,
correcting the earlier 1500 estimate from an already-running checkpoint.
There are 14 paused updates in the factory fade and 13 in beanstalk; the local countdown
accounts for these when advancing the hazard timer. Exact menu/frame phase
remains subject to the seed-phase limitation described above.

eggo-measure-jumper.py preserves both reference profiles, source hashes,
parameters and CSV, and extracts all eight 64x64 native creature frames.
Electron --jumper-only captures are in
tests/OUTPUT/eggo-mania-visual_2026-10-03T21-19-43-178Z. Captured actor-specific
poses, secondary enemies, other arena hazards and complete native water
progression remain incomplete, so these measurements do not prove full parity.

## Jungle primary hazard (2026-10-03)

The naturally selected first Survival/Hard jungle profile waits seven menu
frames before A (23-27-46_067694). Primary type 4 uses the same short/long
vertical arcs as type 14, with different sprite and capture anchors. A short
jump cannot capture. Its X is actor X+4, clamped to -8..82px, with no -16px
sprite shift. The long jump keeps that X even if the player walks away.
Its collision center is X+2, Y+0, radius 16 in integer pixels. Capture clears
inventory/placement and attaches the actor to that center, clamped to the
waterline. The first capture resets a 20-frame bite counter; subsequent
captured frames decrement it, resetting and alternating the bite flag at
zero. These are ROM branches 0x080133aa..0x08013680, rather than a guessed
knockback or inventory-theft action.

The short arc begins at native continuation frame 1531 and ends at 1583;
the long arc starts at 1673, captures at 1681, and finishes at 1798 with a
1050-frame rest. All recorded position, velocity, timer, capture/release and
animation samples match. The 23-32-11_463662 input-only control walks left
between arcs: the long jump keeps its X and misses the player throughout.
This independently verifies the correction to the shared beanstalk routine,
whose earlier constant-X captures could not distinguish retargeting.

eggo-measure-jungle-enemy.py preserves both profiles, parameters, hashes and
CSV, and extracts eight original 32x64 palette-5 sprite phases. Electron
--jungle-only verifies the actual stage/enemy selection and rendering;
captures are in tests/OUTPUT/eggo-mania-visual_2026-10-03T21-33-32-406Z.
Native bite sounds and captured actor-specific poses remain incomplete.
The secondary hazard and subsequent-round difficulty are still open.


## Primary space hazard (native type 7)

The input-only first Hard space run is
scripts/OUTPUT/eggo-reference_2026-10-03_23-36-49_077052/space-hard-enemy.
Its continuation from frame 1500 is
scripts/OUTPUT/eggo-reference_2026-10-03_23-44-24_642735/space-primary-art.
The earlier shared homing branch is for types 2/13, not type 7: the actual
space primary is stationary. ROM 0x08011d26..0x08011d64 alternates X=48/0,
sets Y=waterline-80 and a 182-frame visit. There are thirteen animation phases,
each seven frames, giving two complete cycles. ROM 0x08012dcc..0x08012df2
then ends the visit and waits 1400-50*primaryDifficulty (1150 in first Hard).

Collision occurs using the phase before the animation tick, only phases 4..7.
ROM 0x08013468..0x080135ae uses a strict integer-pixel radius 26 around
X+16, Y+16 minus the phase offset table at EWRAM 0x170. A hit sets the
field's 25-frame visual counter and clears held inventory/placement, with no
knockback or capture. The input-only trace loses inventory at continuation
frame 63, one tick after entering phase 5. The native secondary projectile
subsequently affects the actor; those trajectories are evidence, not claimed
as a completed secondary reconstruction.

eggo-measure-space-enemy.py preserves all 240 motion/timer/contact samples,
parameters, hashes and CSV and extracts all thirteen original 64x64 phases.
The native main hazard remains exactly stationary throughout the visit.
The full-visit comparison and Electron --space-only screenshot pass; the
latter is tests/OUTPUT/eggo-mania-visual_2026-10-03T21-45-27-088Z.
Secondary hazards, original sounds and later-round difficulty remain open.


## Space secondary missile (native type 15)

The input-only capture is
scripts/OUTPUT/eggo-reference_2026-10-03_23-50-29_101264/space-secondary-cycle,
continued from first Hard space frame 1700. ROM 0x08012044..0x08012076
spawns at X=-63+174*fieldIndex, Y=the actor anchor, angle 2048/0,
speed 0x1333 in 16.16 units and a 150-frame charging counter. Initially
624 ticks are counted, then eligibility holds at one while the actor is
below fieldBaselineY-120 or another enemy occupies the field's shared busy flag.

The missile accelerates by 0xf5c fixed units after its charging counter
reaches zero, until speed is at least 4px/frame. It begins turning after
crossing X=-16 in the left field, or X=80 in the right field. The piecewise
angle rates and thresholds are transcribed from 0x0801259e..0x080127d0,
including the native wrap literal 0x0ff49f3a (16 units different from a
formula using the nominal turn rate). Velocity uses the original signed
16.16 multiply and the sine table at ROM 0x080d8550; no floating-point
trigonometric approximation is used in gameplay motion. An upward missile
ends when it rises more than 160px above the actor; first Hard rest is
1300-50*secondaryDifficulty = 850 frames.

The left input-only profile matches all 650 samples, including eligibility,
spawn, slow approach, acceleration, turn and exit. The right flight matches
from its recorded spawn through the remaining 567 samples. That spawn occurs
during water recovery, where the actor anchor read by the enemy differs from
the final frame's actor anchor; the exact water recovery spawn boundary is
still open and is explicitly excluded from this comparison. Its recorded
spawn is not presented as proof of the currently implemented water boundary.

Collision center is X-8*VX+16, Y-8*VY+8, with strict integer-pixel radius 16.
ROM 0x080134a0..0x080135e8 requests the same state-7 damage used by lightning
and hammer hits, preserving momentum. The contact diagnostic is
scripts/OUTPUT/eggo-reference_2026-10-03_23-58-41_265411/space-secondary-contact-probe.
It changes only actor X/Y/vertical velocity at an existing flight checkpoint;
its writes are explicitly preserved, and it is not an input-only replay.
Contact and nineteen following damage-position ticks match the original;
there is no injected downward velocity kick.

eggo-measure-space-secondary.py preserves parameters, hashes, two flight CSVs,
the original sine table and three 64x64 palette-9 missile frames. Rendering
uses the previous OAM tick's pose, rotation and right-field reflection.
Electron --space-only captures are in
tests/OUTPUT/eggo-mania-visual_2026-10-03T21-58-42-768Z. Full secondary music/SFX,
water recovery spawn timing and later-cycle difficulty remain incomplete.


## Dragon arena primary fireball (native type 6)

The naturally selected first Hard dragon capture is
scripts/OUTPUT/eggo-reference_2026-10-04_00-02-41_224044/dragon-primary-hard;
its input-only continuation from frame 1500 is
scripts/OUTPUT/eggo-reference_2026-10-04_00-04-40_074729/dragon-primary-cycle.
ROM 0x08011f40..0x08012026 spawns the alternating variants at
X=80-99*variant-(leftField?8:0), plus a 16px offset determined by the native
frame's low two bits. It starts at waterline+10, angle 0x3f49f46 plus
0x16c16c*variant, speed 4px/frame. Eligibility is the lower part of the
field (actorY >= fieldBaselineY-120), the reverse of the space secondary's gate.

Motion shares the piecewise native angle routine and signed 16.16 sine
lookup, without the space missile's angle reflection. Horizontal velocity
is arithmetically halved, including the negative-odd fixed-point rounding.
After velocity/integration, speed decreases by 0xf5c while rising above the
stored speed-decrease height; after the angle passes a half-turn it increases
by the same amount. It ends when descending below waterline+10. ROM
0x08013018..0x08013026 uses rest 1500-50*primaryDifficulty, or 1250 in first Hard.
The thirteen animation phases advance every five active ticks; after phase
12 they repeat only phases 11/12. The termination tick skips the animation.

Both left and right 240-frame profiles match all recorded positions,
velocities, angles, speeds, variants, timers and animation clocks. The left
fireball first requests state-7 damage at continuation frame 117: the strict
integer-pixel contact boundary around entity X/Y has radius 16. The previous
frame is exactly outside that boundary. Contact preserves momentum, using
the same existing damage state as a hammer/missile hit.

eggo-measure-dragon.py preserves the profiles, parameters, hashes and two CSVs,
and extracts thirteen original 32x32 palette-5 fireball phases. Electron
--dragon-only confirms the first dragon stage, asset and anchor; captures are
in tests/OUTPUT/eggo-mania-visual_2026-10-03T22-08-19-650Z. The secondary dragon
hazard, original sounds and later-round difficulty still remain incomplete.


## Field-baseline correction and dragon secondary rock (native type 12)

The historical trace key `camera_y` is mislabeled: actorRoot+0x87c and
actorCoordinates-0x1c are the same address (left 0x02003bb8, right
0x02004f34). This is the field baseline/waterline used by enemy eligibility,
not the viewport scroll. The runner now also records `spawn_reference_y`.
The live game no longer passes its rendering camera into the height test.
A regression at a five-cell-high supported platform verifies that the
space secondary can appear even when the viewport follows that platform;
at base height it remains blocked. The native cutoff is 120px above the
field baseline. Primary dragon uses the opposite side of this cutoff.

The input-only left rock flight is
scripts/OUTPUT/eggo-reference_2026-10-04_00-10-23_749797/dragon-secondary-cycle;
the right flight is in the first Hard dragon-primary-hard trace above.
ROM 0x08011e14..0x08011e3e alternates X=-8/96, starts at actorY-160,
VX=+/-0.25px/frame and VY=0x13333/65536px/frame. X direction reverses
when outside 0..80 and moving farther outward, before integrating position.
Y speed is constant; the otherwise unused speed field still increases by
0xf5c per active tick. The rock ends below waterline+10 with rest
1500-50*secondaryDifficulty, or 1050 ticks in first Hard.

Both measured flights, from their recorded spawn, reproduce all remaining
position, velocity, speed, animation-clock and cooldown samples. Spawning
occurs during water recovery (left) and throwing (right); the exact internal
actor anchor in those states remains excluded from the spawn comparison.
The strict 16px collision boundary around entity X/Y first damages the
left actor at continuation frame 206, with no injected velocity kick;
frame 205 is still outside. The main and secondary hazards now share the
same occupancy exclusion in the native game model.

Eight original 32x32 palette-9 rock phases come from the input-only visible
continuation in
scripts/OUTPUT/eggo-reference_2026-10-04_00-15-35_182918/dragon-secondary-visible-art.
eggo-measure-dragon-secondary.py preserves both profiles, parameters, hashes,
two CSVs and OBJ provenance. Electron --dragon-only screenshots are in
tests/OUTPUT/eggo-mania-visual_2026-10-03T22-16-30-689Z. Original audio and
water/throw internal spawn anchors remain incomplete.


## Castle shark (native primary type 0)

The first Hard castle uses a shark, not a generic flying hazard. Input-only
reference: scripts/OUTPUT/eggo-reference_2026-10-04_00-18-31_242646/castle-primary-hard;
continuation: scripts/OUTPUT/eggo-reference_2026-10-04_00-23-52_864288/castle-primary-cycle.
Both complete arcs match native positions, velocities, angle, speed,
animation and cooldown. The shark uses the same native angular lookup as
the dragon but full horizontal velocity and no frame-dependent spawn offset.
Spawn X is 80-99*variant minus eight on the left field, Y is waterline+10.
It ends below waterline+10 and rests 1300-50*primaryDifficulty ticks (1050
in first Hard). Five animation phases advance every five active ticks.
At inactive counter 120 it waits while the actor is more than 120px above
the waterline; this differs from the dragon's eligibility check at spawn.

Collision comes from ROM 0x080134be and helper 0x080049ec. Its strict
integer-pixel square is centred at entity + 8*velocity + (8,16), with
radius 16. A successful grip clears inventory and attaches the actor at
that point; 0x08011ac4 clamps raw X to -12..88 and Y to 20..waterline.
Bite timer starts at 20 and repeats every twenty contacting ticks.
Collision must be rechecked while carrying: it releases when the square
no longer overlaps, even before the shark exits. Input-only RIGHT10 then
neutral control from frame 1600 reproduces capture at frame 8, every
attachment coordinate and bite timer, and release at frame 30. Waterline
clamping uses the previous completed frame, since native enemy updates
precede water updates. The game wrapper consumes its current pre-update
waterline, consistent with that ordering.

scripts/eggo-measure-castle.py stores hashes, reproducible input parameters,
both profiles and CSVs, grip/release measurements and five 64x64 native
palette-5 OBJ phases. Electron --castle-only screenshots were inspected in
tests/OUTPUT/eggo-mania-visual_2026-10-03T22-26-01-185Z. Special actor capture
poses, original shark audio and castle secondary type 13 remain incomplete.


## Castle secondary thief (native type 13)

ROM 0x08012132..0x08012172 starts the thief at X=-64 (left) or 112 (right),
Y=actorY-125, with zero velocity and chase timer 100+25*secondaryDifficulty
(325 in first Hard). During pursuit it accelerates toward the actor's X
and actorY-24 using four distance regions: below -16, -16..16, 16..48,
and above 48. Acceleration is 0x1999 in 16.16 units; continuing in the same
direction uses arithmetic half (0xccc), changing direction uses full size.
Velocity caps at +/-2px/frame. The body advances before outward velocity
is stopped at right-side X<-8 / left-side X>72 and Y>waterline-40.
There is no arbitrary velocity impulse: ROM 0x08012934..0x08012964 adds a
small random perturbation before steering (X when RNG&7==7; Y according
to RNG&56). Main and secondary global native RNG streams reside at
0x02011ab0 / 0x02011ab4. The runner now records both. Comparing the whole
right flight identifies its draw as one native step from the previous
frame's secondary stream, before other consumers advance it again.

When the chase counter expires, horizontal acceleration becomes 0.125
outward, retaining vertical velocity. Departure ends before integration
when beyond X<-64 / X>118, with cooldown 1300-25*secondaryDifficulty
(1075 in first Hard). Four OBJ phases advance every nine active ticks.
All 399 following samples of the input-only right flight reproduce exact
position, velocity, phase, clock and counters; source:
scripts/OUTPUT/eggo-reference_2026-10-04_00-30-00_135681/castle-secondary-hard.
The native RNG words are global storage but are selected per field; the
captured selector mapping is documented below. Enemy motion and pickups on a
field consume that field's stream. The playable reconstruction currently
starts each per-Tower stream from its session seed, so this fixture proves the
motion equations, not identical full-match RNG consumption. CPU-specific RNG
consumers remain unmapped.

Strict integer-pixel theft square is centred at body+(16,77), radius 11.
The thief only takes held inventory, excluding throwing/protected states.
After theft, pursuit continues for fifty frames and then departs; it
retains the stolen icon at body top-left+(24,63). The renderer uses the
existing native icon atlas with its centre at +(32,71). Diagnostic probe
scripts/OUTPUT/eggo-reference_2026-10-04_00-50-29_366258/castle-secondary-theft-probe
places the right actor at that hit point with normal held inventory 5;
all five RAM writes are preserved in its parameters, explicitly distinct
from the unmodified input-only flight. It confirms inventory removal at
frame 1 and the fifty-frame counter, and all subsequent motion samples
match. An earlier diagnostic with inventory 8 triggers bomb damage and
is intentionally excluded as evidence for theft.

scripts/eggo-measure-castle-secondary.py stores the two sources, hashes,
inputs, diagnostic writes, fixture and flight CSV. Four original palette-9
64x64 OBJ phases are extracted. Electron --castle-only images inspected in
tests/OUTPUT/eggo-mania-visual_2026-10-03T22-52-30-079Z include pursuit and the
stolen icon. Left flight, internal throwing spawn anchor, full per-field RNG
scheduling and original thief audio still need verification/reconstruction.


## Pirate skeletal fish and ghost thief (native types 9 / 11)

Input-only first Hard pirate reference:
scripts/OUTPUT/eggo-reference_2026-10-04_00-53-56_238152/pirate-primary-hard
(menu neutral1, A8, neutral1900). Both primary fish spawn at frame 1525
and end at 1634. Type 9 shares type 0's native full horizontal arc, warning
height gate, contact-leading anchor, twenty-frame bite and 1050-frame
cooldown. Its five OBJ phases advance every TWO ticks instead of the
shark's five. Both complete 240-frame continuation profiles match every
position, velocity, angle, speed, phase, clock and counter. RIGHT8 from
frame 1580 captures the actor at continuation frame 22, releases at 44,
and matches every attached coordinate and bite counter. That source is
scripts/OUTPUT/eggo-reference_2026-10-04_00-54-55_984000/pirate-primary-capture.
Five original 64x64 palette-5 images come from the input-only primary-art
continuation under eggo-reference_2026-10-04_00-56-01_700214.
The existing shared native fish model is used for both stages, with
per-stage animation timing and art, rather than duplicated movement rules.

ROM 0x08011dd8..0x08011e0c starts secondary type 11 at X=-31+142*side,
Y=actorY-36, VX=1-2*side, VY=0. The right field spawns at frame 718.
Subsequent ticks set VY=2*nativeSine((nativeFrame&127)*0x222222), retaining
the exact native table and integer-angle indexing. X reverses at >=80
on the left, <=0 on the right. The body exits before integration when
X<-36 / X>113, but this enemy still integrates X/Y and unused speed on
its final tick. End rest is 1300-25*secondaryDifficulty (1075 first Hard).
Eight palette-9 32x32 phases advance every five active ticks; end skips
animation. Unused speed decreases by 0xf5c when below speedDecreaseHeight.

The ghost steals inventory in a strict integer-pixel square centred at
entity+(0,42), radius 15, ignoring throwing/protected actor states.
Native input-only theft occurs at frame 755. It stores the inventory and
sets life=50; unlike type 13, this counter does NOT decrease or change
the periodic motion. The ghost keeps its icon until exiting. Stored icon
top-left is body top-left+(8,28), centre +(16,36). The complete following
226-frame profile matches native X/Y, both velocities, unused speed,
life including the theft event, all animation clocks and departure.
Spawn anchor during throwing, the left-side flight and original sounds
are still excluded from full fidelity claims.

scripts/eggo-measure-pirate.py and eggo-measure-pirate-secondary.py preserve
parameters, hashes, input-only traces, CSVs, two fixtures and all original
OBJ phases. Electron --pirate-only images were inspected in
tests/OUTPUT/eggo-mania-visual_2026-10-03T23-00-50-710Z, showing the fish and
ghost carrying a stolen native icon. The two verified pirate hazards
replace the temporary generic bird behavior for this stage.


## Factory robot thief (native type 2) and RNG address correction

The factory's secondary enemy shares type 13's pursuit and departure
branches, but uses 0x2000 acceleration rather than 0x1999, follows actorY
without the 24px bias, and has a strict theft radius 8 around body+(17,62).
The retained stolen icon is body top-left+(25,48), centre +(33,56).
The fifty-frame post-theft pursuit timer is the same as type 13. Native
input-only first Hard reference:
scripts/OUTPUT/eggo-reference_2026-10-04_01-02-18_089841/factory-secondary-hard.
The right robot spawns at 696, departs at 1095 and rests 1075 ticks.
The complete left continuation, 357 frames to exit, is under
scripts/OUTPUT/eggo-reference_2026-10-04_01-12-27_634183/factory-secondary-left.
It matches X/Y, velocities, counter, graphics pose and departure. Right
normal-state equations match too; throwing states are explicitly excluded
because their internal actor anchor precedes the final captured anchor.
That unresolved scheduling difference also affects exact throw-state
spawning, and is not disguised by modifying the motion equations.

ROM 0x08009380 adds 0x1a0 to 0x02011910: main gameplay RNG is therefore
0x02011ab0, not the legacy arena-selection trace at 0x02011aac. Secondary
RNG is at 0x02011ab4. The runner retains legacy rng for arena selection and
adds rng_game for the real main gameplay stream. This correction makes
the entire left robot's random perturbations match. Pickup and enemy draws
now map to per-field streams, but CPU-specific consumers and scheduling
across all Survival updates still need verification.

ROM 0x08010e40..0x08011002 reveals that graphics are separate from the AI.
The robot retains a forward-rotation flag at +0x7c. In the forward branch,
pose is floor(2*VX), clamped -4..4 and wrapped to 0..15; at pose 4 it flips
the flag. In the other branch, pose is floor(8-2*VX), clamped 4..12; at
pose 12 the flag flips back. This hysteresis explains the complete turn
and prevents an incorrect pose change every time velocity changes sign.
Wings retain clock +0x74 and phase +0x78. Clock decreases by 4.25-2*VY;
when <=0 it resets to 8 and advances phase modulo eight. The image of each
wing is a separate 32x16 OBJ placed 16px above the 64x64 body. Eight real
RAM graphics checkpoints verify both wing clocks/phases and the turn flag.
Rendering uses previous body/wing phases to follow the native OAM timing.

Six body poses and all eight wing phases come from input-only captures;
remaining visible poses 5..11 come from the complete left continuation.
Poses 13..15 are normally outside the viewport on the captured incoming
right flight, so three explicitly logged graphics probes reposition the
entity and set VX inside the viewport. They change three RAM fields and
are used only for original OBJ extraction, not as input-only motion proof.
All sixteen body images are preserved, with per-image pixel hashes and
source paths. Wing images also retain the two underlying OBJ records.

The controlled theft probe under
scripts/OUTPUT/eggo-reference_2026-10-04_01-22-05_278132/factory-secondary-theft-probe
changes actor position/state/inventory (five logged writes). It confirms
inventory removal on frame 1, life 50, the whole countdown and all following
motion samples. The existing bubble now respects enemy occupancy and the
native low-height eligibility gate, preventing simultaneous primary and
secondary attacks. Original robot audio, per-field RNG ordering and internal
throw anchors remain open.

scripts/eggo-measure-factory-secondary.py preserves both motion sources,
probe parameters, graphics provenance, fixture and CSV. Electron
--factory-enemy-only was inspected in
tests/OUTPUT/eggo-mania-visual_2026-10-03T23-23-05-826Z for normal flight and
the carried stolen icon. Tests include the complete left flight, native
RAM wing/turn checkpoints, normal-state right equations and theft.


## Park secondary bird (native type 1)

Input-only first Hard reference is
scripts/OUTPUT/eggo-reference_2026-10-04_01-27-42_922078/park-hard.
Right spawn is frame 696, departure 797; left spawn 1785, departure 1844.
Both complete arcs reproduce positions, velocities, native angle, speed,
variant, animation clock and the 850-tick Hard rest. The left spawn has
an extra -8px field bias. The animation retains its previous clock and
phase across spawns rather than restarting its cycle.

ROM 0x0801207c..0x080120a4 establishes angle 0x0bfffff4, speed 0x40000,
Y=actorY-160 and a fixed turning threshold actorY-148. Each active tick
reflects the angle, applies the shared piecewise native turn rates, and
reflects back. Above the threshold it resets to the quarter-turn endpoint.
At the other endpoint the variant selects the native 0x0c0b60aa adjustment.
Velocity comes from the original fixed-point sine table. Speed changes by
0xf5c only below the turning threshold: it decreases when angle exceeds
half a turn and increases in the other half. Departure requires upward
velocity and Y<actorY-160; graphics do not advance on the departure tick.
The stored post-theft life 50 does not count down for this enemy.

Eight original 64x64 OBJ phases come from the input-only snapshots in
scripts/OUTPUT/eggo-reference_2026-10-04_01-29-35_328878/park-secondary-art.
The renderer uses previous position, angle and animation, with the native
reflected affine orientation. Electron --park-only was inspected beside
native frame 745 in tests/OUTPUT/eggo-mania-visual_2026-10-03T23-34-35-004Z.
The staging camera differs from the reference's live camera; this checks
sprite appearance and orientation rather than proving complete scrolling.

A separate five-write actor position/state/inventory diagnostic is under
scripts/OUTPUT/eggo-reference_2026-10-04_01-37-09_187661/park-secondary-theft-probe.
The native collision point is X + sign*6*VY + 24,
Y - sign*6*VX + 46, with sign=-1 for variant 1 and +1 otherwise.
The integer strict radius is 14. The original takes inventory 5 on probe
frame 6; the native implementation agrees through this contact and keeps
its existing flight. The factor six comes directly from 0xc0<<11 in the
fixed-point multiplication, not a fitted collision adjustment.

scripts/eggo-measure-park-secondary.py retains input parameters, hashes,
CSV, artwork provenance and both flight/theft fixtures. The park's former
generic bird is replaced by this native secondary enemy. Type 16 primary and its occupancy gate were subsequently reconstructed
below. Dropped-item ballistic motion remains provisional,
as do unified per-field RNG scheduling, internal throwing anchors and audio.


## Park spring duck (native primary type 16)

The same input-only park-hard reference contains complete visits on both
sides: left 1526..1785 and right 1588..1847. Both visits match all positions,
velocities, counters, variant, animation and unused speed, including the
spawn tick and departure. Native Hard rest is 1100-50*5=850 frames.
Spawn X is -64+176*side, Y=waterline-4, horizontal speed 1-2*side,
and initial life 40+(nativeFrame&63), decremented by graphics on that tick.
The original low-height gate and shared primary/secondary occupancy apply.

Phase zero assigns one-quarter of the frame's native sine value to VY.
Phase one assigns VY=-2; the other phases retain VY. The waterline applies
-0x2666/65536 below waterline-6 and +0x1eb8/65536 above waterline-4.
Phase zero also restores the waterline-4 anchor in the latter branch.
A duck arriving from the left reverses beyond X64, and one from the right
reverses below X-16. They then leave through X<-64 or X>112. The otherwise
unused speed decreases by 0xf5c on active ticks, except the departure tick.

Graphics wait for life zero, then advance every four ticks across 18 poses.
At the cycle wrap they return to pose zero, wait 75 ticks and release the
captured player. Head-height offsets come from native RAM 0x020001a4;
all 18 values are preserved in the measurement fixture and central RULES.
The collision radius is strict 22 integer pixels, only during nonzero
poses. The effective hit X is body+13 when moving right, body+3 when moving
left; hit Y is body-8-headOffset. The natural left-side capture at frame
1607 follows these exact head positions through release at 1642. It clears
held inventory, flashes the native 25-frame warning and preserves motion.
The comparison covers every captured X/Y and the exact release tick.

The original duck consists of a 32x16 head, two 16x32 spring segments and
a 64x32 base. All phases are assembled from input-only captures under
scripts/OUTPUT/eggo-reference_2026-10-04_01-43-34_086046/park-primary-art.
The two directions preserve the native per-part positions and flips,
including the different head/spring horizontal offsets. They are stored
in two atlas rows, so the renderer needs one draw per duck and no live
sprite composition. Previous simulation coordinates/pose match OAM timing.

scripts/eggo-measure-park.py stores provenance, parameters, hashes, CSV,
both visits and the capture fixture. Electron --park-only normal duck and
captured scenes were inspected under
tests/OUTPUT/eggo-mania-visual_2026-10-03T23-46-59-675Z.
Original captured actor pose/audio and later-round scheduling remain open.


## Beanstalk hanging thief (native secondary type 8)

Input-only beanstalk-secondary-hard under
scripts/OUTPUT/eggo-reference_2026-10-04_01-48-16_085387
contains the complete right-side visit, frames 675..1013. The model matches
all positions, velocities, life, unused speed, animation counters and exit.
Spawn follows the actor X and actor Y-170. It waits 175 ticks, descends
at one pixel per tick, clamps at actor Y+48, then retreats at one pixel
per tick until above actor Y-170. The Hard rest is 850 ticks. The primary
jumper and secondary thief share occupancy; low/high waterline gates use
world coordinates, not viewport scrolling.

The separately logged theft probe under
scripts/OUTPUT/eggo-reference_2026-10-04_01-52-50_777739
sets the actor position/inventory, without altering enemy motion. All 100
steps match native motion. The strict integer contact radius is 12 at
body+(0,42). Stealing sets life=1: there is one further downward tick,
then retreat starts. Four original 32x32 spider poses and an 8x32 vine
come from input-only VRAM/OAM captures; vines repeat upward. Native
frame 10 of the theft probe confirms the item below the spider. The
renderer uses the previous simulation position/pose, matching OAM timing.
The normal/stolen Electron scenes were inspected under
 tests/OUTPUT/eggo-mania-visual_2026-10-03T23-53-55-809Z.
Measurement script eggo-measure-beanstalk-secondary.py preserves source
parameters, state/trace hashes, CSV and sprite provenance. Internal
throw/recovery anchors, later rounds and audio remain unverified.

## Jungle flying thief (native secondary type 10)

The input-only first Hard jungle capture under
scripts/OUTPUT/eggo-reference_2026-10-04_01-58-00_447339
contains complete right-side flights 675..796 and 1646..1744. Both match
all native positions, velocities, angles, life, variants, unused speed,
animation counters and departure, including both spawn ticks. Type 10
uses the type 1 park bird's fixed-point turn/flight routine. ROM
0x0801207c confirms its differences: spawn X gets +16, spawn Y is
actor Y-144, and turn Y is actor Y-132. It has two 32x32 original poses,
five ticks per pose, rather than the park bird's eight 64x64 poses.

The shared contact routine at 0x08013228 adds 16 for type 10 and 32 for
type 1. After the common correction, effective type 10 contact is
X+sign*6*VY+8, Y-sign*6*VX+30, strict integer radius 14. The logged
jungle-secondary-theft-probe under
scripts/OUTPUT/eggo-reference_2026-10-04_02-01-33_228002
confirms theft on the first step and the native retained life=50 through
the following comparison. The player inventory disappears while the
flight continues. Primary/secondary occupancy also applies in jungle.

Original OBJ phases, parameters, hashes and both complete flight CSVs
are retained by eggo-measure-jungle-secondary.py. Normal and stolen
Electron scenes were inspected under
 tests/OUTPUT/eggo-mania-visual_2026-10-04T00-02-58-241Z.
The complete native game suite currently passes 66 comparisons. These
are targeted evidence, not proof of complete Survival parity: shared
per-field RNG scheduling, dropped-item ballistic flight, exact CPU policy,
throw/recovery anchors, changing-load collapse activation, later-round
progression, roster and full music/SFX still require work.


## Linked-list pickup flight and enemy drops (2026-10-04)

Native managers at RAM 0x34e4 and 0x4860 contain their active list at +0x418,
free list at +0x420 and spawn clock at +0x428. An item is 0x34 bytes, with
its list node at +0x1c, state at +0x24, kind at +0x28 and orientation at
+0x2c. The new --pickup-trace reference option reads the active linked
list directly, with bounds/cycle checks. Parameters and initial item state
are preserved in each capture; it does not change emulator RAM.

ROM 0x0800b9fc..0x0800baac is ordinary item flight. In native pixel units,
VY=(VY+0x400/65536)*0xfc00/65536 and VX=VX*0xfc00/65536. Each product
uses the signed 16.16 floor operation confirmed by the ARM SMULL routine
at captured IWRAM 0x03000000. Position then advances by these velocities.
X clamps/reflections occur at 0 and 95; Y>waterline+8 switches to state 2.
The previously fitted constant 59/60 pixel speed is an approximation to
this drag/gravity equilibrium, not the complete flight rule.

State 2 applies +0x2000/65536 above waterline+12, -0x4000/65536 below it,
and outward horizontal force +/-0x400/65536 on either side of X47. Both
velocities use drag 0xf800/65536. Integration then occurs, and crossing
X<-16 or X>127 returns the item to its native pool. The item cannot be
caught while in this water state.

An input-only natural factory item from
scripts/OUTPUT/eggo-reference_2026-10-04_02-11-59_749510/factory-native-pickups
matches all 928 flight steps, both states, and disappearance at frame 1030.
The separately logged jungle theft/drop continuation under
scripts/OUTPUT/eggo-reference_2026-10-04_02-09-36_941624/jungle-native-drop-long
matches all 537 steps and departure at frame 561. Its ancestry includes
the explicit actor-position/inventory writes recorded in the theft probe;
it is not presented as an input-only natural theft.

The park/jungle bird drops its held item at Y<actorY-140. The initial
native item top-left is enemy+(8,16), VX=0 and VY=-2. The creation tick
includes the first gravity/drag step because native items update after
enemy AI. The JS integration now reproduces the exact drop tick, anchor,
velocity and subsequent flight; it keeps the original stolen piece.
Native picture center is item+(8,8). Its upward tower coordinate is
(744-nativeItemY)/16, so the previous drop picture was 24 pixels too low.
The jungle 32px affine enemy picture also needed a 16px vertical correction
relative to the shared park 64px picture.

ROM 0x0800bd7c distinguishes ordinary kind<=7 upright pictures from
kind>7 swaying affine tools. Building-piece icons now remain upright;
held icons also remain upright. Electron inspection includes the updated
jungle enemy and dropped native S icon under
 tests/OUTPUT/eggo-mania-visual_2026-10-04T00-17-02-876Z.
The target native screenshot is jungle-native-drop-long.frame00400.png.
The existing full suite passes 68 checks after these corrections.
The new motion currently drives bird drops. Ordinary generated pickups
still use the prototype scheduler/initial state pending the native spawn
pipeline; the exposed native motion is verified for their future use.

### Next reconstruction step: native pickup creation

ROM 0x0800b548 creates a pickup at native top-left (54,48), VY=-1.
It draws the field-specific RNG (0x08009380 for left / 0x080093a4 for right)
for VX=(draw-32767)*2/65536; draws again for weighted-bag selection;
then orientation=(draw>>12)&3. The update at 0x0800b944 draws once more
for clock=floor(max(64,(draw>>8)&127)*8/difficultyDivisor). First Hard
uses divisor 9 at config 0x0200e928+0x48. Spawn happens after decrement
makes the clock negative, so a clock of 76 means the next birth is 77
steps later. In the input-only factory source, seed 37606 at frame 101
produces draws [2358,45775,25200,54963], first updated VX=-0.9135131836,
clock=76, and the next spawn at 179; all four draws match the native RNG.

The bag refill at 0x0800b7e4 maps config offsets
[0x1c,0x30,0x38,0x2c,0x34,0x24,0x20,0x28,0x10,0x14,0x0c,0x08,0x18]
to kinds 0..12. First Hard weights are [5,6,6,6,6,5,5,5,1,2,2,1,1].
Selection uses draw modulo the remaining total and the native <= count
boundary, not a conventional < boundary. In Survival (native mode=5),
kinds 8 and 11 are skipped until native frame>1500, retaining their bag
counts. The exact skipped-boundary behavior should be transcribed.
The sprite address is ROM 0x08214f04+(orientation*13+kind)*128;
all 52 16px pictures can therefore be recovered with the native item
palette. Current per-field RNG consumers and intro setup still need ordering
verification before replacing the ordinary scheduler and prototype AI.


## Native pickup scheduler and field initialization (2026-10-04)

The default Hard game now uses the native weighted bag, four RNG draws,
orientation selection, horizontal launch velocity, variable spawn clock,
18-item pool and signed fixed-point motion for ordinary pickups as well as
bird drops. Both fields initialize separate RNG states with the same
measured seed; the resolved run seed is passed into each Tower, rather than
the setting's special zero value. The native animation frame counter starts at zero
rather than using the random seed as a clock. Custom crate interval scales
the native clock relative to the default. Disabling hazards keeps the
existing custom building-only pickup stream.

The actual refill weights are [5,6,6,6,6,5,5,5,1,2,2,1,1]. Boots and hammer
were swapped in the earlier inspection notes; direct bag RAM resolves the
order. Native regular creation matches all 17 recorded births on both
sides under scripts/OUTPUT/eggo-reference_2026-10-04_02-25-35_013307.
Each comparison checks the item type, orientation, first integrated X/Y,
VX/VY, spawn clock and complete remaining bag. Separately discarded or
thief-created items are excluded by their nonzero manager clock.

ROM 0x08018d42 performs 320 manager updates before the round. The native
first Hard field resets at capture frame 39 with seed 34340, then completes
this preparation. The following first gameplay step (frame 45/native 1)
has seed 37606, clock 55 and six items. The Tower initializer plus one
update matches every position, velocity, type/orientation and bag count.
The capture also contains a preceding temporary setup from seed 871;
it is distinct from the actual round initialization and is not replayed.

During countdown, original manager updates continue. The new intro-only
update does the same without enabling actor movement or item catching.
All recorded states through native frame 83 match the input-only capture
under scripts/OUTPUT/eggo-reference_2026-10-04_02-30-40_574913, including
the seventh pickup and its clock. Native display frame 46 repeats native
simulation frame 1 during setup, so it is compared without advancing.
Tool pictures share the native frame's sine-table phase rather than each
item's age. Current angle reconstruction agrees with nine captured RAM
angles within two native angle units (less than 5e-8 radians); the final
integer angle operation still differs by an occasional least-significant
unit. Ordinary building pictures remain upright.

All 52 native inventory pictures (13 kinds x 4 orientations) now reside
in assets/native-items.png. eggo-build-native-items.py decodes the original
ROM graphic table with a captured native palette, preserving ROM/palette
hashes and per-picture offsets/hashes. Geometry uses the already observed
icon mappings; previously unseen orientations derive from the same type's
rotation. The live renderer uses this atlas for native inventory, selecting
the picture that matches current rotated cells. This also replaces the
old help-page hammer picture for newly generated native hammers.

The measurement script eggo-measure-pickup-bags.py preserves all source
parameters, hashes, bag events and countdown states. The full suite passes
71 checks. The running Electron native preparation scene was inspected at
 tests/OUTPUT/eggo-mania-visual_2026-10-04T00-40-19-393Z/native-prefill.native.png.

Still open: native discard/rethrow paths, exact pickup catch boundaries,
all round/difficulty configuration progression, complete per-field RNG
consumer ordering, CPU decisions, throwing/recovery anchors, changing-load
collapse activation, roster/damage animation coverage and full music/SFX.
These new comparisons verify the pickup pipeline, not all Survival parity.

### Native discard and pickup contact (2026-10-04)

ROM 0x0800c470..c4e0 creates a regular pickup at actor X+8, Y+24,
with the actor's horizontal velocity and downward VY=4 pixels/frame.
The immediate item-manager step advances that motion and reduces its
30-frame protection to 29. This works for building pieces and tools;
discarding a bomb creates an inert pickup, unlike returning a thrown bomb.
ROM 0x0800bbc0..bbd2 starts a fresh 250-frame bomb counter when caught.
The constants are in RULES and both paths preserve current orientation.

Two input-only continuations of factory-native-pickups.state verify all
position/velocity, air/water state and protection values: native-discard-idle
(02-43-21_923026, 90 frames) and native-discard-moving (02-47-20_306692,
eight walking frames before R). eggo-measure-discard.py records parameters,
trace hashes, measurements and CSV files. The ordinary discard previously
deleted the piece; bomb-only discard used an invented facing-dependent kick.

ROM 0x0800bafc..bb7e uses strict absolute distances smaller than 12 pixels
on both axes, with +8 added to actor-minus-pickup coordinates. The tower's
egg center is 16 pixels right of native actor X; that conversion matters.
Nine natural catches in factory-native-pickups reproduce the contact test.
The native manager blocks catching during water, throw, capture and damage
states; boots remain catchable while carrying another item without replacing
that inventory. Native pickup protection is checked independently of age.

Validation: 72 model tests passed before the final anchor conversion;
the affected discard, catch and CPU checks passed again after that conversion.
Electron keyboard placement and the native discard scene passed; inspected
tests/OUTPUT/eggo-mania-visual_2026-10-04T00-51-30-734Z/native-discard.native.png.
This closes the regular discard path and contact rectangle. A complete native
CPU policy, later-round progression, changing-load collapse, actor coverage
and complete music/SFX remain open; it does not establish full Survival parity.

### Survival round tables and continuing configuration (2026-10-04)

ROM 0x08002050..207c copies 19 words from 0x080d74b0 with difficulty
stride 608 and round stride 76. Survival mode 5 selects Hard entries 1..8
for its first eight rounds (0x08002250..2272). The extracted three tables
live in assets/native-rounds.js. eggo-build-round-config.py checks all eight
Hard entries against retained native RAM snapshots, saving their hashes,
source parameters, full words and CSV. The later-stage snapshots descend
from logged win probes; these verify configuration, not input-only victories.

The live game now uses each round's pickup weights and divisor, both enemy
difficulties, and zero-difficulty disabling. All enemy rest calculations use
their assigned difficulty; the bubble previously hardcoded 5 even when its
state carried another difficulty. Round three has primary=secondary=0 and
bomb weight 6 (config 0x10); pickups map ROM offsets to native type order.
First-round configuration remains identical to the earlier captured defaults.

After eight Hard rounds, 0x080022a8..22c4 draws difficulty modulo 3 and level
modulo 7 plus 2. 0x0800207e increases heights congruent to 2 modulo 5 below
47; 0x080022ea enforces pickup divisor >=10. nativeSurvivalConfig exposes
these decisions with an explicit input seed. The input-only continuation
survival-ninth-config (10-46-53_164366), loaded from win8's logged probe,
changes config at frame 34 to Normal entry 2, height 43, divisor 10.
The selection seed after two observed setup draws is 64756; both selection
draws and all 19 resulting words match. The live balloon height, intro and
progress indicators use the resulting height relative to the first round.

Validation: 73 model checks passed; the added ninth-round comparison passed
after regenerating its fixture. Electron keyboard placement and ninth-round
render passed. Inspected the native-sized image in
tests/OUTPUT/eggo-mania-visual_2026-10-04T08-50-02-943Z/survival-round-nine.native.png.
This verifies tables and the seeded configuration function. It does not
verify all consequences of every config field: AI/character selection,
changing-load collapse tuning and complete per-field RNG scheduling remain
open. The live configuration seed remains separate until RNG consumers are
unified, so an entire later-round replay is not yet frame-identical.

### Exact per-floor collapse counters (2026-10-04)

ROM 0x08003f16..3f46 checks the occupied incomplete-floor count after a
placement, requesting destruction when it exceeds seven. 0x08005bdc skips
the highest incomplete floor and requests every lower incomplete floor,
including below complete floors. This is the same request used by hammer
damage. The earlier model used a persistent penultimate-floor approximation
and incorrectly stopped the entire chain at a complete floor.

0x08003b0c and 0x0801a340 initialize each previously inactive timer to
max(17,24*n-7). 0x0801a1b8 processes the highest active index per frame,
using the old counter value: at 32 a completed floor cancels its timer;
at 16 the incomplete floor is removed, then counters 15..0 run before
the next floor. New requests preserve existing timers. A removed floor's
timer retains its index while the cells above move down. The live model
now uses that index-based map for both ordinary and hammer destruction.
Committed pieces/filler request normal destruction; merely measuring the
board during ordinary movement no longer starts it. Empty rows do not
count as occupied incomplete floors (0x080039c8..3a0c).

The input-only collapse-onset-replay (10-55-24_353501) repeats the original
414-frame controller trace. At frame 412 its eighth incomplete floor commits,
and timers [17,41,65,41,89,89,65] are created below the roof. The first floor
disappears at 414, matching the decoded old-value-16 test. CPU inventory is
I3 and no hammer projectile exists at onset; this directly separates the
ordinary request from hammer damage. collapse-queue-continuation
(10-56-44_486658) then records all 600 idle timer states and board events.
eggo-measure-collapse-queue.py preserves metadata, hashes and CSV. The model
matches every recorded counter, the existing complete 600-frame board
comparison, and both independently measured hammer removal times.

The changed collapse path exposed a provisional CPU route stuck behind an
unreachable cliff. Its planner now checks adjacent-column rises against the
floating jump height derived from the existing jump/gravity constants and
replans when a changed board invalidates that route. This is a practical
correction to the prototype, not reconstruction of the native CPU policy.
The seeded no-hazard CPU rescue check passes again.

Validation: 74 model checks passed. Electron keyboard placement and the surge
scene passed; inspected tests/OUTPUT/eggo-mania-visual_2026-10-04T09-03-44-347Z/surge.native.png.
General rising-water
movement/animation, original CPU, roster and full audio remain incomplete.

A subsequent ordinary-controller bot continuation, collapse-building-continuation
(11-05-43_227634), creates new requests at frames 42, 145 and 452 while old
timers are still running. At frame 42 an old counter 16 still processes its
removal, while new higher counters retain their initial values. Counter
processing therefore precedes committed placement requests. The update order
was corrected accordingly; all 74 checks still pass. This changing-board trace
now reproduces all 600 counter states and all 600 board states, with recorded
external placements and loose-cell movements prescribed to the model. This
verifies counter ordering, preservation, cancellation and removal under a
changing board; it does not verify the movement/placement code that produces
those prescribed changes. The affected counter test passes.

### Native music cycles and playback (2026-10-04)

The native NO SFX option isolates music. Ordinary menu input selects all eight
starting arenas from music-only-hard.state: delays 0..7 select castle, jungle,
factory, pirate, park, dragon, space and beanstalk. After 300 entry frames,
START opens the native Pause menu; gameplay freezes while music continues.
No RAM edits are used. eggo-capture-music-stages.py retains every input, state
hash and actual arena ID. The complete profiles are in
scripts/OUTPUT/eggo-music-stages_2026-10-04_11-21-39_970963/profiles.json.

ROM 0x0801fc54..1fd46 advances the custom sequencer; 0x0801fd0c sets its
music boundary flag at IWRAM 0x0300253e. Its eight 16-byte track states start
at 0x03002530. eggo-reference.py --music-trace records every byte of those
states, alongside the emitted audio sample count when --audio is enabled.
This removes the need to infer cycle duration solely from audible phrases.
For every arena, eggo-build-music.py compares all eight states for every frame
of a complete repetition. Longer tunes get an input-only continuation from
their retained Pause state so the entire second cycle is checked.

Verified periods, in native video frames: castle 4608, jungle 5184,
factory 6656, pirate 5824, park 4320, dragon 4032, space 7168,
beanstalk 4480. The GBA ratio of 280896 CPU cycles per video frame,
16777216 CPU cycles per second and 32768 PCM samples per second gives
the exact cycle lengths. Core audio callback markers are quantized to 512
samples; their raw differences must not be mistaken for precise loop lengths.
The exported WAVs retain unchanged 16-bit stereo PCM, without normalization,
fading or synthesis. The join is selected within one callback packet to reduce
its discontinuity. All parameters, source hashes, continuation traces and
measurements are retained in scripts/OUTPUT/eggo-music-build_2026-10-04_11-27-47_480677
and tests/fixtures/eggo-music-gba.json. The eight assets total about 88.5 MiB.

NativeMusic loads the current arena through AudioManager. Playback stops at
round completion, restart, arena change and game destruction. Pause/resume
preserves playback position. A request token suppresses late asynchronous
decodes after leaving/changing arenas; a decode that completes during Pause
stays silent. Three targeted tests validate all asset hashes and cycle lengths,
pending-decode lifecycle and actual loop handle position. The Electron
--music-only check decodes native factory music as stereo, verifies advancing
playback, frozen pause position, resumed position and destruction, plus normal
keyboard placement. Artifacts: tests/OUTPUT/eggo-mania-visual_2026-10-04T09-30-50-513Z;
start.native.png was inspected.

These are verified steady in-game cycles. Entry phase, native result music,
all remaining SFX and original shared-channel mixing remain unverified.
Sequencer equality does not imply identical hardware oscillator/sample phase
across the join. This audio addition does not establish full Survival parity;
native CPU policy, complete RNG scheduling, rising water and loose-cell motion
still require reconstruction.

### Whole-owner support, loose cells and bounded floor removal (2026-10-04)

The input-only collapse-loose-cell replay (11-36-06_347882) repeats 360 bot
frames from before-surge.state, retaining frames 340..346 with original RAM,
IWRAM and pictures. Between 342 and 343, owner 9 moves from (3,4) to (3,3),
with no other board edit. The global native frame at 343 is 1320.
ROM 0x0800cdb0..cfc2 selects native row 46-(globalFrame modulo 47), i.e.
model row globalFrame modulo 47, then examines its owners left to right.
For an owner with no external support it copies all its cells down one row,
bottom to top. 0x08019088..190a6 processes collapse counters before this
support pass. This is deliberate discrete native movement, not gravity
integration of individually falling cells.

IWRAM 0x03001a34..1c6c gathers all cells with the selected owner within
three native rows either side of the anchor. It returns unique other owners
immediately below those cells, preserving the first contact coordinate for
each. During placement, the same routine merges owners that directly support
one another, then recalculates the enlarged owner's group and dependencies.
The live model now preserves this ownership, query ordering, support test,
mutual merge and one-row scheduled motion. Placement performs the merge
before completion bookkeeping. Colors/materials remain attached to individual
cells while ownership changes; ground uses a separate sentinel in the model.

To validate the branches directly, eggo-measure-piece-support.py executes the
original captured ARM instructions through Unicorn on isolated diagnostic
grids. The routine's bytes are also found unchanged in the local ROM. Empty,
floating, externally supported, grounded and mutually supported cases plus
32 seeded diagnostic grids are each queried with and without merging. All
74 native outcomes match the model's complete cell group, support list and
resulting owner map. These diagnostic grids are instruction comparisons,
not claims of realizable gameplay or victories. Foundation cells have the
actual native owner 255. Sources, byte hashes, seed, memory layout and CSV
are retained in scripts/OUTPUT/eggo-piece-support_2026-10-04_11-52-27_019454
and tests/fixtures/eggo-piece-support-gba.json.

That same experiment directly executes native floor removal at IWRAM
0x03001840..1a30. It copies rows above the deleted floor until the first
empty row; higher islands remain at their original coordinates. It leaves
actor coordinates untouched. The earlier splice incorrectly translated
every higher island and instantly lowered any higher actor by one tile.
removeFloor now copies only this bounded section and lets normal actor
physics handle the lost support. Three original-instruction cases cover a
continuous stack, an island above a gap and a gap directly above the target.
All three owner maps and unchanged actor coordinates match the model.

The 600-frame changing-board replay now prescribes only external placements;
the frame-343 drop is separated in loose_edits and must arise from the model's
own support pass. All counter states and board states still match. The fixture
compiler also uses bounded floor copying. Updated measurements are retained
in scripts/OUTPUT/eggo-collapse-queue_2026-10-04_11-54-29_715968.
74 pre-existing model checks passed after scheduled falling was added.
After the merge and bounded-removal changes, targeted support/removal, native
collapse, blast, surge and CPU rescue checks passed. Electron --loose-only
passes keyboard placement and reproduces the complete native before/after
board at global frames 1319/1320. Inspected loose-after.native.png in
tests/OUTPUT/eggo-mania-visual_2026-10-04T09-54-06-282Z.

This closes the observed loose-cell movement and the decoded support/removal
helpers. Exact placement/throw trajectories remain open, as do original CPU policy, complete
RNG ordering, rising-water animation and the remaining audio/presentation.

### Loose-piece actor response and native CPU oracle (2026-10-04)

eggo-measure-loose-actor.py runs the original Thumb pass at 0x0800cdb0
with the captured ARM support helper. A moving owner tests the actor's probe
at native (x+17,y+4), using the owner's cells before its one-row move. A hit
sets actor vertical velocity to -5 native pixels/frame without translating
the actor. Six original-instruction cases include an observed non-contact,
contact, and all four exact excluded probe boundaries. The model reproduces
the complete resulting owner map, unchanged actor coordinates and velocity.
The loose pass now runs after actor/hazard motion, as in the original
dispatcher, rather than before actor motion. The earlier collapse-counter
pass is still separate; this is not a claim of matching every dispatcher
phase. Evidence: eggo-loose-actor_2026-10-04_11-58-13_333454 and
tests/fixtures/eggo-loose-actor-gba.json.

The original CPU controller is ROM 0x080065f8..0x08008284, with brain at
0x02005a40 and right board at 0x02010650. eggo-reference.py --ai-trace retains
its command mask, brain words and actor fields on each frame. An input-only
600-frame replay from before-surge.state is retained in
eggo-reference_2026-10-04_12-06-30_205010/native-cpu-building. Direct execution
through Unicorn at fifteen checkpoint pairs returns exactly the recorded
next-frame command mask, including waiting, walking/jumping and rotation.
These isolated calls are not a full multi-frame controller replay: global
RNG consumers and actor scheduling still need to be unified.

native-cpu.js transcribes the original bounded candidate placement search
(0x0800c884..cbc0) and candidate score (0x08007208..7706). It preserves the
original 3x3 mask offsets, searches for supported gaps in both directions,
and scores support, holes, completed rows, height profiles, walking distance,
orientation and the deterministic difficulty perturbation. The controller
evaluates one rotation/column candidate per frame, retaining its best choice
across a sweep; it does not evaluate all 28 on every frame. Candidate owner 2
is temporary in the native scratch board, not a newly placed real piece.

Six candidates from real checkpoints and 48 logged diagnostic combinations
of four inventory kinds, four rotations and three columns reproduce exact
native placement validity/anchors and integer scores. Diagnostic calls alter
only logged CPU sweep fields and inventory; they are not gameplay victories.
eggo-measure-cpu-candidates.py regenerates these measurements with source
hashes and parameters; fixtures retain the full scratch boards. Verification:
node --test tests/eggo-native-cpu.test.mjs (two checks passed). Targeted
support, floor deletion, loose actor and 600-frame collapse checks also pass.

### Native placement masks and gameplay connection (2026-10-04)

eggo-build-piece-masks.py extracts the 32 original 3x3 masks from ROM
0x081f4758 with kind stride 128 and orientation stride 1024. All 48
diagnostic masks agree byte-for-coordinate with those read by the original
routine. After reversing the native downward Y axis and normalizing for
display, all 32 agree with the existing inventory shapes. The lost padding
was nevertheless significant: the placement anchor uses the unnormalized
mask, especially for two-cell pieces and at board edges. Manifest, ROM hash
and comparisons are retained in eggo-piece-masks_2026-10-04_12-20-44_383331.

Tower.preview now uses the native bounded placement search for known native
inventory on seven-column boards. Its result also drives actual placement.
All 54 oracle placement anchors agree through the gameplay coordinate/board
bridge. Rotation updates the native orientation as well as normalized cells,
preserving distinctions between symmetric masks with different padding.
Custom widths and legacy shapes retain the existing generic placement path.

The gameplay planner now scores regular native pieces with the original
score and original search instead of the earlier generic hole/height cost.
The native height metrics are respectively the minimum and maximum of the
seven native column-top indices; actor progress equals incomplete row count.
The water urgency uses native integer pixel truncation (water Y minus one
pixel, divided by 16), not an inverted grid-height approximation. A captured
cross-piece board selects the same highest-scoring candidate as the original
diagnostic calls through this gameplay bridge.

This is still partial controller reconstruction. Gameplay retains the
prototype reachability filter, movement, thinking delay, instantaneous sweep,
pickup selection and item policy. The original evaluates one candidate per
frame. Its special single-cell hole-filling branch is not reconstructed and
still uses the generic planner. These differences must be resolved before
claiming native CPU parity.

Four native CPU checks pass. A full model/native-helper run passed 80 of 81
checks; its one failure was an obsolete hammer-test array-length assumption
after the earlier bounded native row-copy change. The occupied roof and both
native deletion times are preserved; the corrected roof assertion passed in
the targeted follow-up. Electron --reference-only passed keyboard placement;
reference.native.png was inspected in
tests/OUTPUT/eggo-mania-visual_2026-10-04T10-25-17-657Z.
The keyboard smoke uses a legacy shape, so it alone does not prove the new
native preview path. The independent native fixture/bridge checks cover that.

eggo-native-cpu-replay.mjs runs a deterministic Hard Survival native-bag
integration with seed 42, factory start, no extra water rise, and original
arena hazards enabled. The CPU places 66 native pieces and reaches the rescue
balloon at frame 9479 with finite positions. Configuration, all physical/CPU
parameters, source hashes, placement events and sampled CSV trajectory are
retained in tests/OUTPUT/eggo-native-cpu-replay_2026-10-04T10-31-19-383Z.
This demonstrates a playable integration, not comparison with the original
CPU's full trajectory or a proof of complete Survival fidelity.

### Drop-through and single-cell gap branch (2026-10-04)

ROM 0x0800fc6a..0x0800fcca processes the held L binding after movement.
On support outside swimming state it sets downward velocity to one native
pixel/frame and the board's bypass counter to nine. An airborne held L does
not renew that counter. Native displacement precedes the next air gravity
increment; the increments are fixed-point values. Two input-only captures
from hard-place60, with L for one and twenty frames respectively, have the
same twenty-frame trajectory. The bypass expires after frame ten, and the
character still passes the artificial foundation instead of being caught by
the prototype's y<0 cell sentinel. The full native inventory-loss and water
recovery checks remain valid with the original held input sequence. The
old test had delayed L by one frame to compensate for the prototype's wrong
integration order; it now applies the actual two-frame native input.

Source captures are eggo-reference_2026-10-04_12-36-06_737656/dive-single and
eggo-reference_2026-10-04_12-40-41_511959/dive-held. eggo-build-dive-fixture.py
preserves their parameters, source hashes and positions/velocities/counters;
measurement and CSV are in eggo-dive_2026-10-04_12-48-35_170689. The gameplay
comparison uses a relative native anchor to avoid inventing a different
fractional floor offset. Air motion matches within 0.002 native pixels.

The native kind-2, rotation-1 CPU branch at 0x08007134..0x08007170 is not an
ordinary rotation. Helper 0x08006408 scans up to five cells below each column
top for the first gap. A gap's base score is gapRow+(columnTop>>2)+55-4*difficulty,
followed by the native deterministic noise. This branch skips the ordinary
distance and rotation bonuses. Seven original instruction calls from replay
frame eighty, including two real holes, agree exactly with the reconstructed
scan and score. Regenerate with eggo-measure-cpu-candidates.py --holes-only;
results are in eggo-cpu-candidates_2026-10-04_12-46-30_867528 and the separate
eggo-cpu-holes-gba.json fixture. Every diagnostic RAM change is logged.

Gameplay now connects this choice to a drop-through action and waits until
the native preview reaches the gap before throwing. A supported bridge over
a hole verifies the full descend/throw/commit path. That check also exposed
the old generic final landing search rejecting a correct native buried-gap
preview; final known-native placement now rechecks the native bounded search.
Ordinary CPU locomotion, instantaneous candidate sweep and pickup/item policy
are still provisional; this is not a claim of complete native CPU behavior.

The combined model/native-CPU/dive run passes all 84 checks. Seed forty-two
Hard integration, with native pickups and hazards, reaches the rescue at
frame 10716 after 82 placements with finite actor positions; parameters,
source hashes and CSV trajectory are retained in
tests/OUTPUT/eggo-native-cpu-replay_2026-10-04T10-50-16-542Z. This integration
still does not compare an entire match with the original CPU trajectory.

### Incremental native candidate sweep (2026-10-04)

The loop at 0x080070ac..0x080070e6 advances one column per policy call.
Column seven wraps to zero and advances the orientation modulo four. On
return to orientation zero/column zero it marks the selection ready. The
comparison at 0x08007706 is strictly greater: ties retain the existing target,
score, rotation and anchors. Evaluation continues after the first completed
sweep while the actor executes its selected action. The regular score's
clock is CPU +0xc8, advanced in the policy, not the global board-frame index.

The policy oracle now records both sides of this exact instruction segment.
Six real checkpoint transitions and eight logged diagnostic transitions
include first-sweep wrap and new-best cases. All fourteen match both the
counter-update helper and the integrated gameplay evaluator, including full
native score and final brain fields. The latter constructs the tower from
the recorded pre-candidate board and uses the captured actor orientation,
column and integer water urgency. It supplies the recorded CPU clock before
evaluating, so this proves the segment, not the surrounding clock lifecycle.
Regenerate with eggo-measure-cpu-candidates.py --sweep-only. Measurements and
script/source hashes are retained in
eggo-cpu-candidates_2026-10-04_12-57-23_620050 and eggo-cpu-sweep-gba.json.

Live gameplay now advances NativePieceSweep once per fixed step and keeps
evaluating after readiness. Its initial sweep waits twenty-eight steps; the
previous default prototype delay is replaced by optional extra delay, default
zero. Native targets are no longer filtered/replanned with the prototype's
reachability heuristic. Custom widths/legacy pieces retain that older planner.
A stale buried gap restarts the live search instead of evaluating all twenty-
eight combinations immediately. This restart rule remains provisional.

Important remaining limit: the live search clock still begins with each new
inventory; the original CPU clock persists until its native cooldown schedule
resets it. At 0x08007014..0x0800704a, regular-piece processing initializes
the +0x100 counter to (11-difficulty)<<8, the +0x104 counter to difficulty²,
and resets +0xc8. The early +0x104 wait and later counter decrements must be
connected to the gameplay controller before asserting complete native timing.
Native locomotion, pickup/item decisions and complete controller RNG order
also remain to be reconstructed.

Nine focused CPU/dive checks passed; the additional full gameplay-bridge
comparison of fourteen native transitions passed separately. Targeted CPU
match/settings/default-pickup/Survival-score checks passed after integration.
Seed forty-two Hard/native-bag/hazards integration reaches rescue after 75
placements at frame 10689 with finite positions. Configuration, source hashes,
events and CSV are in
tests/OUTPUT/eggo-native-cpu-replay_2026-10-04T11-03-57-151Z. These results do
not establish the original controller's full trajectory or overall parity.

### Ordinary-piece CPU clock and wait lifecycle (2026-10-04)

The timer entry at 0x080066ac checks CPU +0x104. A positive value takes
0x08006780, decrements only that wait, and returns zero keys. The ordinary
entry at 0x080067d2..0x08006800 decrements positive +0xcc/+0xd0 values and
increments +0xc8. Throw (actor state four), state two and state six then
return without decrementing the longer +0x100 counter. With no inventory,
the clock also advances but the longer counter remains unchanged.

For ordinary inventory kinds zero through seven, 0x08006d84 decrements a
nonzero +0x100 counter. If it expires, 0x08007014..0x0800704c reloads it to
(11-difficulty)<<8, sets +0x104 to difficulty squared, resets +0xc8 and
emits the bound Use key immediately. It does not merely defer another search.
At Hard difficulty six these values are 1280 and 36. The ordinary Use
dispatch at 0x08007da0 also sets the squared wait before emitting the key.

eggo-measure-cpu-timing.py runs eight logged diagnostic instruction calls
from the actual frame-two-hundred checkpoint: positive wait, ordinary entry,
period one/zero expiry, actor states four/six/two, and empty inventory. The
oracle records timer fields before entry, after begin, after the ordinary
piece gate, or after early wait. Exact boundary values and both expiry
calls' Use key one agree with NativeCpuTiming. Parameters, all diagnostic
writes, ROM/RAM/oracle hashes and CSV are retained in
eggo-cpu-timing_2026-10-04_13-07-56_338181 and eggo-cpu-timing-gba.json.

Gameplay keeps this timer state across inventory changes and supplies its
clock to each candidate evaluation instead of resetting search age per
inventory. Decision waits still advance Tower.update, so motion and throw
animation continue. The first expired-counter action and inventory-clock
continuity are exercised through the actual game controller. Thirteen
focused timer/dive/native-search checks pass. Special inventory branches,
the uses of +0xcc/+0xd0 by exact movement/rotation policy and native shared
RNG consumption are still incomplete; these checks establish the ordinary
timer gates, not the whole controller.

The native-bag/hazards integration initially reached its old 10800-frame
test limit while still actively placing pieces. The prior three-minute
prototype limit was not a game rule; the capture now allows five simulated
minutes and records CPU clock/period/wait in its CSV. Seed forty-two reaches
rescue at frame 14589 after 86 placements with finite positions. Parameters,
source hashes and trajectory are in
tests/OUTPUT/eggo-native-cpu-replay_2026-10-04T13-45-02-961Z. This remains an
integration check, not native full-match trajectory parity.

### Native CPU clockwise rotation input gate (2026-10-04)

The ordinary controller ends at 0x0800819a..0x080081fc by comparing its
selected +0xb8 orientation to actor +0x868. If they differ and +0xb4 is zero,
it sets +0xb4 to fifteen and ORs the mapped clockwise button into existing
keys. With a nonzero wait it decrements that wait and does not issue a turn,
even when the decrement reaches zero. Matching orientations leave the timer
unchanged. Thus sustained mismatch produces inputs on eligible calls one,
seventeen and thirty-three. Earlier decision waits/returns skip this segment;
its interval is not fifteen wall-clock frames in every actor state. The
separate mode-zero/global-difficulty-two exception is outside Survival mode
five and is not included in this reconstruction gate.

eggo-measure-cpu-rotation.py executes this original segment in Unicorn from
the captured frame-two-hundred RAM/IWRAM with its original Survival global
state and key binding. Six explicit diagnostic current/target/wait cases
include matching orientation, mismatch at zero, waits fifteen and one, and
a preserved nonzero wait on a match. The original mapped button is two; it
is combined with existing directional keys, not substituted for them. All
RAM/stack inputs are logged. Parameters, ROM/RAM/IWRAM hashes and CSV are in
eggo-cpu-rotation_2026-10-04_15-52-52_044766 and eggo-cpu-rotation-gba.json.

Gameplay now sends individual rotate controls through Tower.update, instead
of directly changing normalized geometry by up to three turns at once. The
wait persists across inventories and only advances when a required rotation
reaches this part of the live controller. A three-turn game sequence rotates
once at calls one, seventeen and thirty-three, and begins its throw on call
thirty-four; earlier throws are blocked. The special single-cell gap choice
now also requests orientation one rather than hiding its native control
state behind an unchanged cell footprint. The buried-gap gameplay check
continues to pass with this rotation performed.

Fifteen focused timing/search/dive checks pass. The native-bag/hazard
integration reaches rescue at frame 12958 after 76 placements with finite
positions; parameters, source hashes, events and timer/position CSV are in
tests/OUTPUT/eggo-native-cpu-replay_2026-10-04T13-54-18-231Z. The live controller
still uses prototype locomotion, does not yet reproduce rotation requests
while empty-handed, and lacks the complete native pickup/item/hazard policy
and shared RNG consumer order. This is rotation-segment fidelity, not a
claim of full controller or complete Survival feature parity.

### Original actor throw arc (2026-10-04)

Actor state four at 0x0800d7f8's dispatch target 0x0800e0e8 uses
0x0800e154..e244 to interpolate stored actor origins (+0x8d8/+0x8dc)
towards targets (+0x8bc/+0x8c0). Its +0x87c counter advances by half a
16.16 unit per frame; the reciprocal lookup at IWRAM 0x0300031c returns
4681 for fourteen. Fixed-point multiplication truncates down. The vertical
offset is minus sixty-four pixels times the original sine sample, with
2048 angle units over the interpolated interval. The sine helper at
0x030002b8 drops the lowest two integer angle bits before its ROM lookup.
At counter fourteen the actor snaps to its stored target and receives
minus 3.5 pixels/frame vertical velocity (0x0800e730..e73e).

The native reconstruction now uses these operations instead of a fitted
parabola. The first throw frame retains its origin; the twenty-eighth
commits and starts the hop. Actor landing targets preserve the raw mask's
padding rather than using its normalized visible-cell bounds. Rechecking
the placement from the airborne actor's landing position incorrectly
selected the roof over a buried opening; the recheck now uses the original
throw origin. This board-change recheck remains a reconstruction policy,
not yet a verified copy of the original attack-during-throw behavior.

eggo-build-throw-fixture.py preserves all twenty-eight ordinary-input
actor positions from camera-throw, its original save-state parameters,
trace/RAM hashes, target coordinates and CSV. Measurements are in
eggo-throw_2026-10-04_16-10-06_363675. The live Tower test matches every
position to one native fixed-point unit, including frame twenty-eight's
commit and hop velocity. Eight focused throw/dive/CPU timing checks and
ten related existing checks pass. Evidence covers this recorded throw,
not all shapes, moving-board interactions or complete Survival parity.

After the throw change the seed-42 native-bag/hazard integration reaches
rescue at frame 11118 after sixty-four placements, with finite positions.
Its parameters, source hashes and event/trajectory CSV are in
tests/OUTPUT/eggo-native-cpu-replay_2026-10-04T14-12-31-799Z. This establishes
continued playable integration, not equality to the native CPU trajectory.

### Full-size piece graphics during a throw (2026-10-04)

The original piece picture remains beside the airborne actor and grows;
it does not linearly fall from the actor's starting height to the placement.
0x0800e246..e2de sets its 64-pixel OBJ origin to actor X minus sixteen
and actor Y plus the animation offset minus thirty-two minus thirty-two
times its scale. Scale starts at one quarter and adds three quarters times
the same fixed-point throw progress. The eighteen signed vertical offsets
come from ROM 0x080da550. The affine inverse uses the original reciprocal
table at 0x080d9550, through IWRAM helper 0x0300031c. OAM renders the
preceding update's picture coordinates and inverse matrix.

throwPiecePose matches all seven captured graphics positions and scales
to one native fixed-point unit and all seven preceding-frame matrices
exactly. The renderer uses its integer OBJ box origin and inverse-matrix
scale. Native rotations are preserved in the atlas; generic/custom-width
piece art retains its fallback. Canvas resampling has not yet been proven
pixel-identical to GBA's integer affine sampling.

eggo-build-throw-art.py acquires all thirty-two original 64x64 pictures
through diagnostic inventory selections and actual rotation/throw keys.
Their nine cell-center occupancies all match the corresponding native
masks. Native full-size textures are not pre-rotated in VRAM; the original
quarter-turn matrix is baked into each atlas picture. A first diagnostic
atlas that omitted this rotation was replaced after the mask comparison
detected it. The verified atlas and all source parameters, hashes, inputs,
individual PNGs and sprite CSV are in
eggo-throw-art_2026-10-04_16-26-32_402917. Graphics fixtures, hashes and CSV
are in eggo-throw_2026-10-04_16-23-49_196575. Two focused original trace
checks pass. Electron --throw-only renders a four-frame strip, loads the
new atlas, and exercises ordinary keyboard placement successfully;
screenshots are in eggo-mania-visual_2026-10-04T14-27-13-789Z. This is visual
integration evidence, not an exact whole-frame comparison or full parity.

### Original immutable placed-cell artwork (2026-10-04)

The corner atlas was a visual approximation even for many observed cases:
the same inferred material/corner/adjacency state can have different native
tile descriptors. Reconstructing a new edge from the current owner's
neighbours also changes artwork after owner merging, fracture or a drop.
The original placement writes fixed template descriptors into its persistent
map and the native floor/owner copy passes move those map entries.

0x0800c064's first eight stage targets select placement tables at ROM
offsets 0x1f4758, 0x1f7b00, 0x1fb8a8, 0x1ff550, 0x202758, 0x206cbc,
0x20a6bc and 0x20d164 (beanstalk, factory, dragon, castle, pirate, space,
jungle, park). Each rotation is 1024 bytes and each kind is 128 bytes,
an eight-column tile-descriptor map. 0x0800c1a4..c1e8 copies the first six
rows and columns into the tower at twice the projected cell anchor. That
template is also used for occupied-cell placement bookkeeping afterward.

eggo-build-placed-art.py decodes the 256 complete placement templates
against the corresponding native stage VRAM/palettes. All masks agree with
their original 3x3 geometry. For the ordinary-input camera-throw's final
board it also compares every committed kind-six factory descriptor and
decoded tile pixel to the ROM map; all match. Source parameters, hashes,
descriptors, template CSV and eight atlases are in
eggo-placed-art_2026-10-04_16-38-13_703474.

Live native placement records a compact template/cell index per occupied
cell. Whole-owner falls and floor deletion preserve this index, clearing it
only when its cell is removed or replaced. Owner merging retains the art.
The renderer copies the corresponding original 16x16 rectangle rather than
recalculating corners. Completed rows, filler and generic custom pieces
still use their existing artwork paths; completed-row/filler texture parity
has not been established by this change.

The focused gameplay check covers every padded kind/orientation and a
drop/floor deletion/removal sequence. The Electron throw/placement scene
in eggo-mania-visual_2026-10-04T14-40-52-319Z matches its resulting placed
piece pixel-for-pixel to the independently decoded original template
(zero differing pixels; comparison JSON beside the screenshot). The prior
original-input descriptor comparison links that template to the native
commit. This verifies the recorded piece and template selection, not all
later board transformations or full Survival feature parity.

### Original filler walk and growth pictures (2026-10-04)

The earlier single-board interpretation of filler as a row-first distance
sort was incomplete. Eight new diagnostic inventory selections, followed by
real placement and Use inputs, expose different creation orders. Inventory
is selected explicitly; boards and gameplay timers are not fabricated.
Sources and every-frame RAM/graphics captures are recorded in
eggo-filler-art_2026-10-04_16-52-38_612188. The final extracted fixture and
twenty-four pictures are in eggo-filler-art_2026-10-04_16-56-39_411302.

Original Use dispatch at 0x0800ff84 calls 0x08003d50 with six cells.
0x08003d6a..3d88 derives the actor column from signed integer actor X plus
17 pixels, divided by sixteen, and selects left-first for columns 0..3,
right-first for columns 4..6. 0x08003dc0..3f14 walks supported gaps:
descend until supported, fill if empty, prefer the first empty horizontal
neighbour, then the other; climb at the actor column or into an empty
cell above a previously visited lower row, otherwise return to the actor
column. This explains the three consecutive outward cells in the new
zigzag boards and still reproduces the old input-only CPU board exactly.
The reconstruction now uses that walk, including the 1/16-tile column bias,
rather than limiting filler to empty cells below the actor's current height.
Instruction records are saved in eggo-instructions_2026-10-04_17-02-31_377752,
eggo-instructions_2026-10-04_17-02-37_453452,
eggo-instructions_2026-10-04_17-02-42_710192 and
eggo-instructions_2026-10-04_17-02-52_386105.

The persistent board map, not a fixed scrolling VRAM row, supplies the
authoritative cell descriptors. Its sixteen halfword columns begin at each
board root; model cell (x,y) is native row 46-y and two map tiles per axis.
Each of the six new cells starts with phase zero. Growth occurs at ages
4,8,12,16,20,25 and final artwork at 24,29,34,39,44,49 original frames,
identically in all eight captured arenas. The independent ordinary-input
CPU capture and its continuation also exhibit these times. These thresholds
are measured, not yet a transcription of the original growth timer code.
eggo-measure-filler-art.py decodes the three observed tile-descriptor sets
using each arena's original VRAM/palette and records per-phase pixel hashes.
Filler final art differs from the regular mono piece, so that template is
not substituted. Birth time and sequence index stay with the cell through
owner drops and floor deletion.

Native completed-row logical descriptors retain existing piece artwork.
The renderer therefore preserves the template on sealed native rows instead
of forcing the legacy silver artwork. A fixed VRAM row can show foundation
graphics when the camera scrolls; that is not evidence of recolouring.

Three focused tests check all eight creation orders and transition timings,
the separate input-only CPU board, and metadata preservation. The Electron
keyboard filler scene passes; its eight-arena, three-phase image strip is
in eggo-mania-visual_2026-10-04T15-05-13-913Z. All twenty-four rendered
phase images match the decoded original with zero differing visible pixels
(transparent RGB values are ignored); filler-pixel-comparison.json records
the comparison. Complete actor response to filler, owner lifecycle during
growth, unusual floor shifts and full Survival parity remain unverified.

### Filler launch, temporary float and native contact order (2026-10-04)

Further inspection of 0x08003e52..3e78 shows that creating a cell in the
actor's column and foot row assigns native VY=-3.5 pixels/frame and the
board's automatic float counter to 22. The foot row derives from signed
integer actor Y plus 26 pixels, divided by sixteen. Original actor movement
at 0x0800fabc..fac2 precedes Use dispatch at 0x0800ff84, so this impulse
does not move the actor until the following frame. The model now defers
filler Use until after movement rather than integrating its new velocity
immediately or leaving the egg embedded in the newly created cell.

0x0800fb44..fb7e selects 6553/65536 pixel/frame squared acceleration while
the board counter is positive and decrements it during eligible movement.
Afterwards neutral acceleration is 13107/65536. Native Filler motion uses
the preceding velocity for displacement, then updates/clamps velocity.
The existing normal/Up/Down constants are used with the same fixed-point
quantization as the native dive path; the twenty-two-tick state is explicit.

At first landing the original corrects position with 0x08003848: remove
the integer-pixel remainder, preserving the fractional part. It clears
velocity at the following support check, not the initial correction.
The model reproduces this for filler motion, including continued support
at a fractional coordinate just below the nominal integer grid height.
Starting a new regular-piece throw or entering water exits the filler path.

The existing eight-arena captures contain three independent complete launch
traces (pirate, jungle and park). eggo-measure-filler-art.py reuses those
captures without new emulation or writes and exports all seventy positions,
velocities and counters to the fixture, with parameters/hashes in
eggo-filler-art_2026-10-04_17-10-47_963181. The focused hop check compares
every frame in all three traces: positions agree within one original
fixed-point unit; velocities and counters agree. Seven other filler/dive/
throw checks pass. Other actor states, interrupted hops, water/attack
interactions and complete Survival parity are not established by these
neutral-input traces. Instruction inspection is recorded in
eggo-instructions_2026-10-04_17-09-33_310139 and
eggo-instructions_2026-10-04_17-11-34_673298.

Electron keyboard placement/filler integration still passes after the movement
change (eggo-mania-visual_2026-10-04T15-14-36-327Z). The seed-42 native-bag
integration places seventy regular pieces and reaches rescue at frame 11706,
with finite actor positions; its parameters, source hashes and trajectory
are in eggo-native-cpu-replay_2026-10-04T15-15-05-610Z. This checks continued
gameplay after filler changes, not native CPU decision-policy parity.

### Complete native floor-wave animation (2026-10-04)

Survival records consecutive wins rather than Solo's point/combo score.
Inspection of placement and floor completion did not establish a new Survival
point bonus. It instead exposed a concrete visual mismatch in the existing
collapse renderer: one wave picture remained visible throughout the long
countdown and a fitted sine bob moved it vertically.

0x0801a1b8..a330 advances the native highest-priority floor counter.
0x0801a208..a210 draws only when oldTimer&1023 is at most 31;
0x0801a26c..a284 selects phase 7-((oldTimer&1023)>>2), with two resource
entries per phase from ROM 0x083f1eac. Native objects are 64x32 at field
X=-8 and X=56. Their top is the affected cell top minus eight pixels.
The phase comes from the counter; no extra oscillation is present. When a
floor becomes complete at the oldTimer=32 cancellation check, its destructive
wave is suppressed. The existing exact counter/floor-copy algorithm is retained.
Instruction records are in eggo-instructions_2026-10-04_17-16-17_856033,
eggo-instructions_2026-10-04_17-16-38_022933 and
eggo-instructions_2026-10-04_17-17-45_779835.

An eighty-frame neutral-input continuation of collapse-onset-replay, with
no RAM writes, is saved in eggo-reference_2026-10-04_17-18-51_654025.
eggo-build-wave.py decodes the eight distinct OBJ textures from frames
28,32,36,40,44,48,52,56 and stitches their original clipped field portion.
It identifies every visible sample by its two sprite texture hashes,
preserving the intervening absence as null. Original OAM visibility begins
at frame 28 and ends at frame 59 for the next complete animation.
Stored timers are already decremented and OAM follows the preceding draw
call, so its observed phase uses two ticks earlier than current RAM.

The model records the old counter before each advance; the renderer uses
its preceding recorded draw state. This also preserves the final picture
after the timer entry has been deleted. The eight-phase atlas replaces the
single-pose asset. Its OBJ palette bank is byte-identical in every captured
arena. Fixture, inputs, hashes, individual PNGs and timeline CSV are saved
in eggo-destructive-wave_2026-10-04_17-26-46_657111.

The focused original-trace check reproduces all eighty visibility/phase
samples while independently advancing the live native floor queue, including
the preceding floor's tail and the next floor's long invisible countdown.
A completed-floor cancellation check also passes. The Electron phase strip
and gameplay screenshot are in eggo-mania-visual_2026-10-04T15-25-18-536Z;
all eight rendered pictures match the decoded original with zero differing
pixels, recorded in wave-pixel-comparison.json. This establishes those
textures and timing, not an exact whole-frame camera/OAM comparison or full
Survival feature parity.

### Native wobble meter (2026-10-04)

The earlier piecewise target picture did not reproduce the original pointer
motion. ROM 0x08014ecc..1502e integrates a 16.16 spring with Coulomb drag.
For each field in local coordinates, target=min(89,14+10*incompleteCount)<<16;
velocity+=(target-position)>>5. Velocities above 0xe14 lose 0xe14, velocities
below -0xe14 gain 0xe14, and all velocities inside that deadzone become zero.
Position then advances by velocity, clamped to [10,92]<<16. Initial position
and velocity are zero (the right field stores position plus 128<<16).
These constants are centralized in METER_VIEW; countdown also advances the
meter on the existing fixed simulation ticks.

0x08015040..15218 uses actor+0x82c for the incomplete count. Counts five,
six and above six select jitter shifts three, two and one; their four-phase
sequence is [-1,0,1,0]. Pointer Y is 148 plus jitter, bar Y is 152 plus jitter.
The flash masks for counts five, six, seven and above seven are 64,32,16,8.
The phase uses the draw call's frame, while visible OAM retains its preceding
pose. Normal bar resources are 0x080db058/0x080db458 and flashing resources
0x080da858/0x080dac58; pointer texture begins at 0x080db85c.

The existing eighty-frame ordinary-input floor-wave capture is reused;
no new emulation or RAM writes were needed. eggo-measure-meter.py verifies
all 1024 bytes of each native bar against those ROM resources, decodes the
palette, and records both fields' counters, velocities, positions, jitter
and flashing. Original initial RAM seeds the replay. Parameters, source
hashes, CSV and pictures are in eggo-meter_2026-10-04_17-42-21_190552.
The atlas retains all 32 sprite rows: upward jitter exposes a ninth visible
row that an eight-row crop would incorrectly lose.

The focused live-view replay matches integer positions and velocities and
all OAM poses in both fields for every one of the eighty captured frames.
Adjacent wave checks and focused countdown/camera integration checks pass.
Electron renders twelve independently selected field/frame meter crops in
eggo-mania-visual_2026-10-04T15-42-21-329Z. eggo-compare-meter.py independently
decodes the original OAM objects in priority order: all twelve crops have
zero differing pixels, recorded in meter-pixel-comparison.json. This proves
the observed native meter, not whole-frame or complete Survival parity.

### Native CPU horizontal steering and commit timer (2026-10-04)

The previous controller aimed at an exact tile centre with a fitted 0.16-cell
margin and placed immediately once its rotation finished. Original code uses
integer-pixel windows and two persistent opposite-direction latches instead.
At 0x08007dc4..7ef0 a grounded explicit pickup target is pursued beyond a
strict two-pixel margin. Without that branch, regular column steering issues
Right at integer X<=16*waypoint-12 and Left at X>=16*waypoint-4. Empty-handed
idle steering, when already in its target column without a pickup, uses its
separate stored target minus ten/six pixels. These original branches are
implemented in nativeSteeringKeys; live normal building-piece steering uses
its native column window. Pickup target selection and route/waypoint planning
remain provisional and do not yet use all of the original preceding policy.

0x080081fc..8274 filters Left when CPU+0xcc is nonzero and Right when +0xd0
is nonzero. An allowed Left sets +0xd0 to twenty; an allowed Right sets +0xcc
to twenty. Releasing a previously directional key sets both to fifteen.
The ordinary begin gate already decrements these counters. Early Use/dive
returns skip this final latch and preserve its preceding key state.
filterNativeDirection now applies this behavior to live CPU decisions.

0x0800797a..7dae advances the ordinary placement timer +0xfc only after
position, rotation and native placement-preview readiness. A zero timer is
initialized to 7+4*difficulty (31 on Hard) and returns without decrementing.
Subsequent eligible calls decrement it. At zero, odd native global frames
reset it to one and defer action; even frames request Use, clear +0xc8 and
set the squared decision wait. The word at 0x02011910+0x18c is the frame
counter 0x02011a9c, not an extra random draw. The single-cell kind-two,
rotation-one branch at its column roof requests dive instead, without that
Use wait/reset. NativePlacementGate transcribes these ordinary branches;
original special-item policy remains open. Live readiness checks use the
native actor row bias, column roof, preview and selected candidate anchor.
The input belongs to the upcoming simulation frame, before Tower.update
advances its frame counter.

Two Unicorn research tools execute these original segments from the same
captured frame-two-hundred RAM/IWRAM with every diagnostic write logged.
eggo-measure-cpu-steering.py records 77 target-window cases (all seven
columns, fractional boundaries, grounded/airborne pickup targeting and idle
bounds) and nine direction-latch cases. eggo-measure-cpu-placement.py records
32 timer, frame-parity and single-cell dive cases. All commands and mutated
timers agree with the JavaScript transcription. Parameters, ROM/RAM hashes,
JSON and CSV are in eggo-cpu-steering_2026-10-04_17-50-28_184979 and
eggo-cpu-placement_2026-10-04_17-54-39_813539. Instruction reads are recorded
in the 17-47-40, 17-47-51, 17-48-03, 17-48-31 and 17-48-39 instruction outputs.

Focused live tests preserve the individual 1/17/33 clockwise input cadence,
wait for the commit timer after orientation readiness, and descend into a
buried gap before placing there. Candidate/sweep/preview comparisons also
pass. The seed-42 native-bag/hazard integration reaches rescue at frame 15668
after eighty placements with finite coordinates; its parameters, source
hashes and trajectory are in eggo-native-cpu-replay_2026-10-04T15-57-12-266Z.
This is an integration check, not a full original CPU match replay. Exact
route traversal, empty-handed pickup policy, item/hazard decisions and
shared random-consumer order still prevent a full controller parity claim.

### Native CPU route traversal and ordinary movement (2026-10-04)

ROM 0x08005f48..6316 implements the bounded route search. It resets seven
reachability labels, marks the actor column zero, then scans both directions
against that column's height minus the permitted rise. Direct destinations
receive label one. Further scans from label-one and label-two columns mark
two and three and store parents without replacing earlier parents. The
selected waypoint is the target, its parent, or its parent's parent, so at
most three spans are considered. An unreachable search leaves the preceding
waypoint intact. Start==target returns before clearing old labels/parents.
Normal permitted rise is four rows, boots seven; the third search's scan
threshold remains the native constant four even with boots. Its equality
exception for opposite field ends still uses the caller's rise parameter.
These details are retained in nativeRoute, including original scan order.

0x08007abc..7dc4 supplies movement decisions before horizontal steering.
It compares the actor row with the inclusive route span, distinguishes
zero from nonzero native vertical velocity, updates the waypoint through
that search, and holds Up when traversed adjacent heights differ or rise
above the remembered grounded row. Failed regular routes request dive;
actors sufficiently below their column roof also receive the native dive
branch. Special/elevated early Use returns preserve the original parity
condition. Route labels, parents, waypoint and remembered ground row persist
across ordinary inventory changes. The loop's native break value and the
following increment are preserved, rather than treating that sentinel as
a boolean. createNativeTravel/advanceNativeTravel carry this original state.

Live building-piece decisions now use this ordinary route and Up/dive logic
instead of steering directly at the destination and independently inventing
floating input. Native placement deferral on an odd frame is distinguished
from ordinary waiting: it returns with no keys before travel/steering. Early
Use and commit-dive also skip the final direction latch; ordinary route-dive
continues through that latch. Custom non-native shapes retain their separate
fallback controller. Empty-handed target selection and special items still
need their original preceding policy and are outside this integration claim.

The instruction export is eggo-instructions_2026-10-04_17-58-39_855755.
eggo-measure-cpu-route.py records 144 direct original route calls and 129
travel calls with explicitly logged diagnostic inputs, including flat,
stair, valley, ridge and irregular towers, both rise parameters, airborne
states, intermediate waypoints and failed routes. All returned commands,
labels, parents, waypoints and jump-counter mutations match JavaScript.
Parameters, ROM/RAM hashes, JSON and CSV are in
eggo-cpu-route_2026-10-04_18-02-11_918670.

The full original policy oracle now also records its intermediate ordinary
travel input and output. eggo-measure-cpu-travel-replay.py reuses fifteen
ordinary-input saved checkpoints without RAM writes (only the already
established upcoming global frame is supplied to the isolated native call).
Five calls enter regular-piece travel on two actual tower profiles. All
travel commands and route memory match; all fifteen full original commands
still agree with their independently recorded next-frame commands. Logs,
source hashes and CSV are in eggo-cpu-travel-replay_2026-10-04_18-08-27_246879.
This checks real intermediate inputs but does not establish a full integrated
JavaScript CPU trajectory replay or all empty-handed/item branches.

Focused live tests confirm an intermediate waypoint and jump on a stepped
tower, the unchanged three-turn cadence, native commit timing and a buried-gap
dive/placement. The native-bag/hazards integration reaches rescue at frame
12698 after sixty-four placements with finite positions; parameters, events
and CSV are in eggo-native-cpu-replay_2026-10-04T16-06-43-879Z. Test entry is
`tests/eggo-cpu-route.test.mjs`. The remaining CPU differences are chiefly
empty-handed pickup targeting, unfinished sweep positioning, special-item
use, hazard avoidance and native shared random-consumer order.

### Native Survival empty-handed pickup targeting (2026-10-04)

The fitted nearest-crate metric is replaced in Survival by ROM
0x08006a14..6d58's ordinary selection. Inputs retain signed 16.16 native
actor and pickup coordinates. Horizontal distance is
abs(floor((actorX-itemX)/65536)+8), and vertical distance is
floor((actorY-itemY)/65536). Positive vertical distance means a pickup above
the actor; such a pickup is rejected if its Y/16 lies below its clamped
column's native roof. Distances below -8 are rejected. The accepted vertical
weight is dy+100, which must exceed dx+4 and be strictly below
(150-difficulty)*4. Candidate cost is that weight plus horizontal distance;
only a strictly lower cost replaces the choice. Native linked-list order
therefore decides ties. The native factory at 0x0800b5fc..b63c inserts each
new object's node at the active-list head via 0x080094cc..94f2; the model's
creation-order array is visited in reverse to preserve this ordering.

A chosen pickup sets target column to clamp(floor((itemX+8*65536)/2^20),0,6)
and retains itemX as the native idle steering target. If none is acceptable,
the target uses the highest roof, scanning columns 0,6,1,5,2,4,3 and keeping
the last equal-height match. Its idle target is (column*16-8)<<16, and the
extra-input counter is set to seventy. The captured GBA mapping for that
extra input (RAM 0x164) is zero; its countdown is retained but adds no button.
The stored target uses the preceding native empty-handed steering window,
not the ordinary carried-piece centre. The original near-pickup flag also
feeds the Up hold when already in its column and stationary/rising.

selectNativePickupTarget centralizes these thresholds. nativeEmptyControl
converts actual live pickups, applies selection, remembered ground row,
route/Up/dive decisions and horizontal steering; ordinary custom-mode fallback
remains separate. Solo/special-bonus and elevated filtering branches are
outside Survival mode five and are not substituted into this routine.
Preceding explicit enemy/projectile targeting and later hazard avoidance
are still incomplete, as is empty-handed orientation-request state.

The policy oracle now records its real empty-handed candidate list and both
its selected target and subsequent travel state. Two ordinary-input source
checkpoints (frames eighty and one hundred forty) enter this routine; their
full original returned commands agree with independently captured next-frame
inputs. Selection and empty-handed travel agree with the JavaScript routine
at both intermediate states. Sixteen direct original instruction probes,
with every diagnostic write logged, cover no-item fallback, unequal highest
roofs, strict vertical/horizontal boundaries, ties in both list orders,
under-roof rejection, field edges and fractional-pixel height differences.
All targets, chosen object IDs and extra-counter mutations agree.
Parameters, ROM/RAM/IWRAM hashes, JSON and CSV are retained in
eggo-cpu-pickup-targets_2026-10-04_18-24-17_133507. Source disassembly is in
18-11-17 and 18-11-29 instruction outputs; creation/list-order proof is in
20-44-08 and 20-44-14 instruction outputs. The initial five-checkpoint output
was exploratory; it is superseded by the two entered ordinary calls plus
sixteen boundary probes in this final fixture.

The focused live check targets a reachable pickup instead of a closer buried
one and uses the highest roof when no item remains. Pickup/travel/timing
checks pass; the existing no-hazard CPU rescue check also passes. The native
weighted-bag/hazard integration reaches rescue at frame 14951 after seventy-
nine placements with finite coordinates; parameters, events and CSV are in
eggo-native-cpu-replay_2026-10-04T16-24-18-149Z. This checks gameplay integration,
not a full native CPU trajectory or complete Survival parity. The remaining
controller work includes special tools, hazard/explicit enemy targeting,
unfinished sweep movement and shared random-consumer ordering.

### Survival special-item dispatch and placement (2026-10-04)

The native inventory period is decremented at ROM 0x08006d84..6da6 for
nonzero difficulty outside mode 7. Bomb kind 8 and filler kind 10 dispatch
before the ordinary expiry gate. Kinds 9/11/12 use the automatic gate;
nonzero period defers input on odd native frames, expired period reloads
(11-difficulty)*256. Use sets difficulty squared stall; only ordinary
pieces clear the continuous CPU clock. `NativeCpuTiming.inventoryGate`
implements this and replaces the ordinary-only live gate. Logged original
instruction execution in `eggo-measure-cpu-inventory.py` matches all 64
fixture cases. Source/output hashes and writes are preserved under
`eggo-cpu-inventory_2026-10-04_20-52-21_755091`.

Bomb targeting 0x08006db4..6ec0 scores enemy roofs, own roof low two bits,
neighbor height differences and horizontal distance, retaining strict
best-choice ties. The urgent fuse threshold is 105-difficulty*(column+6).
The persistent panic counter initializes to 3*difficulty+1 and only throws
on an even native frame after expiration. Original explicit threat target
and elevated-mode branches exist but are not yet supplied by the live
Survival threat controller. The ordinary bomb commit guard at 792a..7978
waits while fuse >= 12*difficulty+104+
((rotation*boardECC+(frame>>7))&31), absent an explicit target. Waiting
clears the commit counter rather than prematurely throwing the bomb.

Filler targeting 6ec8..6fd4 uses the original five-row hole scan, roof
height, neighboring holes, travel distance, and native frame term.
Empty first-field mirroring is preserved. The native placement timer at
797a sets filler wait to one, unlike the ordinary 4*difficulty+7 wait.
The live controller now navigates with these targets and bypasses regular
piece rotation/preview readiness for tools. Returned caught bombs retain
kind 8 metadata so they reenter the same policy.

`eggo-measure-cpu-tools.py` executes original targeting and fuse guard
segments against logged board/actor/timer inputs: 48 targeting/urgency
cases and 20 commit fuse boundaries. Final output:
`eggo-cpu-tools_2026-10-04_20-56-34_383811`. The placement oracle now also
includes 16 bomb/filler commit cases; final output:
`eggo-cpu-placement_2026-10-04_20-56-35_632092`. These are diagnostic native
instruction proofs, not an ordinary full-match controller replay.
`eggo-cpu-tools.test.mjs` compares these fixtures and checks the live
inventory consumption/wait boundaries. The native-bag/hazard integration
reaches rescue at frame 12872 with 68 placements and finite coordinates:
`eggo-native-cpu-replay_2026-10-04T18-55-49-929Z`. Threat avoidance, explicit
enemy/projectile targeting, unfinished sweep behavior and random-consumer
ordering still prevent a full Survival parity claim.

### Native enemy avoidance and persistent contact centers (2026-10-04)

ROM 0x08007ef0..819a applies avoidance only when
(nativeFrame & 511) > 50*difficulty. It scans four entity slots in original
order, requires allocated entity/own field/active contact flag, skips six
theft-only kinds when the actor is empty-handed, and skips type 15 while
its life exceeds 49. Horizontal approaching enemies within strict 80px /
40px bounds reverse the intended direction and can add Up. Departing
enemies instead cancel movement towards them. A narrow vertical approach
window uses velocity signs to choose an escape side; a near overhead
enemy adds Up when ascending or when the actor is descending. All these
rules and parameters are implemented in `nativeAvoidHazards`.

`eggo-measure-cpu-avoidance.py` executes that exact instruction segment on
119 logged boundary/type/parity/velocity/entity cases, matching JS keys.
Output: `eggo-cpu-avoidance_2026-10-04_21-01-02_183335`. This proves the
isolated decision segment, not an entire original-controller trajectory.

Entity +0x40/+0x44 contain persistent contact coordinates rather than
plain sprite origins. The new `native-hazards.js` adapter maps native
types and stage entities in primary-before-secondary order and updates
their contact buffers after world motion. Type 14/4 short jumps retain
old coordinates, type 7 only updates phases 4..7, type 16 only updates
after phase zero, and the bubble retains its buffer on spawn/release.
The original general contact block at 0x080134de..1355a skips actor states
1/7, field protection and sprite immunity; theft-only contacts follow
their separate block at 13184..133aa. Live protection is sampled before
enemy contact can itself change the actor's damage state.

The read-only contact extraction script records 242 active entity states
from existing native captures. Of the eligible states with nonzero stored
coordinates, 199 computed centers match to one fixed-point unit. Zero or
unchanged buffers cannot by themselves prove the preceding write timing:
one active rock has a zero buffer even with a currently eligible actor.
An input-only two-frame continuation from that exact state confirms the
buffer becomes its new X/Y on each following tick. Source:
`eggo-reference_2026-10-04_21-12-13_429038/cpu-rock-center`; no RAM writes.
Final extraction: `eggo-cpu-hit-centers_2026-10-04_21-14-30_394674`.
`eggo-cpu-avoidance.test.mjs` checks the instruction fixture, computed
centers, retained buffers, actual rock continuation and live reversal/Up.

This adds working enemy avoidance to the native CPU, but all contact
transition frames, explicit enemy/projectile targeting, shared RNG order
and whole-match policy trajectories remain unproven. It does not establish
full Survival or visual parity.

The final native-bag/hazard integration still reaches rescue at frame 14367
after 77 placements, maximum height 36 and finite coordinates. Parameters,
source hashes, placement events and CSV:
`eggo-native-cpu-replay_2026-10-04T19-15-22-913Z`. This is a functional native
implementation run, not a synchronized original-match replay.

### Incoming projectile targets (2026-10-04)

ROM 0x08006930..69f6 scans the opponent-owned seven projectile records,
stride 40, at board+0xf80. Active flag must be nonzero and the separate
flight/catch counter (+0xf9c) positive. It computes a column from integer
X+8 with signed truncation, subtracts eight columns for the right field,
and rejects integer(Y+5)/16 >= own roof. Explicit steering target is
projectile X-16px. Empty hands stop on the first qualifying slot and set
CPU state 2/destination. Held tools retain the last qualifying target.
Ordinary pieces are discarded when difficulty+4 <
((ownHeight[2]+opponentHeight[5])&15), with odd-frame deferral. These early
exits occur before inventory-period decrement, which the live controller
now preserves. Explicit targets enter bomb urgency/commit checks and
native grounded steering. Global projectile X is retained exactly as in
the original instruction path, rather than silently replacing it with
a different inferred local coordinate.

`eggo-measure-cpu-projectiles.py` executes this segment against 85 logged
cases covering both fields, counters, roof equality, inactive slots,
multiple projectiles, inventory types and parity. It also includes an
ordinary-input full-policy call: starting with the naturally caught bomb
checkpoint, inputs RIGHT for two frames, A for eight, then neutral for 78
frames. Captures 86/87 have no injected writes:
`eggo-reference_2026-10-04_21-24-14_276478/cpu-incoming-bomb`.
The isolated full native policy returns 80, identical to captured next
keys, and records the same explicit target:
`eggo-cpu-policy_2026-10-04_21-24-49_998655`. Final fixture/research output:
`eggo-cpu-projectiles_2026-10-04_21-25-44_797154`.

Native initialization at 0x0800437c stores flight counter -1. First bomb
contact at 0x080047d8 stores 250 independently of the fuse; 469e..46a4
decrements positive counter on subsequent updates without restarting it
on rebounds. The existing input-only bomb-right-expiry samples confirm
-1 through initial flight, 248 at frame 80 after landing, and one decrement
per tick afterwards. The model now records that separate counter and
assigns/reuses original-order free projectile slots for CPU scanning.
Player physical catching is a separate native contact block at 47ea..4876
and is not restricted by the CPU's positive-counter planning condition.
Native seven-slot saturation remains to be reconciled with model behavior.

`eggo-cpu-projectiles.test.mjs` compares native fixture decisions and
checks live early discard/defer, incoming-target priority, slot reuse and
first-landing counter behavior. Native-bag/hazard integration still
reaches rescue at frame 14367 after 77 placements:
`eggo-native-cpu-replay_2026-10-04T19-25-47-156Z`. This proves these changes
work together; it does not prove a synchronized native match. Remaining
fidelity work includes shared RNG order, unfinished search movement,
contact phase transitions, roster/UI progression, broader whole-frame
comparison and complete audio/result presentation.

### Survival field RNG order at simultaneous enemy and pickup updates (2026-10-05)

A 2,400-frame input-only Survival capture exposed a concrete per-field stream
ordering mismatch. At trace frame 1284 (native frame 1847), the left factory
robot is active and the pickup timer reaches zero. Its field RNG changes
from 9850 to 14505, exactly five native draws. The new pickup is kind 0,
orientation 3, its same-tick fixed-point X is 3,528,395, VX is -10,549, and
the next-spawn clock is 56. The draw sequence is: robot motion first
(17,842), then pickup VX (27,409), bag choice (24,027), orientation
(32,525), and clock (14,505). This independently matches the object's
observed kind/orientation, one-frame motion and clock, establishing the
native order rather than inferring it from code layout.

`Tower.update` previously generated and advanced the pickup before updating
the factory secondary enemy. It now reserves the active factory/castle
secondary's field-RNG draw before pickup generation, then uses that saved
draw for enemy motion while leaving the final stream state after all five
draws. A regression check replays this exact RAM state and compares the
captured item type, orientation, fixed-point motion, clock and final RNG.
The native trace and full parameters are preserved in
`scripts/OUTPUT/eggo-reference_2026-10-05_02-21-50_668499`; transition
analysis is in its `rng-analysis` subfolder. This fixes one verified
interleaving only: other per-field RNG consumers and broader synchronized
Survival RNG ordering remain open.

The third observed word at 0x02011aac advances by zero, one or two steps per
frame in that capture (725, 1,468 and 206 transitions respectively). Its
update routine was not yet identified in this first pass; the follow-up
section below maps it to the ROM's separate global RNG helper. The updated
analyzer reports correlations separately for all three words.

### Mapping the two Survival field RNG streams (2026-10-05)

ROM helpers 0x08009380 and 0x080093a4 both call the native 16-bit step at
0x08009338. The first updates word 0x02011ab0; the second updates
0x02011ab4. In the captured field update path at 0x0800b572..0x0800b588, the
game reads the field object's +0x1374 selector: zero chooses helper 0x9380,
nonzero chooses 0x93a4. The pickup-manager roots resolve to field objects
0x0200333c and 0x020046b8; their selectors are respectively zero and one.
This confirms two independent per-field streams, rather than one stream
shared between both boards. The static caller scan found six direct BL sites
for 0x9380 and five for 0x93a4; the repeatable scans are saved under
`scripts/OUTPUT/eggo-rng-callers_2026-10-05_03-14-03_212927` and
`scripts/OUTPUT/eggo-rng-callers_2026-10-05_03-38-20_201183`. The captured
secondary-enemy perturbation calls 0x93a4 at 0x08012924.

At trace frame 1283, the first field's stream moves 1879 to 9850 while the
second stays at 63328; the active type-2 enemy belongs to the first field.
At frame 1284, the first stream then advances five draws (9850 to 14505) for
that enemy and its pickup spawn, while the second remains unchanged. Both
streams start at 3118 in the measured hard-idle state. The captured RAM and
screenshots are in
`scripts/OUTPUT/eggo-reference_2026-10-05_03-19-19_302955`; the full 2,400-frame
analysis is in the earlier capture's `rng-analysis` folder. A fresh 1,284-frame
trace records the selector mapping on every frame and shows the corresponding
per-field enemy/pickup correlations in
`scripts/OUTPUT/eggo-reference_2026-10-05_03-35-27_151745/rng-analysis`.
This validates the model's one-seed-per-Tower structure for this Survival
field layout. The stream initialization on later rounds and other modes still
needs native transition evidence.

### Global Survival RNG helper and call sites (2026-10-05)

The changing word at 0x02011aac is not an unexplained third field stream.
ROM 0x0800935c reads and writes 0x02011910+0x19c, advances it through the
same 0x08009338 16-bit recurrence as both field streams, and returns the
updated value. The adjacent wrappers 0x08009380 and 0x080093a4 use offsets
0x1a0 and 0x1a4 for the per-field streams. This identifies three distinct
seeds and one shared step function.

A direct Thumb-call scan finds sixteen callers of 0x0800935c at
0x080006a0, 0x080016b4, 0x08001864, 0x0800194c, 0x08002222, 0x080022a8,
0x080022b4, 0x0800b21c, 0x0800d230, 0x0800ed50, 0x08015ef0, 0x08015f14,
0x08018d32, 0x08018d48, 0x08018d56 and 0x08018d62. The trace already proves
global-seed draws feed initial stage selection and later Survival
configuration. The full call-site effects and their ordering against
per-field draws still need to be mapped before the game can replay all random
Survival events deterministically. The ROM hash and verified call contexts
are recorded in
`scripts/OUTPUT/eggo-rng-callers_2026-10-05_06-02-07_295017`.

### Survival input-bot run limits and valid entry state (2026-10-05)

The screen saved as `tests/artifacts/eggo-reference/survival-hard.png` is the
difficulty-selection menu with HARD highlighted, not an active Survival
round. The separate `hard-origin` checkpoint is in active Hard gameplay. A
1,200-frame input-only preflight from that state records 73 board changes and
valid nonzero round configuration; `survival-hard.state` and a fresh ROM boot
remain on menus when driven by the gameplay-only research bot. The reference
runner now rejects `--bot` when the Survival configuration table is all zero,
so a long run cannot silently spend time in a menu again.

Two 14,000-frame input-only attempts from the valid `hard-origin.state` were
also captured. The placement-oriented bot reaches a Game Over screen by its
frame-4,800 screenshot; its last board changes are around frame 3,985. The
fixed-column stacking variant loses its player board by frame 2,756 and is
also at Game Over in its frame-4,800 screenshot, while the other field still
contains 72 cells and six complete floors. Both traces keep the initial Hard
configuration and factory arena through frame 14,000, so neither reaches a
new-round transition. These outcomes describe the research bot's failure to
win against the original game; they do not establish a defect or timing rule
in native Survival. Complete-match and later-round behavior remain open.
Parameters, screenshots, states, RAM, per-frame traces and board events are
saved under `scripts/OUTPUT/eggo-reference_2026-10-05_03-50-07_767558` and
`scripts/OUTPUT/eggo-reference_2026-10-05_03-52-39_622090`; the valid short
preflight is under `scripts/OUTPUT/eggo-reference_2026-10-05_03-49-37_307687`.

### Native CPU input mask as an input-only control source (2026-10-05)

The native CPU's emitted GBA key mask is at RAM offset 0x0200e9a8. Its bits
match KEYINPUT: A=0x001, B=0x002, Select=0x004, Start=0x008, Right=0x010,
Left=0x020, Up=0x040, Down=0x080, R=0x100 and L=0x200. `mirror-cpu` in the
input-only reference bot reads that word and submits the corresponding
libretro buttons to port zero; it never writes the game's RAM. For a
1,200-frame continuation from `hard-origin.state`, all 1,199 comparable
player inputs exactly equal the preceding frame's CPU mask, establishing a
one-frame input handoff in this harness.

This is only a control-mask validation, not a successful player policy. At
frame 1,200 the player field has 15 occupied cells and its actor is at Y=776,
while the native CPU field has 38 cells and its actor is at Y=609. The CPU's
decisions target its own field, so replaying them into the player field does
not provide the missing player-side controller or yield a valid round
transition. The complete parameters, input trace, checkpoints and board
events are in `scripts/OUTPUT/eggo-reference_2026-10-05_04-08-36_214002`.


### Live Survival controller bridge and pickup coordinate units (2026-10-05)

`scripts/eggo-reference-model-bot.mjs` accepts one 256 KiB live RAM image per
frame and evaluates the reconstructed Survival CPU controller in either
`model-player` or `shadow-cpu` mode. It reads both field boards, actors, held
items, linked pickups, current hazards and the native controller's timing,
route and search state. It returns a GBA key mask to the research runner; it
never writes native RAM. The Python runner records model predictions and
shadow comparisons in its normal timestamped `scripts/OUTPUT` experiment
folder.

Pickup linked-list positions and velocities are signed 16.16 pixel values,
while `Tower.nativeMotion` consumes pixel floats. Converting those fields once
at the bridge boundary restored pickup target selection. In an isolated replay
sample, the model selects the same column-five crate and Left+Up key mask as
the ROM. The native list is newest-first, while the model's crate array is
creation-order, so the bridge reverses the imported list to preserve the ROM's
reverse traversal.

A 1,200-frame Hard-origin shadow run matched 1,162 of 1,199 lag-aligned key
masks (96.9%). The remaining mismatches cluster around held-item transitions,
short rotation/use gates and the native piece-candidate sweep. This is a
per-frame differential with native controller state copied from observed RAM
each frame; it is not a fully autonomous replay of the native CPU's internal
state. A `model-player` run over the same duration drove the player's actual
field and reached 29 cells / 3 clears, versus the native rival's 38 cells / 3
clears. That verifies the bridge and key mapping, not parity or a round win.

A trial that steered toward the best-so-far candidate during the native sweep
reduced agreement, so it was discarded; product controller code remains
unchanged. The measured traces are in
`scripts/OUTPUT/eggo-reference_2026-10-05_04-42-29_666820` and
`scripts/OUTPUT/eggo-reference_2026-10-05_04-47-23_213240`. The focused pickup
RAM/state sample is in
`scripts/OUTPUT/eggo-reference_2026-10-05_04-40-07_072243`.

### Sweep, filler commit and late rotation parity (2026-10-05)

The previous sweep description missed an ordering detail in the ROM. At
0x08007798..0x08007818, the native routine checks columns in the order
3, 4, 5, 6, 0, 1, 2, skips every column not tied for the highest stack, and
only then compares the actor's column with the first matching column. While
moving, helpers 0x08008238 and 0x08008248 OR Left/Right into the shared default
mask at 0x0200014c (0x40 in the captured active Survival state). If the actor
already occupies the selected column, the routine returns without that
direction mask. The live model now follows this early-return path directly;
it no longer runs route or jump planning during an incomplete sweep.

The filler action has its own aligned-column branch at 0x08007834..0x0800789c.
Once actor and target columns agree, odd native frames defer with no steering;
even frames emit Use, reset the CPU clock and start the difficulty-squared
cooldown. This does not pass through the ordinary placement counter. The model
now follows that branch, avoiding the spurious extra horizontal command at the
target.

After hazard processing, 0x0800819a compares the actor orientation with the
stored CPU target at +0xb8. When they differ, the native rotation gate emits
the configured B mask and waits fifteen frames, including while the actor has
no held piece. The bridge now imports both the actor orientation and target
orientation, and live control preserves this final rotation step.

The resulting instruction-aligned shadow comparison matches all 1,199 of
1,199 lag-aligned masks over the 1,200-frame Hard-origin continuation. The same
run's same-frame comparison is 1,098/1,200 because native input is handed off
one frame later; it is not the parity metric. The focused CPU sweep, tools,
timing and rotation checks pass (21 tests). The full run's parameters, masks,
RAM trace, screenshots and native checkpoints are in
`scripts/OUTPUT/eggo-reference_2026-10-05_05-54-07_663254`.

This proves controller-output parity on that captured 1,200-frame Survival
state sequence, while the bridge imports the native state each frame. It does
not yet prove an independent end-to-end replay across new seeds, later-round
transitions, or every arena/hazard combination.

### Open-loop Survival controller ordering correction (2026-10-05)

The 110-frame Hard-origin comparison initially matched 106 of 109 lag-aligned
CPU masks and appeared to show a one-frame-early kind-2 pickup. Rechecking the
ROM frame order against `Game.updateCPU` showed the comparison bridge was
reordering work: it advanced actor motion and pickup contact before asking the
model CPU for its next command. In the game loop, the CPU chooses its command
first, then its actor and pickup manager advance. The bridge now follows that
order and imports the native actor, board, pickup and CPU-controller state
before each decision, keeping this test focused on policy rather than drift in
the model's independent physics integration.

The JSONL trace also now reads the actual native CPU key word at 0x0200e9a8;
the earlier `brain+0xe8` value is retained separately as `brainKeyState` and is
not the CPU input mask. Replaying the same 110-frame Hard-origin sequence now
matches all 109 lag-aligned CPU masks. At the pickup transition, both sides
retain Right+Up for the frame in which kind 2 is caught, then switch to the
same next command on the following native update. This resolves the apparent
contact-boundary discrepancy without changing the already ROM-verified strict
12-pixel pickup rule.

The updated source, native trace and reproducible replay are in
`scripts/eggo-reference-model-bot.mjs` and
`scripts/OUTPUT/eggo-reference_2026-10-05_07-03-40_322996`. This is a focused
controller-order result on one checkpoint; it does not prove whole-match CPU
parity, full Survival parity, later-round transitions, or every arena and
hazard combination.

### Held-player idle pose cadence (2026-10-05)

The old renderer advanced the held player's two idle images every four
simulation ticks. An every-frame native capture from `hard-idle` instead shows
only those same two Yolko images and changes between them roughly once per
second: the repeated observed runs are 57–70 frames, averaging about 64.
`actorPose` now uses a measured 64-tick cadence for held idle while retaining
the four-tick cadence for movement, jump/fall and throw poses. This fixes the
obvious over-animation without changing pose art or physics. The run also
showed that the idle-free flag appears intermittently, so it was not used to
fit empty-hand timing; that state remains unchanged pending a stable native
capture. The measured period is an observed average, not yet a disassembled
timer or phase match.

The every-frame source capture is
`scripts/OUTPUT/eggo-reference_2026-10-05_07-09-22_063990/player-poses/poses.json`;
the code change is in `renderer/games/eggo-mania/view.js`. The separate
empty-hand attempt at `scripts/OUTPUT/eggo-reference_2026-10-05_07-24-00_007771`
was interrupted by native pickup/held-object changes and is inconclusive.

### Stateful Hard controller trace through the result transition (2026-10-05)

The first autonomous 1,200-frame controller pass exposed one missed native
side effect. When the sweep accepts its first candidate from the `-9999`
sentinel, 0x0800705e..0x080070aa writes `(difficulty*difficulty)>>1` to CPU
`+0x104`; at Hard this is an 18-frame wait. Later score improvements bypass
that write. The model now arms this delay only on the sentinel transition.
The sweep branch also marks native motion as fully handled, so the general
held-piece fallback cannot add an extra Up input when the sweep asks for no
movement.

The longer 12,000-frame comparison then exposed two reference-bridge gaps:
the CPU actor's boots timer at RAM `0x587c` had been forced to zero, and the
bridge kept querying the controller after the ROM left gameplay state zero
for result state two. The bridge now imports the per-field boots timer in
frames and stops policy evaluation when the result screen begins. At the
observed state transition, the ROM correctly emits no further CPU input.

With those corrections, the stateful Hard controller's predicted key masks
match all 11,999 of 11,999 one-frame-lag-aligned native masks over the full
12,000-frame replay. Same-frame masks match 11,852/12,000; the one-frame input
handoff explains the difference. The native match reaches result state at
about frame 1,883, so most remaining captured frames verify the post-round
zero-input gate. The active trace, model outputs and source parameters are in
`scripts/OUTPUT/eggo-reference_2026-10-05_08-21-03_711826`.

This is exact CPU key-output parity on one Hard-origin native trajectory. The
bridge still imports the original board, actor, pickup and hazard state every
frame; this does not yet prove a fully autonomous simulation, later-round
replay, or parity for every stage and tool interaction.

### Later-round CPU difficulty and held-piece transitions (2026-10-05)

The saved round-3 and round-9 Survival checkpoints showed that the opponent's
runtime difficulty is not fixed at the Hard default: the native controller
field at RAM `0x02005b30` (`cpu+0xf0`) is 5 in round 3 and 1 in round 9. The
controller previously used 6 for candidate scoring, tool decisions, pickup
selection, placement timing, hazard avoidance and action delays. The bridge
now imports that field every frame, and those policy routines accept its live
value. This explains the round-3 candidate-score mismatch and keeps the later
rounds on the ROM's actual difficulty schedule.

The open-loop bridge also now restores the held item's native cells and
orientation from RAM on every snapshot while keeping the same JS object when
the native piece is unchanged. That prevents its local diagnostic tower from
leaving a consumed or rotated piece in the CPU model after the ROM still
reports it held. Empty-hand entry waits one model tick only when the native
piece search was already in state 2; later Hard-idle evidence narrowed that
wait to the actor-4-to-actor-0 throw transition only. When the actor is already
in state 0, empty-hand pickup steering begins immediately; state-1 sweeps keep
emitting their in-progress motion.

Native-state-imported open-loop traces now match 597/599 lag-aligned masks on
the round-3 checkpoint and 599/599 on the round-9 checkpoint over 600 frames.
The final round-9 trace is in
`scripts/OUTPUT/eggo-reference_2026-10-05_08-45-00_298214`. These measurements
include live RAM imports each frame and therefore validate policy decisions
against those captured trajectories, not an independent full-game replay.

The separate stateful tests, which import the board and actor but let the model
controller retain its own state, reach 571/599 on round 3 and 542/599 on round
9. Their remaining differences cluster around placement-use timing and later
route/empty-hand transitions. Full Survival reconstruction is still in
progress: these traces establish round-specific CPU behavior but do not yet
establish autonomous parity across an entire multi-round match, every arena,
or all item and hazard combinations.

### Placement timing and actor throw-state gates (2026-10-05)

A frame-by-frame RAM probe corrected a misleading grounded-only placement
gate. On the round-9 checkpoint, the native `+0xfc` commit counter starts at
11 while the actor is still airborne and its native projected landing matches
the selected candidate. It counts down to zero and the ROM emits Use on the
next eligible frame. The projected landing is therefore part of readiness;
being on the roof is not required. A grounded-only experiment fell to 478/599
lag-aligned masks and was discarded.

After Use, actor state `+0x874` becomes 4 for the throw animation. The preview
and selected candidate can remain unchanged during that animation, but the ROM
does not start another placement timer. The CPU controller also freezes its
rolling candidate cursor while the actor remains in state 4. `+0x878` records
the next actor state: when state 4 is about to transition to state 0, movement
control can resume for the transition frame, while the candidate cursor stays
frozen until the actor is actually in state 0. The stateful bridge now imports
these actor-state fields and follows those separate gates.

The ROM also updates controller target rotation `+0xb8` whenever the rolling
search finds a strictly better candidate, before all 28 candidates have been
scanned. The model previously waited for a complete sweep to update that
target. It now updates the target from each strict score improvement, matching
the RAM trace and the native rotation command cadence.

With these gates, stateful round-3 and round-9 checkpoint comparisons each
match 599/599 one-frame-lag-aligned key masks over 600 frames. Same-frame masks
match 540/600 on round 3 and 537/600 on round 9; these counts include the
ROM's one-frame input handoff. The traces are in
`scripts/OUTPUT/eggo-reference_2026-10-05_09-34-51_633681` and
`scripts/OUTPUT/eggo-reference_2026-10-05_09-35-16_347818`. These stateful
comparisons still import the native board, actor and live field state every
frame. They validate CPU key decisions on two captured Survival trajectories;
they are not yet a standalone full-match replay or complete decompilation of
every Survival subsystem.

### Empty-hand entry and direction latch (2026-10-05)

A longer 1,800-frame Hard-idle stateful replay exposed a false one-frame wait
when a completed piece search changed from holding a piece to empty hands. The
native controller had already begun steering toward the newly selected pickup;
the blanket wait made the model re-evaluate after that pickup crossed the
vertical-selection boundary. Its target then changed a frame too late, so the
model's direction latch and the ROM's 20-frame reversal counter started from
opposite directions. The pickup coordinates themselves matched the ROM.

The wait is now limited to the measured actor-state-4 to actor-state-0 throw
transition. Empty-hand entry at actor state 0 begins pickup steering
immediately. The same stateful comparison now matches 1,799/1,799
lag-aligned masks on the Hard-idle trace, 599/599 on the round-3 checkpoint,
and 599/599 on round 9. Same-state matches are 1,664/1,800, 540/600 and
537/600 respectively; those comparisons include the ROM's one-frame input
handoff. Replays are in
`scripts/OUTPUT/eggo-reference_2026-10-05_11-23-31_134400`,
`scripts/OUTPUT/eggo-reference_2026-10-05_11-23-38_145376`, and
`scripts/OUTPUT/eggo-reference_2026-10-05_11-23-41_204298`. These are
checkpoint trajectory checks, not evidence of complete multi-round parity.

### Global RNG use by the player actor (2026-10-05)

An in-memory Thumb-call tracer wrapped all 16 statically identified direct
callers of the global RNG helper. On a 600-frame no-input Hard Survival
checkpoint, the only active call site was `0x0800ED50`. The helper ran 680
times: the player actor at `0x02003BD4` called it once in each frame, and the
CPU actor at `0x02004F50` called it in 80 frames. The modified-ROM replay kept
the global seed identical to the unmodified replay on all 600 frames, changed
no emulated RAM outside the reserved diagnostic block, and produced the same
screenshot.

The actor dispatch at `0x0800EAA6..0x0800EAAE` uses the actor's animation
selector at `+0x854` to choose a handler from the table at `0x0800EAC0`. The
`0x0800ED50` handler is selected when that selector is 2. Its first operations
store `random >> 5` at `+0x860`, add it to the phase accumulator at `+0x85C`,
and wrap the accumulator against the actor's `+0x848` period in 16.16 form;
the resulting phase selects an animation table entry. The CPU actor's selector
was 2 on all 80 frames with two calls. On the other 520 frames it was 1, 4, 5,
or 8 and did not call this handler. This identifies the extra draws as the
CPU actor entering the same randomized animation substate, rather than a
second player call. Most of the multi-frame call windows coincide with the
rival's idle or idle-free pose; a few single-frame calls occur around motion
or pose transitions. This draw order is part of the shared RNG timeline and
will shift later Survival choices if omitted.

The runner now records the previous and current actor pointer, actor words
`+0x840..+0x87C`, and AI state. Data are in
`scripts/OUTPUT/eggo-reference_2026-10-05_10-27-09_084910` and
`scripts/OUTPUT/eggo-reference_2026-10-05_10-25-03_891533`; code inspection is
in `scripts/OUTPUT/eggo-instructions_2026-10-05_10-13-01_096230`. This maps
the player and CPU animation draws for one Hard Survival trajectory. Other
global RNG callers, different stages and transitions, and an autonomous
multi-round replay remain to be reconstructed.

### Player idle animation phase (2026-10-05)

A second native capture recorded the player sprite and actor phase every frame
for 600 frames from `hard-idle.state`. The sprite alternates between two
images. After the initial loaded phase, the rendered image matches
`(actor[0x85c] >> 16) & 1` exactly for all 594 compared frames when the phase
is read two frames before the OAM image. With no delay, 18 of those frames
differ, all in the two-frame windows around pose transitions. The measured
intervals vary around 64 frames because the phase increment is `globalRandom
>> 5`, rather than a fixed timer.

A separate 780-frame input trace exercised jump, directional, and action
buttons. All 16 statically identified global-RNG direct-call sites were
instrumented; `0x0800ED50` was the only active site, and it was called 482
times. The other 15 sites remained unused in that Survival trace. The call
still belongs to the actor animation dispatcher, not board, pickup, hazard,
or CPU candidate scoring. Traces and per-frame decoded sprites are in
`scripts/OUTPUT/eggo-reference_2026-10-05_10-34-28_934016` and
`scripts/OUTPUT/eggo-reference_2026-10-05_10-37-55_047849`.

The live view now advances the same 16-bit native random step for grounded
idle actors, adds its high bits to a two-frame phase, and delays the displayed
pose by the measured two frames. Its initial global seed is derived from the
WW game seed so the recreation stays repeatable; the ROM's true startup seed
and selector behavior during motion transitions are still open. This is a
measured animation reconstruction, not a claim that all Survival RNG or
multi-round behavior is complete.

The next-round checkpoint `round3.state` initially rejected the tracer because
its default `0x02031880` block was occupied. Its captured 256 KiB EWRAM image
shows `0x02031908..0x020319c7` is zero, so the 720-frame census was rerun there
without changing the saved state or ROM. In this later arena, only site
`0x0800ED50` was active: 704 calls came from the player actor at
`0x02003BD4`, and 67 from the CPU actor at `0x02004F50`; the CPU call followed
the player's call in each of its 67 two-call frames. A matched uninstrumented
720-frame replay has identical framebuffer pixels and identical EWRAM outside
that 192-byte diagnostic block. The original and control runs, including full
frame traces and hashes, are in
`scripts/OUTPUT/eggo-reference_2026-10-05_21-47-58_039832/` and
`scripts/OUTPUT/eggo-reference_2026-10-05_21-50-32_171044/`. This adds evidence
for actor RNG in a later round; round transitions, hardware seed recovery and
the complete multi-round random schedule remain open.

### Survival waterline initialization and rise from the round table (2026-10-05)

The per-field waterline is stored at `0x02003BB8` for the left field and
`0x02004F34` for the right field. Eight native Hard Survival round-start RAM
snapshots have table height 47 and waterline 760 pixels. The round-3 checkpoint
also has height 47 and waterline 760. The round-9 checkpoint has height 43 and
waterline 696. These independent values establish the initial rule
`waterlineY = 16 * roundHeight + 8` native pixels. `Tower` now converts that
screen-space line into its board-relative water coordinate from the native
round configuration, so later Survival rounds no longer start with the first
round's baseline. A focused regression checks round 3 and round 9.

The rise timer and speed come from the same round-table word, index 15. ROM
code at `0x080020B6..0x080020D0` sets its threshold to
`max(1100, 1900 - 40 * word15)`. At native frame equal to the threshold the
line is unchanged; the first movement is on the following frame. The eight
independent Hard round snapshots contain this computed threshold in RAM at
`0x02000078`, including the 1100-frame minimum for round 3. Runtime code uses
the signed 16.16 value at `0x02005A3C`; the table relationship is
`-(0x8000 + 0x2000 * word15)`, and each tick applies its arithmetic shift by
six as the waterline's 16.16-pixel displacement. Both equations match all
eight captured configurations.

No-input continuation traces verify the actual motion at three configurations.
Round 1 (`word15=9`) begins at frame 1541 with `-0.025390625 px/frame`; at
frame 1763 the line is `754.337890625`. Round 3 (`word15=24`) starts at frame
1101 at `-0.0546875 px/frame`, then snaps to y=736 at frame 1521. Round 9
(`word15=5`, height 43) starts at frame 1701 at `-0.017578125 px/frame`, then
snaps to y=672 at frame 3009. Those final values equal
`16 * height - 16`; the snap happens when the next fixed-point step would put
the line within one pixel of that endpoint. `nativeWaterlineAtFrame` reproduces
the fixed-point trajectory and endpoint rule without accumulating floating
point error. The game model converts that line into the board coordinate used
by actors, erosion and hazards, while the optional extra-rise setting remains
an additional user-controlled motion.

The earlier `water-rise-threshold` capture included a bot and is not used as an
idle measurement. The corrected no-input traces and exact RAM checkpoints are
recorded in `tests/fixtures/eggo-survival-config-gba.json` and timestamped
folders under `scripts/OUTPUT/eggo-reference_*`; the extraction run and its
parameters are under `scripts/OUTPUT/eggo-survival-config_*`.

### Later-cycle Survival starting tower (2026-10-05)

The clean `win8.state` → round-9 replay (`A` for 8 frames, then 420 neutral
frames) initializes a nonempty tower on both sides. The final native state
matches the independently saved `round9.state` board bytes and screenshot
exactly. The player side has four complete rows (28 occupied cells); the rival
has the same four complete rows plus one cell in a fifth row (29 cells total).
The raw 47×7 board values and capture layout are preserved in
`tests/fixtures/eggo-survival-config-gba.json`.

Disassembly of `0x080053e4..0x08005b98` explains this board. The routine clears
both 47×7 fields, then runs one construction pass per side. Field 0 starts at
RAM row `height`; field 1 distributes its extra starting height across columns
using `d = max(0, roundCounter + 8 * opponentCount - 24)`. In the captured
two-field Survival game, `opponentCount` is 2, so round 9 has `d = 1`. For each
field-1 column the start row is `height - floor((d + 6) / 7)`; the counter is
decremented only when that column starts above the configured height. Both
passes then proceed toward RAM row 46.

The helper at `0x080052b4` chooses the vertical piece length from the column
and RAM row: `s = (column + row) * (1 + column * row)`. If `(s & 6) == 0`, or
the next RAM row is occupied, it uses the single-cell kind 2. Otherwise, if
the row two cells ahead is occupied, it uses the two-cell kind 4; if not, odd
`s` selects the three-cell kind 1 and even `s` selects kind 4. The row-47
boundary is nonzero in native RAM, so pieces clip at the visible floor exactly
as in the reference. These kind IDs match the extracted original placement
masks, and `nativeInitialTowerPieces` converts their top-down RAM coordinates
into the model's bottom-up tower coordinates and cell artwork.

The implementation reproduces the entire 47×7 owner-group pattern for both
round-nine fields after normalizing IDs. The ROM allocates those IDs globally,
so their numeric starting values differ between otherwise identical clean and
continued states; the grouping and occupied cells remain identical. A
controlled round-nine probe that changes only the height word from 43 to 45
before initialization produces 14 player cells and 15 rival cells, matching
the same formula. A second controlled probe changes the round counter to 15
while retaining height 43 (`d = 7`): field 0 remains at 28 cells and field 1
has five full rows (35 cells), one additional row in each column. The formula
matches the occupancy bits across all 658 cells in that replay. Its input
state, write and output are in
`scripts/OUTPUT/eggo-reference_2026-10-05_13-17-05_345502/`. The first eight
Hard Survival table entries have height 47 and therefore produce empty
starting fields.

The model treats the full rows already present at round start as existing
terrain and does not award their line score retroactively. Native score/line
bookkeeping after the first placement on these seeded rows remains to be
compared against an input-only round-nine replay.

The read-only in-memory caller trace records 640 calls each at ROM call sites
`0x08018D48` and `0x08018D56`, in two 320-step passes. Those calls align with
the already measured pickup-pool prefill and are not evidence for how the
starting tower is generated. The new `--rng-counter-address` option placed
counters in an all-zero EWRAM block at `0x02031908`; the runner refuses a
nonzero block and does not patch the ROM file. At the end, every RAM byte
outside that trace block and the screenshot matched the uninstrumented replay.

### Survival round-start RNG streams (2026-10-05)

Caller-counted mGBA replays isolate round setup from the continuing pickup
stream. On the round-7-to-8 transition, sites `0x0800194c` and `0x08002222`
each call the global RNG once. The global state advances from 48442 to 48865;
both field-local streams are then initialized to 48865. The Hard round-8 table
entry itself consumes no further selection draws. On the round-8-to-9
transition, those same two setup calls advance global state 18525 to 64756,
which is copied into both field streams. Then `0x080022a8` and `0x080022b4`
each draw once for difficulty and level; the global state ends at 63315, and
the resulting Normal/level-2 entry matches all 19 words in the round-9 RAM
capture. This directly confirms the ordering that was previously inferred
from the table values alone.

`nativeSurvivalRoundStart` now models those two setup draws, returns the field
seed separately, and lets the later table selection advance the shared global
state. `resetSurvival` consumes the initial arena-selection draw before the
first round; `Tower` seeds each native field stream from the round-start
snapshot instead of the unrelated local-game seed. A targeted regression
checks the captured round-8 and round-9 values and the live `Game.startRound`
path. The paired caller traces are in
`scripts/OUTPUT/eggo-reference_2026-10-05_13-27-07_650874/` and
`scripts/OUTPUT/eggo-reference_2026-10-05_13-28-26_984797/`; the instrumented
scratch range starts at `0x02031908` and was zero in both source states.

This closes only round initialization ordering. It does not yet reproduce the
hardware-derived initial seed or all global RNG callers throughout a complete
match, so later-cycle CPU, actor selection and pickup parity remain incomplete.

### Hard Survival CPU decisions against live native state (2026-10-05)

A 360-frame `shadow-cpu` replay from
`tests/artifacts/eggo-reference/hard-idle.state` compares each reconstructed
CPU decision with the original while synchronizing the model from that frame's
native RAM. The first prediction has no prior model output to compare; on the
remaining 359 frames, the previous model key mask equals the ROM's currently
emitted CPU mask in all 359 cases. The model and ROM masks differ in 32
same-frame comparisons, but each is the one-frame input handoff: the model's
prediction appears in the ROM key word on the next frame. The lag-aligned
count, rather than same-frame equality, is the relevant controller-policy
result.

The trace, exact loaded-state hash, ROM/core hashes, and native CPU RAM words
are in `scripts/OUTPUT/eggo-reference_2026-10-05_13-48-11_753871`. It verifies
one first-round Hard checkpoint trajectory with original field state supplied
each frame. It does not verify downstream actor physics, long autonomous
matches, other arena/contact phases, or the complete shared RNG schedule; those
remain separate parity goals.

### Hard Survival actor frame order and tile contact (2026-10-05)

The actor movement path at `0x0800fabc` advances position using the previous
velocity before updating velocity, while the Survival controller's newly
computed key mask is handed to the actor on the next frame. The model now
preserves that handoff for the native CPU. Native state 4's in-progress throw
is imported from the actor's saved origin, target and half-frame counter, so
open-loop movement comparisons no longer replace an active throw with a fall.
The research adapter applies the newly returned mask to the next predicted
actor tick; the playable game's own one-tick input queue remains intact. On the
captured Hard-idle trajectory, all 399 predicted next-step positions and all
399 next-frame controller masks match native RAM exactly. The 81 state-4
throw-animation frames and all three throw-to-normal transitions are included
in that exact position match.

Landing behavior exposed a two-update contact rule. The first downward step
that crosses a tile boundary aligns the integer actor coordinate to the
16-pixel grid while keeping its subpixel fraction, as the routine at
`0x08003848` does. The native support check then clears velocity on the next
update. The model now represents both stages and applies the original
collision helper's center/right-edge sampling rather than treating the actor
as a point or as supported by every tile under a broad rectangle. A 400-frame
replay matches the captured landing positions, grounded frames and jump-start
positions in the examined floor and ledge contacts. The one-pixel-aligned
support check distinguishes an already corrected landing from an actor that
is merely close to a platform; jump input bypasses the generic step-up
correction.

The 399 exact comparisons are one-step predictions with each original RAM
snapshot reloaded before the prediction. They establish exact position and
CPU-mask parity along this 400-frame Hard-idle checkpoint, including the
captured contacts and throws; they do not establish a long free-running
simulation or all native velocity/contact states. Other arena layouts,
hazards, opponent interactions, RNG consumers and complete Survival matches
remain unverified. Source RAM, state, trace and parameters for the final replay
are in `scripts/OUTPUT/eggo-reference_2026-10-05_14-53-50_354028`; the
inspected collision instructions are in
`scripts/OUTPUT/eggo-instructions_2026-10-05_14-31-47_652160`.

A separate 1,200-frame `stateful-cpu` replay matches the native CPU key word
on all 1,199 comparable next-frame checks, matching the measured one-frame
input handoff. Actor and board RAM are reloaded each frame, but the
reconstructed CPU controller's timers, route and policy state are initialized
only once and then carried forward. This verifies sustained decision parity on
the captured trajectory; native actor/board evolution is still supplied by
the ROM, so it is not a free-running full-match result. The trace and
parameters are in
`scripts/OUTPUT/eggo-reference_2026-10-05_15-01-24_034088`.
### Factory water-surface rendering (2026-10-08)

The factory's bright lime surface is a native animated OBJ layer, separate
from the board-space waterline. In the captured OAM, objects 24 and 25 are
64×32 sprites at X=-8 and X=56, palette bank 4; together they cover the
player's 112-pixel field. The OBJ tile numbers stay at 960..991 and 992..1023,
while their VRAM contents animate. The earlier 32-capture atlas covered only
the first eight of the 15 distinct water images. A 600-frame native capture
contains 15 unique images, each held for four native ticks. Their measured
phase is `floor(((nativeFrame + 39) mod 60) / 4)`. The atlas builder decodes
the two sprites directly from VRAM/OAM and writes a vertically stacked
112×480 RGBA atlas. It preserves the two native screen positions, transparent
pixels, and the 16-pixel offset above the measured waterline.

The water body underneath the OBJ is BG1. In the captured factory scene,
BG1CNT is 0x0b01, horizontal scroll is 8, and its source row 80 aligns with
the waterline at screen Y=136 while BG1 vertical scroll is 456. BLDCNT
0x1d42 selects BG1 as a first blend target; BLDALPHA 0x040c means EVA=12
for BG1 and EVB=4 for the lower target layers. Like the OBJ surface, BG1 uses
15 distinct animation images, each held for four native ticks. The measured
phase is `floor(((nativeFrame + 39) mod 60) / 4)`. The builder decodes a
112×256 player-field atlas from the 60-frame native capture and verifies that
phase 0 matches the independent frame-840 checkpoint. The renderer draws the
water portion from source row 80 down with the captured 12:4 blend. An audit of
82 visible BG1 samples across the 600-frame replay matches the predicted phase
with zero source-pixel error.
The OBJ phase was checked against all 204 captures with visible water objects
and the separate frame-840 checkpoint: all 204 captures and the checkpoint
match pixel-for-pixel. The BG1 body phase matches all 82 active samples and the
same independent checkpoint. The muted Electron frame-840 test matches the
complete 240×160 screenshot with zero different pixels. The 600-frame source capture,
phase validations, atlas extractions, and focused screenshot test are recorded
in `scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/`,
`scripts/OUTPUT/eggo-reference_2026-10-08_09-02-18_647810/`,
`scripts/OUTPUT/eggo-water-surface-animation_2026-10-08_06-54-42/`,
`scripts/OUTPUT/eggo-factory-water-surface_2026-10-08_08-55-13_900348/`, and
`scripts/OUTPUT/eggo-factory-water-body_2026-10-08_09-02-38_274550/`,
`scripts/OUTPUT/eggo-player-water-body-phase_2026-10-08_07-03-10/`, and
`tests/OUTPUT/eggo-mania-visual_2026-10-08T07-03-47-670Z/`.
Other stages and complete Survival behavior still require parity work.

### Factory CPU waterline BG3 map (2026-10-07)

The CPU field switches BG3 to `BG3CNT=0x0b01` below the prior CPU waterline.
The alternate state uses screen base 11, `BG3HOFS=8`, and a scanline split at
previous waterline screen Y + 1. At that first scanline, the native BG3 scroll
maps to source row 80; the visible CPU crop maps to source X=136..247. The
window/blend setup is stable across all 65 alternate frames:
`BLDCNT=0x1748`, `BLDALPHA=0x040c`, `WININ=0x3c13`. The BG3 map/palette region
is a 60-phase cycle keyed by the native field frame. All 600 captured frames
contain ten samples per phase, and repeated phase images are byte-identical.
The 65 active windows expose 904 scanlines; every source pixel matches the
phase selected by the current native frame.

`scripts/eggo-build-factory-waterline-bg3.py` decodes the native screen map,
4bpp tiles, and palette into `assets/factory-waterline-bg3.png`, a 60×18-row
atlas. It rejects missing phases or any phase mismatch before writing the
asset. The runtime draws the atlas on the CPU field at the floored previous
waterline position and applies the native 12:4 RGB555 blend. The split uses
the water state from before the current model update and the pre-update board
camera; this matches the ROM's one-frame-delayed HBlank trigger. A muted
Electron pixel test checks all 60 phases with zero mismatch on 672 unoccluded
pixels per phase. The atlas and live blend are now represented, but complete
BG2/BG3/OBJ priority composition and full-screen replay parity remain open.
Extraction output is in
`scripts/OUTPUT/eggo-factory-waterline-bg3_2026-10-07_17-16-11_411494/`; the
muted runtime check is in
`tests/OUTPUT/eggo-factory-waterline-bg3_2026-10-07T15-23-21-537Z/`.

### Animated factory BG3 map (2026-10-05)

The static factory background omitted streamed BG3 map updates. Comparing an
input-free run with a bot-played run showed that the two field halves change
independently with their own actor height: at frame 840 the CPU half was
pixel-identical when its height matched, while the player half differed as the
player moved. Two captures at the same height also reproduced the same field
map (exactly for the CPU and within 2.14 RGB levels for the player). The 2,000th
input-free frame is still in play, while the 2,200th is already the result
screen; a separate bot-played trace remains active through frame 3,600.

The atlas builder decodes 743 VRAM/palette/register samples from the early
input-free trace, the active continuation, and independent checkpoints. It
deduplicates them to 229 112×256 field maps and keeps separate height tables for
player and CPU. BG3's 4bpp/8bpp control changes are decoded per sample, and
horizontal scroll is baked into each crop. At runtime, each field chooses the
nearest captured map to its own actor height; samples farther than one height
unit fall back to the static stage art.

ROM inspection then recovered the stage-background camera transform and
incremental tile-map and tile-stream routines. The field loop calls
`0x0800B074` twice, in order: player at `0x080190C0`, then CPU at `0x080190C8`.
It calls a four-instruction signed multiply copied to IWRAM at
`0x03000000`: the product of object fields `+0x04` and `+0x2C`, shifted right
32 bits, is the integer camera Y. The code then compares the old and new 8-pixel
camera rows and advances the visible map one tile row at a time. At the end of
that update it calls `0x0800B480` from `0x0800B28E`.

`0x0800B480` starts at tile row `max(0, cameraY >> 3)`, scans through at most
21 rows, and reads eight-byte row descriptors at object offset `0x74`. A
nonempty row picks its ROM chunk with `((globalFrameCounter / rate) % period)`,
where the counter is at `0x02011A9C`; helper `0x08000234` returns the quotient
and `0x0800022C` returns the remainder. The copy length is the row's tile width
times 64 bytes. Its destination is the graphics base plus the row offset and
`x * 64`; destination rows advance by `0x380` bytes and wrap at `0x4980`. The
factory field objects in the captured state are `0x02003910` and `0x02004C8C`.

The verifier compared all 64 active row descriptors per field with their ROM
tables, recomputed the copies from the ROM and saved native RAM, matched each
source/destination/length against the GBA's DMA queue, and compared the copied
VRAM bytes. It also verified the copied IWRAM multiply routine and recomputed
both camera heights from the saved fixed-point inputs. All 71 streamed rows
matched across nine factory frames (120–3600), including both field halves.

A second adjacent-frame capture exercised the same routines in factory (native
stage ID 1) while the player bot moved. Across 240 consecutive frames, all 1,849 predicted tile
copies matched the native DMA queue and their bytes appeared in VRAM in the
same or following frame. The camera-row writer was also reconstructed: forward
movement writes 14 tile IDs using object offsets `+0x48` and `+0x50`; backward
movement uses `+0x44` and `+0x4C`, reversing both ring-buffer steps. Its 38
changed rows across both fields matched all 14 native map entries, including
wraparound. The full capture and machine-readable results are in
`scripts/OUTPUT/eggo-reference_2026-10-05_18-51-49_188487/` and
`scripts/OUTPUT/eggo-stage-stream-check_2026-10-05_19-03-16_862601/`.

The display scroll register is one frame behind the CPU field camera. In all
175 adjacent frame pairs where this capture kept BG3 enabled (`BG3CNT=0x1f87`),
the current BG3VOFS equals the previous frame's CPU `camera_y mod 256` exactly.
The player and CPU objects still keep separate camera Y values, map bases and
ring offsets; for example, on frame 1 their camera Ys are 350 and 327 and their
map bases are `0x0600f800` and `0x0600f820`. This rules out using the current
CPU camera or either field's camera as an immediate shared scroll value. The
per-frame register and object measurements are reproducible with
`scripts/eggo-measure-stage-camera.py` and are in
`scripts/OUTPUT/eggo-stage-camera_2026-10-05_19-15-35_848214/`.

Constructor `0x0800AF40` seeds 21 map and graphics rows for each field. It
derives the map and tile-ring offsets from `cameraY >> 3`, then walks the rings
backward while writing 14 tile IDs per row and copying `0x380` bytes from the
field's 64-row EWRAM source ring. The factory configs at `0x0821CFB4` and
`0x0821CFD0` specify 14 tiles by 64 rows and point to independent row tables at
`0x083F140C` and `0x083F160C`. On captured frame 1, the source rings occupy
`0x02014E84` and `0x02022E84`, each `0xE000` bytes. The field initializer at
`0x0800AD6C` dispatches to the custom decoder copied into IWRAM at
`0x03000110`; it reads the stream pointer at config offset `+0x08` and writes
the decoded bytes to the selected EWRAM ring. This is a custom LZ-style
format: control bits are consumed least-significant first. For tokens below
`0x60`, distance is `((token & 0x0f) << 8) | next_byte`; lengths are
`(token >> 4) + 3`, with tokens `0x50`–`0x5f` adding the following byte to the
length. Tokens `0x60` and above copy two bytes from distance `0x100 - token`.
A zero-distance short reference terminates the stream.

The independent decoder in `scripts/eggo-decode-stage-rings.py` compares its
output directly with native captures from all eight Survival arenas. All 16
player/CPU rings match EWRAM byte-for-byte; seven arenas have 64 rows and
Pirate has 63. The factory player data at `0x0829A5D4` consumes 33,021
compressed bytes and hashes to
`fa92690f0e259966eab0b42eec5e4fde71c5dc487f4e2b1a008f85da89b9aa58`; CPU
data at `0x082A26D4` consumes 32,869 bytes and hashes to
`4118d3c9c62fb9b325a37ad1ab32cd07a83f54d3728dba279e6d89a44f92635f`.
For every stage, config offset `+0x0c` points to its 256-entry BGR555 palette;
252 or 253 entries match the native palette capture, with any differences
confined to slots 0, 16, 32 and 48 that the game rewrites. Config offset
`+0x10` points to an additional `0x800` bytes that match native VRAM at
`0x06004C00` exactly for all eight stages. The full decoded set, source/capture
hashes and per-row hashes are in
`scripts/OUTPUT/eggo-decode-stage-rings_2026-10-05_20-16-21_320136/`.

Replaying the constructor against frame 1 reproduces all 42 tile-map rows. The
source rings alone match 33 of the 42 graphics rows; the other nine match when
the previous frame's ROM stream variants are overlaid, with counter 563. An
independent update replay then applies the ROM map-ring writes and delays each
queued graphics copy by one frame. All 38 changed map rows and all 1,840 copies
visible through frame 240 match the native captures byte for byte; the nine
copies queued on the final frame are due on frame 241. The replay and per-event
CSVs, bootstrapped object records and both `0xE000` source-ring binaries are in
`scripts/OUTPUT/eggo-stage-bg-replay_2026-10-05_19-38-00_496690/`.

The disassembly, verified caller references and exact inputs are preserved in
`scripts/OUTPUT/eggo-instructions_2026-10-05_18-23-40_263049/`,
`scripts/OUTPUT/eggo-thumb-xrefs_2026-10-05_18-24-56_681632/`,
`scripts/OUTPUT/eggo-thumb-xrefs_2026-10-05_18-41-36_698101/`, and
`scripts/OUTPUT/eggo-factory-stream-check_2026-10-05_18-48-13_867788/`.
The stage constructor, incremental row writer, one-frame shared-scroll delay,
ROM streamer and initial ring decoder are recovered and checked. The renderer
now uses the native ring and animated stream-row variants outside the measured
factory-height atlas. Absolute global phase and remaining Survival systems are
still open.

For the known frame-840 Hard screenshot, the player-field mean absolute RGB
error remains improved from 4.81 to 2.89, with waterline error at 1.63. The
exact source hashes and per-height choices are in
`scripts/OUTPUT/eggo-factory-background-animation_2026-10-05_18-18-26_735960/`;
cross-trace and same-height comparisons are in
`scripts/OUTPUT/eggo-factory-background-trace-compare_2026-10-05_18-09-26_267507/`.
The focused visual check is in
`tests/OUTPUT/eggo-mania-visual_2026-10-05T16-18-43-836Z/`. The measured
factory atlas remains preferred where a captured height directly matches; the
new BG3 ring art fills other factory heights and the remaining arenas. ROM
stream-row variants are now exported to per-field atlases and selected in the
renderer with their measured rate and period.

### All-arena background-ring image comparison (2026-10-05)

`scripts/eggo-compare-stage-rings.py` converts each decoded 8bpp, 14-tile-wide
EWRAM ring to pixels, reapplies the selected ROM-stream rows at the native
one-frame DMA phase, and aligns it with the same capture's BG3 map. The best
tile-row origin is 256 pixels with no horizontal flip in all sixteen
stage/field captures. Using each capture's native palette, 335 of the 336
rows initialized around each field's camera match the native RGBA map exactly.
The remaining full-map exception is Dragon CPU world row 57, which needs a
separate VRAM-ring-wrap check. Stream rows use the previous captured global
frame counter, matching the DMA queue's one-frame delay.

The screen-space comparison also applies the captured BG3VOFS and clips to
the native 160-pixel display. All 2,197 visible scanlines that fall within
initialized map rows across these captures match the native RGBA pixels
exactly. Dragon's row-57 exception is below the visible viewport in that
capture. Some player views expose rows outside their 21-row initialization
window because BG3VOFS is shared and follows the CPU camera; those lines retain
older VRAM contents and are deliberately excluded from the ring-only
exactness claim.

This confirms the decoded rings and stream selection reproduce the initialized
part of every Survival arena. The comparison script exports field-specific
112×512 rings to `assets/bg3-{stage}-{player|cpu}.png`, plus the complete
captured row-descriptor variants to `assets/bg3-streams-{stage}-{player|cpu}.png`.
The generated `assets/background-rings.js` gives the renderer each ring row,
tile span, rate, period and atlas offset. Rendering patches only changed rows
into a cached ring. The first version used the first arena's capture counter
as the match origin; a later Hard-entry probe showed that this was a mid-run
capture phase, not a fresh-session origin. The corrected native counter is
documented below under “Native BG3 animation phase at Hard Survival entry.”
`VIEW` keeps the measured base ring positions in
`stageRingBasePixels`; the renderer scrolls each field's ring from that base
using its current camera. The focused frame-840 Hard screenshot comparison
retains the 2.89 mean absolute channel error where the calibrated factory atlas
takes priority. The ring fills factory heights and arenas the old single-height
background could not represent.
The complete 256-pixel BG3 map also contains rows outside the 21-row window;
those retain prior VRAM content and account for the larger full-map errors.
The analyzer now wraps its 21-row scan around the 64-row ring rather than
truncating it at row 63. Per-arena images, row-level comparisons, every
captured stream pointer and input metadata are preserved in
`scripts/OUTPUT/eggo-stage-ring-comparison_2026-10-05_21-32-27_944952/`.

The later fixed Hard replay confirms the player and CPU EWRAM source rings
(57,344 bytes each) keep the same pointer and exact bytes on all 600 captured
frames. Thus the changed maps at equal camera heights are not caused by new
source-ring art. The 101 map-row writes and 5,014 scheduled graphics copies
remain necessary to reproduce the live tile-map/tile-ring view; direct bitmap
scrolling still needs to be checked against those updates at the unseen maps.
The byte-for-byte RAM audit and per-frame hashes are in
`scripts/OUTPUT/eggo-bg3-source-ring-audit_2026-10-08_04-35-40/`.

### Survival round-start pickup initialization and shared RNG (2026-10-05)

A fresh Hard-menu replay starts from `survival-hard.state`, presses A for one
frame, then advances 60 neutral frames. The first-round startup calls the
global RNG at `0x080016B4`, `0x08001864` and `0x08002222`; for captured seed
1137, these leave the shared seed at 871 and initialize both field streams to
871. The selected native arena ID is 1 (Factory).

Disassembly of `0x08018C38` shows a 320-iteration loop. Each iteration updates
the pickup manager rooted at `0x020034E4`, draws once from the shared RNG,
updates the second manager at `0x02004860`, and draws again. The routine is
invoked twice on entry through separate callers (`0x0800247A` and
`0x08018E3A`). The trace therefore records 640 calls at each loop RNG site,
plus two calls at each loop boundary site: 1,284 shared-RNG draws total. The
same call counts recur in the saved round-8 and round-9 transition captures,
so both initialization passes run for each Survival round.

The field-local state confirms that the passes reinitialize the pickup list
while keeping the advanced field RNG. From seed 871, the first 320-step pass
ends at 34340; the second ends at 37606. The second pass reproduces the native
round-start manager snapshot exactly: clock 56, bag
`[5,6,5,5,6,4,3,5,1,2,1,1,1]`, and six pickups with matching kinds, variants,
fixed-point positions, velocities and wait counters. Both field snapshots
match. The raw RAM is in
`scripts/OUTPUT/eggo-reference_2026-10-05_21-58-48_632495/`, and the relevant
disassembly and caller scans are in
`scripts/OUTPUT/eggo-instructions_2026-10-05_22-05-34_029912/`,
`scripts/OUTPUT/eggo-instructions_2026-10-05_22-07-29_048748/`, and
`scripts/OUTPUT/eggo-thumb-xrefs_2026-10-05_22-08-55_600526/`. Round-transition
call counts are in
`scripts/OUTPUT/eggo-reference_2026-10-05_13-27-07_650874/` and
`scripts/OUTPUT/eggo-reference_2026-10-05_13-28-26_984797/`.

The saved round-8-to-9 transition is an independent check of the per-round
path: shared seed 18525 yields field seed 64756 and post-table global seed
63315; after the two manager passes the native values are field seed 59501
and global seed 3020. The updated game path reproduces all four values.

`Game.startRound` now performs both 320-step passes, resets the pickup manager
between them without rewinding its field-local RNG, and advances the modeled
shared stream by the measured 1,284 calls. The focused regression compares
both fields against the captured RAM values, including all six fixed-point
pickup states. This closes the round-start prefill schedule; recovery of the
ROM's cold-boot seed and the remaining Survival behaviors is still open.

### Hard Survival player input handoff (2026-10-05)

An input-only continuation from `tests/artifacts/eggo-reference/hard-idle.state`
pressed Up for one native frame, then released it for 100 frames. The player
actor had no jump displacement on frame 1 even though Up was sampled there;
the jump began on frame 2, after the sampled key had been released. The
independent `walk8` trace likewise leaves the actor at X=63 on the first Right
frame and moves it to X=65 on the second. These captures establish the native
one-actor-tick keypad latch for both held movement and jump edges.

The playable game's Survival update previously consumed the latest keypad
sample in the same simulation tick. It now applies the preceding sample and
stores the current one, while keeping that delay isolated from other modes.
The queued state resets on round start and pause/resume; catch-up simulation
repeats held controls without repeating one-shot jump/place/rotation edges.
The source run, ROM/core/state hashes and per-frame actor positions are in
`scripts/OUTPUT/eggo-reference_2026-10-05_22-50-29_597257/`. Focused checks
match the new input latch and retain the measured jump trajectory. This closes
the player's sampled-input ordering only; full live-play and Survival parity
remain in progress.

### Rescue trigger has no center-X gate (2026-10-05)

The existing model required the actor to stay within 1.4 cells of the field
center before it could win. A native counterexample starts from
`tests/artifacts/eggo-reference/survival-next.state`, writes actor X=0 and
Y=0, then runs 600 neutral frames. The original reaches the `WINS 02` result
screen from this position; at the first result-OAM frame, actor X is still only
0.75 native pixel. The saved frame, state, RAM, OAM trace and write log are in
`scripts/OUTPUT/eggo-reference_2026-10-05_23-04-17_658977/`. The Survival model
now checks the measured rescue height and blocking actor states without an
invented horizontal-center condition. This rules out a center requirement; it
does not claim the full goal sequence or every blocked actor state is decoded.

### Rescue-height boundary probes (2026-10-05)

Four short native replays changed only the player's fixed-point X/Y in the
saved Survival state, then advanced four frames. Starting at native Y=127
produced result-layer OAM by frame 3; starts at Y=128 and Y=129 did not. The
Y=720 control also remained in play. Together with the original Y=0 capture,
this brackets the native rescue plane at 128 screen pixels and confirms that
the transition is height-based at the tested field position. The final RAM
snapshot records global game state `1` and result counter `0xd9` for Y=127;
the three non-winning controls retain state `0`. The model now compares actor
and rescue-plane positions in the original screen-pixel coordinate system.
These probes do not identify every actor-state blocker or establish the exact
comparison instruction. Their input writes, state hashes, RAM, traces and frame captures
are in `scripts/OUTPUT/eggo-reference_2026-10-05_23-12-21_919954/`,
`scripts/OUTPUT/eggo-reference_2026-10-05_23-12-21_913951/`,
`scripts/OUTPUT/eggo-reference_2026-10-05_23-12-21_948482/` and
`scripts/OUTPUT/eggo-reference_2026-10-05_23-12-21_943490/`. The model uses a
strict height comparison: with a 720 px actor floor and 16 px cells, native
Y<128 maps to model height>37; equality alone does not finish a rescue. A
focused model regression covers equality and a small positive crossing.

### Per-field RNG call census (2026-10-05)

The two field RNG helpers at address 0x08009380 and 0x080093A4 read separate
16-bit states from 0x02011AB0 and 0x02011AB4. Each step computes
(75 * state) mod 65535, representing zero as 65535. This follows the
disassembled multiply-by-75 and high-word correction in 0x08009338, and
matches the renderer's nativeRandomStep.

A 1,800-frame no-input Hard Survival replay from
tests/artifacts/eggo-reference/hard-idle.state was instrumented at the
eleven direct call sites. The hooks preserve the original arguments, registers,
flags, LR and stack at each native helper. Their counters use the EWRAM region
0x02031880..0x02031904, already verified by the global-RNG trace. The final
image and every RAM byte outside that trace block match an uninstrumented
replay exactly.

The captured starting state is 3,118 for both streams. Calls to the game-field
helper total 429: 26 each at 0x0800B588, 0x0800B5D4, 0x0800B778 and
0x0800B980, plus 325 at 0x08012934. Replaying 429 native steps gives
56,639, the captured final state. Calls to the secondary-field helper total
659: 24 each at 0x0800B57E, 0x0800B5C2, 0x0800B764 and 0x0800B976,
plus 563 at 0x08012924. Replaying 659 steps gives 39,125, also matching
native RAM. The startup site 0x0800223A was not reached in this active-round
fixture. The two 0x080129xx sites are in an actor-update path and select
different RNG streams based on a field-state branch; they account for most
per-frame draws in this replay.

In the 0x080129xx steering routine, R6 points to enemy slots 3 and 2
(0x020311B8 and 0x02031138); offsets +0x14 and +0x18 are their signed 16.16
horizontal and vertical velocities. The native code subtracts from X when
random bits 0..2 equal 7, adds to Y when bits 3..5 equal 0 and subtracts from
Y when they equal 7, then steers toward the actor using 16 px and 48 px
near/far thresholds. This type-2 path initializes acceleration to 0x2000;
moving in the correct direction halves it with an arithmetic shift. Both
velocity components clamp to ±0x20000 (2 px per frame). These instructions
match the existing fixed-point logic in
advanceCastleSecondaryMotion; this trace confirms its two fields consume one
native draw per eligible update: 563 CPU-field ticks and 325 player-field
ticks in this replay. The separate type-13/0x1999 path is not covered by this
idle-Factory trace.

The valid trace, uninstrumented comparison, hashes and call-site records are
in scripts/OUTPUT/eggo-reference_2026-10-05_23-54-32_996639/ (including
field-rng-validation.json) and
scripts/OUTPUT/eggo-reference_2026-10-05_23-50-28_254644/. Global and
per-field caller hooks must run separately because they reuse this verified
scratch block. Earlier combined traces used 0x02031940, which overlaps
live EWRAM and changes the game; those captures are retained but invalid for
behavioral inference in scripts/OUTPUT/eggo-reference_2026-10-05_23-42-38_646400/,
scripts/OUTPUT/eggo-reference_2026-10-05_23-44-58_050597/ and
scripts/OUTPUT/eggo-reference_2026-10-05_23-48-45_164751/.

### Matching ROM artwork to the RGB565 capture format (2026-10-06)

The frame-840 factory comparison had a broad, small color error: most affected
pixels differed only in green, while red and blue matched. The ROM-derived
art uses 5-bit green values; the native mGBA framebuffer exposes those values
in RGB565, where the 5-bit value is shifted into the 6-bit green channel. The
app had expanded the ROM value directly to 8-bit green, which made many pixels
one to five levels brighter than the captured frame.

`pixel-renderer.js` now converts ROM-art image pixels to the capture's 32
native RGB565 green levels once as each image loads. It leaves pixels already
on those levels unchanged, so screenshots and captured art retain their
native values. The conversion is not repeated during frame rendering.

On the same 112×160 player-field crop from
`bot-tower.frame00840.png`, differing pixels fell from 16,389 to 1,784 and
mean absolute RGB error fell from 2.89345 to 2.16343. This is a focused
single-frame color comparison; it does not establish pixel parity for other
arenas, animations, or complete Survival play. The diagnostic color tables
and difference images are in
`scripts/OUTPUT/eggo-visual-diff_2026-10-06_01-01-38_663043/`; the focused
renderer capture is in
`tests/OUTPUT/eggo-mania-visual_2026-10-05T23-30-30-618Z/`.

### Separate native actor input timing from immediate actions (2026-10-06)

The earlier live-game input queue delayed every one-shot along with movement.
That does not match the original: an input-only Hard capture changes held
kind 6 from orientation 0 to 1 on the same frame as GBA B; the existing
throw capture starts its A action on frame 1; the one-frame L capture has
`drop_ticks=9` on frame 1; and both R-discard captures create the dropped
pickup on their first R frame. A later 80-frame movement capture corrects the
earlier interpretation of movement and jump timing: only the first movement
sample after a round starts is consumed while the native actor initializes.
After that, movement applies on the current actor tick, stops on the first
release frame and applies immediately on a later press. The live Survival path
now gates that startup sample once, while applying B rotation, A use, L dive
and R discard on the sampled frame.

This distinction also corrects a visible Xbox mapping error. RetroArch's
XInput profile maps GBA A to physical Xbox B, GBA B to physical Xbox A, and
GBA L/R to LB/RB. Xbox A was previously assigned to reverse rotation and RB
to clockwise rotation; it now selects the native clockwise rotation, while
the optional reverse action is on Xbox Y and discard is on RB. Previously
saved erroneous defaults migrate once; custom multi-button bindings remain.

The native action evidence comes from
`scripts/OUTPUT/eggo-reference_2026-10-06_02-25-28_647215/` and the recorded
throw/discard/dive fixtures. `tests/eggo-controls.test.mjs` checks button
positions, migration, startup input consumption, the full walk/stop/re-press
trace, and the native 0-to-1 shape rotation. Full pixel parity remains
incomplete.

The live Survival player previously still took the prototype movement path
while the CPU used native fixed-point updates. This mixed coordinates: a
subpixel standing height could be rounded away during actions and the next
render did not follow the native actor state. Survival now sends the player
through the native update path too. The `walk-turn-8` and
`walk-stop-turn-12-32-12` reference captures record the first consumed movement
sample, exact +2-pixel horizontal steps, immediate stopping and immediate
movement after a later press, with standing height fixed at 720.044067 px.
`tests/eggo-controls.test.mjs` checks all 56 recorded coordinates against a
ROM-derived fixture; the gameplay input test checks that this timing is wired
through `Game.update`.

The native support correction must not take ownership while the actor is
already falling through a floor. Excluding `offTower` and active `dropTicks`
from support hold prevents a fresh support contact from restarting the dive
each frame. The ROM-derived nine-tick dive trace and the synthetic buried-gap
CPU placement case both pass in `tests/eggo-dive.test.mjs`.

`node tests/eggo-mania-visual.mjs --reference-only` captures a reproducible
native-vs-game screenshot and per-pixel comparison in
`tests/OUTPUT/eggo-mania-visual_2026-10-06T01-25-40-800Z/`. The updated fixture
uses the captured native placement tiles and orientations instead of fallback
panel art. In the 112x160 crop, 630 of 17,920 pixels differ (mean absolute RGB
error 0.129), but all 5,976 unoccluded pixels inside placed cells match the
ROM exactly, including their outlines. The remaining whole-frame differences
are concentrated around actor/effects and the bottom water/meter region. This
is regression evidence, not a claim of complete parity. The former two-button
reverse-rotation default is also now migrated, without rewriting custom
chords.

The same movement trace showed the walk sprite was indexed by total round time,
which could make a later walk start halfway through its cycle. Survival now
uses a walk-local pose clock, holds the last walk frame for one draw at release,
and preserves the native one-frame pose handoff when walking starts again after
idling. `tests/eggo-mania.test.mjs` checks the initial, release and re-press
poses through the live game loop. Held pickup artwork now uses its recorded
rotation even when multiple rotations have the same occupied-cell shape;
`tests/eggo-placed-art.test.mjs` checks every orientation.

### Outline, water-priority, and rotation regression (2026-10-06)

The eight native connected-piece outline sprites are captured from ROM OAM
object 36 and compared against the renderer as 64x64 RGBA images. All eight
have zero differing pixels. The water-priority probe holds placed tiles under
the factory-water overlay for all 32 animation frames; none of the checked
opaque tile pixels changes. `tests/eggo-piece-preview.test.mjs` also follows
ROM OAM position and affine matrices through the captured turn for every shape,
then checks that each preview settles exactly on its target cell origin. The
model correction removes the unused minimum-Y offset from the preview anchor
and snaps the last fractional origin when the turn settles.

The current full reference comparison is saved at
`tests/OUTPUT/eggo-mania-visual_2026-10-06T05-02-05-188Z/`. It reports 271
different pixels in the 112x160 comparison crop; every unoccluded placed-tile
pixel still matches (0/5,976 differences), and eight repeated renders of the
same state are identical. The remaining differences are three isolated
actor-area pixels and the bottom water/meter band; `reference-diff.png` marks
them. This does not establish full-frame parity. The animated water test
specifically establishes that this overlay is no longer replacing or flickering
the placed-tile pixels. I tested rounding the RGB555 blend sum before shifting;
that increased the full-frame difference count to 435 pixels (359 when applied
only to green), so the measured floor operation remains in place. The remaining
water-band mismatch needs a better match for the source compositing target,
not a blanket rounding adjustment.

`tests/eggo-controller-remap.mjs` exercises the Controls screen in Electron
with a standard-layout Xbox-compatible gamepad: clicking the GBA rotation
binding, pressing Xbox X, saving, and pressing Xbox X again all succeed. This
tests the live remapping path in addition to the default RetroArch-style
button-index checks in `tests/eggo-controls.test.mjs`.

### Frame-exact held-piece outline turns (2026-10-06)

The earlier preview renderer used a floating Canvas angle and eased the OAM
origin independently. The ROM instead writes signed 8.8 affine coefficients
and integer sprite origins on every frame. `native-affine.js` now uses the
captured twelve-frame coefficient sequence for each of the four starting
orientations, plus the two measured integer Y-origin sequences. The native
pixel map samples around pixel (32, 32) and clips to the fixed 64x64 OBJ box.
This removes the one-coefficient matrix errors and the one-to-two-pixel origin
drift during some turns.

`tests/fixtures/eggo-preview-origin-oam-gba.json` records the OAM result for all
twelve frames and all eight shapes. The four orientation-specific matrix paths
were captured through four consecutive turns for kinds 0 and 1; their matrices
match frame for frame. The visual regression now requires exact matrix and
origin equality, checks a queued turn pressed during an active turn, and keeps
the raw source-outline comparison at zero pixel differences. The source traces
are under `scripts/OUTPUT/eggo-reference_2026-10-06_08-06-*` and
`scripts/OUTPUT/eggo-reference_2026-10-06_08-07-*`.

The comparison at `tests/OUTPUT/eggo-mania-visual_2026-10-06T06-14-07-897Z/`
still had 271 differing pixels. A later render at
`tests/OUTPUT/eggo-mania-visual_2026-10-06T06-16-56-365Z/` reduced this to three:
the water body now converts RGB565 green back to the original 5-bit channel before
the GBA alpha blend. Inspecting those pixels showed that the reference fixture
had lost `nativeKind` and `nativeVariant` for its plus-shaped pickup, so it
rendered a fallback icon. The captured OAM sprite is native kind 0, variant 1.
Restoring those fields makes the full 112x160 player-field screenshot pixel-identical
to the ROM at frame 840. The visual regression now fails on any full-frame pixel
difference; its passing result is in
`tests/OUTPUT/eggo-mania-visual_2026-10-06T06-35-59-886Z/`. All 5,976 unoccluded
placed-tile pixels match, eight repeated renders are identical, and 32 water
animation phases preserve all 16,384 opaque tile pixels. The output includes a
side-by-side `reference-vs-rom.png` image.

The earlier rotation test checked OAM matrices and sprite origins, but not the
transformed pixel output. `eggo-build-preview-affine-fixtures.py` now derives four
contact sheets from the eight ROM-captured 64x64 outline sprites and the measured
per-frame 8.8 matrices. Electron compares every renderer output against those ROM
references: 8 shapes × 4 starting orientations × 12 frames, or 1,572,864 RGBA
pixels, with zero differences. `preview-affine-rom-vs-app.png` in the test output
shows one full orientation side by side; all four are checked by the regression. The separate
56-frame movement trace, seven-frame walking cycle, and all-shape logical-rotation
tests also pass. Together these checks cover the reported outline, flicker, turn,
and movement defects across captured source states and sequences.

### RetroArch Xbox profile and longer rival-motion sample (2026-10-06)

The installed RetroArch XInput profile for Xbox One controllers maps its
RetroPad A button to physical Xbox B (Gamepad API button 1), RetroPad B to
physical Xbox A (button 0), and L/R to the two shoulders (buttons 4/5). The
game defaults now use those exact positions for GBA A/B/L/R. A live Electron
remap check captures Xbox X, saves it as the clockwise-rotation binding, and
confirms that the saved binding triggers the action. Results are in
`tests/OUTPUT/eggo-controller-remap_2026-10-06T06-49-35-309Z/`; the focused
controls suite passes all eight checks.

A no-input 1,800-frame Hard checkpoint replay sampled the rival actor every
two native frames. It contains 642 classified actor samples, but only three
grounded `walk` samples and two distinct walk pictures. That capture alone
does not establish the rival's continuous walking cadence or justify changing
the renderer's timing from that data. Other parts of the native rival state
machine remain an open parity item. Captures, pose hashes, parameters,
ROM/core hashes and the source state are preserved in
`scripts/OUTPUT/eggo-reference_2026-10-06_08-54-15_993840/`.

### Headless Ghidra roots and native rival idle phase (2026-10-06)

The GBA ROM can be analyzed without touching the open RetroArch window. The
repeatable entry points are `scripts/eggo-ghidra-controller.ps1` for twelve
verified Survival/Hard CPU routines, `scripts/eggo-ghidra-survival.ps1` for a
cartridge-entry auto-analysis attempt, and
`scripts/eggo-ghidra-export-survival.ps1` for decompiling selected call-graph
roots from the saved project. Every run records the ROM SHA-256, tool settings
and outputs under `scripts/OUTPUT`.

The selected CPU pass completed Ghidra decompilation for all twelve seeded
routines. A 900-second whole-ROM auto-analysis attempt did not finish and
created 118,949 function records, many of them graphics and table bytes
misidentified as code. That number is not a real function count. The saved
partial result is retained to prevent repeating the expensive scan; the
verified direct-call export is the useful artifact. Its latest pass decompiled
all 133 reachable/explicitly seeded routines. Direct call graphs still
miss indirect dispatch and jump-table targets.

Manual decoding of the actor-state table at `0x0800d7f8` confirms seven
Thumb targets: state 1 → `0x0800ded8`, state 2 → `0x0800dc28`, state 3 →
`0x0800d814`, state 4 → `0x0800e0e8`, state 5 → `0x0800e040`, state 6 →
`0x0800e068`, and state 7 → `0x0800e0ac`. State 4 matches the captured
airborne throw transition. The animation selector table at `0x0800eac0`
selects handler `0x0800ed50` for selector 2; that handler advances the
two-frame phase from the shared random value. The renderer had been advancing
rival idle poses on a fitted fixed clip clock even though the player path
already tracks this ROM phase. `rivalPose` now uses the tracked phase for
`idle` and `idle-free`, while the captured timing remains in use for other
rival clips.

`node --test tests/eggo-characters.test.mjs` passes all ten checks. The
headless rival rendering check also passes and saves its grid at
`tests/OUTPUT/eggo-mania-visual_2026-10-06T10-42-37-545Z/`. That is a renderer
smoke check, not a new whole-frame ROM parity claim. The animation selector's
other handlers, exact per-stage actor transitions and full Survival trajectory
remain open.

### Stable atlas composition and grid-anchored placement outline (2026-10-06)

`Image.complete` became true before the renderer's RGB565 correction callback
had replaced the raw image. Newly visible panel masks could therefore be cached
from a mix of raw and corrected atlas pixels as the camera moved. Art is now
considered ready only after image decode and RGB565 conversion finish. The
factory's transparent BG3 map and its static underlay also use the same
parallax offset, and each 112×160 back buffer is reset before compositing a
frame so transparent pixels cannot retain a prior frame.

The held-piece outline had also followed the actor's continuous sub-cell X
coordinate and eased toward a new landing row. It now tracks the integer
landing-cell origin except during the ROM-captured quarter-turn animation.
`tests/eggo-piece-preview.test.mjs` checks that the origin remains integral as
the actor moves by two native pixels at a time. The headless three-row jump
replay keeps all 12 placed cells through 90 frames and reports zero changed
pixels when each frame is rendered twice; its captures and parameters are in
`tests/OUTPUT/eggo-mania-visual_2026-10-06T12-03-12-786Z/`. The native static
reference still compares at zero differing pixels, with zero repeated-render
instability, in `tests/OUTPUT/eggo-mania-visual_2026-10-06T12-04-27-412Z/`.

That first jump check used fallback metal drawings and only counted board
cells; it did not catch that `drawField` began its row loop at `camera - 1`.
The viewport extends below the floor line, so lower rows were still on screen
when the loop skipped them. The renderer now computes the visible row interval
from the actual floor/viewport geometry. The same interval is exercised during
a 90-frame jump over thirteen ROM-textured cells with the normal waterline;
the outline is present on all 90 frames, no visible rows are skipped, and
repeat renders are identical. The new trace, parameters and frame sheet are
in `tests/OUTPUT/eggo-mania-visual_2026-10-06T12-38-36-852Z/`.

The outline now uses the board's pixel-snapped Y projection. This keeps it on
the same pixel rows as the grid when the post-throw camera eases between native
pixel positions. In the jump trace, both its world-grid origin and projected
screen origin remain integral on every sampled frame.

The jump check was tightened again on 2026-10-06 after a later report of
fractional outlines and placed rows appearing to blink during a jump. The
earlier check only used a shortened synthetic stack and read the old cached
preview origin, so it did not verify the renderer's live origin. `drawField`
now derives the outline origin from the current landing preview after actor
physics has run, while retaining only the captured vertical offset during an
active native quarter-turn. The diagnostic now measures that same helper and
the actual pixel-snapped draw position.

The headless jump replay now uses the full 26-cell, seven-row placed-board
layout from the native frame fixture and ROM placement textures, with the
round's normal initial waterline. It holds jump for 40 frames and samples the
90-frame replay. The placed-cell state remains unchanged, no on-screen cell is
omitted, no visible cell disappears against the same frame's background with
cells hidden, and rendering the same state twice produces zero pixel
differences. The live landing origin remains on integer grid coordinates on
all 90 frames. Artifacts and reproducible parameters are in
`tests/OUTPUT/eggo-mania-visual_2026-10-06T13-48-06-162Z/`.
This reproduces the described jump over a native-textured stack, but has not
reproduced the reported flicker itself; the capture also shows the expected
camera-follow movement as the actor jumps.

### Water overlay no longer fades placed rows during jumps (2026-10-06)

The Dragon arena's generic translucent water and wave stripes were composited
after the placed cells. As the camera followed a jump, that overlay tinted
submerged tiles and made the rows look transparent or flicker. Water is now
drawn under the placed-cell layer; the separately reconstructed Factory water
path remains unchanged because its native priority and 32 animation phases have
their own ROM-backed pixel test.

`node tests/eggo-mania-visual.mjs --water-only` builds three placed rows in the
Dragon arena, sends the camera through a 2.5-cell jump, and compares an occupied
tile with water below it against the same frame with the waterline crossing it.
Across all 90 frames the 16x16 tile is pixel-identical in both renders (zero
differing pixels and zero differing frames). The reproducible parameters and
measurements are in
`tests/OUTPUT/eggo-mania-visual_2026-10-06T14-19-12-859Z/`. This fixes the
translucent overlay defect in the non-Factory water path; it is not a full
ROM-versus-renderer comparison of every stage's water effect.

### Stable HiDPI canvas during jump and outline replay (2026-10-06)

The app resize loop previously reset its shared canvas to CSS dimensions on
every animation frame. Eggo Mania then enlarged the backing bitmap to the
device-pixel ratio in `onResize`, so the next frame immediately reset it again.
That repeatedly discarded the drawing context and defeated stable pixel-grid
presentation. The app now asks a game for its backing-pixel ratio, only changes
canvas dimensions when the target actually changes, and passes CSS dimensions
to resize callbacks. Eggo Mania requests the current device-pixel ratio and
keeps the HUD text/footer sized in CSS pixels.

The headless jump replay emulates DPR 1.25, verifies a 1580x851 backing bitmap
for a 1264x681 CSS viewport, and confirms the 2D context survives another
resize-loop pass without being reset. It renders three rows of native single
cell panel artwork while the actor jumps for 90 frames. The 21 cells remain
unchanged, no visible row is omitted, submerged tile interiors match the dry
control, repeated renders are identical, and the white outline stays on integer
board and output-canvas coordinates. Results and parameters are saved in
`tests/OUTPUT/eggo-mania-visual_2026-10-06T15-13-53-284Z/`.

This controlled full-row test does not reproduce the reported flicker. At jump
apex, camera-follow naturally scrolls the low rows below the viewport; they
return as the actor lands. A ROM replay from the same bot-built save lost four
player-field cells by frame 40 after holding Up; a neutral-input replay from
that identical save lost the same four cells at the same frame. Thus that
observed board change is not caused by jumping, though it is not a pixel-matched
reproduction of the user's exact stack. The ROM replays are preserved in
`scripts/OUTPUT/eggo-reference_2026-10-06_17-01-24_416695/` and
`scripts/OUTPUT/eggo-reference_2026-10-06_17-10-13_881379/`.

### Native BG3 animation phase at Hard Survival entry (2026-10-06)

The renderer had been adding the frame counter stored with the captured BG3
atlas (`563` for Factory) to every new match. That value is the source
capture's native time, not the start phase of a new Survival session. A
headless mGBA run from the Hard-selected menu shows the distinction: the menu
counter advances from 1116 to 1175 during 59 idle frames, then the new game
initializes its own scene counter. At the initial factory scene it is 1 for two
adjacent samples, then 2 on the next; it reaches 15 at the later sample. The
subsequent 15-frame samples advance exactly 15 counter units through 195.

At native counter 1, Factory BG3 row 11 selects source frame 0
(`0x08308394`) at rate 2; the GBA DMA queue contains that exact source,
destination and byte count. Thus a fresh match should use its own counter
directly in `floor(counter / rate) % period`. The renderer now does that; its
match clock begins at zero, which selects the same initial source frame as the
ROM's counter 1 because the captured row rates are 2, 4 or 8. It then advances
once per fixed game tick during the round. A separate `win8.state` replay
shows the counter restarting at 1 when round 9 initializes (height 43, stage
1); `startRound` now resets the model clock at that same boundary. This keeps
the next arena on its own native initial phase. `bg3StreamFrameIndex` and a
focused regression check the Game clock and all 128 streamed rows at every
arena's initial phase; `node --test
--test-name-pattern='animated BG3 rows start' tests/eggo-mania.test.mjs` passes.

The menu, entry and continuation RAM captures, ROM/core hashes and commands
are preserved in `scripts/OUTPUT/eggo-reference_2026-10-06_14-49-37_906322/`,
`scripts/OUTPUT/eggo-reference_2026-10-06_14-54-25_462278/` and
`scripts/OUTPUT/eggo-reference_2026-10-06_14-53-01_208518/`, plus the
round-transition trace in `scripts/OUTPUT/eggo-reference_2026-10-06_15-04-43_906068/`; the compact
measurements are in `tests/fixtures/eggo-bg3-phase-gba.json`. The entry
capture confirms the stream source selection, not whole-scene BG3 pixel parity.

### Partial-stack jump with the Factory waterline crossing the bottom row (2026-10-06)

The earlier jump test used only complete floors and could not distinguish
camera-follow from a problem in a partly filled lower stack. The focused
headless replay now places one complete floor and two partial floors (15
single-cell placements using the ROM panel artwork) in the Factory arena, with
the waterline crossing the bottom row. It holds jump for 40 of 90 frames at
1.25 device-pixel ratio.

The board remains at 15 cells throughout. Every fully visible cell differs
from the same frame with the board hidden; no visible cell is omitted, and
same-state renders have zero differing pixels. The landing outline's board
origin, snapped pixel origin and output-canvas coordinates are all integral
for all 90 frames. The camera naturally carries the stack out of view near the
jump apex and brings it back on landing. This controlled scene still does not
reproduce intermittent flicker, so it verifies the reported setup and guards
against renderer/canvas instability without claiming a complete reproduction.
Parameters and captures are in
`tests/OUTPUT/eggo-mania-visual_2026-10-06T15-18-03-905Z/`.

### Superseded: keeping the placed grid fixed during jumps (2026-10-06)

An earlier renderer change froze `boardCamera` at the last grounded pose so
that the tower stayed on screen. This was based on visual intuition and a
synthetic scene, not the native ROM. The fixed-input native capture later
settled the question: the placed tower scrolls with the foreground camera,
leaves the viewport near the jump apex, and returns on landing. The freeze was
therefore reverted. The 2026-10-06 output
`tests/OUTPUT/eggo-mania-visual_2026-10-06T15-56-51-153Z/` is historical and
does not represent current camera behavior.


### Rolling CPU search can finish without a placement (2026-10-06)

`NativePieceSweep.step()` returns `null` when its full candidate cycle ends
without a positive-scoring placement. `Game.updateCPU()` treated that sentinel
as an object and read `candidateSweep`, which crashed a fresh Hard match during
the long headless replay. The completed-search branch now keeps the null plan
and only inspects candidate properties when an object exists; the actor then
uses the existing no-plan/discard path.

A focused regression test forces the final scan position with no retained
choice and confirms the CPU update completes with no plan. A headless
Survival/Hard model-player run from `hard-origin.state` then advanced 12,000
frames without a runtime exception. It remained in active play at the end, so
this validates long-run stability for the captured interval, not a full match
or complete feature parity. The ROM/core hashes and all emulator traces are
preserved under
`scripts/OUTPUT/eggo-reference_2026-10-06_18-27-13_238030/`.

An initial attempt exposed an empty actor-atlas edge case in the trace writer:
if no podium actor is visible, the image would have zero width. The writer now
uses a transparent 64×64 atlas tile while retaining an empty image map; the
successful rerun saved the remaining trace metadata normally.

### Re-check the stack-jump report against the native checkpoint (2026-10-07)

The old `stack-before-jump.frame00840.state` was already airborne at capture:
player RAM has `world_y=608.4`, `vy=-1.1`, actor state 0, and a 20-cell board.
After 40 frames the board has 16 cells, but the same four-cell change also
occurs under neutral input. This checkpoint therefore cannot attribute the
change to a new jump or to rendering. Its traces are retained in
`scripts/OUTPUT/eggo-reference_2026-10-07_02-40-52_618725/` as diagnostic data.

A better native probe starts from a reproducible 600-frame input tape. The
first 600 key states from the earlier `bot-tower` trace were replayed as fixed
inputs from `hard-idle.state`, with the bot disabled. At frame 600 the new and
old captures match exactly: zero differing RAM bytes and zero differing
240×160 screenshot pixels. The recorded RLE input tape and its source hash are
in `tests/OUTPUT/eggo-input-replay_2026-10-07_03-16-26_086460/`; the exact
native replay and frame-600 save are in
`scripts/OUTPUT/eggo-reference_2026-10-07_03-16-28_810987/`.

That frame-600 checkpoint has 25 placed cells. Two separate 40-frame native
runs from its serialized state, one holding Up and one neutral, both retain all
25 cells; the player trajectories differ. The outputs are
`scripts/OUTPUT/eggo-reference_2026-10-07_03-16-43_302937/` and
`scripts/OUTPUT/eggo-reference_2026-10-07_03-16-44_391872/`. The actor's exact
ground-contact flag has not yet been identified, and the app has not yet been
run from this matched state. This is a useful native control baseline, not
proof that the reported user scenario is fixed.

### Full-screen frame-840 diagnostic status (2026-10-07)

The expanded state-restored fixture restores CPU cells, piece art, actor,
pickups and view state as well as the player. Its best measured 240×160 result
is now 238 differing pixels: zero in the player field, 182 in the divider and
56 in the CPU field. The CPU board camera `6.625` was selected by a 161-position
integer-pixel sweep and is still a screenshot fit, not derived from native
camera state. A decoded 8×8 sparkle reduces the CPU mismatch in the captured
completion frame, but does not model OAM-slot contention in ordinary play.
The report and rendered/source images are in
`tests/OUTPUT/eggo-mania-visual_2026-10-07T01-07-22-700Z/`.

The remaining 238 pixels are confined to x=112..140 and y=139..159: the
bottom of the center seam and a small part of the CPU field. The fixed seam
asset was verified against captures only for y=0..95. The frame-840 OAM dump
contains additional center sprites (objects 10–13) whose vertical positions
shift between captured frames 600, 720, 840, 960 and 1200. A diagnostic
composite of those native sprites, with the renderer's RGB565 green conversion,
reduces the image difference to 178 pixels, but the remaining priority and
position behavior has not been derived. Do not turn that one-frame composite
into a fixed runtime overlay; derive the native OAM update first.

The 600-frame native input tape has now also been run through the app. The
current probe restores approximate board/pickup state and the CPU timing,
travel, search and initial-key words from RAM, then runs the app's own CPU
policy. Native actor and key traces show that movement and action masks feed the
actor in the same frame: at frame 42, RIGHT+UP accompanies a two-pixel move;
at frame 118, the rotation mask changes orientation in that frame. The app now
passes the full emitted mask directly to the CPU actor instead of queueing
movement keys. The first CPU actor mismatch moved from frame 42 to frame 258,
and the first board mismatch moved from frame 104 (four cells missing) to frame
384 (three extra app cells). The app's emitted mask matches the native mask in
the same frame on 380/600 frames and the following frame on 356/599 checks.
At frame 258, the ROM emits RIGHT while the app emits no direction. The replay
does not restore complete hazard/environment state and explicitly disables
hazards in the app, so this mismatch cannot be attributed to the CPU policy
alone. CPU actor error eventually reaches 32 px horizontally and 104.13 px
vertically. A separate `stateful-cpu` replay matches 1,199/1,200 next-frame key
masks when actor and board RAM are refreshed from the ROM each frame; that
result checks policy decisions from synchronized state, not a complete
free-running replay. The checkpoint also lacks native per-cell art, complete
hazard/animation state, streamed BG3/OAM state and a validated camera mapping,
so its full-screen pixel counts are not valid parity measurements.
Current diagnostic output is in
`tests/OUTPUT/eggo-mania-visual_2026-10-07T04-48-01-239Z/`.

### Grounded stack jump: authentic gameplay control fixture (2026-10-07)

The earlier RAM-injected board fixture was unsuitable for visual comparison:
writing cell data does not make the ROM regenerate the corresponding tilemap
and graphics. The replacement fixture creates its seven placed cells through a
fixed input replay, and now includes the captured piece kind and rotation for
both actual placements. The first captured checkpoint still had buffered
actor velocity, so the native replay continued until a later state where the
actor was grounded and stationary. That authentic checkpoint has seven cells,
the true ROM waterline (`waterline=-2` in app coordinates), and the ROM BG3
global frame. The native ROM then receives Up for 40 frames and neutral input
for 50 more.

The focused `node tests/eggo-mania-visual.mjs --jump-stack-only` probe checks all
90 frames. All seven cells remain in native board RAM; their screen positions
follow the camera and all visible cells render without history-dependent
pixels. The app's sampled actor position, velocity, and peak height match the
native ROM within 0.002 cells. A separate RGB565-aware scan compares the
decoded placed-tile art against native 240×160 captures: its vertical origin
matches in all 11 frames with visible tile evidence (including the partially
clipped rise and landing frames). This established the shared camera and a
two-pixel BG0 origin offset. Outputs:
`tests/OUTPUT/eggo-mania-visual_2026-10-07T02-00-04-505Z/` and
`scripts/OUTPUT/eggo-board-camera_2026-10-07_02-01-16_237266/`.

This is a genuine grounded stack-jump regression, but it does not reproduce the
user's exact saved state and does not establish whole-screen pixel parity. The
600-frame native input tape was subsequently replayed through the app's player
model from reconstructed actor/pickup state, but it still does not restore the
complete native game state or compare the whole screen. The frame-840
CPU/divider mismatches remain open.

### Earlier player-only replay and post-throw camera (2026-10-07)

The same 600 key states were then sent through the app's player model from the
native trace's reconstructed actor and pickup state. Vertical actor position is
exact on every frame; horizontal position differs by at most two pixels, first
at frame 414 while holding Left against the tower edge. Board occupancy agrees
at every captured board event. The app probe still disables its CPU and does
not restore every RAM, OAM, camera, or streamed-background field, so it is not
a whole-screen parity test. Its final player-field image differs at 7,070
pixels from the native left field, and its initial field already differs at
4,181 pixels. These values are a baseline for isolating the remaining state
and rendering mismatches, not a success claim. Trace, screenshots and report:
`tests/OUTPUT/eggo-mania-visual_2026-10-07T03-28-11-069Z/`.

The replay exposed an app-only camera freeze: `advanceView()` stopped updating
the foreground and background cameras whenever `postThrow` was true, even
though the native player camera moves during the post-throw descent. Camera
updates now continue through that phase while `postThrow` still marks the
landing transition. Replaying the same 600 frames reduced the measured maximum
player-camera/ring-scroll error from 54 to 17 pixels and RMS error from 10.29
to 4.44 pixels. The residual camera mismatch, especially around camera limits
and throw transitions, remains open and needs ROM-derived behavior rather than
another screenshot-fit constant.

After the change, the authentic seven-cell grounded-stack jump still passes its
90-frame stability and render-history checks (`tests/OUTPUT/eggo-mania-visual_
2026-10-07T03-29-05-127Z/`). The focused Dragon-water comparison also passes
with zero tile-pixel changes (`tests/OUTPUT/eggo-mania-visual_
2026-10-07T03-30-36-421Z/`). Neither controlled test reproduces the user's
intermittent flicker, so the exact reported partial-stack scenario remains
unresolved.

### Hard Survival CPU replay with native hazard state (2026-10-07)

The first CPU actor mismatch in the earlier 600-frame partial replay was caused
by its `hazards:false` test setting, not by the CPU policy. The native trace
shows that replay frame 258 is native frame 821. A type-2 factory-secondary
enemy is active in the CPU field at X=-11.3125, Y=663.2, with VY=-2 px/frame;
its native contact center is below and within the CPU actor's vertical escape
window. Since `(821 & 511)=309`, the Hard avoidance gate (`50*6=300`) has
expired, so the ROM adds Right. The old test removed this enemy and therefore
reported no direction.

The focused visual replay now supplies the native CPU-field enemy state before
each CPU decision. Across all 600 frames, current-frame CPU masks and
actor-applied masks match 600/600 times; CPU actor position is exact on every
frame, and both field board occupancies match every native board event. A
separate RAM-synchronized `stateful-cpu` run matches 599/599 next-frame masks.
This verifies the CPU path given captured hazards, not the independently
simulated hazards or the complete player-field world.

### Hard Survival player wall-probe refinement (2026-10-07)

Ghidra export `scripts/OUTPUT/eggo-ghidra-actor-contact_2026-10-07_07-25-56/`
decompiled the actor update and contact helpers. `FUN_0800386c` and
`FUN_080038e0` read the current actor coordinates, test the horizontal body at
X−7 px or X+7 px, and pass Y−6 px to the cell probe. The model's existing
horizontal sample remains an empirical 11 px offset from its field anchor;
the vertical probe now maps the ROM's Y−6 to a pre-step grid row and no longer
extrapolates Y by velocity. This removes the previous frame-425 ascending
mismatch and the descending-contact regression from the global 6/16 test. On
the same 600-frame Hard tape, player Y is exact and X matches through frame 500;
the remaining error is 1.2 px during frames 501–505, when the native actor
remains at X=90 at the right edge. Both board occupancies still match every
event.

The helpers also contain signed guards at X<−12 px and X≥89 px. A direct model
clamp using those thresholds on `(egg.x-1)*16` removed the first local error but
created a later 8 px drift at frame 581, so that attempted translation was
reverted. The constants are confirmed; their mapping to the model's actor
origin/state must be derived before porting them. Do not retune another
fractional row bias. The evidence is in the Ghidra export and
`tests/OUTPUT/eggo-mania-visual_2026-10-07T05-31-39-801Z/`; the rejected direct
clamp replay is `tests/OUTPUT/eggo-mania-visual_2026-10-07T05-32-36-777Z/`.

The run's pixel differences (21,434 initially and 15,212 at frame 600) remain
invalid as full-screen parity scores because native cell ownership/art, full
player-field hazard state, streamed BG3/OAM and the camera coordinate mapping
are not restored. Input, hazard synchronization, screenshots, traces and
metrics are in the same `tests/OUTPUT` folder. The source enemy trace and
stateful CPU output are under
`scripts/OUTPUT/eggo-reference_2026-10-07_06-54-48_926040/` and
`scripts/OUTPUT/eggo-reference_2026-10-07_06-57-25_997195/`.

### Grounded 20-cell jump replay and renderer stability (2026-10-07)

The earlier jump fixture had only seven cells in two rows and did not represent
the partially built tower in the report. A reproducible frame-410 checkpoint
from the 600-frame Hard input tape has the actor grounded at world X=28,
world Y=640.899, VY=0, on a 20-cell stack spanning seven rows. Replaying 40
frames of Up and 50 frames of release in mGBA keeps the player board at 20
cells. Ten sampled actor positions/velocities are now replayed through the app;
all match within 0.002 cell. The model's board state has no changes, no visible
rows/cells are omitted, no fully visible cell is unrendered, and re-rendering
each same state gives zero different pixels. The earlier assertion that the
whole tower must leave the viewport at the jump apex was removed; the native
frame still shows part of this taller stack. This controlled case does not
reproduce the intermittent flicker and is not screenshot parity: the restored
checkpoint is still missing native ownership/art, full environmental state,
OAM and streamed BG3.

The source checkpoint contains no held piece, so the jump stability probe adds
native shape 6 at rotation 0 solely to exercise the outline renderer. The
outline is drawn on all 90 frames with zero grid-origin or pixel-snap error;
this synthetic piece does not validate the ROM's held-piece state. A direct
frame-40 comparison of the saved native player field and app render is in
`tests/OUTPUT/eggo-jump-frame-compare_2026-10-07T08-56-37-145195Z/`. It has
13,115 exact RGB differences out of 17,920 pixels and remains diagnostic only:
the replay state still lacks native field/environment/OAM details needed for a
valid full-screen parity assertion.

Checkpoint and follow-up native captures:
`scripts/OUTPUT/eggo-reference_2026-10-07_07-48-21_439783/` and
`scripts/OUTPUT/eggo-reference_2026-10-07_07-48-31_816139/`. The 20-cell fixture
is `tests/fixtures/eggo-grounded-stack-jump.json`; the old 7-cell fixture is
preserved separately. The one-run app verification is
`tests/OUTPUT/eggo-mania-visual_2026-10-07T05-56-00-259Z/`.

The camera scan was updated to clip source tiles against the viewport instead
of assuming a two-row board. Its best-fit vertical origins differ by 8 pixels
on frame 1 and by about 1 pixel on later sampled frames, but only a small
fraction of source opaque tile pixels match when board art is overlaid by other
native layers. Treat these fits as exploratory, not a derived camera rule. The
scan and its parameters are in
`scripts/OUTPUT/eggo-board-camera_2026-10-07_05-53-07_218487/`.

### ROM horizontal wall-probe data mapping (2026-10-07)

The reachable Ghidra export plus the Thumb listing in
`scripts/OUTPUT/eggo-instructions_2026-10-07_08-01-30_756286/` resolves the
probe's data addresses. Both directional helpers use a field manager whose
player root is `0x0200f404`: `+0x1248` holds the actor pointer and `+0x0c80`
lands on the player board byte array at `0x02010084`. In the grounded
checkpoint, `0x0201064c` contains actor pointer `0x02003bd4`, confirming the
manager-to-actor link. The CPU manager uses the same layout one field stride
later. Rows have an eight-byte stride for seven playable columns. The pixel
conversion adds one to `floor(x/16)`, and that resulting column indexes the
matching `Tower` column directly; subtracting one shifted the probe left.
`mapRow = floor(y/16)+2` maps to bottom-up `Tower` row `46-mapRow`.

`FUN_0800386c`/`FUN_080038e0` sample the current integer actor X minus/plus 7
pixels and Y minus 6 pixels, with guards at X<−12 and X≥89. When the edge
sample finds a cell, `FUN_08003620(..., 1)` checks the current cell and a
horizontal neighbor selected by `(X+32) mod 16`, treating an out-of-board
neighbor as occupied. The raw frame-274/275/276 RAM snapshots in
`scripts/OUTPUT/eggo-reference_2026-10-07_08-38-25_312761/` verify the byte and
row mapping at the former frame-275 mismatch. With the direct column mapping,
the fixed 600-frame input tape has exact player and CPU positions, current-frame
CPU masks, and both board occupancies at every recorded event. The validated
app replay is in
`tests/OUTPUT/eggo-mania-visual_2026-10-07T06-39-25-527Z/`.

### Grounded-stack camera follow trace (2026-10-07)

The frame-410 grounded-stack checkpoint starts with the player camera object's
`+0x04` position at 578 px, so its foreground shift from the 640 px world
reference is 62 px. The player actor is already 79.1 px above the floor; the
previous renderer test incorrectly inferred a 72 px camera shift directly
from actor height. The native ROM then moves the camera to 575 px after the
first jump frame (shift 65 px), 569 px after the second (71 px), 562 px after
the third (78 px), and 547 px by frame 8 (93 px). Camera Y remains the fixed
point product of position and scale (`scale=35904`, `camera_y=(position ×
scale) >> 32`).

The jump fixture now stores the original camera position plus all 90 native
camera samples, and the visual test restores that initial position instead of
guessing it from the actor. The application still changes from a 62 px shift
to 72 px on its first update, while the ROM changes to 65 px; maximum error is
7 px and several pixels persist during the descent. This identifies a missing
camera-follow/easing rule in `advanceView()`; it does not establish the
reported placed-cell flicker. Native probe data is in
`scripts/OUTPUT/eggo-reference_2026-10-07_09-08-49_907428/`; the updated
fixture and focused app report are `tests/fixtures/eggo-grounded-stack-jump.json`
and `tests/OUTPUT/eggo-mania-visual_2026-10-07T07-10-33-917Z/`.

### Camera tracker dispatch investigation (2026-10-07)

The ROM writes the foreground camera position in `FUN_080187b8` at
`0x08018be6`: it reads the halfword at `0x0200f3cc+4`, shifts it into 16.16,
and stores it at `0x02003914`. The CPU camera follows the same path from
`0x0200f3e8+4` to `0x02004c90` at offset `0x137c`. The ROM's direct camera
position is therefore observable and separate from the rendered parallax
registers.

At frame 0 of the grounded-stack checkpoint, `0x020003d8` contains state 1 and
its `+4` word contains state 4. The corresponding dispatch tables begin at
`0x0801882c` and `0x08018a20`; the active state-4 entry points to
`0x08018adc`. That handler selects camera configuration and reaches the shared
`FUN_0800d18c` setup path. This has not yet exposed the per-frame operation
that changes the tracker position, so it is not enough to implement the
camera follow law.

A direct current-actor-height trial matched the fixture's camera-position
samples from frame 3 through frame 90, but differed by 6 px and 3 px on the
first two frames. Pixel comparison of the same jump frames still showed large
image differences; the trial was reverted and the previous camera behavior
retained. The comparison fixture adds a synthetic held-piece preview and does
not restore all native render state, so it cannot be used as a parity score.
The translation that minimizes each full-field difference also changes over
the jump (−5 px at frame 1, +2 at frame 8, +3 at frames 18–56, then 0 at frames
72 and 90); this is a diagnostic clue only, not a camera fit.
Ghidra reports are under
`scripts/OUTPUT/eggo-camera-follow_2026-10-07_09-34-48/`,
`scripts/OUTPUT/eggo-camera-update-path_2026-10-07_09-37-37/`, and
`scripts/OUTPUT/eggo-camera-manager-update_2026-10-07_09-41-49/`. The camera
state tables were read with the Thumb ROM disassembler; their outputs and the
per-frame image comparisons are under `scripts/OUTPUT/eggo-instructions_*`
and `tests/OUTPUT/eggo-jump-native-parity_2026-10-07_09-44-03/`.

### Camera selector and held-throw interval (2026-10-07)

The camera follower's special-state test reads the actor action state at
`+0x874` and the animation-handler selector at `+0x854`. The selector table
at `0x0800eac0` is indexed by `selector - 1`; selector 2 maps to
`0x0800ed50`, selector 7 to `0x0800eaec`, and selector 8 to the shared
`0x0800ed5e` path. `FUN_08004908` holds the tracker when action state is not 2
and either the selector is 7/8 or action state is 4. The selector is not a
sprite-atlas row, so comparing it with `actorPose().row` incorrectly froze the
camera during ordinary free-rise poses.

Across the captured 600-frame two-field replay, selector-8 intervals started
with throw action state 4 and lasted 18 ticks; one player interval was
interrupted after 13 ticks by a new action state 4, which continued to hold the
camera. The app now models the 18-tick post-throw selector interval separately
from the longer `postThrow` fall state. The replay still is not a full native
state restore. Its direct tracker-position check is exact on 324/600 player
frames (3 px maximum, 0.763 px mean absolute error) and 114/600 CPU frames
(7 px maximum, 1.56 px mean absolute error); the remaining offset update and
BG3/parallax mapping still need reconstruction. Diagnostic output is in
`tests/OUTPUT/eggo-mania-visual_2026-10-07T09-51-27-827Z/`, and the targeted
Ghidra report is in
`scripts/OUTPUT/eggo-camera-selector-probe_2026-10-07_11-35-13/`.

### BG0 board update phase and jump-stack alignment (2026-10-07)

The native update order explains a remaining board-camera error. In
`FUN_08018e70`, the two field calls to `FUN_0800b074` update each field's
streamed row ring before the two calls to `actor_state_dispatch`. `FUN_0800b074`
derives the displayed map row and streams rows when the camera crosses an
8-pixel boundary. `FUN_08019a48` then configures BG0's scroll registers; its
`FUN_080033bc` helper rebuilds 21 row descriptors from the selected map and
tile-ring configuration. The board therefore uses the camera at the start of
the tick while the actor and its foreground tracker advance during the tick.

The renderer previously used the newly advanced actor camera for BG0 and added
a −2 px board-origin offset. It now retains the pre-update camera for the
platform, placed tiles, water, and landing preview, with a 0 px origin offset.
Against the native jump screenshots, the opaque-tile scan's top-row origin now
matches exactly in all eight sampled frames (frames 1, 8, 18, 32, 40, 56, 72,
and 90); the previous version differed by as much as 5 px. The 90-frame
controlled test also matches the previous native camera sample on all 90
frames, keeps all 20 cells, skips no visible rows/cells, and produces identical
same-state redraws. This isolates a real camera-phase bug, but the fixture still
does not reproduce the user's intermittent flicker or restore the full native
render state. The opaque-tile scan is a position diagnostic, not a complete
pixel-parity assertion.

Focused validation: `tests/OUTPUT/eggo-mania-visual_2026-10-07T10-06-10-192Z/`
and `scripts/OUTPUT/eggo-board-camera_2026-10-07_10-06-18_271117/`. The frame-840
reference regression still has 0 differing pixels in the 112×160 player field,
including all 5,976 checked placed-cell pixels and eight repeat renders; the
full two-field image remains 238 pixels off in the divider/CPU region.
`tests/OUTPUT/eggo-mania-visual_2026-10-07T10-06-35-926Z/`.

The targeted Ghidra report for the BG0 register helper is in
`scripts/OUTPUT/eggo-board-scroll-probe_2026-10-07_12-02-52/`.

### Full 90-frame stacked-jump visibility check (2026-10-07)

To check the reported disappearing/blinking rows rather than infer from a few
screenshots, the same ROM checkpoint and input (`UP` for 40 frames, then
release for 50) were captured at every frame. The app probe now optionally
captures the matching 90 frames with
`--jump-stack-only --jump-stack-every-frame`; the native runner used the same
state and input with `--snapshot-at` set to frames 1 through 90. An opaque
placement-art scan checks the expected prior-frame BG0 camera location on each
image instead of searching only the eight earlier samples.

The native and app top-row locations both match the expected grid coordinate
on 90/90 frames, with zero native-to-app vertical offset. The model retains all
20 cells, skips no visible row, renders every complete visible cell, and gives
zero pixel changes when the same frame is redrawn after clearing the canvas.
This no-water 20-cell checkpoint therefore does not reproduce the reported
blink. At the jump apex its native top row moves below the viewport; that is
camera scrolling, while the cell data remains intact. This result does not
cover the user's other stack, active-water states, or a full native-state
render comparison, so the flicker report remains open.

Native frame captures are under
`scripts/OUTPUT/eggo-reference_2026-10-07_12-18-58_882419/`; app frames and
the all-frame test report are under
`tests/OUTPUT/eggo-mania-visual_2026-10-07T10-22-18-636Z/`. Camera/art
comparison output, including the paired contact sheet and per-frame scores,
is under `scripts/OUTPUT/eggo-board-camera_2026-10-07_10-23-29_188433/`.

### Camera tracker and full replay refresh (2026-10-07)

The 600-frame capture exposed two camera errors in the app. On first entering a
ROM camera-hold state, the target used the previous actor height; while held,
the app also advanced its camera offset even though the ROM waits for
camera-position feedback. `view.js` now uses the current actor height at the
transition and skips the ordinary offset step while held. Foreground camera
tracker positions now match exactly on all 600 player samples and all 600 CPU
samples. This supersedes the earlier partial match counts documented above.

The camera fix reduced total full-screen RGB mismatches from 12,715,670 to
11,810,719 across the 600 captured frames, a 7.1% reduction. The first frame
still differs at 4,763 pixels and the worst at 32,271; no frame is yet an exact
match. These are not parity results because the app replay restores only part
of the native state, including approximate initial cell ownership, incomplete
player environment state, and no live native BG3/OAM updates. The ROM capture
now contains per-frame RAM, VRAM, palette, OAM, IO, and screenshots. An
independent replay of the ROM BG3 update stream matches all 101 changed map rows
and all 5,014 scheduled VRAM copies; nine copies remain queued after the final
capture. Artifacts:
`scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/`,
`scripts/OUTPUT/eggo-stage-bg-replay_2026-10-07_13-03-02_037358/`, and
`scripts/OUTPUT/eggo-replay-screen-compare_2026-10-07_13-22-56_158495/`.

The current jump-stack all-frame run is under
`tests/OUTPUT/eggo-mania-visual_2026-10-07T11-23-36-918Z/`. Its 90 camera and
board-camera samples are exact. It retains all 20 cells, skips no visible rows
or cells, and has zero repeated-render history differences. This no-water
checkpoint does not reproduce the reported flicker, so other stack/water
states and full native render parity remain open.

### BG3 CPU-window blend state during full replay (2026-10-07)

The 600-frame Hard capture has 65 frames in which `BG3CNT` is `0x0b01` instead
of the usual `0x1f87`: frames 73–91, 161–203, and 361–363. This is not only a
different scroll value. At those frames `BG3CNT=0x0b01` selects a priority-1,
4bpp text layer with character base 0 and screen base 11; `BG3HOFS=8` and raw
`BG3VOFS=432..450` (effective 176..194 on its 256px map). The same captured
frames set `BLDCNT=0x1748`, `BLDALPHA=0x040c`, and `WININ=0x3c13`. `BLDCNT`
selects BG3 as the first alpha target and BG0/BG1/BG2/OBJ as second targets;
`BLDALPHA` is the 12:4 blend. `WIN1H=0x80f0` and `WIN1V=0x00a0` cover the
right-hand CPU field (x=128..239, y=0..159), while the `WININ` high byte
`0x3c` enables BG2, BG3, OBJ, and color effects there. The usual `0x1c13`
mask has that color-effect bit clear.

Ghidra's `FUN_08019cc8` at ROM address `0x08019cc8` writes the mode and
blend/window values into the LCD shadow block around `0x020314ac`. The handlers
at `0x08019b7c` and `0x08019be4` both wait for DISPSTAT HBlank before copying
shadow values to hardware. The first writes BG1CNT/HOFS/VOFS plus BLDCNT and
WININ; the second writes BG3CNT/HOFS/VOFS plus BLDCNT and WININ. The routine computes
`((s32[0x02003bb8] - s32[0x02003914]) >> 16) + 15` and
`((s32[0x02004f34] - s32[0x02004c90]) >> 16) + 15`, compares the results, and
selects window/blend configurations. The exact transition is now verified
against the full 600-frame capture: for all 599 transitions (frames 2–600),
the alternate mode is active exactly when the previous frame's CPU waterline
screen Y is below 160. For all 65 alternate frames,
`BG3VOFS & 0xff == (0x4f - previous_cpu_waterline_screen_y) & 0xff`; this is
the one-frame phase of the display-register update, not an actor-height rule.
The reproducible audit is `scripts/eggo-audit-bg3-compositor.py`, with
per-frame data and parameters in
`scripts/OUTPUT/eggo-bg3-compositor-audit_2026-10-07_15-59-24/`.

The CPU-field screenshot is now reproduced exactly by composing the register
phases line by line on all 65 alternate frames. The boundary is previous CPU
waterline screen Y + 1: on frame 73, RAM at `0x020314a4` is `0x9d28`, so the
normal phase applies through line 157 and the alternate phase starts at 158.
For normal lines, use the last preceding normal BG3 register set, current
BG2VOFS, and the previous CPU camera's `camera_y` low byte from `0x02004cfc`.
That low byte is also the effective BG3VOFS on every one of the 534 normal
transitions in the 600-frame capture. `camera_y` is field-root + `0x70`; the
existing fixed-point camera conversion (`camera_position * 0x8c40 >> 32`)
reproduces it exactly on all 600 captures. For alternate lines, use the current
frame's BG3/BLDCNT/WININ registers, current-frame VRAM/palette/OAM, and RGB565
conversion with green preserved as `g5 << 1`. The compositor matches all
17,920 CPU pixels per frame with zero differences across all 65 alternate
frames. The corrected implementation and per-frame records are in
`scripts/eggo-scanline-generalization_2026-10-07_17-02-35/`; the register
search results are in
`scripts/OUTPUT/eggo-waterline-scroll-search_2026-10-07_16-53-09/`.

This establishes the CPU-field split for the captured alternate frames, not
player-field composition, animated water-map updates, or whole-screen replay.
The earlier single-state BG2/BG3 comparison was invalid because it applied the
final register snapshot to every scanline. Register and screenshot samples are in
`scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/`; the extracted
function is in
`scripts/OUTPUT/eggo-ghidra-survival_2026-10-06_12-02-28/survival-reachable-decompiled.c`.
The audit of all 600 IO files, which verifies the 65-frame intervals and
constant blend/window state, is reproducible with
`scripts/eggo-audit-bg3-compositor.py`; its parameters, results, and per-frame
register CSV are in
`scripts/OUTPUT/eggo-bg3-compositor-audit_2026-10-07_15-26-32/`.

The two compared positions above are field waterlines, not actor positions:
`0x02003bb8` and `0x02004f34` are each field root plus `0x87c`, the waterline
field also traced by `native_collapse`; the subtracted values are the matching
camera positions. The compositor therefore computes each waterline's screen Y
before selecting its window configuration. In the captured intervals the CPU
waterline is near the lower edge of the screen (roughly Y=141..162) while the
player waterline remains below it (Y=166..195), tying this BG3 mode to the
visible water surface. Decoding screen base 11 and its 4bpp tiles directly
from the captured VRAM shows a mostly static source map with occasional small updates:
several adjacent active frames have identical source maps, while transitions
and a few animation ticks change only about 1–3% of map pixels. This supports
reconstructing a water-layer texture plus its sparse updates rather than
guessing a normal-background scroll. Reproduce the analysis with
`scripts/eggo-analyze-waterline-bg3.py`; its frames, parameters, CSVs, and PNGs
are in `scripts/OUTPUT/eggo-waterline-bg3-analysis_2026-10-07_15-53-22/`.

### Factory player BG1 ring origin (2026-10-07)

The player's normal factory ring is sourced from BG1, whose map origin is one
pixel below the foreground camera tracker. At captured frame 219, the native
BG1 layer matches the streamed ring image at source offset 301 while the
measured `camera_y` is 300. This is an exact match across all 17,920 pixels,
including visibility and color; offsets 300 and 302 each differ in more than
10,000 pixels. This single-frame result initially appeared to require a `+1`
origin; the follow-up below identifies the one-tick camera phase. The CPU BG3
ring remains separately aligned at source offset 329 from its effective
`BG3VOFS=73`. This verifies ring registration for the captured state, not the
full-scene BG2/BG3/OBJ composition. Reproduce it with
`scripts/eggo-audit-factory-ring-scroll.py`; parameters and pixel comparisons
are in `scripts/OUTPUT/eggo-factory-ring-scroll_2026-10-07_15-42-35_192449/`.

### Player BG1 camera phase follow-up (2026-10-07)

The frame-219 `camera_y + 1` was a one-update phase, not a special ring origin.
In each of the 514 capture frames with normal `BG1CNT=0x1f87`, the low byte of
`BG1VOFS` equals the previous frame's player camera Y exactly. It equals the
current camera Y on only 320/514 frames. For example, frame 13 has current
`camera_y=335`, prior `camera_y=336`, and `BG1VOFS=80`; frame 218 has current and
prior `camera_y=301` and `BG1VOFS=45`; frame 219 has current `camera_y=300`,
prior `camera_y=301`, and the same `BG1VOFS=45`. `advanceView` now preserves
that pre-update tracker as `nativeBoardCameraY`, and the player ring samples
row `256 + (nativeBoardCameraY mod 256)`. The waterline-based `0/+1` switch is
removed. This corrects register timing for the normal player ring; it does not
establish whole-screen parity. Reproduce the 514-frame register audit with
`python scripts/eggo-audit-player-bg1-camera-phase.py`; its CSV, parameters and
results are in
`scripts/OUTPUT/eggo-player-bg1-camera-phase_2026-10-07_19-59-38_227199/`.

### Frame-840 factory waterline follow-up (2026-10-07)

The frame-840 replay fixture now restores both native camera trackers from RAM:
player `camera_position=635` (`0x02003914`) and CPU `camera_position=534`
(`0x02004c90`). Before this correction the renderer kept the initial ring
positions and the player field differed by 6,072 pixels. Restoring both cameras
reduced the player difference to 4,553 and the CPU field difference to 56.
This capture has player waterline `760` at screen Y=140, `BG1CNT=0x0b01`,
`BG1VOFS=451`, and `BLDCNT=0x1d42`; frame 219 instead has the normal
`BG1CNT=0x1f87`, no blend, and a waterline below the viewport. On the
unoccluded player background pixels, source ring offset 347 (camera_y=347)
matches 6,180/6,251 pixels, whereas offset 348 matches only 981/6,251. The
remaining 898 differences were caused by two missed parts of the same native
water scene. OAM sprites 24 and 25 are the 64×32 wave halves at X=-8 and X=56;
they cover the player's field, but the renderer had mistakenly drawn the atlas
on the CPU field. The renderer now draws them on the player field at the
captured origin. The other 268 pixels were all green-only errors: canvas green
is six-bit RGB565, so converting it directly with `round(g8*31/255)` sometimes
lost one source bit. The exact inverse for the shifted five-bit GBA channel is
`round(g8*63/255)>>1`. After correcting both issues, the muted frame-840 test
matches the complete player field exactly (17,920/17,920 pixels), including
the water and all 5,976 checked unoccluded placed-tile pixels. Eight repeated
renders also remain identical. The full-screen diagnostic has 238 remaining
differences, all in the bottom center seam (182) and CPU field (56); those
layers remain open. The focused 60-phase CPU-waterline test reports zero
differences in 40,320 compared pixels. Artifacts are in
`tests/OUTPUT/eggo-mania-visual_2026-10-07T17-09-16-900Z/` and
`tests/OUTPUT/eggo-factory-waterline-bg3_2026-10-07T17-09-48-025Z/`.

### Frame-840 divider OAM isolation (2026-10-07)

The full-screen mismatch in the 16-pixel divider is not a color error in its
static rail asset. In the frame-840 raw OAM capture, objects 10–13 are 8×32
sprites placed over the rail at (112,151), (120,151), (112,149), and
(120,139). Compositing these four native sprites in OAM priority order over
the app screenshot removes all 182 divider mismatches. The extracted PNGs use
RGB555 channel expansion, while the captured framebuffer is RGB565; converting
green back through `round(g8*31/255)` and expanding it as `(g5*2*255//63)` is
required before overlay. The remaining 56 pixels are in the CPU field.

The sprite overlay is only an offline diagnosis, not installed runtime logic.
Across the existing 600-frame replay, objects 10–12 alternate between two tile
bases in several unequal intervals (frames 1–126, 127–146, 147–237,
238–317, 318–372, 373–531, and 532–600); object 13 also changes tile base and
its screen Y changes between 142 and 146. The decoded pixels for each object
match across seven sampled frames covering every observed tile-base interval,
so the address swap itself does not change the visible art. The runtime still
needs the position/state rules before it can draw these sprites correctly.
Recreate the offline overlay with
`python scripts/eggo-compose-divider-oam-diagnostic.py`; its source hashes,
parameters, images and comparisons are in
`scripts/OUTPUT/eggo-divider-oam-overlay_2026-10-07_19-33-14_347345/`. A temporary edit
that removed CPU owner 40 from the fixture raised the CPU residual to 60 (and
the full-screen residual to 242); it was reverted, so keep the fixture as it
was. The existing muted Electron reference run remains at 238 whole-screen
differences, with the full player field exact. This still falls short of
full-screen parity.

### Frame-840 CPU singleton art rotation (2026-10-07)

Correction, 2026-10-18: this captured cell requires the raw filler/concrete
map row. It does **not** establish how ordinary singleton throws commit.
All four independently captured singleton inventory rotations commit the
ordinary `[43,44,50,51]` quad. Normalize only ordinary singleton commits;
keep the raw lookup for captured filler and bonus art.

The 56 CPU-field pixel mismatch came from the only visible cell of owner 40,
not from the waterline or the piece mask. It is a one-cell kind-2 piece, so its
geometry does not reveal its orientation. The native BG2 map at the cell
contains descriptors `[45,46,52,53]`, which match the factory kind-2,
rotation-1 placement map. The fixture had defaulted the orientation to zero,
and `nativeCellArt` then forcibly reset every singleton to rotation zero. Both
assumptions were wrong: the fixture now records rotation 1 and the renderer
preserves the supplied ROM rotation for singleton masks.

The focused muted Electron `--reference-only` check now reports zero differing
pixels in the player field and zero in the CPU field; the full-screen mismatch
falls from 238 to 182 pixels, all in the center divider. It also reports zero
unoccluded player-cell differences and zero repeated-render changes. The
captured source and app images, comparisons, and mute check are in
`tests/OUTPUT/eggo-mania-visual_2026-10-07T18-01-32-910Z/`. This resolves the
CPU art mismatch for the captured frame; other singleton rotations still need
native placement traces.

### Boots pickup effect follow-up (2026-10-07)

A framewise native replay of `boots-catch.state` used the same input sequence
as the earlier boots measurement and captured graphics with each video frame.
The native boots timer reaches 600 at frame 23 and is still 573 at frame 50.
The previous runtime drew four invented yellow sparkles on every active-boost
frame, so it produced a persistent effect the native capture does not show.
That placeholder has been removed. The short native pickup-particle burst is
still not reconstructed; do not replace the removed aura with guessed art or
timing. The replay and native frame captures are in
`scripts/OUTPUT/eggo-reference_2026-10-07_19-42-07_494679/`.

An exact decoded-RGBA comparison found all eight distinct 8×8 OAM29 images
somewhere in that 50-frame boots capture. This is not enough to call them
boots-pickup particles: seven of the eight images already appear before the
boots timer activates at frame 23, and the same animated objects are present
in both fields. The focused crop/OAM audit finds additional nearby 8×8 objects
starting at player-field `(61,102)` on frame 28 and `(38,100)` on frame 32,
five and nine frames after activation. These are candidates for the burst, but
proximity and timing do not establish their cause. Keep the effect unresolved
until a second controlled capture or the ROM update routine confirms it.
Audit script and frame-by-frame records:
`scripts/eggo-audit-boots-catch-oam.py` and
`scripts/OUTPUT/eggo-boots-catch-oam_2026-10-08_04-24-33/`; exact sprite
matches:
`scripts/OUTPUT/eggo-boot-particle-oam-match_2026-10-08_04-17-51/`.

### Center-divider OAM placement (2026-10-07)

The 182 frame-840 center-seam pixels came from four native 8×32 objects, not
from the static BG divider. The renderer now uses the captured OAM art for
objects 10–13: objects 10/11 share `assets/native-divider-waterline.png`, and
objects 12/13 share `assets/native-divider-progress.png`. They are drawn in
native priority order after the two fields.

Ghidra routine `0x0801a380` supplies the positions. For the current mode, it
uses `floor(27 * waterline_integer / 128) - 9` for objects 10/11, where
`waterline_integer` is the signed high word of the field root's Q16 waterline
at `0x02003bba` (player) or `0x02004f36` (CPU). Objects 12/13 use
`floor(27 * (47 - completed_floor_count) / 8) - 9`, reading the completed-floor
count at actor `+0x934` (`0x02004508` player, `0x02005884` CPU). The two X
positions are 112 and 120 in a seven-column field. The model retains the
pre-update floor count for rendering; this reproduces the one-frame OAM delay
visible at frame 219 after the CPU's count changes.

`python scripts/eggo-audit-divider-oam.py` compares those four coordinates
against all 600 captured RAM/OAM frames and the frame-840 checkpoint. It
matches 599/600 replay frames; the one remaining sample is the intentional
one-frame delay at frame 219, and the frame-840 checkpoint is exact. A muted
Electron `--reference-only` render now matches the full 240×160 GBA screenshot
pixel-for-pixel, including the seam. Audit output:
`scripts/OUTPUT/eggo-divider-source-audit_2026-10-07_20-24-56_335867/`;
renderer comparison:
`tests/OUTPUT/eggo-mania-visual_2026-10-07T18-27-20-792Z/`.

### Dynamic actor OAM pose timing (2026-10-07)

The player and CPU actor sprites do not stay at one OAM index. The new
`scripts/eggo-audit-actor-pose-parity.py` scans all 128 entries per frame and
decodes sprites from the complete 0x18000-byte `memory3` VRAM capture. This
finds the actor by its decoded 64×64 mask and palette, then compares the actual
native pixels and selected app atlas frame. The audit writes its parameters,
per-frame CSV and summary JSON together under `scripts/OUTPUT`.

Three measured pose-clock corrections are now in `view.js`. The player's final
throw cel remains visible for three actor updates after action state 4 ends;
intermediate throw cels use a two-update phase delay. Native OAM switches from
rise to float at about 1.6 screen pixels per frame, while the app previously
waited until 1 pixel per frame; the float animation also begins two phase ticks
earlier. The CPU retains the selector-8 free-air pose for 19 displayed updates,
including the extra frame caused by OAM being updated before the actor handler.

The latest 600-frame replay was run with Electron `--mute-audio`. Player and CPU
positions, board occupancy and camera positions match the native trace on all
600 frames. Native sprite pixels are represented exactly by the source atlas
in all 232 detected player frames and all 531 detected CPU frames. The app pose
matches 191/232 player detections and 331/531 CPU detections; among uniquely
identified native poses there are still 40 player and 32 CPU timing/state
mismatches. The player residual includes native atlas row 13 under animation
selectors 2 and 5, including a 21-frame grounded interval; the capture does not
yet identify the state transition that selects that pose. Some rise poses also
differ when the app's held-item model says the actor has a piece. Do not assign
row 13 to an app state or alter held-state rendering until the relevant native
actor and inventory fields are decoded.

The last screenshot in this replay still differs by 1,506 pixels, so actor pose
improvements do not establish full-scene parity. Replay and OAM audit outputs:
`tests/OUTPUT/eggo-mania-visual_2026-10-07T21-15-51-736Z/` and
`scripts/OUTPUT/eggo-actor-pose-parity_2026-10-07_23-16-11/`.

### Selector-5 moving-fall pose (2026-10-07)

The native actor-resource audit found that selector 5 uses a distinct
fall-while-moving animation from resource group 12, pictures 0 and 1. The
runtime character atlas now includes those original decoded images in row 15,
after the existing special-pose rows. The player selects this row only while
descending with horizontal movement; its two images advance every eight actor
updates. Captured phase matches require a one-update start delay when the air
trajectory begins in a fall and two updates when it begins rising or floating.
This maps all 98 group-12 appearances in the 600-frame Hard replay to the exact
native picture and phase. A filtered unit test checks row selection and the
eight-update cadence.

The updated full actor audit represents all 330 detected player OAM samples
with decoded atlas art and matches 287 app poses; 42 identified samples still
differ. These include native group-1 picture 0 under selectors 2 and 5 and
unresolved held/free airborne transitions. The CPU has 32 identified timing
mismatches. This change does not resolve full-scene composition or pixel parity.
Replay and audit data are in
`tests/OUTPUT/eggo-mania-visual_2026-10-07T21-47-06-444Z/` and
`scripts/OUTPUT/eggo-actor-pose-parity_2026-10-07_23-47-25/`.

The replay also captured the app at every frame for an exact whole-screen
comparison. Player and CPU positions, camera positions and board events remain
exact on all 600 frames, but 0/600 screenshots are identical: 2,421,170
frame-pixels differ in total, with 3,954 at frame 1 and 8,203 at the peak
(frame 191). The CPU half contributes 1,446,208 differing pixels and the player
half 973,346. This confirms that full-scene layer and sprite composition is
still the main blocker. The Electron replay was muted. Contact sheet and exact
comparison are in
`tests/OUTPUT/eggo-mania-visual_2026-10-07T21-50-42-703Z/` and
`scripts/OUTPUT/eggo-replay-screen-parity_2026-10-07_21-51-03_305680/`.

### Snapshot player facing with the native OAM state (2026-10-08)

The actor render snapshot now retains the pre-update facing direction along
with position, camera, pose and held item. The player atlas had been mirrored
from the actor's post-update facing value even though the ROM builds OAM before
that actor update. A muted 600-frame Electron replay changed 6,170 app pixels;
the exact native screenshot difference fell from 1,851,488 to 1,849,606 pixels
across 23,040,000 comparisons. Five frames improved and five regressed, with
590 unchanged; frame 275 improved by 955 pixels, while frame 60 regressed by
386. Thus the previous-facing snapshot is a net improvement but the transition
is not yet modeled consistently. Keep investigating the state-dependent facing
handoff; full-screen parity is still open, with 0/600 exact frames and frame
191 still the worst at 7,139 pixels. The test records `audioOutputMuted: true`.
The frame-by-frame delta and hashes are in
`scripts/OUTPUT/eggo-facing-snapshot-delta_2026-10-08_03-01-20_610202/`; the
muted replay is in `tests/OUTPUT/eggo-mania-visual_2026-10-08T03-00-30-555Z/`.

### State-dependent player sprite orientation (2026-10-08)

A 64-frame native left/right probe confirmed that OAM's horizontal flip changes
one frame after a movement-direction change. Every captured left and right walk
sprite exactly matches the corresponding atlas image with the native OAM
transform. A 600-frame exact-color atlas audit found a separate rule: the
player's `throw`, `idle-free`, `rise-free`, `float-free`, and `fall-free` poses
remain unflipped, even when the stored movement direction is left. The renderer
now preserves those pose orientations while retaining directional mirroring
for walking and the verified held/fall-moving clips.

The muted full replay reduced app/native differences by 56,324 pixels, from
1,849,606 to 1,793,282. 188 frames improved; 24 regressed by 273 pixels total.
The CPU region was unchanged, and no whole frame is exact yet. The validation
recorded `audioOutputMuted: true`. Native captures and per-frame orientation
records are in `scripts/OUTPUT/eggo-player-facing-probe_2026-10-08_05-08-43/`
and `scripts/OUTPUT/eggo-player-facing-state-audit_2026-10-08_05-13-28/`; the
muted replay and comparison are in
`tests/OUTPUT/eggo-mania-visual_2026-10-08T03-15-35-654Z/` and
`scripts/OUTPUT/eggo-replay-screen-parity_2026-10-08_03-15-56_916914/`.

### Factory rival selector-2 idle ordering (2026-10-08)

The native Hard replay's per-frame EWRAM seed matches the app's shared global
RNG state on all 600 frames after restoring the checkpoint seed `27399`. The
player and CPU consume the same selector-2 animation draws in the same order;
the CPU's native phase matches all 80 selector-2 samples. Comparing decoded
OAM art with the Factory rival atlas shows its idle cel index is reversed from
the phase bit: selector-2 phase 0 draws atlas cel 1, and phase 1 draws cel 0.
The same ordering applies to the held and free-hand idle tables. The app now
reverses that bit for Factory idle poses. A separate transition exception
shows the new rise table immediately after selector-8 free-air ends, instead
of retaining the final post-throw cel.

With both fixes, 586/600 CPU pose candidates match native OAM (up from 514
with the direct idle mapping); every uniquely identified pose matches. The
600-frame full-screen comparison remains incomplete: it has 0/600 exact
frames and 1,738,810 differing frame-pixels, so this result measures a local
improvement, not complete rendering parity. The replay used Electron
`--mute-audio`; per-frame captures and audit data are in
`tests/OUTPUT/eggo-mania-visual_2026-10-08T04-01-35-106Z/`,
`scripts/OUTPUT/eggo-actor-pose-parity_2026-10-08_06-01-51/`, and
`scripts/OUTPUT/eggo-replay-screen-parity_2026-10-08_04-01-51_909534/`.

### Held-rising player pose table and audit filename normalization (2026-10-08)

The seven remaining player pose misses used selector 5's held-rising table,
`0x083f228c`, which had no native art entries. The phase map confirms the two
visible cells are `yolko-player-poses.png` row 2 columns 0 and 2. Because the
game prepares OAM before advancing the actor, phase 0 selects column 0 and
phase 1 selects column 2 for the displayed frame. The map now includes both
cells. The separately verified held-moving-fall mapping at
`0x083f22ac` remains on `yolko-native-poses.png`.

`eggo-audit-actor-pose-parity.py` also compared runtime sheet keys without a
`.png` suffix against atlas filenames with one. It now compares normalized
stems. On the same muted 600-frame replay, this reports 600/600 player pose
matches (548 uniquely identified poses, with no identified mismatch); CPU pose
coverage remains 586/600 candidate matches. The overall exact screenshot count
remains 73/600. Total mismatched frame-pixels fell from 453,711 to 450,602,
while frame 191 remains the worst at 3,526 pixels. Player/CPU positions,
cameras and board occupancy still match all 600 frames. These results do not
establish whole-scene or full Survival parity. Replay and comparisons are in
`tests/OUTPUT/eggo-mania-visual_2026-10-08T10-49-43-336Z/`,
`scripts/OUTPUT/eggo-actor-pose-parity_2026-10-08_12-51-01/`, and
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-08_12-50-04_411787/`.

### Held-piece preview capture before the consumption update (2026-10-08)

The native renderer builds OAM before the actor update. On the CPU's frame-191
throw transition, that means the native 64×64 held-piece outline is still
visible for the displayed frame even though the update consumes `held` and
starts `placing`. Querying `tower.preview()` after the update returned no piece,
so the app dropped the outline. `updateTower` now snapshots the native preview,
its held-state identity/content, and the in-flight affine visual immediately
before the update. The renderer uses that snapshot only when the update changed
the held state. A rising-player throw-start is an exception: the native throw
OAM has already taken over on that displayed frame, so it keeps the live
no-preview result. Focused tests cover both transitions.

The muted 600-frame replay before that final rising-player guard improved from
73 exact frames and 450,602 differing frame-pixels to 74 exact frames and
447,170; frame 191 fell from 3,526 to 3,296 differences. The broader snapshot
also made frame 164 worse by 231 pixels. The final state-gated exception
restores that frame's former preview behavior, leaving an offline projected
total of 446,939 differing pixels; this projection has not been verified by a
post-guard Electron replay. `node --test tests/eggo-piece-preview.test.mjs`
passed all six focused tests after the final code change. Every Electron run in
this work used `--mute-audio` and recorded `audioOutputMuted: true`.

The latest full capture and exact comparator are
`tests/OUTPUT/eggo-mania-visual_2026-10-08T11-22-50-360Z/` and
`scripts/OUTPUT/eggo-replay-screen-parity_2026-10-08_11-23-18_433363/`.
The frame-191 HBlank audit uses that same capture and attributes 1,279 CPU
mismatches to native BG2/BG3 and 565 to OAM. Its diagnostic overlay leaves
1,197 mismatches, so raw BG replacement is not a valid fix; the next graphics
priority is to reproduce BG2/BG3/OBJ ordering in the live renderer. Whole-scene
pixel parity and Survival behavior remain incomplete.

### CPU BG3 HBlank priority validation (2026-10-08)

One muted autonomous replay after the preview and alternate-waterline fixes
produced 74 exact full frames and 444,359 differing pixels over 600 frames.
Both actors, cameras, hazards, board events and RNG matched the native capture
on all frames; each field's pickup state differed for one transient frame.
Frame 191's CPU crop had 1,783 pixel differences: normal phase BG2/BG3 had
69/493, alternate phase BG2/BG3 had 133/523, and OBJ layers had 565.

The frame-level I/O dump at frame 191 captured the alternate HBlank register
set (`BG3CNT=0x0b01`, priority 1); normal scanlines use `BG3CNT=0x1f87`
(priority 3). Treating the captured alternate priority as a whole-frame rule
and repainting the entire CPU ring above the scene raised the 600-frame pixel
difference to 858,782. That change was reverted. Keep the current BG3
restoration limited to the measured alternate waterline strip and derive any
broader ordering from the per-scanline window/register state. The muted failed
trial and its offline audits are retained in
`tests/OUTPUT/eggo-mania-visual_2026-10-08T12-00-29-154Z/`,
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-08_14-01-08_968750/`, and
`scripts/OUTPUT/eggo-hblank-layer-attribution_2026-10-08_12-01-09_188352/`.

With the matched frame-191 native layer captures, the app's best ring-source
alignment is player offset 317 and CPU offset 347; the app-vs-BG layer still
has 1,024 player and 1,125 CPU color differences at those offsets. Scroll
registration is therefore consistent, while exact layer content/composition
remains unresolved. The corrected audit output is
`scripts/OUTPUT/eggo-factory-ring-scroll_2026-10-08_11-55-09_855738/`.

### CPU board camera-origin audit (2026-10-08)

An initial replay audit compared CPU board events to BG0 and reported apparent
vertical offsets. That layer is not a valid CPU-board oracle: it contains a
background copy of panel artwork which can match the placed-cell atlas exactly
at the wrong position. The frame top-layer map identifies BG2 as the active CPU
board layer. On four representative frames, the best BG2 and app-screenshot
origins agree and match the app camera: frame 2 at y=139, frame 32 at y=129,
frame 191 at y=102, and frame 231 at y=134. This rules out a shared camera
offset as the cause of the remaining pixels; art color and layer composition
still need work. Do not use the earlier BG0 origin measurements to change
`boardCamera` or `boardOriginOffsetY`.

The offline audit now compares BG2 and the app screenshot, verifies the frame in
the compositor results against the requested replay frame, and checks the
captured PNG hash. The compositor now writes the requested frame and state/data
offsets into its parameters; earlier output folders left the default `frame=73`
there even when `results.json` and the PNG represented another requested
frame. New reproducible outputs are listed in `AGENT_GUIDE.md`.

### Exact Factory replays and water recovery (2026-10-18)

This supersedes the earlier partial-replay counts. The complete fixed 600-frame
Factory/Hard input tape matches 600 native 240x160 PNGs with zero different
pixels (23,040,000 compared pixels). A fresh run after water/splash changes is
`tests/OUTPUT/eggo-mania-visual_2026-10-17T22-00-46-831Z`; the reproducible
comparison is `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_00-01-23_187515`.
Both actors, board events, cameras, CPU inputs, hazards, pickup managers and
the three RNG streams also match. These autonomous runs consume the input tape
and selected initial checkpoint state; native traces are comparison data only.
The checkpoint image itself differs by 1,685 pixels and is not part of that
claim. Other arenas, histories, transitions and the full game remain unproven.

The reported water/solid-row snag was an actual collision-state error. ROM
`0x0800df16`/`0x0800f878` retain state 1 throughout creature carry. Normal tower
support tests must not run in this state. Entry tests the old dry Y plus 17 px,
then performs dry integration, discards inventory, and initializes timer 90.
Swimming uses signed Q16 forces and floor rounding of 15/16 drag. Countdown 49
spawns the creature (`0x08013a7c`); carried Y is creature Y minus 26 px. The
camera and secondary enemy observe the swimming body's integrated Y BEFORE
that overwrite. Release retains its transition tick and then kicks at -3.5
px/tick. After release the support probes must distinguish solid blocks above
both feet from a genuine opening; no invented floor at Y=0 is permitted.

The portable fixture `tests/fixtures/eggo-water-recovery-gba.json` compares 940
native trajectory samples across an ordinary-input empty-board run and logged
diagnostics with 8/20 solid rows and a real opening in a 20-row stack. Actor
position, velocity, states and foreground camera match exactly. Creature states,
animation clocks, splash flags and selected raw OAM frames also match. Each
diagnostic row uses a separate piece owner, respecting the ROM component bound.

The separate ordinary-input 220-frame water tape now matches every pixel too
(8,448,000 pixels), together with all measured gameplay state and random streams.
Native capture: `scripts/OUTPUT/eggo-reference_2026-10-17_19-07-21_269233`.
App: `tests/OUTPUT/eggo-mania-visual_2026-10-17T22-00-28-098Z`.
Comparison: `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_00-01-01_060345`.
The remaining differences before this fix were missing splash sprites, omitted
selector-11 airborne pictures, and reversed restored pickup draw order. Rewriting
the water BG blend was tested and rejected because it made correct pixels wrong.

Splash creation `0x0801a168` stores a Q16 center and gap width (8 px for actor
entry, 16 px for creature return). `0x08019f74` selects frames 0..15 from
`0x083f1e64`, two ticks each, visible beginning the next tick. For center X and
gap W the left sprite starts at floor(X-W/2)-16, the mirrored right sprite at
left+W+32. Y is previous integer waterline minus previous integer camera minus
4. Their OBJ priority 0 places them above water BG1/BG3 and all gameplay bodies,
below the surface OBJ. Per-arena palette bank 8 and actual ROM-decoded art are
stored in `water-splash-{stage}.png` and provenance in `water-splash.json`.

### Longer Factory input tape: independent causes (2026-10-18)

The ordinary-input tape was extended from 600 to 1,800 frames using only
recorded button bytes, starting from the same unmodified `hard-idle` state.
The new native capture is
`scripts/OUTPUT/eggo-reference_2026-10-18_00-17-03_048519/extended-input`.
Native traces remain comparison-only; gameplay never reads future native
positions, boards, random values or pictures. This exposed several distinct
errors which short replays had not exercised:

- Side-wall contact sampled a neighboring column too far away. The native
  4px edge zones must select the neighbor only near the tile edge. The first
  longer-tape position divergence was frame 1530. Support-hold also rounds
  away the low four integer Y bits while retaining the Q16 fraction
  (`0x08003848`), which mattered at frame 1674.
- Floating pickups use this tick's waterline. An independent audit of 42,111
  native one-step pickup transitions has zero errors with the current line;
  delaying the line one tick produces fourteen errors, first at frame 994.
  Evidence: `scripts/OUTPUT/eggo-pickup-motion_2026-10-17T22-25-44-239Z`.
- Water-surface sprite origin uses two water ticks and one camera tick. Across
  701 native OAM pairs, water delays 0/1/2 produce 8/4/0 origin mismatches.
  Evidence: `scripts/OUTPUT/eggo-water-origin_2026-10-18_00-15-29_657555`.
  The BG body and divider retain their separate upload phases.
- Walk completion is a native handler state, not an instant return to idle.
  `0x0800ee14..ee28` requests idle when the seven-cel phase wraps. Releasing a
  direction preserves the remaining walk, H-flip and no idle RNG consumption;
  jumping during that remaining cycle also retains its takeoff handler. The
  portable `eggo-walk-stop-gba.json` fixture preserves both actors' measured
  stop/jump phases and source RAM hashes.
- All eight player air descriptor tables have two actual cels. Missing held
  still-rise cel zero had fallen back to the moving-rise atlas. The new air
  map builder appends resource groups 6..13 without disturbing prior indices.
  Native idle now selects the pre-step phase directly, preventing an old fall
  resource from surviving a landing through heuristic pose delays.
- Two-floor bonuses are emitted at each chosen column's own roof plus one
  empty row, with separate ownership. Their art comes from stage-specific
  `0x08004e20` branches, not the blue generic fallback. The two-floor cells
  and their falls at frames 1746/1747 match the native board. A bonus launch
  happens after animation selection; keep the pre-launch velocity for the
  current rival picture.
- Boots emit falling sparkles every fourth remaining tick, alternating X
  offsets 4/20 and using Y+28 before actor integration (`0x0800f6f8..f73c`).
  The shared pool holds fourteen particles. `0x08018e70` calls both input
  handlers before actor handlers, and pickup handlers afterwards; field-by-
  field allocation changes reused slot order. Native particles render across
  the seam using the source camera, lower slots on top, and reject an entire
  particle for X>232 (`0x0801b0d4`). They remain allocated until expiry.
- The destruction wave is priority-1 OBJ and must cover actors and sparkles.
  A native compositor reproduced every pixel at frame 1800 and attributed
  429 app differences to that wave covering the actor; the actor art and
  position themselves were correct. Evidence:
  `scripts/OUTPUT/eggo-native-ppu-frame_2026-10-18_04-23-44_315564`.
- The warning icon is native root +0x1378, flashed with global mask 0x30 by
  `0x080151ba..1520a`. `0x08019910` sets it when water touches a row containing
  1..6 occupied cells. The old incomplete-floor-count condition drew a false
  warning circle on a dry, otherwise correct board.

Register-phase caution still applies. The same compositor had 12,436 native
pixel errors at frame 1536 despite reproducing frames 1326 and 1800 exactly;
its layer labels at that mismatched frame are not evidence of the visible
PNG's ordering. Full screenshots remain the authoritative comparison.

After these changes the extended tape matches **1,800/1,800 full screenshots,
zero different pixels over 69,120,000 compared pixels**. Both actors, cameras,
boards, emitted/applied CPU keys, hazard states, pickup-manager clocks/bags/
counts and all three RNG streams match on every measured update. App evidence:
`tests/OUTPUT/eggo-mania-visual_2026-10-18T02-33-10-232Z`; full RGB comparison:
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_04-34-51_952217`.
The final thirteen pixels were a player affine pickup crossing into the CPU
field on frames 1589..1592, incorrectly clipped to its own field. Repainting
foreign pickup overhang with its own camera and native viewport resolved them.

The independent water tape was rerun after the final renderer changes and
still matches **220/220 full screenshots, zero differences over 8,448,000
pixels**, with measured gameplay and all random streams exact. App evidence:
`tests/OUTPUT/eggo-mania-visual_2026-10-18T02-34-56-034Z`; comparison:
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_04-35-23_764176`.
The focused water/contact/bonus/walk-stop suite passes nine tests. These
results establish the two tested input histories, not every possible Survival
round, selected character, arena, transition or audio stream. The partially
restored checkpoint image still differs by 1,685 pixels; no captured whole
frame was inserted into gameplay to hide that distinction.


## October25: Survival starting height and CPU head start

The target plane and the initial tower height are separate quantities. The
ordinary rescue probe remains above world Y=128 (37 tiles above actor floor
Y=720); the airship follows its independent oscillation. Configuration word17
at ROM table080d74b0 changes the initial terrain and waterline. It must not
be added to the user goal. Removing that addition fixes the absent round9
balloon and prevents a false lower victory threshold.

Hard's first8 rounds use difficulty table2, levels1..8, all with starting
row47. After8, two native RNG draws select difficulty0..2 and configuration
level2..8. For the selected table height H, H%5==2 and H<=46 increments H
by1. The resulting possibilities in this later set are33,43,47: ordinary
player terrain heights14,4,0 rows respectively. Thus the remaining climb
varies because the starting tower changes; this is not a random movement
of the rescue plane. In recorded round9, RAM0020=9, RAM03e8=2, and
E928+44=33; both full-floor counts are14. The CPU also starts with one
partial row. Initial progress and risk-meter latches must use these counts.
The complete fresh replay verifies401..65648 after correcting them:
tests/OUTPUT/eggo-long-replay_2026-10-25T08-51-06-196Z, skippedRenders0.

ROM055b8..055d0 computes the CPU handicap accumulator as
max(0,round+8*difficulty-24), reading difficulty from020003e8. In the Hard
replay difficulty2 makes this max(0,round-8). This is an accumulator, not
a literal count of extra occupied cells. For each of the7 CPU columns,
055e2..055f2 starts at H-floor((accumulator+6)/7). In055fa..05606, each
vertical piece whose start row is above H consumes one unit; the same column
continues placing pieces down to native row46. Then the next column uses
the remaining accumulator. The placement helper052b4 uses deterministic
vertical pieces of lengths1,2,3. Decrementing only once per column was an
approximation in the reconstruction and is now corrected to once per piece.

For explicit H=33,round40,Hard2, the accumulator starts32. The player's
column heights are[14,14,14,14,14,14,14]; the reconstructed ROM-rule CPU
profile is[19,19,18,18,17,17,17]. These are code-derived profiles, not a
claim of an independently recorded round40 pixel comparison. The reproducible
audit scripts/eggo-audit-survival-start-rules.mjs saves ROM/source hashes,
parameters, all24 configuration heights, and CSV profiles under scripts/OUTPUT.
Latest audit: eggo-survival-start-rules_2026-10-25T09-03-11-582Z.
No alternative/non-original rules have been enabled.


### October25 native simultaneous rotate/place observation

Original mGBA branches from recorded checkpoint69900, replayed unchanged to
70055, distinguish this input rule from a boundary collision: Aalone enters
throw state4; B+A rotates kind6 from3to0 but stays state0 with inventory6;
B alone rotates only. Repeating after0,5,10,20 rightward ticks gives the same
result (actor worldX -11,-1,9,29). B followed by a new A on the very next tick
enters state4, so this is not a requirement to wait for the affine rotation
animation to finish. The reconstruction suppresses same-tick placement of a
building piece when native rotation is also newly requested. This addresses
the first visible mismatch70057 (model previously started a throw at70056).

Evidence: scripts/OUTPUT/eggo-native-simultaneous-use_2026-10-25_10-11-53/,
eggo-native-rotation-use-timing_2026-10-25_10-13-10/,
eggo-native-rotate-place-position_2026-10-25_10-14-05/. These are original
emulator counterfactuals with input masks recorded; no injected native state
is used in reconstruction parity runs. The only earlier tape segment containing
both AandB is23610, where Bwas already held from23604 and therefore is not
a simultaneous new rotation. Full-prefix confirmation remains required.


### October25 late incoming hammer and frozen lower destruction counter

The first visible difference73799 was13pixels in the destruction wave, but
its cause was earlier gameplay scheduling at73706, not an atlas phase error.
Comparing every queued counter from73650 locates the first divergence exactly
on the CPU hammer impact: the native lower row21 retains22, while the old
model decrements it to21. Both implementations queue new higher row20 at88.
That higher queue blocks the lower one until73795, hiding the extra decrement
until a phase boundary73799 and then an early row removal.

ROM18E70 runs both04458 projectile passes before1A1B8 destruction queues.
Sequential field updates in the reconstruction can process the target's queue
before the second field's hammer arrives. The same-tick replacement now
restores the lower counter when a newly queued higher floor supersedes that
non-destructive counter visit, and submits the wave from the preserved prior
pass. Existing-highest impact behavior is retained. This specifically repairs
selection replacement before removal; it does not introduce a global wave
animation delay. A global delay was rejected because it regressed3584.

Read-only native queue evidence: scripts/OUTPUT/eggo-round-intro_2026-10-25_14-41-37/trace.json.
Pre-fix model queue evidence: scripts/OUTPUT/eggo-model-state_2026-10-25T13-41-36-405Z/states.json.
Targeted fresh-input suffix73785..74768 is exact, run13-46-33-329Z. Full-prefix
validation is recorded separately in EGGO_REPLAY_STATUS.md and the explicit
verified checkpoint manifest; a skipped-render suffix is never full proof.


### October25 rescue alignment and loose-owner scan order

Original DDAC..DE52 clamps velocity only for STRICTLY opposite target-delta
and velocity signs. Delta zero retains velocity, unless BOTH coordinates
meet the explicit arrival test. The old Math.sign inequality included zero
and incorrectly stopped the player at74768 (visible74769). Replacing it
with velocity*delta<0 preserves the native overshoot and later arrival.
Native trace14-47-34 and model13-47-33-695Z show VX-8192 versus old VX0.

At78816 an unsupported owner descends during a throw. Native 18E70 calls
1A1B8 destruction, CDB0 loose owners, then actor_state_dispatch. The old
model called the loose scan after the throw handler, so it interpolated
toward the old floor for one extra tick (visible78817). The native scan
now precedes that target query. Its owner limit still excludes new owners
created during the current tick, and pre-launch animation velocity remains
sampled before the loose-owner launch. Non-native controls retain their
existing scan timing. Native trace14-56-56 has actorY256.1526641845703 at
78816, versus oldmodel255.0098419189453; both agree again78817.

Rejected throw-interpolation and explosion-position trials did not change
the mismatching hash and were reverted. game.js remains byte-identical to
the accepted74768 checkpoint. Targeted fresh suffix78805..80688 is exact,
run14-00-27-720Z; full validation is required for acceptance.


### October25 podium weather RNG and Space rescue animation

The first visible round12 mismatch80689 is caused by an extra RNG read at
80584, while the screen is on the podium. updateResult previously continued
advancing Pirate weather even after actor/camera passes were frozen. Its
first counter reached zero at resultTicks266, consuming RNG15854->9383;
original RNG remains15854. Native camera weather counters are still44,643
at80650. Those correspond to stopping at result221, before the existing
result>=220+2 frozen gate. Weather now runs only below that gate. Native
B1EE..B27E is inside B074, which the podium does not run. Evidence: original
trace15-03-02 and raw80650; model RNG14-03-02-153Z and weather14-05-06-142Z.
Targeted fresh80675..84996 became exact; full validation remains required.

At84997 the actor position, velocity, selector10 and phase all match, but
the artwork differs. Selector10 entry EA04..EA46 explicitly chooses group11
for native stage5 (Space), group21 for every other stage. Both player and
rival resource lookup now share that stage-dependent mapping in VIEW.
Native84997 actor+83c/+840=11, table83f229c, descriptor83466dc. This is not
a mirror or attraction-physics change. Targeted84990..86822 becomes exact.

### October25 newly caught inventory cannot use an unprepared outline

At86821 both versions catch kind2; original outline-valid+880 remains0.
The new A at86822 tests that old flag (FFFC..1000A) and does not throw, then
the preparation pass makes it1. At86823 A is held, not newly pressed, so
the original still falls. Oldmodel recomputed a destination and threw.
use now requires a prepared nativePreviewPosition for native building
placement; Game already clears it on catch and prepares it after the next
input pass. Read-only raw states86821,22,23: audit15-16-32. Valid flags0,1,1,
inventory2 throughout; water flag+1240 and creature-carry flags both0.
Targeted86815..87255 becomes exact. These suffix validations are not a
claim about skipped earlier renders; see the full replay checkpoint manifest.


### October25 complete prefix acceptance

All six changes above passed a single fresh input-only whole-prefix replay:
86855 consecutive exact RGB565 frames401..87255, skippedRenders0, first
remaining87256. Run: tests/OUTPUT/eggo-long-replay_2026-10-25T14-18-08-861Z.
No later-frame or audio parity is claimed. Next87256 is BG filler completion
when an unsupported owner falls; native CDB0 calls3C8C at0CEB8 to flush the
pending filler animation queue, which is absent in the current loose scan.


### October25 continuation: filler flush, tool rotation, rescue camera entry

87256: CDB0 initializes sp+200=1 (CDCA), then before the first unsupported
owner cell moves CEB8 calls3C8C on the board and clears that guard. All
pending filler art becomes complete, even outside the moving group. The
model now flushes its nativeFillerAnimations once before the first descent.
Native countF50=0 at87256 while stale timers7,11,15,19,23,27 remain; oldmodel
left filler indices4/5 in phase0. Targeted87245..88884 becomes exact.

88885: simultaneous newB+A rotates a held filler without using it. Native
88884 retains inventory10 and rotation1; oldmodel cleared inventory and
filled the tower. Same-frame rotation priority is now applied to tools as
well as building pieces; fresh A next tick remains allowed. Native trace
15-38-36, model14-38-35-876Z. Targeted88875..91036 becomes exact.

91037: positions, velocities and RNG match, but the first rescue camera
update91036 used post-attraction integer Y126 instead of its prior sample
Y127. Original camera is100; oldmodel99. 04908 precedes the first state2
attraction integration. Entry now preserves nativeCameraActorY, exactly
as subsequent rescue updates already do. Native trace15-40-17, model
14-40-17-280Z. Targeted91025..92729 becomes exact. Full-prefix acceptance
is recorded separately; skipped render suffixes do not prove earlier pixels.


### October25 accepted through95061: launch art, optional enemy gate, water discard

Player selector5 now reads nativeActorAnimationVy just like rival resource
lookup. At92729 a loose owner launches the actor, but the animation handler
uses pre-launch falling velocity. Native group remains13; oldmodel chose9
one queued picture early (visible92730). Body/camera/RNG are unchanged.

Round14 disables the secondary enemy. ROM11C3C..11C48 skips its shared
spawn-height gate if either config word is zero. OldparkPrimary applied the
gate anyway, spawning at92847 instead of native92834 and delaying its
first visible spring cycle. Height gating is now conditional on secondary
enabled. Native/model hazard audit15-52-53 /14-52-53-015Z locates the exact
first-spawn difference; spawn coordinates/life/animation need no fitted shift.

93851 is a dropped-item position error, not wrong actor art: decoded native
OBJ36 matches Funky group1 exactly, and a canvas pixel probe shows the
correct actor pixel being overwritten by the new loose crate. CPU discards
at93850 during water recovery. The item must originate from nativeWaterCameraY
529.7043914794922, before the creature replaces bodyY513.7301635742188.
Model now uses that sampled coordinate for manual discard; native/new item
Y557.6572723388672 includes the first gravity tick. Native audit15-58-12,
canvas probe tests/OUTPUT/eggo-long-replay_2026-10-25T14-58-56-050Z/pixel-probe.json.

All three passed full fresh tests/OUTPUT/eggo-long-replay_2026-10-25T15-01-59-029Z:
94661 exact401..95061, skippedRenders0, first95062. Verified checkpoint19-43-08.

### October25 pending explosion allocation camera and stationary throw tail

95062: blast allocation still uses the native -7px top bound (1B12C and
1B1E4); it is not a wider sprite-size bound. Projectile/held-bomb effects
are allocated before04908 moves the camera. CPU oldcamera343 admits upper
debrisY336 at-7; later camera345 displays it at-9. Oldmodel usedpost345
and rejected those slots, allocating other debris instead. A beforeCamera
flag now preserves this timing independently of the existing stable phase
ordering. emit/allocate/flush carry the flag; projectile and held bomb
explosions set it. Suffix95045..96122 becomes exact.

96123: a stationary landing does not request idle in E824..E852. Selector8
finishes its accumulator; EE14..EE28 then queues2. Oldmodel ended it at
96122, spending RNG and unlocking DOWN camera offset early. Stationary
phase retention now includes8 alongside3/4. Native96122selector8phase0
RNG30554 versus oldmodelselector2/RNG63291. Suffix96105..98816 is exact;
full-prefix acceptance must be read from the later manifest.


## October 25: pending late-replay CPU search restart diagnosis

At recording frame 106701, the native CPU resumes candidate (rotation 3, column 5) after receiving a new kind-3 piece during the final throw-state handoff. The cursor becomes (3,6), retaining best score 83. The model advances that same candidate, but game.updateCPU subsequently sees its retained dive plan gap already occupied (row 23, column 3, owner 81) and creates a new NativePieceSweep. This heuristic resets all cursors and removes Up input. Native keys are 64 at 106701/2 and 80 at 106703; the model emits zero. Positions agree through 106701, acceleration first differs then and visible mismatch starts 106704 (858 pixels). ROM 0x080070ac..70e6 advances the persistent cursor unconditionally; 0x08007706..7760 updates cached placement only on a better score, and 0x0800781c..791c performs steering/placement checks without resetting the sweep for occupied cached gaps. Restrict the generic occupied-gap replanning heuristic to the non-native planner; verify against the complete prefix. No production edit yet while prior full run is active. Evidence: native audit eggo-round-intro_2026-10-25_20-00-28, model-state 19-00-27-648Z, instruction audits 20-05-12 and 20-05-44.


## October 25: pending throw-entry camera sample correction

With the native sweep preserved, targeted fresh suffix 106690..107841 matches. At 107841 P1 starts a new throw while state.nativeCameraHoldActive is still true from the preceding post-throw bookkeeping. The actual prior animation selector is 5 and actor handler state is 0, so ROM 04908 samples the new actor Y=246 and camera becomes 175 (BG3 95). The model incorrectly samples prior Y=248 and leaves camera177 (BG3 96); first picture differs107842 across P1 field. Throw positions and RNG agree. Gate the previous throw-body sample on actual nativeActorHandlerState===4 as well as the existing hold flag, preserving the real state-4 handler phase. Do not change velocities: they were a diagnostic clue, not this camera cause. Native audit20-11-34, model19-11-23-475Z, disassembly04908..49d0 at20-12-32. Wholeprefix validation pending for both CPU sweep and this change.


## October 25: pending CPU rescue animation parity

After throw-camera correction, targeted fresh suffix107830..108461 exact; first108462 is CPU art only (748pixels, x186..229/y25..62). Positions, cameras and RNG all match. At108461 native CPU enters attraction state2, selector7 phase0x2000, group12/free and group13/held, flip0, table083f22a4. Model stayed selector5/rising free group6 based on velocity. CPU had no counterpart of P1 rescue branch. Added selector7 (target dx/dy -> free groups8/6/12/10), entry-reset phase step0x2000/period2 and direction flip from dx; arrived selector10 uses existing stage-specific arrived group and retains flip. This shares original attraction semantics and does not change motion. Nativeaudit20-13-27/raw108461/2; model19-13-27-060Z. Target and full verification pending.


## October 25: pending loss podium OAM phase

CPU rescue correction matches target108450..108688. At108689 only the loss podium actor differs (324 pixels). Raw OBJ2 tiles decoded to alpha masks match stored loss-atlas picture0 at108689, picture1 at108690..108693 and picture2 at108694..108695. Existing podiumPose chooses pictures1/2 one display tick early. Added centralized PODIUM_VIEW.lossOamDelay=1 to the loss animation/title timeline, retaining all win behavior. This corrects the previous-counter OAM upload phase rather than changing artwork. Nativeaudit20-15-39 plus20-17-29, existing capture sequence from podium.json; ROM Yolko loss1036a..10384 is a four-tick ping-pong of16frames. Target+wholeprefix validation pending.


## October 25: loss podium title and actor motion

After correcting the loss OBJ phase, suffix108680..108805 exact. Existing podium code abruptly replaced the actor with a static GAME OVER at loss tick122. Original adds an independent higher-priority title OBJ at y=-62 on tick122, moving2pixels/tick untily4; the actor continues its16frame/four-tick ping-pong and starts falling4pixels/tick aftertick146 (y41 at156, y81at166). ROM1cd9a..1ce12 increments animationcounter, moves title for oldcounter120..153 and actor aftercounter145; render uses preceding OAM sample. 1d020..1d07e calls10284 forloss characterclip and drawsactor at318f0-15. Added centralized constants, continued Yolko ping-pong, independent title drawing aboveactor, and actor fall. Raw OAM20-18-46/20-19-38 and disassembly20-20-06. Late suffix and fullprefix still pending.

The independent title/continued actor correction matches108680..108838. At108839 only24pixels differ where fallingactor crosses WINS. Native OAM title2,actor3,wins4,digits5/6 allpriority0: actor must cover lettering. Moved wins/digits draw before actor/title. Nativeaudit20-21-29 and target19-20-40-564Z.


## Corrected recording boundary and loss confirmation, October25

Earlier endpoint110209 was inferred incorrectly from stale actor/mode RAM during credits. Direct native screenshots109150,109500,110100 show copyright/credits; no further Survival play. Actual gameplay ends108461, loss podium continues until A109044, fade reaches black109075. Use final comparison401..109076 (limit108676) through completed fade, excluding credits per request. Nativeaudit20-22-28/20-22-53 confirms. Pending loss confirmation now uses existing original won-result fade path instead of immediate reset; after fade returns to character selection (credits outside requested game scope). Target108830..109043 was exact before this final fade fix. Wholeprefix proof pending.


## FINAL ACCEPTANCE — October25 complete supplied Survival recording

Full fresh production replay `tests/OUTPUT/eggo-long-replay_2026-10-25T19-24-27-639Z` verifies every original frame401..109076: compared108676, matched108676, skippedRenders0, firstMismatchnull, allMatchedtrue. Original input tape/seed1492 only; all RGB565 SHA256 values match and production source hashes are recorded in parameters.json. Includes all recorded rounds, final CPU rescue/loss, loss podium animation/title motion/priority, confirmation and fade to black. Excludes following copyright/credits; earlier110209 boundary was invalid because actor RAM remained stale through credits. No native state injected. All late changes above accepted across the WHOLE prefix, not just diagnostic suffixes. This is evidence for this recorded input sequence, not unrecorded play or audio. No further production change pending.


## October26 additions: audio and online human series

Native SFX capture/admission evidence: scripts/OUTPUT/eggo-native-sfx_2026-10-26_01-29-02 and eggo-native-sfx-admission_2026-10-26_01-29-43. Twenty ROM effects captured in fresh isolated core processes; repeated1/34/36captures byte-identical, calibrated jump agrees with prior independently input-captured waveform. Two dispatch-slot admission reproduces720 ROM20898cases. Dispatch slots are sequencer tracks, not an absolute two-audible-tail cap: prior different-voice tails may continue after track release. Explicit Tower.nativeAudioEvents and native-sound-events.js centralize IDs. Full mixed-recording PCM parity remains open.

human-match.js wraps the existing game only for two humans; original Survival CPU path remains default. Shared seed, edge-button masks and fixed steps drive identical worlds. Host left/guest right; selected character resources; equal initial human terrain/water;8rounds with9th at4:4. MATCH_RULES centralizes series/input parameters; Sites room-client.NET centralizes polling/transport. D1 room service uses random invite/session capabilities and expiry; reliable ordered input relay, optional direct WebRTC acceleration. Local deterministic-pair2400frames, complete tied9-round series, targeted built-water/bonus tests and live room APIs passed. No claim of full RGB565 rerun after these additions. Default character is EGGO; desktop online shortcut opens hosted invitation flow.

Revised statistics include306 advancing prefix reports (92below5000), with separate documented fix notes and source provenance. Vertical level clear markers are from the accepted per-frame phase trace, not stale actor RAM; level8clear64488. Latest source/test backup eggo-online-audio-checkpoint_2026-10-26_01-44-29.


# Eggo: performance and sound audit, 26 October 2026

The post-WIN slowdown was in native palette fading, which read back and converted complete sprite atlases for tiny source rectangles. Convert visible rectangles, reuse immutable raw pixels (32 MiB bounded LRU), cache small faded atlases, use exact native channel lookup tables, and clip scrolling 512px rings to the visible 160px region. Mutable scrolling/water buffers are never incorrectly cached as immutable. A black-frame shortcut was rejected after two stage-8 sample differences; the final implementation retains the original draw semantics.

On the same recorded first-round transition: mean fade drawing 60.69 -> 6.07 ms, p95 126.1 -> 9.9 ms; podium 37.87 -> 1.32 ms. Readback area during fade 1,752,174 -> 88,914 pixels/frame. Host load varies: a later busy-machine run measured 12.58 ms mean fade. These are CPU drawing costs, not guaranteed display FPS. Update timing is separate. No game steps or artwork quality were reduced.

RGBA regression: 461/461 first-transition images matched the pre-change renderer; 112 selected images spanning all 15 completed rounds and final loss matched; the later 451-frame window after sound additions also matched. This is targeted regression evidence, not a new full 108676-frame replay.

F8 saves the latest 1800 rendered frames of timings. Desktop output: renderer/games/eggo-mania/OUTPUT/performance_<UTC timestamp>/parameters.json and frames.json. Browser: JSON download. Restart the desktop application to load the new preload/main IPC handler. Capture immediately after a noticeable delay. The report includes frame intervals, update/render costs, and controller-state timestamp to completed Canvas submission when a controller input actually changes. It excludes physical button/Bluetooth transit and actual display presentation; unsupported timestamps are null. There is no continuous screenshot/disk capture or extra controller poll. Paused re-renders do not append stale measurements.

Sound: original in-memory Thumb instrumentation logs sound-wrapper calls while every native video frame retains the recorded SHA256. Frames 301..9000: 8700 unchanged native images, 297 wrapper requests (295 from gameplay comparison frames 401..9000). Additional bounded caller-PC audits resolve the simultaneous jump/drop cue and hammer-contact cue without guessing. ROM on disk is never changed or distributed.

Added/verified original effects: normal placement (3), splashes (11), countdown (17..19), local tower warning (33), cloud thunder (44), rock/missile impact (7), dragon/rock arrival on the human field (30/40), hammer impact (14), rejected placement (5), and delayed result voice (38/39). Removed the false extra filler sound. The sound bank now contains 28 effects; the original 20 waveform hashes are unchanged. Driver slot age now follows native game ticks, not RAF cadence; the targeted 30/60/144 Hz regression and six existing music/pause/PCM tests pass.

First-round event comparison now has 295 native and 295 reconstructed requests on identical frames, zero missing/extra requests. Three within-frame order differences remain: 1486 (thunder vs placement), 4605 (CPU jump vs player placement), 5294 (CPU jump vs rock arrival). This is the next concrete sound task: preserve native global pass order before slot admission. Full music/SFX shared-voice mixing and the entire recording's mixed PCM parity remain unverified. Do not mistake matching event counts or isolated WAV hashes for mixed-audio equivalence.

Sites version 4 published successfully: https://eggo-mania-survival-ww.lightraven257.chatgpt.site . Commit 318a7667289f99c6b5b9492f8688e09d4fa5e074, deployment appgdep_6adf23fb406c8191a8150b86787b05cd. Public audience preserved. Build excludes OUTPUT diagnostics and uses lossless FLAC with versioned ES-module imports. All 439 packaged canonical source hashes matched after packaging. No development servers or benchmark processes intentionally remain running.
