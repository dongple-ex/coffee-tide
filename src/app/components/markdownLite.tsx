// Copilot 응답 경량 렌더러 — G6: Markdown 원문(##, ** 등) 노출 금지, 카드/섹션 형태 렌더링.
// 외부 의존성 없이 헤딩·리스트·굵게·인용만 지원하는 안전한 최소 구현.

"use client";

import { Fragment, ReactNode } from "react";
import styles from "./markdownLite.module.css";

function renderInline(text: string): ReactNode {
  // **굵게** 만 지원 — 그 외 문법 문자는 일반 텍스트로
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    return bold ? <strong key={i}>{bold[1]}</strong> : <Fragment key={i}>{part}</Fragment>;
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
