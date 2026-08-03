"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { CustomNewsItem, CustomNewsResponse, SiteBriefing } from "@/lib/news/types";
import styles from "./customNewsWidget.module.css";

export interface CustomWidgetConfig {
  id: string;
  name: string;
  url: string;
  icon?: string;
  createdAt: string;
}

interface CustomNewsWidgetProps {
  widget: CustomWidgetConfig;
  onNotify?: (msg: string) => void;
  onDelete?: (id: string) => void;
  onUpdateName?: (id: string, newName: string) => void;
}

interface LoadError {
  reason: string;
  hint?: string;
}

export function CustomNewsWidget({ widget, onNotify, onDelete, onUpdateName }: CustomNewsWidgetProps) {
  const [articles, setArticles] = useState<CustomNewsItem[]>([]);
  const [briefing, setBriefing] = useState<SiteBriefing | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  // 인라인 제목 편집 state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingName, setEditingName] = useState(widget.name);

  const handleSaveTitle = () => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== widget.name && onUpdateName) {
      onUpdateName(widget.id, trimmed);
      onNotify?.(`위젯 이름이 [${trimmed}] (으)로 변경되었습니다 ✏️`);
    }
    setIsEditingTitle(false);
  };

  const fetchCustomArticles = useCallback(
    async (refresh = false) => {
      if (refresh) setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/news/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: widget.url, siteName: widget.name, refresh }),
        });
        const data = (await res.json()) as CustomNewsResponse;

        if (!data.success || data.articles.length === 0) {
          setArticles([]);
          setBriefing(null);
          setError({
            reason: data.reason ?? "최신 글을 가져오지 못했습니다.",
            hint: data.hint,
          });
          return;
        }

        setArticles(data.articles);
        setBriefing(data.briefing ?? null);
        setAiUsed(Boolean(data.aiUsed));
        // 첫 글은 펼친 상태로 두어 새로고침 직후 바로 핵심을 읽을 수 있게 한다.
        setExpandedIds(data.articles.length > 0 ? [data.articles[0].id] : []);
      } catch {
        setArticles([]);
        setBriefing(null);
        setError({
          reason: "네트워크 오류로 최신 소식을 읽어오지 못했습니다.",
          hint: "인터넷 연결을 확인하고 다시 시도해 주세요.",
        });
      } finally {
        setLoading(false);
      }
    },
    [widget.url, widget.name]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: widget.url, siteName: widget.name, refresh: false }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<CustomNewsResponse>) : null))
      .then((data) => {
        if (cancelled) return;
        if (!data || !data.success || data.articles.length === 0) {
          setArticles([]);
          setBriefing(null);
          setError({
            reason: data?.reason ?? "최신 글을 가져오지 못했습니다.",
            hint: data?.hint,
          });
        } else {
          setArticles(data.articles);
          setBriefing(data.briefing ?? null);
          setAiUsed(Boolean(data.aiUsed));
          setExpandedIds(data.articles.length > 0 ? [data.articles[0].id] : []);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setArticles([]);
          setBriefing(null);
          setError({
            reason: "네트워크 오류로 최신 소식을 읽어오지 못했습니다.",
            hint: "인터넷 연결을 확인하고 다시 시도해 주세요.",
          });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [widget.url, widget.name]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const allExpanded = articles.length > 0 && expandedIds.length === articles.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span>{widget.icon || "🌐"}</span>
          {isEditingTitle ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
                className={styles.titleEditInput}
                autoFocus
              />
              <button type="button" className={styles.editBtn} onClick={handleSaveTitle} title="저장">
                ✓
              </button>
              <button type="button" className={styles.editBtn} onClick={() => setIsEditingTitle(false)} title="취소">
                ✕
              </button>
            </div>
          ) : (
            <span
              className={styles.clickableTitle}
              onClick={() => {
                setEditingName(widget.name);
                setIsEditingTitle(true);
              }}
              title="클릭하여 위젯 이름 수정"
            >
              {widget.name} <span className={styles.editIcon}>✏️</span>
            </span>
          )}
          {articles.length > 0 && (
            <span className={styles.titleBadge}>{aiUsed ? "AI 요약" : "핵심 요약"}</span>
          )}
        </div>
        <div className={styles.actionBtns}>
          {articles.length > 0 && (
            <button
              type="button"
              className={styles.iconOnlyBtn}
              onClick={() =>
                setExpandedIds(allExpanded ? [] : articles.map((a) => a.id))
              }
              title={allExpanded ? "모든 요약 접기" : "모든 요약 펼치기"}
            >
              {allExpanded ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            className={styles.iconOnlyBtn}
            onClick={() => {
              void fetchCustomArticles(true).then(() => {
                onNotify?.(`${widget.name} 최신 소식을 다시 읽어왔습니다 🌐`);
              });
            }}
            disabled={loading}
            title="새로고침"
          >
            {loading ? (
              "…"
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
            )}
          </button>
          {onDelete && (
            <button
              type="button"
              className={`${styles.iconOnlyBtn} ${styles.btnDanger}`}
              onClick={() => onDelete(widget.id)}
              title="이 위젯 삭제"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>
      </div>

      {loading && articles.length === 0 && (
        <div className={styles.loadingHint}>
          {widget.name}의 최신 글을 읽고 핵심만 추리는 중입니다... ☕
        </div>
      )}

      {!loading && error && (
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>⚠️ {error.reason}</div>
          {error.hint && <div className={styles.errorHint}>{error.hint}</div>}
          <div className={styles.errorActions}>
            <button type="button" className={styles.btn} onClick={() => void fetchCustomArticles(true)}>
              ↻ 다시 시도
            </button>
            <a href={widget.url} target="_blank" rel="noreferrer" className={styles.readLink}>
              사이트 직접 열기 ↗
            </a>
          </div>
        </div>
      )}

      {briefing && !error && (
        <div className={styles.briefingBox}>
          <div className={styles.briefingLabel}>📌 지금 핵심 브리핑</div>
          <div className={styles.briefingHeadline}>{briefing.headline}</div>
          {briefing.keyPoints.length > 0 && (
            <ul className={styles.briefingList}>
              {briefing.keyPoints.map((point, i) => (
                <li key={`${i}-${point.slice(0, 12)}`}>{point}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {articles.length > 0 && (
        <div className={styles.articleList}>
          {articles.map((item) => {
            const isExpanded = expandedIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={`${styles.articleItem} ${isExpanded ? styles.articleItemActive : ""}`}
                onClick={() => toggleExpand(item.id)}
              >
                <div className={styles.articleHeader}>
                  <span className={styles.catTag}>{widget.name}</span>
                  <span className={styles.articleDate}>
                    {item.depth === "title" && <span className={styles.thinBadge}>제목만</span>}
                    {item.date}
                  </span>
                </div>
                <div className={styles.articleTitle}>{item.title}</div>

                {isExpanded && (
                  <>
                    {item.summary ? (
                      <div className={styles.articleSummary}>{item.summary}</div>
                    ) : (
                      <div className={styles.articleSummary}>
                        이 글은 본문을 공개하지 않아 요약을 만들지 못했습니다. 원문에서 확인해 주세요.
                      </div>
                    )}

                    {Array.isArray(item.points) && item.points.length > 0 && (
                      <ul className={styles.pointList}>
                        {item.points.map((p, i) => (
                          <li key={`${item.id}-p${i}`}>{p}</li>
                        ))}
                      </ul>
                    )}

                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.readLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      🔗 원문 전체 읽기 ↗
                    </a>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
