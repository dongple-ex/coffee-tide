import { describe, it, expect } from "vitest";
import { searchKnowledge } from "./search";
import type { ItemRelation, WorkspaceItem } from "../data/contracts";

describe("Phase 14-06: 지식 검색 및 근거 패키징 테스트", () => {
  const items: WorkspaceItem[] = [
    {
      id: "meeting-101",
      source: "manual",
      title: "8월 12일 고객 회의록",
      content: "고객 요구사항 전달 및 일정 협의",
      created_at: "2026-08-12T10:00:00Z",
      author: { name: "User" },
      url: "",
      status: "completed",
      version: 1,
      itemType: "meeting",
      privacyScope: "cloud_private",
      aiPolicy: "cloud_allowed",
      updatedAt: "2026-08-12T10:00:00Z",
    },
    {
      id: "task-201",
      source: "manual",
      title: "후속 기획서 초안 작성",
      content: "고객 피드백 반영한 기획서",
      created_at: "2026-08-12T11:00:00Z",
      author: { name: "User" },
      url: "",
      status: "pending",
      version: 1,
      itemType: "task",
      privacyScope: "cloud_private",
      aiPolicy: "cloud_allowed",
      updatedAt: "2026-08-12T11:00:00Z",
    },
    {
      id: "exp-301",
      source: "manual",
      title: "고객 미팅 택시비 18,500원",
      content: "카카오택시 이용",
      created_at: "2026-08-12T12:00:00Z",
      author: { name: "User" },
      url: "",
      status: "pending",
      version: 1,
      itemType: "expense",
      attributes: { amount: "18500", currency: "KRW", category: "교통비" },
      privacyScope: "cloud_private",
      aiPolicy: "cloud_allowed",
      updatedAt: "2026-08-12T12:00:00Z",
    },
  ];

  const relations: ItemRelation[] = [
    {
      id: "rel-1",
      fromItemId: "meeting-101",
      toItemId: "task-201",
      relationType: "contains_task",
      createdBy: "user",
      createdAt: "2026-08-12T10:30:00Z",
    },
    {
      id: "rel-2",
      fromItemId: "meeting-101",
      toItemId: "exp-301",
      relationType: "expense_for",
      createdBy: "user",
      createdAt: "2026-08-12T12:30:00Z",
    },
  ];

  it("K01: 회의 연관 후속 업무 검색 시 relation 기반 근거를 높은 점수로 반환한다", () => {
    const pkg = searchKnowledge(items, relations, {
      query: "고객 회의",
      relatedTo: "meeting-101",
      executionPolicy: "cloud_allowed",
    });

    expect(pkg.evidence.length).toBeGreaterThan(0);
    const relatedTask = pkg.evidence.find((e) => e.itemId === "task-201");
    expect(relatedTask).toBeDefined();
    expect(relatedTask?.scoreReason).toBe("relation");
  });

  it("K02: 비용 항목 검색 시 구조화된 사실(StructuredFact)을 패키징한다", () => {
    const pkg = searchKnowledge(items, relations, {
      query: "택시비",
      executionPolicy: "cloud_allowed",
    });

    const expEvidence = pkg.evidence.find((e) => e.itemId === "exp-301");
    expect(expEvidence).toBeDefined();

    const amountFact = pkg.structuredFacts.find((f) => f.key.includes("amount"));
    expect(amountFact?.value).toBe("18500");
  });
});
