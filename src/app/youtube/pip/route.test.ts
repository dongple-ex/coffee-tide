import { runInNewContext } from "node:vm";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const origin = "https://coffee-tide.dongple.kr";
const request = (query: string) => new NextRequest(`${origin}/youtube/pip?${query}`);

describe("hosted YouTube PiP page", () => {
  it("serves an HTTP document with a referrer and same-origin frame restrictions", async () => {
    const response = GET(request("v=M7lc1UVf-VE&start=142&autoplay=0&muted=1&rate=1.5"));
    expect(response.status).toBe(200);
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const html = await response.text();
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"');
    expect(html).toContain("origin=https%3A%2F%2Fcoffee-tide.dongple.kr");
    expect(html).toContain("start=142");
  });
  it("rejects URL/script injection and clamps invalid playback options", async () => {
    expect(GET(request("v=%22%3E%3Cscript%3Eevil%3C/script%3E")).status).toBe(400);
    expect(GET(request("v=https://evil.test")).status).toBe(400);
    const html = await GET(request("v=M7lc1UVf-VE&start=Infinity&rate=eval&autoplay=true")).text();
    expect(html).toContain('"start":0,"autoplay":false,"muted":false,"rate":1');
  });
  it("relays commands and current playback state through the PiP opener only", async () => {
    // 모의 API로 페이지 스크립트를 실행한다. YouTube 실제 재생 검증과는 구분한다.
    const html = await GET(request("v=M7lc1UVf-VE&start=142&autoplay=0&muted=1&rate=1.5")).text();
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const controller = { postMessage: vi.fn() };
    const frame = { src: "https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?start=142" };
    const listeners = new Map<string, (event?: unknown) => void>();
    const player = {
      getCurrentTime: vi.fn(() => 221), getPlayerState: vi.fn(() => 2),
      getDuration: vi.fn(() => 600), isMuted: vi.fn(() => true), getPlaybackRate: vi.fn(() => 1.5),
      setPlaybackRate: vi.fn(), mute: vi.fn(), playVideo: vi.fn(), pauseVideo: vi.fn(), seekTo: vi.fn(),
    };
    let events: { onReady: () => void; onStateChange: () => void; onError: (event: { data: number }) => void };
    const window = { parent: { opener: controller }, onYouTubeIframeAPIReady: () => {}, addEventListener: (name: string, handler: (event?: unknown) => void) => listeners.set(name, handler) };
    const interval = vi.fn();
    runInNewContext(script, {
      window, document: { getElementById: () => frame }, location: { origin }, URL, Set,
      setInterval: (fn: () => void) => { interval.mockImplementation(fn); return 1; }, clearInterval: vi.fn(),
      YT: { Player: function (_id: string, options: { events: typeof events }) { events = options.events; return player; } },
    });
    window.onYouTubeIframeAPIReady();
    events!.onReady();
    expect(new URL(frame.src).searchParams.get("origin")).toBe(origin);
    expect(player.mute).toHaveBeenCalled(); expect(player.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(player.playVideo).not.toHaveBeenCalled();
    expect(player.pauseVideo).toHaveBeenCalled();
    const command = { event: "command", func: "seekTo", args: [300, true] };
    listeners.get("message")!({ origin, source: controller, data: JSON.stringify(command) });
    expect(player.seekTo).toHaveBeenCalledWith(300, true);
    player.seekTo.mockClear();
    listeners.get("message")!({ origin, source: {}, data: command });
    listeners.get("message")!({ origin: "https://evil.test", source: controller, data: command });
    expect(player.seekTo).not.toHaveBeenCalled();
    interval();
    expect(controller.postMessage).toHaveBeenCalledWith({ type: "coffeetide:youtube-pip", payload: { event: "infoDelivery", info: { currentTime: 221, playerState: 2, duration: 600, muted: true, playbackRate: 1.5 } } }, origin);
    events!.onError({ data: 153 });
    expect(controller.postMessage).toHaveBeenCalledWith({ type: "coffeetide:youtube-pip", payload: { event: "onError", info: 153 } }, origin);
  });
});
