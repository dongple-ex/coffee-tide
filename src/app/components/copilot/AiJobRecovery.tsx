"use client";

import { useEffect, useRef, useState } from "react";
import { AI_JOBS_CHANGED, AiJobReadError, forgetAiJob, isAiJobActive, pendingAiJobs, readAiJob } from "@/lib/ai/jobs/client";
import { validAiJobId, type PublicAiJob } from "@/lib/ai/jobs/types";
import MarkdownLite from "../markdownLite";
import styles from "../../page.module.css";

export function AiJobRecovery({ scope, canOpenCanvas, onOpen }: { scope: string; canOpenCanvas: boolean; onOpen: (job: PublicAiJob) => void }) {
  const [jobs, setJobs] = useState<PublicAiJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PublicAiJob | null>(null);
  const dismissed = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const linked = new URL(window.location.href).searchParams.get("aiJob");
        const pending = pendingAiJobs(scope);
        const ids = new Set(pending.map((job) => job.id));
        if (validAiJobId(linked)) ids.add(linked);
        const recovered: PublicAiJob[] = [];
        for (const id of ids) {
          if (isAiJobActive(id) || dismissed.current.has(id)) continue;
          try {
            const job = await readAiJob(id);
            if (cancelled) return;
            if (dismissed.current.has(id)) continue;
            recovered.push(job);
            if (id === linked && job.status !== "running") setSelected(job);
            if (id === linked) setError(null);
          } catch (err) {
            if (cancelled || dismissed.current.has(id)) continue;
            const submitted = pending.find((job) => job.id === id);
            if (err instanceof AiJobReadError && err.status === 404 && submitted && Date.now() - submitted.createdAt > 60_000) {
              recovered.push({ id, kind: "copilot", question: "접수 상태를 확인하지 못한 작업", createdAt: submitted.createdAt,
                status: "failed", notification: "disabled", result: { error: "서버에 저장된 작업이 없습니다. 다시 요청해 주세요." } });
            }
            if (!cancelled && id === linked) setError(err instanceof Error ? err.message : "결과를 불러오지 못했습니다.");
          }
        }
        if (!cancelled) setJobs(recovered.filter((job) => !dismissed.current.has(job.id)));
      } finally { checking = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    const refresh = () => void check();
    window.addEventListener(AI_JOBS_CHANGED, refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(AI_JOBS_CHANGED, refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [scope]);

  function dismiss(id?: string) {
    if (id) dismissed.current.add(id);
    const url = new URL(window.location.href);
    if (!id || url.searchParams.get("aiJob") === id) {
      url.searchParams.delete("aiJob");
      window.history.replaceState(null, "", url);
    }
    if (id) forgetAiJob(scope, id);
    setSelected(null);
    setError(null);
    setJobs((previous) => previous.filter((job) => job.id !== id));
  }

  if (!jobs.length && !error && !selected) return null;
  return <section className={styles.card} aria-label="AI 작업 결과" style={{ margin: "12px 0" }}>
    {error && <p role="status">{error} <button className={styles.btn} onClick={() => dismiss()}>닫기</button></p>}
    {jobs.map((job) => <div key={job.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
      <span>{job.status === "running" ? "AI 작업 처리 중" : job.status === "failed" ? "AI 작업 실패" : "저장된 AI 작업 결과"} · {job.question.slice(0, 60)}</span>
      {job.status !== "running" && <button className={styles.btn} onClick={() => setSelected(job)}>결과 보기</button>}
      <button className={styles.btn} onClick={() => dismiss(job.id)}>목록에서 닫기</button>
    </div>)}
    {selected && <div aria-label="저장된 작업 결과">
      <h3>{selected.question}</h3>
      {selected.result?.ai_fallback === true || selected.result?.providerUsed === "local_rules" ? <p>AI를 사용할 수 없어 준비한 대체 응답입니다.</p> : null}
      <MarkdownLite text={String(selected.result?.answer ?? selected.result?.content ?? selected.result?.error ?? "결과를 불러오지 못했습니다.")} />
      {Array.isArray(selected.result?.extractedTasks) && <ul>{selected.result.extractedTasks.map((task, i) => <li key={i}>{String((task as { title?: string }).title || "할 일")}</li>)}</ul>}
      {selected.notification === "failed" && <p>결과는 저장되었지만 푸시 발송에 실패했습니다.</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {selected.status === "completed" && (selected.kind !== "canvas" || canOpenCanvas) && <button className={styles.btnPrimary} onClick={() => { onOpen(selected); dismiss(selected.id); }}>
          {selected.kind === "canvas" ? "캔버스 사본으로 열기" : "대화에서 이어보기"}
        </button>}
        <button className={styles.btn} onClick={() => dismiss(selected.id)}>확인</button>
      </div>
      <p className={styles.connNote}>결과는 요청 후 24시간 동안 보관됩니다.</p>
    </div>}
  </section>;
}
