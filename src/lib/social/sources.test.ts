import { describe, expect, it } from "vitest";
import { normalizeSocialTarget, parseSocialSources, restoreSocialBundles } from "./sources";

describe("social source validation", () => {
  it("normalizes account handles and home URLs", () => {
    expect(normalizeSocialTarget("x", "account", "https://x.com/OpenAI")).toBe("openai");
    expect(normalizeSocialTarget("instagram", "account", "@coffee.tide")).toBe("coffee.tide");
    expect(normalizeSocialTarget("threads", "account", "threads.com/@openai/")).toBe("openai");
    expect(normalizeSocialTarget("x", "search", " AI lang:ko ")).toBe("AI lang:ko");
  });
  it("rejects wrong services, post URLs, injection and unsupported source kinds", () => {
    expect(() => normalizeSocialTarget("x", "account", "https://x.com.evil.com/openai")).toThrow();
    expect(() => normalizeSocialTarget("instagram", "account", "https://x.com/openai")).toThrow();
    expect(() => normalizeSocialTarget("instagram", "account", "instagram.com/p/123")).toThrow();
    expect(() => normalizeSocialTarget("instagram", "account", "abc){token}")).toThrow();
    expect(() => normalizeSocialTarget("instagram", "search", "#news")).toThrow();
    expect(() => normalizeSocialTarget("site", "url", "https://user:password@example.com")).toThrow();
  });
  it("bounds and deduplicates source requests", () => {
    const source = { id: "one", provider: "x", kind: "account", target: "@openai", name: "OpenAI" };
    expect(() => parseSocialSources(Array.from({ length: 7 }, (_, i) => ({ ...source, id: String(i) })))).toThrow();
    expect(() => parseSocialSources([source, { ...source, id: "two", target: "https://x.com/openai" }])).toThrow("중복");
    expect(() => parseSocialSources([{ ...source, provider: "unknown" }])).toThrow();
  });
  it("restores valid bundles while discarding corrupt sources", () => {
    expect(restoreSocialBundles([
      { id: "good", name: "관심 소식", sources: [] },
      { id: "bad", name: "bad", sources: [{ provider: "secret" }] },
    ])).toEqual([{ id: "good", name: "관심 소식", sources: [] }]);
  });
});
