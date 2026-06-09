# Contributing to Flect

Thank you for your interest in contributing to **Flect**! This project is open source and community contributions are welcome.

## Getting started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:
   ```bash
   git clone git@github.com:YOUR_USERNAME/flect.git
   cd flect
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Start the dev server**:
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Development workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes with clear, focused commits.
3. Run checks before opening a PR:
   ```bash
   npm run check
   ```
4. Push to your fork and open a **Pull Request** against `main`.

## What to work on

- Browse [open issues](https://github.com/Llewellyn500/flect/issues) for bugs and feature requests.
- Improvements to wireless discovery, pairing UX, recording reliability, and UI polish are always appreciated.
- Documentation fixes and README improvements count as contributions too.

## Code guidelines

- Match the existing style in `server.js`, `public/app.js`, and `public/style.css`.
- Keep changes scoped — one logical change per pull request when possible.
- Prefer fixing root causes over adding workarounds.
- Do not commit secrets, `.env` files, local device caches, recordings, or screenshots.
- Do not commit the `scrcpy-win64/` binaries — users download them through the app or `npm run update:scrcpy`.

## Brand assets

The canonical logo is `public/images/logo.png`. If you update it, regenerate derived assets:

```bash
npm run generate:assets
```

This updates favicons, PWA icons, and `docs/logo.png`.

## Reporting bugs

Use the [bug report template](https://github.com/Llewellyn500/flect/issues/new/choose) and include:

- Windows version
- Node.js version (`node -v`)
- Android version and device model
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs from the Flect console panel

## Feature requests

Open a feature request issue describing the problem you want solved and your proposed approach. Discussion before large PRs helps avoid wasted effort.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Questions

Open a [GitHub Discussion](https://github.com/Llewellyn500/flect/discussions) or issue if you are unsure where to start — we are happy to help.
