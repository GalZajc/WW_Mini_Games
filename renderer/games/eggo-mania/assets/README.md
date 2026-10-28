# Artwork provenance

These PNGs are decoded graphics from the local file supplied by the user, `Eggo Mania (E) (M6).gba` (Kemco / HotGen). They are not newly generated or independently authored artwork. The ROM itself is not copied into WW Mini Games, and the game does not require it at runtime.

Decode path: the installed mGBA libretro core → VRAM, palette and OAM dumps in `tests/artifacts/eggo-reference` → `scripts/eggo-decode-reference.py`. Factory uses `asset-probe`, dragon `dragon-assets`, castle `castle-assets`, pirate `pirate-assets`, space `round5`, jungle `round6`, park `round7`, beanstalk `round8`. Rival images are each state's 64×64 OAM object using palette 1; Yolko uses palette 0. Tile textures are regions of `blocks-assets.bg0.png`; the two meter parts are objects 5 and 6 of `asset-probe`.

Rivals use native pose atlases. The eight default playable characters now have
separate player pose sheets, portraits and win/loss podium sheets. Yolko's
walking animation uses all seven consecutive pictures from decoded ROM pose
group 4; its cycle and facing-change delay are checked against a frame-stepped
native capture. The original
ARM decoder at IWRAM 0x03001638 decodes their ROM frame resources; character
palette/root/frame provenance and native result captures are in characters.json.
scripts/eggo-build-characters.py and eggo-install-characters.py build these assets.
The decoder's OUTPUT also keeps the original packed 4bpp frame bytes with
per-frame offsets, so later palette work can use the exact ROM color indices.
Damage, swimming and water-recovery frames are included in each player sheet and
are selected from the measured native state transitions. Full rival special-pose
palettes, complete animation coverage and original HUD composition remain
unfinished. The renderer retains procedural loading fallbacks.

The rescue blimp is composed from palette-6 OAM objects 35–39 of rescue-assets, at their original relative coordinates. Transparent margins are preserved.

The non-Factory `*-water-surface.png`, `*-water-body.png` and `*-water-bg3.png`
atlases are decoded OBJ/text-map art, not screenshot backgrounds. Each retains
60 native ticks; row selection is `nativeFrame % 60`. Surface frames are 112x32,
BG1 frames 112x176 (source Y=80), and alternate CPU BG3 frames 112x18.
`arena-water.json` records original checkpoints, capture prefixes and hashes.
Factory keeps its separately validated 15-cel surface/body atlases.

`bomb-parts.png` contains three native 16px bomb bodies followed by three flame
pictures. `bomb-fuse.js` centralizes the ROM's timing/anchor parameters;
`bomb-fuse.json` and `bomb-fuse.png` retain the 249 independently recomposed OAM
samples used to validate those formulas. Flame phase comes from the independent
24-tick global animation clock, while wick shortening/body blink use fuse time.

The old `water-creature.png` is object 26 of water-up30 and remains a loading/
legacy fallback. `water-creature-phases.png` contains all sixteen 64x64 native
rising/release pictures decoded by `scripts/eggo-build-water-creature.py` using
the original ARM decoder. Its JSON records the ROM literal/resource addresses,
palette bank, input hashes and raw frame hashes. Native falling uses release
frame seven; OAM coordinates and phase are checked in the water fixture.

The meter pointer comes from bot-tower.frame00600 object 4. The renderer uses
only the top eight rows of the existing 64×32 meter parts; lower unused sprite
rows contain graphics outside the visible meter and are deliberately omitted.

panel-atlas.png contains original 8×8 panel quarters from input-only bot-tower
captures 120, 600 and 840. Its JSON records source hashes, material classification
and missing-case substitutions. It is assembled by scripts/eggo-build-panel-atlas.py;
no synthetic repainting is used. Some corner cases remain unobserved.

platform.png is the 112×48 region [0,200,112,248] of board-before.bg0.png;
the panel builder records the source hash.

yolko-poses.png/.json are built by scripts/eggo-build-actor-atlas.py from
input-only actor-motion, camera-throw, actor-free and actor-hop captures.
The discarded-piece capture picks up another piece at frame 28, so only earlier
frames are used as empty-hand samples. Other empty-hand airborne samples come
from the native post-throw hop. Pose cycling/state selection is fitted, not a
transcription of every native animation state.

item-icons.png/.json contain 28 distinct native 16px pictures from bot-tower,
plus an explicitly recorded horizontal flip of icon 18 for the missing fourth
L3 orientation and a hammer picture from the original help page at [84,30,100,46].
The builder validates the flipped source's hash and atlas order. Affine motion
is not baked into these raw pictures. Icon 9 is the filler trowel, confirmed
in the six-cell filling capture; it had previously been mislabeled as a hammer.
The help-page hammer's live-game palette remains to be independently captured.

progress-portraits.png/.json contain native player/rival height indicators from
bot-tower and the existing eight stage captures; each source hash is recorded.

destructive-wave.png contains eight original 112x32 floor-wave pictures in
one horizontal atlas. Objects at X=-8/56 supply the clipped 112px visible
portion of each phase. scripts/eggo-build-wave.py decodes the full animation
from an input-only continuation of the verified collapse onset, records
VRAM/OAM/palette hashes, and exports its eighty-frame visibility timeline.
The shared water palette is byte-identical in all eight captured arenas.
water-warning.png is the native 32px warning symbol (object 7 of
build-oam.frame01920). destructive-wave.json records the source captures.

countdown.png and intro-balloon.png are original introductory graphics from
dragon-start at 11-09-58_790843. The four raw 64px pictures are object 2 at
frames 90/120/180/240 (3/2/1/GO); native affine motion is separate. The balloon
combines its five palette-6 objects from frame 120 in original OAM priority.
scripts/eggo-build-intro-art.py records source graphics/state/ROM/core hashes in
intro-art.json and saves a visual contact sheet in timestamped OUTPUT.
This art is used in the interactive opening. Its 199-frame countdown affine
motion is compiled from an input-only factory trace by
scripts/eggo-build-countdown-motion.py; intro-countdown.json contains provenance.

The eight *-intro.png files reconstruct the high-altitude environment from
overlapping native tilemaps, extending each stage to 510px (pirate 502px).
scripts/eggo-build-intro-environments.py records the source captures, overlaps,
start heights and placement offsets. The generated intro-environments.js is
view data; the corresponding JSON retains provenance. Animated palette changes
and exact streaming beyond the measured intro path are not reproduced.

The eight *-rival-poses.png sheets replace the stationary CPU pictures with
native movement poses. rival-poses.json records the input-only 1200-frame
recordings, initial state/ROM/core hashes, source frames and image hashes.
scripts/eggo_rival_poses.py samples CPU world positions and object tiles every
two frames; scripts/eggo-build-rival-atlas.py assembles the sheets. State labels
are inferred from vertical movement, held-preview objects and subsequent board
additions. These are approximate labels, not decoded native animation states.
Four visually reviewed dark dragon injury poses are explicitly excluded from
ordinary flight; they remain in the reference recordings. Normal frame order,
holding transitions and missing-state fallbacks need further calibration.


bomb-armed.png is native unboxed carried-bomb art, object 30 in the controlled
pickup-position probe at 12-44-24_578471, frame 30. The build script and JSON
manifest record the diagnostic position writes and graphics hashes. The image
does not establish fuse length or blast mechanics.


bomb-explosion.png contains the eight native burst particles with recorded OAM
affine transforms, displayed frames 1..40 of the documented inventory-ID-8
zero-fuse probe. Frames 2..25 contain the effect; subsequent frames are empty.
eggo-build-explosion.py and bomb-explosion.json retain selection rules, source
graphics hashes and the diagnostic write. This art does not calibrate fuse or
damage. Armed-bomb transparent pixels are normalized to RGBA zero.

result-letters.png contains native LOSE! and WIN! glyphs, objects 2..10 with
palette 12 in the input-only bomb-right-expiry frame 248 capture. The builder
and manifest retain original graphics hashes, source inputs and individual
object positions. They replace the prototype result panel; title animation is
not yet reconstructed from the native result sequence.

hammer-flight.png is the native 16x16 palette-2 projectile from the naturally
caught hammer replay, frame 60, object 30. electric-bubble.png is a 256x64
atlas of the four palette-5 factory enemy phases. Their companion JSON files
preserve object metadata and pixel hashes; eggo-measure-hammer.py and
eggo-measure-bubble.py retain capture inputs and parameters in timestamped OUTPUT.

beanstalk-enemy.png contains eight native 64x64 palette-5 creature phases,
extracted from an input-only continuation of the eighth-stage Survival/Hard
profile. eggo-measure-jumper.py and beanstalk-enemy.json preserve individual
source sprite objects, parameters and hashes.

jungle-enemy.png contains eight original 32x64 palette-5 primary jungle
hazard frames, from an input-only first Survival/Hard capture. The companion
JSON and eggo-measure-jungle-enemy.py preserve source OBJ selection, hashes,
controller inputs and the native counter/collision measurements.


space-enemy.png contains thirteen original 64x64 palette-5 primary hazard
phases, from the input-only first Hard space visit. space-enemy.json and
eggo-measure-space-enemy.py preserve source sprite objects and pixel hashes,
plus the exact controller/state provenance and all measured counters.


space-secondary.png contains the three native 64x64 palette-9 missile phases,
from the input-only first Hard space continuation. Its JSON manifest and
eggo-measure-space-secondary.py retain the source OBJ metadata and hashes.
native-sine.js is the original signed 16.16, 1024-entry ROM sine table at
0x080d8550; its ROM hash is preserved with the measurement fixture.


dragon-enemy.png contains the thirteen original 32x32 palette-5 primary
fireball phases from the input-only first Hard dragon visit. The companion
JSON and eggo-measure-dragon.py preserve source OBJ metadata, hashes and
controller/state provenance alongside both measured arcs.


dragon-secondary.png contains eight original 32x32 palette-9 falling-rock
phases from an input-only first Hard continuation. The companion JSON and
eggo-measure-dragon-secondary.py preserve OBJ selection and pixel hashes,
with measured flight profiles and state/controller provenance.


beanstalk-secondary.png contains four original 32x32 palette-9 hanging
spider poses. beanstalk-secondary-vine.png contains its original 8x32
vine. eggo-measure-beanstalk-secondary.py and the JSON manifest retain
input-only capture provenance, object metadata and pixel hashes.

jungle-secondary.png contains the two original 32x32 palette-9 flying
thief poses. eggo-measure-jungle-secondary.py and the JSON manifest retain
input-only capture provenance, object metadata and pixel hashes.

park-secondary.png contains eight original 64x64 palette-9 bird poses;
park-enemy.png assembles eighteen spring-duck poses in two directions,
using original head, spring and base parts. The measurement scripts and
JSON manifests preserve per-part provenance and hashes.


native-items.png contains all 13 original inventory types in four
orientations, recovered from the ROM graphic table with a captured native
palette. native-items.json and eggo-build-native-items.py preserve ROM,
palette and per-picture hashes, offsets and geometry mapping provenance.
# Native round configuration

native-rounds.js contains 3 × 8 × 19 little-endian words decoded from the
local ROM at offset 0xd74b0. It is gameplay configuration, not image data.
scripts/eggo-build-round-config.py records the ROM hash, source RAM hashes,
tables and comparison measurements in timestamped OUTPUT directories.

throw-pieces.png contains the eight original 64x64 building-piece pictures
in all four orientations. eggo-build-throw-art.py selects each inventory
type in the same saved game, uses actual B inputs for rotations, then
captures the original VRAM, palette and affine OAM during an A throw.
The full-size source picture stays in orientation zero; quarter turns from
the native matrix are baked into the atlas. Every picture is checked against
its original 3x3 occupancy mask before the atlas is saved. These are
diagnostic art captures, not ordinary-input game-completion evidence.
throw-pieces.json records all input/state/core/ROM hashes and sprite hashes.
native-reciprocal.js is the original 1024-word reciprocal table used by its
affine scaling; native-reciprocal.json records its ROM location and hash.

placed-{stage}.png contains all thirty-two original 48x48 placement maps
for each of the eight environments. ROM 0x0800c064's stage dispatch selects
the map table, indexed by rotation*1024 + kind*128; only its first six
rows/columns are copied into the tower. eggo-build-placed-art.py decodes
these descriptors using the corresponding captured background VRAM and
palette. All 256 maps match the native piece masks. One ordinary-input
factory placement also matches every copied descriptor and tile image.
placed-pieces.json records map addresses, source hashes and per-map hashes.
These preserve each native cell's original artwork, including corner details
that cannot be reconstructed reliably from its current adjacent owners.

filler-{stage}.png contains three original 16x16 filler growth phases per
environment. eggo-measure-filler-art.py selects a regular piece and filler
inventory diagnostically, uses real A inputs, and samples the persistent
EWRAM background map each frame. These pictures are not the ordinary mono
placement template. filler-pieces.json records source hashes, inputs, cell
creation order, descriptors and transitions. All six cells have identical
three-phase pictures within each arena, with separate growth times.

meter-bars.png contains four full 64x32 native OBJ pictures: normal left,
normal right, flashing left and flashing right. The original field clips
these at its bottom, but upward jitter can expose an additional row, so the
atlas must retain the full sprite height. eggo-measure-meter.py decodes the
existing ordinary-input eighty-frame capture and verifies its entire sprite
textures against the four ROM resources. meter-bars.json records provenance;
the old meter-left/right pictures are no longer used by the renderer.

completed-floor-star.png is the complete 64x8 atlas of eight native 8x8 sparkle
frames, decoded by `scripts/eggo-build-completion-animation.py`. These pictures
serve completed-floor stars, filler emissions and stationary loose-tool
particles. Its JSON records the ROM source, palette capture and asset hash.
The older `eggo-build-completion-star.py` checks only one historical picture.
The model gives each newly completed row the captured 16-frame effect window;
the diagnostic screenshot fixture separately records the captured event age.

progress-divider.png replaces the procedural center pipes with the native
fixed rails. eggo-build-divider.py extracts an unobstructed framebuffer row
and verifies it against all seven other arena captures. The unobstructed
16x96 region of the Electron reference scene matches the original exactly.
progress-divider.json records every source hash and the render comparison.
Portrait movement and meter overlap are separate from this texture check.

podium-background/wins/digits/game-over and podium-win/loss-actor.png reproduce
the Survival result page. eggo-build-podium.py records the captures, hashes,
native decimal-font offset and OAM pose sequences in podium.json. The win
actor has a verified 56-frame cycle; the loss actor is replaced by GAME OVER
after its captured introductory sequence. Win poses use a diagnostic earlier
win checkpoint; loss art and poses come from an ordinary-input defeat.
These assets include mGBA's RGB565 display conversion (green5 shifted left
without replication), rather than direct RGB555 palette expansion. The full
240x160 GAME OVER/WINS 00 Electron render matches its original framebuffer
with zero different pixels, including text, numbers and background.

result-intro.wav, result-loss.wav and result-win.wav preserve the native
music-only stereo PCM. Both outcomes share the initial 225 sequencer frames;
at frame 226 they select different podium music. Loss plays once and ends in
verified silence. Win preserves its initial phrase before repeating a full
768-frame cycle, verified byte-for-byte on all eight native sequencer tracks.
native-result-audio.js stores the loop region; result-audio.json records every
capture, diagnostic write, original sample range and PCM hash. No samples are
normalized or crossfaded. Winning origin uses a logged rescue-position probe;
the losing origin is an ordinary-input checkpoint. Voice cues, shared SFX
channels and exact sub-packet transition latency remain unverified.

factory-water-surface.png stores 15 distinct 112×32-pixel images of the
native factory waterline OBJ animation as a vertically stacked RGBA atlas.
The two 64×32 sprites keep OAM tiles 960..991 and 992..1023 while their VRAM
pixels animate. The cycle lasts 60 native ticks, with each image held for four
ticks. The runtime uses
`floor(((nativeFrame + 39) mod 60) / 4)`. The atlas builder decodes the
sprites directly from captured VRAM, OAM and palette data, preserving
transparent pixels and their native positions. Its source capture, all-frame
phase validation, extraction parameters and hashes are in
`scripts/OUTPUT/eggo-reference_2026-10-07_13-02-24_227876/`,
`scripts/OUTPUT/eggo-water-surface-animation_2026-10-08_06-54-42/`, and
`scripts/OUTPUT/eggo-factory-water-surface_2026-10-08_08-55-13_900348/`.
All 204 captured surface samples and the independent frame-840 checkpoint
match their selected atlas image exactly.

factory-water-body.png stores 15 distinct 112×256 native factory BG1 images
as a vertically stacked RGBA atlas. The cycle lasts 60 native ticks, with
each image held for four ticks; the renderer selects
`floor(((nativeFrame + 39) mod 60) / 4)` and applies the captured 12:4 blend
to the water portion from source row 80. The 60-frame source capture,
frame-840 calibration, all 82 visible BG1 phase checks, extraction parameters
and hashes are in `scripts/OUTPUT/eggo-reference_2026-10-08_09-02-18_647810/`,
`scripts/OUTPUT/eggo-factory-water-body_2026-10-08_09-02-38_274550/`, and
`scripts/OUTPUT/eggo-player-water-body-phase_2026-10-08_07-03-10/`.

factory-waterline-bg3.png stores the CPU field's alternate BG3 map as 60
consecutive 112×18 RGBA phases. The extractor decodes screen base 11, palette,
and native frame directly from all 600 graphics captures. Every phase repeats
exactly in ten samples; all 904 visible scanlines across the 65 alternate BG3
frames match the atlas with zero source-pixel error. The live renderer selects
`nativeFrame % 60`, aligns source row 80 to the split below the previous
waterline, and applies the captured 12:4 RGB555 blend. Parameters, per-frame
hashes, phase atlas, and source checks are preserved in the timestamped
`scripts/OUTPUT/eggo-factory-waterline-bg3_*` folder.

factory-background-atlas.png stores captured native 112×256 BG3 maps for each
field. The extractor decodes each map and palette from VRAM, handles native
4bpp/8bpp control changes, and bakes horizontal BG3 scroll into each field crop.
It combines an input-free trace, an active model-player trace, and independent
native checkpoints. These maps are reference data only: the runtime does not
select them by actor height, because equal-height captures can have different
maps and some replay maps are absent from the atlas. Runtime rendering uses the
decoded BG3 ring and streamed updates instead. Extraction parameters, source
hashes and capture records are in `factory-background-atlas.json` and the
timestamped `scripts/OUTPUT` folder created by
`scripts/eggo-build-factory-background-animation.py`.

ROM routine `0x0800B480` selects each active 8-pixel tile row from a
frame-indexed ROM pointer table and queues its raw tile bytes into VRAM. The
copy rule is independently checked against the native DMA queue and VRAM by
`scripts/eggo-verify-stage-bg-stream.py`. Constructor `0x0800AF40` and the
initial tile-map rows have also been replayed against native captures by
`scripts/eggo-replay-stage-bg-stream.py`. The custom decoder copied to IWRAM
at `0x03000110` now reproduces all 16 compressed player/CPU source rings
across the eight Survival arenas exactly; `scripts/eggo-decode-stage-rings.py`
records each native comparison and row hash. The same configs point to
per-stage palettes (all entries except native-rewritten slots match captured
palette RAM) and an additional `0x800`-byte tile chunk. That chunk matches
captured VRAM at `0x06004C00`. `bg3-{stage}-{player|cpu}.png` contains each
original 8bpp, 14-tile-wide, 64-row Survival background ring, colorized with
the matching palette and the capture's streamed rows. Each
`bg3-streams-{stage}-{field}.png` contains every variant found in the field's
native row-descriptor tables; generated `background-rings.js` maps ring rows,
widths, rates, periods and atlas offsets. At runtime the renderer patches the
selected variant into a cached ring using the ROM frame counter's rate/period
rule. One counter origin is selected from the first arena's capture and advances
once per simulated game frame across arena changes and Survival rounds. This
recovers relative animation timing; absolute phase from boot and title/menu
time is still not tracked, and capture origins from different arenas have not
been calibrated against one continuous native run.
`background-rings.json` records image hashes, ROM source addresses and states.
The measured factory height atlas is diagnostic only; runtime selection by
actor height is disabled because it caused false background jumps. Full evidence is in the timestamped
`scripts/OUTPUT/eggo-decode-stage-rings_*` folder.

`native-divider-waterline.png` and `native-divider-progress.png` are the
captured 8×32 OAM sprites used by the center separator (objects 10/11 and
12/13 respectively). Their placement follows ROM routine `0x0801a380`: the
first pair tracks each field's waterline fixed-point high word, while the
second pair tracks each actor's completed-floor count. The renderer converts
the source PNG's RGB555 green to the framebuffer's RGB565 green on load.
Placement formulas and a 600-frame RAM/OAM audit are recorded by
`scripts/eggo-audit-divider-oam.py` under the timestamped
`scripts/OUTPUT/eggo-divider-source-audit_*` folder.

`water-splash-{stage}.png` contains sixteen 32x32 frames decoded from ROM
pointer table `0x083f1e64` using the original IWRAM decompressor. The update
routine `0x08019f74` advances at half a frame per tick and excludes the table's
seventeenth entry. Each atlas uses its arena's native OBJ palette bank 8.
`water-splash.json` stores source addresses, raw-frame hashes, palette captures
and asset hashes; `scripts/eggo-build-water-creature.py` regenerates them.
Native creation `0x0801a168` supplies a width of 8 pixels on actor entry and
16 on creature return. Rendering mirrors the second sprite around that gap.
The complete 220-frame Factory water tape, including both splash sequences,
matches every native screenshot pixel; see the current `AGENT_GUIDE.md`.

`bonus-{stage}.png` is the bonus cell selected by the eight stage branches of
ROM `0x08004e20`. Their pointer literals begin at `0x08004e78`, distinct from
the unused generic branch's map at `0x0821177c`. The builder
`scripts/eggo-build-completion-bonus-art.py` decodes the four copied tile
descriptors and saves per-stage VRAM/palette/art hashes in `completion-bonus.json`.

The complete seven-cel free and held walking tables (`0x083f222c`/`0x083f2248`)
now map to actual decoded character resources. Four additional free-hand cels
were appended to `yolko-native-poses.png`, preserving its existing indices.
`scripts/eggo-build-complete-walk-mapping.py` records and regenerates this map.

`scripts/eggo-build-complete-air-mapping.py` completes all sixteen cels of
the eight moving/still, held/free air tables (`0x083f2274`..`0x083f22ac`).
Every entry now references its actual resource group 6..13, including the
previously omitted first held/still rising cel. New atlas cells are appended;
the walking mappings and existing native-pose indices remain valid.

## Character selector and supplemental actor resources (2026-10-19)

`character-menu-background.png` is decoded BG0 tile/map artwork;
`character-menu-sprites.png` contains individually decoded native OBJ pictures,
labels and controls. Positions and capture hashes are in `character-menu.json`.
Build with `python scripts/eggo-build-character-menu.py`. The seven additional
`*-native-poses.png` sheets use the same ROM resource group/cel mapping as the
existing Yolko supplemental atlas, with each character's own decoded pixels.

`character-menu-animation.png` stores deduplicated native OBJ pictures, not
screenshots. `character-menu-animation.js` stores independent exact-period
position/cel tracks; source checkpoints, native captures and periods are in
its parameters. Rebuild with `eggo-build-menu-animation.py` (which runs
`eggo-fit-menu-animation.py`). The fixed Hard label is deliberately retained.

`*-water-bg3-body.png` expands each CPU water atlas from the previously
sampled 18px strip to the complete native source interval Y=80..255.
`eggo-build-water-depth.py` records source paths and all decode parameters.

`preview-palettes.js` additionally stores complete per-material palettes and the
initial OBJ palette at ROM offset `0xdce90`, generated by
`scripts/eggo-build-preview-palette.py`. A first throw whose preceding outline
was outside the viewport retains this initial palette until its material upload;
a displayed outline instead leaves the black/white palette. The renderer maps
the source material pixels back to their original palette indices. Generator
parameters and source hashes are saved in its timestamped OUTPUT directory.
