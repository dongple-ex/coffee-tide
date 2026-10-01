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
    desktopChat: value.desktopChat === true,
    aiProvider: ['claude_cli', 'codex_cli'].includes(value.aiProvider) ? value.aiProvider : 'default',
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

function createBridge({ origin, port = 47381, onState = () => {}, onPair = () => {}, onDisconnect = () => {}, onWindow = async () => false, windowControl = false, cliAi = null, chatTimeoutMs = 180000 }) {
  origin = appOrigin(origin);
  let code = String(randomInt(100000, 1000000));
  let token = '';
  let pairedOrigin = '';
  let lastSeen = 0;
  let failures = [];
  let action = null;
  let actionMarker = null;
  let chatContext = null;
  let pendingChat = null;
  const finishChat = (answer, error) => {
    if (!pendingChat) return;
    const pending = pendingChat;
    pendingChat = null;
    clearTimeout(pending.timer);
    if (error) pending.reject(new Error(error)); else pending.resolve({ answer });
  };
  const reset = () => {
    finishChat(null, '웹 연결이 해제되었습니다. 다시 연결해 주세요.');
    chatContext = null;
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
        if (size > (['/ai/chat', '/chat/result'].includes(req.url) ? 65536 : 8192)) { reply(413, { error: 'too_large' }); return; }
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
        finishChat(null, '웹 연결이 변경되었습니다. 다시 질문해 주세요.');
        chatContext = null;
        action = null; actionMarker = null;
        token = randomBytes(32).toString('hex');
        pairedOrigin = reqOrigin;
        code = String(randomInt(100000, 1000000));
        lastSeen = Date.now();
        onPair();
        reply(200, { token, windowControl, terminalAi: Boolean(cliAi), desktopChat: true }); return;
      }
      if (!token || !equalSecret(req.headers.authorization, `Bearer ${token}`)) { reply(401, { error: '연결을 다시 설정해 주세요.' }); return; }
      if (pairedOrigin !== reqOrigin) { reply(403, { error: '페어링한 CoffeeTide 탭에서만 요청할 수 있습니다.' }); return; }
      if (req.url === '/chat/result') {
        if (Date.now() - lastSeen > 120000) { reset(); reply(401, { error: 'expired' }); return; }
        if (!pendingChat || data.requestId !== pendingChat.request.requestId) { reply(409, { error: 'stale_chat_request' }); return; }
        if (typeof data.error === 'string' && data.error.trim() && data.error.length <= 500) finishChat(null, data.error);
        else if (typeof data.answer === 'string' && data.answer.trim() && data.answer.length <= 12000) finishChat(data.answer);
        else { reply(400, { error: 'invalid_chat_result' }); return; }
        lastSeen = Date.now();
        reply(200, { ok: true }); return;
      }
      if (req.url.startsWith('/ai/')) {
        if (!cliAi) { reply(503, { error: '터미널 AI를 지원하는 데스크톱 앱으로 업데이트해 주세요.' }); return; }
        if (Date.now() - lastSeen > 120000) { reset(); reply(401, { error: 'expired' }); return; }
        lastSeen = Date.now();
        if (req.url === '/ai/config') {
          const config = data.settings === undefined ? cliAi.config(data.provider) : cliAi.configure(data.provider, data.settings);
          reply(200, { config, ...(cliAi.status ? { status: cliAi.status(data.provider) } : {}) }); return;
        }
        if (req.url === '/ai/check') { reply(200, await cliAi.check(data.provider)); return; }
        if (req.url === '/ai/models') {
          if (!cliAi.models) { reply(404, { error: '모델 목록 조회를 지원하는 데스크톱 앱으로 업데이트해 주세요.' }); return; }
          const sessionToken = token;
          const catalog = await cliAi.models(data.provider);
          if (sessionToken !== token) { reply(401, { error: '연결이 변경되어 요청을 취소했습니다.' }); return; }
          reply(200, catalog); return;
        }
        if (req.url === '/ai/status') {
          const sessionToken = token;
          const status = await cliAi.status(data.provider, data.refresh === true);
          if (sessionToken !== token) { reply(401, { error: '연결이 변경되어 요청을 취소했습니다.' }); return; }
          reply(200, { status }); return;
        }
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
        const nextContext = state.desktopChat ? `${state.presetId}:${state.aiProvider}` : null;
        if (pendingChat && nextContext !== chatContext) finishChat(null, '캐릭터 또는 AI 설정이 변경되었습니다. 다시 질문해 주세요.');
        chatContext = nextContext;
        lastSeen = Date.now();
        onState(state);
        reply(200, { action, ...(actionMarker ? { actionMarker } : {}), ...(pendingChat ? { chatRequest: pendingChat.request } : {}) }); action = null; actionMarker = null; return;
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
    async requestChat(value) {
      if (!token || Date.now() - lastSeen > 120000) throw new Error('CoffeeTide 웹과 6자리 코드로 연결해 주세요.');
      if (chatContext === null) throw new Error('연결된 CoffeeTide 웹을 새로고침하고 다시 연결해 주세요.');
      if (pendingChat) throw new Error('이전 질문의 답변을 기다려 주세요.');
      if (!value || !/^[a-f0-9-]{36}$/i.test(value.requestId || '') || typeof value.text !== 'string' || !value.text.trim() || value.text.length > 6000 || !['talk', 'work'].includes(value.mode)) throw new Error('질문은 6,000자 이내로 입력해 주세요.');
      if (!Array.isArray(value.history) || value.history.length > 20 || value.history.some(turn => !turn || !['user', 'assistant'].includes(turn.role) || typeof turn.text !== 'string')) throw new Error('대화 이력 형식이 올바르지 않습니다.');
      const request = { requestId: value.requestId, text: value.text.trim(), mode: value.mode, history: value.history.slice(-8).map(turn => ({ role: turn.role, text: turn.text.slice(0, 1200) })) };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finishChat(null, '응답 대기 시간이 지났습니다. 웹에서 처리 상태를 확인해 주세요.'), chatTimeoutMs);
        timer.unref();
        pendingChat = { request, resolve, reject, timer };
      });
    },
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
    close: () => new Promise((resolve) => { finishChat(null, '바리스타가 종료되었습니다.'); clearInterval(expiry); cliAi?.close(); server.close(resolve); server.closeAllConnections(); }),
  };
}

module.exports = { appOrigin, cleanState, createBridge };
