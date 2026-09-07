/**
 * Shared layout primitives for game widgets that sit around a board.
 *
 * A layout has eight named slots.  The `inner` slot is closest to the board;
 * an occupied `outer` slot is compacted into that position when its inner
 * partner is empty.  Keeping this module DOM free is intentional: camera
 * fitting and unit tests use the same calculations as the browser UI.
 */

export const WIDGET_SLOTS = Object.freeze([
    'top-left-inner',
    'top-left-outer',
    'bottom-left-inner',
    'bottom-left-outer',
    'top-right-inner',
    'top-right-outer',
    'bottom-right-inner',
    'bottom-right-outer',
]);

// Common aliases make the API pleasant to use from game code while the
// serialized representation remains stable and human readable.
export const SLOT_IDS = WIDGET_SLOTS;
export const LAYOUT_SLOTS = WIDGET_SLOTS;

export const WIDGET_SIDES = Object.freeze(['left', 'right']);
export const WIDGET_CORNERS = Object.freeze(['top', 'bottom']);
export const WIDGET_DEPTHS = Object.freeze(['inner', 'outer']);

export const SLOT_DEFINITIONS = Object.freeze(Object.fromEntries(
    WIDGET_SLOTS.map(id => {
        const [corner, side, depth] = id.split('-');
        return [id, Object.freeze({ id, corner, side, depth })];
    }),
));

const DEFAULT_ASSIGNMENTS = Object.freeze({
    // Keep the three groups distributed around the board on a fresh install.
    // Users can rearrange them in the shared editor.
    next: 'top-right-inner',
    stats: 'top-right-outer',
    controls: 'bottom-right-inner',
});

export const DEFAULT_WIDGET_ASSIGNMENTS = DEFAULT_ASSIGNMENTS;
export const DEFAULT_WIDGET_LAYOUT = Object.freeze({
    version: 1,
    assignments: DEFAULT_ASSIGNMENTS,
});

export const DEFAULT_LAYOUT_GAP = 6;

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback = 0) {
    return Math.max(0, finite(value, fallback));
}

/** Return a canonical slot id, accepting the camelCase form used by old saves. */
export function normalizeSlotId(value) {
    if (typeof value !== 'string') return null;
    const original = value.trim();
    const direct = original.toLowerCase();
    if (WIDGET_SLOTS.includes(direct)) return direct;

    const compact = direct.replace(/[_\s]+/g, '-').replace(/--+/g, '-');
    if (WIDGET_SLOTS.includes(compact)) return compact;

    const camel = original.replace(/[-_\s]+([a-z])/gi, (_, letter) => letter.toUpperCase());
    const aliases = {
        topLeftInner: 'top-left-inner',
        topLeftOuter: 'top-left-outer',
        bottomLeftInner: 'bottom-left-inner',
        bottomLeftOuter: 'bottom-left-outer',
        topRightInner: 'top-right-inner',
        topRightOuter: 'top-right-outer',
        bottomRightInner: 'bottom-right-inner',
        bottomRightOuter: 'bottom-right-outer',
    };
    if (aliases[camel]) return aliases[camel];
    const fromCamel = original
        .replace(/([a-z\d])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase();
    return WIDGET_SLOTS.includes(fromCamel) ? fromCamel : null;
}

function assignmentSource(raw) {
    if (!isObject(raw)) return {};
    if (isObject(raw.assignments)) return raw.assignments;
    if (isObject(raw.widgets)) return raw.widgets;
    // A compact object of { next: slot, stats: slot, ... } is also accepted.
    return raw;
}

/**
 * Normalize a serialized layout. Unknown groups are retained so a game can
 * add a widget without losing its saved placement, while invalid slot ids are
 * dropped and later filled from defaults.
 */
export function normalizeWidgetLayout(raw, {
    defaults = DEFAULT_WIDGET_ASSIGNMENTS,
    widgetIds = null,
} = {}) {
    const source = assignmentSource(raw);
    const fallback = isObject(defaults) ? defaults : DEFAULT_WIDGET_ASSIGNMENTS;
    const ids = widgetIds
        ? [...new Set(widgetIds.filter(id => typeof id === 'string' && id.length))]
        : [...new Set([...Object.keys(fallback), ...Object.keys(source)])];
    const assignments = {};
    for (const id of ids) {
        const value = normalizeSlotId(source[id] ?? fallback[id]);
        if (value) assignments[id] = value;
    }

    return {
        version: Number.isFinite(Number(raw?.version)) ? Number(raw.version) : 1,
        assignments,
    };
}

export function cloneWidgetLayout(raw, options) {
    return clone(normalizeWidgetLayout(raw, options));
}

export function slotDefinition(slot) {
    const id = normalizeSlotId(slot);
    return id ? SLOT_DEFINITIONS[id] : null;
}

function measurementFor(measuredWidgets, id, descriptor = null) {
    const source = measuredWidgets?.[id]
        || measuredWidgets?.find?.(entry => entry?.id === id)
        || descriptor?.measured
        || descriptor
        || {};
    return {
        width: positive(source.width ?? source.minWidth ?? source.outerWidth, 0),
        height: positive(source.height ?? source.minHeight ?? source.outerHeight, 0),
    };
}

function descriptorsById(widgets) {
    if (Array.isArray(widgets)) return Object.fromEntries(widgets
        .filter(widget => widget && typeof widget.id === 'string')
        .map(widget => [widget.id, widget]));
    return isObject(widgets) ? widgets : {};
}

/**
 * Compact inner/outer pairs independently at every board corner.
 *
 * The returned map is from *physical* slot id to group id.  This makes it
 * straightforward for a renderer to position a group and lets callers see
 * where an outer-only group ended up.
 */
export function compactWidgetSlots(assignments, {
    widgetIds = null,
    defaults = DEFAULT_WIDGET_ASSIGNMENTS,
} = {}) {
    const normalized = normalizeWidgetLayout(assignments, { widgetIds, defaults }).assignments;
    const result = {};
    for (const [id, slot] of Object.entries(normalized)) {
        // Invalid duplicate placements are resolved deterministically below.
        if (!result[slot]) result[slot] = id;
    }

    for (const corner of WIDGET_CORNERS) for (const side of WIDGET_SIDES) {
        const inner = `${corner}-${side}-inner`;
        const outer = `${corner}-${side}-outer`;
        if (!result[inner] && result[outer]) {
            result[inner] = result[outer];
            delete result[outer];
        }
    }
    return result;
}

/**
 * Return group -> physical slot after compaction. Groups whose requested slot
 * collided with an earlier group are left out rather than being placed twice.
 */
export function compactWidgetAssignments(assignments, options = {}) {
    const bySlot = compactWidgetSlots(assignments, options);
    return Object.fromEntries(Object.entries(bySlot).map(([slot, id]) => [id, slot]));
}

function stackWidth(corner, side, bySlot, measuredWidgets, descriptors, gap) {
    const inner = `${corner}-${side}-inner`;
    const outer = `${corner}-${side}-outer`;
    const first = bySlot[inner];
    const second = bySlot[outer];
    const firstWidth = first ? measurementFor(measuredWidgets, first, descriptors[first]).width : 0;
    const secondWidth = second ? measurementFor(measuredWidgets, second, descriptors[second]).width : 0;
    if (!first || !second) return firstWidth + secondWidth;
    return firstWidth + gap + secondWidth;
}

function normalizeBoard(board) {
    const value = board || {};
    const width = positive(value.width ?? value.size, 0);
    const height = positive(value.height ?? value.size, 0);
    return {
        x: finite(value.x, 0),
        y: finite(value.y, 0),
        width,
        height,
    };
}

/**
 * Calculate camera reservations without needing a DOM.
 *
 * `widgets` may be descriptors (`[{id, measured}]`) or an id -> descriptor
 * map. `measuredWidgets` can override descriptor dimensions and is convenient
 * for UI code that measures actual elements after fonts have loaded.
 */
export function computeWidgetReservations({
    widgets = [],
    assignments = DEFAULT_WIDGET_ASSIGNMENTS,
    measuredWidgets = {},
    gap = DEFAULT_LAYOUT_GAP,
} = {}) {
    const descriptors = descriptorsById(widgets);
    const ids = Object.keys(descriptors).length
        ? Object.keys(descriptors)
        : Object.keys(assignmentSource(assignments));
    const compacted = compactWidgetSlots(assignments, {
        widgetIds: ids.length ? ids : null,
    });
    const safeGap = positive(gap, DEFAULT_LAYOUT_GAP);
    const leftContentWidth = Math.max(
        stackWidth('top', 'left', compacted, measuredWidgets, descriptors, safeGap),
        stackWidth('bottom', 'left', compacted, measuredWidgets, descriptors, safeGap),
    );
    const rightContentWidth = Math.max(
        stackWidth('top', 'right', compacted, measuredWidgets, descriptors, safeGap),
        stackWidth('bottom', 'right', compacted, measuredWidgets, descriptors, safeGap),
    );
    // Reservations include the small board-to-widget gap. This lets callers
    // place the board at `margin + leftWidth` and leaves `rightWidth - gap`
    // as the widget content width for legacy HUD rectangles.
    const leftWidth = leftContentWidth > 0 ? leftContentWidth + safeGap : 0;
    const rightWidth = rightContentWidth > 0 ? rightContentWidth + safeGap : 0;
    return {
        leftWidth,
        rightWidth,
        leftContentWidth,
        rightContentWidth,
        gap: safeGap,
        assignments: compactWidgetAssignments(assignments, { widgetIds: ids.length ? ids : null }),
        slots: compacted,
    };
}

/**
 * Position every widget around the supplied board rectangle.
 *
 * Returned `widgets` is keyed by group id and contains the physical slot plus
 * an absolute rectangle. `positions` is an alias retained for small game
 * integrations that used that name during the initial shared-layout rollout.
 */
export function computeWidgetLayout({
    board,
    widgets = [],
    assignments = DEFAULT_WIDGET_ASSIGNMENTS,
    measuredWidgets = {},
    gap = DEFAULT_LAYOUT_GAP,
} = {}) {
    const rect = normalizeBoard(board);
    const descriptors = descriptorsById(widgets);
    const ids = Object.keys(descriptors).length
        ? Object.keys(descriptors)
        : Object.keys(assignmentSource(assignments));
    const reservations = computeWidgetReservations({
        widgets,
        assignments,
        measuredWidgets,
        gap,
    });
    const bySlot = reservations.slots;
    const placed = {};
    const slots = {};

    for (const [slot, id] of Object.entries(bySlot)) {
        const definition = SLOT_DEFINITIONS[slot];
        if (!definition || placed[id]) continue;
        const measured = measurementFor(measuredWidgets, id, descriptors[id]);
        const pairInner = `${definition.corner}-${definition.side}-inner`;
        const innerId = bySlot[pairInner];
        const innerWidth = innerId
            ? measurementFor(measuredWidgets, innerId, descriptors[innerId]).width
            : 0;
        const depthOffset = definition.depth === 'outer' && innerId
            ? innerWidth + reservations.gap
            : 0;
        const x = definition.side === 'left'
            ? rect.x - reservations.gap - measured.width - depthOffset
            : rect.x + rect.width + reservations.gap + depthOffset;
        const y = definition.corner === 'top'
            ? rect.y
            : rect.y + rect.height - measured.height;
        const position = {
            id,
            slot,
            side: definition.side,
            corner: definition.corner,
            depth: definition.depth,
            x,
            y,
            width: measured.width,
            height: measured.height,
        };
        placed[id] = position;
        slots[slot] = position;
    }

    return {
        board: rect,
        leftWidth: reservations.leftWidth,
        rightWidth: reservations.rightWidth,
        gap: reservations.gap,
        slots,
        widgets: placed,
        positions: placed,
        assignments: reservations.assignments,
        compactedAssignments: reservations.assignments,
    };
}

// Short aliases used by early consumers and useful in tests.
export const layoutWidgets = computeWidgetLayout;
export const computeLayout = computeWidgetLayout;
export const measureWidgetReservations = computeWidgetReservations;

/**
 * Convenience helper for callers that already have a board and measurements.
 */
export function widgetLayoutForBoard(board, widgets, assignments, measuredWidgets, options = {}) {
    return computeWidgetLayout({
        board,
        widgets,
        assignments,
        measuredWidgets,
        ...options,
    });
}

export default computeWidgetLayout;
