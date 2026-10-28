"""Original-ROM player and automatic diagnostic recorder. No global input hooks."""
from pathlib import Path
import argparse
import ctypes as C
import hashlib
import json
import os
import sys
import time
import traceback
from core import Core, BUTTONS
from controller import Controller
from capture import Capture, frames, rgb_image

ROOT = Path(__file__).resolve().parent

def configuration():
    config = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))
    for name in ['rom', 'core', 'initial_state']:
        path = Path(config[name]); config[name] = str(path if path.is_absolute() else ROOT / path)
    return config

def make_core(config, capture_memory=True):
    core = Core(config['core'], config['rom'], ROOT / 'runtime', config['core_options'], capture_memory)
    try: core.restore(Path(config['initial_state']).read_bytes())
    except BaseException: core.close(); raise
    return core

def verify(folder):
    folder = Path(folder)
    params = json.loads((folder / 'parameters.json').read_text(encoding='utf-8'))
    # Refuse a mismatched ROM/core rather than presenting false pixel parity.
    for key in ['rom', 'core']:
        if hashlib.sha256(Path(params[key]).read_bytes()).hexdigest() != params[key+'_sha256']:
            raise ValueError(f'{key}: kontrolna vsota ni enaka kot ob snemanju.')
    if hashlib.sha256((folder / 'initial.state').read_bytes()).hexdigest() != params['initial_state_sha256']:
        raise ValueError('Začetno stanje ni enako kot ob snemanju.')
    core = Core(params['core'], params['rom'], ROOT / 'runtime', params['core_options'], False)
    mismatch, count = [], 0
    try:
        core.restore((folder / 'initial.state').read_bytes())
        total = json.loads((folder / 'summary.json').read_text(encoding='utf-8'))['frames']
        with (folder / 'replay-verification.csv').open('w', encoding='utf-8') as csv_file:
            csv_file.write('frame,equal\n')
            for record, expected, _ in frames(folder):
                actual, _, _ = core.step(record['mask']); count += 1
                equal = actual[:3] == (params['width'], params['height'], params['pixel_format']) and actual[3] == expected
                csv_file.write(f'{record["frame"]},{int(equal)}\n')
                if not equal:
                    mismatch.append(record['frame'])
                    if len(mismatch) == 1:
                        rgb_image(expected, params['width'], params['height'], params['pixel_format']).save(folder / 'first-mismatch-expected.png')
                        rgb_image(actual[3], *actual[:3]).save(folder / 'first-mismatch-replayed.png')
                if count % 120 == 0:
                    print(f'Preverjanje: {count}/{total} ({count/max(1,total):.0%})', flush=True)
    finally: core.close()
    result = {'frames': count, 'exact_frames': count-len(mismatch), 'mismatching_frames': mismatch,
              'comparison': 'Original captured framebuffer vs deterministic replay of original ROM; not reconstruction parity.'}
    (folder / 'replay-verification.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result

def self_test(config):
    core = make_core(config)
    capture = Capture(ROOT, core, config)
    # Ordinary GBA menu confirmation followed by a long held jump and rotations.
    tape = [(8, 1 << BUTTONS['A']), (420, 0), (150, (1 << BUTTONS['RIGHT']) | (1 << BUTTONS['UP'])),
            (1, 1 << BUTTONS['B']), (45, 1 << BUTTONS['LEFT']), (1, 1 << BUTTONS['A']), (90, 0)]
    number = 0
    try:
        for length, mask in tape:
            for _ in range(length):
                number += 1; frame, audio, memory = core.step(mask)
                checkpoint = core.serialize() if number % config['checkpoint_interval'] == 0 else None
                capture.add(number, mask, frame, audio, memory, checkpoint=checkpoint)
    finally:
        capture.close(); core.close()
    result = verify(capture.folder)
    print(json.dumps({'capture': str(capture.folder), **result}, ensure_ascii=False))
    if result['mismatching_frames']: raise AssertionError('Zajem ni deterministično ponovljiv.')

class RecorderWindow:
    def __init__(self, config):
        import tkinter as tk
        from tkinter import ttk
        self.tk, self.config = tk, config
        self.timer = None
        if sys.platform == 'win32':
            # Tk's millisecond delays otherwise inherit Windows' coarse timer
            # quantum on some machines, producing uneven 15/30 ms intervals.
            timer = C.WinDLL('winmm')
            if timer.timeBeginPeriod(1) == 0: self.timer = timer
        self.root = tk.Tk(); self.root.title('Eggo Mania — original in diagnostični zajem')
        self.root.configure(bg='#171b21'); self.root.minsize(480, 350)
        self.root.geometry(f'{240*config["window_scale"]}x{160*config["window_scale"]+48}')
        bar = ttk.Frame(self.root); bar.pack(fill='x')
        ttk.Button(bar, text='Nova igra (F5)', command=self.restart, width=17).pack(side='left', padx=3, pady=2)
        self.status = tk.StringVar(value='Nalagam izvirnik …')
        ttk.Label(bar, textvariable=self.status, font=('Segoe UI', 9)).pack(side='left', padx=8)
        self.canvas = tk.Canvas(self.root, bg='black', highlightthickness=0); self.canvas.pack(fill='both', expand=True)
        self.picture = self.canvas.create_image(0, 0, anchor='nw')
        ttk.Label(self.root, text='Puščice / Xbox • Space/Z: A • X: B • Q/R: L/R • Enter/Menu: pavza v igri • Esc: premor zajema', font=('Segoe UI', 8)).pack(fill='x')
        self.held, self.events, self.pad_mask = set(), [], 0
        self.controller = Controller(config['stick_deadzone'], config.get('controller'))
        self.paused, self.closing, self.core, self.capture = False, False, None, None
        self.root.bind('<KeyPress>', self.key_down); self.root.bind('<KeyRelease>', self.key_up)
        self.root.bind('<FocusOut>', self.focus_out)
        self.root.protocol('WM_DELETE_WINDOW', self.close)
        self.root.after_idle(self.start)

    def start(self):
        try:
            self.core = make_core(self.config)
            self.capture = Capture(ROOT, self.core, self.config)
            self.number = 0; self.started = self.last_status = time.perf_counter(); self.deadline = self.started
            self.controller.sample()
            self.saved_controller_diagnostics = self.controller.diagnostics()
            (self.capture.folder / 'controller-diagnostics.json').write_text(json.dumps(self.saved_controller_diagnostics, indent=2, ensure_ascii=False), encoding='utf-8')
            self.status.set('Zajem teče • zvok je utišan'); self.canvas.focus_set()
            self.root.after(1, self.tick)
        except BaseException: self.fail()

    def key_down(self, event):
        key = event.keysym if len(event.keysym) > 1 else event.keysym.lower()
        if key in self.held: return
        self.held.add(key)
        self.events.append({'device': 'keyboard', 'key': key, 'down': True, 'time_ns': time.perf_counter_ns()})
        if key == 'Escape': self.paused = not self.paused
        elif key == 'F5': self.restart()
    def key_up(self, event):
        key = event.keysym if len(event.keysym) > 1 else event.keysym.lower()
        self.held.discard(key)
        self.events.append({'device': 'keyboard', 'key': key, 'down': False, 'time_ns': time.perf_counter_ns()})
    def focus_out(self, event):
        if self.root.focus_displayof() is None:
            self.held.clear(); self.pad_mask = 0
            self.events.append({'device': 'window', 'event': 'focus_lost', 'time_ns': time.perf_counter_ns()})

    def tick(self):
        if self.closing or self.core is None: return
        try:
            now = time.perf_counter()
            if self.paused or self.root.focus_displayof() is None:
                self.deadline = now
                self.status.set('Zajem miruje — Esc za nadaljevanje' if self.paused else 'Zajem miruje — okno ni aktivno')
                self.root.after(25, self.tick); return
            pad = self.controller.sample()
            if pad != self.pad_mask:
                self.events.append({'device': 'controller', 'backend': self.controller.backend, 'mask': pad, 'time_ns': time.perf_counter_ns()}); self.pad_mask = pad
            mask = pad
            for key in self.held:
                gba = self.config['keyboard'].get(key)
                if gba: mask |= 1 << BUTTONS[gba]
            frame, audio, memory = self.core.step(mask); self.number += 1
            checkpoint = self.core.serialize() if self.number % self.config['checkpoint_interval'] == 0 else None
            self.capture.add(self.number, mask, frame, audio, memory, self.events, checkpoint)
            self.events.clear()
            from PIL import Image, ImageTk
            width, height, fmt, raw = frame
            image = rgb_image(raw, width, height, fmt)
            cw, ch = max(width, self.canvas.winfo_width()), max(height, self.canvas.winfo_height())
            scale = max(1, min(cw//width, ch//height)); size = (width*scale, height*scale)
            scaled = image.resize(size, Image.Resampling.NEAREST)
            if getattr(self, 'photo_size', None) != size:
                self.photo = ImageTk.PhotoImage(scaled); self.photo_size = size
                self.canvas.itemconfigure(self.picture, image=self.photo)
            else:
                self.photo.paste(scaled)
            self.canvas.coords(self.picture, (cw-size[0])//2, (ch-size[1])//2)
            if now-self.last_status > 1:
                self.status.set(f'Zajem: {self.number} • Controller: {self.controller.status} • zvok je utišan')
                diagnostics = self.controller.diagnostics()
                if diagnostics != self.saved_controller_diagnostics:
                    (self.capture.folder / 'controller-diagnostics.json').write_text(json.dumps(diagnostics, indent=2, ensure_ascii=False), encoding='utf-8')
                    self.saved_controller_diagnostics = diagnostics
                self.last_status = now
            self.deadline += 1/self.core.fps
            # No catch-up bursts and no discarded emulated frames when the window is suspended.
            if self.deadline < now-0.1: self.deadline = now
            self.root.after(max(1, int((self.deadline-time.perf_counter())*1000)), self.tick)
        except BaseException: self.fail()

    def finish(self):
        self.controller.close()
        if self.capture:
            capture, self.capture = self.capture, None
            capture.close()
        if self.core:
            core, self.core = self.core, None
            core.close()
        if self.timer:
            self.timer.timeEndPeriod(1); self.timer = None
    def restart(self):
        if self.closing: return
        try:
            # Invalidate the scheduled tick before opening the next recording.
            self.closing = True; self.finish(); self.root.destroy()
            os.execl(sys.executable, sys.executable, str(Path(__file__).resolve()))
        except BaseException: self.fail()
    def close(self):
        self.closing = True
        try: self.finish()
        except BaseException:
            from tkinter import messagebox
            messagebox.showerror('Zajem', traceback.format_exc())
        self.root.destroy()
    def fail(self):
        from tkinter import messagebox
        error = traceback.format_exc()
        (ROOT / 'last-error.txt').write_text(error, encoding='utf-8')
        messagebox.showerror('Eggo Mania — zajem', error)
        self.close()
    def run(self): self.root.mainloop()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--verify', type=Path)
    args = parser.parse_args()
    if args.verify: print(json.dumps(verify(args.verify), ensure_ascii=False))
    elif args.self_test: self_test(configuration())
    else:
        try:
            config = configuration()
            if not Path(config['rom']).is_file():
                import tkinter as tk
                from tkinter import filedialog
                root = tk.Tk(); root.withdraw()
                rom = filedialog.askopenfilename(title='Izberi svoj ROM Eggo Mania', filetypes=[('Game Boy Advance', '*.gba')])
                root.destroy()
                if not rom: sys.exit(0)
                config['rom'] = rom
            RecorderWindow(config).run()
        except BaseException:
            from tkinter import messagebox
            messagebox.showerror('Eggo Mania — zajem', traceback.format_exc())
