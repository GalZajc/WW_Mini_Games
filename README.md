# WW Mini Games

An expansive, customizable collection of mini-games and micro-games inspired by WarioWare, arcade classics, and experimental physics.

---

## Overview & Development Status

WW Mini Games brings together a diverse variety of fast-paced arcade challenges, balance puzzles, rhythm games, 3D navigation tests, and classic tabletop adaptations:

- **Prototype & Experimental Phase**: The majority of the mini-games are currently in active prototype and exploratory development stages, focusing on novel mechanics, responsiveness, and physics-driven gameplay.
- **ReRoMo Tetris (Flagship Title)**: Unlike the prototype mini-games, ReRoMo Tetris is an exceptionally advanced, mature, and deeply engineered game featuring:
  - Six distinct board topologies: **Cartesian**, **Polar (circular)**, **Möbius strip double-traversal**, **Rocking platform (rolling lines)**, **Rocking platform with mass-collapse pressure**, and **Structural Cartesian (statics, torque equilibrium, and toppling collapse)**.
  - Polyomino piece systems from monominos up to 10-ominos with custom probability distributions.
  - Fully modular 8-slot corner widget layout customization.
  - Ongoing development will continue to expand its features, physics, and gameplay modes.

---

## Deep Customizability & Settings

Every game in the collection exposes a detailed configuration schema accessible via the in-game **Settings** menu (`Escape` key):
- Fine-tune physical constants: gravity, friction coefficients, angular velocities, damping, and elasticity.
- Adjust grid dimensions, speeds, tolerances, timer durations, camera perspectives, and visual representations.
- Tuned user profiles are saved locally and persist across sessions.

---

## Comprehensive Input & Rebinding Support

Control inputs can be fully rebound and customized per game:
- **Keyboard**: Full key mapping with configurable multi-key combos and repeat rates.
- **Mouse**: High-precision cursor movement, mouse steering, and pointer-lock capture.
- **Gamepads / Controllers**: Plug-and-play support for standard controllers with analog sticks and triggers.
- **Mobile Controller (Touch & Device Tilt)**: Real-time touch controls and accelerometer / gyroscope phone tilt input.

---

## Mobile Companion Controller

The repository includes a dedicated Android companion controller in the [`android-mobile-controller/`](android-mobile-controller/) directory. It streams real-time orientation, linear acceleration, and touch input to the desktop app over a low-latency local WebSocket.

### Installing the Mobile App on Android:

1. **Open in Android Studio**:
   - Launch Android Studio.
   - Select **Open** and choose the `android-mobile-controller/` directory within this repository.
   - Allow Gradle to sync dependencies and download the Android SDK platform if prompted.
2. **Build and Install**:
   - Enable **Developer options** and **USB debugging** (or Wireless debugging) on your Android device.
   - Connect your device and click **Run 'app'** (or build the debug APK via `Build > Build Bundle(s) / APK(s) > Build APK(s)`).
   - Alternatively, build from the command line:
     ```bash
     cd android-mobile-controller
     gradlew assembleDebug
     ```
     The output APK will be located in `android-mobile-controller/app/build/outputs/apk/debug/app-debug.apk`.
3. **Pairing with Desktop**:
   - Ensure your phone and computer are connected to the same local Wi-Fi network.
   - In WW Mini Games, open the mobile pairing screen from settings or diagnostics to copy the pairing URL / token.
   - In the Android app, paste the URL and tap **Connect**.
   - Your device's gyroscope, tilt, and touch surface will now control compatible mini-games!
4. **Browser Fallback**:
   - You can also connect any smartphone by navigating to the desktop host's local IP address and port in any mobile web browser without installing the native APK.

---

## Installation & Running

### Automatic Setup (Windows)
Double-click **`setup_and_run.bat`**:
- Automatically checks for and installs Node.js LTS (v20.18.3) if missing.
- Installs all npm dependencies (`electron`, `three`, `ws`).
- Creates a convenient **WW Mini Games** shortcut on your Desktop with the app icon.
- Launches the game.

### Manual Setup
1. Ensure [Node.js](https://nodejs.org/) (v18+) is installed.
2. Clone the repository:
   ```bash
   git clone https://github.com/GalZajc/WW_Mini_Games.git
   cd WW_Mini_Games
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the application:
   ```bash
   npm start
   ```
   Or run `run.bat`.

---

## License

All rights reserved. Developed by Gal Zajc.
