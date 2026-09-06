import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AI_JOB_TTL_SECONDS, publicAiJob, type AiJob } from "./types";

const mocks = vi.hoisted(() => ({ set: vi.fn(), get: vi.fn() }));
vi.mock("@upstash/redis", () => ({ Redis: class { set = mocks.set; get = mocks.get; } }));
import { createAiJob, getAiJob } from "./store";
const id = "11223344-5566-4788-8990-aabbccddeeff";
const job = (): AiJob => ({ id, ownerId: "alice", kind: "copilot", question: "q", createdAt: Date.now(), status: "running", notification: "disabled" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.invalid");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test");
});
afterEach(() => vi.unstubAllEnvs());

describe("persisted AI result access", () => {
  it("atomically reserves IDs with a 24-hour TTL", async () => {
    mocks.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    expect(await createAiJob(job())).toBe(true);
    expect(await createAiJob(job())).toBe(false);
    expect(mocks.set).toHaveBeenCalledWith(`coffeetide:ai-job:${id}`, expect.any(Object), { nx: true, ex: AI_JOB_TTL_SECONDS });
  });
  it("returns results only to their owner and only inside the retention window", async () => {
    mocks.get.mockResolvedValue(job());
    expect(await getAiJob(id, "alice")).not.toBeNull();
    expect(await getAiJob(id, "bob")).toBeNull();
    mocks.get.mockResolvedValue({ ...job(), createdAt: Date.now() - AI_JOB_TTL_SECONDS * 1000 });
    expect(await getAiJob(id, "alice")).toBeNull();
  });
  it("rejects path traversal before touching a backend", async () => {
    await expect(getAiJob("../../secrets", "alice")).rejects.toThrow();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("exposes an interrupted invocation as failed, without exposing owner identity", () => {
    const result = publicAiJob({ ...job(), createdAt: Date.now() - 280_000 });
    expect(result.status).toBe("failed");
    expect(result).not.toHaveProperty("ownerId");
  });
});
