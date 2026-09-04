import { describe, it, expect, vi, afterEach } from "vitest";
import { checkChromeCanaryAiStatus, runChromeCanaryPrompt } from "./chromeCanaryAi";

describe("Chrome Canary Built-in AI (Prompt API / Gemini Nano)", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    (globalThis as unknown as { window: typeof originalWindow }).window = originalWindow;
    vi.restoreAllMocks();
  });

  it("브라우저에 window.ai가 없을 때는 unsupported 상태를 반환한다", async () => {
    (globalThis as unknown as { window: { ai?: unknown } }).window = {};
    const status = await checkChromeCanaryAiStatus();
    expect(status.supported).toBe(false);
    expect(status.status).toBe("unsupported");
    expect(status.message).toContain("chrome://flags/#prompt-api-for-gemini-nano");
  });

  it("WICG 최신 표준 window.ai.languageModel이 ready 상태일 때 올바르게 감지한다", async () => {
    (globalThis as unknown as { window: { ai: unknown } }).window = {
      ai: {
        languageModel: {
          capabilities: vi.fn().mockResolvedValue({ available: "readily" }),
          create: vi.fn(),
        },
      },
    };

    const status = await checkChromeCanaryAiStatus();
    expect(status.supported).toBe(true);
    expect(status.status).toBe("ready");
    expect(status.message).toContain("온디바이스 AI 사용 가능");
  });

  it("온디바이스 모델 다운로드 중일 때 downloading 상태를 반환한다", async () => {
    (globalThis as unknown as { window: { ai: unknown } }).window = {
      ai: {
        languageModel: {
          capabilities: vi.fn().mockResolvedValue({ available: "after-download" }),
        },
      },
    };

    const status = await checkChromeCanaryAiStatus();
    expect(status.supported).toBe(true);
    expect(status.status).toBe("downloading");
  });

  it("runChromeCanaryPrompt 호출 시 languageModel 세션을 생성하고 프롬프트를 실행한다", async () => {
    const mockPrompt = vi.fn().mockResolvedValue("안녕하세요! 온디바이스 AI입니다.");
    const mockDestroy = vi.fn();
    const mockCreate = vi.fn().mockResolvedValue({
      prompt: mockPrompt,
      destroy: mockDestroy,
    });

    (globalThis as unknown as { window: { ai: unknown } }).window = {
      ai: {
        languageModel: {
          create: mockCreate,
        },
      },
    };

    const answer = await runChromeCanaryPrompt("시스템 지시사항", "사용자 질문");
    expect(answer).toBe("안녕하세요! 온디바이스 AI입니다.");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "시스템 지시사항" })
    );
    expect(mockPrompt).toHaveBeenCalledWith("사용자 질문");
    expect(mockDestroy).toHaveBeenCalled();
  });
});
