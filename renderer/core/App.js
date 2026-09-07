/**
 * App — Main application controller.
 *
 * Manages state transitions (menu ↔ playing), the game loop,
 * and coordinates all framework modules.
 */
import { InputManager }    from './InputManager.js';
import { AudioManager }    from './AudioManager.js';
import { SettingsManager }  from './SettingsManager.js';
import { RecordsManager }   from './RecordsManager.js';
import { GameLoader }       from './GameLoader.js';
import { PauseMenu }        from './PauseMenu.js';
import { NetworkManager }   from './NetworkManager.js';
import { MobileControllerManager } from './MobileControllerManager.js';
import { MainMenu }         from '../components/MainMenu.js';
import { hasGameModes }     from '../components/ModeGallery.js';

class App {

    constructor() {
        this.gameView   = document.getElementById('game-view');
        this.canvas     = document.getElementById('game-canvas');
        this.ctx        = this.canvas.getContext('2d');
        this.canvas3d   = document.getElementById('game-canvas-3d');
        this.fpsDisplay = document.getElementById('fps-display');

        // ── Modules ─────────────────────────────────
        this.input          = new InputManager();
        this.audio          = new AudioManager();
        this.settingsManager = new SettingsManager();
        this.records         = new RecordsManager();
        this.gameLoader      = new GameLoader();
        this.network         = new NetworkManager();
        this.mobile          = new MobileControllerManager();
        this.pauseMenu       = new PauseMenu(this);
        this.mainMenu        = new MainMenu(this);

        // ── State ───────────────────────────────────
        this.state           = 'menu'; // 'menu' | 'playing'
        this.currentGame     = null;
        this.currentConfig   = null;
        this.currentSettings = {};
        this.currentBindings = {};
        this._GameClass      = null;
        this._isPaused       = false;
        this._pointerLockRetryAt = 0;

        document.addEventListener('pointerlockchange', () => {
            this._syncPointerLock();
        });

        // ── Frame ───────────────────────────────────
        this._animFrame = null;
        this._lastTime  = 0;
        this._fpsAcc    = 0;
        this._fpsFrames = 0;
        this._fpsTimer  = 0;

        // ── Init ────────────────────────────────────
        this._init();
    }

    async _init() {
        await this.gameLoader.scan();
        await this.mobile.initialize();
        this.mainMenu.render(this.gameLoader.games);
        this._startLoop();

        window.addEventListener('resize', () => {
            if (this.state === 'playing') this._resizeCanvas();
        });
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Game Loop                                                 */
    /* ═══════════════════════════════════════════════════════════ */

    _startLoop() {
        const loop = (time) => {
            if (!this._lastTime) this._lastTime = time;
            const frameDt = Math.max(0, (time - this._lastTime) / 1000);
            const dt = Math.min(frameDt, 0.05);
            this._lastTime = time;

            this.input.update();

            this._syncPointerLock();

            if (this.state === 'playing' && this.currentGame) {
                // ESC toggles pause (unless game handles it)
                if (this.input.isKeyJustDown('Escape')) {
                    // A mode picker is a launcher subpage, not a paused game.
                    // ESC always returns straight to the common game gallery.
                    if (this.currentGame?.phase === 'mode-select' || this.currentGame?.modeSelector) {
                        this.exitGame();
                    } else if (this.currentGame && this.currentGame.handlesPause) {
                        // Game handles ESC itself (e.g. multiplayer)
                    } else if (this.pauseMenu.isVisible) {
                        this.pauseMenu.hide();
                        this.resumeGame();
                    } else {
                        this.pauseGame();
                    }
                }

                if (!this._isPaused && this.currentGame) {
                    this.currentGame.update(dt, frameDt);
                    // Game may have called endGame() during update — guard!
                    if (this.currentGame) {
                        this.currentGame.render();
                    }
                }

                if (this.state === 'playing') {
                    this._updateFPS(frameDt);
                }
            }

            this.input.postUpdate();
            this._animFrame = requestAnimationFrame(loop);
        };

        this._animFrame = requestAnimationFrame(loop);
    }

    _updateFPS(dt) {
        this._fpsFrames++;
        this._fpsTimer += dt;
        if (this._fpsTimer >= 0.5) {
            const fps = Math.round(this._fpsFrames / this._fpsTimer);
            this.fpsDisplay.textContent = `${fps} fps`;
            this._fpsFrames = 0;
            this._fpsTimer  = 0;
        }
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Launch / Pause / Resume / Exit                            */
    /* ═══════════════════════════════════════════════════════════ */

    async launchGame(gameConfig) {
        try {
            const GameClass = await this.gameLoader.loadGame(gameConfig);
            this._GameClass = GameClass;

            // Load settings
            const schema   = GameClass.getSettingsSchema ? GameClass.getSettingsSchema() : [];
            let settings = await this.settingsManager.load(gameConfig._id, schema);
            if (GameClass.migrateSettings) {
                const migrated = await GameClass.migrateSettings(settings);
                if (migrated && migrated !== settings) {
                    settings = migrated;
                    await this.settingsManager.save(gameConfig._id, settings);
                }
            }
            this.currentSettings = settings;

            // Launching a mode-capable game from the pause menu intentionally
            // creates a fresh game instance. This resets private selector flags
            // used by collection games and disposes child canvases/listeners
            // before the new instance starts its own selector.
            if (this.currentGame || this.currentConfig) {
                await this._disposeCurrentGame();
            }

            // Load controls
            const controlsSchema = GameClass.getControlsSchema ? GameClass.getControlsSchema() : [];
            const savedBindings  = await this.settingsManager.loadKeybindings(gameConfig._id);
            const bindings = {};
            for (const ctrl of controlsSchema) {
                bindings[ctrl.action] = savedBindings[ctrl.action] || ctrl.defaultBindings.map(b => ({ ...b }));
            }
            this.currentBindings = bindings;
            this.input.setActionBindings(bindings);

            // Create & setup game
            this.currentGame   = new GameClass();
            this.currentConfig = gameConfig;
            this._GameClass    = GameClass;

            this._showGame();
            // Set correct canvas visibility
            const is3D = this.currentConfig.type === '3d';
            this.canvas.style.display   = is3D ? 'none'  : 'block';
            this.canvas3d.style.display = is3D ? 'block' : 'none';

            this._resizeCanvas();

            // For 3D, pass canvas3d instead of canvas, and null for ctx
            this.currentGame._setup(
                is3D ? this.canvas3d : this.canvas,
                is3D ? null          : this.ctx,
                this.input,
                this.audio,
                { ...settings },
                (results) => this._onScore(results),
                ()        => this.exitGame(),
                this.network,
                this,
                this.mobile,
            );

            this.state    = 'playing';
            this._isPaused = false;
            const wantsPointerLock = this.currentGame?.wantsPointerLockNow
                ? this.currentGame.wantsPointerLockNow()
                : this.currentGame?.wantsPointerLock;
            if (wantsPointerLock) {
                this._lockPointer();
            } else {
                this._unlockPointer();
            }

        } catch (err) {
            console.error('Failed to launch game:', err);
            this._showMenu();
        }
    }

    pauseGame() {
        if (!this.currentGame || this._isPaused) return;
        this._isPaused = true;
        this._unlockPointer();
        this.currentGame.onPause();
        this.pauseMenu.show(
            this.currentConfig,
            this._GameClass,
            this.currentSettings,
            this.currentBindings,
        );
    }

    resumeGame() {
        this._isPaused = false;
        if (this.currentGame) this.currentGame.onResume();
        const wantsPointerLock = this.currentGame?.wantsPointerLockNow
            ? this.currentGame.wantsPointerLockNow()
            : this.currentGame?.wantsPointerLock;
        if (wantsPointerLock) {
            this._lockPointer();
        } else {
            this._unlockPointer();
        }
    }

    /**
     * Restart the current game with (optionally new) settings.
     */
    restartGame(newSettings) {
        if (!this.currentGame) return;
        this.currentSettings = { ...newSettings };
        this.currentGame.settings = { ...newSettings };
        this.currentGame.restart();
        this._isPaused = false;
    }

    _getDeepestActiveGame(game) {
        let current = game;
        while (current) {
            const next = current.child || current.activeGame || current.currentGame || current.subGame;
            if (next && typeof next === 'object') {
                const hasModes = next.supportsModeSelection
                    || typeof next.openModeSelector === 'function'
                    || typeof next.returnToModeSelector === 'function';
                if (hasModes && next.phase !== 'mode-select') {
                    current = next;
                    continue;
                }
            }
            break;
        }
        return current;
    }

    chooseCurrentGameMode() {
        return this.openCurrentGameModes();
    }

    hasCurrentGameModes() {
        const target = this._getDeepestActiveGame(this.currentGame);
        return hasGameModes({
            gameId: this.currentConfig?._id,
            GameClass: target?.constructor ?? this._GameClass,
            game: target ?? this.currentGame,
        });
    }

    async openCurrentGameModes() {
        if (!this.currentGame || !this.hasCurrentGameModes()) return false;

        this._isPaused = false;
        this._unlockPointer();
        this.pauseMenu.hide();

        const game = this._getDeepestActiveGame(this.currentGame);
        try {
            // Check openModeSelector first so games can target their most direct/immediate sub-mode level
            if (typeof game.openModeSelector === 'function') {
                const opened = await game.openModeSelector({ source: 'pause-menu', direct: true });
                if (opened !== false) return true;
            }

            // Existing collection games own important lobby/network teardown in
            // returnToModeSelector(). Let them reuse that path when present.
            if (typeof game.returnToModeSelector === 'function') {
                await game.returnToModeSelector({ source: 'pause-menu', direct: true });
                return true;
            }

            // Legacy games (for example the original canvas lobby) do not
            // expose a selector hook. Relaunching the same config gives them a
            // clean instance, which restores their initial mode/subgame chooser.
            const config = this.currentConfig;
            if (!config) return false;
            await this.launchGame(config);
            return Boolean(this.currentGame);
        } catch (error) {
            console.error('Failed to open game modes:', error);
            this.resumeGame();
            return false;
        }
    }

    _disposeCurrentGame() {
        const was3D = this.currentConfig?.type === '3d';

        try {
            this.currentGame?.destroy?.();
        } catch (error) {
            console.error('Failed to destroy current game:', error);
        }
        this.currentGame = null;

        if (was3D && this.canvas3d) {
            const fresh = document.createElement('canvas');
            fresh.id = 'game-canvas-3d';
            fresh.style.display = 'none';
            this.canvas3d.replaceWith(fresh);
            this.canvas3d = fresh;
        }

        const networkClose = this.network.close();
        this.network.clearCallbacks();
        this.mobile.clearCallbacks();
        this._unlockPointer();
        this.currentConfig = null;
        this._GameClass = null;
        this._isPaused = false;
        this.state = 'menu';
        this.canvas.style.display = 'block';
        this.canvas3d.style.display = 'none';
        return Promise.resolve(networkClose).catch(error => {
            console.error('Failed to close network while replacing game:', error);
        });
    }

    exitGame() {
        this._disposeCurrentGame();
        this.pauseMenu.hide();
        this._showMenu();
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Scores                                                    */
    /* ═══════════════════════════════════════════════════════════ */

    async _onScore(results) {
        if (!this.currentConfig) return;
        const recordSettings = this.currentGame?.getRecordSettings
            ? this.currentGame.getRecordSettings(this.currentSettings)
            : this.currentSettings;
        await this.records.addRecord(
            this.currentConfig._id,
            recordSettings,
            results,
        );
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  Pointer lock                                              */
    /* ═══════════════════════════════════════════════════════════ */

    _lockPointer() {
        // Lock keyboard so ESC does NOT auto-exit pointer lock.
        // We handle ESC ourselves (pause menu).
        if (navigator.keyboard?.lock) {
            navigator.keyboard.lock(['Escape']).catch(() => {});
        }
        const target = this.canvas3d?.style.display !== 'none' ? this.canvas3d : this.canvas;
        target.requestPointerLock().catch?.(() => {});
    }

    _unlockPointer() {
        if (navigator.keyboard?.unlock) navigator.keyboard.unlock();
        if (document.pointerLockElement) document.exitPointerLock();
    }

    _syncPointerLock() {
        // IMPORTANT FOR FUTURE AI AGENTS:
        // Mouse-steered games must keep pointer lock active during live gameplay.
        // Without it, the OS cursor can drift out of the Electron window, movementX /
        // movementY steering breaks, and the game becomes unplayable.
        // Only release pointer lock intentionally for pause menus, game-over UI, or
        // other interactive overlays that need a visible cursor.
        if (this.state !== 'playing' || !this.currentGame || this._isPaused) return;

        const wantsPointerLock = this.currentGame.wantsPointerLockNow
            ? this.currentGame.wantsPointerLockNow()
            : this.currentGame.wantsPointerLock;

        if (!wantsPointerLock) {
            if (document.pointerLockElement) this._unlockPointer();
            this._pointerLockRetryAt = 0;
            return;
        }

        if (document.pointerLockElement) {
            this._pointerLockRetryAt = 0;
            return;
        }

        const now = performance.now();
        if (now < this._pointerLockRetryAt) return;

        this._pointerLockRetryAt = now + 1000;
        this._lockPointer();
    }

    /* ═══════════════════════════════════════════════════════════ */
    /*  DOM helpers                                               */
    /* ═══════════════════════════════════════════════════════════ */

    _showGame() {
        this.mainMenu.hide();
        this.gameView.classList.add('active');
        this.fpsDisplay.style.display = '';
    }

    _showMenu() {
        this.gameView.classList.remove('active');
        this.fpsDisplay.style.display = 'none';
        this.mainMenu.show();
    }

    _resizeCanvas() {
        const is3D = this.currentConfig?.type === '3d';
        const targetCanvas = is3D ? this.canvas3d : this.canvas;

        targetCanvas.width  = window.innerWidth;
        targetCanvas.height = window.innerHeight;

        if (this.currentGame && this.currentGame.onResize) {
            this.currentGame.onResize(targetCanvas.width, targetCanvas.height);
        }
    }
}

// ── Bootstrap ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
