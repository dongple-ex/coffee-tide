import { describe, expect, it } from "vitest";
import { getPipChatHistory } from "./pipChat";

describe("mini card conversation context", () => {
  it("keeps successful turns in order without failed or pending turns", () => {
    expect(getPipChatHistory([
      { id: 1, userText: "내 이름은 하나야", aiText: "반가워요" },
      { id: 2, userText: "실패한 질문", error: "연결 실패" },
      { id: 3, userText: "내 이름은?", aiText: "하나요" },
      { id: 4, userText: "아직 답변 중" },
    ])).toEqual([
      { role: "user", text: "내 이름은 하나야" }, { role: "assistant", text: "반가워요" },
      { role: "user", text: "내 이름은?" }, { role: "assistant", text: "하나요" },
    ]);
  });
  it("bounds context at ten complete pairs without orphaning a response", () => {
    const history = getPipChatHistory(Array.from({ length: 14 }, (_, id) => ({ id, userText: `q${id}`, aiText: `a${id}` })));
    expect(history).toHaveLength(20);
    expect(history[0]).toEqual({ role: "user", text: "q4" });
    expect(history.at(-1)).toEqual({ role: "assistant", text: "a13" });
  });
});
