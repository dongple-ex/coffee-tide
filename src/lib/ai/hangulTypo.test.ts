import { describe, expect, it } from "vitest";
import {
  convertEnglishToKoreanTypo,
  resolveHangulTypoIfNeeded,
} from "./hangulTypo";

describe("hangulTypo", () => {
  describe("convertEnglishToKoreanTypo", () => {
    it("converts uppercase 'GKDL' to '하이'", () => {
      expect(convertEnglishToKoreanTypo("GKDL")).toBe("하이");
    });

    it("converts lowercase 'gkdl' to '하이'", () => {
      expect(convertEnglishToKoreanTypo("gkdl")).toBe("하이");
    });

    it("converts 'dkssud' to '안녕'", () => {
      expect(convertEnglishToKoreanTypo("dkssud")).toBe("안녕");
    });

    it("converts 'qmflvld' to '브리핑'", () => {
      expect(convertEnglishToKoreanTypo("qmflvld")).toBe("브리핑");
    });

    it("preserves non-alphabet characters and spaces", () => {
      expect(convertEnglishToKoreanTypo("gkdl! rkatkgo~")).toBe("하이! 감사해~");
    });
  });

  describe("resolveHangulTypoIfNeeded", () => {
    it("detects and corrects 'GKDL'", () => {
      const result = resolveHangulTypoIfNeeded("GKDL");
      expect(result.isTypo).toBe(true);
      expect(result.corrected).toBe("하이");
    });

    it("detects and corrects 'dkssud'", () => {
      const result = resolveHangulTypoIfNeeded("dkssud");
      expect(result.isTypo).toBe(true);
      expect(result.corrected).toBe("안녕");
    });

    it("leaves Korean text unchanged", () => {
      const result = resolveHangulTypoIfNeeded("안녕하세요");
      expect(result.isTypo).toBe(false);
      expect(result.corrected).toBe("안녕하세요");
    });

    it("leaves empty or whitespace input unchanged", () => {
      const result = resolveHangulTypoIfNeeded("   ");
      expect(result.isTypo).toBe(false);
    });
  });
});
