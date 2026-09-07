export const TAU = Math.PI * 2;
export const MOBIUS_SCREEN_ROTATION = -Math.PI / 2;
export const MOBIUS_TEMPLATE_VERSION = 1;

const MOBIUS_TEMPLATE_MAGIC = 0x54424F4D; // "MOBT" in little-endian bytes.
const MOBIUS_TEMPLATE_HEADER_WORDS = 12;
const MOBIUS_TEMPLATE_HEADER_BYTES = MOBIUS_TEMPLATE_HEADER_WORDS * 4;

export function positiveModulo(value, modulus) {
    return ((value % modulus) + modulus) % modulus;
}

/**
 * Standard Möbius embedding evaluated at t = u_eff.
 *
 * The game deliberately uses u_eff = 2u. Consequently the logical periodic
 * coordinate u traverses this embedding twice before returning to the same
 * logical field. That double traversal is part of the display contract and is
 * intentionally preserved here.
 */
export function mobiusPoint(t, v, radius) {
    const halfCos = Math.cos(t / 2);
    const ringRadius = radius + v * halfCos;
    return {
        x: ringRadius * Math.cos(t),
        y: ringRadius * Math.sin(t),
        z: v * Math.sin(t / 2),
    };
}

function mobiusDerivatives(t, v, radius) {
    const sinT = Math.sin(t);
    const cosT = Math.cos(t);
    const sinHalf = Math.sin(t / 2);
    const cosHalf = Math.cos(t / 2);
    const ringRadius = radius + v * cosHalf;
    const radiusDerivative = -0.5 * v * sinHalf;

    return {
        dt: {
            x: radiusDerivative * cosT - ringRadius * sinT,
            y: radiusDerivative * sinT + ringRadius * cosT,
            z: 0.5 * v * cosHalf,
        },
        dv: {
            x: cosHalf * cosT,
            y: cosHalf * sinT,
            z: sinHalf,
        },
    };
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
}

function rotateAroundZ(point, angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return {
        x: point.x * cosine - point.y * sine,
        y: point.x * sine + point.y * cosine,
        z: point.z,
    };
}

function project(point, centerX, centerY, cameraDistance, focalLength) {
    const rotated = rotateAroundZ(point, MOBIUS_SCREEN_ROTATION);
    const depth = Math.max(1e-6, cameraDistance + rotated.z);
    return {
        x: centerX + rotated.x * focalLength / depth,
        y: centerY - rotated.y * focalLength / depth,
        depth,
    };
}

function quadraticControl(start, midpoint, end) {
    // A quadratic Bezier reaches 1/4*start + 1/2*control + 1/4*end at t=0.5.
    return {
        x: 2 * midpoint.x - 0.5 * (start.x + end.x),
        y: 2 * midpoint.y - 0.5 * (start.y + end.y),
    };
}

function projectedBoundary({
    t0,
    t1,
    v,
    segments,
    radius,
    centerX,
    centerY,
    cameraDistance,
    focalLength,
}) {
    const points = [];
    const controls = [];
    for (let segment = 0; segment <= segments; segment++) {
        const t = t0 + (t1 - t0) * segment / segments;
        points.push(project(
            mobiusPoint(t, v, radius),
            centerX,
            centerY,
            cameraDistance,
            focalLength,
        ));
        if (segment === segments) continue;
        const nextT = t0 + (t1 - t0) * (segment + 1) / segments;
        const midpoint = project(
            mobiusPoint((t + nextT) / 2, v, radius),
            centerX,
            centerY,
            cameraDistance,
            focalLength,
        );
        const end = project(
            mobiusPoint(nextT, v, radius),
            centerX,
            centerY,
            cameraDistance,
            focalLength,
        );
        controls.push(quadraticControl(points[points.length - 1], midpoint, end));
    }
    return { points, controls };
}

/**
 * Build the projected patches once. For an even number of angular fields, the
 * two halves of the logical double cover have exactly coincident geometry, so
 * one physical patch stores both logical preimages. With an odd field count no
 * cell boundary has an exact partner half a logical turn away; in that case we
 * cache the complete 0..4pi traversal instead of changing the gameplay grid.
 */
export function buildMobiusMesh({
    x = 0,
    y = 0,
    size,
    rows,
    columns,
    subdivisions = 6,
}) {
    if (!Number.isInteger(rows) || rows <= 0) throw new Error('rows must be a positive integer');
    if (!Number.isInteger(columns) || columns <= 0) throw new Error('columns must be a positive integer');
    if (!Number.isFinite(size) || size <= 0) throw new Error('size must be positive');

    const segmentCount = Math.max(2, Math.round(subdivisions));
    const paired = columns % 2 === 0;
    const physicalColumns = paired ? columns / 2 : columns;
    const traversalSpan = paired ? TAU : 2 * TAU;
    const radius = size * 0.36;
    const halfWidth = size * 0.12;
    const cameraDistance = size * 1.2;
    const focalLength = size * 1.2;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const patches = [];

    for (let physicalColumn = 0; physicalColumn < physicalColumns; physicalColumn++) {
        for (let row = 0; row < rows; row++) {
            const v0 = (-1 + 2 * row / rows) * halfWidth;
            const v1 = (-1 + 2 * (row + 1) / rows) * halfWidth;
            // Original display: u spans 0..2pi and t=u_eff=2u spans 0..4pi.
            // Subdivision samples make the boundary smooth, but all samples below
            // belong to ONE logical field. They are combined into one cached path;
            // they must never appear as extra gameplay cells or internal grid lines.
            const t0 = physicalColumn / physicalColumns * traversalSpan;
            const t1 = (physicalColumn + 1) / physicalColumns * traversalSpan;
            const tMiddle = (t0 + t1) / 2;
            const lower = projectedBoundary({
                t0, t1, v: v0, segments: segmentCount, radius,
                centerX, centerY, cameraDistance, focalLength,
            });
            const upper = projectedBoundary({
                t0, t1, v: v1, segments: segmentCount, radius,
                centerX, centerY, cameraDistance, focalLength,
            });

            const centerV = (v0 + v1) / 2;
            const centerPoint = mobiusPoint(tMiddle, centerV, radius);
            const projectedCenter = project(centerPoint, centerX, centerY, cameraDistance, focalLength);
            const derivatives = mobiusDerivatives(tMiddle, centerV, radius);
            const normal = cross(derivatives.dt, derivatives.dv);
            const viewVector = {
                x: -centerPoint.x,
                y: -centerPoint.y,
                z: -cameraDistance - centerPoint.z,
            };
            const normalLength = Math.max(1e-9, length(normal));
            const viewLength = Math.max(1e-9, length(viewVector));
            const facing = dot(normal, viewVector) / (normalLength * viewLength);

            const patch = {
                physicalColumn,
                row,
                slotA: physicalColumn,
                rowA: row,
                slotB: null,
                rowB: null,
                frontFacing: facing >= 0,
                facing: Math.abs(facing),
                depth: projectedCenter.depth,
                lower,
                upper,
            };
            if (paired) {
                patch.slotB = physicalColumn + physicalColumns;
                patch.rowB = rows - 1 - row;
                patch.frontIsA = patch.frontFacing;
            }
            patches.push(patch);
        }
    }

    // Camera is at z=-cameraDistance, so larger projected depth is farther away.
    patches.sort((a, b) => b.depth - a.depth);

    return {
        x,
        y,
        size,
        rows,
        columns,
        paired,
        physicalColumns,
        traversalSpan,
        subdivisions: segmentCount,
        logicalCellCount: rows * columns,
        projectedCellCount: patches.length,
        radius,
        halfWidth,
        cameraDistance,
        focalLength,
        patches,
    };
}

export function pairedMobiusPointError(t, v, radius) {
    const first = mobiusPoint(t, v, radius);
    const paired = mobiusPoint(t + TAU, -v, radius);
    return Math.hypot(first.x - paired.x, first.y - paired.y, first.z - paired.z);
}

function templateBoundaryOffset(template, physicalColumn, boundaryRow) {
    return (physicalColumn * (template.rows + 1) + boundaryRow) * template.boundaryStride;
}

function writeProjectedBoundary(target, offset, {
    t0,
    t1,
    v,
    segments,
    radius,
    centerX,
    centerY,
    cameraDistance,
    focalLength,
}) {
    const pointCount = segments + 1;
    const pointOffset = offset;
    const controlOffset = offset + pointCount * 2;

    for (let segment = 0; segment <= segments; segment++) {
        const t = t0 + (t1 - t0) * segment / segments;
        const point = project(
            mobiusPoint(t, v, radius),
            centerX,
            centerY,
            cameraDistance,
            focalLength,
        );
        target[pointOffset + segment * 2] = point.x;
        target[pointOffset + segment * 2 + 1] = point.y;
    }

    for (let segment = 0; segment < segments; segment++) {
        const startT = t0 + (t1 - t0) * segment / segments;
        const endT = t0 + (t1 - t0) * (segment + 1) / segments;
        const midpoint = project(
            mobiusPoint((startT + endT) / 2, v, radius),
            centerX,
            centerY,
            cameraDistance,
            focalLength,
        );
        const start = {
            x: target[pointOffset + segment * 2],
            y: target[pointOffset + segment * 2 + 1],
        };
        const end = {
            x: target[pointOffset + (segment + 1) * 2],
            y: target[pointOffset + (segment + 1) * 2 + 1],
        };
        const control = quadraticControl(start, midpoint, end);
        target[controlOffset + segment * 2] = control.x;
        target[controlOffset + segment * 2 + 1] = control.y;
    }
}

function browserYield() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Build a compact, window-size-independent representation of the projected
 * Möbius grid. Boundaries shared by two radial cells are stored once. The
 * template can therefore be cached on disk and scaled to any canvas size.
 */
export async function buildMobiusTemplate({
    rows,
    columns,
    subdivisions = 6,
    onProgress = null,
    yieldIntervalMs = 8,
}) {
    if (!Number.isInteger(rows) || rows <= 0) throw new Error('rows must be a positive integer');
    if (!Number.isInteger(columns) || columns <= 0) throw new Error('columns must be a positive integer');

    const segmentCount = Math.max(2, Math.round(subdivisions));
    const paired = columns % 2 === 0;
    const physicalColumns = paired ? columns / 2 : columns;
    const traversalSpan = paired ? TAU : 2 * TAU;
    const boundaryStride = (2 * segmentCount + 1) * 2;
    const boundaryCount = physicalColumns * (rows + 1);
    const patchCount = physicalColumns * rows;
    const boundaryData = new Float32Array(boundaryCount * boundaryStride);
    const depths = new Float32Array(patchCount);
    const signedFacings = new Float32Array(patchCount);

    // All physical quantities scale linearly with size, so size=1 produces a
    // normalized projection that remains exact after an affine screen scale.
    const radius = 0.36;
    const halfWidth = 0.12;
    const cameraDistance = 1.2;
    const focalLength = 1.2;
    const centerX = 0.5;
    const centerY = 0.5;
    const clock = globalThis.performance?.now ? () => performance.now() : () => Date.now();
    let lastYield = clock();

    for (let physicalColumn = 0; physicalColumn < physicalColumns; physicalColumn++) {
        const t0 = physicalColumn / physicalColumns * traversalSpan;
        const t1 = (physicalColumn + 1) / physicalColumns * traversalSpan;
        const tMiddle = (t0 + t1) / 2;

        for (let boundaryRow = 0; boundaryRow <= rows; boundaryRow++) {
            const v = (-1 + 2 * boundaryRow / rows) * halfWidth;
            writeProjectedBoundary(
                boundaryData,
                (physicalColumn * (rows + 1) + boundaryRow) * boundaryStride,
                {
                    t0,
                    t1,
                    v,
                    segments: segmentCount,
                    radius,
                    centerX,
                    centerY,
                    cameraDistance,
                    focalLength,
                },
            );
        }

        for (let row = 0; row < rows; row++) {
            const v0 = (-1 + 2 * row / rows) * halfWidth;
            const v1 = (-1 + 2 * (row + 1) / rows) * halfWidth;
            const centerV = (v0 + v1) / 2;
            const centerPoint = mobiusPoint(tMiddle, centerV, radius);
            const projectedCenter = project(centerPoint, centerX, centerY, cameraDistance, focalLength);
            const derivatives = mobiusDerivatives(tMiddle, centerV, radius);
            const normal = cross(derivatives.dt, derivatives.dv);
            const viewVector = {
                x: -centerPoint.x,
                y: -centerPoint.y,
                z: -cameraDistance - centerPoint.z,
            };
            const normalLength = Math.max(1e-9, length(normal));
            const viewLength = Math.max(1e-9, length(viewVector));
            const rawIndex = physicalColumn * rows + row;
            depths[rawIndex] = projectedCenter.depth;
            signedFacings[rawIndex] = dot(normal, viewVector) / (normalLength * viewLength);
        }

        onProgress?.((physicalColumn + 1) / physicalColumns * 0.9);
        if (clock() - lastYield >= yieldIntervalMs) {
            await browserYield();
            lastYield = clock();
        }
    }

    const sorted = Array.from({ length: patchCount }, (_, index) => index);
    sorted.sort((a, b) => depths[b] - depths[a]);
    const drawOrder = Uint32Array.from(sorted);
    onProgress?.(1);

    return {
        version: MOBIUS_TEMPLATE_VERSION,
        rows,
        columns,
        subdivisions: segmentCount,
        paired,
        physicalColumns,
        traversalSpan,
        boundaryStride,
        boundaryData,
        depths,
        signedFacings,
        drawOrder,
    };
}

/** Convert a normalized template to the compact binary disk-cache format. */
export function encodeMobiusTemplate(template) {
    const patchCount = template.physicalColumns * template.rows;
    const totalBytes = MOBIUS_TEMPLATE_HEADER_BYTES +
        template.boundaryData.byteLength +
        template.depths.byteLength +
        template.signedFacings.byteLength +
        template.drawOrder.byteLength;
    const buffer = new ArrayBuffer(totalBytes);
    const header = new Uint32Array(buffer, 0, MOBIUS_TEMPLATE_HEADER_WORDS);
    header[0] = MOBIUS_TEMPLATE_MAGIC;
    header[1] = MOBIUS_TEMPLATE_VERSION;
    header[2] = template.rows;
    header[3] = template.columns;
    header[4] = template.subdivisions;
    header[5] = template.physicalColumns;
    header[6] = template.paired ? 1 : 0;
    header[7] = template.boundaryStride;
    header[8] = template.boundaryData.length;
    header[9] = patchCount;
    header[10] = totalBytes;
    header[11] = 0;

    let offset = MOBIUS_TEMPLATE_HEADER_BYTES;
    new Float32Array(buffer, offset, template.boundaryData.length).set(template.boundaryData);
    offset += template.boundaryData.byteLength;
    new Float32Array(buffer, offset, patchCount).set(template.depths);
    offset += template.depths.byteLength;
    new Float32Array(buffer, offset, patchCount).set(template.signedFacings);
    offset += template.signedFacings.byteLength;
    new Uint32Array(buffer, offset, patchCount).set(template.drawOrder);
    return buffer;
}

/** Decode and strictly validate a disk-cached Möbius template. */
export function decodeMobiusTemplate(source, expected = {}) {
    const sourceBytes = source instanceof ArrayBuffer
        ? new Uint8Array(source)
        : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
    if (sourceBytes.byteLength < MOBIUS_TEMPLATE_HEADER_BYTES) {
        throw new Error('Möbius projection cache is truncated.');
    }
    const buffer = sourceBytes.buffer.slice(
        sourceBytes.byteOffset,
        sourceBytes.byteOffset + sourceBytes.byteLength,
    );
    const header = new Uint32Array(buffer, 0, MOBIUS_TEMPLATE_HEADER_WORDS);
    const [magic, version, rows, columns, subdivisions, physicalColumns, flags,
        boundaryStride, boundaryLength, patchCount, totalBytes] = header;
    if (magic !== MOBIUS_TEMPLATE_MAGIC || version !== MOBIUS_TEMPLATE_VERSION) {
        throw new Error('Möbius projection cache has an unsupported format.');
    }
    if (expected.rows !== undefined && rows !== expected.rows) throw new Error('Cached row count does not match.');
    if (expected.columns !== undefined && columns !== expected.columns) throw new Error('Cached column count does not match.');
    if (expected.subdivisions !== undefined && subdivisions !== expected.subdivisions) {
        throw new Error('Cached curve resolution does not match.');
    }
    const paired = Boolean(flags & 1);
    const expectedPhysicalColumns = paired ? columns / 2 : columns;
    const expectedStride = (2 * subdivisions + 1) * 2;
    const expectedBoundaryLength = expectedPhysicalColumns * (rows + 1) * expectedStride;
    const expectedPatchCount = expectedPhysicalColumns * rows;
    const expectedBytes = MOBIUS_TEMPLATE_HEADER_BYTES +
        expectedBoundaryLength * 4 + expectedPatchCount * 12;
    if (!Number.isInteger(rows) || rows <= 0 || !Number.isInteger(columns) || columns <= 0 ||
        physicalColumns !== expectedPhysicalColumns || boundaryStride !== expectedStride ||
        boundaryLength !== expectedBoundaryLength || patchCount !== expectedPatchCount ||
        totalBytes !== expectedBytes || buffer.byteLength !== expectedBytes) {
        throw new Error('Möbius projection cache has invalid dimensions.');
    }

    let offset = MOBIUS_TEMPLATE_HEADER_BYTES;
    const boundaryData = new Float32Array(buffer, offset, boundaryLength);
    offset += boundaryData.byteLength;
    const depths = new Float32Array(buffer, offset, patchCount);
    offset += depths.byteLength;
    const signedFacings = new Float32Array(buffer, offset, patchCount);
    offset += signedFacings.byteLength;
    const drawOrder = new Uint32Array(buffer, offset, patchCount);

    return {
        version,
        rows,
        columns,
        subdivisions,
        paired,
        physicalColumns,
        traversalSpan: paired ? TAU : 2 * TAU,
        boundaryStride,
        boundaryData,
        depths,
        signedFacings,
        drawOrder,
    };
}

/** Offset helper used by the renderer without exposing the cache layout twice. */
export function getMobiusTemplateBoundaryOffset(template, physicalColumn, boundaryRow) {
    return templateBoundaryOffset(template, physicalColumn, boundaryRow);
}
