// Copilot 응답 경량 렌더러 — G6: Markdown 원문(##, ** 등) 노출 금지, 카드/섹션 형태 렌더링.
// 🎭 CRACK 스타일 행동 지문(*...*) 및 인라인 강조 파싱 지원

"use client";

import React, { Fragment, ReactNode, useState } from "react";
import { parseMarkdownTable } from "@/lib/markdown/table";
import styles from "./markdownLite.module.css";

/** 안전한 클립보드 복사 헬퍼 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    if (typeof document !== "undefined") {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      return success;
    }
    return false;
  } catch {
    return false;
  }
}

/** 구분선과 본문 복사 버튼 */
function MarkdownDivider({ contentToCopy }: { contentToCopy?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!contentToCopy) return;
    const ok = await copyTextToClipboard(contentToCopy);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  if (!contentToCopy) {
    return <hr className={styles.hr} />;
  }

  return (
    <div className={styles.dividerRow}>
      <hr className={styles.dividerLine} />
      <button
        type="button"
        className={`${styles.dividerCopyBtn} ${copied ? styles.dividerCopyBtnCopied : ""}`}
        onClick={handleCopy}
        title="본문 내용 복사"
        aria-label={copied ? "본문이 복사되었습니다" : "본문 내용 복사"}
      >
        {copied ? (
          <>
            <span aria-hidden="true">✓</span>
            <span>복사됨</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">📋</span>
            <span>복사</span>
          </>
        )}
      </button>
    </div>
  );
}

/**
 * 인라인 마크다운 렌더러
 * - **굵은 글씨**
 * - *행동 지문* 또는 (*독백 지문*)
 */
export function renderInline(text: string): ReactNode {
  // 1. **굵게** 및 *지문* 정규식 분할
  // 토큰: (**...**), (*...*), (\(*...*\))
  const tokenRegex = /(\*\*[^*]+\*\*|\(\*[^*]+\*\)|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, i) => {
    // 1. **굵게**
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return <strong key={i}>{boldMatch[1]}</strong>;
    }

    // 2. (*독백 지문*)
    const parenNarrationMatch = part.match(/^\(\*([^*]+)\*\)$/);
    if (parenNarrationMatch) {
      return (
        <span key={i} className={styles.actionNarration}>
          *{parenNarrationMatch[1].trim()}*
        </span>
      );
    }

    // 3. *행동 지문*
    const narrationMatch = part.match(/^\*([^*]+)\*$/);
    if (narrationMatch) {
      return (
        <span key={i} className={styles.actionNarration}>
          *{narrationMatch[1].trim()}*
        </span>
      );
    }

    return <Fragment key={i}>{part}</Fragment>;
  });
}

function extractSectionContent(lines: string[], startIndex: number): string {
  const contentLines: string[] = [];
  for (let j = startIndex + 1; j < lines.length; j += 1) {
    if (/^-{3,}$/.test(lines[j].trim())) {
      break;
    }
    contentLines.push(lines[j]);
  }
  return contentLines.join("\n").trim();
}

export default function MarkdownLite({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let hasDividerCopyRendered = false;

  const flushList = (key: number) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className={styles.list}>
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const listItem = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      listBuffer.push(listItem[1]);
      continue;
    }
    flushList(i);

    if (!trimmed) continue;
    const table = parseMarkdownTable(lines, i);
    if (table) {
      blocks.push(
        <div key={`table-${i}`} className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                {table.header.map((cell, cellIndex) => (
                  <th
                    key={cellIndex}
                    scope="col"
                    style={{ textAlign: table.alignments[cellIndex] }}
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={{ textAlign: table.alignments[cellIndex] }}>
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      i = table.endIndex;
      continue;
    }
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <div key={i} className={heading[1].length <= 2 ? styles.h2 : styles.h3}>
          {renderInline(heading[2])}
        </div>
      );
      continue;
    }
    if (trimmed.startsWith(">")) {
      blocks.push(
        <div key={i} className={styles.quote}>
          {renderInline(trimmed.replace(/^>\s?/, ""))}
        </div>
      );
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      if (!hasDividerCopyRendered) {
        const nextSection = extractSectionContent(lines, i);
        if (nextSection) {
          hasDividerCopyRendered = true;
          blocks.push(<MarkdownDivider key={i} contentToCopy={nextSection} />);
          continue;
        }
      }
      blocks.push(<hr key={i} className={styles.hr} />);
      continue;
    }
    blocks.push(<p key={i} className={styles.p}>{renderInline(trimmed)}</p>);
  }
  flushList(lines.length);

  return <div className={styles.root}>{blocks}</div>;
}
