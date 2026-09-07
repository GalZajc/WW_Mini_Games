import assert from 'node:assert/strict';
import test from 'node:test';

import {
    bindModeGallery,
    getGameModes,
    hasGameModes,
    registerGameModes,
} from '../renderer/components/ModeGallery.js';
import { BaseGame } from '../renderer/core/BaseGame.js';

class TestElement {
    constructor() {
        this.listeners = new Map();
        this.cards = [];
        this.count = { textContent: '' };
    }

    addEventListener(type, callback) {
        const callbacks = this.listeners.get(type) || [];
        callbacks.push(callback);
        this.listeners.set(type, callbacks);
    }

    querySelectorAll(selector) {
        if (selector.includes('[data-mode]')) {
            return this.cards.filter(card => !selector.includes(':not([hidden])') || !card.hidden);
        }
        return [];
    }

    querySelector(selector) {
        return selector === '[data-mode-count]' ? this.count : null;
    }

    dispatch(type, target, extra = {}) {
        const event = {
            type,
            target,
            key: extra.key,
            preventDefault() { this.defaultPrevented = true; },
            defaultPrevented: false,
        };
        for (const callback of this.listeners.get(type) || []) callback(event);
        return event;
    }
}

class TestCard {
    constructor(key) {
        this.dataset = { mode: key, modeSearch: key };
        this.hidden = false;
        this.focused = false;
        this.clicks = 0;
    }

    matches(selector) {
        return selector === '[data-mode]';
    }

    closest(selector) {
        return selector === '[data-mode]' ? this : null;
    }

    focus() {
        this.focused = true;
        globalThis.document.activeElement = this;
    }

    click() {
        this.clicks++;
    }
}

test('mode metadata recognizes real multi-mode selectors and rejects single settings', () => {
    class SelectGame {
        static getSettingsSchema() {
            return [{
                key: 'mode',
                type: 'select',
                options: [{ value: 'alpha', label: 'Alpha' }, { value: 'beta', label: 'Beta' }],
            }];
        }
    }
    class SingleGame {
        static getSettingsSchema() {
            return [{ key: 'duration', type: 'range', default: 10 }];
        }
    }

    assert.equal(hasGameModes({ GameClass: SelectGame }), true);
    assert.deepEqual(getGameModes({ GameClass: SelectGame }).map(mode => mode.key), ['alpha', 'beta']);
    assert.equal(hasGameModes({ GameClass: SingleGame }), false);
});

test('mode registry is shared and retains normalized card metadata', () => {
    registerGameModes('global-menu-test', ['first', { key: 'second', label: 'Second', description: 'Two' }]);
    assert.deepEqual(getGameModes({ gameId: 'global-menu-test' }).map(mode => ({
        key: mode.key,
        title: mode.title,
        description: mode.description,
    })), [
        { key: 'first', title: 'First', description: '' },
        { key: 'second', title: 'Second', description: 'Two' },
    ]);
    assert.equal(hasGameModes({ gameId: 'global-menu-test' }), true);
    assert.equal(hasGameModes({ gameId: 'global-menu-test', game: { supportsModeSelection: true } }), true);
});

test('mode gallery keeps mouse clicks and adds arrow plus Enter navigation', () => {
    globalThis.document = { activeElement: null };
    const element = new TestElement();
    const first = new TestCard('first');
    const second = new TestCard('second');
    element.cards = [first, second];
    const selected = [];
    bindModeGallery(element, {
        onMode: mode => selected.push(mode),
        onBack: () => selected.push('back'),
    });
    // Reuse the same click path as a real DOM card event.
    element.listeners.get('click')[0]({ target: { closest: selector => selector === '[data-mode]' ? first : null } });
    assert.deepEqual(selected, ['first']);

    first.focus();
    const arrow = element.dispatch('keydown', first, { key: 'ArrowRight' });
    assert.equal(arrow.defaultPrevented, true);
    assert.equal(second.focused, true);

    const enter = element.dispatch('keydown', second, { key: 'Enter' });
    assert.equal(enter.defaultPrevented, true);
    assert.equal(second.clicks, 1);
});

test('BaseGame exposes a reusable layout widget registry', () => {
    const game = new BaseGame();
    const widget = { id: 'hud', selector: '[data-hud]' };
    assert.equal(game.registerLayoutWidget(widget), widget);
    assert.deepEqual(game.getLayoutWidgets(), [widget]);
    assert.notEqual(game.getLayoutWidgets(), game.layoutWidgets);
});
