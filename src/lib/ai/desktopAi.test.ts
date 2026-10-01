import { afterEach, describe, expect, it, vi } from "vitest";
import { askTerminalAi, buildTerminalAiPrompt, readTerminalAiModels, readTerminalAiStatus, registerTerminalAi, terminalAiConfig, terminalAiStatus, terminalAiAccountInfoSupported, TERMINAL_AI_USAGE } from "./desktopAi";

afterEach(() => vi.unstubAllGlobals());
describe("terminal AI connection", () => {
  const catalog = { provider: "claude_cli", source: "claude-agent-sdk", checkedAt: "2026-10-02T00:00:00Z", models: [{ value: "sonnet", label: "Mock Sonnet", description: "Test metadata", reasoningEfforts: ["high"], isDefault: false }] };
  it("loads live model metadata once for overlapping requests and removes unknown fields", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ...catalog, token: "PRIVATE", models: [{ ...catalog.models[0], secret: "PRIVATE" }] })));
    vi.stubGlobal("fetch", fetch);
    const unregister = registerTerminalAi("test-token", true);
    try {
      const results = await Promise.all([readTerminalAiModels("claude_cli"), readTerminalAiModels("claude_cli")]);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(results[0]).toEqual(catalog);
      expect(JSON.stringify(results)).not.toContain("PRIVATE");
      expect(terminalAiStatus("claude_cli")).toBeNull();
      await readTerminalAiModels("claude_cli");
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally { unregister(); }
  });
  it("does not present a static model list when an older desktop returns 404", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "not_found" }), { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    const unregister = registerTerminalAi("test-token", true);
    try {
      expect(await readTerminalAiModels("claude_cli")).toBeNull();
      expect(await readTerminalAiModels("codex_cli")).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { unregister(); }
  });
  it("preserves a supported Codex catalogue default without inventing one for older metadata", async () => {
    const unregister = registerTerminalAi("test-token", true);
    try {
      for (const value of ["high", "ultra", null, undefined, 42]) {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...catalog, provider: "codex_cli", source: "codex-app-server", models: [{ ...catalog.models[0], defaultReasoningEffort: value }] }))));
        const result = await readTerminalAiModels("codex_cli");
        expect(result?.models[0].defaultReasoningEffort).toBe(value === "high" ? "high" : undefined);
      }
    } finally { unregister(); }
  });
  it("rejects stale, foreign or malformed model catalogs", async () => {
    let reply!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>(resolve => { reply = resolve; }));
    vi.stubGlobal("fetch", fetch);
    const unregisterOld = registerTerminalAi("old-token", true);
    const old = readTerminalAiModels("claude_cli");
    const unregister = registerTerminalAi("new-token", true);
    reply(new Response(JSON.stringify(catalog)));
    await expect(old).rejects.toThrow("연결이 변경");
    unregisterOld();
    try {
      for (const bad of [{ ...catalog, provider: "codex_cli" }, { ...catalog, source: "static" }, { ...catalog, models: [] }, { ...catalog, models: [{ ...catalog.models[0], value: "bad;command" }] }]) {
        fetch.mockImplementationOnce(async () => new Response(JSON.stringify(bad)));
        await expect(readTerminalAiModels("claude_cli")).rejects.toThrow("형식");
      }
    } finally { unregister(); }
  });
  it("keeps legacy desktop chat working and probes an unsupported account endpoint only once per connection", async () => {
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      if (_url.endsWith("/status")) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
      const body = JSON.parse(options.body as string);
      return new Response(JSON.stringify({ answer: "Mock legacy CLI answer", provider: body.provider, requestId: body.requestId }));
    });
    vi.stubGlobal("fetch", fetch);
    const unregister = registerTerminalAi("test-token", true);
    try {
      expect(await readTerminalAiStatus("claude_cli", true)).toBeNull();
      expect(terminalAiAccountInfoSupported()).toBe(false);
      expect(await readTerminalAiStatus("codex_cli", true)).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect((await askTerminalAi("claude_cli", "Mock question")).answer).toBe("Mock legacy CLI answer");
      expect(terminalAiStatus("claude_cli")?.verifiedAt).toBeTruthy();
      expect(terminalAiStatus("claude_cli")?.account.email).toBeUndefined();
      expect(terminalAiAccountInfoSupported()).toBe(false);
    } finally { unregister(); }
    const unregisterNew = registerTerminalAi("new-token", true);
    expect(terminalAiAccountInfoSupported()).toBe(true);
    unregisterNew();
  });
  it("shows only the selected provider's status and clears accounts on disconnect", async () => {
    const status = { provider: "claude_cli", account: { loggedIn: true, email: "test@example.invalid" }, checkedAt: new Date().toISOString(), verifiedAt: null, usage: TERMINAL_AI_USAGE.claude_cli };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status }))));
    const unregister = registerTerminalAi("test-token", true);
    await readTerminalAiStatus("claude_cli", true);
    expect(terminalAiStatus("claude_cli")?.account.email).toBe("test@example.invalid");
    expect(terminalAiStatus("codex_cli")).toBeNull();
    unregister();
    expect(terminalAiStatus("claude_cli")).toBeNull();
  });
  it("rejects another provider or a non-allowlisted usage URL", async () => {
    const status = { provider: "codex_cli", account: { loggedIn: true }, usage: TERMINAL_AI_USAGE.codex_cli };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ status })));
    vi.stubGlobal("fetch", fetch);
    const unregister = registerTerminalAi("test-token", true);
    try {
      await expect(readTerminalAiStatus("claude_cli")).rejects.toThrow("형식");
      fetch.mockImplementationOnce(async () => new Response(JSON.stringify({ status: { ...status, provider: "claude_cli", usage: { url: "https://untrusted.example" } } })));
      await expect(readTerminalAiStatus("claude_cli")).rejects.toThrow("형식");
    } finally { unregister(); }
  });
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
