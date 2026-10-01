const http = require('node:http');
const { randomBytes, randomInt, timingSafeEqual } = require('node:crypto');

function appOrigin(value = 'http://localhost:3000') {
  const url = new URL(value);
  if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid CoffeeTide URL');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Remote CoffeeTide URLs require HTTPS');
  return url.origin;
}

function cleanState(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid state');
  const text = (key, max) => typeof value[key] === 'string' ? value[key].slice(0, max) : '';
  return {
    webMiniCardControl: value.webMiniCardControl === true,
    name: text('name', 60) || 'AI 바리스타',
    speech: text('speech', 1000),
    title: text('title', 120),
    accent: /^#[0-9a-f]{6}$/i.test(value.accent) ? value.accent : '#bd7957',
    presetId: text('presetId', 60),
    avatar: typeof value.avatar === 'string' && /^\/barista\/[a-z0-9_-]+\.(png|jpg|webp)$/i.test(value.avatar)
      ? value.avatar.split('/').pop() : 'persona_barista_v2.webp',
  };
}

function equalSecret(a, b) {
  if (typeof a !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function createBridge({ origin, port = 47381, onState = () => {}, onPair = () => {}, onDisconnect = () => {}, onWindow = async () => false, windowControl = false, cliAi = null }) {
  origin = appOrigin(origin);
  let code = String(randomInt(100000, 1000000));
  let token = '';
  let pairedOrigin = '';
  let lastSeen = 0;
  let failures = [];
  let action = null;
  let actionMarker = null;
  const reset = () => {
    cliAi?.cancel();
    token = '';
    pairedOrigin = '';
    lastSeen = 0;
    action = null;
    actionMarker = null;
    code = String(randomInt(100000, 1000000));
    onDisconnect(code);
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const reqOrigin = req.headers.origin || '';
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqOrigin);
    const isVercel = /\.vercel\.app$/.test(reqOrigin) || /^https:\/\/coffee-tide\.dongple\.kr$/.test(reqOrigin);
    if ((reqOrigin !== origin && !isLocalhost && !isVercel) || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      res.writeHead(403).end(); return;
    }
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    const reply = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    if (req.url === '/health' && req.method === 'GET') { reply(200, { app: 'coffeetide-barista', version: 1 }); return; }
    if (req.method !== 'POST') { reply(404, { error: 'not_found' }); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { reply(415, { error: 'json_required' }); return; }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (req.url === '/ai/chat' ? 65536 : 8192)) { reply(413, { error: 'too_large' }); return; }
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (req.url === '/pair') {
        failures = failures.filter((time) => Date.now() - time < 60000);
        if (failures.length >= 5) { reply(429, { error: '잠시 후 다시 연결해 주세요.' }); return; }
        if (!equalSecret(data.code, code)) {
          failures.push(Date.now()); reply(401, { error: '연결 코드가 일치하지 않습니다.' }); return;
        }
        cliAi?.cancel();
        token = randomBytes(32).toString('hex');
        pairedOrigin = reqOrigin;
        code = String(randomInt(100000, 1000000));
        lastSeen = Date.now();
        onPair();
        reply(200, { token, windowControl, terminalAi: Boolean(cliAi) }); return;
      }
      if (!token || !equalSecret(req.headers.authorization, `Bearer ${token}`)) { reply(401, { error: '연결을 다시 설정해 주세요.' }); return; }
      if (pairedOrigin !== reqOrigin) { reply(403, { error: '페어링한 CoffeeTide 탭에서만 요청할 수 있습니다.' }); return; }
      if (req.url.startsWith('/ai/')) {
        if (!cliAi) { reply(503, { error: '터미널 AI를 지원하는 데스크톱 앱으로 업데이트해 주세요.' }); return; }
        if (Date.now() - lastSeen > 120000) { reset(); reply(401, { error: 'expired' }); return; }
        lastSeen = Date.now();
        if (req.url === '/ai/config') {
          const config = data.settings === undefined ? cliAi.config(data.provider) : cliAi.configure(data.provider, data.settings);
          reply(200, { config }); return;
        }
        if (req.url === '/ai/check') { reply(200, await cliAi.check(data.provider)); return; }
        if (req.url === '/ai/cancel') {
          if (typeof data.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.requestId)) { reply(400, { error: 'invalid_request_id' }); return; }
          reply(200, { cancelled: cliAi.cancel(data.requestId) }); return;
        }
        if (req.url === '/ai/chat') {
          if (typeof data.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.requestId)) { reply(400, { error: 'invalid_request_id' }); return; }
          const sessionToken = token;
          const disconnected = () => cliAi.cancel(data.requestId);
          res.once('close', disconnected);
          try {
            const result = await cliAi.chat(data);
            if (token !== sessionToken) { reply(401, { error: '연결이 변경되어 요청을 취소했습니다.' }); return; }
            reply(200, result);
          } finally { res.removeListener('close', disconnected); }
          return;
        }
      }
      if (req.url === '/window') {
        if (!['minimize', 'restore'].includes(data.action) ||
            (data.action === 'minimize' && !/^[a-f0-9]{32}$/.test(data.marker || ''))) {
          reply(400, { error: 'invalid_window_action' }); return;
        }
        if (Date.now() - lastSeen > 120000) { reset(); reply(401, { error: 'expired' }); return; }
        lastSeen = Date.now();
        const ok = await onWindow(data.action, data.marker);
        reply(ok ? 200 : 409, { ok }); return;
      }
      if (req.url === '/state') {
        const state = cleanState(data);
        lastSeen = Date.now();
        onState(state);
        reply(200, { action, ...(actionMarker ? { actionMarker } : {}) }); action = null; actionMarker = null; return;
      }
      if (req.url === '/disconnect') { reset(); reply(200, { ok: true }); return; }
      reply(404, { error: 'not_found' });
    } catch (error) {
      if (!res.writableEnded && !res.destroyed) reply(Number.isInteger(error.status) ? error.status : 400, { error: Number.isInteger(error.status) ? error.message : 'invalid_request' });
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  const expiry = setInterval(() => {
    if (token && Date.now() - lastSeen > 120000) reset();
  }, 3000);
  expiry.unref();
  return {
    get code() { return code; },
    get connected() { return Boolean(token); },
    queueAction(name, marker) {
      if (!token) return false;
      if (Date.now() - lastSeen > 120000) { reset(); return false; }
      action = typeof name === 'string' ? name.slice(0, 60) : null;
      actionMarker = /^[a-f0-9]{32}$/.test(marker || '') ? marker : null;
      return true;
    },
    requestOpen() {
      if (!token) return false;
      if (Date.now() - lastSeen > 120000) { reset(); return false; }
      action = 'open-copilot';
      actionMarker = null;
      return true;
    },
    reset,
    listen: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    }),
    close: () => new Promise((resolve) => { clearInterval(expiry); cliAi?.close(); server.close(resolve); server.closeAllConnections(); }),
  };
}

module.exports = { appOrigin, cleanState, createBridge };
