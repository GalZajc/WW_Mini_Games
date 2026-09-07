const socketStatusEl = document.getElementById('socket-status');
const sensorStatusEl = document.getElementById('sensor-status');
const touchStatusEl = document.getElementById('touch-status');
const hintTextEl = document.getElementById('hint-text');
const betaValueEl = document.getElementById('beta-value');
const gammaValueEl = document.getElementById('gamma-value');
const accxValueEl = document.getElementById('accx-value');
const accyValueEl = document.getElementById('accy-value');
const packetValueEl = document.getElementById('packet-value');
const contextValueEl = document.getElementById('context-value');
const enableButtonEl = document.getElementById('enable-button');
const openAppButtonEl = document.getElementById('open-app-button');
const copyLinkButtonEl = document.getElementById('copy-link-button');
const appLinkStatusEl = document.getElementById('app-link-status');
const touchpadEl = document.getElementById('touchpad');
const touchOverlayEl = document.getElementById('touch-overlay');
const touchpadToggleEl = document.getElementById('touchpad-toggle');

const TARGET_SEND_MS = 1000 / 60;
const HEARTBEAT_MS = 1000;

const url = new URL(window.location.href);
const sessionToken = url.searchParams.get('token');
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/ws?token=${encodeURIComponent(sessionToken || '')}`;
const nativeAppUrl = `wwmobilecontroller://connect?pairing=${encodeURIComponent(window.location.href)}`;

const state = {
    socket: null,
    seq: 0,
    packetCount: 0,
    lastSentAt: 0,
    dirty: true,
    sensorsEnabled: false,
    orientation: null,
    motion: null,
    helloPayload: null,
    touch: {
        eventType: 'none',
        touches: [],
        changedTouches: [],
    },
    touchpadFullscreen: false,
    suppressReconnect: false,
};

function fmt(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function setSocketStatus(text) {
    socketStatusEl.textContent = text;
}

function setSensorStatus(text) {
    sensorStatusEl.textContent = text;
}

function setAppLinkStatus(text) {
    appLinkStatusEl.textContent = text;
}

function serializeTouchList(list, rect) {
    return Array.from(list).map((touch) => ({
        id: touch.identifier,
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
        nx: rect.width ? (touch.clientX - rect.left) / rect.width : 0,
        ny: rect.height ? (touch.clientY - rect.top) / rect.height : 0,
        force: touch.force ?? 0,
        radiusX: touch.radiusX ?? 0,
        radiusY: touch.radiusY ?? 0,
    }));
}

function updateTouchOverlay() {
    const rect = touchOverlayEl.getBoundingClientRect();
    touchOverlayEl.innerHTML = '';
    state.touch.touches.forEach((touch) => {
        const dot = document.createElement('div');
        dot.className = 'touch-dot';
        dot.style.left = `${touch.x}px`;
        dot.style.top = `${touch.y}px`;
        touchOverlayEl.appendChild(dot);
    });
    touchStatusEl.textContent = `${state.touch.touches.length} active`;
}

function setTouchState(eventType, event) {
    const rect = touchOverlayEl.getBoundingClientRect();
    state.touch = {
        eventType,
        touches: serializeTouchList(event.touches, rect),
        changedTouches: serializeTouchList(event.changedTouches, rect),
    };
    state.dirty = true;
    updateTouchOverlay();
}

function handleOrientation(event) {
    state.orientation = {
        absolute: !!event.absolute,
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
    };
    setSensorStatus('Streaming');
    betaValueEl.textContent = fmt(state.orientation.beta);
    gammaValueEl.textContent = fmt(state.orientation.gamma);
    state.dirty = true;
}

function handleMotion(event) {
    state.motion = {
        interval: event.interval ?? 0,
        acceleration: {
            x: event.acceleration?.x ?? 0,
            y: event.acceleration?.y ?? 0,
            z: event.acceleration?.z ?? 0,
        },
        accelerationIncludingGravity: {
            x: event.accelerationIncludingGravity?.x ?? 0,
            y: event.accelerationIncludingGravity?.y ?? 0,
            z: event.accelerationIncludingGravity?.z ?? 0,
        },
        rotationRate: {
            alpha: event.rotationRate?.alpha ?? 0,
            beta: event.rotationRate?.beta ?? 0,
            gamma: event.rotationRate?.gamma ?? 0,
        },
    };

    setSensorStatus('Streaming');
    accxValueEl.textContent = fmt(state.motion.acceleration.x);
    accyValueEl.textContent = fmt(state.motion.acceleration.y);
    state.dirty = true;
}

async function enableSensors() {
    if (state.sensorsEnabled) {
        setSensorStatus('Streaming');
        return;
    }

    try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            const orientationPermission = await DeviceOrientationEvent.requestPermission();
            if (orientationPermission !== 'granted') {
                throw new Error('Orientation permission denied');
            }
        }

        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
            const motionPermission = await DeviceMotionEvent.requestPermission();
            if (motionPermission !== 'granted') {
                throw new Error('Motion permission denied');
            }
        }

        window.addEventListener('deviceorientation', handleOrientation);
        window.addEventListener('devicemotion', handleMotion);
        state.sensorsEnabled = true;
        setSensorStatus('Waiting for sensor events');
        hintTextEl.textContent = 'Permission granted. If values stay at zero, the browser is likely blocking sensors because this page is not running in a secure HTTPS or native-app context.';
        window.setTimeout(() => {
            if (!state.orientation && !state.motion) {
                setSensorStatus('No sensor stream');
            }
        }, 1800);
    } catch (err) {
        setSensorStatus('Blocked');
        hintTextEl.textContent = `Sensors unavailable: ${err.message}. If your browser blocks motion on local HTTP, the next step is a tiny native Android app.`;
    }
}

async function copyPairingLink() {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(window.location.href);
        } else {
            const input = document.createElement('input');
            input.value = window.location.href;
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.focus();
            input.select();
            document.execCommand('copy');
            input.remove();
        }
        setAppLinkStatus('Pairing URL copied to phone clipboard.');
    } catch (err) {
        setAppLinkStatus(`Copy failed: ${err.message}`);
    }
}

function openNativeApp() {
    state.suppressReconnect = true;
    try {
        state.socket?.close?.(1000, 'Handing off to native app');
    } catch (_) {}
    setAppLinkStatus('Trying to open the Android app...');
    window.location.href = nativeAppUrl;
    window.setTimeout(() => {
        setAppLinkStatus('If the app did not open, use Copy Pairing Link and paste it inside the app.');
        if (!document.hidden && !state.socket) {
            state.suppressReconnect = false;
            connectSocket();
        }
    }, 1200);
}

function send(message) {
    if (state.socket?.readyState === WebSocket.OPEN) {
        state.socket.send(JSON.stringify(message));
    }
}

function connectSocket() {
    if (state.suppressReconnect) {
        return;
    }

    if (!sessionToken) {
        setSocketStatus('Missing token');
        hintTextEl.textContent = 'This controller URL is missing the pairing token. Re-open the link from the desktop app.';
        return;
    }

    setSocketStatus('Connecting...');
    const socket = new WebSocket(wsUrl);
    state.socket = socket;

    socket.addEventListener('open', () => {
        setSocketStatus('Connected');
        send({
            type: 'hello',
            payload: {
                userAgent: navigator.userAgent,
                screen: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    dpr: window.devicePixelRatio || 1,
                    orientation: screen.orientation?.type || null,
                },
                isSecureContext: window.isSecureContext,
            },
        });
        state.helloPayload = {
            isSecureContext: window.isSecureContext,
        };
    });

    socket.addEventListener('close', () => {
        setSocketStatus('Disconnected');
        state.socket = null;
        if (!state.suppressReconnect) {
            setTimeout(connectSocket, 1000);
        }
    });

    socket.addEventListener('error', () => {
        setSocketStatus('Error');
    });
}

function tick() {
    const now = performance.now();
    if (state.socket?.readyState === WebSocket.OPEN && (
        (state.dirty && now - state.lastSentAt >= TARGET_SEND_MS) ||
        now - state.lastSentAt >= HEARTBEAT_MS
    )) {
        state.seq++;
        state.packetCount++;
        state.lastSentAt = now;
        state.dirty = false;
        packetValueEl.textContent = String(state.packetCount);

        send({
            type: 'sensor-frame',
            payload: {
                seq: state.seq,
                sentAt: Date.now(),
                orientation: state.orientation,
                motion: state.motion,
                touch: state.touch,
                screen: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    dpr: window.devicePixelRatio || 1,
                    orientation: screen.orientation?.type || null,
                },
                sensorsEnabled: state.sensorsEnabled,
                isSecureContext: window.isSecureContext,
            },
        });
    }

    requestAnimationFrame(tick);
}

function bindTouchEvents() {
    const touchEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];
    touchEvents.forEach((eventName) => {
        touchOverlayEl.addEventListener(eventName, (event) => {
            event.preventDefault();
            const eventType = eventName.replace('touch', '');
            setTouchState(eventType, event);
        }, { passive: false });
    });
}

async function toggleTouchpadFullscreen() {
    state.touchpadFullscreen = !state.touchpadFullscreen;
    document.body.classList.toggle('touchpad-fullscreen-active', state.touchpadFullscreen);
    touchpadToggleEl.textContent = state.touchpadFullscreen ? 'Close Fullscreen' : 'Open Fullscreen';
    state.dirty = true;
    updateTouchOverlay();

    try {
        if (state.touchpadFullscreen && document.documentElement.requestFullscreen && !document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        } else if (!state.touchpadFullscreen && document.fullscreenElement) {
            await document.exitFullscreen?.();
        }
    } catch (_) {}
}

contextValueEl.textContent = window.isSecureContext ? 'Secure' : 'HTTP';
enableButtonEl.addEventListener('click', enableSensors);
openAppButtonEl.addEventListener('click', openNativeApp);
copyLinkButtonEl.addEventListener('click', copyPairingLink);
touchpadToggleEl.addEventListener('click', toggleTouchpadFullscreen);
window.addEventListener('resize', () => {
    state.dirty = true;
    updateTouchOverlay();
});
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && state.touchpadFullscreen) {
        state.touchpadFullscreen = false;
        document.body.classList.remove('touchpad-fullscreen-active');
        touchpadToggleEl.textContent = 'Open Fullscreen';
        updateTouchOverlay();
    }
});

bindTouchEvents();
connectSocket();
tick();
