// AI 바리스타 대화 — 메시지 배열을 질문/답변 쌍으로 묶는다.
import type { KnowledgeEvidence } from "./knowledge/contracts";

export interface CopilotMessage {
  role: "user" | "ai";
  text: string;
  fallback?: boolean;
  evidences?: KnowledgeEvidence[];
}

export interface QaPair {
  id: string;
  userText?: string;
  aiText?: string;
  fallback?: boolean;
  evidences?: KnowledgeEvidence[];
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
      current.evidences = msg.evidences;
    } else {
      current = {
        id: `qa-ai-${idx}`,
        aiText: msg.text,
        fallback: msg.fallback,
        evidences: msg.evidences,
      };
      pairs.push(current);
    }
  });

  return pairs;
}
