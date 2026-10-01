const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { claudeAccount, codexAccount, codexAccountProtocol, usageFor } = require('./cli-account.cjs');
const { MODEL_ID, normalizeModels, codexModelsProtocol, claudeModels } = require('./cli-models.cjs');

const PROVIDERS = ['claude_cli', 'codex_cli'];
const MAX_OUTPUT = 1024 * 1024;
class CliAiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function validateSettings(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CliAiError('AI 설정 형식이 올바르지 않습니다.');
  const result = {};
  for (const key of ['executablePath', 'workingDirectory', 'model']) {
    const text = value[key] ?? '';
    if (typeof text !== 'string' || text.length > (key === 'model' ? 100 : 1024) || /[\x00-\x1f\x7f]/.test(text)) {
      throw new CliAiError('실행 경로·작업 폴더·모델 설정을 확인해 주세요.');
    }
    result[key] = text.trim();
  }
  if (result.model && !MODEL_ID.test(result.model)) throw new CliAiError('모델 이름에 허용되지 않은 문자가 있습니다.');
  return result;
}

function resolveExecutable(provider, explicit, { platform = process.platform, env = process.env } = {}) {
  if (!PROVIDERS.includes(provider)) throw new CliAiError('지원하지 않는 터미널 AI입니다.');
  const name = provider === 'claude_cli' ? 'claude' : 'codex';
  const candidates = [];
  if (explicit) {
    if (!path.isAbsolute(explicit) || (platform === 'win32' && !/\.exe$/i.test(explicit))) {
      throw new CliAiError('네이티브 실행 파일의 절대 경로를 지정해 주세요. Windows에서는 .exe 파일만 지원합니다.');
    }
    candidates.push(explicit);
  } else {
    if (platform === 'win32') {
      const user = env.USERPROFILE || '';
      if (user) candidates.push(path.join(user, '.local', 'bin', `${name}.exe`));
      const dirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
      if (env.APPDATA) dirs.push(path.join(env.APPDATA, 'npm'));
      for (const dir of [...new Set(dirs)]) {
        candidates.push(path.join(dir, `${name}.exe`));
        if (name === 'claude') candidates.push(path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));
        else for (const arch of ['x64', 'arm64']) {
          const triple = arch === 'x64' ? 'x86_64-pc-windows-msvc' : 'aarch64-pc-windows-msvc';
          const relative = ['@openai', `codex-win32-${arch}`, 'vendor', triple, 'bin', 'codex.exe'];
          candidates.push(path.join(dir, 'node_modules', '@openai', 'codex', 'node_modules', ...relative));
          candidates.push(path.join(dir, 'node_modules', ...relative));
        }
      }
    } else {
      for (const dir of (env.PATH || '').split(path.delimiter).filter(Boolean)) candidates.push(path.join(dir, name));
    }
  }
  for (const candidate of candidates) {
    try { if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate); } catch {}
  }
  throw new CliAiError(`${name === 'claude' ? 'Claude Code' : 'Codex CLI'} 실행 파일을 찾지 못했습니다. 설치하거나 실행 파일 경로를 지정해 주세요.`, 503);
}

function buildArguments(provider, model = '') {
  if (!PROVIDERS.includes(provider)) throw new CliAiError('지원하지 않는 터미널 AI입니다.');
  const args = provider === 'claude_cli'
    ? ['-p', '--output-format', 'json', '--no-session-persistence', '--safe-mode', '--tools', '', '--disallowedTools', 'mcp__*', '--permission-mode', 'dontAsk']
    : ['exec', '--json', '--sandbox', 'read-only', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '-c', 'approval_policy="never"'];
  if (model) args.push('--model', model);
  if (provider === 'codex_cli') args.push('-');
  return args;
}

function outputError(text) {
  if (/auth|log.?in|sign.?in|oauth|credential|API.?key/i.test(text)) return new CliAiError('CLI 로그인 상태를 확인해 주세요. 일반 터미널에서 로그인한 뒤 다시 보내 주세요.', 502);
  if (/quota|rate.?limit|usage.?limit|credit|billing|429/i.test(text)) return new CliAiError('선택한 CLI의 사용 한도 또는 결제 상태를 확인해 주세요.', 502);
  if (/unknown.*(option|argument)|unexpected argument|unrecognized|invalid.*flag/i.test(text)) return new CliAiError('설치된 CLI가 필요한 실행 옵션을 지원하지 않습니다. CLI를 업데이트해 주세요.', 502);
  return new CliAiError('터미널 AI 요청에 실패했습니다. CLI 로그인·모델 설정과 터미널에서의 실행 상태를 확인해 주세요.', 502);
}

function parseReply(provider, stdout) {
  if (provider === 'claude_cli') {
    let value;
    try { value = JSON.parse(stdout.trim()); } catch { throw new CliAiError('Claude Code 응답이 올바른 JSON 형식이 아닙니다.', 502); }
    if (value.is_error || (value.subtype && value.subtype !== 'success')) throw outputError(`${value.result || ''} ${JSON.stringify(value.errors || [])}`);
    if (typeof value.result !== 'string' || !value.result.trim()) throw new CliAiError('Claude Code가 답변을 반환하지 않았습니다.', 502);
    return { answer: value.result.trim(), model: typeof value.model === 'string' ? value.model : undefined };
  }
  let answer = '';
  let completed = false;
  for (const line of stdout.split(/\r?\n/).filter(line => line.trim())) {
    let event;
    try { event = JSON.parse(line); } catch { throw new CliAiError('Codex CLI 응답이 올바른 JSONL 형식이 아닙니다.', 502); }
    if (event.type === 'turn.failed' || event.type === 'error') throw outputError(event.message || event.error?.message || '');
    if (event.type === 'turn.completed') completed = true;
    if (event.type === 'item.completed' && event.item?.type === 'agent_message' && typeof event.item.text === 'string') answer = event.item.text.trim();
  }
  if (!completed || !answer) throw new CliAiError('Codex CLI가 완료된 답변을 반환하지 않았습니다.', 502);
  return { answer };
}

function createCliAi({ defaultDirectory, settings = {}, save = () => {}, onStatus = () => {}, spawnProcess = spawn, timeoutMs = 120000, modelTimeoutMs = 15000, loadClaudeSdk, resolve = resolveExecutable, platform = process.platform, env = process.env }) {
  fs.mkdirSync(defaultDirectory, { recursive: true });
  const configs = {};
  for (const provider of PROVIDERS) {
    try { configs[provider] = validateSettings(settings[provider]); } catch { configs[provider] = validateSettings(); }
  }
  let active = null;
  let operation = null;
  const statuses = {};
  const snapshot = provider => {
    config(provider);
    const status = statuses[provider] || { provider, account: { loggedIn: null }, checkedAt: null, verifiedAt: null };
    return { ...status, usage: usageFor(provider, status.account) };
  };
  const updateStatus = (provider, next) => {
    statuses[provider] = { ...snapshot(provider), ...next };
    onStatus(snapshot(provider));
    return snapshot(provider);
  };
  const exclusive = async (provider, id, work) => {
    config(provider);
    if (operation || active) throw new CliAiError('터미널 AI가 답변 중입니다. 완료하거나 취소한 뒤 다시 보내 주세요.', 409);
    const owned = { id, cancelled: false };
    operation = owned;
    try { return await work(); } finally { if (operation === owned) operation = null; }
  };
  const config = (provider) => {
    if (!PROVIDERS.includes(provider)) throw new CliAiError('지원하지 않는 터미널 AI입니다.');
    return { ...configs[provider], defaultDirectory };
  };
  const execution = (provider) => {
    const current = config(provider);
    const cwd = current.workingDirectory || defaultDirectory;
    if (!path.isAbsolute(cwd)) throw new CliAiError('작업 폴더는 절대 경로로 지정해 주세요.');
    try { if (!fs.statSync(cwd).isDirectory()) throw new Error(); } catch { throw new CliAiError('작업 폴더가 존재하지 않습니다.'); }
    return { executable: resolve(provider, current.executablePath), cwd, model: current.model };
  };
  const cancel = (requestId) => {
    if (operation && (!requestId || operation.id === requestId)) {
      operation.cancelled = true;
      active?.abort(new CliAiError('터미널 AI 요청을 취소했습니다.', 409));
      return true;
    }
    if (!active || (requestId && active.id !== requestId)) return false;
    active.abort(new CliAiError('터미널 AI 요청을 취소했습니다.', 409));
    return true;
  };
  const run = (requestId, executable, args, cwd, input, limit, protocol, acceptedCodes = [0]) => {
    if (operation?.cancelled) throw new CliAiError('터미널 AI 요청을 취소했습니다.', 409);
    if (active) throw new CliAiError('터미널 AI가 답변 중입니다. 완료하거나 취소한 뒤 다시 보내 주세요.', 409);
    return new Promise((resolveRun, reject) => {
      let child, timer, settled = false, stopping = false, stdout = '', stderr = '', bytes = 0;
      let failure = null, pending = '';
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (active?.id === requestId) active = null;
        if (error) reject(error); else resolveRun(stdout);
      };
      const stop = (error) => {
        if (stopping || settled) return;
        stopping = true;
        failure = error;
        if (child?.pid && platform === 'win32') {
          try {
            const killer = spawnProcess(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
            killer.once('error', () => { child.kill(); });
            killer.once('close', code => { if (code !== 0 && !settled) child.kill(); });
          } catch { child.kill(); }
        } else if (child?.pid && platform !== 'win32') {
          try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        } else child?.kill();
      };
      active = { id: requestId, abort: stop };
      try {
        child = spawnProcess(executable, args, { cwd, shell: false, windowsHide: true, detached: platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', text => {
          bytes += Buffer.byteLength(text);
          if (bytes > MAX_OUTPUT) { stop(new CliAiError('터미널 AI 출력 크기가 제한을 초과했습니다.', 502)); return; }
          stdout += text;
          if (protocol && !stopping) {
            pending += text;
            const lines = pending.split('\n'); pending = lines.pop();
            try { for (const line of lines) protocol.onLine(line, child.stdin); }
            catch { stop(new CliAiError('CLI 정보를 조회하지 못했습니다. CLI를 업데이트하거나 터미널에서 로그인 상태를 확인해 주세요.', 502)); }
          }
        });
        child.stderr.on('data', text => {
          bytes += Buffer.byteLength(text);
          if (bytes > MAX_OUTPUT) stop(new CliAiError('터미널 AI 출력 크기가 제한을 초과했습니다.', 502));
          else stderr = (stderr + text).slice(-4000);
        });
        child.once('error', () => finish(new CliAiError('AI 실행 파일을 시작하지 못했습니다. 실행 권한과 경로를 확인해 주세요.', 503)));
        child.once('close', code => finish(failure || (!acceptedCodes.includes(code) ? outputError(`${stderr}\n${stdout}`) : null)));
        child.stdin.on('error', () => stop(new CliAiError('터미널 AI에 질문을 전달하지 못했습니다.', 502)));
        timer = setTimeout(() => stop(new CliAiError('터미널 AI 응답 시간이 초과되었습니다. 다시 보내 주세요.', 504)), limit);
        if (protocol) child.stdin.write(JSON.stringify(protocol.initial) + '\n');
        else child.stdin.end(input, 'utf8');
      } catch { finish(new CliAiError('AI 실행 파일을 시작하지 못했습니다.', 503)); }
    });
  };
  const readAccount = async (provider, requestId) => {
    try {
      const { executable, cwd } = execution(provider);
      let account;
      if (provider === 'claude_cli') {
        account = claudeAccount(JSON.parse(await run(requestId, executable, ['auth', 'status'], cwd, '', 15000, undefined, [0, 1])));
      } else {
        const protocol = codexAccountProtocol();
        await run(requestId, executable, ['app-server', '--listen', 'stdio://', '-c', 'model_provider="openai"'], cwd, '', 15000, protocol);
        account = codexAccount(protocol.result(), Boolean(env.CODEX_API_KEY));
      }
      const previous = snapshot(provider);
      const sameAccount = JSON.stringify(previous.account) === JSON.stringify(account);
      return updateStatus(provider, { account, checkedAt: new Date().toISOString(), verifiedAt: sameAccount ? previous.verifiedAt : null, lastError: sameAccount ? previous.lastError : undefined });
    } catch (error) {
      if (operation?.cancelled) throw error;
      return updateStatus(provider, { account: { loggedIn: null }, checkedAt: new Date().toISOString(), verifiedAt: null, lastError: '계정 정보를 확인하지 못했습니다. 일반 터미널에서 로그인 상태를 확인해 주세요.' });
    }
  };
  return {
    config,
    models: (provider) => exclusive(provider, `models-${Date.now()}`, async () => {
      const requestId = operation.id;
      try {
        const { executable, cwd } = execution(provider);
        let rows;
        if (provider === 'claude_cli') {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(new CliAiError('모델 목록 조회 시간이 초과되었습니다. 다시 시도해 주세요.', 504)), modelTimeoutMs);
          active = { id: requestId, abort: error => controller.abort(error) };
          try { rows = await claudeModels({ executable, cwd, signal: controller.signal, loadSdk: loadClaudeSdk }); }
          finally { clearTimeout(timeout); if (active?.id === requestId) active = null; }
        } else {
          const protocol = codexModelsProtocol();
          await run(requestId, executable, ['app-server', '--listen', 'stdio://', '-c', 'model_provider="openai"'], cwd, '', modelTimeoutMs, protocol);
          rows = protocol.result();
        }
        if (operation.cancelled) throw new CliAiError('모델 목록 조회를 취소했습니다.', 409);
        return { provider, models: normalizeModels(provider, rows), source: provider === 'claude_cli' ? 'claude-agent-sdk' : 'codex-app-server', checkedAt: new Date().toISOString() };
      } catch (error) {
        if (error instanceof CliAiError) throw error;
        throw new CliAiError('모델 목록을 조회하지 못했습니다. CLI를 업데이트하거나 로그인 상태를 확인해 주세요. 모델 이름을 직접 입력할 수도 있습니다.', 502);
      }
    }),
    status: (provider, refresh = false) => refresh ? exclusive(provider, `account-${Date.now()}`, () => readAccount(provider, operation.id)) : snapshot(provider),
    configure(provider, value) {
      if (active || operation) throw new CliAiError('답변 중에는 실행 설정을 변경할 수 없습니다.', 409);
      config(provider);
      const next = validateSettings(value);
      const old = configs[provider];
      configs[provider] = next;
      try { execution(provider); save({ ...configs }); } catch (error) { configs[provider] = old; throw error; }
      if (JSON.stringify(old) !== JSON.stringify(next)) { delete statuses[provider]; onStatus(snapshot(provider)); }
      return config(provider);
    },
    async check(provider) {
      return exclusive(provider, `check-${Date.now()}`, async () => {
        const { executable, cwd } = execution(provider);
        const version = (await run(operation.id, executable, ['--version'], cwd, '', 10000)).trim();
        if (!version || version.length > 200) throw new CliAiError('CLI 버전 확인에 실패했습니다.', 502);
        return { provider, executable, version, installed: true };
      });
    },
    async chat({ provider, requestId, prompt }) {
      if (typeof requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestId) || typeof prompt !== 'string' || !prompt.trim() || prompt.includes('\0') || Buffer.byteLength(prompt) > 48000) {
        throw new CliAiError('질문 형식 또는 크기를 확인해 주세요.');
      }
      return exclusive(provider, requestId, async () => {
        try {
          const startedAt = Date.now();
          const { executable, cwd, model } = execution(provider);
          await readAccount(provider, requestId);
          const stdout = await run(requestId, executable, buildArguments(provider, model), cwd, prompt, Math.max(1, timeoutMs - (Date.now() - startedAt)));
          const reply = parseReply(provider, stdout);
          const status = updateStatus(provider, { verifiedAt: new Date().toISOString(), lastError: undefined });
          return { ...reply, provider, requestId, status, ...(model ? { model } : {}) };
        } catch (error) {
          updateStatus(provider, { lastError: error instanceof CliAiError ? error.message : '터미널 AI 요청에 실패했습니다.' });
          throw error;
        }
      });
    },
    cancel,
    close: () => cancel(),
  };
}

module.exports = { createCliAi, CliAiError, resolveExecutable, buildArguments, parseReply, validateSettings };
