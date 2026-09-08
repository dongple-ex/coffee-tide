import { buildGoogleRecurrence, CalendarEventDraft } from "@/lib/calendar/types";
import { UnifiedData } from "../types/unified";
import { AuthExpiredError } from "./outlook";

export class GoogleCalendarApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = "GoogleCalendarApiError";
  }
}

export interface CreatedGoogleCalendarEvent {
  id: string;
  htmlLink?: string;
  summary?: string;
}

export function getTodayBounds(
  now: Date = new Date(),
  timezone: string = "Asia/Seoul"
): { timeMin: string; timeMax: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  const dateString = `${y}-${m}-${d}`;

  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  });
  const tzPart = tzFormatter.formatToParts(now).find((p) => p.type === "timeZoneName")?.value || "GMT+9";
  let offset = "+09:00";
  const mMatch = tzPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (mMatch) {
    const sign = mMatch[1];
    const hours = mMatch[2].padStart(2, "0");
    const mins = (mMatch[3] || "0").padStart(2, "0");
    offset = `${sign}${hours}:${mins}`;
  }

  const timeMin = new Date(`${dateString}T00:00:00${offset}`).toISOString();
  const timeMax = new Date(`${dateString}T23:59:59.999${offset}`).toISOString();
  return { timeMin, timeMax };
}

export class GoogleCalendarAdapter {
  constructor(private readonly accessToken: string) {}

  async fetchTodayMeetings(limit = 10, timezone = "Asia/Seoul"): Promise<UnifiedData[]> {
    const { timeMin, timeMax } = getTodayBounds(new Date(), timezone);
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(Math.min(Math.max(1, limit), 50)),
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (res.status === 401) throw new AuthExpiredError("google");
    if (!res.ok) {
      throw new GoogleCalendarApiError(
        `Google Calendar events list failed (${res.status})`,
        res.status,
        (await res.text()).slice(0, 1000)
      );
    }

    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        status?: string;
        htmlLink?: string;
        created?: string;
        summary?: string;
        description?: string;
        location?: string;
        hangoutLink?: string;
        conferenceData?: { entryPoints?: Array<{ uri?: string }> };
        organizer?: { email?: string; displayName?: string };
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };
    const items = data.items || [];

    return items
      .filter((ev) => ev.status !== "cancelled")
      .map((ev): UnifiedData => {
        const startStr = ev.start?.dateTime || ev.start?.date || "";
        const endStr = ev.end?.dateTime || ev.end?.date || "";
        const startTime = startStr.includes("T") ? startStr.slice(11, 16) : "";
        const endTime = endStr.includes("T") ? endStr.slice(11, 16) : "";
        const timeDesc = startTime && endTime ? `[${startTime} ~ ${endTime}] ` : startStr ? `[${startStr}] ` : "";
        const meetLink = ev.hangoutLink || ev.conferenceData?.entryPoints?.[0]?.uri || "";
        const locDesc = ev.location ? ` | 장소: ${ev.location}` : "";
        const linkDesc = meetLink ? ` | 회의링크: ${meetLink}` : "";
        const desc = ev.description ? `\n${ev.description}` : "";

        return {
          id: `gcal_${ev.id}`,
          source: "gcalendar",
          sourceApp: "Google Calendar",
          title: ev.summary || "(제목 없는 일정)",
          content: `${timeDesc}${locDesc}${linkDesc}${desc}`.trim() || ev.summary || "일정 내용 없음",
          created_at:
            ev.created ||
            (startStr.includes("T") ? new Date(startStr).toISOString() : new Date().toISOString()),
          author: {
            name: ev.organizer?.displayName || ev.organizer?.email || "Google Calendar",
            email: ev.organizer?.email,
          },
          url: ev.htmlLink || `https://calendar.google.com/calendar/r/eventedit/${ev.id}`,
          category: "meeting",
          status: "pending",
          actionDirective: "오늘 일정 참석 및 사전 준비",
        };
      });
  }

  async createEvent(draft: CalendarEventDraft): Promise<CreatedGoogleCalendarEvent> {
    const start = draft.allDay
      ? { date: draft.startDate }
      : { dateTime: draft.startDateTime, timeZone: draft.timezone };
    const end = draft.allDay
      ? { date: draft.endDate }
      : { dateTime: draft.endDateTime, timeZone: draft.timezone };
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: draft.title,
          description: draft.description,
          start,
          end,
          recurrence: buildGoogleRecurrence(draft.recurrence),
          extendedProperties: {
            private: { createdBy: "CoffeeTide AI Barista" },
          },
        }),
      }
    );

    if (!response.ok) {
      const responseBody = await response.text();
      throw new GoogleCalendarApiError(
        `Google Calendar event creation failed (${response.status})`,
        response.status,
        responseBody.slice(0, 1000)
      );
    }

    const event = (await response.json()) as CreatedGoogleCalendarEvent;
    if (!event.id) {
      throw new GoogleCalendarApiError("Google Calendar response did not include an event id", 502, "");
    }
    return event;
  }
}
