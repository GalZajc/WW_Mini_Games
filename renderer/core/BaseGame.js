/**
 * BaseGame — Abstract base class for all mini games.
 *
 * Every game lives in its own subfolder under renderer/games/<id>/
 * and default-exports a class that extends BaseGame.
 *
 * Lifecycle (called by the framework):
 *   _setup()  → init()  → [ update(dt) + render() ]  → destroy()
 *
 * The game MUST implement: init(), update(dt), render(), destroy()
 * The game SHOULD implement: static getSettingsSchema(), static getControlsSchema()
 * The game MAY override: onPause(), onResume(), onResize(w, h)
 */
export class BaseGame {

    constructor() {
        /** @type {import('./App.js').App} */
        this.app     = null;
        /** @type {HTMLCanvasElement} */
        this.canvas  = null;
        /** @type {CanvasRenderingContext2D|null} 3D games will have null here */
        this.ctx     = null;
        /** @type {import('./InputManager.js').InputManager} */
        this.input   = null;
        /** @type {import('./AudioManager.js').AudioManager} */
        this.audio   = null;
        /** @type {import('./NetworkManager.js').NetworkManager} */
        this.network = null;
        /** @type {import('./MobileControllerManager.js').MobileControllerManager} */
        this.mobile  = null;

        /** Merged settings (defaults + user overrides) */
        this.settings = {};

        // Layout widgets are optional. Games that have DOM HUD controls can
        // register them here and the shared layout editor will discover them
        // through the framework hook below.
        this.layoutWidgets = [];

        /**
         * If true, the framework will NOT show the pause menu on ESC.
         * The game handles ESC itself (e.g. multiplayer games).
         */
        this.handlesPause = false;
        this.wantsPointerLock = true;

        // Internal callbacks wired by the framework
        this._onScoreSubmit = null;
        this._onGameEnd     = null;
    }

    /* ── Framework wiring (do not override) ─────────────────────── */

    /**
     * Called by App.js to wire the game into the framework.
     */
    _setup(canvas, ctx, input, audio, settings, onScoreSubmit, onGameEnd, network, app, mobile) {
        this.app            = app;
        this.canvas         = canvas;
        this.ctx            = ctx;
        this.input          = input;
        this.audio          = audio;
        this.network        = network;
        this.mobile         = mobile;
        this.settings       = settings;
        this._onScoreSubmit = onScoreSubmit;
        this._onGameEnd     = onGameEnd;
        this.init();
    }

    /* ── Override these ──────────────────────────────────────────── */

    /** Initialize game state. Called once after _setup(). */
    init() {}

    /** Update logic. dt is in seconds, capped at 0.05. */
    update(dt) {}

    /** Render to this.ctx / this.canvas. */
    render() {}

    /** Clean up resources (timers, listeners, textures…). */
    destroy() {}

    /** Called when the game is paused via ESC. */
    onPause() {}

    /** Called when the game is resumed from pause. */
    onResume() {}

    /**
     * Return true when pointer lock should be active right now.
     * Games can override this when gameplay, game-over, or menus need different mouse behavior.
     */
    wantsPointerLockNow() { return this.wantsPointerLock; }

    /** Called when the window / canvas is resized. */
    onResize(width, height) {}

    /* ── Settings & Controls schema (static) ────────────────────── */

    /**
     * Return an array of setting descriptors for the pause menu UI.
     *
     * Each item:
     *   { key, label, type: 'range'|'number'|'color'|'select'|'toggle'|
     *     'hidden'|'game-custom',
     *     min?, max?, step?, default, options?: [{value, label}] }
     */
    static getSettingsSchema() { return []; }

    /**
     * Return an array of control descriptors for the remapping UI.
     *
     * Each item:
     *   { action, label, defaultBindings: [{ type: 'keyboard'|'mouse'|'gamepad', code }] }
     */
    static getControlsSchema() { return []; }

    /**
     * Settings that define record comparability. Games may remove purely visual
     * or control-feel settings while keeping difficulty parameters.
     */
    getRecordSettings(settings = this.settings) { return { ...(settings || {}) }; }

    /** Optional hooks for rich fields hosted by the standard pause menu. */
    renderPauseSettingInput(_setting, _value, _settings) { return ''; }
    mountPauseSettings(_context) {}
    preparePauseSettings(settings, _progressContext) { return settings; }
    preparePauseBinding(binding, _action) { return binding; }

    /**
     * Register a widget definition for the shared layout editor.
     *
     * The editor owns the definition format; keeping the registry on the game
     * instance lets canvas-only games leave it empty while DOM-based games can
     * opt in without coupling BaseGame to their UI implementation.
     */
    registerLayoutWidget(widget) {
        if (!widget || typeof widget !== 'object') return null;
        if (!Array.isArray(this.layoutWidgets)) {
            this.layoutWidgets = this.getLayoutWidgets();
        }
        this.layoutWidgets.push(widget);
        return widget;
    }

    getLayoutWidgets() {
        if (Array.isArray(this.layoutWidgets) && this.layoutWidgets.length) {
            return [...this.layoutWidgets];
        }
        if (this.layoutWidgets && typeof this.layoutWidgets === 'object') {
            return Object.entries(this.layoutWidgets).map(([id, widget]) => ({
                ...(widget || {}),
                id: widget?.id || id,
            }));
        }
        // A game may provide one late-bound HUD descriptor without adopting
        // the registry API yet. This keeps the shared editor usable during
        // incremental migrations and does not guess at arbitrary DOM nodes.
        const builtin = this.layoutWidget || this.builtinLayoutWidget;
        return builtin && typeof builtin === 'object' ? [builtin] : [];
    }

    /**
     * Mount the shared layout editor when it is available. LayoutEditor is
     * loaded lazily so games remain launchable while the optional editor is
     * being developed or packaged separately.
     *
     * The module may expose renderLayoutEditor/mountLayoutEditor, or a default
     * object with one of those methods. Both `(panel, options)` and
     * `(options)` render signatures are supported for a painless integration
     * with the shared layout worker.
     */
    async openLayoutEditor(panel, context = {}) {
        let module;
        try {
            module = await import('./LayoutEditor.js');
        } catch {
            return false;
        }

        const candidate = module.renderLayoutEditor
            || module.mountLayoutEditor
            || module.mount
            || module.openLayoutEditor
            || module.default?.renderLayoutEditor
            || module.default?.mountLayoutEditor
            || module.default?.openLayoutEditor
            || (typeof module.default === 'function' ? module.default : null);
        if (typeof candidate !== 'function') return false;

        const options = {
            ...context,
            game: this,
            app: this.app,
            widgets: this.getLayoutWidgets(),
            widgetRegistry: this.getLayoutWidgets(),
        };
        // The shared worker currently exports mountLayoutEditor/mount(parent,
        // options), whose second argument is optional and therefore does not
        // show up in Function#length. Named render/open hooks conventionally
        // use the same panel-first shape when they expose two parameters.
        const panelFirst = typeof module.mountLayoutEditor === 'function'
            || typeof module.mount === 'function'
            || candidate === module.default;
        return panelFirst || candidate.length >= 2
            ? candidate(panel, options)
            : candidate(options);
    }

    /** Called after LayoutEditor applies settings without restarting a game. */
    async onLayoutSettingsApplied(settings) {
        this.settings = { ...(settings || {}) };
        this.refreshLayout?.();
        this.onResize?.(this.canvas?.width, this.canvas?.height);
        this.render?.();
    }

    /* ── Helpers (call from your game) ──────────────────────────── */

    /**
     * Save a result record (settings are attached automatically).
     * @param {Object} results — e.g. { score: 42 }
     */
    submitScore(results) {
        if (this._onScoreSubmit) this._onScoreSubmit(results);
    }

    /**
     * End the game session and return to the main menu.
     * Optionally submit a final score before exiting.
     * @param {Object} [results]
     */
    endGame(results) {
        if (results) this.submitScore(results);
        if (this._onGameEnd) this._onGameEnd();
    }

    /**
     * Restart the game with the same settings.
     * Calls destroy() then init() internally.
     */
    restart() {
        this.destroy();
        this.init();
    }

    /* ── Canvas Utilities ────────────────────────────────────────── */

    /** Canvas width shorthand */
    get w() { return this.canvas.width; }
    /** Canvas height shorthand */
    get h() { return this.canvas.height; }

    /** Clear the entire canvas (2D only — no-op for 3D games) */
    clear(color = '#0c0c14') {
        if (!this.ctx) return;
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.w, this.h);
    }
}
