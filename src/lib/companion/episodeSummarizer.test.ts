import { describe, it, expect } from "vitest";
import {
  parseCompanionResponse,
  createSafeFallbackCompanionResponse,
} from "./episodeSummarizer";

describe("Companion Response Parser & Validation (Phase 17-B)", () => {
  it("유효한 JSON 응답을 CompanionResponse 구조체로 정확하게 파싱한다", () => {
    const rawJson = JSON.stringify({
      narration: "안경을 고쳐 쓰며",
      message: "오늘 우선순위 1건을 먼저 끝내시는 것을 추천합니다.",
      suggestions: [
        {
          id: "s1",
          label: "25분 타이머 시작",
          action: "start_timer",
          payload: { durationMinutes: 25, taskTitle: "기획서 작성" },
        },
      ],
      evidenceRefs: ["item_1"],
      memoryRefs: ["mem_1"],
    });

    const parsed = parseCompanionResponse(rawJson);
    expect(parsed.narration).toBe("안경을 고쳐 쓰며");
    expect(parsed.message).toContain("우선순위 1건");
    expect(parsed.suggestions.length).toBe(1);
    expect(parsed.suggestions[0].action).toBe("start_timer");
    expect(parsed.suggestions[0].payload).toEqual({
      durationMinutes: 25,
      taskTitle: "기획서 작성",
    });
    expect(parsed.evidenceRefs).toEqual(["item_1"]);
  });

  it("JSON 형식이 깨진 텍스트여도 에러 없이 텍스트 메시지와 지문으로 안전하게 복구한다", () => {
    const rawText = `*미소를 지으며* 오늘 회의 준비는 다 끝나셨나요?`;
    const parsed = parseCompanionResponse(rawText);

    expect(parsed.narration).toBe("*미소를 지으며*");
    expect(parsed.message).toBe("오늘 회의 준비는 다 끝나셨나요?");
    expect(parsed.suggestions).toEqual([]);
  });

  it("모델 장애 시 안전한 Fallback 응답을 생성한다", () => {
    const fallback = createSafeFallbackCompanionResponse("카리나", "네트워크 지연");
    expect(fallback.narration).toBeDefined();
    expect(fallback.message).toContain("네트워크 지연");
    expect(fallback.suggestions.length).toBeGreaterThan(0);
  });
});
