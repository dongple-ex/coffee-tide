import { describe, it, expect } from "vitest";
import { buildItemRelation, hasDuplicateRelation } from "./service";
import type { ItemRelation } from "../data/contracts";

describe("Phase 14-04: 자료 간 명시적·AI 관계 테스트", () => {
  it("A06: 회의록에서 업무 2건 확정 시 관계 2건을 정상 생성하고 중복을 방지한다", () => {
    const meetingId = "meeting-1";
    const task1Id = "task-1";
    const task2Id = "task-2";

    const rel1 = buildItemRelation({
      fromItemId: meetingId,
      toItemId: task1Id,
      relationType: "contains_task",
      createdBy: "user",
    });

    const rel2 = buildItemRelation({
      fromItemId: meetingId,
      toItemId: task2Id,
      relationType: "contains_task",
      createdBy: "user",
    });

    const existing: ItemRelation[] = [rel1, rel2];

    expect(rel1.fromItemId).toBe(meetingId);
    expect(rel1.toItemId).toBe(task1Id);
    expect(rel1.relationType).toBe("contains_task");
    expect(rel1.confirmedAt).toBeDefined();

    // 중복 생성 검사
    const duplicateRel = buildItemRelation({
      fromItemId: meetingId,
      toItemId: task1Id,
      relationType: "contains_task",
      createdBy: "ai",
    });

    expect(hasDuplicateRelation(existing, duplicateRel)).toBe(true);
  });

  it("자기 자신을 참조하는 관계는 생성이 거부된다", () => {
    expect(() => {
      buildItemRelation({
        fromItemId: "item-1",
        toItemId: "item-1",
        relationType: "related_to",
      });
    }).toThrow("자기 참조 관계 금지");
  });
});
