"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import React, { useEffect, useState } from "react";
import { ContextualRecommendation, YouTubeVideo } from "@/lib/types/youtube";
import { loadYouTubeContinuitySession } from "@/lib/youtube/continuity";
import { UiIcon } from "../UiIcon";

// 영상 선택 후에만 열리는 대형 플레이어 모달 — 초기 번들에서 제외
const SmartPlayerModal = dynamic(() => import("./SmartPlayerModal").then((m) => m.SmartPlayerModal), { ssr: false });
import styles from "./contextualRecStrip.module.css";

const LS_REC_DISMISSED_DATE = "ct_rec_dismissed_date";

function todayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

interface ContextualRecStripProps {
  onNotify?: (msg: string) => void;
  userScope?: string;
}

export function ContextualRecStrip({ onNotify, userScope }: ContextualRecStripProps) {
  const [continuitySession] = useState(() => {
    const session = loadYouTubeContinuitySession(userScope);
    return session && session.owner === "contextual" ? session : null;
  });
  const [rec, setRec] = useState<ContextualRecommendation | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(
    () => continuitySession?.video ?? null
  );
  const [initialSeekTime, setInitialSeekTime] = useState<number>(
    () => continuitySession?.currentTime ?? 0
  );
  const [initialDraft, setInitialDraft] = useState<string>(
    () => continuitySession?.chatDraft ?? ""
  );
  const [isDismissed, setIsDismissed] = useState<boolean>(true); // 기본 true로 두고 마운트 시 체크

  useEffect(() => {
    // 오늘 닫은 적이 있는지 확인
    const today = todayInSeoul();
    const savedDismissed = localStorage.getItem(LS_REC_DISMISSED_DATE);
    if (savedDismissed === today) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    void fetch("/api/youtube/recommend?tz=Asia%2FSeoul", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!controller.signal.aborted && data?.success && data.recommendation) {
          setRec(data.recommendation);
          setIsDismissed(false);
        }
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const handleDismiss = () => {
    const today = todayInSeoul();
    localStorage.setItem(LS_REC_DISMISSED_DATE, today);
    setIsDismissed(true);
    onNotify?.("추천 영상 카드를 숨겼습니다. 내일 새로운 추천으로 다시 나타납니다.");
  };

  const handleSelectVideo = (video: YouTubeVideo) => {
    setInitialSeekTime(0);
    setInitialDraft("");
    setSelectedVideo(video);
  };

  const isStripVisible = !isDismissed && rec && rec.videos && rec.videos.length > 0;

  if (!isStripVisible && !selectedVideo) return null;

  return (
    <>
      {isStripVisible && (
        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.badge}>
              <UiIcon name="video" size={16} />
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
            {rec.videos.map((video, index) => (
              <button
                key={video.id}
                type="button"
                className={styles.card}
                onClick={() => handleSelectVideo(video)}
                title={`${video.title} - 시청하기`}
              >
                <div className={styles.thumbWrapper}>
                  <Image
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className={styles.thumbImg}
                    fill
                    sizes="160px"
                    loading={index === 0 ? "eager" : "lazy"}
                  />
                </div>
                <div className={styles.info}>
                  <div className={styles.title}>{video.title}</div>
                  <div className={styles.channel}>{video.channelTitle}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedVideo && (
        <SmartPlayerModal
          key={selectedVideo.id}
          video={selectedVideo}
          owner="contextual"
          initialSeekTime={initialSeekTime}
          initialChatDraft={initialDraft}
          initialIsMini={continuitySession?.isMini}
          initialPlayerState={continuitySession?.playerState}
          initialWasPlaying={continuitySession?.wasPlayingOnHide}
          userScope={userScope}
          onClose={() => {
            setSelectedVideo(null);
            setInitialSeekTime(0);
            setInitialDraft("");
          }}
          onNotify={onNotify}
        />
      )}
    </>
  );
}
