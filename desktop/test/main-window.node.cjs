const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMainWindowControl } = require('../main-window.cjs');
const marker = 'a'.repeat(32);
test('the opening gesture cannot immediately restore the window through the native hook', async () => {
  let time = 1000;
  const control = createMainWindowControl({ platform: 'win32', run: async () => true, now: () => time });
  await control.minimize(marker);
  assert.equal(control.hotkeyReady, false);
  assert.equal(control.marker, marker);
  time += 600;
  assert.equal(control.hotkeyReady, true);
});
test('unsupported OS and malformed markers never invoke native control', async () => {
  let calls = 0;
  const run = async () => { calls++; return true; };
  assert.equal(await createMainWindowControl({ platform: 'darwin', run }).minimize(marker), false);
  assert.equal(await createMainWindowControl({ platform: 'win32', run }).minimize('Chrome'), false);
  assert.equal(calls, 0);
});
test('minimize and restore are serialized and only the tracked marker is restored', async () => {
  const calls = [];
  const control = createMainWindowControl({ platform: 'win32', run: async (...args) => { calls.push(args); return true; } });
  const minimize = control.minimize(marker);
  const restore = control.restore();
  assert.equal(await minimize, true);
  assert.equal(await restore, true);
  assert.deepEqual(calls, [['minimize', marker], ['restore', marker]]);
  assert.equal(control.active, false);
  await control.restore();
  assert.equal(calls.length, 2);
});
test('an uncertain minimize remains recoverable and cannot be replaced by another window', async () => {
  let success = false;
  const control = createMainWindowControl({ platform: 'win32', run: async () => success });
  assert.equal(await control.minimize(marker), false);
  assert.equal(control.active, true);
  assert.equal(await control.minimize('b'.repeat(32)), false);
  assert.equal(await control.restore(), false);
  assert.equal(control.active, true);
  success = true;
  assert.equal(await control.restore(), true);
  assert.equal(control.active, false);
});
