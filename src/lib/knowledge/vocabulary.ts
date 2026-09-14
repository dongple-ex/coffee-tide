export interface SearchVocabularyGroup {
  canonical: string;
  aliases: string[];
}

export const DEFAULT_SEARCH_VOCABULARY: SearchVocabularyGroup[] = [
  { canonical: "회의", aliases: ["미팅", "회의록", "논의", "meeting"] },
  { canonical: "승인", aliases: ["결재", "검토", "확인", "approval"] },
  { canonical: "마감", aliases: ["기한", "데드라인", "due", "deadline"] },
  { canonical: "업무", aliases: ["할일", "할 일", "액션", "태스크", "task", "todo"] },
  { canonical: "알림", aliases: ["푸시", "통지", "notification", "notify"] },
  { canonical: "아카이브", aliases: ["보관", "저장", "완료문서", "archive"] },
  { canonical: "구글드라이브", aliases: ["구글 드라이브", "드라이브", "gdrive", "google drive"] },
  { canonical: "인공지능", aliases: ["ai", "제미나이", "gemini", "llm"] },
  { canonical: "비용", aliases: ["지출", "경비", "영수증", "expense"] },
  { canonical: "고객", aliases: ["클라이언트", "거래처", "customer", "client"] },
  { canonical: "일정", aliases: ["스케줄", "캘린더", "calendar", "schedule"] },
  { canonical: "보고서", aliases: ["리포트", "보고", "report"] },
];

const STOP_WORDS = new Set([
  "그리고", "그러나", "그래서", "대한", "위한", "관련", "내용",
  "있습니다", "합니다", "됩니다", "입니다", "하는", "있는", "없는", "이번", "해당", "현재",
  "the", "and", "for", "with", "from", "this", "that", "are", "was", "were",
]);

export function normalizeVocabularyTerm(value: string): string {
  return value
    .toLocaleLowerCase("ko-KR")
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenizeForSearch(value: string): string[] {
  return normalizeVocabularyTerm(value)
    .split(" ")
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
}

export function expandSearchTerms(
  query: string,
  vocabulary: SearchVocabularyGroup[] = DEFAULT_SEARCH_VOCABULARY
): string[] {
  const original = tokenizeForSearch(query);
  const normalizedQuery = normalizeVocabularyTerm(query);
  const expanded = new Set(original);

  for (const group of vocabulary) {
    const candidates = [group.canonical, ...group.aliases].map(normalizeVocabularyTerm);
    if (!candidates.some((candidate) => candidate && normalizedQuery.includes(candidate))) continue;
    for (const candidate of candidates) {
      for (const term of tokenizeForSearch(candidate)) expanded.add(term);
    }
  }
  return [...expanded].slice(0, 40);
}

export function extractArchiveKeywords(title: string, content: string, limit = 24): string[] {
  const weights = new Map<string, number>();
  const addTerms = (value: string, weight: number) => {
    for (const term of tokenizeForSearch(value)) {
      if (/^\d+$/.test(term)) continue;
      weights.set(term, (weights.get(term) ?? 0) + weight);
    }
  };

  addTerms(title, 5);
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) addTerms(trimmed.replace(/^#{1,6}\s+/, ""), 3);
    else addTerms(trimmed, 1);
  }

  return [...weights.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, Math.max(1, Math.min(limit, 40)))
    .map(([term]) => term);
}
