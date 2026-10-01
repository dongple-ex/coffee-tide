import { describe, expect, it, vi } from "vitest";
import { createDesktopChatRelay, type DesktopChatRequest } from "./desktopChat";

const request: DesktopChatRequest = { requestId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", text: "Mock 질문", mode: "work", history: [{ role: "user", text: "이전 질문" }, { role: "assistant", text: "Mock 이전 답변" }] };
describe("native desktop chat relay", () => {
  it("runs inference once across repeated polling and retries delivery without repeating work", async () => {
    let finish!: (text: string) => void;
    const answer = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const deliver = vi.fn().mockRejectedValueOnce(new Error("Mock offline")).mockResolvedValue(undefined);
    const relay = createDesktopChatRelay(answer, deliver);
    const first = relay.handle(request);
    const duplicate = relay.handle(request);
    const outcomes = Promise.allSettled([first, duplicate]);
    finish("Mock 답변");
    await outcomes;
    expect(answer).toHaveBeenCalledTimes(1);
    expect(answer).toHaveBeenCalledWith(request);
    await relay.handle(request);
    expect(answer).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenLastCalledWith({ requestId: request.requestId, answer: "Mock 답변" });
  });
  it("does not deliver an old pairing's response after disposal", async () => {
    let finish!: (text: string) => void;
    const deliver = vi.fn();
    const relay = createDesktopChatRelay(() => new Promise<string>(resolve => { finish = resolve; }), deliver);
    const pending = relay.handle(request);
    relay.dispose(); finish("private old response"); await pending;
    expect(deliver).not.toHaveBeenCalled();
  });
  it("rejects malformed requests and contains errors without inventing a successful reply", async () => {
    const answer = vi.fn().mockRejectedValue(new Error("private internal detail"));
    const deliver = vi.fn().mockResolvedValue(undefined);
    const relay = createDesktopChatRelay(answer, deliver);
    await relay.handle({ ...request, history: [{ role: "system", text: "bad" }] });
    await relay.handle({ ...request, text: "x".repeat(6001) });
    expect(answer).not.toHaveBeenCalled();
    await relay.handle(request);
    expect(deliver.mock.calls[0][0]).toMatchObject({ requestId: request.requestId, error: expect.any(String) });
    expect(JSON.stringify(deliver.mock.calls)).not.toContain("private internal detail");
  });
});
