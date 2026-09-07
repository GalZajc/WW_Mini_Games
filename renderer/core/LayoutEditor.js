import {
    DEFAULT_WIDGET_ASSIGNMENTS,
    WIDGET_SLOTS,
    SLOT_DEFINITIONS,
    compactWidgetAssignments,
    compactWidgetSlots,
    normalizeSlotId,
    normalizeWidgetLayout,
} from './WidgetLayout.js';

const FRAME_STEP = 0.1;
const MIN_SCALE = 0.25;
const MAX_SCALE = 8;

function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}

function snap(value, step = FRAME_STEP) {
    return Number((Math.round(value / step) * step).toFixed(6));
}

function safeWidgetId(widget, index) {
    const candidate = widget?.id ?? widget?.key ?? `widget-${index + 1}`;
    return String(candidate);
}

function normalizeWidgets(game, supplied) {
    const source = supplied || game?.getLayoutWidgets?.() || [];
    if (Array.isArray(source)) return source.map((widget, index) => ({
        ...widget,
        id: safeWidgetId(widget, index),
        label: widget?.label || widget?.title || safeWidgetId(widget, index),
    }));
    if (isObject(source)) return Object.entries(source).map(([id, widget]) => ({
        ...(isObject(widget) ? widget : {}),
        id,
        label: widget?.label || widget?.title || id,
    }));
    return [];
}

function sourceAssignments(settings, widgets) {
    const ids = widgets.map(widget => widget.id);
    const defaults = Object.fromEntries(widgets.map((widget, index) => [
        widget.id,
        normalizeSlotId(widget.defaultSlot || widget.slot)
            || Object.values(DEFAULT_WIDGET_ASSIGNMENTS)[index]
            || WIDGET_SLOTS[index % WIDGET_SLOTS.length],
    ]));
    const layout = settings?.widgetLayout || settings?.layout || settings?.widgets;
    return normalizeWidgetLayout(layout, { defaults, widgetIds: ids });
}

function readFrameValue(settings, key) {
    const value = Number(settings?.[key]);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Shared editor for widgets and optional rocking-platform frame bounds.
 *
 * The editor deliberately accepts a parent element instead of creating a
 * global overlay. The standard pause menu owns the panel lifecycle and can
 * therefore use this editor for every game that exposes `getLayoutWidgets`.
 */
export class LayoutEditor {
    constructor(parent, {
        game = null,
        settings = {},
        widgets = null,
        onApply = null,
        onCancel = null,
    } = {}) {
        if (!parent || typeof parent.appendChild !== 'function') {
            throw new TypeError('LayoutEditor requires a DOM parent element.');
        }
        this.parent = parent;
        this.game = game;
        this.widgets = normalizeWidgets(game, widgets);
        this.widgetIds = this.widgets.map(widget => widget.id);
        this.onApply = typeof onApply === 'function' ? onApply : () => {};
        this.onCancel = typeof onCancel === 'function' ? onCancel : () => {};
        this.settings = clone(settings || {});
        this._layout = sourceAssignments(this.settings, this.widgets);
        this._destroyed = false;
        this._dragId = null;
        this._frameDrag = null;
        this._previewFrame = 0;

        ensureStyles();
        this._render();
        this._bind();
        this._refreshSlots();
        this._refreshFramePreview();
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        cancelAnimationFrame(this._previewFrame);
        window.removeEventListener('pointermove', this._onFramePointerMove);
        window.removeEventListener('pointerup', this._onFramePointerUp);
        this.parent?.querySelectorAll('[data-layout-editor]')?.forEach(node => node.remove());
    }

    get value() {
        return clone(this._settingsValue());
    }

    apply() {
        if (this._destroyed) return;
        const value = this._settingsValue();
        this.onApply(clone(value));
    }

    cancel() {
        if (this._destroyed) return;
        this.onCancel();
    }

    _settingsValue() {
        const next = clone(this.settings || {});
        next.widgetLayout = {
            version: 1,
            assignments: compactWidgetAssignments(this._layout, { widgetIds: this.widgetIds }),
        };

        const nextScale = this._numberInput('nextPreviewCellScale');
        const holdScale = this._numberInput('holdPreviewCellScale');
        if (nextScale !== null) next.nextPreviewCellScale = nextScale;
        if (holdScale !== null) next.holdPreviewCellScale = holdScale;
        const framed = this.parent.querySelector('[data-preview-framed]');
        if (framed) next.previewFramed = Boolean(framed.checked);

        const width = this._numberInput('rockingFrameWidthCells');
        const headroom = this._numberInput('rockingFrameHeadroomCells');
        if (width !== null) next.rockingFrameWidthCells = width;
        if (headroom !== null) next.rockingFrameHeadroomCells = headroom;
        return next;
    }

    _numberInput(key) {
        const input = this.parent.querySelector(`[data-layout-setting="${key}"]`);
        if (!input) return null;
        const value = Number(input.value);
        if (key.startsWith('rockingFrame')) return snap(clamp(Number.isFinite(value) ? value : 0, 0, 256));
        return clamp(Number.isFinite(value) ? value : 1, MIN_SCALE, MAX_SCALE);
    }

    _render() {
        const frameEnabled = typeof this.game?.layoutPreview === 'function' && Boolean(this.game.layoutPreview());
        const scaleValue = value => clamp(finite(value, 1), MIN_SCALE, MAX_SCALE);
        const nextScale = scaleValue(this.settings.nextPreviewCellScale);
        const holdScale = scaleValue(this.settings.holdPreviewCellScale);
        const slotMarkup = WIDGET_SLOTS.map(slot => {
            const definition = SLOT_DEFINITIONS[slot];
            return `<div class="ww-layout-slot" data-layout-slot="${slot}" tabindex="0" role="listbox" aria-label="${definition.corner} ${definition.side} ${definition.depth}">
                <span class="ww-layout-slot-label">${definition.corner} ${definition.side} · ${definition.depth}</span>
                <div class="ww-layout-slot-items" data-layout-slot-items></div>
            </div>`;
        }).join('');
        const widgetMarkup = this.widgets.map(widget => `
            <article class="ww-layout-widget-card" data-layout-widget-card="${widget.id}" draggable="true" tabindex="0">
                <span class="ww-layout-drag-icon" aria-hidden="true">⋮⋮</span>
                <span class="ww-layout-widget-name">${escapeHtml(widget.label)}</span>
                <select data-layout-widget-select="${widget.id}" aria-label="Slot for ${escapeHtml(widget.label)}"></select>
            </article>
        `).join('');
        this.parent.insertAdjacentHTML('beforeend', `
            <section class="ww-layout-editor" data-layout-editor>
                <div class="ww-layout-editor-intro">
                    <h3>Arrange game widgets</h3>
                    <p>Drag a group to one of the eight board corners. The inner position is closest to the board.</p>
                </div>
                <div class="ww-layout-editor-body">
                    <div class="ww-layout-groups" data-layout-groups>
                        <h4>Groups</h4>
                        ${widgetMarkup || '<p class="ww-layout-empty">This game has no configurable widgets.</p>'}
                    </div>
                    <div class="ww-layout-board-map" data-layout-board-map role="listbox" aria-label="Widget slots">
                        <div class="ww-layout-board-map-center">BOARD</div>
                        ${slotMarkup}
                    </div>
                </div>
                ${this.widgetIds.includes('next') || this.widgetIds.includes('stats') ? `<div class="ww-layout-size-settings">
                    <h4>Preview size</h4>
                    <label>Next cell scale × <input type="number" min="${MIN_SCALE}" max="${MAX_SCALE}" step="0.1" data-layout-setting="nextPreviewCellScale" value="${nextScale}"></label>
                    <label>Hold cell scale × <input type="number" min="${MIN_SCALE}" max="${MAX_SCALE}" step="0.1" data-layout-setting="holdPreviewCellScale" value="${holdScale}"></label>
                    <label class="ww-layout-checkbox"><input type="checkbox" data-preview-framed ${this.settings.previewFramed !== false ? 'checked' : ''}> Frame preview boxes</label>
                </div>` : ''}
                ${frameEnabled ? `
                    <div class="ww-layout-rocking" data-layout-rocking>
                        <h4>Rocking frame</h4>
                        <p>Drag the side edges to set a symmetric frame width. Drag the top edge to set headroom. 0 means automatic.</p>
                        <div class="ww-layout-rocking-preview-wrap"><canvas class="ww-layout-rocking-preview" data-rocking-preview width="640" height="300"></canvas></div>
                        <div class="ww-layout-rocking-fields">
                            <label>Frame width (cells) <input type="number" min="0" step="0.1" data-layout-setting="rockingFrameWidthCells" value="${readFrameValue(this.settings, 'rockingFrameWidthCells')}"></label>
                            <label>Headroom (cells) <input type="number" min="0" step="0.1" data-layout-setting="rockingFrameHeadroomCells" value="${readFrameValue(this.settings, 'rockingFrameHeadroomCells')}"></label>
                        </div>
                    </div>
                ` : ''}
                <footer class="ww-layout-editor-actions">
                    <button type="button" data-layout-cancel>Cancel</button>
                    <button type="button" class="primary" data-layout-apply>Apply</button>
                </footer>
            </section>
        `);
    }

    _bind() {
        this.root = this.parent.querySelector('[data-layout-editor]:last-of-type')
            || this.parent.querySelector('[data-layout-editor]');
        if (!this.root) return;
        this._onFramePointerMove = event => this._handleFramePointerMove(event);
        this._onFramePointerUp = event => this._handleFramePointerUp(event);

        this.root.querySelectorAll('[data-layout-widget-card]').forEach(card => {
            card.addEventListener('dragstart', event => {
                this._dragId = card.dataset.layoutWidgetCard;
                event.dataTransfer?.setData('text/plain', this._dragId);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
            });
            card.addEventListener('dragend', () => { this._dragId = null; });
            card.addEventListener('keydown', event => {
                if (/^[1-8]$/.test(event.key)) {
                    const index = Number(event.key) - 1;
                    this._assign(this._dragIdForCard(card), WIDGET_SLOTS[index]);
                    event.preventDefault();
                }
            });
        });

        this.root.querySelectorAll('[data-layout-slot]').forEach(slot => {
            slot.addEventListener('dragover', event => {
                event.preventDefault();
                event.currentTarget.classList.add('drag-over');
                if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
            });
            slot.addEventListener('dragleave', event => event.currentTarget.classList.remove('drag-over'));
            slot.addEventListener('drop', event => {
                event.preventDefault();
                event.currentTarget.classList.remove('drag-over');
                const id = event.dataTransfer?.getData('text/plain') || this._dragId;
                this._assign(id, event.currentTarget.dataset.layoutSlot);
            });
            slot.addEventListener('keydown', event => {
                if (!this._dragId || !['Enter', ' '].includes(event.key)) return;
                this._assign(this._dragId, slot.dataset.layoutSlot);
                event.preventDefault();
            });
        });

        this.root.querySelectorAll('[data-layout-widget-select]').forEach(select => {
            select.addEventListener('change', () => this._assign(select.dataset.layoutWidgetSelect, select.value));
        });
        this.root.querySelector('[data-layout-cancel]')?.addEventListener('click', () => this.cancel());
        this.root.querySelector('[data-layout-apply]')?.addEventListener('click', () => this.apply());
        this.root.querySelectorAll('[data-layout-setting]').forEach(input => {
            input.addEventListener('input', () => {
                if (input.dataset.layoutSetting?.startsWith('rockingFrame')) this._scheduleFramePreview();
            });
            input.addEventListener('change', () => this._scheduleFramePreview());
        });

        const canvas = this.root.querySelector('[data-rocking-preview]');
        if (canvas) {
            canvas.addEventListener('pointerdown', event => this._handleFramePointerDown(event));
        }
    }

    _dragIdForCard(card) {
        return card?.dataset.layoutWidgetCard || null;
    }

    _assign(id, slot) {
        if (!id || !this.widgetIds.includes(id)) return;
        const normalized = normalizeSlotId(slot);
        if (!normalized) return;
        this._layout.assignments[id] = normalized;
        this._refreshSlots();
    }

    _refreshSlots() {
        if (!this.root) return;
        const physical = compactWidgetSlots(this._layout, { widgetIds: this.widgetIds });
        this.root.querySelectorAll('[data-layout-slot]').forEach(slot => {
            const id = physical[slot.dataset.layoutSlot];
            const items = slot.querySelector('[data-layout-slot-items]');
            if (!items) return;
            items.innerHTML = id
                ? `<span class="ww-layout-slot-widget" data-layout-slot-widget="${id}">${escapeHtml(this.widgets.find(widget => widget.id === id)?.label || id)}</span>`
                : '<span class="ww-layout-slot-empty">Drop here</span>';
            slot.classList.toggle('occupied', Boolean(id));
            slot.setAttribute('aria-selected', id ? 'true' : 'false');
        });
        this.root.querySelectorAll('[data-layout-widget-select]').forEach(select => {
            const id = select.dataset.layoutWidgetSelect;
            select.innerHTML = WIDGET_SLOTS.map((slot, index) => `<option value="${slot}">${index + 1}. ${slot}</option>`).join('');
            select.value = this._layout.assignments[id] || WIDGET_SLOTS[0];
        });
    }

    _scheduleFramePreview() {
        if (this._previewFrame) return;
        this._previewFrame = requestAnimationFrame(() => {
            this._previewFrame = 0;
            this._refreshFramePreview();
        });
    }

    _frameValues() {
        return {
            widthCells: this._numberInput('rockingFrameWidthCells') ?? 0,
            headroomCells: this._numberInput('rockingFrameHeadroomCells') ?? 0,
        };
    }

    _refreshFramePreview() {
        const canvas = this.root?.querySelector('[data-rocking-preview]');
        if (!canvas || typeof this.game?.layoutPreview !== 'function') return;
        const values = this._frameValues();
        let preview;
        try {
            preview = this.game.layoutPreview(values);
        } catch (error) {
            console.warn('Could not render the rocking frame preview:', error);
            return;
        }
        this._frameData = preview || null;
        this._drawFramePreview(canvas, preview);
    }

    _drawFramePreview(canvas, preview) {
        const context = canvas.getContext?.('2d');
        if (!context) return;
        const width = canvas.width, height = canvas.height;
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#11121b';
        context.fillRect(0, 0, width, height);
        if (!preview) {
            context.fillStyle = '#88889b';
            context.font = '12px sans-serif';
            context.fillText('Rocking frame preview unavailable', 15, 24);
            return;
        }

        const points = pointList(preview.gridCorners);
        const platform = pointList(preview.platformArc || preview.platform);
        const all = [...points, ...platform].filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
        const bounds = preview.frameBounds && numericBounds(preview.frameBounds);
        const minX = bounds?.minX ?? Math.min(...all.map(point => point.x), -1);
        const maxX = bounds?.maxX ?? Math.max(...all.map(point => point.x), 1);
        const minY = bounds?.minY ?? Math.min(...all.map(point => point.y), -1);
        const maxY = bounds?.maxY ?? Math.max(...all.map(point => point.y), 1);
        const pad = 30;
        const initialScale = Math.max(1, Math.min((width - 2 * pad) / Math.max(1e-6, maxX - minX),
            (height - 2 * pad) / Math.max(1e-6, maxY - minY)));
        // The preview follows the same fixed-camera rule as gameplay.
        this._previewCamera ||= { scale: initialScale, originX: width / 2,
            originY: height - pad - finite(preview.groundY, maxY) * initialScale };
        const { scale, originX, originY } = this._previewCamera;
        const map = point => ({
            x: originX + point.x * scale,
            y: originY + point.y * scale,
        });
        const path = (list, close = false) => {
            if (!list.length) return;
            context.beginPath();
            list.forEach((point, index) => {
                const mapped = map(point);
                if (index) context.lineTo(mapped.x, mapped.y);
                else context.moveTo(mapped.x, mapped.y);
            });
            if (close) context.closePath();
            context.stroke();
        };
        context.strokeStyle = '#707089';
        context.lineWidth = 1;
        path(points, true);
        if (points.length === 4) {
            const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
            context.lineWidth = 0.5;
            for (let column = 1; column < preview.columns; column++)
                path([mix(points[0], points[1], column / preview.columns), mix(points[3], points[2], column / preview.columns)]);
            for (let row = 1; row < preview.rows; row++)
                path([mix(points[0], points[3], row / preview.rows), mix(points[1], points[2], row / preview.rows)]);
        }
        context.strokeStyle = '#6dd5ed';
        context.lineWidth = 3;
        path(platform);

        const groundY = finite(preview.groundY, minY);
        context.strokeStyle = '#3a3a52';
        context.lineWidth = 1;
        path([{ x: minX, y: groundY }, { x: maxX, y: groundY }]);

        const frame = frameEdges(preview, minX, maxX, minY, maxY);
        context.strokeStyle = '#f0b85b';
        context.lineWidth = 2;
        path([{ x: frame.left, y: frame.bottom }, { x: frame.left, y: frame.top }]);
        path([{ x: frame.right, y: frame.bottom }, { x: frame.right, y: frame.top }]);
        path([{ x: frame.left, y: frame.top }, { x: frame.right, y: frame.top }]);
        for (const handle of [
            { x: frame.left, y: (frame.top + frame.bottom) / 2, kind: 'left' },
            { x: frame.right, y: (frame.top + frame.bottom) / 2, kind: 'right' },
            { x: (frame.left + frame.right) / 2, y: frame.top, kind: 'top' },
        ]) {
            const mapped = map(handle);
            context.fillStyle = '#f0b85b';
            context.beginPath();
            context.arc(mapped.x, mapped.y, 6, 0, Math.PI * 2);
            context.fill();
            context.fillStyle = '#11121b';
            context.font = 'bold 8px sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(handle.kind[0].toUpperCase(), mapped.x, mapped.y);
        }
        context.textAlign = 'left';
        context.textBaseline = 'alphabetic';
        this._frameCanvasTransform = { minX, maxX, minY, maxY, pad, scale, height, originX, originY };
    }

    _handleFramePointerDown(event) {
        if (!this._frameData || !this._frameCanvasTransform) return;
        const canvas = event.currentTarget;
        const point = canvasPoint(event, canvas);
        const world = this._canvasToWorld(point);
        const frame = frameEdges(this._frameData,
            this._frameCanvasTransform.minX,
            this._frameCanvasTransform.maxX,
            this._frameCanvasTransform.minY,
            this._frameCanvasTransform.maxY);
        const threshold = 12 / this._frameCanvasTransform.scale;
        let kind = null;
        if (Math.abs(world.x - frame.left) <= threshold) kind = 'left';
        else if (Math.abs(world.x - frame.right) <= threshold) kind = 'right';
        else if (Math.abs(world.y - frame.top) <= threshold && world.x >= frame.left - threshold && world.x <= frame.right + threshold) kind = 'top';
        if (!kind) return;
        this._frameDrag = { kind, centerX: (frame.left + frame.right) / 2, groundY: finite(this._frameData.groundY, frame.bottom), frame };
        canvas.setPointerCapture?.(event.pointerId);
        window.addEventListener('pointermove', this._onFramePointerMove);
        window.addEventListener('pointerup', this._onFramePointerUp, { once: true });
        event.preventDefault();
    }

    _handleFramePointerMove(event) {
        if (!this._frameDrag) return;
        const canvas = this.root?.querySelector('[data-rocking-preview]');
        if (!canvas) return;
        const world = this._canvasToWorld(canvasPoint(event, canvas));
        const drag = this._frameDrag;
        if (drag.kind === 'top') {
            const headroom = Math.max(0, snap(-Number(this._frameData.rows) - world.y));
            this._setNumberInput('rockingFrameHeadroomCells', headroom);
        } else {
            const half = Math.max(0, drag.kind === 'right'
                ? world.x - drag.centerX
                : drag.centerX - world.x);
            this._setNumberInput('rockingFrameWidthCells', Math.max(0, snap(half * 2)));
        }
        this._scheduleFramePreview();
        event.preventDefault();
    }

    _handleFramePointerUp() {
        this._frameDrag = null;
        window.removeEventListener('pointermove', this._onFramePointerMove);
    }

    _canvasToWorld(point) {
        const transform = this._frameCanvasTransform;
        return {
            x: (point.x - transform.originX) / transform.scale,
            y: (point.y - transform.originY) / transform.scale,
        };
    }

    _setNumberInput(key, value) {
        const input = this.root?.querySelector(`[data-layout-setting="${key}"]`);
        if (input) input.value = String(snap(Math.max(0, value)));
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function canvasPoint(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
        y: (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
}

function pointList(value) {
    if (Array.isArray(value)) return value.map(point => normalizePoint(point)).filter(Boolean);
    if (isObject(value) && Array.isArray(value.points)) return pointList(value.points);
    if (isObject(value) && Array.isArray(value.corners)) return pointList(value.corners);
    return [];
}

function normalizePoint(point) {
    if (Array.isArray(point)) return { x: finite(point[0], NaN), y: finite(point[1], NaN) };
    if (isObject(point)) return {
        x: finite(point.x ?? point.column, NaN),
        y: finite(point.y ?? point.row, NaN),
    };
    return null;
}

function numericBounds(value) {
    if (!isObject(value)) return null;
    const minX = finite(value.minX ?? value.left, NaN);
    const maxX = finite(value.maxX ?? value.right, NaN);
    const minY = finite(value.minY ?? value.top, NaN);
    const maxY = finite(value.maxY ?? value.bottom, NaN);
    if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;
    return { minX, maxX, minY, maxY };
}

function frameEdges(preview, minX, maxX, minY, maxY) {
    const bounds = numericBounds(preview?.frameBounds);
    if (bounds) return { left: bounds.minX, right: bounds.maxX, top: bounds.minY, bottom: bounds.maxY };
    const width = finite(preview?.frameWidthCells ?? preview?.widthCells, maxX - minX);
    const center = finite(preview?.frameCenterX, (minX + maxX) / 2);
    const ground = finite(preview?.groundY, minY);
    const headroom = finite(preview?.headroomCells, maxY - ground);
    return {
        left: center - width / 2,
        right: center + width / 2,
        bottom: ground,
        top: ground - headroom,
    };
}

/** Mount the shared editor and return its controller. */
export function mount(parent, options = {}) {
    return new LayoutEditor(parent, options);
}

export const mountLayoutEditor = mount;
export default mount;

let stylesInstalled = false;
function ensureStyles() {
    if (stylesInstalled || typeof document === 'undefined') return;
    stylesInstalled = true;
    const style = document.createElement('style');
    style.dataset.sharedLayoutEditor = 'true';
    style.textContent = `
        .ww-layout-editor { display:flex; flex-direction:column; gap:12px; min-width:min(760px,92vw); max-height:90vh; overflow:auto; padding:14px; color:var(--text,#e4e6eb); background:var(--bg-1,#20252a); font:11px var(--font, sans-serif); box-sizing:border-box; }
        .ww-layout-editor h3,.ww-layout-editor h4 { margin:0 0 5px; font-weight:600; }
        .ww-layout-editor p { margin:0; color:var(--text-muted,#9ca3af); font-size:10px; line-height:1.4; }
        .ww-layout-editor-body { display:grid; grid-template-columns:minmax(210px,0.8fr) minmax(320px,1.2fr); gap:14px; align-items:stretch; }
        .ww-layout-groups,.ww-layout-size-settings,.ww-layout-rocking { display:flex; flex-direction:column; gap:7px; padding:10px; border:1px solid var(--border,#394149); border-radius:5px; background:var(--bg-2,#292f35); }
        .ww-layout-widget-card { display:grid; grid-template-columns:16px minmax(0,1fr) 128px; align-items:center; gap:6px; min-height:30px; padding:4px 5px; border:1px solid var(--border,#394149); border-radius:3px; background:var(--bg-0,#171b1f); cursor:grab; }
        .ww-layout-widget-card:focus,.ww-layout-widget-card:hover { border-color:var(--accent,#79a9ff); }
        .ww-layout-drag-icon { color:var(--text-muted,#9ca3af); letter-spacing:-3px; }
        .ww-layout-widget-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .ww-layout-widget-card select,.ww-layout-size-settings input,.ww-layout-rocking-fields input { min-width:0; height:23px; padding:2px 4px; border:1px solid var(--border,#394149); border-radius:3px; background:var(--bg-0,#171b1f); color:inherit; font:10px var(--font, sans-serif); }
        .ww-layout-board-map { position:relative; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); grid-template-rows:repeat(4,minmax(56px,1fr)); gap:5px; min-height:245px; padding:8px; border:1px solid var(--border,#394149); border-radius:5px; background:var(--bg-0,#171b1f); }
        .ww-layout-board-map { grid-template-columns:repeat(2,minmax(0,1fr)) minmax(60px,1fr) repeat(2,minmax(0,1fr)); grid-template-rows:repeat(2,minmax(65px,1fr)); }
        .ww-layout-board-map-center { grid-column:3; grid-row:1/3; display:grid; place-items:center; border:1px dashed var(--accent,#79a9ff); border-radius:4px; color:var(--accent,#79a9ff); font-size:10px; letter-spacing:1px; }
        .ww-layout-slot { position:relative; display:flex; flex-direction:column; justify-content:space-between; min-width:0; padding:5px; border:1px dashed #56616b; border-radius:3px; background:rgba(255,255,255,.015); outline:none; }
        [data-layout-slot="top-left-inner"] { grid-column:2; grid-row:1; } [data-layout-slot="top-left-outer"] { grid-column:1; grid-row:1; }
        [data-layout-slot="bottom-left-inner"] { grid-column:2; grid-row:2; } [data-layout-slot="bottom-left-outer"] { grid-column:1; grid-row:2; }
        [data-layout-slot="top-right-inner"] { grid-column:4; grid-row:1; } [data-layout-slot="top-right-outer"] { grid-column:5; grid-row:1; }
        [data-layout-slot="bottom-right-inner"] { grid-column:4; grid-row:2; } [data-layout-slot="bottom-right-outer"] { grid-column:5; grid-row:2; }
        .ww-layout-slot.drag-over,.ww-layout-slot:focus { border-color:var(--accent,#79a9ff); background:rgba(121,169,255,.14); }
        .ww-layout-slot-label { color:var(--text-muted,#9ca3af); font-size:8px; text-transform:uppercase; }
        .ww-layout-slot-items { overflow:hidden; min-height:17px; margin-top:4px; }
        .ww-layout-slot-widget { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:2px 3px; border-radius:2px; background:var(--bg-4,#404950); font-size:9px; }
        .ww-layout-slot-empty { color:#606a74; font-size:9px; }
        .ww-layout-size-settings label,.ww-layout-rocking-fields label { display:flex; align-items:center; justify-content:space-between; gap:8px; color:var(--text-dim,#b4bac0); font-size:10px; }
        .ww-layout-size-settings input,.ww-layout-rocking-fields input { width:70px; text-align:right; }
        .ww-layout-checkbox { justify-content:flex-start !important; }
        .ww-layout-rocking-preview-wrap { overflow:hidden; border:1px solid var(--border,#394149); border-radius:3px; background:#11121b; }
        .ww-layout-rocking-preview { display:block; width:min(100%,480px); height:auto; margin:auto; touch-action:none; }
        .ww-layout-rocking-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
        .ww-layout-editor-actions { display:flex; justify-content:flex-end; gap:7px; padding-top:3px; }
        .ww-layout-editor-actions button { min-width:62px; height:25px; padding:0 9px; border:1px solid var(--border,#394149); border-radius:3px; background:var(--bg-3,#333a41); color:inherit; font:10px var(--font, sans-serif); cursor:pointer; }
        .ww-layout-editor-actions button.primary { border-color:var(--accent,#79a9ff); background:var(--accent,#79a9ff); color:#0b1118; }
        @media (max-width:720px) { .ww-layout-editor { min-width:0; } .ww-layout-editor-body { grid-template-columns:1fr; } .ww-layout-rocking-fields { grid-template-columns:1fr; } }
    `;
    document.head?.appendChild(style);
}
