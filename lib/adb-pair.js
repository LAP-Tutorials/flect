const { spawn } = require('child_process');

const PAIRING_TIMEOUT_MS = 30000;
const PAIRING_SUCCESS_PATTERN = /(?:successfully\s+paired|paired\s+to)/i;

function isValidIpv4(value) {
  const parts = String(value).split('.');
  return parts.length === 4 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

function normalizePairingRequest(input = {}) {
  input = input || {};
  const ip = String(input.ip || '').trim();
  const port = String(input.port || '').trim();
  const code = String(input.code || '').trim();

  if (!ip || !port || !code) {
    throw new Error('IP, Port, and Pairing Code are required.');
  }
  if (!isValidIpv4(ip)) {
    throw new Error('Enter a valid IPv4 address shown on the phone.');
  }
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Enter a valid pairing port between 1 and 65535.');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new Error('The pairing code must contain exactly 6 digits.');
  }

  const normalizedPort = String(Number(port));
  return {
    ip,
    port: normalizedPort,
    code,
    endpoint: `${ip}:${normalizedPort}`
  };
}

function runAdbPair({
  adbPath,
  cwd,
  endpoint,
  code,
  timeoutMs = PAIRING_TIMEOUT_MS,
  spawnImpl = spawn,
  onOutput = () => {}
}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    let timeout;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback(value);
    };

    // Passing the pairing code as an argument is part of ADB's public CLI and
    // avoids its interactive stdin prompt. Piped stdin is unreliable when the
    // x86 ADB binary runs through Windows emulation on ARM64 machines.
    try {
      child = spawnImpl(adbPath, [ 'pair', endpoint, code ], {
        cwd,
        windowsHide: true,
        stdio: [ 'ignore', 'pipe', 'pipe' ]
      });
    } catch (error) {
      reject(error);
      return;
    }

    timeout = setTimeout(() => {
      const error = new Error('Pairing timed out. Open a fresh pairing-code screen on the phone and try again on the same Wi-Fi.');
      error.code = 'PAIRING_TIMEOUT';
      finish(reject, error);
      try {
        child.kill();
      } catch {
        // The process may have exited between the timeout and the kill call.
      }
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      onOutput({ stream: 'stdout', text });
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      onOutput({ stream: 'stderr', text });
    });

    child.once('error', (error) => {
      finish(reject, new Error(`Could not start ADB: ${error.message}`));
    });

    child.once('close', (exitCode) => {
      if (settled) return;

      const combinedOutput = `${stdout}\n${stderr}`.trim();
      if (exitCode === 0 || PAIRING_SUCCESS_PATTERN.test(combinedOutput)) {
        finish(resolve, {
          exitCode,
          stdout,
          stderr,
          message: combinedOutput || `Successfully paired to ${endpoint}`
        });
        return;
      }

      const error = new Error(combinedOutput || `ADB pairing failed (exit code ${exitCode}).`);
      error.code = 'PAIRING_FAILED';
      error.exitCode = exitCode;
      finish(reject, error);
    });
  });
}

module.exports = {
  PAIRING_TIMEOUT_MS,
  isValidIpv4,
  normalizePairingRequest,
  runAdbPair
};
