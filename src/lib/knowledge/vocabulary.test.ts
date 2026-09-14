import { describe, expect, it } from "vitest";
import { expandSearchTerms, extractArchiveKeywords } from "./vocabulary";

describe("knowledge search vocabulary", () => {
  it("expands common Korean work vocabulary and English aliases", () => {
    expect(expandSearchTerms("결재 마감 알림")).toEqual(
      expect.arrayContaining(["결재", "승인", "마감", "기한", "알림", "푸시"])
    );
    expect(expandSearchTerms("meeting notes")).toContain("회의");
  });

  it("extracts title and heading terms before ordinary body words", () => {
    const keywords = extractArchiveKeywords(
      "모바일 알림 설계",
      "# 백그라운드 처리\n\n서비스 워커가 AI 작업 완료 알림을 표시합니다."
    );
    expect(keywords.slice(0, 6)).toEqual(
      expect.arrayContaining(["모바일", "알림", "설계", "백그라운드", "처리"])
    );
  });
});
