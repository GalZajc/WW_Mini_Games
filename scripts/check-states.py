import struct
from pathlib import Path

def check_state(path_str):
    p = Path(path_str)
    if not p.exists():
        print(f'{path_str} does not exist')
        return
    data = p.read_bytes()
    # V mGBA savestate je EWRAM (256 KB) nekje znotraj
    # Poiščimo EWRAM signature ali pa naložimo skozi Core
    print(f'{p.name}: size={len(data)}')

check_state('tools/eggo-recorder/runtime/survival-hard.state')
check_state('tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/after-frame-00000300.state')
check_state('tools/eggo-recorder/OUTPUT/eggo-native-play_2026-10-19_20-00-57_091398/after-frame-00055800.state')
