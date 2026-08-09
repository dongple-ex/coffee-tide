import { NextResponse } from "next/server";
import {
  GoogleCalendarAdapter,
  GoogleCalendarApiError,
} from "@/lib/adapters/googleCalendar";
import { readSession, touchSession, unauthorized } from "@/lib/auth/cookies";
import { refreshChannel, REFRESH_WINDOW_MS } from "@/lib/auth/refresh";
import { normalizeCalendarEventDraft } from "@/lib/calendar/types";

export async function POST(request: Request) {
  const existingSession = await readSession();
  if (!existingSession) return unauthorized();
  let session = existingSession;

  const body = (await request.json().catch(() => ({}))) as { draft?: unknown };
  const draft = normalizeCalendarEventDraft(body.draft);
  if (!draft) {
    return NextResponse.json({ error: "일정 초안이 올바르지 않습니다." }, { status: 400 });
  }
  if (!session.googleToken) {
    return NextResponse.json(
      { error: "Google 연동 후 캘린더에 등록할 수 있어요.", reconnectRequired: true },
      { status: 409 }
    );
  }

  if (
    session.googleRefreshToken &&
    session.googleTokenExpiry &&
    session.googleTokenExpiry - Date.now() < REFRESH_WINDOW_MS
  ) {
    session = (await refreshChannel("google", session)) ?? session;
  }

  const create = () => new GoogleCalendarAdapter(session.googleToken!).createEvent(draft);

  try {
    let event;
    try {
      event = await create();
    } catch (error) {
      if (!(error instanceof GoogleCalendarApiError) || error.status !== 401) throw error;
      const refreshed = await refreshChannel("google", session);
      if (!refreshed?.googleToken) throw error;
      session = refreshed;
      event = await create();
    }

    return touchSession(
      NextResponse.json({
        success: true,
        eventId: event.id,
        eventUrl: event.htmlLink,
        title: event.summary ?? draft.title,
      }),
      session
    );
  } catch (error) {
    console.error("[POST /api/calendar/events] Google Calendar 등록 실패", error);
    if (error instanceof GoogleCalendarApiError) {
      const reconnectRequired =
        error.status === 401 ||
        error.status === 403 ||
        /insufficientPermissions|insufficient authentication scopes/i.test(error.responseBody);
      return NextResponse.json(
        {
          error: reconnectRequired
            ? "Calendar 쓰기 권한이 필요합니다. Google을 다시 연동해 주세요."
            : "Google Calendar에 일정을 등록하지 못했습니다.",
          reconnectRequired,
        },
        { status: reconnectRequired ? 403 : 502 }
      );
    }
    return NextResponse.json(
      { error: "Google Calendar에 일정을 등록하지 못했습니다." },
      { status: 500 }
    );
  }
}
