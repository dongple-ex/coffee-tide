const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const { startLeftShiftHotkey } = require('../hotkey.cjs');

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kills: 0, kill() { this.kills++; },
  });
}

test('helper protocol handles chunked messages, ignores input before ready and cleans up', () => {
  const child = fakeChild();
  const statuses = [];
  let calls = 0;
  const stop = startLeftShiftHotkey({ platform: 'win32', onTrigger: () => calls++, onStatus: s => statuses.push(s), spawnProcess: (_exe, args, options) => {
    assert.ok(args.includes('-NoProfile'));
    assert.equal(options.windowsHide, true);
    return child;
  } });
  child.stdout.write('left-shift-double-tap\n');
  assert.equal(calls, 0);
  child.stdout.write('rea'); child.stdout.write('dy\r\nleft-shift-'); child.stdout.write('double-tap\r\nunknown\n');
  assert.deepEqual(statuses, ['ready']);
  assert.equal(calls, 1);
  stop(); stop();
  child.stdout.write('left-shift-double-tap\n');
  assert.equal(calls, 1);
  assert.equal(child.kills, 1);
  assert.equal(child.stdin.writableEnded, true);
});

test('helper failure is reported and unsupported platforms do not spawn', () => {
  const child = fakeChild();
  const statuses = [];
  startLeftShiftHotkey({ platform: 'win32', onTrigger: () => assert.fail(), onStatus: s => statuses.push(s), spawnProcess: () => child });
  child.emit('error', new Error('launch failed'));
  assert.deepEqual(statuses, ['failed']);
  assert.equal(child.kills, 1);
  startLeftShiftHotkey({ platform: 'darwin', onTrigger: () => assert.fail(), onStatus: s => statuses.push(s), spawnProcess: () => assert.fail() });
  assert.equal(statuses.at(-1), 'unsupported');
});

test('Windows detector accepts only two clean left Shift taps', { skip: process.platform !== 'win32' }, () => {
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, '../native/left-shift.ps1'), '-TestOnly'], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /gesture-checks-passed/);
});

test('Windows hook becomes ready and exits when its parent pipe closes', { skip: process.platform !== 'win32', timeout: 15000 }, async (t) => {
  let child;
  let errors = '';
  let stop;
  const ready = new Promise((resolve, reject) => {
    stop = startLeftShiftHotkey({ onTrigger: () => {}, onStatus: status => {
      if (status === 'ready') resolve();
      if (status === 'failed') reject(new Error(errors || 'Native helper failed'));
    }, spawnProcess: (...args) => {
      child = spawn(...args);
      child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
      return child;
    } });
  });
  t.after(() => { stop(); child.kill(); });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  await ready;
  child.stdin.end();
  assert.deepEqual(await exited, { code: 0, signal: null }, errors);
});
