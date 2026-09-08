import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  GoogleCalendarAdapter,
  getTodayBounds,
  GoogleCalendarApiError,
} from "./googleCalendar";
import { AuthExpiredError } from "./outlook";

describe("GoogleCalendarAdapter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("getTodayBounds", () => {
    it("오늘의 시작 시각과 종료 시각 ISO 문자열을 반환한다", () => {
      const { timeMin, timeMax } = getTodayBounds(new Date("2026-09-08T12:00:00Z"), "Asia/Seoul");
      expect(timeMin).toBeDefined();
      expect(timeMax).toBeDefined();
      expect(new Date(timeMin).getTime()).toBeLessThan(new Date(timeMax).getTime());
    });
  });

  describe("fetchTodayMeetings", () => {
    it("Google Calendar API에서 오늘의 일정을 정상 수집하여 UnifiedData로 변환한다", async () => {
      const mockEvents = {
        items: [
          {
            id: "event-1",
            status: "confirmed",
            summary: "스프린트 기획 회의",
            description: "2차 릴리스 범위 논의",
            location: "회의실 B",
            hangoutLink: "https://meet.google.com/abc-defg-hij",
            created: "2026-09-08T01:00:00Z",
            organizer: { displayName: "이팀장", email: "lee@company.com" },
            start: { dateTime: "2026-09-08T14:00:00+09:00" },
            end: { dateTime: "2026-09-08T15:00:00+09:00" },
            htmlLink: "https://calendar.google.com/event-1",
          },
          {
            id: "event-cancelled",
            status: "cancelled",
            summary: "취소된 미팅",
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockEvents,
      });

      const adapter = new GoogleCalendarAdapter("mock-token");
      const items = await adapter.fetchTodayMeetings(10, "Asia/Seoul");

      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.id).toBe("gcal_event-1");
      expect(item.source).toBe("gcalendar");
      expect(item.sourceApp).toBe("Google Calendar");
      expect(item.category).toBe("meeting");
      expect(item.title).toBe("스프린트 기획 회의");
      expect(item.content).toContain("[14:00 ~ 15:00]");
      expect(item.content).toContain("회의실 B");
      expect(item.content).toContain("https://meet.google.com/abc-defg-hij");
      expect(item.author.name).toBe("이팀장");
      expect(item.author.email).toBe("lee@company.com");
      expect(item.actionDirective).toBe("오늘 일정 참석 및 사전 준비");
      expect(item.url).toBe("https://calendar.google.com/event-1");
    });

    it("401 응답 시 AuthExpiredError를 던진다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const adapter = new GoogleCalendarAdapter("expired-token");
      await expect(adapter.fetchTodayMeetings(10)).rejects.toThrow(AuthExpiredError);
    });

    it("API 오류 응답 시 GoogleCalendarApiError를 던진다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      const adapter = new GoogleCalendarAdapter("mock-token");
      await expect(adapter.fetchTodayMeetings(10)).rejects.toThrow(GoogleCalendarApiError);
    });
  });
});
