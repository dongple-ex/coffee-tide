import "server-only";
import { telegramConfig } from "./config";

export class TelegramSendError extends Error {
  constructor(public readonly blocked: boolean) { super("Telegram message delivery failed"); }
}

export async function sendTelegram(chatId: string, text: string): Promise<void> {
  const config = telegramConfig();
  if (!config) { throw new Error("Telegram is not configured"); }
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(10_000), redirect: "error",
    });
  } catch {
    throw new TelegramSendError(false);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok !== true) { throw new TelegramSendError(response.status === 403); }
}
