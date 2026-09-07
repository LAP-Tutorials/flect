const crypto = require('node:crypto');

const QR_PAIRING_TIMEOUT_MS = 120000;
const SAFE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function randomText(length, randomBytesImpl = crypto.randomBytes) {
  const bytes = randomBytesImpl(length);
  let value = '';
  for (let index = 0; index < length; index += 1) {
    value += SAFE_ALPHABET[ bytes[ index ] % SAFE_ALPHABET.length ];
  }
  return value;
}

function createQrPairingCredentials(randomBytesImpl = crypto.randomBytes) {
  const serviceName = `studio-${randomText(10, randomBytesImpl)}`;
  const password = randomText(12, randomBytesImpl);
  return {
    serviceName,
    password,
    payload: `WIFI:T:ADB;S:${serviceName};P:${password};;`
  };
}

function findQrPairingEndpoint(output, serviceName) {
  for (const rawLine of String(output || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !line.includes('_adb-tls-pairing._tcp')) continue;

    const fields = line.split(/\s+/);
    const announcedName = fields[ 0 ].replace(/\._adb-tls-pairing\._tcp(?:\.local)?\.?$/i, '');
    if (announcedName !== serviceName) continue;

    const match = line.match(/(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})/);
    if (match) return `${match[ 1 ]}:${match[ 2 ]}`;
  }
  return null;
}

module.exports = {
  QR_PAIRING_TIMEOUT_MS,
  createQrPairingCredentials,
  findQrPairingEndpoint
};
