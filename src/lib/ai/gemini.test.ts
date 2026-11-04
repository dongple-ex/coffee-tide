import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { askCopilot, generateGeminiContent, resetGeminiCooldown } from "./gemini";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("generateGeminiContent model fallback & GEMINI_MODEL override", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    resetGeminiCooldown();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GEMINI_API_KEY", "test-api-key");
    vi.stubEnv("GEMINI_MODEL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    resetGeminiCooldown();
  });

  it("falls back to gemini-3.5-flash-lite when gemini-flash-latest returns 503", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 503, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } },
          503
        )
      )
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: "실제 Gemini 폴백 응답입니다." }] } }],
        })
      );

    const result = await askCopilot("오늘 일정 알려줘", [], "Asia/Seoul", undefined, undefined, {
      mode: "social",
    });

    expect(result.aiUsed).toBe(true);
    expect(result.answer).toContain("실제 Gemini 폴백 응답입니다.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/models/gemini-flash-latest:generateContent");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/models/gemini-3.5-flash-lite:generateContent");
  });

  it("falls back to secondary models when a deprecated model returns 404", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 404, status: "NOT_FOUND" } }, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: "대체 모델 성공" }] } }],
        })
      );

    const res = await generateGeminiContent(
      { contents: [{ parts: [{ text: "hello" }] }] },
      { model: "gemini-2.5-flash" }
    );

    expect(res.candidates?.[0]?.content?.parts?.[0]?.text).toBe("대체 모델 성공");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/models/gemini-2.5-flash:generateContent");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/models/gemini-3.5-flash-lite:generateContent");
  });

  it("honors GEMINI_MODEL environment variable without duplicating fallback calls", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { code: 503 } }, 503))
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [{ content: { parts: [{ text: "두 번째 폴백 성공" }] } }],
        })
      );

    const res = await generateGeminiContent({ contents: [{ parts: [{ text: "ping" }] }] });

    expect(res.candidates?.[0]?.content?.parts?.[0]?.text).toBe("두 번째 폴백 성공");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/models/gemini-3.5-flash-lite:generateContent");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/models/gemini-flash-lite-latest:generateContent");
  });

  it("fails fast without model fallback on 400 invalid request or 429 quota exceeded", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 400 } }, 400));
    await expect(generateGeminiContent({ contents: [] })).rejects.toThrow(/Gemini 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: 429 } }, 429));
    await expect(generateGeminiContent({ contents: [] })).rejects.toThrow("quota exceeded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
