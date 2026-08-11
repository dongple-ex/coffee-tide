"use client";

import React, { useEffect, useRef, useState } from "react";
import { YouTubeVideo, YouTubeChapter } from "@/lib/types/youtube";
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
}

function extractYoutubeVideoId(video: YouTubeVideo | null): string {
  if (!video) return "";
  if (video.url) {
    const match = video.url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(video.id)) return video.id;
  return video.id;
}

export function SmartPlayerModal({ video, onClose, onNotify }: SmartPlayerModalProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ytVideoId = extractYoutubeVideoId(video);
  const needsDetails = Boolean(
    video && (!video.summary || !video.chapters || video.chapters.length === 0)
  );
  const [chapters, setChapters] = useState<YouTubeChapter[]>(video?.chapters || []);
  const [summary, setSummary] = useState<string>(video?.summary || "");
  const [points, setPoints] = useState<string[]>(video?.points || []);
  const [loadingDetails, setLoadingDetails] = useState(needsDetails);

  // 미니 플레이어 (PIP) 모드 여부
  const [isMini, setIsMini] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "model", content: "이 영상에 대해 궁금한 점을 질문해 보세요! ☕" },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);

  // 영상 로딩 및 자막/메타데이터 분석
  useEffect(() => {
    if (!video) return;

    // 모달 열릴 때 ESC 키로 닫기
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    // 상세 요약 및 챕터가 없는 경우 백엔드 API 요청
    if (needsDetails) {
      fetch("/api/youtube/transcript-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: ytVideoId || video.id, url: video.url }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.success) {
            if (data.summary) setSummary(data.summary);
            if (Array.isArray(data.points)) setPoints(data.points);
            if (Array.isArray(data.chapters) && data.chapters.length > 0) {
              setChapters(data.chapters);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingDetails(false));
    }

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [video, ytVideoId, needsDetails, onClose]);

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
    onNotify?.("⧉ 별도 팝업 창으로 영상을 분리하여 띄웠습니다 📺");
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

    try {
      const res = await fetch("/api/ai/youtube-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: video.url, messages: newMsgs }),
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
    } catch {
      setChatMessages([
        ...newMsgs,
        { role: "model", content: "앗, 영상 질문을 처리하는 중 오류가 발생했습니다." },
      ]);
    } finally {
      setChatBusy(false);
    }
  };

  // 1. 플로팅 미니 플레이어 (PIP) 모드 렌더링
  if (isMini) {
    return (
      <div className={styles.miniContainer} role="region" aria-label="미니 유튜브 플레이어">
        <div className={styles.miniHeader}>
          <div className={styles.miniTitle} title={video.title}>
            <span>📺</span> {video.title}
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={() => setIsMini(false)}
              title="원래 모달 크기로 확대"
            >
              ⤢ 확대
            </button>
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={handleOpenExternalPopup}
              title="브라우저 별도 팝업 창으로 분리"
            >
              ⧉ 팝업
            </button>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              title="플레이어 닫기"
              style={{ fontSize: "0.9rem", padding: "2px 6px" }}
            >
              ✕
            </button>
          </div>
        </div>

        <div className={styles.iframeWrapper}>
          <iframe
            ref={iframeRef}
            src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?enablejsapi=1&autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  // 2. 기본 포커스 모달 모드 렌더링
  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <span>📺</span>
            <span>{video.title}</span>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={() => setIsMini(true)}
              title="대시보드 우측 하단 플로팅 미니 플레이어로 전환"
            >
              🗗 미니 모드
            </button>
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={handleOpenExternalPopup}
              title="브라우저 별도 팝업 창으로 분리 띄우기"
            >
              ⧉ 별도 창 팝업
            </button>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="닫기"
              title="닫기"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={styles.modalBody}>
          {/* 좌측: 비디오 플레이어 & 챕터 */}
          <div className={styles.videoSection}>
            <div className={styles.iframeWrapper}>
              <iframe
                ref={iframeRef}
                src={`https://www.youtube-nocookie.com/embed/${ytVideoId}?enablejsapi=1&autoplay=1&rel=0`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>

            {chapters.length > 0 && (
              <div className={styles.chapterSection}>
                <div className={styles.sectionHeading}>
                  <span>🔖</span>
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

          {/* 우측: AI 3줄 요약 & 실시간 Q&A */}
          <div className={styles.aiSection}>
            <div className={styles.summaryBox}>
              <div className={styles.sectionHeading}>
                <span>✨</span>
                <span>AI 핵심 3줄 브리핑</span>
              </div>
              {loadingDetails ? (
                <div style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>
                  영상 자막과 목차를 읽고 요약 중입니다... ☕
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
        </div>
      </div>
    </div>
  );
}
