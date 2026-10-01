const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { appOrigin, cleanState, createBridge } = require('../bridge.cjs');
const { openConversation } = require('../navigation.cjs');
const origin = 'http://localhost:3000';
test('native restore identifies its mini session and is delivered only once', async (t) => {
  const { bridge, post } = await fixture(t);
  const { token } = await (await post('pair', { code: bridge.code })).json();
  bridge.queueAction('restore-web-main', 'a'.repeat(32));
  assert.deepEqual(await (await post('state', {}, token)).json(), { action: 'restore-web-main', actionMarker: 'a'.repeat(32) });
  assert.deepEqual(await (await post('state', {}, token)).json(), { action: null });
});

test('window commands require pairing, exact origin and validated actions', async (t) => {
  const calls = [];
  const { bridge, post } = await fixture(t, { windowControl: true, onWindow: async (...args) => { calls.push(args); return true; } });
  const command = { action: 'minimize', marker: 'a'.repeat(32) };
  assert.equal((await post('window', command)).status, 401);
  const paired = await (await post('pair', { code: bridge.code })).json();
  assert.equal(paired.windowControl, true);
  assert.equal((await post('window', command, paired.token, 'https://untrusted.example')).status, 403);
  assert.equal((await post('window', { action: 'close' }, paired.token)).status, 400);
  assert.equal((await post('window', { action: 'minimize', marker: 'Chrome' }, paired.token)).status, 400);
  assert.deepEqual(calls, []);
  assert.equal((await post('window', command, paired.token)).status, 200);
  assert.deepEqual(calls, [['minimize', command.marker]]);
  await post('disconnect', {}, paired.token);
  assert.equal((await post('window', { action: 'restore' }, paired.token)).status, 401);
});

async function fixture(t, options = {}) {
  const bridge = createBridge({ origin, port: 0, ...options });
  const port = await bridge.listen();
  t.after(() => bridge.close());
  const post = (route, data, token, from = origin) => fetch(`http://127.0.0.1:${port}/${route}`, {
    method: 'POST', headers: { Origin: from, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data),
  });
  return { bridge, port, post };
}

test('native chat round trips through the paired web and retains a request until its reply arrives', async t => {
  const { bridge, post } = await fixture(t);
  const { token } = await (await post('pair', { code: bridge.code })).json();
  const request = { requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', text: '샘플 질문', history: [], mode: 'talk' };
  await assert.rejects(bridge.requestChat(request), /새로고침/);
  await post('state', { desktopChat: true }, token);
  const pending = bridge.requestChat(request);
  await assert.rejects(bridge.requestChat(request), /이전 질문/);
  bridge.queueAction('order-coffee');
  const first = await (await post('state', { desktopChat: true }, token)).json();
  assert.equal(first.action, 'order-coffee');
  assert.deepEqual(first.chatRequest, request);
  assert.deepEqual((await (await post('state', { desktopChat: true }, token)).json()).chatRequest, request);
  const result = { requestId: request.requestId, answer: 'Mock 웹 AI 답변' };
  assert.equal((await post('chat/result', result)).status, 401);
  assert.equal((await post('chat/result', result, token, 'http://localhost:3001')).status, 403);
  assert.equal((await post('chat/result', { ...result, requestId: 'other' }, token)).status, 409);
  assert.equal((await post('chat/result', { ...result, answer: '' }, token)).status, 400);
  assert.equal((await post('chat/result', result, token)).status, 200);
  assert.deepEqual(await pending, { answer: result.answer });
  assert.equal((await post('chat/result', result, token)).status, 409);
  assert.equal((await (await post('state', { desktopChat: true }, token)).json()).chatRequest, undefined);
});

test('native chat bounds history and rejects old results after a persona change or re-pairing', async t => {
  const { bridge, post } = await fixture(t);
  const { token } = await (await post('pair', { code: bridge.code })).json();
  const snapshot = { desktopChat: true, presetId: 'karina', aiProvider: 'default' };
  await post('state', snapshot, token);
  const request = { requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', text: '샘플 질문', history: Array.from({ length: 20 }, () => ({ role: 'user', text: '가'.repeat(1500) })), mode: 'work' };
  await assert.rejects(bridge.requestChat({ ...request, text: '가'.repeat(6001) }), /6,000/);
  await assert.rejects(bridge.requestChat({ ...request, history: [{ role: 'system', text: 'bad' }] }), /이력/);
  const pending = assert.rejects(bridge.requestChat(request), /설정이 변경/);
  const received = (await (await post('state', snapshot, token)).json()).chatRequest;
  assert.equal(received.history.length, 8);
  assert.equal(received.history[0].text.length, 1200);
  await post('state', { ...snapshot, presetId: 'senior_dev' }, token);
  await pending;
  assert.equal((await post('chat/result', { requestId: request.requestId, answer: 'late' }, token)).status, 409);
  const second = assert.rejects(bridge.requestChat(request), /연결이 변경/);
  const next = await (await post('pair', { code: bridge.code })).json();
  await second;
  assert.equal((await post('chat/result', { requestId: request.requestId, answer: 'old session' }, token)).status, 401);
  assert.equal((await (await post('state', snapshot, next.token)).json()).chatRequest, undefined);
});

test('native chat reports web errors, timeout and disconnect without returning a fake answer', async t => {
  const { bridge, post } = await fixture(t, { chatTimeoutMs: 50 });
  const { token } = await (await post('pair', { code: bridge.code })).json();
  await post('state', { desktopChat: true }, token);
  const request = { requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', text: '샘플', history: [], mode: 'talk' };
  const failed = assert.rejects(bridge.requestChat(request), /Mock 오류/);
  await post('chat/result', { requestId: request.requestId, error: 'Mock 오류' }, token);
  await failed;
  await assert.rejects(bridge.requestChat(request), /대기 시간/);
  const disconnected = assert.rejects(bridge.requestChat(request), /해제/);
  await post('disconnect', {}, token);
  await disconnected;
  await assert.rejects(bridge.requestChat(request), /6자리/);
});

test('AI execution is bound to the paired origin and token, and resets cancel active work', async (t) => {
  const calls = [];
  const cliAi = {
    config: provider => ({ provider }),
    chat: async data => { calls.push(data); return { answer: 'Mock CLI 답변', requestId: data.requestId }; },
    cancel: () => { calls.push('cancel'); return true; },
    close: () => {},
  };
  const { bridge, post } = await fixture(t, { cliAi });
  const request = { provider: 'claude_cli', requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', prompt: 'Mock 질문' };
  assert.equal((await post('ai/chat', request)).status, 401);
  const paired = await (await post('pair', { code: bridge.code })).json();
  assert.equal(paired.terminalAi, true);
  assert.equal((await post('ai/chat', request, paired.token, 'http://localhost:3001')).status, 403);
  assert.equal((await post('ai/chat', request, paired.token, 'https://other.vercel.app')).status, 403);
  assert.equal((await post('ai/chat', request, paired.token)).status, 200);
  assert.deepEqual(calls[1], request);
  await post('disconnect', {}, paired.token);
  assert.equal(calls.at(-1), 'cancel');
  assert.equal((await post('ai/config', {}, paired.token)).status, 401);
});

test('only configured origins and safe local assets are accepted', () => {
  assert.equal(appOrigin('https://example.com/path'), 'https://example.com');
  for (const url of ['http://example.com', 'file:///secret', 'https://user:pass@example.com']) assert.throws(() => appOrigin(url));
  const safe = cleanState({ name: 'a'.repeat(80), speech: '가'.repeat(1200), avatar: '/barista/../../secret.png', accent: 'url(https://example.com)' });
  assert.equal(safe.name.length, 60);
  assert.equal(safe.speech.length, 1000);
  assert.equal(safe.avatar, 'persona_barista_v2.webp');
  assert.equal(safe.accent, '#bd7957');
  assert.equal(cleanState({ aiProvider: 'unknown', terminalAi: { account: { email: 'forged@example.invalid' } } }).aiProvider, 'default');
  assert.equal(cleanState({ aiProvider: 'claude_cli' }).aiProvider, 'claude_cli');
  assert.ok(!Object.hasOwn(cleanState({ terminalAi: {} }), 'terminalAi'));
});

test('model catalog lookup is bound to pairing and discards results after re-pairing', async t => {
  let resolveModels, called = 0;
  const cliAi = { models: () => { called++; return new Promise(resolve => { resolveModels = resolve; }); }, cancel: () => {}, close: () => {} };
  const { bridge, post } = await fixture(t, { cliAi });
  assert.equal((await post('ai/models', { provider: 'codex_cli' })).status, 401);
  const paired = await (await post('pair', { code: bridge.code })).json();
  assert.equal((await post('ai/models', { provider: 'codex_cli' }, paired.token, 'http://localhost:3001')).status, 403);
  assert.equal(called, 0);
  const response = post('ai/models', { provider: 'codex_cli' }, paired.token);
  while (!resolveModels) await new Promise(resolve => setTimeout(resolve, 5));
  await post('pair', { code: bridge.code });
  resolveModels({ provider: 'codex_cli', models: [{ value: 'mock-model' }] });
  assert.equal((await response).status, 401);
});

test('account status is private to the current pairing, including re-pairing during lookup', async (t) => {
  let resolveStatus;
  let calls = 0;
  const cliAi = { status: () => { calls++; return new Promise(resolve => { resolveStatus = resolve; }); }, cancel: () => {}, close: () => {} };
  const { bridge, post } = await fixture(t, { cliAi });
  assert.equal((await post('ai/status', { provider: 'claude_cli', refresh: true })).status, 401);
  const paired = await (await post('pair', { code: bridge.code })).json();
  assert.equal((await post('ai/status', {}, paired.token, 'https://other.vercel.app')).status, 403);
  assert.equal(calls, 0);
  const pending = post('ai/status', { provider: 'claude_cli', refresh: true }, paired.token);
  while (!resolveStatus) await new Promise(resolve => setTimeout(resolve, 5));
  await post('pair', { code: bridge.code });
  resolveStatus({ account: { email: 'private@example.invalid' } });
  const response = await pending;
  assert.equal(response.status, 401);
  assert.ok(!(await response.text()).includes('private@example.invalid'));
});

test('pairing gates state; action is consumed once; disconnect revokes credentials', async (t) => {
  let snapshot;
  const { bridge, post } = await fixture(t, { onState: (value) => { snapshot = value; } });
  assert.equal((await post('pair', { code: bridge.code }, null, 'https://untrusted.example')).status, 403);
  assert.equal((await post('state', {})).status, 401);
  assert.equal((await post('pair', { code: '가나다라마바' })).status, 401);
  const { token } = await (await post('pair', { code: bridge.code })).json();
  assert.equal(token.length, 64);
  assert.equal(bridge.connected, true);
  bridge.requestOpen();
  assert.deepEqual(await (await post('state', { speech: '안녕하세요 ☕', avatar: '/barista/barista_robot_3d.png' }, token)).json(), { action: 'open-copilot' });
  assert.equal(snapshot.speech, '안녕하세요 ☕');
  assert.equal(snapshot.avatar, 'barista_robot_3d.png');
  assert.equal(cleanState({ avatar: '/barista/persona_karina_v2.webp' }).avatar, 'persona_karina_v2.webp');
  assert.deepEqual(await (await post('state', {}, token)).json(), { action: null });
  assert.equal((await post('state', {}, 'wrong')).status, 401);
  await post('disconnect', {}, token);
  assert.equal(bridge.connected, false);
  assert.equal((await post('state', {}, token)).status, 401);
});

test('open conversation reuses the paired tab and only launches a browser when disconnected', async (t) => {
  const { bridge, post } = await fixture(t);
  const opened = [];
  const openExternal = (url) => opened.push(url);
  openConversation(bridge, openExternal, origin);
  assert.deepEqual(opened, [`${origin}/#copilot`]);
  const { token } = await (await post('pair', { code: bridge.code })).json();
  // A request before pairing must not leak into the newly paired tab.
  assert.deepEqual(await (await post('state', {}, token)).json(), { action: null });
  opened.length = 0;
  openConversation(bridge, openExternal, origin);
  assert.deepEqual(opened, []);
  assert.deepEqual(await (await post('state', {}, token)).json(), { action: 'open-copilot' });
  assert.deepEqual(await (await post('state', {}, token)).json(), { action: null });
  await post('disconnect', {}, token);
  openConversation(bridge, openExternal, origin);
  assert.deepEqual(opened, [`${origin}/#copilot`]);
});

test('pair attempts are rate limited and oversized messages are rejected', async (t) => {
  const { bridge, post } = await fixture(t);
  const bad = bridge.code === '100000' ? '100001' : '100000';
  for (let i = 0; i < 5; i++) assert.equal((await post('pair', { code: bad })).status, 401);
  assert.equal((await post('pair', { code: bridge.code })).status, 429);
  assert.equal((await post('state', { speech: 'x'.repeat(9000) })).status, 413);
});

test('UTF-8 text survives splitting a Korean character across HTTP chunks', async (t) => {
  let snapshot;
  const { port, bridge, post } = await fixture(t, { onState: (value) => { snapshot = value; } });
  const { token } = await (await post('pair', { code: bridge.code })).json();
  const body = Buffer.from(JSON.stringify({ speech: '안녕 ☕' }));
  const split = body.indexOf(Buffer.from('안')) + 1;
  const status = await new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port, path: '/state', method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }, (response) => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    request.on('error', reject);
    request.write(body.subarray(0, split));
    setTimeout(() => request.end(body.subarray(split)), 20);
  });
  assert.equal(status, 200);
  assert.equal(snapshot.speech, '안녕 ☕');
});
