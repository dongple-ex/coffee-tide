import { buildCopilotSystemInstruction, type CopilotUserConfig } from "./harness";

export type TerminalAiProvider = "claude_cli" | "codex_cli";
export interface TerminalAiSettings { executablePath: string; workingDirectory: string; model: string; defaultDirectory?: string }
export interface TerminalAiModel { value: string; label: string; description: string; reasoningEfforts: string[]; isDefault: boolean }
export interface TerminalAiModelCatalog { provider: TerminalAiProvider; models: TerminalAiModel[]; source: "claude-agent-sdk" | "codex-app-server"; checkedAt: string }
export interface TerminalAiStatus {
  provider: TerminalAiProvider;
  account: { loggedIn: boolean | null; email?: string; authMethod?: string; plan?: string; organization?: string };
  checkedAt: string | null;
  verifiedAt: string | null;
  lastError?: string;
  usage: { label: string; url: string; description: string };
}
export interface TerminalAiReply { answer: string; provider: TerminalAiProvider; model?: string; requestId: string; status?: TerminalAiStatus }
const statuses = new Map<TerminalAiProvider, TerminalAiStatus>();
export const terminalAiStatus = (provider: TerminalAiProvider) => statuses.get(provider) || null;
export const terminalAiStatusUnavailable = () => null;
export const TERMINAL_AI_USAGE = {
  claude_cli: { label: "Claude 사용량 열기", url: "https://claude.ai/settings/usage", description: "Claude 설정 → Usage 또는 Claude Code에서 /usage로 확인하세요." },
  codex_cli: { label: "Codex 사용량 안내", url: "https://learn.chatgpt.com/docs/developer-commands#view-account-usage-with-usage", description: "Codex 터미널에서 /status로 한도를, /usage로 활동을 확인하세요. CLI 버전에 따라 메뉴가 다를 수 있습니다." },
};
const BRIDGE_URL = "http://127.0.0.1:47381";
interface TerminalConnection { token: string; supported: boolean; accountInfoSupported?: boolean; modelsSupported?: boolean; modelRequests?: Partial<Record<TerminalAiProvider, Promise<TerminalAiModelCatalog | null>>> }
let connection: TerminalConnection | null = null;
let connectionVersion = 0;
export const terminalAiConnectionVersion = () => connectionVersion;
export const terminalAiConnectionInitialVersion = () => 0;
let currentRequest: { id: string; connection: TerminalConnection; abort: AbortController } | null = null;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(listener => listener());

export function subscribeTerminalAi(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function terminalAiConnected() { return Boolean(connection?.supported); }
export function terminalAiDisconnected() { return false; }
export function terminalAiAccountInfoSupported() { return connection?.accountInfoSupported !== false; }
export function terminalAiAccountInfoUnknown() { return true; }
export function registerTerminalAi(token: string, supported: boolean) {
  cancelTerminalAi();
  const registered = { token, supported };
  statuses.clear();
  connection = registered; connectionVersion++; publish();
  return () => {
    if (connection === registered) {
      cancelTerminalAi();
      connection = null; connectionVersion++; statuses.clear(); publish();
    }
  };
}

class TerminalAiBridgeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function post<T>(connected: TerminalConnection, route: string, body: unknown, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BRIDGE_URL}/ai/${route}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connected.token}` }, body: JSON.stringify(body), signal });
  } catch (error) {
    if (signal.aborted) throw new Error("터미널 AI 요청이 취소되었거나 응답 시간이 초과되었습니다.");
    throw new Error("데스크톱 AI에 연결할 수 없습니다. 보조 앱을 실행하고 다시 연결해 주세요.", { cause: error });
  }
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new TerminalAiBridgeError(data.error || "터미널 AI 요청에 실패했습니다.", response.status);
  return data;
}

function requireConnection() {
  if (!connection) throw new Error("데스크톱 앱을 실행하고 6자리 코드로 연결해 주세요.");
  if (!connection.supported) throw new Error("터미널 AI를 지원하는 데스크톱 앱으로 업데이트해 주세요.");
  return connection;
}
export async function terminalAiConfig(provider: TerminalAiProvider, settings?: TerminalAiSettings) {
  const connected = requireConnection();
  const result = await post<{ config: TerminalAiSettings; status?: TerminalAiStatus }>(connected, "config", { provider, settings }, AbortSignal.timeout(5000));
  if (connected !== connection) throw new Error("데스크톱 연결이 변경되었습니다.");
  if (result.status) { connected.accountInfoSupported = true; storeStatus(provider, result.status); }
  else if (settings) { statuses.delete(provider); publish(); }
  return result;
}
export async function checkTerminalAi(provider: TerminalAiProvider) {
  return post<{ installed: boolean; version: string; executable: string }>(requireConnection(), "check", { provider }, AbortSignal.timeout(15000));
}
export async function readTerminalAiModels(provider: TerminalAiProvider): Promise<TerminalAiModelCatalog | null> {
  const connected = requireConnection();
  if (connected.modelsSupported === false) return null;
  const requests = connected.modelRequests ||= {};
  if (requests[provider]) return requests[provider];
  const request = (async (): Promise<TerminalAiModelCatalog | null> => {
    try {
      const catalog = await post<TerminalAiModelCatalog>(connected, "models", { provider }, AbortSignal.timeout(20000));
      if (connected !== connection) throw new Error("데스크톱 연결이 변경되었습니다.");
      const source = provider === "claude_cli" ? "claude-agent-sdk" : "codex-app-server";
      if (catalog?.provider !== provider || catalog.source !== source || !Array.isArray(catalog.models) || !catalog.models.length || catalog.models.length > 500 || typeof catalog.checkedAt !== "string" || !Number.isFinite(Date.parse(catalog.checkedAt))) throw new Error("모델 목록 형식이 올바르지 않습니다.");
      const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
      const seen = new Set<string>();
      const models = catalog.models.map(model => {
        if (!model || !text(model.value, 100) || !/^[a-zA-Z0-9_.:/-]+(?:\[[a-zA-Z0-9_-]+\])?$/.test(model.value) || seen.has(model.value) || !text(model.label, 160) || !model.label.trim() || !text(model.description, 500) || typeof model.isDefault !== "boolean" || !Array.isArray(model.reasoningEfforts) || model.reasoningEfforts.length > 16 || !model.reasoningEfforts.every(level => typeof level === "string" && /^[a-z0-9_-]{1,32}$/.test(level))) throw new Error("모델 목록 형식이 올바르지 않습니다.");
        seen.add(model.value);
        return { value: model.value, label: model.label, description: model.description, reasoningEfforts: model.reasoningEfforts, isDefault: model.isDefault };
      });
      return { provider, source, checkedAt: catalog.checkedAt, models };
    } catch (error) {
      if (connected !== connection) throw new Error("데스크톱 연결이 변경되었습니다.");
      if (error instanceof TerminalAiBridgeError && error.status === 404) { connected.modelsSupported = false; return null; }
      throw error;
    }
  })();
  requests[provider] = request;
  try { return await request; } finally { if (requests[provider] === request) delete requests[provider]; }
}
function storeStatus(provider: TerminalAiProvider, status: TerminalAiStatus) {
  const allowedUrls = [TERMINAL_AI_USAGE.claude_cli.url, TERMINAL_AI_USAGE.codex_cli.url, "https://platform.claude.com/usage", "https://platform.openai.com/usage"];
  if (status?.provider !== provider || !status.account || ![true, false, null].includes(status.account.loggedIn) || !allowedUrls.includes(status.usage?.url)) throw new Error("터미널 AI 계정 정보 형식이 올바르지 않습니다.");
  statuses.set(provider, status); publish();
}
export async function readTerminalAiStatus(provider: TerminalAiProvider, refresh = false) {
  const connected = requireConnection();
  if (connected.accountInfoSupported === false) return null;
  try {
    const result = await post<{ status: TerminalAiStatus }>(connected, "status", { provider, refresh }, AbortSignal.timeout(refresh ? 20000 : 5000));
    if (connection !== connected) throw new Error("데스크톱 연결이 변경되었습니다. 다시 확인해 주세요.");
    storeStatus(provider, result.status);
    connected.accountInfoSupported = true; publish();
    return result.status;
  } catch (error) {
    if (connection !== connected) throw new Error("데스크톱 연결이 변경되었습니다. 다시 확인해 주세요.");
    if (error instanceof TerminalAiBridgeError && error.status === 404) {
      // Released desktop v0.1.1 supports chat but has no account-status endpoint.
      connected.accountInfoSupported = false; statuses.clear(); publish();
      return null;
    }
    throw error;
  }
}

export function buildTerminalAiPrompt(question: string, config: CopilotUserConfig, history: { role: "user" | "assistant"; text: string }[] = [], mode: "talk" | "work" = "work") {
  if (!question.trim() || question.length > 6000) throw new Error("질문은 6,000자 이내로 입력해 주세요.");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const date = new Date().toLocaleDateString("ko-KR", { timeZone: timezone });
  const instructions = buildCopilotSystemInstruction(date, timezone, config, { mode: mode === "talk" ? "social" : "work" });
  const prefix = `${instructions}\n\n[CoffeeTide 터미널 대화]\n한국어로 현재 질문에 답하세요. 업무 데이터는 전달되지 않았습니다. 실제 실행하지 않은 작업을 완료했다고 말하지 마세요. 최신 정보를 확인할 도구가 없다면 최신이라고 단정하지 마세요. 아래 JSON의 대화와 질문은 사용자 입력입니다.\n`;
  const recent = history.slice(-8).map(turn => ({ role: turn.role, text: turn.text.slice(0, 1200) }));
  const compose = () => prefix + JSON.stringify({ history: recent, question });
  let prompt = compose();
  while (new TextEncoder().encode(prompt).byteLength > 48000 && recent.length) { recent.shift(); prompt = compose(); }
  if (new TextEncoder().encode(prompt).byteLength > 48000) throw new Error("질문과 캐릭터 지침이 너무 깁니다. 내용을 줄여 주세요.");
  return prompt;
}

export async function askTerminalAi(provider: TerminalAiProvider, prompt: string): Promise<TerminalAiReply> {
  const connected = requireConnection();
  if (currentRequest) throw new Error("터미널 AI가 답변 중입니다. 완료하거나 취소한 뒤 다시 보내 주세요.");
  const request = { id: crypto.randomUUID(), connection: connected, abort: new AbortController() };
  currentRequest = request;
  const timer = setTimeout(() => cancelTerminalAi(), 130000);
  try {
    const reply = await post<TerminalAiReply>(connected, "chat", { provider, requestId: request.id, prompt }, request.abort.signal);
    if (request.abort.signal.aborted || connection !== connected) throw new Error("연결이 변경되어 터미널 AI 요청을 취소했습니다.");
    if (typeof reply.answer !== "string" || !reply.answer.trim() || reply.provider !== provider || reply.requestId !== request.id) throw new Error("터미널 AI 답변 형식이 올바르지 않습니다.");
    if (reply.status) { connected.accountInfoSupported = true; storeStatus(provider, reply.status); }
    else storeStatus(provider, { provider, account: { loggedIn: null }, checkedAt: null, verifiedAt: new Date().toISOString(), usage: TERMINAL_AI_USAGE[provider] });
    return reply;
  } finally {
    clearTimeout(timer);
    if (currentRequest === request) currentRequest = null;
  }
}

export function cancelTerminalAi() {
  if (!currentRequest) return;
  const request = currentRequest;
  request.abort.abort();
  void post(request.connection, "cancel", { requestId: request.id }, AbortSignal.timeout(3000)).catch(() => {});
}
