import { describe, it, expect } from "vitest";
import {
  validateAiArtifact,
  validateContentAsset,
  validateExpenseEntry,
  validateItemRelation,
  validateWorkspaceItem,
} from "./validation";

describe("Phase 14-02: 데이터 계약 및 유효성 검증 테스트", () => {
  describe("D08: 비용 데이터 유효성 검증 (validateExpenseEntry)", () => {
    it("정상적인 비용 항목은 유효성을 통과한다", () => {
      const result = validateExpenseEntry({
        itemId: "exp-1",
        amount: "15000",
        currency: "KRW",
        occurredAt: "2026-08-14T09:00:00.000Z",
        merchant: "스타벅스",
        category: "식비",
        taxDeductible: true,
        reimbursable: false,
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("음수 금액이나 잘못된 숫자 형식은 거부된다", () => {
      const negativeResult = validateExpenseEntry({
        itemId: "exp-2",
        amount: "-500",
        currency: "KRW",
        occurredAt: "2026-08-14T09:00:00.000Z",
      });
      expect(negativeResult.valid).toBe(false);

      const invalidFormatResult = validateExpenseEntry({
        itemId: "exp-3",
        amount: "15,000원",
        currency: "KRW",
        occurredAt: "2026-08-14T09:00:00.000Z",
      });
      expect(invalidFormatResult.valid).toBe(false);
    });

    it("잘못된 통화 코드(소문자, 3자리 미만)는 거부된다", () => {
      const result = validateExpenseEntry({
        itemId: "exp-4",
        amount: "100",
        currency: "krw", // 소문자
        occurredAt: "2026-08-14T09:00:00.000Z",
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("관계 유효성 검증 (validateItemRelation)", () => {
    it("정상적인 항목 간 관계는 유효성을 통과한다", () => {
      const result = validateItemRelation({
        fromItemId: "item-1",
        toItemId: "item-2",
        relationType: "derived_from",
        createdBy: "ai",
        confidence: 0.95,
      });
      expect(result.valid).toBe(true);
    });

    it("D10: 자기 자신을 향하는 관계(from === to)는 거부된다", () => {
      const result = validateItemRelation({
        fromItemId: "item-1",
        toItemId: "item-1",
        relationType: "related_to",
        createdBy: "user",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("자기 참조 관계 금지");
    });

    it("confidence 범위(0~1)를 벗어난 경우 거부된다", () => {
      const result = validateItemRelation({
        fromItemId: "item-1",
        toItemId: "item-2",
        relationType: "contains_task",
        createdBy: "ai",
        confidence: 1.5,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe("D09: AI 아티팩트 유효성 검증 (validateAiArtifact)", () => {
    it("텍스트 또는 JSON 내용이 있는 경우 통과한다", () => {
      const textResult = validateAiArtifact({
        itemId: "item-1",
        artifactType: "summary",
        provider: "gemini",
        model: "gemini-2.5-flash",
        contentText: "회의 요약문입니다.",
      });
      expect(textResult.valid).toBe(true);

      const jsonResult = validateAiArtifact({
        itemId: "item-1",
        artifactType: "task_extract",
        provider: "gemini",
        model: "gemini-2.5-flash",
        contentJson: { tasks: [{ title: "할 일" }] },
      });
      expect(jsonResult.valid).toBe(true);
    });

    it("내용이 모두 없는 AI 결과는 거부된다", () => {
      const emptyResult = validateAiArtifact({
        itemId: "item-1",
        artifactType: "summary",
        provider: "gemini",
        model: "gemini-2.5-flash",
      });
      expect(emptyResult.valid).toBe(false);
    });
  });

  describe("자산 및 공통 항목 유효성 검증", () => {
    it("ContentAsset 유효성 검증", () => {
      const valid = validateContentAsset({
        itemId: "item-1",
        kind: "document",
        provider: "google_drive",
        providerRef: "drive-file-id-123",
      });
      expect(valid.valid).toBe(true);
    });

    it("WorkspaceItem 기본 검증", () => {
      const valid = validateWorkspaceItem({
        id: "task-1",
        title: "기획안 작성",
      });
      expect(valid.valid).toBe(true);
    });
  });
});
