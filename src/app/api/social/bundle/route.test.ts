import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), collect: vi.fn(), summary: vi.fn() }));
vi.mock("@/lib/auth/identity", () => ({ resolveIdentity: mocks.identity }));
vi.mock("@/lib/social/server", () => ({ collectSocialSource: mocks.collect, socialConnectionStatus: () => ({ x: false, instagram: false, mockMode: false }) }));
vi.mock("@/lib/ai/gemini", () => ({ summarizeSiteContent: mocks.summary }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.identity.mockResolvedValue({ id: "user" }); });
function request(body: unknown, origin?: string) {
  return new NextRequest("http://localhost/api/social/bundle", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
}
const source = { id: "s1", name: "OpenAI", provider: "x", kind: "account", target: "@openai" };

describe("social bundle API", () => {
  it("requires authentication and rejects cross-site paid requests", async () => {
    const { POST, GET } = await import("./route");
    mocks.identity.mockResolvedValue(null);
    expect((await POST(request({ sources: [source] }))).status).toBe(401);
    expect((await GET()).status).toBe(401);
    mocks.identity.mockResolvedValue({ id: "user" });
    expect((await POST(request({ sources: [source] }, "https://other.example"))).status).toBe(403);
    expect(mocks.collect).not.toHaveBeenCalled();
  });
  it("validates before collection", async () => {
    const { POST } = await import("./route");
    expect((await POST(request({ sources: [{ ...source, target: "https://evil.test/foo" }] }))).status).toBe(400);
    expect(mocks.collect).not.toHaveBeenCalled();
  });
  it("keeps partial source failures visible and avoids AI calls unless explicitly requested", async () => {
    const { POST } = await import("./route");
    mocks.collect.mockImplementation(async (s) => s.provider === "x" ? {
      posts: [{ id: "x:1", sourceId: s.id, provider: "x", author: "openai", title: "실제 응답을 모사한 테스트", text: "HTTP 모의 응답", url: "https://x.com/i/web/status/1", publishedAt: "2026-10-01T12:00:00Z" }],
      result: { sourceId: s.id, provider: "x", status: "ok", message: "1개" },
    } : { posts: [], result: { sourceId: s.id, provider: "instagram", status: "not_configured", message: "연결 필요" } });
    const response = await POST(request({ sources: [source, { ...source, id: "s2", provider: "instagram" }] }));
    const body = await response.json();
    expect(body.posts).toHaveLength(1); expect(body.sources[1].status).toBe("not_configured");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it("limits repeated requests by authenticated identity", async () => {
    const { POST } = await import("./route");
    for (let i = 0; i < 4; i++) await POST(request({ sources: [] }));
    expect((await POST(request({ sources: [] }))).status).toBe(429);
  });
});
