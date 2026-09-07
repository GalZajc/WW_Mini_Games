/**
 * NetworkManager — Multiplayer networking API for games.
 *
 * Wraps the IPC-based WebSocket bridge exposed by preload.js.
 * Games interact with this via BaseGame.network.
 *
 * Usage from a game:
 *   await this.network.host();       // create a game server
 *   this.network.code;               // "192.168.1.5:4827"
 *   await this.network.join(code);   // connect to a host
 *   this.network.send({ type: 'move', row: 0, col: 1 });
 *   this.network.onMessage(msg => { ... });
 *   this.network.onConnect(() => { ... });
 *   this.network.onDisconnect(() => { ... });
 */
export class NetworkManager {

    constructor() {
        this.isConnected  = false;
        this.isHost       = false;
        this.code         = null;
        this.peers        = new Set();

        this._msgCbs      = [];
        this._connectCbs  = [];
        this._disconnCbs  = [];

        // Listen for IPC events from main process
        window.api.onNetEvent((event) => {
            switch (event.type) {
                case 'connected':
                    this.isConnected = true;
                    if (event.peerId) this.peers.add(event.peerId);
                    this._connectCbs.forEach(cb => cb({
                        peerId: event.peerId || null,
                        peerCount: event.peerCount ?? this.peers.size,
                    }));
                    break;
                case 'disconnected':
                    if (event.peerId) this.peers.delete(event.peerId);
                    this.isConnected = this.peers.size > 0;
                    this._disconnCbs.forEach(cb => cb({
                        peerId: event.peerId || null,
                        peerCount: event.peerCount ?? this.peers.size,
                    }));
                    break;
                case 'message':
                    this._msgCbs.forEach(cb => cb(event.data, {
                        peerId: event.peerId || null,
                    }));
                    break;
            }
        });
    }

    /**
     * Host a game. Creates a WebSocket server.
     * @param {number} [port=0] — 0 = random available port
     * @returns {{ success: boolean, code?: string, error?: string }}
     */
    async host(port = 0, maxPeers = 1) {
        this.peers.clear();
        this.isConnected = false;
        const result = await window.api.netHost({ port, maxPeers });
        if (result.success) {
            this.isHost = true;
            this.code   = result.code;
        }
        return result;
    }

    /**
     * Join a hosted game.
     * @param {string} code — host code, e.g. "192.168.1.5:4827"
     * @returns {{ success: boolean, error?: string }}
     */
    async join(code) {
        this.peers.clear();
        this.isConnected = false;
        const result = await window.api.netJoin(code);
        if (result.success) {
            this.isHost = false;
            this.code   = code;
        }
        return result;
    }

    /** Send a message object to the peer. */
    send(message, peerId = null) {
        return window.api.netSend(message, peerId);
    }

    /** Send only to one connected peer in a multi-player host room. */
    sendTo(peerId, message) { return this.send(message, peerId); }

    /** Close the connection and stop hosting/joining. */
    async close() {
        await window.api.netClose();
        this.isConnected = false;
        this.isHost      = false;
        this.code        = null;
        this.peers.clear();
    }

    /** Register a callback for incoming messages. */
    onMessage(cb)    { this._msgCbs.push(cb); }
    /** Register a callback for when peer connects. */
    onConnect(cb)    { this._connectCbs.push(cb); }
    /** Register a callback for when peer disconnects. */
    onDisconnect(cb) { this._disconnCbs.push(cb); }

    /** Remove all game-level callbacks (called when exiting a game). */
    clearCallbacks() {
        this._msgCbs     = [];
        this._connectCbs = [];
        this._disconnCbs = [];
    }
}
