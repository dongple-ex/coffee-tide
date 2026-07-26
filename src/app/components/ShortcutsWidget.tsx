"use client";

import React from "react";
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

export function ShortcutsWidget({ shortcuts, onError }: ShortcutsWidgetProps) {
  const enabledShortcuts = shortcuts.filter((s) => s.enabled);

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
          {enabledShortcuts.map((sc) => (
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
