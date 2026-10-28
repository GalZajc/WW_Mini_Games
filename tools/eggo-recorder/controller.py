"""XInput plus legacy Windows HID/DirectInput joystick compatibility."""
import ctypes as C
import sys
import time
from pathlib import Path
from core import BUTTONS

class Pad(C.Structure):
    _fields_ = [('buttons', C.c_ushort), ('lt', C.c_ubyte), ('rt', C.c_ubyte),
                ('lx', C.c_short), ('ly', C.c_short), ('rx', C.c_short), ('ry', C.c_short)]
class PadState(C.Structure):
    _fields_ = [('packet', C.c_uint32), ('pad', Pad)]
class JoyInfo(C.Structure):
    _fields_ = [(name, C.c_uint32) for name in
        ('size', 'flags', 'x', 'y', 'z', 'r', 'u', 'v', 'buttons', 'button_number', 'pov', 'reserved1', 'reserved2')]
class JoyCaps(C.Structure):
    _fields_ = [('mid', C.c_ushort), ('pid', C.c_ushort), ('name', C.c_wchar*32),
        *[(name, C.c_uint32) for name in ('xmin', 'xmax', 'ymin', 'ymax', 'zmin', 'zmax',
          'buttons', 'periodmin', 'periodmax', 'rmin', 'rmax', 'umin', 'umax', 'vmin', 'vmax',
          'caps', 'axesmax', 'axes', 'buttonsmax')],
        ('registry', C.c_wchar*32), ('oem', C.c_wchar*260)]

def bit(name): return 1 << BUTTONS[name]

class SDLControllers:
    """SDL's controller mappings also cover Bluetooth HID controllers."""
    def __init__(self):
        self.dll, self.devices, self.error = None, {}, None
        path = Path(__file__).with_name('runtime') / 'SDL2.dll'
        if not path.is_file(): return
        try:
            dll = C.CDLL(str(path))
            for name, args, result in [
                ('SDL_SetHint',[C.c_char_p,C.c_char_p],C.c_int),
                ('SDL_InitSubSystem',[C.c_uint32],C.c_int),
                ('SDL_QuitSubSystem',[C.c_uint32],None),
                ('SDL_NumJoysticks',[],C.c_int),
                ('SDL_IsGameController',[C.c_int],C.c_int),
                ('SDL_JoystickGetDeviceInstanceID',[C.c_int],C.c_int),
                ('SDL_GameControllerOpen',[C.c_int],C.c_void_p),
                ('SDL_GameControllerClose',[C.c_void_p],None),
                ('SDL_GameControllerGetAttached',[C.c_void_p],C.c_int),
                ('SDL_GameControllerName',[C.c_void_p],C.c_char_p),
                ('SDL_GameControllerGetButton',[C.c_void_p,C.c_int],C.c_ubyte),
                ('SDL_GameControllerGetAxis',[C.c_void_p,C.c_int],C.c_int16),
                ('SDL_GetError',[],C.c_char_p),
                ('SDL_PumpEvents',[],None),('SDL_GameControllerUpdate',[],None),
                ('SDL_PollEvent',[C.c_void_p],C.c_int)]:
                fn=getattr(dll,name);fn.argtypes=args;fn.restype=result
            dll.SDL_SetHint(b'SDL_JOYSTICK_ALLOW_BACKGROUND_EVENTS',b'1')
            if dll.SDL_InitSubSystem(0x2000):
                raise RuntimeError(dll.SDL_GetError().decode('utf-8','replace'))
            self.dll=dll
        except (OSError,AttributeError,RuntimeError) as error:self.error=str(error)

    def scan(self):
        if not self.dll:return
        d=self.dll;d.SDL_PumpEvents()
        for identity,handle in list(self.devices.items()):
            if not d.SDL_GameControllerGetAttached(handle):
                d.SDL_GameControllerClose(handle);del self.devices[identity]
        for index in range(d.SDL_NumJoysticks()):
            if not d.SDL_IsGameController(index):continue
            identity=d.SDL_JoystickGetDeviceInstanceID(index)
            if identity in self.devices:continue
            handle=d.SDL_GameControllerOpen(index)
            if handle:self.devices[identity]=handle

    def sample(self,deadzone):
        if not self.dll:return 0
        d=self.dll;d.SDL_PumpEvents();d.SDL_GameControllerUpdate();mask=0
        event=C.create_string_buffer(64)
        while d.SDL_PollEvent(event):pass
        for handle in self.devices.values():
            for button,key in [(0,'B'),(1,'A'),(6,'START'),(9,'L'),(10,'R'),
                               (11,'UP'),(12,'DOWN'),(13,'LEFT'),(14,'RIGHT')]:
                if d.SDL_GameControllerGetButton(handle,button):mask|=bit(key)
            x=d.SDL_GameControllerGetAxis(handle,0);y=d.SDL_GameControllerGetAxis(handle,1)
            for active,key in [(x< -32768*deadzone,'LEFT'),(x>32767*deadzone,'RIGHT'),
                               (y< -32768*deadzone,'UP'),(y>32767*deadzone,'DOWN')]:
                if active:mask|=bit(key)
        return mask

    def names(self):
        return [(self.dll.SDL_GameControllerName(handle) or b'Controller').decode('utf-8','replace')
                for handle in self.devices.values()]

    def close(self):
        if not self.dll:return
        for handle in self.devices.values():self.dll.SDL_GameControllerClose(handle)
        self.devices.clear();self.dll.SDL_QuitSubSystem(0x2000);self.dll=None

def xinput_mask(pad, deadzone):
    mask = 0
    for physical, gba in [(0x2000, 'A'), (0x1000, 'B'), (0x100, 'L'), (0x200, 'R'),
                          (0x10, 'START'), (1, 'UP'), (2, 'DOWN'), (4, 'LEFT'), (8, 'RIGHT')]:
        if pad.buttons & physical: mask |= bit(gba)
    for active, key in [(pad.lx < -32768*deadzone, 'LEFT'), (pad.lx > 32767*deadzone, 'RIGHT'),
                       (pad.ly > 32767*deadzone, 'UP'), (pad.ly < -32768*deadzone, 'DOWN')]:
        if active: mask |= bit(key)
    return mask

def joystick_mask(state, caps, deadzone, bindings):
    mask = 0
    for name, button in bindings.items():
        if state.buttons & (1 << button): mask |= bit(name)
    for value, lower, upper, negative, positive in [
        (state.x, caps.xmin, caps.xmax, 'LEFT', 'RIGHT'),
        (state.y, caps.ymin, caps.ymax, 'UP', 'DOWN')]:
        if upper <= lower: continue
        center = (upper+lower)/2; threshold = (upper-lower)*deadzone/2
        if value < center-threshold: mask |= bit(negative)
        if value > center+threshold: mask |= bit(positive)
    # POV angles use hundredths of a degree; centered is 0xffff.
    if caps.caps & 0x10 and state.pov < 36000:
        if state.pov >= 31500 or state.pov <= 4500: mask |= bit('UP')
        if 4500 <= state.pov <= 13500: mask |= bit('RIGHT')
        if 13500 <= state.pov <= 22500: mask |= bit('DOWN')
        if 22500 <= state.pov <= 31500: mask |= bit('LEFT')
    return mask

class Controller:
    def __init__(self, deadzone, config=None):
        self.deadzone, self.config = deadzone, config or {}
        self.bindings = self.config.get('windows_buttons', {'A':1, 'B':0, 'L':4, 'R':5, 'START':7})
        self.dll, self.winmm, self.devices = None, None, {}
        self.next_scan, self.backend, self.connected = 0, None, False
        self.sdl=SDLControllers() if sys.platform=='win32' else None
        self.xinput_status = {}; self.scan_seconds = self.config.get('rescan_seconds', 2)
        if sys.platform == 'win32':
            for name in ('xinput1_4.dll', 'xinput1_3.dll', 'xinput9_1_0.dll'):
                try: self.dll = C.WinDLL(name); break
                except OSError: pass
            if self.dll:
                self.dll.XInputGetState.argtypes = [C.c_uint, C.POINTER(PadState)]
                self.dll.XInputGetState.restype = C.c_uint
            try:
                self.winmm = C.WinDLL('winmm')
                self.winmm.joyGetPosEx.argtypes = [C.c_uint, C.POINTER(JoyInfo)]
                self.winmm.joyGetPosEx.restype = C.c_uint
                self.winmm.joyGetDevCapsW.argtypes = [C.c_size_t, C.POINTER(JoyCaps), C.c_uint]
                self.winmm.joyGetDevCapsW.restype = C.c_uint
            except OSError: pass

    def scan(self):
        if self.sdl:self.sdl.scan()
        # WinMM device enumeration can synchronously block on Bluetooth/HID
        # drivers. A mapped SDL controller already supplies all required input.
        if self.sdl and self.sdl.devices:
            self.devices = {}
            return
        if not self.winmm: return
        found = {}
        for slot in range(min(16, self.winmm.joyGetNumDevs())):
            caps = JoyCaps(); state = JoyInfo(size=C.sizeof(JoyInfo), flags=0xff)
            if self.winmm.joyGetDevCapsW(slot, C.byref(caps), C.sizeof(caps)): continue
            if self.winmm.joyGetPosEx(slot, C.byref(state)): continue
            found[slot] = caps
        self.devices = found

    def sample(self):
        now=time.perf_counter()
        if now>=self.next_scan:
            self.scan();self.next_scan=now+self.scan_seconds
        if self.sdl:
            mask=self.sdl.sample(self.deadzone)
            if self.sdl.devices:
                self.connected=True;self.backend='SDL';return mask
        mask, xinput_connected = 0, False
        if self.dll:
            for slot in range(4):
                state = PadState(); result = self.dll.XInputGetState(slot, C.byref(state))
                self.xinput_status[slot] = int(result)
                if result: continue
                xinput_connected = True
                # Do not stop at an idle virtual controller in the first slot.
                mask |= xinput_mask(state.pad, self.deadzone)
        self.connected = xinput_connected or bool(self.devices)
        if mask:
            self.backend = 'XInput'; return mask
        for slot, caps in list(self.devices.items()):
            state = JoyInfo(size=C.sizeof(JoyInfo), flags=0xff)
            if self.winmm.joyGetPosEx(slot, C.byref(state)): continue
            mask |= joystick_mask(state, caps, self.deadzone, self.bindings)
        self.backend = 'Windows joystick' if mask or (self.devices and not xinput_connected) else ('XInput' if xinput_connected else None)
        return mask

    @property
    def status(self):
        return self.backend or ('zaznan' if self.connected else 'ni zaznan')

    def diagnostics(self):
        return {'sdl_controllers':self.sdl.names() if self.sdl else [],
            'sdl_error':self.sdl.error if self.sdl else None,
            'xinput_dll': getattr(self.dll, '_name', None), 'xinput_slots': self.xinput_status,
            'windows_devices': [{'slot': slot, 'name': caps.name, 'buttons': caps.buttons,
                'axes': caps.axes, 'x_range': [caps.xmin,caps.xmax], 'y_range':[caps.ymin,caps.ymax]}
                for slot, caps in self.devices.items()], 'backend':self.backend,
            'windows_buttons':self.bindings}

    def close(self):
        if self.sdl:self.sdl.close()
