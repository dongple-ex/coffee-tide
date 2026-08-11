"use client";

import React, { useEffect, useState } from "react";
import { ContextualRecommendation, YouTubeVideo } from "@/lib/types/youtube";
import { SmartPlayerModal } from "./SmartPlayerModal";
import styles from "./contextualRecStrip.module.css";

const LS_REC_DISMISSED_DATE = "ct_rec_dismissed_date";

interface ContextualRecStripProps {
  onNotify?: (msg: string) => void;
}

export function ContextualRecStrip({ onNotify }: ContextualRecStripProps) {
  const [rec, setRec] = useState<ContextualRecommendation | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(true); // 기본 true로 두고 마운트 시 체크

  useEffect(() => {
    // 오늘 닫은 적이 있는지 확인
    const today = new Date().toISOString().split("T")[0];
    const savedDismissed = localStorage.getItem(LS_REC_DISMISSED_DATE);
    if (savedDismissed === today) return;

    fetch("/api/youtube/recommend")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.success && data.recommendation) {
          setRec(data.recommendation);
          setIsDismissed(false);
        }
      })
      .catch(() => {});
  }, []);

  const handleDismiss = () => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(LS_REC_DISMISSED_DATE, today);
    setIsDismissed(true);
    onNotify?.("💡 추천 영상 카드를 숨겼습니다. (내일 새로운 추천으로 다시 나타납니다)");
  };

  if (isDismissed || !rec || !rec.videos || rec.videos.length === 0) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.badge}>
          <span>💡</span>
          <span>{rec.badge}</span>
        </div>
        <div className={styles.headline}>{rec.headline}</div>
      </div>

      <button
        type="button"
        className={styles.closeBtn}
        onClick={handleDismiss}
        title="오늘 하루 이 추천 카드 숨기기"
        aria-label="오늘 하루 추천 카드 숨기기"
      >
        ✕
      </button>

      <div className={styles.scrollRow}>
        {rec.videos.map((video) => (
          <div
            key={video.id}
            className={styles.card}
            onClick={() => setSelectedVideo(video)}
            title={`${video.title} - 시청하기`}
          >
            <div className={styles.thumbWrapper}>
              <img src={video.thumbnailUrl} alt={video.title} className={styles.thumbImg} />
            </div>
            <div className={styles.info}>
              <div className={styles.title}>{video.title}</div>
              <div className={styles.channel}>{video.channelTitle}</div>
            </div>
          </div>
        ))}
      </div>

      {selectedVideo && (
        <SmartPlayerModal
          key={selectedVideo.id}
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
