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

export function runContinuityTests() {
  console.log("=== YouTube Continuity Test Suite Starting ===");
  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      mockLocalStorage.clear();
      fn();
      passed++;
      console.log(`  ✓ [Pass] ${name}`);
    } catch (err) {
      console.error(`  ✗ [Fail] ${name}:`, err);
      throw err;
    }
  }

  // 1. 세션 직렬화·역직렬화
  test("1. 세션 직렬화 및 역직렬화 (Save & Load)", () => {
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
    if (!saved) throw new Error("saveYouTubeContinuitySession failed");

    const loaded = loadYouTubeContinuitySession();
    if (!loaded) throw new Error("loadYouTubeContinuitySession returned null");
    if (loaded.videoId !== "dQw4w9WgXcQ") throw new Error("videoId mismatch");
    if (loaded.currentTime !== 45.8) throw new Error(`currentTime mismatch: ${loaded.currentTime}`);
    if (loaded.chatDraft !== "질문 초안입니다") throw new Error("chatDraft mismatch");
    if (loaded.scrollY !== 200) throw new Error("scrollY mismatch");
    if (loaded.activeWidget !== "youtube") throw new Error("activeWidget mismatch");
  });

  // 2. 12시간 만료
  test("2. 12시간 유효기간 만료 검사 (TTL Expiration)", () => {
    const video = createSampleVideo();
    // 만료된 세션 생성
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
    if (isContinuitySessionValid(expiredSession)) {
      throw new Error("Expired session was validated as true");
    }

    mockLocalStorage.setItem("ct_youtube_continuity_v1", JSON.stringify(expiredSession));
    const loaded = loadYouTubeContinuitySession();
    if (loaded !== null) {
      throw new Error("Expired session was not purged on load");
    }
  });

  // 3. 잘못된 ID와 URL 거부
  test("3. 잘못된 11자리 ID 및 비정상 URL 거부", () => {
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
      if (isValid) throw new Error(`Invalid videoId "${badId}" was accepted`);
    }

    // URL과 videoId 불일치 케이스
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
    if (isMismatchedValid) throw new Error("Mismatched video URL & ID was accepted");
  });

  // 4. 사용자 범위(userScope) 누락 및 불일치 거부
  test("4. 사용자 범위(userScope) 누락/불일치 상호 격리 검사", () => {
    const userAScope = computeUserScope("userA@example.com");
    const userBScope = computeUserScope("userB@example.com");
    if (!userAScope || !userBScope || userAScope === userBScope) {
      throw new Error("computeUserScope failed to produce unique non-empty hash");
    }

    const video = createSampleVideo();
    // User A가 세션 저장
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

    // 1) User A 본인은 조회 성공
    const loadedA = loadYouTubeContinuitySession(userAScope);
    if (!loadedA) throw new Error("User A failed to load their own session");

    // 2) User B는 조회 실패 (격리)
    const loadedB = loadYouTubeContinuitySession(userBScope);
    if (loadedB !== null) throw new Error("User B was able to access User A's session");

    // 3) 게스트(userScope 미제공)는 로그인 세션 접근 불가
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
    const loadedGuest = loadYouTubeContinuitySession(undefined);
    if (loadedGuest !== null) throw new Error("Guest was able to access User A's logged-in session");

    // 4) 게스트가 저장한 세션은 로그인 유저에게 복원되지 않음
    saveYouTubeContinuitySession({
      owner: "bundle",
      video,
      videoId: video.id,
      currentTime: 15,
      playerState: "paused",
      wasPlayingOnHide: false,
      isMini: true,
      userScope: undefined,
    });
    const loadedAFromGuest = loadYouTubeContinuitySession(userAScope);
    if (loadedAFromGuest !== null) throw new Error("User A loaded guest session incorrectly");
  });

  // 5. 재생 중 상태 복원 플래그
  test("5. 재생 중 상태 복원 플래그 (playerState=playing, wasPlayingOnHide=true)", () => {
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
    if (!session) throw new Error("Session load failed");
    if (session.playerState !== "playing" || session.wasPlayingOnHide !== true) {
      throw new Error("Playing state flags not preserved correctly");
    }
  });

  // 6. 일시정지 상태 복원 시 자동재생 금지 플래그
  test("6. 일시정지 상태 복원 플래그 (playerState=paused, wasPlayingOnHide=false)", () => {
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
    if (!session) throw new Error("Session load failed");
    if (session.playerState !== "paused" || session.wasPlayingOnHide !== false) {
      throw new Error("Paused state flags not preserved correctly");
    }
  });

  // 7. isMini 상태 복원
  test("7. isMini 상태 복원 (true / false)", () => {
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
    if (!sessionMini || sessionMini.isMini !== true) {
      throw new Error("isMini: true was not restored");
    }

    saveYouTubeContinuitySession({
      owner: "contextual",
      video,
      videoId: video.id,
      currentTime: 20,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: false,
    });
    const sessionFull = loadYouTubeContinuitySession();
    if (!sessionFull || sessionFull.isMini !== false) {
      throw new Error("isMini: false was not restored");
    }
  });

  // 8. contextual / bundle 소유자별 복원
  test("8. contextual / bundle 소유자 구분 복원", () => {
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
    if (!contextualSession || contextualSession.owner !== "contextual") {
      throw new Error("owner: contextual was not preserved");
    }

    saveYouTubeContinuitySession({
      owner: "bundle",
      video,
      videoId: video.id,
      currentTime: 10,
      playerState: "playing",
      wasPlayingOnHide: true,
      isMini: false,
    });
    const bundleSession = loadYouTubeContinuitySession();
    if (!bundleSession || bundleSession.owner !== "bundle") {
      throw new Error("owner: bundle was not preserved");
    }
  });

  // 9. 명시적 닫기 후 세션 삭제
  test("9. 명시적 닫기 후 세션 삭제 (clearYouTubeContinuitySession)", () => {
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
    if (!loadYouTubeContinuitySession()) {
      throw new Error("Session should exist before clear");
    }

    clearYouTubeContinuitySession();
    if (loadYouTubeContinuitySession() !== null) {
      throw new Error("Session still exists after clearYouTubeContinuitySession");
    }
  });

  console.log(`\n=== All ${passed}/${total} Tests Passed Successfully! ===`);
}

// 직접 실행 시 테스트 구동
if (typeof require !== "undefined" && require.main === module) {
  runContinuityTests();
}
