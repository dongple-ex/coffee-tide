"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { YouTubeVideo, YouTubeChapter, YouTubeContinuityOwner } from "@/lib/types/youtube";
import { loadLS, saveLS, LS_YOUTUBE_HISTORY } from "@/lib/localStore";
import { saveYouTubeContinuitySession, clearYouTubeContinuitySession } from "@/lib/youtube/continuity";
import { UiIcon } from "../UiIcon";
import styles from "./smartPlayerModal.module.css";

interface ChatMessage {
  role: "user" | "model";
  content: string;
  timestamps?: { time: string; seconds: number; label: string }[];
}

interface SmartPlayerModalProps {
  video: YouTubeVideo | null;
  onClose: () => void;
  onNotify?: (msg: string) => void;
  owner?: YouTubeContinuityOwner;
  initialSeekTime?: number;
  initialChatDraft?: string;
  initialIsMini?: boolean;
  initialPlayerState?: "playing" | "paused" | "buffering" | "ended" | "unknown";
  initialWasPlaying?: boolean;
  activeWidgetId?: string | null;
  userScope?: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
]);
const YOUTUBE_EMBED_ORIGIN = "https://www.youtube-nocookie.com";

function extractYoutubeVideoId(video: YouTubeVideo | null): string {
  if (!video) return "";
  if (video.url) {
    const match = video.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(video.id)) return video.id;
  return video.id;
}

function formatSecondsToMinute(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}분 ${s < 10 ? `0${s}` : s}초`;
}

export function SmartPlayerModal({
  video,
  onClose,
  onNotify,
  owner = "bundle",
  initialSeekTime = 0,
  initialChatDraft = "",
  initialIsMini,
  initialPlayerState,
  initialWasPlaying,
  activeWidgetId = null,
  userScope,
}: SmartPlayerModalProps) {
  const isClientMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const minimizeButtonRef = useRef<HTMLButtonElement>(null);
  const miniRestoreButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const chatRequestRef = useRef<AbortController | null>(null);
  const onCloseRef = useRef(onClose);
  const mountedRef = useRef(true);
  const isMiniRef = useRef(false);
  const modeMountedRef = useRef(false);

  // 복원 세션인 경우 직전 재생 여부(wasPlaying / playerState)에 따라 자동재생 결정, 신규는 항상 자동재생
  const isRestoredSession = Boolean(
    (initialSeekTime && initialSeekTime > 0) ||
    initialPlayerState !== undefined ||
    initialWasPlaying !== undefined
  );
  const shouldAutoplay = isRestoredSession
    ? Boolean(initialWasPlaying === true || initialPlayerState === "playing")
    : true;

  // 재생 위치 및 상태 추적용 Ref
  const currentTimeRef = useRef<number>(initialSeekTime || 0);
  const playerStateRef = useRef<"playing" | "paused" | "buffering" | "ended" | "unknown">(
    initialPlayerState || (shouldAutoplay ? "playing" : "paused")
  );
  const wasPlayingRef = useRef<boolean>(shouldAutoplay);
  const ownerRef = useRef<YouTubeContinuityOwner>(owner);
  const activeWidgetIdRef = useRef<string | null>(activeWidgetId);
  const userScopeRef = useRef<string | undefined>(userScope);
  const chatInputRef = useRef<string>(initialChatDraft || "");

  const titleId = useId();
  const miniTitleId = useId();
  const ytVideoId = extractYoutubeVideoId(video);
  const needsDetails = Boolean(
    video && (!video.summary || !video.chapters || video.chapters.length === 0)
  );
  const [chapters, setChapters] = useState<YouTubeChapter[]>(video?.chapters || []);
  const [summary, setSummary] = useState<string>(video?.summary || "");
  const [points, setPoints] = useState<string[]>(video?.points || []);
  const [loadingDetails, setLoadingDetails] = useState(needsDetails);
  const [detailsError, setDetailsError] = useState("");

  // 이어서 재생 안내 배너 (초기 위치가 3초 이상이고 복원 세션인 경우 노출)
  const [showResumeNotice, setShowResumeNotice] = useState(() => initialSeekTime >= 3);

  // 미니 플레이어 (PIP) 모드 여부: 복원 세션의 initialIsMini 우선, 없으면 뷰포트 반응형 기본값
  const [isMini, setIsMini] = useState(() => {
    if (typeof initialIsMini === "boolean") {
      return initialIsMini;
    }
    return typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches;
  });
  const [isMobileViewport, setIsMobileViewport] = useState(isMini);
  const isMobileViewportRef = useRef(isMini);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "model", content: "이 영상에 대해 궁금한 점을 질문해 보세요." },
  ]);
  const [chatInput, setChatInput] = useState(initialChatDraft || "");
  const [chatBusy, setChatBusy] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    ownerRef.current = owner;
    activeWidgetIdRef.current = activeWidgetId;
    userScopeRef.current = userScope;
  }, [onClose, owner, activeWidgetId, userScope]);

  useEffect(() => {
    chatInputRef.current = chatInput;
  }, [chatInput]);

  // 현재 세션 즉시 저장 유틸
  const saveCurrentSession = useCallback(() => {
    if (!video) return;
    saveYouTubeContinuitySession({
      owner: ownerRef.current,
      video,
      videoId: ytVideoId || video.id,
      currentTime: currentTimeRef.current,
      playerState: playerStateRef.current,
      wasPlayingOnHide: wasPlayingRef.current || playerStateRef.current === "playing",
      isMini: isMiniRef.current,
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      activeWidget: activeWidgetIdRef.current,
      chatDraft: chatInputRef.current,
      userScope: userScopeRef.current,
    });

    try {
      const history = loadLS<Array<{ videoId: string; title: string; url: string; watchedAt: string; lastPos: number }>>(
        LS_YOUTUBE_HISTORY,
        []
      );
      const targetId = ytVideoId || video.id;
      const idx = history.findIndex((item) => item.videoId === targetId);
      if (idx >= 0) {
        history[idx].lastPos = Math.floor(currentTimeRef.current);
        saveLS(LS_YOUTUBE_HISTORY, history);
      }
    } catch {
      // 무시
    }
  }, [video, ytVideoId]);

  // 사용자가 명시적으로 플레이어를 닫는 경우 세션 삭제
  const handleExplicitClose = useCallback(() => {
    clearYouTubeContinuitySession();
    onCloseRef.current();
  }, []);

  // visibilitychange 및 pagehide 생명주기 연동
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveCurrentSession();
      } else if (document.visibilityState === "visible") {
        if (wasPlayingRef.current && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: "command", func: "playVideo", args: [] }),
            YOUTUBE_EMBED_ORIGIN
          );
        }
      }
    };

    const handlePageHide = () => {
      saveCurrentSession();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [saveCurrentSession]);

  // YouTube IFrame postMessage 리스너 & listening 등록
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || "";
      if (!ALLOWED_ORIGINS.has(origin)) {
        return;
      }
      if (iframeRef.current && event.source !== iframeRef.current.contentWindow) {
        return;
      }
      try {
        let data = event.data;
        if (typeof data === "string") {
          data = JSON.parse(data);
        }
        if (!data || typeof data !== "object") return;

        if (data.event === "onReady") {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: "listening", id: 1 }),
            YOUTUBE_EMBED_ORIGIN
          );
          if (initialSeekTime && initialSeekTime > 0) {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "seekTo", args: [initialSeekTime, true] }),
              YOUTUBE_EMBED_ORIGIN
            );
          }
          if (shouldAutoplay) {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: "command", func: "playVideo", args: [] }),
              YOUTUBE_EMBED_ORIGIN
            );
          }
        }

        if (data.event === "infoDelivery" && data.info) {
          if (typeof data.info.currentTime === "number") {
            currentTimeRef.current = data.info.currentTime;
          }
          if (typeof data.info.playerState !== "undefined") {
            const stateCode = data.info.playerState;
            let nextState: "playing" | "paused" | "buffering" | "ended" | "unknown" = "unknown";
            if (stateCode === 1) nextState = "playing";
            else if (stateCode === 2) nextState = "paused";
            else if (stateCode === 3) nextState = "buffering";
            else if (stateCode === 0) nextState = "ended";

            playerStateRef.current = nextState;
            if (nextState === "playing") {
              wasPlayingRef.current = true;
              setShowResumeNotice(false);
            } else if (nextState === "paused" || nextState === "ended") {
              wasPlayingRef.current = false;
            }
          }
        }
      } catch {
        // JSON 파싱 에러 무시
      }
    };

    window.addEventListener("message", handleMessage);

    const t1 = window.setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: 1 }),
        YOUTUBE_EMBED_ORIGIN
      );
    }, 600);

    const t2 = window.setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: 1 }),
        YOUTUBE_EMBED_ORIGIN
      );
    }, 1800);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [initialSeekTime, shouldAutoplay]);

  useEffect(() => {
    isMiniRef.current = isMini;
    if (!modeMountedRef.current) {
      modeMountedRef.current = true;
      return;
    }
    window.requestAnimationFrame(() => {
      if (isMini) miniRestoreButtonRef.current?.focus();
      else minimizeButtonRef.current?.focus();
    });
  }, [isMini]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const syncViewport = () => {
      isMobileViewportRef.current = mediaQuery.matches;
      setIsMobileViewport(mediaQuery.matches);
    };
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => {
      if (isMiniRef.current) miniRestoreButtonRef.current?.focus();
      else closeButtonRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (isMiniRef.current) setIsMini(false);
        else handleExplicitClose();
        return;
      }
      if (
        (isMiniRef.current && isMobileViewportRef.current) ||
        event.key !== "Tab" ||
        !modalContainerRef.current
      ) return;
      const focusable = Array.from(
        modalContainerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), iframe, [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("keydown", handleKeyDown);
      chatRequestRef.current?.abort();
      previousFocusRef.current?.focus();
    };
  }, [handleExplicitClose]);

  useEffect(() => {
    if (isMini && isMobileViewport) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isMini, isMobileViewport]);


  useEffect(() => {
    if (!video) return;
    const history = loadLS<Array<{ videoId: string; title: string; url: string; watchedAt: string; lastPos: number }>>(
      LS_YOUTUBE_HISTORY,
      []
    );
    const next = [
      { videoId: ytVideoId || video.id, title: video.title, url: video.url, watchedAt: new Date().toISOString(), lastPos: 0 },
      ...history.filter((item) => item.videoId !== (ytVideoId || video.id)),
    ].slice(0, 50);
    saveLS(LS_YOUTUBE_HISTORY, next);
  }, [video, ytVideoId]);

  // 영상 로딩 및 자막/메타데이터 분석
  useEffect(() => {
    if (!video) return;
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12_000);

    // 상세 요약 및 챕터가 없는 경우 백엔드 API 요청
    if (needsDetails) {
      fetch("/api/youtube/transcript-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: ytVideoId || video.id, url: video.url }),
        signal: controller.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!active) return;
          if (data && data.success) {
            if (data.summary) setSummary(data.summary);
            if (Array.isArray(data.points)) setPoints(data.points);
            if (Array.isArray(data.chapters) && data.chapters.length > 0) {
              setChapters(data.chapters);
            }
          } else {
            setDetailsError("영상 자막을 가져오지 못해 등록된 정보만 표시합니다.");
          }
        })
        .catch(() => {
          if (active && timedOut) setDetailsError("영상 분석 시간이 초과되어 등록된 정보만 표시합니다.");
          else if (active && !controller.signal.aborted) setDetailsError("영상 정보를 가져오지 못해 등록된 정보만 표시합니다.");
        })
        .finally(() => {
          if (active) setLoadingDetails(false);
        });
    } else {
      window.clearTimeout(timeout);
    }

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [video, ytVideoId, needsDetails]);

  if (!video) return null;

  // IFrame 내부 특정 초로 이동 및 자동 재생
  const seekTo = (seconds: number) => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [seconds, true] }),
        "*"
      );
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: "command", func: "playVideo", args: [] }),
        "*"
      );
      onNotify?.(`⏱️ ${Math.floor(seconds / 60)}분 ${seconds % 60}초 시점으로 이동했습니다.`);
    }
  };

  // 브라우저 별도 독립 팝업 창 분리 실행
  const handleOpenExternalPopup = () => {
    const width = 640;
    const height = 400;
    const left = Math.max(0, Math.round((window.screen.width - width) / 2));
    const top = Math.max(0, Math.round((window.screen.height - height) / 2));

    const popupUrl = `https://www.youtube-nocookie.com/embed/${ytVideoId}?autoplay=1&enablejsapi=1`;
    window.open(
      popupUrl,
      `yt_popup_${ytVideoId}`,
      `width=${width},height=${height},top=${top},left=${left},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );
    onNotify?.("별도 팝업 창으로 영상을 분리했습니다.");
    onClose();
  };

  // AI 채팅 전송
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatBusy) return;

    const newMsgs: ChatMessage[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(newMsgs);
    setChatInput("");
    setChatBusy(true);

    const controller = new AbortController();
    chatRequestRef.current?.abort();
    chatRequestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch("/api/ai/youtube-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: video.url, messages: newMsgs }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.reply) {
        setChatMessages([
          ...newMsgs,
          { role: "model", content: data.reply, timestamps: data.timestamps || [] },
        ]);
      } else {
        throw new Error(data.error || "답변을 가져오지 못했습니다.");
      }
    } catch (error) {
      if (!mountedRef.current) return;
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "영상 질문 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
        : error instanceof Error && error.message
          ? error.message
          : "앗, 영상 질문을 처리하는 중 오류가 발생했습니다.";
      setChatMessages([
        ...newMsgs,
        { role: "model", content: message },
      ]);
    } finally {
      window.clearTimeout(timeout);
      if (chatRequestRef.current === controller) chatRequestRef.current = null;
      if (mountedRef.current) setChatBusy(false);
    }
  };

  const isMobileFloating = isMini && isMobileViewport;

  if (!isClientMounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      {isMini && !isMobileFloating && <div className={styles.focusBackdrop} aria-hidden="true" />}
      <div
        className={isMini ? styles.miniLayer : styles.modalBackdrop}
        onClick={isMini ? undefined : handleExplicitClose}
      >
        <div
          ref={modalContainerRef}
          className={isMini ? styles.miniContainer : styles.modalContent}
          onClick={(event) => event.stopPropagation()}
          role={isMobileFloating ? "region" : "dialog"}
          aria-modal={isMobileFloating ? undefined : true}
          aria-labelledby={isMini ? miniTitleId : titleId}
          tabIndex={-1}
        >
          <div className={isMini ? styles.miniHeader : styles.modalHeader}>
            {isMini ? (
              <>
                <button
                  ref={miniRestoreButtonRef}
                  type="button"
                  className={styles.miniBrandButton}
                  onClick={() => setIsMini(false)}
                  title="CoffeeTide 화면 복원"
                  aria-label="CoffeeTide 화면 복원"
                >
                  <Image src="/icon-192.png" alt="" width={26} height={26} aria-hidden="true" />
                  <span>CoffeeTide</span>
                </button>
                <div id={miniTitleId} className={styles.miniTitle} title={video.title}>
                  {video.title}
                </div>
              </>
            ) : (
              <div className={styles.modalTitle}>
                <UiIcon name="video" size={18} />
                <span id={titleId}>{video.title}</span>
              </div>
            )}

            <div className={styles.headerActions}>
              {isMini ? (
                <button
                  type="button"
                  className={styles.headerActionBtn}
                  onClick={() => setIsMini(false)}
                  data-tooltip="CoffeeTide 화면 복원"
                  aria-label="CoffeeTide 화면 복원"
                >
                  <UiIcon name="expand" size={17} />
                </button>
              ) : (
                <button
                  ref={minimizeButtonRef}
                  type="button"
                  className={styles.headerActionBtn}
                  onClick={() => setIsMini(true)}
                  data-tooltip="축소 모드"
                  aria-label="CoffeeTide 집중 축소 모드"
                >
                  <UiIcon name="expand" size={17} />
                </button>
              )}
              <button
                type="button"
                className={styles.headerActionBtn}
                onClick={handleOpenExternalPopup}
                data-tooltip="별도 창 팝업"
                aria-label="별도 창 팝업"
              >
                <UiIcon name="popup" size={17} />
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                className={styles.closeBtn}
                onClick={handleExplicitClose}
                aria-label="플레이어 닫기"
                data-tooltip="플레이어 닫기"
              >
                <UiIcon name="close" size={17} />
              </button>
            </div>
          </div>

          {showResumeNotice && initialSeekTime >= 3 && (
            <div className={styles.resumeNotice}>
              <div className={styles.resumeNoticeText}>
                <UiIcon name="timer" size={16} />
                <span>{formatSecondsToMinute(initialSeekTime)} 시점에서 복원됨</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  className={styles.resumeBtn}
                  onClick={() => {
                    seekTo(initialSeekTime);
                    iframeRef.current?.contentWindow?.postMessage(
                      JSON.stringify({ event: "command", func: "playVideo", args: [] }),
                      YOUTUBE_EMBED_ORIGIN
                    );
                    setShowResumeNotice(false);
                  }}
                >
                  이어서 재생
                </button>
                <button
                  type="button"
                  className={styles.resumeDismissBtn}
                  onClick={() => setShowResumeNotice(false)}
                  aria-label="안내 닫기"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          <div className={isMini ? styles.miniBody : styles.modalBody}>
            <div className={isMini ? styles.miniVideoSection : styles.videoSection}>
              <div className={isMini ? styles.miniIframeWrapper : styles.iframeWrapper}>
                <iframe
                  ref={iframeRef}
                  src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?enablejsapi=1&autoplay=${shouldAutoplay ? 1 : 0}&rel=0${
                    initialSeekTime && initialSeekTime > 0 ? `&start=${Math.floor(initialSeekTime)}` : ""
                  }`}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>

              {!isMini && chapters.length > 0 && (
                <div className={styles.chapterSection}>
                  <div className={styles.sectionHeading}>
                    <UiIcon name="chapters" size={16} />
                    <span>주요 챕터 바로가기</span>
                  </div>
                  <div className={styles.chapterGrid}>
                    {chapters.map((ch, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={styles.chapterChip}
                        onClick={() => seekTo(ch.seconds)}
                      >
                        <span className={styles.timeTag}>{ch.time}</span>
                        <span>{ch.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!isMini && (
              <div className={styles.aiSection}>
                <div className={styles.summaryBox}>
                  <div className={styles.sectionHeading}>
                    <UiIcon name="assistant" size={16} />
                    <span>AI 핵심 3줄 브리핑</span>
                  </div>
                  {loadingDetails ? (
                    <div style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>
                      영상 자막과 목차를 읽고 요약 중입니다...
                    </div>
                  ) : (
                    <>
                      <div className={styles.summaryHeadline}>{summary || "요약 정보가 없습니다."}</div>
                      {points.length > 0 && (
                        <ul className={styles.pointList}>
                          {points.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {detailsError && <div className={styles.detailError}>{detailsError}</div>}
                </div>

                <div className={styles.chatContainer}>
                  <div className={styles.chatMessages}>
                    {chatMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={msg.role === "user" ? styles.msgUser : styles.msgModel}
                      >
                        {msg.content}
                        {msg.timestamps && msg.timestamps.length > 0 && (
                          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                            {msg.timestamps.map((ts, tIdx) => (
                              <button
                                key={tIdx}
                                type="button"
                                className={styles.chapterChip}
                                onClick={() => seekTo(ts.seconds)}
                                style={{ padding: "3px 6px", fontSize: "0.72rem" }}
                              >
                                <span className={styles.timeTag}>{ts.time}</span>
                                <span>{ts.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {chatBusy && (
                      <div className={styles.msgModel} style={{ color: "var(--text-dim)" }}>
                        답변을 생각하는 중입니다...
                      </div>
                    )}
                  </div>

                  <form className={styles.chatInputForm} onSubmit={handleSendChat}>
                    <input
                      type="text"
                      className={styles.chatInput}
                      placeholder="영상 내용에 관해 질문하세요..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatBusy}
                      aria-label="영상 질문"
                    />
                    <button
                      type="submit"
                      className={styles.chatSendBtn}
                      disabled={chatBusy || !chatInput.trim()}
                      aria-label="전송"
                    >
                      ↑
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
