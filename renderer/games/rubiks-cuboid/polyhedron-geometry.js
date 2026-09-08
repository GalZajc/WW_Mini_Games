import * as THREE from '../../../node_modules/three/build/three.module.js';

export const POLYHEDRON_GEOMETRY = Object.freeze({
    epsilon: 1e-6,
    stickerScale: 0.925,
    stickerLiftPerRadius: 0.0025,
    stickerCornerFraction: 0.09,
    cornerSegments: 3,
    bodyScale: 0.998,
});

export function cleanPolygon(vertices, epsilon = POLYHEDRON_GEOMETRY.epsilon) {
    const result = [];
    for (const vertex of vertices) {
        if (!result.length || vertex.distanceToSquared(result.at(-1)) > epsilon * epsilon) {
            result.push(vertex);
        }
    }
    if (result.length > 1 && result[0].distanceToSquared(result.at(-1)) <= epsilon * epsilon) result.pop();
    // Clipping through an existing vertex must not leave zero-area stickers.
    for (let index = result.length - 1; index >= 0 && result.length >= 3; index--) {
        const before = result[(index + result.length - 1) % result.length];
        const point = result[index];
        const after = result[(index + 1) % result.length];
        const edge = after.clone().sub(before);
        if (edge.clone().cross(point.clone().sub(before)).length() <= epsilon * edge.length()) {
            result.splice(index, 1);
        }
    }
    return result.length >= 3 ? result : [];
}

function clipSolid(faces, axis, threshold, epsilon) {
    const kept = [];
    const cap = [];
    let removed = false;
    for (const face of faces) {
        const polygon = [];
        for (let index = 0; index < face.length; index++) {
            const a = face[index];
            const b = face[(index + 1) % face.length];
            const da = a.dot(axis) - threshold;
            const db = b.dot(axis) - threshold;
            if (da <= epsilon) polygon.push(a);
            else removed = true;
            if ((da < -epsilon && db > epsilon) || (da > epsilon && db < -epsilon)) {
                polygon.push(a.clone().lerp(b, da / (da - db)));
            }
        }
        const clean = cleanPolygon(polygon, epsilon);
        if (!clean.length) continue;
        kept.push(clean);
        for (const point of clean) {
            if (Math.abs(point.dot(axis) - threshold) <= epsilon
                && !cap.some(other => other.distanceToSquared(point) <= epsilon * epsilon)) cap.push(point);
        }
    }
    if (removed && cap.length >= 3) {
        const center = cap.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(cap.length);
        const u = cap[0].clone().sub(center).normalize();
        const v = axis.clone().cross(u);
        cap.sort((a, b) => {
            const pa = a.clone().sub(center), pb = b.clone().sub(center);
            return Math.atan2(pa.dot(v), pa.dot(u)) - Math.atan2(pb.dot(v), pb.dot(u));
        });
        const clean = cleanPolygon(cap, epsilon);
        if (clean.length) kept.push(clean);
    }
    return kept;
}

// A cubie is one cell of the SAME plane arrangement used for its stickers.
// Group by half-spaces, then close each cell with real planar cut surfaces.
// Only surface cubies need drawing; invisible internal cells are not built.
export function createPolyhedronPieces(faces, slots, axes, thresholds, radius) {
    const epsilon = POLYHEDRON_GEOMETRY.epsilon * radius;
    const planes = axes.flatMap((axis, axisIndex) => thresholds[axisIndex].map(threshold => ({ axis, threshold })));
    const byRegion = new Map();
    for (const slot of slots) {
        const signs = planes.map(plane => slot.surfaceCenter.dot(plane.axis) > plane.threshold ? 1 : -1);
        const key = signs.join(',');
        let piece = byRegion.get(key);
        if (!piece) {
            piece = { id: byRegion.size, signs, slots: [] };
            byRegion.set(key, piece);
        }
        piece.slots.push(slot.id);
        slot.pieceIndex = piece.id;
    }
    return [...byRegion.values()].map(piece => {
        let polygons = faces.map(face => face.vertices.map(vertex => vertex.clone()));
        planes.forEach((plane, index) => {
            const keep = -piece.signs[index];
            polygons = clipSolid(polygons, plane.axis.clone().multiplyScalar(keep), plane.threshold * keep, epsilon);
        });
        if (!polygons.length) throw new Error('Empty polyhedron cubie.');
        const vertices = polygons.flat();
        const center = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3()).divideScalar(vertices.length);
        return { id: piece.id, slots: piece.slots, faces: polygons, center };
    });
}

export function roundedSticker(vertices) {
    const { stickerCornerFraction: fraction, cornerSegments: segments } = POLYHEDRON_GEOMETRY;
    return vertices.flatMap((point, index) => {
        const before = point.clone().lerp(vertices[(index + vertices.length - 1) % vertices.length], fraction);
        const after = point.clone().lerp(vertices[(index + 1) % vertices.length], fraction);
        return Array.from({ length: segments + 1 }, (_, step) => {
            const t = step / segments;
            return before.clone().multiplyScalar((1 - t) ** 2)
                .addScaledVector(point, 2 * t * (1 - t)).addScaledVector(after, t * t);
        });
    });
}
