export type DiffLineType = "unchanged" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  value: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface LineDiffOptions {
  /** 줄 앞뒤 공백 및 연속 공백 정규화 후 비교 */
  ignoreWhitespace?: boolean;
}

export interface LineDiffResult {
  lines: DiffLine[];
  /** 비교량이 큰 변경 구간은 삭제/추가 블록으로 표시한다. */
  simplified: boolean;
}

// DP 메모리와 연산량 모두 제한한다. 문서의 전체 줄 수에는 제한이 없다.
const MAX_COMPARISON_CELLS = 1_000_000;

export function computeLineDiffResult(
  oldText: string,
  newText: string,
  options: LineDiffOptions = {}
): LineDiffResult {
  const oldLines = oldText === "" ? [] : oldText.split(/\r?\n/);
  const newLines = newText === "" ? [] : newText.split(/\r?\n/);
  const normalize = (line: string) => options.ignoreWhitespace ? line.trim().replace(/\s+/g, " ") : line;
  const oldKeys = oldLines.map(normalize);
  const newKeys = newLines.map(normalize);
  const lines: DiffLine[] = [];
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldKeys[prefix] === newKeys[prefix]) {
    lines.push({ type: "unchanged", value: newLines[prefix], oldLineNumber: prefix + 1, newLineNumber: prefix + 1 });
    prefix++;
  }
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > prefix && newEnd > prefix && oldKeys[oldEnd - 1] === newKeys[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  const n = oldEnd - prefix;
  const m = newEnd - prefix;
  const simplified = n > 0 && m > 0 && (n + 1) * (m + 1) > MAX_COMPARISON_CELLS;
  if (simplified || n === 0 || m === 0) {
    for (let i = prefix; i < oldEnd; i++) {
      lines.push({ type: "removed", value: oldLines[i], oldLineNumber: i + 1 });
    }
    for (let j = prefix; j < newEnd; j++) {
      lines.push({ type: "added", value: newLines[j], newLineNumber: j + 1 });
    }
  } else {
    const width = m + 1;
    const dp = new Uint32Array((n + 1) * width);
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        dp[i * width + j] = oldKeys[prefix + i - 1] === newKeys[prefix + j - 1]
          ? dp[(i - 1) * width + j - 1] + 1
          : Math.max(dp[(i - 1) * width + j], dp[i * width + j - 1]);
      }
    }
    const middle: DiffLine[] = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldKeys[prefix + i - 1] === newKeys[prefix + j - 1]) {
        middle.push({ type: "unchanged", value: newLines[prefix + j - 1], oldLineNumber: prefix + i, newLineNumber: prefix + j });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i * width + j - 1] >= dp[(i - 1) * width + j])) {
        middle.push({ type: "added", value: newLines[prefix + j - 1], newLineNumber: prefix + j });
        j--;
      } else {
        middle.push({ type: "removed", value: oldLines[prefix + i - 1], oldLineNumber: prefix + i });
        i--;
      }
    }
    for (let k = middle.length - 1; k >= 0; k--) lines.push(middle[k]);
  }

  while (oldEnd < oldLines.length && newEnd < newLines.length) {
    lines.push({ type: "unchanged", value: newLines[newEnd], oldLineNumber: oldEnd + 1, newLineNumber: newEnd + 1 });
    oldEnd++;
    newEnd++;
  }
  return { lines, simplified };
}

export function computeLineDiff(oldText: string, newText: string, options: LineDiffOptions = {}): DiffLine[] {
  return computeLineDiffResult(oldText, newText, options).lines;
}
