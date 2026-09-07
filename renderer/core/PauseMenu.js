/**
 * PauseMenu — ESC overlay with Resume / Settings / Controls / Exit.
 *
 * Populates #pause-panel dynamically based on the current game's
 * settings schema and controls schema.
 */
import { InputManager } from './InputManager.js';
import { changedNumericSettings } from './SettingsValidation.js';

function clone(value) {
    return typeof structuredClone === 'function'
        ? structuredClone(value)
        : JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export class PauseMenu {

    /**
     * @param {import('./App.js').App} app — reference to the App instance
     */
    constructor(app) {
        this.app         = app;
        this.overlay     = document.getElementById('pause-overlay');
        this.panel       = document.getElementById('pause-panel');
        this._view       = 'main'; // 'main' | 'settings' | 'controls' | 'mobile-calibration' | 'layout'

        // Current game state for settings editing
        this._schema     = [];
        this._controls   = [];
        this._tempSettings  = {};
        this._tempBindings  = {};
        this._mobileCalibrationBusy = false;
        this._mobileCalibrationMessage = '';
        this._customViewCleanup = null;
        this._settingsApplying = false;
        this._layoutViewToken = 0;

        // Keep keyboard support on the overlay so gameplay bindings never
        // receive navigation keystrokes while the pause menu is visible.
        this._keyHandler = event => this._onKeyboard(event);
        this.overlay.addEventListener('keydown', this._keyHandler, true);
    }

    _cloneCalibration(calibration) {
        return calibration ? structuredClone(calibration) : null;
    }

    _getLocalPhoneCalibration() {
        return this._cloneCalibration(this._tempSettings.mobileCalibration || null);
    }

    _getEffectivePhoneCalibration() {
        return this._getLocalPhoneCalibration() || this.app.mobile.getGlobalCalibration();
    }

    async _persistCurrentGameSettings() {
        const gameId = this._gameConfig?._id;
        if (!gameId) return;

        await this.app.settingsManager.save(gameId, this._tempSettings);
        this.app.currentSettings = { ...this._tempSettings };

        if (this.app.currentGame) {
            this.app.currentGame.settings = { ...this._tempSettings };
            if (typeof this.app.currentGame.applyPhoneCalibration === 'function') {
                this.app.currentGame.applyPhoneCalibration(this._tempSettings.mobileCalibration || null);
            }
        }
    }

    async _saveLocalPhoneCalibration(calibration) {
        this._tempSettings.mobileCalibration = this._cloneCalibration(calibration);
        await this._persistCurrentGameSettings();
    }

    async _resetLocalPhoneCalibration() {
        delete this._tempSettings.mobileCalibration;
        await this._persistCurrentGameSettings();
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Show / Hide                                               */
    /* ═══════════════════════════════════════════════════════════ */

    show(gameConfig, GameClass, currentSettings, currentBindings) {
        // Games commonly append full-screen HUD and game-over nodes directly to
        // <body>. Re-append the framework modal whenever it opens so it is the
        // final top-level stacking item as well as having the global modal
        // z-index. Every settings subview remains inside this overlay.
        document.body.appendChild(this.overlay);
        this._schema       = GameClass?.getSettingsSchema  ? GameClass.getSettingsSchema()  : [];
        this._controls     = GameClass?.getControlsSchema  ? GameClass.getControlsSchema()  : [];
        this._tempSettings = clone(currentSettings);
        this._tempBindings = {};
        // Deep clone bindings
        for (const [action, binds] of Object.entries(currentBindings)) {
            this._tempBindings[action] = binds.map(b => ({ ...b }));
        }
        this._gameConfig = gameConfig;
        this._settingsApplying = false;

        this._view = 'main';
        this._render();
        this.overlay.classList.add('active');
        this._focusInitial();
    }

    hide() {
        this._destroyCustomView();
        this.overlay.classList.remove('active');
        this.app.input.cancelListen();
    }

    get isVisible() {
        return this.overlay.classList.contains('active');
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Render                                                    */
    /* ═══════════════════════════════════════════════════════════ */

    _render() {
        const isStandardSettings = this._view === 'settings';
        this.panel.classList.toggle('pause-panel-settings', isStandardSettings);
        if (!isStandardSettings) {
            this.panel.style.removeProperty('--settings-preferred-width');
        }
        switch (this._view) {
            case 'main':     this._renderMain();     break;
            case 'settings': this._renderSettings(); break;
            case 'controls': this._renderControls(); break;
            case 'mobile-calibration': this._renderMobileCalibration(); break;
            case 'layout':   this._renderLayout();   break;
        }
        this._focusInitial();
    }

    /* ── Main menu ───────────────────────────────────────────── */

    _renderMain() {
        const name = this._gameConfig?.name || 'Game';
        const hasModes = typeof this.app.hasCurrentGameModes === 'function'
            ? this.app.hasCurrentGameModes()
            : Boolean(this.app.currentGame?.supportsModeSelection);
        const hasLayout = this._hasLayout();
        this.panel.innerHTML = `
            <div class="pause-header">
                <span class="pause-title">⏸ ${name}</span>
            </div>
            <div class="pause-menu-list">
                <button class="pause-menu-item" data-action="resume">
                    <span class="item-icon">▶</span>
                    <span class="item-label">Resume</span>
                </button>
                ${this._schema.length ? `
                <button class="pause-menu-item" data-action="settings">
                    <span class="item-icon">⚙</span>
                    <span class="item-label">Settings</span>
                </button>` : ''}
                ${this._controls.length ? `
                <button class="pause-menu-item" data-action="controls">
                    <span class="item-icon">⌨</span>
                    <span class="item-label">Controls</span>
                </button>` : ''}
                ${hasModes ? `
                <button class="pause-menu-item" data-action="mode">
                    <span class="item-icon">▦</span>
                    <span class="item-label">Game modes</span>
                </button>` : ''}
                ${hasLayout ? `
                <button class="pause-menu-item" data-action="layout">
                    <span class="item-icon">⌗</span>
                    <span class="item-label">Layout</span>
                </button>` : ''}
                <div class="pause-separator"></div>
                <button class="pause-menu-item danger" data-action="exit">
                    <span class="item-icon">✕</span>
                    <span class="item-label">Exit to Menu</span>
                </button>
            </div>
        `;

        this.panel.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', () => this._onMenuAction(btn.dataset.action));
        });
    }

    _hasLayout() {
        return this._gameConfig?._id === 'reromo-tetris' || Boolean(this.app.currentGame?.hasLayoutEditor);
    }

    _onMenuAction(action) {
        switch (action) {
            case 'resume':
                this.hide();
                this.app.resumeGame();
                break;
            case 'settings':
                this._view = 'settings';
                this._render();
                break;
            case 'controls':
                this._view = 'controls';
                this._render();
                break;
            case 'mode':
                this.hide();
                void (this.app.openCurrentGameModes?.() ?? this.app.chooseCurrentGameMode?.());
                break;
            case 'layout':
                if (this._hasLayout()) {
                    this._view = 'layout';
                    this._render();
                }
                break;
            case 'exit':
                this.hide();
                this.app.exitGame();
                break;
        }
    }

    _focusInitial() {
        if (!this.isVisible) return;
        const selector = this._view === 'main'
            ? '[data-action]'
            : '[data-back], [data-cancel], [data-apply], [data-save], [data-reset], button, input, select, textarea';
        const first = this.panel.querySelector(selector);
        if (first && typeof first.focus === 'function' && !this.panel.contains(document.activeElement)) {
            first.focus();
        }
    }

    _onKeyboard(event) {
        if (!this.isVisible) return;
        const target = event.target;
        const editing = target?.matches?.('input, select, textarea, [contenteditable="true"]');
        if (editing) return;

        if (this._view === 'main') {
            const items = [...this.panel.querySelectorAll('.pause-menu-item:not([disabled])')];
            if (!items.length) return;

            const active = document.activeElement?.closest?.('.pause-menu-item');
            const currentIndex = Math.max(0, items.indexOf(active));
            let nextIndex;
            if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                nextIndex = (currentIndex - 1 + items.length) % items.length;
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                nextIndex = (currentIndex + 1) % items.length;
            } else if (event.key === 'Home') {
                nextIndex = 0;
            } else if (event.key === 'End') {
                nextIndex = items.length - 1;
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                (active || items[0]).click();
                return;
            } else {
                return;
            }

            event.preventDefault();
            items[nextIndex]?.focus();
            return;
        }

        // Enter activates focused buttons in every subview. Native controls
        // retain their normal browser behaviour because editing targets return
        // early above.
        if ((event.key === 'Enter' || event.key === ' ') && target?.matches?.('button, [role="button"]')) {
            event.preventDefault();
            target.click();
        }
    }

    /* ── Settings ─────────────────────────────────────────────── */

    _renderSettings() {
        this._destroyCustomView();
        // Group settings by optional `group` field
        const groups = {};
        for (const s of this._schema) {
            if (s.type === 'hidden') continue;
            const g = s.group || '';
            if (!groups[g]) groups[g] = [];
            groups[g].push(s);
        }

        let sections = '';
        let visibleSettingCount = 0;
        for (const [groupName, settings] of Object.entries(groups)) {
            visibleSettingCount += settings.length;
            let rows = '';
            if (groupName) {
                rows += `<div class="settings-group-title">${groupName}</div>`;
            }
            for (const s of settings) {
                const val = this._tempSettings[s.key] ?? s.default;
                const modes = s.modes?.length ? ` data-setting-modes="${s.modes.join(',')}"` : '';
                rows += `<div class="setting-row ${s.fullWidth ? 'setting-row-full' : ''}"${modes}>
                    ${s.fullWidth ? '' : `<span class="setting-label">${s.label}</span>`}
                    <div class="setting-control">
                        ${this._renderSettingInput(s, val)}
                    </div>
                </div>`;
            }
            sections += `<section class="settings-group">${rows}</section>`;
        }

        const preferredColumns = Math.max(1, Math.min(4, Math.ceil(visibleSettingCount / 11)));
        const preferredWidth = preferredColumns === 1 ? 420 : preferredColumns * 350 + 24;
        this.panel.style.setProperty('--settings-preferred-width', `${preferredWidth}px`);

        this.panel.innerHTML = `
            <div class="pause-header">
                <button class="pause-back-btn" data-back>◀</button>
                <span class="pause-title">Settings</span>
            </div>
            <div class="settings-section">
                <div class="settings-groups">${sections}</div>
                <div class="settings-progress" data-settings-progress hidden>
                    <div class="settings-progress-track">
                        <div class="settings-progress-fill" data-settings-progress-fill></div>
                    </div>
                    <span data-settings-progress-value>0%</span>
                </div>
                <div class="settings-status" data-settings-status></div>
            </div>
            <div class="pause-actions">
                <button class="btn" data-cancel>Cancel</button>
                <button class="btn btn-primary" data-apply>Apply & Restart</button>
            </div>
        `;

        // Back button
        this.panel.querySelector('[data-back]')?.addEventListener('click', () => {
            this._view = 'main';
            this._render();
        });

        // Cancel
        this.panel.querySelector('[data-cancel]')?.addEventListener('click', () => {
            this._view = 'main';
            this._render();
        });

        // Apply
        this.panel.querySelector('[data-apply]')?.addEventListener('click', () => {
            this._applySettings();
        });

        // Wire up input events
        this._wireSettingInputs();
        this._updateSettingVisibility();

        this.app.currentGame?.mountPauseSettings?.({
            panel: this.panel,
            settings: this._tempSettings,
            schema: this._schema,
            openCustomView: renderer => this._openCustomSettingsView(renderer),
            rerender: () => this._renderSettings(),
            setStatus: (message, isError = false) => this._setSettingsStatus(message, isError),
            setProgress: (fraction, message = '') => this._setSettingsProgress(fraction, message),
        });
    }

    _renderSettingInput(s, val) {
        // Explicit domainMin/domainMax fields (or the older `fundamental`
        // marker used by the cached Möbius grid) describe real mathematical
        // bounds. Legacy min/max values are retained only as soft spinner
        // stops below; they never become validation rules.
        const { hasDomain, min: domainMin, max: domainMax } = this._settingDomain(s);
        const spinnerBounds = hasDomain
            ? `${Number.isFinite(domainMin) ? `min=\"${domainMin}\"` : ''} ${Number.isFinite(domainMax) ? `max=\"${domainMax}\"` : ''}`
            : '';
        // The old `step` values described slider increments.  Leaving them on
        // an unrestricted number input would make the browser reject values
        // that the game itself can represent. The bounds below only guide the
        // native arrows; the validator remains authoritative for every value.
        // `step` is kept only as an optional spinner increment.  A field may
        // explicitly set domainStep to preserve a genuinely discrete domain;
        // otherwise free numeric entry must not acquire a browser
        // step-mismatch constraint from an old slider increment.
        const inputStep = s.domainStep ?? (s.fundamental ? (s.step ?? 'any') : 'any');
        switch (s.type) {
            case 'range':
                // Range controls silently impose the schema's old UI bounds.
                // Keep the schema compatible for old games, but expose the
                // setting as a normal editable number so the player can enter
                // any finite value the simulation supports.
                return `<input type="number" class="setting-number setting-number-free" data-key="${s.key}"
                            step="${inputStep}" ${spinnerBounds} value="${val}">`;
            case 'number':
                const suggestions = [...new Set((s.suggestions || []).map(Number).filter(Number.isFinite))];
                const listId = suggestions.length
                    ? `setting-suggestions-${String(s.key).replace(/[^a-z0-9_-]/gi, '-')}`
                    : '';
                return `<input type="number" class="setting-number" data-key="${s.key}"
                            step="${inputStep}" ${spinnerBounds} value="${val}"
                            ${listId ? `list="${listId}"` : ''}>
                        ${listId ? `<datalist id="${listId}">${suggestions.map(value =>
                            `<option value="${value}"></option>`).join('')}</datalist>` : ''}`;
            case 'color':
                return `<input type="color" class="setting-color" data-key="${s.key}" value="${val}">`;
            case 'select':
                const opts = (s.options || []).map(o =>
                    `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`
                ).join('');
                return `<select class="setting-select" data-key="${s.key}">${opts}</select>`;
            case 'toggle':
            case 'checkbox':
                return `<div class="setting-toggle ${val ? 'active' : ''}" data-key="${s.key}"></div>`;
            case 'game-custom': {
                const rendered = this.app.currentGame?.renderPauseSettingInput?.(s, val, this._tempSettings);
                return typeof rendered === 'string' ? rendered : '';
            }
            default:
                return `<span>${val}</span>`;
        }
    }

    _settingDomain(setting) {
        const active = setting.domains?.[this._tempSettings.mode] || setting.domains?.default || setting;
        const explicitMin = Number.isFinite(Number(active.domainMin))
            ? Number(active.domainMin)
            : (setting.fundamental && Number.isFinite(Number(active.min)) ? Number(active.min) : undefined);
        const explicitMax = Number.isFinite(Number(active.domainMax))
            ? Number(active.domainMax)
            : (setting.fundamental && Number.isFinite(Number(active.max)) ? Number(active.max) : undefined);
        // In the legacy schemas a zero `min` was the slider's lower hint. For
        // every setting whose validator accepts zero it is also the genuine
        // lower domain, so use it for the spinner. Positive-only settings opt
        // out with strictPositive (currently the Rubik drag/animation rates).
        const inferredMin = explicitMin === undefined && !setting.strictPositive && Number(active.min) === 0
            ? 0
            : undefined;
        // Keep legacy range endpoints as *spinner* hints. They prevent the
        // native arrows from walking into a known-invalid everyday region,
        // while manual entry remains unrestricted and is checked by the
        // game's own validator on Apply. Strict-positive fields with a legacy
        // min=0 deliberately opt out because zero is still invalid there.
        const suggestedMin = Number.isFinite(Number(active.min))
            && (!setting.strictPositive || Number(active.min) > 0)
            ? Number(active.min)
            : undefined;
        const suggestedMax = Number.isFinite(Number(active.max)) ? Number(active.max) : undefined;
        const min = explicitMin ?? inferredMin ?? suggestedMin;
        const max = explicitMax ?? suggestedMax;
        return {
            min,
            max,
            hasDomain: Number.isFinite(min) || Number.isFinite(max),
        };
    }

    _wireSettingInputs() {
        // Number inputs (including legacy schema entries declared as range).
        this.panel.querySelectorAll('.setting-number').forEach(el => {
            const read = () => {
                const raw = String(el.value).trim();
                const value = Number(raw);
                if (raw === '' || !Number.isFinite(value)) {
                    el.setCustomValidity('Enter a finite number.');
                    this._setSettingsStatus(`${el.dataset.key} must be a finite number.`, true);
                    return;
                }
                el.setCustomValidity('');
                this._tempSettings[el.dataset.key] = value;
            };
            el.addEventListener('input', read);
            el.addEventListener('change', read);
            el.addEventListener('blur', read);
        });

        // A custom game may still emit a range input directly. Treat it as a
        // freely editable number for the same no-silent-clamping policy.
        this.panel.querySelectorAll('.setting-range').forEach(el => {
            const read = () => {
                const value = Number(el.value);
                if (Number.isFinite(value)) this._tempSettings[el.dataset.key] = value;
            };
            el.addEventListener('input', read);
            el.addEventListener('change', read);
        });

        // Selects
        this.panel.querySelectorAll('.setting-select').forEach(el => {
            el.addEventListener('change', () => {
                this._tempSettings[el.dataset.key] = el.value;
                this._updateSettingVisibility();
            });
        });

        // Colour pickers
        this.panel.querySelectorAll('.setting-color').forEach(el => {
            el.addEventListener('input', () => {
                this._tempSettings[el.dataset.key] = el.value;
            });
        });

        // Toggles
        this.panel.querySelectorAll('.setting-toggle').forEach(el => {
            el.addEventListener('click', () => {
                const key = el.dataset.key;
                this._tempSettings[key] = !this._tempSettings[key];
                el.classList.toggle('active', this._tempSettings[key]);
            });
        });
    }

    _changedSettingsMessage(changed) {
        const details = changed.slice(0, 4).map(item =>
            `${item.label}: ${item.requested} → ${item.prepared}`
        ).join('; ');
        const suffix = changed.length > 4 ? ` (+${changed.length - 4} more)` : '';
        return `A setting was changed by the game instead of being applied (${details}${suffix}). ` +
            'This value is outside the game\'s fundamental domain; correct it and apply again.';
    }

    _validatePreparedSettings(requested, prepared) {
        const changed = changedNumericSettings(requested, prepared, this._schema);
        if (changed.length) throw new Error(this._changedSettingsMessage(changed));
        return prepared;
    }

    async _applySettings() {
        if (this._settingsApplying) return;
        this._settingsApplying = true;
        this._setSettingsBusy(true);
        this._setSettingsStatus('');
        try {
            // Never persist the previous value merely because a visible input
            // could not be parsed. Keep the panel open and explain exactly
            // what must be corrected first.
            const invalidNumber = [...this.panel.querySelectorAll('.setting-number')]
                .find(element => {
                    const raw = String(element.value ?? '').trim();
                    return raw === '' || !Number.isFinite(Number(raw));
                });
            const invalidCustom = this.panel.querySelector('input[aria-invalid="true"]');
            const invalid = invalidNumber || invalidCustom;
            if (invalid) {
                const key = invalid.dataset.key || invalid.getAttribute('aria-label') || 'This setting';
                invalid.setCustomValidity(`${key} must contain an accepted value.`);
                invalid.focus?.();
                throw new Error(`${key} has an invalid value. Correct it before applying settings.`);
            }
            const requested = clone(this._tempSettings);
            const prepared = await this.app.currentGame?.preparePauseSettings?.(
                clone(requested),
                {
                    setStatus: (message, isError = false) => this._setSettingsStatus(message, isError),
                    setProgress: (fraction, message = '') => this._setSettingsProgress(fraction, message),
                },
            );
            if (prepared) this._tempSettings = this._validatePreparedSettings(requested, prepared);
            const gameId = this._gameConfig._id;
            await this.app.settingsManager.save(gameId, this._tempSettings);
            this.hide();
            // Relaunch game with new settings
            this.app.restartGame(this._tempSettings);
        } catch (error) {
            this._setSettingsProgress(null);
            this._setSettingsStatus(error?.message || String(error), true);
        } finally {
            this._settingsApplying = false;
            this._setSettingsBusy(false);
        }
    }


    _setSettingsBusy(busy) {
        this.panel.setAttribute('aria-busy', String(Boolean(busy)));
        this.panel.querySelectorAll('[data-back], [data-cancel], [data-apply]').forEach(button => {
            button.disabled = Boolean(busy);
        });
        const apply = this.panel.querySelector('[data-apply]');
        if (apply) apply.textContent = busy ? 'Preparing…' : 'Apply & Restart';
    }

    _updateSettingVisibility() {
        const mode = this._tempSettings.mode;
        this.panel.querySelectorAll('[data-setting-modes]').forEach(row => {
            row.hidden = !row.dataset.settingModes.split(',').includes(mode);
        });
        // Some settings have a genuine topology-dependent domain (for
        // example Möbius' finite precomputed grid). Refresh native spinner
        // stops when the mode changes rather than leaving stale bounds.
        this.panel.querySelectorAll('.setting-number[data-key]').forEach(input => {
            const setting = this._schema.find(item => item.key === input.dataset.key);
            if (!setting) return;
            const { min, max } = this._settingDomain(setting);
            if (Number.isFinite(min)) input.min = String(min); else input.removeAttribute('min');
            if (Number.isFinite(max)) input.max = String(max); else input.removeAttribute('max');
        });
    }

    _setSettingsStatus(message, isError = false) {
        const status = this.panel.querySelector('[data-settings-status]');
        if (!status) return;
        status.textContent = message || '';
        status.classList.toggle('error', Boolean(isError));
    }

    _setSettingsProgress(fraction, message = '') {
        const progress = this.panel.querySelector('[data-settings-progress]');
        if (!progress) return;
        if (fraction === null || fraction === undefined) {
            progress.hidden = true;
            if (message) this._setSettingsStatus(message);
            return;
        }
        const normalized = Math.max(0, Math.min(1, Number(fraction) || 0));
        progress.hidden = false;
        const fill = progress.querySelector('[data-settings-progress-fill]');
        const value = progress.querySelector('[data-settings-progress-value]');
        if (fill) fill.style.width = `${normalized * 100}%`;
        if (value) value.textContent = `${Math.round(normalized * 100)}%`;
        if (message) this._setSettingsStatus(message);
    }

    _openCustomSettingsView(renderer) {
        if (typeof renderer !== 'function') return;
        this._destroyCustomView();
        this._view = 'custom-settings';
        this.panel.classList.remove('pause-panel-settings');
        this.panel.style.removeProperty('--settings-preferred-width');
        this.panel.classList.add('pause-panel-wide');

        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            this._destroyCustomView();
            this._view = 'settings';
            this._renderSettings();
        };
        const cleanup = renderer({
            panel: this.panel,
            settings: this._tempSettings,
            done: close,
            cancel: close,
        });
        this._customViewCleanup = typeof cleanup === 'function' ? cleanup : null;
    }

    _destroyCustomView() {
        this._layoutViewToken++;
        try {
            this._customViewCleanup?.();
        } finally {
            this._customViewCleanup = null;
            this.panel.classList.remove('pause-panel-wide', 'reromo-panel-piece-editor');
        }
    }

    async _renderLayout() {
        this._destroyCustomView();
        this.panel.classList.remove('pause-panel-settings');
        this.panel.classList.add('pause-panel-wide');
        this.panel.style.removeProperty('--settings-preferred-width');
        this.panel.innerHTML = `
            <div class="pause-header">
                <button class="pause-back-btn" data-layout-back aria-label="Back">◀</button>
                <span class="pause-title">Layout</span>
            </div>
            <div class="settings-section" data-layout-editor-host>
                <div class="settings-status">Loading layout editor…</div>
            </div>
        `;
        this.panel.querySelector('[data-layout-back]')?.addEventListener('click', () => this._closeLayout());

        const token = this._layoutViewToken;
        const game = this.app.currentGame;
        const onCancel = () => this._closeLayout();
        const context = {
            settings: clone(this.app.currentSettings || {}),
            onApply: settings => this._applyLayoutSettings(settings),
            onCancel,
            close: onCancel,
        };

        try {
            const result = await game?.openLayoutEditor?.(this.panel, context);
            if (token !== this._layoutViewToken || this._view !== 'layout') return;
            if (result === false || result === null) {
                this._renderLayoutUnavailable();
                return;
            }
            this._customViewCleanup = this._extractCleanup(result);
            this.panel.querySelector('[data-layout-editor-host]')?.remove();
            this._focusInitial();
        } catch (error) {
            if (token !== this._layoutViewToken || this._view !== 'layout') return;
            this._renderLayoutUnavailable(error?.message || String(error));
        }
    }

    _extractCleanup(result) {
        if (typeof result === 'function') return result;
        for (const key of ['cleanup', 'destroy', 'dispose', 'close']) {
            if (typeof result?.[key] === 'function') return () => result[key]();
        }
        return null;
    }

    _renderLayoutUnavailable(message = 'This game has no layout editor yet.') {
        const safeMessage = escapeHtml(message);
        this.panel.innerHTML = `
            <div class="pause-header">
                <button class="pause-back-btn" data-layout-back aria-label="Back">◀</button>
                <span class="pause-title">Layout</span>
            </div>
            <div class="settings-section">
                <div class="settings-status">${safeMessage}</div>
            </div>
        `;
        this.panel.querySelector('[data-layout-back]')?.addEventListener('click', () => this._closeLayout());
        this._focusInitial();
    }

    _closeLayout() {
        this._destroyCustomView();
        this._view = 'main';
        this._render();
    }

    async _applyLayoutSettings(settings) {
        const nextSettings = clone(settings || {});
        const gameId = this._gameConfig?._id;
        if (!gameId) throw new Error('Cannot save layout settings without an active game.');
        if (typeof this.app.settingsManager?.save === 'function') {
            await this.app.settingsManager.save(gameId, nextSettings);
        }
        this.app.currentSettings = { ...nextSettings };
        if (this.app.currentGame) {
            this.app.currentGame.settings = { ...nextSettings };
            if (typeof this.app.currentGame.onLayoutSettingsApplied === 'function') {
                await this.app.currentGame.onLayoutSettingsApplied({ ...nextSettings });
            } else {
                this.app.currentGame.refreshLayout?.();
                this.app.currentGame.onResize?.(this.app.canvas?.width, this.app.canvas?.height);
                this.app.currentGame.render?.();
            }
        }
        this._tempSettings = clone(nextSettings);
        this._closeLayout();
        return nextSettings;
    }

    /* ── Controls ─────────────────────────────────────────────── */

    _renderControls() {
        let rows = '';
        for (const ctrl of this._controls) {
            const bindings = this._tempBindings[ctrl.action] || ctrl.defaultBindings || [];
            const keys = bindings.map((b, i) =>
                `<span class="control-key" data-action="${ctrl.action}" data-index="${i}">${InputManager.bindingName(b)}</span>`
            ).join('');
            rows += `<div class="control-row">
                <span class="control-action">${ctrl.label}</span>
                <div class="control-bindings">${keys}</div>
            </div>`;
        }

        const globalCalibration = this.app.mobile.getGlobalCalibration();
        const localCalibration = this._getLocalPhoneCalibration();
        const effectiveCalibration = localCalibration || globalCalibration;
        const effectiveSummary = this.app.mobile.getCalibrationSummary(
            effectiveCalibration,
            { inheritedFromGlobal: !localCalibration }
        );
        const phoneSection = `
            <div class="settings-group-title" style="margin-top:${rows ? '18px' : '0'};">Phone Controller</div>
            <div class="control-row">
                <span class="control-action">This game</span>
                <div class="control-bindings">
                    <span class="control-key" style="cursor:default;">${effectiveSummary.statusLabel}${localCalibration ? '' : ' (global default)'}</span>
                    <span class="control-key" data-open-mobile-calibration>Open</span>
                </div>
            </div>
        `;

        this.panel.innerHTML = `
            <div class="pause-header">
                <button class="pause-back-btn" data-back>◀</button>
                <span class="pause-title">Controls</span>
            </div>
            <div class="settings-section">
                ${this._controls.length ? '<div class="settings-group-title">Click a binding to remap</div>' : '<div class="settings-group-title">Phone controls</div>'}
                ${rows}
                ${phoneSection}
            </div>
            <div class="pause-actions">
                <button class="btn" data-reset>Reset Defaults</button>
                <button class="btn btn-primary" data-save>Save</button>
            </div>
        `;

        // Back
        this.panel.querySelector('[data-back]')?.addEventListener('click', () => {
            this.app.input.cancelListen();
            this._view = 'main';
            this._render();
        });

        // Key buttons → remap
        this.panel.querySelectorAll('.control-key').forEach(el => {
            if (el.hasAttribute('data-open-mobile-calibration')) return;
            el.addEventListener('click', () => this._startRemap(el));
        });

        this.panel.querySelector('[data-open-mobile-calibration]')?.addEventListener('click', () => {
            this._view = 'mobile-calibration';
            this._mobileCalibrationMessage = '';
            this._render();
        });

        // Reset defaults
        this.panel.querySelector('[data-reset]')?.addEventListener('click', () => {
            for (const ctrl of this._controls) {
                this._tempBindings[ctrl.action] = ctrl.defaultBindings.map(b => ({ ...b }));
            }
            this._renderControls(); // re-render
        });

        // Save
        this.panel.querySelector('[data-save]')?.addEventListener('click', () => {
            this._saveControls();
        });
    }

    _renderMobileCalibration() {
        const pairUrl = this.app.mobile.url || 'Preparing global phone link...';
        const localCalibration = this._getLocalPhoneCalibration();
        const effectiveCalibration = this._getEffectivePhoneCalibration();
        const localSummary = localCalibration
            ? this.app.mobile.getCalibrationSummary(localCalibration, { label: 'Local' })
            : null;
        const globalSummary = this.app.mobile.getCalibrationSummary(
            this.app.mobile.getGlobalCalibration(),
            { label: 'Global' }
        );
        const effectiveSummary = this.app.mobile.getCalibrationSummary(
            effectiveCalibration,
            { label: 'Effective', inheritedFromGlobal: !localCalibration }
        );

        const formatNeutral = (summary) => summary?.neutral
            ? `${summary.neutral.beta.toFixed(1)} / ${summary.neutral.gamma.toFixed(1)}`
            : 'not set';
        const formatAxis = (axis) => axis
            ? `${axis.x.toFixed(1)} / ${axis.y.toFixed(1)}`
            : 'not learned';

        this.panel.innerHTML = `
            <div class="pause-header">
                <button class="pause-back-btn" data-back>◀</button>
                <span class="pause-title">Phone Calibration</span>
            </div>
            <div class="settings-section">
                <div class="settings-group-title">Per-game calibration with global fallback</div>
                <div style="font-size:13px; line-height:1.55; color:#b8c4d4;">
                    New captures are saved only for <strong>${this._gameConfig?.name || 'this game'}</strong>. If you want, you can later promote that same mapping to the global default for future phone-based games.
                </div>
                <div style="margin-top:12px; padding:12px; border-radius:14px; background:rgba(255,255,255,0.04); font:12px/1.5 'JetBrains Mono', monospace; word-break:break-all;">${pairUrl}</div>
                <div style="margin-top:14px; display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:10px;">
                    <div style="padding:12px; border-radius:14px; background:rgba(255,255,255,0.04);">
                        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#8fa5cb;">Connection</div>
                        <div style="margin-top:6px; font-size:15px; font-weight:700;">${this.app.mobile.isConnected ? 'Phone connected' : 'Waiting for phone'}</div>
                    </div>
                    <div style="padding:12px; border-radius:14px; background:rgba(255,255,255,0.04);">
                        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#8fa5cb;">Effective mapping</div>
                        <div style="margin-top:6px; font-size:15px; font-weight:700;">${effectiveSummary.statusLabel}${localCalibration ? '' : ' (using global)'}</div>
                    </div>
                    <div style="padding:12px; border-radius:14px; background:rgba(255,255,255,0.04);">
                        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#8fa5cb;">Local override</div>
                        <div style="margin-top:6px; font-size:15px; font-weight:700;">${localSummary ? localSummary.statusLabel : 'Using global default'}</div>
                    </div>
                    <div style="padding:12px; border-radius:14px; background:rgba(255,255,255,0.04);">
                        <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#8fa5cb;">Global default</div>
                        <div style="margin-top:6px; font-size:15px; font-weight:700;">${globalSummary.statusLabel}</div>
                    </div>
                </div>
                <div style="margin-top:10px; display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px;">
                    <div style="padding:10px 12px; border-radius:14px; background:rgba(255,255,255,0.04);">
                        <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:#8fa5cb;">Neutral</div>
                        <div style="margin-top:6px; font-size:13px; font-weight:700;">${formatNeutral(effectiveSummary)}</div>
                    </div>
                    <div style="padding:10px 12px; border-radius:14px; background:rgba(255,255,255,0.04);">
                        <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:#8fa5cb;">Forward</div>
                        <div style="margin-top:6px; font-size:13px; font-weight:700;">${formatAxis(effectiveSummary.forward)}</div>
                    </div>
                    <div style="padding:10px 12px; border-radius:14px; background:rgba(255,255,255,0.04);">
                        <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:#8fa5cb;">Right</div>
                        <div style="margin-top:6px; font-size:13px; font-weight:700;">${formatAxis(effectiveSummary.right)}</div>
                    </div>
                </div>
                <div style="margin-top:14px; display:grid; gap:10px;">
                    <button class="btn ${this._mobileCalibrationBusy ? '' : 'btn-primary'}" data-calib="neutral" ${this._mobileCalibrationBusy ? 'disabled' : ''}>Set Neutral Pose</button>
                    <button class="btn ${this._mobileCalibrationBusy ? '' : 'btn-primary'}" data-calib="forward" ${this._mobileCalibrationBusy ? 'disabled' : ''}>Learn Tilt Forward</button>
                    <button class="btn ${this._mobileCalibrationBusy ? '' : 'btn-primary'}" data-calib="right" ${this._mobileCalibrationBusy ? 'disabled' : ''}>Learn Tilt Right</button>
                    <button class="btn" data-promote-global ${this._mobileCalibrationBusy || !localCalibration ? 'disabled' : ''}>Set This Calibration As Global</button>
                    <button class="btn" data-reset-local ${this._mobileCalibrationBusy || !localCalibration ? 'disabled' : ''}>Reset This Game To Global Default</button>
                    <button class="btn" data-clear-global ${this._mobileCalibrationBusy ? 'disabled' : ''}>Clear Global Calibration</button>
                </div>
                <div style="margin-top:12px; min-height:20px; font-size:13px; color:${this._mobileCalibrationBusy ? '#ffd18b' : '#b8c4d4'};">
                    ${this._mobileCalibrationMessage || 'When you start a step, the phone should open a fullscreen screen with one huge confirmation button. A successful capture is stored locally for this game first.'}
                </div>
            </div>
        `;

        this.panel.querySelector('[data-back]')?.addEventListener('click', () => {
            this._view = 'controls';
            this._render();
        });

        this.panel.querySelectorAll('[data-calib]').forEach((el) => {
            el.addEventListener('click', () => this._runMobileCalibration(el.dataset.calib));
        });

        this.panel.querySelector('[data-promote-global]')?.addEventListener('click', async () => {
            if (!window.confirm('Use this game-specific phone calibration as the new global default for future games?')) {
                return;
            }

            this._mobileCalibrationBusy = true;
            this._mobileCalibrationMessage = 'Saving the current game calibration as global...';
            this._renderMobileCalibration();

            const result = await this.app.mobile.saveGlobalCalibration(localCalibration);
            this._mobileCalibrationBusy = false;
            this._mobileCalibrationMessage = result.message;
            this._renderMobileCalibration();
        });

        this.panel.querySelector('[data-reset-local]')?.addEventListener('click', async () => {
            this._mobileCalibrationBusy = true;
            this._mobileCalibrationMessage = 'Removing the game-specific override...';
            this._renderMobileCalibration();

            await this._resetLocalPhoneCalibration();
            this._mobileCalibrationBusy = false;
            this._mobileCalibrationMessage = 'This game now uses the global phone calibration again.';
            this._renderMobileCalibration();
        });

        this.panel.querySelector('[data-clear-global]')?.addEventListener('click', async () => {
            if (!window.confirm('Clear the global phone calibration for all games?')) {
                return;
            }

            this._mobileCalibrationBusy = true;
            this._mobileCalibrationMessage = 'Clearing saved global phone calibration...';
            this._renderMobileCalibration();
            const result = await this.app.mobile.clearCalibration();
            this._mobileCalibrationBusy = false;
            this._mobileCalibrationMessage = result.message;
            this._renderMobileCalibration();
        });
    }

    async _runMobileCalibration(mode) {
        this._mobileCalibrationBusy = true;
        this._mobileCalibrationMessage = 'Waiting for the phone confirmation button...';
        this._renderMobileCalibration();

        const baseCalibration = this._getEffectivePhoneCalibration();
        const result = await this.app.mobile.captureCalibration(mode, baseCalibration);
        if (result.success) {
            const nextCalibration = this.app.mobile.buildCalibrationWithCapturedSample(baseCalibration, mode, result);
            if (nextCalibration) {
                await this._saveLocalPhoneCalibration(nextCalibration);
                await this.app.mobile.sendCalibrationFeedback(
                    'Saved for this game.',
                    { success: true, close: true }
                );
                result.message = mode === 'neutral'
                    ? 'Neutral pose saved for this game. Now capture forward and right.'
                    : 'Phone calibration saved for this game.';
            } else {
                result.success = false;
                result.message = 'Could not build a calibration from that sample.';
            }
        }
        this._mobileCalibrationBusy = false;
        this._mobileCalibrationMessage = result.message;
        this._renderMobileCalibration();
    }

    _startRemap(el) {
        // Cancel any previous listen
        this.app.input.cancelListen();
        this.panel.querySelectorAll('.control-key').forEach(k => k.classList.remove('listening'));

        el.classList.add('listening');
        el.textContent = '...';

        this.app.input.listenForInput((binding) => {
            const action = el.dataset.action;
            binding = this.app.currentGame?.preparePauseBinding?.(binding, action) || binding;
            const index  = parseInt(el.dataset.index);
            if (!this._tempBindings[action]) {
                const ctrl = this._controls.find(c => c.action === action);
                this._tempBindings[action] = (ctrl?.defaultBindings || []).map(b => ({ ...b }));
            }
            this._tempBindings[action][index] = binding;
            el.classList.remove('listening');
            el.textContent = InputManager.bindingName(binding);
        });
    }

    async _saveControls() {
        const gameId = this._gameConfig._id;
        await this.app.settingsManager.saveKeybindings(gameId, this._tempBindings);
        // Update live bindings
        this.app.input.setActionBindings(this._tempBindings);
        this._view = 'main';
        this._render();
    }
}
