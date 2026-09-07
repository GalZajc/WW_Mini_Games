package com.wwminigames.mobilecontroller

import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.android.material.button.MaterialButton
import com.google.android.material.snackbar.Snackbar
import com.wwminigames.mobilecontroller.TouchpadView.TouchPayload
import com.wwminigames.mobilecontroller.databinding.ActivityMainBinding
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private var fullscreenTouchpad = false
    private var recentPairings = mutableListOf<String>()
    private var hasAttemptedAutoConnect = false
    private var pendingCalibrationRequestId: String? = null
    private var pendingCalibrationMode: String? = null
    private var pendingPairingToRemember: String? = null
    private val uiHandler = Handler(Looper.getMainLooper())
    private var latestState: ControllerRuntimeState? = null
    private var uiRefreshQueued = false

    private val runtimeListener = object : ControllerRuntime.Listener {
        override fun onStateChanged(state: ControllerRuntimeState) {
            runOnUiThread {
                if (state.connected) {
                    pendingPairingToRemember?.let {
                        rememberPairingUrl(it)
                        pendingPairingToRemember = null
                    }
                } else if (pendingCalibrationRequestId != null) {
                    hideCalibrationOverlay("Connection lost.")
                }

                latestState = state
                scheduleUiRefresh()
            }
        }

        override fun onDesktopMessage(text: String) {
            runOnUiThread {
                handleDesktopMessage(text)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ControllerRuntime.initialize(applicationContext)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        WindowCompat.setDecorFitsSystemWindows(window, true)

        recentPairings = loadRecentPairings().toMutableList()
        binding.pairUrlInput.setText(
            readClipboardTextIfPairUrl().orEmpty().ifBlank { recentPairings.firstOrNull().orEmpty() }
        )

        binding.previewTouchpad.setOnTouchPayload { onTouchPayload(it) }
        binding.fullscreenTouchpad.setOnTouchPayload { onTouchPayload(it) }

        binding.pasteButton.setOnClickListener { pastePairUrl() }
        binding.connectButton.setOnClickListener { connectToDesktop() }
        binding.disconnectButton.setOnClickListener { disconnectFromDesktop("Disconnected") }
        binding.sensorToggleButton.setOnClickListener { toggleSensors() }
        binding.openTouchpadButton.setOnClickListener { setFullscreenTouchpad(true) }
        binding.closeTouchpadButton.setOnClickListener { setFullscreenTouchpad(false) }
        binding.calibrationCaptureButton.setOnClickListener { sendCalibrationCapture() }
        binding.calibrationCancelButton.setOnClickListener { hideCalibrationOverlay("Calibration canceled.") }

        renderRecentPairingButtons()
        latestState = ControllerRuntime.getState()
        updateUiFromState(latestState!!)
        handleDeepLink(intent)
        maybeAutoConnectToRecent()
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    override fun onStart() {
        super.onStart()
        ControllerRuntime.addListener(runtimeListener)
    }

    override fun onStop() {
        ControllerRuntime.removeListener(runtimeListener)
        uiHandler.removeCallbacksAndMessages(null)
        uiRefreshQueued = false
        super.onStop()
    }

    private fun scheduleUiRefresh() {
        if (uiRefreshQueued) return
        uiRefreshQueued = true
        uiHandler.postDelayed({
            uiRefreshQueued = false
            latestState?.let { updateUiFromState(it) }
        }, 80L)
    }

    private fun connectToDesktop() {
        val rawPairingUrl = binding.pairUrlInput.text?.toString().orEmpty().trim()
        if (rawPairingUrl.isBlank()) {
            showSnack("Paste the desktop pairing link first.")
            return
        }

        pendingPairingToRemember = rawPairingUrl
        ControllerForegroundService.startConnection(this, rawPairingUrl, "Connecting")
        binding.statusMessage.text = "Connecting..."
    }

    private fun disconnectFromDesktop(message: String?) {
        pendingPairingToRemember = null
        ControllerForegroundService.disconnect(this)
        hideCalibrationOverlay()
        message?.let { binding.statusMessage.text = it }
    }

    private fun onTouchPayload(payload: TouchPayload) {
        ControllerRuntime.setTouchPayload(payload)
        updateTouchUi(payload)
    }

    private fun toggleSensors() {
        val current = ControllerRuntime.getState()
        ControllerRuntime.setSensorsEnabled(!current.sensorsEnabled)
    }

    private fun updateUiFromState(state: ControllerRuntimeState) {
        binding.connectionValue.text = if (state.connected) "Connected" else "Disconnected"
        binding.statusMessage.text = state.statusMessage
        binding.nativeContextValue.text = if (state.connected) "Foreground stream" else "Native app"
        binding.sensorStateValue.text = if (state.sensorsEnabled) "Enabled" else "Disabled"
        binding.packetRateValue.text = state.packetsPerSecond.toString()
        binding.orientationValue.text = formatTriple(
            state.orientationAlpha,
            state.orientationBeta,
            state.orientationGamma,
        )
        binding.accelerationValue.text = formatTriple(
            state.accelerationX,
            state.accelerationY,
            state.accelerationZ,
        )
        binding.rotationRateValue.text = formatTriple(
            state.gyroAlpha,
            state.gyroBeta,
            state.gyroGamma,
        )
        binding.intervalValue.text = String.format(Locale.US, "%.1f ms", state.sensorIntervalMs)
        binding.sensorToggleButton.text = if (state.sensorsEnabled) "Disable Sensors" else "Enable Sensors"
        updateTouchUi(state.touchPayload)
    }

    private fun updateTouchUi(payload: TouchPayload) {
        binding.touchValue.text = if (payload.touches.isEmpty()) {
            "No active touches"
        } else {
            payload.touches.joinToString(" | ") {
                "#${it.id} x=${"%.3f".format(Locale.US, it.nx)} y=${"%.3f".format(Locale.US, it.ny)}"
            }
        }
    }

    private fun setFullscreenTouchpad(enabled: Boolean) {
        fullscreenTouchpad = enabled
        binding.fullscreenTouchpadOverlay.visibility = if (enabled) View.VISIBLE else View.GONE
        binding.scrollContent.visibility = if (enabled || binding.calibrationOverlay.visibility == View.VISIBLE) {
            View.GONE
        } else {
            View.VISIBLE
        }

        val controller = WindowInsetsControllerCompat(window, binding.root)
        if (enabled) {
            WindowCompat.setDecorFitsSystemWindows(window, false)
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else {
            WindowCompat.setDecorFitsSystemWindows(window, true)
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun handleDesktopMessage(text: String) {
        val json = try {
            JSONObject(text)
        } catch (_: Exception) {
            return
        }

        when (json.optString("type")) {
            "open-calibration" -> {
                val payload = json.optJSONObject("payload") ?: return
                showCalibrationOverlay(
                    requestId = payload.optString("requestId"),
                    mode = payload.optString("mode"),
                    title = payload.optString("title", "Phone calibration"),
                    instruction = payload.optString("instruction", "Press the big button."),
                    buttonLabel = payload.optString("buttonLabel", "Capture"),
                )
            }

            "calibration-feedback" -> {
                val payload = json.optJSONObject("payload") ?: return
                val message = payload.optString("message", "Calibration updated.")
                val close = payload.optBoolean("close", false)
                val success = payload.optBoolean("success", true)
                binding.calibrationStatus.text = message
                binding.calibrationStatus.setTextColor(
                    getColor(if (success) R.color.accent else R.color.textSecondary)
                )
                if (close) {
                    binding.calibrationCaptureButton.isEnabled = true
                    binding.calibrationCaptureButton.postDelayed({
                        hideCalibrationOverlay(message)
                    }, if (success) 700L else 1100L)
                } else {
                    binding.calibrationCaptureButton.isEnabled = true
                }
            }
        }
    }

    private fun showCalibrationOverlay(
        requestId: String,
        mode: String,
        title: String,
        instruction: String,
        buttonLabel: String,
    ) {
        pendingCalibrationRequestId = requestId
        pendingCalibrationMode = mode
        binding.calibrationTitle.text = title
        binding.calibrationInstruction.text = instruction
        binding.calibrationStatus.text = "Ready. Press the big button when the phone is in position."
        binding.calibrationStatus.setTextColor(getColor(R.color.accent))
        binding.calibrationCaptureButton.text = buttonLabel
        binding.calibrationCaptureButton.isEnabled = true
        binding.calibrationOverlay.visibility = View.VISIBLE
        binding.scrollContent.visibility = View.GONE
        binding.fullscreenTouchpadOverlay.visibility = View.GONE
    }

    private fun hideCalibrationOverlay(statusMessage: String? = null) {
        pendingCalibrationRequestId = null
        pendingCalibrationMode = null
        binding.calibrationOverlay.visibility = View.GONE
        if (!fullscreenTouchpad) {
            binding.scrollContent.visibility = View.VISIBLE
        }
        statusMessage?.let { binding.statusMessage.text = it }
    }

    private fun sendCalibrationCapture() {
        val requestId = pendingCalibrationRequestId
        val mode = pendingCalibrationMode
        if (requestId.isNullOrBlank() || mode.isNullOrBlank()) {
            showSnack("Calibration request is not active.")
            return
        }

        binding.calibrationCaptureButton.isEnabled = false
        binding.calibrationStatus.text = "Captured. Sending to desktop..."

        if (!ControllerRuntime.sendCalibrationCapture(requestId, mode)) {
            binding.calibrationCaptureButton.isEnabled = true
            binding.calibrationStatus.text = "Could not send calibration sample."
        }
    }

    private fun pastePairUrl() {
        val text = readClipboardTextIfPairUrl()
        if (text.isNullOrBlank()) {
            showSnack("Clipboard does not contain a pairing URL.")
            return
        }
        binding.pairUrlInput.setText(text)
    }

    private fun handleDeepLink(intent: android.content.Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "wwmobilecontroller" || data.host != "connect") return

        val pairingUrl = data.getQueryParameter("pairing")
        if (pairingUrl.isNullOrBlank()) {
            showSnack("Deep link did not contain a pairing URL.")
            return
        }

        binding.pairUrlInput.setText(pairingUrl)
        pendingPairingToRemember = pairingUrl
        ControllerForegroundService.startConnection(this, pairingUrl, "Connecting")
    }

    private fun maybeAutoConnectToRecent() {
        if (hasAttemptedAutoConnect || ControllerRuntime.getState().connected) return
        val currentInput = binding.pairUrlInput.text?.toString().orEmpty().trim()
        if (currentInput.isBlank()) return
        if (intent?.data != null) return

        hasAttemptedAutoConnect = true
        pendingPairingToRemember = currentInput
        ControllerForegroundService.startConnection(this, currentInput, "Trying saved desktop connection")
    }

    private fun rememberPairingUrl(rawPairingUrl: String) {
        val trimmed = rawPairingUrl.trim()
        if (trimmed.isBlank()) return

        recentPairings.removeAll { it == trimmed }
        recentPairings.add(0, trimmed)
        if (recentPairings.size > MAX_RECENT_PAIRINGS) {
            recentPairings = recentPairings.take(MAX_RECENT_PAIRINGS).toMutableList()
        }

        saveRecentPairings(recentPairings)
        renderRecentPairingButtons()
    }

    private fun loadRecentPairings(): List<String> {
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(PREF_RECENT_PAIRINGS, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            buildList {
                for (i in 0 until arr.length()) {
                    val value = arr.optString(i).trim()
                    if (value.isNotBlank()) add(value)
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveRecentPairings(values: List<String>) {
        val arr = JSONArray()
        values.forEach { arr.put(it) }
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_RECENT_PAIRINGS, arr.toString())
            .apply()
    }

    private fun renderRecentPairingButtons() {
        binding.recentPairingsSection.visibility = if (recentPairings.isEmpty()) View.GONE else View.VISIBLE
        binding.recentPairingsContainer.removeAllViews()

        recentPairings.forEachIndexed { index, url ->
            val button = MaterialButton(this, null, com.google.android.material.R.attr.materialButtonOutlinedStyle)
            button.layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT,
            ).apply {
                if (index > 0) topMargin = 8.dp
            }
            button.text = shortenPairingLabel(url)
            button.isAllCaps = false
            button.setOnClickListener {
                binding.pairUrlInput.setText(url)
                pendingPairingToRemember = url
                ControllerForegroundService.startConnection(this, url, "Connecting")
            }
            binding.recentPairingsContainer.addView(button)
        }
    }

    private fun shortenPairingLabel(url: String): String {
        val uri = Uri.parse(url)
        val host = uri.host ?: return url
        val port = if (uri.port != -1) uri.port.toString() else "80"
        return "$host:$port"
    }

    private fun readClipboardTextIfPairUrl(): String? {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        if (!clipboard.hasPrimaryClip()) return null
        val description = clipboard.primaryClipDescription ?: return null
        if (!description.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) &&
            !description.hasMimeType(ClipDescription.MIMETYPE_TEXT_HTML)
        ) {
            return null
        }

        return clipboard.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString()?.trim()
    }

    private fun showSnack(message: String) {
        Snackbar.make(binding.root, message, Snackbar.LENGTH_SHORT).show()
    }

    private fun formatTriple(a: Double, b: Double, c: Double): String {
        return String.format(Locale.US, "%.2f / %.2f / %.2f", a, b, c)
    }

    private val Int.dp: Int
        get() = (this * resources.displayMetrics.density).toInt()

    companion object {
        private const val PREFS_NAME = "ww_mobile_controller_prefs"
        private const val PREF_RECENT_PAIRINGS = "recent_pairings"
        private const val MAX_RECENT_PAIRINGS = 5
    }
}
