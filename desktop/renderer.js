let current = {};
let localSpeech = '';
let toastTimer;
const byId = (id) => document.getElementById(id);
function reportRegions() {
  const regions = [...document.querySelectorAll('[data-hit]')].filter((el) => el.getClientRects().length && getComputedStyle(el).display !== 'none')
    .map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  window.barista.regions(regions);
}
function render(state) {
  if (!state) return;
  current = state;
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
  requestAnimationFrame(reportRegions);
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
  byId('settings').hidden = !byId('settings').hidden;
  byId('settings-button').setAttribute('aria-expanded', String(!byId('settings').hidden));
  reportRegions();
});
for (const radio of document.querySelectorAll('[name="appearance"]')) radio.addEventListener('change', () => window.barista.appearance(radio.value));
byId('avatar').addEventListener('error', () => {
  if (!byId('avatar').src.endsWith('barista_male_3d_serving.jpg')) byId('avatar').src = 'assets/barista_male_3d_serving.jpg';
});
new ResizeObserver(reportRegions).observe(byId('bubble'));
window.barista.onState(render);
window.barista.ready().then(render);
