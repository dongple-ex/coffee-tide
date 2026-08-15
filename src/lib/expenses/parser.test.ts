import { describe, it, expect } from "vitest";
import { parseExpenseText } from "./parser";

describe("Phase 14-05: 비용 자연어 파서 테스트", () => {
  it("E01: '오늘 점심 12,000원 법인카드' 문장에서 금액, 통화, 카테고리, 결제수단을 정확히 추출한다", () => {
    const draft = parseExpenseText("오늘 점심 12,000원 법인카드");

    expect(draft.amount).toBe("12000");
    expect(draft.currency).toBe("KRW");
    expect(draft.category).toBe("식비");
    expect(draft.paymentMethod).toBe("법인카드");
    expect(draft.confidence.amount).toBeGreaterThan(0.8);
  });

  it("E02: 금액이 없는 문장은 amount가 undefined로 반환된다", () => {
    const draft = parseExpenseText("회의 후 카페 방문");

    expect(draft.amount).toBeUndefined();
    expect(draft.category).toBe("식비");
  });

  it("E03: 'USD 25 택시비' 입력 시 USD 통화가 보존된다", () => {
    const draft = parseExpenseText("USD 25 택시비");

    expect(draft.amount).toBe("25");
    expect(draft.currency).toBe("USD");
    expect(draft.category).toBe("교통비");
  });
});
