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
});
