import { describe, it, expect } from "vitest";
import {
  generateDailyReflectionReport,
  getSoulmateClosingQuote,
} from "./reflectionReportGenerator";

describe("reflectionReportGenerator", () => {
  it("generates structured reflection report with completed and pending tasks", () => {
    const report = generateDailyReflectionReport({
      personaId: "pm",
      baristaName: "칼퇴봇",
      completedTasks: [
        { title: "오전 기획서 작성", category: "기획" },
        { title: "PR 리뷰", category: "개발" },
      ],
      pendingTasks: [
        { title: "내일 배포 준비", category: "인프라" },
      ],
      date: new Date("2026-09-26T18:00:00Z"),
    });

    expect(report.completedCount).toBe(2);
    expect(report.pendingCount).toBe(1);
    expect(report.completionRate).toBe(67);
    expect(report.baristaName).toBe("칼퇴봇");
    expect(report.markdownContent).toContain("# 👑 [정시 퇴근 & 일일 회고 리포트]");
    expect(report.markdownContent).toContain("- [x] 오전 기획서 작성 `#기획`");
    expect(report.markdownContent).toContain("- [ ] 내일 배포 준비 `#인프라`");
    expect(report.markdownContent).toContain("칼퇴");
  });

  it("handles empty tasks correctly with 100% completion rate", () => {
    const report = generateDailyReflectionReport({
      personaId: "karina",
      baristaName: "카리나",
      completedTasks: [],
      pendingTasks: [],
    });

    expect(report.completedCount).toBe(0);
    expect(report.pendingCount).toBe(0);
    expect(report.completionRate).toBe(100);
    expect(report.markdownContent).toContain("올클리어");
  });

  it("returns unique soulmate closing quotes for each persona", () => {
    const karinaQuote = getSoulmateClosingQuote("karina", "카리나", 100, 0);
    const pmQuote = getSoulmateClosingQuote("pm", "칼퇴봇", 80, 1);
    const kimQuote = getSoulmateClosingQuote("kim", "김부장", 100, 0);

    expect(karinaQuote).toContain("대표님");
    expect(pmQuote).toContain("블루라이트");
    expect(kimQuote).toContain("어이 최고의 파트너");
  });
});
