"""Keep live-playback, sequencer and hardware evidence explicitly separate."""
from pathlib import Path
from datetime import datetime,timezone
import argparse,hashlib,json
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--driver',required=True);args=parser.parse_args()
def read(p):return json.loads((ROOT/p).read_text(encoding='utf-8'))
P={'driver':str(Path(args.driver)),
   'live_pcm':'scripts/OUTPUT/eggo-pcm-stream-comparison_2026-10-26T21-23-30_747577Z',
   'hardware_pcm':'scripts/OUTPUT/eggo-audio-hardware-comparison_2026-10-26T15-40-15_969795Z',
   'events':'scripts/OUTPUT/eggo-sound-comparison_2026-10-26T20-17-04_456149Z',
   'scope':'Survival frames401..109076; original recorded input tape, seed1492; diagnostic hardware timing is not the live audio path.'}
driver=read(Path(P['driver'])/'comparison.json');dp=read(Path(P['driver'])/'parameters.json')
live=read(Path(P['live_pcm'])/'comparison.json');hardware=read(Path(P['hardware_pcm'])/'comparison.json');events=read(Path(P['events'])/'summary.json')
source=dp.get('sourceParameters',{})
expected=(dp.get('end') or source['end'])-dp.get('initialFrame',source.get('start_after'))
files=['renderer/games/eggo-mania/game.js','renderer/games/eggo-mania/audio.js','renderer/games/eggo-mania/native-sound-vm.js',
       'renderer/games/eggo-mania/native-audio-engine.js','renderer/games/eggo-mania/native-audio-worker.js',
       'renderer/games/eggo-mania/native-audio-player.js','scripts/eggo-check-native-audio-engine.mjs','scripts/eggo-profile-render.mjs']
P['source_sha256']={f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest()for f in files}
report={'driver':driver,'driver_expected_frames':expected,'driver_complete_match':driver['firstMismatch'] is None and driver['matched']==expected,
        'sound_requests':events,'hardware_with_original_timing':hardware,'current_native_worker_playback':live,
        'live_bit_exact':live['exactMatchOverCommonSamples'],
        'important_limit':'Native worker is ACTIVE. Its actual Web Audio output first differs at sample308294, native frame962. Sound RAM matches the entire recording, but this does not establish mixed-output parity. A GBA IRQ adds two CPU relative cycles during an audio callback batch, shifting the next sampling deadline. Native intra-frame register times also remain unmodeled. No native timing stream or subsequent states are injected into production.'}
out=ROOT/'scripts/OUTPUT'/('eggo-sound-verification_'+datetime.now(timezone.utc).strftime('%Y-%m-%dT%H-%M-%S_%fZ'));out.mkdir(parents=True)
(out/'parameters.json').write_text(json.dumps(P,indent=2),encoding='utf-8');(out/'verification.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'out':str(out),'driver_complete_match':report['driver_complete_match'],'matched_driver_frames':driver['matched'],'live_bit_exact':report['live_bit_exact']}))
