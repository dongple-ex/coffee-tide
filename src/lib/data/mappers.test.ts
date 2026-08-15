import { describe, it, expect } from "vitest";
import {
  mapAiArtifactFromDb,
  mapAiArtifactToDbRow,
  mapContentAssetFromDb,
  mapContentAssetToDbRow,
  mapExpenseEntryFromDb,
  mapExpenseEntryToDbRow,
  mapItemRelationFromDb,
  mapItemRelationToDbRow,
  mapUnifiedItemFromDb,
  mapUnifiedItemToDbRow,
} from "./mappers";
import type { WorkspaceItem } from "./contracts";

describe("Phase 14-02: DB ↔ 애플리케이션 양방향 매퍼 테스트", () => {
  const testUserId = "user-uuid-1234-5678";

  it("D02: 구 형식 DB 행(신규 컬럼 누락)을 읽을 때 안전한 기본값을 주입한다", () => {
    const legacyRow = {
      id: "legacy-task-1",
      source: "manual",
      title: "구 버전 할 일",
      content: "상세 내용",
      created_at: "2026-08-10T10:00:00.000Z",
      status: "pending",
    };

    const item = mapUnifiedItemFromDb(legacyRow);
    expect(item.id).toBe("legacy-task-1");
    expect(item.itemType).toBe("task");
    expect(item.version).toBe(1);
    expect(item.privacyScope).toBe("cloud_private");
    expect(item.aiPolicy).toBe("cloud_allowed");
    expect(item.attributes).toEqual({});
    expect(item.rawContent).toBeUndefined();
    expect(item.driveUrl).toBeUndefined();
  });

  it("D03 & D04: 새 형식 항목의 rawContent, driveUrl 및 모든 확장 필드가 DB 왕복 시 완벽히 보존된다", () => {
    const originalItem: WorkspaceItem = {
      id: "paste-20260814-1",
      source: "paste",
      sourceApp: "CoffeeTide",
      title: "프로젝트 킥오프 회의",
      content: "액션 아이템 3건",
      created_at: "2026-08-14T09:00:00.000Z",
      author: { name: "홍길동", email: "hong@example.com" },
      url: "https://drive.google.com/file/d/test/view",
      category: "meeting",
      actionDirective: "14:00까지 일정 확정",
      status: "pending",
      workNote: "진행 메모 텍스트",
      subTasks: [{ id: "sub-1", title: "문서 공유", completed: false }],
      rawContent: "# 회의록 전문...\n참석자: 팀원 전체",
      driveUrl: "https://drive.google.com/file/d/test/view",

      itemType: "meeting",
      sourceRef: "drive-asset-99",
      occurredAt: "2026-08-14T08:30:00.000Z",
      attributes: { conferenceRoom: "302호", attendeesCount: 8 },
      version: 3,
      privacyScope: "cloud_private",
      aiPolicy: "cloud_allowed",
      updatedAt: "2026-08-14T09:30:00.000Z",
    };

    // 1. App -> DB 변환
    const dbRow = mapUnifiedItemToDbRow(originalItem, testUserId);
    expect(dbRow.user_id).toBe(testUserId);
    expect(dbRow.raw_content).toBe("# 회의록 전문...\n참석자: 팀원 전체");
    expect(dbRow.drive_url).toBe("https://drive.google.com/file/d/test/view");
    expect(dbRow.item_type).toBe("meeting");
    expect(dbRow.version).toBe(3);
    expect((dbRow.attributes as { conferenceRoom: string }).conferenceRoom).toBe("302호");

    // 2. DB -> App 복원
    const restoredItem = mapUnifiedItemFromDb(dbRow);
    expect(restoredItem.id).toBe(originalItem.id);
    expect(restoredItem.rawContent).toBe(originalItem.rawContent);
    expect(restoredItem.driveUrl).toBe(originalItem.driveUrl);
    expect(restoredItem.workNote).toBe(originalItem.workNote);
    expect(restoredItem.subTasks).toEqual(originalItem.subTasks);
    expect(restoredItem.itemType).toBe("meeting");
    expect(restoredItem.version).toBe(3);
    expect(restoredItem.attributes).toEqual(originalItem.attributes);
  });

  it("비용 항목(ExpenseEntry) DB 왕복 매핑", () => {
    const expense = {
      itemId: "item-100",
      amount: "25000.5000",
      currency: "KRW",
      merchant: "교보문고",
      category: "도서구입비",
      paymentMethod: "법인카드",
      occurredAt: "2026-08-14T14:00:00.000Z",
      taxDeductible: true,
      reimbursable: false,
    };

    const row = mapExpenseEntryToDbRow(expense, testUserId);
    const restored = mapExpenseEntryFromDb(row);

    expect(restored.itemId).toBe("item-100");
    expect(restored.amount).toBe("25000.5000");
    expect(restored.currency).toBe("KRW");
    expect(restored.merchant).toBe("교보문고");
    expect(restored.taxDeductible).toBe(true);
  });

  it("자산(ContentAsset) DB 왕복 매핑", () => {
    const asset = {
      id: "asset-uuid-1",
      itemId: "item-100",
      kind: "document" as const,
      provider: "google_drive" as const,
      providerRef: "drive-file-id-abc",
      mimeType: "text/markdown",
      sizeBytes: 2048,
      retentionPolicy: "user_kept" as const,
      createdAt: "2026-08-14T12:00:00.000Z",
    };

    const row = mapContentAssetToDbRow(asset, testUserId);
    const restored = mapContentAssetFromDb(row);

    expect(restored.id).toBe("asset-uuid-1");
    expect(restored.providerRef).toBe("drive-file-id-abc");
    expect(restored.sizeBytes).toBe(2048);
  });

  it("관계(ItemRelation) 및 AI 아티팩트(AiArtifact) DB 왕복 매핑", () => {
    const relation = {
      id: "rel-1",
      fromItemId: "item-1",
      toItemId: "item-2",
      relationType: "derived_from" as const,
      createdBy: "ai" as const,
      confidence: 0.9,
      evidence: { sourceSnippet: "3번째 문단" },
      createdAt: "2026-08-14T12:00:00.000Z",
    };
    const relRow = mapItemRelationToDbRow(relation, testUserId);
    const restoredRel = mapItemRelationFromDb(relRow);
    expect(restoredRel.fromItemId).toBe("item-1");
    expect(restoredRel.confidence).toBe(0.9);

    const artifact = {
      id: "art-1",
      itemId: "item-1",
      artifactType: "summary" as const,
      contentText: "요약문 본문",
      provider: "gemini",
      model: "gemini-2.5-flash",
      status: "current" as const,
      createdAt: "2026-08-14T12:00:00.000Z",
      acceptedAt: "2026-08-14T12:05:00.000Z",
    };
    const artRow = mapAiArtifactToDbRow(artifact, testUserId);
    expect(artRow.accepted_at).toBe("2026-08-14T12:05:00.000Z");
    const restoredArt = mapAiArtifactFromDb(artRow);
    expect(restoredArt.contentText).toBe("요약문 본문");
    expect(restoredArt.model).toBe("gemini-2.5-flash");
    expect(restoredArt.acceptedAt).toBe("2026-08-14T12:05:00.000Z");
  });
});
