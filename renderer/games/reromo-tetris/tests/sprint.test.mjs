import test from 'node:test';
import assert from 'node:assert/strict';
import Game from '../game.js';
import { createDefaultSettings, getFrameworkSettingsSchema, settingsRecordKey } from '../settings.js';
import { TETRIS_MODES, formatSprintTime } from '../tetris-modes.js';
import { switchModeSettings } from '../../../core/ModeSettings.js';

test('Sprint stays selected across all six boards, defaults to 40, and separates records', () => {
    const original = createDefaultSettings();
    assert.equal(original.sprintLines, 40);
    assert.deepEqual(Game.getModeDefinitions().map(mode => mode.key), ['survival', 'sprint']);
    for (const mode of TETRIS_MODES) {
        const next = switchModeSettings({ ...original, ruleMode: 'sprint' }, mode, TETRIS_MODES, getFrameworkSettingsSchema(), 'circular');
        assert.equal(next.ruleMode, 'sprint');
        assert.notEqual(settingsRecordKey(next), settingsRecordKey({ ...next, ruleMode: 'survival' }));
    }
});

test('Sprint clock excludes pause gaps and finishing submits time once', () => {
    const game = Object.create(Game.prototype);
    const records = [];
    Object.assign(game, { settings: { ...createDefaultSettings(), ruleMode: 'sprint' },
        state: 'playing', sprintTick: null, sprintElapsed: 0, bestSprintSeconds: null, linesCleared: 40,
        invalidate() {}, _resetRepeats() {}, submitScore(value) { records.push(value); } });
    game._advanceSprintClock(1000); game._advanceSprintClock(3500);
    game.sprintTick = null;
    game._advanceSprintClock(20000); game._advanceSprintClock(21000);
    assert.equal(game.sprintElapsed, 3.5);
    game._advanceSprintClock = () => {};
    game._finishSprint(); game._finishSprint();
    assert.equal(game.state, 'won'); assert.equal(records.length, 1);
    assert.equal(records[0].timeSeconds, 3.5); assert.equal(records[0].score, undefined);
    assert.equal(formatSprintTime(65.25), '1:05.25');
});
