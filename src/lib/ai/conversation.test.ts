import { describe, expect, it } from "vitest";
import {
  conversationFallback,
  isConversationOnlyMode,
  routeConversation,
} from "./conversation";

describe("routeConversation", () => {
  it.each([
    ["안녕", "social"],
    ["테드 아재개그 잘하네", "social"],
    ["오늘 너무 지쳤어", "supportive"],
    ["일 얘기 그만하고 나랑 대화해", "repair"],
    ["AI 답변이 일처리만 주는데 이게 맞아?", "repair"],
    ["그거 해줘", "clarify"],
    ["오늘 할 일을 우선순위대로 정리해줘", "work"],
    ["오늘 뭐부터 해야 해?", "work"],
    ["새로 온 메일 있어?", "work"],
    ["내일 회의를 캘린더에 등록해줘", "command"],
    ["너무 지쳤는데 오늘 할 일 세 개만 정리해줘", "mixed"],
  ] as const)("%s => %s", (text, expectedMode) => {
    expect(routeConversation({ text }).mode).toBe(expectedMode);
  });

  it("uses talk mode as a hard no-tool boundary", () => {
    const route = routeConversation({
      text: "오늘 할 일 정리해줘",
      explicitMode: "talk",
    });
    expect(route.mode).toBe("social");
    expect(route.needsWorkContext).toBe(false);
    expect(route.allowCloudTools).toBe(false);
  });

  it("only treats conversational modes as context-free", () => {
    expect(isConversationOnlyMode("social")).toBe(true);
    expect(isConversationOnlyMode("repair")).toBe(true);
    expect(isConversationOnlyMode("work")).toBe(false);
    expect(isConversationOnlyMode("mixed")).toBe(false);
  });
});

describe("conversationFallback", () => {
  it("does not fall back to a work briefing for praise", () => {
    const answer = conversationFallback("테드 아재개그 잘하네", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    expect(answer).toContain("빌드는 성공");
    expect(answer).not.toContain("최우선 업무");
    expect(answer).not.toContain("브리핑");
  });

  it("acknowledges a conversation repair request", () => {
    const answer = conversationFallback("일 얘기 그만해", "repair");
    expect(answer).toContain("업무 브리핑 없이");
  });
});
