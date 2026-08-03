"use client";

import React, { useEffect, useState } from "react";
import { ByteNewsArticle } from "../api/news/byte/route";
import styles from "./byteNewsWidget.module.css";

interface ByteNewsWidgetProps {
  onNotify?: (msg: string) => void;
}

export function ByteNewsWidget({ onNotify }: ByteNewsWidgetProps) {
  const [articles, setArticles] = useState<ByteNewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchNews = React.useCallback(async () => {
    try {
      const res = await fetch("/api/news/byte");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { articles?: ByteNewsArticle[] };
      if (data.articles) {
        setArticles(data.articles);
        if (data.articles.length > 0) {
          setExpandedId(data.articles[0].id);
        }
      }
    } catch {
      onNotify?.("앗, 바리스타 기사를 가져오는 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news/byte")
      .then((res) => (res.ok ? (res.json() as Promise<{ articles?: ByteNewsArticle[] }>) : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.articles) {
          setArticles(data.articles);
          if (data.articles.length > 0) {
            setExpandedId(data.articles[0].id);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          onNotify?.("앗, 바리스타 기사를 가져오는 중 오류가 발생했어요.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onNotify]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span>📰</span>
          <span>바이트 경제 브리핑</span>
          <span className={styles.titleBadge}>DAILY BYTE</span>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => {
            setLoading(true);
            void fetchNews();
            onNotify?.("최신 바이트 경제 기사를 읽어왔습니다 📰");
          }}
          disabled={loading}
        >
          {loading ? "읽는 중..." : "↻ 갱신"}
        </button>
      </div>

      {loading && articles.length === 0 ? (
        <div className={styles.loadingHint}>바이트컴퍼니의 최신 경제 기사를 읽어오는 중입니다... ☕</div>
      ) : (
        <div className={styles.newsList}>
          {articles.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`${styles.newsItem} ${isExpanded ? styles.newsItemActive : ""}`}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                <div className={styles.newsHeader}>
                  <span className={styles.catTag}>{item.category}</span>
                  <span className={styles.newsDate}>{item.date}</span>
                </div>
                <div className={styles.newsTitle}>{item.title}</div>
                {isExpanded && (
                  <>
                    <div className={styles.newsSummary}>{item.summary}</div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.readLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      🔗 바이트컴퍼니 원문 읽기 ↗
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
