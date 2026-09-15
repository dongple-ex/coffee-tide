import { describe, it, expect } from "vitest";
import { computeLineDiff, computeLineDiffResult } from "./lineDiff";

describe("computeLineDiff", () => {
  it("compares a 20,000-line document with a small edit without simplifying", () => {
    const old = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
    const next = [...old];
    next[10000] = "changed";
    const result = computeLineDiffResult(old.join("\n"), next.join("\n"));
    expect(result.simplified).toBe(false);
    expect(result.lines.filter((line) => line.type !== "unchanged")).toEqual([
      { type: "removed", value: "line 10000", oldLineNumber: 10001 },
      { type: "added", value: "changed", newLineNumber: 10001 },
    ]);
  });

  it("bounds a large replacement and preserves both complete documents", () => {
    const old = ["start", ...Array.from({ length: 20000 }, (_, i) => `old ${i}`), "end"];
    const next = ["start", ...Array.from({ length: 20000 }, (_, i) => `new ${i}`), "end"];
    const result = computeLineDiffResult(old.join("\n"), next.join("\n"));
    expect(result.simplified).toBe(true);
    expect(result.lines.filter((line) => line.type !== "added").map((line) => line.value)).toEqual(old);
    expect(result.lines.filter((line) => line.type !== "removed").map((line) => line.value)).toEqual(next);
    expect(result.lines.at(-1)).toEqual({ type: "unchanged", value: "end", oldLineNumber: 20002, newLineNumber: 20002 });
  });
  it("returns unchanged for identical texts", () => {
    const text = "라인 1\n라인 2\n라인 3";
    const diff = computeLineDiff(text, text);

    expect(diff.every((d) => d.type === "unchanged")).toBe(true);
    expect(diff.map((d) => d.value)).toEqual(["라인 1", "라인 2", "라인 3"]);
  });

  it("detects added and removed lines correctly", () => {
    const oldText = "사과\n바나나\n포도";
    const newText = "사과\n딸기\n포도";

    const diff = computeLineDiff(oldText, newText);

    expect(diff).toEqual([
      { type: "unchanged", value: "사과", oldLineNumber: 1, newLineNumber: 1 },
      { type: "removed", value: "바나나", oldLineNumber: 2 },
      { type: "added", value: "딸기", newLineNumber: 2 },
      { type: "unchanged", value: "포도", oldLineNumber: 3, newLineNumber: 3 },
    ]);
  });

  it("treats whitespace differences as changes when ignoreWhitespace is false", () => {
    const oldText = "const a = 1;";
    const newText = "  const a = 1;  ";

    const diffWithoutIgnore = computeLineDiff(oldText, newText, { ignoreWhitespace: false });
    expect(diffWithoutIgnore.some((d) => d.type === "removed")).toBe(true);
    expect(diffWithoutIgnore.some((d) => d.type === "added")).toBe(true);
  });

  it("hides whitespace-only changes when ignoreWhitespace is true (Antigravity feature)", () => {
    const oldText = "const a = 1;\nconst b = 2;";
    const newText = "  const a = 1;  \nconst b = 2;";

    const diffWithIgnore = computeLineDiff(oldText, newText, { ignoreWhitespace: true });
    
    // ignoreWhitespace가 켜져 있으면 공백만 다른 첫 번째 줄도 unchanged로 처리된다
    expect(diffWithIgnore.every((d) => d.type === "unchanged")).toBe(true);
    expect(diffWithIgnore.length).toBe(2);
  });

  it("handles empty strings safely", () => {
    expect(computeLineDiff("", "")).toEqual([]);
    
    const addedDiff = computeLineDiff("", "새로운 줄");
    expect(addedDiff).toEqual([
      { type: "added", value: "새로운 줄", newLineNumber: 1 },
    ]);

    const removedDiff = computeLineDiff("삭제될 줄", "");
    expect(removedDiff).toEqual([
      { type: "removed", value: "삭제될 줄", oldLineNumber: 1 },
    ]);
  });
});
