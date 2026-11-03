import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ask: vi.fn(), kanana: vi.fn(), fallback: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./gemini", () => ({ askCopilot: mocks.ask }));
vi.mock("./kanana", () => ({ askKananaCopilot: mocks.kanana, kananaFallback: mocks.fallback }));
import { generateCopilotReply } from "./copilotService";
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("COPILOT_AI_PROVIDER", ""); });
afterEach(() => { vi.unstubAllEnvs(); });
it("preserves model and tool metadata while parsing companion output for both channels", async () => {
  mocks.ask.mockResolvedValue({ answer: JSON.stringify({ message: "안녕하세요", narration: "미소", suggestions: [{ label: "대화하기", action: "send_prompt", payload: { prompt: "대화하기" } }] }), aiUsed: true,
    cloudToolDraft: { toolId: "draft" } });
  const result = await generateCopilotReply("안녕", [], "Asia/Seoul");
  expect(result.answer).toBe("안녕하세요");
  expect(result.aiUsed).toBe(true);
  expect(result.providerUsed).toBe("gemini_cloud");
  expect(result.cloudToolDraft).toEqual({ toolId: "draft" });
  expect(result.suggestions).toEqual([expect.objectContaining({ label: "대화하기", action: "send_prompt", payload: { prompt: "대화하기" } })]);
});

it("routes both channels to Kanana without passing tool authority or invoking Gemini", async () => {
  vi.stubEnv("COPILOT_AI_PROVIDER", "kanana");
  mocks.kanana.mockResolvedValue({ answer: "실제 응답 형식의 시험 문구", aiUsed: true, providerUsed: "kanana", contextItemIds: ["item"] });
  const options = { mode: "work" as const, allowCloudTools: true };
  const result = await generateCopilotReply("요약해줘", [], "Asia/Seoul", undefined, { userId: "alice" }, options);
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.kanana).toHaveBeenCalledWith("요약해줘", [], "Asia/Seoul", undefined, options);
  expect(result).toMatchObject({ aiUsed: true, providerUsed: "kanana", contextItemIds: ["item"] });
});

it("preserves an explicit Kanana failure as a local fallback without a second provider call", async () => {
  vi.stubEnv("COPILOT_AI_PROVIDER", "kanana");
  mocks.kanana.mockResolvedValue({ answer: "카나나 연결 실패. 대체 응답입니다.", aiUsed: false,
    providerUsed: "local_rules", fallbackReason: "timeout" });
  expect(await generateCopilotReply("안녕", [], "Asia/Seoul")).toMatchObject({
    aiUsed: false, providerUsed: "local_rules", fallbackReason: "timeout",
  });
  expect(mocks.ask).not.toHaveBeenCalled();
});

it("fails closed for an unknown provider instead of silently sending data to Gemini", async () => {
  vi.stubEnv("COPILOT_AI_PROVIDER", "kananna");
  mocks.fallback.mockReturnValue({ answer: "설정을 확인해 주세요.", aiUsed: false, providerUsed: "local_rules", fallbackReason: "invalid_config" });
  expect(await generateCopilotReply("질문", [], "Asia/Seoul")).toMatchObject({ aiUsed: false, fallbackReason: "invalid_config" });
  expect(mocks.ask).not.toHaveBeenCalled();
  expect(mocks.kanana).not.toHaveBeenCalled();
});
