# Releasing Flect

Flect releases are intentional: pushing to `main` runs CI but does not publish a release.

## Publish from your computer

1. Update the version when needed:

   ```bash
   npm version patch --no-git-tag-version
   ```

   Use `minor` for a feature release or `major` for a breaking release.

2. Commit and push the finished changes to `main`.
3. Publish with one command:

   ```bash
   npm run release
   ```

The command refuses to publish from a dirty tree, another branch, or a commit that is not on `origin/main`. It runs the local checks, then starts the GitHub workflow. The workflow repeats the checks on standard Windows, verifies scrcpy and ADB, creates a versioned ZIP and SHA-256 checksum, and publishes `v<package version>` with generated release notes.

Use `npm run release -- --dry-run` to validate everything without publishing. Use `npm run release -- --prerelease` for a prerelease.

## Publish from GitHub

Open **Actions → Release → Run workflow**, enter the exact version from `package.json`, choose whether it is a prerelease, and run it. The workflow stops if the version is invalid, does not match `package.json`, or its tag already exists.
