import { describe, it, expect, beforeEach } from "vitest";
import {
  isContinuitySessionValid,
  saveYouTubeContinuitySession,
  loadYouTubeContinuitySession,
  clearYouTubeContinuitySession,
  computeUserScope,
  CONTINUITY_TTL_MS,
} from "./continuity";
import type { YouTubeContinuitySessionV1, YouTubeVideo } from "../types/youtube";

// Mock localStorage for Node environment test
const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => storage.set(key, val),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

// Global polyfill for testing in Node
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: mockLocalStorage,
    writable: true,
  });
}
if (typeof globalThis.window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: mockLocalStorage,
      scrollY: 120,
    },
    writable: true,
  });
}

function createSampleVideo(overrides?: Partial<YouTubeVideo>): YouTubeVideo {
  return {
    id: "dQw4w9WgXcQ",
    title: "Test Video Title",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    publishedAt: "2026-01-01T00:00:00Z",
    channelTitle: "Test Channel",
    channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
    ...overrides,
  };
}

describe("YouTube Continuity Test Suite", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it("1. 세션 직렬화 및 역직렬화 (Save & Load)", () => {
    const video = createSampleVideo();
    const saved = saveYouTubeContinuitySession({
      owner: "bundle",
      video,
      videoId: video.id,
      currentTime: 45.8,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: false,
      scrollY: 200,
      activeWidget: "youtube",
      chatDraft: "질문 초안입니다",
    });
    expect(saved).toBe(true);

    const loaded = loadYouTubeContinuitySession();
    expect(loaded).not.toBeNull();
    expect(loaded?.videoId).toBe("dQw4w9WgXcQ");
    expect(loaded?.currentTime).toBe(45.8);
    expect(loaded?.chatDraft).toBe("질문 초안입니다");
    expect(loaded?.scrollY).toBe(200);
    expect(loaded?.activeWidget).toBe("youtube");
  });

  it("2. 12시간 유효기간 만료 검사 (TTL Expiration)", () => {
    const video = createSampleVideo();
    const expiredSession: YouTubeContinuitySessionV1 = {
      version: 1,
      owner: "bundle",
      video,
      videoId: video.id,
      currentTime: 10,
      playerState: "paused",
      wasPlayingOnHide: false,
      isMini: false,
      scrollY: 0,
      activeWidget: "youtube",
      chatDraft: "",
      savedAt: new Date(Date.now() - (CONTINUITY_TTL_MS + 5000)).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    expect(isContinuitySessionValid(expiredSession)).toBe(false);

    mockLocalStorage.setItem("ct_youtube_continuity_v1", JSON.stringify(expiredSession));
    const loaded = loadYouTubeContinuitySession();
    expect(loaded).toBeNull();
  });

  it("3. 잘못된 11자리 ID 및 비정상 URL 거부", () => {
    const invalidIds = ["short", "toolongid123456", "invalid@char!", ""];
    for (const badId of invalidIds) {
      const badVideo = createSampleVideo({ id: badId, url: `https://www.youtube.com/watch?v=${badId}` });
      const isValid = isContinuitySessionValid({
        version: 1,
        owner: "bundle",
        video: badVideo,
        videoId: badId,
        currentTime: 10,
        playerState: "playing",
        wasPlayingOnHide: true,
        isMini: false,
        scrollY: 0,
        activeWidget: null,
        chatDraft: "",
        savedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      });
      expect(isValid).toBe(false);
    }

    const mismatchedVideo = createSampleVideo({
      id: "dQw4w9WgXcQ",
      url: "https://www.youtube.com/watch?v=xxxxxxxxxxx",
    });
    const isMismatchedValid = isContinuitySessionValid({
      version: 1,
      owner: "bundle",
      video: mismatchedVideo,
      videoId: "dQw4w9WgXcQ",
      currentTime: 10,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: false,
      scrollY: 0,
      activeWidget: null,
      chatDraft: "",
      savedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10000).toISOString(),
    });
    expect(isMismatchedValid).toBe(false);
  });

  it("4. 사용자 범위(userScope) 누락/불일치 상호 격리 검사", () => {
    const userAScope = computeUserScope("userA@example.com");
    const userBScope = computeUserScope("userB@example.com");
    expect(userAScope).toBeTruthy();
    expect(userBScope).toBeTruthy();
    expect(userAScope).not.toBe(userBScope);

    const video = createSampleVideo();
    saveYouTubeContinuitySession({
      owner: "bundle",
      video,
      videoId: video.id,
      currentTime: 30,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: false,
      userScope: userAScope,
    });

    const loadedA = loadYouTubeContinuitySession(userAScope);
    expect(loadedA).not.toBeNull();

    const loadedB = loadYouTubeContinuitySession(userBScope);
    expect(loadedB).toBeNull();

    const loadedGuest = loadYouTubeContinuitySession(undefined);
    expect(loadedGuest).toBeNull();
  });

  it("5. 재생 중 상태 복원 플래그", () => {
    const video = createSampleVideo();
    saveYouTubeContinuitySession({
      owner: "bundle",
      video,
      videoId: video.id,
      currentTime: 50,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: false,
    });
    const session = loadYouTubeContinuitySession();
    expect(session?.playerState).toBe("playing");
    expect(session?.wasPlayingOnHide).toBe(true);
  });

  it("6. 일시정지 상태 복원 플래그", () => {
    const video = createSampleVideo();
    saveYouTubeContinuitySession({
      owner: "bundle",
      video,
      videoId: video.id,
      currentTime: 80,
      playerState: "paused",
      wasPlayingOnHide: false,
      isMini: false,
    });
    const session = loadYouTubeContinuitySession();
    expect(session?.playerState).toBe("paused");
    expect(session?.wasPlayingOnHide).toBe(false);
  });

  it("7. isMini 상태 복원", () => {
    const video = createSampleVideo();
    saveYouTubeContinuitySession({
      owner: "contextual",
      video,
      videoId: video.id,
      currentTime: 20,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: true,
    });
    const sessionMini = loadYouTubeContinuitySession();
    expect(sessionMini?.isMini).toBe(true);
  });

  it("8. contextual / bundle 소유자 구분 복원", () => {
    const video = createSampleVideo();
    saveYouTubeContinuitySession({
      owner: "contextual",
      video,
      videoId: video.id,
      currentTime: 10,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: false,
    });
    const contextualSession = loadYouTubeContinuitySession();
    expect(contextualSession?.owner).toBe("contextual");
  });

  it("9. 명시적 닫기 후 세션 삭제 (clearYouTubeContinuitySession)", () => {
    const video = createSampleVideo();
    saveYouTubeContinuitySession({
      owner: "bundle",
      video,
      videoId: video.id,
      currentTime: 10,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: false,
    });
    expect(loadYouTubeContinuitySession()).not.toBeNull();

    clearYouTubeContinuitySession();
    expect(loadYouTubeContinuitySession()).toBeNull();
  });
});
