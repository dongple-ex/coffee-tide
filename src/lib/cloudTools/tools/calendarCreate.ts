import { GoogleCalendarAdapter } from "@/lib/adapters/googleCalendar";
import { calendarRecurrenceLabel, normalizeCalendarEventDraft } from "@/lib/calendar/types";
import type { CloudToolDefinition } from "../types";
import { CloudToolInputError } from "../validation";

function calendarDraft(input: Record<string, string | number | boolean>) {
  if (typeof input.draftJson !== "string") return null;
  try {
    return normalizeCalendarEventDraft(JSON.parse(input.draftJson));
  } catch {
    return null;
  }
}

export const calendarCreateTool: CloudToolDefinition = {
  id: "calendar.event_create",
  version: 1,
  name: "Google Calendar 일정 등록",
  description: "사용자가 검토한 일정 초안을 Google 기본 캘린더에 한 번 등록합니다.",
  inputSchema: {
    type: "object",
    properties: {
      draftJson: {
        type: "string",
        description: "검토 완료된 CoffeeTide 일정 초안 JSON입니다.",
        maxLength: 10_000,
      },
    },
    required: ["draftJson"],
    additionalProperties: false,
  },
  effect: "external_write",
  confirmation: "always",
  timeoutMs: 15_000,
  maxOutputBytes: 16 * 1024,
  preview(input, context) {
    const draft = calendarDraft(input);
    if (!draft) throw new CloudToolInputError("일정 초안이 올바르지 않습니다.");
    const schedule = draft.allDay
      ? `${draft.startDate} ~ ${draft.endDate} (종일)`
      : `${draft.startDateTime} ~ ${draft.endDateTime}`;
    return {
      title: draft.title,
      target: "Google 기본 캘린더",
      ...(context.googleEmail ? { account: context.googleEmail } : {}),
      changes: [schedule, `반복: ${calendarRecurrenceLabel(draft.recurrence)}`],
      warning: "승인하면 Google Calendar에 일정 1건이 생성됩니다.",
    };
  },
  async execute(input, context) {
    const draft = calendarDraft(input);
    if (!draft) throw new CloudToolInputError("일정 초안이 올바르지 않습니다.");
    if (!context.googleAccessToken) throw new Error("GOOGLE_RECONNECT_REQUIRED");
    const event = await new GoogleCalendarAdapter(context.googleAccessToken).createEvent(draft);
    return {
      success: true,
      summary: `### ✅ Google Calendar 등록 완료\n- **${event.summary ?? draft.title}**`,
      data: {
        kind: "calendar_event_created",
        eventId: event.id,
        eventUrl: event.htmlLink,
        title: event.summary ?? draft.title,
      },
      sources: [
        {
          label: "Google Calendar",
          ...(event.htmlLink ? { url: event.htmlLink } : {}),
        },
      ],
      warnings: [],
    };
  },
};
