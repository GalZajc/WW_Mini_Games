const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');
const crypto = require('crypto');
const IS_HEADLESS_TEST = process.env.WW_MINI_GAMES_HEADLESS_TEST === '1';

const iconPath = path.join(__dirname, 'icon.ico');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#0c0c14',
        icon: iconPath,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            backgroundThrottling: !IS_HEADLESS_TEST,
        },
        frame: true,
        title: 'WW Mini Games',
        show: false,
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile('renderer/index.html');

    mainWindow.once('ready-to-show', () => {
        if (!IS_HEADLESS_TEST) {
            mainWindow.show();
        }
    });

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Forward renderer console messages to main process stdout
    mainWindow.webContents.on('console-message', (_ev, level, message, line, sourceId) => {
        if (level >= 2) { // warnings and errors only
            console.error(`[Renderer] ${message} (${sourceId}:${line})`);
        }
    });

    mainWindow.webContents.on('render-process-gone', (_ev, details) => {
        console.error('[CRASH] Renderer process gone:', details.reason);
    });
}

if (process.platform === 'win32') {
    app.setAppUserModelId('ww-mini-games');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

// ── Data Directory ──────────────────────────────────────────────

const dataDir = path.join(__dirname, 'data');
const reromoProjectionCacheDir = path.join(dataDir, 'reromo-tetris-projection-cache');
const reromoBundledProjectionDir = path.join(
    __dirname,
    'renderer',
    'games',
    'reromo-tetris',
    'projection-presets',
);
const mobileControllerDir = path.join(__dirname, 'renderer', 'mobile-controller');
const mobileControllerStatePath = path.join(dataDir, 'mobile_controller_state.json');
const globalSettingsPath = path.join(dataDir, 'global_settings.json');
const DEFAULT_MOBILE_PORT = 53748;

async function ensureDataDir() {
    await fs.mkdir(dataDir, { recursive: true }).catch(() => {});
}

// Keep one reproducible physics event, replacing it rather than growing a log.
ipcMain.handle('write-tetris-physics-diagnostic', async (_event, data) => {
    const json = JSON.stringify(data, null, 2);
    if (!json || Buffer.byteLength(json, 'utf8') > 5 * 1024 * 1024) return false;
    await ensureDataDir();
    await fs.writeFile(path.join(dataDir, 'tetris-physics-last.json'), json, 'utf8');
    return true;
});

function validateReRoMoProjectionKey(key) {
    const match = /^v\d+-c(\d{1,3})-r(\d{1,3})-s(\d{1,2})$/.exec(String(key || ''));
    if (!match) throw new Error('Invalid ReRoMo projection-cache key.');
    const columns = Number(match[1]);
    const rows = Number(match[2]);
    const subdivisions = Number(match[3]);
    // Keep this in sync with reromo-tetris/projection-cache.js. Ten columns is
    // both the standard Cartesian width and a valid cached Möbius template.
    if (columns < 10 || columns > 256 || rows < 10 || rows > 256 ||
        subdivisions < 2 || subdivisions > 32) {
        throw new Error('ReRoMo projection-cache dimensions are out of range.');
    }
    return match[0];
}

function toArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function readJsonFileSafe(filePath, fallback) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

async function loadMobileControllerState() {
    await ensureDataDir();
    return readJsonFileSafe(mobileControllerStatePath, {});
}

async function saveMobileControllerState(state) {
    await ensureDataDir();
    await fs.writeFile(mobileControllerStatePath, JSON.stringify(state, null, 2));
}

// ── IPC: Scan game directories ──────────────────────────────────

ipcMain.handle('scan-games', async () => {
    const gamesDir = path.join(__dirname, 'renderer', 'games');
    try {
        const entries = await fs.readdir(gamesDir, { withFileTypes: true });
        const games = [];
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const configPath = path.join(gamesDir, entry.name, 'config.json');
            try {
                const raw = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(raw);
                if (config.hidden) continue;
                config._id = entry.name;
                config._path = path.join(gamesDir, entry.name).replace(/\\/g, '/');
                games.push(config);
            } catch (_) { /* skip dirs without valid config */ }
        }
        return games;
    } catch (_) {
        return [];
    }
});

// ── IPC: Per-game settings ──────────────────────────────────────

ipcMain.handle('read-settings', async (_ev, gameId) => {
    await ensureDataDir();
    try {
        const raw = await fs.readFile(path.join(dataDir, `settings_${gameId}.json`), 'utf8');
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
});

ipcMain.handle('write-settings', async (_ev, gameId, settings) => {
    await ensureDataDir();
    await fs.writeFile(
        path.join(dataDir, `settings_${gameId}.json`),
        JSON.stringify(settings, null, 2),
    );
    return true;
});

// ── ReRoMo Tetris projected-grid cache ─────────────────────────

ipcMain.handle('read-reromo-projection-cache', async (_ev, rawKey) => {
    const key = validateReRoMoProjectionKey(rawKey);
    const candidates = [
        path.join(reromoProjectionCacheDir, `${key}.bin`),
        path.join(reromoBundledProjectionDir, `${key}.bin`),
    ];
    for (const candidate of candidates) {
        try {
            return toArrayBuffer(await fs.readFile(candidate));
        } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
        }
    }
    return null;
});

ipcMain.handle('write-reromo-projection-cache', async (_ev, rawKey, bytes) => {
    const key = validateReRoMoProjectionKey(rawKey);
    const source = bytes instanceof ArrayBuffer
        ? Buffer.from(bytes)
        : ArrayBuffer.isView(bytes)
            ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
            : null;
    if (!source || source.byteLength === 0 || source.byteLength > 32 * 1024 * 1024) {
        throw new Error('Invalid ReRoMo projection-cache payload.');
    }
    await fs.mkdir(reromoProjectionCacheDir, { recursive: true });
    await fs.writeFile(path.join(reromoProjectionCacheDir, `${key}.bin`), source);
    return true;
});

// ── IPC: Global settings ───────────────────────────────────────

ipcMain.handle('read-global-settings', async () => {
    await ensureDataDir();
    return readJsonFileSafe(globalSettingsPath, {});
});

ipcMain.handle('write-global-settings', async (_ev, settings) => {
    await ensureDataDir();
    await fs.writeFile(
        globalSettingsPath,
        JSON.stringify(settings || {}, null, 2),
    );
    return true;
});

// ── IPC: Records ────────────────────────────────────────────────

ipcMain.handle('read-records', async () => {
    await ensureDataDir();
    try {
        const raw = await fs.readFile(path.join(dataDir, 'records.json'), 'utf8');
        return JSON.parse(raw);
    } catch (_) {
        return {};
    }
});

ipcMain.handle('write-records', async (_ev, records) => {
    await ensureDataDir();
    await fs.writeFile(
        path.join(dataDir, 'records.json'),
        JSON.stringify(records, null, 2),
    );
    return true;
});

// ── IPC: Keybindings ────────────────────────────────────────────

ipcMain.handle('read-keybindings', async () => {
    await ensureDataDir();
    try {
        const raw = await fs.readFile(path.join(dataDir, 'keybindings.json'), 'utf8');
        return JSON.parse(raw);
    } catch (_) {
        return {};
    }
});

ipcMain.handle('write-keybindings', async (_ev, bindings) => {
    await ensureDataDir();
    await fs.writeFile(
        path.join(dataDir, 'keybindings.json'),
        JSON.stringify(bindings, null, 2),
    );
    return true;
});

// ═══════════════════════════════════════════════════════════════
//  Multiplayer Networking (WebSocket)
// ═══════════════════════════════════════════════════════════════

const WebSocket = require('ws');
const os = require('os');

let wsServer   = null;   // WebSocket.Server instance (host)
let wsClient   = null;   // WebSocket instance (joiner)
let peerSocket = null;   // The single connected peer socket
let peerSockets = new Map();
let nextPeerId = 1;
let maximumPeers = 1;

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function closeNetwork() {
    for (const socket of peerSockets.values()) {
        try { socket.close(); } catch (_) {}
    }
    peerSockets.clear();
    if (peerSocket) { try { peerSocket.close(); } catch (_) {} peerSocket = null; }
    if (wsClient)   { try { wsClient.close(); }   catch (_) {} wsClient   = null; }
    if (wsServer)   { try { wsServer.close(); }   catch (_) {} wsServer   = null; }
    nextPeerId = 1;
    maximumPeers = 1;
}

// ═══════════════════════════════════════════════════════════════
//  Mobile Controller Networking (HTTP + WebSocket)
// ═══════════════════════════════════════════════════════════════

let mobileHttpServer = null;
let mobileWsServer   = null;
let mobileSocket     = null;
let mobileSession    = null;

function closeMobileController() {
    if (mobileSocket) {
        try { mobileSocket.close(); } catch (_) {}
        mobileSocket = null;
    }
    if (mobileWsServer) {
        try { mobileWsServer.close(); } catch (_) {}
        mobileWsServer = null;
    }
    if (mobileHttpServer) {
        try { mobileHttpServer.close(); } catch (_) {}
        mobileHttpServer = null;
    }
    mobileSession = null;
}

function getMobileAsset(pathname) {
    switch (pathname) {
        case '/':
        case '/index.html':
        case '/controller':
            return { file: 'index.html', contentType: 'text/html; charset=utf-8' };
        case '/controller.js':
            return { file: 'controller.js', contentType: 'application/javascript; charset=utf-8' };
        case '/controller.css':
            return { file: 'controller.css', contentType: 'text/css; charset=utf-8' };
        default:
            return null;
    }
}

async function serveMobileController(req, res) {
    try {
        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
        const asset = getMobileAsset(url.pathname);
        if (!asset) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        const filePath = path.join(mobileControllerDir, asset.file);
        const contents = await fs.readFile(filePath);
        res.writeHead(200, {
            'Content-Type': asset.contentType,
            'Cache-Control': 'no-store',
        });
        res.end(contents);
    } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Failed to serve mobile controller: ${err.message}`);
    }
}

function getMobilePairUrl(ip, port, token) {
    return `http://${ip}:${port}/?token=${token}`;
}

// ── Host a game ─────────────────────────────────────────────────

ipcMain.handle('net-host', async (_ev, rawOptions) => {
    try {
        closeNetwork();
        const options = rawOptions && typeof rawOptions === 'object'
            ? rawOptions
            : { port: rawOptions };
        const port = Number(options.port) || 0;
        maximumPeers = Math.max(1, Math.min(7, Math.round(Number(options.maxPeers) || 1)));
        return new Promise((resolve) => {
            wsServer = new WebSocket.Server({ port: port || 0 }, () => {
                const addr = wsServer.address();
                const ip   = getLocalIP();
                const code = `${ip}:${addr.port}`;

                wsServer.on('connection', (ws) => {
                    if (peerSockets.size >= maximumPeers) {
                        ws.close(1013, 'Game is full');
                        return;
                    }
                    const peerId = `peer-${nextPeerId++}`;
                    peerSockets.set(peerId, ws);
                    peerSocket = peerSockets.values().next().value || null;
                    mainWindow.webContents.send('net-event', {
                        type: 'connected', peerId, peerCount: peerSockets.size,
                    });

                    ws.on('message', (raw) => {
                        try {
                            const msg = JSON.parse(raw.toString());
                            mainWindow.webContents.send('net-event', {
                                type: 'message', data: msg, peerId,
                            });
                        } catch (_) {}
                    });

                    ws.on('close', () => {
                        peerSockets.delete(peerId);
                        peerSocket = peerSockets.values().next().value || null;
                        mainWindow.webContents.send('net-event', {
                            type: 'disconnected', peerId, peerCount: peerSockets.size,
                        });
                    });
                });

                resolve({ success: true, code });
            });

            wsServer.on('error', (err) => {
                resolve({ success: false, error: err.message });
            });
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ── Join a game ─────────────────────────────────────────────────

ipcMain.handle('net-join', async (_ev, code) => {
    try {
        closeNetwork();
        return new Promise((resolve) => {
            const url = `ws://${code}`;
            wsClient  = new WebSocket(url);

            wsClient.on('open', () => {
                peerSocket = wsClient;
                peerSockets.set('host', wsClient);
                mainWindow.webContents.send('net-event', {
                    type: 'connected', peerId: 'host', peerCount: 1,
                });
                resolve({ success: true });
            });

            wsClient.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    mainWindow.webContents.send('net-event', {
                        type: 'message', data: msg, peerId: 'host',
                    });
                } catch (_) {}
            });

            wsClient.on('close', () => {
                peerSocket = null;
                peerSockets.delete('host');
                mainWindow.webContents.send('net-event', {
                    type: 'disconnected', peerId: 'host', peerCount: 0,
                });
            });

            wsClient.on('error', (err) => {
                resolve({ success: false, error: err.message });
            });

            // 10-second timeout
            setTimeout(() => {
                if (!peerSocket) {
                    try { wsClient.close(); } catch (_) {}
                    resolve({ success: false, error: 'Connection timeout' });
                }
            }, 10000);
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// ── Send / Close ────────────────────────────────────────────────

ipcMain.handle('net-send', async (_ev, message, peerId) => {
    const encoded = JSON.stringify(message);
    if (peerId) {
        const target = peerSockets.get(peerId);
        if (target?.readyState === WebSocket.OPEN) {
            target.send(encoded);
            return true;
        }
        return false;
    }
    let sent = false;
    for (const socket of peerSockets.values()) {
        if (socket.readyState !== WebSocket.OPEN) continue;
        socket.send(encoded);
        sent = true;
    }
    return sent;
});

ipcMain.handle('net-close', async () => {
    closeNetwork();
    return true;
});

// ── Host a mobile controller ───────────────────────────────────

ipcMain.handle('mobile-host', async (_ev, port) => {
    try {
        if (mobileHttpServer && mobileWsServer && mobileSession?.url) {
            return {
                success: true,
                url: mobileSession.url,
                code: `${mobileSession.ip}:${mobileSession.port}`,
                reused: true,
            };
        }

        const savedState = IS_HEADLESS_TEST ? {} : await loadMobileControllerState();
        const token = savedState.token || crypto.randomBytes(16).toString('hex');
        const requestedPort = IS_HEADLESS_TEST ? 0 : (port || savedState.preferredPort || DEFAULT_MOBILE_PORT);

        return await new Promise((resolve) => {
            let settled = false;

            const finish = (result) => {
                if (settled) return;
                settled = true;
                resolve(result);
            };

            const startServer = (listenPort, allowFallback) => {
                closeMobileController();

                mobileSession = { token };
                mobileWsServer = new WebSocket.Server({ noServer: true });
                mobileHttpServer = http.createServer((req, res) => {
                    serveMobileController(req, res);
                });

                mobileHttpServer.on('upgrade', (req, socket, head) => {
                    try {
                        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
                        const incomingToken = url.searchParams.get('token');

                        if (url.pathname !== '/ws' || incomingToken !== mobileSession?.token) {
                            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                            socket.destroy();
                            return;
                        }

                        mobileWsServer.handleUpgrade(req, socket, head, (ws) => {
                            mobileWsServer.emit('connection', ws, req);
                        });
                    } catch (_) {
                        socket.destroy();
                    }
                });

                mobileWsServer.on('connection', (ws, req) => {
                    if (mobileSocket) {
                        try {
                            mobileSocket.close(1000, 'Replaced by a newer controller');
                        } catch (_) {}
                    }

                    mobileSocket = ws;
                    mobileSocket._socket?.setNoDelay?.(true);

                    let info = null;
                    try {
                        const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
                        info = {
                            ip: req.socket.remoteAddress,
                            userAgent: req.headers['user-agent'] || '',
                            token: url.searchParams.get('token'),
                        };
                    } catch (_) {
                        info = { ip: req.socket.remoteAddress };
                    }

                    mainWindow.webContents.send('mobile-event', { type: 'connected', data: info });

                    ws.on('message', (raw) => {
                        try {
                            const msg = JSON.parse(raw.toString());
                            mainWindow.webContents.send('mobile-event', { type: 'message', data: msg });
                        } catch (_) {}
                    });

                    ws.on('close', () => {
                        if (mobileSocket === ws) {
                            mobileSocket = null;
                            mainWindow.webContents.send('mobile-event', { type: 'disconnected' });
                        }
                    });
                });

                mobileHttpServer.once('error', (err) => {
                    if (allowFallback && err.code === 'EADDRINUSE' && listenPort !== 0) {
                        startServer(0, false);
                        return;
                    }
                    closeMobileController();
                    finish({ success: false, error: err.message });
                });

                mobileHttpServer.listen(listenPort, async () => {
                    const addr = mobileHttpServer.address();
                    const ip = getLocalIP();
                    const url = getMobilePairUrl(ip, addr.port, token);
                    mobileSession = { token, port: addr.port, ip, url };

                    if (!IS_HEADLESS_TEST) {
                        try {
                            await saveMobileControllerState({
                                token,
                                preferredPort: addr.port,
                            });
                        } catch (_) {}
                    }

                    finish({
                        success: true,
                        url,
                        code: `${ip}:${addr.port}`,
                        reused: false,
                    });
                });
            };

            startServer(requestedPort, !port && requestedPort !== 0);
        });
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mobile-send', async (_ev, message) => {
    if (mobileSocket && mobileSocket.readyState === WebSocket.OPEN) {
        mobileSocket.send(JSON.stringify(message));
        return true;
    }
    return false;
});

ipcMain.handle('mobile-close', async () => {
    closeMobileController();
    return true;
});

// Clean up on quit
app.on('before-quit', () => {
    closeNetwork();
    closeMobileController();
});
