"""Build only the original mGBA audio hardware as portable WASM; no ROM included."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib, json, subprocess
ROOT = Path(__file__).resolve().parents[1]
P = {'upstream_commit': '70ed83c',
     'sdk': 'scripts/.tools/wasi-sdk-27.0-x86_64-windows',
     'source': 'scripts/.tools/mgba-audio-source/mgba-70ed83c',
     'sources': ['src/gba/audio.c', 'src/gb/audio.c', 'src/core/timing.c', 'src/third-party/blip_buf/blip_buf.c'],
     'bridge': 'scripts/native-audio/mgba-audio-bridge.c', 'memory_limit_bytes': 16777216,
     'exports': ['eggo_audio_init','eggo_audio_write','eggo_audio_advance','eggo_audio_pcm','eggo_audio_read','eggo_audio_output',
                 'eggo_audio_state_buffer','eggo_audio_ram_buffer','eggo_audio_state_size','eggo_audio_restore','eggo_audio_trace_mode','eggo_audio_clock',
                 'eggo_audio_lateness_buffer','eggo_audio_set_lateness','eggo_audio_mix_buffer','eggo_audio_mix_count','eggo_audio_pcm_debug_buffer',
                 'eggo_audio_manual_mode','eggo_audio_manual_sample','eggo_audio_manual_fifo',
                 'eggo_audio_bootstrap_buffer','eggo_audio_bootstrap','eggo_audio_mute_psg','eggo_audio_clear_pcm']}
out = ROOT / 'scripts/OUTPUT' / ('eggo-audio-hardware-build_' + datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'))
out.mkdir(parents=True)
source = ROOT / P['source']
inputs = [ROOT / P['bridge']] + [ROOT/'scripts/.tools/mgba-audio-source/70ed83c'/f if f=='src/gba/audio.c' else source/f for f in P['sources']]
diagnostic=out/'audio-diagnostic.c'
diagnostic.write_text(inputs[1].read_text(encoding='utf-8').replace('\tsampleRight = _applyBias(audio, sampleRight);','\tsampleRight = _applyBias(audio, sampleRight);\n extern void eggo_audio_diagnostic_mix(int,int,int,int); eggo_audio_diagnostic_mix(sampleLeft,sampleRight,audio->chA.sample,audio->chB.sample);',1),encoding='utf-8')
inputs[1]=diagnostic
P['source_sha256'] = {str(f.relative_to(ROOT)): hashlib.sha256(f.read_bytes()).hexdigest() for f in inputs}
command = [str(ROOT / P['sdk'] / 'bin/clang.exe'), '-O3', '-DDISABLE_THREADING', '-D_GNU_SOURCE', '-I', str(source / 'include'),
           '-ffunction-sections', '-fdata-sections', '-mexec-model=reactor', '-Wl,--gc-sections', '-Wl,--max-memory=' + str(P['memory_limit_bytes'])]
command += ['-Wl,--export=' + f for f in P['exports']]
command += [str(f) for f in inputs] + ['-lm', '-o', str(out / 'audio-hardware.wasm')]
P['command'] = command
(out / 'parameters.json').write_text(json.dumps(P, indent=2), encoding='utf-8')
result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
(out / 'build.log').write_text(result.stdout + result.stderr, encoding='utf-8')
print(json.dumps({'out': str(out), 'exit_code': result.returncode}))
print(result.stderr[-7000:])
raise SystemExit(result.returncode)
