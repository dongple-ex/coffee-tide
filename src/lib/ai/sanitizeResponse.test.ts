import { describe, expect, it } from "vitest";
import {
  compressRepeatedDots,
  hasDegeneratedCharLoop,
  hasKatakanaGlitch,
  isSeverelyDegenerated,
  sanitizeAiResponse,
} from "./sanitizeResponse";

describe("sanitizeResponse", () => {
  it("compresses multiple dots to standard ellipsis", () => {
    expect(compressRepeatedDots("잠시만요 . . . . . . . . 기다려주세요")).toBe(
      "잠시만요 ... 기다려주세요"
    );
  });

  it("detects character repetition loop", () => {
    expect(hasDegeneratedCharLoop("エバババババババ")).toBe(true);
    expect(hasDegeneratedCharLoop("우우우우우우우")).toBe(true);
    // 자연스러운 한글 감정 표현은 예외
    expect(hasDegeneratedCharLoop("ㅋㅋㅋㅋㅋㅋㅋㅋ")).toBe(false);
    expect(hasDegeneratedCharLoop("ㅎㅎㅎㅎㅎㅎ")).toBe(false);
    expect(hasDegeneratedCharLoop("ㅠㅠㅠㅠㅠㅠ")).toBe(false);
  });

  it("detects unwanted katakana glitch", () => {
    expect(hasKatakanaGlitch("에스파이즈? エバババババババウウウウウウウカ")).toBe(true);
    expect(hasKatakanaGlitch("정상적인 한국어 답변입니다.")).toBe(false);
  });

  it("sanitizes severely degenerated user reported text to clean fallback", () => {
    const userReportedGlitch =
      '나비, 에스파이즈? 😅 정작 가사 . . . . . . . . . . . . 궨시신가우? 😊 , "GKDL"이 エバババババババウウウウウウウカ, "GKDL"이 . 이모티콘은 가사 의미: . . . . . . 마이트 가사 😄 😄 . 에스메이트. ☕️';

    const sanitized = sanitizeAiResponse(userReportedGlitch);
    expect(isSeverelyDegenerated(userReportedGlitch)).toBe(true);
    expect(sanitized).toContain("안녕하세요! 친근한 AI 바리스타입니다.");
  });

  it("preserves normal responses", () => {
    const normal = "안녕하세요! 오늘 준비된 주요 일정은 3건입니다. ☕";
    expect(sanitizeAiResponse(normal)).toBe(normal);
  });
});
