# Changelog

## 1.1.0 — 2026-09-07

Flect 1.1.0 makes wireless Android pairing easier and improves reliability on both standard x64 Windows and Windows 11 on ARM64.

### What’s new

- **Pair with a QR code.** Generate a one-time code in Flect, scan it from Android’s Wireless debugging screen, and Flect automatically completes pairing and connects to the phone.
- **Clear pairing timeouts.** Pairing-code requests now stop after 30 seconds, the dashboard recovers if the server does not respond, and ADB failures are shown instead of leaving the button stuck on “Pairing”.
- **Reliable device discovery.** Flect now recognizes the current ADB mDNS service format and resolves the phone’s real IP address and connection port before launching scrcpy.

### Windows compatibility

- Updated the bundled runtime to **scrcpy 4.1 with SDL3** and **ADB 37.0.0**.
- Kept one pairing path for standard x64 Windows and Windows 11 ARM64 through x64 app emulation, avoiding architecture-specific behavior changes.
- Improved desktop-launch verification so an early Explorer return code is not presented as a scrcpy failure when the mirror process is actually running.

The release workflow passed the automated pairing tests and bundled-runtime smoke test on standard x64 Windows. QR pairing, automatic connection, mirroring, preview capture, and clean shutdown were also verified end to end on Windows 11 ARM64 through x64 app emulation.

### Download and run

Download **Flect Windows ZIP** below, extract it, and double-click `run.bat`. Node.js 18 or newer is required.
