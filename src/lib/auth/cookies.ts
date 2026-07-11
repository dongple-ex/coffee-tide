// 라우트 핸들러 공용 세션 읽기/쓰기 헬퍼

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

export async function readSession(): Promise<SessionData | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return decryptSession(raw);
}

export function writeSession<T extends NextResponse>(res: T, session: SessionData): T {
  res.cookies.set(SESSION_COOKIE, encryptSession(session), sessionCookieOptions());
  res.cookies.set(SESSION_EXPIRY_COOKIE, expiryCookieValue(), {
    ...sessionCookieOptions(),
    httpOnly: false,
  });
  return res;
}

export function clearSession<T extends NextResponse>(res: T): T {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(SESSION_EXPIRY_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
