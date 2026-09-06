import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiJob } from "./types";

const mocks = vi.hoisted(() => ({
  after: vi.fn(), create: vi.fn(), get: vi.fn(), save: vi.fn(), profile: vi.fn(), send: vi.fn(), configured: vi.fn(),
}));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: mocks.after }));
vi.mock("./store", () => ({ createAiJob: mocks.create, getAiJob: mocks.get, saveAiJob: mocks.save }));
vi.mock("@/lib/push/store", () => ({ getProfile: mocks.profile }));
vi.mock("@/lib/push/sender", () => ({ sendPush: mocks.send, isPushConfigured: mocks.configured }));
import { acceptAiJob, finishAiJob } from "./server";

const id = "11223344-5566-4788-8990-aabbccddeeff";
const newJob = (): AiJob => ({ id, ownerId: "alice", kind: "copilot", question: "private question", createdAt: Date.now(), status: "running", notification: "pending" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue(true);
  mocks.save.mockResolvedValue(undefined);
  mocks.configured.mockReturnValue(true);
  mocks.profile.mockResolvedValue({ endpoint: "secret-endpoint" });
  mocks.send.mockResolvedValue("sent");
});

describe("AI job acceptance", () => {
  it("persists and acknowledges before starting work, scheduling it through Next after", async () => {
    const execute = vi.fn().mockResolvedValue(Response.json({ answer: "finished" }));
    const response = await acceptAiJob({ id, ownerId: "alice", kind: "copilot", question: "q", pushEndpoint: "secret-endpoint", execute });
    expect(response.status).toBe(202);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty("ownerId");
    await mocks.after.mock.calls[0][0]();
    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it("does not run a duplicate request or expose another owner's job", async () => {
    mocks.create.mockResolvedValue(false);
    mocks.get.mockResolvedValue(newJob());
    const options = { id, ownerId: "alice", kind: "copilot" as const, question: "q", execute: vi.fn() };
    expect((await acceptAiJob(options)).status).toBe(202);
    expect(mocks.after).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue(null);
    expect((await acceptAiJob({ ...options, ownerId: "bob" })).status).toBe(409);
    expect(mocks.get).toHaveBeenLastCalledWith(id, "bob");
  });

  it("fails before executing when storage is unavailable", async () => {
    mocks.create.mockRejectedValue(new Error("storage down"));
    const response = await acceptAiJob({ id, ownerId: "alice", kind: "copilot", question: "q", execute: vi.fn() });
    expect(response.status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("rejects invalid IDs and never sends to unregistered push endpoints", async () => {
    const options = { id: "../private", ownerId: "alice", kind: "copilot" as const, question: "q", pushEndpoint: "https://unknown", execute: vi.fn() };
    expect((await acceptAiJob(options)).status).toBe(400);
    mocks.profile.mockResolvedValue(undefined);
    const response = await acceptAiJob({ ...options, id });
    expect((await response.json()).notification).toBe("disabled");
  });
});

describe("AI completion notifications", () => {
  it("saves the result before sending a private, uniquely tagged notification", async () => {
    mocks.send.mockImplementation(async (_profile, payload) => {
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", result: { answer: "private answer" } }));
      expect(JSON.stringify(payload)).not.toContain("private");
      expect(payload.url).toBe(`/?aiJob=${id}`);
      expect(payload.tag).toBe(`ai-job-${id}`);
      return "sent";
    });
    const job = newJob();
    await finishAiJob(job, "secret-endpoint", async () => Response.json({ answer: "private answer" }));
    expect(job.notification).toBe("sent");
  });

  it("keeps the successful result when push fails, retrying transient failure once", async () => {
    mocks.send.mockResolvedValue("transient");
    const job = newJob();
    await finishAiJob(job, "secret-endpoint", async () => Response.json({ answer: "done" }));
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(job).toMatchObject({ status: "completed", notification: "failed", result: { answer: "done" } });
  });

  it("honors unsubscribe during execution and works without notifications", async () => {
    mocks.profile.mockResolvedValue(undefined);
    await finishAiJob(newJob(), "secret-endpoint", async () => Response.json({ answer: "done" }));
    await finishAiJob({ ...newJob(), notification: "disabled" }, undefined, async () => Response.json({ answer: "done" }));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalled();
  });

  it("labels fallback results and failed work honestly", async () => {
    await finishAiJob(newJob(), "secret-endpoint", async () => Response.json({ answer: "sample", ai_fallback: true }));
    expect(mocks.send.mock.calls[0][1].body).toContain("대체 응답");
    const failed = newJob();
    await finishAiJob(failed, "secret-endpoint", async () => { throw new Error("secret upstream error"); });
    expect(failed.status).toBe("failed");
    expect(mocks.send.mock.calls[1][1].title).toContain("실패");
    expect(JSON.stringify(failed.result)).not.toContain("secret");
  });
});
