# WW Mobile Controller

Minimal Android app for sending phone orientation, linear acceleration, gyroscope data, and raw touchpad input to the desktop `WW Mini Games` app over WebSocket.

## What it does

- Reads sensors natively with `SensorManager`
- Sends packets over `OkHttp` WebSocket
- Accepts the desktop pairing URL and converts it to the matching `ws://.../ws?token=...` address
- Includes both a preview touchpad and a fullscreen touchpad
- Allows cleartext local-network traffic for development

## Open in Android Studio

1. Launch Android Studio from `C:\Program Files\Android\Android Studio\bin\studio64.exe`
2. Open the folder `C:\Users\gal.SI-2000\Downloads\WW Mini Games\android-mobile-controller`
3. If Android Studio asks to install the Android SDK or platform packages, accept
4. If it asks to sync Gradle files, accept
5. Connect your Android phone with USB debugging enabled, or use wireless debugging
6. Run the `app` configuration

## Built APK

Current debug APK path:

`C:\Users\gal.SI-2000\Downloads\WW Mini Games\android-mobile-controller\app\build\outputs\apk\debug\app-debug.apk`

## First app test

1. Start `Mobile Controller Diagnostics` on the desktop
2. Click `Copy Link`
3. In the Android app, tap `Paste`
4. Tap `Connect`
5. Keep sensors enabled and move the phone

## Notes

- This app intentionally enables cleartext traffic so local `http://` and `ws://` desktop pairing links work during development.
- I have not built this project end-to-end yet from this session, because Android Studio still needs its first project sync and SDK selection on this machine.
