import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Redis } from "@upstash/redis";
import { telegramDb } from "./store";
import { telegramConfig } from "./config";
import { sendTelegram } from "./sender";

const MAX_BODY_BYTES = 8192;
const RECEIPT_TTL_SECONDS = 86400;

type Alert = {
  schema_version: 1;
  event: "approval.pending";
  scenario_id: string;
  proposal_id: string;
  proposal_version: number;
  symbol: string;
  symbol_name: string;
  budget_krw: number;
  reason: string;
  created_at_ms: number;
  expires_at_ms: number;
};

type Receipt = { digest: string; state: "sending" | "sent" | "uncertain" | "expired" };

class AlertError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

function configuration() {
  const secret = process.env.TRADING_ALERT_SECRET?.trim();
  const scenario = process.env.TRADING_ALERT_SCENARIO_ID?.trim();
  const userId = process.env.TRADING_ALERT_USER_ID?.trim();
  const origin = process.env.TRADING_ALERT_APPROVAL_ORIGIN?.trim();
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(secret) || !scenario || !/^[A-Za-z0-9_-]{1,80}$/.test(scenario) ||
      !userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
      !origin || !redisUrl || !redisToken || !telegramConfig()) {
    throw new AlertError(503, "notification_not_configured");
  }
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new AlertError(503, "notification_not_configured");
  }
  return { secret, scenario, userId, origin: url.origin, redisUrl, redisToken };
}

async function readBody(request: Request): Promise<Buffer> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new AlertError(413, "payload_too_large");
  }
  if (!request.body) { throw new AlertError(400, "invalid_payload"); }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) { break; }
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new AlertError(413, "payload_too_large");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

function authenticate(request: Request, body: Buffer, secret: string) {
  const timestamp = request.headers.get("x-trading-timestamp") ?? "";
  const signature = request.headers.get("x-trading-signature") ?? "";
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp) * 1000) > 30_000 ||
      !/^[0-9a-f]{64}$/.test(signature)) {
    throw new AlertError(401, "unauthorized");
  }
  const expected = createHmac("sha256", secret).update(timestamp + ".").update(body).digest();
  if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) { throw new AlertError(401, "unauthorized"); }
}

function parseAlert(body: Buffer, scenario: string): Alert {
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new AlertError(400, "invalid_payload"); }
  const keys = ["schema_version", "event", "scenario_id", "proposal_id", "proposal_version", "symbol", "symbol_name",
    "budget_krw", "reason", "created_at_ms", "expires_at_ms"];
  const integer = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
  const text = (s: unknown, limit: number) => typeof s === "string" && s.trim().length > 0 && s.length <= limit &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(s);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(value, key)) || value.schema_version !== 1 || value.event !== "approval.pending" ||
      value.scenario_id !== scenario || typeof value.proposal_id !== "string" || !/^[0-9a-f]{32}$/.test(value.proposal_id) ||
      !integer(value.proposal_version) || typeof value.symbol !== "string" || !/^[0-9]{6}$/.test(value.symbol) ||
      !text(value.symbol_name, 120) || !text(value.reason, 1000) || !integer(value.budget_krw) ||
      !integer(value.created_at_ms) || !integer(value.expires_at_ms) || value.created_at_ms > Date.now() + 5000 ||
      value.expires_at_ms <= value.created_at_ms || value.expires_at_ms - value.created_at_ms > 60_000) {
    throw new AlertError(400, "invalid_payload");
  }
  return value as Alert;
}

function message(alert: Alert, origin: string) {
  const expires = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(alert.expires_at_ms);
  return `[Trading 모의매수 승인 대기]\n종목: ${alert.symbol_name} (${alert.symbol})\n` +
    `예상 금액: ${alert.budget_krw.toLocaleString("ko-KR")}원 (예상 매수 수수료 포함)\n` +
    `제안 이유: ${alert.reason}\n만료 시각: ${expires} KST\n\n` +
    `승인 화면: ${origin}/\n제안 번호: ${alert.proposal_id}\n` +
    "화면에서 유효한 제안을 확인하고 승인해 주세요. 승인 후 조건을 다시 검사하며, 미승인·만료 시 매수하지 않습니다.";
}

function response(status: number, data: object) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function receiveTradingAlert(request: Request): Promise<Response> {
  try {
    const config = configuration();
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new AlertError(415, "json_required");
    }
    const body = await readBody(request);
    authenticate(request, body, config.secret);
    const alert = parseAlert(body, config.scenario);
    if (alert.expires_at_ms <= Date.now()) { return response(410, { status: "expired" }); }
    const redis = new Redis({ url: config.redisUrl, token: config.redisToken, retry: false,
      enableAutoPipelining: false, signal: () => AbortSignal.timeout(5000) });
    const identity = JSON.stringify([config.userId, alert.scenario_id, alert.proposal_id, alert.proposal_version]);
    const key = "coffeetide:trading-alert:" + createHash("sha256").update(identity).digest("hex");
    const digest = createHash("sha256").update(JSON.stringify([
      alert.symbol, alert.symbol_name, alert.budget_krw, alert.reason, alert.created_at_ms, alert.expires_at_ms,
    ])).digest("hex");
    const db = telegramDb();
    const { data: link, error } = await db.from("telegram_links").select("id,chat_id,telegram_user_id")
      .eq("user_id", config.userId).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
    if (error) { throw new AlertError(503, "link_storage_unavailable"); }
    if (!link || !/^[1-9][0-9]*$/.test(link.chat_id) || link.chat_id !== link.telegram_user_id) {
      throw new AlertError(409, "telegram_not_linked");
    }
    const claimed = await redis.set(key, { digest, state: "sending" } satisfies Receipt,
      { nx: true, ex: RECEIPT_TTL_SECONDS });
    if (claimed !== "OK") {
      const prior = await redis.get<Receipt>(key);
      if (!prior || prior.digest !== digest) { throw new AlertError(409, "notification_conflict"); }
      if (prior.state === "sent") { return response(200, { status: "already_sent" }); }
      if (prior.state === "expired") { return response(410, { status: "expired" }); }
      return response(202, { status: "delivery_unknown" });
    }
    try {
      const { data: current, error: linkError } = await db.from("telegram_links").select("id")
        .eq("user_id", config.userId).eq("id", link.id).eq("chat_id", link.chat_id)
        .abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      if (linkError || !current) { throw new Error("Telegram link changed"); }
      if (alert.expires_at_ms <= Date.now()) {
        await redis.set(key, { digest, state: "expired" } satisfies Receipt, { xx: true, keepTtl: true });
        return response(410, { status: "expired" });
      }
      await sendTelegram(link.chat_id, message(alert, config.origin));
      const saved = await redis.set(key, { digest, state: "sent" } satisfies Receipt, { xx: true, keepTtl: true });
      if (saved !== "OK") { throw new Error("Notification receipt missing"); }
      return response(200, { status: "sent" });
    } catch {
      try {
        await redis.set(key, { digest, state: "uncertain" } satisfies Receipt, { xx: true, keepTtl: true });
      } catch {
        console.error("[coffeeTide] Trading notification receipt unavailable; automatic resend blocked");
      }
      return response(202, { status: "delivery_unknown" });
    }
  } catch (error) {
    if (error instanceof AlertError) { return response(error.status, { error: error.message }); }
    return response(503, { error: "notification_unavailable" });
  }
}
