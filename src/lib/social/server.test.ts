import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SocialSource } from "./types";

const source: SocialSource = { id: "x-one", provider: "x", kind: "account", name: "OpenAI", target: "openai" };
const xData = { data: [{ id: "123", text: "게시물 본문", created_at: "2026-10-01T12:00:00Z", author_id: "42" }], includes: { users: [{ id: "42", username: "openai" }] } };

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MOCK_MODE", "false");
  vi.stubEnv("X_BEARER_TOKEN", "");
  vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "");
  vi.stubEnv("INSTAGRAM_USER_ID", "");
  vi.stubEnv("X_FEED_DAILY_REQUEST_LIMIT", "50");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("social collectors (mocked HTTP only)", () => {
  it("returns connection guidance without HTTP or fabricated posts when keys are missing", async () => {
    const { collectSocialSource } = await import("./server");
    const x = await collectSocialSource(source);
    const ig = await collectSocialSource({ ...source, provider: "instagram" });
    expect(x.posts).toEqual([]); expect(x.result.status).toBe("not_configured");
    expect(ig.posts).toEqual([]); expect(ig.result.status).toBe("not_configured");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("disables all external collection in mock mode, including configured services", async () => {
    vi.stubEnv("MOCK_MODE", "true"); vi.stubEnv("X_BEARER_TOKEN", "test-token");
    const { collectSocialSource } = await import("./server");
    expect((await collectSocialSource(source)).result.message).toContain("Mock");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("coalesces concurrent requests and relabels cached results for another bundle", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "test-token");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: { id: "42" } })).mockResolvedValueOnce(Response.json(xData));
    const { collectSocialSource } = await import("./server");
    const [a, b] = await Promise.all([collectSocialSource(source), collectSocialSource({ ...source, id: "x-two" })]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(a.posts[0].sourceId).toBe("x-one"); expect(b.posts[0].sourceId).toBe("x-two");
    expect(b.result.cached).toBe(true);
    expect((await collectSocialSource(source)).result.cached).toBe(true);
    const init = vi.mocked(fetch).mock.calls[0][1];
    expect(init).toMatchObject({ redirect: "error", cache: "no-store", headers: { Authorization: "Bearer test-token" } });
    expect(JSON.stringify(a)).not.toContain("test-token");
  });
  it("enforces the per-process daily X request budget before sending HTTP", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "test-token"); vi.stubEnv("X_FEED_DAILY_REQUEST_LIMIT", "1");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ data: { id: "42" } }));
    const { collectSocialSource } = await import("./server");
    const result = await collectSocialSource(source);
    expect(result.posts).toEqual([]); expect(result.result.status).toBe("error");
    expect(result.result.message).toContain("오늘 X 조회 한도"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not expose upstream error bodies or tokens", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "test-token");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ token: "test-token", detail: "private failure" }, { status: 401 }));
    const { collectSocialSource } = await import("./server");
    const result = await collectSocialSource(source);
    expect(result.result.status).toBe("error");
    expect(JSON.stringify(result)).not.toMatch(/test-token|private failure/);
  });
  it("uses the fixed Instagram Graph endpoint and Business Discovery field expression", async () => {
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "ig-test-token"); vi.stubEnv("INSTAGRAM_USER_ID", "42");
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ business_discovery: { username: "openai", media: { data: [
      { id: "100", caption: "테스트 게시물", permalink: "https://www.instagram.com/p/abc/", timestamp: "2026-10-01T12:00:00Z", media_type: "VIDEO", thumbnail_url: "https://cdn.example.com/image.jpg" },
    ] } } }));
    const { collectSocialSource } = await import("./server");
    const result = await collectSocialSource({ ...source, provider: "instagram" });
    const url = vi.mocked(fetch).mock.calls[0][0] as URL;
    expect(url.hostname).toBe("graph.facebook.com");
    expect(url.searchParams.get("fields")).toContain("business_discovery.username(openai)");
    expect(url.href).not.toContain("ig-test-token");
    expect(result.posts[0].imageUrl).toBe("https://cdn.example.com/image.jpg");
    expect(result.result.status).toBe("ok");
  });
  it("filters unsafe media and permalinks, and uses long X post text", async () => {
    const { parseXPosts, parseInstagramPosts } = await import("./server");
    expect(parseXPosts({ data: [{ id: "1", text: "short", note_tweet: { text: "full long text" } }] }, source)[0].text).toBe("full long text");
    const parsed = parseInstagramPosts({ business_discovery: { media: { data: [
      { id: "1", permalink: "javascript:alert(1)" },
      { id: "2", permalink: "https://instagram.com.evil.com/p/123" },
      { id: "3", permalink: "https://instagram.com/p/123", media_url: "javascript:alert(1)" },
    ] } } }, { ...source, provider: "instagram" });
    expect(parsed).toHaveLength(1); expect(parsed[0].imageUrl).toBeUndefined();
  });
});
