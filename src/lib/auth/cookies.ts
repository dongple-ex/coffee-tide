// 라우트 핸들러 공용 세션 읽기/쓰기 헬퍼
//
// H2(쿠키 청킹): 브라우저는 쿠키 1개당 이름+값 합계 ~4KB가 한계다. Outlook 액세스
// 토큰은 2KB를 넘을 수 있어 Outlook+Google 동시 연동 시 암호화 페이로드가 한계를
// 넘는다. NextAuth와 같은 방식으로 tp_session(첫 조각) + tp_session.1, .2 … 로
// 분할 저장한다. 첫 조각이 기존 쿠키 이름 그대로라 proxy.ts의 존재 확인과 기존
// 단일 쿠키 세션(하위호환)은 그대로 동작한다.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_EXPIRY_COOKIE,
  SessionData,
  decryptSession,
  encryptSession,
  expiryCookieValue,
  sessionCookieOptions,
} from "./session";

// 4KB 한계에서 쿠키 이름·속성(Path/Expires/HttpOnly…) 몫을 뺀 안전값
const CHUNK_SIZE = 3500;
// 비정상 비대 방지 상한 — 5조각(≈17.5KB)이면 전 채널 동시 연동도 넉넉하다
export const MAX_SESSION_CHUNKS = 5;

function chunkName(index: number): string {
  return index === 0 ? SESSION_COOKIE : `${SESSION_COOKIE}.${index}`;
}

/** 암호화 페이로드를 쿠키 크기 한계에 맞게 분할 (순수 함수 — 검증용 export) */
export function splitSessionValue(value: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  return chunks.length > 0 ? chunks : [""];
}

export async function readSession(): Promise<SessionData | null> {
  const jar = await cookies();
  let raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  // 이어지는 조각을 순서대로 연결 — 중간 조각이 빠졌으면 복호화가 실패해 null로 수렴
  for (let i = 1; i < MAX_SESSION_CHUNKS; i++) {
    const part = jar.get(chunkName(i))?.value;
    if (!part) break;
    raw += part;
  }
  return decryptSession(raw);
}

export function writeSession<T extends NextResponse>(res: T, session: SessionData): T {
  const chunks = splitSessionValue(encryptSession(session));
  if (chunks.length > MAX_SESSION_CHUNKS) {
    // 상한 초과 저장은 어차피 읽기에서 복호화가 깨진다 — 조용히 잘리기 전에 명시적으로 실패
    throw new Error(
      `세션이 쿠키 상한(${MAX_SESSION_CHUNKS}조각)을 초과했습니다 — 연동 토큰 정리가 필요합니다`
    );
  }
  chunks.forEach((chunk, i) => {
    res.cookies.set(chunkName(i), chunk, sessionCookieOptions());
  });
  // 세션이 줄어든 경우 남아 있던 옛 조각이 이어붙어 복호화를 깨뜨리지 않도록 잔여 조각 제거
  for (let i = chunks.length; i < MAX_SESSION_CHUNKS; i++) {
    res.cookies.set(chunkName(i), "", { path: "/", maxAge: 0 });
  }
  res.cookies.set(SESSION_EXPIRY_COOKIE, expiryCookieValue(), {
    ...sessionCookieOptions(),
    httpOnly: false,
  });
  return res;
}

export function clearSession<T extends NextResponse>(res: T): T {
  for (let i = 0; i < MAX_SESSION_CHUNKS; i++) {
    res.cookies.set(chunkName(i), "", { path: "/", maxAge: 0 });
  }
  res.cookies.set(SESSION_EXPIRY_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
