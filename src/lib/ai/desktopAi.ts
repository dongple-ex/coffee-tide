import { buildCopilotSystemInstruction, type CopilotUserConfig } from "./harness";

export type TerminalAiProvider = "claude_cli" | "codex_cli";
export interface TerminalAiSettings { executablePath: string; workingDirectory: string; model: string; defaultDirectory?: string }
export interface TerminalAiReply { answer: string; provider: TerminalAiProvider; model?: string; requestId: string }
const BRIDGE_URL = "http://127.0.0.1:47381";
interface TerminalConnection { token: string; supported: boolean }
let connection: TerminalConnection | null = null;
let currentRequest: { id: string; connection: TerminalConnection; abort: AbortController } | null = null;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach(listener => listener());

export function subscribeTerminalAi(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function terminalAiConnected() { return Boolean(connection?.supported); }
export function terminalAiDisconnected() { return false; }
export function registerTerminalAi(token: string, supported: boolean) {
  const registered = { token, supported };
  connection = registered; publish();
  return () => {
    if (connection === registered) {
      cancelTerminalAi();
      connection = null; publish();
    }
  };
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
  if (!response.ok) throw new Error(data.error || "터미널 AI 요청에 실패했습니다.");
  return data;
}

function requireConnection() {
  if (!connection) throw new Error("데스크톱 앱을 실행하고 6자리 코드로 연결해 주세요.");
  if (!connection.supported) throw new Error("터미널 AI를 지원하는 데스크톱 앱으로 업데이트해 주세요.");
  return connection;
}
export async function terminalAiConfig(provider: TerminalAiProvider, settings?: TerminalAiSettings) {
  return post<{ config: TerminalAiSettings }>(requireConnection(), "config", { provider, settings }, AbortSignal.timeout(5000));
}
export async function checkTerminalAi(provider: TerminalAiProvider) {
  return post<{ installed: boolean; version: string; executable: string }>(requireConnection(), "check", { provider }, AbortSignal.timeout(15000));
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
