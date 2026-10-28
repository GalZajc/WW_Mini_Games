# Native sound reconstruction: October27, integrated

The NEW top section of `../../EGGO_REPLAY_STATUS.md` supersedes all historical
checkpoints below. NativeProgramAudioPlayer/worker is active for original-rule
Survival. The COMPLETE production Worker replay matches59621888stereo samples
over108676frames with ZERO differences. The final CURRENT player+Worker replay
also matches all59621888stereo samples, every AudioBuffer copy and217352
scheduled sources, with ZERO differences and ZERO gaps:
`eggo-program-player_2026-10-27T10-00-06-622Z`.
Actual production player/WebAudio transport matches the prefix through1000,
including the former962failure. Separate volumes and model-driven extension
fallback are retained. See root status for precise proof scopes and paths.

This uses the compiled original-game timing context, extracted resources and
native platform, including remaining RAM ARM helpers. It is NOT a completely
hand-decompiled game or merely an isolated sound driver. The sparse packaged
resources plus compiled instruction constants reconstruct original bus memory;
no complete cartridge file or recorded future audio/input/event stream is
packaged. Historical diagnostic source names/comments describe their origin;
the documented production worker now uses that bridge as its timing context.

## Historical development checkpoints

Read the NEW first section of `../../EGGO_REPLAY_STATUS.md` before resuming.
Live audio is still the sound-only worker; it still fails mixed PCM at sample
308294/frame962. The active goal is NOT complete.

`eggo-cycle-reference_2026-10-27T01-56-26-943Z` proves the statically specialized
Thumb program over all108676frames and59621888stereo samples with no difference.
The new cycle-music-shadow and C cycle-stems prototype also retain exact full
PCM through600frames, with lossless independent-volume stems; different seed,
character, stage and synthetic inputs pass too. These are NOT live integration
proofs. BIOS and RAM-resident ARM graphics still use the platform CPU decoder.
The explicit cartridge/common-state test inputs are not packaged app assets.

Current portable prototype: cycle-audio-engine.mjs + cycle-audio-worker.mjs;
uses no host filesystem/device/clock. The production player accepts an optional
injected worker/init/held-button reader for auditing this path. Defaults are
unchanged. Follow the latest build/proof/remaining-work list in the root status.

## Previous checkpoint

## ACTIVE portable audio worker,21:24UTC (supersedes older sections)

Live desktop now uses native-audio-player.js, native-audio-worker.js and
native-audio-engine.js. audio.js routes production requests into the worker;
its WAV code is a legacy diagnostic fallback. Music start/stop/tempo/effects
and every real sound tick are sent at explicit fixed-game-tick boundaries.
The current public Site has NOT been updated.

Independent complete proof, using the actual production integration:
`scripts/OUTPUT/eggo-portable-audio_2026-10-26T21-07-16-538Z`:
108676/108676 full sound RAM frames,401..109076, and every separated stem pair
adds exactly back to the full mixed PCM. No native state/event/timing injection
after the common initial state. No ROM bundled. Native worker CPU~2.2ms/frame,
off the render thread; separate volumes, shared-voice ownership/echo, pause,
resume, exit and restart retained. READY/effect34 do not leak into music.

ACTUAL Worker -> production player -> Web Audio proof:
`eggo-render-profile_2026-10-26T21-23-08-381Z`, comparison
`eggo-pcm-stream-comparison_2026-10-26T21-23-30_747577Z`.
First308294 stereo output samples identical. First mismatch remains at308294
(frame962). Removed ONLY the1641-sample transport delay measured directly
from source.start(), never signal-fitted. Every chunk follows one continuous
sample clock, with an initial sample-aligned lead; inserting fresh lead each
chunk would introduce fractional gaps. Exact test output rate32768 and EXACT
hardwareFPS16777216/280896. The recorder stores a rounded float32 FPS; using
that to derive a resampling rate produces an unrelated1-LSB mismatch.

Original common bootstrap already includes song0/READY/first tick; first prime
consumes that matching initialization rather than resetting active FIFOs twice.
Hardware bootstrap432bytes contains audio fields only. No CPU registers, video
or game memory. VM bootstrap3097 sound RAM bytes +176audio-I/O bytes. Only
sound resources620000bytes in16blocks; missing ROM access throws. Extracted
resource hashes/provenance are in assets/native-audio/provenance.json.
Corresponding audio WASM source/headers/build script/licenses are packaged
as audio-hardware-source.zip, including blip_buf LGPL text and relink guidance.
sites/eggo-mania/prepare.py copies these portable assets and versions worker
module URLs. Binary resource URLs use a generated content-version query.

The end goal is still INCOMPLETE. Full mixed comparison59621888stereo samples
fails: `eggo-pcm-stream-comparison_2026-10-26T21-18-45_153896Z`.
The FIRST timing cause is now directly confirmed rather than conjectured:
`eggo-audio-irq_2026-10-26T21-11-11_027585Z` preserves875original video frames
and original PCM hash. At frame962/sample505, _triggerIRQ -> ARMRaiseIRQ adds
2CPU relative cycles inside an mTiming callback batch; the sample callback
observes relativeCycles2 and cyclesLate3. Its next deadline gains2cycles.
At frame1274/sample505 this happens again. In the audio-only ideal clock,
there is no CPU IRQ event. Need reconstruct this scheduling independently,
including video/VCount IRQs and CPU batching/within-frame PSG writes.
Never insert jumps keyed to observed frames or feed a recorded timing stream.

13 targeted tests pass. Commands to reproduce the useful next diagnostics:

```
node scripts/eggo-capture-audio-commands.mjs --end=109076
node scripts/eggo-check-native-audio-engine.mjs --end=109076 --live-commands=<new-folder> --stems=true
node scripts/eggo-profile-render.mjs --start=1001 --end=1000 --offline-audio=true --native-offline=true --audio-fps=59.72750056960583
python scripts/eggo-compare-pcm-stream.py --native=scripts/OUTPUT/eggo-native-sound-state_2026-10-26T20-01-22_483068Z --app=<new-profile-folder> --app-leading-samples=1641 --limit=329175
```

No need to repeat the complete sound-state run for read-only diagnostics;
it already passes. Stop at the first real mixed-output discrepancy. CLI
diagnostics never play through speakers or operate the desktop. Native core
logging additions remain read-only in a separate tool checkout. Current root
EGGO_REPLAY_STATUS.md has the complete evidence/limits and supersedes history.

## Current complete driver proof

The entire Survival section now passes:108676/108676 sound-state frames,
401..109076. Result `eggo-game-sound-driver_2026-10-26T20-19-04-995Z`;
production command stream `eggo-sound-model_2026-10-26T20-13-00-295Z`;
native reference `eggo-native-sound-state_2026-10-26T20-01-22_483068Z`.
Combined evidence is in `eggo-sound-verification_2026-10-26T20-20-00_330680Z`.
No later original states or sound data are injected into the reconstruction.

The first full test exposed a missed tempo change73842. Native height scan
sees the just-placed CPU piece at roof19, before the loose-owner pass leaves
roof20. Production audio now includes the current `nativeCommittedAnchorRow`;
the regression test also ensures a stale anchor cannot change a later frame.
Nine audio tests pass. Normal sound events remain3618/3618, ordered exactly.

The verifier models native audio initialization on round startup, the second
song0 selection at loadingBudget.frames[0], no driver tick during loading,
and no ticks222..225 during podium loading. These use existing model budgets
and PODIUM_VIEW constants, never a stored per-frame tick stream. This accounts
for native loading cadence through all15 completed rounds and the final loss.

Live playback is still the WAV implementation and **does not pass**. Corrected
offline capture `eggo-render-profile_2026-10-26T20-08-34-840Z` and comparison
`eggo-audio-hardware-comparison_2026-10-26T20-09-07_641269Z` show a failed
877568-sample window. Do not describe the complete driver proof below as proof
of current live sound. Native engine integration is the next implementation.

The offline harness now uses simulated time for source.stop() and puts frame401
at1/FPS after initialization frame400. Old19:57:07 /19:57:58 WAV tests used an
incorrect capture clock. Source hashes and limits are retained in each output.

The following sections retain earlier evidence and implementation details;
their1600-frame driver scope is superseded by the full proof above.

The production game still plays the measured WAV bank. Do not silently replace
it with the prototype below or claim full mixed-audio equivalence yet.

## Verified production behavior

- Entire recorded Survival section, frames401..109076: 3618 native sound
  requests, exactly equal frames and order, zero missing/extra requests.
- All48 nonzero music selections match on the correct frames. Arena music
  starts at countdown tick59, with an advance decode and synchronous cached
  start. Music ID0/menu resets are not included in this48-event comparison.
- `node --test tests/eggo-mania-audio.test.mjs`: eight passing tests.
- Latest full event comparison:
  `scripts/OUTPUT/eggo-sound-comparison_2026-10-26T15-15-36_453769Z`.
  It compares production replay `eggo-sound-model_2026-10-26T15-13-48-848Z`
  with native trace `eggo-native-event-trace_2026-10-26T10-11-39_459193Z`.
- Full music-call audit, every original image unchanged:
  `eggo-native-event-trace_2026-10-26T15-04-50_539938Z`.

## Isolated native sequencer

`renderer/games/eggo-mania/native-sound-vm.js` executes only the Thumb sound
code. It has no browser/audio device or ROM acquisition. Native calls use
init2070c, song2053c, effect20898, tick1f480, VBlank DMA flip1f448,
pause1f404, resume1f420, tempo1f2cc. Addresses are relative to0x08000000.

The Unicorn oracle explicitly adapts word/halfword alignment to ARM7TDMI;
Unicorn's default ARM926 unaligned stores/loads are different. No comparison
is made correct by masking memory differences. 3156 calls over songs0..11,
then526 additional calls over songs12/13, match RAM and I/O exactly.

All sound RAM bytes in0x03002470..0x03003088 match the actual original game
for1600 frames401..2000, including PCM ring buffers and overlapping effects.
This also passes using ONLY a sparse sound asset, with an assertion on every
ROM read. Sparse proof: `eggo-game-sound-driver_2026-10-26T19-34-07-826Z`.

Sound-only draft asset:
`scripts/OUTPUT/eggo-sound-driver-extract_2026-10-26T19-33-58-670Z`.
It is620000bytes in16 blocks, plus3097bytes of sound RAM initialization.
Fourteen songs were run8000ticks each and all50 effects240ticks each.
The complete known sound-code/table interval1f2cc..21b14 is retained too:
isolated effects alone do not cover all priority/replacement branch code.
The asset is NOT installed in the production assets folder yet. Do not ship
the complete ROM, whole emulator states, SDK or diagnostic folders.

Initialization matters: init2070c alone leaves sound-envelope pointers from
the previous native context. A zero-filled VM immediately reads address2
in an inactive envelope. The validated extraction starts from the captured
sound-only RAM region, then calls native init/song routines. Do not hide this
with a global zero/open-bus fallback or include all unrelated game RAM.

## Hardware and PCM evidence

The recorder core identifies itself as mGBA70ed83c. Its original GBA/GB PSG,
timing queue and blip_buf compile to an audio-only WASM module with wasi-sdk27.
No game/CPU/cartridge is linked into this WASM. Bridge/build scripts are here
and in `scripts/eggo-build-audio-hardware.py`. Native sources are in
`scripts/.tools/mgba-audio-source/`; SDK is portable in `scripts/.tools/`.

`eggo-render-game-sound-driver.mjs` runs the VM + hardware prototype. Starting
from a fresh native frame400 state, the first308294 output stereo samples
match; first difference is frame962, raw mixer sample514. It is a PCM-B sample
boundary, not a bad noise-channel waveform (the initial noise hypothesis was
rejected by raw mixer logs). Native B is4 while the ideal-timed prototype has5.

At that point the original sample clock has drifted two CPU cycles from a
strict512-cycle sample schedule. Native timer-B fires at592433152, then the
audio sample is evaluated at592433160 with cyclesLate6, i.e. scheduled time
592433154. The prototype's strictly periodic sample is at592433152 and gets
the preceding FIFO byte. The original timing queue also includes CPU relative
cycles during DMA processing; inspect this before adding offsets. Never fit
a frame-specific epsilon or per-effect delay to these samples.

To isolate hardware from CPU timing, a disposable native core logs actual I/O,
FIFO reads and audio sample ordering/clocks, without changing emulated state.
Every image and the complete PCM SHA256 remain identical to the installed
core. Build source modifications are ONLY read-only logging + a missing GBModel
enum include and excluding duplicate Windows/libretro memory allocation code.
`eggo-instrument-audio-core.py` is repeatable. Original io.c is retained nearby;
audio hardware WASM builds from the pristine audio source, with read-only mix
diagnostics generated into its own timestamped output folder.

Strong hardware proof:
- Trace `eggo-audio-register-trace_2026-10-26T15-39-38_649427Z`.
- `eggo-replay-audio-registers.mjs --manual` replay
  `eggo-audio-register-replay_2026-10-26T15-39-54-265Z`.
- Comparison `eggo-audio-hardware-comparison_2026-10-26T15-40-15_969795Z`:
  **877568 output stereo sample frames, zero differing channel samples,
  zero offset, zero gain adjustment/resampling.** All877800 internal raw mixer
  samples match too; the installed core outputs512-sample host packets.

This proves the hardware implementation when fed original timing. It is NOT
proof that the reconstructed game produces that timing, or that all109076
frames of live audio match. The native time trace is diagnostic evidence,
not a prerecorded solution to ship in the game.

## Next work

1. Preserve native VM and sparse asset exactness while reconstructing timing
   independently. Isolate CPU relative-cycle contributions versus true GBA
   hardware behavior; no arbitrary integer/sample shifts.
2. Build a live portable audio producer using only extracted sound resources,
   preferably off the main render thread. Preserve pause/restart, music and
   effects volume controls, controller responsiveness and all game visuals.
3. Compare actual mixed audio, including transitions/tempo and shared channels,
   across progressively longer original input windows. Full event matching is
   already done: avoid repeating it for every diagnostic-only change.
4. Run appropriate visual regressions after integration, then publish Sites.
   Public Site is still version4; current audio work is not deployed.

All tools are silent/headless. No testing needs the user's mouse or speakers.
The user no longer notices input latency after restarting; no new latency
workaround is requested. Keep performance changes evidence-based.

Licenses: retain mGBA MPL-2.0 source notices and blip_buf LGPL-2.1-or-later
notices/source availability when packaging the WASM. Full upstream source
archive is in `scripts/.tools/archives/mgba-70ed83c.zip`.
