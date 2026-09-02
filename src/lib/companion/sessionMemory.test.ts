import { describe, it, expect } from "vitest";
import {
  getOrCreateCompanionSession,
  appendSessionTurn,
  getSessionContextForPrompt,
} from "./sessionMemory";

describe("Companion Session Memory Manager (Phase 17-B)", () => {
  it("새로운 세션이 생성되고 메시지 턴이 순차적으로 기록된다", () => {
    const session = appendSessionTurn("sess_1", {
      role: "user",
      content: "오늘 오후 2시 회의 준비 도와줘",
    });

    expect(session.sessionId).toBe("sess_1");
    expect(session.turns.length).toBe(1);
    expect(session.turns[0].content).toContain("회의 준비");
  });

  it("10턴을 초과하면 오래된 턴이 정리되고 롤링 요약이 생성된다", () => {
    const sessionId = "sess_rolling_test";
    for (let i = 1; i <= 15; i++) {
      appendSessionTurn(sessionId, {
        role: i % 2 === 1 ? "user" : "assistant",
        content: `대화 메시지 #${i}`,
      });
    }

    const session = getOrCreateCompanionSession(sessionId);
    expect(session.turns.length).toBe(10);
    expect(session.rollingSummary).toBeDefined();
    expect(session.rollingSummary).toContain("대화 메시지 #1");
  });

  it("프롬프트용 세션 컨텍스트 문자열이 올바르게 생성된다", () => {
    const sessionId = "sess_prompt_test";
    appendSessionTurn(sessionId, { role: "user", content: "기획서 초안 작성할래" });
    appendSessionTurn(sessionId, { role: "assistant", content: "좋습니다, 목차부터 정리할까요?" });

    const session = getOrCreateCompanionSession(sessionId);
    const contextStr = getSessionContextForPrompt(session);

    expect(contextStr).toContain("사용자: 기획서 초안 작성할래");
    expect(contextStr).toContain("AI 바리스타: 좋습니다, 목차부터 정리할까요?");
  });
});
