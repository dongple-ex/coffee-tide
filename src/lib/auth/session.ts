// 세션 쿠키 암호화/복호화 — doc/as-built-reference.md §2.
// tp_session: AES-256-GCM 암호화 페이로드(HttpOnly), tp_session_expiry: proxy 만료 판독용 평문 보조 쿠키.
// 쿠키 이름은 cookieNames.ts가 단일 정의처 (proxy.ts와 공유 — tp_ 접두사 유지 사유도 그곳 참조).
// 백로그 B1 반영: 프로덕션에서 SESSION_ENCRYPTION_SECRET 미설정이면 부팅 실패.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export { SESSION_COOKIE, SESSION_EXPIRY_COOKIE, OAUTH_STATE_COOKIE } from "./cookieNames";
export const SESSION_MAX_AGE_SEC = 7 * 24 * 3600; // 7일 (백로그 B2: 롤링 연장은 후속)

export interface SessionData {
  userEmail: string;
  createdAt: string;
  // Outlook (Microsoft Graph)
  outlookToken?: string;
  outlookRefreshToken?: string;
  outlookTokenExpiry?: number; // epoch ms
  outlookEmail?: string;
  // Google (Gmail·Calendar·Drive readonly)
  googleToken?: string;
  googleRefreshToken?: string;
  googleTokenExpiry?: number;
  googleEmail?: string;
  // Notion
  notionToken?: string;
  notionDbId?: string;
  // 로컬 파일 기반 연동 (데스크톱 전용 — doc/8-mobile_strategy.md §3)
  obsidianVaultPath?: string;
  localDocPaths?: string[]; // 로컬 문서는 여러 폴더 지원 (최대 5개)
  llmArtifactsPath?: string;
}

const DEV_FALLBACK_SECRET = "coffeetide-dev-only-secret-do-not-use-in-prod";

function getEncryptionKey(): Buffer {
  const secret = process.env.SESSION_ENCRYPTION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // B1: 알려진 키로 프로덕션 세션이 암호화되는 사고를 원천 차단
      throw new Error(
        "SESSION_ENCRYPTION_SECRET is required in production. See .env.example."
      );
    }
    console.warn("[coffeeTide] SESSION_ENCRYPTION_SECRET 미설정 — 개발용 임시 키 사용 중");
    return createHash("sha256").update(DEV_FALLBACK_SECRET).digest();
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSession(data: SessionData): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptSession(token: string): SessionData | null {
  try {
    const buf = Buffer.from(token, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const key = getEncryptionKey();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as SessionData;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function expiryCookieValue(): string {
  return String(Date.now() + SESSION_MAX_AGE_SEC * 1000);
}
