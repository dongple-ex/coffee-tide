import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildFetchers } from "./factory";
import { SessionData } from "../auth/session";
import { GmailAdapter } from "./gmail";
import { GoogleCalendarAdapter } from "./googleCalendar";
import { GoogleDriveAdapter } from "./googleDrive";
import { AuthExpiredError } from "./outlook";

vi.mock("./gmail");
vi.mock("./googleCalendar");
vi.mock("./googleDrive");

describe("Adapter Factory buildFetchers", () => {
  const originalEnv = process.env.MOCK_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.MOCK_MODE = originalEnv;
  });

  it("MOCK_MODE=true일 때 Google 소스에 gmail, gcalendar, gdrive 항목이 모두 포함된다", async () => {
    process.env.MOCK_MODE = "true";
    const fetchers = buildFetchers({} as SessionData);
    expect(fetchers.google).toBeDefined();

    const items = await fetchers.google!();
    expect(items.length).toBeGreaterThan(0);
    const sources = new Set(items.map((i) => i.source));
    expect(sources.has("gmail")).toBe(true);
    expect(sources.has("gcalendar")).toBe(true);
    expect(sources.has("gdrive")).toBe(true);
  });

  it("실제 모드에서 Gmail, Calendar, Drive 3종을 병렬 수집하고 통합 정렬하여 반환한다", async () => {
    process.env.MOCK_MODE = "false";
    const session: SessionData = {
      googleToken: "mock-google-token",
    } as SessionData;

    vi.mocked(GmailAdapter.prototype.fetchRecent).mockResolvedValue([
      {
        id: "gmail-1",
        source: "gmail",
        title: "메일 1",
        content: "내용 1",
        created_at: "2026-09-08T09:00:00Z",
        author: { name: "보낸이" },
        url: "https://mail.google.com",
      },
    ]);

    vi.mocked(GoogleCalendarAdapter.prototype.fetchTodayMeetings).mockResolvedValue([
      {
        id: "gcal-1",
        source: "gcalendar",
        title: "회의 1",
        content: "내용 1",
        created_at: "2026-09-08T10:00:00Z",
        author: { name: "주최자" },
        url: "https://calendar.google.com",
        category: "meeting",
      },
    ]);

    vi.mocked(GoogleDriveAdapter.prototype.fetchRecentFiles).mockResolvedValue([
      {
        id: "gdrive-1",
        source: "gdrive",
        title: "문서 1",
        content: "내용 1",
        created_at: "2026-09-08T08:00:00Z",
        author: { name: "작성자" },
        url: "https://drive.google.com",
        category: "reference",
      },
    ]);

    const fetchers = buildFetchers(session, 10);
    expect(fetchers.google).toBeDefined();

    const items = await fetchers.google!();
    expect(items).toHaveLength(3);
    // 최신 순으로 정렬되었는지 확인: gcal-1 (10시) -> gmail-1 (9시) -> gdrive-1 (8시)
    expect(items[0].id).toBe("gcal-1");
    expect(items[1].id).toBe("gmail-1");
    expect(items[2].id).toBe("gdrive-1");
  });

  it("부분 실패 허용: Drive 조회가 실패해도 Gmail과 Calendar 결과는 정상 반환된다", async () => {
    process.env.MOCK_MODE = "false";
    const session: SessionData = {
      googleToken: "mock-google-token",
    } as SessionData;

    vi.mocked(GmailAdapter.prototype.fetchRecent).mockResolvedValue([
      {
        id: "gmail-1",
        source: "gmail",
        title: "메일 1",
        content: "내용 1",
        created_at: "2026-09-08T09:00:00Z",
        author: { name: "보낸이" },
        url: "https://mail.google.com",
      },
    ]);

    vi.mocked(GoogleCalendarAdapter.prototype.fetchTodayMeetings).mockResolvedValue([
      {
        id: "gcal-1",
        source: "gcalendar",
        title: "회의 1",
        content: "내용 1",
        created_at: "2026-09-08T10:00:00Z",
        author: { name: "주최자" },
        url: "https://calendar.google.com",
        category: "meeting",
      },
    ]);

    vi.mocked(GoogleDriveAdapter.prototype.fetchRecentFiles).mockRejectedValue(
      new Error("Drive quota exceeded")
    );

    const fetchers = buildFetchers(session, 10);
    const items = await fetchers.google!();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toEqual(["gcal-1", "gmail-1"]);
  });

  it("AuthExpiredError 발생 시 상위 리프레시 루프로 전파한다", async () => {
    process.env.MOCK_MODE = "false";
    const session: SessionData = {
      googleToken: "expired-token",
    } as SessionData;

    vi.mocked(GmailAdapter.prototype.fetchRecent).mockRejectedValue(
      new AuthExpiredError("google")
    );
    vi.mocked(GoogleCalendarAdapter.prototype.fetchTodayMeetings).mockResolvedValue([]);
    vi.mocked(GoogleDriveAdapter.prototype.fetchRecentFiles).mockResolvedValue([]);

    const fetchers = buildFetchers(session, 10);
    await expect(fetchers.google!()).rejects.toThrow(AuthExpiredError);
  });
});
