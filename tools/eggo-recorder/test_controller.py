import ctypes as C
import unittest
from controller import Controller, Pad, JoyInfo, JoyCaps, xinput_mask, joystick_mask, bit

class ControllerTests(unittest.TestCase):
    def test_mapped_sdl_controller_skips_blocking_legacy_driver_enumeration(self):
        class SDL:
            devices={1:'mapped controller'}
            def scan(self):pass
            def sample(self,deadzone):return bit('A')
        class Legacy:
            def joyGetNumDevs(self):raise AssertionError('Legacy driver must not be queried')
        c=Controller(.22)
        if c.sdl:c.sdl.close()
        c.sdl=SDL();c.winmm=Legacy()
        for _ in range(4):
            c.next_scan=0
            self.assertEqual(c.sample(),bit('A'))
        self.assertEqual(c.backend,'SDL')

    def test_sdl_virtual_controller_end_to_end(self):
        c=Controller(.22)
        if not c.sdl or not c.sdl.dll:self.skipTest('SDL unavailable on this platform')
        d=c.sdl.dll
        for name,args,result in [
            ('SDL_JoystickAttachVirtual',[C.c_int]*4,C.c_int),
            ('SDL_JoystickOpen',[C.c_int],C.c_void_p),
            ('SDL_JoystickClose',[C.c_void_p],None),
            ('SDL_JoystickDetachVirtual',[C.c_int],C.c_int),
            ('SDL_JoystickSetVirtualButton',[C.c_void_p,C.c_int,C.c_ubyte],C.c_int),
            ('SDL_JoystickSetVirtualAxis',[C.c_void_p,C.c_int,C.c_int16],C.c_int)]:
            if not hasattr(d,name):c.close();self.skipTest('Older SDL does not expose virtual devices')
            f=getattr(d,name);f.argtypes=args;f.restype=result
        index=d.SDL_JoystickAttachVirtual(1,6,15,0)
        self.assertGreaterEqual(index,0)
        handle=d.SDL_JoystickOpen(index)
        try:
            c.next_scan=0;c.sample();self.assertEqual(c.backend,'SDL')
            for button,key in [(1,'A'),(0,'B'),(6,'START'),(9,'L'),(11,'UP')]:
                self.assertEqual(d.SDL_JoystickSetVirtualButton(handle,button,1),0)
                self.assertTrue(c.sample()&bit(key),key)
                d.SDL_JoystickSetVirtualButton(handle,button,0);c.sample()
            d.SDL_JoystickSetVirtualAxis(handle,0,-32768)
            self.assertTrue(c.sample()&bit('LEFT'))
        finally:
            d.SDL_JoystickClose(handle);d.SDL_JoystickDetachVirtual(index);c.close()

    def test_xbox_mapping_and_view(self):
        self.assertEqual(xinput_mask(Pad(buttons=0x2000), .22), bit('A'))
        self.assertEqual(xinput_mask(Pad(buttons=0x1000), .22), bit('B'))
        self.assertEqual(xinput_mask(Pad(buttons=0x10), .22), bit('START'))
        self.assertEqual(xinput_mask(Pad(buttons=0x20), .22), 0)

    def test_windows_joystick_pov_buttons_and_center(self):
        c=JoyCaps(xmin=0,xmax=65535,ymin=0,ymax=65535,caps=0x10)
        bindings={'A':1,'B':0,'L':4,'R':5,'START':7}
        s=JoyInfo(x=32767,y=32767,pov=65535)
        self.assertEqual(joystick_mask(s,c,.22,bindings),0)
        s.buttons=2;s.pov=4500
        self.assertEqual(joystick_mask(s,c,.22,bindings),bit('A')|bit('UP')|bit('RIGHT'))
        s.buttons=128;s.pov=65535;s.x=0
        self.assertEqual(joystick_mask(s,c,.22,bindings),bit('START')|bit('LEFT'))
        c.caps=0;s.buttons=0;s.x=32767;s.pov=0
        self.assertEqual(joystick_mask(s,c,.22,bindings),0,'Devices without POV must not hold Up')

    def test_idle_first_xinput_slot_does_not_hide_second_controller(self):
        class Fake:
            def XInputGetState(self,slot,state):
                state=C.cast(state,C.POINTER(__import__('controller').PadState)).contents
                if slot==1:state.pad.buttons=0x2000
                return 0 if slot<2 else 1167
        c=Controller(.22);c.dll=Fake();c.winmm=None;c.devices={}
        self.assertEqual(c.sample(),bit('A'))
        self.assertEqual(c.backend,'XInput')

if __name__=='__main__':unittest.main()
