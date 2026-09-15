"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import styles from "./VirtualizedCodeViewer.module.css";

export interface VirtualizedCodeViewerProps {
  /** 표시할 코드/문서 전체 텍스트 */
  text: string;
  /** 문서 유형 (code, report, doc 등) */
  docType?: string;
  /** 각 행의 높이 (px, 기본값: 24) */
  rowHeight?: number;
  /** 컨테이너 높이 (기본값: 100%) */
  height?: string | number;
  className?: string;
}

const SQL_KEYWORDS = new Set([
  "select", "from", "where", "insert", "update", "delete", "join",
  "left", "right", "inner", "outer", "create", "table", "alter",
  "drop", "and", "or", "group", "by", "order", "limit", "as",
]);

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for",
  "while", "switch", "case", "break", "import", "export", "from",
  "default", "class", "async", "await", "try", "catch", "new",
]);

/**
 * 간단한 라인 구문 토큰화
 */
function renderSyntaxLine(line: string, searchQuery: string) {
  if (!line) return " ";

  const trimmed = line.trim();

  // 주석 줄
  if (trimmed.startsWith("//") || trimmed.startsWith("--") || trimmed.startsWith("#")) {
    return <span className={styles.tokenComment}>{line}</span>;
  }

  // 검색어 하이라이트가 있는 경우
  if (searchQuery.trim()) {
    const q = searchQuery.trim();
    const parts = line.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <span key={i} className={styles.matchHighlight}>{part}</span>
      ) : (
        part
      )
    );
  }

  // 간단한 토큰 분리 (단어, 공백, 기호)
  const tokens = line.split(/(\s+|[(),;:{}[\]"'])/);
  let insideString = false;
  let stringQuote = "";

  return tokens.map((tok, idx) => {
    if (tok === '"' || tok === "'" || tok === "`") {
      if (!insideString) {
        insideString = true;
        stringQuote = tok;
        return <span key={idx} className={styles.tokenString}>{tok}</span>;
      } else if (stringQuote === tok) {
        insideString = false;
        return <span key={idx} className={styles.tokenString}>{tok}</span>;
      }
    }

    if (insideString) {
      return <span key={idx} className={styles.tokenString}>{tok}</span>;
    }

    const lower = tok.toLowerCase();
    if (SQL_KEYWORDS.has(lower) || JS_KEYWORDS.has(lower)) {
      return <span key={idx} className={styles.tokenKeyword}>{tok}</span>;
    }

    if (/^\d+(\.\d+)?$/.test(tok)) {
      return <span key={idx} className={styles.tokenNumber}>{tok}</span>;
    }

    return tok;
  });
}

/**
 * Antigravity 2.13.0 스타일의 대용량 코드/데이터 가상화 뷰어 (Virtualized Viewer)
 * - 수천~수만 줄의 코드, SQL, JSONL 등을 메모리 누수나 버벅임 없이 60fps로 가상 렌더링
 * - 라인 번호 Gutter, 구문 강조, 텍스트 검색 지원
 */
export function VirtualizedCodeViewer({
  text,
  rowHeight = 24,
  height = "100%",
  className,
}: VirtualizedCodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(400);
  const [searchQuery, setSearchQuery] = useState("");

  const lines = useMemo(() => (text === "" ? [] : text.split(/\r?\n/)), [text]);
  const totalCount = lines.length;
  const totalHeight = totalCount * rowHeight;

  // 뷰포트 크기 측정
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    setViewportHeight(el.clientHeight || 400);

    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // 가상 윈도잉 계산 (오버스캔 버퍼 5줄 포함)
  const overscan = 5;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan
  );

  const visibleLines = useMemo(() => {
    const slice: { index: number; content: string }[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      slice.push({ index: i, content: lines[i] });
    }
    return slice;
  }, [lines, startIndex, endIndex]);

  // 검색 일치 라인 수 계산
  const matchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    const q = searchQuery.toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(q)).length;
  }, [lines, searchQuery]);

  return (
    <div className={`${styles.container} ${className || ""}`} style={{ height }}>
      {/* 상단 툴바 */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span>총 {totalCount.toLocaleString()}줄</span>
          <span>·</span>
          <span>가상 뷰어 (60fps 최적화)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {searchQuery.trim() && (
            <span style={{ fontSize: "0.72rem", color: "var(--accent, #d59a62)" }}>
              {matchCount}건 발견
            </span>
          )}
          <input
            type="text"
            className={styles.searchInput}
            placeholder="라인 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="코드 및 텍스트 라인 검색"
          />
        </div>
      </div>

      {/* 가상 스크롤 컨테이너 */}
      <div
        ref={containerRef}
        className={styles.scrollContainer}
        onScroll={handleScroll}
        tabIndex={0}
        aria-label="가상화 코드 스크롤 영역"
      >
        <div className={styles.contentWrapper} style={{ height: totalHeight }}>
          {visibleLines.map(({ index, content }) => {
            const top = index * rowHeight;
            return (
              <div
                key={index}
                className={styles.lineRow}
                style={{ top, height: rowHeight }}
              >
                <div className={styles.gutter}>{index + 1}</div>
                <div className={styles.lineContent}>
                  {renderSyntaxLine(content, searchQuery)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
