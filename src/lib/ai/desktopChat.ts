export interface DesktopChatRequest {
  requestId: string;
  text: string;
  mode: "talk" | "work";
  history: { role: "user" | "assistant"; text: string }[];
}
export type DesktopChatResult = { requestId: string; answer?: string; error?: string };

function isRequest(value: unknown): value is DesktopChatRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as DesktopChatRequest;
  return typeof request.requestId === "string" && /^[a-f0-9-]{36}$/i.test(request.requestId) &&
    typeof request.text === "string" && !!request.text.trim() && request.text.length <= 6000 &&
    ["talk", "work"].includes(request.mode) && Array.isArray(request.history) && request.history.length <= 8 &&
    request.history.every(turn => turn && ["user", "assistant"].includes(turn.role) && typeof turn.text === "string" && turn.text.length <= 1200);
}

// The native bridge repeats an unacknowledged request. Run the AI once, then retry only delivery.
export function createDesktopChatRelay(
  answer: (request: DesktopChatRequest) => Promise<string | undefined> | void,
  deliver: (result: DesktopChatResult) => Promise<void>,
) {
  const requests = new Map<string, { result?: DesktopChatResult; pending?: Promise<void> }>();
  let disposed = false;
  let answering = false;
  return {
    async handle(value: unknown) {
      if (disposed || !isRequest(value)) return;
      let entry = requests.get(value.requestId);
      if (entry?.pending) return entry.pending;
      if (!entry) {
        entry = {};
        requests.set(value.requestId, entry);
        if (requests.size > 16) {
          const oldest = [...requests].find(([, item]) => item.result && !item.pending);
          if (oldest) requests.delete(oldest[0]);
        }
      }
      const current = entry;
      current.pending = (async () => {
        if (!current.result) {
          if (answering) current.result = { requestId: value.requestId, error: "이전 질문을 처리 중입니다. 잠시 후 다시 보내 주세요." };
          else {
            answering = true;
            try {
              const text = await answer(value);
              current.result = typeof text === "string" && text.trim()
                ? { requestId: value.requestId, answer: text.slice(0, 12000) }
                : { requestId: value.requestId, error: "답변을 받지 못했습니다. 웹에서 처리 상태를 확인해 주세요." };
            } catch {
              current.result = { requestId: value.requestId, error: "답변 요청에 실패했습니다. 웹의 AI 연결 상태를 확인해 주세요." };
            } finally { answering = false; }
          }
        }
        if (!disposed) await deliver(current.result);
      })();
      try { await current.pending; } finally { current.pending = undefined; }
    },
    dispose() { disposed = true; requests.clear(); },
  };
}
