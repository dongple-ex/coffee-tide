// Display metadata only. Never read credential files or return raw CLI output.
const USAGE = {
  claude_cli: { label: 'Claude 사용량 열기', url: 'https://claude.ai/settings/usage', description: 'Claude 설정 → Usage 또는 Claude Code에서 /usage로 확인하세요.' },
  codex_cli: { label: 'Codex 사용량 안내', url: 'https://learn.chatgpt.com/docs/developer-commands#view-account-usage-with-usage', description: 'Codex 터미널에서 /status로 한도를, /usage로 활동을 확인하세요. CLI 버전에 따라 메뉴가 다를 수 있습니다.' },
};
const safeText = (value, max = 100) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : undefined;
const email = value => {
  const text = safeText(value, 254);
  return text && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : undefined;
};
function claudeAccount(value) {
  if (typeof value?.loggedIn !== 'boolean') throw new Error('invalid_account');
  const subscription = value.authMethod === 'claude.ai';
  return { loggedIn: value.loggedIn, authMethod: subscription ? 'Claude 구독' : value.authMethod === 'api_key' ? 'API 키' : '외부 제공업체',
    ...(value.loggedIn && subscription ? { email: email(value.email), plan: safeText(value.subscriptionType), organization: safeText(value.orgName) } : {}) };
}
function codexAccount(value, apiKeyOverride = false) {
  if (apiKeyOverride) return { loggedIn: true, authMethod: 'API 키' };
  if (!value || !Object.hasOwn(value, 'account')) throw new Error('invalid_account');
  const account = value.account;
  if (account === null) return { loggedIn: false, authMethod: 'ChatGPT' };
  if (account.type === 'chatgpt') return { loggedIn: true, authMethod: 'ChatGPT', email: email(account.email), plan: safeText(account.planType) };
  if (account.type === 'apiKey') return { loggedIn: true, authMethod: 'API 키' };
  return { loggedIn: null, authMethod: '외부 제공업체' };
}
function usageFor(provider, account) {
  if (account?.authMethod === 'API 키') return provider === 'claude_cli'
    ? { label: 'Claude API 사용량 열기', url: 'https://platform.claude.com/usage', description: 'Claude Console → Usage에서 API 사용량을 확인하세요. 구독 한도와는 별도입니다.' }
    : { label: 'OpenAI API 사용량 열기', url: 'https://platform.openai.com/usage', description: 'OpenAI Platform → Usage에서 API 사용량을 확인하세요. ChatGPT 구독 한도와는 별도입니다.' };
  return USAGE[provider];
}
// A short-lived, read-only app-server conversation; no thread or model turn is created.
function codexAccountProtocol() {
  let result;
  return {
    initial: { id: 1, method: 'initialize', params: { clientInfo: { name: 'coffeetide_barista', title: 'CoffeeTide Barista', version: require('./package.json').version } } },
    onLine(line, stdin) {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id === 1) {
        if (message.error) throw new Error('initialize_failed');
        stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
        stdin.write(JSON.stringify({ id: 2, method: 'account/read', params: { refreshToken: false } }) + '\n');
      } else if (message.id === 2) {
        if (message.error) throw new Error('account_failed');
        result = message.result;
        stdin.end();
      }
    },
    result: () => result,
  };
}
module.exports = { claudeAccount, codexAccount, codexAccountProtocol, usageFor, USAGE };
