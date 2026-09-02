// Copilot 응답 경량 렌더러 — G6: Markdown 원문(##, ** 등) 노출 금지, 카드/섹션 형태 렌더링.
// 🎭 CRACK 스타일 행동 지문(*...*) 및 인라인 강조 파싱 지원

"use client";

import React, { Fragment, ReactNode } from "react";
import styles from "./markdownLite.module.css";

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

export default function MarkdownLite({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];

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

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    const listItem = trimmed.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      listBuffer.push(listItem[1]);
      return;
    }
    flushList(i);

    if (!trimmed) return;
    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <div key={i} className={heading[1].length <= 2 ? styles.h2 : styles.h3}>
          {renderInline(heading[2])}
        </div>
      );
      return;
    }
    if (trimmed.startsWith(">")) {
      blocks.push(
        <div key={i} className={styles.quote}>
          {renderInline(trimmed.replace(/^>\s?/, ""))}
        </div>
      );
      return;
    }
    if (/^-{3,}$/.test(trimmed)) {
      blocks.push(<hr key={i} className={styles.hr} />);
      return;
    }
    blocks.push(<p key={i} className={styles.p}>{renderInline(trimmed)}</p>);
  });
  flushList(lines.length);

  return <div className={styles.root}>{blocks}</div>;
}
