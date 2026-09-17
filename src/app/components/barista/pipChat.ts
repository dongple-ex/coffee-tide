export interface PipChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface PipChatTurn {
  id: number;
  userText: string;
  aiText?: string;
  error?: string;
}

// 완료된 최근 10문답만 전달한다. 실패/대기 메시지는 AI 대화 이력에 넣지 않는다.
export function getPipChatHistory(turns: PipChatTurn[]): PipChatMessage[] {
  return turns.filter((turn) => turn.aiText && !turn.error).slice(-10).flatMap((turn) => [
    { role: "user" as const, text: turn.userText },
    { role: "assistant" as const, text: turn.aiText! },
  ]);
}
