import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./config", () => ({ telegramConfig: () => ({ token: "unit-test-placeholder" }) }));
import { sendTelegram, TelegramSendError } from "./sender";
afterEach(() => { vi.unstubAllGlobals(); });
it("sends plain bounded text and disables previews", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetcher);
  await sendTelegram("100", "x".repeat(5000));
  const payload = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(payload.text).toHaveLength(4000);
  expect(payload.parse_mode).toBeUndefined();
  expect(payload.link_preview_options.is_disabled).toBe(true);
});
it("redacts upstream errors and distinguishes a blocked bot", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ description: "sensitive" }, { status: 403 })));
  await expect(sendTelegram("100", "hello")).rejects.toMatchObject({ blocked: true, message: "Telegram message delivery failed" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("token in URL")));
  await expect(sendTelegram("100", "hello")).rejects.toBeInstanceOf(TelegramSendError);
});
