const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCliAi, resolveExecutable, buildArguments, parseReply, validateSettings } = require('../cli-ai.cjs');

function fixture(t, behavior, options = {}) {
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
    child.stdin.once('finish', () => { setImmediate(() => behavior(child, input, args)); });
    return child;
  }, ...options });
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
  const call = calls[0];
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
