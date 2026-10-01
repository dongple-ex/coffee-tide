const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createBridge, appOrigin } = require('./bridge.cjs');
const { clampPosition, validRegions, hitTest } = require('./geometry.cjs');
const { openConversation } = require('./navigation.cjs');
const { startLeftShiftHotkey } = require('./hotkey.cjs');
const { createMainWindowControl } = require('./main-window.cjs');
const { createCliAi } = require('./cli-ai.cjs');
const mainWindowControl = createMainWindowControl();

const smoke = process.argv.includes('--smoke-test');
const origin = appOrigin(process.env.COFFEETIDE_URL || (app.isPackaged ? 'https://coffee-tide.dongple.kr' : 'http://localhost:3000'));
const smokeDirectory = app.isPackaged ? path.join(path.dirname(process.execPath), 'smoke-output') : path.join(__dirname, 'smoke-output');
if (smoke) {
  const profile = path.join(smokeDirectory, 'profile');
  fs.mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
}
const WIDTH = 280, HEIGHT = 280;
let win, tray, bridge, bridgePort, mouseTimer, saveTimer, cliAi;
let stopHotkey = () => {};
let hotkeyStatus = 'starting';
let regions = [];
let ignored = false;
let prefs = { appearance: 'cup' };
let state = { name: 'AI 바리스타', speech: '', accent: '#bd7957', avatar: 'persona_barista_v2.webp', connected: false, code: '', appearance: 'cup', chatOpen: false, chatSession: 0 };
const prefsPath = () => path.join(app.getPath('userData'), 'preferences.json');
const publish = (next) => {
  state = { ...state, ...next, appearance: prefs.appearance };
  if (win && !win.isDestroyed()) win.webContents.send('barista:state', state);
};
function savePrefs() {
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(prefsPath(), JSON.stringify(prefs)); } catch (error) { console.warn('Could not save desktop preferences:', error.message); }
}
function setAppearance(value) {
  if (!['cup', 'photo'].includes(value)) return;
  prefs.appearance = value; savePrefs(); publish({}); updateMenu();
}
function show() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.focus();
  }
}
function setChatOpen(open) {
  if (!win || win.isDestroyed() || state.chatOpen === open) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = Math.min(open ? 320 : WIDTH, area.width);
  const height = Math.min(open ? 440 : HEIGHT, area.height);
  const position = clampPosition({ x: bounds.x + bounds.width - width, y: bounds.y + bounds.height - height }, area, width, height);
  win.setBounds({ ...position, width, height });
  ignored = false; win.setIgnoreMouseEvents(false);
  publish({ chatOpen: open });
  if (open) show();
}
function openWeb() {
  Promise.resolve(openConversation(bridge, (url) => shell.openExternal(url), origin))
    .catch((error) => console.warn('Could not open CoffeeTide:', error.message));
}
async function handleGlobalShift() {
  if (mainWindowControl.active) {
    // 웹에서 방금 창을 연 같은 키 제스처가 네이티브에 늦게 도착한 경우는 무시한다.
    if (!mainWindowControl.hotkeyReady) return;
    const marker = mainWindowControl.marker;
    if (await mainWindowControl.restore()) bridge?.queueAction('restore-web-main', marker);
    return;
  }
  // 연결된 웹 미니카드는 로컬 키 이벤트로 연다(user activation 필요).
  // 같은 Shift를 웹과 네이티브 양쪽에서 중복 실행하지 않는다.
  if (bridge?.connected && state.webMiniCardControl) return;
  summon();
}
function summon() {
  show();
  openWeb();
}
function updateMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '바리스타 보이기', click: show },
    { label: hotkeyStatus === 'ready' ? '왼쪽 Shift 두 번 · 호출 준비됨' : hotkeyStatus === 'starting' ? '왼쪽 Shift 두 번 · 준비 중' : '왼쪽 Shift 단축키 사용 불가 · 앱을 다시 실행해 주세요', enabled: false },
    { label: 'CoffeeTide 열기', click: openWeb },
    { label: '설정 · 캐릭터 모습', submenu: [
      { label: '① 아이스커피 아이콘', type: 'radio', checked: prefs.appearance === 'cup', click: () => setAppearance('cup') },
      { label: '② 현재 바리스타 사진', type: 'radio', checked: prefs.appearance === 'photo', click: () => setAppearance('photo') },
    ] },
    { label: '웹 연결 해제 / 코드 재발급', click: () => bridge?.reset() },
    { label: '화면 안으로 위치 복원', click: () => { const area = screen.getPrimaryDisplay().workArea; const bounds = win.getBounds(); win.setPosition(area.x + area.width - bounds.width - 24, area.y + area.height - bounds.height - 24); show(); } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
}

console.log('Checking instance lock...');
const gotLock = app.requestSingleInstanceLock();
console.log('gotLock result:', gotLock);
if (!gotLock) {
  console.log('Failed to get lock, quitting');
  if (smoke) app.exit(1); else app.quit();
} else {
  app.on('second-instance', show);
  app.whenReady().then(async () => {
    try {
      const saved = JSON.parse(fs.readFileSync(prefsPath(), 'utf8'));
      prefs.appearance = saved.appearance;
      prefs.cliAi = saved.cliAi;
      if (Number.isSafeInteger(saved.position?.x) && Number.isSafeInteger(saved.position?.y)) prefs.position = saved.position;
    } catch {}
    if (!['cup', 'photo'].includes(prefs.appearance)) prefs.appearance = 'cup';
    if (smoke) prefs.appearance = 'cup';
    const display = prefs.position ? screen.getDisplayNearestPoint(prefs.position) : screen.getPrimaryDisplay();
    const position = clampPosition(prefs.position || { x: display.workArea.x + display.workArea.width - WIDTH - 24, y: display.workArea.y + display.workArea.height - HEIGHT - 24 }, display.workArea, WIDTH, HEIGHT);
    win = new BrowserWindow({
      ...position, width: WIDTH, height: HEIGHT,
      title: 'CoffeeTide Barista', frame: false, transparent: true,
      backgroundColor: '#00000000', hasShadow: false, thickFrame: false,
      alwaysOnTop: true, resizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    const rendererUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
    const trusted = (event) => event.sender === win.webContents && event.senderFrame?.url === rendererUrl;
    ipcMain.handle('barista:ready', (event) => trusted(event) ? { ...state, appearance: prefs.appearance } : null);
    ipcMain.on('barista:open-web', (event) => { if (trusted(event)) openWeb(); });
    ipcMain.on('barista:action', (event, value) => { if (trusted(event)) bridge?.queueAction(value); });
    ipcMain.on('barista:hide', (event) => { if (trusted(event)) win.hide(); });
    ipcMain.on('barista:appearance', (event, value) => { if (trusted(event)) setAppearance(value); });
    ipcMain.on('barista:chat-open', (event, value) => { if (trusted(event) && typeof value === 'boolean') setChatOpen(value); });
    ipcMain.handle('barista:chat-send', async (event, value) => {
      if (!trusted(event)) return { error: '허용되지 않은 요청입니다.' };
      try { return await bridge.requestChat(value); }
      catch (error) { return { error: error.message }; }
    });
    ipcMain.handle('barista:ai-status', async (event) => {
      if (!trusted(event) || !['claude_cli', 'codex_cli'].includes(state.aiProvider)) return null;
      const provider = state.aiProvider;
      try { return await cliAi.status(provider, true); }
      catch (error) { return { ...cliAi.status(provider), refreshError: error.message }; }
    });
    const modelContextMatches = (value) => state.connected && value?.session === state.chatSession && value?.provider === state.aiProvider && ['claude_cli', 'codex_cli'].includes(value.provider);
    ipcMain.handle('barista:ai-models', async (event, value) => {
      if (!trusted(event) || !modelContextMatches(value)) return { error: '웹 연결과 선택한 AI를 다시 확인해 주세요.' };
      try {
        const catalog = await cliAi.models(value.provider);
        if (!modelContextMatches(value)) return { error: '연결이 변경되었습니다. 다시 조회해 주세요.' };
        return { catalog, model: cliAi.config(value.provider).model };
      } catch (error) { return { error: error.message }; }
    });
    ipcMain.handle('barista:ai-model-save', (event, value) => {
      if (!trusted(event) || !modelContextMatches(value) || typeof value.model !== 'string') return { error: '웹 연결과 선택한 AI를 다시 확인해 주세요.' };
      try { return { model: cliAi.configure(value.provider, { ...cliAi.config(value.provider), model: value.model }).model }; }
      catch (error) { return { error: error.message }; }
    });
    ipcMain.on('barista:ai-usage', (event) => {
      if (!trusted(event) || !['claude_cli', 'codex_cli'].includes(state.aiProvider)) return;
      // URLs originate only from our fixed usageFor table, never the web or IPC input.
      void shell.openExternal(cliAi.status(state.aiProvider).usage.url).catch(() => {});
    });
    ipcMain.on('barista:regions', (event, value) => { if (trusted(event)) { const bounds = win.getBounds(); regions = validRegions(value, bounds.width, bounds.height); } });
    cliAi = createCliAi({
      defaultDirectory: path.join(app.getPath('userData'), 'ai-workspace'),
      settings: prefs.cliAi,
      save: (settings) => { prefs.cliAi = settings; savePrefs(); },
      onStatus: (status) => { if (state.aiProvider === status.provider) publish({ terminalAi: status, terminalModel: cliAi.config(status.provider).model }); },
    });
    bridge = createBridge({
      cliAi,
      origin, port: smoke ? 0 : 47381, windowControl: process.platform === "win32",
      onPair: () => { publish({ connected: true, code: '', desktopChat: false, chatSession: state.chatSession + 1 }); show(); },
      onState: (snapshot) => publish({ ...snapshot, terminalAi: ['claude_cli', 'codex_cli'].includes(snapshot.aiProvider) ? cliAi.status(snapshot.aiProvider) : null, terminalModel: ['claude_cli', 'codex_cli'].includes(snapshot.aiProvider) ? cliAi.config(snapshot.aiProvider).model : '', connected: true, code: '' }),
      onWindow: (action, marker) => action === 'minimize' ? mainWindowControl.minimize(marker) : mainWindowControl.restore(),
      onDisconnect: (code) => {
        void mainWindowControl.restore();
        publish({ connected: false, desktopChat: false, chatSession: state.chatSession + 1, webMiniCardControl: false, aiProvider: 'default', terminalAi: null, code, speech: '', title: '', name: 'AI 바리스타', accent: '#bd7957', avatar: 'persona_barista_v2.webp' });
      },
    });
    try { bridgePort = await bridge.listen(); publish({ code: bridge.code }); }
    catch (error) { publish({ error: '연결 포트를 사용할 수 없습니다. 다른 데스크톱 바리스타를 종료한 뒤 다시 실행해 주세요.' }); console.error(error.message); }

    try {
      const trayImage = nativeImage.createFromPath(path.join(__dirname, 'assets', 'coffeetide-tray.png')).resize({ width: 24, height: 24 });
      tray = new Tray(trayImage); tray.setToolTip('CoffeeTide 바리스타 · 더블클릭하여 보이기'); tray.on('double-click', show); updateMenu();
    } catch (e) {
      console.warn('Tray creation failed:', e.message);
    }
    win.on('move', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { if (!win.isDestroyed()) { const bounds = win.getBounds(); prefs.position = { x: bounds.x + bounds.width - WIDTH, y: bounds.y + bounds.height - HEIGHT }; savePrefs(); } }, 300);
    });
    // 네이티브 드래그 영역에서는 DOM mousemove가 발생하지 않는다. 화면 좌표로 불투명 조작 영역만 활성화한다.
    mouseTimer = setInterval(() => {
      if (win.isDestroyed() || !win.isVisible()) return;
      const nextIgnored = !hitTest(screen.getCursorScreenPoint(), win.getBounds(), regions);
      if (nextIgnored !== ignored) { ignored = nextIgnored; win.setIgnoreMouseEvents(ignored, { forward: true }); }
    }, 40);
    await win.loadFile(path.join(__dirname, 'index.html'));
    if (smoke) {
      // 앱 소유 로컬 렌더러의 통합 검사. OS 단축키나 시작프로그램은 변경하지 않는다.
      show();
      await new Promise((resolve) => setTimeout(resolve, 600));
      const image = await win.webContents.capturePage();
      const bitmap = image.toBitmap();
      const alphaAtCorner = bitmap[3];
      const report = { fixedSize: !win.isResizable() && !win.isMaximizable(), alwaysOnTop: win.isAlwaysOnTop(), transparentCorner: alphaAtCorner === 0, renderer: await win.webContents.executeJavaScript('({ title: document.title, appearance: document.body.dataset.appearance, codeVisible: document.querySelector("#pair-code").textContent.length === 6 })'), hitRegions: regions.length };
      const inspectDrag = () => win.webContents.executeJavaScript('(() => { const el = document.querySelector("#drag-handle"); const r = el.getBoundingClientRect(); return el instanceof HTMLElement && getComputedStyle(el).getPropertyValue("-webkit-app-region") === "drag" && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; })()');
      report.cupDragHandle = await inspectDrag();
      fs.mkdirSync(smokeDirectory, { recursive: true });
      fs.writeFileSync(path.join(smokeDirectory, 'cup.png'), image.toPNG());
      const post = (route, data, token) => fetch(`http://127.0.0.1:${bridgePort}/${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
      const pairing = await (await post('pair', { code: bridge.code })).json();
      win.hide();
      summon();
      const summonAction = await (await post('state', {}, pairing.token)).json();
      report.hotkeySummon = win.isVisible() && summonAction.action === 'open-copilot';
      const accountSmoke = process.argv.includes('--smoke-account');
      await post('state', { name: '테스트 바리스타', speech: '렌더링 검사용 샘플 말풍선입니다. ☕', accent: '#438b72', avatar: '/barista/persona_barista_v2.webp', ...(accountSmoke ? { aiProvider: 'claude_cli' } : {}) }, pairing.token);
      await win.webContents.executeJavaScript('document.querySelector("#settings-button").click(); document.querySelector("input[value=photo]").click()');
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (accountSmoke) {
        for (let attempt = 0; attempt < 60; attempt++) {
          if (!await win.webContents.executeJavaScript('document.querySelector("#ai-refresh").disabled')) break;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        const email = cliAi.status('claude_cli').account.email;
        report.realAccountEmailVisible = Boolean(email) && await win.webContents.executeJavaScript(`document.querySelector('#ai-status').textContent.includes(${JSON.stringify(email)})`);
      }
      report.settingsContained = await win.webContents.executeJavaScript('(() => { const r = document.querySelector("#settings").getBoundingClientRect(); return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()');
      fs.writeFileSync(path.join(smokeDirectory, 'settings.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('document.querySelector("#settings-button").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      fs.writeFileSync(path.join(smokeDirectory, 'photo.png'), (await win.webContents.capturePage()).toPNG());
      report.photoMode = await win.webContents.executeJavaScript('document.body.dataset.appearance === "photo" && document.querySelector("#avatar").naturalWidth > 0');
      report.photoDragHandle = await inspectDrag();
      report.webStateReceived = await win.webContents.executeJavaScript('document.querySelector("#name").textContent === "테스트 바리스타" && document.querySelector("#speech").textContent.includes("샘플") && document.querySelector("#pairing").hidden');
      report.preferenceSaved = JSON.parse(fs.readFileSync(prefsPath(), 'utf8')).appearance === 'photo';
      Object.assign(report, await require('./scripts/model-smoke.cjs')({
        win, post, token: pairing.token, cliAi,
        capture: async filename => fs.writeFileSync(path.join(smokeDirectory, filename), (await win.webContents.capturePage()).toPNG()),
      }));
      if (process.argv.includes('--smoke-models')) {
        report.realModelCatalogCounts = {};
        for (const provider of ['claude_cli', 'codex_cli']) report.realModelCatalogCounts[provider] = (await cliAi.models(provider)).models.length;
      }
      Object.assign(report, await require('./scripts/chat-smoke.cjs')({
        win, post, token: pairing.token,
        capture: async filename => fs.writeFileSync(path.join(smokeDirectory, filename), (await win.webContents.capturePage()).toPNG()),
      }));
      await post('disconnect', {}, pairing.token);
      await new Promise((resolve) => setTimeout(resolve, 100));
      report.disconnectClearedSpeech = state.speech === '' && !state.connected;
      fs.writeFileSync(path.join(smokeDirectory, 'report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
      app.exit(report.hotkeySummon && report.transparentCorner && report.alwaysOnTop && report.photoMode && report.renderer.codeVisible && report.webStateReceived && report.preferenceSaved && report.disconnectClearedSpeech && report.hitRegions > 0 && report.cupDragHandle && report.photoDragHandle && report.settingsContained && Object.entries(report).filter(([key]) => key.startsWith('chat') || key.startsWith('modelPicker')).every(([, value]) => value === true) && (!accountSmoke || report.realAccountEmailVisible) ? 0 : 1);
    } else {
      stopHotkey = startLeftShiftHotkey({
        onTrigger: () => { void handleGlobalShift(); },
        onStatus: (status) => { hotkeyStatus = status; updateMenu(); console.log('Left Shift hotkey:', status); },
      });
      console.log('loadFile complete, calling show()...');
      show();
      console.log('Window visible:', win?.isVisible(), 'Bounds:', win?.getBounds());
    }
  }).catch((error) => { console.error(error); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
  let restoredBeforeQuit = false;
  app.on('before-quit', (event) => {
    if (mainWindowControl.active && !restoredBeforeQuit) {
      event.preventDefault();
      restoredBeforeQuit = true;
      void mainWindowControl.restore().finally(() => app.quit());
      return;
    }
  });
  app.on('before-quit', () => { stopHotkey(); clearInterval(mouseTimer); clearTimeout(saveTimer); void bridge?.close(); });
}
