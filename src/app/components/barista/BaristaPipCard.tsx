import React, { useEffect, useId, useRef, useState } from "react";
import type { PipChatTurn } from "./pipChat";
import styles from "./baristaPipCard.module.css";

interface Props {
  avatar: string;
  speech: string;
  turns: PipChatTurn[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  draft: string;
  onDraftChange: (draft: string) => void;
  mood: string;
  loading: boolean;
  bouncing: boolean;
  onAsk?: (question: string) => Promise<boolean>;
  onTalk: () => void;
  onOpen: () => void;
  onMood: (emoji: string) => void;
}

const moods = [
  { emoji: "☀️", label: "활기차게" },
  { emoji: "☕", label: "커피 한 잔" },
  { emoji: "🌸", label: "잠깐 쉬기" },
  { emoji: "🌙", label: "차분하게" },
];

export function BaristaPipCard({ avatar, speech, turns, collapsed, onToggleCollapsed, draft, onDraftChange, mood, loading, bouncing, onAsk, onTalk, onOpen, onMood }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [turns, loading, collapsed]);
  const submitting = useRef(false);
  const composing = useRef(false);
  const submitQuestion = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || loading || submitting.current || composing.current || !onAsk) return;
    submitting.current = true;
    try {
      if (await onAsk(question)) onDraftChange("");
    } finally {
      submitting.current = false;
    }
  };
  const renderAvatar = () => (
    <button className={styles.avatar} data-bouncing={bouncing} type="button" onClick={onOpen} aria-label="대화창 열기" title="대화창 열기">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={avatar} alt="" onError={(event) => {
        const image = event.currentTarget;
        if (!image.src.endsWith("/barista/barista_male_3d_serving.jpg")) image.src = "/barista/barista_male_3d_serving.jpg";
      }} />
    </button>
  );
  return (
    <section className={styles.card} data-collapsed={collapsed} aria-label="CoffeeTide 바리스타">
      <header className={styles.windowBar}>
        <button type="button" className={styles.collapseButton} onClick={onToggleCollapsed}
          aria-label={collapsed ? "미니카드 펼치기" : "미니카드 접기"}
          title={collapsed ? "펼치기" : "접기"} aria-expanded={!collapsed}>
          <span aria-hidden="true">{collapsed ? "▢" : "_"}</span>
        </button>
      </header>
      <div className={styles.chatBody} hidden={collapsed}>
      <div className={styles.log} ref={logRef} role="log" aria-label="미니카드 대화" aria-live="polite" tabIndex={0}>
        {turns.length === 0 && <div className={styles.assistant}>
          {renderAvatar()}
          <p className={styles.speech}>{speech}</p>
        </div>}
        {turns.map((turn) => <React.Fragment key={turn.id}>
          <div className={styles.user} aria-label="내 질문"><p className={styles.speech}>{turn.userText}</p></div>
          <div className={styles.assistant} aria-label={turn.error ? "전송 오류" : "AI 답변"}>
            {renderAvatar()}
            <p className={styles.speech} data-error={Boolean(turn.error)}>
              {turn.aiText || turn.error || "생각 중…"}
            </p>
          </div>
        </React.Fragment>)}
      </div>
      {menuOpen && <div className={styles.actions} id={menuId} role="group" aria-label="커피와 기분 선택">
        <button className={styles.bell} type="button" onClick={() => { setMenuOpen(false); onTalk(); }} disabled={loading || !onAsk}
          aria-label="커피 한 잔 부탁해" title="커피 한 잔 부탁해">☕</button>
        {moods.map(({ emoji, label }) => (
          <button key={emoji} type="button" className={styles.mood}
            onClick={() => { setMenuOpen(false); onMood(emoji); }}
            aria-label={label} title={label} aria-pressed={mood === emoji} disabled={loading || !onAsk}>{emoji}</button>
        ))}
      </div>}
      <form className={styles.composer} onSubmit={(event) => { void submitQuestion(event); }}>
        <button className={styles.menuToggle} type="button" aria-label="커피와 기분 선택" title="커피와 기분 선택"
          aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined} onClick={() => setMenuOpen(!menuOpen)}>+</button>
        <input aria-label="AI에게 질문" placeholder="질문하기…" value={draft}
          onChange={(event) => onDraftChange(event.target.value)} readOnly={loading} disabled={!onAsk}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
          }} />
        <button type="submit" aria-label="질문 보내기" title="질문 보내기" disabled={!onAsk || loading || !draft.trim()}>↑</button>
      </form>
      </div>
    </section>
  );
}
