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

  it.each([
    ["오늘 점심 2만 3천원", "23000"],
    ["점심 2만3천원", "23000"],
    ["택시비 1만 5백원", "10500"],
    ["회의비 12만 3500원", "123500"],
  ])("한국어 단위 금액 '%s'을 %s원으로 환산한다", (text, expected) => {
    expect(parseExpenseText(text).amount).toBe(expected);
  });

  it.each([
    ["맥도날드에서 점심 2만 3천원", "맥도날드"],
    ["오늘 점심 김밥천국 9천원 법인카드", "김밥천국"],
    ["사용처: 동네분식 금액 8000원", "동네분식"],
    ["점심 12000원 버거킹", "버거킹"],
  ])("하드코딩되지 않은 사용처를 '%s'에서 추출한다", (text, expected) => {
    expect(parseExpenseText(text).merchant).toBe(expected);
  });

  it("상호가 없는 일반 비용 문장에는 사용처를 임의 생성하지 않는다", () => {
    expect(parseExpenseText("오늘 점심 2만 3천원").merchant).toBeUndefined();
  });
});
