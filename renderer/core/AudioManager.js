/**
 * AudioManager — Simple Web Audio API wrapper.
 *
 * Provides:
 *  • playBeep(freq, duration)  – procedural beep (for reaction-time game)
 *  • playTone(freq, duration, type) – any oscillator waveform
 *
 * Future: loadSound / playSound for file-based audio.
 */
export class AudioManager {

    constructor() {
        /** @type {AudioContext|null} */
        this._ctx = null;
        /** @type {Map<string, AudioBuffer>} */
        this._soundBuffers = new Map();
        /** @type {Map<string, Promise<AudioBuffer>>} */
        this._soundLoads = new Map();
        /** @type {Map<string, AudioBuffer>} */
        this._tetrisImpactBuffers = new Map();
    }

    /** Lazily create AudioContext (browsers require user gesture). */
    _ensureCtx() {
        if (!this._ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            try {
                this._ctx = new AudioContextClass({ latencyHint: 'interactive' });
            } catch (_error) {
                this._ctx = new AudioContextClass();
            }
        }
        // Resume if suspended (autoplay policy)
        if (this._ctx.state === 'suspended') {
            this._ctx.resume();
        }
        return this._ctx;
    }

    /**
     * Prepare the low-latency output path and short procedural buffers while a
     * user gesture is still active, rather than on the first gameplay impact.
     */
    warmUp() {
        const ctx = this._ensureCtx();
        this._tetrisNoiseBuffer(0.072, 4.2);
        this._tetrisNoiseBuffer(0.048, 5.4);
        return ctx.state === 'suspended'
            ? ctx.resume().catch(() => {})
            : Promise.resolve();
    }

    /**
     * Play a simple sine-wave beep.
     * @param {number} [freq=800]       Frequency in Hz.
     * @param {number} [duration=0.15]  Duration in seconds.
     * @param {number} [volume=0.4]     Volume (0–1).
     */
    playBeep(freq = 800, duration = 0.15, volume = 0.4) {
        this.playTone(freq, duration, 'sine', volume);
    }

    /**
     * Play a procedural tone.
     * @param {number} freq       Frequency in Hz.
     * @param {number} duration   Duration in seconds.
     * @param {OscillatorType} type  'sine'|'square'|'sawtooth'|'triangle'
     * @param {number} volume     Volume 0–1.
     */
    playTone(freq, duration, type = 'sine', volume = 0.4) {
        const ctx  = this._ensureCtx();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type            = type;
        osc.frequency.value = freq;
        gain.gain.value     = volume;

        // Quick fade-out to avoid click
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration + 0.01);
    }

    /**
     * Play a short UI click sound.
     */
    playClick() {
        this.playTone(1200, 0.04, 'sine', 0.15);
    }

    playTetrisRecovery(volume = 0.2) {
        if (!(volume > 0)) return;
        const ctx = this._ensureCtx();
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((frequency, index) => {
            const start = ctx.currentTime + index * 0.065;
            const oscillator = ctx.createOscillator(), gain = ctx.createGain();
            oscillator.type = 'sine'; oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(Math.min(1, volume) / notes.length, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
            oscillator.connect(gain); gain.connect(ctx.destination);
            oscillator.start(start); oscillator.stop(start + 0.32);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        });
    }

    /**
     * Short filtered impact resembling a light plastic counter landing on a
     * plastic board. It deliberately contains noise and a low transient rather
     * than a sustained pitched beep.
     */
    playPlasticImpact(volume = 0.34) {
        const ctx = this._ensureCtx();
        const now = ctx.currentTime;
        const duration = 0.075;
        const samples = Math.max(1, Math.ceil(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < samples; index++) {
            const progress = index / samples;
            data[index] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 3.6);
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1150, now);
        filter.Q.setValueAtTime(0.8, now);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(Math.max(0.001, volume), now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        source.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        const body = ctx.createOscillator();
        const bodyGain = ctx.createGain();
        body.type = 'triangle';
        body.frequency.setValueAtTime(235, now);
        body.frequency.exponentialRampToValueAtTime(145, now + 0.055);
        bodyGain.gain.setValueAtTime(Math.max(0.001, volume * 0.42), now);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        body.connect(bodyGain);
        bodyGain.connect(ctx.destination);

        source.start(now);
        source.stop(now + duration);
        body.start(now);
        body.stop(now + 0.065);
    }

    /** Soft, low plastic contact for the first supported Tetris frame. */
    playTetrisLanding(volume = 0.28) {
        this._playTetrisImpact({
            volume,
            duration: 0.072,
            filterType: 'lowpass',
            filterFrequency: 720,
            filterQ: 0.65,
            noiseMix: 0.42,
            noiseDecay: 4.2,
            bodyStart: 122,
            bodyEnd: 72,
            bodyMix: 0.48,
        });
    }

    /** Shorter, sharper mechanical snap for committing a Tetris piece. */
    playTetrisLock(volume = 0.36) {
        this._playTetrisImpact({
            volume,
            duration: 0.048,
            filterType: 'bandpass',
            filterFrequency: 1650,
            filterQ: 0.9,
            noiseMix: 0.78,
            noiseDecay: 5.4,
            bodyStart: 245,
            bodyEnd: 128,
            bodyMix: 0.3,
        });
    }

    _playTetrisImpact({
        volume,
        duration,
        filterType,
        filterFrequency,
        filterQ,
        noiseMix,
        noiseDecay,
        bodyStart,
        bodyEnd,
        bodyMix,
    }) {
        const level = Math.max(0, Number(volume) || 0);
        if (level <= 0) return;
        const ctx = this._ensureCtx();
        const now = ctx.currentTime;
        const buffer = this._tetrisNoiseBuffer(duration, noiseDecay);

        const noise = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const noiseGain = ctx.createGain();
        noise.buffer = buffer;
        filter.type = filterType;
        filter.frequency.setValueAtTime(filterFrequency, now);
        filter.Q.setValueAtTime(filterQ, now);
        noiseGain.gain.setValueAtTime(Math.max(0.001, level * noiseMix), now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);

        const body = ctx.createOscillator();
        const bodyGain = ctx.createGain();
        body.type = 'triangle';
        body.frequency.setValueAtTime(bodyStart, now);
        body.frequency.exponentialRampToValueAtTime(bodyEnd, now + duration);
        bodyGain.gain.setValueAtTime(Math.max(0.001, level * bodyMix), now);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        body.connect(bodyGain);
        bodyGain.connect(ctx.destination);

        noise.start(now);
        noise.stop(now + duration);
        body.start(now);
        body.stop(now + duration + 0.004);
    }

    _tetrisNoiseBuffer(duration, decay) {
        const ctx = this._ensureCtx();
        const key = `${duration}:${decay}`;
        const cached = this._tetrisImpactBuffers.get(key);
        if (cached) return cached;
        const samples = Math.max(1, Math.ceil(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < samples; index++) {
            const progress = index / samples;
            data[index] = (Math.random() * 2 - 1) * Math.pow(1 - progress, decay);
        }
        this._tetrisImpactBuffers.set(key, buffer);
        return buffer;
    }

    /** A dry, compact drum hit used identically for playback and player taps. */
    playDrumHit(volume = 0.62) {
        const ctx = this._ensureCtx();
        const now = ctx.currentTime;
        const body = ctx.createOscillator();
        const bodyGain = ctx.createGain();
        body.type = 'sine';
        body.frequency.setValueAtTime(165, now);
        body.frequency.exponentialRampToValueAtTime(64, now + 0.052);
        bodyGain.gain.setValueAtTime(Math.max(0.001, volume), now);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.068);
        body.connect(bodyGain);
        bodyGain.connect(ctx.destination);

        const samples = Math.ceil(ctx.sampleRate * 0.032);
        const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let index = 0; index < samples; index++) {
            const progress = index / samples;
            data[index] = (Math.random() * 2 - 1) * Math.pow(1 - progress, 4.5);
        }
        const attack = ctx.createBufferSource();
        const lowPass = ctx.createBiquadFilter();
        const attackGain = ctx.createGain();
        attack.buffer = buffer;
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 1250;
        attackGain.gain.value = volume * 0.5;
        attack.connect(lowPass);
        lowPass.connect(attackGain);
        attackGain.connect(ctx.destination);

        body.start(now);
        body.stop(now + 0.072);
        attack.start(now);
        attack.stop(now + 0.034);
    }

    /**
     * Fetch and decode a short sound once so later playback has low latency.
     * Repeated requests for the same id share one promise.
     */
    loadSound(id, url) {
        if (this._soundBuffers.has(id)) return Promise.resolve(this._soundBuffers.get(id));
        if (this._soundLoads.has(id)) return this._soundLoads.get(id);

        const request = fetch(url)
            .then(response => {
                if (!response.ok) throw new Error(`Could not load sound ${url}: ${response.status}`);
                return response.arrayBuffer();
            })
            .then(data => this._ensureCtx().decodeAudioData(data))
            .then(buffer => {
                this._soundBuffers.set(id, buffer);
                this._soundLoads.delete(id);
                return buffer;
            })
            .catch(error => {
                this._soundLoads.delete(id);
                throw error;
            });
        this._soundLoads.set(id, request);
        return request;
    }

    /** Play a decoded sound asset. If it is still loading, play it when ready. */
    playSound(id, { volume = 1, playbackRate = 1 } = {}) {
        const buffer = this._soundBuffers.get(id);
        if (!buffer) {
            const loading = this._soundLoads.get(id);
            if (loading) loading.then(() => this.playSound(id, { volume, playbackRate })).catch(() => {});
            return false;
        }

        const ctx = this._ensureCtx();
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        source.playbackRate.value = playbackRate;
        gain.gain.value = Math.max(0, volume);
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(ctx.currentTime);
        return true;
    }

    /**
     * Play a success / score sound.
     */
    playSuccess() {
        const ctx = this._ensureCtx();
        [523, 659, 784].forEach((f, i) => {
            setTimeout(() => this.playTone(f, 0.12, 'sine', 0.25), i * 80);
        });
    }

    destroy() {
        this._soundBuffers.clear();
        this._soundLoads.clear();
        this._tetrisImpactBuffers.clear();
        if (this._ctx) {
            this._ctx.close().catch(() => {});
            this._ctx = null;
        }
    }
}
