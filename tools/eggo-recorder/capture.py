"""Bounded, lossless, frame-indexed capture with XOR/zlib compression."""
from pathlib import Path
from datetime import datetime
import csv
import hashlib
import json
import queue
import struct
import threading
import time
import wave
import zlib
import numpy as np

MAGIC = b'EGGOCAP1\n'
HEADER = struct.Struct('<IB3xII')

class Capture:
    def __init__(self, root, core, config):
        self.folder = Path(root) / 'OUTPUT' / ('eggo-native-play_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S_%f'))
        self.folder.mkdir(parents=True)
        self.config = config
        state = core.serialize()
        (self.folder / 'initial.state').write_bytes(state)
        self.parameters = {'experiment': 'Original Eggo Mania user play capture', 'version': 1,
            'configuration': config, **core.metadata(), 'initial_state_sha256': hashlib.sha256(state).hexdigest(),
            'random_seed': 'Complete RNG state is encoded in initial.state and checkpoints.',
            'memory_sample_phase': 'video_refresh callback', 'zero_dropped_frames': True,
            'controls': 'Per-emulated-frame libretro button mask; window-scoped keyboard events and XInput changes.'}
        self.save_parameters()
        self.pending = queue.Queue(maxsize=config['writer_queue_frames'])
        self.error, self.count, self.bytes_written = None, 0, 0
        self.started = time.perf_counter()
        self.thread = threading.Thread(target=self.write_loop, name='Eggo capture writer', daemon=True)
        self.thread.start()

    def save_parameters(self):
        (self.folder / 'parameters.json').write_text(json.dumps(self.parameters, indent=2, ensure_ascii=False), encoding='utf-8')

    def add(self, number, mask, frame, audio, memory, events=(), checkpoint=None):
        if self.error: raise RuntimeError('Zapis posnetka ni uspel.') from self.error
        width, height, pixel_format, video = frame
        layout = [('video', len(video)), *((name, len(raw)) for name, raw in sorted(memory.items()))]
        if 'layout' not in self.parameters:
            self.parameters.update(layout=layout, width=width, height=height, pixel_format=pixel_format)
            self.save_parameters()
        elif self.parameters['layout'] != layout:
            raise RuntimeError('mGBA je med zajemom spremenil format slike ali pomnilnika.')
        record = {'frame': number, 'mask': mask, 'elapsed_ns': time.perf_counter_ns(),
                  'video_sha256': hashlib.sha256(video).hexdigest(), 'events': list(events)}
        packet = (record, video + b''.join(raw for _, raw in sorted(memory.items())), audio, checkpoint)
        # Backpressure pauses emulation instead of silently dropping images or input.
        while True:
            if self.error: raise RuntimeError('Zapis posnetka ni uspel.') from self.error
            try: self.pending.put(packet, timeout=0.1); break
            except queue.Full: pass

    def write_loop(self):
        previous = None
        try:
            with (self.folder / 'frames.egcap').open('wb') as binary, (self.folder / 'inputs.jsonl').open('w', encoding='utf-8') as index, wave.open(str(self.folder / 'audio.wav'), 'wb') as audio_file:
                binary.write(MAGIC)
                audio_file.setnchannels(2); audio_file.setsampwidth(2); audio_file.setframerate(self.parameters['sample_rate'])
                while True:
                    packet = self.pending.get()
                    if packet is None: break
                    record, payload, audio, checkpoint = packet
                    number = record['frame']; keyframe = previous is None or number % self.config['keyframe_interval'] == 0
                    delta = payload if keyframe else np.bitwise_xor(np.frombuffer(payload, dtype='uint8'), np.frombuffer(previous, dtype='uint8')).tobytes()
                    encoded = zlib.compress(delta, self.config['compression_level'])
                    record.update(offset=binary.tell(), keyframe=keyframe, compressed_bytes=len(encoded), raw_bytes=len(payload))
                    binary.write(HEADER.pack(number, int(keyframe), len(payload), len(encoded))); binary.write(encoded)
                    index.write(json.dumps(record, ensure_ascii=False, separators=(',', ':')) + '\n')
                    if audio: audio_file.writeframesraw(audio)
                    if checkpoint is not None:
                        (self.folder / f'after-frame-{number:08d}.state').write_bytes(checkpoint)
                    previous = payload; self.count += 1; self.bytes_written += len(encoded)
                    if number % 60 == 0: binary.flush(); index.flush()
        except BaseException as exc:
            self.error = exc

    def close(self):
        while self.thread.is_alive():
            try: self.pending.put(None, timeout=0.1); break
            except queue.Full: pass
        self.thread.join()
        summary = {'frames': self.count, 'compressed_bytes': self.bytes_written, 'wall_seconds': time.perf_counter()-self.started,
                   'complete': self.error is None, 'error': str(self.error) if self.error else None, 'dropped_frames': 0}
        (self.folder / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
        if self.error: raise RuntimeError('Posnetek je nepopoln; preveri summary.json.') from self.error
        return summary

def frames(folder, first=1, last=None):
    """Stream exact packets, seeking to the nearest preceding indexed keyframe.

    Only diagnostics request a range; ordinary full replay remains unchanged.
    Memory stays bounded to two native frames, independently of recording length.
    """
    folder = Path(folder)
    parameters = json.loads((folder / 'parameters.json').read_text(encoding='utf-8'))
    video_bytes = parameters['layout'][0][1]
    previous = None
    with (folder / 'frames.egcap').open('rb') as stream, (folder / 'inputs.jsonl').open(encoding='utf-8') as index:
        if stream.read(len(MAGIC)) != MAGIC: raise ValueError('Neznan format posnetka.')
        if first > 1:
            # Text seek cookies preserve Unicode/line-ending handling. The
            # binary offsets were written with each frame by the recorder.
            start_cookie, start_offset = 0, len(MAGIC)
            while True:
                cookie = index.tell()
                line = index.readline()
                if not line: break
                record = json.loads(line)
                if record['frame'] > first: break
                if record['keyframe']:
                    start_cookie, start_offset = cookie, record['offset']
            index.seek(start_cookie)
            stream.seek(start_offset)
        for line in index:
            record = json.loads(line); header = stream.read(HEADER.size)
            if len(header) != HEADER.size: raise ValueError('Posnetek je odrezan.')
            number, keyframe, raw_bytes, size = HEADER.unpack(header)
            if number != record['frame'] or size != record['compressed_bytes']: raise ValueError('Indeks posnetka se ne ujema.')
            encoded = stream.read(size)
            if len(encoded) != size: raise ValueError('Posnetek je odrezan.')
            delta = zlib.decompress(encoded)
            if len(delta) != raw_bytes: raise ValueError('Napačna dolžina sličice.')
            payload = delta if keyframe else np.bitwise_xor(np.frombuffer(delta, dtype='uint8'), np.frombuffer(previous, dtype='uint8')).tobytes()
            previous = payload
            video = payload[:video_bytes]
            if hashlib.sha256(video).hexdigest() != record['video_sha256']: raise ValueError('Kontrolna vsota slike se ne ujema.')
            if number >= first:
                yield record, video, payload[video_bytes:]
            if last is not None and number >= last: break

def rgb_image(raw, width, height, pixel_format):
    from PIL import Image
    if pixel_format == 1: return Image.frombytes('RGB', (width, height), raw, 'raw', 'BGRX')
    values = np.frombuffer(raw, dtype='<u2').reshape(height, width)
    green_bits = 6 if pixel_format == 2 else 5
    rgb = np.stack((((values >> (green_bits+5)) & 31)*255//31,
                    ((values >> 5) & ((1 << green_bits)-1))*255//((1 << green_bits)-1),
                    (values & 31)*255//31), axis=-1).astype('uint8')
    return Image.fromarray(rgb)
