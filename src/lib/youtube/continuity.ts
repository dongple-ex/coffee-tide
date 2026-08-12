import { loadLS, saveLS, LS_YOUTUBE_CONTINUITY } from "@/lib/localStore";
import type { YouTubeContinuitySessionV1, YouTubeVideo, YouTubeContinuityOwner } from "@/lib/types/youtube";

/** 기본 유효 기간: 12시간 (ms) */
export const CONTINUITY_TTL_MS = 12 * 60 * 60 * 1000;

function isValidVideo(video: unknown): video is YouTubeVideo {
  if (!video || typeof video !== "object") return false;
  const v = video as Partial<YouTubeVideo>;
  return (
    typeof v.id === "string" &&
    v.id.trim().length > 0 &&
    typeof v.title === "string" &&
    v.title.trim().length > 0 &&
    typeof v.url === "string" &&
    v.url.trim().length > 0
  );
}

/**
 * 연속성 세션 객체의 유효성을 검사합니다.
 * 버전 1, 유효한 video/videoId, 유한한 0 이상의 currentTime, 12시간 만료 여부 확인
 */
export function isContinuitySessionValid(
  session: unknown,
  expectedUserScope?: string
): session is YouTubeContinuitySessionV1 {
  if (!session || typeof session !== "object") return false;
  const s = session as Partial<YouTubeContinuitySessionV1>;

  if (s.version !== 1) return false;
  if (s.owner !== "contextual" && s.owner !== "bundle") return false;
  if (!s.videoId || typeof s.videoId !== "string" || s.videoId.trim().length === 0) return false;
  if (!isValidVideo(s.video)) return false;

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

  // 사용자 스코프 검사 (스코프가 지정된 경우 일치 여부 확인)
  if (expectedUserScope && s.userScope && s.userScope !== expectedUserScope) {
    return false;
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
