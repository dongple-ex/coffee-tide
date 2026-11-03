import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ secret: vi.fn(), rpc: vi.fn(), send: vi.fn(), process: vi.fn() }));
vi.mock("@/lib/telegram/config", () => ({ validWebhookSecret: mocks.secret }));
vi.mock("@/lib/telegram/store", () => ({ telegramDb: () => ({ rpc: mocks.rpc }), tokenHash: (s: string) => `hashed-${s}` }));
vi.mock("@/lib/telegram/sender", () => ({ sendTelegram: mocks.send }));
vi.mock("@/lib/telegram/worker", () => ({ processTelegramEvent: mocks.process }));
import { POST } from "./route";

const update = { update_id: 12, message: { from: { id: 45, first_name: "Tester" }, chat: { id: 45, type: "private" }, text: "안녕" } };
const request = (body: unknown = update) => new Request("https://example.com/api/telegram/webhook", {
  method: "POST", headers: { "x-telegram-bot-api-secret-token": "secret" }, body: JSON.stringify(body),
});

beforeEach(() => { vi.resetAllMocks(); mocks.secret.mockReturnValue(true); });

describe("Telegram webhook", () => {
  it("rejects forged requests before storage or execution", async () => {
    mocks.secret.mockReturnValue(false);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("ignores group chats, edited messages and bot senders", async () => {
    for (const body of [ { ...update, message: { ...update.message, chat: { id: -5, type: "group" } } },
      { update_id: 12, edited_message: update.message },
      { ...update, message: { ...update.message, from: { id: 45, is_bot: true } } } ]) {
      expect((await POST(request(body))).status).toBe(200);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("stages a hashed link token without automatically confirming the owner", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await POST(request({ ...update, message: { ...update.message, text: `/start ${"a".repeat(43)}` } }));
    expect(mocks.rpc).toHaveBeenCalledWith("telegram_propose_link", expect.objectContaining({ p_actor: "45", p_hash: `hashed-${"a".repeat(43)}` }));
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it("does not execute duplicate completed updates and asks for retry while busy", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { state: "done" }, error: null });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.process).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: { state: "busy" }, error: null });
    expect((await POST(request())).status).toBe(503);
  });
  it("waits for persisted work and returns retryable failure without secret details", async () => {
    mocks.rpc.mockResolvedValue({ data: { state: "claimed", update_id: 12 }, error: null });
    mocks.process.mockRejectedValue(new Error("private upstream token"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
});
