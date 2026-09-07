import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
    buildMobiusTemplate,
    encodeMobiusTemplate,
} from '../mobius-geometry.js';
import {
    GRID_PRESETS,
    mobiusTemplateCacheKey,
} from '../projection-cache.js';

const SUBDIVISIONS = 7;
const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(toolDirectory, '..', 'projection-presets');
await mkdir(outputDirectory, { recursive: true });

for (const { columns, rows } of GRID_PRESETS) {
    const key = mobiusTemplateCacheKey(rows, columns, SUBDIVISIONS);
    process.stdout.write(`Preparing ${columns} × ${rows}… `);
    const template = await buildMobiusTemplate({ rows, columns, subdivisions: SUBDIVISIONS });
    const encoded = encodeMobiusTemplate(template);
    await writeFile(path.join(outputDirectory, `${key}.bin`), new Uint8Array(encoded));
    console.log(`${(encoded.byteLength / 1024).toFixed(1)} KiB`);
}
