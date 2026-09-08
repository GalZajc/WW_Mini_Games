import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import { PolyhedronPuzzleModel, TWISTY_MODE_INFO } from '../renderer/games/rubiks-cuboid/twisty-models.js';

function area(polygon) {
    let sum = 0;
    for (let index = 1; index < polygon.length - 1; index++) {
        sum += polygon[index].clone().sub(polygon[0])
            .cross(polygon[index + 1].clone().sub(polygon[0])).length() / 2;
    }
    return sum;
}

for (const mode of ['tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron']) {
    test(`${mode}: tiling covers each face and every turn moves congruent, whole cubies`, () => {
        for (let order = 2; order <= ({ tetrahedron: 7, octahedron: 6, dodecahedron: 5, icosahedron: 5 })[mode]; order++) {
            const model = new PolyhedronPuzzleModel(mode, order);
            const k = order - 1;
            for (const face of model.faces) {
                const slots = model.slots.filter(slot => slot.faceIndex === face.faceIndex);
                assert.equal(slots.length, mode === 'dodecahedron' ? 1 + 5 * k * (k + 1) : order * order);
                assert.ok(Math.abs(slots.reduce((sum, slot) => sum + area(slot.polygon), 0) - area(face.vertices)) < 1e-5);
                if (mode === 'dodecahedron') {
                    assert.equal(slots.filter(slot => slot.polygon.length === 5).length, 1);
                    assert.equal(slots.filter(slot => slot.polygon.length === 4).length, 5 * k * (k + 1));
                } else assert.ok(slots.every(slot => slot.polygon.length === 3));
            }
            for (const move of model.moves) {
                assert.ok(move.selected.length > 0 && move.selected.length < model.slots.length);
                const rotation = new THREE.Quaternion().setFromAxisAngle(move.axis, 2 * Math.PI / move.turnOrder);
                for (const source of move.selected) {
                    let destination = source;
                    for (let turn = 0; turn < move.turnOrder; turn++) destination = move.destinationBySource[destination];
                    assert.equal(destination, source, 'a full turn restores sticker identity, not just its colour');
                }
                for (const pieceIndex of move.selectedPieces) {
                    const piece = model.pieces[pieceIndex];
                    assert.ok(piece.slots.every(slot => move.selectedSet.has(slot)));
                    const destination = model.pieces[model.slots[move.destinationBySource[piece.slots[0]]].pieceIndex];
                    const targets = destination.faces.flat();
                    for (const vertex of piece.faces.flat()) {
                        const rotated = vertex.clone().applyQuaternion(rotation);
                        assert.ok(targets.some(point => point.distanceToSquared(rotated) < 1e-10), 'cut surfaces fit after rotation');
                    }
                }
            }
            for (const slot of model.slots) {
                for (const candidate of model.candidatesForSlot(slot.id)) {
                    assert.ok(Math.abs(candidate.tangent.dot(slot.normal)) < 1e-6, 'swipe stays in the touched face');
                }
            }
            if (mode === 'tetrahedron') {
                for (let axis = 0; axis < model.axes.length; axis++) {
                    const layers = model.moves.filter(move => move.axisIndex === axis);
                    assert.equal(layers.length, order);
                    assert.equal(new Set(layers.flatMap(move => move.selected)).size, model.slots.length);
                }
            }
            model.scramble(7300 + order);
            assert.ok(model.scrambleVerified);
            model.baseGeometry.dispose();
        }
    });
}
