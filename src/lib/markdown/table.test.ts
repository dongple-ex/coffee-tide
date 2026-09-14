import { describe, expect, it } from "vitest";
import { parseMarkdownTable, splitMarkdownTableRow } from "./table";

describe("Markdown table parser", () => {
  it("parses a GFM table with column alignment and body rows", () => {
    const parsed = parseMarkdownTable([
      "| 항목 | 담당자 | 금액 |",
      "| :--- | :---: | ---: |",
      "| 보고서 | 김부장 | 12,000원 |",
      "| 회의록 | 카리나 | 8,000원 |",
      "",
      "다음 문단",
    ], 0);

    expect(parsed).toEqual({
      header: ["항목", "담당자", "금액"],
      alignments: ["left", "center", "right"],
      rows: [
        ["보고서", "김부장", "12,000원"],
        ["회의록", "카리나", "8,000원"],
      ],
      endIndex: 3,
    });
  });

  it("keeps escaped pipes and pipes inside inline code in one cell", () => {
    expect(splitMarkdownTableRow("| A \\| B | `left | right` | C:\\문서 |")).toEqual([
      "A | B",
      "`left | right`",
      "C:\\문서",
    ]);
  });

  it("does not treat ordinary pipe-separated text as a table without a delimiter row", () => {
    expect(parseMarkdownTable(["A | B", "값 | 내용"], 0)).toBeNull();
  });

  it("supports a one-column table when boundary pipes are present", () => {
    expect(parseMarkdownTable(["| 상태 |", "| --- |", "| 완료 |"], 0)).toMatchObject({
      header: ["상태"],
      rows: [["완료"]],
    });
  });
});
