import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildChromeCanaryConversationPrompt,
  checkChromeCanaryAiStatus,
  prepareChromeCanaryAi,
  runChromeCanaryPrompt,
} from "./chromeCanaryAi";

describe("Chrome Built-in AI Prompt API", () => {
  const originalWindow = globalThis.window;
  const readyTranslatorFactory = () => ({
    availability: vi.fn().mockResolvedValue("available"),
    create: vi.fn().mockImplementation(async () => ({
      translate: vi.fn().mockImplementation(async (input: string) => input),
      destroy: vi.fn(),
    })),
  });

  afterEach(() => {
    (globalThis as unknown as { window: typeof originalWindow }).window = originalWindow;
    vi.restoreAllMocks();
  });

  it("최근 대화 문맥과 현재 질문을 로컬 모델용 프롬프트로 묶는다", () => {
    const prompt = buildChromeCanaryConversationPrompt("그럼 내일은?", [
      { role: "user", text: "오늘 일정을 알려줘" },
      { role: "assistant", text: "오늘은 회의가 한 건 있어요." },
    ]);

    expect(prompt).toContain("사용자: 오늘 일정을 알려줘");
    expect(prompt).toContain("AI: 오늘은 회의가 한 건 있어요.");
    expect(prompt).toContain("현재 사용자 질문: 그럼 내일은?");
  });

  it("긴 대화와 질문은 로컬 모델 컨텍스트에 맞게 제한한다", () => {
    const prompt = buildChromeCanaryConversationPrompt("질문".repeat(2_000), [
      { role: "user", text: "이전 대화".repeat(300) },
    ]);

    expect(prompt).toContain("[중략]");
    expect(prompt.length).toBeLessThan(3_700);
  });

  it("SSR 환경에서는 window를 참조하지 않고 unsupported를 반환한다", async () => {
    (globalThis as unknown as { window?: Window }).window = undefined;

    await expect(checkChromeCanaryAiStatus()).resolves.toMatchObject({
      supported: false,
      status: "unsupported",
    });
  });

  it("API가 없으면 두 Canary 플래그를 포함한 안내를 반환한다", async () => {
    (globalThis as unknown as { window: Window }).window = {} as Window;

    const status = await checkChromeCanaryAiStatus();

    expect(status).toMatchObject({ supported: false, status: "unsupported" });
    expect(status.message).toContain("chrome://flags/#prompt-api-for-gemini-nano");
    expect(status.message).toContain("chrome://flags/#optimization-guide-on-device-model");
  });

  it("현재 표준 LanguageModel.available 상태를 ready로 감지한다", async () => {
    (globalThis as unknown as { window: Window }).window = {
      LanguageModel: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi.fn(),
      },
      Translator: readyTranslatorFactory(),
    } as unknown as Window;

    await expect(checkChromeCanaryAiStatus()).resolves.toMatchObject({
      supported: true,
      status: "ready",
    });
  });

  it.each(["downloadable", "downloading", "after-download"])(
    "%s 상태를 downloading으로 정규화한다",
    async (availability) => {
      (globalThis as unknown as { window: Window }).window = {
        LanguageModel: {
          availability: vi.fn().mockResolvedValue(availability),
          create: vi.fn(),
        },
        Translator: readyTranslatorFactory(),
      } as unknown as Window;

      await expect(checkChromeCanaryAiStatus()).resolves.toMatchObject({
        supported: true,
        status: "downloading",
      });
    }
  );

  it("window.ai.languageModel.capabilities 레거시 표면도 지원한다", async () => {
    (globalThis as unknown as { window: Window }).window = {
      ai: {
        languageModel: {
          capabilities: vi.fn().mockResolvedValue({ available: "readily" }),
          create: vi.fn(),
        },
      },
      Translator: readyTranslatorFactory(),
    } as unknown as Window;

    await expect(checkChromeCanaryAiStatus()).resolves.toMatchObject({
      supported: true,
      status: "ready",
    });
  });

  it("한국어 번역 언어팩이 필요하면 전체 상태를 downloading으로 표시한다", async () => {
    (globalThis as unknown as { window: Window }).window = {
      LanguageModel: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi.fn(),
      },
      Translator: {
        availability: vi.fn().mockResolvedValue("downloadable"),
        create: vi.fn(),
      },
    } as unknown as Window;

    await expect(checkChromeCanaryAiStatus()).resolves.toMatchObject({
      supported: true,
      status: "downloading",
    });
  });

  it("한국어 번역 API가 없으면 AI ON으로 표시하지 않는다", async () => {
    (globalThis as unknown as { window: Window }).window = {
      LanguageModel: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi.fn(),
      },
    } as unknown as Window;

    const status = await checkChromeCanaryAiStatus();
    expect(status).toMatchObject({ supported: false, status: "no_session" });
    expect(status.message).toContain("Translator API");
  });

  it("현재 표준 세션에 system initial prompt를 전달하고 finally에서 해제한다", async () => {
    const destroy = vi.fn();
    const create = vi.fn().mockResolvedValue({
      prompt: vi.fn().mockResolvedValue("로컬 응답"),
      destroy,
    });
    (globalThis as unknown as { window: Window }).window = {
      LanguageModel: { availability: vi.fn(), create },
    } as unknown as Window;

    await expect(runChromeCanaryPrompt("system instruction", "question")).resolves.toBe("로컬 응답");
    expect(create).toHaveBeenCalledWith({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      initialPrompts: [{ role: "system", content: "system instruction" }],
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("Canary 호환 세션에는 systemPrompt를 전달한다", async () => {
    const destroy = vi.fn();
    const create = vi.fn().mockResolvedValue({
      prompt: vi.fn().mockResolvedValue("Canary 응답"),
      destroy,
    });
    (globalThis as unknown as { window: Window }).window = {
      ai: { languageModel: { capabilities: vi.fn(), create } },
    } as unknown as Window;

    await expect(runChromeCanaryPrompt("system instruction", "question")).resolves.toBe("Canary 응답");
    expect(create).toHaveBeenCalledWith({ systemPrompt: "system instruction" });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("한국어 입력을 로컬 번역 후 Prompt API에 보내고 응답을 다시 한국어로 번역한다", async () => {
    const promptDestroy = vi.fn();
    const koToEnDestroy = vi.fn();
    const enToKoDestroy = vi.fn();
    const prompt = vi.fn().mockResolvedValue("English answer");
    const create = vi.fn().mockResolvedValue({ prompt, destroy: promptDestroy });
    const translatorCreate = vi.fn().mockImplementation(
      async ({ sourceLanguage }: { sourceLanguage: string }) =>
        sourceLanguage === "ko"
          ? {
              translate: vi.fn().mockImplementation(async (input: string) =>
                input === "시스템 지시" ? "system instruction" : "translated question"
              ),
              destroy: koToEnDestroy,
            }
          : {
              translate: vi.fn().mockResolvedValue("한국어 응답"),
              destroy: enToKoDestroy,
            }
    );
    (globalThis as unknown as { window: Window }).window = {
      LanguageModel: { availability: vi.fn(), create },
      Translator: {
        availability: vi.fn().mockResolvedValue("available"),
        create: translatorCreate,
      },
    } as unknown as Window;

    await expect(runChromeCanaryPrompt("시스템 지시", "질문")).resolves.toBe("한국어 응답");
    expect(prompt).toHaveBeenCalledWith("translated question");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPrompts: [{ role: "system", content: "system instruction" }],
      })
    );
    expect(promptDestroy).toHaveBeenCalledOnce();
    expect(koToEnDestroy).toHaveBeenCalledOnce();
    expect(enToKoDestroy).toHaveBeenCalledOnce();
  });

  it("사용자 동작에서 세션을 만들어 다운로드 진행률을 받고 준비 세션을 해제한다", async () => {
    const destroy = vi.fn();
    const translatorDestroy = vi.fn();
    const onProgress = vi.fn();
    const create = vi.fn().mockImplementation(
      async (options: {
        monitor?: (monitor: {
          addEventListener: (
            type: "downloadprogress",
            listener: (event: { loaded: number }) => void
          ) => void;
        }) => void;
      }) => {
        options.monitor?.({
          addEventListener(_type, listener) {
            listener({ loaded: 0.42 });
          },
        });
        return { prompt: vi.fn(), destroy };
      }
    );
    (globalThis as unknown as { window: Window }).window = {
      LanguageModel: { availability: vi.fn(), create },
      Translator: {
        availability: vi.fn().mockResolvedValue("available"),
        create: vi.fn().mockImplementation(async (options: {
          monitor?: (monitor: {
            addEventListener: (
              type: "downloadprogress",
              listener: (event: { loaded: number }) => void
            ) => void;
          }) => void;
        }) => {
          options.monitor?.({
            addEventListener(_type, listener) {
              listener({ loaded: 0.6 });
            },
          });
          return { translate: vi.fn(), destroy: translatorDestroy };
        }),
      },
    } as unknown as Window;

    await expect(prepareChromeCanaryAi(onProgress)).resolves.toMatchObject({
      supported: true,
      status: "ready",
    });
    expect(onProgress).toHaveBeenLastCalledWith(1);
    expect(destroy).toHaveBeenCalledOnce();
    expect(translatorDestroy).toHaveBeenCalledTimes(2);
  });

  it("모델 실행 요건 미충족 오류를 사용자 친화적으로 안내한다", async () => {
    (globalThis as unknown as { window: Window }).window = {
      LanguageModel: {
        availability: vi.fn(),
        create: vi.fn().mockRejectedValue(
          new Error("The device is not eligible for running on-device model.")
        ),
      },
      Translator: readyTranslatorFactory(),
    } as unknown as Window;

    const status = await prepareChromeCanaryAi();

    expect(status).toMatchObject({ supported: false, status: "no_session" });
    expect(status.message).toContain("현재 기기가 Chrome 온디바이스 모델 실행 요건을 충족하지 않습니다");
    expect(status.message).not.toContain("The device is not eligible");
  });

  it("promptStreaming만 있는 레거시 세션의 청크를 합치고 해제한다", async () => {
    const destroy = vi.fn();
    const stream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue("streaming ");
        controller.enqueue("answer");
        controller.close();
      },
    });
    (globalThis as unknown as { window: Window }).window = {
      ai: {
        canCreateTextSession: vi.fn().mockResolvedValue("readily"),
        createTextSession: vi.fn().mockResolvedValue({
          promptStreaming: vi.fn().mockReturnValue(stream),
          destroy,
        }),
      },
    } as unknown as Window;

    await expect(runChromeCanaryPrompt("system instruction", "question")).resolves.toBe("streaming answer");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("prompt가 실패해도 finally에서 세션을 해제한다", async () => {
    const destroy = vi.fn();
    (globalThis as unknown as { window: Window }).window = {
      ai: {
        createTextSession: vi.fn().mockResolvedValue({
          prompt: vi.fn().mockRejectedValue(new Error("prompt failed")),
          destroy,
        }),
      },
    } as unknown as Window;

    await expect(runChromeCanaryPrompt("system instruction", "question")).rejects.toThrow("prompt failed");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
