const { execFile } = require('node:child_process');
const path = require('node:path');
function runNative(action, marker) {
  return new Promise(resolve => {
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    execFile(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'native', 'main-window.ps1'), '-Action', action, '-Marker', marker], { windowsHide: true, timeout: 8000, maxBuffer: 4096 }, (error, stdout) => {
      try { resolve(!error && JSON.parse(stdout.trim()).ok === true); } catch { resolve(false); }
    });
  });
}
function createMainWindowControl({ platform = process.platform, run = runNative, now = Date.now } = {}) {
  let marker = null;
  let minimizedAt = 0;
  let queue = Promise.resolve();
  const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
  return {
    get active() { return marker !== null; },
    get marker() { return marker; },
    get hotkeyReady() { return now() - minimizedAt >= 600; },
    minimize(value) { return serial(async () => {
      if (platform !== 'win32' || !/^[a-f0-9]{32}$/.test(value || '')) return false;
      if (marker && marker !== value) return false;
      marker = value;
      minimizedAt = now();
      const ok = await run('minimize', marker);
      // 실패해도 타임아웃 직후 최소화됐을 수 있어 복원 대상으로 보존한다.
      return ok;
    }); },
    restore() { return serial(async () => {
      if (!marker) return true;
      const ok = await run('restore', marker);
      if (ok) marker = null;
      return ok;
    }); },
  };
}
module.exports = { createMainWindowControl };
