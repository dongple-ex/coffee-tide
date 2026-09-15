function openConversation(bridge, openExternal, origin) {
  // 이미 연결된 탭은 자신의 메모리와 대화를 유지한 채 전환한다.
  if (bridge?.requestOpen()) return;
  return openExternal(`${origin}/#copilot`);
}

module.exports = { openConversation };
