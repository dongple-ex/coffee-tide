import { excerpt } from "./textUtils";

export interface ObsidianTaskOptions {
  targetNote?: "inbox" | "daily";
  dailyFolder?: string; // 예: "Daily Notes" 또는 빈 문자열
  heading?: string; // 예: "## Tasks" 또는 "## 📥 coffeeTide 캡처"
  dueDate?: string; // YYYY-MM-DD
  createdDate?: string; // YYYY-MM-DD
  priority?: "high" | "medium" | "low";
  tags?: string[]; // 예: ["coffeeTide/task", "work"]
  source?: string; // 예: "outlook", "meeting", "manual"
}

/**
 * Tasks 플러그인 및 Dataview 호환 마크다운 체크박스 라인을 생성합니다.
 * 예: - [ ] 이메일 회신 📅 2026-08-28 ➕ 2026-08-27 ⏫ #coffeeTide/task [source:: outlook]
 */
export function formatObsidianTaskLine(
  title: string,
  content?: string,
  options?: ObsidianTaskOptions
): string {
  let line = `- [ ] ${title.trim()}`;
  if (content?.trim()) {
    line += ` — ${excerpt(content.trim(), 120)}`;
  }

  // Priority (Tasks 플러그인 이모지)
  if (options?.priority === "high") line += " ⏫";
  else if (options?.priority === "medium") line += " 🔼";
  else if (options?.priority === "low") line += " 🔽";

  // Due Date (Tasks 플러그인 이모지)
  if (options?.dueDate) {
    line += ` 📅 ${options.dueDate}`;
  }

  // Created Date (Tasks 플러그인 이모지)
  const createdDate = options?.createdDate || new Date().toISOString().slice(0, 10);
  line += ` ➕ ${createdDate}`;

  // Tags
  const tags = options?.tags && options.tags.length > 0 ? options.tags : ["#coffeeTide/task"];
  for (const tag of tags) {
    const cleanTag = tag.trim();
    if (!cleanTag) continue;
    const formattedTag = cleanTag.startsWith("#") ? cleanTag : `#${cleanTag}`;
    line += ` ${formattedTag}`;
  }

  // Dataview Inline Field
  if (options?.source) {
    line += ` [source:: ${options.source}]`;
  }

  return line;
}

/**
 * 마크다운 텍스트에서 지정된 헤딩 아래에 라인을 삽입합니다.
 * 헤딩이 없으면 문서 하단에 헤딩을 생성하고 삽입합니다.
 */
export function insertUnderHeading(
  docText: string,
  line: string,
  heading?: string
): string {
  if (!heading?.trim()) {
    const trimmed = docText.trimEnd();
    return trimmed ? `${trimmed}\n${line}\n` : `${line}\n`;
  }

  const cleanHeading = heading.trim();
  const normalizedHeading = cleanHeading.startsWith("#") ? cleanHeading : `## ${cleanHeading}`;
  const lines = docText.split(/\r?\n/);

  const headingIdx = lines.findIndex(
    (l) => l.trim().toLowerCase() === normalizedHeading.toLowerCase()
  );

  if (headingIdx === -1) {
    const trimmed = docText.trimEnd();
    const separator = trimmed ? "\n\n" : "";
    return `${trimmed}${separator}${normalizedHeading}\n${line}\n`;
  }

  // 헤딩 바로 다음 줄에 삽입
  lines.splice(headingIdx + 1, 0, line);
  return lines.join("\n").trimEnd() + "\n";
}
