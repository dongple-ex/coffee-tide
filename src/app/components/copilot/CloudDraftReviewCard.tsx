"use client";

import type { ChangeEvent } from "react";
import {
  cloudDraftClipboardText,
  type CloudDraftPayload,
} from "@/lib/cloudTools/drafts";
import { calendarRecurrenceLabel } from "@/lib/calendar/types";
import styles from "./cloudDraftReviewCard.module.css";

interface Props {
  draft: CloudDraftPayload;
  busy: boolean;
  googleConnected: boolean;
  onChange: (draft: CloudDraftPayload) => void;
  onCancel: () => void;
  onNotify: (message: string) => void;
  onExternalWrite: () => void;
}

function draftLabel(draft: CloudDraftPayload): string {
  if (draft.kind === "calendar_event") return "📅 일정 초안";
  if (draft.kind === "email_reply") return "✉️ 메일 답장 초안";
  return "📄 보고서 초안";
}

export function CloudDraftReviewCard({
  draft,
  busy,
  googleConnected,
  onChange,
  onCancel,
  onNotify,
  onExternalWrite,
}: Props) {
  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(cloudDraftClipboardText(draft));
      onNotify("초안을 클립보드에 복사했습니다.");
    } catch {
      onNotify("클립보드에 복사하지 못했습니다. 내용을 직접 선택해 주세요.");
    }
  };

  const updateCalendar = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (draft.kind !== "calendar_event") return;
    onChange({
      kind: "calendar_event",
      draft: { ...draft.draft, [event.target.name]: event.target.value },
    });
  };

  return (
    <section className={styles.card} aria-label={`${draftLabel(draft)} 검토`}>
      <div className={styles.header}>
        <div>
          <div className={styles.badge}>{draftLabel(draft)} · 검토 필요</div>
          <p className={styles.notice}>수정·복사는 가능하지만 외부 서비스에는 아직 반영되지 않았습니다.</p>
        </div>
        <span className={styles.phase}>Phase C·D</span>
      </div>

      {draft.kind === "calendar_event" && (
        <div className={styles.fields}>
          <label>
            제목
            <input name="title" value={draft.draft.title} onChange={updateCalendar} maxLength={120} />
          </label>
          {draft.draft.allDay ? (
            <div className={styles.twoColumns}>
              <label>
                시작일
                <input type="date" name="startDate" value={draft.draft.startDate} onChange={updateCalendar} />
              </label>
              <label>
                종료 다음 날
                <input type="date" name="endDate" value={draft.draft.endDate} onChange={updateCalendar} />
              </label>
            </div>
          ) : (
            <div className={styles.twoColumns}>
              <label>
                시작 일시
                <input name="startDateTime" value={draft.draft.startDateTime} onChange={updateCalendar} />
              </label>
              <label>
                종료 일시
                <input name="endDateTime" value={draft.draft.endDateTime} onChange={updateCalendar} />
              </label>
            </div>
          )}
          <label>
            타임존
            <input name="timezone" value={draft.draft.timezone} onChange={updateCalendar} maxLength={100} />
          </label>
          <label>
            설명
            <textarea
              name="description"
              value={draft.draft.description ?? ""}
              onChange={updateCalendar}
              rows={4}
              maxLength={2_000}
            />
          </label>
          <div className={styles.hint}>반복: {calendarRecurrenceLabel(draft.draft.recurrence)}</div>
        </div>
      )}

      {draft.kind === "email_reply" && (
        <div className={styles.fields}>
          <label>
            제목
            <input
              value={draft.subject}
              onChange={(event) => onChange({ ...draft, subject: event.target.value })}
              maxLength={200}
            />
          </label>
          <label>
            받는 사람
            <input
              value={draft.recipient ?? ""}
              onChange={(event) => onChange({ ...draft, recipient: event.target.value })}
              maxLength={320}
              placeholder="이름 또는 이메일을 확인하세요"
            />
          </label>
          <label>
            본문
            <textarea
              value={draft.body}
              onChange={(event) => onChange({ ...draft, body: event.target.value })}
              rows={10}
              maxLength={12_000}
            />
          </label>
        </div>
      )}

      {draft.kind === "report" && (
        <div className={styles.fields}>
          <label>
            제목
            <input
              value={draft.title}
              onChange={(event) => onChange({ ...draft, title: event.target.value })}
              maxLength={200}
            />
          </label>
          <div className={styles.hint}>유형: {draft.reportType}</div>
          <label>
            Markdown 본문
            <textarea
              value={draft.body}
              onChange={(event) => onChange({ ...draft, body: event.target.value })}
              rows={12}
              maxLength={20_000}
            />
          </label>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="button" className={styles.secondary} onClick={() => void copyDraft()} disabled={busy}>
          초안 복사
        </button>
        {draft.kind !== "email_reply" && googleConnected && (
          <button type="button" className={styles.primary} onClick={onExternalWrite} disabled={busy}>
            {busy
              ? "승인 준비 중…"
              : draft.kind === "calendar_event"
                ? "Calendar 등록 검토"
                : "Drive 저장 검토"}
          </button>
        )}
        {draft.kind !== "email_reply" && !googleConnected && (
          <a className={styles.primary} href="/api/auth/google/signin">Google 연결하기</a>
        )}
      </div>
    </section>
  );
}
