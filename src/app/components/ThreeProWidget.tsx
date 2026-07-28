"use client";

import React, { useEffect, useState } from "react";
import { ThreeProVideo } from "../api/news/threepro/route";
import styles from "./threeProWidget.module.css";

interface ThreeProWidgetProps {
  onNotify?: (msg: string) => void;
}

export function ThreeProWidget({ onNotify }: ThreeProWidgetProps) {
  const [videos, setVideos] = useState<ThreeProVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchVideos = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/news/threepro");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { videos?: ThreeProVideo[] };
      if (data.videos) {
        setVideos(data.videos);
        if (data.videos.length > 0) {
          setExpandedId(data.videos[0].id);
        }
      }
    } catch {
      onNotify?.("앗, 삼프로TV 브리핑을 가져오는 중 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchVideos();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span>📺</span>
          <span>삼프로TV 경제 심층 브리핑</span>
          <span className={styles.titleBadge}>3PRO TV</span>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => {
            void fetchVideos();
            onNotify?.("최신 삼프로TV 경제 브리핑을 가져왔습니다 📺");
          }}
          disabled={loading}
        >
          {loading ? "읽는 중..." : "↻ 갱신"}
        </button>
      </div>

      {loading && videos.length === 0 ? (
        <div className={styles.loadingHint}>삼프로TV 최신 경제 브리핑 방송을 가져오는 중입니다... ☕</div>
      ) : (
        <div className={styles.videoList}>
          {videos.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`${styles.videoItem} ${isExpanded ? styles.videoItemActive : ""}`}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                <div className={styles.videoHeader}>
                  <span className={styles.catTag}>{item.category}</span>
                  <span className={styles.videoDate}>{item.date}</span>
                </div>
                <div className={styles.videoTitle}>{item.title}</div>
                {item.speaker && <div className={styles.speakerInfo}>🎙️ 출연: {item.speaker}</div>}
                {isExpanded && (
                  <>
                    <div className={styles.videoSummary}>{item.summary}</div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.watchLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      ▶️ 삼프로TV 영상 보기 ↗
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
