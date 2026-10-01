import { afterEach, describe, expect, it, vi } from "vitest";
import { askTerminalAi, buildTerminalAiPrompt, registerTerminalAi, terminalAiConfig } from "./desktopAi";

afterEach(() => vi.unstubAllGlobals());
describe("terminal AI connection", () => {
  it("requires a supported paired desktop and never calls cloud APIs as a silent fallback", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    await expect(askTerminalAi("claude_cli", "hi")).rejects.toThrow("6자리");
    const unregister = registerTerminalAi("test-token", false);
    await expect(askTerminalAi("claude_cli", "hi")).rejects.toThrow("업데이트");
    unregister();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends question and history with persona instructions without importing unrelated workspace data", () => {
    const prompt = buildTerminalAiPrompt("오류 분석", { presetId: "senior_dev", baristaName: "테드" }, [{ role: "user", text: "이전 질문" }]);
    expect(prompt).toContain("테드");
    expect(prompt).toContain("이전 질문");
    expect(prompt).toContain("오류 분석");
    expect(prompt).toContain("업무 데이터는 전달되지 않았습니다");
    expect(() => buildTerminalAiPrompt("x".repeat(6001), {})).toThrow("6,000");
  });
  it("uses only the paired loopback token and validates final result ownership", async () => {
    const fetch = vi.fn(async (_url, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      return new Response(JSON.stringify({ answer: "답변", provider: body.provider, requestId: body.requestId }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    const unregister = registerTerminalAi("test-token", true);
    try {
      expect((await askTerminalAi("claude_cli", "question")).answer).toBe("답변");
      expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:47381/ai/chat");
      expect(fetch.mock.calls[0][1].headers).toMatchObject({ Authorization: "Bearer test-token" });
      fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ answer: "wrong", provider: "codex_cli", requestId: "other" })));
      await expect(askTerminalAi("claude_cli", "question")).rejects.toThrow("형식");
    } finally { unregister(); }
  });
  it("keeps the current question while trimming old Korean history to the byte limit", () => {
    const question = "가".repeat(6000);
    const prompt = buildTerminalAiPrompt(question, {}, Array.from({ length: 8 }, (_, index) => ({ role: "user" as const, text: `${index}${"나".repeat(1200)}` })));
    expect(new TextEncoder().encode(prompt).byteLength).toBeLessThanOrEqual(48000);
    expect(prompt).toContain(question);
    expect(prompt).toContain(`7${"나".repeat(1199)}`);
  });
  it("returns explicit bridge errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "로그인 필요" }), { status: 502 })));
    const unregister = registerTerminalAi("test-token", true);
    try { await expect(terminalAiConfig("claude_cli")).rejects.toThrow("로그인 필요"); } finally { unregister(); }
  });
});
