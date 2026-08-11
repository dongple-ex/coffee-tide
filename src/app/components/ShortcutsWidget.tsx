"use client";

import React, { useId, useState } from "react";
import { AppShortcut } from "@/lib/types/appShortcut";
import {
  GoogleIcon,
  KakaoTalkIcon,
  NaverMapIcon,
  NotionIcon,
  ObsidianIcon,
  OutlookIcon,
} from "./brandIcons";
import styles from "./shortcutsWidget.module.css";

interface ShortcutsWidgetProps {
  shortcuts: AppShortcut[];
  /** 실행 실패 안내 — 앱 전역 토스트로 연결한다 */
  onError?: (message: string) => void;
  /** 유튜브 번들 위젯으로 전환 */
  onOpenYouTubeBundle?: () => void;
}

function YouTubeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="YouTube">
      <rect x="1" y="4" width="22" height="16" rx="5" fill="#FF0033" />
      <path d="m10 8.5 6 3.5-6 3.5z" fill="#FFFFFF" />
    </svg>
  );
}

function isYouTubeShortcut(shortcut: AppShortcut): boolean {
  const keyword = shortcut.keyword.toLowerCase();
  if (keyword.includes("유튜브") || keyword.includes("youtube")) return true;

  try {
    const candidate = shortcut.target.includes("://")
      ? shortcut.target
      : `https://${shortcut.target}`;
    const hostname = new URL(candidate).hostname.toLowerCase();
    return (
      hostname === "youtu.be" ||
      hostname.endsWith(".youtu.be") ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtube-nocookie.com" ||
      hostname.endsWith(".youtube-nocookie.com")
    );
  } catch {
    return false;
  }
}

function renderShortcutIcon(keyword: string, target: string) {
  const text = (keyword + " " + target).toLowerCase();

  if (text.includes("구글") || text.includes("google") || text.includes("antigravity") || text.includes("안티")) {
    return <GoogleIcon size={20} />;
  }
  if (text.includes("카카오") || text.includes("kakao")) {
    return <KakaoTalkIcon size={20} />;
  }
  if (text.includes("노션") || text.includes("notion")) {
    return <NotionIcon size={20} />;
  }
  if (text.includes("옵시디언") || text.includes("obsidian")) {
    return <ObsidianIcon size={20} />;
  }
  if (text.includes("아웃룩") || text.includes("outlook") || text.includes("mail")) {
    return <OutlookIcon size={20} />;
  }
  if (text.includes("네이버") || text.includes("naver")) {
    return <NaverMapIcon size={20} />;
  }

  return <span style={{ fontSize: "1.1rem" }}>🔗</span>;
}

export function ShortcutsWidget({ shortcuts, onError, onOpenYouTubeBundle }: ShortcutsWidgetProps) {
  const enabledShortcuts = shortcuts.filter((s) => s.enabled);
  const youtubeShortcuts = enabledShortcuts.filter(isYouTubeShortcut);
  const standaloneShortcuts = enabledShortcuts.filter((shortcut) => !isYouTubeShortcut(shortcut));
  const [youtubeExpanded, setYoutubeExpanded] = useState(false);
  const youtubeGroupId = useId();

  const handleLaunch = (target: string) => {
    if (!target) return;

    // 로컬 프로그램 경로(C:\... , /Applications/...)는 브라우저가 열 수 없다.
    // 예전 구현은 `https://C:\...`로 만들어 빈 탭만 띄웠으므로, AI 바리스타와 같은 실행 경로를 쓴다.
    const isLocalPath = /^[a-zA-Z]:[\\/]/.test(target) || target.startsWith("\\\\") || target.startsWith("/");
    if (isLocalPath) {
      void fetch("/api/util/exec-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      })
        .then(async (res) => {
          if (res.ok) return;
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          onError?.(json.error ?? "프로그램을 실행하지 못했습니다.");
        })
        .catch(() => onError?.("프로그램 실행 요청을 보내지 못했습니다."));
      return;
    }

    const targetUrl = target.includes("://") ? target : `https://${target}`;
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.title}>
          <span>⭐</span>
          <span>단어-앱 레시피 즐겨찾기</span>
          <span className={styles.countBadge}>{enabledShortcuts.length}개 활성</span>
        </div>
      </div>

      {enabledShortcuts.length === 0 ? (
        <div className={styles.emptyHint}>
          등록된 단어-앱 레시피가 없습니다. 설정 &gt; 단어-앱 바로가기 레시피에서 자주 쓰는 사이트 및 앱을
          추가해 보세요.
        </div>
      ) : (
        <div className={styles.shortcutGrid}>
          {youtubeShortcuts.length > 0 && (
            <div className={styles.shortcutGroup}>
              <button
                type="button"
                className={styles.shortcutGroupButton}
                onClick={() => setYoutubeExpanded((expanded) => !expanded)}
                aria-expanded={youtubeExpanded}
                aria-controls={youtubeGroupId}
              >
                <span className={styles.icon}><YouTubeIcon /></span>
                <span className={styles.groupName}>YouTube</span>
                <span className={styles.groupCount}>{youtubeShortcuts.length}개</span>
                <span
                  className={`${styles.groupChevron} ${youtubeExpanded ? styles.groupChevronOpen : ""}`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>

              {youtubeExpanded && (
                <div id={youtubeGroupId} className={styles.shortcutGroupChildren}>
                  {onOpenYouTubeBundle && (
                    <button
                      type="button"
                      className={styles.shortcutChild}
                      onClick={onOpenYouTubeBundle}
                      style={{ background: "var(--accent-dim, rgba(99, 102, 241, 0.15))", fontWeight: 600 }}
                      title="유튜브 스마트 번들 피드 열기"
                    >
                      <span className={styles.childBullet} aria-hidden="true">📺</span>
                      <span className={styles.childName}>유튜브 번들 피드 열기</span>
                      <span className={styles.childLaunch} aria-hidden="true">▶</span>
                    </button>
                  )}
                  {youtubeShortcuts.map((shortcut) => (
                    <button
                      key={shortcut.id}
                      type="button"
                      className={styles.shortcutChild}
                      onClick={() => handleLaunch(shortcut.target)}
                      title={`${shortcut.keyword} (${shortcut.target}) 바로가기 실행`}
                    >
                      <span className={styles.childBullet} aria-hidden="true">↳</span>
                      <span className={styles.childName}>@{shortcut.keyword}</span>
                      <span className={styles.childLaunch} aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {standaloneShortcuts.map((sc) => (
            <div
              key={sc.id}
              className={styles.shortcutCard}
              onClick={() => handleLaunch(sc.target)}
              title={`${sc.keyword} (${sc.target}) 바로가기 실행`}
            >
              <span className={styles.icon}>{renderShortcutIcon(sc.keyword, sc.target)}</span>
              <div className={styles.info}>
                <span className={styles.name}>@{sc.keyword}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
