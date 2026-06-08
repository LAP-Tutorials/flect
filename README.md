# Flect 📱✨
> **Wireless Android Screen Mirroring GUI (Powered by Scrcpy)**

Flect is a premium, modern web-based graphical user interface for **scrcpy** on Windows. It makes wireless screen mirroring, device pairing, and configuration simple, fast, and accessible from any web browser. 

---

## 🌟 Features

*   **Zero Manual Setup:** One-click automated download and extraction of compatible `scrcpy` binaries (v3.3.4 SDL2) directly through the web UI.
*   **Modern Interactive Dashboard:** Sleek dark-mode interface featuring dynamic state indicators, real-time connection logs, and responsive layouts.
*   **Android 11+ Wireless Pairing Wizard:** Interactive pairing tool that handles the complex `adb pair` authentication handshake seamlessly.
*   **Automatic Device Lifecycle Sync:** Real-time monitoring of connected ADB devices. It auto-detects new wireless debugging ports and auto-selects active devices.
*   **Rich Quality & Control Options:**
    *   Quality Presets (Low, High, Ultra) and custom resolution limits.
    *   Control flags: Keep device awake, turn physical screen off while mirroring, show touch indicators, and disable audio.
    *   One-click screen recording saved directly to a local `/recordings` folder.
*   **Robust Launch Engine:** Includes special workarounds to bypass headless session isolation, ensuring the graphical SDL mirror window always appears on the active interactive desktop.

---

## 🛠️ How It Works (Under the Hood)

### 1. Interactive Session Escape (Headless Isolation Fix)
When node servers are launched under background tasks, scripts, or system services (Session 0), any graphical process they spawn directly inherits headless constraints, meaning the window runs silently in the background and is invisible to the user.
*   **Solution:** Flect writes a temporary batch file (`_flect_launch.bat`) with the correct connection settings and launches it via **`explorer.exe`**. This forces the execution of the command prompt and `scrcpy.exe` inside the active user's desktop session (Session 1), causing the SDL2 window to render successfully.
*   **Clean Closing:** The batch file is executed with the `scrcpy.exe --pause-on-exit=if-error` flag. If mirroring succeeds, the helper terminal window closes automatically when mirroring ends. If it fails, the terminal pauses so the user can see the error logs.

### 2. TLS Target Auto-Resolution
In Android 11+, wireless debugging advertises two network interfaces (a standard pairing/connection port and an mDNS TLS port, e.g., `adb-XYZ._adb-tls-connect._tcp`). Specifying the TLS name directly in `scrcpy` causes immediate crashes.
*   **Solution:** The backend interceptor queries `adb devices`, parses the active IP/port mappings, and dynamically auto-resolves any TLS target selection to its standard IP:port equivalent before spawning `scrcpy`.

### 3. Interactive Pairing Handshake
The `adb pair` command requires manual keyboard input to submit the 6-digit pairing code. This normally hangs Node's standard asynchronous pipelines.
*   **Solution:** Flect spawns `adb pair` as an interactive process and writes the pairing code directly to the child process's standard input (`stdin`) immediately upon startup.

---

## 🚀 How to Run

### Prerequisites
*   [Node.js](https://nodejs.org/) installed (v16+ recommended).
*   An Android phone on the same Wi-Fi network as the PC.
*   **Wireless Debugging** enabled on your phone (found under *Settings* -> *Developer Options*).

### Setup and Start
1.  **Clone or Copy** this folder to your PC.
2.  Open a terminal (PowerShell or Command Prompt) in the directory:
    ```bash
    cd C:\path\to\wireshare
    ```
3.  Install the lightweight Express server dependency:
    ```bash
    npm install
    ```
4.  Launch the server:
    ```bash
    npm start
    ```
5.  The server will spin up and **automatically open your web browser** to `http://localhost:3000`.

---

## 📱 Quick Connection Guide

1.  **Download Scrcpy:** On your first launch, click **Download Scrcpy**. The app will download, extract, and configure the binaries in the `scrcpy-win64` subfolder automatically.
2.  **Pair Your Phone (Android 11+):**
    *   Tap *Wireless Debugging* on your phone, then click **Pair device with pairing code**.
    *   In the **Pairing Wizard** tab, enter the IP, Port, and 6-digit Pairing Code shown on your phone.
    *   Click **Pair Device**.
3.  **Connect Wirelessly:**
    *   Look at your phone screen for the main **IP address and Port** under *Wireless Debugging*.
    *   Enter them into the **Connect** tab in the web UI.
    *   Click **Connect**.
4.  **Mirror:**
    *   The phone will appear in the **Active ADB Devices** list on the right side.
    *   Click it to select it, configure your settings (e.g. Always on top, Turn screen off), and click **Start Mirroring**!

---

## ⬆️ Update Scrcpy

To update local `scrcpy-win64` to the latest official Windows release:

```bash
npm run update:scrcpy
```

What this does:
* Queries the latest `Genymobile/scrcpy` GitHub release.
* Downloads the latest `scrcpy-win64-v*.zip`.
* Replaces the local `scrcpy-win64` folder safely (with rollback if replacement fails).

## 📁 Project Structure

*   `server.js`: The Express server and ADB/Scrcpy process management backend.
*   `public/`: Frontend user interface:
    *   `index.html`: Dashboard layout.
    *   `style.css`: Clean, glassmorphism dark-themed styling.
    *   `app.js`: Frontend state machine, SSE log receiver, and API controller.
*   `scrcpy-win64/`: Auto-generated directory containing local `scrcpy` and `adb` executables.
*   `recordings/`: Auto-created directory where screen recordings are saved as MP4s.
