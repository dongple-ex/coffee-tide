const MODEL_ID = /^[a-zA-Z0-9_.:/-]+(?:\[[a-zA-Z0-9_-]+\])?$/;
const safeText = (value, max) => typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : '';

function normalizeModels(provider, rows) {
  if (!Array.isArray(rows) || rows.length > 500) throw new Error('invalid_models');
  const models = new Map();
  for (const row of rows) {
    if (!row || row.hidden === true) continue;
    const value = safeText(provider === 'claude_cli' ? row.value : row.model, 100);
    const label = safeText(row.displayName, 160);
    if (!value || !MODEL_ID.test(value) || !label) continue;
    const levels = provider === 'claude_cli' ? row.supportedEffortLevels : row.supportedReasoningEfforts?.map(item => item?.reasoningEffort);
    models.set(value, {
      value, label, description: safeText(row.description, 500),
      reasoningEfforts: Array.isArray(levels) ? [...new Set(levels.filter(level => typeof level === 'string' && /^[a-z0-9_-]{1,32}$/.test(level)))].slice(0, 16) : [],
      isDefault: provider === 'codex_cli' && row.isDefault === true,
    });
  }
  if (!models.size) throw new Error('empty_models');
  return [...models.values()];
}

// Metadata only: initialize and list all pages; never create a thread or a turn.
function codexModelsProtocol() {
  const rows = [], cursors = new Set();
  let requestId = 1, complete = false;
  return {
    initial: { id: 1, method: 'initialize', params: { clientInfo: { name: 'coffeetide_barista', title: 'CoffeeTide Barista', version: require('./package.json').version } } },
    onLine(line, stdin) {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (complete || message.id !== requestId) return;
      if (message.error) throw new Error('model_list_failed');
      let cursor;
      if (requestId === 1) stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
      else {
        if (!Array.isArray(message.result?.data)) throw new Error('invalid_models');
        rows.push(...message.result.data);
        if (rows.length > 500) throw new Error('too_many_models');
        cursor = message.result.nextCursor;
        if (cursor == null) { complete = true; stdin.end(); return; }
        if (typeof cursor !== 'string' || !cursor || cursor.length > 4096 || cursors.has(cursor) || cursors.size >= 10) throw new Error('invalid_cursor');
        cursors.add(cursor);
      }
      stdin.write(JSON.stringify({ id: ++requestId, method: 'model/list', params: { limit: 100, includeHidden: false, ...(cursor ? { cursor } : {}) } }) + '\n');
    },
    result() { if (!complete) throw new Error('incomplete_models'); return rows; },
  };
}

async function claudeModels({ executable, cwd, signal, loadSdk = () => import('@anthropic-ai/claude-agent-sdk') }) {
  const { query } = await loadSdk();
  signal.throwIfAborted();
  let session, releaseInput;
  // Leave stdin open for initialization, but send no user message or inference turn.
  const input = { [Symbol.asyncIterator]: () => ({
    next: () => new Promise(resolve => { releaseInput = () => resolve({ done: true }); }),
    return: async () => { releaseInput?.(); return { done: true }; },
  }) };
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = () => { rejectAbort(signal.reason); releaseInput?.(); session?.close(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    session = query({ prompt: input, options: {
      pathToClaudeCodeExecutable: executable, cwd, persistSession: false,
      tools: [], disallowedTools: ['mcp__*'], permissionMode: 'dontAsk',
      settingSources: ['user', 'project', 'local'],
      extraArgs: { 'safe-mode': null },
    } });
    return await Promise.race([session.supportedModels(), aborted]);
  } finally {
    signal.removeEventListener('abort', abort);
    releaseInput?.(); session?.close();
  }
}

module.exports = { MODEL_ID, normalizeModels, codexModelsProtocol, claudeModels };
