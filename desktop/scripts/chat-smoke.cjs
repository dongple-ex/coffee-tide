// App-owned renderer integration test. All chat replies here are explicitly synthetic.
module.exports = async function chatSmoke({ win, post, token, capture }) {
  const pause = () => new Promise(resolve => setTimeout(resolve, 150));
  const snapshot = { desktopChat: true, name: '샘플 바리스타', speech: 'UI 검사용 샘플입니다.', avatar: '/barista/persona_barista_v2.webp' };
  await post('state', snapshot, token);
  await pause();
  const badgeClickable = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('#chat-toggle'); const r = el.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el && getComputedStyle(el).getPropertyValue('-webkit-app-region') === 'no-drag';
  })()`);
  await win.webContents.executeJavaScript("document.querySelector('#chat-toggle').click()");
  await pause();
  const expanded = win.getBounds().width === 320 && win.getBounds().height === 440;
  const contained = await win.webContents.executeJavaScript(`(() => {
    const r = document.querySelector('#chat').getBoundingClientRect();
    return r.width > 0 && r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  })()`);
  await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('#chat-input'); input.value = '샘플 질문: 잠깐 쉬어도 될까요?';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
  })()`);
  const composing = (await (await post('state', snapshot, token)).json()).chatRequest === undefined;
  await win.webContents.executeJavaScript("document.querySelector('#chat-form').requestSubmit()");
  await pause();
  const first = (await (await post('state', snapshot, token)).json()).chatRequest;
  if (!first) throw new Error('Native chat did not queue its question');
  await post('chat/result', { requestId: first.requestId, answer: '샘플 응답입니다. 잠깐 쉬면서 커피 한 잔 어때요? ☕\n이 메시지는 실제 AI 응답이 아닙니다.' }, token);
  await pause();
  const replyVisible = await win.webContents.executeJavaScript("document.querySelector('#chat-messages').textContent.includes('실제 AI 응답이 아닙니다.') && !document.querySelector('#chat-input').disabled");
  await capture('chat.png');
  await win.webContents.executeJavaScript("document.querySelector('[data-mode=work]').click()");
  await pause();
  const second = (await (await post('state', snapshot, token)).json()).chatRequest;
  const history = second?.mode === 'work' && second.history.length === 2 && second.history[0].text === first.text;
  await win.webContents.executeJavaScript("document.querySelector('#chat-close').click()");
  await pause();
  const collapsed = win.getBounds().width === 280 && win.getBounds().height === 280;
  await post('chat/result', { requestId: second.requestId, answer: '두 번째 샘플 답변입니다.' }, token);
  await pause();
  const unread = await win.webContents.executeJavaScript("document.querySelector('#chat-toggle').dataset.unread === 'true'");
  await win.webContents.executeJavaScript("document.querySelector('#chat-toggle').click()");
  await pause();
  const retained = await win.webContents.executeJavaScript("document.querySelector('#chat-messages').textContent.includes('두 번째 샘플 답변') && document.querySelector('#chat-toggle').dataset.unread === 'false'");
  await post('disconnect', {}, token);
  await pause();
  const cleared = await win.webContents.executeJavaScript("!document.querySelector('#chat-messages').textContent.includes('샘플 질문:') && document.querySelector('#chat-input').disabled");
  await win.webContents.executeJavaScript("document.querySelector('#chat-close').click()");
  return { chatBadgeClickable: badgeClickable, chatExpandedAndContained: expanded && contained, chatCompositionSafe: composing, chatReplyVisible: replyVisible, chatHistoryAndWorkMode: history, chatCollapses: collapsed, chatUnreadAndRetained: unread && retained, chatDisconnectCleared: cleared };
};
