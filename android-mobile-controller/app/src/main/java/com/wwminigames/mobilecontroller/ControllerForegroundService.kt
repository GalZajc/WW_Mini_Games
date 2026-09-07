package com.wwminigames.mobilecontroller

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class ControllerForegroundService : Service(), ControllerRuntime.Listener {

    private var connectionRequested = false
    private var lastNotificationText = ""
    private var lastNotificationConnected = false

    override fun onCreate() {
        super.onCreate()
        ControllerRuntime.initialize(applicationContext)
        ControllerRuntime.addListener(this)
        ensureNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_CONNECT -> {
                connectionRequested = true
                val pairingUrl = intent.getStringExtra(EXTRA_PAIRING_URL).orEmpty()
                val statusLabel = intent.getStringExtra(EXTRA_STATUS_LABEL) ?: "Connecting"
                startForeground(NOTIFICATION_ID, buildNotification("Starting controller stream..."))
                ControllerRuntime.connect(pairingUrl, statusLabel)
            }

            ACTION_DISCONNECT -> {
                connectionRequested = false
                ControllerRuntime.disconnect("Disconnected")
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }

            else -> {
                startForeground(NOTIFICATION_ID, buildNotification(ControllerRuntime.getState().statusMessage))
            }
        }

        return START_STICKY
    }

    override fun onDestroy() {
        ControllerRuntime.removeListener(this)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStateChanged(state: ControllerRuntimeState) {
        if (state.statusMessage != lastNotificationText || state.connected != lastNotificationConnected) {
            lastNotificationText = state.statusMessage
            lastNotificationConnected = state.connected
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(NOTIFICATION_ID, buildNotification(state.statusMessage))
        }

        if (connectionRequested &&
            !state.connected &&
            state.statusMessage != "Ready. Paste the desktop pairing link and tap Connect." &&
            !state.statusMessage.startsWith("Connecting")
        ) {
            connectionRequested = false
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    private fun buildNotification(status: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val launchPendingIntent = PendingIntent.getActivity(
            this,
            1,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val disconnectIntent = Intent(this, ControllerForegroundService::class.java).apply {
            action = ACTION_DISCONNECT
        }
        val disconnectPendingIntent = PendingIntent.getService(
            this,
            2,
            disconnectIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("WW Mobile Controller")
            .setContentText(status)
            .setStyle(NotificationCompat.BigTextStyle().bigText(status))
            .setOngoing(true)
            .setContentIntent(launchPendingIntent)
            .addAction(0, "Disconnect", disconnectPendingIntent)
            .build()
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val existing = manager.getNotificationChannel(CHANNEL_ID)
        if (existing != null) return

        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Controller streaming",
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = "Keeps the phone controller streaming while the screen is off."
            }
        )
    }

    companion object {
        private const val CHANNEL_ID = "controller_stream"
        private const val NOTIFICATION_ID = 7314
        private const val ACTION_CONNECT = "com.wwminigames.mobilecontroller.action.CONNECT"
        private const val ACTION_DISCONNECT = "com.wwminigames.mobilecontroller.action.DISCONNECT"
        private const val EXTRA_PAIRING_URL = "pairing_url"
        private const val EXTRA_STATUS_LABEL = "status_label"

        fun startConnection(context: Context, pairingUrl: String, statusLabel: String = "Connecting") {
            val intent = Intent(context, ControllerForegroundService::class.java).apply {
                action = ACTION_CONNECT
                putExtra(EXTRA_PAIRING_URL, pairingUrl)
                putExtra(EXTRA_STATUS_LABEL, statusLabel)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun disconnect(context: Context) {
            val intent = Intent(context, ControllerForegroundService::class.java).apply {
                action = ACTION_DISCONNECT
            }
            context.startService(intent)
        }
    }
}
