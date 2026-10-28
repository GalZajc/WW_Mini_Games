# CURRENT: October27, exact original-rule Survival audio ACTIVE

October28 menu fix: character selection now starts native sequencer song1
(ROM08000d74/08001b12), emits navigation effect10 and advances at fixed ticks.
Previously this screen never advanced sound, so enabling browser audio still
produced silence until a round started. Gameplay still starts a fresh original
session. Brave menu-first proof: eggo-browser-sound_2026-10-28T00-41-35-127Z
(menu peak0.491, next-round peak0.556);22 existing audio/network tests pass.

FINAL COMPLETION AUDIT PASSED (October27):
`scripts/eggo-verify-program-player.mjs` exercises the CURRENT published
player AND Worker for every packet, including all AudioBuffer channel copies,
source.start times, continuous sample positions and final PCM. This closes
the remaining full-length scheduler/current-build verification gap, rather
than relying only on the earlier Worker proof and shorter WebAudio prefix.
Current output: `scripts/OUTPUT/eggo-program-player_2026-10-27T10-00-06-622Z`.
Completed108676 frames,59621888 stereo samples, firstMismatchnull, gaps0,
217352 scheduled sources, finalScheduledSample59623529 (exact expected end).
PCM SHA2569524921101d85e671a098f5feb5bee6a5a3918e15ad895dffd4cc753a2b7fdf0.
PeakRSS262656000bytes; runtime869seconds at BelowNormal process priority.
This is the CURRENT player+Worker proof, superseding the older Worker-only
full proof. The subsequent menu-only fix resumes paused audio when confirming
a new game after an online match; no verified per-frame audio code changed.
All22 targeted audio/network tests pass, including that lifecycle regression.
Final reproducible proof index, parameters and pinned source snapshots:
`scripts/OUTPUT/eggo-sound-verification_2026-10-27T10-29-39_370308Z`.

The desktop now uses NativeProgramAudioPlayer/native-program-worker.js for
original Survival rules. The original program timing context drives IRQ/DMA,
register writes and PCM; model-driven audio remains warm for extensions and
custom rules. Anticlockwise rotation switches to that model path without a
song restart or lost/repeated packet samples. Multiplayer uses the model path
immediately and does not download/wait for the original-game context.

COMPLETE PRODUCTION WORKER PROOF:
`scripts/OUTPUT/eggo-program-worker_2026-10-27T02-59-34-583Z` verifies ALL108676
frames401..109076 and ALL59621888 stereo samples, with ZERO differences.
PCM SHA2569524921101d85e671a098f5feb5bee6a5a3918e15ad895dffd4cc753a2b7fdf0.
Both separate-volume stems are transferred through the real production worker
and summed; actual full capture is compared sample-by-sample. Peak total RSS
~250MiB; worker mean5.31ms/frame,95th percentile7.22ms. Warm compilation occurs
on a disposable instance BEFORE actual play, never advancing the real session.
The subsequent small startup refactor defers this preparation to original-rule
sessions so online/custom games do not wait. No per-frame DSP/timing changed.

ACTUAL Electron production player -> Worker -> WebAudio OfflineAudioContext:
`eggo-render-profile_2026-10-27T02-47-54-241Z`, comparison
`eggo-pcm-stream-comparison_2026-10-27T02-48-28_431023Z` matches328704 stereo
samples through1000, INCLUDING the old frame962 failure, with ZERO differences.
Only the measured1641sample transport offset is removed; no fitted delay/gain.
Full raw portable context/stems proof: `eggo-cycle-reference_2026-10-27T02-23-05-227Z`.
Fresh generated startup seed7/Eggo6/Pirate with new synthetic inputs matches an
independent unmodified installed original DLL for600frames/329216samples:
`eggo-cycle-reference_2026-10-27T02-41-54-951Z`. This includes real initialization
from before the constructor; no recorded initialization input prelude.

Packaged assets: renderer/games/eggo-mania/assets/native-program. Code bytes
come from compiled program constants, other resources from program-data.bin;
their assembled bus image is SHA256-checked against the original source ROM.
No complete cartridge FILE or recorded future input/event/PCM/state stream is
copied. IMPORTANT: the context reconstructs the entire cartridge bus memory
and still uses a platform decoder for BIOS and RAM-resident ARM helpers. This
is NOT a claim of a completely hand-decompiled game or a sound-only engine.
The manifest and README state that explicitly; corresponding platform/generated
sources and licenses are included in program-source.zip.

Original rule boundary: default Survival columns/goal/water/crate/AI/hazards/
difficulty, original controls. Controller/keyboard holds are sent in full every
tick; Enter maps to native A on the result screen only. Changes to custom
rules, online human matches, and anticlockwise extension retain model-driven
sound. Music/effect volume controls, pause/resume, fresh-session restart and
stale-frame rejection remain intact. Character-select/framework menus are not
part of the401..109076 Survival waveform proof.

22 targeted audio/network tests (9 legacy +10 native/transport +3 network),
including unequal packet fallback and stale-session handling. Visual-only
harness now destroys audio instead of queuing an unrelated accelerated sound
simulation; fresh600frames401..1000 remain pixel-exact in
`tests/OUTPUT/eggo-long-replay_2026-10-27T03-07-55-527Z`.
Final regression: `eggo-program-worker_2026-10-27T03-45-23-255Z` matches all600
prefix frames on the final asset build. Original platform decoding now also
handles untranslated ROM banks rather than rejecting future unobserved valid
code. All previously covered routes and their virtual instruction timing are
unchanged. No DSP approximation or guessed audio fallback was added.
Cold HTTP Site QA: `eggo-http-audio_2026-10-27T03-32-16-952Z`:320frames reach
playing, original audio active at48000Hz, no queued work/errors; defaultEggo,
anticlockwise extension, fresh Spike restart and human/model audio all pass.
Public Site version6 is PUBLISHED, deployment succeeded2026-10-27T10:29:31Z:
https://eggo-mania-survival-ww.lightraven257.chatgpt.site .
Source commit449faddf4055e5dec09ecf38047fe38e4b85e340;
deployment appgdep_6ae07cf6d6bc8191abaa2bd507383ab1.
Source/archive/proof manifest is saved in the final publish OUTPUT folder.
No additional full replay is needed
unless the per-frame audio/game logic changes or a real failure is observed.

## Previous integration checkpoint (superseded)

The LIVE game still uses the sound-only worker described below. Its complete
mixed output is NOT exact after sample308294/frame962. Do not mark the audio
goal complete using a diagnostic/reference result.

New complete proof: `scripts/OUTPUT/eggo-cycle-reference_2026-10-27T01-56-26-943Z`.
The statically specialized ROM Thumb program matches ALL108676 original frames,
ALL59621888 stereo sample frames and ALL3097 sound RAM bytes/frame,401..109076.
PCM SHA2569524921101d85e671a098f5feb5bee6a5a3918e15ad895dffd4cc753a2b7fdf0.
No recorded event/timing corrections. Runtime372.86s, memory5.5MiB. Native
ARM/BIOS/RAM routines still used the platform CPU in this proof; it is not a
claim of a completely decompiled game. The module is NOT shipped with the app.

IRQ causality is independently confirmed: holdingA from941 changes the CPU's
idle-loop phase by255cycles and whether the VCount callback at962 shares a
batch with the audio sample. The same native deadline can yield a2cycle change
in the next audio deadline. Neutral/UP inputs produce a different original PCM
hash; right128 preserves the recorded hash. Never fit frame962 phase jumps.

New generic initialization starts BEFORE the real Survival constructor at
PC080016b4, frame372, and sets actual seed02011aac and character020003d4.
`eggo-ready-contexts_2026-10-27T01-37-29-171Z` verifies native/model RNG and
arena selection for9contexts spanning all8characters/arenas. Only initialization
uses quiet keys; no recorded prelude is shipped. The old recording comparison
explicitly uses its own common after400state. Synthetic seed7/Eggo6/Pirate
600frame audio matches an independent fresh ORIGINAL installedDLL, including
all sound RAM: `eggo-cycle-reference_2026-10-27T01-40-43-422Z`.

Music/effects prototype: `scripts/native-audio/mgba-cycle-stems.c` and
`cycle-music-shadow.mjs`. No duplicate audio event clock. It samples the native
PSG at the actual sample time, retains shared-voice ownership, and mirrors each
native mixer store/DMA FIFO transfer against a music-only echo history.
600frame proofs preserve exact mixed PCM and lossless Float32 stem sums:
`eggo-cycle-reference_2026-10-27T02-00-14-499Z` (recorded inputs),
`eggo-cycle-reference_2026-10-27T02-01-34-438Z` (seed7/Eggo/new inputs).

Portable integration prototypes (NOT active): cycle-audio-engine.mjs,
cycle-audio-worker.mjs. They accept explicit program/data/common initial state,
then raw held libretro buttons, not only sound-event edges. Production player
now permits an injected worker/init/held-input callback for the real transport
audit; defaults retain the existing sound-only engine. Profile harness supports
--cycle-build=... with --offline-audio=true --native-offline=true.

Latest generated program: eggo-thumb-recompile_2026-10-27T02-17-56_332957Z.
Latest build: eggo-cycle-reference-build_2026-10-27T02-18-05_228722Z.
Adds static ARM ROM interworking stubs and the EWRAM IRQ dispatcher. BIOS and
other RAM-resident ARM graphics routines still use the platform decoder;
attempting to trap ALL RAM ARM code found real code at03001638. Do not claim
that this path has removed every game instruction decoder or ROM dependency.
Next: verify latest portable build600frames (also video), then full replay with
stems, and ACTUAL Worker/player/OfflineAudioContext at least through frame1000.
Do not package/activate it before those checks. Live integration and data-source
packaging remain outstanding; diagnostic full-CPU fidelity alone is insufficient.

Live clock fixes: actual16777216/280896Hz logical ticks/pitch, fixed-tick loading
at30/60/144Hz; explicit offline update(1/60) unchanged.15 audio tests and3human
match tests passed before the latest optional transport injection. Re-run those
after final transport edits. Backup before new stem prototype:
eggo-native-audio-checkpoint_2026-10-27_01-56-37Z (759files).

## Previous live-audio checkpoint, October26 21:24UTC

The live desktop source now uses the original sound-only Thumb driver and
audio-only GBA WASM in a dedicated Worker. Independent WAV loops are no longer
the production path. See the NEW first section of scripts/native-audio/README.md.
Public Site remains version4; these changes are NOT deployed there.

Production Game -> NativeMusic/audio.js -> NativeAudioCommands -> portable
engine matches ALL3097 sound RAM bytes on108676/108676 frames401..109076.
Proof: scripts/OUTPUT/eggo-portable-audio_2026-10-26T21-07-16-538Z.
Commands: eggo-live-audio-commands_2026-10-26T21-06-30-342Z.
Separate music/effects stems sum back to the full16-bit mix on every sample
of that full replay. Runtime keeps pause/resume and the two volume controls.
The run took239.24s for~1819.6s of game audio, ~2.2ms CPU/frame including stems.
One real integration bug was fixed: the last loading frame already runs the
sound tick, even though the visible countdown starts on the next game frame.

ACTUAL browser Worker + NativeAudioPlayer + Web Audio OfflineAudioContext:
eggo-render-profile_2026-10-26T21-23-08-381Z. The first308294 stereo samples
match the original exactly. First difference remains sample308294, frame962.
Comparison: eggo-pcm-stream-comparison_2026-10-26T21-23-30_747577Z.
The only removed delay is1641 samples, directly recorded from source.start()
(initialization frame + transport buffer). No signal alignment fit or gain.
Use EXACT hardwareFPS16777216/280896=59.72750056960583 in this test; the
recorder's float32-rounded59.727500915527344 changes blip's resampling ratio
enough to cause1-LSB differences even before the real timing mismatch.

A continuous output sample clock fixes small gaps that a fresh buffer lead
on EVERY source would have introduced. First startup consumes the bootstrap's
already initialized song0/READY tick once; resetting FIFOs a second time was
incorrect. Bootstrap contains only432 bytes of audio hardware,3097 sound RAM
bytes and176 audio I/O bytes, never full game/CPU/video memory or a cartridge.
Packaged sound data620000bytes; missing sparse-ROM reads still throw.

The PCM goal is NOT complete. Full independent mixed output has differences:
eggo-pcm-stream-comparison_2026-10-26T21-18-45_153896Z,59621888 compared stereo
sample frames, first difference308294. Do NOT call the whole sound exact.

CAUSE now observed directly: GBA's _triggerIRQ -> ARMRaiseIRQ leaves2 CPU
relative cycles in the current mTiming callback batch. At native frame962
sample505 the audio callback runs with relativeCycles=2, cyclesLate=3;
rescheduling adds those2 cycles to its next deadline. Repeats at frame1274
sample505. Probe eggo-audio-irq_2026-10-26T21-11-11_027585Z preserves ALL875
original images and the original PCM SHA256. Need independently reconstruct
IRQ/video/CPU event-batch timing and actual within-frame PSG register times.
Do NOT fit frame962/1274 phase jumps or ship recorded event/PCM/timing streams.

13 targeted audio tests pass (9 existing +4 native/transport). Native golden
fixture is tests/fixtures/eggo-audio-native-prefix.json, no recorded WAV.
Fresh hidden/muted Electron worker audit succeeded (no errors, queue drained).
No new full visual replay was run: game edits add audio calls only, no changes
to actor physics, RNG, graphics or input polling. Existing image proof stands
for its archived sources. All test processes finished; no desktop interaction.
Combined verification: eggo-sound-verification_2026-10-26T21-24-24_634675Z.

## Previous snapshot (historical)

# Full sound-event parity; native audio prototype, October26 before integration

## Latest complete sound verification (October26 evening)

The independent native sound VM now matches **108676/108676 frames401..109076**
of actual sound RAM, including synthesized PCM ring buffers, with no differences.
Inputs are the PRODUCTION MODEL's sound requests, music selections and tempo
changes. Only the common initial sound state is loaded; no subsequent native
state, audio or FIFO values are injected. Sparse sound resources are used,
and missing ROM reads fail immediately.

Proof: `scripts/OUTPUT/eggo-game-sound-driver_2026-10-26T20-19-04-995Z`.
Model commands: `eggo-sound-model_2026-10-26T20-13-00-295Z`.
Native complete sound reference: `eggo-native-sound-state_2026-10-26T20-01-22_483068Z`.
Combined result: `eggo-sound-verification_2026-10-26T20-20-00_330680Z`.
Sound requests remain3618/3618 with equal order and frames;9 audio tests pass.

One real audio-logic bug was found at73842: the CPU's placed piece temporarily
raises its native roof to19 before the loose-owner pass lowers it to20. The
tempo scan uses the retained placement roof. `advanceNativeAudioProgress` now
uses `nativeCommittedAnchorRow` for the current frame, as the existing ambient
logic already did. This fixes the missed -1 tempo call without frame-specific
exceptions or changes to physics/images.

The independent decoder cadence must reset with2070c at each round startup,
select music0 at startup and after the first loading pass, skip ordinary ticks
during round loading, and skip result ticks222..225 while podium resources load.
These are derived from the model's existing loading budget and PODIUM_VIEW,
not a recorded per-frame decoder schedule. The full exact comparison confirms
this cadence over all15 cleared rounds and the final loss.

**The live WAV playback still FAILS sample comparison.** Do not conflate the
complete driver proof with live audio parity. Corrected OfflineAudioContext
capture: `eggo-render-profile_2026-10-26T20-08-34-840Z`; comparison
`eggo-audio-hardware-comparison_2026-10-26T20-09-07_641269Z`,877568 stereo
sample frames, not equal. Stop at this first failed live window rather than
repeating the whole long WAV render. Live integration of the native engine
remains necessary; the current music still starts a steady WAV loop at the
wrong musical phase and isolated WAV sums do not reproduce shared voices.

The offline capture itself had two bugs, now fixed: stop() without a timestamp
must use the simulated clock, not OfflineAudioContext's unrendered time0; and
frame401 must be at1/FPS after initialization frame400, not also at time0.
Earlier live-playback captures19:57:07 and19:57:58 are invalid for judging parity.
The -549 sample comparison offset in the corrected run accounts for the
initialization frame included by the application capture; it is not a fix.

User reports input latency disappeared after reboot; leave input controls alone.

## Previous sound-prototype snapshot

Continue from `scripts/native-audio/README.md`, which contains the current
commands, evidence, exact remaining mismatch, source provenance and next work.
The older October26 sections below describe an earlier snapshot.

Entire Survival recording401..109076: **3618/3618 sound requests match on the
correct frames AND in the correct order, zero missing/extra**. All48 nonzero
music starts also match their native frames. Arena music now waits until
countdown tick59 and preloads during countdown. Eight audio tests pass.

An isolated Thumb sound VM matches3156+526 native driver calls over all14
songs, RAM and I/O. A620000-byte sound-only resource draft passes1600 actual
game frames with identical sound RAM/PCM buffers and strict sparse-ROM reads.
This native engine is NOT connected to live playback yet.

An audio-only mGBA70ed83c WASM backend, fed transparently captured original
I/O/FIFO/sample times, matches **877568 stereo output sample frames exactly**
(no shift, gain adjustment or resampling). All877800 internal mixes match.
The native tracing core preserves both every original image and original
PCM SHA256. This is hardware validation using original timestamps, NOT full
audio parity of the reconstructed game's own scheduling. The independent
prototype first differs at output sample308294, frame962; a two-CPU-cycle
audio clock shift changes which PCM-B FIFO byte is sampled. Do not restore
the disproved noise-waveform hypothesis or fit per-frame offsets.

Latest full production event proof:
`scripts/OUTPUT/eggo-sound-comparison_2026-10-26T15-15-36_453769Z`.
Latest exact mixed-hardware proof:
`scripts/OUTPUT/eggo-audio-hardware-comparison_2026-10-26T15-40-15_969795Z`.
Sparse-driver proof:
`scripts/OUTPUT/eggo-game-sound-driver_2026-10-26T19-34-07-826Z`.

Tests remain headless/muted. The user reports latency disappeared after a
computer restart; do not add input-delay workarounds. Public Site remains
version4 below; current audio changes are not deployed. Full live mixed PCM
parity and native engine integration remain unfinished.

## Previous October26 performance and sound checkpoint

The post-WIN slowdown was in native palette fading, which read back and converted complete sprite atlases for tiny source rectangles. Convert visible rectangles, reuse immutable raw pixels (32 MiB bounded LRU), cache small faded atlases, use exact native channel lookup tables, and clip scrolling 512px rings to the visible 160px region. Mutable scrolling/water buffers are never incorrectly cached as immutable. A black-frame shortcut was rejected after two stage-8 sample differences; the final implementation retains the original draw semantics.

On the same recorded first-round transition: mean fade drawing 60.69 -> 6.07 ms, p95 126.1 -> 9.9 ms; podium 37.87 -> 1.32 ms. Readback area during fade 1,752,174 -> 88,914 pixels/frame. Host load varies: a later busy-machine run measured 12.58 ms mean fade. These are CPU drawing costs, not guaranteed display FPS. Update timing is separate. No game steps or artwork quality were reduced.

RGBA regression: 461/461 first-transition images matched the pre-change renderer; 112 selected images spanning all 15 completed rounds and final loss matched; the later 451-frame window after sound additions also matched. This is targeted regression evidence, not a new full 108676-frame replay.

F8 saves the latest 1800 rendered frames of timings. Desktop output: renderer/games/eggo-mania/OUTPUT/performance_<UTC timestamp>/parameters.json and frames.json. Browser: JSON download. Restart the desktop application to load the new preload/main IPC handler. Capture immediately after a noticeable delay. The report includes frame intervals, update/render costs, and controller-state timestamp to completed Canvas submission when a controller input actually changes. It excludes physical button/Bluetooth transit and actual display presentation; unsupported timestamps are null. There is no continuous screenshot/disk capture or extra controller poll. Paused re-renders do not append stale measurements.

Sound: original in-memory Thumb instrumentation logs sound-wrapper calls while every native video frame retains the recorded SHA256. Frames 301..9000: 8700 unchanged native images, 297 wrapper requests (295 from gameplay comparison frames 401..9000). Additional bounded caller-PC audits resolve the simultaneous jump/drop cue and hammer-contact cue without guessing. ROM on disk is never changed or distributed.

Added/verified original effects: normal placement (3), splashes (11), countdown (17..19), local tower warning (33), cloud thunder (44), rock/missile impact (7), dragon/rock arrival on the human field (30/40), hammer impact (14), rejected placement (5), and delayed result voice (38/39). Removed the false extra filler sound. The sound bank now contains 28 effects; the original 20 waveform hashes are unchanged. Driver slot age now follows native game ticks, not RAF cadence; the targeted 30/60/144 Hz regression and six existing music/pause/PCM tests pass.

First-round event comparison now has 295 native and 295 reconstructed requests on identical frames, zero missing/extra requests. Three within-frame order differences remain: 1486 (thunder vs placement), 4605 (CPU jump vs player placement), 5294 (CPU jump vs rock arrival). This is the next concrete sound task: preserve native global pass order before slot admission. Full music/SFX shared-voice mixing and the entire recording's mixed PCM parity remain unverified. Do not mistake matching event counts or isolated WAV hashes for mixed-audio equivalence.

Sites version 4 published successfully: https://eggo-mania-survival-ww.lightraven257.chatgpt.site . Commit 318a7667289f99c6b5b9492f8688e09d4fa5e074, deployment appgdep_6adf23fb406c8191a8150b86787b05cd. Public audience preserved. Build excludes OUTPUT diagnostics and uses lossless FLAC with versioned ES-module imports. All 439 packaged canonical source hashes matched after packaging. No development servers or benchmark processes intentionally remain running.


## Earlier status (historical)

# CURRENT FEATURES — October 26: native effects, EGGO default, online multiplayer

Completed and deployed version2: https://eggo-mania-survival-ww.lightraven257.chatgpt.site . Site source commit c2e3aad33349c1593fbed022103c6a96d7bdeffd, deployment appgdep_6adea19f90348191b9343a61a26d83c6 succeeded. Existing public audience preserved. Room creation/join/ready/input relay/third-player rejection/close passed against the deployed D1 service. Local two-browser EGGO vs ASTRO invitation passed. No development servers remain intentionally running.

- Initial character selection defaults to EGGO. Desktop selection has an online-game shortcut; shared invitation/match runs on the hosted Site.
- Online adapter exchanges deterministic inputs, seed and character choices; direct WebRTC input path plus reliable HTTPS/D1 fallback. Both participants use the same field/world state; host controls left, guest controls right. Eight complete rounds, a ninth only at4:4. Equal initial terrain/water for humans, without the CPU handicap. Disconnect/checksum errors stop play rather than advancing divergent states.
- Native sound bank:20 isolated PCM effects; explicit model event queues replace generic pickup/completion beeps. ROM dispatch admission matches720 Unicorn cases. Full native music+SFX channel/sample mixing remains unverified.
- Targeted tests:2400-frame independent-input two-model determinism; complete9-round tied-series progression; original built-water and completion-bonus regression checks;5 tests passed in total across the two targeted commands. Original 108676-frame RGB565 proof below belongs to its archived source snapshot; the entire pixel replay was NOT rerun for these audio/default/online changes.
- Verified source backup: scripts/OUTPUT/eggo-online-audio-checkpoint_2026-10-26_01-44-29 (source files +manifest/test evidence).
- Revised statistics: scripts/OUTPUT/eggo-progress-statistics_2026-10-26_01-44-19 .306 advancing full-prefix milestones;92 beforeframe5000. All15 clear boundaries marked from accepted per-frame phase trace; level8 clear64488 inred. These are verification advancements, not necessarily306 distinct bugs.

## Earlier pixel-parity proof and investigation history

# VERIFIED — complete recorded Survival run, October 25

The requested replay comparison is COMPLETE for this recording's Survival portion.

- Recording frames **401..109076**, inclusive: **108676 compared, 108676 matched**.
- **skippedRenders=0, firstMismatch=null, allMatched=true**.
- Full fresh production game, original recorded inputs only, seed1492, startAfter400; no native state injected.
- Every rendered RGB565 framebuffer SHA-256 agrees with the original capture.
- Accepted run: `tests/OUTPUT/eggo-long-replay_2026-10-25T19-24-27-639Z/` (`report.json`, `parameters.json`, source hashes).
- Recording: `tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/`.
- Inputs SHA256: cf7ed889ce9047910797f4ab20687a66d6a2e92d3dd1ba7519699366e3783bd1.
- All replay/diagnostic processes have finished. No pending production trial.

Latest accepted corrections: disabled-primary Beanstalk secondary spawn-height gate; persistent native CPU candidate search; actual throw-handler phase for camera sampling; CPU attraction/arrival animation; loss podium animation/OAM phase, falling title and actor, sprite priority; loss confirmation fade. ROM causes/evidence are in `renderer/games/eggo-mania/REFERENCE.md`.

The end boundary was corrected by inspecting actual native pictures: gameplay ends at108461, loss podium confirmation at109044, fade reaches black109075. The final comparison includes the complete fade through109076. Copyright/credits follow (visible at109150 etc.) and are excluded as requested. Earlier claims that stale actor RAM represented another round through110209 were incorrect; historical notes below are superseded.

This proves pixel equality for the entire supplied Survival recording, including its result screens. It does not prove every unrecorded input sequence/character or audio equality. Credits are outside scope; after the verified fade the app returns to character selection.

Final verified backup: `scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_20-34-46/` (409 files; all source/copy hashes verified). No further replay is needed unless production changes or a new recording exposes a difference.

## Historical investigation notes (superseded by the verified result above)

# FINAL FULL VERIFICATION RUNNING October25 session59630

Alltargetedlatefixes reach requestedrecordingend109076 includingpodiumconfirmfade: lasttarget tests/OUTPUT/eggo-long-replay_2026-10-25T19-23-47-727Z matched42/42 skipped108634(firstMismatchnull;NOTfullproof). FULLfreshJS defaultRUNNING59630 newesttests/OUTPUTeggo-long-replay, seed1492/start400 limit108676 end109076 trace106690 chunk1000. ProductionMUSTremainimmutableuntilreport. Pending sinceaccepted106303backup20-10-26: gameCPUgapreplanonly!aiSearch, viewthrowcameraactualhandler4, CPUrescue7/10, lossOamDelay1/continuouspingpong/titlefall/actorfall/OAMpriority, lossconfirmfadeinsteadimmediatereset. NativeendboundaryCORRECTED below: credits109150+, staleRAMmisledprevious110209. Donotclaimcompletionuntilno-skippedfullpasses; ifregressionfixandrerun. Oncepasses updateREFERENCE/root andcheckpointscript --runexplicit --previous20-10-26. Usercontinueuntilend/quota.

# CORRECTED RECORDING BOUNDARY / PENDING October25 target92900

IMPORTANT earlierend110209wasWRONG: read-onlyscreenshots109150/109500/110100showCREDITS notSurvival. NativeactorRAM/modewereSTALE, notvalidround17. ActualSurvivalgameplay ends108461, podiumuntil109044Aconfirm, fadesblack109075. Nativeclock392thenfreezes duringcreditsload109077+. Finalproofscope401..109076 limit108676 includes entireSurvivalpodium/confirmfade, excludescredits asuserasked. Nativeaudit20-22-28/20-22-53.

Accepted106303exact401..106703 backup20-10-26. PendingCPUgapsearch,throwentrycamera,CPUrescue,lossanimation/title/actorfall/priority,nowlossconfirmationfade (sameexistingwonfade insteadimmediatereset; openscharacterselectafterfadeoutsideproofscope). Previoustarget108830..109043exact. New92900 render-from109035/limit108676. Oncepasses FULLfreshno-skipped401..109076 REQUIRED, donotclaimfinaluntilitpasses. Usercontinueuntilend/quota.

# PENDING October25 — late fixes + full loss podium motion, target33652

Accepted106303exact401..106703 backup20-10-26. Pending gameCPUgapsearch +viewthrowentrycamera/CPUrescue +result-viewlossOamDelay1,pingpongcontinues,titlefalls2px/tickfrom-64tick122,actorfalls4px/tickafter146 +pixelrenderer title independent actor andactorabove wins/digits. Targetprevious108680..108838exact first108839only24overlap pixels actorwronglybehindwins. Reordered wins/digitsbeforeactor tofollowOAMactor3wins4. Newtarget33652 render-from108830 through110209. NeedFULLfreshwholeprefixafterendpasses. ROM/evidenceREFERENCE.md. Allsessionsotherwisefinished. Usercontinueuntilend/quota.

# PENDING October25 — four late fixes, loss podium target2801

Accepted106303 exact401..106703 backup20-10-26. Pending CPUgapsearch, throw-entrycamera, CPUrescueanimation, lossOamDelay1 inresult-view.js. Target108450..108688exact thenlosspodium324pixels first108689; nativeatlasalpha shows picture0 at108689,1at108690..93,2at108694..95 vsmodel1tickearly. Newtarget2801 render-from108680 through110209. NeedFULLfresh4fixes onceendpasses. EvidenceREFERENCE.md. Usercontinueuntilend/quota.

# PENDING October25 — 3 fixes, target7272 near recordingend

Accepted106303 exact401..106703 backup20-10-26. Pendinggame.js !aiSearch generic gapreplan +view.js throw-entry camera previous-sample requires actualhandler4 +CPUrescue animation branch selector7/10 analogousP1. Targetprev107830..108461 exact first108462 CPUrescue art selector5vs7. Newtarget7272 render-from108450/limit109809 through110209. NeedFULLfresh no-skipped proof for3fixes onceendpasses. DetailsREFERENCE.md. Usercontinueuntilend/quota.

# PENDING October25 — CPU sweep + throw-entry camera, target79363

Accepted106303 frames401..106703 backup20-10-26. Pendingproduction game.updateCPU !aiSearch generic gapreplan; targeted106690..107841exact first107842. Newview cameraActorY previous-sample condition requires nativeActorHandlerState===4; staleholdflagwastruebutactualhandler0/selector5 atnewthrow107841, nativecam175/model177. Targetedfresh render-from107830 running79363 final110209. EvidenceREFERENCE.md. Fullprefixmustfollowoncepasses. No e.vychange, preserve. Usercontinueuntilend/quota.

# PENDING October25 — remove generic occupied-gap reset from native CPU

Accepted106303 exact401..106703 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_20-10-26. Onlypendingproductionchange game.updateCPU restricts generic occupied-gap/unreachable-plan replanning to !aiSearch. Nativecursor must persist after receivingnewpiece, ROM70ac..70e6/7706..7760. Targetedfreshsuffix render-from106690 running session31533, finalscope110209. Fullprefixmustfollow once suffixpasses. Earlierfull26977completed/accepted. No stateinjection. Usercontinueuntilend/quota.

# ACCEPTED October25 — 106303 exact frames through106703

FULLfreshJS tests/OUTPUT/eggo-long-replay_2026-10-25T19-00-15-694Z completed: matched106303 compared106304 skippedRenders0 first106704. Beanstalksecondary disabled-primary heightgate bypass accepted entireprefix. Allsourcehashesmatchproduction. Next106704 is generic occupied-gap heuristic resetting native CPU candidate sweep at106701; ROM/evidence documented REFERENCE.md. Back up now before editing game.js. Finalscope110209/limit109809. Usercontinueuntilend/quota.

# CURRENT RESUME — October25 full session26977 pending Beanstalk secondary gate fix

Latest ACCEPTED98416 exact frames401..98816, checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_19-58-28 (409files). Onlypendingproductionfix model.advanceBeanstalkSecondaryMotion optional heightGate, caller passes nativeConfig.primary!==0 (same ROM shared gate11C3C..11C48). Targetfreshsuffix98800..106703 exact; first106704 CPUactor858pixels. FULLfresh run tests/OUTPUT/eggo-long-replay_2026-10-25T19-00-15-694Z running session26977, limit109809 through110209. Keep production immutableuntilreport. Native106701CPUkeys64 butmodel floatfalse; native106703keys80movesright/modelstillzero, likely CPUcontrollerpostthrow gating orroute. Nativeaudit20-00-28, model19-00-27-648Z. Actorpositions/selector match through106700; firstvelocitydiff106701. Needfixcauseafterfullaccepted. Usercontinueuntilend/quota.

# CURRENT RESUME — October25 accepted through98816, 98416 exact frames

FULLfreshJS run tests/OUTPUT/eggo-long-replay_2026-10-25T18-48-42-382Z: matched98416 compared98417 skippedRenders0 first98817. Blast pre-camera allocation flag and stationaryselector8tail BOTHacceptedwholeprefix. Sourcehashesmatchcurrentproduction/no pendingtrial atthispoint. Allreplayprocessesfinished. Lastbackup95061at19-43-08; nextbackupscriptnow. Next98817Beanstalksecondary primary-disabled heightgatecause below, notyetedited. Finalscopeconfirmedthrough110209 (limit109809), menuafter110210 excluded. Userexplicitcontinueuntilend/quota.

# Recording end boundary — October25 read-only verification

Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-25_19-52-45 samples110180..110260. OldSurvivalstate round17/nativeframe392 remains through110209, transition resetsnativeframe1/gate0at110210. Displayisblack110206..110211 (same SHA e2cc2a1fa6131cf4d86faa3baf78851f35a36853e2467c257b3df9d89e85cce5), first visiblemainmenu110212. Screenshot110230showsmainmenuExtraModesselected. Finalproofshouldinclude through110209(limit109809/start400)ifmodelstillblack; exclude110210onwardmenulogic. Priorrunslimit109808ended110208, increaseoneframeforfinalfull. DoNOTextendthroughothermode. Userrequestendsgameportiononly.

# NEXT98817 diagnosis — October25 disabled primary also bypasses secondary height gate

Currentfull63207 remainsrunning, productionimmutable. Target98817 only25pixelsx75..99,y0..3P1spiderpeeking. Model/nativeactors,cameras,RNGmatch. NativeBeanstalksecondary(type8) at98817x72,y522.498/life110/anim1clock1; modelx55.071,y438.711/life142/anim2clock4, so modelspawn32tickslater. Round15configprimary0secondary9; sameROM11C3C..11C48skipsharedheightgatewhenE928word0orword1zero (previousduckfixonlyappliedprimary, thissecondaryneedsanalogous). advanceBeanstalkSecondaryMotion gatealwaysactorY>water-120; passheightGate=this.p.nativeConfig?.primary!==0. Needvalidateearliestspawnandanimationafterchange, nohardcodedframecorrection. Modeldata scripts/OUTPUT/eggo-model-state_2026-10-25T18-50-13-178ZhazardsOnly (nowincludesbeanstalkSecondary), native19-48-55. Functionspawn currentlyoffset170/life175/frames4 alreadyROMvalidatedfirstHardvisit, preserve. Underlyingmodelunusedspeed/variantresetdiffernativeinheritedbutdonotpatchunlessaffectsbehavior. Fulltwofixes beforeeditingmustfinish/backup. Rootbelowhaslastaccepted95061backup19-43-08. Usercontinueuntilend/quota.

# CURRENT RESUME — October25 pending blast allocation camera and idle throw-tail fixes, suffixthrough98816

Accepted94661exact401..95061 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_19-43-08/409files. Currentproductiontrial: model.emitNativeParticle/allocateNativeParticle +beforeCamera flag, carriedthroughgame.flushNativeParticles; projectile/heldbomb explode pass true soallocationvisibilityusespre-camera snapshot whilepreservingexistingphase/allocationorder. Native95062CPUblastslots9&13 y336 survivedallocationwhenoldcam343(-7) thenOAMcam345(-9); oldmodelpostcam345 wronglyculledandreusedslotsfordifferentdebris. ROM1B12C confirms-7thresholdunchanged, notsprite-sizecull. Currentview extendsstationaryphase-retention[3,4]to[3,4,8] so postthrow clipwrap finishesbeforeidle/RNG. Native96122selector8phase0/RNG30554, oldmodelselector2/RNG63291; correctionfollowsE824..E852(noidledirectionrequest)andEE14..EE28(wrapqueues2).

Targetedfreshsuffix95045..96122 and96105..98816 EXACT, skippedrendersNOTfullproof. FULLfreshJSdefaultnowRUNNING session63207 (latesttests/OUTPUT fullrun, trace98800, limit109808 chunk1000). Keep productionimmutableuntilreport. Next98817 round15intro689, model/native/extractorjobs running48208/96243/94511, see latestoutputs. UserexplicitcontinueuntilSurvival110208orquota, don'tstopafterchunk. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through95061, 94661 exact frames

FULLfreshJS run tests/OUTPUT/eggo-long-replay_2026-10-25T15-01-59-029Z: matched94661 compared94662 skippedRenders0 first95062. Threefurtherfixes accepted: P1selector5usesnativeActorAnimationVy(pre-loose-launch sample)likeCPU; duckheightgatebypassedwhennativeConfig.secondary===0(ROM11C3C..11C48); manualdiscard duringwaterrecoveryusesnativeWaterCameraYbeforecreatureoverwritesbody. No pendingproductiontrial, sourcehashesmatchrun. Allreplayscompleted. Priorcheckpoint15-49-45verifiedthrough92729.

Next95062 156pixelsbbox163..220,y0..35CPUparticleexplosion. NativeRAMpool31510 slots14x3c: xincludes128fieldoffset. Nativecpu newblast slots0local16/y352,9local32/y336,10local32/y368,11local48/y352,12local48/y384,13local64/y336. Modelslots0local16/y352,9local32/y368,10local48/y352,11local48/y384,12local64/y368,13local80/y352. Allocationcull rejects uppernativey336 whenCPUcamera345 gives-9<modeltop-7. Candidatecause: allocatorviewportsize differsfor16pxblasts(top-15), orwrongcamera phase(nativepre343 ->-7 vsmodelpost345 ->-9). NeedROM1B12C exactculling, doNOTguess. NativeOAM95062x160y-9exists, priority2. Nativeaudit16-02-10/raw95062, model15-02-09-846Z. ScopeSurvivalthrough110208only, noaudio/laterproof. Userexplicitcontinueuntilend/quota.

# CURRENT RESUME — October25 accepted through92729, 92329 exact frames

FULLfreshJS tests/OUTPUT/eggo-long-replay_2026-10-25T14-42-57-218Z: matched92329 compared92330 skippedRenders0 first92730. All3changesacceptedwholeprefix: loose scanflushfiller, toolB+Apriority, preserveentryrescuecameraactorY. Sourcehashesmatchcurrentproduction; no pending productiontrial atthispoint. Allreplayprocessescompleted. Next92730 pre-launchanimationvelocityproposal below; userrequestscontinueuntil110208orquota. Later suffix/audio unverified.

# NEXT92730 diagnosis — October25 player ignores pre-launch animation velocity

No productioneditfornextyetwhilefull88687runs. At92729 unsupportedownerlaunchesP1 fromfallingtoVY+18.75cells/s. Nativeactorpositions/cameras/RNGandselector5/phaseALLmatch92725..35, butnative92729 group+83c/+840 still12/13(fall-moving), modelnativeRenderFrame92730.animationClock state9/rise table083f2284 instead ofold083f22a4. Native92730RAMtable9 matchesmodelcurrentstate, so ONLYonequeuedpictureearly. model storesnativeActorAnimationVy=pre-loose-launchvelocity intentionally; CPU resource lookupusesit, but P1 advanceNativePlayerPose selector5 atview.js~641uses e.vy directly. Proposedfix animationState=(tower.nativeActorAnimationVy??e.vy)>=0?..., exactlylikeCPU. No pose/physics orphasechange. Nativeaudit15-44-17/raw92728/29/30, earlier15-43-08, model14-43-08-123Z. Currentfullfresh3fixes through92729mustresolvefirst,thenbackupandedit. Userrequestsworkuntilend110208orquota, no stoppingafterchunk.

# CURRENT RESUME — October25 pending3fixes, target through92729

Accepted86855exact401..87255 checkpoint15-25-17/409files. Productiontrialchanges: model.advanceLoosePieces flushes allnativeFillerAnimations tophase2/clear beforefirstunsupportedgroup descent (ROM CDB0 CEb8; guardsp+200 initialized1CDCA); model simultaneous rotate+Use suppression extendedfrombuildingpieces toALLheldtools (native88884B+Awithfillerretainsinventory10/rotation1, oldmodelusedit); view firstrescuecameraentry preserves previous nativeCameraActorY ratherthan replacingpostattractionfloorY (native91036camera100vsold99; bodypositionsidentical).

Targetedfreshsuffixes87245..88884,88875..91036,91025..92729 EXACT. FullfreshJSdefault RUNNING session88687 (latesttests/OUTPUT eggo-long-replay), trace92715, limit109808. Keepproductionimmutableuntilreport; ifregressionfix/revertbeforeacceptance. No new acceptedcheckpointyet. Next92730 888pixelsP1actorbbox43..89,y71..109; nativeaudit eggo-round-intro_2026-10-25_15-43-08. Quickmodelrunning49074/92715..92750. Later suffix/audio unverified. UserexplicitlyaskscontinueuntilendSurvival110208orquota, doNOTstopafteronechunk.

# CURRENT RESUME — October25 accepted through87255, 86855 exact frames

Verified backup: scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_15-25-17/409files, all source/copy hashes verified.

ACCEPTED fullfresh defaultJS replay tests/OUTPUT/eggo-long-replay_2026-10-25T14-18-08-861Z: compared86856 matched86855 skippedRenders0 first87256, seed1492/start400. Sixfixes this session accepted across WHOLE prefix: lateincomingCPUhammer counterselection; rescue strictly opposing sign clamp(retainvelocitydelta0); native loose-owner scanbeforethrowtarget; freezePirateweather onpodium toavoidextraRNG; selector10arrivedartSpacegroup11/others21; blockbuildingUseuntilnativeoutlinepreparedaftercatch. Sourcehashesmustmatchverifiedrun. No pending productiontrial, allownedreplay/model/audit processes finished. Earlier14-16-34 partialfullcancelledintentionally, notvalidation.

NEXT87256 263pixels BGfillerartbbox0..31,y132..152. Bothoccupancyboardsmatch. NativeboardF404+F50filleranimationcount0, stale timers[7,11,15,19,23,27]; modelstillhasindex4phase0row9x1/index5phase0row10x0 born1920. No collapsequeues. Native CDB0 BL0CEB8->3C8CflushALLfilleranimationsbeforefirstunsupportedownerdescent (guardsp+200, set0afterfirstcall); currentadvanceLoosePieces lacksflush. Exactinstructions scripts/OUTPUT/eggo-instructions_2026-10-25_15-23-03_268122. Needinspectsp+200initialization/guard toreplicatecorrectly, thenquicktarget87245 andfullfreshprefix. Other3C8Ccallers03D14(filluse),03F94(blast),1A2D4(rowremoval); modeluse/explodealreadyflush, considerrowremovalalsoaftercheckingROM. Nativeaudit15-19-34/raw87256, model14-19-33-599Z. ThisisNOTwatercreature; noOAMcoversfirstpixel0,132. DoNOTpatchspriteorwave. Later suffix/audio unverified.

Progressfrompreviousbaseline73798 is13457additionalexactframes. Whole12throundandstart13thexact. RecordingsameinputsSHA cf7ed889ce9047910797f4ab20687a66d6a2e92d3dd1ba7519699366e3783bd1. Targeted14-17-23 actualreport hashagreesfull reportfirst87256. Backupwithscriptbelowexplicitfullrun, prior15-09-30. REFERENCE.md detailed evidence and rejectedtrials preserved.

# NEXT87256 diagnosis — October25 no production change

Native87256 mismatch263pixelsx0..31,y132..152 is BG filler ART, notwatercreature/hazard. OriginalnoOAMcoversfirstpixel0,132; bothoccupancyboardsmatch. Modelrow9x1 fillerindex4phase0 androw10x0index5phase0 (born1920), nativehasfull/grownpurpletiles. OriginalboardF404+F50 filleranimationcount0, timersstale[7,11,15,19,23,27], columnsF20=[0,1,2,3,1,0], rowsF38=[38,38,38,38,37,36]. NOcollapsequeuesat87253..57. Likely CDB0 loose-owner scan flushesALLfilleranimations through3C8C BEFOREmovinganunsupportedowner. DirectBLxrefsto3C8C are03D14(filluse),03F94(blast),0CEB8(loose scan!),1A2D4(rowremoval). CurrentadvanceLoosePieces lacks3C8Cflush, althoughuse/explode implementit. Nextinspect0CEB8exactconditionsandreplicatebeforeownerdescent; avoidblamingwaveorcreature. Nativeaudit15-19-34/raw87256, model14-19-33-599Z. No fixyet; waitfull88774beforeproductionedits.

# CURRENT RESUME — October25 pending podium weather, Space arrived art, fresh-catch Use gate

Accepted80288exact401..80688 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_15-09-30/409files. Productionchangesfrombackup: game.updateResult movesadvanceWeather BELOWexistingpodium earlycontinue(avoidextraRNGat80584); view.js selector10 mapsSpacegroup11/others21 forplayer+rival viaVIEW.arrivedRescueGroups; model.use nativebuildingrequirespreparednativePreviewPosition (catchclearsit; nextinputpreparesit, originalvalid86821/22/23=0,1,1). REFERENCE.md detailsROM/evidence. Targetedfreshsuffixprogress80675..84996,84990..86822,86815..87255 EXACT, butskippedrendersareNOTprefixproof.

Fullfresh defaultJS replay RUNNING session88774 run tests/OUTPUT/eggo-long-replay_2026-10-25T14-18-08-861Z trace87245 limit109808 chunk1000, no render-from. DoNOTacceptuntilreport. Earlierfull14-16-34-717Z wasintentionallycancelledat~7000toincludeconfirmedcatchgate; ownednodePID24108treeonlyterminated. Its partialoutputNOTproof. Nootherappwasclosed.

Next87256 263pixelsbbox0..31,y132..152P1bottom-left (originalfirst90,72,205 vsmodel8,48,8), targeted run14-17-23-263Z. Notyetdiagnosed; inspectnativehazard/watercreature/priority. Later suffix/audio unverified. Beforemoreproductioneditsresolvefullprefixregressionifany; ifpasses useexplicit eggo-checkpoint-verified-replay.py --run... --previous... afterupdatingstatus. Keepallproductionfilesimmutablewhilefullruns.

# CURRENT RESUME — October25 accepted through80688, 80288 exact frames

Accepted FULLfresh defaultJS replay tests/OUTPUT/eggo-long-replay_2026-10-25T14-01-19-118Z: compared80289 matched80288 skippedRenders0 first80689. All3fixes accepted: late CPUhammer counterselection, rescuedelta0velocity, loose-owner scanbeforethrowtarget. game.jsbyteexact74768checkpoint. No replayprocessrunning. Detailednext80689weatherpodiumRNGcause below; notyetfixed. Originalweatherfreezesatresult221(counters44,643), modeladvancesduringpodiumandspendsRNGat80584. Later suffix/audio unverified.

# CURRENT RESUME — October25 pending rescue and loose-owner scan fixes

Accepted74368exact401..74768 checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_14-55-38/409files (verify manifest). Current production changes fromthatbackup: native-rescue.js clamp strictly opposing signs only (retainvelocitydelta0); model.js moves native loose-owner scan aftercollapse BEFOREthrow targetquery, keepsownerLimit/prelaunchanimationvelocity andnon-nativebehavior. game.js restoredbyteexactbackup. Earlier target-motion/explosion trials14-58-22 and14-59-23 hadidentical78817hash andfullyreverted. Targetedfresh78805..80688 EXACT1884frames run tests/OUTPUT/eggo-long-replay_2026-10-25T14-00-27-720Z (skipped78404 NOTfullproof). FullfreshJS default RUNNING session49430 run14-01-19-118Z trace80675; doNOTacceptuntilreport. Evidence/ROM rationaleREFERENCE.md.

Next80689 round12intro1090pixels is NOTartororientationbug. First RNGdifference80584 duringinvisiblepodium! Modelweatherpirate counters[0,599] at80583(resultTicks265) thenRNG15854->9383 at80584, originalremains15854. Originalcameraweathercounters80650are[44,643], consistentfreezeatresult221; modelincorrectlycontinuesadvanceWeather()evenafterresultTicks>=roundTicks220+entryDelay2 actorfreeze. In updateResult move advanceWeather BELOW existing frozen/podium earlycontinue (andafterexit-startRound branch), preserving active-resultticks. Native B1EE..B27E calledinsideB074camera handler; podiumdoesnotcallit. No weatherproductionedityet. Nativeaudit15-03-02(80000..80689/raw80650), modelrng14-03-02-153Z, weatherfull14-05-06-142Z. Afterfix runquick80580 andtarget80689, thenfullprefix. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through74768, 74368 exact frames

Late incoming hammer counter-selection fix ACCEPTED full fresh run tests/OUTPUT/eggo-long-replay_2026-10-25T13-47-11-215Z: compared74369 matched74368 skippedRenders0 first74769. No global wave delay. Native73706 lower counter22 retained vsoldmodel21; corrected only when late hammer replaces selected lower non-destructive pass with NEW higher queue. Diagnostics/REFERENCE.md document cause/evidence. No replay process running. Next74769 rescue deltaXzero: original retainsVX, model incorrectly zeroes; ROMDD54..DD68/DDAC..DDFC andDE04..DE52 strictoppositesigns. Nativeaudit14-47-34, quickmodel13-47-33-695Z. No rescue edit yet. Later suffix/audio unverified.

# CURRENT RESUME — October25 pending late incoming hammer counter-selection fix

Accepted baseline remains73398exact401..73798, backup10-23-44. Current production model.js trial records the destruction counter pass and, when a late incoming hammer queues a NEW higher floor in that same tick, restores the lower counter's unneeded decrement before advancing the new highest counter. No global animation delay. Native/model queue audit locates the FIRST counter divergence at73706, CPU hammer collision: original lower row21 retains22; oldmodel decrements21. Both new row20 counters88. Latent error becomes visible73799 and affects row-removal time. ROM18E70 calls BOTH projectile passes before1A1B8, unlike sequential model field updates. Diagnostic helpers now expose all collapse timers.

Targeted fresh input-only rendering73785..74768 EXACT (984frames), next74769; run tests/OUTPUT/eggo-long-replay_2026-10-25T13-46-33-329Z, skipped73384 NOTfullproof. Full fresh default replay RUNNING session29011/run13-47-11-215Z trace74755. Do not accept before report. Earlier overbroad same-tick suppression trial13-45-21 failed73798 because it also altered an earlier existing-highest hammer; corrected to retain original behavior except actual selection replacement. Source backup helper scripts/eggo-checkpoint-verified-replay.py requires explicit full run and verifies all source/copy hashes.

Next74769 411pixels P1actor bbox37..79,y77..110 during win/rescue. Native74768 bodyX2809856/VX-8192, model2818048/VX0: when target deltaX=0, ROMDD54..DD68 does NOT accelerate nor clamp VX, and DDAC..DDFC only zeros strictly opposing signs (dx*vx<0). Current native-rescue.js erroneously zeros when Math.sign(vx)!==Math.sign(dx), includingdx0. Same issue fordy0; confirmedROMDE04..DE52. No rescue production edit yet. Native audit eggo-round-intro_2026-10-25_14-47-34, quickmodel13-47-33-695Z. Later suffix/audio unverified.

# CURRENT RESUME — October25 stable accepted through73798, next13pixel collapse/background composition

CURRENT PRODUCTION HASHES MATCH accepted73398exact401..73798 run tests/OUTPUT/eggo-long-replay_2026-10-25T09-16-14-706Z (skippedRenders0). Verifiedbackup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_10-23-44/408files. No pending productionedit, no running replay. Nativevariableinitialtower/CPUhandicaprules documentedREFERENCE.md October25, audit script+CSV/JSON available. Useraskedstrictoriginalrulesnow, alternativeoptionsLATER, noneadded.

Next73799ONLY13pixelsx0..100,y158..159. Allpositions/cameras/waterlogicexact. Realpixelprobe tests/OUTPUT/eggo-long-replay_2026-10-25T09-23-34-818Z/pixel-probe.json: (3,158)drawFieldbackgroundcorrect205210222, then drawCollapseWave source[x336,y0,w112,h32] overwrites82113131 incorrectly. Therefore NOTdirectwaterbodyblend. ModelcollapseWavefloor25timer18/previous19. Nativequeue333c+12ac row21timer18. NativeOBJ27/28at(-8,155)/(56,155),palette2priority1 havebitmapmaskmatchingdestructive-wavecel2,but likelytheseareWATERsurface sprites(sametablegraphics), notcollapsewave; at73819allnativequeueentries-1yetOBJ27/28stillpresentatwaterY130. Do NOTconflatewaterspritephasewithcollapsephase. Atlasmaskphase3 differs405pixelsfromtheseobjects butRGBcomparisonmustquantizegreen555vs565first.

REJECTED globalcollapseanimation+1counterdelaytrial: targeted73798..73818passedbutfirst73819diff428, andmandatoryfullprefix REGRESSED3584, run tests/OUTPUT/eggo-long-replay_2026-10-25T09-31-31-842Z. Trialfullyreverted(view.jsbyteexactbackupverified, ALLproductionhashesacceptedrunmatch). Noassetalphaeditsmade. InvestigateactualnativecollapsevisualOAMsubmission/window/priority/geometryusingROM1a1b8..1a330. Constants12ac appearliteral1a300/1a360. 1a26c..1a280 picks(7-((r6&3ff)>>2))descriptorsfrom083f1eac. Needdisentangleactualcollapseobjectsfromsame-lookingwaterwaves beforepatching. Native73799rawaudit eggo-round-intro_2026-10-25_10-16-27; native73819 eggo-round-intro_2026-10-25_10-28-32. Quickmodels eggo-model-state_2026-10-25T09-16-26-709Z and09-30-45-076Z. At73815..19 modelpreviouswavetime3,2,1,0,None. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through73798, 73398 exact frames

Accepted73398consecutiveexactRGB565frames401..73798, skippedRenders0. Run tests/OUTPUT/eggo-long-replay_2026-10-25T09-16-14-706Z first73799. SimultaneousB+Aconstructionpiecepriorityfixacceptedwholeprefix: localuse=control.use&&!(control.nativeMotion&&control.rotate&&held.cells); no change to rotation or other actions. Earliercontrolsegment23610Balreadyheld, retainedcorrectplacement. Nativecounterfactualevidenceandstartheight/handicaprules documentedREFERENCE.md. No pending productioneditatbackup. Whole9throundexact, most10throundexact.

Next73799ONLY13pixels x0..100,y158..159 P1CastlewaterbelowUI. BOTHactorY/state/camera/waterlineEXACT73785..73815, quickmodel eggo-model-state_2026-10-25T09-16-26-709Z, nativeaudit eggo-round-intro_2026-10-25_10-16-27. NativeOBJ27watersurface(-8,155),pixel(3,158)transparent; original205210222 vsmodel82113131. NativeBG/waterblend needsactualpixelprobe. Diagnosticcrop ...eggo-long-replay_2026-10-25T09-15-22-350Z/water-compare.png. Freshsuffixprobe73798.. using--pixel-probe73799,3,158 startedcurrentturn; see latesttests/OUTPUT. No waterproductionchange. Later suffix/audio unverified.

# CURRENT RESUME — October25 pending simultaneous rotate/place priority

Acceptedbaseline69656exact401..70056 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_10-12-50/408files. Currenttrialmodelupdate localuse suppressesbuildingpieceUse when control.nativeMotion&&control.rotate (newrotation), retainingrotation. CounterfactualnativeevidenceAalonevsB+Aat4xpositions andBthenAonnexttick confirmsnoedgecollision/norotationcooldown. ActualtapeonlyearlierBA23610hadBalreadyheldsince23604soNOTnewrotation. Targetedfreshlogic/noearlierrenders run tests/OUTPUT/eggo-long-replay_2026-10-25T09-15-22-350Z matches3754frames70045..73798, first73799. FullfreshJSreplay defaultskippedRenders0 RUNNING session38719 trace73785 limit109808 chunk1000. DoNOTacceptuntilreport.

Next73799ONLY13pixels x0..100,y158..159 P1CastlewaterbelowUI; BOTHactorY/state/camera/waterlineEXACT73785..73815 in quickmodel eggo-model-state_2026-10-25T09-16-26-709Z. Nativeaudit eggo-round-intro_2026-10-25_10-16-27/raw73799. NativeOBJ27watersurface palette2priority1at(-8,155),pixel(3,158) isTRANSPARENT; originalpixel205210222 vsmodel82113131. LikelyBG/waterblendundertransparentwatertexels; needsrealpixelprobe afterfulldefaultfinishes(port9397singleharness). Comparisoncrop tests/OUTPUT/eggo-long-replay_2026-10-25T09-15-22-350Z/water-compare.png. No waterproductionchange. REFERENCE.md documentsuser-requestedstartingheight/CPUheadstartROMrules+nativeBAcounterfactualevidence. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through70056, round9 fully exact; native start rules documented

Accepted69656consecutiveexactRGB565frames401..70056, skippedRenders0. Run tests/OUTPUT/eggo-long-replay_2026-10-25T09-04-24-647Z first70057. Latestviewfix P1movingtakeoff usesdirection3/4 instead ofpreviousselector(whichmay2afterdiscardonlanding) acceptedwholeprefix; old65649resolved. Handicapcounter decrementmovedinsidepieceplacementwhileloop, perROM055fa..05606, alsoacceptedwholeprefix(allrecordroundssofarhsmall). Exactvariableinitialheights/CPUheadstart explainedin REFERENCE.md October25 section; reproducibleaudit scripts/eggo-audit-survival-start-rules.mjs ->scripts/OUTPUT/eggo-survival-start-rules_2026-10-25T09-03-11-582Z. ExampleH33/round40Hard2 P1columnheights14x7 CPU[19,19,18,18,17,17,17]; code-derived NOTpixelproofround40.

First70057 843pixelsP1actor/preview. At70056B+Amodelstartsstate4throw, nativejustrotates3->0andstaysstate0/held6. BothprojectiontargetsX8,Y464align; nativevalidflag880remains1. Nativeaudit eggo-round-intro_2026-10-25_10-04-36/(70045..70070/raw70057), quickmodel eggo-model-state_2026-10-25T09-04-35-580Z. Read-onlycapture70054..58 validall1, pressedmask70056=3. Counterfactual originalmGBA fromcheckpoint69900 thenrecordinputs through70055: Aalone launchesstate4, B+Arotatesonly(state0), Balonerotatesonly. Output scripts/OUTPUT/eggo-native-simultaneous-use_2026-10-25_10-11-53/ (JSON/CSV/statehash/params). NeedtestBthenA nexttick todistinguishsameframepriorityfromrotation-animationgatebeforefix. ROMrotationFD52..FD9C,useFEF0..1001E. No pending productioneditatbackup. Allreplayscompleted. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through65648, round9 startup fixed

Accepted65248consecutiveexactRGB565frames401..65648, skippedRenders0. Run tests/OUTPUT/eggo-long-replay_2026-10-25T08-51-06-196Z first65649. Rootfix game.startRound no longeradds nativeConfig.height-47 tousergoal: nativeheight controlsstartingterrain/wateronly, rescueplane staysY128(37tilegoal). Rendererbacktooriginalt.p.goal so netpixel-renderer.jsUNCHANGEDfromprioracceptedbackup. modelconstructor initializesnativeDividerProgress+PendingProgress=actualfullfloors andincompleteFloors=actualinitialincomplete. Round9nativefull14/CPUincomplete1; oldzeroUIvaluescaused57then37pixelsaftermissingbaloonfixed. Newoptional --render-from diagnostics in harness: skippedRenders recorded, allMatchedfalsewhenanyskipped; defaultwholeprefixunchanged. FullfreshcomparisonCONFIRMEDallpriorframes and797newframes. No runninglongreplayaftercompletion.

Next65649 needsdiagnosis. Readonlynativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-25_09-51-19/ (65635..65665/raw65649); quickmodel eggo-model-state_2026-10-25T08-51-18-277Z. Usernowasksalsoexactnativevariable-start-height andCPUhandicaprules; ROM055b8..05624: h=max(0,round+8*difficulty-24),Hard2=>round-8, eachCPUcolumn startsheight-ceil(h/7), hDECREMENTSPERPLACEDPIECEABOVEBASE(notoncepercolumn). Currentmodel decrementsoncepercolumn, discrepancyforlargerhandicap(e.g.round40) needsfixafterbackup. heighttable080d74b0; after8twoRNGdraws selectdifficulty0..2/configlevel2..8; height%5==2 and<=46 =>height++; currentround9height33 confirmedRAM E928+44 andround9/difficulty2from0020/03e8. Do notcallhnumberofextracells: actualplacementuses1/2/3verticalpieces. Later suffix/audio unverified.

# CURRENT RESUME — October25 pending round9 initial tower UI/airship fixes

Acceptedbaseline64453exact401..64853 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_00-37-15/. First64854 nativeFrame3 round9 was3256pixels. Nativeconfigurationround9 difficulty0level2height33: modeltowergoal23 vsusergoal37. Airshiprender incorrectlyappliedconfigurationheighttoverticaloffset(224px), hidingboat. Renderer nowusesg.p.goal(customusergoal) insteadoft.p.goal(nativeconfigadjusted). Reducedfirstdiff57pixels(centerdivider+CPUmeter). Initialnativefullfloors14,modelcount14butnativeDividerProgress0; initializebothprogresslatchestocountfullfloors. Reducedto37pixelsCPUmeter. ConstructorincompleteFloors0wrongforinitialCPUrowpartial1; initializesactualcountbeforehiddenmeterupdate. Targetedfreshinput-onlydiagnostic run tests/OUTPUT/eggo-long-replay_2026-10-25T08-48-12-032Z matches59/59frames64852..64910 EXACT. No completeprefixclaimyet.

Added --render-from=<originalframe> to tests/eggo-long-replay.mjs forfastdiagnostics: logicadvancesfromseed/tape, skipsrender/hashbeforethreshold. Reports skippedRenders and allMatched=falsewhenskipped; defaultfullvalidationunchanged. Targetedreplay64854hashmatchesfullrunbaselineexactly. REJECTEDBG3cachecounterresettrialhadNOeffectandwasreverted. Nativeaudits eggo-round-intro_2026-10-25_09-28-39/(64850..64890),09-30-58/(400..440); quickmodel eggo-model-state_2026-10-25T08-28-38-460Z actorXY/camerasEXACTnative9. Diagnostic57pixelprobe eggo-long-replay_2026-10-25T08-44-54-700Z. Currentproductionmodel.js/pixel-renderer.jschanged+testharness. FullfreshJSreplay nowRUNNING (defaultno --render-from), trace64850 limit109808 chunk1000; get latest tests/OUTPUT folder/sessionfromcurrentturn. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through64853, round8 fully exact

Accepted64453consecutiveexactRGB565frames401..64853. Run tests/OUTPUT/eggo-long-replay_2026-10-24T22-32-17-070Z first64854 atcountdownround9/nativeFrame3. Rivalwalkfix acceptedwholeprefix: direction3left/4right, stoppedwalkretainspreviousselector, phaseentryreset3/4/5, movingtakeoffusesdirectionelsepreviousselector. CPUselector/phase/RNGexact64345..64375. Allround8 includingbubblecapture/release/burst andresultnowexact. First64854 needsdiagnosis (newroundintro). No pending productionedit. Later suffix/audio unverified. Allsessionprocessescompleted; no running replay. Earlier rejected905trial is NOTcurrent.

# CURRENT RESUME — October25 pending rival left/right walk phase

Accepted63959exact401..64359 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_00-29-54/407files. First64360 CPUactorpose469pixels, BOTHactorY/state/camerasEXACT64345..64375. At64359nativeleftwalkselector3 continuesphase98304->114688; modelhardcodesmovingselector4 andrestartsphase16384 afterpause(lastselector3). Trialview.advanceRivalAnimationPhase nowusesfacing3left/4right, stoppedwalkkeepspreviousselector, resetphaseonentry3aswellas4, movingtakeoffusesdirectionwhiletakeoffwithoutcurrentwalkretainsprevselector. Firsttrialretainingprevselectorunconditionallyregressed905 fromidle+rightjump(native4/model2); correctedcurrentwalkingdirection. Freshquick eggo-model-state_2026-10-24T22-31-57-347Z CPUselector/phase/RNGEXACTall64345..64375. Nativeaudit eggo-round-intro_2026-10-25_00-29-57, early905 eggo-round-intro_2026-10-25_00-31-43. FullfreshJSreplay RUNNING session30191 trace64345 limit109808 chunk1000. Onlyproductionview.jschangedfromacceptedbackup. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through64359, bubble capture/release/burst complete

Accepted63959consecutiveexactRGB565frames401..64359. Run tests/OUTPUT/eggo-long-replay_2026-10-24T22-25-00-794Z first64360. Allbubblefixes acceptedwholeprefix: capturestate6/camera/inventorydiscard, retainthrowvelocityduringcapture/release, twoROMburstdescriptors selectedpreviousLife>>3 atpreviousLife<=15. Extractor scripts/eggo-extract-bubble-burst.py and scripts/OUTPUT/eggo-bubble-burst_2026-10-25_00-24-50/parameters.json preserve nativeassetsourcehashes. Bothburstcelsverifiedidenticalacross3samples each. No pending productionedit. Next64360 needsdiagnosis. Later suffix/audio unverified.

# CURRENT RESUME — October25 pending bubble burst descriptors

Acceptedbaseline61649exact401..62049 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_00-24-31/. Currenttrial addsmissing2cel electric-bubble-burst.png (128x64), faithfullydecoded nativeOBJ25palette5priority1 from62058(index0) and62050(index1). Reproducibleextractor scripts/eggo-extract-bubble-burst.py and parameters/sourcehashes scripts/OUTPUT/eggo-bubble-burst_2026-10-25_00-24-50/. ROM1131c..11338 selectsbursttable0200031c atlife<=15, indexlife>>3, normal4cels otherwise. advanceBubbleMotion savespreviousLife alongsidepreviousX/Y/animation; renderer usespreviousLife forOAMhandoff andRULES.bubbleBurstFrameTicks8. Addednewassetloader. Productionmodel.js/pixel-renderer.js/newPNGchanged. FullfreshJSreplay RUNNING session25535 trace62045 limit109808 chunk1000. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through62049, bubble burst artwork missing

Accepted61649exact401..62049. Run tests/OUTPUT/eggo-long-replay_2026-10-24T22-17-44-853Z first62050. Retainedplacing.nativeVelocityY restoredwhenbubbleinterruptsthrow acceptedwholeprefix; BOTHactorY/state/camerasEXACT62035..62065. First62050 1736pixelsisMISSINGbubbleburst art, notactorphysics: nativebubbleX/Y/vx/vy/animation/lifeEXACT62035..62065. ROM1131c..11338 selects alternateart table0200031c indexed life>>3 whenlife<=15; otherwise normal4cel table0200030c. Rendereronlyhasnormal4cels. Needextract2burstcelsfromnativeOBJ25palette5priority1size64x64, at62050(index1frompreviouslife15) and62058(index0frompreviouslife7), nativeaudit eggo-round-intro_2026-10-25_00-23-45. RenderusepreviousLife forone-tickOAMhandoff. No pending productioneditatbackup. Later suffix/audio unverified.

# CURRENT RESUME — October25 pending retained bubble-release velocity

Accepted61648exact401..62048 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_00-16-29/. Next62049 324pixelsCPUfield. NativeCPU retained +0x18 velocity58973 throughout capturedstate6, whilemodel e.vy0 because use storesnativeVelocityY thenzeroes e.vy for throw interpolation. Atrelease62048actorXYsame, then62049nativeY19252829 vsmodel19193856; camera256vs255. Existing strikeLightning/space capture alreadyrestore placing.nativeVelocityY. Currenttrial advanceBubble does same beforeclearingplacing. Quick eggo-model-state_2026-10-24T22-17-27-291Z BOTHactorY/state/cameras EXACT62035..62065; nativeaudit eggo-round-intro_2026-10-25_00-16-39. FullfreshJSreplay RUNNING session70731 trace62045 limit109808 chunk1000. Only model.js changed sinceacceptedbackup. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through62048, complete bubble capture

Accepted61648consecutiveexactRGB565frames401..62048. Run tests/OUTPUT/eggo-long-replay_2026-10-24T22-10-31-855Z first62049. Bubblecapture fixes accepted wholeprefix: state6/preCaptureCameraActorY/release0 AND droppedinterruptedinventory (same BE88 discardedPickup firsttick asjumper). No frame-dependent patches. Quick exactactorY/state/cameras61915..61940 and droppedpickupQ16params61918..61939. First62049 nowneedsdiagnosis. No pending productionedit. Later suffix/audio unverified.

# CURRENT RESUME — October25 pending complete bubble capture handler

Accepted baseline remains61518exact401..61918, backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-25_00-00-49/. Trial advanceBubble sets actorState/NextState6, records nativePreCaptureCameraActorY on entry, releases state0. Quick model eggo-model-state_2026-10-24T22-00-50-776Z BOTHactorY/state/cameras EXACT61915..61940. Full tests/OUTPUT/eggo-long-replay_2026-10-24T22-02-47-601Z stillfirst61919 but reduces688pixels to128pixels bbox179..194,y49..64. These128pixels are NOTactor art: nativeOBJ29 is16x16pickup kind0variant1, dropped when captured mid-throw. Model erased placing.nativeHeld instead of shared capture inventory discard. Current additional trial captures interruptedItem before clearingheld/placing and creates discardedPickup at capturedactorposition, then advances first pickup tick like advanceJumper (ROM136B8->11AC4->BE88). Native pickup0x4a08 appears61918x3399680/y32265200/vx0/vy259056/wait29. Quick model eggo-model-state_2026-10-24T22-09-57-020Z droppedpickup Q16x/y/vx/vy/variant/wait EXACT61918..61939 (render snapshot n+1 vs native live n). FullfreshJSreplay RUNNING session42398 trace61915 limit109808 chunk1000. Only productionmodel.js changed since acceptedbackup. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October25 accepted through61918, bubble capture actor-state transition

Accepted61518exact401..61918, run tests/OUTPUT/eggo-long-replay_2026-10-24T21-54-33-147Z first61919. Pendingblasthitstate4positionrollbackacceptedwholeprefix. Next61919 688pixelsCPUfieldbbox163..213,y8..64: nativeCPUcapturedbybubble61918 changesactorstate6, modelleavesstate4 despiteb.captured/e.bubbletrueandplacingnull. BOTHactorXY/RNGexactthrough61922; nativecamera61919=430,model443 (heldbythrowstate4selector8). advanceBubble capturedbranch onlysetscoords/inventory, unlikeadvanceJumperexplicitstate6. NeednativeActorState/NextState6onbubblecapture, recordpreCaptureCameraActorY likejumper, release0. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_23-59-46/,model eggo-model-state_2026-10-24T21-59-46-571Z. Nopendingproductioneditatbackup. Later suffix/audio unverified.

# CURRENT RESUME — October24 pending blast interrupts state4 before interpolation

Accepted61092exact401..61492 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_23-54-11/. Currenttrialmodelpendingblastbranch callsstrikeLightning(actorAtFrameStart) ONLYwhen nativeActorHandlerState===4, otherwisenoactoroverride. Thisrestorespre-interpolationpositionwhenP1bombinjuresCPUbeforestate4dispatch, withoutundoingnormalinputmovement. Quick scripts/OUTPUT/eggo-model-state_2026-10-24T21-54-12-973Z BOTHactorXYandcamerasEXACT61490..61510. FullfreshJSreplay RUNNING session69506 trace61490 limit109808 chunk1000. Onlyproductionmodel.jschangedafterbackup. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October24 accepted through61492, bomb interrupts CPU throw

Accepted61092exact401..61492. Run tests/OUTPUT/eggo-long-replay_2026-10-24T21-48-09-120Z first61493. Retainedthrowpalettefixacceptedwholeprefix includingfirstCPUthrow794. New61493 1028pixelsCPUfield causedactualactorpositionwrong61492. NativeCPU61491/92 x74,y576.497711,VY0; model61492x73.928589,y569.997513 afteroneextra state4interpolation. P1bomb expires61492(remainingfuseat61491oneframe) andnativeprojectilepasscallsinjurybeforestate4handler, so NOinterpolation. ModelnativePendingBlastHitdefersinjuryuntilafterCPUhandler(requiredfornormalmovement) butthenstrikeLightningwithoutactorPositionkeepsextrainterpolation. NeedwhenpendingblastandnativeActorHandlerState===4 passactorAtFrameStart tostrikeLightning, preservingnormalstate0movement. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_23-52-59/,model eggo-model-state_2026-10-24T21-52-59-450Z. Nopendingproductioneditatbackup. Later suffix/audio unverified.

# CURRENT RESUME — October24 pending throw palette retained at Use

Accepted60786exact401..61186 backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_23-46-33/. Pending61187fourwhitepixels: pendingthrowpalette shoulduse material6retainedfromculledoutline. nativeThrowAffineArt nowacceptspriorPaletteKind andcacheincludesit; pendingpaletteusesINITIALpaletteifinitialPalette, elsepreviousTHROW_MATERIAL_PALETTES[kind], elsewhite/black. CriticalsnapshotattimeUSE: model.use nowstores nativePaletteKind andnativeInitialPalette inplacing beforegameunconditionallysetsnativePiecePaletteMaterialtonewthrowkind. REJECTED passinglivepalette orsnapshotnextframe: regressed794CPUfirstthrow(oldwhite/null ->newkind7). Currentgame.jssnapshotunchanged(originalspreadplacingcarriesstoredvalues); rendererreadspstoredpalette. Firsttwofastfailedruns23:46/47kept forrecord, noacceptedclaim. FullfreshJSreplay RUNNING session9385 trace61180 limit109808 chunk1000. Productionmodel.js/pixel-renderer.jschangedaftercheckpoint; game.jsshouldmatchcheckpoint. Diagnosticnowincludesbubble/factorySecondary/renderplacing/palettestate. Later suffix/audio unverified.

# CURRENT RESUME — October24 accepted through61186, retained throw palette

Accepted60786exact401..61186, run tests/OUTPUT/eggo-long-replay_2026-10-24T21-39-30-115Z first61187. Bubblepre-risewaterfixacceptedwholeprefix. Next61187ONLY4pixels104..107,y72: appwhite[255,250,255] native[255,250,213]. NativeOAM38affinethrowONLYvisibleOBJat104,72(priority3,palette13,RGB5[31,31,26]); noactoroverlaperror. P1newkind2singlecellthrowticks2, lastvisible/retainedmaterialkind6. nativeRenderFramepreviewSnapshot609?61185/86rotation.paletteKind6, currentoutlineculledbelowscreen so gamekeepsnativePiecePaletteMaterial6. nativeThrowAffineArt pendingpalettecurrentlyonlyinitialPalette orblack/white, ignoresretainedmaterialpalettestate. NeedpasspriorPaletteKind into pendingthrowrender/cacheanduseoldthrowmaterialpaletteifpresent. Otherpendingvisibleoutlinesremainwhite/null. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_23-45-14/, quickmodel eggo-model-state_2026-10-24T21-45-13-582Z. Noproductioneditatthischeckpoint. Later suffix/audio unverified.

# CURRENT RESUME — October24 bubble spawn uses pre-rise waterline trial

Accepted60588exact401..60988, fullbackup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_23-37-28/405files preserveslatestGeminiincluding60835priorityfix. Pending60989isP1bubbleposition, notart/animation: nativeOAM26imageEXACTatlascel1/3. ModelbubbleY-.0390625 alreadyatspawn60821 (nativey712.6328125,model712.59375). Nativewater60820=688.6328125,60821=688.59375; nativebubble spawnsPREVIOUSline+24 because13974before19910, modelusedcurrentline. Latent.039pxoffset changescoordinate-noise vx at60987 andwholebitmapshiftsby1px60989. Rejectedseparate-floorhypothesis: ROM12188..12198 addsQ16actorX/frame/bubbleX beforeASR16, originalformulaalreadycorrect. advanceBubble now supplies previousWater??water toadvanceBubbleMotion. Noimageworkarounds. Quick eggo-model-state_2026-10-24T21-39-16-000Z ALLbubbleX/Y/VX/VY/life/animation60980..61010 EXACTnative. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_23-35-44/ and23-38-50/(spawn60821). FullfreshJSreplay RUNNING session46761 tracefrom60980 limit109808 chunk1000. Onlyproductionmodel.jschangedafterbackup. Resolvefullprefixbeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October24 Gemini handoff accepted through60988

LatestcompletedGemini FULLfreshJSrun tests/OUTPUT/eggo-long-replay_2026-10-24T21-24-05-013Z matched60588frames401..60988, first60989. AllproductionhashesMATCHcurrent. PreserveGemini fixes58977bubblephysics,60073particleorder,60835priority1wavecoveringfrog. Rootprevious60500statuswasSTALE. No replaysrunning. Next60989 3074pixelsbbox55..111,y27..89 P1bubble only; BOTHactorXY/camerasEXACT60975..60991. NativeOAM26at56,26 attrs01A/C038/56F6 palette5prio1 has64x64image EXACTatlascel1and3(maskandRGB5), versuscel0/2mask3189dif. Needcheckmodelanimationclock/resetphase beforechangingrender. NativeenemyP1at60989x57.375y477.8828125vx1vy-1.5animation1clock4life192. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_23-35-44/, quickmodel eggo-model-state_2026-10-24T21-35-44-561Z exactphysics; diag nowaddsbubble/factorySecondaryandfresh60980..60995 running. No productioneditsyet. Later suffix/audio unverified.

# CURRENT RESUME — October 24 accepted through 60500, 60,100 consecutive exact frames (round 8 Factory)

Accepted 60100 consecutive exact RGB565 frames 401..60500 (first mismatch null / all matched). Run tests/OUTPUT/eggo-long-replay_2026-10-24T18-59-41-047Z.
1. Frame 58997 bubble noise parity resolved: in GBA ROM 0x08019080, primary hazards (0x0801909e..a6) evaluate before actor motion (0x080190c0). In climbing state (state 4), actor position changes after hazard advancement. AdvanceBubble now receives enemyActorPosition (the pre-movement snapshot), matching native noise calculation.
2. Frame 60073 particle allocation and projectile pass parity resolved: in GBA ROM 0x08019020, projectile passes (0x08004458) run before piece placement (0x0800d748). On frame 60072, player hammer strikes CPU tower at (192, 624). Hammer particle is assigned phase = 0 in model.js:1455, matching boots sparkles and executing before floor completions (phase 1). Shared 14-slot pool (EWRAM 0x02031510) allocates slot 8 to CPU hammer impact, slots 9..13 to player floor completion, and correctly drops player particle at x=84 due to full capacity. Hammer particle lifetime aligned to 25 ticks (5 frames of 5 ticks, 0x0801afe8).
0 RGB565 pixel differences through frame 60500 (60,100 consecutive bit-for-bit frames verified, 54.54% of Survival recording).

# CURRENT RESUME — October 24 accepted through 58680, round 8 Factory secondary robot theft parity

Accepted 58280 consecutive exact RGB565 frames 401..58680 (first mismatch null / all matched). Run tests/OUTPUT/eggo-long-replay_2026-10-24T17-10-41-618Z. Full verified backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_19-16-50.
Frame 58427 wing phase desynchronization resolved: `factorySecondary` initialized with `wingClock: RULES.factorySecondaryWingClock` (8) and `wingPhase: 0` in `renderer/games/eggo-mania/model.js`.
Frames 58670 and 58671 factory secondary robot piece theft and OAM submission parity resolved:
1. In original GBA ROM, CPU held item is preserved in OAM snapshot for the contact frame (frame 58670, OBJ #31 at pos=(166, 59)); cleared premature `this.nativeRenderFrame.held = null` in `advanceFactorySecondary` (`model.js`).
2. Stolen piece submission for factory secondary robot follows one-frame delayed OAM submission via `previousStolen` in `renderer/games/eggo-mania/pixel-renderer.js`, matching pirate, jungle, and castle secondary enemies.
3. In GBA ROM `0x08011a28` and EWRAM `0x020311b8`, robot body OAM Y is `r8 + 16` (0x0801174c) and stolen piece OAM Y is `r8 + 48` (0x08011a3c), giving relative top-left offset `+32px`. Centered drawing via `crate()` requires `RULES.factorySecondaryItemY = 32 + 8 = 40` (corrected from 56 in `model.js:223`).
0 RGB565 pixel differences through frame 58680 (58,280 consecutive bit-for-bit frames verified, 52.88% of Survival recording).

# CURRENT RESUME — October 24 accepted through 58400, round 7 Beanstalk 58,000 consecutive exact frames

Accepted 58000 consecutive exact RGB565 frames 401..58400 (first mismatch null / all matched). Run tests/OUTPUT/eggo-long-replay_2026-10-24T15-16-20-282Z. Full verified backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_17-22-42. All active round 7 gameplay, hazards, projectile interactions, piece placements, and water recovery across frames 55400..58400 match 100% bit-for-bit with 0 RGB565 pixel differences. Over 52.6% of the 110,208-frame Survival recording verified.

# CURRENT RESUME — October 24 accepted through 55600, round 7 Beanstalk water entry timing parity

Accepted 55200 consecutive exact RGB565 frames 401..55600 (first mismatch null / all matched). Run tests/OUTPUT/eggo-long-replay_2026-10-24T15-10-11-339Z. Full verified backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_17-15-55. Frame 55401 CPU actor water entry timing discrepancy resolved: in original GBA ROM (0x08018ec6..0x08019100), actor movement/physics (0x0800f6a8) executes before round management. The water probe in 0x0800f984 samples tower waterline from field+0x87c. However, the water surface rise (0x08019910) runs at 0x080190ee, after both actor movement (0x0800f6a8) and animation dispatch (0x0800d748). Consequently, actor physics evaluates water entry against the waterline from the previous tick (field+0x87c before 0x08019910 updates it). In model.js and native-water.js, nativeEnteringWater, nativeRescueEligible, and beginNativeWaterRecovery now sample this.previousWater ?? this.water instead of the newly advanced water, preserving exact native entry frame parity (probe 39011010 < waterline 39011712 on frame 55400, entering on frame 55401 at probe 39240386 > waterline 39009280). 0 RGB565 pixel differences through frame 55600.

# CURRENT RESUME — October 24 accepted through 54600, round 7 Beanstalk carried piece OAM order & independent culling

Accepted 54200 consecutive exact RGB565 frames 401..54600 (first mismatch null / all matched). Run tests/OUTPUT/eggo-long-replay_2026-10-24T14-26-32-870Z. Full verified backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_16-33-00. Beanstalk secondary carried piece (stolen) OAM draw order and independent culling resolved: in GBA ROM (hazard kind 8, 0x080115a4..11ab0), beanstalk head is allocated first at 0x080115c4 (OBJ 29), vine segments at 0x08011622 (OBJ 30), and carried stolen item at 0x08011a58 (OBJ 31). With priority 2, lower OAM index 29 displays in front of index 31. In Canvas 2D (painter's algorithm), drawing stolen before beanstalkSecondary body ensures the body covers the top rows of the piece (resolving 7 diff pixels on frame 54116). Furthermore, 0x08011a28 evaluates carried icon culling independently of the head body (-64 < Y <= 159), allowing the icon to remain visible on screen at y=-9 while the head is culled at y=-37 (resolving 112 diff pixels on frames 54170..54171). 0 RGB565 pixel differences through frame 54600.

# CURRENT RESUME — October 24 accepted through 54115, round 7 Beanstalk throw landing & camera offset

Accepted 53315 consecutive exact RGB565 frames 401..54115 (first mismatch 54116). Run tests/OUTPUT/eggo-long-replay_2026-10-24T13-45-34-625Z. Full verified backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_15-52-27. Frame 53853 camera offset (-16 vs 44) resolved: In GBA ROM 0x08018e70, CPU bomb explosion in 0x08003f74 at 0x08004196 sets actor flag +0x948 on player actor. During throw handler in 0x0800e0e8 (state 4), if flag +0x948 is set, actor calls 0x0800c51c (reproject landing from damaged tower), updating targetY to 440 (19.0 in model), which makes nativeThrowPose at tick 26 evaluate to y=19.9144 (actor_y=401.37) on frame 53852. Consequently, on frame 53853 camera 0x08004908 samples previous frame actor_y=401 and calculates target=357, new look_offset = 56 - 2*(357-321) = -16. In view.js, actorState remains 4 (not prematurely forced to 0). All frames 53853..54115 match 100% bit-for-bit (0 diff pixels).

# CURRENT RESUME — October 24 accepted through 52450, round 7 Beanstalk CPU bomb landing

Accepted 52050 consecutive exact RGB565 frames 401..52450 (first mismatch null / all matched). Run tests/OUTPUT/eggo-long-replay_2026-10-24T12-05-34-058Z. Full verified backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_14-11-06. Frame 52361 CPU bomb position mismatch (x=104 vs native x=101) resolved: in original GBA ROM 0x08018e70, both 0x08004458 projectile passes run before 0x0800b074 piece placements. AdvanceNativeBomb in model.js now samples the receiver tower cell map from nativeRenderFrame.rows (representing state at tick start before live placements). CPU bomb in frame 52359 continues flight from x=103 to x=101 and lands on frame 52360 with exact native fuse=250 and pos=(101.00, 580.80). 0 RGB565 pixel differences through frame 52450.

# CURRENT RESUME — October24 accepted through 51372, round7 Beanstalk jumper splash

Accepted 50972 consecutive exact RGB565 frames 401..51372 (first mismatch 51373). Run tests/OUTPUT/eggo-long-replay_2026-10-24T03-16-38-852Z. Full verified backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_05-23-39/. Jumper (types 4 and 14) water splash trigger (`0x08012ef8..12fa0`: `vy > 0` and `y + 17 > waterline`, emitting splash `x = j.x + 16, width = 16`, latching `splashed` without clearing on respawns per `0x08011fca..12040`) verified and accepted whole prefix; frame 51074 4-pixel CPU splash mismatch resolved. NO pending production edits. Current production hashes match verified run.

# CURRENT RESUME — October24 VBlank input latch during loading trial

Accepted49264exact401..49664, fullbackup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_02-17-21/. Pending49665 SpaceintroP1camera rootcausePROVEN: native3140VBlank readsREG_KEYINPUTat314C, invertsat3150, ORsinto0200008Cat3154. Duringassetloadnativeaccumulatesallpressedkeys. Native49662inputstruct02011910+AA/ACcontainsUP+A0x41 evenrawrecordmaskNONE; UPpressed49637..44andA49653..60duringloading. Firstintroframe1native49661VY.199996correct; nextinputstepfloatgives.299987vsoldmodel.399993. game.roundLoadTicks earlyreturn nowORs physicscontrolsfloat/fast into nativeLoadingControl; firstadvanceCountdownFrame P1usesunionwithcurrentcontrols thenclears. startRoundclearslatch. ThismodelsactualnativeVBlankOR, noframe/roundexception/notalteringinputtape. Quick scripts/OUTPUT/eggo-model-state_2026-10-24T00-20-59-811Z ALLBOTHcameras/VYEXACT49662..49675. Native disassembly scripts/OUTPUT/eggo-instructions_2026-10-24_02-20-19_872267/; inputwordsreadconfirmedroot1244+11c8/11ca. FullfreshJSreplay RUNNING session10336 trace49660 limit109808. Onlyproductiongame.jschangedaftercheckpoint. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October24 accepted through49664, round7 intro camera

Accepted49264consecutiveexactRGB565frames401..49664. Run tests/OUTPUT/eggo-long-replay_2026-10-24T00-07-17-597Z. LatehammeridleRNGcancellation acceptedwholeprefix; ALLround6includingresultmatched. First49665(round7Spaceintro)3956pixelsP1fieldbbox0..111,y0..146. NOproductionpendingedits/NOreplayrunning. Currentproductionhashesmatchverifiedrun.

Nextdiagnosis: native/modelactorXYandRNG27463 EXACT49662..49670; CPUcameraexact. P1camera ONLY49664native8vsmodel9 ->BGdisplay49665diff; P1VYhas+0.100006pixel/frameconstant discrepancy afterfirstactiveintro update. Native49661(nativeframe1)P1VY.1999969482 (modelinitial.199996same); native49662VY.2999877929 vsmodel.3999938965; native49663 .4999847412 vsmodel.5999908447; subsequentneutralgravity.199997incrementsallcorrectbutoneinitialfloat-sizedstepmissinginmodel. game.startRound initializes P1introvelocityneutral .2 andCPUfloat.1. advanceCountdownFrame uses initialstoredvelocity thenupdatesgravitybasedcurrentinput. NeedexplainWHYnativeFIRSTactiveincrementuses.09999P1whilemodel.199997, nothardcodeperround/frame. Usertape49607..49636NONE,49637..49644UP,49645..49652NONE,49653..49660A,49661..49746NONE. Nativeassetloading spans49632..49660; actorRAMresetstate3/0multiplephases. Native49661firstactualframe1VY.2,49662frame2VY.3, then.2increments. POSSIBLEinputlatchedduringassetloading, UNPROVEN. CPUkeys0x50from49661onward andmodelCPUtrajectoryexact. DoNOTinventCPUsharedfloatrule (wouldfloatallframes, notone). DoNOTchangeinitialvelocityto.1: nativeframe1.2provesinitialseedcorrect. Needinspectactualnativefirstactiveinput/phaseordering.

Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_02-14-46/first49655last49680raw49665; second02-15-59/49625..49662raw49640. Model eggo-model-state_2026-10-24T00-14-45-474Z/49655..49680. PreviousRNGcomparison eggo-rng-comparison_2026-10-24_02-03-55/ showsfirstrealin-roundRNGdrift46223, nowfixed. Inputstruct pointerliteralROM18f70=02011910; +AA atraw49640/49665FC00,+AC0,notdirectUPmask. Rootstatusretainsallpriorcausalnotes. Laterround7suffix/audio/fullrecordingunverified.

# CURRENT RESUME — October24 late hammer hit cancels idle RNG trial

Accepted49061exact401..49461, backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_02-03-26/404files. Next49462CPUidle22pixels caused latent RNG drift. FullminimalRNGtrace model401..49465 eggo-model-state_2026-10-24T00-02-59-396Z vsnative streamed comparison scripts/OUTPUT/eggo-rng-comparison_2026-10-24_02-03-55/ proved ONLYrealin-roundRNGdivergence starts46223 (other10segmentsareroundloadingstallsresync). Native46222rng49780,46223same49780; app63427(nextstep). CPUHAMMERslot1hitsP1on46223; modelP1idle2readsRNGbeforeCPUprojectilepass, thenexistinglate-hitcorrectionoverridesselector11. NativeBOTHprojectilepasses precedeactoranimation soinjuryhandlerNEVERreadsRNG. gameP1advanceNativePlayerPose records tentative RNG{before,after,frame}; beforeCPUrivalpose, iflateP1lightningreplacesnon11selectorANDmatchingframeANDglobalRNGstillafter, cancelthatread. ThenCPUrivalpose advanceswithcorrectsharedseed. Existinglatehitphaseoverrideunchanged. Quick eggo-model-state_2026-10-24T00-06-53-478Z ALLRNGandCPUidlephaseEXACT49450..49465. Nativeaudit46217..46228 scripts/OUTPUT/eggo-round-intro_2026-10-24_02-05-48/. FullfreshJSreplay RUNNING session74665 trace49450 limit109808. Onlyproductiongame.jschangedaftercheckpoint. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October24 accepted through49461

Accepted49061consecutiveexactframes401..49461. FreshfullJSrun tests/OUTPUT/eggo-long-replay_2026-10-23T23-55-14-548Z first49462only22pixelsCPUidle. ActiveNPC/inactiverespawnfreeze andrescueentryoffsetobeyingprevious7/8hold BOTHacceptedwholeprefix. Next49462nativeidlephase66880 vsmodel66390; visibleceltransitionlate. NativeRNG49450=50186,49451=28340;model49450=28340,oneadvanceahead. NeedtraceFIRST RNG/callcountdivergence. Diagnosticrng-onlyaddedwithoutfullstateheavyoutput, freshmodel401..49465running/completedtoolsession90063. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_02-01-46/, fullmodel eggo-model-state_2026-10-24T00-01-45-720Z. No productionpendingedit. Later suffix/audio unverified.

# CURRENT RESUME — October24 rescue entry obeys previous throw hold

REJECTEDunconditionalrescueentryoffsetrelaxation: run tests/OUTPUT/eggo-long-replay_2026-10-23T23-50-28-412Z regressed23789(round3). NOTnegativeoffset: native23788offset26,model20. Previousanimationselector8stillholdsinput/camera duringthrow; firstrescuetick mustnotrelaxwhilethatgateactive. Positive-onlytrialalsoWRONG(cancelledsession4494early6300beforewastingfullrun). Finaltrialfirstrescueentry checks tower.nativeActorHandlerState===4 OR previousrenderanimationselector7/8, andonlywhenNEITHERcallsadvanceNativeCameraOffset. Subsequentrescuestepunchanged. Quick eggo-model-state_2026-10-23T23-54-44-203Z cameras23786..23789=[65,65,65,62]EXACTnative; quick23-54-59-806Z cameras49344..49348=[76,73,70,66,61]EXACTnative. Activehazardresultfixretained. FullfreshJSreplay RUNNING session20065 trace49340 limit109808. Acceptedprefix401..49345 from23-44-06runbutcameraeditsnotyetaccepted. Fullbackup01-41-11containsaccepted401..49344. Later suffix/audio unverified.

# CURRENT RESUME — October24 rescue camera entry trial

Run tests/OUTPUT/eggo-long-replay_2026-10-23T23-44-06-317Z accepted401..49345(48945exact), next49346wholeP1field13128pixels. Activehazard/inactivefreeze fix passes49345bird. Native49345camera73 vsmodel76 whileactorXYEXACT; fieldoffsetraw38 vsmodel44. Firstrescuebranch skipped this ticks ordinary offset relaxation (44->38 bystep6), thenallcameraresults3pxlate. view.advanceNativeForegroundCamera now callsadvanceNativeCameraOffset onFIRSTrescueentry beforemarkingactive, reflectinginputcallbackbefore04908. Subsequentrescuestepunchanged. Quick scripts/OUTPUT/eggo-model-state_2026-10-23T23-50-05-096Z BOTHcamerasEXACT49340..49365. FreshfullJSreplay RUNNING session86087 tracefrom49340 limit109808. Productionmodel.js(activehazards) andview.js(camera)changedafterfullbackup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_01-41-11/. No otherproductionchanges. Resolvefullrun beforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October24 active result hazards trial

Accepted48944exactframes401..49344, checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_01-41-11/404files. Next49345bird623pixels caused nativeHazardsFrozen blanketingactiveNPCduringrescue/results. REJECTEDglobalunfreezetrial: quickmodelwronground1by49340, fullsession27136cancelledimmediately. Rootnative11B58: ifinactive,11BA4 checksglobal02000010beforedecrementingrespawnlife; activebranch1217Ccontinuesregardlessresult. Originalold8688CPUdragoninactive185constant; current49345P1parksecondaryACTIVEcontinues,CPUprimaryACTIVEcontinues,CPUsecondaryINACTIVE261constant. CurrentlocaladvanceHazard(name,fn) callsduringresultonlywhenentityactive, otherwisepreviousActive=false. Noarbitrarytimeout/noframenumberexception. EnemyRNGreservationsactiveonlyunchanged. Quick scripts/OUTPUT/eggo-model-state_2026-10-23T23-43-42-160Z round6, ALLBOTHprimary/secondary X/Y/life/animation/clock EXACT49340..49365. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_01-39-05/. FreshfullJSreplay RUNNING session73909 tracefrom49340 limit109808. Onlyproductionmodel.jschangedaftercheckpoint. Resolvefullrun beforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October24 accepted through49344

Accepted48944 consecutiveexactframes401..49344, run tests/OUTPUT/eggo-long-replay_2026-10-23T23-33-13-106Z first49345. CPUsharedtarget/pre-explosionheights, projectilesabort/noOAM, targetfillerflush ALL acceptedwholeprefix. Next49345 623pixelsbird/P1overlap; ALLP1actorXYexact. Nativeparksecondary advances49345whilemodelpauses: modelnativeHazardsFrozen=trueuponrescuebody (andafterResult), original13974enemy managerstillruns. CPUprimaryalso movesnative90->89 whilemodelfreezes90. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_01-39-05/, model scripts/OUTPUT/eggo-model-state_2026-10-23T23-39-04-782Z. No pendingproductionedit atthischeckpoint. Later suffix/audio unverified.

# CURRENT RESUME — October24 aborted projectile OAM correction

Run tests/OUTPUT/eggo-long-replay_2026-10-23T23-27-37-236Z stillfirst48973 but199pixelsONLYbbox76..91,y59..77. Fillerflushfixed135cellpixels. IMPORTANTCORRECTION: originalRAWprojectilevisualdescriptorpersistswhenpassaborts, BUTfreshOAMcontainsNOprojectileat76,y62 on48973 (OAM25/26heldicons41/168,27+previews,31+blast,40+actors). 199pixelsareENTIREextrasprite, notpositiondelta. ThusabortedslotkeepsphysicsbutNOTdrawablequeuedOBJ. Removedtrialstoredcamera/previousOAMhold; game.nextsnapshot skipsflameadvance once andreturnsnativeSpriteVisible:false forskippedpass. Originalrenderer restored (onlygame.js/model.js productiondiffercheckpoint01-14-07; CPUpre-explosionheights retained). FreshfullJSreplay RUNNING session30535 trace48968 limit109808. Acceptedprefixstill401..48972 untilthisrunconfirmsfix. Later suffix/audio unverified.

# CURRENT RESUME — October24 projectile abort + filler flush replay

Acceptedprefix401..48972 remains. Added furthercausalfix: remaining135pixelsbbox128..143,y142..153 inrun23-14-41 wereNOTparticles. CPUfillercell(0,row24) born9468,index5,nativePhase1 at9513; stillqueued45ticks. ROM3F74 at3F92 passesTARGET(r8)to3C8C beforedamage: finalizeallpendingfilleranimations, clearqueue. model.explode nativebranch now doesexactlythat beforeblast. Confirms diagnosisofknownpendingflushcall, notinventedtimeout. Prior replay session92049 stopped at15300identical toavoidwaste afterfindingthissecondcause; no acceptanceclaim. CurrentfullfreshJSreplay RUNNING session21811 (tracefrom48968,limit109808) combines CPUpre-explosionheights, projectileabort/heldOAM, targetfillerflush. Allunacceptedproductioneditsaftercheckpoint01-14-07 in game.js/model.js/pixel-renderer.js. Resolve fullrun beforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October24 projectile pass abort trial

Acceptedprefixstill401..48972 (48572frames), checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_01-14-07/404files contains shareddestination fix, before pending pre-updateprojectileheights fix. Secondfullrun tests/OUTPUT/eggo-long-replay_2026-10-23T23-14-41-630Z ALSO first48973 but only339pixels78..143,y58..153 (CPUphysicsfixed, bomb+particlevisualremains). Native04458slotloop: 4660decrementfuse,4680blast3F74,4684branch48BA FUNCTIONRETURN; laterprojectiles skipentirepass. Modelreversebombarrayadvancedslot1beforeexpiringslot0. Currenttrialprecomputes nativeAbortSlot=minnativeexpiringbombslot; laternativebombs/hammersskipphysics/fuse andmarknativeSkippedPass. FollowinggameOAMsnapshot freezespreviousdescriptor/camera/flameclock foroneskippedpass; clockincrementresumeslater. StorednativeSpriteCamera inordinarysnapshot equals oldrendererpreviousPreviousNativeCameraPosition afterviewupdate; neededtoholdscreenYacrossskip. Rendererhonorstoredcamera. Quick scripts/OUTPUT/eggo-model-state_2026-10-23T23-24-42-934Z ALLslot1bodyXY EXACT48970..48978 includingnoadvance48972. Nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_01-12-45/. FullfreshJSreplay RUNNING session92049 tracefrom48968; productiongame.js/model.js/pixel-renderer.jschangedaftercheckpoint. Resolvebeforeaccepting; earlierprefixmayexposeotherabortcases. Remaining339includesfewbottomparticles; do notassumefixeduntilpixelrun. Later suffix/audio unverified.

# CURRENT RESUME — October24 CPU projectile pre-update terrain trial

Accepted48572 exactframes401..48972, run tests/OUTPUT/eggo-long-replay_2026-10-23T23-03-48-777Z, backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_01-14-07/404files. Shared CPU destination fix accepted. Pending48973: first wronginput48972 model discards heldkind0 (nativeUP64). P1bomb expires during player update and damagesCPU column2 height21->23 before CPU AI. ROM BOTHinputhandlers precede4458/projectileexplosion, so native scan uses oldheights. Discardnoise (owncolumn2+enemycolumn5)&15 old(21+19)&15=8 doesnotexceeddifficulty4+bias4; live(23+19)&15=10 incorrectlydiscards. game.nativeProjectileTarget caller now uses t.nativeBoardRowsBeforePlayerUpdate??t.rows (alreadycapturedpreplayer), not stalepreviousrender rows. Enemycontext unchanged. Quick freshinput-only scripts/OUTPUT/eggo-model-state_2026-10-23T23-14-11-117Z ALLBOTHactorX/Y exact48968..49010; nativeaudit scripts/OUTPUT/eggo-round-intro_2026-10-24_01-12-45/. FullfreshJSreplay RUNNING session71275 tracefrom48968 limit109808. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October24 shared CPU destination trial

Accepted prefix401..48945 (48545frames), backup scripts/OUTPUT/eggo-source-checkpoint_2026-10-24_01-03-10/404files. Pending48946: native CPU brain+0 target=2 after filler/empty-hand routing, but model NativePieceSweep.best retained older column4 and restored it when newkind0 caught. ROM writes shared+0 only on strict score improvement (076xx), otherwise retains current target across inventories. game.nativeToolControl now syncs aiTravel.targetColumn from tool; rolling search syncs it ONLY on improvement; returned plan uses shared current target rather than cached best.column. Quick fresh input-only diagnostic scripts/OUTPUT/eggo-model-state_2026-10-23T23-03-27-399Z has ALL CPU X/Y exact48940..48955 (first wrong48945 fixed). Full fresh pixel replay running session14618, tracefrom48940. Only productiongame.js changed since accepted checkpoint; diag adds travel and native brain target/waypoint. Resolve full replay before accepting. Later suffix/audio unverified.

# CURRENT RESUME — October24: accepted prefix through48945

Accepted 48545 consecutive exact RGB565 frames401..48945. Run tests/OUTPUT/eggo-long-replay_2026-10-23T19-22-53-436Z; first48946 CPU actor. All production hashes still match. Deferred bomb terrain recheck accepted. No replay running. Native48946 brain target+0=2,waypoint+4=2; model retained old sweep.best column4 after filler/empty hand selected2. First wrong input48945. Investigating shared destination vs stale best candidate. Later suffix/audio unverified.

# CURRENT RESUME — October23 21:23 pending deferred bomb terrain

Accepted48530 exact401..48930, run tests/OUTPUT/eggo-long-replay_2026-10-23T19-13-16-900Z first48931; fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_21-22-12/404files. Explicitfillerqueueaccepted. PENDING48931 127pixels156..172,y139..151 isBOMBposition, notflameclock: nativeOAM25flame160,139/body26at156,141. Native vsmodelrawflameclockoffset1isexpectedcurrentvsqueuedOAMphase; donotadjustclock.

Firstphysicaldiff48928: nativebombbody355.864166/VY-.625,appsameY/VY+1.25, bouncesoneframe late48929. CPU USES FILLER48928 tofillcell(column2,row23); P1bombterrainpass ranbeforeCPUupdate andsawemptycell, whereasROMbothinputhandlers precedeboth04458projectilepasses. TrialadvanceNativeBomb queuesemptywasLanded terrainprobe whenreceiverhasnotupdatedyet. Receiverupdate resolvesqueuedterrainafteritsownfiller/physics beforeincomingcatch, usingexistingnativeQ16reboundrules, skippingremovedbombs. Doesnotdoubleapplyexistingoccupiedcontacts.

Quick scripts/OUTPUT/eggo-model-state_2026-10-23T19-22-16-251Z ALLbombY/VY48926..48934 EXACTnative. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_21-17-06/; birthaudit21-19-51provesclockdifferenceconstantbutnotrendercause. FullfreshJSreplay RUNNING currenttoolsession tracefrom48920 limit109808. Onlymodel.jschangedaftercheckpoint. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October23 21:14 explicit filler queue trial

Accepted48084 exactframes401..48484, run tests/OUTPUT/eggo-long-replay_2026-10-23T19-07-49-638Z first48485; fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_21-13-14/404files. Capacityflushfixpasses48453. Pending48485 isremainingcelltimingafterqueueflush: ageformulaFinishTicks [24,29,34,39,44,49] assumesall6queuedtogether. Native3CF8 timers[25,29,33,37,41,45],3B98 decrementsorderedentries, growat20, finishesfirstzero andBREAKSforframe (remainingentriesskip). Thusdefaultfinishesaftertimersminus1plusnumberofpriorremovals:24,29,34,39,44,49. Afterfirst2newflushed, remainingindices2..5 startnewqueuepositions0..3 =>finish32,37,42,47, not34,39,44,49.

CURRENT TRIAL explicit this.nativeFillerAnimations=[] inTower; use(filler) schedules{filler,timer}, flushesat6settingnativePhase2; per-tick beforebombloop advancesorderedentries/grow20/finish0break. fillerPhase honorsnativePhase; oldagefallbackretainedforloadedcells. snapshotNativeBoardRows nowclonesfillerdescriptors so currentdisplayretainspriorphase whilelivequeueupdates. RULES centrallyholds capacity6/timers/grow20. Productionmodel.js/game.jschangedaftercheckpoint. Native3B98/3C8C/3CF8 disassembly/decompile evidence in preceding notes.

FullfreshJSreplay RUNNING session36190 tracefrom48440 limit109808. Resolvebeforeaccepting. Potentialfuturequeueflushcalls: native3F74bombblast calls3C8C upfront; modelqueue notyetflushedthere, investigateonlyifneeded (canproveROM). Nootherproductioneditsduringrun. Later suffix/audio unverified.

# CURRENT RESUME — October23 21:07 pending filler queue capacity

Accepted48052 exact401..48452, fullcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-57-31/404files. PENDING48453 filleranimationqueue. Pixelprobe tests/OUTPUT/eggo-long-replay_2026-10-23T18-57-19-448Z proved graypixelisbackground, BUT backgroundcorrect: nativeBG1pixelalso[10,11,11]. NativeBG0boardcoversit; modelnewfillerphasetransparencyexposesbackground. Initialbackgroundstreamhypothesis REJECTED. Native/modelalloccupancyexact. BG0tilematching: newcells(0,27),(1,27)fullphase2 EXACTrgb/alpha; fournewrow28cellsinitialphase0exact. Modelall6phase0. Existingpendingold4cells born8962 age30 atrow25/26.

ROM3CF8 schedulesfilleranimations in6entryqueue: ifcount>5 calls3C8C tofinalizeall andclear. Thusprior4+newfirst2 fillqueue6, addingthirdflushesold4+new2, remainingnew4startsmall. Trial RULES.fillerAnimationCapacity6; use(filler)collectscurrentunfinishednonbonusfillers, flushesatcapacity byreplacinglivefillerdescriptors finished:true, preservespriorBGsnapshotobjects, thenaddsnewcellentry. fillerPhase honorsfinished=>2. Existingphasegrow/finishtiming unchanged. Quickmodel scripts/OUTPUT/eggo-model-state_2026-10-23T19-07-22-830Z. Nativeevidence raw20-51-40, existingquick18-55-26-372Z. Native3D50->3CF8->3C8C disassemblyscripts/OUTPUT/eggo-instructions_2026-10-23_21-06-01_925870/.

FullfreshJSreplay RUNNING currenttoolsession limit109808 tracefrom48440. Onlyproductionmodel.jschangedaftercheckpoint. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:58 diagnostic running

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T18-45-19-243Z: **48052 exact RGB565 frames401..48452; first48453(round6)**. Previous-waterline camera clamp accepted. Fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-57-31/. NO pendingproductionedits. Diagnose48453:844pixels0..31,y110..153, extra gray artwork overcorrectP1tower. Native/model ALLboardoccupancyidentical48452/53; primary/secondary inactive, watercreatureP1inactive, clouds=[], collapseWave/previousCollapseWave=null bothfields. Initialbackground/wave/animal hypotheses notconfirmed. Needactualdrawcallattributionbeforechangingproduction. Native raw eggo-round-intro_2026-10-23_20-51-40/, modeldiagnostics18-51-34-265Z,18-52-24-480Z,18-55-26-372Z. LatestnativeOAMobjects24..49 have NOleftgraybody. Appbody appearsnearleftbottomoverboard. Pixelprobe fullbaseline to48453currentlyrunning (toolsession); --pixel-probe=48453,0,110 --eval-frames=48453 --eval-js goal/rescueOrigin/explosions/primary/particles. Usesoriginalrecordingframe index (harnessbaseincludesstartAfter400). Resolveprobe thenfixactualcause. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:45 replay running

Accepted44672 exact401..45072, fullcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-45-16/404files. PENDING45073 camera clamp usesprecedingwaterline: view.nativeCameraTarget now tower.previousWater??tower.water, matching04908before19910. FreshfullJSreplay RUNNING session8930 tracefrom45062 limit109808. Onlyproductionview.jschangedaftercheckpoint. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:45

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T18-40-08-856Z: **44672 exact RGB565 frames401..45072; first45073(round6)**. Heldbombexpiry nativeboardYoffset (currentactorY +2tiles; currentX) andpendingcounterfixaccepted. Fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-45-16/. No pendingproductionedityet.

Next45073 wholeP1field12187pixels. ALLactorX/Y/VYandwaterlineexact45062..45088; onlycamera45072 native600vsapp599. Nativewaterline45071=600.021484,45072=599.984375; camera04908 clampsPREVIOUSwaterline before19910 advancesline. Model nativeCameraTarget usest.watercurrent; shouldusepreviousWater??water. Subsequent45073both599, butBGmappreviouscameramakesfirstvisible45073. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_20-44-17/, quick eggo-model-state_2026-10-23T18-44-13-089Z. Nextfixclampsampleandfreshreplay. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:40 replay running

Accepted44604 exact401..45004, checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-39-07/404files. PENDING45005 heldbombexpiry nativeboardheightconversion. REJECTEDinitialpreactorXhypothesis: fittingnativepostblastoccupancy againstpriorowners yields EXACTcenter(3,22), not(4,22). Nativeinputintegration precedes4458 projectileexpiry; actor_state_dispatch aftercounting isanimation, notposition. Keepcurrente.x/e.y butadd(boardFloor752-actorFloor720)/tile16 toheldblastY. Originalcodeusedactorcoord20.987->center20, nativeboardcoord22.987->center22. CurrentX46nativecenter3correct. FailedinitialquickusedoldX48->center4 and5wrongcells, neverfullreplayed/accepted.

Currenttrialmodelexpiry explode(e.x,e.y+boardOffset), refreshnativependingfullcountbecauseexpiryin4458before3020. Genericnon-nativebomb path retainszerooffset. FullfreshJSreplay RUNNING session40403 tracefrom44985 limit109808. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_20-36-01; priorquickeggo-model-state_2026-10-23T18-35-59-179Z; initialrejectedquick18-39-09-071Z. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:39

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T18-32-40-013Z: **44604 exact RGB565 frames401..45004; first45005(round6)**. CPUwater-rise sideFlagcallerfix acceptedwholeprefix, allGemini changesretained. Fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-39-07/. No pendingproductionedityet.

Next45005 heldbombexpiry45004 wrongdamagecenter. P1native/modelmovement/cameras ALLQ16exact44985..45018, but1484diffpixels19..118,y42..151 areBGdamage/burstcounter. Native04458 expiresheldfuse BEFOREactorstate movement: calls426c(field,0), spawnsbomb atfloor(actorX)+8, actorY+4 andadvances-4 toactorY thenblast3F74 usesnativeboardcoord. Modelheldfuse directexplode(e.x,e.y) AFTERmovement usesnewX46vsold48 andactorcoordinatefloor720insteadboard752 (2cells). Nativecentercol4,model3; nativecenterrow22,model20. Planned nativeexpirycenter actorAtFrameStart.x, actorAtFrameStart.y+(boardFloor-actorFloor)/tile; refreshpendingcountbecauseexpirybelongsprojectilephase. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_20-36-01/, quick eggo-model-state_2026-10-23T18-35-59-179Z. ROM426c..4306/4458 firstheldfusecase transcribed. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:33 replay running

Accepted43571 exact401..43971, checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-32-19/404files. PENDING43972 CPUwater-rise travel. Added game.nativeWaterTravelFlag helper representingfield+1240 by nativeWaterRecovery.releasePending OR egg.nativeWaterReleaseKick OR egg.nativeWaterRise, passedsideFlag to BOTHadvanceNativeTravel callers(piece/empty). Existingtravelalgorithmalreadyimplementsnativeflagroutebypass. Quick scripts/OUTPUT/eggo-model-state_2026-10-23T18-32-22-355Z now ALL CPUX/Y/VY/cameras43967..43985 EXACT(nativekeys43969/70RIGHTwithoutUP thenUPresumes43971). Nohardcodedframes/states/noinjection.

FreshfullJSreplay RUNNING session37663 tracefrom43960 limit109808. Resolvebeforeaccepting. Currentproductiononlygame.jschangedaftercheckpoint20-32-19; diagnosticsaddednativeCameraControl/nativeWaterRecoveryfields. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:32

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T18-25-54-657Z: **43571 exact RGB565 frames401..43971; first43972(round6)**. Filler pendingprogress nowcurrentfullfloors instead ofhistoricalthis.lines accepted, alongwithbothdirectionprojectilecountphase. Fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-32-19/. No pendingproductionedityet.

Next43972 wholeCPUfield difference1782pixels stemsfromfirstwrongCPUinput43969/43970: nativekeys0x10RIGHT, model0x50RIGHT+UP. Native43970VY-3.300003vsapp-3.400009 (0.2vs0.1gravity), firstYdiff43971 .100006 andcamera405vs404. Allpriorbody/velocity/Q16 exact. ROMCPUtravel7ABC checksfield+1240 sideFlag andskipsnormalUProute. advanceNativeTravel alreadyimplements sideFlag but BOTHcallers game.nativePieceControl/nativeEmptyControl omitit. Waterflagrepresented by egg.nativeWaterRise OR nativeWaterReleaseKick OR nativeWaterRecovery.releasePending. releasePending becomestrue43968; nativekeys43969/70noUP; roofclearsflagduring43970 thennativeUPresumes43971. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_20-29-54/, quick eggo-model-state_2026-10-23T18-30-57-004Z. Nextwireexisting sideFlag andverifyquickinputs/trajectory beforefreshfullreplay. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:26

Accepted42696 exact401..43096, fullcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-25-01/404files. PENDING43097 CPUfiller progress:16pixels121..126,y115..118. Native43096 completed9/OAMold8,43097OAM9. Model43096actualfull9 but pending10,43097displays10 and43098corrects9. Noactor/boarddifference. Source use(filler) assigned nativeDividerPendingProgress=this.lines (historicalcompletedrows10 includesdestroyedrow), notactualfullcount9. Change to nativeCountFullFloors(). Nativecount3020 scanscurrentrowoccupancy, neverhistoricalcompletions. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_20-25-09/, quick scripts/OUTPUT/eggo-model-state_2026-10-23T18-25-05-226Z. FreshfullJSreplay RUNNING session73444 tracefrom43085 limit109808. Resolvebeforeaccepting; later suffix/audio unverified.

# CURRENT RESUME — October23 20:25

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T18-19-58-439Z: **42696 exact RGB565 frames401..43096; first43097(round6)**. Projectile explosion floor-counter phase fix BOTH directions accepted: target pending count refresh only when target already updated/current, active nativeTrajectory bombs. Native04458 projectiles precede0279c->3020 count; actorplacements follow. Result/held/loose bomb paths unchanged. Gemini evaluateNativePiece actorColumn + empty-hand waypoint fixes retained and verified. Fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-25-01/. No pendingproductionedit/no replayrunning. Next diagnose43097. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:20

Accepted baseline42286 exactframes401..42686, checkpoint20-10-06. Trialprojectilependingcountrefresh fullrun tests/OUTPUT/eggo-long-replay_2026-10-23T18-14-16-924Z passes42687 and first42700 (16pixelsCPUbar121..126,y122..125). Raw eggo-round-intro_2026-10-23_20-19-15 shows nativeCPUcount8->7 on42700 butOAMstill8 until42701; trialimmediatelydisplayed7 becauseP1bomb overwroteCPU pending BEFORECPU updateTower shiftedpendingtovisible.

PENDING finaltargetphaseguard: refresh pending ONLY if target.time>=source.time-step/2 (targetalreadyupdated/current); otherwise itsupcomingnormalaccounting naturallyreadsdamagedgrid. This preservesoldvisiblecounterbothdirections. FreshfullJSreplay RUNNING session27279 limit109808 tracefrom42680. Quickdiagnostic eggo-model-state_2026-10-23T18-19-09-028Z recordedpre-guardstate. Do notacceptpartialbaselinebeyond42686untilfreshguardrunverified. Later suffix/audio unverified.

# CURRENT RESUME — October23 20:15

Accepted42286 exact401..42686; fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-10-06/404files includesGemini changes. PENDING42687 dividerprogress12pixels113..118,y102..104. Nativecompletedcounter13 on42686 afterCPU bomb damagesP1 fullrow; model livefull13 but pending14. NativeOAM42686still14;42687displays13. Appdisplays14until42688. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_20-12-52/, quick eggo-model-state_2026-10-23T18-12-51-981Z. Native18E70 explicitly runs both projectile4458 passes then0279c->3020 floorcount BEFOREactor_state_dispatch; OAMbuiltlater displaysnextframe. This explains difference fromordinaryplacement's existingpipeline.

Trialonly model projectile-bomb expiry branch refreshes target.nativeDividerPendingProgress afternativeTrajectory explosion duringactiveplay. Alreadyqueued currentnativeDividerProgress unchanged; held/loosebomb actor-phase explosions and result accounting unchanged. FreshfullJSreplay RUNNING session85425 seed1492/startafter400 limit109808, tracefrom42680. Resolvebeforeaccepting. Diagnostics nowrecord completed_floors/dividerOAM and nativeDividerProgress/Pending/fullcount. Later suffix/audio unverified.

# CURRENT RESUME — October23 Gemini handoff verified

User supplied Gemini progress screenshot. Its latest actual fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T17-31-52-976Z verifies **42286 exact RGB565 frames401..42686; first42687(round6)**, limit48000. ALL production sourceHashes match CURRENT files. This supersedes stale13:50/32000 notes and earlier12:54session35864 (that old run completedfirst31700, no longer authoritative). Gemini fixed evaluateNativePiece actorColumn via ROM integerX+17 /16 and CPU empty-hand waypoint noPickupTarget invalidation. Preserve its further model/view/render changes. Fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_20-10-06/ before any new production edits. No replay running. Next diagnose first42687 against same Oct19 recording, seed1492/startafter400. Later suffix/audio unverified.

# CURRENT RESUME — October23 13:50 replay running

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T11-48-14-827Z: **31600 exact RGB565 frames401..32000; all matched**. Loose-piece floor completion row-sealing and single-placement bonus count gating accepted. Full hash-verified checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_13-50-00/404files. Fresh full JS replay RUNNING session limit=35000 (recording frames 401..35400). Resolve before accepting. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:54 replay running

Accepted31249 exact401..31649, fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_12-53-41/404files. PENDING31650 stale CPUarc-bird respawn graphic: advanceParkSecondaryMotion now snapshots previousActive and bird renderer tests that alongside already-snapshotted oldbody/angle/animation. Previously currentactive=true onrespawn caused oldinactivebody toappear foroneframe. FreshfullJSreplay RUNNING session35864 tracefrom31640. Resolvebeforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:54

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T10-48-54-165Z: **31249 exact RGB565 frames401..31649; first31650**. Wet release enters water state1 immediately without new splash; capture-frame offset retained. Fullhashverified checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_12-53-41/. No production edits since run. Next31650: CPU arc-bird respawns; its previousActive=false but renderer tests currentactive and paints previous inactive oldbody x11.91,Y558.12 (screen144,11) instead of displaying nothing. Newspawn actualbody x-3,Y479.1378 is aboveviewport. All live actor/enemy Q16 and animations EXACT;349pixels144..170,y11..38 are stale respawn OAM. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_12-52-26/, quick scripts/OUTPUT/eggo-model-state_2026-10-23T10-52-24-479Z. Next snapshot previousActive in advanceParkSecondaryMotion, render that active state with existing oldbody. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:49

Acceptedprefix still31196 exact401..31596, fullcheckpoint12-43-20/404files. Trialwetrelease now physical positions/velocities match31596..31605 exactly, offset skiphandler6release corrected. Fullrun tests/OUTPUT/eggo-long-replay_2026-10-23T10-45-08-743Z stillfirst31597 but ONLY21pixels29..46,y125..133 vsprior717. Remaining is newly introduced entrySplash: releasing already submerged actor must not create another waterentry splash.

PENDING beginNativeWaterRecovery third optional entrySplash=true flag; only advanceJumper wetrelease passesfalse. Ordinarywaterentries unchanged. FreshfullJSreplay RUNNING session64580 tracefrom31590. Resolvebeforeaccepting. Currentmodel/view/native-water editsaftercheckpoint12-43-20; noacceptedclaimyet. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:45

Acceptedprefix31196 exactframes401..31596; fullhashverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_12-43-20/404files. PENDING31597 wet release from primary capture. Original31596 state6->1, sameY749.55859375,vy0.5; model wrongly setstate0 and deferred waterentry to next dry tick, giving X24.25vs24/Y749.5586vs750.4961 on31597 and resetting swimanimation. advanceJumper release now beginsNativeWaterRecovery immediately ifactorY+entryProbe>previouswaterline. Quick scripts/OUTPUT/eggo-model-state_2026-10-23T10-44-39-427Z ALLY/VY31596..31605 EXACT. Raw scripts/OUTPUT/eggo-round-intro_2026-10-23_12-43-24/.

Also cameraoffset update must skip nativeActorHandlerState6 (not just currentstate6), including releaseframe; otherwise31596 offsetfalls106->100 and subsequentnativeDOWNswim increments6 fromwrongbase. Native31597offset112, modelbeforefinalcameraedit106. Trialnow skipsreleaseframeoffset. FreshfullJSreplay RUNNING session46706 tracefrom31590. Resolve beforeaccepting. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:43

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T10-39-42-837Z: **31196 exact RGB565 frames401..31596; first31597**. Jumping primary old OAM sample/previous waterline plus captured state6/group17, first capture prior throw cel, dropped held pickup and camera timing all accepted. Full hash-verified checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_12-43-20/ being created before further changes. No pending production edits/no replay running. Current31597 diff717pixels16..62,y102..145; diagnose next. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:40

Accepted tests/OUTPUT/eggo-long-replay_2026-10-23T10-35-04-991Z: **31106 exact frames401..31506; first31507**. Capture state6 / group17 / prior throw pose and dropped pickup accepted. First31507 is whole leftfield camera mismatch:13706pixels. Native camera31505..31510=587,600,597,595,592,589; old app587,594,589,583... Native offset+EB8 remains106 while captured; model incorrectly decremented6 per tick and used enemy-updated actorY rather than previous carry Y.

PENDING captured camera: advanceNativeForegroundCamera skips normal offset update forstate6; while handler6 uses state.nativeCameraActorY (prior enemy carryposition) for target. advanceView cancels postThrow onstate6. Entry captureframe still retains already-prepared throw camera/OAM. Quick scripts/OUTPUT/eggo-model-state_2026-10-23T10-39-28-483Z camera EXACT ALL31505..31510, offset106. Native raw31507 scripts/OUTPUT/eggo-round-intro_2026-10-23_12-38-39/; camera ROM4908..49c4. Fresh full JSreplay RUNNING session35886 tracefrom31495. Resolve before accepting. Latestfullcheckpoint12-13-45 predates accepted primary old-OAM/waterline and capture changes; backup model/view/game12-25-38. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:35

Accepted run tests/OUTPUT/eggo-long-replay_2026-10-23T10-30-44-309Z: **31105 exact frames401..31505; first31506**,32pixels30..45,y60..73. State6/group17 clock and first-capture prior-pose handoff passed31505. Retain nativeRenderPlacing on captureframe: native OAM38 still displays it; rejected first trial cleared it. game now preserves previousPlayerPose as snapshot.animationPose only when entering6 and otherwise snapshotnull (throw selector1).

PENDING31506 capture drops held item rather than deletes it. Native BE88 called by captured handler creates kind4variant3 at captured actorX22+8=30,Y619.81272888+24 then first pickup tick gives647.7656097412,vy3.952880859375,wait29. advanceJumper now stores interruptedItem, sets capturebody/state6, creates discardedPickup and manually advances missed ordinary pickup pass. Quick scripts/OUTPUT/eggo-model-state_2026-10-23T10-34-48-437Z confirms all new pickup Q16positions/velocities31505..31508 EXACT raw scripts/OUTPUT/eggo-round-intro_2026-10-23_12-33-22/. Full fresh replay RUNNING session36629 tracefrom31495. Resolve before accepting. Latest full checkpoint12-13-45 predates accepted jumping-primary old-OAM/waterline and state6 changes; backup before state6 trial scripts/OUTPUT/eggo-capture-transition-backup_2026-10-23_12-25-38/. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:26

Accepted fresh JS run tests/OUTPUT/eggo-long-replay_2026-10-23T10-16-56-952Z: **31104 exact RGB565 frames401..31504; first31505**. Previous jumping-primary old-position/previous-waterline fix accepted. Latest full checkpoint12-13-45 predates only that accepted fix. Backup before current trial: scripts/OUTPUT/eggo-capture-transition-backup_2026-10-23_12-25-38/ (model/view/game).

PENDING31505 primary capture during throw: native/model ALL Q16 actor/enemy positions and capture timing exact. Native actor switches state4->6 selector1->9 phase0x4000; model had no state6 implementation and kept throw animation/stale affine piece. ROM e068..e098 clears inventory/outline and selects9. Trial advanceJumper sets state6 while captured, resets0 on release; player/rival pose uses existing group17 selector9 clock; game suppresses nativeRenderPlacing while captured. Native raw scripts/OUTPUT/eggo-round-intro_2026-10-23_12-19-26/, quick eggo-model-state_2026-10-23T10-19-25-815Z. Full fresh replay RUNNING session28544 tracefrom31495. Resolve before accepting. Later suffix/audio unverified.

# CURRENT RESUME — October23 12:17

Acceptedprefix30944 exactframes401..31344, fullverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_12-13-45/404files. PENDING31345 jumpingprimaryOAMsample: firstdiff7pixels27..30,y149..151; nativeOBJ26x20,y150priority2 vsappcurrentbodyrounded751.3388-camera602=149. Nativeuploadsoldbody752.7741 =>integer150. ModelprimaryYalso0.03515625lowbecauseusednewwaterlineforspawn.

PatchedadvanceJumperMotion snapshots previousActive/X/Y; calleradvanceJumperusespreviousWaterline. Rendererusespriorposition/cameraintegernativeorigin, movesJungle/Beanstalkprimaryafterpickups/creature atnativeearlypriority2, withCPUthenP1foreignoverhangconsistentothers. Spritewidthvariablekeptdistinctfromfieldwidth. Quick ggo-model-state_2026-10-23T10-16-33-497Z nowEXACTnativebodyY31343..31347 (751.3739929at31345), oldbody752.7741. Raw ggo-round-intro_2026-10-23_12-13-48/ OAM26vertical32x64x20y150. Previouslymodelignoredoldactive/oldpositionandroundedcurrentbody.

FullfreshJSreplay RUNNING session64566 tracefrom31335. No furtherproductioneditsafterlaunch. Resolvebeforeacceptance; later suffix/audio unverified.

# CURRENT RESUME — October23 12:14

Accepted freshJSrun `tests/OUTPUT/eggo-long-replay_2026-10-23T10-09-51-582Z`: **30944 exact RGB565 frames401..31344; first31345(round5)**. Allambientorder/birdprethrowanchor/OAMpriority/stoleniconphase/top-left/separateintegeroffsetfixes accepted. Newfullhashverifiedcheckpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_12-13-45`404files. No pendingproductionedit/no replayrunning. Suffix/audio unverified. Next diagnosefirst31345 freshseed1492sameOct19recording.

# CURRENT RESUME — October23 12:10

Accepted freshJSrun 	ests/OUTPUT/eggo-long-replay_2026-10-23T10-05-38-049Z/: **30244 exactframes401..30644; first30645**. Stolenicon snapshot/top-left/bodypriorityfix passesfirstappearance30644. PENDING30645 stolenoffsetintegerorder:131pixels59..74,y68..84, icon1pxlow. NativeOBJ25x59,y68, bodyOBJ24x42,y47. Original11A38addsALREADYintegerbodyandintegeroffset. Oldcombinedfloor(614.5734+16+6*.91853)-567=69, correctfloor614.5734+floor(16+6*.91853)-567=68. Patchedx/y separatefloorbody/offset BEFOREaddition, sameROMintegercoords.

Raw ggo-round-intro_2026-10-23_12-08-57/, previousquick ggo-model-state_2026-10-23T10-03-20-875Z30644body/velocityexact. FreshfullJSreplayjustlaunchedtracefrom30635,currenttoolsession. Nootherproductionedits. Latestfullverifiedcheckpoint11-44-44 predatesacceptedambientorder/birdanchor/priority/stolensnapshots; saveupdatedcheckpointafteracceptance. Suffix/audio unverified.

# CURRENT RESUME — October23 12:06

Accepted freshJSrun 	ests/OUTPUT/eggo-long-replay_2026-10-23T09-59-20-016Z/: **30242 exactframes401..30642; first30643**. Arc-birdlatepriorityrenderaccepted; firsttheftactualinventorytimingEXACTnative30643(native/modelheld1->-1). Firstdiff252pixels50..65,y61..76 isnewstoleniconshownoneframeearly.

PENDINGnativePark/JunglestolenOAM: advanceParkSecondaryMotion snapshots previousStolen,previousVX/VY alongsideexistingpreviousbody. Render usespreviousStolen/positions/velocity; native11A28 top-leftintegercoordinates, butoldrenderpassedroundedtop-leftascratecentre (8pxoffbothaxes). Native30644OBJ25 iconx57,y68; prevbody30643x41.15711975,y614.7737427,vx.8689423,vy-.1398010,variant1 =>floor(x-sign6vy+16)=57, floor(y+6vx+16)-camera567=68. Pass+pickupCenterBias8forcratecentre. AlsodrawstoleniconBEFOREbirdbody: nativeOBJ24bodywinsOBJ25carriedicononpriority2tie. ExistingCastlepatternsame.

Raw ggo-round-intro_2026-10-23_12-03-21/; additional30644OAM ggo-round-intro_2026-10-23_12-04-04/; quick ggo-model-state_2026-10-23T10-03-20-875Z/; ROM11A28..11AA2disassembly12-04-04. FreshfullJSreplayjustlaunchedtracefrom30635,currenttoolsession. Nootherpendingchanges. Latestfullverifiedcheckpoint11-44-44 predatesambientorder/birdanchor/priority. Saveupdatedcheckpointafteracceptance. Later suffix/audio unverified.

# CURRENT RESUME — October23 11:59

Accepted freshJSrun 	ests/OUTPUT/eggo-long-replay_2026-10-23T09-53-53-438Z/: **30210 exactframes401..30610; first30611**. Jungle/Parkprethrowactoranchoring accepted, birdY/turnYexact. Latestfullcheckpoint11-44-44 prefix30330 predatesacceptedambientorderandbirdanchor.

PENDING30611 Arc bird priority:11pixels32..35,y32..35. NativeOBJ24birdx5,y17 priority2 [15,21,26] wins overOBJ27pickupx32,y20 priority2white. Rendererpaintedbirdbeforepickups so opposite. MovedJungle/Parkarcbirdrenderblock afterpickups/watercreature nexttoalreadycorrectSpacemissile/castlethief; nowrepaintsBOTHsourcesCPUthenP1 withsourcecamera/sourceLeft toretainforeignoverhang. Physicalmodelunchanged. Stoleniconexistingformulaexpressednativepixelcoordsforforeignsource. Raw ggo-round-intro_2026-10-23_11-57-21/; quick ggo-model-state_2026-10-23T09-57-20-697Z/.

FullfreshJSreplayjustlaunchedtracefrom30600; seecurrenttoolsession. Resolvebeforeaccepting. Nootherpendingchanges. Savefullverifiedcheckpointafteraccepted. Later suffix/audio unverified.

# CURRENT RESUME — October23 11:54

Accepted freshJSrun 	ests/OUTPUT/eggo-long-replay_2026-10-23T09-46-22-263Z/: **30205 exactframes401..30605; first30606**. Ambientreverse-OAMorderfix accepted. Latestfullcheckpoint11-44-44 prefix30330 predatesacceptedambientloopfix.

PENDING30606 jungle/Parksecondaryprethrowactoranchor: firstdiff5pixels223..227,y0 isbirdwronglyenteringtopedge. NativeCPUbirdQ16x/vx/vy/angleallmatch, Yconstant4.3929138184px too low. Latentfirstspawn30581 duringCPUstate4: nativeusespre-handleractorY618.50500488, appusednewthrowY622.8979187. NativeturnY486.505vsmodel490.8979. Rawspawn ggo-round-intro_2026-10-23_11-53-36/, currentraw30606 ggo-round-intro_2026-10-23_11-50-22/.

Patchedmodel.advanceParkSecondary(jungle=false,actorPosition=null), actorX/Yusespassedstate4actorPosition andnativeWaterCameraYwhenfinite; bothJungle/Parkcallsforwardexisting enemyActorPosition. ThismatchesalreadyacceptedSpace/Dragon/Factory/ghostprehandlerpattern. Quick ggo-model-state_2026-10-23T09-53-38-292Z EXACTnativebirdX/Y/turnY30605..30607. QuickdiagfieldsnowincludejungleSecondary/jumper. FullfreshJSreplay RUNNING session19609 tracefrom30575. No furtherproductionedit afterlaunch. Later suffix/audio unverified. Savefullcheckpointafteracceptance.

# CURRENT RESUME — October23 11:46

Accepted prefix29930 exactframes401..30330(round5), fullverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_11-44-44/404files. PENDING30331 ambientoverlaporder: firstdiff11pixels46..51,y58..61. NativeOBJ30 insectx36,y50 andOBJ32x45,y49 overlap: lowerindex30wins [17,26,31], apppaintedslot2above0 [22,28,31]. All4nativeambientQ16positions/velocities/clock22 EXACTmodel. Noanimation/phase/noisefixneeded.

Patchedpixel-renderer.js ambientloop reverseorder(index3..0), nomutationofsimulationarray. NativeGBApriority3/lowOAMindexwins. Raw ggo-round-intro_2026-10-23_11-44-47/, quick ggo-model-state_2026-10-23T09-44-46-835Z/. FreshfullJSreplayjustlaunchedtracefrom30320; currenttoolsession. Resolvebeforeaccepting. Nootherproductionchangesaftercheckpoint. Later suffix/audio unverified.

# CURRENT RESUME — October23 11:44

Accepted freshJSrun `tests/OUTPUT/eggo-long-replay_2026-10-23T09-40-41-525Z`: **29930 exact RGB565 frames401..30330; first30331(round5)**. EntireSpace round4, WIN/LOSE, podium, next-roundloading/countdown allaccepted. Newfullhashverifiedcheckpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_11-44-44`404files. Includesretainedsupporthandoff, CPUdefeatinput/resulttimerbegin, losingfieldcreaturenospawn. No pendingproductionedit/no replayrunning. Suffix/audio unverified. Next diagnosefirst30331 freshseed1492sameOct19recording.

# CURRENT RESUME — October23 11:40

Accepted freshJSrun 	ests/OUTPUT/eggo-long-replay_2026-10-23T09-34-44-263Z/: **29286 exactframes401..29686; first29687**. CPUfirstdefeatframe releasesUPandresulttimerbeginfix accepted. Latestfullcheckpoint11-21-16 predatesviewhandoffanddefeatinputfixes.

PENDING29687 losingfieldcreaturespawn: native13ACA..13AE8 checksglobalresultflag onlybeforeinactivecreaturespawn. Afterwinner0flag1 onlyfield0canstartnewrescue; afterwinner1flag2 onlyfield1. Alreadyactivecreaturescontinue. AppspawnednewCPUcreatureafterlosson29686, firstvisible29687(679pixels), incorrectlycarriesactor29692andaddsRNG. Nativeactualcreature+30=0, actorQ16/swimphaseexactuntilcarry.

Currenttrial native-water.jsadvanceNativeWaterCreature thirdargallowSpawn=true; if!active&&!allowSpawnreturnBEFOREtimerdecrement. modelpasses!(this.lost||opponent?.won||nativeWaterDefeatPending); pendingwetrowpredicatefactoredfrompreviousacceptedCPUinputcondition. Ensureslossframeitselfblocksnewrescue. Winnerrescue/existingactivepreserved. Quick ggo-model-state_2026-10-23T09-40-06-114Z exactlymatchesnativeY/RNG29681..29693, CPUcreatureinactive. Raw ggo-round-intro_2026-10-23_11-37-37/; disassembly11-38-43.

FreshfullJSreplayjustlaunchedtracefrom29675, seecurrenttoolsession. Resolvebeforeaccepting; savefullverifiedcheckpointafteraccepted. Later suffix/audio unverified.

# CURRENT RESUME — October23 11:34

Accepted freshJSrun 	ests/OUTPUT/eggo-long-replay_2026-10-23T09-24-10-877Z/: **29206 exactframes401..29606; first29607**. Retainedsupport/input animationhandofffix BOTHplayers accepted; latestcheckpoint11-21-16 predatesthisacceptedviewfix.

PENDING29607 CPU defeatinputtiming: initialVRAMalias hypothesis REJECTED. NativeOBJ36kind11texture ANDmatrix exactlymatchstaticatlas; actualcausefirstphysicaldiff29605. CPUwaterdefeatsetsnativeglobalresultbeforeCPUactorphysics, releasingUPsameframe; appdetecteddefeatonlyafterphysics, usedUPoneextratick. ModelY29606=529.9957vsnative530.0957, camera457vs458, becomes363pickupdiffpixels29607. NativeCPUtimingclockcontinuesduringWIN/LOSE (33,34,35..), modelstopped33.

Currenttrial model.js: afterinitialwaterline/wetrowscan, ifnativeCPUwaterdefeatpredicate(emptywetrow/inbounds/frame>400) setcontrol={nativeMotion:true} andnativeCameraControlsame BEFOREactorphysics. P1postresultcontrolsunchanged. game.updateResult callsaiTiming.begin() beforeneutralCPUupdate. Quick ggo-model-state_2026-10-23T09-34-09-135Z exactlymatches ALLnativeQ16Y/VY,cameras,AIclock29604..29612. Raw ggo-round-intro_2026-10-23_11-26-18/; rawadditional29606..8 ggo-round-intro_2026-10-23_11-28-26/; oldquick ggo-model-state_2026-10-23T09-26-17-762Z.

FullfreshJSreplayjustlaunched, see currenttoolsession. Resolvebeforeaccepting. No furtherproductionedits. Later suffix/audio unverified. Savefullcheckpointafteracceptance.

# CURRENT RESUME — October23 11:24

Accepted prefix28773 exactframes401..29173, fullverifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_11-21-16/404files. PENDING29174 state4animationhandoff: native29172reallyISSpacecancel, notordinarycompletion. Firsthypothesis cancelledPreviousTickguardinsufficientandREJECTED (propertyremoved). KeynativeE7DC..E850 retainedsupportbyte870: 0grounded26695keepsidle2; 1airborne29173queuesair5. ModelnativeActorSupportAtHandlertrue/false matchesrawinversebyte. Oldguardkeptidle2unconditionally onhandler4/previousselector2, erroneousextraRNG33589->28768on29173.

Currentview.jsfix BOTHplayers: inhandler4/no placing/previousselector2 chooseair5 if!nativeActorSupportAtHandler||egg.nativeWaterRise, else retainedinput<0walk3/>0walk4/idle2. DirectROMconditions, nonewtimers. Quick ggo-model-state_2026-10-23T09-23-56-370Z nowselector2/RNG33589at29172then5/sameRNG29173..29176 EXACTnative. Priorbroadsnapshot ggo-model-state_2026-10-23T09-23-13-577Z captures26694/95supporttrue,29172/73supportfalse. Raw ggo-round-intro_2026-10-23_11-19-50/, disassembly11-22-36.

FreshfullJSreplay RUNNING session50048,tracefrom29160. Earlier trial49533 abortedwithCtrlCwhenquickproved hypothesisincomplete; noacceptedclaimaboutit. Diagnosticquicknowlogsrivalanimationselector/phase/tail/handler/support/input. No pendingmodel.jschange(nativeThrowCancelledPreviousTickfieldremoved); onlyview.jsproductiondiffsincecheckpoint. Later suffix/audio unverified.

# CURRENT RESUME — October23 11:21

Accepted fresh JS run `tests/OUTPUT/eggo-long-replay_2026-10-23T00-01-33-037Z`: **28773 exactframes401..29173; first29174**. Nativewateroverhangedgesacceptedallpriorprefix. Newfullhashverifiedcheckpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_11-21-16`. ACTIVE29174 CPUordinarythrowends29172idle2 thennative29173air5; modelwronglykeepsidle2because cancellationhandoffguard checksselector2only, consumesextraRNG33589->28768. Actualpositionsallmatch. NeedretainidlehandoffONLYifnativeThrowCancelledPreviousTick, forbothplayers sharedsamebug. Raw `eggo-round-intro_2026-10-23_11-19-50/`; quick `eggo-model-state_2026-10-23T09-19-49-701Z/`. Nopendingedit/replayrunningyet. Suffix/audio unverified.

# CURRENT RESUME — October23 02:02

Accepted freshJSrun 	ests/OUTPUT/eggo-long-replay_2026-10-22T23-54-00-615Z/: **28323 exactframes401..28723; first28724**. Recoverytimerinventoryrule accepted; firstmismatchonly2pixels121/126,y128 inCPUdivider. NativeOAM23 waterOBJx120,y109 priority0haspinktexels there; allcaps/OAM10..13transparentatcorners, so missingwateroverhangshowsthrough. Runtimewateratlaswasclipped112wide, omittingnative8pxedges(-8..0,112..120).

PENDING28724 rendererwateroverhangfix: addedscript scripts/eggo-build-water-overhang.py decodesexistingunmodifiednativeOBJgraphics forALL8stages, validatesinner112RGB5/alpha EXACTagainstverifiedcurrentatlasEVERYphase (60eachnonfactory,15factory). Generates16pxedgeatlases <stage>-water-overhang.png(left8,right8). Provenance scripts/OUTPUT/eggo-water-overhang_2026-10-23_02-01-07/parameters.json/results.json withsourcehashes. No screenshotpixels/referenceinjection. Rendererloadsassets, drawsP1right8andCPUleft8afterfieldcliprestored BEFOREdivider/portraits/meters; sameexistingphase/Ysample. EdgewidthcentralNATIVE_DIVIDER.surfaceOverhang8. FullfreshJSreplay RUNNING session45702 tracefrom28715; resolvebeforeacceptance.

Latestcheckpoint01-45-06 predatesacceptedCPUheight+recoverytimerfixes. Saveupdatedfullverifiedcheckpointafterpendingaccepted. Later suffix/audio unverified. Native28724raw ggo-round-intro_2026-10-23_01-57-46/, quick ggo-model-state_2026-10-22T23-57-45-757Z/. Nativeinventory/timecaseprevioussections.

# CURRENT RESUME — October23 01:54

Accepted freshJSrun 	ests/OUTPUT/eggo-long-replay_2026-10-22T23-47-16-718Z/: **28045 exactframes401..28445; first28446**. CPUenemy-heightpreupdate samplingfix accepted, noearlierregression. Latestfullcheckpoint01-45-06 predatesthisacceptedheightfix.

PENDING28446 waterinventory rule: nativecatcheskind5on28444, drops28445; appcaughtthenkept. NativeDEE6..DF12 dropsheld whenrecoverytimer>45, independentofdepth. Oldmodelincorrectlyrequired integratedbodyY+17>currentwaterline, boundary28445fails(643.604+17<660.656). AddedcentralNATIVE_WATER.discardWhileTimerAbove45, sampletimerBEFOREadvanceNativeWaterActor carrydecrement; dropusingexistingintegratedbody. Quick ggo-model-state_2026-10-22T23-53-47-001Z catches28444/drop28445, newpickupx54,y671.5573120117 EXACTnative, display28446matches ordering. Native ggo-round-intro_2026-10-23_01-52-05/ logsactualinventories; raw28446older01-50-54; instructions01-53-16 prove timerbranch. Note originalnativeRGB mismatch717 CPUactor+heldboxpixels, nottrajectory.

FreshfullJSreplay RUNNING session85514 tracefrom28435. No furtherproductionedits afterlaunch. Resolvebeforeaccepting. Later suffix/audio unverified; no referenceimages/stateinjection.

# CURRENT RESUME — October23 01:47

Accepted prefix27775 exactframes401..28175, verifiedcheckpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_01-45-06/395files. PENDING28176 CPUenemy-height sampling: nativecachedheighttable forincomingprojectile scan/tooltarget uses pre-player-update board. Appusedliveplayerrows, causingincomingbomb discarddefer26458 one tickearly onP1placement, skippingperioddecrementandsearchcursor. Thatlatentperiod+1 persisteduntil28175 automaticuse, delayingit1tick. Fullroundnative/modeltrace ggo-round-intro_2026-10-23_01-44-27/trace.json, ggo-model-state_2026-10-22T23-44-27-272Z/states.json firstperioddiff26458. Nativeenemycolumn5height39beforeplacement->37after; noisethresholdtriggerstwoframes differently.

Patchedboth enemyHeights consumers in game.js (projectilescan/nativeToolControl) to nativeBoardContext({rows:this.player.nativeRenderFrame?.rows??this.player.rows}).heights; existingrenderrows are actualpreupdateboardsnapshot, no referenceinjection/newtimers. Quick ggo-model-state_2026-10-22T23-47-02-848Z exactlymatches ALLnative Q16actorpositions/state/use28174..28180, period1then1536 at28175, launchstartsrightframe. FreshfullJSreplay RUNNING session8606,tracefrom28165. No furtherproductionedits afterlaunch. Later suffix/audio unverified.

# CURRENT RESUME — October23 01:45

Accepted fresh JS run `tests/OUTPUT/eggo-long-replay_2026-10-22T23-38-03-326Z`: **27775 exact frames401..28175; first28176**. All3 latest fixes accepted: half-cell bombtargetcolumn, ownfieldblastY, CPUearlytoolusesactualdifficulty. Newfullhashverifiedcheckpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_01-45-06`.

ACTIVE28176: nativeCPUuse28175 vsapp28176 due periodcounter1vs2 beforeexpiry. Offset1 alreadyexists27880and26695, needfindfirstlatentdifference. WholeSpace-round nativeaudit24275..28175 session86909; quickfreshmodel `eggo-model-state_2026-10-22T23-44-27-272Z/`. Diagnosticnativecontroller nowlogsperiod,difficulty,CC,D0. Nativeperiodinitial1536 at24275 agreesmodelinitialization. Followfirstperioddiff beforechanginggate. Nofullreplayrunning/no pendingproductionedit. Later suffix/audio unverified.

# CURRENT RESUME — October23 01:38

Accepted prefix27653 exactframes401..28053; latest checkpoint01-30-57 predates accepted explosionoffsetfix. PENDING28054 CPU early-tool wait uses wrongdefaultdifficulty: game.nativeToolControl action!=plan branch called waitAfterAction() withdefault6 whileactualSpaceCPUdifficulty5. ROM6E3C..6E4A usesbrain+F0 squared (native25 vsmodel36), firstlatentcounterdiff28027, visible28054. Patchedcall to pass this.aiDifficulty??p.hardDifficulty, sameasnormaltoolbranch. Quick ggo-model-state_2026-10-22T23-37-44-630Z/ exactly matches ALL actorQ16X/Y andstall28050..28058; steeringLEFT+UP begins28053 correctly. Native ggo-round-intro_2026-10-23_01-36-44/trace.json175frames establishesfirststall diff28027; +F0raw5; instructions01-37-25/34. Fresh full JS replay RUNNING session49125,tracefrom28045. No newproductionedit afterlaunch. Later suffix/audio unverified.

# CURRENT RESUME — October23 01:36

Accepted fresh JS run 	ests/OUTPUT/eggo-long-replay_2026-10-22T23-31-11-868Z/: **27653 exact RGB565 frames401..28053; first28054**. Own-field native bomb explosion halfcell offset fix accepted, trajectory/RNG exact. Latest checkpoint01-30-57 predates only this one-line accepted explosion fix. No replay running. Current raw28050..28058 ggo-round-intro_2026-10-23_01-35-52/; quick model session45755. Later suffix/audio unverified.

# Eggo Mania authoritative replay status

## CURRENT RESUME — October23 01:32

Accepted prefix **27647 exact frames401..28047**, checkpoint scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_01-30-57/395files. PENDING28048 own-field native bomb explosion: remove generic half-cell Yoffset, as already done for opponent explosion. Native4662..4680 passes integer bodyworld row directly, nohalfcell subtraction, irrespective receiver. Bomb bodyY493.5995 ->nativerow30/modelrow16; old own-field subtraction pickedmodelrow15 andexplosionstars16pxlower. Fresh full JS replay RUNNING session30163,tracefrom28045. No further production edits after launch. Later suffix/audio unverified.

# Eggo Mania authoritative replay status

## CURRENT RESUME — October23 01:31

Accepted fresh JS run `tests/OUTPUT/eggo-long-replay_2026-10-22T23-26-56-828Z`: **27647 exact RGB565 frames, original401..28047; first28048**. Water dispatch anchor and skyline half-cell target fixes accepted. New full source-hash-verified checkpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_01-30-57` before next production edit.

ACTIVE28048: bomb expires on its own CPU field at bodyY493.5995178; native/model trajectory and RNG agree. Explosion stars differ560pixels, bbox195..236,0..88. Opponent explosion branch already uses native b.y, but own-field branch incorrectly subtracts half a cell, selecting row15 instead16. Inspect ROM fuse/expiry branch before patch. Raw `eggo-round-intro_2026-10-23_01-30-15/`, quick `eggo-model-state_2026-10-22T23-30-14-874Z/`. No replay running. Later suffix/audio unverified, no reference state/images injected.

# Eggo Mania authoritative replay status

## CURRENT RESUME — October23 01:28, supersedes older sections

Accepted fresh JS replay 	ests/OUTPUT/eggo-long-replay_2026-10-22T23-18-32-753Z/: **27640 exact RGB565 frames, original401..28040; first28041**. Water projectile launch-anchor fix accepted: nativeWaterCameraY is integrated body before creature carry overwrite, native CPU bomb launchY573.5995178. Latest full verified checkpoint01-17-22 predates this accepted water-anchor fix. No reference state/image injection, suffix/audio unverified.

PENDING28041 fix: launchProjectile target skyline column must probe local+half a cell, not left edge. ROM4388..4396 adds8 pixels then divides16. CPU launchlocal88 selects column6, skyline31*16=496 (stopfield432 plus64). Oldmodel selectedcol5 andtarget528, starting horizontal drift28040 prematurely. Patched native target index to same half-cell probe already used generictrajectory. Quick ggo-model-state_2026-10-22T23-26-42-597Z matches bombX216 andbodyY533.5995..505.5995 at28037..28044, stop496. Raw ggo-round-intro_2026-10-23_01-23-37/ stopmemory+F98=432, target+F90=496, skyline[34,34,34,33,33,33,31]. Full fresh JS replay RUNNING session77091, tracefrom28035. Resolve before accepting.

# Eggo Mania: authoritative replay status, 2026-10-22

## CURRENT RESUME — October23 01:19, supersedes older sections

Fully accepted prefix **27627 exact RGB565 frames, original401..28027; first28028**. Nativehash23-05-34-510Z and JS23-14-02-906Z give IDENTICAL firstmismatchhash/state, confirming WebCrypto introducedno newstate/timingdifference. Default remainsjs (no speedbenefit). Latest fullhashverifiedcheckpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_01-17-22/`395files, includes allaccepted support-bypass/walkcatch/postthrowtailfixes. Checkpoint predates current pending projectilewateranchor trial.

PENDING28028 launchProjectile fix: use integrated egg.nativeWaterCameraY whenfinite fornativebomb/hammer trajectory, converted to upwardgridY beforeaddingexistingprojectileActorLift. Ordinary launches unchanged. NativebodyY28027=573.5995178, next569.5995178/565.5995178; quick23-17-57-230Z now matchesexactly (x216,targetstop528). Previousmodel usedfinalcreaturecarryanchorY558.8305664, launched14.76895px too high. Native integratedwaterbody/cameraY is573.5995178. JS pixel-probe23-14-02-906Z proves actualoffender at226,50 is32x32armedbomb draw at208,44, notrivalbody. Water-held animation identity hypothesis rejected, NO wateranimation edits made. Nativeactualfree table28027EF0 andappresourcegroup1correct.

Fresh fullJS replay RUNNING session18245, started01:18,tracefrom28020. Resolve beforeacceptance. Focusedexisting bothplayersmovingbomblaunchfixture passed. Diagnosticquick now captures live/renderprojectiles too. Evidence raw `eggo-round-intro_2026-10-23_01-09-49/`, acceptedrun23-05-34-510Z app-trace-27600 hasoldprojectile, JSprobe23-14-02-906Z hasstack/position. Later suffix/audio unverified; no referenceimages/stateinjected.

## Older accepted resume — October23 01:16, supersedes older sections

**27627 consecutive exact RGB565 frames, original401..28027; first28028.** Accepted fresh run `tests/OUTPUT/eggo-long-replay_2026-10-22T23-05-34-510Z`, hash-mode=native(WebCrypto SHA-256, first3framehashescrosscheckedoldJS). All384 productionhashes checked. Newfullverifiedcheckpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_01-17-22`395files. No pendingproductionedit. JS-mode confirmation/probe replay currentlyRUNNING session99618,tracefrom28020,pixel-probe28028,226,50,eval-frames28027/28028. Resolve beforeedit. Nativehash had no substantialspeedup; defaultjs remains. JSrun at24300passed, no regressionseen.

Accepted sincepreviouscheckpoint00-54-19: support-bypasscounter25bySpaceprimarycontact, forbidsinitialsupport/postlanding anddecrementsordinaryintegration; lateforeignprojectilecatch switches walk3/4table toheld2248immediately, noextraphase; P1groundsupportends postthrowtail permanently, cannotresume afterleavingledge (fixed27627extraidle/RNG). Allpassedfreshprefix. Focusedprimaryvisit/theftfixture passed.

ACTIVE28028:379pixels bbox216..232,y50..82. Physicalactors, watercreature and OAMbodypositionsagree. WRONG initialhypothesis of water-heldtable identity is REJECTED; noanimationcodechangesmade. Nativeactor28027selectsfree table0x83F1EF0 and appstoredgroup1correct. Offendingobjectis newlylaunchedbomb: nativeprojectile28027bodyY573.5995178 == model egg.nativeWaterCameraY, but modellaunch uses finalcreature-carriedeggY (world558.8305664), makingbomb14.76895px too high. Model nativeRenderProjectiles28028p.y12.07309 ->world558.8306; native OAMbombbodyat216,67 (camera506). Nativeactualbodyworld573.5995, next569.5995,VY-4. launchProjectile uses finalegg.y+2 forbothnativebomb/hammer; should usenativeWaterCameraY whenfinite fornative trajectory, convertedtogridy plusprojectileActorLift. This is the sameprecarryintegration anchor usedforcamera/enemycontacts. Targetheightcode mayremainunchangedexceptusingcorrectlaunchY. NeedwaitJSprobe result toconfirm actualsprite sourceandnativehashindependence, thenpatchlaunchanchor. Noedit yet.

Evidence native `eggo-round-intro_2026-10-23_01-09-49/` includeswater-held-table-audit, rawactor38PNG, atlasRGB555comparison (nearfreebody), quick23-09-49-171Z includesnativeWaterCameraY28027=573.5995178. Acceptedapptrace-27600.json hasbomblaunch/live/render. Rawnativeprojectile_visuals trace28027 firstslot type2bodyActive1,bodyY573.5995,screen216,67,clock22. Scriptguess ofwaterheldanimation rejected, preserveexistingidentityguards.

Later suffix/audio stillunverified. Samefreshseed1492,start400,October19recording, noimages/stateinjection.

## Older pending resume — October23 01:06, supersedes older sections

Latest ACCEPTED fresh input-only replay **27226 exact RGB565 frames, original401..27626; first27627**. Run `tests/OUTPUT/eggo-long-replay_2026-10-22T23-00-22-670Z/`. Walk projectile catch fix27256 accepted: lateforeignprojectile catch changes selector3/4 heldwalktable immediately, noextraphase, extending existingair5 handoff. Rawactor+84C audit27253..27256 confirms free222C->held2248oncatch27255. Latest fullhashverified checkpoint00-54-19(prefix26714) predates supportbypass+walkhandoff; both are now accepted but not yet checkpointed.

PENDING27627 postthrow-tail resume after transient landing.804P1spritepixels; actualmotion exact. Native lands27625, selector8->3(walk), thenfalls27626, selector5. App leaves postthrowtailcount1 alive acrossgroundcontact, resumesidle2onfall27626, consumes erroneous RNG38073->37383. Fix inview: clear nativePlayerPostThrowPoseTicks whenever groundednonair/no placing (in same reset withthrowGroundHandoff), so it cannotresumeafterleavingledge. Quick23-05-15-834Z: exact nativeRNG38073 and snapshotsselector5 at27627. Raw `eggo-round-intro_2026-10-23_01-04-23/`, oldquick23-04-22-783Z. Full fresh replay RUNNING session97583 started01:05,tracefrom27615, **--hash-mode=native**.

Harness-only performance option added: --hash-mode=native uses Chromium crypto.subtle SHA-256 on SAME RGB565 framebytes, stillchecksEVERYframe and stopsfirstdifference; validates first3actualframe hashes againstoldJSsha. Default remainsjs. Productionticks/rendering/sourceunchangedbyhashoption. Currentrun is first nativehashvalidation, do notclaimspeeduporparityyet. OldJSrun establishes27226exactprefix andexpected27627 beforependingfix. Save fullverifiedcheckpoint afteracceptedrun.

All previouswater/CPU/Space fixesaccepted; remaining suffix/audio stillunverified.

## Older pending resume — October23 01:01, supersedes older sections

Latest ACCEPTED fresh input-only replay **26855 exact RGB565 frames, original401..27255; first27256**. Run `tests/OUTPUT/eggo-long-replay_2026-10-22T22-54-44-706Z/`. Support-bypass trial is accepted: nativeSupportBypassTicks set25 on EVERY Spaceprimarycontact, bypasses initialsupporthold and postlanding, decrements in ordinary integration only. Quick22-54-23-127Z matches allQ16Y/VY/CPUcamera26710..26718, full run passes another541frames. Latest fullverified checkpoint remains00-54-19(prefix26714), predates support-bypass fix.

PENDING27256 walk projectile-catch table handoff.446pixels player x73..111,y64..97; physicalpositions/RNG exact. Native catchesincomingbomb27255 while walkingselector4, actor+84C changes free0x083F222C ->held0x083F2248 immediately WITHOUT phaseadvance; app updated only airselector5 onlateCPUprojectilecatch. Added selector3/4 branch to same game.updateTower foreign-projectile handoff, setting heldwalktable. Quick23-00-02-718Z now captures heldtable/resourcewalk at27256. Evidence raw `eggo-round-intro_2026-10-23_00-58-24/`, contains `projectile-walk-table-audit.json` samples27253..27256 confirming tablechanges27255; oldquick22-58-24-175Z. Fresh full replay RUNNING session21129, launched01:00,tracefrom27245; resolve beforeacceptance. No extra phase step, no arbitrary display timer, no referenceinjection.

All prior watercatch,CPUemptyreset,missilereactivation/contact,CPUdiscard,Spaceprimarycancel/drop/camera fixes remain accepted. Later suffix/audio stillunverified. Save new full hashverified checkpoint afterpendingrunaccepted.

## Older resume — October23 00:54, supersedes older sections

**26314 consecutive exact RGB565 frames, original401..26714; first26715.** Accepted fresh run `tests/OUTPUT/eggo-long-replay_2026-10-22T22-47-55-909Z`; all384 productionhashes checked. New fullverified checkpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-23_00-54-19`395files. PENDING support-bypass trial is running: session69349, fresh full replay startedOctober23 00:54, tracefrom26705. Current model.js sets nativeSupportBypassTicks=round(RULES.spaceHitFlash/RULES.step) on every Spaceprimary contact (including emptyhand), excludes presupporthold/postlanding while positive, decrements once inside ordinary nonwater/nonrescue integration before latehazards reset it. Quick22-54-23-127Z matches ALL Q16Y/VY and CPUcamera26710..26718 exactly; resolve full run before acceptance. Diagnostics now log native/model support-bypass counter. No producer edits after run launch.

Accepted type7 throw cancellation: handles placing.nativeHeld, rewinds pre-handleractor, restoresVY/state4next0/onefreezehandoff, retains outgoing OAM thenidle2 oncancel+handoff, actual RNG63719/60260; clears fictitiouspostthrowtail. CPUcamera always holds handlerstate4 even without P1animationClock; quick matches585,585,585,582,579,576,574. Type7 dropsinventory viaBE88(field,-1): helperdiscardedPickup plusone regular tick alreadymissed, nativekind7,var0,x91.00009155,y638.129425,wait29 born26694/display26695. This corrects earlier no-drop inference. Focused originalprimaryvisit/theftfixture passed. Fullaccepted prefix proves no earlierregressions.

ACTIVE26715:12016CPUfieldpixels. Firstphysicaldiff26714: app falsely supports actor thenjumps26715; nativecontinuesfall. Boardoccupancy matchesnative. Rootcauseidentified: field+EBC support-bypasscounter, set25 bytype7 even with noheld. FA5C..FA74 skips initialsupport; FAC4..FAFE skips postintegrationlanding and decrementscounter. Model onlysetsvisualflash, notsupportbypass. Native at26715 EWRAM CPUboardroot10650+EBC=25 (NOT actorfieldroot46B8+EBC, that wrongbase is0). Repeatedcontactcontinuallyresetscounter. Need separate nativeSupportBypassTicks (notgenericflash, also usedfloorcompletion) setonSpacecontact, checkboth nativeSupportHold andpostland, decrementonceordinaryphysics pass (notstate4/water), beforelatehazards resetit. Raw `eggo-round-intro_2026-10-23_00-51-05/`; quick22-51-04-861Z; instructions00-52-58_436749 and00-53-05_321205. Nativegrid beginsCPU112D0 (board10650+C80), app row4cols2/5 occupancy agrees. Do not alter3620footprint geometry: disassemblyconfirms existingOR/ANDprobes.

Later suffix/audio stillunverified. Same seed1492,start400,October19 recording. Noimage/state injection.

## Older pending resume — October23 00:48, supersedes older sections

Accepted prefix still **26294 exact RGB565 frames, original401..26694**. Verified backup `eggo-source-checkpoint_2026-10-22_20-42-24/`395files. Pending cancellation trial improved, not accepted yet. Fresh full replay session88731 started00:47,tracefrom26685; resolve newest run after22:47UTC. Prior trial22-43-58-286Z passed same prefix and reduced26695difference1267->254pixels, only missing itembbox219..234,y53..68; actor/RNG already correct.

Two further corrections are NOW in production trial:
1) Camera hold must always include nativeActorHandlerState4, also CPU without P1animationClock snapshot. Moved handlerstate4 outside the previousAnimation conditional. Quick22-47-07-826Z now EXACTLY matches CPUcamera26693..26699:585,585,585,582,579,576,574. Earlier model released one step early.
2) Native type7 contact135AE calls BE88(field,-1), which RELEASES inventory as a boxed pickup, does NOT consume it. Corrects earlier notes' mistaken no-drop inference. Space.advanceSpace now calls discardedPickup for held OR interrupted placing.nativeHeld after restoring pre-handleractor, then one pickup-motion tick (dispatch already passed). Native createskind7,var0 atx91.00009155,y638.129425,wait29on26694, displays it26695. Quick22-47-42-081Z render snapshot gives exactly that at26695 and subsequent642.035919,645.896744,649.712616,653.484238. Raw native20-38-36 now includes these linked pickups. Disassembly `eggo-instructions_2026-10-23_00-47-25_040281/`13570..135AE proves release; E778 then queuesidle2,next0 on cancelledthrow. No geometry invalidity or arbitrary timers.

Remaining pending edits from prior section: nativeThrowCancelledThisTick resets at update start; Spaceprimary includes placing inventory and saved actor position, restoresVY/setsstate4next0/onefreezehandoff; view clears postthrowtail and choosesidle2, retains2 on following handler4handoff. Quick22-43-43-435Z matches actual Q16motion/RNG26694..26699 (63719 then60260). All previous water/CPU/missile fixes accepted; later suffix/audio still unverified. Do not describe current trial as accepted until fullfreshreplay returns.

## Older pending resume — October23 00:44, supersedes older sections

Latest fully verified production remains **26294 exact RGB565 frames, original401..26694**, first26695. Accepted run18-36-30-861Z, fullhash-verified checkpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-22_20-42-24/` (395files). Later suffix/audio incomplete.

PENDING type7 throw-theft trial: model.advanceSpace now accepts existing enemyActorPosition, includes placing.nativeHeld in native inventory, rewinds cancelled throw to pre-handler actor position, restores storedVY, sets state4/next0 and one nativePostThrowFreezeTick, marks nativeThrowCancelledThisTick. Flag resets at each update. Cancellation switches player/rival animation to pending-selector2 and clears postthrow tail/camera flags. Rival/player following handler4->0 tick retains selector2 instead of air5 (native consumes second idle RNG). Quick18-43-00-093Z matched motion but missed that second RNG; latest quick22-43-43-435Z now exactly matches motion/RNG26694..26699, including63719 at26694 and60260at26695. Sprite snapshots now group1/cel0on26695/26696. Pending fresh full replay session46819 startedOctober23 00:43,tracefrom26685; resolve newest run. No native image/state injection.

KNOWN unresolved camera phase in pending trial: native raw CPU camera26694=585,26695=585,26696=582,26697=579,26698=576,26699=574, while quickmodel26694=585,26695=582,26696=579,...; displayed layers may show mismatch one tick later. Reason: advanceNativeForegroundCamera chooses previousAnimation only for P1; CPU fallback holdCamera uses state.nativeCameraHoldActive and ignores current nativeActorHandlerState4 on cancelled handoff. Likely fix after run: make handlerState4 unconditional hold outside previousAnimation ternary; preserve selector7/8/fallback for other states. Do not accept trial before full comparison. NativeCPU actual rememberedfieldcamera is one display phase behind animation. Need verify exact offset path, not add empirical delay.

Raw native `eggo-round-intro_2026-10-22_20-38-36/`. Native type7 animation previous4 on26694 hits radius26, steals still-native inventory duringthrow; E0E8 sees valid880=0, E778 queuesidle2/next0, no placement commit or dropped pickup. Hypothesis of invalid geometry was rejected: both original-origin/current-origin nativePreview remainvalid in diagnostic18-40-53-762Z. Current diagnostic script now captures actorstates/placing projections for future.

## Older resume — October22 20:42, supersedes older sections

**26294 consecutive exact RGB565 frames, original401..26694; first26695.** Accepted fresh input-only run `tests/OUTPUT/eggo-long-replay_2026-10-22T18-36-30-861Z`; all384 production hashes checked. New full verified checkpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-22_20-42-24`. No production trial pending, no replay running.

Accepted since20-27-52: Space-secondary previousActive snapshot stops stale previous-flight OAM on reactivation; retain animation across spawns (12044..12076), nativequick25867..25871matches both cels+clocks. Space-secondary throw contacts use saved pre-handler actor position, pass to strikeLightning; exact Q16hit26057 and6following motionframes; full accepted26056then26459. CPU discard now follows the same pending-selector rule as P1: unfinished3/4/8 retained, otherwiseidle2. It formerly choseair5, missing RNG draw26459. New rng59257 matches native; full accepted26694. Existing flight/contact focused fixtures pass, no broad suites.

ACTIVE26695:1267pixels,bbox121..239,y11..123. NativeCPU throw is CANCELLED26694 at tick8, leaves actor at26693position(5439494,39988530), selector2phase1991(RNG63719), currentstate4,next0. Appcontinues throw. Space-primary phase4contact at26694 currently ignores placing.nativeHeld because model clears liveheld onlaunch; original actor retains inventory through throw and type7 steals it, invalidating880 -> E0E8/E778 aborts with idle2,next0. Nativeprimary center628,actorpre610(strict26) qualifies. Need implement cancellation at contact with saved pre-handleractor and idle2animation, preserve one outgoing OAMtick, next ordinary freezehandoff. Do NOT implement blanket invalid-projection cancellation: diagnostic placingPreview and placingPreviewCurrent remain valid26689..26696, so that hypothesis is rejected. Raw20-38-36, quick18-38-35-890Z; projectionquick18-40-53-762Z; instructions20-39-51_950214(E0E8),20-40-04_513187(E778). No edit yet. Later suffix/audio unverified.

## Older resume — October22 20:33, supersedes older sections

Latest accepted fresh input-only replay **25656 exact RGB565 frames, original401..26056; first26057**. Run `tests/OUTPUT/eggo-long-replay_2026-10-22T18-28-47-531Z/`. Accepts Space-secondary previousActive OAM gate and retained animation on reactivation: old code drew a stale previous-flight missile at25868 when active switchedfalse->true, and reset animation0 contrary to12044..12076. Native and quickmodel agree both missiles' animation+clock25867..25871. Evidence native20-27-20/quick18-29-03-248Z/instructions20-28-31_919226 and20-28-36_255022. Existing missile eligibility/flight native fixture passed. Full checkpoint20-27-52 is prefix25867 and predates that missile patch.

PENDING26057 trial: Space-secondary contact during airborne throw used post-interpolation actor instead of pre-handler actor. At26056 oldapp hit using flooredcenter521 vs newactor533(diff12); native oldactor539(diff18) did nothit until26057. Now advanceSpaceSecondary accepts the existing enemyActorPosition saved when actorstate4, uses it for spawn/contact and passes it to strikeLightning, exactly like other native throw-contact branches. Quickmodel18-32-36-310Z gives EXACT Q16X/Y/VY26055..26061: nohit26056,hit26057,VY0 onhit,19660nexttick. Oldhit26056 advanced injurygravity/art oneframe early. Native20-31-27 range26053..26061; oldquick18-31-26-559Z; original/app/diff inacceptedrun. Fresh full replay RUNNING session85279, started20:32,tracefrom26050. Resolve before accepting or changing more. No arbitrary offsets/delays, no captured-state injection.

Previous accepted watercatch and empty-hand CPUreset remain. All later recording suffix/audio still unverified.

## Older resume — October22 20:27, supersedes older sections

**25467 consecutive exact RGB565 frames, original401..25867; first remaining25868.** Fresh input-only replay `tests/OUTPUT/eggo-long-replay_2026-10-22T18-24-48-113Z`. All384 production hashes checked. Accepted both native-water catch and unconditional empty-inventory CPU search reset, with no prior-prefix regressions. New full verified checkpoint `scripts/OUTPUT/eggo-source-checkpoint_2026-10-22_20-27-52`. No pending production trial, no replay running.

Catch fix25490: BAE2..BAFA allows state1 to catch; next water handler discards. CPU catcheskind7,var0 at25489 and drops25490. Search fix25609:691E/6A14 reset even motionless empty-hand calls; old active-movement guard leftcursor one ahead from25529. Quick sample25606..25612 now matches native keys/cursors/Q16positions. Existing water5/5 and nativeCPU9/9 pass. Earlier20:25 section has full evidence. Do not delay the sweep algorithm itself.

ACTIVE25868:951pixels,bbox83..111,y52..105, player field. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-22_20-27-20/` range25863..25871; quick `scripts/OUTPUT/eggo-model-state_2026-10-22T18-27-19-698Z/`; original/app/diff in latest run. Need identify source and compare physical/animation state. Later suffix/audio remain unverified. Same seed1492,start-after400,recordingOctober19.

## Older resume — October22 20:25, supersedes older sections

Latest ACCEPTED fresh replay: **25208 exact RGB565 frames, original401..25608; first remaining25609**. `tests/OUTPUT/eggo-long-replay_2026-10-22T18-19-59-112Z/`. It accepts the new model.js native-water catch fix: BAE2..BAFA allows state1 to catch, then next water handler discards while submerged. Old generic swimming guard left CPU kind7/variant0 loose at16,763 and rendered an extra white icon25490. Native catches25489, drops25490 at12,790.9234619,state2. Quick model18-19-46-000Z matches. Evidence: native pickup audit20-19-17, pixel-probe run18-15-24-054Z, disassembly20-19-27_575033. Native water-recovery tests5/5 pass. Latest full verified checkpoint remains20-12-48(prefix25489), predates catch fix.

PENDING production game.js trial25609: native empty-inventory handling691E..6922 sets searchstate0;6A14..6A24 resets best score/cursors EVERY ordinary empty-hand call, even with no steering. Old approximation reset only when movement began. First hidden mismatch25529 while swimming and motionless: native search0,col0 vs appsearch1,col1; later newpiece completed sweep one tick early at25608, emittedLEFT+UP vs native0. This changed CPUX from48 to46 and neutralgravity1.9499969 toUPclamped1.75. New reset preserves metadata but setsstate0,column0,rotation0,bestScore=-9999,best=null,plan=null on every empty branch unless projectileChoice.action==='catch' (6854 selects2, bypasses reset). Quickmodel18-24-34-347Z matches native CPU commands/cursors/physical coordinates25606..25612 EXACTLY. NativeCPU tests9/9 pass. Fresh full replay RUNNING (started20:24, tracefrom25600), session10145; locate newest run after18:24UTC. Resolve before accepting. Evidence: native20-23-41 range25480..25609, quick18-23-40-864Z; instructions20-24-10_972453 and20-24-15_793565. Do not add a blanket search completion delay: original sweep algorithm itself is correct.

Diagnostic improvements only: eggo-audit-round-intro.py now logs linked native pickup lists and CPUstate; long-replay pixel probe now adds sourceUrl and call stack. No UI clicks/sounds, native state/image injection, or recording-specific gameplay constants. Later suffix and thunderSFX14/audio parity still unverified.

## Older accepted resume — October22 20:12, supersedes all older status/trial notes

**25089 consecutive exact RGB565 frames:original401..25489 inclusive. First remaining25490.** Run: `tests/OUTPUT/eggo-long-replay_2026-10-22T18-09-46-261Z/`. All384 production hashes verified. Same fresh input-only seed1492/start-after400, October19 recording. Remaining suffix UNVERIFIED. No replay running, NO pending production trial. Latest full verified checkpoint: `scripts/OUTPUT/eggo-source-checkpoint_2026-10-22_20-12-48/` (395files, copied hashes checked). Prior19-52-45 remains safe.

Accepted since previous verified checkpoint25424: Space-primary type7 spawn waits if actor worldY<waterline-120 (11CA8); RULES.spacePrimaryHeightGate120; advanceSpaceMotion optionalactorY defaultInfinity for pure motion fixtures. Native and model CPU activation25434 agree. First sprite displays the preceding active state, so previousActive snapshot added; initial native visible25435. Primary priority3 earlier OAM index beats actors3 but loses to pickups/stars2; renderer now draws after actors, before stars/pickups. Both fixes accepted through25436 and beyond. At25436 cloud strikes CPU and drops kind6. strikeLightning previously advanced the dropped pickup manually THEN regular pickup pass did so again. New nativePickupMotionPassPending=true at tick entry, false immediately before crate loop; manual tick is only for contacts when no regular pass remains. Fixed drop sample at25437 fromy679.4008(screen104) to675.4943(screen100), matching native OAM27. Both native drop inventory and actor motion now agree through25489.

Evidence:25425 pixel probe `eggo-long-replay_2026-10-22T17-51-46-180Z/pixel-probe.json` identified Space-primary832x64, NOT creature/portrait/preview. Raw `eggo-round-intro_2026-10-22_19-48-09/` and19-59-55; height source instructions19-55-42_505753/19-56-12_701299, priority proof20-01-15_290175(strh0x5c00). 25437 raw `eggo-round-intro_2026-10-22_20-06-56/`, oldmodel18-06-57-792Z, newdrop18-09-33-024Z. No water-creature changes, no empirical Y offsets, no reference state/image injection.

ACTIVE25490:173 pixels bbox144..159,y123..138, CPU item/preview-sized area. Native first pixel146,123 gray[123,121,115], appwhite[255,250,255]. Need identify actual object and palette/visibility before changing anything. Native raw `eggo-round-intro_2026-10-22_20-11-58/` (frames25487..25494, picture25490); quickmodel `eggo-model-state_2026-10-22T18-12-00-155Z/` includes clouds, rendercrates, Space enemies, both creatures and snapshots. Original/app/diff25490 PNGs in latest run above. Toolchain: tests/eggo-long-replay.mjs --recording=tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398 --steps=scripts/OUTPUT/eggo-user-replay_2026-10-19_21-01-20_213557/steps.json --start-after=400 --seed=1492 --limit=109808 --trace-until=110208 --trace-detail-from=25480. Stops firstdiff. Limit109808 ends at candidate originalSurvival110208, menus after that not verified.

Still incomplete: remainder of recording and thunderSFX14/audio parity. Do not claim complete decompilation. Current code has all earlier throw, palette, result, intro, cloud, missile and dropped-pickup fixes.

## Older superseded resume notes (retain causal evidence)

## CURRENT RESUME — supersedes all older resume/trial notes below

**25024 consecutive exact RGB565 frames:original401..25424. First remaining25425.** Latest accepted fresh input-only replay `tests/OUTPUT/eggo-long-replay_2026-10-22T17-45-21-390Z/`. All384 production hashes checked. One pending discarded-pickup double-step trial described below. Same seed1492/start-after400/October19 recording. Remaining suffix is UNVERIFIED. All earlier accepted fixes remain, no Luna rollback needed. New verified source checkpoint: `scripts/OUTPUT/eggo-source-checkpoint_2026-10-22_19-52-45/` (full hashes checked); previous17-46-49 checkpoint remains intact.

Accepted since previous checkpoint: first ordinary tick retains the outgoing state3 intro sprite using nativeIntroCameraRelease snapshot; native projection argument now restricted to7columns. Space kind3 throw uses OBJ palette2 from ROM216924 instead of BG template palette0; generator emits separate THROW_MATERIAL_PALETTES from native bases, source colors are unambiguous, target exactly matches native OBJ13. Retained preview white also corrected. Space missile priority2 now covers actors3 and later pickups2, including field overhang; native OAM26 vs44 proves first3pixels. Replacing a live cloud keeps the old cloud's one-frame OAM submission when P1 uses before CPU target update, via nativeReplacedCloudDisplay. All are accepted by current full replay.

CURRENT PENDING25437 dropped-pickup double-step trial. Height gate and previousActive Space-primary render are ACCEPTED; ordering patch also accepted by full fresh `tests/OUTPUT/eggo-long-replay_2026-10-22T18-03-44-392Z/`, exact401..25436 (25036frames). Native actual first primary CPU activation25434, firstvisible25435. Original primary priority3 earlier OAM covers actor3; moved drawing after actors before stars/pickups2. Latest first25437:146pixels bbox130..145,y100..119. Native OAM27 is priority2 discarded CPU kind6 at130,100, covering primary31(priority3). Both inventories clear on25436 via cloud lightning, no CPU discard keys. Model drop exists but nativeRenderCrates hasy679.4008 instead of expected675.4943, giving104vsnative100 with camera575. strikeLightning manually advanced the discarded item, then the regular pickup pass (which follows cloud/projectile contacts) advanced it AGAIN. Current patch tracks nativePickupMotionPassPending: true at update entry, false just before crate loop; manual first tick only when pass is no longer pending. Thus late enemy contact retains its needed extra tick, early cloud/projectile contact gets exactly the one regular tick. Quick post-fix `eggo-model-state_2026-10-22T18-09-33-024Z/` gives dropy675.494293, expected screen100. Fresh full replay RUNNING after20:09, limit109808, tracefrom25430; resolve newest folder. No verdict yet. Do NOT alter pickup Y offsets or native projectile contact geometry. Last verified backup remains19-52-45(prefix25424); save new accepted source after pending run.

25437 evidence: `eggo-round-intro_2026-10-22_20-06-56/`; old quickstates18-06-57-792Z. Native actor CPUheld becomes-1 at25436 with keys0, cloudnewcounter64 lastpulse. Original OAM27sourceRGB[31,27,13] beats primary31[23,14,4]. Old model14rendercrates includesdropnativeKind6,var3,x2,y679.4008,state1. Creature and divider hypotheses rejected, no changes made there. Cloud replacement and sprite palette fixes remain accepted.

Height-gate cause25425: pixel probe `tests/OUTPUT/eggo-long-replay_2026-10-22T17-51-46-180Z/pixel-probe.json` identifies832x64 Space-primary sprite, not water creature/preview/portrait. Native P1 life1 at25424 remains1,activefalse; old app spawned25425 at48,680,life182. ROM11C64[type7]->11CA8 requires actorY>=waterline-120. Added RULES.spacePrimaryHeightGate120 and optional actorY parameter, current worldY passed from advanceSpace; pure motion callers retain defaultInfinity. Actor+938 busyflag0, not cause. Raw25425 `eggo-round-intro_2026-10-22_19-48-09/`; validation6states `eggo-model-state_2026-10-22T17-57-19-392Z/primary-gate-validation.json`; instructions19-55-42_505753,19-56-12_701299. Both water creatures inactive; no creature code changed.

Latest palette evidence `eggo-preview-palette_2026-10-22_19-34-32_781122/report.json`; missile `eggo-round-intro_2026-10-22_19-36-58/layer-priority-audit.json`; cloud raw `eggo-round-intro_2026-10-22_19-41-54/`, states17-44-46-737Z. Full replay limit can be109808 updates to nativeSurvivalend110208; last menus outside Survival remain separate. Thunder sound14 still missing; no claim of audio parity or complete decompilation.

## Older October22 chronological notes (superseded status; retain evidence)

## Resume here — October22 throw, result fade and Space intro continuation

**Latest verified fresh replay:23874 consecutive exact RGB565 frames, original401..24274 inclusive. First difference24275.** Run: `tests/OUTPUT/eggo-long-replay_2026-10-22T15-43-09-953Z/`. All384 production source hashes verified. Seed1492/start-after400, same October19 recording, fresh input-only production game. Remaining suffix UNVERIFIED. New full source checkpoint: `scripts/OUTPUT/eggo-source-checkpoint_2026-10-22_17-46-49/`. No pending production patch or running replay. Previous checkpoint17-22-23 remains safe (prefix23759).

Accepted23760 throw destination: ROM C51C computes the logical landing before actor movement; FFFC consumes it after movement. At23758 RIGHT+UP+A crosses nativeX46->48, but destination remainsX40/anchor2. Old app reprojected fromX48 and selectedX56/anchor3. model.js now retains pre-motion nativeProjectionOrigin separately from post-motion eggX/eggY launch, including throw/final projections. Native throw fixtures both pass. Raw `eggo-round-intro_2026-10-22_17-36-28/`; instructions17-28-40_167413,17-28-48_772305. First subsequent24029.

Accepted24029 result confirmation: CD9A..CE52 accepts A immediately after podium load and reverses signed palette counter3328, not a second independent fade. Native24027 pending-16; A24028 reverses to-17, displayed24029=-17. App blocked input until full fade-in. confirmTick is225; resultExitLevel stores the displayed brightness at reversal, outgoing ticks subtract from it, then starts round at black. All fade pixels and next-round start24045/firstactive24075 now match. Raw `eggo-round-intro_2026-10-22_17-36-27/`; instructions17-33-40_755400,17-33-51_169608. Existing result-motion test repaired stale stub and timing assumptions; all3 pass, native1674glyph fixture unchanged.

Accepted24076 Space intro:138 pixels behind countdown3. Decoded native OAM36 matches Yolko group11/cel0 exactly, while app uses generic hanging group21. ROM EA04..EA52 chooses group11 with phase/step0 for Space(stage5); others group21/step2000. Centralized spaceAnimationGroup/Step in NATIVE_INTRO, used by renderer and countdown bookkeeping. Full fresh replay passes ALL200 countdown ticks. Raw `eggo-round-intro_2026-10-22_17-37-49/`, instructions17-42-43_654612. Ambient audit attempted with stagebeanstalk at24074 is INVALID: actual round4 Space has no ambient initialization, RAM there is stale/inactive, not a production bug.

Accepted24275 first ordinary Space tick: original OAM still displays the prior state-3 group11/cel0 while actor motion already uses state0/selector5. updateTower now snapshots intro:Boolean(nativeIntroCameraRelease), preserving the outgoing intro art for that single OAM tick, across all arenas. Full fresh `tests/OUTPUT/eggo-long-replay_2026-10-22T15-47-42-015Z/` passes **401..24619 (24219 exact)**, first24620. Projection-origin call now restricted to columns7, preserving nonnative-width fallback. Raw `eggo-round-intro_2026-10-22_17-46-03/`; quickstates15-46-04-181Z.

ACTIVE24620 trial:28 throw-piece pixels at75..81,y69..74. Actor, launch/target, Q16 path, OAM position(45,43) and affine matrix[0,926,-927,0] all match. Colors alone differ: native purple vs app beige. ROM F3B0..F3D8 uses material table08216924[stage*8+kind] and palette base020000f0[stage]. Space kind3 selects palette2 even though its BOARD template selects0. All other nontransparent material palettes equal old BG-derived values. `eggo-build-preview-palette.py` now emits separate THROW_MATERIAL_PALETTES directly from ROM; PREVIEW_PRIOR_PALETTE reflects actual retained throw colors. nativeThrowAffineArt maps source indices to OBJ colors only when required. Diagnostic proves all15 opaque source colors unambiguous and target equals native OBJ13 exactly: `eggo-preview-palette_2026-10-22_19-34-32_781122/report.json`. Native raw `eggo-round-intro_2026-10-22_17-50-04/`, states15-50-04-997Z. Instructions17-56-43_570600 and17-56-43_776476. Fresh full replay currently RUNNING (find newest parameters.json after19:34). No acceptance yet. Optional small optimization after verification: ignore transparent palette entry0 when deciding whether recoloring is necessary; current compare includes entry0 and needlessly recolors otherwise identical palettes, but those rendered pixels remain identical.

Newest verified source checkpoint remains `eggo-source-checkpoint_2026-10-22_17-46-49/` (394 hash-verified files, prefix24274); it predates the handoff fix and this pending palette trial. Need save a new full checkpoint after next accepted run.

Accepted17778 weather: `native-weather.js` implements ROM B1EE..B27E, two camera counters, shared retained BG palette, one-tick DMA display lag and GLOBAL RNG draws. Normal/short/long palette offsets217644/217244/217444. `eggo-extract-weather-art.py` decodes original ring indices with each palette, asserting normal reconstruction equals both existing rings exactly; no ambiguous RGB color replacement. Output `eggo-weather-art_2026-10-22_12-32-42_610677/`. Changed banks5..7 and9..12 affect rings; normal placed/platform/material palettes0..4 and8 stay unchanged. Native weather state and global RNG match at18770: counters559/726, RNG34110. Thunder SFX14 has NOT been added (audio parity is still incomplete). Fresh replay first remaining17814.

Accepted17814 ambient: missing decorative bats (Pirate), insects (Beanstalk/Jungle). ROM10708 initializes four Q16 bodies;13714 init,13744 updates/draws. `native-ambient.js` implements exact integer motion, actor-coordinate noise (not RNG), boundaries and clocks. Native draws allow Y<256, so an off-bottom 16px OBJ can wrap into the TOP of the screen; this explained59 black pixels at17814. Render prior body with prior camera, loop bat cels every20 ticks/insects32,4ticks/cel. ROM art111060/111320, OBJ palette2/10; `eggo-extract-ambient-art.py` reconstructs indexed pixels. The read-only oracle `eggo-audit-ambient-motion.py` verifies all four bodies' positions, velocities, bounds and clocks for347 ticks17541..17887 exactly: `scripts/OUTPUT/eggo-ambient-motion_2026-10-22_12-48-28_795367/`. Diagnostic native actor inputs are NEVER injected into the actual replay.

Accepted17887 CPU difficulty: original CPU strength is NOT a fixed6 across Hard Survival. Setup21BA reads round-config word16;2276..2294 increments5..7 by1 and values<5 by2. Round3 strength5 (round1/2 strength6). This explains the first candidate-improvement stall12ticks instead of model18, with six invisible frames of controller delay before its first visible difference. `nativeSurvivalCpuDifficulty()` in native-cpu.js computes the strength at every round start. Random phase rounds9..12 uses1, then0 (22C8..22E8, total Hard index round+16). Fresh replay advanced to17991.

Accepted17992 transient height: ROM C42C..C43C updates the field's top row with the RAW placement-template anchor on commit, even when that mask row is empty. Next tick recalculates actual occupied height. At17973 CPU row becomes44 for ONE tick, then45; ambient bottom permanently shrinks from710 to696 during that tick. Using only actual height left a bat at the wrong Y. `model.js` records `nativeCommittedAnchorRow={frame,row}` on a real commit; game.js includes it only on that tick when updating ambient bounds. No frame-specific constants. Fresh replay advanced to18769.

Accepted18770 ledge after filler: actors/CPU/RNG agree, but original P1 Y18769=624.3837127685547, old model625.3837127685547; camera inherited1px difference causing10883 changed background pixels. A stale `egg.nativeFillerMotion` made the post-integration landing use the legacy ONE-column support instead of native two-foot OR/AND probe3778 (called unconditionally from FAD8, absent explicit drop bypass). Native motion now always uses its native footprint and retains first-contact velocity/ground phase. Quick model diagnostic verified exact coordinates; full fresh replay advanced to21034. Raw native `eggo-round-intro_2026-10-22_12-55-51/`, full accepted run `eggo-long-replay_2026-10-22T10-58-28-795Z/`.

Accepted21035 CPU final throw handoff: gate6818..681C rejects CURRENT actor state4 even when next state is0. Old model allowed empty-hand steering/rotation on that final frozen tick. At20953 it caught filler later in actor dispatch; premature rotation-wait decrement was invisible until21035. game.js now skips controller planning on ALL current-state4 ticks, while timing.begin and the actual actor still run. No extra artificial wait. This is the latest accepted21866-frame run above. Read-only rotation audit first differs exactly20953: `scripts/OUTPUT/eggo-rotation-audit_2026-10-22_13-02-06/`. Post-fix model states `eggo-model-state_2026-10-22T15-08-57-916Z/` give correct wait15 at20953,0 at21034,rotate at21035. Native instruction evidence `eggo-instructions_2026-10-22_13-03-18_979186/`.

Accepted22267:754 P1 sprite pixels differ, physical coordinates and RNG exact. P1 is launched automatically by a falling unsupported owner at22265, with no Jump button. Original selector4 remains on that launch tick, then selector5/phase8192 at22266. Model's generic walking-rise transition incorrectly keeps selector4 until22267, displaying old walk art one frame too long. The one-line guard in view.js limits that special hold to `nativeCameraControl.jump`; full replay passed through22274. Raw native `eggo-round-intro_2026-10-22_17-09-23/`; source E7DC..E850 support-to-selector dispatch in `eggo-instructions_2026-10-22_17-11-30_680176/`.

Accepted22275:728 CPU sprite pixels differ, coordinates/velocities/RNG still exact. CPU uses filler at22274 and catches native kind1 in the SAME tick. Native live held=1 but animation table083f1f68 (FREE fall group10); next tick switches to held table083f1f70/group11. Model used truthiness of old snapshot inventory AND new inventory, so falsely chose held table immediately although the old filler was consumed before loose-pickup dispatch. Accepted patch requires nativeHeldDisplayReady (identity-aware continuity flag set in game.updateTower) at the five animation-table checks in view.js. Projectile catch exception remains intact. Raw evidence `eggo-round-intro_2026-10-22_17-15-04/` and `...17-13-26/`. Fresh replay now exact through23683.

Accepted23684:11985 P1 viewport pixels differ. All physical coordinates/velocities and RNG8252 are exact. At23683 player holds DOWN and uses filler, which launches the actor AFTER movement. Native foreground camera is126; model120. Original FBD2 computes camera-key offset using retained support register sb BEFORE item-use/jump can change ground/velocity. Model computed nativeCameraSupported after deferredFiller/use, losing support from the movement phase. Accepted patch moves the existing support capture immediately before deferred use/jump. No new camera offsets. Native expected P1 camera23682=123,23683=126,23684=119; old model123,120,116. Evidence: `eggo-round-intro_2026-10-22_17-18-15/` and `eggo-instructions_2026-10-22_17-18-52_959374/`. Full fresh replay passed through23759.

New FAST diagnostic: `node scripts/eggo-replay-model-state.mjs --first=FRAME --last=FRAME`. Replays the SAME seed1492/input tape from400 with production Game in Node, no render (~4s to22k), outputs complete physical/controller/board snapshots into timestamped OUTPUT with hashes/settings. Only a diagnostic; it does NOT verify pixels or replace full Electron replay. Full snapshot capture uses structuredClone. Useful for exact first-difference body/AI inspection without expensive rendering on every investigation. Last pre-view-fix run18768..18770, and post-view-fix snapshots22264..22267 are saved in respective `eggo-model-state_*` folders.

## Earlier October22 loading/camera checkpoint (superseded)

**October22:17377 consecutive frames EXACT, original401..17777. First remaining difference17778: unimplemented Pirate lightning BG-palette changes and global RNG draws.** Latest fresh input-only application replay: `tests/OUTPUT/eggo-long-replay_2026-10-22T10-16-16-736Z/`. All375 current source hashes agree with that run. Full rendered RGB565 equality, no off-grid errors, no later native state/image/timing injection. Source recording and seed/start remain the October19 recording, seed1492, start-after400 described below. Remaining frames are UNVERIFIED. No harness is running; no weather trial patch is pending. The newest October22 source checkpoint manifest identifies the saved files.

User requested a Luna-change audit: `scripts/OUTPUT/eggo-source-review_2026-10-22T09-33-50-340845Z/parameters.json` compared all374 old source files with the October21 validated run. ZERO production differences; no rollback was necessary. A real diagnostic error was found: `eggo-prefill-work-audit.mjs` generated later-round seeds without gameplay RNG draws between rounds. Its post-round1 workload comparisons are invalid. That script now refuses to run and identifies its replacement. Read-only native per-pass seeds/config are in `eggo-prefill-inputs_2026-10-22T09-41-18-635600Z/`; corrected independent warmup audit `eggo-native-prefill-work_2026-10-22T09-52-30-768Z/validation.json` validates all32 passes and both field RNG endpoints. The second-pass reference includes the hidden intro tick1; round6 legitimately consumes four additional draws there because its final clock is zero. This diagnostic sampling is never injected into an application replay.

Resolved17542: `native-loading.js` replaces fixed28 blank ticks with a centralized GBA workload estimate: both320-step warmups, actual active pickup visits, successful affine-tool descriptors, arena resource work and initial board pieces/cells. The OAM descriptor pool is256 slots (09630 initializes020125C4..02014DC4,40bytes each), shared by identical alternating field streams. The two VBlank-aligned budgets predict all15 measured intervals: `scripts/OUTPUT/eggo-loading-budget_2026-10-22T10-00-39-852Z/report.json`. IMPORTANT LIMIT: cycle coefficients and tail budgets are calibrated ESTIMATES, not an exact ARM/IRQ emulator. New seeds near frame boundaries still need independent verification. Runtime uses real constructor workload, with no per-round delay table or recording timestamps. Fresh replay with this fix alone matched through17543; first17544 (`tests/OUTPUT/eggo-long-replay_2026-10-22T09-58-47-874Z/`).

Both native setup calls are now timed separately in `scripts/eggo-measure-round-components.py`. Second-call instrumentation was pixel-identical over all111652 SOURCE-ROM frames (`scripts/OUTPUT/eggo-round-component-audit_2026-10-21T22-22-55-077521Z/`); this validates instrumentation, not reconstruction. New first-call wrapper at0800247A stayed exact through17550 (`...2026-10-22T09-35-26-514458Z/`). First setup durations round2/3:3648893/3846132 cycles, prefill1321977/1548047. Second setup is shorter in round3 than round2. Raw timer IO has a stale zero low half; high halves constrain the PPU clock origin within64cycles across the trace. First setup starts17387cycles after the round-start video callback; the second roughly745cycles after a VBlank. The apparent pre-loader wait is busy initialization, not a software countdown.

Resolved17544: hardcoded BG camera scale35904 was wrong for Pirate's63-row/504px source. Other rings have64rows/512px. ROM AD7E stores descriptor row count; AE04..AE30 computes `(rows*8-160)*floor(65536/640)`, giving Pirate35088. `view.js` now derives scale from generated `BG3_RING_ROWS`, using arena/field and preserving register-phase ordering. `eggo-compare-stage-rings.py` exports the metadata. Native BG1/BG3 at17544 matched raw art at offset5 exactly; old renderer used6. Actor physics and foreground cameras already agreed. This fix advances the complete fresh exact prefix to17777.

ACTIVE17778:27931 pixels differ across the viewport. Native shows a lightning palette (black ships, brighter sky), model normal palette. Evidence: `scripts/OUTPUT/eggo-round-intro_2026-10-22_12-18-07/` plus latest replay original/diff PNGs. Native palette entries81..111 become zero;121..126 and145+ change. This is a real ROM palette update. Exact handler0800B1EE..B27E, arenaID4 only: per-camera countdown at+278. If zero, copy256 BG halfwords from08217644 to03001C70, draw global935C once, set `(draw+255)&1023`, play SFX14. Then decrement; remaining<=3 copies08217244;4..11 copies08217444;>11 retains prior palette. Both field handlers write the SAME BG palette, so last eligible write wins. Existing palette DMA gives one-tick display lag: CPU counter11 at17777 queues the palette visible17778 (counter10). Normal descriptor palette is08217644 (descriptors0821D104/player,0821D120/CPU).

Missing weather ALSO explains earlier invisible RNG divergence: model round3 starts49414; initial weather draws35977 then11257 set waits392/248. Native frame4/17544 counters388/244 and RNG11257; frame238/17778 counters154/10. NEXT: implement two weather counters, correct global RNG order, retained shared BG palette and one-tick display pipeline. Do NOT hardcode frame238 or always prefer CPU. Preserve palette indices when making variants: RGB replacement can confuse identical colors at distinct indices. BG palette affects background and placed/water/platform art as relevant; it does not recolor OBJ sprites. No weather code has been applied. Re-run fresh from400 after fixing.

## Historical October21 checkpoint (superseded by the October22 resume above)

The NEW original recording is `tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/`: 111652 recorded frames, complete, zero dropped. Claude indexed it in `scripts/OUTPUT/eggo-index_2026-10-19_20-46-32_908010/` (index.csv, phase-map.json). The candidate Survival end is frame110208; the later non-Survival boundary still needs verification. The user reports15 levels; indexing found16 arena segments, so do not claim verified round segmentation.

Common round-start checkpoint: after ORIGINAL recording frame400, seed1492, Yolko, Survival Hard, starting arena Dragon. Inputs expanded by `scripts/eggo-prepare-user-replay.py` are `scripts/OUTPUT/eggo-user-replay_2026-10-19_21-01-20_213557/steps.json`. The checkpoint and its deterministic original replay are in that directory. Reference first600 after400: `scripts/OUTPUT/eggo-reference_2026-10-19_21-01-22_620104/s400-first600.*`.

**October21 continuation: 17141 consecutive frames EXACT, original401..17541 inclusive. First remaining difference17542: third-arena loading finishes one tick too early in the model (native first active intro frame2, model frame3).** Full rendered RGB565 equality, zero off-grid errors, fresh seed1492, no native state/screenshot injection after initialization. The remaining recording is unverified.

Latest validated run: `tests/OUTPUT/eggo-long-replay_2026-10-21T20-52-55-544Z/`. Production changes: result-view.js adds winIntroFrames2; pixel-renderer.js uses ROM intro-once/repeat-rest sequence. No pending trial code, no harness running. Source checkpoint is recorded in the newest checkpoint manifest. Prior full checkpoint22-48-27 stops17449; it lacks the accepted podium fix. Previous checkpoint22-34-51 stops16373.

Accepted later fixes covered through16373: shared thief animation7/8 protection; projectile flame clocks retained across arenas; Castle thief mirror uses pre-throw actor phase; blast damage intersects the actor's two occupied cells; cross-field injury waits for target handler; asymmetric x112 projectile camera selection; zero-VY support; contact uses pre-carry swimming position; queued incoming projectile contact after target movement and before held fuse; immediate projectile-catch icon readiness and CPU resource table handoff without phase advancement; native OBJ projectile field/slot priority; hammer actor contact with held inventory; auto water-rise injury immunity. Native vs model physical units: nativeBoardFloor752, nativeActorFloor720, tile16.

Accepted17450: confirmed ROM cause and full replay passed through17541. Native win selector0x080104f0, Yolko branch0x080105c0: wait32 counter ticks (gate0x0200328c==4), play cels0/1 once at4ticks each, then repeat cels2..15 (14 frames). Current production previously looped ALL16 cels; its first failure is exactly the first wrap after64ticks. Counter0x020318f4 DOES reset on each podium entry (init0x0801cc18, increment0x0801cd9a), so persistence hypothesis was false. Raw traces scripts/OUTPUT/eggo-round-intro_2026-10-21_22-50-47 and22-50-49: first counter starts8913=1; second17354=1. At17450 counter97 means rendered previous96, (96-32)/4=16 -> native cel2 rather than old cel0. No separate clock change needed. Accepted patch centralizes winIntroFrames2 in PODIUM_VIEW and uses intro-once/repeat-rest in drawPodium. Diagnostic audit now logs counter/gate/mode/globalClock. ROM instructions saved22-50-17_188040 and22-50-21_676389. Full replay tests/OUTPUT/eggo-long-replay_2026-10-21T20-52-55-544Z/report.json confirms17141 consecutive matching RGB565 frames.

ACTIVE17542: 26252 pixels, full viewport, original black/model fade level2. Model starts round3 at17512 correctly, but NATIVE_INTRO.roundLoadTicks28 was inferred only from round2 Castle. Native Pirate initialization actually needs29 hidden ticks: dispcnt0 through17541, active17542 with native_frame2 and palette0; model frame2 already17541, frame3 visible17542. Do NOT inject reference timing, add arbitrary per-round offsets, or shift the replay to hide this. No production loading change made. Native first init resets native_frame to1 at17528, versus first Castle init at8996; difference is already in synchronous native initialization, before normal gameplay. ROM0x0800220c main setup calls0x08018c38;0x08019404/0x08018e38 calls18c38 AGAIN. Native18c38 calls0x08018590 (field tile resources: acb8/ad10 -> ad6c custom decompression via IWRAM3000110/3000000), then prefill loop0x08018d3a..18d60, 320 iterations calling b944 separately for each side, with global RNG935c calls. Model already replicates two320-step prefill passes in Tower constructor, but not their GBA CPU execution latency. Actual latency likely depends both resource decompression and simulated pickup work; not proven which accounts for the extra tick. Saved stack words during BOTH passes show acb8/ad10 and b944 callees, so not host GPU/capture delay.

Loading audit for all subsequent Survival starts (start:first active frame:hidden ticks):8981:9010:28,17512:17542:29,24045:24075:29,29929:29959:29,39430:39462:31,49632:49662:29,57703:57735:31,64820:64853:32,69695:69727:31,75047:75078:30,80654:80688:33,85290:85320:29,91325:91356:30,98099:98130:30,104335:104368:32. Same arena on later cycle differs too: a simple stage-only delay table would not solve this generally. Full audit data scripts/OUTPUT/eggo-loading-audit_2026-10-21_22-55-39/loading.json. New reproducible read-only script scripts/eggo-audit-loading.py logs native frame/gate/dispcnt and possible saved code addresses from IWRAM7d00..7dff, output params and code hash. Verified against both initial transitions, output22-58-55_971098. Raw memories first/second init: eggo-round-intro22-57-16 /22-57-15; focus7d8c savedLR247f (first18c38),7dc8 savedLR18e3f (second18c38),7d70/7dac savedLR18d49/18d57 (320-step loop). Addresses are possible stack words, not a guaranteed full live backtrace. Latest disassembly22-58-17_848634 (18d3a prefill),22-59-10_321451 (ad6c decompression),22-57-44_146088 (18c38 init). Existing Ghidra full decomp scripts/OUTPUT/eggo-ghidra-survival_2026-10-06_12-02-28/survival-reachable-decompiled.c has220c atline583 and19404 near20004; some indirect native functions missing. Next task: reconstruct initialization execution timing causally, retain exact prior17141 prefix.

Previous17134 fixed:14546 pixels mostly CPU camera. Original result begins17129 when P1 rescue commits. Native CPU nativeVY17129=-1.1000824 then increments0.2/frame under neutral input; model still applies UP/float on17129 and hasVY=-1.2000885 (0.1px/frame discrepancy), then neutral from17130. ROM result state is committed in P1 before CPU controller. Current update loop uses neutral CPU actor update immediately if a result was committed by P1, retaining throw-handoff freeze, before finish() is called. Model actor still advances; only AI input stops. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_22-37-16/`. Neutral entry fixed all CPU pixels. Remaining463 pixels are P1 actor: native state2 selector7, free group12 table0x083f22a4 descriptor0x083466fc; model compact fall-moving artcolumn19 is wrong here. The raw-art trial produced exactly the same app hash and was REVERTED. Native OAM47 bitmap matches raw group12 cel0 EXACTLY; model draws the same pixels one pixel LOWER. Cross-correlation confirms zero pixel differences at shift(0,+1). Root cause is physical rescue-entry VY: native17129=-0.4000092 after attraction, model=-0.3000031, adding0.100006px Y error each tick. Native entry starts with UP/float gravity0x1999, model hardcoded neutral0x3333. Current model rescue-body initialization uses the handler control-dependent gravity (same RULES gravity/float/fast/boost parameters), preserving Q16 truncation. No sprite/offset workaround remains. Passed through17449. Read full board floor constant752 and actorfloor720 carefully when checking positions.

Previous16374 fixed:1242 pixels in CPU actor/held preview. Model discards its kind7 at16373 (native frame7365 odd); native retains it until16374 (frame7366 even, CPU keys256). ROM0x08007762..778c explicitly exits on odd native frames when search is finished and bestScore<=0; even frames dispatch R discard. Current game.js no-plan branch gates discard on (nativeFrame+1)&1 ==0 and marks nativeEarly to skip hazard steering on both parity branches. P1 discard logic unchanged. Native raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_22-34-54/`. Passed through17133.

Accepted since10725: retained actor input/support through throw handoff; actual prior-selector camera hold; retained Castle thief/shark respawn animation; fresh pickup/theft phase ordering; integer cloud hit geometry; pre-carry swimming-Y steering; thief/creature OAM priority; independent stolen-icon visibility; primary fish uses preceding waterline; sparks/bonus require a row completed by actual placement; late loose-owner scan excludes owners born that update; discard retains pending unfinished walk/throw selector; held bomb persistent clock; shared thief protects selector7/8 after state4; projectile flame clocks survive arena setup; thief mirror uses retained enemy-phase actor X. All covered by the15749 prefix above.

Previous15912 fixed:149 pixels at217..231,y77..92 are a hammer falsely covering CPU actor (not bomb flame/anchor). Native OAM at224,77 has only CPU actor33,priority3; hammer was removed15911. Its map cell is EMPTY: do NOT patch wall collision. ROM0x080047f0..4840 allows hammer contact with held inventory, calls injury and consumes projectile even if injury returns immediately. Native0x0800f634 guards field+0x1240 (auto water-rise); CPU is immune here, remains state0 and holding bomb. Current contactNativeProjectile generalizes exact queued bomb contact to native hammers, permitting held inventory and consuming on hit; strikeLightning now also guards nativeWaterRise/nativeWaterReleaseKick. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_22-31-37/`. Passed through16373.

Previous15910 fixed:715 pixels, native CPU catches bomb15909 and retains fuse37; model does not. CPU has just released from water creature; target moves from451.56 to448.06 before the native contact. Model P1 projectile loop used target's preceding-frame Y. Current production centralizes catchNativeBomb and queues P1-to-CPU bomb contacts while source.time is one step ahead, processing at end of target update (after its own held-bomb fuse update, avoiding double decrement). CPU-to-P1 contacts stay immediate because target already moved. Geometry retains nativeWaterCameraY before carry, exact integer square, and actual source projectile removal. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_22-25-32/`. Follow-up validation `tests/OUTPUT/eggo-long-replay_2026-10-21T20-29-00-634Z/` still first differs15910, but correct catch15909/fuse37 now agree. Contacts are processed immediately before the target held-fuse pass (native decrements it on catch tick), and nativeHeldDisplayReady permits projectile catches immediately unlike later loose pickups. Remaining actor resource was free group8 instead of native table group9 (raw +83c stays8 but +84c points0x083f1f60 and descriptor0x08332af8 = GROUP9). Accepted view patch uses nativeProjectileCaughtThisTick to select held CPU resource without an extra phase step; game clears the CPU marker after its pose update. Passed through15911.

Previous15908 fixed:ONE pixel[220,62]. Native OAM25 flame (x208,y60,priority2) supplies red[30,0,0]; OAM27 hammer(x216,y49,priority2) supplies black but is behind25. Model painted bombs then hammers, covering red with black. Current renderer paints CPU then player-owned projectile records, and higher slot indices before lower ones, so earlier original OAM wins ties. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_22-23-22/`. Passed through15909.

Previous15906 fixed:199 pixels from falsely caught bomb (displayed held after P1 cross-field contact). Native CPU held stays-1 and P1 projectile stays active; model catches at15906. All projectile positions, velocities, bounce and counters match native exactly! Be careful with units: nativeBoardFloor is752, NOT736; using736 creates a fake constant16px discrepancy. Raw/body/visual audit `scripts/OUTPUT/eggo-round-intro_2026-10-21_22-20-56/` and raw actors15904..07 `scripts/OUTPUT/eggo-round-intro_2026-10-21_22-19-32/`. CPU is in state1 and being lifted by its water creature. Projectile contact runs before carry overwrites actorY, just like camera/enemy steering, but model catch used final displayed egg.y. Current native catch uses egg.nativeWaterCameraY when present, falling back to ordinary actor Y. No broad swimming immunity added. Passed through15907.

Previous15816 fixed:422 P1 actor pixels. At15814 model ground flag clears after animation while VY remains0. Next update support-hold required ground||vy<0, so it applied gravity and chose air selector5 for one tick; native remains selector4 and position/velocity unchanged. ROM0x08003814..381c explicitly accepts native VY>=0, i.e. modelvy<=0. Current patch includes equality in support-hold. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_22-17-03/`. Passed through15905.

Previous15758 fixed:6 pixels at110..111,y1..6 belong to CPU hammer OAM25, not a thief or pickup. Native visual angle advanced again when its global origin reached112, but model visibility still used CPU camera and froze its rotation. ROM0x08004582..459e selects the owning/destination field asymmetrically: CPU-origin shots use right only for X>112; player-origin shots use left only for X<112. Shared model visibility used X>111 for both. Current patch uses source-dependent boundary in hammer visibility. Native raw/visual counters: `scripts/OUTPUT/eggo-round-intro_2026-10-21_18-06-30/`; earlier OAM `scripts/OUTPUT/eggo-round-intro_2026-10-21_18-05-02/`. Audit helper now logs all7 visual slots per field (x/y/clock/angle/type), avoiding extra memory dumps. Passed through15815.

Previous15750 fixed:1065 CPU actor pixels differed because native entered injury at15749 and model didn't. Native blast center model[5,21], actor[4.25,18.9816]; radial feet-distance test2.5 missed it. ROM0x08003fda..3ff2 computes actor column=(rawX>>20)+1, worldrow=(rawY>>20)+1, then4148..4162 tests both occupied actor cells against each visited blast-diamond cell. In model coordinates these are column=floor(egg.x), rows=ceil(egg.y) and+1. Head cell[4,20] is in the radius2 diamond. Current native explode branch now applies injury at each matching visited cell (native handler guards repeat), replacing the radial test; non-native behavior unchanged. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_18-00-47/`. Passed through15752. Follow-up raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_18-02-54/` reveals target CPU started injury gravity on15749 while native starts15750. P1 projectile is updated before CPU Tower movement in this reconstruction; original projectile contact follows actor movement. Current patch marks nativePendingBlastHit when source eventTime is ahead of target time, then commits it at the end of target hazard phase before animation. Thus the same rendered injury entry is retained but no early physics/gravity. Passed through15757.

Previous15680 fixed:870 pixels from premature Castle thief mirror. Native OAM25 x207,y58,NO mirror at15680; x209 andmirror at15681. Exact ghost Q16 at15679x79.73822 is above final actor state4x79.42896 but below its start80.00024. ROM0x080116d2..116de compares pre-throw-handler actor. Model now stores nativeActorX/previousActorX alongside ghost positions and renderer uses enemy-phase X from exact steering. Full Q16 comparison preserved. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_17-57-07/`. Passed through15749.

Previous15652 fixed:20 flame pixels. P1 first round2 bomb launches15651; native field+0x1098 visual slot+0x28 clock12 then13 while model0/1. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_17-54-35/`. ROM0x0801b25e increments retained clock modulo24; allocation0x0800426c does not clear it. startRound now carries per-field flame arrays through new Towers. Passed through15679.

Previous15389 fixed: native catches kind7 at15387 and retains it; model stole it at15388 while selector8 continued after state4. Raw `scripts/OUTPUT/eggo-round-intro_2026-10-21_17-45-54/`. Native actor group16 frame5, held anchor, positions and ghost hit geometry proved correct; do NOT alter those. ROM0x080132f2..13320 rejects state4/current-next and animation selectors7/8/current-next for every thief type1/2/8/10/11/13. Model now centralizes nativeTheftProtected on retained current selector7/8 and fresh-catch ordering in all these thieves. Pending selector isn't separately modeled; avoid inventing timers. Passed through15651.

Earlier fixes covered by this prefix: result/round transitions, retained palettes, global wave phase, complete Castle thief OAM ordering/timing/mirror/overhang/stolen-icon snapshots, postmovement cloud creation, water-creature animation counter persistence, native config-dependent enemy initial delays, fish priority/overhang, rival stopped-walk selector3. Range-based native capture diagnostics now seek to indexed keyframes; verified raw memory/video equality, ~0.5sec queries instead of repeatedly decoding all preceding frames.


Run from project root:

```powershell
node tests/eggo-long-replay.mjs --recording=tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398 --steps=scripts/OUTPUT/eggo-user-replay_2026-10-19_21-01-20_213557/steps.json --start-after=400 --seed=1492 --limit=2400 --trace-until=2800 --trace-detail-from=1910
```

The harness launches hidden MUTED Electron, streams comparison in300-frame chunks, runs production resetSurvival from seed, and STOPS at first difference. Repeat from400 after each causal fix. Do not use --video-offset to conceal ordering problems. --no-stop is diagnostic only. --pixel-probe=1641,x,y logs actual drawImage/putImageData changes at one pixel. --dump=frame,... saves additional frames. Traces have positions/cameras and optional CPU timing/search/rotation, raw poses, hazards, water/creature and player animation snapshots.

Extract original difference without emulator/UI focus:

```powershell
python scripts/eggo-extract-frame.py tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398 1914 --app tests/OUTPUT/eggo-long-replay_2026-10-20T01-15-00-012Z/first-mismatch-app-frame-1914.png
```

`scripts/eggo-audit-round-intro.py recording --first N --last M --pictures N,M` also streams captured RAM/IO/palette/VRAM/OAM from video_refresh and saves raw segments. Despite its name it works on gameplay too. Native addresses appear below. `scripts/eggo-compose-native-layers.py` has reusable decode_object / palette_555 helpers for native OAM attribution; object pixels key is `pixels`, not pixels5.

## Backup and regression evidence

Pre-batch backup: `scripts/OUTPUT/eggo-resume-backup_2026-10-19_21-54-55/`. Do not overwrite. It includes initial model/game/view/renderer/guide/harness; countdown art, intro generator and native-rescue were also copied before their edits. This batch also modifies native-water.js and adds generators/assets documented below. Eggo sources are largely untracked; do not infer cleanliness from git diff. Preserve unrelated edits.

Old meaningful regression:420-frame long-direction-jumps, UPRIGHT180, neutral30, UPLEFT180, neutral30, original hard-idle. After the water/rock/CPU changes, `tests/OUTPUT/eggo-mania-visual_2026-10-19T21-04-44-048Z/` matched positions/cameras/CPU inputs/pickups/hazards/RNG420/420. Actual image comparator: `scripts/OUTPUT/eggo-replay-frame-diff_2026-10-19_23-05-20_919029/`:420/420 EXACT, zero differing pixels out of16128000. Later changes concern player injury, last walk-frame inventory and creature visibility; rerun this targeted regression once if making a final validation claim after further changes. Avoid unrelated test batteries.

```powershell
node tests/eggo-mania-visual.mjs --input-replay-autonomous --input-replay-capture-frames --replay-capture=scripts/OUTPUT/eggo-reference_2026-10-19_12-03-21_931957/long-direction-jumps --replay-frame-limit=420
python scripts/eggo-compare-replay-frame-screenshots.py --app-sheet tests/OUTPUT/NEW_RUN/input-replay-app-frames.png --native-directory scripts/OUTPUT/eggo-reference_2026-10-19_12-03-21_931957 --native-prefix long-direction-jumps.frame --frame-count 420
```

## Causal fixes in this continuation

### Fresh round and countdown

- Native checkpoint400 has already executed one hidden state3 update. New central NATIVE_INTRO (native-rescue.js) defines initialFrame1, camera offset-6, group21, step0x2000 and the two body anchors. Production startRound initializes these, one pickup pass, one meter pass, and raw character clocks. CPU controller +0x100 starts armed at1280, +0xb4 rotation wait starts15 (not0). CPU plans during countdown; actors follow the previous boat body instead of static screenshot/bob approximations.
- Native camera integrates old vertical velocity before state3 overwrites actor position. Countdown tracks that exact Q16 camera probe; body follows nativeRescueBoat of prior tick. Art boat draws frame-1. First regular falling camera keeps state3 offset for one extra actor handoff tick.
- Countdown digit index/timing shifted to original:200 ticks total,199 table cels, GBA integer8.8 inverse-affine lookup and128 double-size bounds; each field has its own camera. Numeral3 was extracted while dim: generator uses full palette fromframe120 while preserving its native source tiles. Palette fade itself was correct: channel5*k>>5, k32 reaches full.
- Native first CPU character is the first setup RNG draw&7 (Astro here), not fixed perarena. Rival generators now also emit all8 full raw player atlases and all21 descriptor groups. Selector10 uses native group21 during countdown/fall handoff.
- Intro loose tools emit native sparkles every32 ticks. Enemy countdown previously subtracted an obsolete13-tick pause; actual native enemies count every tick including initial hidden tick. Native pickup-backed start now subtracts frames+1; Dragon primary/secondary life and eventual spawn coordinates match captured RAM.

### Palette, backgrounds, water compositing

- `scripts/eggo-build-stage-platforms.py` decodes each arena foundation from captured native BG tilemap/graphics/palette. Loads platform-<stage>.png; Factory intentionally retains previously verified legacy platform.
- `scripts/eggo-build-water-animation-clock.py` extracts shared native clock0x0200329c phase vs asset indexing; WATER_SURFACE_PHASE_OFFSETS supplies each arena. Player surface/body and CPU BG3 body now use it. Dragon offset56 mod60. Factory legacy mapping remains unchanged; round-persistent clocks still require later-round verification.
- Underwater native windows disable dry BG3. Transparent BG0 exposes backdrop, which is not an eligible second alpha target. Added actual opaque-board/foundation mask for nonFactory body blending: opaque BG1 over absent BG0 is unblended, fully transparent water/board exposes black. This fixes subtle holes without coloring them from dry BG3. Factory exempt to retain420 golden.
- Initial outline palette is countdown black for its first displayed tick; after a throw it briefly retains the material palette. Old material table was Factory-only. `scripts/eggo-build-preview-palette.py` now decodes all arenas by placement-descriptor bank and palette entry15, generated assets/preview-palettes.js. Native Dragon kind6 leaves0x7fdf, not Factory0x6bff. Outline cache includes arena.

### Rock, injury and water recovery

- Falling rock uses prior body/animation and prior integer camera for OAM. Raw model coordinates remain current. OAM priority2 ties put rock above pickups, held icon and water creature; order corrected. Sprite positions no longer rounded or shifted by invented32px lift.
- ROM0x08012f44..12fa0 creates one splash when rockY+17 crosses waterline; center rockX+16, gap16. Added central NATIVE_WATER enemy splash constants and perflight splashed flag, with actual original splash graphics. The apparent palette mismatch at1257 was a MISSING splash, not bad color.
- A hit cancels an in-progress throw, retaining the pre-handler actor position, and discards held/interrupted inventory into a real loose pickup (native +8,+24, speed4, wait30). Because our hazard dispatch follows pickup pass, its first native motion tick is included at creation. Native state7 commits on contact. No continuation of the cancelled placement.
- State7 ignores support-hold inside full rows. Injury allows horizontal steering; CPU uses preceding directional sample in this handler, player uses current input. Fast/Down acceleration remains available; Up does not float in this state. Camera ends post-throw hold on hit, including hit just after completed placement. Movement retains actual momentum.
- Both CPU and player injury use selected character RAW group5, selector11, step0x4000, fixed mirror. Previous fitted arena-special clips were wrong for selectable opponents. CPU water uses raw group17 selector9 with0x4000 phase and raw carried idle selector2 consuming shared RNG. Clear stale special pose upon release. Player injury also has a true raw animation snapshot.
- Water creature X follows current pre-actor horizontal position while retaining prior vertical/OAM sample. Previously had extra X delay. Creature sprite visibility/counter is finalized AFTER the current foreground camera integration; default model-only sampling remains available. This preserves original bottom-to-top GBA coordinate wrapping for its last visible64px sprite (frame1356), without prolonging visibility.
- Player walk-table selection now observes inventory BEFORE pickup dispatch, like the air-table path. Catching a piece as the seven-frame walk phase wraps must not recolor/select the held table one update early.

## Native coordinates and diagnostics

Model actor to native: X=(egg.x-1)*16, Y=720-egg.y*16, VY=-egg.vy*16/60. Foreground camera=640-view.camera*16. Do not use x-.5; that was an old faulty intro interpretation.

P1 actor0x3bd4, CPU0x4f50: x+0,y+4,vx+0x14,vy+0x18, resourceRoot+0x838, period+0x848, table+0x84c, descriptor+0x850, selector+0x854, phase+0x85c, step+0x860, inventory+0x864, rotation+0x868, flags+0x86c, support+0x870, state/next+0x874/+0x878, outlineValid+0x880, previewQ16 x/y/angle+0x8a0/+0x8a4/+0x8a8, palettepointer+0x900.

Camera roots0x3910/0x4c8c: Q16position+4, integer background-cameraY+0x70. Field roots0xf404/0x10650, camera offset signed16+0xeb8. Camera target floor(actorY)+(offset>>1)-72 clamped0..640. Support probe and animation-ground are different. Default extra look-up key0x02000164 is ZERO, unbound; ordinary Up is jump/float, not camera look-up. Do not restore Up-grounded lookup behavior.

CPUcontroller0x5a40: rotationWait+0xb4, rotationTarget+0xb8, clock+0xc8, direction gates+0xcc/+0xd0, bestScore+0xd8, rotation/column cursors+0xdc/+0xe0, period+0x100, stall+0x104. CPUkeys0xe9a8. Enemy roots0x31038,0x310b8,0x31138,0x311b8: body x/y+0/4, vx/vy+0x14/+0x18, phase+0x20, active/life+0x48/+0x4c, variant+0x50. Particles0x31510,14slots stride0x3c. Native frame0x11a9c, global RNGu16 at0x11aac, perfield RNG0x11ab0/4, wave clock0x329c (NOT0x16c). Arena id0x3294 order Beanstalk/Factory/Dragon/Castle/Pirate/Space/Jungle/Park.

## Open issues / limits

- First remaining original mismatch1914 must be extracted/diagnosed next. Do not jump beyond or skip it.
- No complete first arena, later rounds, full15 levels or initial menus have been validated yet. Boundary110208 is candidate only.
- Later-round persistent animation clocks, Factory fresh-round clock, other arenas' water layer rules, all collision/hazard paths and selectable characters still need evidence from their actual first differences.
- Both old and new frame archives are huge; STREAM them. Never load all decoded memory/video. Keep tests hidden and muted, no desktop clicking or focus theft.


## Additional continuation through October20 03:17 Ljubljana

- Native discard must install idle selector2 for one update, consume its actual RNG step, and then resume airborne selector5. The earlier generic held-intersection test missed a discard followed by catching a DIFFERENT item in the SAME update (original1913: kind6 discarded, kind10 caught). Tower.nativeDiscardedThisTick now records that event and chooses free idle even if a new item is already held.
- The long-replay harness incorrectly treated R/discard as continuously held. Production readPlayerControl uses a pressed edge. Harness now uses held(R)&&!previous(R), just like A/B. This matters at1914, otherwise it immediately discards the just-caught filler. Current first difference is THREE pixels in the loose discarded pickup, not the earlier662-pixel actor pose discrepancy.
- Preview palettes upload white only if the64px OBJ is actually submitted in the viewport. Logical landing position may remain valid far below camera without uploading a palette. Keep last material/initial black until submission. This fixes original1693 after prolonged offscreen preview. VIEW.nativePreviewViewport centralizes cull limits.
- Native edge guard must apply even when an off-tower/swimming bypass is active. Removed arbitrary0.3-cell clamp for native7-column movement; original allows the final step from88 to90 pixels and then blocks at >=89. Physical wall collision must NOT be bypassed merely because a historical offTower flag survives a water rescue. Native bypass is for lightning/swimming/forced rise or dive; ordinary recovered actors hit side walls. This fixes1744 and advances to1881. A trial generic selector8 horizontal lock regressed961 and was REMOVED; do not restore it.
- Selector8 player poses now directly use full raw group16 instead of compact atlas aliases. This was not the cause of1744 (wall bypass was), but raw frames match native descriptor decoding.
- Water creature follows X once more on the final negative-to-positive velocity tick: choose followActorX BEFORE applying fade acceleration. This fixes1641 while retaining prior successful CPU recovery.
- Dragon primary sprite, like rock, uses prior body/animation and prior camera, no invented32px lift. Primary/secondary OAM have priority2 before loose pickups/held/creature, so draw their bodies after those competing sprites. Native model trajectory at1880..1882 already exactly matched RAM; defects were presentation and overlap.
- Player raw injured group5 selector11 mirrors exactly, ignores support hold, and releases postthrow camera hold. Down/fast remains active during injury, Up float is suppressed. Player horizontal input applies current sample; CPU injured handler uses prior sample. This fixes1488..1528.

Latest evidence is `tests/OUTPUT/eggo-long-replay_2026-10-20T01-15-00-012Z/`: original401..1913 match all pixels; frame1914 differs at (14,101),(1,107),(5,111) only. App/native colors respectively [164,80,41]/[222,137,24], [222,137,24]/[255,218,106], [255,218,106]/[222,137,24]. Likely affine angle/source phase of the newly discarded loose kind6 pickup; verify its native OAM matrix/position against nativePickupAngle and sprite source. Original raw segments1912..1916: `scripts/OUTPUT/eggo-round-intro_2026-10-19_23-24-18/`. Cached original PNG1914: `tests/OUTPUT/eggo-long-replay_2026-10-19T21-23-49-116Z/original-1914.png`. Do NOT use the obsolete662-pixel difference image from that older run as the current defect.

The old420-frame golden regression was last checked before these last actor/edge/palette refinements. Rerun once after the next material batch, not after every tiny change.

User explicitly requested a one-time continuation October20 at03:45 Europe/Ljubljana (quota reset03:44:24). Hidden local helper `scripts/eggo-scheduled-resume.py`, config `scripts/OUTPUT/eggo-scheduled-resume_2026-10-20_03-16-41/parameters.json`. Read state.json there for actual dispatch status. One start only,15-second quota checks, no reset credit, no native heartbeat. Do not install a duplicate watcher. Read-only connection check passed with zero model turns started. New source checkpoint path: scripts\OUTPUT\eggo-resume-checkpoint_2026-10-20_03-17-43 .


## Manual continuation October20 04:17 Ljubljana

The scheduled helper failed: App Server rejected thread/resume with already has an active writer. Watcher PID22064 stopped, state marked disabled-after-user-manual-resume. No working scheduled continuation is claimed; user resumed manually.

Production causal fixes in this continuation:
- discardedPickup preserves the held variant when symmetric geometry matches (kind6 variants0/2 differ by three icon texels). Fixes1914.
- Player filler takeoff enters air selector5 directly; clear nativeFillerMotion when native support holds after landing. Fixes1930/1967.
- Placement clears a preceding nativeDiveMotion flag. Fixes2494 postthrow selector.
- Rock animation retains its phase across flights, ROM11e14..11e3e. Fixes2691. RAM enemy+24 is TYPE12, not animation period; do not mistake it for period.
- Injury and swimming do not bypass horizontal wall probes. Forced water rise still bypasses. Fixes2722/2841.
- Swimming forces and creature spawn base read previousWater, not the newly advanced waterline. Fixes2803/2852; difference was one water-rise tick (0.025390625px), eventually crossing an integer camera boundary.
- nativePreview returns null throughout nativeWaterRecovery (state1 can catch an item but +880 stays clear). Fixes2843. Player water poses also use original character resources, identical to previously compact cels on tested frames.
- nativeActorHandlerState records the handler entered before state transitions. Camera input-offset step is skipped for handler4, not merely for held camera/selector8. Fixes3050; postthrow selector8 still runs ordinary offset decay before hold feedback.
- Singleton placement resets nativeActorRotation to0; other shapes retain orientation. Generic reset was tested and REJECTED (regressed907). Fixes3344, CPU rotation wait8ticks late because empty-hand orientation had stayed1.
- Recount incomplete floors after advanceLoosePieces actually moves owners; meter sees changed rows that same update. Fixes3372. The meter friction formula was inspected but NOT changed.
- CPU animation uses nativeAnimationGround on L entry; subsequent dive and ordinary falling off a ledge enter selector5 directly. Fixes3408/3433.
- Dragon spawning uses previousWater for the native reference plane. Fixes3479.
- During a native throw, recompute projected landing from fixed throw-origin coordinates against current board, updating landing/actor target. Recomputing from the moving actor arc was tested and REJECTED (regressed1061). Fixed-origin version passes through3722 and fixes3665 (CPU target raised3rows during action).

Current contiguous evidence: tests/OUTPUT/eggo-long-replay_2026-10-20T02-16-11-598Z/ matches original401..3722 (3322 frames), first mismatch3723 has12pixels at x113..118,y119..121 in player divider progress marker. Native completed count9 by3722; OBJ13 moves y122->119 at3723; app stays old marker for an extra update. Investigate progress-counter timing rather than sprite priority: native OBJ13 overlays OBJ19 correctly. Raw original3719..3727: scripts/OUTPUT/eggo-round-intro_2026-10-20_04-16-39/. Current diagnostic replay adds floors/lines/divider/pending to detailed trace; read latest tests/OUTPUT run.

Targeted regression before the last camera/CPU/throw refinements: all420 old long-direction-jumps frames EXACT, zero differences/16128000pixels. App tests/OUTPUT/eggo-mania-visual_2026-10-20T02-04-12-002Z/, comparator scripts/OUTPUT/eggo-replay-frame-diff_2026-10-20_04-04-45_348567/. Five water-recovery tests passed after actor-force timing change; rerun once after this material batch.

Diagnostics: eggo-audit-round-intro.py now records cpu_keys,cpu_controller wait/target/cursors/stall,actor_rotations. Long replay details now include actorRotation,meters,floors. None of this injects native state.


## Manual continuation October20 11:25 Ljubljana

Current validated prefix before latest bomb-trajectory change: original401..3933, 3533 full RGB565 frames exact, fresh seed1492, no later state injection. Evidence tests/OUTPUT/eggo-long-replay_2026-10-20T09-20-44-563Z/. First3934 difference52pixels at157..178,y0..3 was native projectile covering BG, not a background-stream failure. Native projectile X155 versus app167; native Y514.208 versus app511.833 and diverging speed. ROM044e6..44f2 compares integer Y against saved LAUNCH Y+64 (slot+1c), not opponent landing-height target. Model now stores nativeTravelStopY and uses it; replay pending. Current Y internal model anchor remains720 while renderer uses752; collision anchors need subsequent evidence.

Additional production fixes since previous3723 note:
- Filler completion updates nativeDividerPendingProgress in use(); marker delay now matches3723.
- Track actual nativeActorVelocityX and inherit it when injury drops inventory. Fix3787.
- Injury allows current Left/Right/Down but suppresses Up float from first tick. Remove old CPU-prior-input compensation: real issue was native L/drop bypassing side walls. Native horizontal movement no longer bypasses wall merely because e.dive>0. Preserves1203 and fixes3796.
- Bomb sprite draws use prephysics projectile snapshot, integer floor Y, camera from two prior stages, local per-projectile flame clock advanced before visibility. Projectile priority2 above actorpriority3. Fix3865/3883 bomb pixels. Born-frame submission suppressed.
- Rock +0x72 splash latch is NOT cleared on respawn, like animation; ROM11e18..11e3e preserves it. Removing splashed:false fixes3883 (extra16yellowpixels). A trial prior-position splash probe regressed1257 and was REJECTED; current-position probe retained.
- Held bomb OAM clocks differ by field: delays[2,1] from nativeFrame. P1 original3767clock8/flame0,3768clock9/flame0,3769clock10/flame1; CPU3927clock0/flame2,3928clock1/flame0. Generic delay1 regressed3768 and was REJECTED. Field-specific delay fixes3928 and passes3933. Projectile clocks remain independent.

Raw evidence: original3879..3887 scripts/OUTPUT/eggo-round-intro_2026-10-20_04-31-40/;3925..3930 ..._11-17-51/;3767..3770 ..._11-20-10/;3933..3936 ..._11-21-31/.
Source checkpoint scripts/OUTPUT/eggo-resume-checkpoint_2026-10-20_11-22-45/ includes SHA256 manifest (before last travel-depth fix).
Five targeted water-recovery tests passed again. Old420-frame visual test attempt was cancelled: accidentally overlapped long replay on same CDP9397; both test-owned Electron trees were stopped. Do not run these two harnesses concurrently. No new420-frame result claimed; rerun sequentially after batch.

Correction to the preceding travel-depth diagnosis: slot+1c is NOT raw launch Y. ROM043d4..4414 stores min(launchY,targetY)-64;044e6..44f2 adds64 back. Original3861 slotY480.333, savedreference420.333 because actual launch484.333 has already taken its first -4px update. The first trial +64 threshold was wrong and retained3934; current code uses min(launchY-before-first-step,targetY), in model coordinates. Replay pending.

Latest verified prefix: original401..3961 (3561frames), tests/OUTPUT/eggo-long-replay_2026-10-20T09-26-38-594Z/. Final travel gate includes PLUS first launch displacement4px, not minus; preceding intermediate sign error regressed3863 and was corrected. Native min launch/target -64 +64 gate now fixes3934.
First3962 onepixel(111,140) is CPU water-creature OBJ26 at105,110 overhanging playerfield; native black sprite covers board tile. Renderer previously only drew each creature in its own field. Current change paints both creatures in each field clip with SOURCE camera, CPU thenplayer order; replay pending.
420-frame independent regression successfully rerun sequentially: app tests/OUTPUT/eggo-mania-visual_2026-10-20T09-27-19-422Z/, comparator scripts/OUTPUT/eggo-replay-frame-diff_2026-10-20_11-28-14_228589/:420/420 fullimages exact, zero different/16128000pixels. Actors,keys,cameras,hazards,pickups,RNG exact too. This was before last foreign-creature-overhang change.

Creature overhang fix passes through3985. First3986 flame mismatch was incorrect bomb contact: model collision converted projectile Y using actor720 origin while sprite/native use board752. advanceNativeBomb now consistently uses752 to/from model Y; map probe45-floor(Y/16) then matches native+c88 layout. Travel stop likewise stored in native752 origin, target remains720-liftY16. Replay401..3987 exact3587frames. First3988 largeCPU mismatch is earlier AI Use at3987; nativeCPUkeys0 versus appuse. Incoming projectile AI conversion had the SAME stale720 origin. Changed game.js incoming Y to752; current replay pending. Native3984..3988 bomb Y639.708,639.583,639.583,639.708,639.958, velocities-.125,0,.125,.25,.375. Raw scripts/OUTPUT/eggo-round-intro_2026-10-20_11-30-03/.

CPU3988 diagnosis refined: native panicTimer(+f8)3984..3988=4,3,2,1,1; app expired3987, one tick early, then even-frame Use. Original3988 odd nativeFrame3589 defers. Actual source is CPU scanning current/post-player-physics projectile instead of prephysics slot; first flightCounter -1->250 transition started panic one update early. Game AI now reads player.nativeRenderProjectiles snapshot (same prephysics slots as OAM) with correct752 Y. Replay pending. Do not alter nativeToolDecision panic behavior without further evidence; reviewed ROM6db4..6e54 agrees with existing parity gate.

Prephysics projectile scan fixes premature CPU Use:401..3989 exact3589frames, tests/OUTPUT/eggo-long-replay_2026-10-20T09-33-00-231Z/. Original3990 difference128pixels nearP1projectile, notCPUactor. Physical P1bomb Y/velocity EXACT3984..3990. Render OAM body3990y137 derives native3988Y639.958 minus camera3988=502; app used3989Y640.333, onepixel lower. ROM045f4..460a captures screenY BEFORE rebound integration046a6, but AFTER initialflight044e6..457a. Added nativeSpriteY sample in advanceNativeBomb: incomingY if wasLanded, updatedY otherwise. Renderer reads sample, AI retains physical snapshot. Replay pending. Raw3990 scripts/OUTPUT/eggo-round-intro_2026-10-20_11-33-49/. Harness detailedtrace now adds projectileCameras.

Projectile rebound screen sample fixes3990; first4009 after3608exactframes401..4008. tests/OUTPUT/eggo-long-replay_2026-10-20T09-36-44-460Z/. Source checkpoint scripts/OUTPUT/eggo-resume-checkpoint_2026-10-20_11-37-47/ includes current code hashes.
4009 difference1255pixels CPU128..175,y100..147 initially looked like explosion particles, but nativeBG2 pixel148,100 is white boardtile descriptor3; noexplosionOBJ there. Native tile3 andmap remainedunchanged4008..4009; appremovedboardcells alreadybecauseP1bombexplodes beforeCPUupdate snapshots rows. BothnativeBGmaps queued before eitherfieldattack. updateTower now capturesCPUboard at player-update entry and uses it forCPUrender snapshot, thenconsumes. Also preserves board snapshot onCPUstall ticks without nativeMotion. Replay pending. Do not hack explosion atlas frame tofix this; actualparticleatlasfirstframeempty wascorrect. Raw scripts/OUTPUT/eggo-round-intro_2026-10-20_11-37-36/.

BG snapshot fixes4009. Blast hit must use shared injury0xf634, preserving velocity, instead generic knockOff kick; fixes CPUphysics/camera4010. Remaining4010 diff1781pixels includes actualblaststars+boarddamage. Nativebomb explosion was incorrectly approximated by immediate whole-owner square radius1 + a fixed128px composite atlas. ROM3ff4..416e:13-cell radius2 diamond (outeredges onlycenter); innercross5 clearindividualcells3950; outer8 floodconnectedowner3a64. Nativecenter towerrow=46-floor(projectileWorldY/16), so use floor(b.y), not floor(b.y-.5). Added native branch with exact traversalorder (columnsascending, worldrowsascending =>towerrowsdescending), shared type3 particle allocation pervisitedcell (evenempty).
Nativepool type3 draws16x16 stars ROM0x80dbcfc,5frames/5ticks,25ticklife. Extracted new assets/native-blast.png from ROM and nativeOBJpalette2. Reproducible extractionparameters scripts/OUTPUT/eggo-burst-art_2026-10-20_11-43-01/parameters.json. Renderer now handles type3 in shared nativePickupParticles, old composite retained onlylegacywidths. Current replay pending. Nativepool4010 type3slots4,8..13 (sevenexistingtoolstars occupyothers), positions(128,640),(144,624),(144,656),(160,608),(160,640),(160,672),(176,624); mustmatchcapacity/order too.

First nativeblast implementation reduces4010 difference1781->193pixels (allboarddamage nowexact). Remaining stars were poolallocationorder: ROM4094..409a skips allocation for the FOUR inner-arm cells, emitting only center+outer8. Fixed particle emission when Manhattan distance!=1. Replayed pending. Correct earlier note:13cells damage,9potentialeffectallocations, not13allocations. Nativepoolfirst7positions now expected exact.

Blast phase cel=floor(age/5), visibleage1..24; allocation reuses type3slotsatage>=25. This matches4014after prior(age-1)/5 wasoneframetoo late. Verified401..4023 exact3623frames, tests/OUTPUT/eggo-long-replay_2026-10-20T09-46-33-333Z/. First4024diff14pixels at96..97,y22..29: nativeOBJ33 bomb wins OBJ34rock. Pixelprobe showsappbombcorrectblack thenrockoverwritesit. Movedprojectilepainting afterrock/primary/factorysecondary, retainingafteractors/held. Replaypending. Native raw scripts/OUTPUT/eggo-round-intro_2026-10-20_11-46-19/.

Projectile-vs-rock order fix passes4024. Latest prefix401..4030 exact3630frames, first4031 differs3125pixels bbox97,86..239,159: CPUwater rendering/splashes, while CPUactorcoordinates,velocity,camera STILL EXACT. Nativewater720 through4029 then719.974609@4030,719.949218@4031; nativeactor4031x2,y734.143859,vy6.421722. AppCPU4031x1.125,y-.883991,vy-24.081459 translatesexactly. Investigatewaterlayers/particleallocation, notactorphysics. Current harness addsCPUwaterlevel/previous2/offset, sharedparticles andCPUrows to detailedtrace. Newrunpending. Raw scripts/OUTPUT/eggo-round-intro_2026-10-20_11-47-51/. Earliercommentary describingwatercauseisnotyetconfirmed.

4031 refinement: nativeCPUwater first rises4030 whereasmodel first4031, one tick late. CPUrow1 partial[0,3,1,1,1,1,6] through4029 becomesfull[7,1,1,1,1,6,6] after destruction4030. Water clamp runs before advanceCollapse and sees obsolete partialrow; native0x08019910 sees updatedmap. Current patch saves unclamped nativeWaterlineCandidate then re-evaluates row clamp afteradvanceCollapse, beforeplacements; no actor-force samplingchange. Replaypending. Detailedtracewithwaterlevels tests/OUTPUT/eggo-long-replay_2026-10-20T09-49-05-010Z/.

Rechecking clamp aftercollapse fixes4031; first4032 now780pixels exactlywater-warning icon168..198,y116..147 presentappbutabsentnative. this.nativeWaterWarning was still computed from pre-collapse partialrow, unlike newlycorrectwaterline. Patched warningRow/nativeWaterWarning afterreclamp, also updates warningRow laterdefeat logic. Pendingrun. Latestprevious tests/OUTPUT/eggo-long-replay_2026-10-20T09-50-39-497Z/ prefix401..4031 exact3631frames.

Waterclamp+warning fixes pass through4082 (3682consecutiveframes), tests/OUTPUT/eggo-long-replay_2026-10-20T09-51-49-302Z/. Fivewaterrecoverytests rerun allpass afterwaterchanges. First4083diff405pixels is earlyP1catchofCPUbomb:appcaught4082,original4083. Native4082actorY450.681,projectileY482.72;4083actor455.68,projectile482.595. ROM049ec strictabs(floor(projectileY)-16-floor(actorY))<14 andabs(floor(localProjectileX)-8-floor(actorX))<14. Genericcatchintervalwaswrong. Patched nativeTrajectorycatchcondition toexactintegerbox; pendingreplay. Nativeoriginal4083heldbombfuse88. Raw scripts/OUTPUT/eggo-round-intro_2026-10-20_11-52-40/.

Exact bombcatch box fixes4083; first4084diff529pixels P1actor+heldbomb. Nativecatch4083 switches air tablepointer toheld0x083f229c without extra phaseadvance; appremainsfree2294 because CPUprojectilecatch runs after P1advanceNativePlayerPose. Added nativeProjectileCaughtThisTick and CPUupdate-end refreshofP1selector5airtable only (phaseunchanged; rendered snapshotstillfree forcatchframe). Native4083phase0x2000,4084phase0x4000, selector5both. Replaypending. First4084 native cached tests/OUTPUT/eggo-long-replay_2026-10-20T09-53-31-525Z/.

Catchpose fix advances to4091(prefix3690exactframes401..4090). First4091diff827CPUonly, notP1rethrow. NativeCPUx24@app28; nativeAIclock332stall2@app348stall0. Native4074 brieflycatcheskind5duringcreaturecarry,4075searchesfirstcandidate thenlosesinventory; candidatecursorcolumn1,scorestill-9999,stall18. Appgatedsearchonactorstate0 only, skippedstate1carry. ROM7054..70aa checks INCOMING bestscore==sentinel andarms18wait BEFOREevaluatingcandidate, regardlessimprovement. Patchedsearch guardstate!=4 andhalf-squarewaitwheneverpreviousBestsentinel(noimprovementcondition). Replaypending. Raw4055..4090 scripts/OUTPUT/eggo-round-intro_2026-10-20_11-58-17/;4089..4093 ..._11-55-48/. Do notpatchCPUactorpicture: motion/AIwasactualcause. Addedcaughtairtablepointerrefreshdoesnotchangephaseandpassed4084.

Search state1+sentinelwait fixes4091; prefix401..4094 exact3694frames. First4095diff20pixels onlyP1newbombflame. Native visualslot +1098+28 clock persists after destruction:4008=4,4009=4,4010=4,4091(rethrow)=5,4092=6,4093=7. Appreset0 eachlaunch. Added persistent t.nativeProjectileFlameClocks array pervisualslot; gameadvancesallactivebombANDhammer slots (ROM1b250 incrementsforboth), launchinheritscounter. Pendingreplay. Existing1tickdisplay pipeline isunchanged: launchframehidden, nextOAMsnapshotusespriornativeclock. Raw4093..4097 scripts/OUTPUT/eggo-round-intro_2026-10-20_12-00-20/.


## October21 continuation after Gemini

Gemini progressed without updating these notes. Latest pre-resume report tests/OUTPUT/eggo-long-replay_2026-10-20T23-44-11-283Z/: 8289 exact frames401..8689, first8690. Source hashes all match current production. Fresh independent run tests/OUTPUT/eggo-long-replay_2026-10-21T00-11-31-668Z/ confirms SAME prefix and same mismatchhash. Seed1492, original start400, noStopfalse, videoOffset0, no later state injection. Backup before edits scripts/OUTPUT/eggo-after-gemini-backup_2026-10-21_02-11-29/ with allsourcehashes. User estimates8000; actual boundary8690.
Native raw8687..8693 scripts/OUTPUT/eggo-round-intro_2026-10-21_02-12-24/. First8690diff1160pixels bbox23,44..223,100, CPUandplayerposes. NativeCPU throw finishes8690:selector8,state4, Y576,VY-3.5, then8691state0frozen,8692Y572.5. ModelCPUphysicalY576/VY-3.5 matches8690 butpose staysgroup16frame2 because updateResult passed{} (no nativeMotion), so native rival animation never advances and genericphysics takesoverlater. Fixed updateResult CPUcontrolnativeMotiontrue inSurvival plusnativeFreezeActor forstate4->0transition, stillafterResulttrue; pendingreplay. Playernative rescue state2 usesselector7 but currentGemini view code storesselector5 +movingtable; investigate actualfirstremainingpixels afterCPUfix.

October21 result-overlay fixes (verification in progress): CPU keeps nativeMotion and throw recovery during updateResult; first rerun reduced8690 from1160 to749 differing pixels, all remaining pixels were WIN/LOSE letters, NOT player rescue pose. Result initialization incorrectly integrated once at finish(); ROM13fb0/140e0 only initialize. Removed that extra glyph tick: fresh run tests/OUTPUT/eggo-long-replay_2026-10-21T00-16-19-577Z/ matches401..8691 (8291exact), first8692diff258pixels. Raw RAM31254 confirms glyph0 initialized8688, firstintegrated8689, OAM8690 uses8689 glyph position (134,51). Native player rescue physical coordinates and pose already match; do NOT arbitrarily change its selector5 storage to7.
At8692, 256diffpixels are a missing loose I pickup at68,75; 2diffpixels are CPU actor across divider. Diagnostic eval tests/OUTPUT/eggo-long-replay_2026-10-21T00-20-25-783Z/: app had caught kind1 while actorstate2 rescue (native inventory remains-1). ROMbae2..bafa blocks loose catches for states2,3,4,7. Existing code only blocked4. Added exact blockedstate predicate retaining existing4->0transition exception. Renderer drawOtherActor was wrongly gated toplaying; removedphasegate because actors continue during result. Pending fresh replay. Pixel-probe run ...00-18-44-994Z/ and raw8687..8693 are available.

Catch-state fix removes all256 loose-pickup pixels; first8692 remains only2pixels at121,122/126,122. Divider diagnosis supersedes the earlier CPU-overhang guess: native actor+934 floor count stays7 through8687..8693, while app updateTower continued recounting and displayed8 after the final throw committed. Native water cap has transparent corners, exposing the wrong green progress bar4px too high. Freeze nativeDividerProgress/Pending during afterResult (ROM03020 is only active-play accounting). Pending replay. Result CPU motion/pickup catch changes retained. drawOtherActor phase restriction was independently incorrect for result-period cross-field OBJ, but wasn't the2pixel cause.

Counter freeze passes8692; fresh ...00-23-56-260Z/ matches401..8695 (8295exact), first8696diff355P1pose pixels. Raw8694..8700 in scripts/OUTPUT/eggo-round-intro_2026-10-21_02-24-58/. Native rescue animation phase starts0x2000 at8688, app0x4000. Reset rescue selector-entry phase to0 before addingone step. Fresh ...00-27-11-933Z/ passes8696, first8699 (8298exact401..8698). Source animation handlerEAEC..EBFE reads sp(dx),sp+4(dy), which rescueDC28 leaves as TARGET deltas, NOT post-attraction body velocities. Gemini's abs(vx)/vy selection and mirror test were wrong when vx becomes0 on reversal. Added body.animationDx/Dy in native-rescue.js, selector7 proper support in nativePlayerAnimationPose; select state dy>0?(dx!=0?9:7):(dx!=0?13:11), mirror dx>0. Keep phase when selector7, initial0. Native table22a4 through8699, changes2284 at8700 when targetdy reverses. Pending fresh replay. This supersedes previous note discouraging selector7 change: now ROM handler and actual first mismatch establish the reason.

Selector7 target-delta correction matches401..8704 (8304exact), first8705, tests/OUTPUT/eggo-long-replay_2026-10-21T00-28-42-082Z/. Raw8701..8710 scripts/OUTPUT/eggo-round-intro_2026-10-21_02-29-40/. First8705 is arrival pose mirrored wrong: native OAM55a1=d01b (Hflip), including8703..8706; rawselector10 table83f2324group21 phase2000at8704. Selector10 does not rewrite+844 flipflag. Store nativePlayerRescueMirror in selector7 and return it in selector10 pose, preserving last approach direction uponarrival. Pendingreplay.

Arrival flip fixes through8843 (8443exact) in ...00-30-29-370Z/. First8844fade starts2ticks too early and uses canvasalpha (34527offgridpixels). Raw8843..8846 ...eggo-round-intro_2026-10-21_02-31-31/ confirms palette unchanged through8845, firstfade8846 (31/32 floorchannels); IO blend unchanged. Added entryDelay2 to outgoingfade, replacedalpha with5bitpostfade. Fresh ...00-32-29-255Z/ passes8844,8845 (8445exact), first8846diff3093onlyCPUlava pixels. This proves palette fade must run BEFORE hardware alpha, not on completed framebuffer. Implemented fade context for result interval only: drawImage uses sourcepalette5bitfade, waterblend sources faded withsamelevel beforecompositing; no whole-framepostfade. Cache onlyone currentlevel perimmutableART and perpixelarray, weakkeys, mutablegeneratedcanvasesnotcached. Initial countdownfadeunchanged. Pendingfreshreplay. Prefix401..8845 remains last independentlyverified.

Source-palette fading passes401..8872 (8472exact), first8873only11pixels at155..158,123..131 (CPUlava) tests/OUTPUT/eggo-long-replay_2026-10-21T00-34-27-424Z/. Native layer decode158,123: BG3priority1color3,0,0 +OBJ48priority2color3,3,3 ->blend3,0,0, app2,0,0. Existing late-water compositor detects OBJ via RGBdifference from baseline; nearblack, sourceOBJ and alreadyblendedbackground quantize tosameRGB, so it wronglyskipsreblend. Added transient alpha-coverage tracking for lower-priority drawImage sprites ONLYduring resultpalettefades (normalgamepath unchanged), preserving transforms; latewaterpass usescoverageinsteadRGBdifference. Pendingfreshreplay. Raw8872..8875 ...eggo-round-intro_2026-10-21_02-35-26/.

REJECTED coverage-tracking trial: ...00-36-55-660Z/ retained EXACTsame8873hash; nochange. Removed tracking completely. Probe ...00-38-05-093Z/pixel-probe.json gives actualcause: pickup208x64 atlas paints24,24,24 at158,123, then416x32bomb-explosion overwritesit8,0,0; latewater blends to16,0,0. Native OAM48pickuppriority2 color3,3,3, explosionOAM52priority3 behindit. Existing explosionloop AFTERpickups waswrong. Moved explosiondraw beforeactors (priority3, laterOAMindexthanactors) andbeforepickups. Pendingreplay. Earlier claim aboutpaletteequalitywasunproven andnotcause; do notrestoretracking.

CORRECTION:416x32 probe source is dragon-enemy.png, NOTbomb-explosion (checkedallassetdimensions). Explosiondraw-ordertrial ...00-39-20-580Z/ retainedsame8873hash; REVERTEDexplosionmove. Native OBJ52palette14priority3 is PRIMARY DRAGON, behindpickup48priority2 andactor50/51priority3. Appprimarydragon renderedafterpickups, overwriting11pixels. Movedprimarydragonloop beforeactor; secondaryrockretained existinghigherpriorityposition. Pendingfreshreplay. Do notclaimexplosionorderingfixedfromthisevidence.

REJECTED primarydragonreordertrial ...00-40-20-858Z/ regressed1882; RESTOREDoriginalpriorityorder. Rawnative8872..8875 actually has NO active dragon: CPU310b8+48=0,+4c=185unchanged, X/Yremain13.203/652.770, whileappdragonactive/newspawnat8873. Native OAM52 was NOT dragon (coords120,48size64 vsapp141,111size32); neverinferobjectidentityfrompriorityalone. Rootcause: app advanced enemyrespawn clocks beneathresult, original frozeat185. Raw8687..8693CPUlife185constant; appcountsdown184at8688..180at8692. AddednativeHazardsFrozen forafterResult or eitherfield'srescuebody; gateenemyRNGreservation, enemyadvance andcontactcenters. Rescuesetduring8688beforehazards, so185retained. Normalplayingdragonorderunchanged. Pendingfreshreplay. Allcoverage/explosion/dragonlayerorderingtrialsfullyreverted; sourcepalettefadeandactualearlierfixesretained.

Hazardfreeze fixes8873andfulloutgoingfade; ...00-41-44-017Z/ matches401..8910 (8510exact), first8911incomingpodium. Raw8907..8915 ...eggo-round-intro_2026-10-21_02-42-26/: nativeDISPCNT0at8907, podiumloaded8909butblackthrough8913, firstvisible8914step2/32. Nativeglobalcounter8509stalls8909..8912, reset1at8913. Currentincomingfadefirstvisible8911,3ticksearly. AddedPODIUM_VIEW.podiumLoadTicks3 toincomingfadeandpodiumPoseanimationclock (musicTick226alreadyaligns8913). Pendingfreshreplay. Fulloutgoingpaletterenderverifiedall32levels throughblack. Nativeglyph/actor/resultcounterfixesretained; allspriteorderingtrialsremoved.

Podiumload3 fixes8911..8913: ...00-43-28-710Z/ matches401..8913 (8513exact), first8914only753actorpixels. Native8914spriteOAM2x88y1 matches rawYolko group1 idlecel0 EXACT(alpha+fadedcolor), not any oldpodium-win-actorcel. Raw8913..8975 ...eggo-round-intro_2026-10-21_02-45-31/. Idleheldthrough8944fadecompletion;8950rawgroup19cel1,8960cel3,8970cel6,8975cel7 => winstart8945,4ticks/cel. Old14cel56tickpodiumatlas actually contains rawgroup19frames[15,2,3,...14], missing0and1. AddedYolko nativewin rendering: rawgroup1cel0 duringfade; fullrawgroup19period16 begins localpodiumtick38 (entryDelay2+load3+fade32+1),frameTicks4,x88y1. Othercharacterscustomwin/lossrenderretained. Pendingfreshreplay. PODIUM_VIEW newgraphicsconstantscentralized.

Nativeidle/fullwinloop correction matches401..8948 (8548exact) ...00-47-27-223Z/, first8949. OAMdelay+1trial ...00-48-34-517Z/ REGRESSED8945; revertedwinOamDelay. Important: first8949 was NOT verifiedaspose! NativeIWRAMpalettedims8950..8960, and tapeAedge8948. Replay harness was suppressing ALL isActionJustDown, including resultconfirmation, so it ignoredAandnevercouldadvancetosecondround. Fix harness maps place/continue to tapecontrol.use (sameAedge; no stateinjection). Production next-round confirmation previouslycalledstartRoundimmediately, whereas original acceptsA8948, fadesout8949..8980, then arena3starts8981. AddedresultExitTicks initializednull; confirmsets-1, currentupdate0, subsequentupdates1..32fade,33startRound; mainpaletteopacitymultipliesexitfactor. Pendingfreshreplay. Nativewinanimationstarts8945asoriginalcode; previousrawsamples8950/8960matchthatclock. Do notintroduceextraOAMdelay.

Result-confirmation/fadeout trial ...00-51-02-133Z/ did not stop forpixeldifference before newround, but crashed in diagnostic trace when newplayer.nativeRenderFrame is undefined on firstnewroundtick. Fixed trace optionalchaining (snapshot/clock); freshreplaypending. No parityextensionclaimedfromcrashedrun. This confirms why full-input replaymustcovermenus aswellas readPlayerControl.

Freshresult/harnessrun ...00-52-01-763Z/ matches401..8982 (8582exact), first8983newroundloading. Native8979..9000 ...eggo-round-intro_2026-10-21_02-52-50/ and9001..9040 ...02-53-23/: newround8981butDISPCNT0 andinitstalls through9009; firstactiveintroframe9010native2palette0, firstvisible9011native3. AddedNATIVE_INTRO.roundLoadTicks28 forsubsequentSurvivalrounds; freeze countdownupdates8982..9009, bg3GlobalFrame0rendersblack. Initialfreshroundfixtureunchanged. Fresh ...00-54-55-462Z/ matches401..9010 (8610exact), first9011visiblearena2, globalRNG51345vsnative41337.
RNGdiagnostic ...00-54-55-462Z/eval-out.json vsnative8680..8910trace ...02-54-15/ EXACTRNGmatches8680,8687,8688,8690,8700,8750,8800,8850,8900,8906 (60333). Native8907=2921,8908=22463, appstopsat60333. Nativecounter8509stops8909, model8507stops8907. Nativeactorsstillupdate2finaltickswhileDISPCNTalreadyblack. ChangedupdateResultactorstop fromresultTicks>=roundTicks220 to>=roundTicks+entryDelay222; outputrenderpodiumstarts220unchanged. Thiscausallypreserves2RNGsteps fornextarena; noexternalresync. Pendingfreshreplay.

Final2actorsteps yield correct next-round visibleRNG59527 (native9010/9011same59527), ...00-55-57-007Z/ first9011stillbutchangedhash. Native prefillRNG41337before9010 was NOT comparisonphase59527; nowseedhandoffmatcheswithoutresync. First9011diff8239pixelsCPUfieldonly125..239; P1allpixelsmatch. Raw9010..9014 ...eggo-round-intro_2026-10-21_02-56-47/ nativebothcamera(previous10,current7), appP1previous10/7butCPUprevious18/7. NativebothactorY88inCastle fixedvessel, appinitialCPUanchorY96 causedfirstcamera18 andsharedCPUbackgroundscrollwrong. FixedstartRoundanchorsforfixedCastle/Spaceboat from nativeRescueBoat+target (Castle43,88both) insteadgenericmovingboat NATIVE_INTRO.bodies. ThisalsoletsinitialCPUcontrollerplanfromcorrectactorlocation. Pendingfreshreplay. InitialDragonroundanchorsunchanged.

FixedCastle/Spaceinitialanchors passes9011through9197: fresh ...00-58-27-495Z/ matches401..9197 (8797exact), first9198diff504pixelsbothboxedcloudtools (notplayerLEFTmovement). Native9198cloudOAM26/30 matrix[254,-30,29,254], modelnativePickupAffineMatrix(190)=[230,110,-111,230]. Nativematrixmatchesframe178mod60; previousroundlivebg3clock8508 +current190=8698mod60=58=>exactmatrix. Tooloscillator clock survivesroundreset whereasnativeFrame resets. AddednativePickupSwayFrameOffset cumulativepreviousbg3GlobalFrameatstartRound forround>1,0onround1; setperTower; applyoffsetin bothgamepre-updatecrate snapshotsandmodellivecrateclocks. Initialroundunchanged. Raw9196..9202 ...eggo-round-intro_2026-10-21_02-59-28/. Pendingfreshreplay; initialfixed-vesselbodyalsofixesCPUintroAIcontrols natively. Note allmatrix/behaviorchangesneedliveprefixvalidation, noframe-specificresync.

Toolphasecarrytrial bg3offset8508 reduced9198diff504->108 (...01-01-30-589Z/). Correctcarryincludeshiddenroundsetuptick: previousplayer.nativeFrame8509, notbg38508. Changedoffsetaccumulationto oldplayer.nativeFrame. Fresh ...01-02-38-207Z/ matches401..9210 (8810exact), first9211onlyP1sprite767pixels. Native9210P1x41pixels vsapp43; CPUalready41both. NativeLEFTheldsince9198countdown, butappnativePlayerPrimed=false discardsdirectionsfirstregularactorupdate9210. MarknativePlayerPrimed=true afteradvanceCountdownFrame, retainingunprimedguardforsyntheticstartsthatskipcountdown. Native9210selector5tablemovingfallphase2000, appfreefallbecausemovementdiscarded. Raw9209..9214 ...eggo-round-intro_2026-10-21_03-03-31/. Pendingfreshreplay.

Playerprimingfix passes401..9277 (8877exact), first9278CPUheldIiconrotatedearly, ...01-04-46-104Z/. Raw9276..9282 ...eggo-round-intro_2026-10-21_03-05-36/. Native9276target0wait12,currentrotation3; appwait0,rotates9277to0. Native9010..9014target0wait15 (newcontrollercleared), appretainedaiRotationTarget3frompreviousround anddecrementedrotationgatewhileemptyduringcountdown. AddedaiRotationTarget=0 atstartRound; nativeinitialrotation0sameastargetso15waitpreserveduntilfirstheldpiece. Pendingfreshreplay. Initialroundtargetundefined->0shouldnotchangemovement; replaychecksallprefixagain.


October21 morning continuation: CPUrotationtarget reset passes401..9303 (8903 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T01-07-01-089Z/. First9304 is3pixels on thrown OBJ29, NOT player actor. Raw9302..9308 scripts/OUTPUT/eggo-round-intro_2026-10-21_03-07-53/: bank13 retains initial ROM palette at0xdce90 through9304; material appears9305. Outline was culled before first throw, so it never uploaded white. Renderer formerly assumed black/white for every pending throw palette. Extended eggo-build-preview-palette.py with all material palettes and ROM initial OBJ palette, maps source RGB back to palette indices during pending initial throw. Source-art only; no game-state injection. Generated scripts/OUTPUT/eggo-preview-palette_2026-10-21_10-21-17_255395/. Fresh full replay passes401..9363 (8963 exact), ...08-21-41-891Z/.

First9364 has38 differing pixels x0..111,y157..159. Raw scripts/OUTPUT/eggo-round-intro_2026-10-21_10-22-46/: surface OAM24/25 y140; decoded all32x112 pixels exactly match Castle atlas50..53 on9361..9363 and54..57 on9364..9367. Model actor counter356+stage phase9 gives5, but native shared old-round8509 offset gives54. Wave clock, like loose-tool sway, survives round reset. Applied existing per-tower nativePickupSwayFrameOffset to water body/surface/CPU BG3 animation clocks. Fresh replay pending. No geometry/timing compensation or frame-specific patch.


Global water phase correction passes401..9459 (9059 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T08-24-28-481Z/. CPU BG3 water phase was also updated to the same carried counter after that run had loaded; next run covers it. First9460 is176 outline pixels x80..95,y111..142. Raw scripts/OUTPUT/eggo-round-intro_2026-10-21_10-26-49/: bank13 retains material entry15=0x7ffb through9460; actual white palette appears9461. App wrongly kept initial paletteColor0 despite completed first throw. game.updateTower now clears initial-color override when placing.ticks>=3 (material upload), preserving material kind for the first later outline. No change to first-throw pending palette timing. Fresh replay pending.


Material override fix passes401..9675 (9275 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T08-28-07-458Z/. All three water clocks included in this run. First9676:17 pixels x0..4,y0..4, NOT background/palette. Native BG1 and static ring match; pixel probe ...08-32-03-655Z/pixel-probe.json shows extra castle-secondary.png draw at(-37,-59). Native raw ...eggo-round-intro_2026-10-21_10-29-43/ has no ghost OAM9676; first ghost OAM9677 x=-38,y=-59, from prior body x=-37.207,y542.391 and prior camera601. ROM0x08011678..116ec culls global x[-63,239], y(-64,160), submits prephysics signed integers. App used rounded postphysics body/current camera. Renderer now uses previous body/prior foreground camera, exact integer truncation, native culling, and model captures previousActive for first/last live OAM. Atlas cel0 compares all4096 RGBA pixels EXACT with decoded native9677 after proper RGB565 green expansion; no baked mirror correction needed for this left flight. Fresh replay pending. Do not mistake phantom sprites for background map failures.


Thief previous-body/culling fix passes401..9710 (9310 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T08-36-10-600Z/. First9711 only5 pixels x85..86,y68..71: native ghost OAM26 priority2 at27,25 covers actor OAM43 priority3 at73,46. App drew ghost before actor, so actor black overwrote native ghost darkgreen. Moved castle thief draw after actor and loose pickups, before higher-priority water creature. Its OAM is allocated before all those priority2 pickups, so wins ties. Native raw ...eggo-round-intro_2026-10-21_10-39-19/. Fresh replay pending.

Diagnostics optimization: capture.frames accepts optional first/last, seeks through existing JSONL keyframe offsets to nearest preceding independent compressed frame, then decodes exact XOR chain. Full replay default unchanged. extract-frame and audit-round-intro use range. Verification against old sequential decoded raw9672..9681: all video hashes and every memory segment byte-identical; parameters/results in scripts/OUTPUT/eggo-capture-seek-verification_2026-10-21_10-41-57. Ten-frame query now ~0.5sec instead of decoding all prior9671frames. This changes diagnostics only, no emulator/game inputs/timing/state.


Thief priority fix passes401..9731 (9331 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T08-41-17-363Z/. First9732 six pixels atCPUleftedge x128,y90..95 are P1 ghost OAM28 (x69,y41,size64), crossing the divider. Renderer previously clipped each thief to its source field. Now paints both field ghosts in each clipped viewport, retaining source camera and global x, CPUfirst/P1last to preserve native OAM tie order. Added native horizontal reflection from bodyX>actorX per0x080116d2..116ec; left atlas source already unmirrored. Fresh ...08-43-06-908Z/ passes401..9823 (9423 exact), validating left/right spawn and divider overhang.

First9824 has243 pixels x142..157,y70..85: extra newly stolen icon drawn beneath CPU ghost. Native CPUinventory becomes-1 on9824 andghostlife50 (same as model), but OAM was prepared before theft so stolen icon first appears following update. Added previousStolen snapshot in advanceCastleSecondaryMotion alongside previousActive/body/animation; renderer uses snapshot rather than live post-theft held item. Raw ...eggo-round-intro_2026-10-21_10-44-22/. Fresh full-prefix replay pending.


previousStolen fixes9824; fresh ...08-45-17-599Z/ passes401..9824 (9424 exact), first9825 only2 pixels at154..155,y65. Native ghost OAM25(x118,y2,size64,priority2) covers its stolen icon OAM26(x142,y65,size16,priority2) on their shared row. Icon artwork/variant matches native exactly; difference was ordering. Paint stolen icon before ghost body (Canvas painter order opposite OAM). Native raw still ...10-44-22/. Fresh replay pending.


Stolen-icon depth fix passes401..9962 (9562 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T08-47-57-107Z/. First9963:9 pixels x151..170,y151. Pixel probe ...08-49-57-222Z/ confirms extra cloud canvas at128,135, not water/background. Native cloud OBJ24 at131,135; raw target field10650+f78=0x115c8 containsX3 andY632. App cloud uses attacker pre-movement x2.046875 -> origin0 instead of native postmovementx2.1875 -> origin3. Atuse9959 native attacker bodyX19 vsprior16.75. ROM0x080041b4 reads current actorX and subtracts16; exact prefix shows movement+action dispatch issue. Native Use already defers pieces/filler until after motion, but cloud branch was immediate. Added deferredCloudUse for native controls so cloud creation/column uses postmovement position. Other tools unchanged. Native raw ...eggo-round-intro_2026-10-21_10-48-52/; disassembly ...eggo-instructions_2026-10-21_10-52-31_842354/. Fresh replay pending. No preview-culling/water/render-camera changes were made based on the initial visual speculation.


Cloud postmovement fix passes401..10139 (9739 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T08-53-23-213Z/. First10140:12 pixels x206..216,y149..151 during CPUwaterrelease. Native creature OAM27 at177,144 priority2, atlas cel6 exact; native actor OAM37 at178,115 priority3. Native pixel211,149 blends water with creature black, app looks like water+actor purple. Need actual pixel probe before deciding whether creature frame/position or compositor. Raw ...eggo-round-intro_2026-10-21_10-54-27/. No speculative water/preview changes applied.


10140 actual pixel probe ...08-55-40-174Z/ shows actor draw then water blend, with no creature coverage on12 pixels. Model creature render cel3 vsnative cel6. Native creature root30eb8 P1 /30ef8 CPU +38 animation counters persist across arena loading: native8687 and8908 and9010/9014 have[40,70], thenCPU10135=72,10139=76,10140=77. App reset counter0 on new Tower and had7 at10140. ROM0x08013af4 spawn clears flags but NOT+38;0x08013d42 increments only after visible OBJ allocation (Y<=200). Existing visibility rule matches. Added nativeWaterCreatureInitialCounter from previous Tower's live counter atstartRound forround>1; freshSurvival resets0. Native-water lazy creature initializer reads it. No hardcoded phase/seed resync. Source checkpoint10-56-26 preserves pre-change validated prefix. Fresh replay pending, with read-onlycounter snapshot9010/10140.


Creature counter carry passes401..10428 (10028 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T08-58-47-448Z/. Read-only eval confirms initial[40,70] at9010 andCPU77/rendercel6 at10140, exactly native. First10429:15 pixels x235..239,y156..159. Native shark OBJ26 at206,152, affine[23,254,-255,23], palette5; source64px phase1 matches native VRAM/alpha all4096pixels; matrix helper exactly matches native. App pixel probe ...09-02-04-962Z/ shows NO shark draw; app shark stillinactive life70 while native alreadyactive. Do not change artwork, matrix or water compositor.

Native9010frame2 primarylife1414 =>initial1416, while modelconstant1480 was firstHard difficulty5 only. ROM0x080025de..2604 passes primary life1800-(config.primary<<6) into0x08010888;0x08002608..262c passes secondary1200-(secondary<<6). Confirmed constructor0x0801098c stores thirdargument intoentity+4c. Added central RULES.nativeEnemyInitialWait and config-dependent initial timers for all primary/secondary entities. Firstarena primary5/secondary9 remain1480/624. Secondarena primary6 becomes1416. Fresh replay pending. There may still be warning-gate timing: model70 minusinitialdifference64 leaves6ticks while native alreadyactive, so check new result before assuming complete fix. Native10424..10434 raw ...eggo-round-intro_2026-10-21_11-00-08/; actual ROM init ...eggo-instructions_2026-10-21_11-08-08_248009/. Native warning at120 checks0x02003bb8+side*0x137c minus120 againstactorY; model currentlyuses current waterline minus120, which may need separate prior-waterline phase evidence.


Config-dependent initial enemy timers pass401..10431 (10031 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T09-08-57-665Z/. CPU shark position/velocity/angle/phase at10429 EXACT with native. No additional warning-gate fix was needed: moving the120 boundary64ticks earlier also changes its waiting interval correctly. Discard earlier speculation about extra11 frozen frames; native warning reference is760, same as model.

First10432 only3 pixels at227,y157..159: native shark OAM26 priority2 covers loose pickup OAM30 priority2; app painted pickups after shark. Moved primary castle/pirate fish draw after pickups/actor/creature, preserving its earlier native OAM priority. Both source fields are painted CPUfirst/P1last with source cameras so affine body may crossdivider, analogous to confirmed thief overhang. Atlas/matrix remain unchanged. Native raw ...eggo-round-intro_2026-10-21_11-00-08/frame-10432.*. Fresh full-prefix replay pending.


Primary fish OAM depth/overhang fix passes401..10436 (10036 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T09-11-08-325Z/. First10437:394 CPUactor pixels x191..216,y70..103. NativeCPUx/inputs/physics still exact. Raw ...eggo-round-intro_2026-10-21_11-12-38/: selector3 stopped-walk phase6/6.25 on10434/10435; RIGHT10436 entersselector4 phase0x4000,10437phase0x8000. Model had no selector3: it kept selector4 while idle, so resumingwalk did not reset phase and displayed lastcel6 instead ofnewwalkcel0. Added rivalAnimationSteps3(period7,step0x4000), stoppedwalkselects3, rawresource selector3uses samewalkgroup3/4, resume4 triggers existingreset/step. Phase wrapping/RNG idle entry unchanged. Fresh replay pending.


Rival stopped-walk selector3 fix passes401..10725 (10325 exact), tests/OUTPUT/eggo-long-replay_2026-10-21T09-14-32-695Z/. First10726:872 P1actor pixels x0..27,y41..89; allpositions/velocities still exact. Raw ...eggo-round-intro_2026-10-21_11-15-28/: throw completes10724(selector8phase0x3c000,state4,next0), freezehandoff10725 entersselector3phase0x4000,10726 resumesselector5phase0x2000. Appstaysselector8/group16 for17ticks. TrialcancelpostthrowonANYhorizontalinput regressed960 (...09-19-37-845Z/) and was COMPLETELY REVERTED. Counterexample native956..962 ...eggo-round-intro_2026-10-21_11-20-33/: same RIGHT+A butfacingalreadyright, retainsselector8. Actualdifference10725 is facingREVERSAL: oldfaceleft, RIGHTheldthroughthrow; native+844 changes0->1 onfreezehandoff,then0nextair. First960 oldfacealreadyright. NewtrialturnAfterThrow onlywhen sign(move) differs from pre-update nativeRenderFrame.facing, state0 andpostthrowclock>0; clearsclock andselects3(one turnaroundcel). Fresh replay pending. Camera currentlyhas independent18tickpostthrowhold; if turnfixpasses10726 butcamera divergesfollowingframe, native selector3 should endthatcamera hold too, withonephase delayed currenthold asusual. Do not restore ANY-horizontal trial.


Second postthrow trial (turnAfterThrow based on control direction vsmodel nativeRenderFrame.facing) regressed1081, tests/OUTPUT/eggo-long-replay_2026-10-21T09-21-36-256Z/. Fully reverted too. Native counterexample1078..1084 raw scripts/OUTPUT/eggo-round-intro_2026-10-21_11-23-19/:1080 x24,rotation3,flags0x10000,mirror0,selector8;1081 x26,flags0x10100,selector8. Failing10725 x-8,rotation0,flags0x10001,mirror1,selector3. Model-facing reversal is not sufficient evidence of native turnaround. Both speculative trials removed; every current production JS/JSON/PNG SHA256 exactly equals validated run ...09-14-32-695Z/ (10325 exact frames). No replay is currently running. Continue with actual ROM selector/input dispatch, do not restore either heuristic trial.

## October21: retained throw inputs, camera selector, repeated thief, pickup/contact order

- Original10726 (872 actor pixels): +86c/+86d are retained directional input bytes, not sprite facing. The state-4 handler skips their updates and the support byte+870. At10725 the state0 handoff uses retained ground/left to install selector3 at phase0x4000 (ROM0x0800e7dc..e850); at10726 airborne support enters selector5. Added `nativeActorInputMove` and `nativeActorSupportAtHandler`, sampled only in the ordinary movement handler. This avoids both rejected blanket interruption trials that regressed960/1081. Raw `...11-34-03/` records the retained flags through the entire throw.
- Original10727: camera still held despite selector3, shifting15290pixels. Player camera now samples the pre-animation-handler selector from nativeRenderFrame.animationClock, holding only for selector7/8 or action-handler4, per0x08004974..4992. CPU fallback retains its existing tracker. Run `tests/OUTPUT/eggo-long-replay_2026-10-21T09-37-14-824Z/` matches401..11087.
- Original11088: six CPU ghost pixels atx239,y0..5. Native OAM25/atlas/mirror/body/camera all correct; app chose phase2, native3. Type13 respawn bypasses the type6-only+20 reset at0x08011f60..fcc; both animation accumulators persist. Removed the erroneous animation0 assignment in advanceCastleSecondaryMotion. Native source cell1 and3 identical, confirmed all4096pixel masks/colors against captured OAM. Next run `...09-42-44-427Z/` matches401..11124.
- Original11125:256pixels were a prematurely stolen icon, not an ordinary held-icon delay. Native catches kind7 at11124 and retains it; app immediately let the Castle ghost steal that fresh inventory. Native enemy phase precedes pickup dispatch (also established by the shared RNG ordering evidence); record `nativePickupCaughtThisTick` and exclude that inventory from the later-applied Castle contact. On the following tick the actor has left the ghost's strict hit box. Raw `...11-43-50/`; read-only inventory/ghost snapshots `...09-44-58-163Z/eval-out.json`. Fresh run `...15-02-24-193Z/` matches401..11145.
- Original11146 cloud: read-only snapshots `...15-05-29-466Z/` show app lightning.pending1 on11145 while original state remains0. ROM0x0801af88..afc2 calls0x080049ec with integer X/Y and strict radius20. App used continuous tiles. Correcting integer-coordinate distance is currently under replay validation. No frame-index condition, screenshot substitution or state injection was introduced.

### Cloud integer test accepted; Castle swimming-steering phase under validation

- Cloud integer-pixel correction is covered by fresh run `tests/OUTPUT/eggo-long-replay_2026-10-21T15-07-04-694Z/`, exact401..11242. App/native11146 body and injury timing now agree. No extra timer or early/late hit exception.
- First11243 discrepancy is320 shifted CPU thief pixels (x222..239,y63..115). Diagnostic renderer probe attributes it to castle-secondary, not water creature or actor. Native CPU thief previousY700.0447, app699.6947; X, animation/clock and actor/camera positions exact. Current patch feeds nativeWaterCameraY into Castle steering, matching the factory secondary's already-established pre-carry sampling. Trace logger now includes CPU castle and thief states so these investigations do not require a separate evaluation replay.

### Castle recovery steering and OBJ priorities accepted; independent stolen icon culling

- `...15-10-07-766Z/` accepts the integrated swimming-Y steering correction through11243. Native/app CPU thief positions now exactly match (including Q16 fractional values) throughout11239..11244. First subsequent difference11244 is one pixel at224,110.
- At11244 native OAM27 Castle thief (priority2) paints [0,1,0]; later OAM28 water creature (also priority2) has opaque black there. Native earlier index wins. Moved water-creature painting before the Castle-thief loop; primary fish still paint after both, matching their earlier OAM. Full replay `...15-11-51-602Z/` accepts through11395.
- At11396 original independently submits the stolen icon even though thief-body OAM is culled above the screen. Shared icon code0x08011a28..11aa2 runs after the body branch regardless of body visibility. Renderer now submits previousStolen outside the body viewport test, before painting any visible body. Raw`...17-12-51/` and pending fresh test provide the next resume point.

### Independent icon, primary animation and waterline phase accepted

- Stolen-icon independent culling accepted through11617 by `...15-13-34-446Z/`. First11618:13 pixels x144..159,y159 were not a board-atlas error. Render probe `...15-18-27-091Z/` shows the correct cyan tile painted, then overwritten by the wrong shark animation. Raw source sprite checks: native OAM texture exactly matches atlas cel0, app used4. Type0/9 respawn must retain animation +20/+28, as the same ROM0x08011f60 type6-only reset branch shows. Removing reset accepted through11672 by `...15-20-15-808Z/`.
- First11673:72 fish pixels. All motion X, velocities, angle, matrix and animation agree, but compare Q16 Y **after converting to pixels**: native641.025726 vs app640.996429 on11672, constant difference0.029296875 throughout flight. This is exactly one unblocked waterline-rise tick. New flight used current waterline instead of the enemy phase's preceding waterline; first flight's clamped760 hid it. `advanceCastle` now uses previousWater, accepted through12116 by `...15-30-30-350Z/`. No coordinate epsilon, frame exception or fitted pixel offset added.
- Native audit utility now emits pixel-unit enemy coordinates/counters and waterlines alongside raw actor data, to expose these subpixel differences directly. Test trace also includes CPU Castle primary/secondary state.

### Placement-specific completion effects (under validation)

Native12116 (CPU throw commit): global first-completed-row0x2030ea4 becomes0; native particle slots7..13 remain inactive despite the full-row scan count changing. App incorrectly allocated seven row stars (x4..100,worldY660) on that commit. Their first OAM display is12117, causing103 pixels acrossx132..235,y151..158. The first completed row from current piece insertion was correctly absent in the model, but complete(completedRow:null) defaulted its spark source to a scanned completed row. Gate emitSparks and allowBonus with the actual insertion result; count/score/board scan remain intact. Native0x0800e40e..e416 is the explicit zero-record branch. Production guard now under replay validation, so the17-34-17 checkpoint predates it.

### Placement-specific effects accepted; newly-created bonus owner scan under validation

- `tests/OUTPUT/eggo-long-replay_2026-10-21T15-36-17-818Z/` accepts emitSparks/allowBonus gating through13345 (12945 exact consecutive frames).
- First13346 differs1394 CPU pixels. Native13345 completes2 rows (+0x2030ea4=36,+0x2030ea8=2), bonus art appears at row13. Model creates owners37..40, then its same-update loose scan of row13 moves them to12. Owner40's overlap launches CPU prematurely (vy18.75 vs native13.125) although positions still match for the current throw/handoff. Restricting the late-applied scan to pre-update owners preserves native ordering without moving the existing hazard/collapse/placement phases. `advanceLoosePieces(ownerLimit=Infinity)` retains direct-call behavior; native Tower.update snapshots nextOwner at entry. Pending validation from fresh seed, no frame-specific exception.


October22 later continuation: palette trial ACCEPTED by `tests/OUTPUT/eggo-long-replay_2026-10-22T17-34-32-947Z/` (24407 exact401..24807, first24808). New pending24808 trial:3pixels at0..1,y83..84. Read-only native OAM decode proves missile OAM26(origin-62,53) priority2 covers actor OAM44(origin-15,47) priority3; source pixel red[31,1,1] vs actorblack. Pixel renderer drew missile BEFORE actor. Moved Space-secondary draw after actors/pickups/water-creature, preserving earlier-OAM enemy priority and both-field overhang, using CPU-then-player paint order. Also ignore transparent palette entry0 in recolor detection, so only Spacekind3 creates a recolored source. Evidence `eggo-round-intro_2026-10-22_19-36-58/layer-priority-audit.json`; quickstates17-36-59-637Z. Fresh full replay currently running (after19:39, newest parameters). Need accept/reject from report, update top resume and save current verified checkpoint. Prior backup17-46-49 prefix24274 remains unchanged.


October22 continuation at19:45: missile ordering trial ACCEPTED, `tests/OUTPUT/eggo-long-replay_2026-10-22T17-39-35-657Z/` verifies24813 exact401..25213, first25214(1030pixels bbox199..239,y53..84). It is NOT a Space enemy: native OAM24 decodes exactly as cloud-phases cel0. P1 uses cloud again on25214. Native global cloud OAM already contains the OLD cloud atorigin197,53,counter215, while native field state is overwritten to new counter286/origin-16,632. Model overwrites target's cloud before its target-Tower advance, losing old OAM. Quickstates `eggo-model-state_2026-10-22T17-44-46-737Z/` show old x6.359375,y4.5,counter215 at25213, camera595 =>(197,53), then modelrenderCounter287 skipnew at25214. PENDING patch retains nativeReplacedCloudDisplay when target.nativeFrame<attacker.nativeFrame (P1->CPU before target advance), consumes once in advanceClouds; old renderCounter is its prior counter. CPU->P1 already retains the rendered old cloud because P1 advanced earlier. Current full fresh replay started19:45, limit110000, stopsfirstdiff. Raw `eggo-round-intro_2026-10-22_19-41-54/`, ROM create41B4 /advance1ADD0 instructions `eggo-instructions_2026-10-22_19-43-14_597485/` and19-43-23_277854. Existing hit-phase logic unchanged; old-cloud strike during a replacement remains a possible unverified phase edge, investigate only if evidence demands it. Need save new verified checkpoint after pending test finishes, top resume still older prefix24274. Do not roll back accepted palette/missile/handoff fixes.
