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

test('only configured origins and safe local assets are accepted', () => {
  assert.equal(appOrigin('https://example.com/path'), 'https://example.com');
  for (const url of ['http://example.com', 'file:///secret', 'https://user:pass@example.com']) assert.throws(() => appOrigin(url));
  const safe = cleanState({ name: 'a'.repeat(80), speech: '가'.repeat(1200), avatar: '/barista/../../secret.png', accent: 'url(https://example.com)' });
  assert.equal(safe.name.length, 60);
  assert.equal(safe.speech.length, 1000);
  assert.equal(safe.avatar, 'barista_male_3d_serving.jpg');
  assert.equal(safe.accent, '#bd7957');
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
