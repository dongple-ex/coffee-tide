import { describe, it, expect } from "vitest";
import {
  canItemBeIndexed,
  canItemBeSentToCloudAi,
  filterItemsByExecutionPolicy,
} from "./policy";
import type { WorkspaceItem } from "../data/contracts";

describe("Phase 14-06: 개인정보 및 AI 실행 정책 필터 테스트", () => {
  const baseItem: WorkspaceItem = {
    id: "item-1",
    source: "manual",
    title: "보안 기획서",
    content: "비공개 보안 내용",
    created_at: "2026-08-14T00:00:00Z",
    author: { name: "User" },
    url: "",
    status: "pending",
    version: 1,
    itemType: "document",
    privacyScope: "cloud_private",
    aiPolicy: "cloud_allowed",
    updatedAt: "2026-08-14T00:00:00Z",
  };

  it("P02: privacyScope가 local_only인 항목은 클라우드 AI 전송에서 제외된다", () => {
    const localOnlyItem: WorkspaceItem = {
      ...baseItem,
      privacyScope: "local_only",
    };

    expect(canItemBeSentToCloudAi(localOnlyItem)).toBe(false);
  });

  it("P03: aiPolicy가 disabled인 항목은 인덱싱 및 AI 전송 모두에서 제외된다", () => {
    const disabledItem: WorkspaceItem = {
      ...baseItem,
      aiPolicy: "disabled",
    };

    expect(canItemBeIndexed(disabledItem)).toBe(false);
    expect(canItemBeSentToCloudAi(disabledItem)).toBe(false);
  });

  it("P05: 삭제된(deletedAt) 항목은 검색 및 전송에서 모두 제외된다", () => {
    const deletedItem: WorkspaceItem = {
      ...baseItem,
      deletedAt: "2026-08-14T10:00:00Z",
    };

    expect(canItemBeIndexed(deletedItem)).toBe(false);
    expect(canItemBeSentToCloudAi(deletedItem)).toBe(false);
  });

  it("filterItemsByExecutionPolicy는 정책에 따라 허용/제외 항목을 정확히 분리한다", () => {
    const items: WorkspaceItem[] = [
      { ...baseItem, id: "item-cloud", privacyScope: "cloud_private", aiPolicy: "cloud_allowed" },
      { ...baseItem, id: "item-local", privacyScope: "local_only", aiPolicy: "local_only" },
      { ...baseItem, id: "item-disabled", privacyScope: "cloud_private", aiPolicy: "disabled" },
    ];

    const cloudExecution = filterItemsByExecutionPolicy(items, "cloud_allowed");
    expect(cloudExecution.allowed).toHaveLength(1);
    expect(cloudExecution.allowed[0].id).toBe("item-cloud");
    expect(cloudExecution.excludedCount).toBe(2);

    const localExecution = filterItemsByExecutionPolicy(items, "local_only");
    expect(localExecution.allowed).toHaveLength(2); // item-cloud, item-local 허용
    expect(localExecution.excludedCount).toBe(1); // item-disabled 제외
  });
});
