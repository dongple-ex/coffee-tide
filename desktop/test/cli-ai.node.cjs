const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCliAi, resolveExecutable, buildArguments, parseReply, validateSettings } = require('../cli-ai.cjs');
const { claudeAccount, codexAccount, codexAccountProtocol, usageFor } = require('../cli-account.cjs');

function fixture(t, behavior, options = {}) {
  const { authResponse = () => ({ loggedIn: true, authMethod: 'claude.ai', email: 'test@example.invalid', subscriptionType: 'max' }), ...aiOptions } = options;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coffeetide-cli-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = [];
  const ai = createCliAi({ defaultDirectory: dir, platform: 'linux', resolve: () => '/registered/claude', timeoutMs: 1000, spawnProcess: (executable, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    let input = '';
    child.stdin = new Writable({ write(chunk, _encoding, next) { input += chunk.toString(); next(); } });
    child.kill = () => { setImmediate(() => child.emit('close', 1)); return true; };
    calls.push({ executable, args, opts, child });
    child.stdin.once('finish', () => { setImmediate(() => {
      if (args[0] === 'auth') { const account = authResponse(); child.stdout.end(JSON.stringify(account)); child.emit('close', account.loggedIn ? 0 : 1); }
      else behavior(child, input, args);
    }); });
    return child;
  }, ...aiOptions });
  t.after(() => ai.close());
  return { ai, calls, dir };
}
const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

test('prompt is sent only through stdin without a shell, with bounded tools and no persistent session', async (t) => {
  const question = '한국어 질문; $(Get-Content secret) & "quoted"';
  const { ai, calls } = fixture(t, (child, input) => {
    assert.equal(input, question);
    child.stdout.end(JSON.stringify({ type: 'result', subtype: 'success', result: '한글 답변 ☕' }));
    child.emit('close', 0);
  });
  assert.equal((await ai.chat({ provider: 'claude_cli', requestId: id, prompt: question })).answer, '한글 답변 ☕');
  const call = calls.find(call => call.args.includes('-p'));
  assert.equal(call.opts.shell, false);
  assert.equal(call.opts.windowsHide, true);
  assert.equal(call.opts.cwd.length > 0, true);
  assert.ok(!call.args.includes(question));
  assert.ok(call.args.includes('--safe-mode'));
  assert.ok(call.args.includes('--no-session-persistence'));
  assert.ok(call.args.includes('mcp__*'));
  assert.ok(!call.args.includes('--bare'));
});

test('Codex reads only final assistant output and rejects failed or unfinished turns', () => {
  const events = [{ type: 'item.completed', item: { type: 'reasoning', text: 'private reasoning' } }, { type: 'item.completed', item: { type: 'command_execution', output: 'logs' } }, { type: 'item.completed', item: { type: 'agent_message', text: '완료 답변' } }, { type: 'turn.completed' }];
  assert.equal(parseReply('codex_cli', events.map(event => JSON.stringify(event)).join('\n')).answer, '완료 답변');
  assert.throws(() => parseReply('codex_cli', JSON.stringify(events[2])));
  assert.throws(() => parseReply('codex_cli', JSON.stringify({ type: 'turn.failed', error: { message: 'not logged in' } })), /로그인/);
  assert.throws(() => parseReply('claude_cli', JSON.stringify({ is_error: true, result: 'quota exceeded' })), /한도/);
  assert.throws(() => parseReply('claude_cli', 'text log'));
  const args = buildArguments('codex_cli');
  assert.ok(args.includes('read-only'));
  assert.ok(args.includes('--ignore-user-config'));
  assert.ok(args.includes('--ephemeral'));
  assert.ok(!args.some(arg => arg.includes('bypass')));
});

test('only validated provider, paths, model and request data can execute', async (t) => {
  const { ai, calls } = fixture(t, () => {});
  assert.throws(() => validateSettings({ model: 'model; rm x' }));
  assert.throws(() => validateSettings({ executablePath: 'C:\\a\n.exe' }));
  assert.throws(() => resolveExecutable('claude_cli', 'claude.cmd', { platform: 'win32' }));
  assert.throws(() => ai.configure('unknown', {}));
  await assert.rejects(ai.chat({ provider: 'claude_cli', requestId: id, prompt: 'x'.repeat(48001) }));
  await assert.rejects(ai.chat({ provider: 'claude_cli', requestId: 'bad', prompt: 'hi' }));
  assert.equal(calls.length, 0);
});

test('only the owned request can cancel and the next request waits for process exit', async (t) => {
  const { ai, calls } = fixture(t, () => {});
  const result = ai.chat({ provider: 'claude_cli', requestId: id, prompt: 'hi' });
  assert.equal(ai.cancel('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'), false);
  await assert.rejects(ai.chat({ provider: 'claude_cli', requestId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', prompt: 'hi' }), /답변 중/);
  assert.equal(ai.cancel(id), true);
  await assert.rejects(result, /취소/);
  assert.equal(calls.length, 1);
  assert.equal(ai.cancel(id), false);
});

test('deadline and oversized output terminate rather than returning partial answers', async (t) => {
  const timeout = fixture(t, () => {}, { timeoutMs: 20 });
  await assert.rejects(timeout.ai.chat({ provider: 'claude_cli', requestId: id, prompt: 'hi' }), /시간/);
  const output = fixture(t, child => { child.stdout.write('x'.repeat(1024 * 1024 + 1)); });
  await assert.rejects(output.ai.chat({ provider: 'claude_cli', requestId: id, prompt: 'hi' }), /출력 크기/);
});

test('configuration persists paths only and install check does not request inference', async (t) => {
  let saved;
  const { ai, calls, dir } = fixture(t, (child, _input, args) => {
    assert.deepEqual(args, ['--version']);
    child.stdout.end('2.1.286 (Claude Code)'); child.emit('close', 0);
  }, { save: value => { saved = value; } });
  ai.configure('claude_cli', { workingDirectory: dir, model: 'sonnet' });
  assert.deepEqual(saved.claude_cli, { executablePath: '', workingDirectory: dir, model: 'sonnet' });
  assert.equal((await ai.check('claude_cli')).installed, true);
  assert.equal(calls.length, 1);
});

test('account metadata is whitelisted and API-key mode never shows a stored subscription identity', () => {
  const raw = { loggedIn: true, authMethod: 'claude.ai', email: 'test@example.invalid', subscriptionType: 'max', accessToken: 'SECRET', refreshToken: 'SECRET', orgId: 'private-id', orgName: 'Example' };
  assert.deepEqual(claudeAccount(raw), { loggedIn: true, authMethod: 'Claude 구독', email: raw.email, plan: 'max', organization: 'Example' });
  assert.deepEqual(claudeAccount({ ...raw, authMethod: 'api_key' }), { loggedIn: true, authMethod: 'API 키' });
  assert.equal(claudeAccount({ ...raw, email: 'test\n@example.invalid' }).email, undefined);
  assert.deepEqual(codexAccount({ account: { type: 'chatgpt', email: raw.email, planType: 'pro', accessToken: 'SECRET' } }, true), { loggedIn: true, authMethod: 'API 키' });
  assert.equal(usageFor('codex_cli', { authMethod: 'API 키' }).url, 'https://platform.openai.com/usage');
});

test('account refresh never marks inference successful, and changing login or settings clears old success', async (t) => {
  let email = 'first@example.invalid';
  let unavailable = false;
  let saved;
  const { ai, calls } = fixture(t, child => { child.stdout.end(JSON.stringify({ result: 'Mock answer', subtype: 'success' })); child.emit('close', 0); }, {
    authResponse: () => unavailable ? {} : ({ loggedIn: true, authMethod: 'claude.ai', email }), save: value => { saved = value; },
  });
  const before = await ai.status('claude_cli', true);
  assert.equal(before.account.email, email);
  assert.equal(before.verifiedAt, null);
  assert.equal(calls.length, 1);
  const reply = await ai.chat({ provider: 'claude_cli', requestId: id, prompt: 'Mock question' });
  assert.ok(reply.status.verifiedAt);
  email = 'second@example.invalid';
  const after = await ai.status('claude_cli', true);
  assert.equal(after.account.email, email);
  assert.equal(after.verifiedAt, null);
  unavailable = true;
  const unknown = await ai.status('claude_cli', true);
  assert.equal(unknown.account.email, undefined);
  assert.equal(unknown.account.loggedIn, null);
  assert.ok(unknown.lastError);
  ai.configure('claude_cli', { model: 'sonnet' });
  assert.equal(ai.status('claude_cli').account.email, undefined);
  assert.ok(!JSON.stringify(saved).includes('example.invalid'));
});

test('logged-out auth status is handled explicitly even with CLI exit code one', async (t) => {
  const { ai } = fixture(t, () => {}, { authResponse: () => ({ loggedIn: false, authMethod: 'none' }) });
  const status = await ai.status('claude_cli', true);
  assert.equal(status.account.loggedIn, false);
  assert.equal(status.verifiedAt, null);
});

test('Codex account protocol initializes then reads account only, with no model turn', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coffeetide-codex-account-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const methods = [];
  const ai = createCliAi({ defaultDirectory: dir, platform: 'linux', env: {}, resolve: () => '/registered/codex', spawnProcess: (_exe, args, options) => {
    assert.equal(args[0], 'app-server');
    assert.equal(options.shell, false);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { setImmediate(() => child.emit('close', 1)); };
    child.stdin = new Writable({ write(chunk, _enc, next) {
      const message = JSON.parse(chunk.toString()); methods.push(message.method); next();
      if (message.method === 'initialize') setImmediate(() => child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n'));
      if (message.method === 'account/read') setImmediate(() => {
        const response = JSON.stringify({ id: 2, result: { account: { type: 'chatgpt', email: 'codex@example.invalid', planType: 'pro', token: 'SECRET' } } }) + '\n';
        child.stdout.write(response.slice(0, 10)); child.stdout.write(response.slice(10));
      });
    }, final(next) { next(); setImmediate(() => child.emit('close', 0)); } });
    return child;
  } });
  t.after(() => ai.close());
  const status = await ai.status('codex_cli', true);
  assert.deepEqual(methods, ['initialize', 'initialized', 'account/read']);
  assert.equal(status.account.email, 'codex@example.invalid');
  assert.ok(!JSON.stringify(status).includes('SECRET'));
  assert.equal(status.verifiedAt, null);
  const protocol = codexAccountProtocol();
  assert.throws(() => protocol.onLine(JSON.stringify({ id: 1, error: {} }), {}));
});
