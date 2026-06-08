const fs = require('fs');
const fsp = require('fs/promises');
const https = require('https');
const path = require('path');
const { exec } = require('child_process');

const RELEASES_API = 'https://api.github.com/repos/Genymobile/scrcpy/releases/latest';

function log(message) {
  console.log(`[Flect updater] ${message}`);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'flect-scrcpy-updater',
          Accept: 'application/vnd.github+json'
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`GitHub API failed with HTTP ${res.statusCode}: ${body}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Failed to parse GitHub response: ${error.message}`));
          }
        });
      }
    );
    req.on('error', reject);
  });
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: { 'User-Agent': 'flect-scrcpy-updater' }
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          return resolve(downloadFile(res.headers.location, destPath));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
        }

        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(destPath)));
        file.on('error', (err) => reject(err));
      }
    );
    request.on('error', reject);
  });
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout);
    });
  });
}

async function removeIfExists(targetPath) {
  try {
    await fsp.rm(targetPath, { recursive: true, force: true });
  } catch (_) {
    // best effort
  }
}

async function main() {
  const root = path.resolve(__dirname, '..');
  const currentDir = path.join(root, 'scrcpy-win64');
  const backupDir = path.join(root, 'scrcpy-win64.backup');
  const tmpZip = path.join(root, 'scrcpy-update.zip');
  const extractDir = path.join(root, '_scrcpy_extract_tmp');

  log('Checking latest scrcpy release from GitHub...');
  const release = await fetchJson(RELEASES_API);
  const asset = (release.assets || []).find((a) => /^scrcpy-win64-v.*\.zip$/i.test(a.name));
  if (!asset) {
    throw new Error('Could not find scrcpy win64 zip asset in latest release.');
  }

  log(`Latest release: ${release.tag_name} (${asset.name})`);
  log('Downloading latest Windows package...');
  await removeIfExists(tmpZip);
  await downloadFile(asset.browser_download_url, tmpZip);

  log('Extracting archive...');
  await removeIfExists(extractDir);
  await fsp.mkdir(extractDir, { recursive: true });
  const expandCommand = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${tmpZip.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force"`;
  await runCommand(expandCommand);

  const entries = await fsp.readdir(extractDir, { withFileTypes: true });
  const extractedFolder = entries.find((e) => e.isDirectory() && e.name.startsWith('scrcpy-win64-'));
  if (!extractedFolder) {
    throw new Error('Could not find extracted scrcpy-win64-* directory.');
  }
  const extractedPath = path.join(extractDir, extractedFolder.name);

  let movedCurrentToBackup = false;
  try {
    await removeIfExists(backupDir);
    if (fs.existsSync(currentDir)) {
      await fsp.rename(currentDir, backupDir);
      movedCurrentToBackup = true;
    }

    await fsp.rename(extractedPath, currentDir);
    await removeIfExists(backupDir);
  } catch (error) {
    if (movedCurrentToBackup && fs.existsSync(backupDir) && !fs.existsSync(currentDir)) {
      await fsp.rename(backupDir, currentDir);
      log('Update failed; restored previous scrcpy-win64 backup.');
    }
    throw error;
  } finally {
    await removeIfExists(tmpZip);
    await removeIfExists(extractDir);
  }

  log(`Update completed successfully to ${asset.name}.`);
}

main().catch((error) => {
  console.error(`[Flect updater] ERROR: ${error.message}`);
  process.exit(1);
});

