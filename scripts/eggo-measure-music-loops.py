"""Locate candidate music repetitions in retained, native NO SFX captures.

Spectral agreement is evidence for a phrase repeat, not proof of a seamless
sample loop. Keep all measurements for subsequent native sequencer checks.
"""
from pathlib import Path
from datetime import datetime
import argparse, csv, hashlib, json, wave
import numpy as np
from scipy.signal import find_peaks, fftconvolve

ROOT = Path(__file__).resolve().parents[1]
PARAMETERS = {
    'profiles': [
        {'arena': 'castle', 'source': 'scripts/OUTPUT/eggo-reference_2026-10-03_17-46-16_900821/factory-music-only'},
        {'arena': 'park', 'source': 'scripts/OUTPUT/eggo-reference_2026-10-03_17-49-23_772224/yolko-factory-music'},
    ],
    'fft_samples': 1024, 'hop_samples': 512, 'bands': 32,
    'minimum_lag_seconds': 4, 'maximum_lag_seconds': 40,
    'minimum_comparison_seconds': 8, 'peak_spacing_seconds': 1,
}
parser = argparse.ArgumentParser()
parser.add_argument('--profiles', help='JSON list of arena/source pairs')
parser.add_argument('--maximum-lag', type=float)
args = parser.parse_args()
if args.profiles:
    PARAMETERS['profiles'] = json.loads(args.profiles)
if args.maximum_lag:
    PARAMETERS['maximum_lag_seconds'] = args.maximum_lag
out = ROOT / 'scripts/OUTPUT' / ('eggo-music-loops_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
out.mkdir(parents=True)
rows = []; summaries = []
for profile in PARAMETERS['profiles']:
    source = ROOT / profile['source']
    path = Path(str(source) + '.wav')
    metadata = json.loads(Path(str(source) + '.json').read_text(encoding='utf-8'))
    assert metadata['writes'] == []
    with wave.open(str(path)) as stream:
        rate = stream.getframerate()
        pcm = np.frombuffer(stream.readframes(stream.getnframes()), dtype='<i2').reshape(-1, 2)
    mono = pcm.astype(np.float64).mean(axis=1)
    frames = np.lib.stride_tricks.sliding_window_view(mono, PARAMETERS['fft_samples'])[::PARAMETERS['hop_samples']]
    power = abs(np.fft.rfft(frames * np.hanning(PARAMETERS['fft_samples']), axis=1)) ** 2
    edges = np.unique(np.geomspace(1, power.shape[1], PARAMETERS['bands'] + 1).astype(int))
    features = np.stack([np.log1p(power[:, a:b].mean(axis=1)) for a, b in zip(edges[:-1], edges[1:])], axis=1)
    features -= features.mean(axis=0)
    features /= np.maximum(features.std(axis=0), 1e-6)
    frame_rate = rate / PARAMETERS['hop_samples']
    maximum = min(round(PARAMETERS['maximum_lag_seconds'] * frame_rate), len(features) - round(PARAMETERS['minimum_comparison_seconds'] * frame_rate))
    profile_rows = []
    # FFT autocorrelation avoids repeatedly scanning the whole recording for
    # every possible lag. Prefix energy gives each lag its exact denominator.
    products = fftconvolve(features, features[::-1], mode='full', axes=0).sum(axis=1)[len(features)-1:]
    energy = np.concatenate(([0], np.cumsum(np.sum(features * features, axis=1))))
    for lag in range(round(PARAMETERS['minimum_lag_seconds'] * frame_rate), maximum + 1):
        correlation = float(products[lag] / np.sqrt(energy[-lag-1] * (energy[-1] - energy[lag])))
        row = {'arena': profile['arena'], 'lag_samples': lag * PARAMETERS['hop_samples'], 'lag_seconds': lag / frame_rate, 'spectral_correlation': correlation}
        profile_rows.append(row)
    peaks, _ = find_peaks([r['spectral_correlation'] for r in profile_rows], distance=round(PARAMETERS['peak_spacing_seconds'] * frame_rate))
    candidates = sorted((profile_rows[i] for i in peaks), key=lambda r: r['spectral_correlation'], reverse=True)[:8]
    summaries.append({'profile': profile, 'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'duration_seconds': len(pcm) / rate, 'candidates': candidates})
    rows.extend(profile_rows)
(out / 'parameters.json').write_text(json.dumps(PARAMETERS, indent=2) + '\n', encoding='utf-8')
(out / 'measurement.json').write_text(json.dumps({'measurements': summaries, 'limits': 'Whole-capture correlation can include result music; verify each candidate against in-game frame/state and sequencer position before using it as a loop.'}, indent=2) + '\n', encoding='utf-8')
with (out / 'correlations.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
for result in summaries:
    print(result['profile']['arena'], result['candidates'][:3])
print(out)
