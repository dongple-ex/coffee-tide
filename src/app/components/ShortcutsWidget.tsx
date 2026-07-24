"use client";

import React from "react";
import { AppShortcut } from "@/lib/types/appShortcut";
import styles from "./shortcutsWidget.module.css";

interface ShortcutsWidgetProps {
  shortcuts: AppShortcut[];
  onOpenSettings?: () => void;
}

export function ShortcutsWidget({ shortcuts, onOpenSettings }: ShortcutsWidgetProps) {
  const enabledShortcuts = shortcuts.filter((s) => s.enabled);

  const handleLaunch = (target: string) => {
    if (!target) return;
    const targetUrl = target.startsWith("http") ? target : `https://${target}`;
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
          등록된 단어-앱 레시피가 없습니다. 설정 ⚙️ 메뉴에서 자주 쓰는 사이트 바로가기를 추가해 보세요.
        </div>
      ) : (
        <div className={styles.shortcutGrid}>
          {enabledShortcuts.map((sc) => (
            <div
              key={sc.id}
              className={styles.shortcutCard}
              onClick={() => handleLaunch(sc.target)}
              title={`${sc.keyword} (${sc.target}) 바로가기 호출`}
            >
              <span className={styles.icon}>🔗</span>
              <div className={styles.info}>
                <span className={styles.name}>@{sc.keyword}</span>
                <span className={styles.keyword}>{sc.target}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
