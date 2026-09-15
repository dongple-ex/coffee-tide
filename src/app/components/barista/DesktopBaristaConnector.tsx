"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getPersonaAvatar, getPersonaEffect } from "@/lib/ai/personaEffects";
import styles from "./desktopBaristaConnector.module.css";

const BRIDGE_URL = "http://127.0.0.1:47381";

interface Props {
  presetId: string;
  baristaName: string;
  displayTitle: string;
  displayContent: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenCopilot?: () => void;
  onSendMessage?: (
    message: string,
    previousTurn?: { userText: string; aiText: string }
  ) => Promise<string | undefined> | void;
}

export function DesktopBaristaConnector({
  presetId,
  baristaName,
  displayTitle,
  displayContent,
  isOpen,
  onClose,
  onOpenCopilot,
  onSendMessage,
}: Props) {
  const [code, setCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const effect = getPersonaEffect(presetId, baristaName);
  const latest = useRef({ name: baristaName, presetId, title: displayTitle, speech: displayContent, accent: effect.accent, avatar: getPersonaAvatar(effect, false) });
  const openCopilot = useRef(onOpenCopilot);
  const sendMessageRef = useRef(onSendMessage);
  const triggerSendRef = useRef<() => void>(() => {});

  useEffect(() => {
    latest.current = { name: baristaName, presetId, title: displayTitle, speech: displayContent, accent: effect.accent, avatar: getPersonaAvatar(effect, false) };
    openCopilot.current = onOpenCopilot;
    sendMessageRef.current = onSendMessage;
    // 대화 내용이나 상태가 바뀌면 지연 없이 즉시 데스크톱으로 전송
    triggerSendRef.current();
  }, [baristaName, presetId, displayTitle, displayContent, effect, onOpenCopilot, onSendMessage]);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    let running = false;
    let failures = 0;
    const send = async () => {
      if (running || disposed) return;
      running = true;
      try {
        const response = await fetch(`${BRIDGE_URL}/state`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(latest.current),
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) throw new Error("데스크톱 바리스타를 다시 연결해 주세요.");
        const result = await response.json();
        failures = 0;
        if (!disposed && result.action === "open-copilot") {
          openCopilot.current?.();
          // 포커스 허용 여부는 브라우저가 결정한다. 새 탭을 만드는 폴백은 사용하지 않는다.
          window.focus();
        } else if (!disposed && (result.action === "order-coffee" || result.action === "trigger-talk")) {
          // 데스크톱 앱에서 주문/대화 요청 시 웹의 AI 엔진(onSendMessage)으로 연동
          const prompt = result.action === "order-coffee"
            ? "시그니처 커피 한 잔과 함께 기운 나는 한마디 부탁해! ☕"
            : "오늘 하루 업무에 집중할 수 있는 꿀팁이나 격려 부탁해! ✨";
          void sendMessageRef.current?.(prompt);
        }
      } catch {
        failures++;
        if (!disposed && failures >= 3) {
          setToken(null);
          setError("데스크톱 연결이 끊어졌습니다. 앱을 실행하고 새 코드로 연결해 주세요.");
        }
      } finally { running = false; }
    };
    triggerSendRef.current = () => void send();
    void send();
    const interval = window.setInterval(() => void send(), 3000);
    const onVisible = () => { if (document.visibilityState === "visible") void send(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      void fetch(`${BRIDGE_URL}/disconnect`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}", keepalive: true,
      }).catch(() => {});
    };
  }, [token]);

  const pair = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${BRIDGE_URL}/pair`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }), signal: AbortSignal.timeout(4000),
      });
      const data = await response.json();
      if (!response.ok || typeof data.token !== "string") throw new Error(data.error || "연결하지 못했습니다.");
      setToken(data.token); setCode("");
    } catch (cause) {
      setError(cause instanceof TypeError ? "보조 앱에 연결할 수 없습니다. CoffeeTideBarista를 실행해 주세요. 브라우저가 로컬 네트워크 접근을 물으면 허용해야 연결됩니다." : cause instanceof Error ? cause.message : "연결에 실패했습니다.");
    } finally { setBusy(false); }
  };

  if (!isOpen) return null;
  return createPortal(
    <div className={styles.backdrop} onClick={(event) => { event.stopPropagation(); onClose(); }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="desktop-barista-title" onClick={(event) => event.stopPropagation()}>
        <header><h2 id="desktop-barista-title">데스크톱 바리스타 연결</h2><button type="button" onClick={onClose} aria-label="데스크톱 연결 닫기">✕</button></header>
        <p>테두리 없는 캐릭터가 다른 앱 위에 머무릅니다. CoffeeTideBarista 보조 앱을 먼저 실행해 주세요.</p>
        {token ? (
          <div role="status" className={styles.connected}>
            <strong>✓ 이 PC의 바리스타와 연결되었습니다.</strong>
            <p>웹의 이름·색상·사진·현재 말풍선을 전달합니다. 대화 내용은 보조 앱에 저장하지 않습니다.</p>
            <button type="button" onClick={() => setToken(null)}>연결 해제</button>
            <button type="button" onClick={onClose}>완료</button>
          </div>
        ) : (
          <form onSubmit={(event) => void pair(event)}>
            <label htmlFor="desktop-pair-code">캐릭터 말풍선의 6자리 연결 코드</label>
            <div className={styles.codeRow}>
              <input id="desktop-pair-code" inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" autoFocus />
              <button type="submit" disabled={busy || code.length !== 6}>{busy ? "연결 중…" : "연결"}</button>
            </div>
          </form>
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <p className={styles.note}>캐릭터의 ⚙ 설정에서 <b>① 아이스커피 아이콘 / ② 현재 바리스타 사진</b>을 선택할 수 있습니다. 캐릭터를 끌어 이동하고, 숨긴 뒤에는 Windows 트레이에서 다시 열 수 있습니다.</p>
      </section>
    </div>, document.body
  );
}
