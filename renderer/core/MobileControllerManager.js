const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function wrapAngle(angle) {
    let wrapped = angle;
    while (wrapped > 180) wrapped -= 360;
    while (wrapped < -180) wrapped += 360;
    return wrapped;
}

function randomId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `mc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneCalibration(calibration) {
    return calibration ? structuredClone(calibration) : null;
}

function rebuildInverse(calibration) {
    const next = cloneCalibration(calibration) || {
        neutral: null,
        forward: null,
        right: null,
        updatedAt: 0,
    };

    const right = next.right;
    const forward = next.forward;

    if (!right || !forward) {
        next.inverse = null;
        return next;
    }

    const det = right.x * forward.y - right.y * forward.x;
    if (Math.abs(det) < 0.001) {
        next.inverse = null;
        return next;
    }

    next.inverse = {
        m00: forward.y / det,
        m01: -forward.x / det,
        m10: -right.y / det,
        m11: right.x / det,
    };
    return next;
}

/**
 * MobileControllerManager — Hosts a phone-accessible controller page and
 * receives sensor/touch snapshots over WebSocket.
 */
export class MobileControllerManager {

    constructor() {
        this.isHosting = false;
        this.isConnected = false;
        this.url = null;
        this.code = null;
        this.deviceInfo = null;
        this.snapshot = null;
        this.packetCount = 0;
        this.lastPacketAt = 0;

        this.calibration = {
            neutral: null,
            forward: null,
            right: null,
            inverse: null,
            updatedAt: 0,
        };

        this._msgCbs = [];
        this._connectCbs = [];
        this._disconnCbs = [];
        this._calibrationCbs = [];
        this._pendingCalibration = new Map();
        this._initialized = false;
        this._initPromise = null;

        window.api.onMobileEvent((event) => {
            switch (event.type) {
                case 'connected':
                    this.isConnected = true;
                    this.deviceInfo = event.data || null;
                    this.snapshot = null;
                    this.packetCount = 0;
                    this.lastPacketAt = 0;
                    this._connectCbs.forEach(cb => cb(event.data || null));
                    break;
                case 'disconnected':
                    this.isConnected = false;
                    this.deviceInfo = null;
                    this.snapshot = null;
                    this.packetCount = 0;
                    this.lastPacketAt = 0;
                    this._disconnCbs.forEach(cb => cb());
                    break;
                case 'message':
                    this.packetCount++;
                    this.lastPacketAt = performance.now();
                    if (event.data?.type === 'sensor-frame') {
                        this.snapshot = {
                            ...event.data.payload,
                            receivedAt: this.lastPacketAt,
                            packetCount: this.packetCount,
                        };
                    }
                    if (event.data?.type === 'calibration-sample') {
                        this._resolveCalibrationSample(event.data.payload || {});
                    }
                    this._msgCbs.forEach(cb => cb(event.data));
                    break;
            }
        });
    }

    async initialize() {
        if (this._initialized) return;
        if (!this._initPromise) {
            this._initPromise = (async () => {
                await this._loadGlobalSettings();
                await this.host();
                this._initialized = true;
            })();
        }
        return this._initPromise;
    }

    async _loadGlobalSettings() {
        const data = await window.api.readGlobalSettings();
        const calibration = data?.mobileCalibration || null;
        this.calibration = rebuildInverse({
            neutral: calibration?.neutral || null,
            forward: calibration?.forward || null,
            right: calibration?.right || null,
            updatedAt: calibration?.updatedAt || 0,
        });
    }

    async _saveGlobalSettings() {
        const current = await window.api.readGlobalSettings();
        await window.api.writeGlobalSettings({
            ...(current || {}),
            mobileCalibration: {
                neutral: this.calibration.neutral,
                forward: this.calibration.forward,
                right: this.calibration.right,
                updatedAt: this.calibration.updatedAt,
            },
        });
    }

    getGlobalCalibration() {
        return cloneCalibration(this.calibration);
    }

    describeCalibration(calibration = null, { label = null, inheritedFromGlobal = false } = {}) {
        const value = rebuildInverse(calibration || this.calibration);
        const hasNeutral = !!value.neutral;
        const hasAxisCalibration = !!value.inverse;
        return {
            calibration: value,
            hasNeutral,
            hasAxisCalibration,
            neutral: value.neutral,
            forward: value.forward,
            right: value.right,
            updatedAt: value.updatedAt,
            inheritedFromGlobal,
            statusLabel: hasAxisCalibration
                ? (label ? `${label}: ready` : 'Ready')
                : hasNeutral
                    ? (label ? `${label}: neutral only` : 'Neutral set, axis learning missing')
                    : (label ? `${label}: not calibrated` : 'Not calibrated'),
        };
    }

    async host(port = 0) {
        if (this.isHosting && this.url) {
            return {
                success: true,
                url: this.url,
                code: this.code,
                reused: true,
            };
        }

        const result = await window.api.mobileHost(port);
        if (result.success) {
            this.isHosting = true;
            this.url = result.url;
            this.code = result.code;
            this.snapshot = this.snapshot || null;
        }
        return result;
    }

    send(message) {
        return window.api.mobileSend(message);
    }

    async close() {
        await window.api.mobileClose();
        this.isHosting = false;
        this.isConnected = false;
        this.url = null;
        this.code = null;
        this.deviceInfo = null;
        this.snapshot = null;
        this.packetCount = 0;
        this.lastPacketAt = 0;
    }

    getRawTilt(snapshot = this.snapshot, calibration = null) {
        if (!snapshot?.orientation) return { x: 0, y: 0 };
        const base = calibration ? rebuildInverse(calibration) : this.calibration;
        const neutral = base.neutral || { beta: 0, gamma: 0 };
        return {
            x: wrapAngle((snapshot.orientation.gamma ?? 0) - (neutral.gamma ?? 0)),
            y: wrapAngle((snapshot.orientation.beta ?? 0) - (neutral.beta ?? 0)),
        };
    }

    getMappedTilt(snapshot = this.snapshot, calibration = null) {
        const base = calibration ? rebuildInverse(calibration) : this.calibration;
        const raw = this.getRawTilt(snapshot, base);
        const inv = base.inverse;
        if (!inv) {
            return {
                x: clamp(raw.x / 24, -1, 1),
                y: clamp(raw.y / 24, -1, 1),
            };
        }

        return {
            x: clamp(inv.m00 * raw.x + inv.m01 * raw.y, -1, 1),
            y: clamp(inv.m10 * raw.x + inv.m11 * raw.y, -1, 1),
        };
    }

    getCalibrationSummary(calibration = null, options = {}) {
        return this.describeCalibration(calibration || this.calibration, options);
    }

    async captureCalibration(mode, calibration = null) {
        const baseCalibration = rebuildInverse(calibration || this.calibration);
        if (!this.isConnected) {
            return { success: false, message: 'Phone is not connected.' };
        }

        if (mode !== 'neutral' && !baseCalibration.neutral) {
            return { success: false, message: 'Set neutral pose first.' };
        }

        const requestId = randomId();
        const descriptor = {
            neutral: {
                title: 'Set Neutral Pose',
                instruction: 'Hold the phone in your normal play pose, then press the big button.',
                buttonLabel: 'Set Neutral',
            },
            forward: {
                title: 'Learn Tilt Forward',
                instruction: 'Tilt the phone forward the way you want the game to move, then press the big button.',
                buttonLabel: 'Capture Forward Tilt',
            },
            right: {
                title: 'Learn Tilt Right',
                instruction: 'Tilt the phone to the right the way you want the game to move, then press the big button.',
                buttonLabel: 'Capture Right Tilt',
            },
        }[mode];

        if (!descriptor) {
            return { success: false, message: `Unknown calibration mode: ${mode}` };
        }

        const resultPromise = new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this._pendingCalibration.delete(requestId);
                this.sendCalibrationFeedback('Timed out waiting for phone input.', { success: false, close: true });
                resolve({ success: false, message: 'Timed out waiting for phone input.' });
            }, 20000);

            this._pendingCalibration.set(requestId, {
                mode,
                baseCalibration,
                resolve,
                timeoutId,
            });
        });

        const sent = await this.send({
            type: 'open-calibration',
            payload: {
                requestId,
                mode,
                ...descriptor,
            },
        });

        if (!sent) {
            const pending = this._pendingCalibration.get(requestId);
            if (pending) {
                clearTimeout(pending.timeoutId);
                this._pendingCalibration.delete(requestId);
                return { success: false, message: 'Could not send calibration request to the phone.' };
            }
        }

        return resultPromise;
    }

    buildCalibrationWithCapturedSample(baseCalibration, mode, payload) {
        const base = rebuildInverse(cloneCalibration(baseCalibration) || {});
        if (mode === 'neutral') {
            return rebuildInverse({
                ...base,
                neutral: {
                    beta: payload.orientation.beta ?? 0,
                    gamma: payload.orientation.gamma ?? 0,
                },
                forward: null,
                right: null,
                updatedAt: Date.now(),
            });
        }

        const raw = payload.raw || null;
        if (!raw) return null;
        return rebuildInverse({
            ...base,
            [mode]: raw,
            updatedAt: Date.now(),
        });
    }

    async setNeutralFromOrientation(orientation) {
        if (!orientation) return { success: false, message: 'No orientation sample available.' };
        this.calibration = rebuildInverse({
            ...this.calibration,
            neutral: {
                beta: orientation.beta ?? 0,
                gamma: orientation.gamma ?? 0,
            },
            updatedAt: Date.now(),
        });
        await this._saveGlobalSettings();
        this._emitCalibrationUpdate();
        return { success: true, message: 'Neutral pose saved.' };
    }

    async saveGlobalCalibration(calibration) {
        this.calibration = rebuildInverse({
            neutral: calibration?.neutral || null,
            forward: calibration?.forward || null,
            right: calibration?.right || null,
            updatedAt: calibration?.updatedAt || Date.now(),
        });
        await this._saveGlobalSettings();
        this._emitCalibrationUpdate();
        return { success: true, message: 'Global phone calibration saved.' };
    }

    async clearCalibration() {
        this.calibration = rebuildInverse({
            neutral: null,
            forward: null,
            right: null,
            updatedAt: 0,
        });
        await this._saveGlobalSettings();
        this._emitCalibrationUpdate();
        return { success: true, message: 'Phone calibration cleared.' };
    }

    async _resolveCalibrationSample(payload) {
        const requestId = payload?.requestId;
        const pending = requestId ? this._pendingCalibration.get(requestId) : null;
        if (!pending) return;

        clearTimeout(pending.timeoutId);
        this._pendingCalibration.delete(requestId);

        const orientation = payload?.orientation || null;
        if (!orientation) {
            await this.sendCalibrationFeedback('Phone did not send orientation data.', { success: false, close: true });
            pending.resolve({ success: false, message: 'Phone did not send orientation data.' });
            return;
        }

        if (pending.mode === 'neutral') {
            pending.resolve({
                success: true,
                message: 'Neutral pose captured.',
                orientation,
            });
            return;
        }

        const raw = {
            x: wrapAngle((orientation.gamma ?? 0) - (pending.baseCalibration?.neutral?.gamma ?? 0)),
            y: wrapAngle((orientation.beta ?? 0) - (pending.baseCalibration?.neutral?.beta ?? 0)),
        };

        if (Math.hypot(raw.x, raw.y) < 3) {
            await this.sendCalibrationFeedback('Tilt a bit more and try again.', { success: false, close: false });
            pending.resolve({ success: false, message: 'Tilt a bit more and try again.' });
            return;
        }

        pending.resolve({
            success: true,
            message: `${pending.mode === 'forward' ? 'Forward' : 'Right'} tilt captured.`,
            orientation,
            raw,
        });
    }

    sendCalibrationFeedback(message, { success = true, close = false } = {}) {
        return this.send({
            type: 'calibration-feedback',
            payload: {
                message,
                success,
                close,
            },
        });
    }

    onMessage(cb) {
        this._msgCbs.push(cb);
    }

    onConnect(cb) {
        this._connectCbs.push(cb);
    }

    onDisconnect(cb) {
        this._disconnCbs.push(cb);
    }

    onCalibrationUpdate(cb) {
        this._calibrationCbs.push(cb);
    }

    _emitCalibrationUpdate() {
        const summary = this.getCalibrationSummary();
        this._calibrationCbs.forEach(cb => cb(summary));
    }

    clearCallbacks() {
        this._msgCbs = [];
        this._connectCbs = [];
        this._disconnCbs = [];
        this._calibrationCbs = [];
    }

    hasFreshSnapshot(maxAgeMs = 1000) {
        if (!this.isConnected || !this.snapshot) return false;
        return performance.now() - this.lastPacketAt <= maxAgeMs;
    }

    getSnapshot(maxAgeMs = 1000) {
        if (!this.hasFreshSnapshot(maxAgeMs)) return null;
        return structuredClone(this.snapshot);
    }
}
