let current = {};
let localSpeech = '';
let toastTimer;
let aiBusy = false;
let modelState = {};
const modelKey = () => `${current.chatSession}:${current.aiProvider}`;
let chatKey = '';
let chatTurns = [];
let chatPending = null;
const byId = (id) => document.getElementById(id);
function reportRegions() {
  const regions = [...document.querySelectorAll('[data-hit]')].filter((el) => el.getClientRects().length && getComputedStyle(el).display !== 'none')
    .map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  window.barista.regions(regions);
}
function render(state) {
  if (!state) return;
  const wasChatOpen = Boolean(current.chatOpen);
  current = state;
  const nextChatKey = `${state.chatSession}:${state.presetId || ''}:${state.aiProvider || 'default'}`;
  if (nextChatKey !== chatKey) {
    chatKey = nextChatKey; chatTurns = []; chatPending = null;
    byId('chat-input').value = '';
    byId('chat-toggle').dataset.unread = 'false';
    renderChatMessages();
  }
  document.body.dataset.chatOpen = String(Boolean(state.chatOpen));
  byId('chat').hidden = !state.chatOpen;
  byId('chat-toggle').setAttribute('aria-expanded', String(Boolean(state.chatOpen)));
  byId('chat-toggle').setAttribute('aria-label', state.chatOpen ? '바리스타 대화창 접기' : '바리스타 대화창 열기');
  if (state.chatOpen) {
    byId('settings').hidden = true;
    byId('settings-button').setAttribute('aria-expanded', 'false');
    byId('chat-toggle').dataset.unread = 'false';
  }
  document.body.dataset.appearance = state.appearance;
  document.body.dataset.connected = String(Boolean(state.connected));
  document.documentElement.style.setProperty('--accent', state.accent);
  byId('name').textContent = state.name;
  byId('status').textContent = state.connected ? '웹 연결됨' : '연결 대기';
  byId('speech').textContent = state.error || localSpeech || (state.connected ? state.speech || '웹 바리스타의 말풍선을 기다리고 있어요.' : 'CoffeeTide의 데스크톱 연결에서 아래 코드를 입력해 주세요.');
  byId('speech').title = byId('speech').textContent;
  byId('pairing').hidden = state.connected || Boolean(state.error);
  byId('pair-code').textContent = state.code;
  byId('avatar').src = `assets/${state.avatar}`;
  byId('avatar').alt = state.name;
  for (const radio of document.querySelectorAll('[name="appearance"]')) radio.checked = radio.value === state.appearance;
  renderAi(state.terminalAi);
  renderModels();
  renderChatControls();
  if (state.chatOpen && !wasChatOpen) requestAnimationFrame(() => { byId('chat-input').focus(); scrollChat(); });
  requestAnimationFrame(reportRegions);
}
function scrollChat() { byId('chat-messages').scrollTop = byId('chat-messages').scrollHeight; }
function renderChatMessages() {
  const log = byId('chat-messages');
  log.replaceChildren();
  const append = (text, kind) => {
    const message = document.createElement('p');
    message.className = `chat-message ${kind}`;
    message.setAttribute('aria-label', kind === 'user' ? '내 질문' : '바리스타 답변');
    message.textContent = text;
    log.append(message);
  };
  if (!chatTurns.length) {
    const empty = document.createElement('p'); empty.className = 'chat-empty';
    empty.textContent = '커피 한 잔, 가벼운 대화부터 오늘 할 일까지 물어보세요.'; log.append(empty);
  }
  for (const turn of chatTurns) {
    append(turn.text, 'user');
    append(turn.answer || turn.error || '답변을 준비하고 있어요…', turn.error ? 'error' : turn.answer ? 'assistant' : 'pending');
  }
  scrollChat();
}
function renderChatControls() {
  const available = current.connected && current.desktopChat;
  byId('chat-input').disabled = !available;
  byId('chat-send').disabled = !available || Boolean(chatPending) || !byId('chat-input').value.trim();
  byId('chat-mode').disabled = Boolean(chatPending);
  for (const button of document.querySelectorAll('#chat-prompts button')) button.disabled = !available || Boolean(chatPending);
  const provider = current.aiProvider === 'claude_cli' ? 'Claude Code' : current.aiProvider === 'codex_cli' ? 'Codex CLI' : '기본 AI';
  byId('chat-status').textContent = !current.connected ? '웹을 열고 6자리 코드로 연결해 주세요.' : !current.desktopChat ? '웹을 새로고침한 뒤 다시 연결해 주세요.' : chatPending ? '답변을 기다리고 있어요. 접어도 계속 받아요.' : `${provider} · ${byId('chat-mode').value === 'work' ? (provider === '기본 AI' ? '승인이 필요한 작업은 웹에서 확인하세요.' : 'CLI는 대화·업무 조언을 지원해요.') : 'Enter 전송 · Shift+Enter 줄바꿈'}`;
}
async function submitChat(text, mode = byId('chat-mode').value) {
  text = text.trim();
  if (!text || chatPending || !current.connected || !current.desktopChat) return;
  const history = chatTurns.filter(turn => turn.answer && !turn.error).slice(-4).flatMap(turn => [{ role: 'user', text: turn.text }, { role: 'assistant', text: turn.answer }]);
  const turn = { requestId: crypto.randomUUID(), text };
  chatPending = turn;
  chatTurns = [...chatTurns.slice(-9), turn];
  byId('chat-input').value = '';
  byId('chat-mode').value = mode;
  renderChatMessages(); renderChatControls();
  const ownedKey = chatKey;
  try {
    const result = await window.barista.chatSend({ requestId: turn.requestId, text, history, mode });
    if (ownedKey !== chatKey || chatPending !== turn) return;
    if (result?.error) turn.error = result.error;
    else if (typeof result?.answer === 'string' && result.answer.trim()) turn.answer = result.answer;
    else turn.error = '답변을 받지 못했습니다. 다시 질문해 주세요.';
  } catch {
    if (ownedKey !== chatKey || chatPending !== turn) return;
    turn.error = '대화 연결에 실패했습니다. 웹 연결을 확인해 주세요.';
  } finally {
    if (ownedKey === chatKey && chatPending === turn) {
      chatPending = null;
      byId('chat-toggle').dataset.unread = String(!current.chatOpen);
      renderChatMessages(); renderChatControls();
    }
  }
}
function renderAi(status) {
  const selected = ['claude_cli', 'codex_cli'].includes(current.aiProvider);
  const account = status?.account;
  const time = value => value ? new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
  const lines = [selected ? current.aiProvider === 'claude_cli' ? 'Claude Code' : 'Codex CLI' : '기본 AI · 웹에서 설정'];
  if (selected) {
    lines.push(account?.email || (account?.loggedIn === false ? 'CLI 로그인이 필요합니다.' : account?.loggedIn ? `${account.authMethod} · 이메일 제공 안 됨` : '계정을 확인해 주세요.'));
    if (account?.plan) lines.push(`요금제 ${account.plan}`);
    lines.push(status?.lastError || (status?.verifiedAt ? `실제 응답 확인 · ${time(status.verifiedAt)}` : account?.loggedIn ? '로그인 확인 · 실제 응답 대기' : ''));
    if (status?.checkedAt) lines.push(`계정 조회 ${time(status.checkedAt)}`);
  }
  byId('ai-status').textContent = lines.filter(Boolean).join('\n');
  byId('ai-refresh').disabled = !selected || aiBusy;
  byId('ai-refresh').textContent = aiBusy ? '확인 중…' : '계정 확인';
  byId('ai-usage').hidden = !status?.usage;
  byId('ai-usage-hint').textContent = status?.usage ? (account?.authMethod === 'API 키' ? 'API 사용량은 제공업체 Usage 메뉴에서 확인하세요.' : current.aiProvider === 'claude_cli' ? 'Claude 설정 → Usage · CLI /usage\n브라우저도 같은 계정으로 로그인하세요.' : 'CLI /status → 한도 · /usage → 활동') : (selected ? '계정 확인 후 사용량 메뉴가 표시됩니다.' : '웹의 터미널 AI 연결에서 Claude Code 또는 Codex CLI를 선택하세요.');
}
async function refreshAi() {
  if (aiBusy || !['claude_cli', 'codex_cli'].includes(current.aiProvider)) return;
  const provider = current.aiProvider;
  aiBusy = true; renderAi(current.terminalAi); renderModels();
  try {
    const status = await window.barista.aiStatus();
    if (provider === current.aiProvider && status?.provider === provider) {
      current.terminalAi = status; renderAi(status);
      if (status.refreshError) byId('ai-status').textContent += `\n${status.refreshError}`;
    }
  } catch { byId('ai-status').textContent = '계정 확인에 실패했습니다. 다시 시도해 주세요.'; }
  finally { aiBusy = false; byId('ai-refresh').disabled = !['claude_cli', 'codex_cli'].includes(current.aiProvider); byId('ai-refresh').textContent = '계정 확인'; renderModels(); reportRegions(); }
}
function renderModels() {
  const selected = current.connected && ['claude_cli', 'codex_cli'].includes(current.aiProvider);
  byId('ai-model-settings').hidden = !selected;
  if (modelState.key !== modelKey()) modelState = { key: modelKey(), model: current.terminalModel || '', saved: current.terminalModel || '', message: '목록 새로고침으로 모델을 확인해 주세요.' };
  if (modelState.saved !== current.terminalModel) {
    modelState.saved = current.terminalModel || '';
    if (!modelState.dirty) modelState.model = modelState.saved;
  }
  const models = modelState.catalog?.models || [];
  const signature = JSON.stringify([models, modelState.model, modelState.custom]);
  if (modelState.signature !== signature) {
    modelState.signature = signature;
    const select = byId('ai-model'); select.replaceChildren();
    const option = (value, label) => { const element = document.createElement('option'); element.value = value; element.textContent = label; select.append(element); };
    option('', '자동 선택 · 모델 지정 안 함');
    if (modelState.model && !modelState.custom && !models.some(model => model.value === modelState.model)) option(modelState.model, `${modelState.model} · 목록에서 확인되지 않음`);
    for (const model of models) option(model.value, `${model.label}${model.isDefault ? ' · 기본 추천' : ''}`);
    option('__custom__', '모델 이름 직접 입력');
    select.value = modelState.custom ? '__custom__' : modelState.model;
  }
  byId('ai-model-custom').hidden = !modelState.custom;
  if (byId('ai-model-custom').value !== modelState.model) byId('ai-model-custom').value = modelState.model;
  for (const id of ['ai-model', 'ai-model-custom', 'ai-model-refresh', 'ai-model-save']) byId(id).disabled = !selected || aiBusy;
  const auto = !modelState.model ? (current.aiProvider === 'codex_cli' ? '\n자동 선택은 바리스타 실행 기본값이며 개인 config.toml 모델은 적용하지 않습니다.' : '\n자동 선택은 Claude CLI의 모델 설정을 따릅니다.') : '';
  byId('ai-model-message').textContent = `${modelState.message || ''}${auto}`;
}
async function refreshModels() {
  if (aiBusy || !current.connected || !['claude_cli', 'codex_cli'].includes(current.aiProvider)) return;
  const key = modelKey();
  aiBusy = true; modelState.catalog = null; modelState.message = '모델 목록 조회 중…'; renderModels(); renderAi(current.terminalAi);
  try {
    const result = await window.barista.aiModels({ provider: current.aiProvider, session: current.chatSession });
    if (key !== modelKey()) return;
    if (result?.error) throw new Error(result.error);
    if (!result?.catalog?.models?.length) throw new Error('모델 목록이 비어 있습니다. 직접 입력할 수도 있습니다.');
    modelState.catalog = result.catalog;
    if (!modelState.dirty) modelState.model = result.model;
    modelState.message = `${result.catalog.models.length}개 모델 조회 · ${new Date(result.catalog.checkedAt).toLocaleTimeString('ko-KR')}\n실행 권한·잔여 사용량은 보장하지 않습니다.`;
  } catch (error) { if (key === modelKey()) modelState.message = error.message || '모델 목록 조회 실패. 직접 입력할 수 있습니다.'; }
  finally { aiBusy = false; renderModels(); renderAi(current.terminalAi); reportRegions(); }
}
async function saveModel() {
  if (aiBusy) return;
  if (modelState.custom && !modelState.model.trim()) { modelState.message = '모델 이름을 입력해 주세요.'; renderModels(); return; }
  const key = modelKey();
  aiBusy = true; renderModels(); renderAi(current.terminalAi);
  try {
    const result = await window.barista.aiModelSave({ provider: current.aiProvider, session: current.chatSession, model: modelState.model });
    if (key !== modelKey()) return;
    if (result?.error) throw new Error(result.error);
    current.terminalModel = result.model;
    modelState.model = result.model; modelState.saved = result.model; modelState.dirty = false;
    modelState.message = '저장했습니다. 다음 질문부터 적용됩니다.';
  } catch (error) { if (key === modelKey()) modelState.message = error.message || '모델을 저장하지 못했습니다.'; }
  finally { aiBusy = false; renderModels(); renderAi(current.terminalAi); reportRegions(); }
}
byId('open-web').addEventListener('click', () => window.barista.openWeb());
byId('hide').addEventListener('click', () => window.barista.hide());
byId('bell').addEventListener('click', () => {
  localSpeech = '바리스타가 커피와 답변을 준비하고 있어요... ☕';
  clearTimeout(toastTimer); render(current);
  window.barista.action?.('order-coffee');
  toastTimer = setTimeout(() => { localSpeech = ''; render(current); }, 6000);
});
byId('bubble').addEventListener('click', (e) => {
  if (e.target.closest('#pairing') || !current.connected) return;
  localSpeech = '바리스타가 생각 중... 💭';
  clearTimeout(toastTimer); render(current);
  window.barista.action?.('trigger-talk');
  toastTimer = setTimeout(() => { localSpeech = ''; render(current); }, 6000);
});
byId('settings-button').addEventListener('click', () => {
  if (current.chatOpen) window.barista.chatOpen(false);
  byId('settings').hidden = !byId('settings').hidden;
  byId('settings-button').setAttribute('aria-expanded', String(!byId('settings').hidden));
  if (!byId('settings').hidden) void refreshAi().then(refreshModels);
  reportRegions();
});
byId('chat-toggle').addEventListener('click', () => window.barista.chatOpen(!current.chatOpen));
byId('chat-close').addEventListener('click', () => window.barista.chatOpen(false));
byId('chat-form').addEventListener('submit', event => { event.preventDefault(); void submitChat(byId('chat-input').value); });
byId('chat-input').addEventListener('input', renderChatControls);
byId('chat-input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); void submitChat(byId('chat-input').value); }
});
byId('chat-mode').addEventListener('change', renderChatControls);
for (const button of document.querySelectorAll('#chat-prompts button')) button.addEventListener('click', () => void submitChat(button.dataset.prompt, button.dataset.mode || 'talk'));
document.addEventListener('keydown', event => { if (event.key === 'Escape' && current.chatOpen && !event.isComposing) window.barista.chatOpen(false); });
byId('ai-refresh').addEventListener('click', () => void refreshAi());
byId('ai-usage').addEventListener('click', () => window.barista.aiUsage());
byId('ai-model-refresh').addEventListener('click', () => void refreshModels());
byId('ai-model-save').addEventListener('click', () => void saveModel());
byId('ai-model').addEventListener('change', event => {
  modelState.custom = event.target.value === '__custom__';
  modelState.model = modelState.custom ? '' : event.target.value;
  modelState.dirty = true; modelState.message = '모델 저장을 누르면 다음 질문부터 적용됩니다.'; renderModels(); reportRegions();
});
byId('ai-model-custom').addEventListener('input', event => { modelState.model = event.target.value; modelState.dirty = true; });
for (const radio of document.querySelectorAll('[name="appearance"]')) radio.addEventListener('change', () => window.barista.appearance(radio.value));
byId('avatar').addEventListener('error', () => {
  if (!byId('avatar').src.endsWith('persona_barista_v2.webp')) byId('avatar').src = 'assets/persona_barista_v2.webp';
});
new ResizeObserver(reportRegions).observe(byId('bubble'));
new ResizeObserver(reportRegions).observe(byId('chat'));
window.addEventListener('resize', reportRegions);
window.barista.onState(render);
window.barista.ready().then(render);
