import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarkdownLite from "./markdownLite";

describe("MarkdownLite", () => {
  it("renders Markdown table syntax as an accessible HTML table", () => {
    const html = renderToStaticMarkup(
      <MarkdownLite
        text={[
          "| 항목 | 상태 |",
          "| :--- | ---: |",
          "| **보고서** | 완료 |",
        ].join("\n")}
      />
    );

    expect(html).toContain("<table");
    expect(html).toContain('<th scope="col" style="text-align:left">항목</th>');
    expect(html).toContain('<th scope="col" style="text-align:right">상태</th>');
    expect(html).toContain("<strong>보고서</strong>");
    expect(html).not.toContain("| :--- | ---: |");
  });

  it("renders divider copy button when markdown contains divider with body content", () => {
    const text = [
      "(지문) 메일 초안을 작성했습니다.",
      "---",
      "Subject: Bug Report",
      "Dear Team,",
      "Please fix the bug.",
      "---",
      "수정 사항이 있으면 말씀해주세요.",
    ].join("\n");

    const html = renderToStaticMarkup(<MarkdownLite text={text} />);

    expect(html).toContain('aria-label="본문 내용 복사"');
    expect(html).toContain("<svg");
    expect(html).toContain("Subject: Bug Report");
  });

  it("renders regular hr without copy button if no divider content exists", () => {
    const text = "---";
    const html = renderToStaticMarkup(<MarkdownLite text={text} />);
    expect(html).toContain("<hr");
    expect(html).not.toContain('aria-label="본문 내용 복사"');
  });
});

