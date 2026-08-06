"use client";

import React, { useEffect, useState } from "react";
import { SparkBriefingItem } from "@/lib/adapters/sparkSync";
import styles from "./SparkBriefingWidget.module.css";

interface SparkBriefingWidgetProps {
  onDelete?: () => void;
  onNotify?: (msg: string) => void;
}

export function SparkBriefingWidget({ onDelete, onNotify }: SparkBriefingWidgetProps) {
  const [items, setItems] = useState<SparkBriefingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadBriefings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/spark/ingest");
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetch("/api/spark/ingest")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setItems(data.items || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const getCategoryClass = (cat: string) => {
    switch (cat) {
      case "meeting":
        return styles.tagMeeting;
      case "approval_required":
        return styles.tagApproval;
      case "urgent":
        return styles.tagUrgent;
      default:
        return styles.tagReference;
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "meeting":
        return "📅 회의";
      case "approval_required":
        return "🔑 결재/승인";
      case "urgent":
        return "🚨 긴급";
      default:
        return "📌 참고";
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.icon}>✨</span>
          <span className={styles.title}>Gemini Spark 클라우드 브리핑</span>
          <span className={styles.badge}>24h 상주 수신</span>
        </div>
        <div className={styles.actionBtns}>
          <button
            type="button"
            className={styles.btn}
            onClick={() => {
              void loadBriefings().then(() => {
                onNotify?.("Gemini Spark 최신 브리핑을 가져왔습니다 ⚡");
              });
            }}
            disabled={loading}
            title="수신 새로고침"
          >
            {loading ? "…" : "↻"}
          </button>
          {onDelete && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={onDelete}
              title="이 위젯 닫기"
            >
              🗑️
            </button>
          )}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className={styles.emptyState}>Gemini Spark 백그라운드 수신함 동기화 중... ⚡</div>
      ) : items.length === 0 ? (
        <div className={styles.emptyState}>수신된 Gemini Spark 브리핑이 없습니다.</div>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <div key={item.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={styles.sourceTag}>{item.sourceApp || "Gemini Spark"}</span>
                <span className={`${styles.categoryTag} ${getCategoryClass(item.category)}`}>
                  {getCategoryLabel(item.category)}
                </span>
                <span className={styles.time}>{item.timestamp}</span>
              </div>
              <div className={styles.cardTitle}>{item.title}</div>
              <div className={styles.cardSummary}>{item.summary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
