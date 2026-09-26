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

  it("김부장 호감도 레벨에 따라 Lv.2(큐레이션/템플릿), Lv.3(속마음/개그), Lv.4(캔버스 초안) 칩이 단계별로 해금된다", () => {
    // Lv.1: 기본 칩만 존재
    const kimLv1 = getQuickReplies({ presetId: "kim", baristaName: "김부장", relationshipLevel: 1 });
    expect(kimLv1.some((c) => c.id === "kim_talk")).toBe(true);
    expect(kimLv1.some((c) => c.id === "kim_curation_lv2")).toBe(false);
    expect(kimLv1.some((c) => c.id === "kim_secret_humor_lv3")).toBe(false);
    expect(kimLv1.some((c) => c.id === "kim_canvas_draft_lv4")).toBe(false);

    // Lv.2: 큐레이션 및 템플릿 해금
    const kimLv2 = getQuickReplies({ presetId: "kim", baristaName: "김부장", relationshipLevel: 2 });
    expect(kimLv2.some((c) => c.id === "kim_curation_lv2")).toBe(true);
    expect(kimLv2.some((c) => c.id === "kim_template_lv2")).toBe(true);
    expect(kimLv2.some((c) => c.id === "kim_secret_humor_lv3")).toBe(false);

    // Lv.3: 시크릿 속마음 & 유머 해금
    const kimLv3 = getQuickReplies({ presetId: "kim", baristaName: "김부장", relationshipLevel: 3 });
    expect(kimLv3.some((c) => c.id === "kim_secret_humor_lv3")).toBe(true);
    expect(kimLv3.some((c) => c.id === "kim_canvas_draft_lv4")).toBe(false);

    // Lv.4: 캔버스 기안서 초안 해금
    const kimLv4 = getQuickReplies({ presetId: "kim", baristaName: "김부장", relationshipLevel: 4 });
    expect(kimLv4.some((c) => c.id === "kim_canvas_draft_lv4")).toBe(true);
  });
});
