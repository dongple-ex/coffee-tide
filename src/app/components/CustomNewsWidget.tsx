"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CustomNewsItem, CustomNewsResponse, SiteBriefing } from "@/lib/news/types";
import { UiIcon } from "./UiIcon";
import styles from "./customNewsWidget.module.css";

interface ChatMessage {
  role: "user" | "model";
  content: string;
  timestamps?: { time: string; seconds: number; label: string }[];
}

const getYoutubeVideoId = (url: string) => {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
};

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
  onUpdateName?: (id: string, newName: string) => void;
}

interface LoadError {
  reason: string;
  hint?: string;
}

export function CustomNewsWidget({ widget, onNotify, onDelete, onUpdateName }: CustomNewsWidgetProps) {
  const [articles, setArticles] = useState<CustomNewsItem[]>([]);
  const [briefing, setBriefing] = useState<SiteBriefing | null>(null);
  const [aiUsed, setAiUsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [chatInputs, setChatInputs] = useState<Record<string, string>>({});
  const [isChatOpen, setIsChatOpen] = useState<Record<string, boolean>>({});
  
  const [analyzingIds, setAnalyzingIds] = useState<string[]>([]);
  /** AI 답변이 도착했지만 아직 사용자가 확인하지 않은 카드 id */
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);

  // 답변 도착 시점에 "지금 보고 있는 카드인지" 판단하려면 최신 값이 필요하다.
  const selectedIdRef = useRef<string | null>(null);
  const chatOpenRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    chatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  /** 사용자가 해당 카드의 답변을 확인한 것으로 처리 */
  const clearAnswered = (id: string) =>
    setAnsweredIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev));

  // ── 채팅 영역 높이: 화면 하단까지만 ──────────────────
  const chatBodyRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [chatMaxH, setChatMaxH] = useState<Record<string, number>>({});

  const measureChatBodies = useCallback(() => {
    setChatMaxH((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [id, el] of Object.entries(chatBodyRefs.current)) {
        if (!el || !el.isConnected) continue;
        const { top } = el.getBoundingClientRect();
        const h = Math.max(140, Math.round(window.innerHeight - top - 80));
        if (next[id] !== h) {
          next[id] = h;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  useEffect(() => {
    measureChatBodies();
    let raf = 0;
    const onViewportChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureChatBodies);
    };
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [measureChatBodies, isChatOpen, selectedId, chatHistories]);

  // 새 메시지가 붙으면 해당 채팅창을 맨 아래로 (답변이 스크롤 밖에 숨지 않도록)
  const lastMsgCountRef = useRef<Record<string, number>>({});
  useEffect(() => {
    for (const [id, msgs] of Object.entries(chatHistories)) {
      if (lastMsgCountRef.current[id] === msgs.length) continue;
      lastMsgCountRef.current[id] = msgs.length;
      const el = chatBodyRefs.current[id];
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [chatHistories, analyzingIds]);

  // 인라인 제목 편집 state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingName, setEditingName] = useState(widget.name);

  const handleSaveTitle = () => {
    const trimmed = editingName.trim();
    if (trimmed && trimmed !== widget.name && onUpdateName) {
      onUpdateName(widget.id, trimmed);
      onNotify?.(`위젯 이름이 [${trimmed}] (으)로 변경되었습니다.`);
    }
    setIsEditingTitle(false);
  };

  const handleToggleChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsChatOpen((prev) => ({ ...prev, [id]: !prev[id] }));
    clearAnswered(id);

    if (!chatHistories[id]) {
      setChatHistories((prev) => ({
        ...prev,
        [id]: [{ role: "model", content: "이 영상에 관해 무엇이든 물어보세요." }]
      }));
    }
  };

  const handleSendYoutubeChat = async (id: string, url: string, e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const input = chatInputs[id]?.trim();
    if (!input || analyzingIds.includes(id)) return;

    const newMessages: ChatMessage[] = [
      ...(chatHistories[id] || []),
      { role: "user", content: input }
    ];

    setChatHistories((prev) => ({ ...prev, [id]: newMessages }));
    setChatInputs((prev) => ({ ...prev, [id]: "" }));
    setAnalyzingIds((prev) => [...prev, id]);
    clearAnswered(id);

    try {
      const res = await fetch("/api/ai/youtube-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, messages: newMessages }),
      });
      const data = await res.json();
      if (data.reply) {
        setChatHistories((prev) => ({
          ...prev,
          [id]: [...newMessages, { role: "model", content: data.reply, timestamps: data.timestamps || [] }]
        }));
      } else {
        throw new Error(data.error || "응답 실패");
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : "앗, 분석 중 오류가 발생했습니다.";
      setChatHistories((prev) => ({
        ...prev,
        [id]: [...newMessages, { role: "model", content: message }]
      }));
    } finally {
      setAnalyzingIds((prev) => prev.filter((x) => x !== id));
      const watching = selectedIdRef.current === id && Boolean(chatOpenRef.current[id]);
      if (!watching) {
        setAnsweredIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      }
    }
  };

  const fetchCustomArticles = useCallback(
    async (refresh = false) => {
      if (refresh) setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/news/custom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: widget.url, siteName: widget.name, refresh }),
        });
        const data = (await res.json()) as CustomNewsResponse;

        if (!data.success || data.articles.length === 0) {
          setArticles([]);
          setBriefing(null);
          setError({
            reason: data.reason ?? "최신 글을 가져오지 못했습니다.",
            hint: data.hint,
          });
          return;
        }

        setArticles(data.articles);
        setBriefing(data.briefing ?? null);
        setAiUsed(Boolean(data.aiUsed));
        setSelectedId(data.articles.length > 0 ? data.articles[0].id : null);
      } catch {
        setArticles([]);
        setBriefing(null);
        setError({
          reason: "네트워크 오류로 최신 소식을 읽어오지 못했습니다.",
          hint: "인터넷 연결을 확인하고 다시 시도해 주세요.",
        });
      } finally {
        setLoading(false);
      }
    },
    [widget.url, widget.name]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: widget.url, siteName: widget.name, refresh: false }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<CustomNewsResponse>) : null))
      .then((data) => {
        if (cancelled) return;
        if (!data || !data.success || data.articles.length === 0) {
          setArticles([]);
          setBriefing(null);
          setError({
            reason: data?.reason ?? "최신 글을 가져오지 못했습니다.",
            hint: data?.hint,
          });
        } else {
          setArticles(data.articles);
          setBriefing(data.briefing ?? null);
          setAiUsed(Boolean(data.aiUsed));
          setSelectedId(data.articles.length > 0 ? data.articles[0].id : null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setArticles([]);
          setBriefing(null);
          setError({
            reason: "네트워크 오류로 최신 소식을 읽어오지 못했습니다.",
            hint: "인터넷 연결을 확인하고 다시 시도해 주세요.",
          });
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [widget.url, widget.name]);

  const selectArticle = (id: string) => {
    setSelectedId((prev) => (prev === id ? prev : id));
    clearAnswered(id);
  };

  const toggleArticle = (id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
    clearAnswered(id);
  };

  // 현재 펼쳐진 활성 기사 (기본: 첫 번째 기사)
  const activeArticle = articles.find((a) => a.id === selectedId) || (selectedId ? null : articles[0]) || null;
  const otherArticles = articles.filter((a) => a.id !== activeArticle?.id);

  const renderArticleCard = (item: CustomNewsItem, isExpanded: boolean) => {
    const isAnswered = answeredIds.includes(item.id);
    const isAnalyzing = analyzingIds.includes(item.id);

    return (
      <div
        key={item.id}
        className={`${styles.articleItem} ${isExpanded ? styles.articleItemActive : ""} ${
          isAnswered ? styles.articleItemAnswered : ""
        }`}
        onClick={() => (isExpanded ? toggleArticle(item.id) : selectArticle(item.id))}
      >
        <div className={styles.articleHeader}>
          <span className={styles.catTag}>{widget.name}</span>
          <span className={styles.articleDate}>
            {isAnalyzing && <span className={styles.analyzingBadge}>AI 분석 중…</span>}
            {isAnswered && <span className={styles.answerBadge}>✦ AI 답변 도착</span>}
            {item.depth === "title" && <span className={styles.thinBadge}>제목만</span>}
            {item.date}
          </span>
        </div>
        <div className={styles.articleTitle}>{item.title}</div>

        {isExpanded && (
          <>
            {(() => {
              const ytId = item.url.match(/youtube\.com|youtu\.be/i) ? getYoutubeVideoId(item.url) : null;

              if (ytId) {
                return (
                  <div className={styles.articleSummary} style={{ padding: 0, overflow: "hidden", border: "none" }}>
                    <iframe
                      id={`yt-player-${item.id}`}
                      width="100%"
                      height="240"
                      src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`}
                      title="YouTube video player"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    ></iframe>
                  </div>
                );
              }

              return (
                <>
                  {item.summary ? (
                    <div className={styles.articleSummary}>{item.summary}</div>
                  ) : (
                    <div className={styles.articleSummary}>
                      이 글은 본문을 공개하지 않아 요약을 만들지 못했습니다. 원문에서 확인해 주세요.
                    </div>
                  )}

                  {Array.isArray(item.points) && item.points.length > 0 && (
                    <ul className={styles.pointList}>
                      {item.points.map((p, i) => (
                        <li key={`${item.id}-p${i}`}>{p}</li>
                      ))}
                    </ul>
                  )}

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.readLink}
                    onClick={(e) => e.stopPropagation()}
                  >
                    원문 전체 읽기 ↗
                  </a>
                </>
              );
            })()}

            {item.url.match(/youtube\.com|youtu\.be/i) && (
              <div style={{ marginTop: 12 }}>
                {isChatOpen[item.id] ? (
                  <div
                    style={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                        AI 질문하기{" "}
                        <span
                          style={{
                            fontSize: "0.65rem",
                            padding: "2px 6px",
                            border: "1px solid var(--accent)",
                            borderRadius: 10,
                            color: "var(--accent)",
                            marginLeft: 6,
                          }}
                        >
                          실험실
                        </span>
                      </div>
                      <button
                        onClick={(e) => handleToggleChat(item.id, e)}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          fontSize: "1.1rem",
                          color: "var(--text-dim)",
                        }}
                      >
                        ✕
                      </button>
                    </div>
                    <div
                      ref={(el) => {
                        chatBodyRefs.current[item.id] = el;
                      }}
                      style={{
                        padding: "14px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                        maxHeight: chatMaxH[item.id] ?? 300,
                        overflowY: "auto",
                        overscrollBehavior: "contain",
                      }}
                    >
                      {(chatHistories[item.id] || []).map((msg, idx) => (
                        <div
                          key={idx}
                          style={{
                            alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                            maxWidth: "85%",
                            background: msg.role === "user" ? "var(--accent-dim)" : "var(--card-hover)",
                            color: "var(--text)",
                            border: "1px solid var(--border)",
                            padding: "10px 14px",
                            borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                            fontSize: "0.85rem",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {msg.role === "model" && (
                            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)", marginBottom: 6 }}>
                              ✦ AI 답변
                            </div>
                          )}
                          {msg.content}
                          {msg.role === "model" && msg.timestamps && msg.timestamps.length > 0 && (
                            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                              {msg.timestamps.map((ts, tsIdx) => (
                                <button
                                  key={tsIdx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const iframe = document.getElementById(`yt-player-${item.id}`) as HTMLIFrameElement;
                                    if (iframe && iframe.contentWindow) {
                                      iframe.contentWindow.postMessage(
                                        JSON.stringify({
                                          event: "command",
                                          func: "seekTo",
                                          args: [ts.seconds, true],
                                        }),
                                        "*"
                                      );
                                      iframe.contentWindow.postMessage(
                                        JSON.stringify({
                                          event: "command",
                                          func: "playVideo",
                                          args: [],
                                        }),
                                        "*"
                                      );
                                    }
                                  }}
                                  style={{
                                    background: "var(--card)",
                                    border: "1px solid var(--border)",
                                    color: "var(--accent)",
                                    borderRadius: 6,
                                    padding: "4px 8px",
                                    cursor: "pointer",
                                    fontSize: "0.75rem",
                                    textAlign: "left",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <span style={{ fontWeight: "bold" }}>{ts.time}</span>
                                  <span style={{ color: "var(--text-dim)" }}>{ts.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      {analyzingIds.includes(item.id) && (
                        <div
                          style={{
                            alignSelf: "flex-start",
                            maxWidth: "85%",
                            background: "var(--card-hover)",
                            color: "var(--text-dim)",
                            padding: "10px 14px",
                            borderRadius: "16px 16px 16px 4px",
                            fontSize: "0.85rem",
                          }}
                        >
                          답변을 생각 중입니다...
                        </div>
                      )}
                    </div>
                    <form
                      onSubmit={(e) => handleSendYoutubeChat(item.id, item.url, e)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: "flex",
                        padding: "10px 12px",
                        borderTop: "1px solid var(--border)",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="text"
                        placeholder="이 동영상에 관해 질문하기..."
                        value={chatInputs[item.id] || ""}
                        onChange={(e) => setChatInputs((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        disabled={analyzingIds.includes(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          background: "var(--card-hover)",
                          border: "1px solid var(--border)",
                          borderRadius: 20,
                          padding: "9px 16px",
                          color: "var(--text)",
                          outline: "none",
                          fontSize: "0.85rem",
                        }}
                      />
                      <button
                        type="submit"
                        disabled={analyzingIds.includes(item.id) || !chatInputs[item.id]?.trim()}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: "50%",
                          background: "var(--accent)",
                          color: "var(--accent-contrast)",
                          border: "none",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: "bold",
                          opacity: analyzingIds.includes(item.id) || !chatInputs[item.id]?.trim() ? 0.3 : 1,
                        }}
                      >
                        ↑
                      </button>
                    </form>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.btn}
                    style={{ width: "100%", justifyContent: "center", border: "1px dashed var(--accent)" }}
                    onClick={(e) => handleToggleChat(item.id, e)}
                  >
                    <span style={{ color: "var(--accent)", marginRight: 6 }}>✦</span> 질문하기
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <UiIcon name="inbox" size={18} />
          {isEditingTitle ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
                className={styles.titleEditInput}
                autoFocus
              />
              <button type="button" className={styles.editBtn} onClick={handleSaveTitle} title="저장">
                ✓
              </button>
              <button type="button" className={styles.editBtn} onClick={() => setIsEditingTitle(false)} title="취소">
                ✕
              </button>
            </div>
          ) : (
            <span
              className={styles.clickableTitle}
              onClick={() => {
                setEditingName(widget.name);
                setIsEditingTitle(true);
              }}
              title="클릭하여 위젯 이름 수정"
            >
              {widget.name} <span className={styles.editIcon}>수정</span>
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              className={`${styles.iconOnlyBtn} ${styles.btnDanger}`}
              onClick={() => onDelete(widget.id)}
              title="이 위젯 삭제"
              style={{ width: "auto", height: 24, padding: "0 7px", fontSize: "0.68rem", marginLeft: 2 }}
            >
              삭제
            </button>
          )}
          {articles.length > 0 && (
            <span className={styles.titleBadge}>{aiUsed ? "AI 요약" : "핵심 요약"}</span>
          )}
        </div>
        <div className={styles.actionBtns}>
          {articles.length > 0 && (
            <button
              type="button"
              className={styles.iconOnlyBtn}
              onClick={() => setSelectedId(selectedId ? null : (articles[0]?.id || null))}
              title={selectedId ? "요약 접기" : "첫 글 펼치기"}
            >
              {selectedId ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              )}
            </button>
          )}
          <button
            type="button"
            className={styles.iconOnlyBtn}
            onClick={() => {
              void fetchCustomArticles(true).then(() => {
                onNotify?.(`${widget.name} 최신 소식을 다시 읽어왔습니다.`);
              });
            }}
            disabled={loading}
            title="새로고침"
          >
            {loading ? (
              "…"
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
              </svg>
            )}
          </button>
        </div>
      </div>

      {loading && articles.length === 0 && (
        <div className={styles.loadingHint}>
          {widget.name}의 최신 글을 읽고 핵심만 추리는 중입니다...
        </div>
      )}

      {!loading && error && (
        <div className={styles.errorBox}>
          <div className={styles.errorTitle}>{error.reason}</div>
          {error.hint && <div className={styles.errorHint}>{error.hint}</div>}
          <div className={styles.errorActions}>
            <button type="button" className={styles.btn} onClick={() => void fetchCustomArticles(true)}>
              ↻ 다시 시도
            </button>
            <a href={widget.url} target="_blank" rel="noreferrer" className={styles.readLink}>
              사이트 직접 열기 ↗
            </a>
          </div>
        </div>
      )}

      {briefing && !error && (
        <div className={styles.briefingBox}>
          <div className={styles.briefingLabel}>지금 핵심 브리핑</div>
          <div className={styles.briefingHeadline}>{briefing.headline}</div>
          {briefing.keyPoints.length > 0 && (
            <ul className={styles.briefingList}>
              {briefing.keyPoints.map((point, i) => (
                <li key={`${i}-${point.slice(0, 12)}`}>{point}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {articles.length > 0 && (
        <div className={styles.splitLayout}>
          {activeArticle && (
            <div className={styles.leftColumn}>
              {renderArticleCard(activeArticle, true)}
            </div>
          )}
          <div className={styles.rightColumn}>
            {(activeArticle ? otherArticles : articles).map((item) =>
              renderArticleCard(item, false)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
