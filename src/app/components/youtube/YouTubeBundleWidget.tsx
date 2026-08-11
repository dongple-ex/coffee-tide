"use client";

import React, { useCallback, useEffect, useState } from "react";
import { YouTubeBundle, YouTubeVideo, YouTubeBundleApiResponse } from "@/lib/types/youtube";
import { DEFAULT_YOUTUBE_BUNDLES } from "@/lib/youtube/presets";
import { loadLS, saveLS, LS_YOUTUBE_BUNDLES, LS_YOUTUBE_ACTIVE_BUNDLE } from "@/lib/localStore";
import { SmartPlayerModal } from "./SmartPlayerModal";
import styles from "./youTubeBundleWidget.module.css";

interface YouTubeBundleWidgetProps {
  onNotify?: (msg: string) => void;
}

export function YouTubeBundleWidget({ onNotify }: YouTubeBundleWidgetProps) {
  const [bundles] = useState<YouTubeBundle[]>(() =>
    loadLS<YouTubeBundle[]>(LS_YOUTUBE_BUNDLES, DEFAULT_YOUTUBE_BUNDLES)
  );
  const [activeBundleId, setActiveBundleId] = useState<string>(() =>
    loadLS<string>(LS_YOUTUBE_ACTIVE_BUNDLE, DEFAULT_YOUTUBE_BUNDLES[0]?.id || "bundle-finance")
  );

  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [briefing, setBriefing] = useState<{ headline: string; keyPoints: string[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);

  const currentBundle = bundles.find((b) => b.id === activeBundleId) || bundles[0];

  // 번들 데이터 로딩
  const fetchBundleData = useCallback(
    async (bundle: YouTubeBundle, refresh = false) => {
      try {
        const res = await fetch("/api/youtube/bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bundleId: bundle.id,
            bundleName: bundle.name,
            channels: bundle.channels,
            refresh,
          }),
        });

        if (!res.ok) throw new Error();
        const data = (await res.json()) as YouTubeBundleApiResponse;

        if (data.success && Array.isArray(data.videos)) {
          setVideos(data.videos);
          setBriefing(data.briefing || null);
        } else {
          setVideos([]);
          setBriefing(null);
        }
      } catch {
        onNotify?.("앗, 유튜브 번들 피드를 가져오는 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [onNotify]
  );

  // 번들 변경 시 fetch
  useEffect(() => {
    if (!currentBundle) return;
    const loadTimer = window.setTimeout(() => {
      void fetchBundleData(currentBundle, false);
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [currentBundle, fetchBundleData]);

  const handleSelectBundle = (id: string) => {
    if (id === activeBundleId) return;
    setLoading(true);
    setSelectedChannel("all");
    setActiveBundleId(id);
    saveLS(LS_YOUTUBE_ACTIVE_BUNDLE, id);
  };

  // 필터링된 비디오 목록
  const displayedVideos = videos.filter((v) => {
    if (selectedChannel === "all") return true;
    return v.channelTitle.includes(selectedChannel) || selectedChannel.includes(v.channelTitle);
  });

  return (
    <div className={styles.container}>
      {/* 1. 상단 헤더 */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.title}>
            <span>📺</span>
            <span>유튜브 테마 묶음 피드</span>
          </div>
          <span className={styles.titleBadge}>스마트 번들</span>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => {
              if (currentBundle) {
                setLoading(true);
                void fetchBundleData(currentBundle, true);
                onNotify?.(`[${currentBundle.name}] 최신 영상을 다시 읽어왔습니다 📺`);
              }
            }}
            disabled={loading}
          >
            {loading ? "읽는 중..." : "↻ 새로고침"}
          </button>
        </div>
      </div>

      {/* 2. 번들 탭 목록 */}
      <div className={styles.bundleTabs}>
        {bundles
          .filter((b) => b.enabled)
          .map((b) => (
            <button
              key={b.id}
              type="button"
              className={`${styles.bundleTab} ${b.id === activeBundleId ? styles.bundleTabActive : ""}`}
              onClick={() => handleSelectBundle(b.id)}
            >
              <span>{b.icon}</span>
              <span>{b.name}</span>
            </button>
          ))}
      </div>

      {/* 3. 채널 필터 버튼 */}
      {currentBundle && currentBundle.channels.length > 0 && (
        <div className={styles.channelFilters}>
          <button
            type="button"
            className={`${styles.channelChip} ${selectedChannel === "all" ? styles.channelChipActive : ""}`}
            onClick={() => setSelectedChannel("all")}
          >
            전체 보기 ({videos.length})
          </button>
          {currentBundle.channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={`${styles.channelChip} ${selectedChannel === ch.name ? styles.channelChipActive : ""}`}
              onClick={() => setSelectedChannel(ch.name)}
            >
              {ch.name}
            </button>
          ))}
        </div>
      )}

      {/* 4. AI 다이제스트 브리핑 카드 */}
      {briefing && (
        <div className={styles.briefingCard}>
          <div className={styles.briefingHeader}>
            <span>✨</span>
            <span>{currentBundle?.name} AI 다이제스트</span>
          </div>
          <div className={styles.briefingHeadline}>{briefing.headline}</div>
          {briefing.keyPoints.length > 0 && (
            <ul className={styles.briefingPoints}>
              {briefing.keyPoints.map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 5. 비디오 그리드 목록 */}
      {loading && videos.length === 0 ? (
        <div className={styles.loadingHint}>
          {currentBundle?.name} 채널들의 최신 영상을 모으는 중입니다... ☕
        </div>
      ) : displayedVideos.length === 0 ? (
        <div className={styles.loadingHint}>등록된 영상이 없습니다.</div>
      ) : (
        <div className={styles.videoGrid}>
          {displayedVideos.map((video) => (
            <div
              key={video.id}
              className={styles.videoCard}
              onClick={() => setSelectedVideo(video)}
              title={`${video.title} - 스마트 플레이어로 시청`}
            >
              <div className={styles.thumbnailWrapper}>
                <img
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className={styles.thumbnailImg}
                  loading="lazy"
                />
                <div className={styles.playOverlay}>
                  <div className={styles.playBtnIcon}>▶</div>
                </div>
              </div>
              <div className={styles.videoInfo}>
                <div className={styles.channelMeta}>
                  <span className={styles.channelName}>{video.channelTitle}</span>
                  <span>{video.publishedAt}</span>
                </div>
                <div className={styles.videoTitle}>{video.title}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 6. 스마트 플레이어 모달 연동 */}
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
