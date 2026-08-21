import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { collectSiteContentMock, summarizeSiteContentMock } = vi.hoisted(() => ({
  collectSiteContentMock: vi.fn(),
  summarizeSiteContentMock: vi.fn(),
}));

vi.mock("@/lib/news/collect", () => ({
  normalizeUrl: (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`),
  collectSiteContent: collectSiteContentMock,
}));

vi.mock("@/lib/ai/gemini", () => ({
  summarizeSiteContent: summarizeSiteContentMock,
}));

import { POST } from "./route";

describe("custom news route", () => {
  beforeEach(() => {
    collectSiteContentMock.mockReset();
    summarizeSiteContentMock.mockReset();
    summarizeSiteContentMock.mockResolvedValue({ byId: {}, briefing: null, aiUsed: false });
  });

  it("uses the shared feed-first collector for the widget response", async () => {
    collectSiteContentMock.mockResolvedValue({
      ok: true,
      siteName: "요즘IT",
      autoSiteName: "요즘IT",
      url: "https://yozm.wishket.com/magazine/",
      feedUrl: "https://yozm.wishket.com/magazine/feed/",
      strategy: "feed",
      isVideo: false,
      items: [
        {
          title: "요즘 클로드가 한국어를 어색하게 쓴다고 느꼈다면",
          url: "https://yozm.wishket.com/magazine/detail/3908/",
          date: "8.21",
          text: "클로드의 한국어가 어색해지는 원인과 이를 개선하는 출력 스타일을 소개합니다. 실제 적용 방법과 품질 및 비용의 선택 기준도 함께 설명합니다.",
          depth: "full",
        },
      ],
    });

    const response = await POST(
      new NextRequest("http://localhost/api/news/custom", {
        method: "POST",
        body: JSON.stringify({
          url: "https://yozm.wishket.com/magazine/",
          siteName: "요즘IT",
          refresh: true,
        }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(collectSiteContentMock).toHaveBeenCalledWith({
      url: "https://yozm.wishket.com/magazine/",
      siteName: "요즘IT",
      limit: 6,
    });
    expect(json.strategy).toBe("feed");
    expect(json.feedUrl).toBe("https://yozm.wishket.com/magazine/feed/");
    expect(json.articles).toHaveLength(1);
    expect(json.articles[0].title).toBe("요즘 클로드가 한국어를 어색하게 쓴다고 느꼈다면");
  });

  it("returns an honest failure instead of fabricated fallback articles", async () => {
    collectSiteContentMock.mockResolvedValue({
      ok: false,
      siteName: "",
      autoSiteName: "",
      url: "https://example.com/",
      strategy: "html",
      isVideo: false,
      items: [],
      reason: "최신 글 목록을 찾지 못했습니다.",
      hint: "RSS 주소를 입력해 주세요.",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/news/custom", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com/", refresh: true }),
      })
    );
    const json = await response.json();

    expect(json.success).toBe(false);
    expect(json.articles).toEqual([]);
    expect(json.reason).toBe("최신 글 목록을 찾지 못했습니다.");
  });
});
