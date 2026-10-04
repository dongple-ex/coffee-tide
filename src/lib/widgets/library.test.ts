import { describe, expect, it } from "vitest";
import { canonicalWidgetUrl, siteWidgetFolder, uniqueLibrarySites } from "./library";

describe("widget folder navigation", () => {
  it("collapses URL duplicates without losing the selected saved widget", () => {
    const sites = [
      { id: "first", name: "요즘IT", url: "https://www.yozm.wishket.com/magazine/" },
      { id: "other", name: "GeekNews", url: "https://news.hada.io/" },
      { id: "selected", name: "요즘IT", url: "http://yozm.wishket.com/magazine" },
    ];
    expect(uniqueLibrarySites(sites, "selected").map((s) => s.id)).toEqual(["selected", "other"]);
    expect(sites).toHaveLength(3);
  });
  it("preserves distinct channel paths and case-sensitive paths", () => {
    expect(canonicalWidgetUrl("https://youtube.com/@YoungIT")).not.toBe(canonicalWidgetUrl("https://youtube.com/@youngit"));
    expect(uniqueLibrarySites([
      { id: "a", name: "A", url: "https://youtube.com/@a" },
      { id: "b", name: "B", url: "https://youtube.com/@b" },
    ], null)).toHaveLength(2);
  });
  it("classifies video hostnames without misclassifying URL lookalikes", () => {
    expect(siteWidgetFolder("https://www.youtube.com/@openai")).toBe("video");
    expect(siteWidgetFolder("https://www.coupangplay.com/")).toBe("video");
    expect(siteWidgetFolder("https://youtube.com?channel=openai")).toBe("video");
    expect(siteWidgetFolder("https://youtube.com.example.org")).toBe("reading");
  });
});
