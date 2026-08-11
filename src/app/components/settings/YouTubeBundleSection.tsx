"use client";

import React, { useState } from "react";
import { YouTubeBundle } from "@/lib/types/youtube";
import { DEFAULT_YOUTUBE_BUNDLES } from "@/lib/youtube/presets";
import {
  loadLS,
  saveLS,
  LS_YOUTUBE_BUNDLES,
  YOUTUBE_BUNDLES_CHANGED_EVENT,
} from "@/lib/localStore";
import { normalizeYouTubeChannelUrl } from "@/lib/youtube/url";
import styles from "../../page.module.css";

interface Props {
  onNotify: (message: string) => void;
}

export function YouTubeBundleSection({ onNotify }: Props) {
  const [bundles, setBundles] = useState<YouTubeBundle[]>(() => {
    const saved = loadLS<YouTubeBundle[]>(LS_YOUTUBE_BUNDLES, []);
    if (saved && saved.length > 0) return saved;
    return DEFAULT_YOUTUBE_BUNDLES;
  });

  // 새 번들 생성 상태
  const [newBundleName, setNewBundleName] = useState("");
  const [newBundleIcon, setNewBundleIcon] = useState("⚽");

  // 채널 추가 상태
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelRss, setNewChannelRss] = useState("");
  const [targetBundleId, setTargetBundleId] = useState<string>(bundles[0]?.id || "");

  const persistBundles = (next: YouTubeBundle[]) => {
    setBundles(next);
    if (!saveLS(LS_YOUTUBE_BUNDLES, next)) {
      onNotify("유튜브 번들 설정을 브라우저에 저장하지 못했습니다.");
      return;
    }
    window.dispatchEvent(new Event(YOUTUBE_BUNDLES_CHANGED_EVENT));
  };

  // 번들 ON/OFF 토글
  const toggleBundle = (id: string) => {
    const next = bundles.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b));
    persistBundles(next);
    onNotify("📺 유튜브 번들 활성 상태가 변경되었습니다.");
  };

  // 새 번들 추가 (스포츠, 게임, 뉴스 등 무제한 추가 가능)
  const handleCreateBundle = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newBundleName.trim();
    if (!name) return;

    const newBundle: YouTubeBundle = {
      id: `bundle-custom-${Date.now()}`,
      name: name,
      icon: newBundleIcon || "📺",
      category: "custom",
      isPreset: false,
      enabled: true,
      channels: [],
      updatedAt: new Date().toISOString(),
    };

    const next = [...bundles, newBundle];
    persistBundles(next);
    setTargetBundleId(newBundle.id);
    setNewBundleName("");
    onNotify(`✨ 새로운 [${newBundle.icon} ${name}] 번들이 생성되었습니다! 아래에서 채널을 추가해 보세요.`);
  };

  // 번들 삭제
  const handleDeleteBundle = (bundleId: string, bundleName: string) => {
    if (!confirm(`[${bundleName}] 번들을 삭제하시겠습니까?`)) return;
    const next = bundles.filter((b) => b.id !== bundleId);
    persistBundles(next);
    if (targetBundleId === bundleId && next.length > 0) {
      setTargetBundleId(next[0].id);
    }
    onNotify(`🗑️ [${bundleName}] 번들이 삭제되었습니다.`);
  };

  // 기본 프리셋으로 초기화 (스포츠 포함 5종)
  const handleResetPresets = () => {
    if (!confirm("기본 번들(경제, 테크, 스포츠, BGM, 자기계발)로 초기화하시겠습니까?")) return;
    persistBundles(DEFAULT_YOUTUBE_BUNDLES);
    setTargetBundleId(DEFAULT_YOUTUBE_BUNDLES[0].id);
    onNotify("🔄 유튜브 기본 5대 번들로 초기화되었습니다.");
  };

  // 채널 추가
  const handleAddChannel = () => {
    const chName = newChannelName.trim();
    const source = newChannelRss.trim();
    if (!chName || !source || !targetBundleId) return;
    const normalizedUrl = normalizeYouTubeChannelUrl(source);
    if (!normalizedUrl) {
      onNotify("YouTube 채널 ID(UC…), @핸들 또는 youtube.com 채널 주소를 입력해 주세요.");
      return;
    }
    const targetBundle = bundles.find((bundle) => bundle.id === targetBundleId);
    if (targetBundle && targetBundle.channels.length >= 8) {
      onNotify("번들당 채널은 최대 8개까지 등록할 수 있습니다.");
      return;
    }

    const next = bundles.map((b) => {
      if (b.id === targetBundleId) {
        return {
          ...b,
          channels: [
            ...b.channels,
            {
              id: `ch-${Date.now()}`,
              name: chName,
              rssUrl: normalizedUrl,
            },
          ],
        };
      }
      return b;
    });

    persistBundles(next);
    setNewChannelName("");
    setNewChannelRss("");
    onNotify(`📺 [${chName}] 채널이 번들에 추가되었습니다.`);
  };

  // 채널 삭제
  const handleDeleteChannel = (bundleId: string, channelIndex: number) => {
    const next = bundles.map((b) => {
      if (b.id === bundleId) {
        return {
          ...b,
          channels: b.channels.filter((_, idx) => idx !== channelIndex),
        };
      }
      return b;
    });
    persistBundles(next);
  };

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div className={styles.cardTitle} style={{ margin: 0 }}>
          📺 유튜브 스마트 번들 & 채널 관리 <small>{bundles.filter((b) => b.enabled).length}개 활성</small>
        </div>
        <button
          type="button"
          onClick={handleResetPresets}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-dim)",
            fontSize: "0.75rem",
            padding: "3px 8px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          기본 번들 복원
        </button>
      </div>

      <p className={styles.connNote}>
        원하는 주제별 채널 묶음(번들)을 개수 제한 없이 만들고 관리할 수 있습니다. 상단 <b>📺 유튜브 번들</b> 위젯에서 모아보고 AI 브리핑을 받으세요.
      </p>

      {/* 번들 목록 및 ON/OFF 토글 */}
      <div className={styles.list} style={{ marginTop: 8 }}>
        {bundles.map((bundle) => (
          <div
            key={bundle.id}
            className={styles.ruleRow}
            style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => toggleBundle(bundle.id)}
                  aria-label={bundle.enabled ? "번들 끄기" : "번들 켜기"}
                >
                  {bundle.enabled ? "●" : "○"}
                </button>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                  {bundle.icon} {bundle.name}
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  ({bundle.channels.length}개 채널)
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleDeleteBundle(bundle.id, bundle.name)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--danger, #ff5d73)",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  padding: "2px 6px",
                  borderRadius: 4,
                }}
                title="번들 삭제"
              >
                삭제
              </button>
            </div>

            {/* 포함된 채널 칩들 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 28 }}>
              {bundle.channels.length === 0 ? (
                <span style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                  아직 등록된 채널이 없습니다. 아래 폼에서 채널을 추가하세요.
                </span>
              ) : (
                bundle.channels.map((ch, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: "0.75rem",
                      background: "var(--card-hover)",
                      border: "1px solid var(--border)",
                      padding: "2px 8px",
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {ch.name}
                    <button
                      type="button"
                      onClick={() => handleDeleteChannel(bundle.id, idx)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-dim)",
                        cursor: "pointer",
                        fontSize: "0.7rem",
                      }}
                      title="채널 삭제"
                    >
                      ✕
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ➕ 새 번들(테마) 만들기 폼 */}
      <form onSubmit={handleCreateBundle} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 6 }}>✨ 새 테마 번들 만들기 (스포츠, 게임, 뉴스 등)</div>
        <div className={styles.formRow}>
          <select
            className={styles.input}
            value={newBundleIcon}
            onChange={(e) => setNewBundleIcon(e.target.value)}
            style={{ width: 70 }}
          >
            <option value="⚽">⚽ 축구/스포츠</option>
            <option value="⚾">⚾ 야구</option>
            <option value="🎮">🎮 게임</option>
            <option value="🍳">🍳 요리</option>
            <option value="✈️">✈️ 여행</option>
            <option value="🎬">🎬 영화/리뷰</option>
            <option value="🎧">🎧 음악</option>
            <option value="💡">💡 지식</option>
            <option value="📰">📰 뉴스</option>
            <option value="📺">📺 기타</option>
          </select>
          <input
            className={styles.input}
            placeholder="새 번들 이름 (예: 해외축구 하이라이트)"
            value={newBundleName}
            onChange={(e) => setNewBundleName(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="submit" className={styles.btn} disabled={!newBundleName.trim()}>
            번들 생성
          </button>
        </div>
      </form>

      {/* ➕ 채널 추가하기 폼 */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 6 }}>➕ 번들에 채널 추가하기</div>
        <div className={styles.formRow}>
          <select
            className={styles.input}
            value={targetBundleId}
            onChange={(e) => setTargetBundleId(e.target.value)}
            style={{ flex: 1.2 }}
          >
            {bundles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.icon} {b.name}
              </option>
            ))}
          </select>
          <input
            className={styles.input}
            placeholder="채널명 (예: SPOTV)"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            style={{ flex: 1.5 }}
          />
          <input
            className={styles.input}
            placeholder="채널 UC ID 또는 RSS URL"
            value={newChannelRss}
            onChange={(e) => setNewChannelRss(e.target.value)}
            style={{ flex: 2 }}
          />
          <button type="button" className={styles.btn} onClick={handleAddChannel} disabled={!newChannelName.trim() || !newChannelRss.trim()}>
            채널 추가
          </button>
        </div>
      </div>
    </section>
  );
}
