import { describe, it, expect } from "vitest";
import type { UnifiedData } from "@/lib/types/unified";

describe("Phase 14-01: 동기화 계층 특성화 테스트 (Known Gaps Documentation)", () => {
  it("특성화 1: 현재 mapUnifiedItem 매퍼는 rawContent와 driveUrl을 복원하지 못함 (Phase 14-02 대상)", () => {
    const originalItem: UnifiedData = {
      id: "paste-123",
      source: "paste",
      title: "기획 회의",
      content: "액션 아이템 정리",
      rawContent: "# 회의록 원문 전체 텍스트...",
      driveUrl: "https://drive.google.com/file/d/abc/view",
      created_at: "2026-08-14T00:00:00.000Z",
      author: { name: "User" },
      url: "https://drive.google.com/file/d/abc/view",
      status: "pending",
    };

    // 현재 DB row 형태 모의
    const dbRow = {
      id: originalItem.id,
      source: originalItem.source,
      title: originalItem.title,
      content: originalItem.content,
      created_at: originalItem.created_at,
      author: originalItem.author,
      url: originalItem.url,
      category: originalItem.category,
      status: originalItem.status,
    };

    // 현재 syncAdapter의 매핑 로직
    const mapped: UnifiedData = {
      id: String(dbRow.id),
      source: dbRow.source as UnifiedData["source"],
      title: String(dbRow.title),
      content: String(dbRow.content || ""),
      created_at: String(dbRow.created_at),
      author: dbRow.author || { name: "System" },
      url: String(dbRow.url || ""),
      status: dbRow.status as UnifiedData["status"],
    };

    // 현재 상태에서는 rawContent와 driveUrl이 undefined로 유실됨을 확인 (문서화)
    expect(mapped.rawContent).toBeUndefined();
    expect(mapped.driveUrl).toBeUndefined();
  });

  it("특성화 2: 클라우드 전체 목록 교체 방식에서 로컬 전용 항목이 서버 동기화 시 유실될 위험이 있음 (Phase 14-03 대상)", () => {
    const localItems = [
      { id: "local-1", title: "로컬 항목 1" },
      { id: "server-1", title: "서버 항목 1" },
    ];
    const serverItems = [
      { id: "server-1", title: "서버 항목 1" },
    ];

    // 단순 교체식 수화(hydration) 시 로컬 항목이 덮어쓰여짐을 확인
    const hydratedItems = serverItems;
    expect(localItems.some((i) => i.id === "local-1")).toBe(true);
    expect(hydratedItems.find((i) => i.id === "local-1")).toBeUndefined();
  });
});
