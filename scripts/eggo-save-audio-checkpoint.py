"""Preserve portable production/audio sources, assets and evidence hashes."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[1]
previous=ROOT/'scripts/OUTPUT/eggo-performance-audio-checkpoint_2026-10-26_09-58-54Z/parameters.json'
paths={ROOT/p for p in json.loads(previous.read_text(encoding='utf-8'))['source_sha256']}
paths.update(p for p in (ROOT/'renderer/games/eggo-mania').rglob('*') if p.is_file() and 'OUTPUT' not in p.parts)
paths.update(p for p in (ROOT/'scripts').glob('eggo-*') if p.is_file() and p.suffix in ('.py','.mjs','.ps1'))
paths.update(p for p in (ROOT/'scripts/native-audio').rglob('*') if p.is_file())
paths.update([ROOT/'EGGO_REPLAY_STATUS.md',ROOT/'tests/eggo-mania-audio.test.mjs'])
paths.update([ROOT/'tests/eggo-native-audio-engine.test.mjs',ROOT/'tests/fixtures/eggo-audio-native-prefix.json',ROOT/'sites/eggo-mania/prepare.py'])
paths.update([ROOT/'tests/eggo-human-match.test.mjs',ROOT/'sites/eggo-mania/source-manifest.json',ROOT/'sites/eggo-mania/.openai/hosting.json'])
out=ROOT/'scripts/OUTPUT'/('eggo-native-audio-checkpoint_'+datetime.now(timezone.utc).strftime('%Y-%m-%d_%H-%M-%SZ'));out.mkdir(parents=True)
hashes={}
for src in sorted(paths):
 if not src.exists():continue
 relative=src.relative_to(ROOT);dst=out/relative;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dst)
 hashes[relative.as_posix()]=hashlib.sha256(dst.read_bytes()).hexdigest()
P={'created_utc':datetime.now(timezone.utc).isoformat(),'source_sha256':hashes,
   'live_audio_engine':'Original-rule Survival: compiled original timing context + native platform in Worker. Model-driven shared-channel VM retained for custom rules, online matches and anticlockwise extension.',
   'full_production_worker':'scripts/OUTPUT/eggo-program-worker_2026-10-27T02-59-34-583Z',
   'full_production_player':'scripts/OUTPUT/eggo-program-player_2026-10-27T10-00-06-622Z',
   'final_proof_index':'scripts/OUTPUT/eggo-sound-verification_2026-10-27T10-29-39_370308Z',
   'final_prefix_regression':'scripts/OUTPUT/eggo-program-worker_2026-10-27T03-45-23-255Z',
   'cold_http_site':'scripts/OUTPUT/eggo-http-audio_2026-10-27T03-32-16-952Z',
   'published_site':'scripts/OUTPUT/eggo-site-audio-publish_2026-10-27_10-28-29Z/deployment.json',
   'sound_events':'scripts/OUTPUT/eggo-sound-comparison_2026-10-26T20-17-04_456149Z',
   'portable_driver':'scripts/OUTPUT/eggo-portable-audio_2026-10-26T21-07-16-538Z',
   'actual_worker_pcm':'scripts/OUTPUT/eggo-pcm-stream-comparison_2026-10-27T02-48-28_431023Z',
   'hardware_pcm':'scripts/OUTPUT/eggo-audio-hardware-comparison_2026-10-26T15-40-15_969795Z',
   'sparse_asset':'scripts/OUTPUT/eggo-sound-driver-extract_2026-10-26T19-33-58-670Z',
   'resume':'scripts/native-audio/README.md','tests':'22 audio/network tests; full108676-frame CURRENT production player+Worker proof with59621888 exact stereo samples and zero gaps; actual player/WebAudio prefix exact; fresh600-frame visual prefix exact'}
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8')
print(json.dumps({'out':str(out),'files':len(hashes)}))
