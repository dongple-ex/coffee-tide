import { describe, expect, it } from "vitest";
import {
  chunkArchiveContent,
  createCanvasArchive,
  searchArchiveIndex,
} from "./archive";
import { mergeArchiveSearchResults } from "./archiveClient";
import { archiveDbName } from "./archiveDb";

describe("knowledge archive", () => {
  it("splits long documents into overlapping retrieval chunks", () => {
    const content = Array.from({ length: 35 }, (_, index) =>
      `단락 ${index + 1}. 모바일 백그라운드 작업과 알림 처리에 대한 결정 사항입니다.`
    ).join("\n\n");
    const chunks = chunkArchiveContent("archive:canvas:one", content);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk, index) => chunk.ordinal === index)).toBe(true);
    expect(chunks[1].charStart).toBeLessThan(chunks[0].charEnd);
    expect(chunks.map((chunk) => chunk.content).join(" ")).toContain("모바일 백그라운드");
  });

  it("retrieves the best Korean content chunk and boosts title matches", () => {
    const first = createCanvasArchive({
      id: "canvas-1",
      title: "푸시 알림 설계",
      type: "report",
      content: "서비스 워커가 AI 작업 완료 신호를 받으면 시스템 알림을 표시한다.",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T01:00:00.000Z",
    }, 0, "2026-09-14T02:00:00.000Z");
    const second = createCanvasArchive({
      id: "canvas-2",
      title: "일반 회의록",
      type: "meeting_note",
      content: "점심 메뉴와 다음 회의 시간을 정했다.",
      createdAt: "2026-09-13T00:00:00.000Z",
      updatedAt: "2026-09-13T01:00:00.000Z",
    }, 0, "2026-09-13T02:00:00.000Z");

    const results = searchArchiveIndex(
      [first.document, second.document],
      [...first.chunks, ...second.chunks],
      "AI 작업 완료 알림"
    );

    expect(results).toHaveLength(1);
    expect(results[0].document.id).toBe(first.document.id);
    expect(results[0].excerpt).toContain("AI 작업 완료");
  });

  it("returns recent documents when the query is empty", () => {
    const older = createCanvasArchive({
      id: "older",
      title: "이전 문서",
      type: "doc",
      content: "이전 본문",
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    }, 0, "2026-09-10T00:00:00.000Z");
    const newer = createCanvasArchive({
      id: "newer",
      title: "최근 문서",
      type: "doc",
      content: "최근 본문",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T00:00:00.000Z",
    }, 0, "2026-09-14T00:00:00.000Z");

    const results = searchArchiveIndex(
      [older.document, newer.document],
      [...older.chunks, ...newer.chunks],
      ""
    );
    expect(results.map((result) => result.document.id)).toEqual([newer.document.id, older.document.id]);
  });

  it("keeps a newer offline archive when the cloud still has an older revision", () => {
    const local = createCanvasArchive({
      id: "offline-newer",
      title: "오프라인 수정본",
      type: "doc",
      content: "최신 로컬 본문",
      createdAt: "2026-09-14T00:00:00.000Z",
      updatedAt: "2026-09-14T03:00:00.000Z",
    }, 1, "2026-09-14T03:00:00.000Z");
    const cloud = {
      ...local.document,
      content: "",
      contentHash: "older-cloud-hash",
      updatedAt: "2026-09-14T01:00:00.000Z",
      version: 1,
    };

    const merged = mergeArchiveSearchResults(
      [{ document: local.document, excerpt: "최신 로컬 본문", score: 0.8, storage: "local" }],
      [{ document: cloud, excerpt: "이전 클라우드 본문", score: 1.2, storage: "cloud" }],
      20
    );

    expect(merged[0].storage).toBe("local");
    expect(merged[0].document.version).toBe(2);
  });

  it("uses separate IndexedDB names for guest and signed-in users", () => {
    expect(archiveDbName("guest")).not.toBe(archiveDbName("usr_alice"));
    expect(archiveDbName("usr_alice")).not.toBe(archiveDbName("usr_bob"));
  });
});
