import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../node_modules/three/build/three.module.js';
import { chooseDragSlice, dragSliceChoices } from '../renderer/games/rubiks-cuboid/puzzle-interaction.js';
import { PolyhedronPuzzleModel } from '../renderer/games/rubiks-cuboid/twisty-models.js';
import { TwistySurfaceMode } from '../renderer/games/rubiks-cuboid/twisty-surface-mode.js';
import RubiksTwistyGame from '../renderer/games/rubiks-cuboid/game.js';

test('every face-crossing swipe remains reachable, including ambiguous octahedron/tetrahedron directions', () => {
    let crossingSwipes = 0;
    for (const mode of ['tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron']) {
        const model = new PolyhedronPuzzleModel(mode, 3);
        for (const slot of model.slots) {
            const face = model.faces[slot.faceIndex];
            const candidates = model.candidatesForSlot(slot.id).map(candidate => ({
                ...candidate,
                direction: new THREE.Vector2(candidate.tangent.dot(face.basisU), candidate.tangent.dot(face.basisV)).normalize(),
            }));
            for (const candidate of candidates.filter(candidate => candidate.changesFace)) {
                crossingSwipes++;
                assert.ok(candidates.every(other => other.changesFace || other.cornerTip), 'front-face candidates must be excluded before ranking');
                for (const sign of [-1, 1]) {
                    const selected = chooseDragSlice(candidates, sign * candidate.direction.x * 80, sign * candidate.direction.y * 80);
                    assert.ok(selected.changesFace, `${mode}: side-face rotation must win a tie`);
                    assert.ok(Math.abs(selected.direction.dot(candidate.direction)) > 0.99999);
                }
            }
        }
        model.baseGeometry.dispose();
    }
    assert.ok(crossingSwipes > 0, 'exercise real face-crossing directions');
});

test('surface and cuboid drag handlers lock the slice through sideways movement, origin and reversal', () => {
    for (const mode of ['tetrahedron', 'octahedron', 'dodecahedron', 'icosahedron', 'torus', 'cuboid']) {
        const cuboid = mode === 'cuboid';
        const game = Object.create(cuboid ? RubiksTwistyGame.prototype : TwistySurfaceMode.prototype);
        const direction = (x, y) => cuboid ? [x, y] : new THREE.Vector2(x, y);
        const candidates = [
            { axis: 'x', axisIndex: 0, layer: 0, direction: direction(1, 0), quarterTurnsAllowed: true },
            { axis: 'y', axisIndex: 1, layer: 1, direction: direction(0, 1), quarterTurnsAllowed: true },
        ];
        game.mode = mode;
        game.dragPixelsPerStep = game.dragPixelsPerQuarter = 30;
        const drag = { startX: 0, startY: 0, candidates, chosen: null, appliedSteps: 0 };
        const turns = [];
        let update;
        if (cuboid) {
            game.sliceDrag = drag;
            game._applyLiveSlicePreview = (_drag, candidate, steps) => turns.push({ candidate, steps });
            game._showLayerHelper = () => {};
            update = game._updateSliceDrag.bind(game);
        } else {
            game.drag = drag;
            game._applyAnimatedMove = (candidate, steps) => turns.push({ candidate, steps });
            update = game._updateDrag.bind(game);
        }
        update(0, 0);
        update(1, 2);
        assert.equal(drag.chosen, null, 'a click or jitter cannot choose a slice');
        update(60, 0);
        for (const [x, y] of [[0, 200], [0, 0], [-60, 0], [60, -200]]) {
            update(x, y);
            assert.equal(drag.chosen, candidates[0], mode);
        }
        assert.ok(turns.every(turn => turn.candidate === candidates[0]));
        assert.ok(turns.some(turn => turn.steps < 0), 'backward swipe still reverses the locked rotation');
    }
});

test('octahedron offers distinct crossing slices, merging equivalent opposite-axis moves', () => {
    const model = new PolyhedronPuzzleModel('octahedron', 3);
    let conflicts = 0;
    for (const slot of model.slots) {
        const face = model.faces[slot.faceIndex];
        const candidates = model.candidatesForSlot(slot.id).map(candidate => ({
            ...candidate,
            direction: new THREE.Vector2(candidate.tangent.dot(face.basisU), candidate.tangent.dot(face.basisV)).normalize(),
        }));
        for (const candidate of candidates.filter(candidate => candidate.changesFace)) {
            const choices = dragSliceChoices(candidates, candidate.direction.x * 40, candidate.direction.y * 40);
            assert.ok(choices.every(choice => choice.changesFace));
            if (choices.length > 1) conflicts++;
            for (let i = 0; i < choices.length; i++) for (let j = i + 1; j < choices.length; j++) {
                const a = choices[i].move, b = choices[j].move;
                assert.ok(Math.abs(a.axis.dot(b.axis)) < 0.99999 || a.selected.some(slot => !b.selectedSet.has(slot)));
            }
        }
    }
    assert.ok(conflicts > 0);
    model.baseGeometry.dispose();
});
