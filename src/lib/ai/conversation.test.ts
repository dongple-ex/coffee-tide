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
    ["테드 자기소개해봐", "social"],
    ["일반적인 자연스러운 대화 하고싶은데", "social"],
    ["어떤거? 웹툰?", "social"],
    ["취미가 뭐야?", "social"],
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

  it("provides persona-authentic self-introduction for Ted", () => {
    const answer = conversationFallback("테드 자기소개해봐", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    expect(answer).toContain("10년 차 판교 시니어 개발자");
    expect(answer).toContain("테드");
    expect(answer).not.toContain("최우선 업무");
    expect(answer).not.toContain("브리핑");
  });

  it("handles casual conversation about webtoons naturally", () => {
    const answer = conversationFallback("어떤거? 웹툰?", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    expect(answer).toContain("웹툰");
    expect(answer).toContain("개발자들 사이에서도");
    expect(answer).not.toContain("최우선 업무");
  });

  it("guides user naturally for chat space meta questions like '여기서 얘기하나'", () => {
    const answer = conversationFallback("여기서 얘기하나", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    expect(answer).toContain("토크 라운지");
    expect(answer).toContain("터미널 밖에서");
  });

  it("shares persona-rich development philosophy for '개발이란?'", () => {
    const answer = conversationFallback("개발이란?", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    expect(answer).toContain("커피를 코드로 변환");
    expect(answer).toContain("아키텍처");
  });

  it("returns current local time and posture reminder for '지금 몇시야?'", () => {
    const answer = conversationFallback("지금 몇시야?", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    expect(answer).toContain("지금 시각은");
    expect(answer).toContain("시");
  });

  it("provides coffee menu comparison for '아메리카노 Vs 카페라떼'", () => {
    const answer = conversationFallback("아메리카노 Vs 카페라떼", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    expect(answer).toContain("아메리카노");
    expect(answer).toContain("카페라떼");
  });

  it("returns dynamic and different responses for different unmatched questions", () => {
    const answerA = conversationFallback("우주 끝에는 뭐가 있을까?", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    const answerB = conversationFallback("고양이가 귀여운 이유는?", "social", {
      presetId: "senior_dev",
      baristaName: "테드",
    });
    expect(answerA).not.toBe(answerB);
    expect(answerA.length).toBeGreaterThan(10);
    expect(answerB.length).toBeGreaterThan(10);
  });
});
