const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');

function startLeftShiftHotkey({ onTrigger, onStatus = () => {}, spawnProcess = spawn, platform = process.platform }) {
  if (platform !== 'win32') { onStatus('unsupported'); return () => {}; }
  let stopped = false;
  let ready = false;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawnProcess(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'native', 'left-shift.ps1')], {
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout });
  const timeout = setTimeout(() => { onStatus('failed'); stop(); }, 15000);
  timeout.unref?.();
  child.stdin.on('error', () => {}); // A failed helper may close stdin first.
  child.stderr.on('data', () => {}); // Never log raw input or unbounded helper output.
  lines.on('line', (line) => {
    if (stopped) return;
    if (line === 'ready') { ready = true; clearTimeout(timeout); onStatus('ready'); }
    if (ready && line === 'left-shift-double-tap') onTrigger();
  });
  child.on('error', () => { if (!stopped) { onStatus('failed'); stop(); } });
  child.on('exit', () => {
    clearTimeout(timeout);
    if (!stopped) onStatus('failed');
    stopped = true;
    lines.close();
  });
  function stop() {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    lines.close();
    child.stdin.end();
    // End immediately on normal app shutdown; EOF handles an unexpected crash.
    child.kill();
  }
  return stop;
}

module.exports = { startLeftShiftHotkey };
