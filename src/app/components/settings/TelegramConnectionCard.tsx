"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TelegramIcon } from "../brandIcons";
import styles from "../../page.module.css";

interface LinkStatus {
  configured: boolean;
  connected?: boolean;
  displayName?: string;
  pending?: { requestId: string; displayName: string | null; telegramUserId: string | null; expiresAt: string } | null;
}

export function TelegramConnectionCard() {
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/telegram/link", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { throw new Error(data.error ?? "로그인 후 Telegram 연결 상태를 확인해 주세요."); }
    setStatus(data);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/telegram/link", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) { throw new Error("Link status unavailable"); }
        if (!controller.signal.aborted) { setStatus(data); }
      }).catch(() => {
        if (!controller.signal.aborted) { setError("로그인 후 Telegram 연결 상태를 확인해 주세요."); }
      });
    return () => controller.abort();
  }, []);

  async function act(action: "start" | "confirm" | "disconnect" | "refresh") {
    if (busyRef.current) { return; }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (action !== "refresh") {
        const response = await fetch("/api/telegram/link", {
          method: action === "disconnect" ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: action === "disconnect" ? undefined : JSON.stringify({ action, requestId: status?.pending?.requestId }),
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.error ?? "연결 요청을 처리하지 못했습니다."); }
        setUrl(action === "start" ? data.url : null);
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Telegram 연결 상태를 확인하지 못했습니다.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return <div className={styles.connCard}>
    <div className={styles.connHead}><TelegramIcon /> Telegram
      <span className={`${styles.connStatus} ${status?.connected ? styles.connOn : ""}`}>
        {status?.connected ? "연결됨" : status?.configured ? "미연결" : "준비 필요"}
      </span>
    </div>
    <p className={styles.connNote}>개인 채팅에서 질문하고 완료 답장을 받습니다. 일정 등록·메일 발송은 웹에서 진행해 주세요.</p>
    {status?.connected && <p>{status.displayName}</p>}
    {status && !status.configured && <p>아직 Telegram 연결이 준비되지 않았습니다.</p>}
    {url && <p><a href={url} target="_blank" rel="noopener noreferrer">Telegram에서 봇 열기</a></p>}
    {status?.pending && <p>봇에서 시작을 누른 뒤 상태를 새로 확인해 주세요. 연결 요청은 10분 뒤 만료됩니다.</p>}
    {status?.pending?.telegramUserId && <p>연결할 계정: {status.pending.displayName} (ID: {status.pending.telegramUserId})</p>}
    {error && <p role="alert">{error}</p>}
    <div className={styles.connRow}>
      {status?.configured && !status.connected && !status.pending && <button className={styles.btn} disabled={busy} onClick={() => void act("start")}>연결 시작</button>}
      {status?.pending?.telegramUserId && <button className={styles.btn} disabled={busy} onClick={() => void act("confirm")}>이 계정으로 연결</button>}
      {(status?.connected || status?.pending) && <button className={styles.btn} disabled={busy} onClick={() => void act("disconnect")}>{status.connected ? "연결 해제" : "연결 요청 취소"}</button>}
      <button className={styles.btn} disabled={busy} onClick={() => void act("refresh")}>상태 확인</button>
    </div>
  </div>;
}
