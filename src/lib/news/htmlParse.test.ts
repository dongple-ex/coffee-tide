import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import {
  cleanText,
  discoverFeedUrls,
  fetchPage,
  isUnsafeIpAddress,
  looksLikeArticleLink,
  rejectUnsafeRemoteUrl,
  rejectUnsafeUrl,
} from "./htmlParse";

describe("news URL SSRF protection", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks local, private, link-local and documentation IP ranges", () => {
    const unsafe = [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "198.18.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ];

    for (const address of unsafe) {
      expect(isUnsafeIpAddress(address), address).toBe(true);
    }

    expect(isUnsafeIpAddress("8.8.8.8")).toBe(false);
    expect(isUnsafeIpAddress("192.0.1.1")).toBe(false);
    expect(isUnsafeIpAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("rejects non-http and local hostnames before DNS lookup", async () => {
    expect(rejectUnsafeUrl(new URL("file:///etc/passwd"))).toBeTruthy();
    expect(await rejectUnsafeRemoteUrl(new URL("http://localhost/admin"))).toBeTruthy();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects a hostname when any resolved address is private", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);

    expect(await rejectUnsafeRemoteUrl(new URL("https://example.com"))).toBeTruthy();
  });

  it("allows a hostname only when every resolved address is public", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    expect(await rejectUnsafeRemoteUrl(new URL("https://example.com"))).toBeNull();
  });

  it("revalidates every redirect target and never fetches a private destination", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPage("https://example.com/start");

    expect(result.ok).toBe(false);
    expect(result.finalUrl).toBe("http://127.0.0.1/private");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discovers a site's declared RSS feed before falling back to page links", () => {
    const html = '<link rel="alternate" type="application/rss+xml" href="/magazine/feed/">';

    expect(discoverFeedUrls(html, "https://yozm.wishket.com/magazine/")[0]).toBe(
      "https://yozm.wishket.com/magazine/feed/"
    );
  });

  it("removes HTML that was escaped inside an RSS description", () => {
    expect(
      cleanText(
        "&lt;p style=&quot;text-align:justify;&quot;&gt;첫 문장입니다.&lt;/p&gt;&lt;p&gt;둘째 문장입니다.&lt;/p&gt;"
      )
    ).toBe("첫 문장입니다. 둘째 문장입니다.");
  });

  it("keeps article details but rejects author profiles and external promotion links", () => {
    const origin = "https://yozm.wishket.com";

    expect(
      looksLikeArticleLink("https://yozm.wishket.com/magazine/detail/3908/", origin)
    ).toBe(true);
    expect(
      looksLikeArticleLink("https://yozm.wishket.com/magazine/@FinalCatti/", origin)
    ).toBe(false);
    expect(
      looksLikeArticleLink("https://chromewebstore.google.com/detail/example", origin)
    ).toBe(false);
  });
});
