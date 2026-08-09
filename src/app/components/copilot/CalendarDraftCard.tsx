"use client";

import React from "react";
import {
  CalendarEventDraft,
  calendarRecurrenceLabel,
} from "@/lib/calendar/types";
import styles from "../../page.module.css";

interface Props {
  draft: CalendarEventDraft;
  busy: boolean;
  googleConnected: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatDateOnly(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function previousDate(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function formatSchedule(draft: CalendarEventDraft): string {
  if (draft.allDay) {
    const inclusiveEnd = previousDate(draft.endDate);
    return inclusiveEnd === draft.startDate
      ? `${formatDateOnly(draft.startDate)} · 종일`
      : `${formatDateOnly(draft.startDate)} ~ ${formatDateOnly(inclusiveEnd)} · 종일`;
  }

  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: draft.timezone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone: draft.timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(draft.startDateTime))} ~ ${timeFormatter.format(new Date(draft.endDateTime))}`;
}

export function CalendarDraftCard({
  draft,
  busy,
  googleConnected,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <section className={styles.calendarDraftCard} aria-label="Google Calendar 일정 등록 확인">
      <div className={styles.calendarDraftBadge}>📅 Google Calendar 일정 초안</div>
      <strong className={styles.calendarDraftTitle}>{draft.title}</strong>
      <dl className={styles.calendarDraftDetails}>
        <div>
          <dt>시간</dt>
          <dd>{formatSchedule(draft)}</dd>
        </div>
        <div>
          <dt>반복</dt>
          <dd>{calendarRecurrenceLabel(draft.recurrence)}</dd>
        </div>
        <div>
          <dt>캘린더</dt>
          <dd>Google 기본 캘린더 · {draft.timezone}</dd>
        </div>
        {draft.description && (
          <div>
            <dt>설명</dt>
            <dd>{draft.description}</dd>
          </div>
        )}
      </dl>
      <p className={styles.calendarDraftNotice}>확인 버튼을 누르기 전에는 캘린더가 변경되지 않습니다.</p>
      <div className={styles.calendarDraftActions}>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={busy}>
          취소
        </button>
        {googleConnected ? (
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onConfirm} disabled={busy}>
            {busy ? "등록 중…" : "캘린더에 등록"}
          </button>
        ) : (
          <a className={`${styles.btn} ${styles.btnPrimary}`} href="/api/auth/google/signin">
            Google 연결하기
          </a>
        )}
      </div>
    </section>
  );
}
