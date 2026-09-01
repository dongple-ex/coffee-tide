import { describe, expect, it } from "vitest";
import { buildCopilotSystemInstruction } from "./harness";

describe("buildCopilotSystemInstruction conversation modes", () => {
  it("disables briefing structure for social conversation", () => {
    const prompt = buildCopilotSystemInstruction("2026년 9월 1일", "Asia/Seoul", undefined, {
      mode: "social",
    });
    expect(prompt).toContain("CURRENT RESPONSE MODE: SOCIAL CONVERSATION");
    expect(prompt).toContain("브리핑 구조 비활성");
    expect(prompt).not.toContain("오전 집중 업무");
    expect(prompt).not.toContain("오후 소통 & 협업");
  });

  it("keeps evidence and briefing rules available for work", () => {
    const prompt = buildCopilotSystemInstruction("2026년 9월 1일", "Asia/Seoul", undefined, {
      mode: "work",
    });
    expect(prompt).toContain("CURRENT RESPONSE MODE: WORK ASSISTANCE");
    expect(prompt).toContain("일일 브리핑 요청일 때만 오전 집중 업무");
  });

  it("explicitly prohibits productivity advice during repair", () => {
    const prompt = buildCopilotSystemInstruction("2026년 9월 1일", "Asia/Seoul", undefined, {
      mode: "repair",
    });
    expect(prompt).toContain("생산성 조언을 하지 마세요");
    expect(prompt).toContain("업무 브리핑 형식과 Spark 섹션을 사용하지 마세요");
  });
});
