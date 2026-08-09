export type CalendarRecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type CalendarWeekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export interface CalendarRecurrence {
  frequency: CalendarRecurrenceFrequency;
  interval?: number;
  byWeekday?: CalendarWeekday[];
  until?: string;
  count?: number;
}

interface CalendarEventDraftBase {
  title: string;
  description?: string;
  timezone: string;
  recurrence?: CalendarRecurrence;
}

export interface CalendarTimedEventDraft extends CalendarEventDraftBase {
  allDay?: false;
  startDateTime: string;
  endDateTime: string;
}

export interface CalendarAllDayEventDraft extends CalendarEventDraftBase {
  allDay: true;
  startDate: string;
  /** Google Calendar의 종일 일정 종료일은 exclusive(다음 날)이다. */
  endDate: string;
}

export type CalendarEventDraft = CalendarTimedEventDraft | CalendarAllDayEventDraft;

const FREQUENCIES = new Set<CalendarRecurrenceFrequency>([
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);
const WEEKDAYS = new Set<CalendarWeekday>(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function nextDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function normalizeRecurrence(value: unknown): CalendarRecurrence | undefined {
  if (!isRecord(value)) return undefined;
  const frequency = String(value.frequency ?? "").toUpperCase() as CalendarRecurrenceFrequency;
  if (!FREQUENCIES.has(frequency)) return undefined;

  const intervalValue = Number(value.interval ?? 1);
  const interval = Number.isInteger(intervalValue) && intervalValue >= 1 && intervalValue <= 365
    ? intervalValue
    : 1;
  const byWeekday = Array.isArray(value.byWeekday)
    ? [...new Set(
        value.byWeekday
          .map((day) => String(day).toUpperCase() as CalendarWeekday)
          .filter((day) => WEEKDAYS.has(day))
      )]
    : undefined;
  const until = typeof value.until === "string" && DATE_RE.test(value.until)
    ? value.until
    : undefined;
  const countValue = Number(value.count);
  const count = Number.isInteger(countValue) && countValue >= 1 && countValue <= 500
    ? countValue
    : undefined;

  return {
    frequency,
    ...(interval > 1 ? { interval } : {}),
    ...(byWeekday?.length ? { byWeekday } : {}),
    ...(count ? { count } : until ? { until } : {}),
  };
}

/** AI/클라이언트 입력을 Calendar API에 전달 가능한 안전한 초안으로 정규화한다. */
export function normalizeCalendarEventDraft(
  value: unknown,
  fallbackTimezone = "Asia/Seoul"
): CalendarEventDraft | null {
  if (!isRecord(value)) return null;
  const title = String(value.title ?? "").trim().slice(0, 120);
  if (!title) return null;

  const requestedTimezone = String(value.timezone ?? fallbackTimezone).trim();
  const timezone = isValidTimezone(requestedTimezone) ? requestedTimezone : fallbackTimezone;
  const descriptionText = String(value.description ?? "").trim().slice(0, 2000);
  const description = descriptionText || undefined;
  const recurrence = normalizeRecurrence(value.recurrence);

  if (value.allDay === true) {
    const startDate = String(value.startDate ?? "");
    if (!DATE_RE.test(startDate)) return null;
    const requestedEnd = String(value.endDate ?? "");
    const endDate = DATE_RE.test(requestedEnd) && requestedEnd > startDate
      ? requestedEnd
      : nextDate(startDate);
    return {
      title,
      description,
      timezone,
      allDay: true,
      startDate,
      endDate,
      recurrence,
    };
  }

  const startDateTime = String(value.startDateTime ?? "");
  const startMs = Date.parse(startDateTime);
  if (!Number.isFinite(startMs)) return null;
  const requestedEnd = String(value.endDateTime ?? "");
  const requestedEndMs = Date.parse(requestedEnd);
  const endDateTime = Number.isFinite(requestedEndMs) && requestedEndMs > startMs
    ? requestedEnd
    : new Date(startMs + 60 * 60 * 1000).toISOString();
  const endMs = Date.parse(endDateTime);
  if (endMs - startMs > 31 * 24 * 60 * 60 * 1000) return null;

  return {
    title,
    description,
    timezone,
    allDay: false,
    startDateTime,
    endDateTime,
    recurrence,
  };
}

/** 일반 브리핑 질문과 캘린더 생성 요청을 빠르게 구분해 불필요한 구조화 호출을 피한다. */
export function isCalendarCreateRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const hasTarget = /(google\s*calendar|구글\s*캘린더|캘린더|달력|일정|스케줄|스케쥴|회의|미팅|약속)/i.test(normalized);
  const hasCreateAction = /(등록|추가|생성|만들|잡아|예약|넣어|기록)/i.test(normalized);
  const destructiveOnly = /(삭제|취소|지워|제거)/i.test(normalized) && !hasCreateAction;
  return hasTarget && hasCreateAction && !destructiveOnly;
}

export function buildGoogleRecurrence(recurrence?: CalendarRecurrence): string[] | undefined {
  if (!recurrence) return undefined;
  const parts = [`FREQ=${recurrence.frequency}`];
  if (recurrence.interval && recurrence.interval > 1) parts.push(`INTERVAL=${recurrence.interval}`);
  if (recurrence.byWeekday?.length) parts.push(`BYDAY=${recurrence.byWeekday.join(",")}`);
  if (recurrence.count) {
    parts.push(`COUNT=${recurrence.count}`);
  } else if (recurrence.until) {
    parts.push(`UNTIL=${recurrence.until.replaceAll("-", "")}T235959Z`);
  }
  return [`RRULE:${parts.join(";")}`];
}

const FREQUENCY_LABEL: Record<CalendarRecurrenceFrequency, string> = {
  DAILY: "매일",
  WEEKLY: "매주",
  MONTHLY: "매월",
  YEARLY: "매년",
};

const WEEKDAY_LABEL: Record<CalendarWeekday, string> = {
  MO: "월",
  TU: "화",
  WE: "수",
  TH: "목",
  FR: "금",
  SA: "토",
  SU: "일",
};

export function calendarRecurrenceLabel(recurrence?: CalendarRecurrence): string {
  if (!recurrence) return "반복 없음";
  const base = recurrence.interval && recurrence.interval > 1
    ? `${recurrence.interval}${recurrence.frequency === "WEEKLY" ? "주" : recurrence.frequency === "MONTHLY" ? "개월" : recurrence.frequency === "YEARLY" ? "년" : "일"}마다`
    : FREQUENCY_LABEL[recurrence.frequency];
  const weekdays = recurrence.byWeekday?.length
    ? ` (${recurrence.byWeekday.map((day) => WEEKDAY_LABEL[day]).join("·")}요일)`
    : "";
  const end = recurrence.count
    ? `, ${recurrence.count}회`
    : recurrence.until
      ? `, ${recurrence.until}까지`
      : "";
  return `${base}${weekdays}${end}`;
}
