"""Small libretro host. This runs the original ROM, never the reconstruction."""
from pathlib import Path
import ctypes as C
import hashlib
import struct

BUTTONS = {'B': 0, 'SELECT': 2, 'START': 3, 'UP': 4, 'DOWN': 5, 'LEFT': 6, 'RIGHT': 7, 'A': 8, 'L': 10, 'R': 11}
VIDEO = C.CFUNCTYPE(None, C.c_void_p, C.c_uint, C.c_uint, C.c_size_t)
ENV = C.CFUNCTYPE(C.c_bool, C.c_uint, C.c_void_p)
AUDIO = C.CFUNCTYPE(None, C.c_int16, C.c_int16)
BATCH = C.CFUNCTYPE(C.c_size_t, C.c_void_p, C.c_size_t)
POLL = C.CFUNCTYPE(None)
INPUT = C.CFUNCTYPE(C.c_int16, C.c_uint, C.c_uint, C.c_uint, C.c_uint)

class Descriptor(C.Structure):
    _fields_ = [('flags', C.c_uint64), ('ptr', C.c_void_p), ('offset', C.c_size_t), ('start', C.c_size_t),
                ('select', C.c_size_t), ('disconnect', C.c_size_t), ('length', C.c_size_t), ('addrspace', C.c_char_p)]
class MemoryMap(C.Structure):
    _fields_ = [('descriptors', C.POINTER(Descriptor)), ('count', C.c_uint)]
class Variable(C.Structure):
    _fields_ = [('key', C.c_char_p), ('value', C.c_char_p)]
class GameInfo(C.Structure):
    _fields_ = [('path', C.c_char_p), ('data', C.c_void_p), ('size', C.c_size_t), ('meta', C.c_char_p)]
class Geometry(C.Structure):
    _fields_ = [('width', C.c_uint), ('height', C.c_uint), ('max_width', C.c_uint), ('max_height', C.c_uint), ('aspect', C.c_float)]
class Timing(C.Structure):
    _fields_ = [('fps', C.c_double), ('sample_rate', C.c_double)]
class AVInfo(C.Structure):
    _fields_ = [('geometry', Geometry), ('timing', Timing)]

class Core:
    def __init__(self, core, rom, directory, options=None, capture_memory=True):
        self.lib = C.CDLL(str(Path(core).resolve()))
        self.core_path, self.rom_path = Path(core).resolve(), Path(rom).resolve()
        self.directory = str(Path(directory).resolve()).encode('utf-8')
        self.options = {k.encode(): v.encode() for k, v in (options or {}).items()}
        self.variables, self.maps = {}, []
        self.mask, self.pixel_format = 0, 0
        self.frame, self.audio, self.memory = None, bytearray(), {}
        self.capture_memory = capture_memory
        self.initialized = self.loaded = False
        self.callback_error = None
        # Keep every ctypes callback and ROM buffer alive for the entire core lifetime.
        self.callbacks = [ENV(self.environment), VIDEO(self.video), AUDIO(self.audio_sample),
                          BATCH(self.audio_batch), POLL(lambda: None), INPUT(self.input)]
        names = ['environment', 'video_refresh', 'audio_sample', 'audio_sample_batch', 'input_poll', 'input_state']
        for name, cb in zip(names, self.callbacks):
            fn = getattr(self.lib, 'retro_set_' + name)
            fn.argtypes = [type(cb)]
            fn(cb)
        try:
            self.lib.retro_init(); self.initialized = True
            self.content = C.create_string_buffer(self.rom_path.read_bytes())
            self.path_bytes = str(self.rom_path).encode('utf-8')
            info = GameInfo(self.path_bytes, C.cast(self.content, C.c_void_p), len(self.content)-1, None)
            self.lib.retro_load_game.argtypes, self.lib.retro_load_game.restype = [C.POINTER(GameInfo)], C.c_bool
            if not self.lib.retro_load_game(C.byref(info)):
                raise RuntimeError('mGBA ni mogel naložiti ROM-a.')
            self.loaded = True
            av = AVInfo()
            self.lib.retro_get_system_av_info.argtypes = [C.POINTER(AVInfo)]
            self.lib.retro_get_system_av_info(C.byref(av))
            self.fps, self.sample_rate = av.timing.fps, round(av.timing.sample_rate)
            self.lib.retro_serialize_size.restype = C.c_size_t
            for name in ['serialize', 'unserialize']:
                fn = getattr(self.lib, 'retro_' + name)
                fn.argtypes, fn.restype = [C.c_void_p, C.c_size_t], C.c_bool
        except BaseException:
            self.close(); raise

    def environment(self, command, data):
        cmd = command & 0xffff
        if cmd == 36:
            m = C.cast(data, C.POINTER(MemoryMap))[0]
            self.maps = [(d.start, d.ptr, d.offset, d.length) for d in m.descriptors[:m.count]]
            return True
        if cmd == 10:
            value = C.cast(data, C.POINTER(C.c_int))[0]
            if value not in (0, 1, 2): return False
            self.pixel_format = value; return True
        if cmd in (9, 30, 31):
            C.cast(data, C.POINTER(C.c_char_p))[0] = self.directory; return True
        if cmd == 16:
            variables = C.cast(data, C.POINTER(Variable)); i = 0
            while variables[i].key:
                key, definition = variables[i].key, variables[i].value
                self.variables[key] = self.options.get(key, definition.split(b'; ', 1)[-1].split(b'|')[0])
                i += 1
            return True
        if cmd == 15:
            v = C.cast(data, C.POINTER(Variable))[0]
            v.value = self.variables.get(v.key); return bool(v.value)
        if cmd in (3, 17):
            C.cast(data, C.POINTER(C.c_bool))[0] = False; return True
        if cmd in (1, 11, 18): return True
        return False

    def video(self, data, width, height, pitch):
        if not data: return  # Libretro null frame means repeat the preceding picture.
        try:
            bpp = 4 if self.pixel_format == 1 else 2
            raw = C.string_at(data, height * pitch)
            self.frame = (width, height, self.pixel_format,
                          raw if pitch == width*bpp else b''.join(raw[y*pitch:y*pitch+width*bpp] for y in range(height)))
            if self.capture_memory:
                # This is sampled at video_refresh, not at an unrelated HBlank register phase.
                self.memory = {f'{start:08x}': C.string_at(ptr+offset, length)
                               for start, ptr, offset, length in self.maps if ptr and start in
                               (0x02000000, 0x03000000, 0x04000000, 0x05000000, 0x06000000, 0x07000000)}
        except BaseException as exc:
            self.callback_error = exc

    def audio_sample(self, left, right): self.audio.extend(struct.pack('<hh', left, right))
    def audio_batch(self, data, count):
        self.audio.extend(C.string_at(data, count*4)); return count
    def input(self, port, device, index, button):
        return int(port == 0 and device == 1 and bool(self.mask & (1 << button)))

    def step(self, mask):
        self.mask = mask; self.audio.clear(); self.lib.retro_run()
        if self.callback_error: raise self.callback_error
        if not self.frame: raise RuntimeError('mGBA ni oddal začetne slike.')
        return self.frame, bytes(self.audio), dict(self.memory)

    def serialize(self):
        size = self.lib.retro_serialize_size(); buffer = C.create_string_buffer(size)
        if not self.lib.retro_serialize(buffer, size): raise RuntimeError('Shranjevanje stanja mGBA ni uspelo.')
        return buffer.raw
    def restore(self, blob):
        buffer = C.create_string_buffer(blob)
        if not self.lib.retro_unserialize(buffer, len(blob)): raise RuntimeError('Stanje ni združljivo s tem jedrom mGBA.')
    def close(self):
        if self.loaded: self.lib.retro_unload_game(); self.loaded = False
        if self.initialized: self.lib.retro_deinit(); self.initialized = False
    def metadata(self):
        return {'core': str(self.core_path), 'rom': str(self.rom_path), 'fps': self.fps, 'sample_rate': self.sample_rate,
                'core_sha256': hashlib.sha256(self.core_path.read_bytes()).hexdigest(),
                'rom_sha256': hashlib.sha256(self.rom_path.read_bytes()).hexdigest(),
                'core_options': {k.decode(): v.decode() for k, v in self.variables.items()}}
