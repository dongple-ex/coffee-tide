export type MarkdownTableAlignment = "left" | "center" | "right" | undefined;

export interface ParsedMarkdownTable {
  header: string[];
  alignments: MarkdownTableAlignment[];
  rows: string[][];
  endIndex: number;
}

function endsWithUnescapedPipe(value: string): boolean {
  if (!value.endsWith("|")) return false;
  let backslashCount = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === "\\"; index -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 0;
}

export function splitMarkdownTableRow(line: string): string[] | null {
  let value = line.trim();
  if (!value.includes("|")) return null;
  if (value.startsWith("|")) value = value.slice(1);
  if (endsWithUnescapedPipe(value)) value = value.slice(0, -1);

  const cells: string[] = [];
  let current = "";
  let inCode = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "\\" && value[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (character === "`") {
      inCode = !inCode;
      current += character;
      continue;
    }
    if (character === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());

  return cells;
}

function parseDelimiter(cell: string): MarkdownTableAlignment | null {
  const compact = cell.replace(/\s+/g, "");
  if (!/^:?-{3,}:?$/.test(compact)) return null;
  if (compact.startsWith(":") && compact.endsWith(":")) return "center";
  if (compact.endsWith(":")) return "right";
  return "left";
}

export function parseMarkdownTable(lines: string[], startIndex: number): ParsedMarkdownTable | null {
  if (startIndex + 1 >= lines.length) return null;

  const header = splitMarkdownTableRow(lines[startIndex]);
  const delimiterCells = splitMarkdownTableRow(lines[startIndex + 1]);
  if (!header || !delimiterCells || header.length !== delimiterCells.length) return null;
  if (header.every((cell) => cell.length === 0)) return null;

  const alignments = delimiterCells.map(parseDelimiter);
  if (alignments.some((alignment) => alignment === null)) return null;

  const rows: string[][] = [];
  let endIndex = startIndex + 1;
  for (let index = startIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].trim()) break;
    const cells = splitMarkdownTableRow(lines[index]);
    if (!cells) break;
    rows.push(header.map((_, cellIndex) => cells[cellIndex] ?? ""));
    endIndex = index;
  }

  return {
    header,
    alignments: alignments as MarkdownTableAlignment[],
    rows,
    endIndex,
  };
}
