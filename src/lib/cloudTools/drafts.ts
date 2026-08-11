import {
  normalizeCalendarEventDraft,
  type CalendarEventDraft,
} from "@/lib/calendar/types";

export interface CalendarCloudDraft {
  kind: "calendar_event";
  draft: CalendarEventDraft;
}

export interface EmailReplyCloudDraft {
  kind: "email_reply";
  subject: string;
  body: string;
  recipient?: string;
  sourceTitle?: string;
}

export interface ReportCloudDraft {
  kind: "report";
  title: string;
  body: string;
  reportType: "status" | "weekly" | "meeting" | "general";
}

export type CloudDraftPayload =
  | CalendarCloudDraft
  | EmailReplyCloudDraft
  | ReportCloudDraft;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeCloudDraftPayload(value: unknown): CloudDraftPayload | null {
  if (!isRecord(value)) return null;
  if (value.kind === "calendar_event") {
    const draft = normalizeCalendarEventDraft(value.draft);
    return draft ? { kind: "calendar_event", draft } : null;
  }
  if (value.kind === "email_reply") {
    const subject = safeText(value.subject, 200);
    const body = safeText(value.body, 12_000);
    if (!subject || !body) return null;
    const recipient = safeText(value.recipient, 320);
    const sourceTitle = safeText(value.sourceTitle, 300);
    return {
      kind: "email_reply",
      subject,
      body,
      ...(recipient ? { recipient } : {}),
      ...(sourceTitle ? { sourceTitle } : {}),
    };
  }
  if (value.kind === "report") {
    const title = safeText(value.title, 200);
    const body = safeText(value.body, 20_000);
    const reportType = ["status", "weekly", "meeting", "general"].includes(
      String(value.reportType)
    )
      ? (value.reportType as ReportCloudDraft["reportType"])
      : "general";
    return title && body ? { kind: "report", title, body, reportType } : null;
  }
  return null;
}

export function cloudDraftClipboardText(value: CloudDraftPayload): string {
  if (value.kind === "calendar_event") {
    return JSON.stringify(value.draft, null, 2);
  }
  if (value.kind === "email_reply") {
    return [`제목: ${value.subject}`, value.recipient ? `받는 사람: ${value.recipient}` : "", "", value.body]
      .filter((line, index) => line || index >= 2)
      .join("\n");
  }
  return `# ${value.title}\n\n${value.body}`;
}
