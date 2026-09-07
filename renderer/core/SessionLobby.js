const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Compact reusable launcher for local, AI and LAN turn-based games. */
export class SessionLobby {
    constructor(game, options = {}) {
        this.game = game;
        this.options = {
            title: 'Namizna igra',
            players: 2,
            allowHotseat: true,
            allowLan: true,
            ...options,
        };
        this.phase = 'menu';
        this.message = '';
        this.peerIds = [];
        this.element = document.createElement('div');
        this.element.className = 'session-lobby';
        this.element.style.cssText = `
            position:fixed;inset:0;z-index:760;display:grid;place-items:center;
            padding:24px;background:linear-gradient(155deg,#69c9f2,#c3edfb);
            color:#17331d;font-family:Inter,system-ui,sans-serif;pointer-events:auto;
        `;
        this._click = event => this._onClick(event);
        this._key = event => {
            if (event.key === 'Escape' && this.phase !== 'menu') {
                this.game.network.close();
                this.phase = 'menu';
                this.message = '';
                this.render();
            }
        };
        this.element.addEventListener('click', this._click);
        window.addEventListener('keydown', this._key);
        document.body.appendChild(this.element);
        this.render();
    }

    render() {
        const button = (action, label, disabled = false) =>
            `<button data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
        let content = '';
        if (this.phase === 'menu') {
            content = `
                <p>Izberi način igranja.</p>
                <div class="session-actions">
                    ${button('solo', 'En igralec proti računalniku')}
                    ${this.options.allowHotseat ? button('hotseat', 'Igralci za tem računalnikom') : ''}
                    ${this.options.allowLan ? button('host', 'Gostuj LAN igro') : ''}
                    ${this.options.allowLan ? button('join', 'Pridruži se LAN igri') : ''}
                </div>`;
        } else if (this.phase === 'hosting') {
            const connected = this.peerIds.length;
            content = `
                <p>Koda gostitelja</p>
                <div class="session-code">${escapeHtml(this.game.network.code || '…')}</div>
                <p>${connected} povezan${connected === 1 ? '' : 'ih'} · nepovezana mesta zapolni računalnik</p>
                <div class="session-actions">
                    ${button('copy', 'Kopiraj kodo')}
                    ${button('start-host', 'Začni igro')}
                    ${button('cancel', 'Nazaj')}
                </div>`;
        } else if (this.phase === 'joining') {
            content = `
                <p>Vnesi naslov in vrata gostitelja.</p>
                <input data-join-code spellcheck="false" autocomplete="off" placeholder="192.168.1.20:4827">
                <div class="session-actions">
                    ${button('connect', 'Poveži')}
                    ${button('cancel', 'Nazaj')}
                </div>`;
        } else {
            content = `<p>${escapeHtml(this.message || 'Čakam gostitelja…')}</p>${button('cancel', 'Prekliči')}`;
        }
        this.element.innerHTML = `
            <section class="session-panel">
                <h1>${escapeHtml(this.options.title)}</h1>
                ${content}
                ${this.message && this.phase !== 'waiting' ? `<div class="session-message">${escapeHtml(this.message)}</div>` : ''}
            </section>`;
        this._applyStyles();
        if (this.phase === 'joining') this.element.querySelector('[data-join-code]')?.focus();
    }

    _applyStyles() {
        const panel = this.element.querySelector('.session-panel');
        if (!panel) return;
        panel.style.cssText = 'width:min(520px,100%);padding:24px;border:2px solid #176d25;border-radius:12px;background:linear-gradient(#74d650,#38a936);box-shadow:0 12px 36px rgba(23,83,42,.28);text-align:center';
        const title = panel.querySelector('h1');
        if (title) title.style.cssText = 'margin:0 0 8px;color:#fff;font-size:24px;text-shadow:0 1px #155f22';
        panel.querySelectorAll('p').forEach(p => p.style.cssText = 'margin:9px 0;color:#efffe9;font-size:12px');
        panel.querySelectorAll('button').forEach(b => b.style.cssText = 'height:31px;padding:0 12px;border:1px solid #176d25;border-radius:5px;background:#62cb4b;color:#17331d;font:700 11px Inter;cursor:pointer;box-shadow:inset 0 1px #d8ffc8');
        panel.querySelectorAll('.session-actions').forEach(row => row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin-top:16px');
        const input = panel.querySelector('input');
        if (input) input.style.cssText = 'width:100%;height:34px;margin:8px 0;padding:0 10px;border:1px solid #176d25;border-radius:5px;background:#b8ef9b;color:#17331d;font:13px JetBrains Mono,monospace;outline:none';
        const code = panel.querySelector('.session-code');
        if (code) code.style.cssText = 'padding:10px;border:1px solid #176d25;border-radius:5px;background:#b8ef9b;font:700 16px JetBrains Mono,monospace;user-select:text';
        const message = panel.querySelector('.session-message');
        if (message) message.style.cssText = 'margin-top:12px;color:#7b1e22;font-weight:700';
    }

    async _onClick(event) {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        this.game.audio.playClick?.();
        if (action === 'solo') return this._start({ mode: 'solo', seat: 0, peerSeats: {} });
        if (action === 'hotseat') return this._start({ mode: 'hotseat', seat: 0, peerSeats: {} });
        if (action === 'join') {
            this.phase = 'joining'; this.message = ''; this.render(); return;
        }
        if (action === 'host') {
            this.phase = 'waiting'; this.message = 'Odpiram LAN sobo…'; this.render();
            const result = await this.game.network.host(0, Math.max(1, this.options.players - 1));
            if (!result.success) {
                this.phase = 'menu'; this.message = result.error || 'Sobe ni bilo mogoče odpreti.';
            } else this.phase = 'hosting';
            this.render(); return;
        }
        if (action === 'connect') {
            const code = this.element.querySelector('[data-join-code]')?.value.trim();
            if (!code) return;
            this.phase = 'waiting'; this.message = 'Povezujem se…'; this.render();
            const result = await this.game.network.join(code);
            if (!result.success) {
                this.phase = 'joining'; this.message = result.error || 'Povezava ni uspela.';
                this.render();
            } else {
                this.message = 'Povezano. Čakam, da gostitelj začne igro…'; this.render();
            }
            return;
        }
        if (action === 'start-host') return this._startHost();
        if (action === 'copy') {
            await navigator.clipboard.writeText(this.game.network.code || '').catch(() => {});
            this.message = 'Koda je kopirana.'; this.render(); return;
        }
        if (action === 'cancel') {
            await this.game.network.close();
            this.peerIds = []; this.phase = 'menu'; this.message = ''; this.render();
        }
    }

    handleConnect({ peerId } = {}) {
        if (this.game.network.isHost && peerId && !this.peerIds.includes(peerId)) this.peerIds.push(peerId);
        if (this.phase === 'hosting') this.render();
    }

    handleDisconnect({ peerId } = {}) {
        this.peerIds = this.peerIds.filter(id => id !== peerId);
        if (this.phase === 'hosting') this.render();
        else if (this.phase === 'waiting') {
            this.phase = 'joining'; this.message = 'Povezava je bila prekinjena.'; this.render();
        }
    }

    handleMessage(message) {
        if (message?.type !== 'session-start') return false;
        this._start({
            mode: 'lan',
            seat: message.seat,
            state: message.state,
            seed: message.seed,
            peerSeats: {},
            isHost: false,
        });
        return true;
    }

    _startHost() {
        const seed = globalThis.crypto?.getRandomValues
            ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
            : Date.now() >>> 0;
        const peerSeats = {};
        this.peerIds.forEach((peerId, index) => {
            const seat = index + 1;
            peerSeats[peerId] = seat;
            this.game.network.sendTo(peerId, { type: 'session-start', seat, seed });
        });
        this._start({ mode: 'lan', seat: 0, seed, peerSeats, isHost: true });
    }

    _start(session) {
        this.destroy();
        this.options.onStart?.(session);
    }

    destroy() {
        this.element?.removeEventListener('click', this._click);
        window.removeEventListener('keydown', this._key);
        this.element?.remove();
        this.element = null;
    }
}
