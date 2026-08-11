const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const test = require('node:test');

const { normalizePairingRequest, runAdbPair } = require('../lib/adb-pair');

function createSpawnStub({ stdout = '', stderr = '', exitCode = 0, delayMs = 0 } = {}) {
  const calls = [];
  let child;

  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.killed = false;
    child.kill = () => {
      child.killed = true;
      return true;
    };

    setTimeout(() => {
      if (child.killed) return;
      if (stdout) child.stdout.write(stdout);
      if (stderr) child.stderr.write(stderr);
      child.emit('close', exitCode);
    }, delayMs);

    return child;
  };

  return { spawnImpl, calls, getChild: () => child };
}

test('normalizes a valid pairing request', () => {
  assert.deepEqual(
    normalizePairingRequest({ ip: ' 192.168.8.123 ', port: '40491', code: '997140' }),
    {
      ip: '192.168.8.123',
      port: '40491',
      code: '997140',
      endpoint: '192.168.8.123:40491'
    }
  );
});

test('rejects invalid pairing input', () => {
  assert.throws(() => normalizePairingRequest(null), /are required/);
  assert.throws(() => normalizePairingRequest({ ip: '192.168.8.999', port: '40491', code: '997140' }), /valid IPv4/);
  assert.throws(() => normalizePairingRequest({ ip: '192.168.8.123', port: '70000', code: '997140' }), /valid pairing port/);
  assert.throws(() => normalizePairingRequest({ ip: '192.168.8.123', port: '40491', code: '12345' }), /exactly 6 digits/);
});

test('passes the code as an ADB argument without opening stdin', async () => {
  const stub = createSpawnStub({ stdout: 'Successfully paired to 192.168.8.123:40491\n' });

  const result = await runAdbPair({
    adbPath: 'adb.exe',
    cwd: 'platform-tools',
    endpoint: '192.168.8.123:40491',
    code: '997140',
    spawnImpl: stub.spawnImpl
  });

  assert.match(result.message, /Successfully paired/);
  assert.deepEqual(stub.calls[0].args, [ 'pair', '192.168.8.123:40491', '997140' ]);
  assert.deepEqual(stub.calls[0].options.stdio, [ 'ignore', 'pipe', 'pipe' ]);
  assert.equal(stub.calls[0].options.windowsHide, true);
});

test('returns ADB failure output', async () => {
  const stub = createSpawnStub({ stderr: 'Failed: Wrong password\n', exitCode: 1 });

  await assert.rejects(
    runAdbPair({
      adbPath: 'adb.exe',
      cwd: 'platform-tools',
      endpoint: '192.168.8.123:40491',
      code: '997140',
      spawnImpl: stub.spawnImpl
    }),
    /Wrong password/
  );
});

test('terminates a pairing process that exceeds the timeout', async () => {
  const stub = createSpawnStub({ delayMs: 100 });

  await assert.rejects(
    runAdbPair({
      adbPath: 'adb.exe',
      cwd: 'platform-tools',
      endpoint: '192.168.8.123:40491',
      code: '997140',
      timeoutMs: 10,
      spawnImpl: stub.spawnImpl
    }),
    /Pairing timed out/
  );

  assert.equal(stub.getChild().killed, true);
});
