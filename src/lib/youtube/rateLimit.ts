import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "../auth/cookieNames";

const windows = new Map<string, { count: number; startedAt: number }>();

export function isYouTubeRequestRateLimited(
  req: NextRequest,
  bucket: string,
  maxRequests: number,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const scope = createHash("sha256").update(session || forwarded || "unknown").digest("hex");
  const key = `${bucket}:${scope}`;
  const current = windows.get(key);

  if (!current || now - current.startedAt >= windowMs) {
    windows.set(key, { count: 1, startedAt: now });
  } else {
    current.count += 1;
    if (current.count > maxRequests) return true;
  }

  if (windows.size > 1_000) {
    for (const [candidate, value] of windows) {
      if (now - value.startedAt >= windowMs) windows.delete(candidate);
    }
  }
  return false;
}
