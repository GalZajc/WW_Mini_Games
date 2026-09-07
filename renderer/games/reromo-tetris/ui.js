import { InputManager } from '../../core/InputManager.js';
import { formatSprintTime } from './tetris-modes.js';
import { CONTROL_DEFINITIONS, normalizeSettings } from './settings.js';
import { computeWidgetReservations } from '../../core/WidgetLayout.js';
import { mountLayoutEditor } from '../../core/LayoutEditor.js';
import {
    buildWeightedSampler,
    effectivePieceWeight,
    getPreviewCells,
    MAX_POLYOMINO_ORDER,
    ORDER_NAMES,
    POLYOMINO_CATALOG,
    POLYOMINO_COUNTS,
} from './polyominoes.js';

function clone(value) {
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function finitePositive(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

/**
 * The in-game HUD deliberately keeps the standalone game's appearance. All
 * settings and remapping now live in WW Mini Games' standard ESC overlay.
 */
export class TetrisUI {
    constructor(game) {
        this.game = game;
        this.hudSignature = '';
        this.hudStatsSignature = '';
        this.hudPreviewSignature = '';
        this.layoutMeasurements = {};
        this.lastCellSize = 1;
        this.layoutGap = 6;
        this._measurementSignature = '';
        this._lastReservations = null;
        const nextPreviewCount = Math.max(1, Math.round(game.settings.nextPreviewCount));
        const nextPreviewMarkup = Array.from({ length: nextPreviewCount }, (_, index) => `
            <div class="reromo-preview-container${index ? ' reromo-preview-no-title' : ''}">
                ${index === 0 ? '<h4>NEXT</h4>' : ''}
                <canvas class="reromo-preview-canvas" data-hud-preview="next-${index}"></canvas>
            </div>
        `).join('');

        this.root = document.createElement('div');
        this.root.className = 'reromo-ui-root';
        this.root.innerHTML = `
            <div class="reromo-game-ui">
                <section class="reromo-layout-widget reromo-widget-next" data-layout-widget="next">
                    <div class="reromo-info-column">
                        ${nextPreviewMarkup}
                    </div>
                </section>
                <section class="reromo-layout-widget reromo-widget-stats" data-layout-widget="stats">
                    <div class="reromo-info-column">
                        <div class="reromo-preview-container">
                            <h4 data-hold-title>HOLD (U)</h4>
                            <canvas class="reromo-preview-canvas" data-hud-preview="hold"></canvas>
                        </div>
                        <div class="reromo-info-box"><p>${game.settings.ruleMode === 'sprint' ? 'Time' : 'Score'}: <span data-hud-score>0</span></p><p>${game.settings.ruleMode === 'sprint' ? 'Best' : 'High'}: <span data-hud-high-score>0</span></p></div>
                        <div class="reromo-info-box"><p>Lines: <span data-hud-lines>0</span></p><p>${game.settings.ruleMode === 'sprint' ? 'Target' : 'High'}: <span data-hud-high-lines>0</span></p></div>
                    </div>
                </section>
                <section class="reromo-layout-widget reromo-widget-controls reromo-controls-table" data-layout-widget="controls">
                    <p>CONTROLS (Remappable In Settings)</p>
                    <table><tbody></tbody></table>
                </section>
            </div>
        `;
        this.gameUi = this.root.querySelector('.reromo-game-ui');
        this.widgetElements = Object.fromEntries([...this.root.querySelectorAll('[data-layout-widget]')]
            .map(element => [element.dataset.layoutWidget, element]));
        (game.canvas.parentElement || document.body).appendChild(this.root);
    }

    get isOpen() {
        return false;
    }

    destroy() {
        this.root.remove();
    }

    /**
     * Return the three configurable Tetris groups for the shared editor and
     * camera layout code. `measured` is updated by measureLayout after the
     * current font and cell size are known.
     */
    getLayoutWidgets() {
        return ['next', 'stats', 'controls'].map(id => ({
            id,
            label: id === 'next' ? 'Next column' : id === 'stats' ? 'Hold + score/lines' : 'Controls',
            element: this.widgetElements?.[id] || null,
            measured: { ...(this.layoutMeasurements[id] || {}) },
            defaultSlot: id === 'next' ? 'top-right-inner' : id === 'stats' ? 'top-right-outer' : 'bottom-right-inner',
        }));
    }

    /** Open the shared eight-slot editor inside a menu-owned panel. */
    openLayoutEditor(parent, options = {}) {
        return mountLayoutEditor(parent, {
            ...options,
            game: this.game,
            widgets: this.getLayoutWidgets(),
        });
    }

    /**
     * Measure the actual widget boxes for camera fitting. Preview cell blocks
     * are sized from the board's measured cell size, so no fixed 90px box is
     * involved. The return shape is deliberately tiny for the camera bridge;
     * detailed dimensions remain available through getLayoutWidgets().
     */
    measureLayout(cellSize = 1) {
        const size = Math.max(0.01, Number(cellSize) || 1);
        const bounds = this.game.previewBounds || {};
        const signature = [
            size,
            this.game.settings?.nextPreviewCellScale,
            this.game.settings?.holdPreviewCellScale,
            this.game.settings?.previewFramed !== false,
            bounds.columns,
            bounds.rows,
            JSON.stringify(this.game.settings?.widgetLayout || {}),
        ].join('|');
        if (signature === this._measurementSignature && this._lastReservations) {
            return { ...this._lastReservations };
        }
        this.lastCellSize = size;
        // syncLayout assigns explicit width/height values. Clear those before
        // measuring so a later camera fit sees the natural content dimensions.
        Object.values(this.widgetElements || {}).forEach(element => {
            if (element) {
                element.style.width = '';
                element.style.height = '';
            }
        });
        this._sizePreviewCanvases(size);
        this.layoutMeasurements = Object.fromEntries(Object.entries(this.widgetElements || {}).map(([id, element]) => {
            const rect = element?.getBoundingClientRect?.();
            const width = finitePositive(rect?.width, element?.offsetWidth || element?.scrollWidth || 0);
            const height = finitePositive(rect?.height, element?.offsetHeight || element?.scrollHeight || 0);
            return [id, { width, height }];
        }));
        const reservations = computeWidgetReservations({
            widgets: this.getLayoutWidgets(),
            assignments: this.game.settings?.widgetLayout,
            measuredWidgets: this.layoutMeasurements,
            gap: this.layoutGap,
        });
        this._measurementSignature = signature;
        this._lastReservations = { leftWidth: reservations.leftWidth, rightWidth: reservations.rightWidth };
        return { ...this._lastReservations };
    }

    syncLayout(layout) {
        if (!layout || !this.gameUi) return;
        const positions = layout.widgets || layout.positions || {};
        for (const [id, element] of Object.entries(this.widgetElements || {})) {
            const position = positions[id];
            if (!position) continue;
            element.style.left = `${Number(position.x) || 0}px`;
            element.style.top = `${Number(position.y) || 0}px`;
            if (Number.isFinite(Number(position.width))) element.style.width = `${Math.max(0, Number(position.width))}px`;
            if (Number.isFinite(Number(position.height))) element.style.height = `${Math.max(0, Number(position.height))}px`;
        }
        this.lastLayout = layout;
        this.gameUi.classList.toggle('stacked', Boolean(layout.stacked));
        this.gameUi.classList.toggle('layout-hidden', Boolean(layout.hidden));
    }

    _sizePreviewCanvases(cellSize) {
        const bounds = this.game.previewBounds || { columns: 4, rows: 4 };
        const columns = Math.max(1, Number(bounds.columns) || 1);
        const rows = Math.max(1, Number(bounds.rows) || 1);
        const framed = this.game.settings?.previewFramed !== false;
        let changed = false;
        this.root.querySelectorAll('[data-hud-preview]').forEach(canvas => {
            const scale = canvas.dataset.hudPreview === 'hold'
                ? finitePositive(this.game.settings?.holdPreviewCellScale, 1)
                : finitePositive(this.game.settings?.nextPreviewCellScale, 1);
            const block = cellSize * scale;
            // Fourteen pixels leave a small, stable inset while the block
            // itself remains exactly cellSize × scale (including fractional
            // high-DPI sizes).
            const width = columns * block + 14;
            const height = rows * block + 14;
            canvas.dataset.cellSize = String(cellSize);
            canvas.dataset.previewScale = String(scale);
            const bitmapWidth = Math.max(1, Math.ceil(width));
            const bitmapHeight = Math.max(1, Math.ceil(height));
            if (canvas.width !== bitmapWidth) {
                canvas.width = bitmapWidth;
                changed = true;
            }
            if (canvas.height !== bitmapHeight) {
                canvas.height = bitmapHeight;
                changed = true;
            }
            const cssWidth = `${width}px`, cssHeight = `${height}px`;
            if (canvas.style.width !== cssWidth) canvas.style.width = cssWidth;
            if (canvas.style.height !== cssHeight) canvas.style.height = cssHeight;
            const isFrameless = canvas.classList.contains('frameless');
            canvas.classList.toggle('frameless', !framed);
            canvas.closest('.reromo-preview-container')?.classList.toggle('frameless', !framed);
            if (isFrameless !== !framed) changed = true;
        });
        if (changed) this.hudPreviewSignature = '';
    }

    updateHud() {
        const game = this.game;
        const sprint = game.settings.ruleMode === 'sprint';
        const statsSignature = `${game.score}|${game.highScore}|${game.linesCleared}|${game.highLines}|${sprint ? formatSprintTime(game.sprintElapsed) + game.bestSprintSeconds : ''}`;
        if (statsSignature !== this.hudStatsSignature) {
            this.hudStatsSignature = statsSignature;
            this.root.querySelector('[data-hud-score]').textContent = sprint ? formatSprintTime(game.sprintElapsed) : String(game.score);
            this.root.querySelector('[data-hud-high-score]').textContent = sprint ? formatSprintTime(game.bestSprintSeconds) : String(game.highScore);
            this.root.querySelector('[data-hud-lines]').textContent = String(game.linesCleared);
            this.root.querySelector('[data-hud-high-lines]').textContent = String(sprint ? game.settings.sprintLines : game.highLines);
        }

        const previews = {
            hold: game.heldPieceIndex === null ? null : POLYOMINO_CATALOG.all[game.heldPieceIndex],
        };
        for (let index = 0; index < game.settings.nextPreviewCount; index++) {
            const pieceIndex = game.nextPieces[index];
            previews[`next-${index}`] = pieceIndex === undefined ? null : POLYOMINO_CATALOG.all[pieceIndex];
        }
        const previewSignature = `${game.heldPieceIndex ?? -1}|${game.nextPieces
            .slice(0, game.settings.nextPreviewCount)
            .join(',')}`;
        if (previewSignature !== this.hudPreviewSignature) {
            this.hudPreviewSignature = previewSignature;
            this.root.querySelectorAll('[data-hud-preview]').forEach(canvas => {
                this._drawHudPreview(canvas, previews[canvas.dataset.hudPreview]);
            });
        }

        const signature = JSON.stringify(game.app.currentBindings);
        if (signature !== this.hudSignature) {
            this._measurementSignature = '';
            this.hudSignature = signature;
            const holdBinding = game.app.currentBindings?.holdPiece?.[0];
            this.root.querySelector('[data-hold-title]').textContent =
                `HOLD (${holdBinding ? InputManager.bindingName(holdBinding) : 'U'})`;
            const actionNames = {
                moveClockwise: 'Move Left',
                moveCounterClockwise: 'Move Right',
                rotateClockwise: 'Rotate Clockwise',
                rotateCounterClockwise: 'Rotate Anti-Clockwise',
                rotate180: 'Rotate 180°',
                softDrop: 'Soft Drop / Combo',
                hardDrop: 'Hard Drop',
                holdPiece: 'Hold Piece',
                pause: 'Pause / Resume',
                restart: 'Restart Game',
                quickMotion: 'Quick Motion',
                checkCollapse: 'Check Collapse / Skip Wait',
            };
            this.root.querySelector('.reromo-controls-table tbody').innerHTML = CONTROL_DEFINITIONS.map(control => {
                const binding = game.app.currentBindings?.[control.action]?.[0];
                return `<tr><td>${escapeHtml(binding ? InputManager.bindingName(binding) : 'NONE')}</td><td>${escapeHtml(actionNames[control.action])}</td></tr>`;
            }).join('');
        }
    }

    _drawHudPreview(canvas, entry) {
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        if (this.game.settings.previewFramed !== false) {
            context.fillStyle = '#111111';
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        if (!entry) return;
        const cells = getPreviewCells(entry);
        const maxRow = Math.max(...cells.map(cell => cell[0]));
        const maxColumn = Math.max(...cells.map(cell => cell[1]));
        const shapeWidth = maxColumn + 1;
        const shapeHeight = maxRow + 1;
        const previewBounds = this.game.previewBounds || { columns: shapeWidth, rows: shapeHeight };
        const requestedBlock = Number(canvas.dataset.cellSize) * Number(canvas.dataset.previewScale);
        const block = Number.isFinite(requestedBlock) && requestedBlock > 0
            ? requestedBlock
            : Math.max(3, Math.min(
                (canvas.width - 14) / previewBounds.columns,
                (canvas.height - 14) / previewBounds.rows,
            ));
        const offsetX = (canvas.width - shapeWidth * block) / 2;
        const offsetY = (canvas.height - shapeHeight * block) / 2;
        context.fillStyle = entry.color;
        context.strokeStyle = entry.darkColor;
        context.lineWidth = 1;
        for (const [row, column] of cells) {
            const x = offsetX + column * block;
            const y = offsetY + row * block;
            context.fillRect(x, y, block, block);
            context.strokeRect(x + 0.5, y + 0.5, block - 1, block - 1);
        }
    }
}

// Small functional bridges are useful to the framework when a game instance
// is created before its UI is available, and keep the shared editor contract
// discoverable without reaching into private DOM fields.
export function getLayoutWidgets(game) {
    return game?.ui?.getLayoutWidgets?.() || [];
}

export function openLayoutEditor(game, parent, options = {}) {
    if (typeof game?.ui?.openLayoutEditor === 'function') {
        return game.ui.openLayoutEditor(parent, options);
    }
    return mountLayoutEditor(parent, { ...options, game });
}

export function renderPolyominoWeightSetting(settings) {
    const rows = [];
    for (let order = 1; order <= MAX_POLYOMINO_ORDER; order++) {
        rows.push(`<div class="reromo-standard-weight-row">
            <span><b>${order}</b> — ${escapeHtml(ORDER_NAMES[order])} <small>${POLYOMINO_COUNTS[order].toLocaleString()}</small></span>
            <input aria-label="Probability factor for ${order}-ominoes" type="number" min="0" step="0.1"
                data-order-weight="${order}" value="${escapeHtml(settings.orderWeights?.[order] ?? 0)}">
            <button type="button" data-detail-order="${order}">Details…</button>
        </div>`);
    }
    return `<div class="reromo-standard-weights">
        <p class="reromo-standard-weight-help">Pᵢ = pᵢ / Σⱼpⱼ · 12,678 one-sided shapes. Each row opens its own detail page.</p>
        ${rows.join('')}
    </div>`;
}

export function mountPolyominoWeightSetting({ panel, settings, openCustomView, setStatus }) {
    panel.querySelectorAll('[data-order-weight]').forEach(input => {
        const updateOrderWeight = () => {
            const order = Number(input.dataset.orderWeight);
            const value = Number(input.value);
            if (!Number.isFinite(value) || value < 0) {
                input.setCustomValidity('The probability factor must be a finite non-negative number.');
                input.setAttribute('aria-invalid', 'true');
                setStatus(`The factor for ${ORDER_NAMES[order]} must be a non-negative number.`, true);
                return;
            }
            input.setCustomValidity('');
            input.removeAttribute('aria-invalid');
            settings.orderWeights[order] = value;
            setStatus('');
        };
        input.addEventListener('input', updateOrderWeight);
        input.addEventListener('change', updateOrderWeight);
    });

    panel.querySelectorAll('[data-detail-order]').forEach(button => {
        button.addEventListener('click', () => {
            // Commit all visible order factors before changing pages.
            panel.querySelectorAll('[data-order-weight]').forEach(input => {
                const order = Number(input.dataset.orderWeight);
                const value = Number(input.value);
                if (Number.isFinite(value) && value >= 0) settings.orderWeights[order] = value;
            });
            const order = Number(button.dataset.detailOrder);
            openCustomView(({ panel: target, done, cancel }) => {
                target.classList.add('reromo-panel-piece-editor');
                const editor = new PieceWeightEditor({
                    container: target,
                    settings,
                    order,
                    onDone: overrides => {
                        settings.pieceOverrides = overrides;
                        editor.destroy();
                        done();
                    },
                    onCancel: () => {
                        editor.destroy();
                        cancel();
                    },
                });
                return () => editor.destroy();
            });
        });
    });
}

export function preparePolyominoSettings(settings) {
        const normalized = normalizeSettings(settings, { strict: true });
    const sampler = buildWeightedSampler(normalized.orderWeights, normalized.pieceOverrides);
    if (!(sampler.total > 0)) {
        throw new Error('At least one piece probability factor must be greater than zero.');
    }
    return normalized;
}

export class PieceWeightEditor {
    constructor({ container, settings, order, onDone, onCancel }) {
        this.container = container;
        this.order = Math.max(1, Math.min(MAX_POLYOMINO_ORDER, Math.round(order)));
        this.entries = POLYOMINO_CATALOG.byOrder[this.order];
        this.orderWeights = clone(settings.orderWeights);
        this.overrides = clone(settings.pieceOverrides);
        this.onDone = onDone;
        this.onCancel = onCancel;
        this.invalidWeights = new Set();
        this.columns = 1;
        this.rows = [];
        this.frame = 0;
        this.destroyed = false;

        container.innerHTML = `
            <header class="reromo-panel-header reromo-editor-header">
                <button type="button" class="reromo-back" data-cancel>◀</button>
                <div><h2>${this.order} — ${escapeHtml(ORDER_NAMES[this.order])}</h2><p>${this.entries.length.toLocaleString()} one-sided shapes · inherited factor ${this.orderWeights[this.order]} · only changed values become overrides</p></div>
                <span data-override-count></span>
            </header>
            <div class="reromo-piece-viewport">
                <div class="reromo-piece-spacer"></div>
                <div class="reromo-piece-layer"></div>
            </div>
            <footer class="reromo-actions">
                <button type="button" data-cancel>Cancel</button>
                <span class="reromo-action-spacer"></span>
                <button type="button" class="primary" data-done>Done</button>
            </footer>
        `;
        this.viewport = container.querySelector('.reromo-piece-viewport');
        this.spacer = container.querySelector('.reromo-piece-spacer');
        this.layer = container.querySelector('.reromo-piece-layer');
        this.overrideCount = container.querySelector('[data-override-count]');

        this._onScroll = () => this._scheduleRender();
        this._onResize = () => this._rebuildLayout();
        this._onInput = event => this._updateWeight(event);
        this._onCancel = onCancel;
        this._onDone = () => {
            if (this.invalidWeights.size) {
                this.overrideCount.textContent = 'Fix invalid probability values first';
                this.overrideCount.style.color = '#b3261e';
                this.layer.querySelector('[aria-invalid="true"]')?.focus();
                return;
            }
            this.overrideCount.style.color = '';
            onDone(clone(this.overrides));
        };
        this.viewport.addEventListener('scroll', this._onScroll, { passive: true });
        this.layer.addEventListener('input', this._onInput);
        window.addEventListener('resize', this._onResize);
        container.querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', this._onCancel));
        container.querySelector('[data-done]').addEventListener('click', this._onDone);
        this._rebuildLayout();
        this._updateOverrideCount();
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        cancelAnimationFrame(this.frame);
        this.viewport?.removeEventListener('scroll', this._onScroll);
        this.layer?.removeEventListener('input', this._onInput);
        window.removeEventListener('resize', this._onResize);
        this.container?.querySelectorAll('[data-cancel]').forEach(button => button.removeEventListener('click', this._onCancel));
        this.container?.querySelector('[data-done]')?.removeEventListener('click', this._onDone);
    }

    _rebuildLayout() {
        const width = Math.max(200, this.viewport.clientWidth - 20);
        this.columns = Math.max(1, Math.floor(width / 132));
        this.rows = [];
        let y = 0;
        for (let start = 0; start < this.entries.length; start += this.columns) {
            this.rows.push({ entries: this.entries.slice(start, start + this.columns), y, height: 154 });
            y += 154;
        }
        this.spacer.style.height = `${y}px`;
        this._renderVisible();
    }

    _scheduleRender() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = 0;
            this._renderVisible();
        });
    }

    _renderVisible() {
        const top = Math.max(0, this.viewport.scrollTop - 250);
        const bottom = this.viewport.scrollTop + this.viewport.clientHeight + 250;
        const visible = this.rows.filter(row => row.y + row.height >= top && row.y <= bottom);
        this.layer.innerHTML = visible.map(row => `
            <div class="reromo-piece-row" style="top:${row.y}px;height:${row.height}px;grid-template-columns:repeat(${this.columns},minmax(0,1fr))">
                ${row.entries.map(entry => this._card(entry)).join('')}
            </div>
        `).join('');
        this.layer.querySelectorAll('canvas[data-piece-preview]').forEach(canvas => this._drawPreview(canvas));
    }

    _card(entry) {
        const weight = effectivePieceWeight(entry, this.orderWeights, this.overrides);
        const label = entry.classicName ? `${entry.classicName} tetromino` : `#${entry.ordinal + 1}`;
        const overridden = Object.hasOwn(this.overrides, entry.id);
        return `<article class="reromo-piece-card ${overridden ? 'overridden' : ''}" data-piece-card="${entry.id}">
            <canvas width="112" height="91" data-piece-preview="${entry.id}"></canvas>
            <div class="reromo-piece-card-label">${escapeHtml(label)}</div>
            <input aria-label="Probability factor for ${escapeHtml(label)}" type="number" min="0" step="0.1"
                data-piece-weight="${entry.id}" value="${weight}">
        </article>`;
    }

    _drawPreview(canvas) {
        const entry = POLYOMINO_CATALOG.byId.get(canvas.dataset.piecePreview);
        if (!entry) return;
        const cells = getPreviewCells(entry);
        const context = canvas.getContext('2d');
        const maxRow = Math.max(...cells.map(cell => cell[0]));
        const maxColumn = Math.max(...cells.map(cell => cell[1]));
        const width = maxColumn + 1;
        const height = maxRow + 1;
        const block = Math.max(3, Math.floor(Math.min((canvas.width - 12) / width, (canvas.height - 12) / height)));
        const offsetX = Math.floor((canvas.width - width * block) / 2);
        const offsetY = Math.floor((canvas.height - height * block) / 2);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = entry.color;
        context.strokeStyle = entry.darkColor;
        context.lineWidth = 1;
        for (const [row, column] of cells) {
            const x = offsetX + column * block;
            const y = offsetY + row * block;
            context.fillRect(x, y, block, block);
            context.strokeRect(x + 0.5, y + 0.5, block - 1, block - 1);
        }
    }

    _updateWeight(event) {
        const input = event.target.closest('[data-piece-weight]');
        if (!input) return;
        const entry = POLYOMINO_CATALOG.byId.get(input.dataset.pieceWeight);
        const value = Number(input.value);
        const valid = Number.isFinite(value) && value >= 0;
        input.classList.toggle('invalid', !valid);
        if (!valid || !entry) {
            this.invalidWeights.add(entry?.id || input.dataset.pieceWeight);
            input.setCustomValidity('The probability factor must be a finite non-negative number.');
            input.setAttribute('aria-invalid', 'true');
            return;
        }
        this.invalidWeights.delete(entry.id);
        input.setCustomValidity('');
        input.removeAttribute('aria-invalid');
        if (value === Number(this.orderWeights[entry.order])) delete this.overrides[entry.id];
        else this.overrides[entry.id] = value;
        input.closest('.reromo-piece-card')?.classList.toggle('overridden', Object.hasOwn(this.overrides, entry.id));
        this._updateOverrideCount();
    }

    _updateOverrideCount() {
        const count = Object.keys(this.overrides)
            .filter(id => POLYOMINO_CATALOG.byId.get(id)?.order === this.order)
            .length;
        this.overrideCount.textContent = `${count.toLocaleString()} override${count === 1 ? '' : 's'}`;
    }
}
