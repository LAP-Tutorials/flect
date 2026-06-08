const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Global state variables
let scrcpyProcess = null;
let downloadProgress = { active: false, progress: 0, downloaded: 0, total: 0 };
let eventClients = [];
let logBuffer = [];
const deviceNameCachePath = path.join(__dirname, 'device-name-cache.json');
let deviceNameCache = { byAdbId: {}, byHardwareId: {}, byHost: {} };
const autoDiscoveryState = {
  lastScanAt: null,
  devices: [],
  scanning: false,
  lastError: null,
  lastHint: '',
  lastConnectAttemptAt: {},
  announcedPairingHosts: {},
  announcedConnectedEndpoints: {}
};

// Helper function to broadcast events to SSE clients
function broadcastEvent(type, data) {
  eventClients.forEach(client => {
    client.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

// Helper function to log messages and broadcast them
function logMessage(message) {
  const timestamp = new Date().toLocaleTimeString();
  const formattedMessage = `[${timestamp}] ${message}`;
  console.log(formattedMessage);
  logBuffer.push(formattedMessage);
  // Limit buffer to 1000 lines
  if (logBuffer.length > 1000) logBuffer.shift();
  broadcastEvent('log', { message: formattedMessage });
}

function loadDeviceNameCache() {
  try {
    if (!fs.existsSync(deviceNameCachePath)) return;
    const raw = fs.readFileSync(deviceNameCachePath, 'utf8');
    const parsed = JSON.parse(raw);
    deviceNameCache = {
      byAdbId: parsed?.byAdbId || {},
      byHardwareId: parsed?.byHardwareId || {},
      byHost: parsed?.byHost || {}
    };
  } catch (e) {
    logMessage(`Device name cache load warning: ${e.message}`);
    deviceNameCache = { byAdbId: {}, byHardwareId: {}, byHost: {} };
  }
}

function saveDeviceNameCache() {
  try {
    fs.writeFileSync(deviceNameCachePath, JSON.stringify(deviceNameCache, null, 2), 'utf8');
  } catch (e) {
    logMessage(`Device name cache save warning: ${e.message}`);
  }
}

function normalizeHardwareId(value) {
  const cleaned = String(value || '').trim();
  const invalid = new Set(['', 'unknown', 'null', 'n/a', 'undefined']);
  return invalid.has(cleaned.toLowerCase()) ? '' : cleaned;
}

function toTitleCase(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildDeviceDisplayName(manufacturer, model) {
  const cleanManufacturer = String(manufacturer || '').trim();
  const cleanModel = String(model || '').trim();
  if (cleanManufacturer && cleanModel) {
    const mfrLower = cleanManufacturer.toLowerCase();
    const modelLower = cleanModel.toLowerCase();
    if (modelLower.startsWith(mfrLower)) return cleanModel;
    return `${toTitleCase(cleanManufacturer)} ${cleanModel}`;
  }
  return cleanModel || cleanManufacturer || '';
}

function extractHostFromAdbId(adbId) {
  const match = String(adbId || '').match(/^(\d+\.\d+\.\d+\.\d+):\d+$/);
  return match ? match[1] : '';
}

// Get the path to Scrcpy binaries
function getPaths() {
  const scrcpyDir = path.join(__dirname, 'scrcpy-win64');
  return {
    dir: scrcpyDir,
    adb: path.join(scrcpyDir, 'adb.exe'),
    scrcpy: path.join(scrcpyDir, 'scrcpy.exe'),
    exists: fs.existsSync(scrcpyDir) && fs.existsSync(path.join(scrcpyDir, 'scrcpy.exe'))
  };
}

async function resolveDeviceNameInfo(adbId) {
  const paths = getPaths();
  if (!paths.exists || !adbId) return null;

  const escapedId = String(adbId).replace(/"/g, '\\"');
  const modelResult = await runShellCommand(`"${paths.adb}" -s "${escapedId}" shell getprop ro.product.model`, { timeout: 4000 });
  const manufacturerResult = await runShellCommand(`"${paths.adb}" -s "${escapedId}" shell getprop ro.product.manufacturer`, { timeout: 4000 });
  const serialResult = await runShellCommand(`"${paths.adb}" -s "${escapedId}" shell getprop ro.serialno`, { timeout: 4000 });

  const model = String(modelResult.stdout || '').trim();
  const manufacturer = String(manufacturerResult.stdout || '').trim();
  const hardwareId = normalizeHardwareId(serialResult.stdout);
  const name = buildDeviceDisplayName(manufacturer, model);

  if (!name) return null;
  return { name, hardwareId };
}

async function enrichDeviceWithName(device) {
  const knownByAdb = deviceNameCache.byAdbId[device.id];
  if (knownByAdb?.name) {
    const hostFromId = extractHostFromAdbId(device.id);
    if (hostFromId) {
      deviceNameCache.byHost[hostFromId] = { name: knownByAdb.name };
      saveDeviceNameCache();
    }
    return { ...device, name: knownByAdb.name };
  }

  // Resolve only for active devices to avoid noisy lookups on offline endpoints.
  if (device.status !== 'device') {
    return { ...device, name: null };
  }

  const resolved = await resolveDeviceNameInfo(device.id);
  if (!resolved?.name) {
    return { ...device, name: null };
  }

  if (resolved.hardwareId && deviceNameCache.byHardwareId[resolved.hardwareId]?.name) {
    const cached = deviceNameCache.byHardwareId[resolved.hardwareId].name;
    deviceNameCache.byAdbId[device.id] = { name: cached, hardwareId: resolved.hardwareId };
    const hostFromId = extractHostFromAdbId(device.id);
    if (hostFromId) {
      deviceNameCache.byHost[hostFromId] = { name: cached };
    }
    saveDeviceNameCache();
    return { ...device, name: cached };
  }

  deviceNameCache.byAdbId[device.id] = { name: resolved.name, hardwareId: resolved.hardwareId || '' };
  if (resolved.hardwareId) {
    deviceNameCache.byHardwareId[resolved.hardwareId] = { name: resolved.name };
  }
  const hostFromId = extractHostFromAdbId(device.id);
  if (hostFromId) {
    deviceNameCache.byHost[hostFromId] = { name: resolved.name };
  }
  saveDeviceNameCache();

  return { ...device, name: resolved.name };
}

// Parse device list from adb devices command output
function parseDevices(stdout) {
  const lines = stdout.split('\n');
  const devices = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('*')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const adbId = parts[0];
        // Hide mDNS TLS pseudo-devices from UI.
        // They are aliases, not the real connectable endpoint for mirroring.
        if (adbId.includes('._adb-tls-connect._tcp')) {
          continue;
        }
        devices.push({
          id: adbId,
          status: parts[1]
        });
      }
    }
  }
  return devices;
}

loadDeviceNameCache();

function parseMdnsServicesOutput(output) {
  const lines = String(output || '').split('\n').map((line) => line.trim()).filter(Boolean);
  const byHost = {};

  for (const line of lines) {
    const endpointMatch = line.match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
    if (!endpointMatch) continue;

    const host = endpointMatch[1];
    const port = endpointMatch[2];
    const endpoint = `${host}:${port}`;
    const lower = line.toLowerCase();

    if (!byHost[host]) {
      byHost[host] = {
        host,
        connectEndpoint: null,
        pairingEndpoint: null
      };
    }

    if (lower.includes('._adb-tls-connect._tcp')) {
      byHost[host].connectEndpoint = endpoint;
    } else if (lower.includes('._adb-tls-pairing._tcp')) {
      byHost[host].pairingEndpoint = endpoint;
    }
  }

  return Object.values(byHost);
}

async function refreshAutoDiscovery() {
  if (autoDiscoveryState.scanning) {
    return;
  }
  autoDiscoveryState.scanning = true;

  try {
  const paths = getPaths();
  if (!paths.exists) {
    autoDiscoveryState.lastScanAt = new Date().toISOString();
    autoDiscoveryState.devices = [];
    autoDiscoveryState.lastHint = 'Scrcpy/ADB binaries are missing.';
    return;
  }

  await runShellCommand(`"${paths.adb}" start-server`, { timeout: 8000 });
  const mdnsResult = await runShellCommand(`"${paths.adb}" mdns services`, { timeout: 12000 });
  if (mdnsResult.err) {
    autoDiscoveryState.lastScanAt = new Date().toISOString();
    autoDiscoveryState.lastError = (mdnsResult.stderr || mdnsResult.err.message || 'mDNS discovery failed').trim();
    autoDiscoveryState.lastHint = 'Make sure phone and PC are on same Wi-Fi and Wireless Debugging screen is open.';
    return;
  }

  const mdnsHosts = parseMdnsServicesOutput(`${mdnsResult.stdout}\n${mdnsResult.stderr}`);
  const devicesResult = await runShellCommand(`"${paths.adb}" devices`, { timeout: 8000 });
  const connected = parseDevices(devicesResult.stdout || '').filter((d) => d.status === 'device');
  const connectedSet = new Set(connected.map((d) => d.id));

  const discoveryEntries = [];
  const now = Date.now();

  for (const hostEntry of mdnsHosts) {
    const host = hostEntry.host;
    const connectEndpoint = hostEntry.connectEndpoint;
    const pairingEndpoint = hostEntry.pairingEndpoint;
    const cachedName = deviceNameCache.byHost[host]?.name || null;
    const displayName = cachedName || 'Unknown Android device';

    let status = 'needs_pairing';
    let detail = 'Pairing is required for first-time devices.';

    if (connectEndpoint) {
      let isConnected = connectedSet.has(connectEndpoint);
      let authRequired = false;
      if (!isConnected) {
        const lastAttempt = autoDiscoveryState.lastConnectAttemptAt[connectEndpoint] || 0;
        if (now - lastAttempt > 15000) {
          autoDiscoveryState.lastConnectAttemptAt[connectEndpoint] = now;
          const connectResult = await runShellCommand(`"${paths.adb}" connect ${connectEndpoint}`, { timeout: 8000 });
          const connectOutput = `${connectResult.stdout}\n${connectResult.stderr}`.toLowerCase();
          if (connectOutput.includes('connected to') || connectOutput.includes('already connected')) {
            isConnected = true;
            connectedSet.add(connectEndpoint);
            if (!autoDiscoveryState.announcedConnectedEndpoints[connectEndpoint]) {
              autoDiscoveryState.announcedConnectedEndpoints[connectEndpoint] = true;
              logMessage(`Auto-discovery connected to ${connectEndpoint}.`);
            }
          } else if (
            connectOutput.includes('failed to authenticate') ||
            connectOutput.includes('authentication') ||
            connectOutput.includes('pair')
          ) {
            authRequired = true;
          }
        }
      }

      if (isConnected) {
        status = 'paired_connected';
        detail = 'Already paired and ready to mirror.';
      } else if (authRequired) {
        status = 'waiting_pairing_endpoint';
        detail = 'Pairing required. If scan still shows no pairing endpoint, enter IP/Port from the phone manually.';
      } else {
        status = 'discovered_not_connected';
        detail = 'Discovered but not connected yet. Will keep retrying auto-connect.';
      }
    } else if (pairingEndpoint) {
      detail = 'Pairing required: use this pairing endpoint from your phone screen.';
      if (!autoDiscoveryState.announcedPairingHosts[host]) {
        autoDiscoveryState.announcedPairingHosts[host] = true;
        logMessage(`Discovered new device at ${host}. Pairing is required before auto-connect.`);
      }
    } else {
      status = 'waiting_pairing_endpoint';
      detail = 'Device discovered, but pairing endpoint is hidden. Use IP/Port shown on phone if scan does not update.';
    }

    discoveryEntries.push({
      host,
      name: displayName,
      connectEndpoint: connectEndpoint || null,
      pairingEndpoint: pairingEndpoint || null,
      status,
      detail
    });
  }

  discoveryEntries.sort((a, b) => {
    const rank = (entry) => (entry.status === 'paired_connected' ? 0 : entry.status === 'discovered_not_connected' ? 1 : 2);
    return rank(a) - rank(b);
  });

  autoDiscoveryState.lastScanAt = new Date().toISOString();
  autoDiscoveryState.devices = discoveryEntries;
  autoDiscoveryState.lastError = null;
  autoDiscoveryState.lastHint = discoveryEntries.length
    ? 'Auto-discovery is active.'
    : 'No devices found yet. Open Wireless Debugging on your phone, then tap Scan.';
  } finally {
    autoDiscoveryState.scanning = false;
  }
}

// Execute adb command
function runAdbCommand(args) {
  return new Promise((resolve, reject) => {
    const paths = getPaths();
    if (!paths.exists) {
      return reject(new Error('Scrcpy / ADB binaries not found. Please download them first.'));
    }
    const adbCmd = `"${paths.adb}" ${args}`;
    logMessage(`Running: adb ${args}`);
    exec(adbCmd, (err, stdout, stderr) => {
      if (err) {
        logMessage(`ADB Error: ${stderr || err.message}`);
        reject(new Error(stderr || err.message));
      } else {
        logMessage(`ADB Output: ${stdout.trim()}`);
        resolve(stdout);
      }
    });
  });
}

// Execute shell command and always resolve with output details.
function runShellCommand(command, options = {}) {
  return new Promise((resolve) => {
    exec(command, options, (err, stdout, stderr) => {
      resolve({
        err,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
}

function isScrcpyRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq scrcpy.exe" /NH', (err, stdout) => {
      if (err) return resolve(false);
      resolve((stdout || '').includes('scrcpy.exe'));
    });
  });
}

// Politely ask every running scrcpy instance to close its main window. This is
// equivalent to the user clicking the window's X button, which lets scrcpy run
// its clean shutdown path and finalize any in-progress MP4 recording (writing
// the moov trailer) so the file remains playable.
function closeScrcpyWindowsGracefully() {
  const psCommand =
    "Get-Process scrcpy -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }";
  return runShellCommand(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`);
}

// Poll until scrcpy.exe is no longer running or the timeout elapses.
async function waitForScrcpyExit(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isScrcpyRunning())) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return !(await isScrcpyRunning());
}

async function stopScrcpyProcessGracefully({ allowForceFallback = true, isRecording = false } = {}) {
  if (!(await isScrcpyRunning())) {
    return { mode: 'none', output: 'No running scrcpy.exe process found.' };
  }

  // 1) Request a clean window close (finalizes recordings). Also send a plain
  //    taskkill (no /F) as a secondary graceful signal for console-only cases.
  await closeScrcpyWindowsGracefully();
  await runShellCommand('taskkill /IM scrcpy.exe');

  // 2) Allow time to flush/finalize. Recordings need noticeably longer to write
  //    the MP4 trailer, so give them a generous window before considering force.
  const gracePeriodMs = isRecording ? 12000 : 4000;
  if (await waitForScrcpyExit(gracePeriodMs)) {
    return { mode: 'graceful', output: 'scrcpy.exe closed cleanly.' };
  }

  if (!allowForceFallback) {
    return { mode: 'error', output: 'scrcpy.exe did not exit within the grace period.' };
  }

  // 3) Last resort. A forced kill can corrupt an in-progress recording, so this
  //    only runs when the clean close failed to terminate scrcpy in time.
  const forced = await runShellCommand('taskkill /IM scrcpy.exe /T /F');
  if (await waitForScrcpyExit(3000) || !forced.err) {
    return { mode: 'force', output: 'scrcpy.exe force-terminated.' };
  }

  return { mode: 'error', output: (forced.stderr || (forced.err && forced.err.message) || 'Failed to force terminate scrcpy.exe').trim() };
}

// SERVER EVENTS (SSE) Endpoint
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  res.write('\n');
  eventClients.push(res);
  
  // Send current log history to newly connected client
  res.write(`event: log-history\ndata: ${JSON.stringify({ logs: logBuffer })}\n\n`);
  
  req.on('close', () => {
    eventClients = eventClients.filter(client => client !== res);
  });
});

// STATUS API
app.get('/api/status', async (req, res) => {
  const paths = getPaths();
  let adbDevices = [];
  let adbRunning = false;
  
  if (paths.exists) {
    try {
      // Test adb connectivity
      const stdout = await new Promise((resolve) => {
        exec(`"${paths.adb}" devices`, (err, stdout) => {
          resolve(stdout || '');
        });
      });
      adbDevices = parseDevices(stdout);
      adbDevices = await Promise.all(adbDevices.map((device) => enrichDeviceWithName(device)));
      adbRunning = true;
    } catch (e) {
      adbRunning = false;
    }
  }
  
  res.json({
    scrcpyInstalled: paths.exists,
    mirroringActive: scrcpyProcess !== null,
    mirroredDeviceId: scrcpyProcess?.deviceId || null,
    recordingActive: !!scrcpyProcess?.recordingEnabled,
    autoDiscovery: {
      lastScanAt: autoDiscoveryState.lastScanAt,
      devices: autoDiscoveryState.devices,
      needsPairingCount: autoDiscoveryState.devices.filter((d) => d.status === 'needs_pairing').length,
      scanning: autoDiscoveryState.scanning,
      lastError: autoDiscoveryState.lastError,
      lastHint: autoDiscoveryState.lastHint
    },
    adbRunning,
    devices: adbDevices,
    downloadState: downloadProgress
  });
});

// DOWNLOAD & EXTRACT SCRCPY
app.post('/api/download', (req, res) => {
  const paths = getPaths();
  if (paths.exists) {
    return res.status(400).json({ error: 'Scrcpy is already downloaded and installed.' });
  }
  if (downloadProgress.active) {
    return res.status(400).json({ error: 'Download is already in progress.' });
  }

  downloadProgress = { active: true, progress: 0, downloaded: 0, total: 0 };
  broadcastEvent('status-change', { downloadState: downloadProgress });

  const zipUrl = 'https://github.com/Genymobile/scrcpy/releases/download/v4.0/scrcpy-win64-v4.0.zip';
  const zipPath = path.join(__dirname, 'scrcpy.zip');
  
  logMessage(`Starting download of Scrcpy v4.0 from ${zipUrl}...`);
  
  const file = fs.createWriteStream(zipPath);
  
  // Follow redirects if necessary
  const downloadFile = (url) => {
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        downloadFile(response.headers.location);
        return;
      }
      
      if (response.statusCode !== 200) {
        logMessage(`Download failed: HTTP Status ${response.statusCode}`);
        downloadProgress.active = false;
        broadcastEvent('status-change', { downloadState: downloadProgress });
        return res.status(500).json({ error: `Download failed: HTTP ${response.statusCode}` });
      }

      const totalLength = parseInt(response.headers['content-length'], 10);
      downloadProgress.total = totalLength;
      
      let downloadedLength = 0;
      
      response.on('data', (chunk) => {
        downloadedLength += chunk.length;
        const pct = totalLength ? Math.round((downloadedLength / totalLength) * 100) : 0;
        downloadProgress.progress = pct;
        downloadProgress.downloaded = downloadedLength;
        
        broadcastEvent('download-progress', downloadProgress);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        logMessage('Download completed. Extracting archive...');
        
        downloadProgress.progress = 100;
        broadcastEvent('download-progress', downloadProgress);
        
        // Extract archive using PowerShell
        const psCommand = `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${__dirname}' -Force"`;
        exec(psCommand, (err, stdout, stderr) => {
          // Cleanup ZIP file
          fs.unlink(zipPath, () => {});
          
          if (err) {
            logMessage(`Extraction failed: ${stderr || err.message}`);
            downloadProgress.active = false;
            broadcastEvent('status-change', { downloadState: downloadProgress });
            return;
          }
          
          logMessage('Extraction completed. Organizing files...');
          
          // Locate the extracted folder and rename to scrcpy-win64
          try {
            const files = fs.readdirSync(__dirname);
            const extractedDir = files.find(f => f.startsWith('scrcpy-win64-') && fs.statSync(path.join(__dirname, f)).isDirectory());
            
            if (extractedDir) {
              const targetPath = path.join(__dirname, 'scrcpy-win64');
              if (fs.existsSync(targetPath)) {
                fs.rmSync(targetPath, { recursive: true, force: true });
              }
              fs.renameSync(path.join(__dirname, extractedDir), targetPath);
              logMessage('Scrcpy successfully set up and ready to use.');
            } else {
              logMessage('Extraction succeeded, but could not find the folder structure. Please verify manually.');
            }
          } catch (renameErr) {
            logMessage(`Error organizing directory: ${renameErr.message}`);
          }
          
          downloadProgress.active = false;
          broadcastEvent('status-change', { downloadState: downloadProgress });
          broadcastEvent('installed', { success: true });
        });
      });
    }).on('error', (err) => {
      fs.unlink(zipPath, () => {});
      logMessage(`Network Error: ${err.message}`);
      downloadProgress.active = false;
      broadcastEvent('status-change', { downloadState: downloadProgress });
    });
  };

  downloadFile(zipUrl);
  res.json({ message: 'Download started in background' });
});

// KILL ADB SERVER
app.post('/api/kill-server', async (req, res) => {
  try {
    await runAdbCommand('kill-server');
    res.json({ success: true, message: 'ADB server killed successfully' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ADB PAIR (Wireless Debugging Android 11+)
app.post('/api/pair', (req, res) => {
  const { ip, port, code } = req.body;
  
  if (!ip || !port || !code) {
    return res.status(400).json({ error: 'IP, Port, and Pairing Code are required.' });
  }
  
  const paths = getPaths();
  if (!paths.exists) {
    return res.status(400).json({ error: 'Scrcpy not found. Please install first.' });
  }
  
  logMessage(`Attempting to pair with ${ip}:${port} using code ${code}...`);
  
  // Spawn adb pair as an interactive process
  const adbProcess = spawn(paths.adb, ['pair', `${ip}:${port}`], { cwd: paths.dir });
  
  let output = '';
  let errorOutput = '';
  let completed = false;
  let codeSent = false;
  
  // Send the pairing code immediately to stdin.
  // In Node.js, stdin writes are buffered by the OS. As soon as the spawned adb process 
  // tries to read from standard input, it will immediately consume the pairing code 
  // without hanging or waiting for stdout flushes.
  try {
    logMessage('Sending pairing code to process stdin immediately...');
    adbProcess.stdin.write(`${code}\n`);
    codeSent = true;
  } catch (stdinErr) {
    logMessage(`Error writing code to stdin immediately: ${stdinErr.message}`);
  }
  
  // Set safety timeout of 20 seconds
  const timeout = setTimeout(() => {
    if (!completed) {
      completed = true;
      adbProcess.kill();
      logMessage('Pairing process timed out.');
      res.status(500).json({ success: false, error: 'Pairing timed out. Make sure the pairing screen is still open and you are on the same Wi-Fi.' });
    }
  }, 20000);

  adbProcess.stdout.on('data', (data) => {
    const str = data.toString();
    output += str;
    logMessage(`adb pair: ${str.trim()}`);
    
    // Fallback: feed pairing code if prompted and we haven't sent it yet
    if (str.includes('Enter pairing code') && !codeSent && !completed) {
      logMessage('Feeding pairing code via fallback...');
      try {
        adbProcess.stdin.write(`${code}\n`);
        codeSent = true;
      } catch (err) {
        logMessage(`Fallback stdin write failed: ${err.message}`);
      }
    }
  });

  adbProcess.stderr.on('data', (data) => {
    const str = data.toString();
    errorOutput += str;
    logMessage(`adb pair error: ${str.trim()}`);
  });

  adbProcess.on('close', (code) => {
    if (completed) return;
    completed = true;
    clearTimeout(timeout);
    
    if (code === 0 || output.includes('Successfully paired') || output.includes('paired to')) {
      logMessage(`Successfully paired to ${ip}:${port}!`);
      res.json({ success: true, message: output || 'Successfully paired' });
    } else {
      logMessage(`Pairing failed with code ${code}.`);
      res.status(500).json({ success: false, error: errorOutput || output || 'Pairing failed. Check IP/Port and Pairing Code.' });
    }
  });
});

// ADB CONNECT
app.post('/api/connect', async (req, res) => {
  const { ip, port } = req.body;
  if (!ip || !port) {
    return res.status(400).json({ error: 'IP and Port are required.' });
  }
  
  try {
    const stdout = await runAdbCommand(`connect ${ip}:${port}`);
    if (stdout.includes('connected to') || stdout.includes('already connected')) {
      res.json({ success: true, message: stdout.trim() });
    } else {
      res.status(500).json({ success: false, error: stdout.trim() });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ADB DISCONNECT
app.post('/api/disconnect', async (req, res) => {
  try {
    const stdout = await runAdbCommand('disconnect');
    res.json({ success: true, message: stdout.trim() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ADB TCPIP 5555 (Enable wireless mode via USB)
app.post('/api/tcpip', async (req, res) => {
  try {
    const stdout = await runAdbCommand('tcpip 5555');
    res.json({ success: true, message: stdout.trim() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// MANUAL AUTO-DISCOVERY SCAN
app.post('/api/discovery/scan', async (req, res) => {
  await refreshAutoDiscovery();
  res.json({
    success: true,
    message: 'Discovery scan completed.',
    autoDiscovery: {
      lastScanAt: autoDiscoveryState.lastScanAt,
      devices: autoDiscoveryState.devices,
      needsPairingCount: autoDiscoveryState.devices.filter((d) => d.status === 'needs_pairing').length,
      scanning: autoDiscoveryState.scanning,
      lastError: autoDiscoveryState.lastError,
      lastHint: autoDiscoveryState.lastHint
    }
  });
});

// START SCRCPY MIRRORING
app.post('/api/start-scrcpy', async (req, res) => {
  const settings = req.body || {};
  const paths = getPaths();
  const isIpPortTarget = (value) => /^\d+\.\d+\.\d+\.\d+:\d+$/.test(String(value || ''));
  
  if (!paths.exists) {
    return res.status(400).json({ error: 'Scrcpy not found. Please install first.' });
  }
  
  if (scrcpyProcess) {
    return res.json({ success: true, message: 'Mirroring is already active.' });
  }
  
  let target = settings.serial;
  
  // Scrcpy often crashes if targeted directly at the mDNS TLS device name instead of its IP port.
  // Auto-resolve to the IP:port target if the user accidentally selected the TLS one.
  if (target && target.includes('._adb-tls-connect._tcp')) {
    try {
      const devicesOut = await runAdbCommand('devices');
      const lines = devicesOut.split('\n');
      for (const line of lines) {
        const match = line.match(/^(\d+\.\d+\.\d+\.\d+:\d+)\s+device/);
        if (match) {
          target = match[1];
          logMessage(`Auto-resolved TLS target to ${target}`);
          break;
        }
      }
    } catch (e) {
      logMessage(`Failed to resolve TLS target: ${e.message}`);
    }
  }

  // If TCP/IP preference is enabled and current target is not a concrete IP:port device,
  // try to auto-pick the first active TCP/IP target.
  if (settings.selectTcpIp && !isIpPortTarget(target)) {
    try {
      const devicesOut = await runAdbCommand('devices');
      const lines = devicesOut.split('\n');
      for (const line of lines) {
        const match = line.match(/^(\d+\.\d+\.\d+\.\d+:\d+)\s+device/);
        if (match) {
          target = match[1];
          logMessage(`TCP/IP preference selected target ${target}`);
          break;
        }
      }
    } catch (e) {
      logMessage(`Failed to apply TCP/IP preference: ${e.message}`);
    }
  }
  
  // Let scrcpy choose the best renderer automatically.
  // For some Windows setups, forcing OpenGL can result in a non-visible viewer window.
  const args = [];
  
  // Device Selection
  if (target) {
    args.push('-s');
    args.push(target);
  } else if (settings.selectTcpIp) {
    args.push('-e');
  } else if (settings.selectUsb) {
    args.push('-d');
  }
  
  // Visuals & Resolution
  if (settings.maxSize) {
    args.push('--max-size');
    args.push(String(settings.maxSize));
  }
  if (settings.bitRate) {
    args.push('--video-bit-rate');
    args.push(`${String(settings.bitRate)}M`);
  }
  if (settings.fps) {
    args.push('--max-fps');
    args.push(String(settings.fps));
  }
  
  // Control Preferences
  if (settings.stayAwake) args.push('--stay-awake');
  if (settings.alwaysOnTop) args.push('--always-on-top');
  if (settings.noAudio) args.push('--no-audio');
  if (settings.turnScreenOff) args.push('--turn-screen-off');
  if (settings.showTouches) args.push('--show-touches');
  
  let recordingFile = null;
  if (settings.record) {
    // Save recording in a local recordings directory
    const recDir = path.join(__dirname, 'recordings');
    if (!fs.existsSync(recDir)) {
      fs.mkdirSync(recDir);
    }
    const filename = `recording_${Date.now()}.mp4`;
    recordingFile = path.join(recDir, filename);
    args.push('--record');
    args.push(recordingFile);
    logMessage(`Recording enabled. File will be saved to: recordings/${filename}`);
  }
  
  logMessage(`Launching Scrcpy with arguments: ${args.join(' ')}`);
  
  // Clean up previous scrcpy instance before launching a new one.
  const preLaunchStop = await stopScrcpyProcessGracefully({ allowForceFallback: true });
  if (preLaunchStop.mode === 'force') {
    logMessage('Pre-launch cleanup required force termination of previous scrcpy process.');
  } else if (preLaunchStop.mode === 'error') {
    logMessage(`Pre-launch cleanup warning: ${preLaunchStop.output}`);
  }
  
  // Write a batch file that launches scrcpy directly with pause-on-exit if error
  const batContent = [
    '@echo off',
    `cd /d "${paths.dir}"`,
    `scrcpy.exe --pause-on-exit=if-error ${args.join(' ')}`,
    ''
  ].join('\r\n');
  
  const batPath = path.join(paths.dir, '_flect_launch.bat');
  fs.writeFileSync(batPath, batContent);
  
  // Launch via explorer.exe to force execution in the interactive user desktop.
  // On Windows this can return a non-zero exit code even when the .bat starts successfully.
  exec(`explorer.exe "${batPath}"`, { cwd: paths.dir }, (err) => {
    if (err) {
      const message = String(err.message || '');
      const likelyExplorerQuirk = message.toLowerCase().includes('explorer.exe');
      if (likelyExplorerQuirk) {
        // Do not surface the raw explorer.exe error text ("Command failed"),
        // because scrcpy may still have launched successfully.
        logMessage('Scrcpy launcher returned a non-zero code (Windows quirk). Mirroring may still be active.');
      } else {
        logMessage(`Scrcpy launch failed: ${message}`);
      }
    } else {
      logMessage('Scrcpy process launched via explorer.exe directly.');
    }
  });
  
  // Track active mirroring state and device so UI can show the actual mirrored target.
  scrcpyProcess = { active: true, deviceId: target || null, recordingEnabled: !!settings.record, recordingFile };
  
  // Poll for scrcpy.exe process to detect when user closes the mirroring window
  setTimeout(() => {
    const pollInterval = setInterval(() => {
      exec('tasklist /FI "IMAGENAME eq scrcpy.exe" /NH', (err, stdout) => {
        if (err || !stdout.includes('scrcpy.exe')) {
          clearInterval(pollInterval);
          if (scrcpyProcess) {
            const exitedDeviceId = scrcpyProcess.deviceId || null;
            logMessage('Scrcpy process has exited.');
            scrcpyProcess = null;
            broadcastEvent('mirroring-ended', { code: 0, deviceId: exitedDeviceId });
          }
        }
      });
    }, 3000);
    
    if (scrcpyProcess) {
      scrcpyProcess._pollInterval = pollInterval;
    }
  }, 5000);
  
  broadcastEvent('mirroring-started', { deviceId: target || null, recordingEnabled: !!settings.record });
  res.json({ success: true, message: 'Mirroring launched successfully' });
});

// STOP SCRCPY MIRRORING
app.post('/api/stop-scrcpy', async (req, res) => {
  logMessage('Stop requested: attempting to terminate any running scrcpy process...');
  const mirroredDeviceId = scrcpyProcess?.deviceId || null;
  const wasRecording = !!scrcpyProcess?.recordingEnabled;
  const recordingFile = scrcpyProcess?.recordingFile || null;

  // Clear the polling interval if we have a tracked process.
  if (scrcpyProcess && scrcpyProcess._pollInterval) {
    clearInterval(scrcpyProcess._pollInterval);
  }

  // Close cleanly first so an in-progress recording can finalize its MP4 trailer.
  const stopResult = await stopScrcpyProcessGracefully({ allowForceFallback: true, isRecording: wasRecording });

  // Clear tracked state after stop attempt so UI does not remain stuck in active mode.
  scrcpyProcess = null;
  broadcastEvent('mirroring-ended', { code: 0, deviceId: mirroredDeviceId });

  if (stopResult.mode === 'error') {
    logMessage(`Stop result: ${stopResult.output}`);
    return res.json({ success: false, message: `Failed to stop mirroring cleanly: ${stopResult.output}` });
  }

  if (stopResult.mode === 'force' && wasRecording) {
    logMessage('Stop used force termination while recording; resulting file may be incomplete.');
    return res.json({ success: true, message: 'Mirroring stopped, but the recording was force-closed and may be incomplete.' });
  }

  logMessage(`Stop result: ${stopResult.output}`);

  if (wasRecording && recordingFile) {
    // Confirm the finalized recording exists and has real content.
    try {
      const stats = fs.existsSync(recordingFile) ? fs.statSync(recordingFile) : null;
      const relativePath = path.relative(__dirname, recordingFile);
      if (stats && stats.size > 0) {
        logMessage(`Recording finalized: ${relativePath} (${(stats.size / 1024 / 1024).toFixed(1)} MB).`);
        return res.json({ success: true, message: `Recording saved and finalized: ${relativePath}` });
      }
      logMessage(`Recording stopped but file looks empty: ${relativePath}`);
    } catch (e) {
      logMessage(`Could not verify recording file: ${e.message}`);
    }
  }

  return res.json({ success: true, message: 'Mirroring stopped successfully.' });
});

// LIVE SETTING: TURN SCREEN OFF / WAKE SCREEN DURING ACTIVE MIRRORING
app.post('/api/live/turn-screen', async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ success: false, error: 'enabled boolean is required.' });
  }

  const targetDevice = scrcpyProcess?.deviceId;
  if (!scrcpyProcess || !targetDevice) {
    return res.status(400).json({ success: false, error: 'No active mirrored device found.' });
  }

  try {
    // KEYCODE_SLEEP (223) and KEYCODE_WAKEUP (224) provide deterministic power state changes.
    const keyCode = enabled ? 223 : 224;
    await runAdbCommand(`-s ${targetDevice} shell input keyevent ${keyCode}`);

    if (enabled) {
      logMessage(`Live setting applied: turned physical screen off for ${targetDevice}.`);
      return res.json({ success: true, message: 'Phone screen turned off (live).' });
    }

    logMessage(`Live setting applied: wake command sent to ${targetDevice}.`);
    return res.json({ success: true, message: 'Wake command sent to phone screen (live).' });
  } catch (e) {
    logMessage(`Live screen power update failed: ${e.message}`);
    return res.status(500).json({ success: false, error: e.message || 'Failed to apply live screen power setting.' });
  }
});

// Start the server and auto-open the browser
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  refreshAutoDiscovery();
  setInterval(refreshAutoDiscovery, 7000);
  
  // Auto-open browser in Windows
  const openUrl = `http://localhost:${PORT}`;
  exec(`start ${openUrl}`, (err) => {
    if (err) {
      console.error('Failed to automatically open browser:', err);
    }
  });
});
