import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DEFAULT_LAYOUT_GAP,
    DEFAULT_WIDGET_LAYOUT,
    WIDGET_SLOTS,
    compactWidgetAssignments,
    compactWidgetSlots,
    computeWidgetLayout,
    computeWidgetReservations,
    normalizeSlotId,
} from '../renderer/core/WidgetLayout.js';
import {
    createDefaultSettings,
    normalizeSettings,
    settingsRecordKey,
} from '../renderer/games/reromo-tetris/settings.js';

const widgets = [
    { id: 'next', label: 'Next column' },
    { id: 'stats', label: 'Hold + score/lines' },
    { id: 'controls', label: 'Controls' },
];

const measurements = {
    next: { width: 70, height: 180 },
    stats: { width: 96, height: 220 },
    controls: { width: 112, height: 150 },
};

test('the shared layout exposes exactly eight corner slots', () => {
    assert.deepEqual(WIDGET_SLOTS, [
        'top-left-inner', 'top-left-outer',
        'bottom-left-inner', 'bottom-left-outer',
        'top-right-inner', 'top-right-outer',
        'bottom-right-inner', 'bottom-right-outer',
    ]);
    assert.equal(normalizeSlotId('topLeftInner'), 'top-left-inner');
    assert.equal(normalizeSlotId('bottom_right_outer'), 'bottom-right-outer');
});

test('an outer widget compacts toward the board when its inner slot is empty', () => {
    const slots = compactWidgetSlots({ next: 'top-left-outer' }, { widgetIds: ['next'] });
    assert.deepEqual(slots, { 'top-left-inner': 'next' });
    assert.deepEqual(
        compactWidgetAssignments({ next: 'top-left-outer' }, { widgetIds: ['next'] }),
        { next: 'top-left-inner' },
    );
});

test('inner and outer widths stack, while left/right reservations use corner maxima', () => {
    const result = computeWidgetReservations({
        widgets,
        assignments: {
            next: 'top-left-inner',
            stats: 'top-left-outer',
            controls: 'bottom-right-inner',
        },
        measuredWidgets: measurements,
    });
    assert.equal(result.leftWidth, measurements.next.width + DEFAULT_LAYOUT_GAP + measurements.stats.width + DEFAULT_LAYOUT_GAP);
    assert.equal(result.rightWidth, measurements.controls.width + DEFAULT_LAYOUT_GAP);
});

test('positions use the actual rectangular board and preserve the compacted slot', () => {
    const result = computeWidgetLayout({
        board: { x: 300, y: 100, width: 400, height: 700 },
        widgets,
        assignments: {
            next: 'top-right-outer',
            stats: 'bottom-left-outer',
            controls: 'bottom-right-inner',
        },
        measuredWidgets: measurements,
    });
    assert.equal(result.widgets.next.slot, 'top-right-inner');
    assert.equal(result.widgets.next.x, 300 + 400 + DEFAULT_LAYOUT_GAP);
    assert.equal(result.widgets.stats.slot, 'bottom-left-inner');
    assert.equal(result.widgets.stats.y, 100 + 700 - measurements.stats.height);
    assert.equal(result.widgets.controls.x, 300 + 400 + DEFAULT_LAYOUT_GAP);
});

test('Tetris layout defaults and preview sizes are normalized', () => {
    const defaults = createDefaultSettings();
    assert.deepEqual(defaults.widgetLayout, DEFAULT_WIDGET_LAYOUT);
    assert.equal(defaults.nextPreviewCellScale, 1);
    assert.equal(defaults.holdPreviewCellScale, 1);
    assert.equal(defaults.previewFramed, true);
    assert.equal(defaults.rockingFrameWidthCells, 0);
    assert.equal(defaults.rockingFrameHeadroomCells, 0);
    const normalized = normalizeSettings({
        ...defaults,
        nextPreviewCellScale: 2.3,
        holdPreviewCellScale: 0.7,
        widgetLayout: { assignments: { next: 'top-left-outer' } },
    });
    assert.equal(normalized.nextPreviewCellScale, 2.3);
    assert.equal(normalized.holdPreviewCellScale, 0.7);
    assert.equal(normalized.widgetLayout.assignments.next, 'top-left-outer');
});

test('layout and frame presentation settings do not split Tetris records', () => {
    const defaults = createDefaultSettings();
    const changed = {
        ...defaults,
        widgetLayout: { assignments: { next: 'bottom-left-inner' } },
        nextPreviewCellScale: 3,
        holdPreviewCellScale: 2,
        previewFramed: false,
        rockingFrameWidthCells: 8,
        rockingFrameHeadroomCells: 4,
    };
    assert.equal(settingsRecordKey(defaults), settingsRecordKey(changed));
});
