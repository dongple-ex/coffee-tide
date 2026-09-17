const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createBridge, appOrigin } = require('./bridge.cjs');
const { clampPosition, validRegions, hitTest } = require('./geometry.cjs');
const { openConversation } = require('./navigation.cjs');
const { startLeftShiftHotkey } = require('./hotkey.cjs');
const { createMainWindowControl } = require('./main-window.cjs');
const mainWindowControl = createMainWindowControl();

const smoke = process.argv.includes('--smoke-test');
const origin = appOrigin(process.env.COFFEETIDE_URL || 'http://localhost:3000');
if (smoke) app.setPath('userData', path.join(__dirname, 'smoke-output', 'profile'));
const WIDTH = 280, HEIGHT = 280;
let win, tray, bridge, bridgePort, mouseTimer, saveTimer;
let stopHotkey = () => {};
let hotkeyStatus = 'starting';
let regions = [];
let ignored = false;
let prefs = { appearance: 'cup' };
let state = { name: 'AI 바리스타', speech: '', accent: '#bd7957', avatar: 'barista_male_3d_serving.jpg', connected: false, code: '', appearance: 'cup' };
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
    { label: '화면 안으로 위치 복원', click: () => { const area = screen.getPrimaryDisplay().workArea; win.setPosition(area.x + area.width - WIDTH - 24, area.y + area.height - HEIGHT - 24); show(); } },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
}

console.log('Checking instance lock...');
const gotLock = app.requestSingleInstanceLock();
console.log('gotLock result:', gotLock);
if (!gotLock) {
  console.log('Failed to get lock, quitting');
  app.quit();
} else {
  app.on('second-instance', show);
  app.whenReady().then(async () => {
    try {
      const saved = JSON.parse(fs.readFileSync(prefsPath(), 'utf8'));
      prefs.appearance = saved.appearance;
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
    ipcMain.on('barista:regions', (event, value) => { if (trusted(event)) regions = validRegions(value, WIDTH, HEIGHT); });
    bridge = createBridge({
      origin, port: smoke ? 0 : 47381, windowControl: process.platform === "win32",
      onPair: () => { publish({ connected: true, code: '' }); show(); },
      onState: (snapshot) => publish({ ...snapshot, connected: true, code: '' }),
      onWindow: (action, marker) => action === 'minimize' ? mainWindowControl.minimize(marker) : mainWindowControl.restore(),
      onDisconnect: (code) => {
        void mainWindowControl.restore();
        publish({ connected: false, webMiniCardControl: false, code, speech: '', title: '', name: 'AI 바리스타', accent: '#bd7957', avatar: 'barista_male_3d_serving.jpg' });
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
      saveTimer = setTimeout(() => { if (!win.isDestroyed()) { const [x, y] = win.getPosition(); prefs.position = { x, y }; savePrefs(); } }, 300);
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
      fs.mkdirSync(path.join(__dirname, 'smoke-output'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, 'smoke-output', 'cup.png'), image.toPNG());
      const post = (route, data, token) => fetch(`http://127.0.0.1:${bridgePort}/${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
      const pairing = await (await post('pair', { code: bridge.code })).json();
      win.hide();
      summon();
      const summonAction = await (await post('state', {}, pairing.token)).json();
      report.hotkeySummon = win.isVisible() && summonAction.action === 'open-copilot';
      await post('state', { name: '테스트 바리스타', speech: '렌더링 검사용 샘플 말풍선입니다. ☕', accent: '#438b72', avatar: '/barista/barista_male_3d_serving.jpg' }, pairing.token);
      await win.webContents.executeJavaScript('document.querySelector("#settings-button").click(); document.querySelector("input[value=photo]").click()');
      await new Promise((resolve) => setTimeout(resolve, 300));
      fs.writeFileSync(path.join(__dirname, 'smoke-output', 'settings.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('document.querySelector("#settings-button").click()');
      await new Promise((resolve) => setTimeout(resolve, 100));
      fs.writeFileSync(path.join(__dirname, 'smoke-output', 'photo.png'), (await win.webContents.capturePage()).toPNG());
      report.photoMode = await win.webContents.executeJavaScript('document.body.dataset.appearance === "photo" && document.querySelector("#avatar").naturalWidth > 0');
      report.photoDragHandle = await inspectDrag();
      report.webStateReceived = await win.webContents.executeJavaScript('document.querySelector("#name").textContent === "테스트 바리스타" && document.querySelector("#speech").textContent.includes("샘플") && document.querySelector("#pairing").hidden');
      report.preferenceSaved = JSON.parse(fs.readFileSync(prefsPath(), 'utf8')).appearance === 'photo';
      await post('disconnect', {}, pairing.token);
      await new Promise((resolve) => setTimeout(resolve, 100));
      report.disconnectClearedSpeech = state.speech === '' && !state.connected;
      fs.writeFileSync(path.join(__dirname, 'smoke-output', 'report.json'), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report));
      app.exit(report.hotkeySummon && report.transparentCorner && report.alwaysOnTop && report.photoMode && report.renderer.codeVisible && report.webStateReceived && report.preferenceSaved && report.disconnectClearedSpeech && report.hitRegions > 0 && report.cupDragHandle && report.photoDragHandle ? 0 : 1);
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
