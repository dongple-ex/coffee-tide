import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

const mocks = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn(), lookup: vi.fn(), send: vi.fn(), eq: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@upstash/redis", () => ({ Redis: class { set = mocks.set; get = mocks.get; } }));
vi.mock("@/lib/telegram/config", () => ({ telegramConfig: () => ({ configured: true }) }));
vi.mock("@/lib/telegram/sender", () => ({ sendTelegram: mocks.send }));
vi.mock("@/lib/telegram/store", () => ({ telegramDb: () => ({
  from: () => ({ select: () => {
    const query = { eq: (key: string, value: string) => { mocks.eq(key, value); return query; },
      abortSignal: () => query, maybeSingle: mocks.lookup };
    return query;
  } }),
}) }));
import { POST } from "@/app/api/integrations/trading/notifications/route";

let secret: string;
let now: number;
let event: Record<string, unknown>;
let receipts: Map<string, unknown>;
const request = (value: unknown = event, headers: Record<string, string> = {}, raw?: string) => {
  const body = raw ?? JSON.stringify(value);
  const timestamp = String(Math.floor(now / 1000));
  return new Request("https://example.com/api/integrations/trading/notifications", { method: "POST", body,
    headers: { "content-type": "application/json", "x-trading-timestamp": timestamp,
      "x-trading-signature": createHmac("sha256", secret).update(timestamp + "." + body).digest("hex"), ...headers } });
};

beforeEach(() => {
  vi.resetAllMocks();
  now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  secret = randomBytes(32).toString("hex");
  vi.stubEnv("TRADING_ALERT_SECRET", secret);
  vi.stubEnv("TRADING_ALERT_SCENARIO_ID", "test-scenario");
  vi.stubEnv("TRADING_ALERT_USER_ID", randomUUID());
  vi.stubEnv("TRADING_ALERT_APPROVAL_ORIGIN", "https://trading.example.com");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.com");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", randomBytes(32).toString("hex"));
  event = { schema_version: 1, event: "approval.pending", scenario_id: "test-scenario", proposal_id: randomBytes(16).toString("hex"),
    proposal_version: 1, symbol: "123456", symbol_name: "가상종목", budget_krw: 145000, reason: "가상 위원회 선정 조건 충족",
    created_at_ms: now - 1000, expires_at_ms: now + 59000 };
  receipts = new Map();
  mocks.set.mockImplementation(async (key, value, options) => {
    if (options.nx && receipts.has(key) || options.xx && !receipts.has(key)) { return null; }
    receipts.set(key, value);
    return "OK";
  });
  mocks.get.mockImplementation(async (key) => receipts.get(key) ?? null);
  mocks.lookup.mockResolvedValue({ data: { id: randomUUID(), chat_id: "100", telegram_user_id: "100" }, error: null });
  mocks.send.mockResolvedValue(undefined);
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Trading notification receiver", () => {
  it("delivers all required fields to the configured linked private account", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ status: "sent" });
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(mocks.send).toHaveBeenCalledWith("100", expect.stringContaining("종목: 가상종목 (123456)"));
    const message = mocks.send.mock.calls[0][1];
    for (const text of ["145,000원", "가상 위원회 선정 조건 충족", "만료 시각:", "KST", "https://trading.example.com/", "모의매수", "미승인·만료 시 매수하지 않습니다"]) {
      expect(message).toContain(text);
    }
    expect(mocks.eq).toHaveBeenCalledWith("user_id", process.env.TRADING_ALERT_USER_ID);
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
  });

  it.each(["missing", "bad_signature", "tampered", "old_timestamp"])("rejects %s authentication before storage", async (kind) => {
    let input = request();
    if (kind === "missing") { input.headers.delete("x-trading-signature"); }
    if (kind === "bad_signature") { input.headers.set("x-trading-signature", randomBytes(32).toString("hex")); }
    if (kind === "tampered") { input = new Request(input.url, { method: "POST", headers: input.headers, body: JSON.stringify({ ...event, budget_krw: 1 }) }); }
    if (kind === "old_timestamp") { input.headers.set("x-trading-timestamp", String(Math.floor(now / 1000) - 31)); }
    expect((await POST(input)).status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    { scenario_id: "another" }, { event: "approval.approved" }, { schema_version: 2 }, { budget_krw: 1.5 },
    { budget_krw: Number.MAX_SAFE_INTEGER + 1 }, { symbol: "BAD" }, { reason: "" }, { reason: "wrong\nlink" },
    { reason: "x".repeat(1001) }, { proposal_version: 0 }, { proposal_id: "not-an-id" }, { user_id: "other" },
    { approval_url: "https://attacker.example.com" }, { symbol_name: "spoof\u202e" },
  ])("rejects an invalid or recipient-controlled payload %j", async (change) => {
    expect((await POST(request({ ...event, ...change }))).status).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON, UTF8, excessive lifetimes and future creation", async () => {
    expect((await POST(request(null, {}, "{"))).status).toBe(400);
    expect((await POST(request({ ...event, expires_at_ms: now + 60001 }))).status).toBe(400);
    expect((await POST(request({ ...event, created_at_ms: now + 6000 }))).status).toBe(400);
    const bytes = Buffer.from([0xff]);
    const stamp = String(Math.floor(now / 1000));
    const input = new Request("https://example.com", { method: "POST", body: bytes, headers: {
      "content-type": "application/json", "x-trading-timestamp": stamp,
      "x-trading-signature": createHmac("sha256", secret).update(stamp + ".").update(bytes).digest("hex"),
    } });
    expect((await POST(input)).status).toBe(400);
  });

  it("rejects oversize chunked and declared bodies and non-JSON content", async () => {
    expect((await POST(request(null, {}, "x".repeat(8193)))).status).toBe(413);
    expect((await POST(request(event, { "content-length": "8193" }))).status).toBe(413);
    expect((await POST(request(event, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("drops expired proposals without claiming or sending", async () => {
    const result = await POST(request({ ...event, expires_at_ms: now }));
    expect(result.status).toBe(410);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rechecks expiry after storage latency", async () => {
    mocks.lookup.mockImplementation(async () => {
      if (mocks.lookup.mock.calls.length === 2) { vi.mocked(Date.now).mockReturnValue(now + 60000); }
      return { data: { id: "same-link", chat_id: "100", telegram_user_id: "100" }, error: null };
    });
    expect((await POST(request())).status).toBe(410);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("deduplicates retries across fresh handler invocations and detects changed content", async () => {
    expect((await POST(request())).status).toBe(200);
    expect(await (await POST(request())).json()).toEqual({ status: "already_sent" });
    expect((await POST(request({ ...event, budget_krw: 150000 }))).status).toBe(409);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("atomically permits only one concurrent Telegram attempt", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => POST(request())));
    expect(results.every((result) => [200, 202].includes(result.status))).toBe(true);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not retry an ambiguous Telegram failure", async () => {
    mocks.send.mockRejectedValue(new Error("sensitive upstream credentials"));
    const first = await POST(request());
    expect(first.status).toBe(202);
    expect(await first.text()).not.toContain("sensitive");
    expect(await (await POST(request())).json()).toEqual({ status: "delivery_unknown" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not send if atomic receipt storage fails", async () => {
    mocks.set.mockRejectedValue(new Error("sensitive storage credentials"));
    const result = await POST(request());
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("sensitive");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("preserves the sending receipt if completion persistence fails", async () => {
    const normal = mocks.set.getMockImplementation()!;
    mocks.set.mockImplementation(async (key, value, options) => {
      if (options.xx) { throw new Error("storage offline"); }
      return normal(key, value, options);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await POST(request())).status).toBe(202);
    expect((await POST(request())).status).toBe(202);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
  });

  it.each([null, { id: "link", chat_id: "-100", telegram_user_id: "100" },
    { id: "link", chat_id: "100", telegram_user_id: "101" }])("blocks an absent or invalid private link", async (link) => {
    mocks.lookup.mockResolvedValue({ data: link, error: null });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("rechecks connection removal before sending", async () => {
    mocks.lookup.mockResolvedValueOnce({ data: { id: "link", chat_id: "100", telegram_user_id: "100" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect((await POST(request())).status).toBe(202);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("fails closed without durable Redis configuration", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("rejects invalid recipient configuration and link lookup errors", async () => {
    vi.stubEnv("TRADING_ALERT_USER_ID", "-".repeat(36));
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("TRADING_ALERT_USER_ID", randomUUID());
    mocks.lookup.mockResolvedValue({ data: null, error: new Error("lookup timed out") });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
