import { describe, expect, it } from "vitest";
import { youtubeEmbedUrl, youtubePiPUrl, youtubePlayerMessage, youtubeWatchUrl, YOUTUBE_PIP_MESSAGE } from "./embed";

describe("YouTube PiP identity and playback", () => {
  const origin = "https://coffee-tide.dongple.kr";
  const main = {} as Window;
  const pip = {} as Window;
  it("opens the original video at the current position without unrelated query data", () => {
    const url = new URL(youtubeWatchUrl("M7lc1UVf-VE", 132.7));
    expect(url.origin).toBe("https://www.youtube.com");
    expect(Object.fromEntries(url.searchParams)).toEqual({ v: "M7lc1UVf-VE", t: "132s" });
    expect(new URL(youtubeWatchUrl("M7lc1UVf-VE", -1)).searchParams.has("t")).toBe(false);
  });
  it("identifies the embedding site and carries the playback snapshot", () => {
    const settings = { start: 123.9, autoplay: false, muted: true, rate: 1.5 };
    const direct = new URL(youtubeEmbedUrl("M7lc1UVf-VE", origin, settings));
    expect(direct.searchParams.get("origin")).toBe(origin);
    expect(direct.searchParams.get("start")).toBe("123");
    expect(direct.searchParams.get("autoplay")).toBe("0");
    const hosted = new URL(youtubePiPUrl("M7lc1UVf-VE", settings), origin);
    expect(hosted.origin).toBe(origin);
    expect(hosted.pathname).toBe("/youtube/pip");
    expect(Object.fromEntries(hosted.searchParams)).toEqual({ v: "M7lc1UVf-VE", start: "123", autoplay: "0", muted: "1", rate: "1.5" });
  });
  it("accepts time and pause events from the actual PiP frame", () => {
    const payload = { event: "infoDelivery", info: { currentTime: 221, playerState: 2 } };
    expect(youtubePlayerMessage({ source: pip, origin, data: { type: YOUTUBE_PIP_MESSAGE, payload } }, origin, null, pip)).toEqual(payload);
    expect(youtubePlayerMessage({ source: main, origin: "https://www.youtube-nocookie.com", data: JSON.stringify(payload) }, origin, main, null)).toEqual(payload);
  });
  it("ignores other windows, origins, malformed messages and a closed player", () => {
    const data = { type: YOUTUBE_PIP_MESSAGE, payload: { event: "onReady" } };
    for (const event of [
      { source: {} as Window, origin, data },
      { source: pip, origin: "https://evil.test", data },
      { source: pip, origin, data: { event: "onReady" } },
      { source: main, origin: "https://www.youtube.com", data: "bad JSON" },
    ]) expect(youtubePlayerMessage(event, origin, main, pip)).toBeNull();
    expect(youtubePlayerMessage({ source: main, origin: "https://www.youtube.com", data: {} }, origin, null, null)).toBeNull();
  });
});
