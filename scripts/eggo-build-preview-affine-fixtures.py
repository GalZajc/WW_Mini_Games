"""Build pixel references for every captured held-piece affine turn frame."""
from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FIXTURE = ROOT / 'tests/fixtures/eggo-preview-origin-oam-gba.json'
OUTLINE_DIR = ROOT / 'tests/fixtures'
FIXTURE_DIR = ROOT / 'tests/fixtures'
OUTPUT = ROOT / 'scripts/OUTPUT' / ('eggo-preview-affine_' + datetime.now().strftime('%Y-%m-%d_%H-%M-%S'))
SIZE = 64
CENTER = 32


def file_hash(path):
    return sha256(path.read_bytes()).hexdigest()


def display_green_levels():
    display = np.zeros(256, dtype=np.uint8)
    for green5 in range(32):
        source_level = int(green5 * 255 / 31)
        display_level = int((green5 * 2) * 255 / 63)
        display[source_level] = display_level
    for green8 in range(256):
        if display[green8] == 0 and green8 != 0:
            nearest5 = round(green8 * 31 / 255)
            display[green8] = display[int(nearest5 * 255 / 31)]
    return display


def transform(source, matrix, green_levels):
    pa, pb, pc, pd = matrix
    pixels = np.asarray(source, dtype=np.uint8)
    output = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    for y in range(SIZE):
        dy = y - CENTER
        for x in range(SIZE):
            dx = x - CENTER
            sx = CENTER + ((pa * dx + pb * dy) >> 8)
            sy = CENTER + ((pc * dx + pd * dy) >> 8)
            if 0 <= sx < SIZE and 0 <= sy < SIZE and pixels[sy, sx, 3]:
                output[y, x] = pixels[sy, sx]
                output[y, x, 1] = green_levels[output[y, x, 1]]
    return Image.fromarray(output, 'RGBA')


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source_data = json.loads(SOURCE_FIXTURE.read_text(encoding='utf-8'))
    matrices_by_orientation = source_data['clockwise_turn_matrices_by_start_orientation']
    green_levels = display_green_levels()
    captures = []
    source_hashes = {}
    contact_sheet_hashes = {}

    for orientation, matrices in enumerate(matrices_by_orientation):
        sheet = Image.new('RGBA', (len(matrices) * SIZE, 8 * SIZE), (0, 0, 0, 0))
        for kind in range(8):
            source_path = OUTLINE_DIR / f'eggo-piece-outline-kind{kind}-oam.png'
            source_hashes[source_path.name] = file_hash(source_path)
            source = Image.open(source_path).convert('RGBA')
            if source.size != (SIZE, SIZE):
                raise ValueError(f'{source_path.name} must be 64x64 pixels')
            frames = []
            for tick, matrix in enumerate(matrices, start=1):
                rendered = transform(source, matrix, green_levels)
                sheet.paste(rendered, ((tick - 1) * SIZE, kind * SIZE))
                frames.append({'tick': tick, 'matrix': matrix})
            captures.append({'orientation': orientation, 'kind': kind, 'frames': frames})

        name = f'eggo-preview-affine-orientation-{orientation}.png'
        fixture_path = FIXTURE_DIR / name
        output_path = OUTPUT / name
        sheet.save(fixture_path, optimize=True)
        sheet.save(output_path, optimize=True)
        contact_sheet_hashes[name] = file_hash(fixture_path)

    manifest = {
        'rom_sha256': source_data['rom_sha256'],
        'matrix_fixture': str(SOURCE_FIXTURE.relative_to(ROOT)).replace('\\', '/'),
        'matrix_fixture_sha256': file_hash(SOURCE_FIXTURE),
        'outline_source_sha256': source_hashes,
        'raster_rule': 'For each 64x64 destination pixel, sample around pixel (32,32) using the captured signed 8.8 matrix and arithmetic right shift; preserve source alpha and convert GBA RGB555 green to mGBA RGB565 display levels.',
        'hash_algorithm': 'sha256 over RGBA pixels, row-major',
        'captures': captures,
        'contact_sheets': [f'eggo-preview-affine-orientation-{i}.png' for i in range(4)],
        'contact_sheet_sha256': contact_sheet_hashes,
    }
    fixture_path = FIXTURE_DIR / 'eggo-preview-affine-pixels-gba.json'
    fixture_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (OUTPUT / 'parameters.json').write_text(json.dumps({
        'source_fixture': str(SOURCE_FIXTURE.relative_to(ROOT)).replace('\\', '/'),
        'source_fixture_sha256': file_hash(SOURCE_FIXTURE),
        'rom_sha256': source_data['rom_sha256'],
        'output_fixture': str(fixture_path.relative_to(ROOT)).replace('\\', '/'),
        'output_fixture_sha256': file_hash(fixture_path),
        'captures': len(captures),
        'frames_per_capture': len(matrices_by_orientation[0]),
        'output_directory': str(OUTPUT.relative_to(ROOT)).replace('\\', '/'),
    }, indent=2) + '\n', encoding='utf-8')
    print(OUTPUT)
    print('captures', len(captures), 'frames', sum(len(item['frames']) for item in captures))


if __name__ == '__main__':
    main()
