import * as THREE from '../../../node_modules/three/build/three.module.js';
import { seededRandom } from './model.js';
import { POLYHEDRON_GEOMETRY, cleanPolygon, createPolyhedronPieces } from './polyhedron-geometry.js';
import { PUZZLE_PRESENTATION } from './puzzle-interaction.js';
import { BRIGHT_PALETTE } from './bright-palette.js';

const MODE_SPECS = Object.freeze({
    tetrahedron: Object.freeze({
        label: 'Rubik tetrahedron',
        geometry: 'tetrahedron',
        turnOrder: 3,
        axisKind: 'vertices',
        completeAxisLayers: true,
    }),
    octahedron: Object.freeze({
        label: 'Rubik octahedron',
        geometry: 'octahedron',
        turnOrder: 3,
        vertexTurnOrder: 4,
        axisKind: 'faces',
    }),
    dodecahedron: Object.freeze({
        label: 'Rubik dodecahedron',
        geometry: 'dodecahedron',
        turnOrder: 5,
        axisKind: 'faces',
    }),
    icosahedron: Object.freeze({
        label: 'Rubik icosahedron',
        geometry: 'icosahedron',
        // Five triangular faces meet at each turning vertex (72 degrees).
        turnOrder: 5,
        axisKind: 'vertices',
    }),
});

export const TWISTY_MODE_INFO = Object.freeze({
    cuboid: Object.freeze({ label: 'Rubik cuboid', icon: '🧊', sizeLabel: 'X × Y × Z' }),
    torus: Object.freeze({ label: 'Rubik torus', icon: '🍩', sizeLabel: 'Major × minor rings' }),
    tetrahedron: Object.freeze({ label: 'Rubik tetrahedron', icon: '🔺', sizeLabel: 'Cells per edge' }),
    octahedron: Object.freeze({ label: 'Rubik octahedron', icon: '🔷', sizeLabel: 'Cells per edge' }),
    dodecahedron: Object.freeze({ label: 'Rubik dodecahedron', icon: '⬟', sizeLabel: 'Layers from face' }),
    icosahedron: Object.freeze({ label: 'Rubik icosahedron', icon: '💠', sizeLabel: 'Cells per edge' }),
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function vectorKey(vector, precision = 10000) {
    return `${Math.round(vector.x * precision)},${Math.round(vector.y * precision)},${Math.round(vector.z * precision)}`;
}

function uniqueVectors(vectors, tolerance = 1e-8) {
    const unique = [];
    for (const vector of vectors) {
        if (!unique.some(candidate => candidate.distanceToSquared(vector) < tolerance)) {
            unique.push(vector.clone());
        }
    }
    return unique;
}

function baseGeometry(kind, radius) {
    if (kind === 'tetrahedron') return new THREE.TetrahedronGeometry(radius, 0);
    if (kind === 'octahedron') return new THREE.OctahedronGeometry(radius, 0);
    if (kind === 'dodecahedron') return new THREE.DodecahedronGeometry(radius, 0);
    return new THREE.IcosahedronGeometry(radius, 0);
}

function extractPolygonFaces(geometry) {
    const positions = geometry.attributes.position;
    const groups = [];
    for (let index = 0; index < positions.count; index += 3) {
        const vertices = [0, 1, 2].map(offset =>
            new THREE.Vector3().fromBufferAttribute(positions, index + offset)
        );
        const normal = new THREE.Vector3()
            .crossVectors(vertices[1].clone().sub(vertices[0]), vertices[2].clone().sub(vertices[0]))
            .normalize();
        if (normal.dot(vertices[0]) < 0) normal.negate();
        let group = groups.find(candidate => candidate.normal.dot(normal) > 0.99999);
        if (!group) {
            group = { normal, vertices: [] };
            groups.push(group);
        }
        group.vertices.push(...vertices);
    }

    return groups.map((group, faceIndex) => {
        const vertices = uniqueVectors(group.vertices);
        const center = vertices.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
            .multiplyScalar(1 / vertices.length);
        const basisU = vertices[0].clone().sub(center).normalize();
        const basisV = new THREE.Vector3().crossVectors(group.normal, basisU).normalize();
        vertices.sort((a, b) => {
            const relativeA = a.clone().sub(center);
            const relativeB = b.clone().sub(center);
            return Math.atan2(relativeA.dot(basisV), relativeA.dot(basisU))
                - Math.atan2(relativeB.dot(basisV), relativeB.dot(basisU));
        });
        return { faceIndex, normal: group.normal, center, vertices, basisU, basisV };
    });
}

function splitConvexPolygon(vertices, axis, threshold, epsilon = 1e-7) {
    const distances = vertices.map(vertex => vertex.dot(axis) - threshold);
    if (!distances.some(distance => distance > epsilon) || !distances.some(distance => distance < -epsilon)) {
        return [vertices];
    }
    const positive = [];
    const negative = [];
    for (let index = 0; index < vertices.length; index++) {
        const current = vertices[index];
        const next = vertices[(index + 1) % vertices.length];
        const currentDistance = current.dot(axis) - threshold;
        const nextDistance = next.dot(axis) - threshold;
        if (currentDistance >= -epsilon) positive.push(current.clone());
        if (currentDistance <= epsilon) negative.push(current.clone());
        if ((currentDistance > epsilon && nextDistance < -epsilon)
            || (currentDistance < -epsilon && nextDistance > epsilon)) {
            const fraction = currentDistance / (currentDistance - nextDistance);
            const intersection = current.clone().lerp(next, fraction);
            positive.push(intersection.clone());
            negative.push(intersection);
        }
    }
    const parts = [cleanPolygon(positive), cleanPolygon(negative)].filter(polygon => polygon.length >= 3);
    return parts.length ? parts : [vertices.map(vertex => vertex.clone())];
}

function cutThresholds(axes, faces, order, mode) {
    return axes.map(axis => {
        const projections = faces.flatMap(face => face.vertices.map(vertex => vertex.dot(axis)));
        const maximum = Math.max(...projections);
        const levels = [...projections]
            .sort((a, b) => b - a)
            .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 1e-6);
        const nextLevel = levels[1] ?? Math.min(...projections);
        // Minx cuts must stop BEFORE neighbouring bands meet halfway along
        // an edge. k cuts at j/(2k+1) leave 2k+1 equal edge segments and one
        // pentagonal centre, with 5k(k+1) quadrilaterals around it.
        const divisions = mode === 'dodecahedron' ? 2 * order - 1 : order;
        return Array.from({ length: Math.max(1, order - 1) }, (_, layer) =>
            maximum - (maximum - nextLevel) * (layer + 1) / divisions
        );
    });
}

function createFaceSlots(faces, axes, thresholds, radius) {
    const slots = [];
    for (const face of faces) {
        let polygons = [face.vertices.map(vertex => vertex.clone())];
        axes.forEach((axis, axisIndex) => {
            for (const threshold of thresholds[axisIndex]) {
                polygons = polygons.flatMap(polygon => splitConvexPolygon(polygon, axis, threshold));
            }
        });
        for (const polygon of polygons) {
            const center = polygon.reduce((sum, vertex) => sum.add(vertex), new THREE.Vector3())
                .multiplyScalar(1 / polygon.length);
            const liftedCenter = center.clone().addScaledVector(face.normal, radius * POLYHEDRON_GEOMETRY.stickerLiftPerRadius);
            const vertices = polygon.map(vertex =>
                liftedCenter.clone().add(vertex.clone().sub(center).multiplyScalar(POLYHEDRON_GEOMETRY.stickerScale))
            );
            slots.push({
                id: slots.length,
                faceIndex: face.faceIndex,
                homeColor: face.faceIndex,
                normal: face.normal.clone(),
                center: liftedCenter,
                surfaceCenter: center,
                polygon,
                vertices,
            });
        }
    }
    return slots;
}

function maximumAssignment(counts) {
    const size = counts.length;
    const u = Array(size + 1).fill(0);
    const v = Array(size + 1).fill(0);
    const p = Array(size + 1).fill(0);
    const way = Array(size + 1).fill(0);
    for (let row = 1; row <= size; row++) {
        p[0] = row;
        let column0 = 0;
        const minValue = Array(size + 1).fill(Infinity);
        const used = Array(size + 1).fill(false);
        do {
            used[column0] = true;
            const row0 = p[column0];
            let delta = Infinity;
            let column1 = 0;
            for (let column = 1; column <= size; column++) {
                if (used[column]) continue;
                const current = -counts[row0 - 1][column - 1] - u[row0] - v[column];
                if (current < minValue[column]) {
                    minValue[column] = current;
                    way[column] = column0;
                }
                if (minValue[column] < delta) {
                    delta = minValue[column];
                    column1 = column;
                }
            }
            for (let column = 0; column <= size; column++) {
                if (used[column]) {
                    u[p[column]] += delta;
                    v[column] -= delta;
                } else {
                    minValue[column] -= delta;
                }
            }
            column0 = column1;
        } while (p[column0] !== 0);

        do {
            const column1 = way[column0];
            p[column0] = p[column1];
            column0 = column1;
        } while (column0 !== 0);
    }
    let total = 0;
    for (let column = 1; column <= size; column++) {
        total += counts[p[column] - 1][column - 1];
    }
    return total;
}

export function facePalette(count) {
    if (count === 20) return BRIGHT_PALETTE.colours.map(hex => Number.parseInt(hex.slice(1), 16));
    const classic = [
        0xe53935, 0xff8f00, 0xf5f5f5, 0xfdd835, 0x43a047, 0x1e88e5,
        0x8e24aa, 0x00acc1, 0xb9ef70, 0xffb6c1, 0x6d4c41, 0xec407a,
    ];
    return Array.from({ length: count }, (_, index) => {
        if (index < classic.length) return classic[index];
        return new THREE.Color().setHSL(index / count, 0.72, 0.52).getHex();
    });
}

export class PolyhedronPuzzleModel {

    constructor(mode, order = 2, radius = 3) {
        if (!MODE_SPECS[mode]) throw new Error(`Unknown polyhedron mode: ${mode}`);
        this.mode = mode;
        this.spec = MODE_SPECS[mode];
        this.order = Math.round(Number(order));
        this.radius = radius;
        this.baseGeometry = baseGeometry(this.spec.geometry, radius);
        this.faces = extractPolygonFaces(this.baseGeometry);
        this.axes = this._createAxes();
        this.thresholds = cutThresholds(this.axes, this.faces, this.order, mode);
        if (mode === 'octahedron') {
            // Vertex-axis cuts coincide with the triangular surface grid,
            // but are different planes inside the solid. Include them in
            // the cubie partition so 90-degree turns move whole cubies.
            for (let index = this.faces.length; index < this.axes.length; index++) {
                this.thresholds[index] = Array.from({ length: 2 * this.order - 1 }, (_, cut) =>
                    this.radius * (1 - (cut + 1) / this.order));
            }
        }
        this.slots = createFaceSlots(this.faces, this.axes, this.thresholds, radius);
        this.pieces = createPolyhedronPieces(this.faces, this.slots, this.axes, this.thresholds, radius);
        this.colors = this.slots.map(slot => slot.homeColor);
        this.faceColors = facePalette(this.faces.length);
        this.maximumScore = this.slots.length;
        this.moves = this._createMoves();
        this.scrambleMoves = [];
    }

    _createAxes() {
        if (this.spec.axisKind === 'faces') {
            const axes = this.faces.map(face => face.normal.clone().normalize());
            if (this.mode === 'octahedron') {
                const vertexAxes = uniqueVectors(this.faces.flatMap(face => face.vertices))
                    .map(vertex => vertex.clone().normalize())
                    .filter(axis => axis.toArray().find(value => Math.abs(value) > 1e-6) > 0);
                axes.push(...vertexAxes);
            }
            return axes;
        }
        const vertices = uniqueVectors(this.faces.flatMap(face => face.vertices));
        return vertices.map(vertex => vertex.clone().normalize());
    }

    _createMoves() {
        const moves = [];
        const slotIndexByTransform = new Map(this.slots.map((slot, slotIndex) => [
            `${vectorKey(slot.center)}|${vectorKey(slot.normal)}`,
            slotIndex,
        ]));
        this.axes.forEach((axis, axisIndex) => {
            const vertexAxis = this.mode === 'octahedron' && axisIndex >= this.faces.length;
            const turnOrder = vertexAxis ? this.spec.vertexTurnOrder : this.spec.turnOrder;
            const layerCount = this.thresholds[axisIndex].length + (this.spec.completeAxisLayers || vertexAxis ? 1 : 0);
            for (let layer = 0; layer < layerCount; layer++) {
                const threshold = this.thresholds[axisIndex][layer] ?? -Infinity;
                const upperThreshold = layer === 0
                    ? Infinity
                    : this.thresholds[axisIndex][layer - 1];
                const selected = this.slots
                    .map((slot, slotIndex) => ({ slot, slotIndex }))
                    // A layer is one disjoint slab. The previous version used
                    // only the lower bound, so layer 1 also contained layer 0,
                    // layer 2 contained both, and a drag rotated the complete
                    // cap from that depth outward.
                    .filter(({ slot }) => {
                        const projection = slot.surfaceCenter.dot(axis);
                        return projection >= threshold - 1e-6
                            && projection < upperThreshold - 1e-6;
                    })
                    .map(({ slotIndex }) => slotIndex);
                const selectedSet = new Set(selected);
                const quaternion = new THREE.Quaternion().setFromAxisAngle(
                    axis,
                    Math.PI * 2 / turnOrder,
                );
                const destinationBySource = Array(this.slots.length).fill(-1);
                const unused = new Set(selected);
                for (const source of selected) {
                    const transformedCenter = this.slots[source].center.clone().applyQuaternion(quaternion);
                    const transformedNormal = this.slots[source].normal.clone().applyQuaternion(quaternion);
                    const transformedKey = `${vectorKey(transformedCenter)}|${vectorKey(transformedNormal)}`;
                    let bestDestination = slotIndexByTransform.get(transformedKey) ?? -1;
                    if (!unused.has(bestDestination)) {
                        bestDestination = -1;
                        let bestDistance = Infinity;
                        for (const destination of unused) {
                            if (!selectedSet.has(destination)) continue;
                            const target = this.slots[destination];
                            const distance = transformedCenter.distanceToSquared(target.center)
                                + (1 - transformedNormal.dot(target.normal)) * this.radius * this.radius;
                            if (distance < bestDistance) {
                                bestDistance = distance;
                                bestDestination = destination;
                            }
                        }
                    }
                    // A nearest colour slot is NOT a legal substitute for a
                    // geometrically congruent sticker. Check every vertex.
                    const target = this.slots[bestDestination];
                    const toleranceSquared = (this.radius * POLYHEDRON_GEOMETRY.epsilon * 4) ** 2;
                    if (!target || transformedCenter.distanceToSquared(target.center) > toleranceSquared
                        || transformedNormal.distanceToSquared(target.normal) > toleranceSquared
                        || target.polygon.length !== this.slots[source].polygon.length
                        || !this.slots[source].polygon.every(vertex => {
                            const rotated = vertex.clone().applyQuaternion(quaternion);
                            return target.polygon.some(point => point.distanceToSquared(rotated) <= toleranceSquared);
                        })) throw new Error(`Non-congruent ${this.mode} turn (axis ${axisIndex}, layer ${layer}).`);
                    destinationBySource[source] = bestDestination;
                    unused.delete(bestDestination);
                }
                const selectedPieces = [...new Set(selected.map(source => this.slots[source].pieceIndex))];
                for (const pieceIndex of selectedPieces) {
                    const piece = this.pieces[pieceIndex];
                    const destinations = new Set(piece.slots.map(source => this.slots[destinationBySource[source]]?.pieceIndex));
                    if (destinations.size !== 1 || destinations.has(undefined)) {
                        throw new Error('A layer turn would split a cubie.');
                    }
                }
                moves.push({
                    axisIndex,
                    turnOrder,
                    axis: axis.clone(),
                    layer,
                    threshold,
                    selected,
                    selectedSet,
                    selectedPieces,
                    destinationBySource,
                });
            }
        });
        return moves;
    }

    move(axisIndex, layer) {
        return this.moves.find(move => move.axisIndex === axisIndex && move.layer === layer) || null;
    }

    applyMove(axisIndex, layer, turns = 1) {
        const move = this.move(axisIndex, layer);
        if (!move) return false;
        const normalized = ((Math.trunc(turns) % move.turnOrder) + move.turnOrder) % move.turnOrder;
        if (normalized === 0) return false;
        for (let step = 0; step < normalized; step++) {
            const next = [...this.colors];
            for (const source of move.selected) {
                next[move.destinationBySource[source]] = this.colors[source];
            }
            this.colors = next;
        }
        return true;
    }

    candidatesForSlot(slotIndex) {
        const candidates = [];
        for (let axisIndex = 0; axisIndex < this.axes.length; axisIndex++) {
            const layers = this.moves.filter(move => move.axisIndex === axisIndex);
            const move = layers.find(candidate => candidate.selectedSet.has(slotIndex));
            if (!move) continue;
            const slot = this.slots[slotIndex];
            const velocity = new THREE.Vector3().crossVectors(move.axis, slot.surfaceCenter);
            // On a side face, swipe along the visible cut line. Projecting
            // the full 3D rotational velocity also includes motion out of
            // that face, which can select the wrong slice in oblique views.
            const tangent = new THREE.Vector3().crossVectors(move.axis, slot.normal);
            if (tangent.lengthSq() < 1e-8) tangent.copy(velocity);
            else if (tangent.dot(velocity) < 0) tangent.negate();
            if (tangent.lengthSq() < 1e-8) continue;
            candidates.push({
                axisIndex,
                layer: move.layer,
                axis: move.axis.clone(),
                tangent: tangent.normalize(),
                changesFace: this.slots[move.destinationBySource[slotIndex]].faceIndex !== slot.faceIndex,
                cornerTip: this.mode === 'octahedron' && move.turnOrder === 4 && move.selected.length === 4,
                move,
            });
        }
        // A grabbed sticker must leave its face. Merely preferring this
        // inside a screen-angle tolerance still allowed front-face turns.
        return candidates.filter(candidate => candidate.changesFace || candidate.cornerTip);
    }

    score() {
        const counts = Array.from({ length: this.faces.length }, () =>
            Array(this.faces.length).fill(0)
        );
        for (let slotIndex = 0; slotIndex < this.slots.length; slotIndex++) {
            counts[this.colors[slotIndex]][this.slots[slotIndex].faceIndex]++;
        }
        return maximumAssignment(counts);
    }

    inverseMoves(moves = this.scrambleMoves) {
        return moves.slice().reverse().map(move => ({ ...move, turns: -move.turns }));
    }

    scramble(seed) {
        const random = seededRandom(seed);
        const moveCount = Math.max(240, this.slots.length * 4, this.moves.length * 24);
        const moves = [];
        let previous = '';
        for (let index = 0; index < moveCount; index++) {
            let move;
            for (let attempt = 0; attempt < 20; attempt++) {
                move = this.moves[Math.floor(random() * this.moves.length)];
                if (`${move.axisIndex}:${move.layer}` !== previous) break;
            }
            const turns = random() < 0.5 ? 1 : -1;
            this.applyMove(move.axisIndex, move.layer, turns);
            moves.push({ axisIndex: move.axisIndex, layer: move.layer, turns });
            previous = `${move.axisIndex}:${move.layer}`;
        }
        this.scrambleMoves = moves;
        const verification = [...this.colors];
        for (const move of this.inverseMoves()) this.applyMove(move.axisIndex, move.layer, move.turns);
        this.scrambleVerified = this.colors.every((color, index) => color === this.slots[index].homeColor);
        this.colors = verification;
        if (!this.scrambleVerified) throw new Error(`${this.mode} scramble failed inverse verification.`);
        return moves;
    }
}

function torusReferenceColor(u, v, uCount, vCount) {
    return ((v % vCount + vCount) % vCount) * uCount + (u % uCount + uCount) % uCount;
}

export class TorusPuzzleModel {

    constructor(uCount = 12, vCount = 6, settings = {}) {
        this.uCount = Math.round(Number(uCount));
        this.vCount = Math.round(Number(vCount));
        this.slots = [];
        for (let v = 0; v < this.vCount; v++) {
            for (let u = 0; u < this.uCount; u++) {
                this.slots.push({
                    id: this.slots.length,
                    u,
                    v,
                    homeColor: torusReferenceColor(u, v, this.uCount, this.vCount),
                });
            }
        }
        this.colors = this.slots.map(slot => slot.homeColor);
        const value = key => Number(settings[key] ?? PUZZLE_PRESENTATION[key]);
        const low = value('torusLightnessMin') / 100;
        const high = value('torusLightnessMax') / 100;
        this.faceColors = this.slots.map(slot => new THREE.Color().setHSL(
            slot.u / this.uCount + value('torusHueOffset') / 360, value('torusSaturation') / 100,
            low + (high - low) * slot.v / (this.vCount - 1), THREE.SRGBColorSpace).getHex());
        this.maximumScore = this.slots.length;
        this.scrambleMoves = [];
    }

    index(u, v) {
        const wrappedU = (u % this.uCount + this.uCount) % this.uCount;
        const wrappedV = (v % this.vCount + this.vCount) % this.vCount;
        return wrappedV * this.uCount + wrappedU;
    }

    applyMove(axis, layer, turns = 1) {
        const next = [...this.colors];
        if (axis === 'u') {
            const row = clamp(Math.trunc(layer), 0, this.vCount - 1);
            for (let u = 0; u < this.uCount; u++) {
                next[this.index(u + turns, row)] = this.colors[this.index(u, row)];
            }
        } else if (axis === 'v') {
            const column = clamp(Math.trunc(layer), 0, this.uCount - 1);
            for (let v = 0; v < this.vCount; v++) {
                next[this.index(column, v + turns)] = this.colors[this.index(column, v)];
            }
        } else {
            return false;
        }
        this.colors = next;
        return true;
    }

    candidatesForSlot(slotIndex) {
        const slot = this.slots[slotIndex];
        return [
            { axis: 'u', layer: slot.v },
            { axis: 'v', layer: slot.u },
        ];
    }

    score() {
        // Every colour identifies one home cell. A solved torus may be
        // translated around either ring: count matching offsets in O(cells).
        const offsets = new Uint32Array(this.maximumScore);
        let best = 0;
        for (const slot of this.slots) {
            const home = this.colors[slot.id];
            const offset = this.index(home % this.uCount - slot.u, Math.floor(home / this.uCount) - slot.v);
            best = Math.max(best, ++offsets[offset]);
        }
        return best;
    }

    inverseMoves(moves = this.scrambleMoves) {
        return moves.slice().reverse().map(move => ({ ...move, turns: -move.turns }));
    }

    scramble(seed) {
        const random = seededRandom(seed);
        const moveCount = Math.max(300, this.maximumScore * 12);
        const moves = [];
        let previous = '';
        for (let index = 0; index < moveCount; index++) {
            const axis = random() < 0.5 ? 'u' : 'v';
            const layerCount = axis === 'u' ? this.vCount : this.uCount;
            let layer = Math.floor(random() * layerCount);
            for (let attempt = 0; attempt < 10 && `${axis}:${layer}` === previous; attempt++) {
                layer = Math.floor(random() * layerCount);
            }
            const turns = random() < 0.5 ? 1 : -1;
            this.applyMove(axis, layer, turns);
            moves.push({ axis, layer, turns });
            previous = `${axis}:${layer}`;
        }
        this.scrambleMoves = moves;
        const verification = [...this.colors];
        for (const move of this.inverseMoves()) this.applyMove(move.axis, move.layer, move.turns);
        this.scrambleVerified = this.colors.every((color, index) => color === this.slots[index].homeColor);
        this.colors = verification;
        if (!this.scrambleVerified) throw new Error('Torus scramble failed inverse verification.');
        return moves;
    }
}

export function disposePuzzleModel(model) {
    model?.baseGeometry?.dispose?.();
}

export function polyhedronModeSpec(mode) {
    return MODE_SPECS[mode] || null;
}
