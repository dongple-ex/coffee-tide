import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { inspectTelegram, prepareTelegram } from './telegram-setup.mjs';
import { benchmarkKanana } from './kanana-benchmark.mjs';

const env = () => ({
  TELEGRAM_BOT_TOKEN: `123456:${randomBytes(24).toString('base64url')}`,
  TELEGRAM_BOT_USERNAME: 'example_bot', TELEGRAM_WEBHOOK_SECRET: randomBytes(32).toString('base64url'),
  TELEGRAM_APP_ORIGIN: 'https://example.com', NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: randomBytes(16).toString('hex'), SUPABASE_SECRET_KEY: randomBytes(16).toString('hex'),
  UPSTASH_REDIS_REST_URL: 'https://example.com', UPSTASH_REDIS_REST_TOKEN: randomBytes(16).toString('hex'),
  GEMINI_API_KEY: randomBytes(16).toString('hex'),
});
const expectedUrl = 'https://example.com/api/telegram/webhook';
const info = () => ({ url: expectedUrl, pending_update_count: 2, max_connections: 1, allowed_updates: ['message'] });
const success = result => Response.json({ ok: true, result });
const noNetwork = () => { throw new Error('Unexpected network request'); };
const benchmarkEnv = () => ({ KANANA_API_URL: 'https://example.com/v1/chat/completions', KANANA_API_KEY: randomBytes(24).toString('hex') });
const reply = (content = '가상 자료에 따른 시험 답변') => Response.json({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { completion_tokens: 12 } });

test('offline Telegram checks never make network requests', async () => {
  const ready = await prepareTelegram({ env: env(), fetcher: noNetwork });
  assert.equal(ready.ready, true);
  assert.equal(ready.networkRequests, 0);
  assert.equal(ready.provider, 'gemini');
  assert.equal(ready.databaseSchemaVerified, false);
  assert.equal((await prepareTelegram({ env: {}, fetcher: noNetwork })).ready, false);
});

test('register and stop are dry runs by default', async () => {
  for (const action of ['register', 'stop']) {
    const config = env();
    const report = await prepareTelegram({ env: config, action, fetcher: noNetwork });
    assert.equal(report.plan.dryRun, true);
    assert.equal(report.plan.dropPendingUpdates, false);
    assert.equal(JSON.stringify(report).includes(config.TELEGRAM_BOT_TOKEN), false);
    assert.equal(JSON.stringify(report).includes(config.TELEGRAM_WEBHOOK_SECRET), false);
  }
});

test('invalid origin, secrets and missing shared storage fail the offline gate', () => {
  for (const origin of ['http://example.com', 'https://example.com/private', 'https://example.com?x=1', 'https://example.com:3000']) {
    assert.equal(inspectTelegram({ ...env(), TELEGRAM_APP_ORIGIN: origin }).ready, false);
  }
  assert.equal(inspectTelegram({ ...env(), TELEGRAM_WEBHOOK_SECRET: '' }).ready, false);
  assert.equal(inspectTelegram({ ...env(), UPSTASH_REDIS_REST_TOKEN: '' }).ready, false);
});

test('incomplete setup refuses registration before any network call', async () => {
  await assert.rejects(prepareTelegram({ env: {}, action: 'register', apply: true, fetcher: noNetwork }), /prerequisites/);
  await assert.rejects(prepareTelegram({ env: env(), action: 'check', apply: true, fetcher: noNetwork }), /--apply requires/);
});

test('read-only Telegram check queries identity and webhook without changing either', async () => {
  const methods = [];
  const report = await prepareTelegram({ env: env(), action: 'check', fetcher: async url => {
    const method = String(url).split('/').at(-1);
    methods.push(method);
    return success(method === 'getMe' ? { is_bot: true, username: 'example_bot' } : info());
  } });
  assert.deepEqual(methods, ['getMe', 'getWebhookInfo']);
  assert.equal(report.webhookMatches, true);
  assert.equal(report.callbackAuthVerified, false);
});

test('bot identity mismatch prevents webhook changes', async () => {
  let count = 0;
  await assert.rejects(prepareTelegram({ env: env(), action: 'register', apply: true, fetcher: async () => {
    count++;
    return success({ is_bot: true, username: 'another_bot' });
  } }), /does not match/);
  assert.equal(count, 1);
});

test('an existing different webhook is left untouched', async () => {
  const methods = [];
  await assert.rejects(prepareTelegram({ env: env(), action: 'register', apply: true, fetcher: async url => {
    const method = String(url).split('/').at(-1);
    methods.push(method);
    return success(method === 'getMe' ? { is_bot: true, username: 'example_bot' } : { url: 'https://other.example/hook' });
  } }), /another webhook/);
  assert.deepEqual(methods, ['getMe', 'getWebhookInfo']);
});

test('registration preserves pending updates and verifies returned configuration', async () => {
  const config = env();
  const methods = [];
  const report = await prepareTelegram({ env: config, action: 'register', apply: true, fetcher: async (url, options) => {
    const method = String(url).split('/').at(-1);
    methods.push(method);
    if (method === 'getMe') { return success({ is_bot: true, username: 'example_bot' }); }
    if (method === 'setWebhook') {
      assert.deepEqual(JSON.parse(options.body), { url: expectedUrl, secret_token: config.TELEGRAM_WEBHOOK_SECRET,
        max_connections: 1, allowed_updates: ['message'], drop_pending_updates: false });
      return success(true);
    }
    return success(info());
  } });
  assert.deepEqual(methods, ['getMe', 'getWebhookInfo', 'setWebhook', 'getWebhookInfo']);
  assert.equal(report.webhookMatches, true);
  assert.equal(JSON.stringify(report).includes(config.TELEGRAM_WEBHOOK_SECRET), false);
});

test('a registration acknowledgement alone is not treated as successful verification', async () => {
  await assert.rejects(prepareTelegram({ env: env(), action: 'register', apply: true, fetcher: async url => {
    const method = String(url).split('/').at(-1);
    return success(method === 'getMe' ? { is_bot: true, username: 'example_bot' } : method === 'setWebhook' ? true : { url: '' });
  } }), /did not match/);
});

test('stopping preserves queued updates and verifies the empty webhook URL', async () => {
  let stopped = false;
  const report = await prepareTelegram({ env: env(), action: 'stop', apply: true, fetcher: async (url, options) => {
    const method = String(url).split('/').at(-1);
    if (method === 'getMe') { return success({ is_bot: true, username: 'example_bot' }); }
    if (method === 'deleteWebhook') { assert.equal(JSON.parse(options.body).drop_pending_updates, false); stopped = true; return success(true); }
    return success(stopped ? { url: '' } : info());
  } });
  assert.equal(report.webhookConfigured, false);
});

test('Telegram API errors do not reveal URL tokens or upstream response bodies', async () => {
  const config = env();
  for (const fetcher of [async url => { throw new Error(String(url)); }, async () => Response.json({ ok: false, description: config.TELEGRAM_BOT_TOKEN })]) {
    await assert.rejects(prepareTelegram({ env: config, action: 'check', fetcher }), error =>
      error.message.includes('withheld') && !error.message.includes(config.TELEGRAM_BOT_TOKEN));
  }
});

test('Kanana dry run sends no requests even when configured', async () => {
  const report = await benchmarkKanana({ env: benchmarkEnv(), fetcher: noNetwork });
  assert.equal(report.dryRun, true);
  assert.equal(report.syntheticDataOnly, true);
  assert.equal(report.firstTokenLatencyMeasured, false);
});

test('Kanana measures sequential synthetic requests without retaining answers', async () => {
  const config = benchmarkEnv();
  let active = 0;
  let maximum = 0;
  const report = await benchmarkKanana({ env: config, run: true, samples: 3, fetcher: async (url, options) => {
    maximum = Math.max(maximum, ++active);
    const payload = JSON.parse(options.body);
    assert.equal(payload.stream, false);
    assert.equal(payload.max_tokens, 64);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${config.KANANA_API_KEY}`);
    await new Promise(resolve => setTimeout(resolve, 2));
    active--;
    return reply();
  } });
  assert.equal(maximum, 1);
  assert.equal(report.successCount, 3);
  assert.equal(report.productionReady, false);
  assert.equal(report.smallSampleOnly, true);
  assert.equal(report.qualityReviewRequired, true);
  assert.equal(JSON.stringify(report).includes('가상 자료에 따른 시험 답변'), false);
  assert.equal(JSON.stringify(report).includes(config.KANANA_API_KEY), false);
});

test('Kanana rejects unsafe endpoints and invalid limits before making requests', async () => {
  for (const url of ['http://example.com', 'https://example.com/?key=private', 'https://example.com/#fragment']) {
    await assert.rejects(benchmarkKanana({ env: { ...benchmarkEnv(), KANANA_API_URL: url }, run: true, fetcher: noNetwork }), /HTTPS/);
  }
  await assert.rejects(benchmarkKanana({ samples: 7, fetcher: noNetwork }), /limits/);
  await assert.rejects(benchmarkKanana({ maxTokens: 257, fetcher: noNetwork }), /limits/);
});

test('Kanana records busy responses and invalid output without exposing content', async () => {
  const config = benchmarkEnv();
  const busy = await benchmarkKanana({ env: config, run: true, samples: 1, fetcher: async () => new Response(config.KANANA_API_KEY, { status: 503 }) });
  assert.equal(busy.results[0].failure, 'busy');
  for (const response of [Response.json({ choices: [] }), reply('x'.repeat(70_000)),
    Response.json({ choices: [{ message: { role: 'assistant', content: 'tool', tool_calls: [{}] } }] })]) {
    const invalid = await benchmarkKanana({ env: config, run: true, samples: 1, fetcher: async () => response });
    assert.equal(invalid.results[0].success, false);
    assert.equal(invalid.successCount, 0);
  }
  assert.equal(JSON.stringify(busy).includes(config.KANANA_API_KEY), false);
});

test('Kanana aborts a delayed local HTTP fixture after the configured deadline', async () => {
  const server = createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const report = await benchmarkKanana({ env: { ...benchmarkEnv(), NODE_ENV: 'test', KANANA_TIMEOUT_MS: '1000',
      KANANA_API_URL: `http://127.0.0.1:${server.address().port}/v1/chat/completions` }, run: true, samples: 1 });
    assert.equal(report.results[0].failure, 'timeout');
    assert.equal(report.successCount, 0);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
