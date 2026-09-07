const assert = require('node:assert/strict');
const test = require('node:test');

const { createQrPairingCredentials, findQrPairingEndpoint } = require('../lib/adb-qr');

test('creates an Android ADB QR payload with safe one-time credentials', () => {
  let seed = 0;
  const credentials = createQrPairingCredentials((length) => Buffer.from(
    Array.from({ length }, () => seed++ % 256)
  ));

  assert.match(credentials.serviceName, /^studio-[A-Za-z0-9]{10}$/);
  assert.match(credentials.password, /^[A-Za-z0-9]{12}$/);
  assert.equal(
    credentials.payload,
    `WIFI:T:ADB;S:${credentials.serviceName};P:${credentials.password};;`
  );
});

test('finds only the QR session matching the advertised mDNS service name', () => {
  const output = [
    'adb-phone-abc _adb-tls-pairing._tcp 192.168.1.20:37111',
    'studio-other _adb-tls-pairing._tcp 192.168.1.21:37222',
    'studio-Flect12345 _adb-tls-pairing._tcp 192.168.1.50:38333'
  ].join('\n');

  assert.equal(findQrPairingEndpoint(output, 'studio-Flect12345'), '192.168.1.50:38333');
  assert.equal(findQrPairingEndpoint(output, 'studio-missing'), null);
});

test('accepts a fully-qualified mDNS instance name', () => {
  const output = 'studio-Flect12345._adb-tls-pairing._tcp.local. 192.168.1.50:38333';
  assert.equal(findQrPairingEndpoint(output, 'studio-Flect12345'), '192.168.1.50:38333');
});
