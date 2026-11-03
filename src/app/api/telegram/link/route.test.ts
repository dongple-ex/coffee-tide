import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), status: vi.fn(), start: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ requireSupabaseUser: mocks.auth }));
vi.mock("@/lib/telegram/config", () => ({ telegramConfig: () => ({ username: "example_bot" }), sameOrigin: (r: Request) => r.headers.get("origin") === "https://example.com" }));
vi.mock("@/lib/telegram/store", () => ({ linkStatus: mocks.status, startLink: mocks.start, telegramDb: () => ({ rpc: mocks.rpc }) }));
import { GET, POST, DELETE } from "./route";
const request = (body: unknown, origin = "https://example.com") => new Request("https://example.com/api/telegram/link", {
  method: "POST", headers: { origin }, body: JSON.stringify(body),
});
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ ok: true, user: { id: "alice" } }); });

describe("Telegram web account linking", () => {
  it("requires Supabase login and blocks cross-origin mutation", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
    expect((await GET()).status).toBe(401);
    expect((await POST(request({ action: "start" }, "https://other.example"))).status).toBe(403);
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("binds link confirmation to authenticated user rather than posted user ID", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    const requestId = "11223344-5566-4788-8990-aabbccddeeff";
    expect((await POST(request({ action: "confirm", requestId, userId: "bob" }))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("telegram_confirm_link", { p_user: "alice", p_request: requestId });
  });
  it("returns a one-time link without caching and revokes pending links on disconnect", async () => {
    mocks.start.mockResolvedValue({ requestId: "request", token: "opaque-token" });
    const response = await POST(request({ action: "start" }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).url).toBe("https://t.me/example_bot?start=opaque-token");
    mocks.rpc.mockResolvedValue({ error: null });
    expect((await DELETE(request({}))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("telegram_unlink", { p_user: "alice" });
  });
});
