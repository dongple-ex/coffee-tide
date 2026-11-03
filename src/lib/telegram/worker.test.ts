import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramEvent } from "./store";

const mocks = vi.hoisted(() => ({ db: vi.fn(), linked: vi.fn(), checkpoint: vi.fn(), send: vi.fn(),
  get: vi.fn(), create: vi.fn(), save: vi.fn(), finish: vi.fn(), generate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./store", () => ({ telegramDb: mocks.db, stillLinked: mocks.linked, checkpoint: mocks.checkpoint }));
vi.mock("./config", () => ({ telegramConfig: () => ({ origin: "https://example.com" }) }));
vi.mock("./sender", () => ({ sendTelegram: mocks.send, TelegramSendError: class extends Error { blocked = false; } }));
vi.mock("@/lib/ai/jobs/store", () => ({ getAiJob: mocks.get, createAiJob: mocks.create, saveAiJob: mocks.save }));
vi.mock("@/lib/ai/jobs/server", () => ({ finishAiJob: mocks.finish }));
vi.mock("@/lib/ai/copilotService", () => ({ generateCopilotReply: mocks.generate }));
import { processTelegramEvent, telegramAnswer } from "./worker";

const event: TelegramEvent = { state: "claimed", update_id: 15, link_id: "link", user_id: "alice", chat_id: "100",
  job_id: "job", lease_id: "lease", question: "오늘 할 일을 알려줘", reply: null, status: "processing" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.linked.mockResolvedValue(true);
  mocks.checkpoint.mockResolvedValue(true);
  mocks.get.mockResolvedValue({ id: "job", status: "completed", result: { answer: "private answer", ai_fallback: false } });
});

describe("Telegram completion delivery", () => {
  it("checkpoints the answer before sending and checks the current link again", async () => {
    mocks.send.mockImplementation(async () => {
      expect(mocks.checkpoint).toHaveBeenCalledWith(event, expect.objectContaining({ status: "ready" }));
      expect(mocks.linked).toHaveBeenCalledTimes(2);
    });
    await processTelegramEvent(event);
    expect(mocks.send).toHaveBeenCalledWith("100", expect.stringContaining("private answer"));
    expect(mocks.checkpoint).toHaveBeenLastCalledWith(event, { status: "sent", lease_until: null });
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("does not send when unlinked while the answer was being prepared", async () => {
    mocks.linked.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await processTelegramEvent(event);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("retries a saved reply without invoking the model again", async () => {
    await processTelegramEvent({ ...event, reply: "saved result", status: "ready" });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledWith("100", "saved result");
  });

  it("preserves the result and releases the lease on delivery failure", async () => {
    mocks.send.mockRejectedValue(new Error("network"));
    await expect(processTelegramEvent(event)).rejects.toThrow("delivery failed");
    expect(mocks.checkpoint).toHaveBeenLastCalledWith(event, { lease_until: expect.any(String) });
    expect(mocks.finish).not.toHaveBeenCalled();
  });

  it("labels fallback and refuses to rerun a model with an unknown prior outcome", async () => {
    mocks.get.mockResolvedValueOnce({ id: "job", status: "completed", result: { answer: "fallback", ai_fallback: true } });
    await processTelegramEvent(event);
    expect(mocks.send).toHaveBeenLastCalledWith("100", expect.stringContaining("대체 응답"));
    mocks.get.mockResolvedValueOnce({ id: "job", status: "running" });
    await processTelegramEvent(event);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", httpStatus: 504 }));
    expect(mocks.finish).not.toHaveBeenCalled();
  });
});

describe("Telegram model boundary", () => {
  it("loads only the linked owner's cloud data and never enables tools", async () => {
    const history = { eq: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const items = { eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [
        { id: "allowed", content: "allowed", ai_policy: "cloud_allowed", privacy_scope: "cloud_private" },
        { id: "blocked", content: "private", ai_policy: "local_only", privacy_scope: "local_only" },
      ], error: null }) };
    mocks.db.mockReturnValue({ from: (table: string) => ({ select: () => table === "telegram_events" ? history : items }) });
    mocks.generate.mockResolvedValue({ answer: "answer", aiUsed: true });
    await telegramAnswer(event);
    expect(items.eq).toHaveBeenCalledWith("user_id", "alice");
    expect(items.eq).toHaveBeenCalledWith("ai_policy", "cloud_allowed");
    const args = mocks.generate.mock.calls[0];
    expect(args[1].map((item: { id: string }) => item.id)).toEqual(["allowed"]);
    expect(args[4]).toBeUndefined();
    expect(args[5].allowCloudTools).toBe(false);
  });

  it("does not load work data for greetings", async () => {
    const chain = { eq: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    const from = vi.fn(() => ({ select: () => chain }));
    mocks.db.mockReturnValue({ from });
    mocks.generate.mockResolvedValue({ answer: "안녕하세요", aiUsed: true });
    await telegramAnswer({ ...event, question: "안녕" });
    expect(from).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0][1]).toEqual([]);
  });
});
