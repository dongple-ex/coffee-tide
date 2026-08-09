import { buildGoogleRecurrence, CalendarEventDraft } from "@/lib/calendar/types";

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

export class GoogleCalendarAdapter {
  constructor(private readonly accessToken: string) {}

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
