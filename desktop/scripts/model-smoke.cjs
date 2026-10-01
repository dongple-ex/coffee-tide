// Synthetic catalog UI test; never invokes a provider or represents samples as real models.
module.exports = async function modelSmoke({ win, post, token, cliAi, capture }) {
  const original = { models: cliAi.models, config: cliAi.config, configure: cliAi.configure, status: cliAi.status };
  let savedModel = 'stored-custom', fail = false;
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  const state = { aiProvider: 'claude_cli', name: '샘플 바리스타', speech: '모델 메뉴 UI 검사용 샘플입니다.' };
  const ready = async () => {
    for (let i = 0; i < 60; i++) {
      await pause();
      if (await win.webContents.executeJavaScript("!document.querySelector('#ai-model-refresh').disabled")) return;
    }
    throw new Error('Model picker UI did not settle');
  };
  try {
    cliAi.status = provider => original.status(provider);
    cliAi.config = provider => ({ ...original.config(provider), model: savedModel });
    cliAi.configure = (provider, settings) => { savedModel = settings.model; return cliAi.config(provider); };
    cliAi.models = async provider => {
      if (fail) throw new Error('샘플 조회 실패');
      return { provider, source: 'claude-agent-sdk', checkedAt: new Date().toISOString(), models: [{ value: 'mock-model', label: '샘플 모델 · 실제 모델 아님', description: '', reasoningEfforts: [], isDefault: false }] };
    };
    await post('state', state, token);
    await pause();
    await win.webContents.executeJavaScript("document.querySelector('#settings-button').click()");
    await ready();
    const loaded = await win.webContents.executeJavaScript("document.querySelector('#ai-model').textContent.includes('실제 모델 아님') && document.querySelector('#ai-model').value === 'stored-custom'");
    await win.webContents.executeJavaScript("document.querySelector('#ai-model').value = 'mock-model'; document.querySelector('#ai-model').dispatchEvent(new Event('change')); document.querySelector('#ai-model-save').click()");
    await ready();
    const saved = savedModel === 'mock-model' && await win.webContents.executeJavaScript("document.querySelector('#ai-model-message').textContent.includes('저장했습니다')");
    await win.webContents.executeJavaScript("document.querySelector('#ai-model-settings').scrollIntoView({block:'center'})");
    await pause(); await capture('model-settings.png');
    fail = true;
    await win.webContents.executeJavaScript("document.querySelector('#ai-model-refresh').click()");
    await ready();
    const failure = await win.webContents.executeJavaScript("document.querySelector('#ai-model-message').textContent.includes('샘플 조회 실패') && !document.querySelector('#ai-model').textContent.includes('실제 모델 아님') && document.querySelector('#ai-model').value === 'mock-model'");
    await win.webContents.executeJavaScript("document.querySelector('#ai-model').value='__custom__'; document.querySelector('#ai-model').dispatchEvent(new Event('change')); document.querySelector('#ai-model-custom').value='manual-model'; document.querySelector('#ai-model-custom').dispatchEvent(new Event('input')); document.querySelector('#ai-model-save').click()");
    await ready();
    const manual = savedModel === 'manual-model';
    await post('state', { aiProvider: 'codex_cli' }, token); await pause();
    const cleared = await win.webContents.executeJavaScript("!document.querySelector('#ai-model').textContent.includes('실제 모델 아님')");
    await win.webContents.executeJavaScript("document.querySelector('#settings-button').click()");
    return { modelPickerLoaded: loaded, modelPickerSaved: saved, modelPickerFailure: failure, modelPickerManual: manual, modelPickerProviderReset: cleared };
  } finally { Object.assign(cliAi, original); }
};
