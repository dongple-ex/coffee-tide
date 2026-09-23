import { describe, it, expect } from "vitest";
import {
  cleanTextForSpeech,
  getPersonaVoiceConfig,
  getEdgePersonaVoiceConfig,
  findKoreanVoice,
} from "./voiceUtils";

describe("voiceUtils", () => {
  describe("getPersonaVoiceConfig", () => {
    it("returns specific pitch and rate for known presets", () => {
      const karina = getPersonaVoiceConfig("karina");
      expect(karina.pitch).toBeGreaterThan(1.0);
      expect(karina.preferredGender).toBe("female");

      const secretary = getPersonaVoiceConfig("secretary");
      expect(secretary.pitch).toBeLessThan(1.0);
      expect(secretary.preferredGender).toBe("male");

      const pm = getPersonaVoiceConfig("pm");
      expect(pm.rate).toBeGreaterThan(1.1);

      const def = getPersonaVoiceConfig(undefined);
      expect(def.pitch).toBe(1.0);
      expect(def.rate).toBe(1.0);
    });
  });

  describe("getEdgePersonaVoiceConfig", () => {
    it("returns appropriate neural voice and rate/pitch for presets", () => {
      const karina = getEdgePersonaVoiceConfig("karina");
      expect(karina.voice).toBe("ko-KR-SunHiNeural");
      expect(karina.pitch).toBe("+6Hz");

      const secretary = getEdgePersonaVoiceConfig("secretary");
      expect(secretary.voice).toBe("ko-KR-InJoonNeural");
      expect(secretary.rate).toBe("-5%");

      const pm = getEdgePersonaVoiceConfig("pm");
      expect(pm.rate).toBe("+25%");

      const def = getEdgePersonaVoiceConfig(undefined);
      expect(def.voice).toBe("ko-KR-SunHiNeural");
      expect(def.rate).toBe("+0%");
    });
  });

  describe("cleanTextForSpeech", () => {
    it("removes markdown headers, quotes, and bullet points", () => {
      const input = `# 헤더 1\n> 중요한 안내입니다.\n- 첫 번째 항목\n1. 두 번째 항목`;
      const result = cleanTextForSpeech(input);
      expect(result).toBe("헤더 1 중요한 안내입니다. 첫 번째 항목 두 번째 항목");
    });

    it("removes persona action stage directions like *미소 짓는다* and (*속마음: ...*)", () => {
      const input = `안녕하세요 팀장님! *미소 지으며 커피를 건넨다* 오늘 일정 확인해보세요. (*속마음: 칼퇴하고 싶다*)`;
      const result = cleanTextForSpeech(input);
      expect(result).not.toContain("미소 지으며");
      expect(result).not.toContain("속마음");
      expect(result).toContain("안녕하세요 팀장님!");
      expect(result).toContain("오늘 일정 확인해보세요.");
    });

    it("strips code blocks, tables, and links", () => {
      const input = "코드는 다음과 같습니다:\n```js\nconsole.log('hi');\n```\n자세한 것은 [링크](https://example.com)를 참조하세요.";
      const result = cleanTextForSpeech(input);
      expect(result).not.toContain("console.log");
      expect(result).not.toContain("https://");
      expect(result).toContain("링크를 참조하세요");
    });

    it("handles empty or falsy text gracefully", () => {
      expect(cleanTextForSpeech("")).toBe("");
    });
  });

  describe("findKoreanVoice", () => {
    it("selects Korean voice matching preferred gender if available", () => {
      const mockVoices = [
        { name: "Alex", lang: "en-US", default: true } as SpeechSynthesisVoice,
        { name: "Microsoft Heami - Korean", lang: "ko-KR", default: false } as SpeechSynthesisVoice,
        { name: "Microsoft InJoon - Korean", lang: "ko-KR", default: false } as SpeechSynthesisVoice,
      ];

      const female = findKoreanVoice(mockVoices, "female");
      expect(female?.name).toContain("Heami");

      const male = findKoreanVoice(mockVoices, "male");
      expect(male?.name).toContain("InJoon");

      const fallback = findKoreanVoice(mockVoices);
      expect(fallback?.lang).toBe("ko-KR");
    });

    it("returns null or fallback if no voices", () => {
      expect(findKoreanVoice([])).toBeNull();
    });
  });
});
