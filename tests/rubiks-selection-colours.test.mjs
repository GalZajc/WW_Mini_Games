import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import { PolyhedronPuzzleModel, TorusPuzzleModel } from '../renderer/games/rubiks-cuboid/twisty-models.js';
import { TwistySurfaceMode } from '../renderer/games/rubiks-cuboid/twisty-surface-mode.js';
import Game from '../renderer/games/rubiks-cuboid/game.js';

function viewFor(mode) {
    const view = Object.create(TwistySurfaceMode.prototype);
    Object.assign(view, { mode, model: new PolyhedronPuzzleModel(mode, 3), settings: {},
        puzzleGroup: new THREE.Group(), dragPixelsPerStep: 40 });
    return view;
}

test('only octahedron asks for a slice; every octahedron tip wins all swipe directions', () => {
    for (const mode of ['tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron']) {
        const view = viewFor(mode);
        view._clearSliceChoice = () => {};
        view._applyAnimatedMove = () => {};
        for (const slot of view.model.slots) {
            const face = view.model.faces[slot.faceIndex];
            const candidates = view.model.candidatesForSlot(slot.id).map(candidate => ({ ...candidate,
                direction: new THREE.Vector2(candidate.tangent.dot(face.basisU), candidate.tangent.dot(face.basisV)) }));
            if (mode === 'octahedron' && !candidates.some(c => c.cornerTip)) continue;
            if (!candidates.some(c => c.direction.lengthSq() > 1e-8)) continue;
            for (let angle = 0; angle < 360; angle += 15) {
                view.drag = { startX: 0, startY: 0, candidates, chosen: null, appliedSteps: 0 };
                view._updateDrag(80 * Math.cos(angle * Math.PI / 180), 80 * Math.sin(angle * Math.PI / 180));
                assert.ok(view.drag.chosen, `${mode} slot ${slot.id} angle ${angle}`);
                assert.ok(!view.drag.choices, mode);
                if (mode === 'octahedron') assert.ok(view.drag.chosen.cornerTip);
            }
        }
        view.model.baseGeometry.dispose();
    }
});

test('polyhedron corner gaps never pick through the front hull', () => {
    const view = viewFor('tetrahedron');
    view.settings.faceColor0 = '#123456';
    view._createPuzzleMeshes();
    assert.equal(view.slotMeshes[0].material.color.getHex(), 0x123456);
    view.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    view.camera.position.set(5, 4, 7); view.camera.lookAt(0, 0, 0); view.camera.updateMatrixWorld(true);
    view.puzzleGroup.updateMatrixWorld(true);
    view.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 800 }) };
    view.raycaster = new THREE.Raycaster(); view.pointerNdc = new THREE.Vector2();
    let gaps = 0;
    for (const slot of view.model.slots) for (const vertex of slot.polygon) {
        const projected = vertex.clone().project(view.camera);
        const hit = view._pickSlot((projected.x + 1) * 400, (1 - projected.y) * 400);
        if (hit === null) { gaps++; continue; }
        const picked = view.model.slots[hit];
        assert.ok(picked.normal.dot(view.camera.position.clone().sub(picked.center)) > 0, 'must pick a front face');
    }
    assert.ok(gaps > 0);
});

test('torus has unique colours and scores translated solved states without arbitrary recolouring', () => {
    const model = new TorusPuzzleModel(12, 6);
    assert.equal(new Set(model.faceColors).size, model.maximumScore);
    assert.equal(model.score(), model.maximumScore);
    model.applyMove('u', 0, 1);
    assert.ok(model.score() < model.maximumScore);
    model.applyMove('u', 0, -1);
    for (let v = 0; v < model.vCount; v++) model.applyMove('u', v, 2);
    assert.equal(model.score(), model.maximumScore);
    model.colors = model.slots.map(slot => slot.homeColor);
    model.scramble(1234);
    assert.ok(model.scrambleVerified);
    assert.ok(model.score() < model.maximumScore);
    const schema = Game.getSettingsSchema();
    assert.deepEqual(schema.find(s => s.key === 'sliceGlowStyle').modes, ['octahedron']);
    assert.equal(schema.find(s => s.key === 'polyhedronOrder').max, undefined);
    for (const [mode, count] of Object.entries({ cuboid: 6, tetrahedron: 4, octahedron: 8, dodecahedron: 12, icosahedron: 20 })) {
        assert.equal(schema.filter(s => s.key.startsWith('faceColor') && s.modes.includes(mode)).length, count);
    }
});
