const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Exercise the actual dashboard handler with a stalled HTTP response, without
// waiting 35 seconds or requiring an Android device in CI.
const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
const handlerSource = source.slice(
  source.indexOf("  btnPair.addEventListener('click'"),
  source.indexOf('  async function connectDevice(')
);

test('a stalled pairing request recovers the button and explains the timeout', async () => {
  let click;
  let expire;
  let cleared = false;
  const messages = [];
  const btnPair = { disabled: false, addEventListener: (_, handler) => { click = handler; } };
  vm.runInNewContext(handlerSource, {
    btnPair,
    pairIp: { value: '192.168.1.50' },
    pairPort: { value: '34567' },
    pairCode: { value: '123456' },
    connectIp: { value: '' },
    AbortController,
    setTimeout: (callback, ms) => { assert.equal(ms, 35000); expire = callback; return 1; },
    clearTimeout: () => { cleared = true; },
    fetch: (_, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
    showToast: (message) => messages.push(message),
    addTerminalLog: () => {}
  });
  const pending = click();
  assert.equal(btnPair.disabled, true);
  expire();
  await pending;
  assert.equal(btnPair.disabled, false);
  assert.equal(btnPair.innerText, 'Pair Device');
  assert.equal(cleared, true);
  assert.match(messages[0], /35 seconds/);
});
