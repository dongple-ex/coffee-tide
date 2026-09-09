// 영문 두벌식(QWERTY) 오타 ➔ 한글 복원 유틸리티
// 예: "GKDL" / "gkdl" ➔ "하이", "dkssud" ➔ "안녕", "qmfldvld" ➔ "브리핑"

const CHOSUNG = [
  "r", "R", "s", "e", "E", "f", "a", "q", "Q", "t",
  "T", "d", "w", "W", "c", "z", "x", "v", "g",
];

const JUNGSUNG = [
  "k", "o", "i", "O", "j", "p", "u", "P", "h", "hk",
  "ho", "hl", "y", "n", "nj", "np", "nl", "b", "m", "ml", "l",
];

const JONGSUNG = [
  "", "r", "R", "rt", "s", "sw", "sg", "e", "f", "fr",
  "fa", "fq", "ft", "fx", "fv", "fg", "a", "q", "qt", "t",
  "T", "d", "w", "c", "z", "x", "v", "g",
];

// 복합 모음 조합 맵 (예: ㅗ + ㅏ = ㅘ)
const COMPLEX_VOWELS: Record<string, string> = {
  hk: "hk", // ㅘ
  ho: "ho", // ㅙ
  hl: "hl", // ㅚ
  nj: "nj", // ㅝ
  np: "np", // ㅞ
  nl: "nl", // ㅟ
  ml: "ml", // ㅢ
};

// 복합 받침 조합 맵 (예: ㄱ + ㅅ = ㄳ)
const COMPLEX_CONSONANTS: Record<string, string> = {
  rt: "rt", // ㄳ
  sw: "sw", // ㄵ
  sg: "sg", // ㄶ
  fr: "fr", // ㄺ
  fa: "fa", // ㄻ
  fq: "fq", // ㄼ
  ft: "ft", // ㄽ
  fx: "fx", // ㄾ
  fv: "fv", // ㄿ
  fg: "fg", // ㅀ
  qt: "qt", // ㅄ
};

// 단일 자음/모음 유니코드 변환 맵
const SINGLE_CONSONANTS: Record<string, string> = {
  r: "ㄱ", R: "ㄲ", s: "ㄴ", e: "ㄷ", E: "ㄸ", f: "ㄹ", a: "ㅁ",
  q: "ㅂ", Q: "ㅃ", t: "ㅅ", T: "ㅆ", d: "ㅇ", w: "ㅈ", W: "ㅉ",
  c: "ㅊ", z: "ㅋ", x: "ㅌ", v: "ㅍ", g: "ㅎ",
};

const SINGLE_VOWELS: Record<string, string> = {
  k: "ㅏ", o: "ㅐ", i: "ㅑ", O: "ㅒ", j: "ㅓ", p: "ㅔ", u: "ㅕ",
  P: "ㅖ", h: "ㅗ", y: "ㅛ", n: "ㅜ", b: "ㅠ", m: "ㅡ", l: "ㅣ",
};

function isVowelKey(char: string): boolean {
  return char in SINGLE_VOWELS;
}

function isConsonantKey(char: string): boolean {
  return char in SINGLE_CONSONANTS;
}

/**
 * 영타 두벌식 문자열을 한글 완성형 문자열로 변환합니다.
 * 알파벳 대소문자 중 Shift 키를 쓰는 이중 자음/모음(Q, W, E, R, T, O, P) 외에는 소문자 기준으로 처리합니다.
 */
export function convertEnglishToKoreanTypo(input: string): string {
  if (!input) return "";

  let result = "";
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    // 영문 알파벳이 아니면 그대로 통과
    if (!/^[a-zA-Z]$/.test(char)) {
      result += char;
      i++;
      continue;
    }

    // Shift 허용 키(Q, W, E, R, T, O, P)를 제외하고는 소문자로 정규화
    const normalizeKey = (c: string) => (/^[QWERTOP]$/.test(c) ? c : c.toLowerCase());
    const k1 = normalizeKey(input[i]);

    // 1. 모음으로 시작하는 경우 (단독 모음)
    if (isVowelKey(k1)) {
      // 복합 모음 확인 (예: hk -> ㅘ)
      if (i + 1 < input.length) {
        const k2 = normalizeKey(input[i + 1]);
        const compound = COMPLEX_VOWELS[k1 + k2];
        if (compound) {
          const vowelIndex = JUNGSUNG.indexOf(compound);
          if (vowelIndex >= 0) {
            result += String.fromCharCode(0x314f + vowelIndex);
            i += 2;
            continue;
          }
        }
      }
      result += SINGLE_VOWELS[k1] || k1;
      i++;
      continue;
    }

    // 2. 자음으로 시작하는 경우
    if (isConsonantKey(k1)) {
      const choIndex = CHOSUNG.indexOf(k1);
      // 다음 글자가 모음이 아니면 단독 자음
      if (i + 1 >= input.length || !isVowelKey(normalizeKey(input[i + 1]))) {
        result += SINGLE_CONSONANTS[k1] || k1;
        i++;
        continue;
      }

      // 모음 분석
      i++;
      const v1 = normalizeKey(input[i]);
      let jungKey = v1;
      let jungLen = 1;

      if (i + 1 < input.length) {
        const v2 = normalizeKey(input[i + 1]);
        if (isVowelKey(v2) && COMPLEX_VOWELS[v1 + v2]) {
          jungKey = v1 + v2;
          jungLen = 2;
        }
      }
      i += jungLen;

      const jungIndex = JUNGSUNG.indexOf(jungKey);
      if (choIndex < 0 || jungIndex < 0) {
        result += (SINGLE_CONSONANTS[k1] || k1) + (SINGLE_VOWELS[jungKey] || jungKey);
        continue;
      }

      // 받침(종성) 분석
      let jongKey = "";
      let jongLen = 0;

      if (i < input.length) {
        const c1 = normalizeKey(input[i]);
        if (isConsonantKey(c1)) {
          // c1 뒤에 모음이 오면 c1은 다음 음절의 초성이 되어야 함
          const nextIsVowel = i + 1 < input.length && isVowelKey(normalizeKey(input[i + 1]));
          if (!nextIsVowel) {
            // 복합 받침 가능성 확인 (예: rt -> ㄳ)
            if (i + 1 < input.length) {
              const c2 = normalizeKey(input[i + 1]);
              const nextNextIsVowel = i + 2 < input.length && isVowelKey(normalizeKey(input[i + 2]));
              if (isConsonantKey(c2) && COMPLEX_CONSONANTS[c1 + c2] && !nextNextIsVowel) {
                jongKey = c1 + c2;
                jongLen = 2;
              } else {
                jongKey = c1;
                jongLen = 1;
              }
            } else {
              jongKey = c1;
              jongLen = 1;
            }
          }
        }
      }

      const jongIndex = JONGSUNG.indexOf(jongKey);
      const safeJongIndex = jongIndex >= 0 ? jongIndex : 0;
      const syllableCode = 0xac00 + (choIndex * 21 + jungIndex) * 28 + safeJongIndex;
      result += String.fromCharCode(syllableCode);
      i += jongLen;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * 텍스트가 영문 자판 오타로 작성된 것으로 의심되는지 판별하고 복원합니다.
 * 알파벳 비율이 높고 변환 후 완성형 한글이 1자 이상 생성되는 경우 변환 텍스트를 반환합니다.
 */
export function resolveHangulTypoIfNeeded(input: string): {
  isTypo: boolean;
  corrected: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { isTypo: false, corrected: input };

  // 이미 한글이 포함되어 있거나 일반 영문 문장인 경우
  const hasHangul = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(trimmed);
  if (hasHangul) return { isTypo: false, corrected: input };

  // 오직 영문 알파벳/공백/일부 문장부호로만 이루어진 경우
  if (!/^[a-zA-Z\s!?.~,]+$/.test(trimmed)) {
    return { isTypo: false, corrected: input };
  }

  const converted = convertEnglishToKoreanTypo(trimmed);
  const convertedHangulCount = (converted.match(/[가-힣]/g) || []).length;

  // 완성형 한글이 생성되었고, 원본과 의미 있는 차이가 있는 경우 오타로 판정
  if (convertedHangulCount >= 1 && converted !== trimmed) {
    return { isTypo: true, corrected: converted };
  }

  return { isTypo: false, corrected: input };
}
