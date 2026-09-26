// 음성 대화 텍스트 정제 및 페르소나별 음성 튜닝 유틸리티

export interface PersonaVoiceConfig {
  pitch: number;
  rate: number;
  preferredGender?: "female" | "male";
}

/** 페르소나 프리셋별 권장 음높이(pitch), 발화속도(rate), 성별 매핑 */
export function getPersonaVoiceConfig(presetId?: string): PersonaVoiceConfig {
  switch (presetId) {
    case "karina":
      return { pitch: 1.2, rate: 1.05, preferredGender: "female" };
    case "secretary": // 김부장
    case "kim":
      return { pitch: 0.85, rate: 0.95, preferredGender: "male" };
    case "pm": // 칼퇴봇
      return { pitch: 1.0, rate: 1.25 };
    case "senior_dev": // 테드
      return { pitch: 0.9, rate: 1.0, preferredGender: "male" };
    case "ropan": // 베아트리체
      return { pitch: 1.15, rate: 0.95, preferredGender: "female" };
    case "fantasy_mage": // 루미엘
      return { pitch: 1.05, rate: 0.9, preferredGender: "female" };
    case "detective": // 셜록
      return { pitch: 0.95, rate: 1.05, preferredGender: "male" };
    case "cheerleader": // 캡틴 준
    case "fitness": // 이전 저장값 호환
      return { pitch: 0.8, rate: 1.0, preferredGender: "male" };
    case "doggo": // 뽀삐
    case "poppy": // 이전 저장값 호환
      return { pitch: 1.3, rate: 1.15 };
    case "cat_master": // 미야
    case "cat": // 이전 저장값 호환
      return { pitch: 1.25, rate: 1.1 };
    default:
      return { pitch: 1.0, rate: 1.0 };
  }
}

export interface EdgePersonaVoiceConfig {
  voice: "ko-KR-SunHiNeural" | "ko-KR-InJoonNeural";
  rate: string;
  pitch: string;
}

/** Edge-TTS (Azure Neural Voice) 페르소나별 화자 및 피치/속도 매핑 */
export function getEdgePersonaVoiceConfig(presetId?: string): EdgePersonaVoiceConfig {
  switch (presetId) {
    case "secretary": // 김부장
    case "kim":
      return { voice: "ko-KR-InJoonNeural", rate: "-5%", pitch: "-8Hz" };
    case "senior_dev": // 테드
      return { voice: "ko-KR-InJoonNeural", rate: "+0%", pitch: "-4Hz" };
    case "cheerleader": // 캡틴 준
    case "fitness": // 이전 저장값 호환
      return { voice: "ko-KR-InJoonNeural", rate: "+5%", pitch: "-10Hz" };
    case "detective": // 셜록
      return { voice: "ko-KR-InJoonNeural", rate: "+5%", pitch: "-2Hz" };
    case "pm": // 칼퇴봇
      return { voice: "ko-KR-SunHiNeural", rate: "+25%", pitch: "+0Hz" };
    case "doggo": // 뽀삐
    case "poppy": // 이전 저장값 호환
      return { voice: "ko-KR-SunHiNeural", rate: "+12%", pitch: "+15Hz" };
    case "cat_master": // 미야
    case "cat": // 이전 저장값 호환
      return { voice: "ko-KR-SunHiNeural", rate: "+8%", pitch: "+12Hz" };
    case "ropan": // 베아트리체
      return { voice: "ko-KR-SunHiNeural", rate: "-5%", pitch: "+4Hz" };
    case "fantasy_mage": // 루미엘
      return { voice: "ko-KR-SunHiNeural", rate: "-5%", pitch: "+2Hz" };
    case "karina": // 카리나
      return { voice: "ko-KR-SunHiNeural", rate: "+5%", pitch: "+6Hz" };
    default:
      return { voice: "ko-KR-SunHiNeural", rate: "+0%", pitch: "+0Hz" };
  }
}

/**
 * TTS 음성 출력을 위해 마크다운 문법 및 페르소나 지문/속마음을 제거하고 순수 대사만 남깁니다.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return "";

  let cleaned = text;

  // 1. 코드 블록 및 인라인 코드 제거
  cleaned = cleaned.replace(/```[\s\S]*?```/g, "");
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // 2. 표 (테이블) 마크다운 제거 (| 헤더 | ... | 형태)
  cleaned = cleaned.replace(/^\|.*\|$/gm, "");

  // 3. 행동 지문 제거 (예: *미소 지으며 커피잔을 건넨다*, (*속마음: 칼퇴하고 싶다*), (*안경을 고쳐 쓰며*))
  cleaned = cleaned.replace(/\(\*[\s\S]*?\*\)/g, ""); // (*...*)
  cleaned = cleaned.replace(/\*\*([^*\n]+)\*\*/g, "$1"); // **강조**는 대사 유지
  cleaned = cleaned.replace(/(?<!\*)\*[^*\n]+\*(?!\*)/g, ""); // *...*
  cleaned = cleaned.replace(/\([^(|\n]*속마음:[^)]*\)/gi, ""); // (속마음: ...)

  // 4. 시스템/대괄호 태그 제거 (예: [시스템 가동], [칼퇴 필수 1] -> 칼퇴 필수 1)
  cleaned = cleaned.replace(/\[시스템[^\]]*\]/gi, "");
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // 마크다운 링크 [텍스트](url) -> 텍스트
  cleaned = cleaned.replace(/\[([^\]]+)\]/g, "$1"); // 단순 대괄호 -> 내부 텍스트만

  // 5. 마크다운 제목 기호(#), 인용문(>), 목록 불릿(-, *, +) 제거
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, "");
  cleaned = cleaned.replace(/^>\s*/gm, "");
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, "");
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, "");

  // 6. 강조 기호 제거 (**, __)
  cleaned = cleaned.replace(/[*_]{2,}([^*_]+)[*_]{2,}/g, "$1");

  // 7. URL 제거
  cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, "");

  // 8. 과도한 특수문자/구분선 제거
  cleaned = cleaned.replace(/[-=_]{3,}/g, " ");

  // 9. 이모지 일부 및 특수문자 축소 (말투에 영향 없는 장식용 특수문자)
  cleaned = cleaned.replace(/[•■◆▶◀▲▼✨🚀💼⚡💻🥀🪄🔍🔥🐶🐾☕⭐]/g, "");

  // 10. 연속 공백 및 줄바꿈 정리
  cleaned = cleaned.replace(/\n+/g, " ");
  cleaned = cleaned.replace(/\s{2,}/g, " ");

  return cleaned.trim();
}

/**
 * 브라우저에 등록된 한국어 음성(SpeechSynthesisVoice) 중 최적의 음성을 탐색합니다.
 */
export function findKoreanVoice(
  voices: SpeechSynthesisVoice[],
  preferredGender?: "female" | "male"
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  const koreanVoices = voices.filter(
    (v) => v.lang.startsWith("ko") || v.lang.replace("_", "-").startsWith("ko")
  );

  if (koreanVoices.length === 0) {
    // 한국어 음성이 없으면 default 음성
    return voices.find((v) => v.default) || voices[0] || null;
  }

  if (preferredGender === "female") {
    const female = koreanVoices.find(
      (v) =>
        /yuna|heami|sunhi|female|여성|혜미|유나/i.test(v.name)
    );
    if (female) return female;
  } else if (preferredGender === "male") {
    const male = koreanVoices.find(
      (v) =>
        /injoon|male|남성|인준/i.test(v.name)
    );
    if (male) return male;
  }

  // 기본적으로 첫 번째 한국어 음성 반환
  return koreanVoices[0];
}
