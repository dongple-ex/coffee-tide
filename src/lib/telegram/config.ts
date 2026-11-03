import "server-only";
import { timingSafeEqual, createHash } from "node:crypto";

export function telegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const origin = process.env.TELEGRAM_APP_ORIGIN?.trim();
  if (!token || !username || !/^[a-zA-Z0-9_]{5,32}$/.test(username) || !secret || !/^[a-zA-Z0-9_-]{32,256}$/.test(secret) || !origin) {
    return null;
  }
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return { token, username, secret, origin: url.origin };
  } catch {
    return null;
  }
}

export function validWebhookSecret(value: string | null): boolean {
  const config = telegramConfig();
  if (!config || !value) { return false; }
  const actual = createHash("sha256").update(value).digest();
  const expected = createHash("sha256").update(config.secret).digest();
  return timingSafeEqual(actual, expected);
}

export function sameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}
