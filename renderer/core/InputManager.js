/**
 * InputManager — Unified input handling for keyboard, mouse, and gamepads.
 *
 * Supports:
 *  • Per-frame "just pressed / just released" detection
 *  • Abstract action→binding mapping (for remapping)
 *  • Gamepad auto-detection and polling
 *  • "Listen for next input" mode (for the remapping UI)
 */
function normalizedKeyValue(value) {
    return typeof value === 'string' ? value.toLocaleLowerCase('en-US') : value;
}

export class InputManager {

    constructor() {
        // ── Keyboard ────────────────────────────────
        this._keysDown     = new Set();
        this._keysJustDown = new Set();
        this._keysJustUp   = new Set();
        // Character/value matching is opt-in per binding. It preserves the
        // original game's controls on non-US layouts (for example Slovenian
        // QWERTZ) while every existing code-based game keeps physical keys.
        this._keyValuesDown     = new Set();
        this._keyValuesJustDown = new Set();
        this._keyValuesJustUp   = new Set();
        // accumulate between frames
        this._keyDownQueue = [];
        this._keyUpQueue   = [];
        this._keyValueDownQueue = [];
        this._keyValueUpQueue   = [];

        // ── Mouse ───────────────────────────────────
        this._mouseDown     = new Set();
        this._mouseJustDown = new Set();
        this._mouseJustUp   = new Set();
        this._mouseDownQueue = [];
        this._mouseUpQueue   = [];
        this._mousePos       = { x: 0, y: 0 };

        // ── Gamepad ─────────────────────────────────
        this._gpButtonsDown     = new Map(); // idx → Set<buttonIndex>
        this._gpButtonsJustDown = new Map();
        this._gpButtonsJustUp   = new Map();
        this._gpAxes            = new Map(); // idx → Float32Array
        this._gpPrev            = new Map(); // idx → Set<buttonIndex> (prev frame)

        // ── Action bindings ─────────────────────────
        // { actionName: [ { type, code }, … ] }
        this._bindings = {};

        // ── Remap listener ──────────────────────────
        this._listening       = false;
        this._listenCallback  = null;

        this._attach();
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Event listeners                                           */
    /* ═══════════════════════════════════════════════════════════ */

    _attach() {
        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            if (this._listening) {
                this._listening = false;
                this._listenCallback?.({ type: 'keyboard', code: e.code, key: e.key });
                this._listenCallback = null;
                e.preventDefault();
                return;
            }
            this._keyDownQueue.push(e.code);
            this._keyValueDownQueue.push(normalizedKeyValue(e.key));
        });

        window.addEventListener('keyup', (e) => {
            this._keyUpQueue.push(e.code);
            this._keyValueUpQueue.push(normalizedKeyValue(e.key));
        });

        window.addEventListener('mousedown', (e) => {
            if (this._listening) {
                this._listening = false;
                this._listenCallback?.({ type: 'mouse', code: e.button });
                this._listenCallback = null;
                e.preventDefault();
                return;
            }
            this._mouseDownQueue.push(e.button);
        });

        window.addEventListener('mouseup', (e) => {
            this._mouseUpQueue.push(e.button);
        });

        window.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement) {
                // Pointer lock active: accumulate movement deltas, clamp to window
                this._mousePos.x = Math.max(0, Math.min(window.innerWidth,  this._mousePos.x + e.movementX));
                this._mousePos.y = Math.max(0, Math.min(window.innerHeight, this._mousePos.y + e.movementY));
            } else {
                this._mousePos.x = e.clientX;
                this._mousePos.y = e.clientY;
            }
        });

        window.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Frame lifecycle                                           */
    /* ═══════════════════════════════════════════════════════════ */

    /** Call at the START of each frame. */
    update() {
        // ── Keyboard ──
        this._keysJustDown.clear();
        this._keysJustUp.clear();
        this._keyValuesJustDown.clear();
        this._keyValuesJustUp.clear();
        for (const code of this._keyDownQueue) {
            if (!this._keysDown.has(code)) this._keysJustDown.add(code);
            this._keysDown.add(code);
        }
        for (const code of this._keyUpQueue) {
            this._keysDown.delete(code);
            this._keysJustUp.add(code);
        }
        for (const key of this._keyValueDownQueue) {
            if (!this._keyValuesDown.has(key)) this._keyValuesJustDown.add(key);
            this._keyValuesDown.add(key);
        }
        for (const key of this._keyValueUpQueue) {
            this._keyValuesDown.delete(key);
            this._keyValuesJustUp.add(key);
        }
        this._keyDownQueue.length  = 0;
        this._keyUpQueue.length    = 0;
        this._keyValueDownQueue.length = 0;
        this._keyValueUpQueue.length = 0;

        // ── Mouse ──
        this._mouseJustDown.clear();
        this._mouseJustUp.clear();
        for (const btn of this._mouseDownQueue) {
            if (!this._mouseDown.has(btn)) this._mouseJustDown.add(btn);
            this._mouseDown.add(btn);
        }
        for (const btn of this._mouseUpQueue) {
            this._mouseDown.delete(btn);
            this._mouseJustUp.add(btn);
        }
        this._mouseDownQueue.length = 0;
        this._mouseUpQueue.length   = 0;

        // ── Gamepads ──
        this._pollGamepads();
    }

    /** (Optional) Call at the END of each frame — currently a no-op
     *  because we clear justDown/Up at the start of the next frame. */
    postUpdate() {}

    _pollGamepads() {
        const gamepads = navigator.getGamepads();
        for (const gp of gamepads) {
            if (!gp) continue;
            const idx  = gp.index;
            const prev = this._gpPrev.get(idx) || new Set();
            const down = new Set();
            const justDown = new Set();
            const justUp   = new Set();

            for (let i = 0; i < gp.buttons.length; i++) {
                if (gp.buttons[i].pressed) {
                    down.add(i);
                    if (!prev.has(i)) justDown.add(i);
                } else if (prev.has(i)) {
                    justUp.add(i);
                }
            }

            this._gpButtonsDown.set(idx, down);
            this._gpButtonsJustDown.set(idx, justDown);
            this._gpButtonsJustUp.set(idx, justUp);
            this._gpAxes.set(idx, Array.from(gp.axes));
            this._gpPrev.set(idx, down);
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Action bindings                                           */
    /* ═══════════════════════════════════════════════════════════ */

    /** Replace all action bindings at once. */
    setActionBindings(bindings) {
        this._bindings = bindings;
    }

    /** Check if any binding for `action` is currently held down. */
    isActionDown(action) {
        return (this._bindings[action] || []).some(b => this._isDown(b));
    }

    /** Check if any binding for `action` was pressed THIS frame. */
    isActionJustDown(action) {
        return (this._bindings[action] || []).some(b => this._isJustDown(b));
    }

    /** Check if any binding for `action` was released THIS frame. */
    isActionJustUp(action) {
        return (this._bindings[action] || []).some(b => this._isJustUp(b));
    }

    _isDown(b) {
        if (b.type === 'keyboard') {
            if (b.match === 'key' && typeof b.key === 'string') {
                return this._keyValuesDown.has(normalizedKeyValue(b.key));
            }
            return this._keysDown.has(b.code);
        }
        if (b.type === 'mouse')    return this._mouseDown.has(b.code);
        if (b.type === 'gamepad')  {
            for (const [, s] of this._gpButtonsDown) if (s.has(b.code)) return true;
        }
        return false;
    }

    _isJustDown(b) {
        if (b.type === 'keyboard') {
            if (b.match === 'key' && typeof b.key === 'string') {
                return this._keyValuesJustDown.has(normalizedKeyValue(b.key));
            }
            return this._keysJustDown.has(b.code);
        }
        if (b.type === 'mouse')    return this._mouseJustDown.has(b.code);
        if (b.type === 'gamepad')  {
            for (const [, s] of this._gpButtonsJustDown) if (s.has(b.code)) return true;
        }
        return false;
    }

    _isJustUp(b) {
        if (b.type === 'keyboard') {
            if (b.match === 'key' && typeof b.key === 'string') {
                return this._keyValuesJustUp.has(normalizedKeyValue(b.key));
            }
            return this._keysJustUp.has(b.code);
        }
        if (b.type === 'mouse')    return this._mouseJustUp.has(b.code);
        if (b.type === 'gamepad')  {
            for (const [, s] of this._gpButtonsJustUp) if (s.has(b.code)) return true;
        }
        return false;
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Raw input queries                                         */
    /* ═══════════════════════════════════════════════════════════ */

    isKeyDown(code)          { return this._keysDown.has(code); }
    isKeyJustDown(code)      { return this._keysJustDown.has(code); }
    isKeyJustUp(code)        { return this._keysJustUp.has(code); }

    isMouseDown(button)      { return this._mouseDown.has(button); }
    isMouseJustDown(button)  { return this._mouseJustDown.has(button); }
    isMouseJustUp(button)    { return this._mouseJustUp.has(button); }
    getMousePos()            { return { ...this._mousePos }; }

    /** Set the virtual mouse position used by pointer-locked games. */
    setMousePos(x, y) {
        this._mousePos.x = Math.max(0, Math.min(window.innerWidth, Number(x) || 0));
        this._mousePos.y = Math.max(0, Math.min(window.innerHeight, Number(y) || 0));
    }

    /** Returns true if any mouse button was just pressed. */
    anyMouseJustDown()       { return this._mouseJustDown.size > 0; }

    /** Returns true if any key was just pressed. */
    anyKeyJustDown()         { return this._keysJustDown.size > 0; }

    /** Returns axis value (−1…1) for the given gamepad and axis. */
    getAxis(gpIndex, axis) {
        const a = this._gpAxes.get(gpIndex);
        return a ? (a[axis] || 0) : 0;
    }

    /** Returns true if at least one gamepad is connected. */
    hasGamepad() {
        return navigator.getGamepads().some(g => g !== null);
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Remapping                                                 */
    /* ═══════════════════════════════════════════════════════════ */

    /**
     * Start listening for the next key / button press.
     * When detected, calls `callback({ type, code })` and stops.
     */
    listenForInput(callback) {
        this._listening      = true;
        this._listenCallback = callback;
    }

    cancelListen() {
        this._listening      = false;
        this._listenCallback = null;
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Display helpers (static)                                  */
    /* ═══════════════════════════════════════════════════════════ */

    static keyName(code) {
        const map = {
            Space: '␣', Enter: '⏎', Escape: 'Esc', Backspace: '⌫', Tab: '⇥',
            Backquote: '¸',
            ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
            ShiftLeft: 'L‑Shift', ShiftRight: 'R‑Shift',
            ControlLeft: 'L‑Ctrl', ControlRight: 'R‑Ctrl',
            AltLeft: 'L‑Alt', AltRight: 'R‑Alt',
        };
        if (map[code]) return map[code];
        if (code.startsWith('Key'))   return code.slice(3);
        if (code.startsWith('Digit')) return code.slice(5);
        return code;
    }

    static mouseName(button) {
        return ['LMB', 'MMB', 'RMB', 'M4', 'M5'][button] || `M${button}`;
    }

    static gamepadName(button) {
        const n = ['A','B','X','Y','LB','RB','LT','RT',
                    'Back','Start','LS','RS',
                    'D↑','D↓','D←','D→','Home'];
        return '🎮 ' + (n[button] || `B${button}`);
    }

    static bindingName(b) {
        if (b.type === 'keyboard') {
            if (b.match === 'key' && typeof b.key === 'string') {
                const normalized = normalizedKeyValue(b.key);
                const names = {
                    ' ': 'SPACE',
                    arrowleft: '← LEFT',
                    arrowright: '→ RIGHT',
                    arrowup: '↑ UP',
                    arrowdown: '↓ DOWN',
                    escape: 'ESC',
                };
                return names[normalized] || String(b.key).toLocaleUpperCase('en-US');
            }
            return InputManager.keyName(b.code);
        }
        if (b.type === 'mouse')    return InputManager.mouseName(b.code);
        if (b.type === 'gamepad')  return InputManager.gamepadName(b.code);
        return '?';
    }
}
