"""Window-only entry point: report startup/dependency errors even under pythonw."""
from pathlib import Path
import runpy
import traceback

try:
    runpy.run_path(str(Path(__file__).with_name('recorder.py')), run_name='__main__')
except Exception:
    import tkinter as tk
    from tkinter import messagebox
    error = traceback.format_exc()
    Path(__file__).with_name('last-error.txt').write_text(error, encoding='utf-8')
    root = tk.Tk(); root.withdraw()
    messagebox.showerror('Eggo Mania — zagon zajema ni uspel', error)
    root.destroy()
