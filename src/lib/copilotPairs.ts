// AI 바리스타 대화 — 메시지 배열을 질문/답변 쌍으로 묶는다.
//
// 렌더링(대화 목록)과 미읽음 표시(unread 배지) 두 곳에서 같은 묶음이 필요하다.
// 각자 따로 계산하면 두 화면의 id가 어긋나 배지가 엉뚱한 쌍에 붙는다.

export interface CopilotMessage {
  role: "user" | "ai";
  text: string;
  fallback?: boolean;
}

export interface QaPair {
  id: string;
  userText?: string;
  aiText?: string;
  fallback?: boolean;
}

export function buildQaPairs(messages: CopilotMessage[]): QaPair[] {
  const pairs: QaPair[] = [];
  let current: QaPair | null = null;

  messages.forEach((msg, idx) => {
    if (msg.role === "user") {
      current = { id: `qa-${idx}`, userText: msg.text };
      pairs.push(current);
      return;
    }
    if (current && !current.aiText) {
      current.aiText = msg.text;
      current.fallback = msg.fallback;
    } else {
      current = { id: `qa-ai-${idx}`, aiText: msg.text, fallback: msg.fallback };
      pairs.push(current);
    }
  });

  return pairs;
}
