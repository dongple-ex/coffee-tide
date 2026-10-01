// 명시적으로 --live를 전달할 때만 실제 계정의 모델을 호출한다.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createCliAi } = require('../cli-ai.cjs');
const provider = process.argv.find(value => ['claude_cli', 'codex_cli'].includes(value));
const providers = provider ? [provider] : ['claude_cli', 'codex_cli'];
const live = process.argv.includes('--live');
const ai = createCliAi({ defaultDirectory: path.join(__dirname, '..', 'smoke-output', 'cli-ai'), timeoutMs: 60000 });
(async () => {
  let failed = false;
  for (const selected of providers) {
    try {
      const installation = await ai.check(selected);
      const result = live ? await ai.chat({ provider: selected, requestId: randomUUID(), prompt: 'CoffeeTide의 CLI 연결을 확인하는 합성 테스트입니다. 도구를 호출하지 말고 한국어로 "연결 확인 완료"라는 한 문장만 답하세요.' }) : null;
      if (result && (!result.status?.verifiedAt || !result.status?.checkedAt)) throw new Error('실제 응답 상태가 반환되지 않았습니다.');
      console.log(JSON.stringify({ provider: selected, version: installation.version, source: live ? 'real_cli' : 'installation_only', ...(result ? { answer: result.answer, accountIdentified: Boolean(result.status.account.email || result.status.account.authMethod), responseVerified: Boolean(result.status.verifiedAt) } : {}) }));
    } catch (error) { failed = true; console.log(JSON.stringify({ provider: selected, error: error.message })); }
  }
  ai.close(); process.exitCode = failed ? 1 : 0;
})().catch(() => { ai.close(); process.exitCode = 1; });
