# Eggo Mania Survival/Hard: current implementation guide

## October27: complete recorded Survival and integrated audio

Read the NEW project-root `EGGO_REPLAY_STATUS.md` section FIRST. The old
incomplete-prefix notes below are historical. The full401..109076 recording
has108676 pixel-exact frames in the archived visual proof. The integrated
production audio Worker additionally matches ALL59621888 stereo samples with
ZERO differences (`eggo-program-worker_2026-10-27T02-59-34-583Z`).
The final CURRENT player+Worker replay also matches all59621888samples and
217352 scheduled sources with ZERO differences and ZERO gaps:
`eggo-program-player_2026-10-27T10-00-06-622Z`.
Actual player/WebAudio prefix, other seed/Eggo startup,22 targeted tests and
cold HTTP gameplay/restart/extension checks are linked in the root status.

Audio uses the compiled original-game timing context and native platform for
original Survival rules. Remaining untranslated code uses the original CPU
decoder. This is not a claim of a completely hand-decompiled whole game.
Custom rules, online human matches and anticlockwise extension retain the
model-driven shared-channel engine. Never replace this with fitted per-frame
phase offsets or recorded future PCM/state/event streams.

Public Site version6 is deployed at
https://eggo-mania-survival-ww.lightraven257.chatgpt.site .
Do not repeatedly rerun the complete recording without a causal code change
or new failure. A new longer user recording is the next useful coverage.

## Historical handoff

Updated 2026-10-19. This replaces the accumulated, contradictory October 8
status notes. Their complete archive is
`scripts/OUTPUT/eggo-guide-revision_2026-10-17_18-48-52/AGENT_GUIDE-before-water.md`.
`REFERENCE.md` retains the detailed chronological ROM evidence.

## Current authoritative replay status (October19 evening)

Read project-root `EGGO_REPLAY_STATUS.md` FIRST. It supersedes the older handoff
and all stale progress claims below. The NEW recording is
`tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/`.
Common start is after recording frame400, seed1492, Yolko Survival Hard Dragon.
The exact verified prefix, latest run, accepted changes, backup and next
mismatch are maintained in EGGO_REPLAY_STATUS.md. Follow that live resume
section; do not restart from the older handoff summaries or pre-batch backup.
The October21 continuation fixes throw-handler input/camera transitions,
repeated Castle thief animation, pickup/contact ordering, integer cloud hits,
water-recovery steering and OAM priorities. A hidden/muted fresh replay is
used after each causal production fix, with no later native state injection.
Later rounds and the complete recording remain unverified.

The status file contains causal fixes, ROM evidence, source/backup paths,
commands and diagnostic addresses. Old420-frame long-jump regression also
passed420/420 full pixel comparisons (see status for evidence and limits).

## Latest October 19: reported hazards, severe FPS loss, user recordings

Backup before this batch: `scripts/OUTPUT/eggo-reported-bugs-backup_2026-10-19_15-28-52/`.
Do not describe the whole reconstruction as pixel-perfect. The new recorder
below captures the ORIGINAL, not the reconstruction, and its deterministic
verification is a different claim from reconstruction parity.

### Performance

The software native backbuffer repeatedly read GPU-backed intermediate canvases.
All internal pixel/cache canvases now request `willReadFrequently:true`, including
the streamed stage ring. The final application presentation canvas is unchanged.
The Factory late-water baseline readback is skipped while its body is offscreen.
This retains exact pixels; it does not skip native ticks or reduce resolution.

The filled 20-row, 960-frame hidden/muted RAF test went from about 37 FPS to
60.002 FPS after the 30-frame warmup, with zero duplicate/multiple-tick states,
16.8 ms maximum interval and 1.44 ms average rendering time. Offscreen compositor
paints independently measured 60.026 FPS. This measures the Electron render path,
not a camera pointed at the physical display. Evidence:
`tests/OUTPUT/eggo-frame-pacing_2026-10-19T14-50-13-302Z/`.
No leftover WW Mini Games test or emulator processes were present on final
inspection; unrelated user applications were left alone.

### Fixes and evidence

- Xbox Menu (button 9) is the remappable pause action; View no longer restarts.
  Character selection still accepts Menu. Existing shipped bindings migrate.
  The global Escape menu has persistent music/effects volume sliders, routed
  through separate live Web Audio gain nodes. Hidden UI integration passed.
- Center progress/water bars repeat their body to the bottom, as native
  `0x0801a380` does. Keep the existing two-phase `nativeDividerPendingProgress`
  handoff in game.js; recomputing progress in model.update introduced a real
  16-pixel regression at frame 219 and was removed.
- A stolen armed bomb is re-created as native kind 8/variant 0 without retaining
  its armed fuse, matching `0x080130c8..1311a`. It then follows the original
  thrown-pickup trajectory, including the slow apex. Fixture
  `tests/fixtures/eggo-bird-returned-bomb-gba.json` checks 143 Q16 samples.
- Native water defeat checks the water-contact board row even while swimming.
  After global frame 400, an empty in-board row loses; fully occupied submerged
  rows remain playable. This fixes the surviving CPU under a destroyed tower.
  The ordinary placement collapse threshold already matches the original:
  more than seven incomplete floors. The red pointer alone is not this counter.
- Space tentacle OBJ origin subtracts the native phase-specific offset
  `[33,30,30,30,27,0,0,0,10,20,30,30,30]`, not a constant 32. Its captured
  variant-1 artwork is mirrored for variant 0.
- Castle and Space do not submit the common balloon/blimp OBJ: their rescue
  vessel is already in the background. This follows native `0x0801aa90`.
- Birds/Jungle thieves and missiles use the native 8.8 affine reflection rule
  (`nativeFlightSpriteMatrix`), including its strict half-turn boundaries,
  rather than a constant horizontal flip that inverted the opposite arc.
- Rocket injury no longer drops `nativeMotion` when input is disabled. Native
  Q16 vertical positions match all 20 recorded hit frames in every arena.
  Water recovery clears the injury state. Eight rival injury/swim atlases are
  decoded/recolored from original character resources, loaded explicitly, and
  selected instead of unrelated idle/fall cels. The Space/Coolio injury cels,
  timing and H-flip match an independent 24-frame native capture. Other stage
  injury art is decoded but has not had full-scene pixel comparisons.
- Hammer angle advances by `0x666666`, wraps at `0xffffff0`, and freezes while
  outside native OBJ bounds. Slot angle persists between projectiles. Visibility
  is evaluated before projectile motion using the preceding camera descriptor.
  All 37 independently captured visible OAM matrices match exactly; fixture
  `tests/fixtures/eggo-hammer-visual-gba.json`. This is an animation assertion,
  not exhaustive proof of every projectile position/occlusion.

Focused tests: `tests/eggo-reported-bugs.test.mjs` (six cases), controls and
bomb-wall fixtures pass. The existing 420-frame held-right/held-left long-jump
tape remains **420/420 full-frame exact**, 16,128,000 pixels compared:
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-19_17-08-10_582562/`.
The rare user-reported wrong-state flash was not reproduced by this tape;
do not claim that its absence proves the entire game fixed.

### Original-ROM diagnostic player (ready for user gameplay)

Double-click root `Eggo Mania - zajem originala.vbs`.
`tools/eggo-recorder/README.md` explains controls and storage. It runs the user's
original ROM through the bundled local mGBA libretro core. The ROM is not copied.
The launcher uses the installed Python 3.12 with NumPy/Pillow; this is not a
standalone Python-free packaged executable. GUI tests are hidden and muted.

Every launch automatically creates a timestamped `tools/eggo-recorder/OUTPUT/`
recording: initial state, exact per-frame button masks and window input events,
lossless native framebuffer plus EWRAM/IWRAM/IO/palette/VRAM/OAM, audio PCM,
300-frame checkpoints, parameters/core/ROM/state hashes and summary. Video and
memory are sampled at video_refresh to avoid arbitrary HBlank phase artifacts.
Writer queue is bounded to 90 packets; XOR+zlib compression is lossless. Slow
storage pauses emulation instead of dropping frames. No global keyboard hooks,
no playback while focus is elsewhere, live audio muted, Xbox View unbound.
PhotoImage is reused between frames; no transient blank image replacement.

Self-test captured and replayed all 715 ordinary-menu/gameplay frames with
zero pixel differences, and a hidden GUI smoke replayed all 77 frames exactly:
`tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_17-01-19_942818/`.
After PhotoImage reuse, the final hidden GUI check captured/replayed all 165
frames exactly and ran at 59.69 FPS after startup (native rate 59.73):
`tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_17-14-08_245827/`.
`recorder.py --verify <recording>` streams deterministic ORIGINAL replay checks.
`inspect_capture.py <recording> --frame N` exports native frame/memory and a
run-length GBA input tape into a timestamped OUTPUT experiment. The source
recording stays untouched. User recordings still need adaptation to the app's
replay initialization for reconstruction comparison; no automatic claim of
reconstruction parity is made by --verify.

Next work: use actual user recordings to isolate remaining flashes and later
round/hit/water cases, then extend reconstruction comparison from the exact
420-frame baseline. Preserve the user's recordings; do not clean OUTPUT.

### Recorder transfer to Garey (October 19, later)

User recordings `eggo-native-play_2026-10-19_17-43-13_642956` (17,583 frames)
and `...17-48-14_837968` (901 frames) are real user play; preserve them. The long
recording has zero dropped frames, average 59.36 FPS but a 21.67 ms p95 interval
and 208 intervals over 25 ms. This confirms presentation pacing complaints;
average FPS alone is insufficient. This is a direct core framebuffer capture,
not a GPU video encoder. A process-scoped 1 ms Windows timer request is now
active while the recording GUI exists and released on close. Do not claim this
has solved every pacing problem on the laptop; bundled-runtime cold/hidden
performance was variable. Its 146-frame deterministic replay was exact.

`tools/eggo-recorder/build_portable.py` creates a self-contained private Windows
package (Python 3.12, NumPy/Pillow/Tk, core, original user ROM, source). No old
OUTPUT recordings are included. Source remains local and authoritative. Build
and hash manifest: `tools/eggo-recorder/OUTPUT/eggo-portable_2026-10-19_17-54-29/`.
Snapshot copied over wired SMB into Garey's
`C:\Users\galza\Downloads\Eggo Mania - zajem originala 2026-10-19`.
The root VBS launcher prefers bundled Python. New user recordings appear in
that snapshot's `tools/eggo-recorder/OUTPUT` and can be fetched later by SMB.
Garey playback speed itself has not yet been measured; no remote GUI was started.

Use the `run-on-garey` skill for connection information. Its saved credentials
were rejected on this date; the user restored SMB authentication manually in
Explorer. Existing authenticated SMB access then worked. Avoid overwriting the
working session or repeatedly trying stale credential files. Do not assume WMI
authentication was restored as well; it was not needed for this file transfer.

### Garey controller compatibility patch (October 19, 18:16)

User reported controller paired with Garey but ignored by the diagnostic player.
Three remote captures contained no controller events (one had 12 keyboard-input
frames). The old reader only polled XInput and returned at the first connected
slot, including an idle virtual slot. Actual remote hardware backend was not
observable without restarting the interactive player; do not claim its driver
was conclusively identified.

New `tools/eggo-recorder/controller.py` prefers SDL2 GameController (bundled from
the user's RetroArch installation, with its libsamplerate dependency), supports
Bluetooth/HID mappings, and falls back to all four XInput slots then WinMM
joystick input. Windows raw button defaults are centralized in config.json.
Only mapped gameplay inputs are recorded, while the existing foreground-window
gate remains. Controller handles/SDL subsystem close with the player.
Status text shows SDL/XInput/Windows joystick or no detected controller; each
capture updates `controller-diagnostics.json`. All four focused tests pass,
including real SDL virtual-controller button/axis input through the actual DLL,
and the idle-first-XInput-slot case. This is not a physical Garey controller test.

Copied recorder.py, controller.py, tests, DLLs and merged controller settings into
the existing Garey snapshot. Original ROM setting and OUTPUT recordings remain
untouched. Hash verification passed for all five copied files. Source backup and
deployment evidence: `tools/eggo-recorder/OUTPUT/eggo-controller-update_2026-10-19_18-16-10/`.
User must close/reopen the same VBS launcher to load the changed input backend.

### Recorder pacing refinement on Garey (October 19, 18:25)

User confirmed controller works but reports mild stutter. Real Garey recording
`eggo-native-play_2026-10-19_18-17-39_935056` has 14,684 frames, mean 59.732 FPS,
p95 interval 17.485 ms, and 11 intervals over 25 ms. Most large intervals were
77–80 ms after frames 112,232,352,...1072 (two-second spacing); another was
49 ms after frame 13553. This periodicity coincides with controller rescanning.
Its diagnostics confirm SDL already has an Xbox One Series X Controller while
the old WinMM joystick backend was redundantly enumerated as well.

Controller.scan now skips WinMM enumeration entirely when SDL has a mapped
controller. It still rescans SDL for hotplug and retains the legacy fallback
when needed. Rewriting unchanged controller diagnostics every second is also
removed. No frame dropping, resolution reduction, emulation speed change, or
record format change. Five focused controller tests pass, including one that
fails if the legacy driver is touched while SDL is active. Updated three files
copied/hash-verified on Garey; old files and stall CSV preserved in
`tools/eggo-recorder/OUTPUT/eggo-recorder-pacing-fix_2026-10-19_18-25-48/`.
Actual post-fix Garey frame pacing requires a new user run after restarting;
do not treat the before/after causal hypothesis as an already measured gain.

## Current corrections: flooded solid walls and real frame pacing

The user's October 19 flooded-wall screenshot exposed a false test assumption:
the earlier water-depth tests cleared every board. Water rendered before BG0/
BG2 could pass those tests while becoming completely hidden behind a full wall.
The occupied-cell mask also restored dry board pixels over water/actors.
Native flooded Dragon-wall captures prove the opposite priority order: BG1
blends over the occupied board. A 3,783-pixel submerged-board witness matches
the native RGB555 12/4 blend exactly after excluding opaque OBJ pixels.
Evidence: `scripts/OUTPUT/eggo-flooded-wall-witness_2026-10-19_14-08-43/`.

Water now renders after panels, with the late blend applying over lower-priority
actors even on occupied cells. `tests/eggo-water-depth.mjs` now uses **20 full
rows**, camera 6 and water height 8 in every arena/phase, instead of an empty
board. All 480 scenes pass on both fields. Visual evidence:
`tests/OUTPUT/eggo-water-depth_2026-10-19T12-03-40-369Z/water-depth.png`.

Frame equality does not establish wall-clock presentation smoothness. The
real RAF measurement reproduced 60 callbacks/s but only about 51 unique
simulation frames/s: a floor-based accumulator repeatedly emitted 0 then 2
steps around quantized RAF timestamps. Live `update(dt,frameDt)` now samples
the nearest fixed tick (`RULES.presentationTickPhase=0.5`). Explicit offline
`update(step)` retains its exact schedule. Both paths use identical fixed-step
physics. The main pixel canvas uses a CPU-readback context and `reset()` rather
than resizing its backing store every frame.

`tests/eggo-frame-pacing.mjs` uses a hidden, muted **offscreen compositor**, not
manual calls to update/render. A test-only main wrapper observes actual paint
events. After the 30-frame warmup, the final measurement gives 60.00 RAF/s,
60.00 unique states/s, zero repeated/skipped states and 60.09 compositor paints/s.
Evidence: `tests/OUTPUT/eggo-frame-pacing_2026-10-19T11-54-22-452Z/`.
This measures the Electron compositor; it cannot prove physical monitor scanout.
The 420-frame long-jump tape remains pixel-exact after these corrections:
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-19_14-05-39_289141/`.

Filler completion now calls `complete({allowBonus:false})`. Independent native
two-row and three-row fills create no bonus cells; ordinary multi-row piece
completion still permits its bonuses. Sources/portable fixtures are in
`scripts/OUTPUT/eggo-filler-multi_2026-10-19_13-50-52/` and
`tests/fixtures/eggo-filler-multi-gba.json`.

Live seven-column bombs now use `advanceNativeBomb`, ported from ROM
`0x08004458..04890`. First contact probes a specific occupied cell at the centre
column, including upward travel and edge overlap, rather than a skyline plus
a descending-only gate. Resting motion retains the native fall limit, ceiling
push, fixed-point half-bounce and settle threshold. Launch height uses the
origin column and the two-row board/actor offset. Original frame captures for
flat/stepped walls and the independent natural rebound replay compare 560
subsequent positions, velocities and flight counters exactly; three original
launch geometries also match. Surrounding captured geometry is supplied to
these isolated projectile tests, so this is not a whole-game autonomy claim.
Legacy non-native projectile fixtures remain on their compatibility path.
The older `eggo-cpu-projectiles.test.mjs` still has one stale expectation that
CPU discard is delayed to the next frame. It fails identically using the
pre-change backup game/model; baseline proof is in
`tests/OUTPUT/eggo-cpu-baseline_2026-10-19_14-10-05/`. The CPU controller was
not modified here. The focused new bomb/filler checks pass all 10 tests.

Tests: `tests/eggo-bomb-walls.test.mjs`, `tests/eggo-filler-art.test.mjs`.

## Character selection at startup

Startup now opens `character-select` before constructing any gameplay towers.
`character-menu.js` owns the eight-character order, hitboxes and input repeat
parameters. Left/right (keyboard, D-pad or stick) selects; Enter/Start or the
place binding confirms; rotate/GBA-B goes back. Native A/B hints and arrows
also accept mouse clicks. Confirmation saves the character setting and starts
the existing Survival introduction. F5 and subsequent rounds retain the choice.

`scripts/eggo-build-character-menu.py` decodes the original menu's BG0 and OBJ
resources separately; runtime does not display captured emulator screenshots.
The menu retains the original character pictures/name labels and fixed
Survival/Hard labels. `eggo-build-menu-animation.py` decodes individual OBJ
pictures and positions for 1,024 native ticks per character. The follow-up
`eggo-fit-menu-animation.py` recovers independently repeating tracks: actor
32/64/96/128 ticks, name 30, arrows 50, hint 282, static chrome 1. Runtime
advances these tracks separately, avoiding a discontinuous full-clip restart.
The compact metadata is 338 KB and the shared sprite atlas is 87 KB.

Air/walk resource overrides formerly pointed to `yolko-native-poses` for every
character. All eight now have matching group/descriptor supplemental atlases;
the original Yolko atlas remains unchanged. This fixes actor identity in these
poses; it does not establish complete frame-by-frame parity for every character.

Focused hidden/muted check: `node tests/eggo-character-menu.mjs`. Evidence in
`tests/OUTPUT/eggo-character-menu_2026-10-19T02-05-39-630Z/`: eight selections,
keyboard/Xbox/mouse controls, native actor resources during 90 gameplay ticks
per character, and selected-character retention in the next round.

The animated selector check additionally compares eight native sample times
per character (64 complete menu images, excluding the deliberately fixed Hard
label rectangle). Every compared pixel matches. Final compact-track evidence:
`tests/OUTPUT/eggo-character-menu_2026-10-19T09-56-10-858Z/`.

## Latest: animated selector, underwater depth and post-result controls

The right field previously decoded/rendered only an 18px strip below the
waterline. That was sufficient for the shallow original fixture but left
deeper views dry. `eggo-build-water-depth.py` decodes source rows 80..255 from
the alternate BG3 map for all eight arenas and all 60 native animation phases.
`*-water-bg3-body.png` retains the full 176px source; early and late blend
passes now use the same full extent. The existing top 18 rows are unchanged.

`node tests/eggo-water-depth.mjs` checks both fields in every arena through
all 60 phases (480 scenes), with a below-surface region that previously missed
the CPU water. It also checks that a player can move after an opponent loss,
the score timer remains frozen and movement ends at the podium transition.
Evidence: `tests/OUTPUT/eggo-water-depth_2026-10-19T09-53-55-179Z/`.

Result updates formerly supplied `{}` instead of player input, also switching
Survival to the non-native movement path. `readPlayerControl()` is now shared
by active play and the result interval; result updates retain native controls,
actor animation and fixed-step integration until `PODIUM_VIEW.roundTicks`.

A fresh 160-frame autonomous native tape combines left/right reversals,
jump/float, rotation, placement and a dive. Both actors, cameras, boards and
all **160 full 240x160 screenshots match exactly**, with zero pixel differences.
Native: `scripts/OUTPUT/eggo-reference_2026-10-19_11-41-17_081804/mixed-controls`.
Final audit after sharing the input reader: `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-19_11-58-48_859109/`.
The harness now explicitly selects Yolko for this Yolko reference, rather
than inheriting the user's saved character. Custom replay restoration also
reads the actual arena ID instead of forcing Factory.

A separate long-direction jump tape holds UP+RIGHT for 180 ticks, releases
for 30, holds UP+LEFT for 180 and releases for 30. Complete held-jump arcs
last 82–83 ticks (about 1.4s); directions remain held after hitting the walls.
All **420/420 complete screenshots match exactly**, zero differing pixels over
16,128,000 comparisons. Both actors, cameras, boards and RNG also match.
Native: `scripts/OUTPUT/eggo-reference_2026-10-19_12-03-21_931957/long-direction-jumps`.
Audit: `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-19_12-04-18_567496/`.

Do not generalize this exact tape to every arena. The new 20-row Dragon
fall/recovery diagnostic diverges after a secondary-hazard interaction
(actor Y first differs at frame 221); stage-specific native artwork restoration
also remains incomplete. Evidence:
`scripts/OUTPUT/eggo-tall-water_2026-10-19_11-47-34_648293/` and
`tests/OUTPUT/eggo-mania-visual_2026-10-19T09-48-41-662Z/`.

## Latest fixes: singleton art, tall-tower recovery and skeletal fish

### Priority corrections after the first tall-tower verification

The **20-row / 140-cell** roof-start fall/recovery now matches **600/600
complete screenshots**, zero differences over 23,040,000 pixels. A piece caught
while the integrated swimming body is still submerged must be discarded on
the next tick, even when the creature has already overwritten its visible
position. Use `nativeWaterCameraY` for that contact/discard position. The earlier
model retained this item and diverged at frame 154.
Evidence: `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_20-04-46_531423/`.

The seven non-Factory arenas now use native decoded water surface, BG1 body
and alternate CPU BG3 art. Their intra-cel timing is not identical to Factory;
the new atlases retain 60 native ticks, indexed by `nativeFrame % 60`. Waterline
positions retain the same delayed descriptor/camera ordering. A fresh second
60-tick cycle in all seven arenas also matches the decoded surfaces/CPU strips,
with 259,168 water pixels independently observed in native PNGs. Evidence:
`scripts/OUTPUT/eggo-arena-water-audit_2026-10-18_20-07-32_447527/`.

Throw sprites formerly always used Factory's texture. The native throw source
is exactly the arena's 48px placed-piece picture with an 8px transparent border;
affine transforms still use the original unrotated source. Eight native arena
throw samples match every pixel. Do not use an arena's already RGB565-converted
green as if it were a fresh RGB555 channel.

`native-rescue.js` ports the airship and attraction handlers (`0x0801aa90`,
`0x0800dc28`). The old bitmap origin put the ship 68px too low. Native rescue
tests old dry Y, requires the round counter above 350, and is skipped while
swimming or force-rising through the tower. The actor then accelerates toward
the moving ship, clamps each velocity to 4 px/tick and follows it after arrival.
The ROM word at `0x02003294` is the **arena ID**, not a game-mode ID: Castle
fixes both ship coordinates; Space fixes X and uses an 80px capture anchor
instead of 96px. Six boundary/recovery probes include 90 exact attraction
positions. Portable boat samples cover both fields in all seven other arenas
(840 exact Q16 coordinate pairs).

Both Castle's shark and Pirate's skeletal fish now use their actual affine
matrix and prior submission state. Twenty independent sprites match 81,920
RGBA pixels; 19,625 opaque sprite pixels were also observed in native PNGs.

Bomb art previously omitted the separate burning fuse. Body blink, shrinking
wick offset and flame are distinct native mechanisms (`0x0800efc0..f090`). The
flame uses the independent 24-tick clock at RAM +0x16c, with two submission ticks
of delay; it is not determined by remaining fuse time. Three body pictures and
three flame pictures reproduce all 249 tested composites. Keep
`nativeAnimationClockOffset` when restoring a checkpoint.

Muted hidden rendering evidence:
`tests/OUTPUT/eggo-mania-visual_2026-10-18T18-07-42-685Z/`.
Focused model checks: 20 passed, including six rescue gates and native boat
positions. These are bounded proofs, not whole-game decompilation completion.

The 15-row solid tower now matches **600/600 full 240x160 screenshots,
zero differences over 23,040,000 pixels**. Both actors, both cameras, boards
and all three RNG streams also match. This diagnostic starts on a roof of
105 individual squares, falls through it into water, rises through all 15
rows, collects a piece while being carried, and settles back on the roof.
Initial board/art/actor/roof-cache writes are logged; the subsequent replay
is autonomous and native traces are comparison-only.

- App: `tests/OUTPUT/eggo-mania-visual_2026-10-18T15-32-25-620Z/`
- Pixel audit: `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_17-34-11_212476/`
- Native: `scripts/OUTPUT/eggo-reference_2026-10-18_14-14-27_640076/solid-15-water`
- Setup: `scripts/OUTPUT/eggo-tall-water_2026-10-18_14-14-27_096411/`

ROM `0x0800f91c..f97a` retains field flag +0x1240 after the creature lets go.
It forces -3.5 px/tick (-5 with boots) until the actor clears
`(cachedRoofRow - 2) * 16`, then resumes ordinary integration. Applying one
upward kick and gravity immediately was insufficient for tall towers.
The cached roof and column heights at field +0xec8..ee8 must be initialized
along with a diagnostic board. The earlier synthetic 20-row cases omitted
these caches and cannot establish correct tall-tower recovery.

The replaced portable stack profiles start on roofs of 8 and 20 rows (one
20-row case has a buried opening). Together with the empty case they compare
1,420 native actor samples, and all settle on the appropriate roof. Sources:
`scripts/OUTPUT/eggo-water-recovery_2026-10-18_14-16-41_422920/`.
The separate real-construction actor regression remains in
`tests/eggo-built-water.test.mjs`.

Ordinary kind-2 singleton commits use template rotation zero for **every**
inventory rotation. Rows 1..3 in that atlas are filler/concrete pictures.
Do not normalize `nativeCellArt` globally: captured filler/bonus cells still
need their original raw descriptor quads. Four independently primed 40-frame
throw tapes match all **160 full screenshots**, with zero pixel differences.
Sources: `scripts/OUTPUT/eggo-singleton-placement_2026-10-18_13-43-17_757686/`.

Skeletal-fish OBJ are affine, with a reflected second matrix row for variant
1 and the ordinary matrix for variant 0. Keep their pre-update position,
angle and active state. Ten native matrices from both arcs match exactly;
all 40,960 reconstructed fish-sprite pixels match native OAM, including
13,126 sprite pixels independently observed in the native screenshots.
Evidence: `tests/OUTPUT/eggo-mania-visual_2026-10-18T15-36-51-868Z/`.

Further corrections found by these tapes: process dry contact/L before
water entry; preserve the drop counter; process floor removal after actor
support; allow pickup catches while carried; keep both free/held idle cels;
do not mirror swim/carry poses; retain OAM's eight-bit Y wrap for the creature.
Water clamps against incomplete rows only, and bubble animation restarts its
own clock on spawn. These are ROM mechanisms, not tolerances or visual hacks.

The longer 2,455-frame active-game tape has matching state/cameras/RNG, but
its last pixel audit still has 27 pixels in 15 frames at the CPU seam. Do not
report that tape as fully pixel-exact. Its first 1,800 frames are the earlier
established baseline. The post-game continuation from frame 2,456 is outside
that active-game replay. Whole-game parity remains unproven.

The focused water/art/throw/walk/fish suite passes 28 tests. The old broad
`eggo-characters.test.mjs` has nine obsolete synthetic-pose assertions that
also fail against the saved pre-change source ZIP; evidence is
`scripts/OUTPUT/eggo-baseline-character-tests_2026-10-18_14-04-58_379343/`.

## Goal and working rules

Reconstruct behavior and rendering from the user's local GBA ROM. Compare
identical input frames, fixed-point state and actual native screenshots.
Do not declare the whole game complete from one successful tape.

- Keep simulation at 1/60 s; rendering must not advance simulation state.
- Keep constants in `RULES`, `VIEW` and the small `NATIVE_*` configuration blocks.
- Use hidden, muted Electron tests (`--mute-audio`,
  `WW_MINI_GAMES_HEADLESS_TEST=1`). Never automate the user's desktop for testing.
- Decode actual ROM tiles, descriptors and tables. Do not use captured whole
  frames as gameplay art or choose backgrounds by nearest actor height.
- Native PNGs are the screenshot oracle. A single saved IO register set can
  represent the wrong HBlank phase and produce a false background discontinuity.
  Trust an offline layer attribution only when its composite matches that PNG.
- Preserve existing changes in the other games. This repository has substantial
  uncommitted and untracked work.
- Run focused checks after material changes; avoid unrelated broad test suites.

## Proven results

The extended Factory/Hard tape now matches **1,800/1,800 complete 240x160
screenshots, with zero differences across 69,120,000 pixels**. Both actors,
both cameras, board events, current-frame CPU emitted/applied keys, hazards,
pickup-manager counts/clocks/bags and all three RNG streams match on all
1,800 sampled updates. This includes boots, walk-stop cycles, multi-floor
bonuses, falling bonus launches and destruction waves.

Evidence:
- `tests/OUTPUT/eggo-mania-visual_2026-10-18T02-33-10-232Z/`
- `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_04-34-51_952217/`
- Native: `scripts/OUTPUT/eggo-reference_2026-10-18_00-17-03_048519/extended-input`

The fixed Factory/Hard 600-frame input tape now matches **600/600 complete
240x160 screenshots, with zero differences across 23,040,000 pixels**.
Player/CPU positions, cameras, board events, CPU emitted/applied keys, hazards,
pickup managers and all three random streams also match on that tape.

Evidence:
- `tests/OUTPUT/eggo-mania-visual_2026-10-17T16-59-26-908Z/`
- `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-17_19-00-24_505509/`

After water/splash rendering changes the independent rerun still matches all
600 frames: `tests/OUTPUT/eggo-mania-visual_2026-10-17T22-00-46-831Z/` and
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_00-01-23_187515/`.

A second, ordinary-input water-entry/recovery tape matches **220/220 whole
screenshots, zero differences over 8,448,000 pixels**. Both actors/cameras,
boards, CPU keys, hazards, pickup managers and all three RNG streams also match.
Evidence: `tests/OUTPUT/eggo-mania-visual_2026-10-17T22-00-28-098Z/` and
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_00-01-01_060345/`.
The final rerun after all extended-tape fixes also matches 220/220:
`tests/OUTPUT/eggo-mania-visual_2026-10-18T02-34-56-034Z/` and
`scripts/OUTPUT/eggo-replay-frame-diff_2026-10-18_04-35-23_764176/`.

This is an autonomous replay after restoring selected state from `hard-idle`;
native traces are comparison-only during the replay. The initial checkpoint
image itself still differs by 1,685 pixels because transient OAM/VRAM descriptors
are not fully restored. Frames 1 through 1,800 match; the checkpoint image and
all other gameplay histories are separate claims.

The earlier water recovery fixture had four profiles (empty, eight solid rows, twenty
solid rows, and twenty rows with a genuine two-column opening at row eight).
All **940 native actor positions, velocities, action states and foreground
camera positions match exactly**. The empty case uses ordinary inputs; the
three stack diagnostics record their RAM modifications. Each diagnostic row
has a different owner: making a twenty-row stack one owner is invalid for the
ROM's bounded component scan. Captured rescue-creature world states and sprite
counters also match. Its stack cases started below the tower and omitted the
cached roof heights, so they have now been superseded by the roof-start profiles
above. Six saved OAM submissions matched its decoded frame and
integer screen origin. The water animation test checks selector/phase/step and
idle RNG-call consumption while the creature carries the actor.

## Water mechanism and the reported false landings

`native-water.js` implements ROM `0x0800df16`, `0x0800f878` and `0x08013a7c`.
All water constants are in `NATIVE_WATER`. Positions and velocities retain
signed Q16 pixels and pixels/tick, including signed rounding of 15/16 drag.

1. Detect entry using the old dry actor position plus 17 pixels. Integrate the
   dry movement, discard held inventory through the normal native pickup path,
   enter state 1 and initialize the countdown to 90.
2. The swimming body receives the water-depth force and drag. At countdown 49
   the separate creature starts rising; its own motion is not actor gravity.
3. Once caught, keep the actor in state 1. The creature replaces displayed Y
   with its Y minus 26 pixels. Normal tower support tests do not run during
   this phase, so solid rows cannot catch a rescued actor halfway through them.
4. The camera and Factory secondary enemy observe the integrated swimming body
   BEFORE the carry handler replaces its Y. Using the displayed carried actor
   for this intermediate anchor incorrectly moves the camera and spawns the
   secondary enemy several frames early, shifting the field RNG.
5. After countdown expiry, retain the release transition, then launch at the
   native -3.5 px/tick velocity. Landing uses both OR and AND foot probes:
   some support below, some free space above, and either no obstruction above
   or support below both feet. Adjacent completely full rows are not a ledge.

Never clear the L-drop bypass merely because an actor starts rising. Never
invent a floor at Y=0 while the actor is inside a filled column. A genuine
opening must remain a valid landing surface.

## Rendering details that must remain intact

- Keep pre-update board rows/camera, actor position, inventory, outline origin,
  affine coefficients and descriptor phases. Each is captured at its own ROM
  update point; substituting live state can be one frame early.
- The outline approaches position and angle using signed Q16 recurrences,
  exact sine lookup and 8.8 affine sampling. It is not an invented turn tween.
- The first outline and the first thrown piece inherit the prior palette for
  one upload. Native palette index zero can be a valid material; do not use a
  truthiness check to select it.
- Factory robot art uses its prior position AND prior camera. Restore wing
  clock, wing phase and facing when replaying a checkpoint; missing wing state
  was a harness error, not a defective wing formula.
- Filler BG animation is uploaded before this tick's filler update: use the
  prior native frame with snapshotted rows. Completion/tool particles use the
  full eight-frame native sparkle atlas.
- Meter sprites extend beyond their field clip. Draw them globally in native
  OAM order, above the divider markers and rails but below portraits.
- Actor sprites also cross the center seam; each field receives the foreign
  actor's overflow in player-before-rival OAM order.
- Cull loose pickups using the untransformed origin: X in [-15,112), Y in
  (-16,160). An affine double-size tail does not override the ROM's culling.
- Floor accounting precedes placement and then reaches OAM on the following
  update. The divider therefore retains both count/upload phases.
- The rescue creature has sixteen ROM-decoded frames (eight rising, eight
  release); falling uses the last release frame. Its animation counter advances
  only when submitted below the native 201-pixel culling boundary.
- Entry discards held inventory as a normal loose pickup before clearing it.
  Native pickup allocation prepends its list; runtime arrays are oldest-first,
  so checkpoint restoration reverses the native manager list.
- Entry and creature return create two mirrored priority-0 splash sprites.
  Sixteen decoded 32x32 frames last two ticks each, starting one tick after
  creation. Draw above the late water BG blend and below the surface sprites,
  using the previous waterline/camera; each arena supplies OBJ palette bank 8.
- The seven-cel walk finishes after directional input is released. Keep its
  accumulator and H-flip through the final cycle, including the takeoff tick
  of a new jump during that cycle. Consume idle RNG only after it wraps.
- Idle actor resources select the pre-step random phase directly; do not let
  a delayed heuristic fall pose survive a landing. Held idle faces the screen.
- All sixteen cels of all eight player air tables now have ROM resource
  mappings. Do not fall back to a similar-looking compact atlas row.
- A falling bonus can change velocity after the animation handler. The rival
  must retain that handler's velocity for this tick's resource selection.
- Particle allocation is shared across both fields. Native dispatch processes
  both boots handlers, both actor/completion handlers, then both pickup
  handlers. `flushNativeParticles` preserves that order without changing RNG.
  Lower pool slots win overlaps. A particle can cross the center seam using
  its owner's camera. Native OBJ culling hides the whole 8px particle when its
  global X exceeds 232, even though its occupied pool slot remains active.
- Loose affine pickups can also cross into the opposite field. Cull against
  their source field's native viewport, then draw their overhang with the
  source camera; the destination viewport's clip supplies its visible part.
- Destruction-wave OBJ priority is 1, above actors, items and sparkles. Drawing
  it before the actors leaves their bodies incorrectly visible through it.
- Water-surface OAM retains two water-clock ticks and one camera tick. The
  water BG body retains one water tick. Use floor, not round, at fractional
  boundaries; the divider water marker also retains two water ticks.
- The warning icon is controlled by water touching a partially occupied row,
  not by the count of incomplete floors. It flashes with native frame mask
  0x30. The two conditions must not be conflated.

## Verification commands

Run from the repository directory:

```powershell
node --test tests/eggo-water-recovery.test.mjs tests/eggo-dive.test.mjs tests/eggo-piece-preview.test.mjs
node tests/eggo-mania-visual.mjs --input-replay-autonomous --input-replay-capture-frames
python scripts/eggo-compare-replay-frame-screenshots.py --app-sheet tests/OUTPUT/<new-run>/input-replay-app-frames.png
```

The final focused check of water recovery, side-wall contacts, two-floor
bonuses and walk-stop/jump phases passes all nine tests:
`node --test tests/eggo-water-recovery.test.mjs tests/eggo-horizontal-contact.test.mjs tests/eggo-completion-bonus.test.mjs tests/eggo-walk-stop.test.mjs`.

`--replay-capture=<project-relative-prefix>` selects another fully traced,
ordinary-input recording from the SAME unmodified `hard-idle` checkpoint.
Required capture switches: `--sample-every 1 --sample-graphics
--actor-motion-trace --camera-trace --ai-trace --enemy-trace --pickup-trace
--arena-trace --board-events --oam-trace`. The comparator supports
`--native-directory`, `--native-prefix <name>.frame` and `--frame-count`.
Read `nativeGlobalRngComparison` in the saved replay report as well as the two
`nativeRngComparison` field streams. The compact console summary omits the
global stream; matching its printed field streams is not proof of all RNG.

Current full water tape:
`scripts/OUTPUT/eggo-reference_2026-10-17_19-07-21_269233/water-full-parity`.
The fixture builder is `scripts/eggo-build-water-recovery-fixture.py`; the
portable measurements are `tests/fixtures/eggo-water-recovery-gba.json`.
`scripts/eggo-water-recovery-probe.py` reproduces all three modified-stack cases.

For one differing frame, use `scripts/eggo-compose-native-layers.py` with
`--capture-directory`, `--capture-prefix`, `--frame`, `--include-all-bgs` and
`--app-frame-sheet`. Check `full_differing_pixels` before layer attribution.
`--pixel-write-probe=frame,x,y,width,height` on the Electron replay records
which draw calls changed a small disputed region without visible UI clicks.

## Remaining work, in order

1. Extend coverage beyond the current 1,800 ordinary-input Factory frames,
   especially water touching partially occupied rows, hits and transitions.
   `scripts/eggo-extend-input-replay.py` records reproducible longer captures.
2. Preserve the established baselines after material changes, without
   repeatedly re-testing them when neither code nor a concern has changed.
3. Validate water interaction anchors for the other seven arenas. Factory is
   now covered; the earlier exclusion of water-recovery spawns must not be
   mistaken for evidence that other arena water anchors already match.
4. Two-floor completion bonuses now follow the native per-column roof and
   appear one row above it with independent owners; source-selected stage
   artwork replaces the incorrect generic blue map. Their creation and later
   independent falls match the native tape. Three-floor masks are derived
   from assembly but still need an independent recording. Particle contention
   now follows native dispatch order and the shared 14-slot pool.
5. Verify remaining attack/hit/boots effects, rescue-vessel attachment, later
   Survival rounds and arena transitions with new native recordings.
6. Other playable characters, later difficulty cycles, complete sound/timing
   and title/result transitions still lack exhaustive full-frame coverage.
   In particular, native player resource overrides currently name Yolko's
   resource atlas. Before claiming other selected characters are faithful,
   supply their own corresponding descriptor resources instead of reusing
   Yolko's native-air pictures. Only Factory currently has the complete
   native rival-resource table; other rivals retain older clip mappings.

Backups already exist in the user's Downloads directory:
`WW Mini Games - Eggo Mania backup 2026-10-08_11-57-10` and
`Eggo Mania source backup 2026-10-08_17-25-23`.
The newer `Eggo Mania source backup 2026-10-18_00-03-49.zip` contains the
568-file, 78,643,378-byte source/art/fixture baseline before the longer-tape
changes, with a per-file hash manifest. Its SHA256 is
`7f4418978a7bb099768743c29e4e39aabb813044b4f7c98875c6a4bb8495de7f`.
