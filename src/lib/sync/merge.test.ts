import { describe, it, expect } from "vitest";
import { mergeGuestAndCloudItems, mergeItemChanges } from "./merge";
import type { WorkspaceItem } from "../data/contracts";

describe("Phase 14-03: 항목 단위 동기화 및 병합/충돌 테스트", () => {
  const baseItem: WorkspaceItem = {
    id: "task-1",
    source: "manual",
    title: "업무 기획서",
    content: "초안 작성 완료",
    created_at: "2026-08-14T08:00:00Z",
    author: { name: "User" },
    url: "",
    status: "pending",
    version: 1,
    itemType: "task",
    privacyScope: "cloud_private",
    aiPolicy: "cloud_allowed",
    updatedAt: "2026-08-14T08:00:00Z",
  };

  it("Y01: 게스트 업무 3건 후 기존 계정 로그인 시 로컬 3건과 클라우드 기존 건 모두 보존된다", () => {
    const guestItems: WorkspaceItem[] = [
      { ...baseItem, id: "guest-1", title: "게스트 업무 1" },
      { ...baseItem, id: "guest-2", title: "게스트 업무 2" },
      { ...baseItem, id: "guest-3", title: "게스트 업무 3" },
    ];

    const cloudItems: WorkspaceItem[] = [
      { ...baseItem, id: "cloud-1", title: "기존 클라우드 업무 1" },
      { ...baseItem, id: "cloud-2", title: "기존 클라우드 업무 2" },
    ];

    const result = mergeGuestAndCloudItems(guestItems, cloudItems);

    expect(result.mergedItems).toHaveLength(5);
    expect(result.itemsToUpload).toHaveLength(3);
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedItems.map((i) => i.id)).toEqual(
      expect.arrayContaining(["guest-1", "guest-2", "guest-3", "cloud-1", "cloud-2"])
    );
  });

  it("Y03: 동일 본문/상태를 양쪽에서 다르게 수정 시 자동 덮어쓰기 없이 충돌(conflict)을 생성한다", () => {
    const localModified: WorkspaceItem = {
      ...baseItem,
      content: "PC에서 대폭 수정한 내용",
      version: 2,
      updatedAt: "2026-08-14T09:00:00Z",
    };

    const serverModified: WorkspaceItem = {
      ...baseItem,
      content: "모바일에서 수정한 다른 내용",
      version: 2,
      updatedAt: "2026-08-14T09:05:00Z",
    };

    const result = mergeItemChanges(localModified, serverModified);

    expect(result.hasConflict).toBe(true);
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.localItem.content).toBe("PC에서 대폭 수정한 내용");
    expect(result.conflict?.serverItem.content).toBe("모바일에서 수정한 다른 내용");
  });

  it("Y07: 서버에서 삭제된 항목을 로컬에서 오프라인 수정했을 때 충돌을 생성하여 보존한다", () => {
    const localModified: WorkspaceItem = {
      ...baseItem,
      content: "오프라인에서 계속 작업한 내용",
      version: 2,
    };

    const serverDeleted: WorkspaceItem = {
      ...baseItem,
      deletedAt: "2026-08-14T08:30:00Z",
      version: 2,
    };

    const result = mergeItemChanges(localModified, serverDeleted);

    expect(result.hasConflict).toBe(true);
    expect(result.conflict).toBeDefined();
    expect(result.conflict?.serverItem.deletedAt).toBeDefined();
  });

  it("동일 내용(제목/본문) 중복 항목은 duplicate로 감지하여 업로드 목록에서 제외한다", () => {
    const guestItems: WorkspaceItem[] = [
      { ...baseItem, id: "guest-dup", title: "동일한 제목", content: "동일한 내용" },
    ];
    const cloudItems: WorkspaceItem[] = [
      { ...baseItem, id: "cloud-original", title: "동일한 제목", content: "동일한 내용" },
    ];

    const result = mergeGuestAndCloudItems(guestItems, cloudItems);

    expect(result.duplicateCount).toBe(1);
    expect(result.itemsToUpload).toHaveLength(0);
    expect(result.mergedItems).toHaveLength(1);
  });

  it("동일 시각(updated_at)을 가진 복수 항목의 복합 커서(updated_at, id) 페이지네이션 시뮬레이션", () => {
    const sameTime = "2026-08-14T10:00:00.000Z";
    const items: WorkspaceItem[] = [
      { ...baseItem, id: "item-a", title: "A", updatedAt: sameTime },
      { ...baseItem, id: "item-b", title: "B", updatedAt: sameTime },
      { ...baseItem, id: "item-c", title: "C", updatedAt: sameTime },
      { ...baseItem, id: "item-d", title: "D", updatedAt: sameTime },
    ];

    // 페이지 크기 2 시뮬레이션
    const page1 = items.slice(0, 2);
    expect(page1.map((i) => i.id)).toEqual(["item-a", "item-b"]);

    const lastItemPage1 = page1[page1.length - 1];
    const cursor = `${lastItemPage1.updatedAt}|${lastItemPage1.id}`;

    // 커서 이후 필터링: (updated_at > cursorTime) OR (updated_at === cursorTime AND id > cursorId)
    const [cursorTime, cursorId] = cursor.split("|");
    const page2 = items.filter(
      (i) =>
        i.updatedAt! > cursorTime ||
        (i.updatedAt === cursorTime && i.id > cursorId)
    );

    expect(page2.map((i) => i.id)).toEqual(["item-c", "item-d"]);
    // 항목 누락이나 중복이 전혀 없음
    expect([...page1, ...page2]).toHaveLength(4);
  });
});
