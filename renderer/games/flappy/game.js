import { BaseGame } from '../../core/BaseGame.js';
import { bindModeGallery, modeGalleryMarkup } from '../../components/ModeGallery.js';
import ClassicFlappy from '../flappy-bird/game.js';
import HoopGlider3D from '../flappy-3d/game.js';
import MultiLaneFlappy3D from '../multi-lane-flappy-3d/game.js';

const MODE_INFO = Object.freeze({
    classic: { label: 'Classic 2D', artKey: 'flappy-classic', description: 'The original side-scrolling pipe game.', GameClass: ClassicFlappy, prefix: 'classic' },
    glider3d: { label: 'Hoop Glider 3D', artKey: 'flappy-glider3d', description: 'Steer freely through hoops in three dimensions.', GameClass: HoopGlider3D, prefix: 'glider' },
    multilane: { label: 'Multi-Lane 3D', artKey: 'flappy-multilane', description: 'Every bird must clear every row; one miss ends the run.', GameClass: MultiLaneFlappy3D, prefix: 'multi' },
});

function prefixedSettings(mode, info) {
    return info.GameClass.getSettingsSchema().map(setting => ({
        ...setting,
        key: `${info.prefix}_${setting.key}`,
        group: `${info.label}${setting.group ? ` · ${setting.group}` : ''}`,
        modes: [mode],
    }));
}

export default class FlappyCollectionGame extends BaseGame {
    init() {
        this.wantsPointerLock = false;
        this.supportsModeSelection = true;
        this.mode = null;
        this.child = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    _showModeSelector() {
        this.modeSelector?.remove();
        this.modeSelector = document.createElement('div');
        this.modeSelector.className = 'ww-mode-select';
        this.pendingMode = MODE_INFO[this.settings.mode] ? this.settings.mode : 'glider3d';
        this.modeSelector.innerHTML = modeGalleryMarkup({
            gameName: 'Flappy Collection',
            prompt: 'Choose flight mode',
            selectedMode: this.pendingMode,
            modes: Object.entries(MODE_INFO).map(([key, info]) => ({
                key, title: info.label, description: info.description, artKey: info.artKey,
            })),
        });
        document.body.appendChild(this.modeSelector);
        this._selectorClick = bindModeGallery(this.modeSelector, {
            onMode: mode => this.selectMode(mode),
            onBack: () => this.endGame(),
        });
    }

    _childSettings(mode) {
        const info = MODE_INFO[mode];
        return Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
            setting.key,
            this.settings[`${info.prefix}_${setting.key}`] ?? setting.default,
        ]));
    }

    selectMode(mode) {
        const info = MODE_INFO[mode];
        if (!info) return false;
        this.settings.mode = mode;
        try {
            this.preparePauseSettings(this.settings);
        } catch (error) {
            let message = this.modeSelector?.querySelector('[data-size-error]');
            if (!message && this.modeSelector) {
                message = document.createElement('div');
                message.dataset.sizeError = 'true';
                this.modeSelector.appendChild(message);
            }
            if (message) {
                message.textContent = error.message;
                message.style.cssText = 'margin:10px 0;color:#b3261e;font-weight:800;font-size:12px;';
            }
            return false;
        }
        this.app.currentSettings = { ...this.settings };
        this.app.settingsManager.save('flappy', this.settings).catch(() => {});
        this.modeSelector?.remove();
        this.modeSelector = null;
        this.mode = mode;
        this.phase = 'playing';
        this.modeCanvas = document.createElement('canvas');
        this.modeCanvas.style.cssText = 'position:fixed;inset:0;z-index:700;width:100%;height:100%;display:block;';
        this.modeCanvas.width = window.innerWidth;
        this.modeCanvas.height = window.innerHeight;
        document.body.appendChild(this.modeCanvas);
        const context = mode === 'classic' ? this.modeCanvas.getContext('2d') : null;
        this.child = new info.GameClass();
        const recordSettings = this.getRecordSettings({ ...this.settings, mode });
        const childApp = {
            ...this.app,
            records: {
                getBest: (_legacyGameId, _legacySettings, resultKey, direction = 'max') =>
                    this.app.records.getBest('flappy', recordSettings, resultKey, direction),
            },
        };
        this.child._setup(
            this.modeCanvas,
            context,
            this.input,
            this.audio,
            this._childSettings(mode),
            results => this.submitScore({ ...results, mode }),
            () => this.endGame(),
            this.network,
            childApp,
            this.mobile,
        );
        return true;
    }

    returnToModeSelector() {
        this._destroyChild();
        this.mode = null;
        this.phase = 'mode-select';
        this._showModeSelector();
    }

    _destroyChild() {
        this.child?.destroy?.();
        this.child = null;
        this.modeCanvas?.remove();
        this.modeCanvas = null;
    }

    update(dt) { this.child?.update?.(dt); }
    render() { this.child?.render?.(); }
    onPause() { this.child?.onPause?.(); }
    onResume() { this.child?.onResume?.(); }
    onResize(width, height) {
        if (!this.modeCanvas) return;
        this.modeCanvas.width = width;
        this.modeCanvas.height = height;
        this.child?.onResize?.(width, height);
    }
    wantsPointerLockNow() { return this.child?.wantsPointerLockNow?.() ?? false; }

    preparePauseSettings(settings) {
        const mode = MODE_INFO[settings?.mode] ? settings.mode : (this.mode || 'classic');
        const info = MODE_INFO[mode];
        const childSettings = Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
            setting.key,
            settings?.[`${info.prefix}_${setting.key}`] ?? setting.default,
        ]));
        const validator = new info.GameClass();
        validator.preparePauseSettings(childSettings);
        return settings;
    }

    destroy() {
        this.modeSelector?.remove();
        this.modeSelector = null;
        this._destroyChild();
    }

    getRecordSettings(settings = this.settings) {
        const mode = MODE_INFO[settings.mode] ? settings.mode : 'classic';
        const info = MODE_INFO[mode];
        return {
            mode,
            ...Object.fromEntries(info.GameClass.getSettingsSchema().map(setting => [
                setting.key,
                settings[`${info.prefix}_${setting.key}`] ?? setting.default,
            ])),
        };
    }

    static getSettingsSchema() {
        return [
            { key: 'mode', label: 'Mode', type: 'hidden', default: 'glider3d' },
            ...Object.entries(MODE_INFO).flatMap(([mode, info]) => prefixedSettings(mode, info)),
            { key: 'flappyProfileVersion', label: 'Settings profile version', type: 'hidden', default: 0 },
        ];
    }

    static async migrateSettings(settings) {
        if (Number(settings.flappyProfileVersion ?? 0) >= 2) return settings;
        const migrated = { ...settings, flappyProfileVersion: 2 };
        const legacyIds = {
            classic: 'flappy-bird',
            glider3d: 'flappy-3d',
            multilane: 'multi-lane-flappy-3d',
        };
        for (const [mode, info] of Object.entries(MODE_INFO)) {
            const legacy = await window.api.readSettings(legacyIds[mode]);
            for (const setting of info.GameClass.getSettingsSchema()) {
                const key = `${info.prefix}_${setting.key}`;
                const stillDefault = JSON.stringify(migrated[key]) === JSON.stringify(setting.default);
                if (legacy?.[setting.key] !== undefined &&
                    (migrated[key] === undefined || stillDefault)) {
                    migrated[key] = legacy[setting.key];
                }
            }
        }
        return migrated;
    }

    static getControlsSchema() {
        const controls = Object.values(MODE_INFO).flatMap(info => info.GameClass.getControlsSchema());
        return [...new Map(controls.map(control => [control.action, control])).values()];
    }
}
