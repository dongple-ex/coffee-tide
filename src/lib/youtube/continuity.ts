import { loadLS, saveLS, LS_YOUTUBE_CONTINUITY } from "@/lib/localStore";
import { parseYouTubeVideoId } from "@/lib/youtube/url";
import type { YouTubeContinuitySessionV1, YouTubeVideo, YouTubeContinuityOwner } from "@/lib/types/youtube";

/** 기본 유효 기간: 12시간 (ms) */
export const CONTINUITY_TTL_MS = 12 * 60 * 60 * 1000;

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

/**
 * 로그인 사용자의 식별자(이메일 또는 ID)를 비식별화된 단방향 해시 스코프로 변환합니다.
 * 게스트(미로그인)인 경우 undefined를 반환합니다.
 */
export function computeUserScope(userEmailOrId?: string | null): string | undefined {
  if (!userEmailOrId || typeof userEmailOrId !== "string" || userEmailOrId.trim().length === 0) {
    return undefined;
  }
  const trimmed = userEmailOrId.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash << 5) - hash + trimmed.charCodeAt(i);
    hash |= 0;
  }
  return `usr_${Math.abs(hash).toString(36)}`;
}

export function isValidVideo(video: unknown, expectedVideoId?: string): video is YouTubeVideo {
  if (!video || typeof video !== "object") return false;
  const v = video as Partial<YouTubeVideo>;
  if (typeof v.id !== "string" || !VIDEO_ID_RE.test(v.id)) return false;
  if (typeof v.title !== "string" || v.title.trim().length === 0) return false;
  if (typeof v.url !== "string" || v.url.trim().length === 0) return false;

  // URL에서 추출한 ID가 유효하고 video.id와 일치하는지 확인
  const parsedId = parseYouTubeVideoId(v.url);
  if (!parsedId || parsedId !== v.id) return false;

  // 세션의 videoId가 주어진 경우 video.id와 일치하는지 확인
  if (expectedVideoId && (expectedVideoId !== v.id || !VIDEO_ID_RE.test(expectedVideoId))) {
    return false;
  }

  return true;
}

/**
 * 연속성 세션 객체의 유효성을 검사합니다.
 * 버전 1, 유효한 11자리 video/videoId 및 URL 일치성, 유한한 0 이상의 currentTime, 12시간 만료, userScope 격리 여부 확인
 */
export function isContinuitySessionValid(
  session: unknown,
  expectedUserScope?: string
): session is YouTubeContinuitySessionV1 {
  if (!session || typeof session !== "object") return false;
  const s = session as Partial<YouTubeContinuitySessionV1>;

  if (s.version !== 1) return false;
  if (s.owner !== "contextual" && s.owner !== "bundle") return false;
  if (!s.videoId || typeof s.videoId !== "string" || !VIDEO_ID_RE.test(s.videoId)) return false;
  if (!isValidVideo(s.video, s.videoId)) return false;

  if (typeof s.currentTime !== "number" || !Number.isFinite(s.currentTime) || s.currentTime < 0) {
    return false;
  }

  if (
    s.playerState !== "playing" &&
    s.playerState !== "paused" &&
    s.playerState !== "buffering" &&
    s.playerState !== "ended" &&
    s.playerState !== "unknown"
  ) {
    return false;
  }

  if (typeof s.wasPlayingOnHide !== "boolean") return false;
  if (typeof s.isMini !== "boolean") return false;
  if (typeof s.scrollY !== "number" || !Number.isFinite(s.scrollY) || s.scrollY < 0) return false;
  if (s.activeWidget !== null && typeof s.activeWidget !== "string") return false;
  if (typeof s.chatDraft !== "string") return false;

  if (!s.savedAt || typeof s.savedAt !== "string" || isNaN(Date.parse(s.savedAt))) return false;
  if (!s.expiresAt || typeof s.expiresAt !== "string" || isNaN(Date.parse(s.expiresAt))) return false;

  // 만료 시간 검사
  const expiresTime = new Date(s.expiresAt).getTime();
  if (Date.now() >= expiresTime) return false;

  // 사용자 스코프 엄격 검사 (로그인 상태와 게스트 세션 상호 격리)
  if (expectedUserScope) {
    if (!s.userScope || s.userScope !== expectedUserScope) {
      return false;
    }
  } else {
    // 게스트 상태인 경우 로그인 사용자 세션이 섞이지 않도록 차단
    if (s.userScope) {
      return false;
    }
  }

  return true;
}

export interface SaveContinuitySessionParams {
  owner: YouTubeContinuityOwner;
  video: YouTubeVideo;
  videoId: string;
  currentTime: number;
  playerState: "playing" | "paused" | "buffering" | "ended" | "unknown";
  wasPlayingOnHide: boolean;
  isMini: boolean;
  scrollY?: number;
  activeWidget?: string | null;
  chatDraft?: string;
  userScope?: string;
  ttlMs?: number;
}

/**
 * YouTube 연속성 세션을 로컬 스토리지에 저장합니다.
 */
export function saveYouTubeContinuitySession(params: SaveContinuitySessionParams): boolean {
  if (typeof window === "undefined") return false;
  try {
    const now = new Date();
    const ttl = params.ttlMs ?? CONTINUITY_TTL_MS;
    const expiresAt = new Date(now.getTime() + ttl).toISOString();

    const normalizedCurrentTime =
      typeof params.currentTime === "number" && Number.isFinite(params.currentTime) && params.currentTime >= 0
        ? Math.floor(params.currentTime * 10) / 10
        : 0;

    const normalizedScrollY =
      typeof params.scrollY === "number" && Number.isFinite(params.scrollY) && params.scrollY >= 0
        ? Math.floor(params.scrollY)
        : 0;

    const session: YouTubeContinuitySessionV1 = {
      version: 1,
      owner: params.owner,
      video: params.video,
      videoId: params.videoId,
      currentTime: normalizedCurrentTime,
      playerState: params.playerState,
      wasPlayingOnHide: params.wasPlayingOnHide,
      isMini: params.isMini,
      scrollY: normalizedScrollY,
      activeWidget: params.activeWidget ?? null,
      chatDraft: params.chatDraft || "",
      savedAt: now.toISOString(),
      expiresAt,
      userScope: params.userScope,
    };

    if (!isContinuitySessionValid(session, params.userScope)) {
      return false;
    }

    return saveLS(LS_YOUTUBE_CONTINUITY, session);
  } catch (err) {
    console.warn("[CoffeeTide] Failed to save YouTube continuity session:", err);
    return false;
  }
}

/**
 * 저장된 YouTube 연속성 세션을 불러옵니다.
 * 만료되었거나 비정상인 경우 자동 삭제 후 null을 반환합니다.
 */
export function loadYouTubeContinuitySession(expectedUserScope?: string): YouTubeContinuitySessionV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = loadLS<unknown>(LS_YOUTUBE_CONTINUITY, null);
    if (!raw) return null;

    if (!isContinuitySessionValid(raw, expectedUserScope)) {
      clearYouTubeContinuitySession();
      return null;
    }

    return raw;
  } catch {
    clearYouTubeContinuitySession();
    return null;
  }
}

/**
 * YouTube 연속성 세션을 삭제합니다 (사용자가 플레이어를 닫았거나 로그아웃 시 호출).
 */
export function clearYouTubeContinuitySession(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LS_YOUTUBE_CONTINUITY);
  } catch {
    // 무시
  }
}
