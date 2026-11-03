import { pathToFileURL } from 'node:url';

export function inspectTelegram(env = process.env) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const username = env.TELEGRAM_BOT_USERNAME?.trim() ?? '';
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
  const origin = env.TELEGRAM_APP_ORIGIN?.trim() ?? '';
  const checks = {
    TELEGRAM_BOT_TOKEN: /^\d+:[A-Za-z0-9_-]{16,}$/.test(token),
    TELEGRAM_BOT_USERNAME: /^[A-Za-z0-9_]{5,32}$/.test(username),
    TELEGRAM_WEBHOOK_SECRET: /^[A-Za-z0-9_-]{32,256}$/.test(secret),
    TELEGRAM_APP_ORIGIN: false,
    SUPABASE_PUBLIC_CONFIG: Boolean(env.NEXT_PUBLIC_SUPABASE_URL?.trim() && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()),
    SUPABASE_SERVER_KEY: Boolean(env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    SHARED_JOB_STORAGE: Boolean((env.UPSTASH_REDIS_REST_URL?.trim() && env.UPSTASH_REDIS_REST_TOKEN?.trim())
      || (env.KV_REST_API_URL?.trim() && env.KV_REST_API_TOKEN?.trim())),
  };
  try {
    const url = new URL(origin);
    checks.TELEGRAM_APP_ORIGIN = url.protocol === 'https:' && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash && ['', '443', '80', '88', '8443'].includes(url.port);
  } catch {
    checks.TELEGRAM_APP_ORIGIN = false;
  }
  const provider = env.COPILOT_AI_PROVIDER?.trim() || 'gemini';
  return {
    ready: Object.values(checks).every(Boolean), checks,
    provider: ['gemini', 'kanana'].includes(provider) ? provider : 'invalid',
    modelConfigured: provider === 'gemini' ? Boolean(env.GEMINI_API_KEY?.trim())
      : provider === 'kanana' && Boolean(env.KANANA_API_URL?.trim() && env.KANANA_API_KEY?.trim()),
    experimentalKanana: provider === 'kanana',
    databaseSchemaVerified: false,
  };
}

async function botApi(env, method, payload, fetcher) {
  try {
    const response = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN.trim()}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    const text = await response.text();
    if (Buffer.byteLength(text) > 65_536) { throw new Error('Oversized response'); }
    const data = JSON.parse(text);
    if (!response.ok || data?.ok !== true) { throw new Error('Request rejected'); }
    return data.result;
  } catch {
    throw new Error(`Telegram ${method} failed; credentials and response details were withheld.`);
  }
}

export async function prepareTelegram({ env = process.env, action = 'preflight', apply = false, fetcher = fetch } = {}) {
  if (!['preflight', 'check', 'register', 'stop'].includes(action)) { throw new Error('Unknown action.'); }
  if (apply && !['register', 'stop'].includes(action)) { throw new Error('--apply requires --register or --stop.'); }
  const report = inspectTelegram(env);
  const plan = { action, dryRun: !apply && action !== 'check', targetPath: '/api/telegram/webhook',
    maxConnections: 1, allowedUpdates: ['message'], dropPendingUpdates: false };
  if (action === 'preflight' || (action !== 'check' && !apply)) { return { ...report, plan, networkRequests: 0 }; }
  if (!report.ready) { throw new Error('Local prerequisites are incomplete; run the offline preflight first.'); }
  const bot = await botApi(env, 'getMe', {}, fetcher);
  if (bot?.is_bot !== true || bot.username?.toLowerCase() !== env.TELEGRAM_BOT_USERNAME.trim().toLowerCase()) {
    throw new Error('The configured bot username does not match the token.');
  }
  const expected = `${new URL(env.TELEGRAM_APP_ORIGIN.trim()).origin}/api/telegram/webhook`;
  let info = await botApi(env, 'getWebhookInfo', {}, fetcher);
  if (action !== 'check') {
    if (info?.url && info.url !== expected) { throw new Error('The bot is connected to another webhook; no changes were made.'); }
    const result = action === 'register'
      ? await botApi(env, 'setWebhook', { url: expected, secret_token: env.TELEGRAM_WEBHOOK_SECRET.trim(),
        max_connections: 1, allowed_updates: ['message'], drop_pending_updates: false }, fetcher)
      : await botApi(env, 'deleteWebhook', { drop_pending_updates: false }, fetcher);
    if (result !== true) { throw new Error('Telegram did not acknowledge the requested change.'); }
    info = await botApi(env, 'getWebhookInfo', {}, fetcher);
    if (action === 'register' && (info?.url !== expected || info.max_connections !== 1
      || info.allowed_updates?.length !== 1 || info.allowed_updates[0] !== 'message')) {
      throw new Error('Webhook configuration did not match after registration.');
    }
    if (action === 'stop' && info?.url) { throw new Error('Webhook removal could not be verified.'); }
  }
  return { ...report, plan, botUsernameMatches: true, webhookConfigured: Boolean(info?.url),
    webhookMatches: info?.url === expected, maxConnections: info?.max_connections ?? null,
    messageOnly: info?.allowed_updates?.length === 1 && info.allowed_updates[0] === 'message',
    pendingUpdates: Number.isSafeInteger(info?.pending_update_count) ? info.pending_update_count : null,
    hasDeliveryError: Boolean(info?.last_error_date), callbackAuthVerified: false };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node [--env-file=.env.local] telegram-setup.mjs [--check | --register | --stop] [--apply]\nDefault: offline preflight. Register/stop are dry runs unless --apply is supplied.');
    return;
  }
  if (args.some(arg => !['--check', '--register', '--stop', '--apply'].includes(arg))
    || args.filter(arg => ['--check', '--register', '--stop'].includes(arg)).length > 1) {
    throw new Error('Invalid arguments; use --help.');
  }
  const action = args.includes('--check') ? 'check' : args.includes('--register') ? 'register' : args.includes('--stop') ? 'stop' : 'preflight';
  const report = await prepareTelegram({ action, apply: args.includes('--apply') });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) { process.exitCode = 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
