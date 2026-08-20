import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { sendDueBriefingsMock } = vi.hoisted(() => ({ sendDueBriefingsMock: vi.fn() }));

vi.mock("@/lib/push/sender", () => ({ sendDueBriefings: sendDueBriefingsMock }));

import { GET, POST } from "./route";

describe("daily briefing cron authorization", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    sendDueBriefingsMock.mockReset();
    sendDueBriefingsMock.mockResolvedValue({ sent: 1, skipped: 0 });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("fails closed when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(new NextRequest("http://localhost/api/briefing/daily"));

    expect(response.status).toBe(503);
    expect(sendDueBriefingsMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid bearer token", async () => {
    process.env.CRON_SECRET = "expected-secret";

    const response = await POST(
      new NextRequest("http://localhost/api/briefing/daily", {
        method: "POST",
        headers: { authorization: "Bearer wrong-secret" },
      })
    );

    expect(response.status).toBe(401);
    expect(sendDueBriefingsMock).not.toHaveBeenCalled();
  });

  it("runs the sender only with the configured bearer token", async () => {
    process.env.CRON_SECRET = "expected-secret";

    const response = await GET(
      new NextRequest("http://localhost/api/briefing/daily", {
        headers: { authorization: "Bearer expected-secret" },
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 1, skipped: 0 });
    expect(sendDueBriefingsMock).toHaveBeenCalledTimes(1);
  });
});
