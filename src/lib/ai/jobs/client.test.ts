import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AiJobPendingError, pendingAiJobs, requestAiJob } from "./client";

beforeEach(() => {
  vi.useFakeTimers();
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("AI work survives mobile connection changes", () => {
  it("polls the accepted ID, retries network loss, and never resubmits the AI request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "running" }, { status: 202 }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ status: "completed", result: { answer: "done" }, httpStatus: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = requestAiJob("/api/copilot", { question: "q" }, { scope: "alice" });
    await vi.advanceTimersByTimeAsync(3100);
    expect(await (await promise).json()).toEqual({ answer: "done" });
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    expect(pendingAiJobs("alice")).toEqual([]);
  });
  it("retains the ID when acknowledgment is lost so reload can recover without duplicate execution", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection lost")));
    await expect(requestAiJob("/api/copilot", {}, { scope: "alice" })).rejects.toBeInstanceOf(AiJobPendingError);
    expect(pendingAiJobs("alice")).toHaveLength(1);
    expect(pendingAiJobs("bob")).toHaveLength(0);
  });

  it("retrieves a completed result after a long app switch instead of timing out first", async () => {
    const page = { visibilityState: "hidden" };
    vi.stubGlobal("document", page);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "running" }, { status: 202 }))
      .mockResolvedValueOnce(Response.json({ status: "completed", result: { answer: "saved while away" }, httpStatus: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const promise = requestAiJob("/api/copilot", {}, { scope: "alice" });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    page.visibilityState = "visible";
    await vi.advanceTimersByTimeAsync(1500);
    expect(await (await promise).json()).toEqual({ answer: "saved while away" });
  });
  it("passes through synchronous responses and cleans up rejected submissions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "storage unavailable" }, { status: 503 })));
    const response = await requestAiJob("/api/copilot", {}, { scope: "alice" });
    expect(response.status).toBe(503);
    expect(pendingAiJobs("alice")).toHaveLength(0);
  });
});
