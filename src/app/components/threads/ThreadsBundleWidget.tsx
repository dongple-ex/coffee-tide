"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import { ThreadsApiResponse, ThreadsChannel } from "@/lib/types/threads";
import styles from "./ThreadsBundleWidget.module.css";

const STORAGE_KEY = "ct_threads_channels";
const DEFAULT_CHANNELS = ["zuck", "openai"];

export function ThreadsBundleWidget() {
  const [channels, setChannels] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_CHANNELS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }
    return DEFAULT_CHANNELS;
  });

  const [activeUsername, setActiveUsername] = useState<string>(() => channels[0] || "zuck");
  const [feedData, setFeedData] = useState<Record<string, ThreadsChannel>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newChannelInput, setNewChannelInput] = useState<string>("");
  const [, startTransition] = useTransition();

  // 채널 목록이 변경되면 localStorage에 영구 보관
  const saveChannels = (updated: string[]) => {
    setChannels(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  // 피드 데이터 페치
  const fetchFeeds = useCallback(async (targets: string[]) => {
    if (targets.length === 0) {
      setFeedData({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/threads/bundle?usernames=${encodeURIComponent(targets.join(","))}`);
      if (!res.ok) throw new Error(`서버 응답 오류 (${res.status})`);
      const data: ThreadsApiResponse = await res.json();

      if (data.success && data.channels) {
        const map: Record<string, ThreadsChannel> = {};
        for (const ch of data.channels) {
          map[ch.username.toLowerCase()] = ch;
        }
        setFeedData(map);
      } else {
        setError(data.error || "피드를 불러오지 못했습니다.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchFeeds(channels);
    });
  }, [channels, fetchFeeds]);

  // 새 채널 추가 처리
  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const input = newChannelInput.trim().replace(/^@/, "");
    if (!input) return;

    const normalized = input.toLowerCase();
    if (!channels.includes(normalized)) {
      const updated = [...channels, normalized];
      saveChannels(updated);
      setActiveUsername(normalized);
    }
    setNewChannelInput("");
    setIsAdding(false);
  };

  // 채널 삭제
  const handleDeleteChannel = (e: React.MouseEvent, target: string) => {
    e.stopPropagation();
    const updated = channels.filter((c) => c !== target);
    saveChannels(updated);
    if (activeUsername === target && updated.length > 0) {
      setActiveUsername(updated[0]);
    }
  };

  const activeChannelData = feedData[activeUsername.toLowerCase()];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h3 className={styles.title}>
            <span>🧵</span> Threads 피드
          </h3>
          <span className={styles.titleBadge}>실시간 자동 수집</span>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => fetchFeeds(channels)}
            disabled={isLoading}
            title="피드 새로고침"
          >
            {isLoading ? "⏳ 갱신 중..." : "🔄 새로고침"}
          </button>
        </div>
      </div>

      {/* 계정 탭 목록 */}
      <div className={styles.channelTabs}>
        {channels.map((ch) => {
          const isActive = ch.toLowerCase() === activeUsername.toLowerCase();
          const channelInfo = feedData[ch.toLowerCase()];
          const label = channelInfo?.displayName || `@${ch}`;

          return (
            <button
              key={ch}
              type="button"
              className={`${styles.channelTab} ${isActive ? styles.channelTabActive : ""}`}
              onClick={() => startTransition(() => setActiveUsername(ch))}
            >
              <span>{label}</span>
              {channels.length > 1 && (
                <span
                  className={styles.deleteChannelBtn}
                  onClick={(e) => handleDeleteChannel(e, ch)}
                  title="이 채널 제거"
                >
                  ✕
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          className={styles.addChannelBtn}
          onClick={() => setIsAdding(!isAdding)}
          title="새 Threads 계정 추가"
        >
          {isAdding ? "취소" : "+ 계정 추가"}
        </button>
      </div>

      {/* 새 계정 추가 인라인 입력창 */}
      {isAdding && (
        <form onSubmit={handleAddChannel} className={styles.addForm}>
          <span style={{ color: "var(--accent)", fontWeight: 700 }}>@</span>
          <input
            type="text"
            className={styles.addInput}
            value={newChannelInput}
            onChange={(e) => setNewChannelInput(e.target.value)}
            placeholder="계정 아이디 (예: zuck 또는 openai)"
            autoFocus
          />
          <button type="submit" className={styles.addSubmitBtn}>
            추가
          </button>
        </form>
      )}

      {/* 현재 선택된 채널 프로필 요약 카드 */}
      {activeChannelData && (
        <div className={styles.profileBanner}>
          <div className={styles.profileInfo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeChannelData.avatarUrl || "/icon.svg"}
              alt={activeChannelData.displayName}
              className={styles.avatar}
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/icon.svg";
              }}
            />
            <div className={styles.profileText}>
              <span className={styles.displayName}>{activeChannelData.displayName}</span>
              <span className={styles.usernameHandle}>@{activeChannelData.username}</span>
              {activeChannelData.bio && <span className={styles.bioText}>{activeChannelData.bio}</span>}
            </div>
          </div>
          <a
            href={activeChannelData.profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.profileLink}
            title="Threads 웹에서 열기"
          >
            프로필 방문 ↗
          </a>
        </div>
      )}

      {/* 게시물 목록 */}
      {isLoading && !activeChannelData ? (
        <div className={styles.emptyState}>⏳ 최신 Threads 글을 읽어오는 중입니다...</div>
      ) : error ? (
        <div className={styles.errorState}>⚠️ {error}</div>
      ) : !activeChannelData || activeChannelData.posts.length === 0 ? (
        <div className={styles.emptyState}>
          {activeChannelData?.error ? (
            <span>⚠️ {activeChannelData.error}</span>
          ) : (
            <span>등록된 최신 게시물이 없거나 피드를 불러오는 중입니다.</span>
          )}
        </div>
      ) : (
        <div className={styles.postList}>
          {activeChannelData.posts.map((post) => (
            <article key={post.id} className={styles.postCard}>
              <div className={styles.postText}>{post.text}</div>

              {post.images.length > 0 && (
                <div className={styles.imageGrid}>
                  {post.images.map((img, idx) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={idx}
                      src={img}
                      alt="첨부 미디어"
                      className={styles.postImage}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ))}
                </div>
              )}

              <div className={styles.postFooter}>
                <div className={styles.metrics}>
                  {post.likeCount && (
                    <span className={styles.metricItem} title="좋아요 수">
                      ❤️ {post.likeCount}
                    </span>
                  )}
                  {post.replyCount && (
                    <span className={styles.metricItem} title="댓글 수">
                      💬 {post.replyCount}
                    </span>
                  )}
                  {post.repostCount && (
                    <span className={styles.metricItem} title="리포스트 수">
                      🔄 {post.repostCount}
                    </span>
                  )}
                </div>
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.permalinkBtn}
                  title="Threads에서 게시물 보기"
                >
                  원문 보기 ↗
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
