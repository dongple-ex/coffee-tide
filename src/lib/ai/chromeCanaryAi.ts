/**
 * Chrome Built-in AI Prompt API compatibility helper.
 *
 * 지원 순서:
 * 1. 현재 WICG 표준: window.LanguageModel
 * 2. 이전 Canary 표면: window.ai.languageModel
 * 3. 초기 Canary 표면: window.ai.createTextSession
 */

export type ChromeCanaryAiStatusCode =
  | "ready"
  | "downloading"
  | "no_session"
  | "unsupported";

export interface ChromeCanaryAiStatus {
  supported: boolean;
  status: ChromeCanaryAiStatusCode;
  message: string;
}

export const CHROME_CANARY_AI_ATTRIBUTION =
  "*(✨ Chrome Canary Gemma 4 온디바이스 로컬 생성)*";

export interface ChromeCanaryConversationTurn {
  role: "user" | "assistant";
  text: string;
}

const FLAG_GUIDE =
  "chrome://flags/#prompt-api, chrome://flags/#gemma-4-for-built-in-ai 및 chrome://flags/#optimization-guide-on-device-model을 확인해 주세요. 구버전 Canary에서는 chrome://flags/#prompt-api-for-gemini-nano를 사용합니다.";

const MAX_HISTORY_TURN_CHARS = 500;
const MAX_USER_PROMPT_CHARS = 3_000;
const ENGLISH_PROMPT_OPTIONS = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};
const KOREAN_TRANSLATION_PAIRS = [
  { sourceLanguage: "ko", targetLanguage: "en" },
  { sourceLanguage: "en", targetLanguage: "ko" },
] as const;

function truncatePromptText(text: string, maxChars: number): string {
  const normalized = text.trim();
  if (normalized.length <= maxChars) return normalized;
  const suffixLength = Math.floor(maxChars * 0.25);
  const prefixLength = maxChars - suffixLength - 8;
  return `${normalized.slice(0, prefixLength)}\n[중략]\n${normalized.slice(-suffixLength)}`;
}

/** 세션을 매 요청마다 해제하면서도 최근 대화 문맥을 이어갈 수 있게 단일 프롬프트로 묶습니다. */
export function buildChromeCanaryConversationPrompt(
  userPrompt: string,
  history: ChromeCanaryConversationTurn[] = []
): string {
  const recentHistory = history
    .filter((turn) => turn.text.trim().length > 0)
    .slice(-8)
    .map((turn) => ({
      ...turn,
      text: truncatePromptText(turn.text, MAX_HISTORY_TURN_CHARS),
    }));
  const boundedUserPrompt = truncatePromptText(userPrompt, MAX_USER_PROMPT_CHARS);
  if (recentHistory.length === 0) return boundedUserPrompt;

  const transcript = recentHistory.map(
    (turn) => `${turn.role === "user" ? "사용자" : "AI"}: ${turn.text.trim()}`
  );
  return [
    "다음 최근 대화의 맥락을 이어서 현재 사용자 질문에 답하세요.",
    ...transcript,
    `현재 사용자 질문: ${boundedUserPrompt}`,
  ].join("\n\n");
}

type PromptApiAvailability =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "readily"
  | "after-download"
  | "no";

type PromptOutput = string | ReadableStream<string> | AsyncIterable<string>;
type MaybePromise<T> = T | Promise<T>;

interface PromptApiSession {
  prompt?: (input: string) => MaybePromise<PromptOutput>;
  promptStreaming?: (input: string) => MaybePromise<PromptOutput>;
  destroy?: () => MaybePromise<void>;
}

interface DownloadMonitorOptions {
  monitor?: (monitor: {
    addEventListener: (
      type: "downloadprogress",
      listener: (event: { loaded: number; total?: number }) => void
    ) => void;
  }) => void;
}

interface LanguageModelCoreOptions {
  expectedInputs?: Array<{ type: "text"; languages?: string[] }>;
  expectedOutputs?: Array<{ type: "text"; languages?: string[] }>;
}

interface LanguageModelCreateOptions extends LanguageModelCoreOptions, DownloadMonitorOptions {
  systemPrompt?: string;
  initialPrompts?: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}

interface LanguageModelFactory {
  availability?: (options?: LanguageModelCoreOptions) => Promise<PromptApiAvailability>;
  capabilities?: () => Promise<
    | PromptApiAvailability
    | {
        available: PromptApiAvailability;
        defaultTemperature?: number;
        defaultTopK?: number;
        maxTopK?: number;
      }
  >;
  create?: (options?: LanguageModelCreateOptions) => Promise<PromptApiSession>;
}

interface TranslatorPairOptions {
  sourceLanguage: string;
  targetLanguage: string;
}

interface TranslatorCreateOptions extends TranslatorPairOptions, DownloadMonitorOptions {}

interface TranslatorSession {
  translate: (input: string) => MaybePromise<string>;
  destroy?: () => MaybePromise<void>;
}

interface TranslatorFactory {
  availability?: (options: TranslatorPairOptions) => Promise<PromptApiAvailability>;
  create?: (options: TranslatorCreateOptions) => Promise<TranslatorSession>;
}

interface LegacyAiNamespace {
  languageModel?: LanguageModelFactory;
  canCreateTextSession?: () => Promise<PromptApiAvailability>;
  createTextSession?: (options?: LanguageModelCreateOptions) => Promise<PromptApiSession>;
}

declare global {
  interface Window {
    /** 현재 WICG Prompt API 표면. */
    LanguageModel?: LanguageModelFactory;
    /** Chrome Canary의 이전 Prompt API 표면. */
    ai?: LegacyAiNamespace;
    /** Chrome 138+의 온디바이스 Translator API 표면. */
    Translator?: TranslatorFactory;
  }
}

interface PromptApiAdapter {
  name: "LanguageModel" | "ai.languageModel" | "ai.createTextSession";
  availability: () => Promise<PromptApiAvailability | undefined>;
  create: (
    systemPrompt: string,
    onDownloadProgress?: (progress: number) => void
  ) => Promise<PromptApiSession>;
}

function monitorOptions(
  onDownloadProgress?: (progress: number) => void
): DownloadMonitorOptions {
  if (!onDownloadProgress) return {};
  return {
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const rawProgress =
          event.total && event.total > 0 ? event.loaded / event.total : event.loaded;
        onDownloadProgress(Math.max(0, Math.min(1, rawProgress)));
      });
    },
  };
}

function availabilityFromCapabilities(
  capabilities:
    | PromptApiAvailability
    | { available: PromptApiAvailability }
): PromptApiAvailability {
  return typeof capabilities === "string" ? capabilities : capabilities.available;
}

function getPromptApiAdapters(): PromptApiAdapter[] {
  if (typeof window === "undefined") return [];

  const adapters: PromptApiAdapter[] = [];
  const standard = window.LanguageModel;
  if (standard?.create) {
    adapters.push({
      name: "LanguageModel",
      availability: async () => standard.availability?.(ENGLISH_PROMPT_OPTIONS),
      create: (systemPrompt, onDownloadProgress) =>
        standard.create?.({
          ...ENGLISH_PROMPT_OPTIONS,
          initialPrompts: [{ role: "system", content: systemPrompt }],
          ...monitorOptions(onDownloadProgress),
        }) as Promise<PromptApiSession>,
    });
  }

  const canary = window.ai?.languageModel;
  if (canary?.create) {
    adapters.push({
      name: "ai.languageModel",
      availability: async () => {
        if (canary.availability) return canary.availability();
        if (canary.capabilities) {
          return availabilityFromCapabilities(await canary.capabilities());
        }
        return undefined;
      },
      create: (systemPrompt, onDownloadProgress) =>
        canary.create?.({
          systemPrompt,
          ...monitorOptions(onDownloadProgress),
        }) as Promise<PromptApiSession>,
    });
  }

  const legacyAi = window.ai;
  if (legacyAi?.createTextSession) {
    adapters.push({
      name: "ai.createTextSession",
      availability: async () => legacyAi.canCreateTextSession?.(),
      create: (systemPrompt, onDownloadProgress) =>
        legacyAi.createTextSession?.({
          systemPrompt,
          ...monitorOptions(onDownloadProgress),
        }) as Promise<PromptApiSession>,
    });
  }

  return adapters;
}

function isReady(availability: PromptApiAvailability): boolean {
  return availability === "available" || availability === "readily";
}

function needsDownload(availability: PromptApiAvailability): boolean {
  return (
    availability === "downloadable" ||
    availability === "downloading" ||
    availability === "after-download"
  );
}

async function getKoreanTranslationStatus(): Promise<ChromeCanaryAiStatus> {
  const translator = typeof window === "undefined" ? undefined : window.Translator;
  if (!translator?.availability || !translator.create) {
    return {
      supported: false,
      status: "no_session",
      message: "한국어 대화를 위한 Chrome Translator API를 사용할 수 없습니다.",
    };
  }

  let downloadPending = false;
  for (const pair of KOREAN_TRANSLATION_PAIRS) {
    try {
      const availability = await translator.availability(pair);
      if (availability === "unavailable" || availability === "no") {
        return {
          supported: false,
          status: "no_session",
          message: "한국어↔영어 온디바이스 번역 언어팩을 사용할 수 없습니다.",
        };
      }
      if (needsDownload(availability)) downloadPending = true;
      else if (!isReady(availability)) {
        return {
          supported: false,
          status: "no_session",
          message: "한국어 온디바이스 번역 상태를 확인하지 못했습니다.",
        };
      }
    } catch (error) {
      console.warn("[ChromeCanaryAI] Translator availability check failed:", error);
      return {
        supported: false,
        status: "no_session",
        message: "한국어 온디바이스 번역 상태를 확인하지 못했습니다.",
      };
    }
  }

  if (downloadPending) {
    return {
      supported: true,
      status: "downloading",
      message: "한국어 대화를 위한 온디바이스 번역 언어팩을 준비하고 있습니다.",
    };
  }

  return {
    supported: true,
    status: "ready",
    message: "한국어↔영어 온디바이스 번역이 준비되었습니다.",
  };
}

/** 현재 브라우저의 Built-in AI 모델 준비 상태를 진단합니다. */
export async function checkChromeCanaryAiStatus(): Promise<ChromeCanaryAiStatus> {
  if (typeof window === "undefined") {
    return {
      supported: false,
      status: "unsupported",
      message: "서버 환경에서는 브라우저 온디바이스 AI 상태를 진단할 수 없습니다.",
    };
  }

  const adapters = getPromptApiAdapters();
  if (adapters.length === 0) {
    return {
      supported: false,
      status: "unsupported",
      message: `이 브라우저에는 Built-in AI Prompt API가 없습니다. ${FLAG_GUIDE}`,
    };
  }

  let promptReady = false;
  let downloadPending = false;
  for (const adapter of adapters) {
    try {
      const availability = await adapter.availability();
      if (availability && isReady(availability)) {
        promptReady = true;
        break;
      }
      if (availability && needsDownload(availability)) {
        downloadPending = true;
      }
    } catch (error) {
      console.warn(`[ChromeCanaryAI] ${adapter.name} availability check failed:`, error);
    }
  }

  if (!promptReady && !downloadPending) {
    return {
      supported: false,
      status: "no_session",
      message: `Prompt API는 감지되었지만 세션을 만들 수 없습니다. ${FLAG_GUIDE}`,
    };
  }

  const translationStatus = await getKoreanTranslationStatus();
  if (translationStatus.status === "no_session" || translationStatus.status === "unsupported") {
    return translationStatus;
  }

  if (downloadPending || translationStatus.status === "downloading") {
    return {
      supported: true,
      status: "downloading",
      message: "온디바이스 AI 모델과 한국어 번역 언어팩을 다운로드하거나 준비하고 있습니다.",
    };
  }

  return {
    supported: true,
    status: "ready",
    message: "Chrome 온디바이스 AI와 한국어 로컬 번역이 준비되었습니다.",
  };
}

function preparationFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "";
  if (/not eligible|device.*ineligible/i.test(detail)) {
    return `현재 기기가 Chrome 온디바이스 모델 실행 요건을 충족하지 않습니다. ${FLAG_GUIDE}`;
  }
  if (/user activation|notallowed/i.test(detail)) {
    return `브라우저가 사용자 동작을 확인하지 못했습니다. AI OFF 칩을 다시 눌러 주세요. ${FLAG_GUIDE}`;
  }
  if (/not supported|unsupported language|language pair/i.test(detail)) {
    return "한국어↔영어 온디바이스 번역 언어팩을 사용할 수 없습니다.";
  }
  return `온디바이스 AI 모델 준비에 실패했습니다. ${FLAG_GUIDE}`;
}

async function destroySession(
  session: { destroy?: () => MaybePromise<void> } | undefined,
  label: string
): Promise<void> {
  if (!session?.destroy) return;
  try {
    await session.destroy();
  } catch (error) {
    console.warn(`[ChromeCanaryAI] ${label} destroy failed:`, error);
  }
}

function invokeCreate<T>(create: () => Promise<T>): Promise<T> {
  try {
    return create();
  } catch (error) {
    return Promise.reject(error);
  }
}

/**
 * 사용자 클릭 시 세션 생성을 시작해 필요한 모델 다운로드를 실제로 트리거합니다.
 * 준비가 끝난 세션은 추론하지 않고 즉시 해제하며, 다운로드된 모델은 브라우저가 관리합니다.
 */
export async function prepareChromeCanaryAi(
  onDownloadProgress?: (progress: number) => void
): Promise<ChromeCanaryAiStatus> {
  if (typeof window === "undefined") return checkChromeCanaryAiStatus();

  const adapters = getPromptApiAdapters();
  if (adapters.length === 0) return checkChromeCanaryAiStatus();

  const translator = window.Translator;
  if (!translator?.create) {
    return {
      supported: false,
      status: "no_session",
      message: "한국어 대화를 위한 Chrome Translator API를 사용할 수 없습니다.",
    };
  }
  const createTranslator = translator.create.bind(translator);

  const progress = [0, 0, 0];
  const updateProgress = (index: number) => (value: number) => {
    progress[index] = value;
    onDownloadProgress?.(progress.reduce((sum, item) => sum + item, 0) / progress.length);
  };

  // 세 create()를 첫 await 전에 시작해 클릭의 사용자 활성화를 모두 공유합니다.
  const adapter = adapters[0];
  const promptPromise = invokeCreate(() =>
    adapter.create("You are a helpful on-device assistant.", updateProgress(0))
  );
  const koToEnPromise = invokeCreate(() => createTranslator({
    ...KOREAN_TRANSLATION_PAIRS[0],
    ...monitorOptions(updateProgress(1)),
  }));
  const enToKoPromise = invokeCreate(() => createTranslator({
    ...KOREAN_TRANSLATION_PAIRS[1],
    ...monitorOptions(updateProgress(2)),
  }));
  const [promptResult, koToEnResult, enToKoResult] = await Promise.allSettled([
    promptPromise,
    koToEnPromise,
    enToKoPromise,
  ]);

  const promptSession = promptResult.status === "fulfilled" ? promptResult.value : undefined;
  const koToEn = koToEnResult.status === "fulfilled" ? koToEnResult.value : undefined;
  const enToKo = enToKoResult.status === "fulfilled" ? enToKoResult.value : undefined;

  try {
    if (promptResult.status === "rejected") {
      console.warn(`[ChromeCanaryAI] ${adapter.name} preparation failed:`, promptResult.reason);
      return {
        supported: false,
        status: "no_session",
        message: preparationFailureMessage(promptResult.reason),
      };
    }
    if (koToEnResult.status === "rejected" || enToKoResult.status === "rejected") {
      const reason = koToEnResult.status === "rejected"
        ? koToEnResult.reason
        : enToKoResult.status === "rejected"
          ? enToKoResult.reason
          : undefined;
      console.warn("[ChromeCanaryAI] Translator preparation failed:", reason);
      return {
        supported: false,
        status: "no_session",
        message: "한국어↔영어 온디바이스 번역 언어팩을 준비하지 못했습니다.",
      };
    }

    updateProgress(0)(1);
    updateProgress(1)(1);
    updateProgress(2)(1);
    return {
      supported: true,
      status: "ready",
      message: "Chrome 온디바이스 AI와 한국어 로컬 번역 준비가 완료되었습니다.",
    };
  } finally {
    await Promise.all([
      destroySession(promptSession, `${adapter.name} preparation session`),
      destroySession(koToEn, "Korean-to-English translator"),
      destroySession(enToKo, "English-to-Korean translator"),
    ]);
  }
}

function isReadableTextStream(value: unknown): value is ReadableStream<string> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "getReader" in value &&
      typeof (value as ReadableStream<string>).getReader === "function"
  );
}

function isAsyncTextIterable(value: unknown): value is AsyncIterable<string> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Symbol.asyncIterator in value &&
      typeof (value as AsyncIterable<string>)[Symbol.asyncIterator] === "function"
  );
}

async function promptOutputToText(output: PromptOutput): Promise<string> {
  if (typeof output === "string") return output.trim();

  const chunks: string[] = [];
  if (isReadableTextStream(output)) {
    const reader = output.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(String(value));
      }
    } finally {
      reader.releaseLock();
    }
  } else if (isAsyncTextIterable(output)) {
    for await (const chunk of output) chunks.push(String(chunk));
  } else {
    throw new Error("Prompt API가 지원하지 않는 응답 형식을 반환했습니다.");
  }

  return chunks.join("").trim();
}

async function runPromptSession(session: PromptApiSession, userPrompt: string): Promise<string> {
  const output = session.prompt
    ? await session.prompt(userPrompt)
    : session.promptStreaming
      ? await session.promptStreaming(userPrompt)
      : undefined;

  if (output === undefined) {
    throw new Error("Prompt API 세션에 실행 가능한 prompt 메서드가 없습니다.");
  }

  const text = await promptOutputToText(output);
  if (!text) throw new Error("온디바이스 AI가 빈 응답을 반환했습니다.");
  return text;
}

/** Chrome의 로컬 언어 모델로 프롬프트를 실행하고 세션 메모리를 즉시 해제합니다. */
export async function runChromeCanaryPrompt(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("서버 환경에서는 Chrome Built-in AI를 실행할 수 없습니다.");
  }

  const adapters = getPromptApiAdapters();
  if (adapters.length === 0) {
    throw new Error(`Chrome Built-in AI를 사용할 수 없습니다. ${FLAG_GUIDE}`);
  }

  const normalizedSystemPrompt =
    systemPrompt.trim() || "You are an intelligent AI document assistant.";
  const needsKoreanTranslation = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(
    `${normalizedSystemPrompt}\n${userPrompt}`
  );
  const translator = needsKoreanTranslation ? window.Translator : undefined;
  const createTranslator = translator?.create?.bind(translator);
  if (needsKoreanTranslation && !createTranslator) {
    throw new Error("한국어 대화를 위한 Chrome Translator API를 사용할 수 없습니다.");
  }

  let koToEn: TranslatorSession | undefined;
  let enToKo: TranslatorSession | undefined;
  try {
    if (needsKoreanTranslation && createTranslator) {
      const [koToEnResult, enToKoResult] = await Promise.allSettled([
        invokeCreate(() => createTranslator(KOREAN_TRANSLATION_PAIRS[0])),
        invokeCreate(() => createTranslator(KOREAN_TRANSLATION_PAIRS[1])),
      ]);
      koToEn = koToEnResult.status === "fulfilled" ? koToEnResult.value : undefined;
      enToKo = enToKoResult.status === "fulfilled" ? enToKoResult.value : undefined;
      if (koToEnResult.status === "rejected" || enToKoResult.status === "rejected") {
        const reason = koToEnResult.status === "rejected"
          ? koToEnResult.reason
          : enToKoResult.status === "rejected"
            ? enToKoResult.reason
            : new Error("온디바이스 번역 세션을 생성하지 못했습니다.");
        throw reason;
      }
    }

    const promptSystem = koToEn
      ? await koToEn.translate(normalizedSystemPrompt)
      : normalizedSystemPrompt;
    const promptInput = koToEn ? await koToEn.translate(userPrompt) : userPrompt;
    let lastError: unknown;

    for (const adapter of adapters) {
      let session: PromptApiSession | undefined;
      try {
        session = await adapter.create(promptSystem);
        const answer = await runPromptSession(session, promptInput);
        const translatedAnswer = enToKo ? await enToKo.translate(answer) : answer;
        if (!translatedAnswer.trim()) {
          throw new Error("온디바이스 번역 결과가 비어 있습니다.");
        }
        return translatedAnswer.trim();
      } catch (error) {
        lastError = error;
        console.warn(`[ChromeCanaryAI] ${adapter.name} prompt failed:`, error);
      } finally {
        await destroySession(session, `${adapter.name} prompt session`);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("지원되는 Prompt API 세션을 생성하지 못했습니다.");
  } finally {
    await Promise.all([
      destroySession(koToEn, "Korean-to-English translator"),
      destroySession(enToKo, "English-to-Korean translator"),
    ]);
  }
}
