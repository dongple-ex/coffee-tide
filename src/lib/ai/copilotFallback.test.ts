import { describe, expect, it } from "vitest";
import type { UnifiedData } from "../types/unified";
import {
  buildChromeCanaryCopilotSystemPrompt,
  isDailyBriefingRequest,
  selectDailyBriefingEvidenceItems,
  shouldUseChromeCanaryAfterServer,
} from "./copilotFallback";

const item = (id: string, category: UnifiedData["category"], status: UnifiedData["status"]): UnifiedData => ({
  id,
  source: "manual",
  title: id,
  content: `${id} 내용`,
  created_at: "2026-09-14T08:00:00.000Z",
  author: { name: "User" },
  url: "",
  category,
  status,
});

describe("Copilot fallback policy", () => {
  it("keeps a grounded work briefing returned by the server fallback", () => {
    expect(shouldUseChromeCanaryAfterServer({
      aiFallback: true,
      answer: "실제 업무를 바탕으로 만든 브리핑",
      mode: "work",
    })).toBe(false);
  });

  it("allows on-device generation for conversational fallback or an empty server answer", () => {
    expect(shouldUseChromeCanaryAfterServer({
      aiFallback: true,
      answer: "준비된 대화 응답",
      mode: "social",
    })).toBe(true);
    expect(shouldUseChromeCanaryAfterServer({
      aiFallback: true,
      answer: "",
      mode: "work",
    })).toBe(true);
  });

  it("uses only active actionable items as daily briefing evidence", () => {
    const selected = selectDailyBriefingEvidenceItems([
      item("completed-archive", "reference", "completed"),
      item("meeting", "meeting", "pending"),
      item("urgent", "urgent", "pending"),
      item("dismissed", "action_required", "dismissed"),
    ]);

    expect(selected.map((entry) => entry.id)).toEqual(["urgent", "meeting"]);
    expect(isDailyBriefingRequest("오늘 해야 할 일을 브리핑해줘")).toBe(true);
  });

  it("injects the selected persona and relationship level without guessing the user's title", () => {
    const prompt = buildChromeCanaryCopilotSystemPrompt({
      config: {
        presetId: "secretary",
        baristaName: "김부장",
        tone: "formal",
      },
      relationshipLevel: 4,
      dateLabel: "2026년 9월 14일 월요일",
      timezone: "Asia/Seoul",
      mode: "work",
    });

    expect(prompt).toContain("Lv.4 각별한 파트너");
    expect(prompt).toContain('"김부장"은 AI 자신의 이름');
    expect(prompt).toContain("사용자의 이름이나 호칭으로 사용하지 마세요");
    expect(prompt).toContain("격식 있고 정중한 수석 비서 어조");
  });
});
