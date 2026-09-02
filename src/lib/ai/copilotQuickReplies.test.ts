import { describe, it, expect } from "vitest";
import { getQuickReplies } from "./copilotQuickReplies";

describe("티키타카 추천 답변 엔진 (Quick Replies)", () => {
  it("긴급 업무가 있을 때는 긴급 마감 관련 액션 칩을 최우선으로 제안한다", () => {
    const chips = getQuickReplies({
      presetId: "karina",
      baristaName: "카리나",
      hasUrgentTasks: true,
      taskCount: 5,
    });

    const urgentChip = chips.find((c) => c.id === "urgent_focus");
    expect(urgentChip).toBeDefined();
    expect(urgentChip?.category).toBe("productivity");
  });

  it("캐릭터 프리셋에 맞춰 롤플레잉 선택지 칩이 올바르게 생성된다", () => {
    const karinaChips = getQuickReplies({ presetId: "karina", baristaName: "카리나" });
    expect(karinaChips.some((c) => c.id === "karina_talk")).toBe(true);

    const kimChips = getQuickReplies({ presetId: "kim", baristaName: "김부장" });
    expect(kimChips.some((c) => c.id === "kim_talk")).toBe(true);

    const poppyChips = getQuickReplies({ presetId: "poppy", baristaName: "뽀삐" });
    expect(poppyChips.some((c) => c.id === "poppy_talk")).toBe(true);
  });

  it("캔버스가 활성화되어 있으면 캔버스 문서화 지원 칩이 포함된다", () => {
    const chips = getQuickReplies({
      presetId: "karina",
      canvasEnabled: true,
    });
    expect(chips.some((c) => c.id === "canvas_action")).toBe(true);
  });
});
