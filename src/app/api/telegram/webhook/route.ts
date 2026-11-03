import { NextResponse } from "next/server";
import { validWebhookSecret } from "@/lib/telegram/config";
import { telegramDb, tokenHash, type TelegramEvent } from "@/lib/telegram/store";
import { sendTelegram } from "@/lib/telegram/sender";
import { processTelegramEvent } from "@/lib/telegram/worker";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!validWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > 32_768) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let body;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 32_768) { return NextResponse.json({ error: "Payload too large" }, { status: 413 }); }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = body?.message;
  if (!Number.isSafeInteger(body?.update_id) || body.update_id < 0 || message?.chat?.type !== "private" ||
      !Number.isSafeInteger(message?.from?.id) || message.from.id <= 0 || message.from.is_bot === true ||
      message.chat.id !== message.from.id || typeof message.text !== "string") {
    return NextResponse.json({ ok: true });
  }
  const text = message.text.trim();
  if (!text || text.length > 2000) { return NextResponse.json({ ok: true }); }
  const chat = String(message.chat.id);
  const actor = String(message.from.id);
  try {
    const start = text.match(/^\/start\s+([a-zA-Z0-9_-]{43})$/);
    if (start) {
      const { data, error } = await telegramDb().rpc("telegram_propose_link", {
        p_hash: tokenHash(start[1]), p_actor: actor, p_chat: chat,
        p_name: String(message.from.username ? `@${message.from.username}` : message.from.first_name ?? "Telegram 사용자").slice(0, 80),
      });
      if (error) { throw new Error("Telegram proposal failed"); }
      await sendTelegram(chat, data === true ? "CoffeeTide 설정 화면으로 돌아가 이 Telegram 계정을 확인하고 연결을 완료해 주세요."
        : "연결 링크가 만료되었거나 사용할 수 없습니다. CoffeeTide 설정에서 다시 시작해 주세요.");
      return NextResponse.json({ ok: true });
    }
    const { data, error } = await telegramDb().rpc("telegram_claim_event", {
      p_update: body.update_id, p_actor: actor, p_chat: chat, p_question: text,
    });
    if (error || !data) { throw new Error("Telegram claim failed"); }
    if (data.state === "busy") { return NextResponse.json({ error: "Busy" }, { status: 503 }); }
    if (data.state === "unlinked") {
      await sendTelegram(chat, "CoffeeTide 설정의 Telegram 연결을 먼저 완료해 주세요.");
    } else if (data.state === "claimed") {
      await processTelegramEvent(data as TelegramEvent);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Telegram processing unavailable" }, { status: 503 });
  }
}
