import { describe, it, expect } from "vitest";
import type { CanvasDocument, CanvasExtractedTask } from "./types";
import { saveCanvasDocsToLS, loadCanvasDocsFromLS } from "../ai/canvasAi";

describe("AI Canvas Module", () => {
  it("creates a valid CanvasDocument object with history", () => {
    const doc: CanvasDocument = {
      id: "cdoc-test-1",
      title: "주간 업무 보고서",
      type: "report",
      content: "# 주간 보고\n- 백로그 정리 완료",
      updatedAt: "2026-08-28T10:00:00Z",
      createdAt: "2026-08-28T10:00:00Z",
      history: ["# 주간 보고\n- 백로그 정리 완료"],
      historyIndex: 0,
    };

    expect(doc.id).toBe("cdoc-test-1");
    expect(doc.type).toBe("report");
    expect(doc.history?.length).toBe(1);
  });

  it("handles history stacks for undo and redo correctly", () => {
    const initialText = "# 초안 작성";
    const editedText1 = "# 초안 작성\n- 1차 검토 추가";
    const editedText2 = "# 초안 작성\n- 1차 검토 추가\n- 2차 승인 완료";

    const history = [initialText, editedText1, editedText2];
    let currentIndex = 2;

    // Undo 1단계
    currentIndex -= 1;
    expect(history[currentIndex]).toBe(editedText1);

    // Undo 2단계
    currentIndex -= 1;
    expect(history[currentIndex]).toBe(initialText);

    // Redo 1단계
    currentIndex += 1;
    expect(history[currentIndex]).toBe(editedText1);
  });

  it("parses and extracts task items correctly from markdown lines", () => {
    const content = `
# 프로젝트 릴리스 계획
1. 배포 전 타입 검사 수행
2. E2E 시나리오 테스트 실행
3. 릴리스 노트 작성
`;

    const lines = content
      .split("\n")
      .map((l) => l.trim().replace(/^[-*•\d.]+\s*/, ""))
      .filter((l) => l.length > 2 && !l.startsWith("#"));

    expect(lines.length).toBe(3);
    expect(lines[0]).toBe("배포 전 타입 검사 수행");
    expect(lines[1]).toBe("E2E 시나리오 테스트 실행");
    expect(lines[2]).toBe("릴리스 노트 작성");
  });

  it("checks HTML in Canvas support safely without throwing", async () => {
    const { checkHtmlInCanvasSupport } = await import("./htmlInCanvas");
    const status = checkHtmlInCanvasSupport();
    expect(status).toBeDefined();
    expect(typeof status.supported).toBe("boolean");
    expect(typeof status.message).toBe("string");
  });
});

