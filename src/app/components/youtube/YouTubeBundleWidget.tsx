"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import type { YouTubeBundle, YouTubeVideo, YouTubeBundleApiResponse } from "@/lib/types/youtube";
import { DEFAULT_YOUTUBE_BUNDLES } from "@/lib/youtube/presets";
import {
  loadLS,
  saveLS,
  LS_YOUTUBE_BUNDLES,
  LS_YOUTUBE_ACTIVE_BUNDLE,
  YOUTUBE_BUNDLES_CHANGED_EVENT,
} from "@/lib/localStore";
import { SmartPlayerModal } from "./SmartPlayerModal";
import styles from "./youTubeBundleWidget.module.css";

interface YouTubeBundleWidgetProps {
  onNotify?: (msg: string) => void;
}

export function YouTubeBundleWidget({ onNotify }: YouTubeBundleWidgetProps) {
  const tabPanelId = useId();
  const [bundles, setBundles] = useState<YouTubeBundle[]>(() =>
    loadLS<YouTubeBundle[]>(LS_YOUTUBE_BUNDLES, DEFAULT_YOUTUBE_BUNDLES)
  );
  const [activeBundleId, setActiveBundleId] = useState<string>(() =>
    loadLS<string>(LS_YOUTUBE_ACTIVE_BUNDLE, DEFAULT_YOUTUBE_BUNDLES[0]?.id || "bundle-finance")
  );
  const [selectedChannel, setSelectedChannel] = useState("all");
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [briefing, setBriefing] = useState<{ headline: string; keyPoints: string[] } | null>(null);
  const [loading, setLoading] = useState(() => bundles.some((bundle) => bundle.enabled));
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const enabledBundles = bundles.filter((bundle) => bundle.enabled);
  const currentBundle = enabledBundles.find((bundle) => bundle.id === activeBundleId) || enabledBundles[0];

  useEffect(() => {
    const syncBundles = () => {
      const next = loadLS<YouTubeBundle[]>(LS_YOUTUBE_BUNDLES, DEFAULT_YOUTUBE_BUNDLES);
      setBundles(next);
      setSelectedChannel("all");
      const nextEnabled = next.filter((bundle) => bundle.enabled);
      setActiveBundleId((currentId) => {
        if (nextEnabled.some((bundle) => bundle.id === currentId)) return currentId;
        const fallbackId = nextEnabled[0]?.id ?? "";
        if (fallbackId) saveLS(LS_YOUTUBE_ACTIVE_BUNDLE, fallbackId);
        return fallbackId;
      });
      if (nextEnabled.length === 0) {
        activeRequest.current?.abort();
        requestSequence.current += 1;
        setLoading(false);
        setVideos([]);
        setBriefing(null);
        setErrorMessage("");
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LS_YOUTUBE_BUNDLES) syncBundles();
    };
    window.addEventListener(YOUTUBE_BUNDLES_CHANGED_EVENT, syncBundles);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(YOUTUBE_BUNDLES_CHANGED_EVENT, syncBundles);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const fetchBundleData = useCallback(
    async (bundle: YouTubeBundle, refresh = false) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      const requestId = ++requestSequence.current;
      let timedOut = false;
      const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, 15_000);
      setLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch("/api/youtube/bundle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bundleId: bundle.id,
            bundleName: bundle.name,
            channels: bundle.channels,
            refresh,
          }),
          signal: controller.signal,
        });
        const data = (await response.json()) as YouTubeBundleApiResponse;
        if (!response.ok || !data.success) {
          throw new Error(data.reason || "유튜브 번들을 불러오지 못했습니다.");
        }
        if (requestId !== requestSequence.current) return;

        setVideos(Array.isArray(data.videos) ? data.videos : []);
        setBriefing(data.briefing || null);
        if (data.partial) onNotify?.("일부 YouTube 채널은 응답하지 않아 가져온 영상만 표시합니다.");
        if (data.reason) setErrorMessage(data.reason);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError" && !timedOut) return;
        if (requestId !== requestSequence.current) return;
        const message = timedOut
          ? "유튜브 번들 요청 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
          : error instanceof Error
            ? error.message
            : "유튜브 번들을 불러오지 못했습니다.";
        setVideos([]);
        setBriefing(null);
        setErrorMessage(message);
        onNotify?.(`📺 ${message}`);
      } finally {
        window.clearTimeout(timeout);
        if (activeRequest.current === controller) activeRequest.current = null;
        if (requestId === requestSequence.current) setLoading(false);
      }
    },
    [onNotify]
  );

  useEffect(() => {
    if (!currentBundle) {
      return;
    }
    const controller = new AbortController();
    const loadTimer = window.setTimeout(() => {
      if (!controller.signal.aborted) void fetchBundleData(currentBundle, false);
    }, 0);
    return () => {
      window.clearTimeout(loadTimer);
      controller.abort();
      activeRequest.current?.abort();
    };
  }, [currentBundle, fetchBundleData]);

  const handleSelectBundle = (id: string) => {
    if (id === currentBundle?.id) return;
    setVideos([]);
    setBriefing(null);
    setErrorMessage("");
    setSelectedChannel("all");
    setActiveBundleId(id);
    saveLS(LS_YOUTUBE_ACTIVE_BUNDLE, id);
  };

  const handleBundleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => {
    const currentIndex = enabledBundles.findIndex((bundle) => bundle.id === id);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % enabledBundles.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + enabledBundles.length) % enabledBundles.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = enabledBundles.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextId = enabledBundles[nextIndex]?.id;
    if (!nextId) return;
    handleSelectBundle(nextId);
    window.requestAnimationFrame(() => tabRefs.current.get(nextId)?.focus());
  };

  const displayedVideos = videos.filter((video) => {
    if (selectedChannel === "all") return true;
    return video.sourceChannelId === selectedChannel;
  });

  return (
    <div className={styles.container} aria-busy={loading}>
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
              if (!currentBundle) return;
              void fetchBundleData(currentBundle, true);
              onNotify?.(`[${currentBundle.name}] 최신 영상을 다시 확인합니다 📺`);
            }}
            disabled={loading || !currentBundle}
          >
            {loading ? "읽는 중..." : "↻ 새로고침"}
          </button>
        </div>
      </div>

      <div className={styles.bundleTabs} role="tablist" aria-label="유튜브 번들">
        {enabledBundles.map((bundle) => (
          <button
            key={bundle.id}
            type="button"
            role="tab"
            aria-selected={bundle.id === currentBundle?.id}
            aria-controls={tabPanelId}
            tabIndex={bundle.id === currentBundle?.id ? 0 : -1}
            ref={(element) => {
              if (element) tabRefs.current.set(bundle.id, element);
              else tabRefs.current.delete(bundle.id);
            }}
            className={`${styles.bundleTab} ${bundle.id === currentBundle?.id ? styles.bundleTabActive : ""}`}
            onClick={() => handleSelectBundle(bundle.id)}
            onKeyDown={(event) => handleBundleTabKeyDown(event, bundle.id)}
          >
            <span>{bundle.icon}</span>
            <span>{bundle.name}</span>
          </button>
        ))}
      </div>

      {!currentBundle && (
        <div className={styles.loadingHint}>활성화된 유튜브 번들이 없습니다. 설정에서 번들을 켜 주세요.</div>
      )}

      <div
        id={tabPanelId}
        role="tabpanel"
        className={styles.tabPanel}
        aria-label={currentBundle ? `${currentBundle.name} 영상` : "유튜브 번들 영상"}
      >
      {currentBundle && currentBundle.channels.length > 0 && (
        <div className={styles.channelFilters} aria-label="채널 필터">
          <button
            type="button"
            className={`${styles.channelChip} ${selectedChannel === "all" ? styles.channelChipActive : ""}`}
            onClick={() => setSelectedChannel("all")}
          >
            전체 보기 ({videos.length})
          </button>
          {currentBundle.channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={`${styles.channelChip} ${selectedChannel === channel.id ? styles.channelChipActive : ""}`}
              onClick={() => setSelectedChannel(channel.id)}
            >
              {channel.name}
            </button>
          ))}
        </div>
      )}

      {briefing && (
        <div className={styles.briefingCard}>
          <div className={styles.briefingHeader}>
            <span>✨</span>
            <span>{currentBundle?.name} AI 다이제스트</span>
          </div>
          <div className={styles.briefingHeadline}>{briefing.headline}</div>
          {briefing.keyPoints.length > 0 && (
            <ul className={styles.briefingPoints}>
              {briefing.keyPoints.map((point, index) => <li key={index}>{point}</li>)}
            </ul>
          )}
        </div>
      )}

      {errorMessage && <div className={styles.errorHint} role="status">{errorMessage}</div>}

      {loading && videos.length === 0 ? (
        <div className={styles.loadingHint}>{currentBundle?.name} 채널의 최신 영상을 모으는 중입니다... ☕</div>
      ) : displayedVideos.length === 0 && currentBundle ? (
        <div className={styles.loadingHint}>표시할 영상이 없습니다.</div>
      ) : (
        <div className={styles.videoGrid}>
          {displayedVideos.map((video) => (
            <button
              key={`${video.sourceChannelId || video.channelId}:${video.id}`}
              type="button"
              className={styles.videoCard}
              onClick={() => setSelectedVideo(video)}
              title={`${video.title} - 스마트 플레이어로 시청`}
            >
              <div className={styles.thumbnailWrapper}>
                <Image
                  src={video.thumbnailUrl}
                  alt={video.title}
                  className={styles.thumbnailImg}
                  fill
                  sizes="(max-width: 600px) 100vw, 240px"
                />
                <div className={styles.playOverlay} aria-hidden="true">
                  <div className={styles.playBtnIcon}>▶</div>
                </div>
              </div>
              <div className={styles.videoInfo}>
                <div className={styles.channelMeta}>
                  <span className={styles.channelName}>{video.sourceChannelName || video.channelTitle}</span>
                  <span>{video.publishedAt}</span>
                </div>
                <div className={styles.videoTitle}>{video.title}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedVideo && (
        <SmartPlayerModal
          key={selectedVideo.id}
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onNotify={onNotify}
        />
      )}
      </div>
    </div>
  );
}
