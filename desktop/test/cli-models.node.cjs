const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { codexModelsProtocol, normalizeModels } = require('../cli-models.cjs');
const { createCliAi, validateSettings } = require('../cli-ai.cjs');

test('model catalogs whitelist display metadata, filter hidden/invalid rows and preserve context aliases', () => {
  const result = normalizeModels('claude_cli', [
    { value: 'opus[1m]', displayName: 'Mock Opus', supportedEffortLevels: ['low', 'high', 'high'], accessToken: 'PRIVATE' },
    { value: 'bad;command', displayName: 'bad' }, { value: 'hidden', displayName: 'hidden', hidden: true },
  ]);
  assert.deepEqual(result, [{ value: 'opus[1m]', label: 'Mock Opus', description: '', reasoningEfforts: ['low', 'high'], isDefault: false }]);
  assert.equal(validateSettings({ model: 'opus[1m]' }).model, 'opus[1m]');
  assert.throws(() => validateSettings({ model: 'opus[1m];bad' }));
  assert.throws(() => normalizeModels('codex_cli', []));
  assert.throws(() => normalizeModels('codex_cli', Array(501).fill({})));
});

test('Codex reads every page without a model turn and rejects cursor loops and partial responses', () => {
  const protocol = codexModelsProtocol();
  const requests = []; let ended = false;
  const stdin = { write: line => requests.push(JSON.parse(line)), end: () => { ended = true; } };
  assert.throws(() => protocol.result());
  protocol.onLine(JSON.stringify({ id: 1, result: {} }), stdin);
  protocol.onLine(JSON.stringify({ id: 2, result: { data: [{ model: 'a', displayName: 'A' }], nextCursor: 'page-2' } }), stdin);
  assert.equal(requests[2].params.cursor, 'page-2');
  protocol.onLine(JSON.stringify({ id: 3, result: { data: [{ model: 'b', displayName: 'B' }], nextCursor: null } }), stdin);
  assert.equal(ended, true);
  assert.deepEqual(normalizeModels('codex_cli', protocol.result()).map(row => row.value), ['a', 'b']);
  assert.deepEqual(requests.map(row => row.method), ['initialized', 'model/list', 'model/list']);
  const loop = codexModelsProtocol();
  loop.onLine(JSON.stringify({ id: 1, result: {} }), stdin);
  loop.onLine(JSON.stringify({ id: 2, result: { data: [], nextCursor: 'same' } }), stdin);
  assert.throws(() => loop.onLine(JSON.stringify({ id: 3, result: { data: [], nextCursor: 'same' } }), stdin));
});

test('effort defaults are optional catalogue metadata, accepted only from supported Codex levels', () => {
  const row = { model: 'mock-model', displayName: 'Mock model', supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'high' }], defaultReasoningEffort: 'high' };
  assert.equal(normalizeModels('codex_cli', [row])[0].defaultReasoningEffort, 'high');
  for (const invalid of ['ultra', 'bad\nvalue', 42, undefined]) {
    assert.equal(normalizeModels('codex_cli', [{ ...row, defaultReasoningEffort: invalid }])[0].defaultReasoningEffort, undefined);
  }
  assert.equal(normalizeModels('codex_cli', [{ ...row, supportedReasoningEfforts: {} }])[0].defaultReasoningEffort, undefined);
  assert.equal(normalizeModels('claude_cli', [{ ...row, value: 'mock-model', supportedEffortLevels: ['high'] }])[0].defaultReasoningEffort, undefined);
});

function fixture(t, supportedModels, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coffeetide-model-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let closed = 0, sent = 0, sdkOptions;
  const ai = createCliAi({ defaultDirectory: directory, resolve: () => '/test/claude',
    loadClaudeSdk: async () => ({ query: ({ prompt, options }) => {
      sdkOptions = options;
      void prompt[Symbol.asyncIterator]().next().then(message => { if (!message.done) sent++; });
      return { supportedModels, close: () => { closed++; } };
    } }), ...options,
  });
  t.after(() => ai.close());
  return { ai, inspect: () => ({ closed, sent, sdkOptions }) };
}

test('Claude uses the configured binary, no input turn, safe mode and no persistence', async t => {
  const { ai, inspect } = fixture(t, async () => [{ value: 'sonnet', displayName: 'Mock Sonnet' }]);
  const result = await ai.models('claude_cli');
  assert.equal(result.models[0].value, 'sonnet');
  assert.equal(result.source, 'claude-agent-sdk');
  assert.equal(ai.status('claude_cli').verifiedAt, null);
  const { closed, sent, sdkOptions } = inspect();
  assert.equal(closed, 1); assert.equal(sent, 0);
  assert.equal(sdkOptions.pathToClaudeCodeExecutable, '/test/claude');
  assert.equal(sdkOptions.persistSession, false);
  assert.deepEqual(sdkOptions.extraArgs, { 'safe-mode': null });
  assert.deepEqual(sdkOptions.tools, []);
});

test('model queries are exclusive, cancelable, bounded and never leak raw provider errors', async t => {
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = fixture(t, () => { started(); return new Promise(() => {}); });
  const request = pending.ai.models('claude_cli');
  await ready;
  await assert.rejects(pending.ai.models('codex_cli'), /답변 중/);
  assert.throws(() => pending.ai.configure('claude_cli', {}), /답변 중/);
  pending.ai.cancel(); await assert.rejects(request, /취소/);
  assert.ok(pending.inspect().closed > 0);
  const timed = fixture(t, () => new Promise(() => {}), { modelTimeoutMs: 20 });
  await assert.rejects(timed.ai.models('claude_cli'), /시간/);
  const failed = fixture(t, async () => { throw new Error('PRIVATE_PROVIDER_ERROR'); });
  await assert.rejects(failed.ai.models('claude_cli'), error => !error.message.includes('PRIVATE') && error.message.includes('모델 목록'));
});
