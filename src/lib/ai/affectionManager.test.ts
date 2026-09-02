import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateLevelInfo,
  addAffectionExp,
  getAffectionState,
  saveAffectionState,
} from "./affectionManager";

describe("생산성 기반 호감도 관리자 (Affection Manager)", () => {
  beforeEach(() => {
    // 로컬 상태 초기화
    saveAffectionState({
      presetId: "karina",
      exp: 0,
      completedTasksCount: 0,
      totalInteractions: 0,
      lastUpdated: Date.now(),
    });
  });

  it("0 EXP일 때 레벨 1 (낯선 시작)으로 시작한다", () => {
    const calc = calculateLevelInfo(0);
    expect(calc.levelInfo.level).toBe(1);
    expect(calc.levelInfo.title).toBe("낯선 시작");
    expect(calc.progressPercent).toBe(0);
  });

  it("경험치 증가에 따라 레벨이 올바르게 상승한다", () => {
    // 150 EXP -> Lv.2
    const calc2 = calculateLevelInfo(150);
    expect(calc2.levelInfo.level).toBe(2);
    expect(calc2.levelInfo.title).toBe("믿음직한 동료");

    // 450 EXP -> Lv.3
    const calc3 = calculateLevelInfo(450);
    expect(calc3.levelInfo.level).toBe(3);
    expect(calc3.levelInfo.title).toBe("척하면 척 단짝");

    // 750 EXP -> Lv.4
    const calc4 = calculateLevelInfo(750);
    expect(calc4.levelInfo.level).toBe(4);
    expect(calc4.levelInfo.title).toBe("각별한 파트너");

    // 1000+ EXP -> Lv.5 (소울메이트)
    const calc5 = calculateLevelInfo(1200);
    expect(calc5.levelInfo.level).toBe(5);
    expect(calc5.levelInfo.title).toBe("소울메이트");
    expect(calc5.isMaxLevel).toBe(true);
    expect(calc5.progressPercent).toBe(100);
  });

  it("할 일 완료(complete_task) 시 호감도 EXP가 12점씩 올라간다", () => {
    const result = addAffectionExp("karina", "complete_task");
    expect(result.gainedExp).toBe(12);
    expect(result.newExp).toBe(12);

    const state = getAffectionState("karina");
    expect(state.exp).toBe(12);
    expect(state.completedTasksCount).toBe(1);
  });
});
