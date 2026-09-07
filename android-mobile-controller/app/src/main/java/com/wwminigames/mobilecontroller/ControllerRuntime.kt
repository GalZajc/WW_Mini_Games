package com.wwminigames.mobilecontroller

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import com.wwminigames.mobilecontroller.TouchpadView.TouchPayload
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.CopyOnWriteArraySet
import kotlin.math.max

data class ControllerRuntimeState(
    val connected: Boolean = false,
    val statusMessage: String = "Ready. Paste the desktop pairing link and tap Connect.",
    val sensorsEnabled: Boolean = true,
    val packetsPerSecond: Int = 0,
    val orientationAlpha: Double = 0.0,
    val orientationBeta: Double = 0.0,
    val orientationGamma: Double = 0.0,
    val accelerationX: Double = 0.0,
    val accelerationY: Double = 0.0,
    val accelerationZ: Double = 0.0,
    val gyroAlpha: Double = 0.0,
    val gyroBeta: Double = 0.0,
    val gyroGamma: Double = 0.0,
    val sensorIntervalMs: Double = 16.0,
    val touchPayload: TouchPayload = TouchPayload(),
)

object ControllerRuntime : SensorEventListener {

    interface Listener {
        fun onStateChanged(state: ControllerRuntimeState)
        fun onDesktopMessage(text: String) {}
    }

    private lateinit var appContext: Context
    private lateinit var sensorManager: SensorManager

    private val listeners = CopyOnWriteArraySet<Listener>()
    private val senderHandler = Handler(Looper.getMainLooper())
    private val senderRunnable = object : Runnable {
        override fun run() {
            if (webSocket != null) {
                sendSnapshot(force = false)
                senderHandler.postDelayed(this, SEND_INTERVAL_MS)
            }
        }
    }

    private val httpClient by lazy {
        OkHttpClient.Builder()
            .retryOnConnectionFailure(true)
            .build()
    }

    private val rotationSensor by lazy {
        sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    }

    private val linearAccelerationSensor by lazy {
        sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    }

    private val gyroscopeSensor by lazy {
        sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    }

    private var initialized = false
    private var webSocket: WebSocket? = null
    private var state = ControllerRuntimeState()
    private var packetSeq = 0L
    private var packetCounter = 0
    private var packetTimerStartedAt = System.currentTimeMillis()
    private var lastSentAtMs = 0L
    private var lastSensorTimestampNs = 0L
    private var wakeLock: PowerManager.WakeLock? = null
    private var wifiLock: WifiManager.WifiLock? = null

    fun initialize(context: Context) {
        if (initialized) return
        appContext = context.applicationContext
        sensorManager = appContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        initialized = true
    }

    fun addListener(listener: Listener) {
        listeners.add(listener)
        listener.onStateChanged(state)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun getState(): ControllerRuntimeState = state.copy()

    fun connect(rawPairingUrl: String, statusLabel: String = "Connecting") {
        if (!initialized) return
        if (rawPairingUrl.isBlank()) {
            updateState { it.copy(statusMessage = "Paste the desktop pairing link first.") }
            return
        }

        val socketUrl = try {
            pairingToSocketUrl(rawPairingUrl)
        } catch (err: IllegalArgumentException) {
            updateState { it.copy(statusMessage = err.message ?: "Invalid pairing link.") }
            return
        }

        disconnect(null)
        updateState { it.copy(statusMessage = "$statusLabel to $socketUrl") }

        webSocket = httpClient.newWebSocket(
            Request.Builder().url(socketUrl).build(),
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    acquireBackgroundLocks()
                    registerSensorsIfNeeded()
                    startSender()
                    packetCounter = 0
                    packetTimerStartedAt = System.currentTimeMillis()
                    updateState {
                        it.copy(
                            connected = true,
                            statusMessage = "Connected. Foreground service keeps streaming while the screen is off.",
                        )
                    }
                    sendHello()
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    handleSocketClosed("Connection closed: $reason")
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    handleSocketClosed("Connection failed: ${t.message}")
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    listeners.forEach { it.onDesktopMessage(text) }
                }
            }
        )
    }

    fun disconnect(message: String? = "Disconnected") {
        senderHandler.removeCallbacks(senderRunnable)
        sensorManager.unregisterListener(this)
        webSocket?.close(1000, "bye")
        webSocket = null
        releaseBackgroundLocks()
        updateState {
            it.copy(
                connected = false,
                statusMessage = message ?: it.statusMessage,
                packetsPerSecond = 0,
            )
        }
    }

    fun setSensorsEnabled(enabled: Boolean) {
        updateState { it.copy(sensorsEnabled = enabled) }
        if (enabled && state.connected) {
            registerSensorsIfNeeded()
        } else {
            sensorManager.unregisterListener(this)
        }
    }

    fun setTouchPayload(payload: TouchPayload) {
        updateState { it.copy(touchPayload = payload) }
        sendSnapshot(force = true)
    }

    fun sendCalibrationCapture(requestId: String, mode: String): Boolean {
        val socket = webSocket ?: return false
        if (!state.connected) return false

        val payload = JSONObject()
            .put("type", "calibration-sample")
            .put(
                "payload",
                JSONObject()
                    .put("requestId", requestId)
                    .put("mode", mode)
                    .put(
                        "orientation",
                        JSONObject()
                            .put("absolute", false)
                            .put("alpha", state.orientationAlpha)
                            .put("beta", state.orientationBeta)
                            .put("gamma", state.orientationGamma)
                    )
                    .put("sentAt", System.currentTimeMillis())
            )

        return socket.send(payload.toString())
    }

    private fun updateState(transform: (ControllerRuntimeState) -> ControllerRuntimeState) {
        state = transform(state)
        listeners.forEach { it.onStateChanged(state) }
    }

    private fun registerSensorsIfNeeded() {
        if (!state.sensorsEnabled) return
        rotationSensor?.let { sensorManager.registerListener(this, it, SENSOR_DELAY_US) }
        linearAccelerationSensor?.let { sensorManager.registerListener(this, it, SENSOR_DELAY_US) }
        gyroscopeSensor?.let { sensorManager.registerListener(this, it, SENSOR_DELAY_US) }
    }

    private fun startSender() {
        senderHandler.removeCallbacks(senderRunnable)
        senderHandler.post(senderRunnable)
    }

    private fun handleSocketClosed(message: String) {
        senderHandler.removeCallbacks(senderRunnable)
        sensorManager.unregisterListener(this)
        webSocket = null
        releaseBackgroundLocks()
        updateState {
            it.copy(
                connected = false,
                statusMessage = message,
                packetsPerSecond = 0,
            )
        }
    }

    private fun sendHello() {
        val payload = JSONObject()
            .put("type", "hello")
            .put(
                "payload",
                JSONObject()
                    .put("userAgent", "WW Native Android Controller")
                    .put("screen", JSONObject().put("width", appContext.resources.displayMetrics.widthPixels).put("height", appContext.resources.displayMetrics.heightPixels))
                    .put("isSecureContext", true)
                    .put("platform", "android-native")
            )

        webSocket?.send(payload.toString())
    }

    private fun sendSnapshot(force: Boolean) {
        val socket = webSocket ?: return
        if (!state.connected) return

        val now = System.currentTimeMillis()
        if (!force && now - lastSentAtMs < SEND_INTERVAL_MS) return

        lastSentAtMs = now
        packetSeq += 1
        packetCounter += 1

        val json = JSONObject()
            .put("type", "sensor-frame")
            .put(
                "payload",
                JSONObject()
                    .put("seq", packetSeq)
                    .put("sentAt", now)
                    .put(
                        "orientation",
                        JSONObject()
                            .put("absolute", false)
                            .put("alpha", state.orientationAlpha)
                            .put("beta", state.orientationBeta)
                            .put("gamma", state.orientationGamma)
                    )
                    .put(
                        "motion",
                        JSONObject()
                            .put("interval", state.sensorIntervalMs)
                            .put(
                                "acceleration",
                                JSONObject()
                                    .put("x", state.accelerationX)
                                    .put("y", state.accelerationY)
                                    .put("z", state.accelerationZ)
                            )
                            .put(
                                "rotationRate",
                                JSONObject()
                                    .put("alpha", state.gyroAlpha)
                                    .put("beta", state.gyroBeta)
                                    .put("gamma", state.gyroGamma)
                            )
                    )
                    .put("touch", touchPayloadToJson(state.touchPayload))
                    .put("sensorsEnabled", state.sensorsEnabled)
                    .put("isSecureContext", true)
                    .put("source", "android-native")
            )

        socket.send(json.toString())

        val elapsed = now - packetTimerStartedAt
        if (elapsed >= 1000) {
            val pps = ((packetCounter * 1000.0) / max(elapsed, 1L)).toInt()
            packetCounter = 0
            packetTimerStartedAt = now
            updateState { it.copy(packetsPerSecond = pps) }
        }
    }

    private fun touchPayloadToJson(payload: TouchPayload): JSONObject {
        return JSONObject()
            .put("eventType", payload.eventType)
            .put("touches", JSONArray(payload.touches.map { touchPointToJson(it) }))
            .put("changedTouches", JSONArray(payload.changedTouches.map { touchPointToJson(it) }))
    }

    private fun touchPointToJson(point: TouchpadView.TouchPoint): JSONObject {
        return JSONObject()
            .put("id", point.id)
            .put("x", point.x)
            .put("y", point.y)
            .put("nx", point.nx)
            .put("ny", point.ny)
            .put("force", point.force)
    }

    override fun onSensorChanged(event: SensorEvent) {
        val nextInterval = if (lastSensorTimestampNs != 0L) {
            (event.timestamp - lastSensorTimestampNs) / 1_000_000.0
        } else {
            state.sensorIntervalMs
        }
        lastSensorTimestampNs = event.timestamp

        when (event.sensor.type) {
            Sensor.TYPE_GAME_ROTATION_VECTOR,
            Sensor.TYPE_ROTATION_VECTOR -> updateOrientation(event.values, nextInterval)

            Sensor.TYPE_LINEAR_ACCELERATION -> updateState {
                it.copy(
                    sensorIntervalMs = nextInterval,
                    accelerationX = event.values[0].toDouble(),
                    accelerationY = event.values[1].toDouble(),
                    accelerationZ = event.values[2].toDouble(),
                )
            }

            Sensor.TYPE_GYROSCOPE -> updateState {
                it.copy(
                    sensorIntervalMs = nextInterval,
                    gyroAlpha = Math.toDegrees(event.values[2].toDouble()),
                    gyroBeta = Math.toDegrees(event.values[0].toDouble()),
                    gyroGamma = Math.toDegrees(event.values[1].toDouble()),
                )
            }
        }
    }

    private fun updateOrientation(values: FloatArray, nextInterval: Double) {
        val rotationMatrix = FloatArray(9)
        val adjustedMatrix = FloatArray(9)
        val orientation = FloatArray(3)

        SensorManager.getRotationMatrixFromVector(rotationMatrix, values)
        SensorManager.remapCoordinateSystem(
            rotationMatrix,
            SensorManager.AXIS_X,
            SensorManager.AXIS_Y,
            adjustedMatrix,
        )
        SensorManager.getOrientation(adjustedMatrix, orientation)

        val azimuth = Math.toDegrees(orientation[0].toDouble())
        val pitch = Math.toDegrees(orientation[1].toDouble())
        val roll = Math.toDegrees(orientation[2].toDouble())

        updateState {
            it.copy(
                sensorIntervalMs = nextInterval,
                orientationAlpha = ((azimuth % 360.0) + 360.0) % 360.0,
                orientationBeta = -pitch,
                orientationGamma = roll,
            )
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private fun pairingToSocketUrl(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
            return trimmed
        }

        val uri = Uri.parse(trimmed)
        val token = uri.getQueryParameter("token")
            ?: throw IllegalArgumentException("Pairing URL is missing its token.")
        val host = uri.host ?: throw IllegalArgumentException("Pairing URL is missing its host.")
        val port = if (uri.port != -1) uri.port else if (uri.scheme == "https") 443 else 80
        val scheme = if (uri.scheme == "https") "wss" else "ws"

        return Uri.Builder()
            .scheme(scheme)
            .encodedAuthority("$host:$port")
            .path("/ws")
            .appendQueryParameter("token", token)
            .build()
            .toString()
    }

    private fun acquireBackgroundLocks() {
        if (wakeLock?.isHeld != true) {
            val powerManager = appContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "wwmobilecontroller:stream"
            ).apply {
                setReferenceCounted(false)
                acquire()
            }
        }

        if (wifiLock?.isHeld != true) {
            val wifiManager = appContext.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            wifiLock = wifiManager.createWifiLock(
                WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "wwmobilecontroller:wifi"
            ).apply {
                setReferenceCounted(false)
                acquire()
            }
        }
    }

    private fun releaseBackgroundLocks() {
        wakeLock?.takeIf { it.isHeld }?.release()
        wakeLock = null
        wifiLock?.takeIf { it.isHeld }?.release()
        wifiLock = null
    }

    private const val SENSOR_DELAY_US = 10_000
    private const val SEND_INTERVAL_MS = 16L
}
