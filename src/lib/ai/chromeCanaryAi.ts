/**
 * Chrome Canary Built-in AI (Prompt API / Gemini Nano) 연동 헬퍼
 * W3C Web Incubator Community Group (WICG) Prompt API 명세 준수
 */

export interface ChromeCanaryAiStatus {
  supported: boolean;
  status: "ready" | "downloading" | "no_session" | "unsupported";
  message: string;
}

// Window 타입 확장 선언
declare global {
  interface Window {
    ai?: {
      languageModel?: {
        capabilities?: () => Promise<{
          available: "readily" | "after-download" | "no";
          defaultTemperature?: number;
          defaultTopK?: number;
          maxTopK?: number;
        }>;
        create?: (options?: {
          systemPrompt?: string;
          temperature?: number;
          topK?: number;
        }) => Promise<{
          prompt: (input: string) => Promise<string>;
          promptStreaming?: (input: string) => ReadableStream<string>;
          destroy?: () => void;
        }>;
      };
      // Legacy Canary Prompt API
      canCreateTextSession?: () => Promise<"readily" | "after-download" | "no">;
      createTextSession?: (options?: { systemPrompt?: string }) => Promise<{
        prompt: (input: string) => Promise<string>;
        destroy?: () => void;
      }>;
    };
  }
}

/**
 * 현재 브라우저가 크롬 카나리 Built-in AI (Gemini Nano)를 지원하는지 진단합니다.
 */
export async function checkChromeCanaryAiStatus(): Promise<ChromeCanaryAiStatus> {
  if (typeof window === "undefined") {
    return {
      supported: false,
      status: "unsupported",
      message: "서버 사이드 환경입니다.",
    };
  }

  const aiObj = window.ai;
  if (!aiObj) {
    return {
      supported: false,
      status: "unsupported",
      message: "Chrome Canary의 Built-in AI(Prompt API)가 활성화되어 있지 않습니다. (chrome://flags/#prompt-api-for-gemini-nano 확인 필요)",
    };
  }

  // WICG 최신 표준 명세: window.ai.languageModel
  if (aiObj.languageModel && typeof aiObj.languageModel.capabilities === "function") {
    try {
      const caps = await aiObj.languageModel.capabilities();
      if (caps.available === "readily") {
        return {
          supported: true,
          status: "ready",
          message: "Chrome Canary Gemini Nano 온디바이스 AI 사용 가능 (0ms 로컬 실행)",
        };
      } else if (caps.available === "after-download") {
        return {
          supported: true,
          status: "downloading",
          message: "Gemini Nano 온디바이스 모델을 다운로드 중입니다.",
        };
      } else {
        return {
          supported: false,
          status: "no_session",
          message: "브라우저에서 Prompt API 세션을 생성할 수 없습니다.",
        };
      }
    } catch (e) {
      console.warn("[ChromeCanaryAI] Capabilities error:", e);
    }
  }

  // 레거시 Canary 명세: window.ai.canCreateTextSession
  if (typeof aiObj.canCreateTextSession === "function") {
    try {
      const can = await aiObj.canCreateTextSession();
      if (can === "readily") {
        return {
          supported: true,
          status: "ready",
          message: "Chrome Canary 온디바이스 텍스트 세션 사용 가능 (로컬 0ms)",
        };
      } else if (can === "after-download") {
        return {
          supported: true,
          status: "downloading",
          message: "온디바이스 AI 모델을 다운로드 중입니다.",
        };
      }
    } catch (e) {
      console.warn("[ChromeCanaryAI] Legacy check error:", e);
    }
  }

  return {
    supported: false,
    status: "unsupported",
    message: "Prompt API 기능을 찾을 수 없습니다.",
  };
}

/**
 * 크롬 카나리 온디바이스 Gemini Nano로 직접 프롬프트를 실행합니다.
 */
export async function runChromeCanaryPrompt(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (typeof window === "undefined" || !window.ai) {
    throw new Error("Chrome Canary Built-in AI를 사용할 수 없습니다.");
  }

  const aiObj = window.ai;

  // 1. 최신 window.ai.languageModel
  if (aiObj.languageModel && typeof aiObj.languageModel.create === "function") {
    const session = await aiObj.languageModel.create({
      systemPrompt: systemPrompt || "You are an intelligent AI document assistant.",
    });
    try {
      const response = await session.prompt(userPrompt);
      return response;
    } finally {
      if (typeof session.destroy === "function") {
        session.destroy();
      }
    }
  }

  // 2. 레거시 window.ai.createTextSession
  if (typeof aiObj.createTextSession === "function") {
    const session = await aiObj.createTextSession({
      systemPrompt: systemPrompt || "You are an intelligent AI document assistant.",
    });
    try {
      const response = await session.prompt(userPrompt);
      return response;
    } finally {
      if (typeof session.destroy === "function") {
        session.destroy();
      }
    }
  }

  throw new Error("지원되는 Prompt API 메서드를 찾을 수 없습니다.");
}
