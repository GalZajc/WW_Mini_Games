const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // ── File persistence ──
    scanGames:       ()                    => ipcRenderer.invoke('scan-games'),
    readSettings:    (gameId)              => ipcRenderer.invoke('read-settings', gameId),
    writeSettings:   (gameId, settings)    => ipcRenderer.invoke('write-settings', gameId, settings),
    writeTetrisPhysicsDiagnostic: data     => ipcRenderer.invoke('write-tetris-physics-diagnostic', data),
    readReRoMoProjectionCache:  (key)        => ipcRenderer.invoke('read-reromo-projection-cache', key),
    writeReRoMoProjectionCache: (key, bytes) => ipcRenderer.invoke('write-reromo-projection-cache', key, bytes),
    readGlobalSettings: ()                 => ipcRenderer.invoke('read-global-settings'),
    writeGlobalSettings: (settings)        => ipcRenderer.invoke('write-global-settings', settings),
    readRecords:     ()                    => ipcRenderer.invoke('read-records'),
    writeRecords:    (records)             => ipcRenderer.invoke('write-records', records),
    readKeybindings: ()                    => ipcRenderer.invoke('read-keybindings'),
    writeKeybindings:(bindings)            => ipcRenderer.invoke('write-keybindings', bindings),

    // ── Multiplayer networking ──
    netHost:          (options)            => ipcRenderer.invoke('net-host', options),
    netJoin:          (code)               => ipcRenderer.invoke('net-join', code),
    netSend:          (message, peerId)    => ipcRenderer.invoke('net-send', message, peerId),
    netClose:         ()                   => ipcRenderer.invoke('net-close'),
    onNetEvent:       (cb)                 => ipcRenderer.on('net-event', (_ev, data) => cb(data)),
    removeNetListeners: ()                 => ipcRenderer.removeAllListeners('net-event'),

    // ── Mobile controller networking ──
    mobileHost:       (port)               => ipcRenderer.invoke('mobile-host', port),
    mobileSend:       (message)            => ipcRenderer.invoke('mobile-send', message),
    mobileClose:      ()                   => ipcRenderer.invoke('mobile-close'),
    onMobileEvent:    (cb)                 => ipcRenderer.on('mobile-event', (_ev, data) => cb(data)),
    removeMobileListeners: ()              => ipcRenderer.removeAllListeners('mobile-event'),
});
