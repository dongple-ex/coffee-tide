import type { CalendarEventDraft } from "@/lib/calendar/types";
import type { CloudDraftPayload } from "./drafts";
import type { CloudToolPreview } from "./types";

export interface CloudWriteRequest {
  toolId: "calendar.event_create" | "drive.report_save";
  input: Record<string, string | number | boolean>;
}

export interface CloudWriteApproval extends CloudWriteRequest {
  token: string;
  expiresAt: string;
  idempotencyKey: string;
  preview: CloudToolPreview;
}

export function calendarWriteRequest(draft: CalendarEventDraft): CloudWriteRequest {
  return {
    toolId: "calendar.event_create",
    input: { draftJson: JSON.stringify(draft) },
  };
}

export function draftWriteRequest(draft: CloudDraftPayload): CloudWriteRequest | null {
  if (draft.kind === "calendar_event") return calendarWriteRequest(draft.draft);
  if (draft.kind === "report") {
    return {
      toolId: "drive.report_save",
      input: { title: draft.title, body: draft.body },
    };
  }
  return null;
}
