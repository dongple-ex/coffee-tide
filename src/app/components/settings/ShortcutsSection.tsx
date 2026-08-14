"use client";

import React, { useState } from "react";
import { AppShortcut } from "@/lib/types/appShortcut";
import styles from "../../page.module.css";

interface Props {
  shortcuts: AppShortcut[];
  /** 변경분을 상위에서 state 반영 + 영속화한다 */
  onChange: (next: AppShortcut[]) => void;
  onNotify: (message: string) => void;
}

export function ShortcutsSection({ shortcuts, onChange, onNotify }: Props) {
  // 입력 중인 값은 이 섹션 밖에서 쓰이지 않는다 — 지역 state로 둔다
  const [keywordInput, setKeywordInput] = useState("");
  const [targetInput, setTargetInput] = useState("");

  const addShortcut = () => {
    const keyword = keywordInput.trim();
    const target = targetInput.trim();
    if (!keyword || !target) return;
    onChange([...shortcuts, { id: `sc-${Date.now()}`, keyword, target, enabled: true }]);
    setKeywordInput("");
    setTargetInput("");
    onNotify(`'${keyword}' 바로가기 레시피가 등록되었습니다.`);
  };

  return (
    <section className={styles.card} style={{ border: "none", padding: "10px 0" }}>
      <div className={styles.cardTitle}>
        단어-앱 바로가기 레시피 <small>{shortcuts.length}개 등록됨</small>
      </div>
      <div className={styles.formRow}>
        <input
          className={styles.input}
          placeholder='호출 단어 (예: "구글안티")'
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
          style={{ flex: 1 }}
          aria-label="바로가기 호출 단어"
        />
        <input
          className={styles.input}
          placeholder='실행 경로/URL (예: "C:\\Apps\\App.exe" 또는 "kakaotalk://")'
          value={targetInput}
          onChange={(e) => setTargetInput(e.target.value)}
          style={{ flex: 2 }}
          aria-label="바로가기 실행 대상"
        />
        <button className={styles.btn} onClick={addShortcut}>
          추가
        </button>
      </div>
      <p className={styles.connNote} style={{ marginTop: 6 }}>
        AI 바리스타 입력창에 <b>키워드만</b>(또는 <code>@키워드</code>) 넣으면 실행됩니다. 로컬
        프로그램은 절대 경로(<code>.exe</code>·<code>.lnk</code>)여야 합니다.
      </p>
      <div className={styles.list} style={{ marginTop: 8 }}>
        {shortcuts.map((sc, i) => (
          <div key={sc.id} className={styles.ruleRow}>
            <button
              className={styles.iconBtn}
              onClick={() =>
                onChange(shortcuts.map((item, j) => (j === i ? { ...item, enabled: !item.enabled } : item)))
              }
              title={sc.enabled ? "켜짐" : "꺼짐"}
              aria-label={sc.enabled ? "바로가기 끄기" : "바로가기 켜기"}
            >
              {sc.enabled ? "●" : "○"}
            </button>
            <span className={styles.ruleText}>
              <b>&lsquo;{sc.keyword}&rsquo;</b> ➔{" "}
              <small style={{ color: "var(--accent)" }}>{sc.target}</small>
            </span>
            <button
              className={styles.iconBtn}
              onClick={() => onChange(shortcuts.filter((_, j) => j !== i))}
              aria-label="바로가기 삭제"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
