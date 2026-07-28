"use client";

import React, { useEffect, useState } from "react";
import { CustomNewsItem } from "../api/news/custom/route";
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
}

export function CustomNewsWidget({ widget, onNotify, onDelete }: CustomNewsWidgetProps) {
  const [articles, setArticles] = useState<CustomNewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchCustomArticles = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: widget.url, siteName: widget.name }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { articles?: CustomNewsItem[] };
      if (data.articles) {
        setArticles(data.articles);
        if (data.articles.length > 0) {
          setExpandedId(data.articles[0].id);
        }
      }
    } catch {
      onNotify?.(`앗, ${widget.name} 소식을 가져오는 중 오류가 발생했어요.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomArticles();
  }, [widget.url, widget.name]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span>{widget.icon || "🌐"}</span>
          <span>{widget.name}</span>
          <span className={styles.titleBadge}>CUSTOM</span>
        </div>
        <div className={styles.actionBtns}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              void fetchCustomArticles();
              onNotify?.(`${widget.name} 최신 소식을 읽어왔습니다 🌐`);
            }}
            disabled={loading}
          >
            {loading ? "읽는 중..." : "↻ 갱신"}
          </button>
          {onDelete && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => onDelete(widget.id)}
              title="이 커스텀 위젯 삭제"
            >
              🗑️ 삭제
            </button>
          )}
        </div>
      </div>

      {loading && articles.length === 0 ? (
        <div className={styles.loadingHint}>{widget.name} 최신 소식을 수집하는 중입니다... ☕</div>
      ) : (
        <div className={styles.articleList}>
          {articles.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`${styles.articleItem} ${isExpanded ? styles.articleItemActive : ""}`}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                <div className={styles.articleHeader}>
                  <span className={styles.catTag}>{widget.name}</span>
                  <span className={styles.articleDate}>{item.date}</span>
                </div>
                <div className={styles.articleTitle}>{item.title}</div>
                {isExpanded && (
                  <>
                    <div className={styles.articleSummary}>{item.summary}</div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.readLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      🔗 원문 기사 읽기 ↗
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
