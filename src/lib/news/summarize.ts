// 수집한 원문 → '원문을 안 열어도 되는' 요약으로 압축하는 로컬 요약기.
//
// 기존 요약기는 조건에 맞는 문장 2~3개를 순서대로 이어 붙이기만 해서
// 리드 문장이 빠지거나 "~에 관한 실시간 핵심 아티클 소식입니다" 같은 껍데기 문구가 남았다.
// 여기서는 ① 문장 점수화로 리드 요약 ② 숫자·근거·전망 팩트 불릿을 분리해 뽑는다.
// GEMINI_API_KEY가 있으면 라우트가 이 결과를 AI 요약으로 대체하고, 없으면 이 결과가 그대로 쓰인다.

import { isBoilerplateText } from "./htmlParse";
import type { CustomNewsItem, SiteBriefing } from "./types";

export interface LocalSummary {
  summary: string;
  points: string[];
  /** 원문 자체가 부실해 제목 수준의 정보만 확보한 경우 */
  weak?: boolean;
}

const CUE_WORDS =
  /(발표|공개|밝혔다|전망|예상|계획|결정|합의|출시|도입|확대|축소|증가|감소|상승|하락|급등|급락|원인|이유|때문|영향|배경|의미|분석|지적|강조|추진|시행|적용|개선|전환|성장|기록|돌파|체결|인수|투자|규제|허용|금지)/;
const NUMBER_PAT = /(\d[\d,.]*\s*(%|퍼센트|원|달러|엔|위안|억|조|만|천|배|명|건|년|개월|주|일|시간|pt|포인트|bp|km|kg|GB|TB))|(\d[\d,.]{2,})/;
const QUOTE_ONLY = /^["“'‘][^"”'’]{0,40}["”'’]\.?$/;
const REPORTER_TAIL = /(기자|특파원|=\s*뉴스|뉴시스|연합뉴스|사진=|자료=|영상=|[a-z0-9._%+-]+@[a-z0-9.-]+)/i;

/** 한국어/영문 혼용 문장 분리 */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。！？])\s+|(?<=다\.)\s*|(?<=요\.)\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tokensOf(text: string): string[] {
  return text
    .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreSentence(sentence: string, index: number, total: number, titleTokens: Set<string>): number {
  let score = 0;

  // 리드 우선 — 기사 앞부분일수록 핵심일 확률이 높다.
  score += Math.max(0, 3 - index * 0.35);

  if (NUMBER_PAT.test(sentence)) score += 2.2;
  if (CUE_WORDS.test(sentence)) score += 1.6;

  const overlap = tokensOf(sentence).filter((t) => titleTokens.has(t)).length;
  score += Math.min(overlap, 4) * 0.6;

  const len = sentence.length;
  if (len >= 30 && len <= 180) score += 1;
  if (len < 20) score -= 2;
  if (len > 260) score -= 1.5;

  if (QUOTE_ONLY.test(sentence)) score -= 1.5;
  if (REPORTER_TAIL.test(sentence)) score -= 2;
  if (index >= total - 2) score -= 0.8; // 말미 상용구 회피

  return score;
}

function usableSentences(text: string): string[] {
  return splitSentences(text).filter(
    (s) => s.length >= 18 && s.length <= 400 && !isBoilerplateText(s) && !/^[\W_]+$/.test(s)
  );
}

/**
 * 리드 요약(줄글) + 핵심 팩트 불릿을 분리 생성한다.
 * summary는 "무슨 일인지", points는 "숫자·근거·전망"을 담당한다.
 */
export function summarizeLocally(title: string, fullText: string, maxChars = 460): LocalSummary {
  const text = (fullText || "").trim();
  if (text.length < 60) {
    return { summary: text, points: [], weak: true };
  }

  const sentences = usableSentences(text);
  if (sentences.length === 0) {
    return { summary: text.slice(0, maxChars), points: [], weak: text.length < 120 };
  }

  const titleTokens = new Set(tokensOf(title));
  const scored = sentences.map((s, i) => ({
    s,
    i,
    score: scoreSentence(s, i, sentences.length, titleTokens),
  }));

  // ① 리드 요약: 상위 3문장을 원문 순서로 재배열해 읽기 흐름을 살린다.
  const leadPicked = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .sort((a, b) => a.i - b.i);

  let summary = "";
  const usedIdx = new Set<number>();
  for (const item of leadPicked) {
    const next = summary ? `${summary} ${item.s}` : item.s;
    if (next.length > maxChars && summary) break;
    summary = next;
    usedIdx.add(item.i);
  }
  if (!summary) summary = sentences[0].slice(0, maxChars);

  // ② 핵심 팩트: 요약에 쓰이지 않은 문장 중 숫자/근거/전망을 담은 것만.
  const points = [...scored]
    .filter((x) => !usedIdx.has(x.i))
    .filter((x) => NUMBER_PAT.test(x.s) || CUE_WORDS.test(x.s))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .sort((a, b) => a.i - b.i)
    .map((x) => trimPoint(x.s))
    .filter((p, i, arr) => p.length >= 12 && arr.indexOf(p) === i);

  return { summary: summary.trim(), points, weak: summary.trim().length < 80 && points.length === 0 };
}

function trimPoint(sentence: string): string {
  const s = sentence.replace(/^[-•·\s]+/, "").trim();
  if (s.length <= 110) return s;
  const cut = s.slice(0, 108);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 60 ? cut.slice(0, lastSpace) : cut}…`;
}

/* ------------------------------------------------------------------ */
/* 유튜브 — 설명란은 광고/링크가 대부분이라 별도 정제가 필요하다             */
/* ------------------------------------------------------------------ */

const PROMO_LINE =
  /(구독|좋아요|알림\s*설정|알림설정|문의|협찬|광고|제휴|예약|구매|판매|바로가기|할인|특가|핫딜|세일|쿠폰|이벤트|무료체험|체험단|앱\s*설치|다운로드|고객센터|instagram|facebook|telegram|카카오톡|네이버\s*카페|link\.|onelink|apps\.|\d{2,4}-\d{3,4}-\d{4}|[\w.]+@[\w.]+)/i;
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/u;
const TIMESTAMP_LINE = /^\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–~|:]?\s*(.{2,80})$/;

/**
 * 설명란 한 줄이 '내용'인지 '홍보'인지 가른다.
 * 경제 유튜브 설명란은 대부분 이모지 + 링크 + 상품 광고라, 문장다움을 요구하는 편이 정확하다.
 */
function isContentLine(line: string): boolean {
  if (line.length < 25) return false;
  if (PROMO_LINE.test(line)) return false;
  if (EMOJI.test(line)) return false;
  if (/^[^가-힣A-Za-z]/.test(line)) return false;
  const density = line.replace(/[^0-9A-Za-z가-힣]/g, "").length / line.length;
  return density > 0.6;
}

/** 줄바꿈이 사라진 RSS 설명도 구분자 기준으로 다시 줄 단위로 쪼갠다. */
function descriptionLines(description: string): string[] {
  return description
    .replace(/https?:\/\/\S+/g, " ")
    .split(/\n|={3,}|-{4,}|―{3,}|•|▶|👉/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** 링크·구독 유도·해시태그를 걷어낸 '실제 설명' 텍스트 */
export function cleanYoutubeDescription(description: string): string {
  if (!description) return "";
  return descriptionLines(description)
    .filter(isContentLine)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 영상 요약 — 설명 본문은 줄글로, 타임스탬프 목차는 핵심 포인트로 분리한다.
 * (목차는 '이 영상에서 무엇을 다루는지'를 가장 정확히 알려주는 신호다)
 */
export function summarizeVideo(title: string, description: string): LocalSummary {
  const lines = descriptionLines(description);

  const chapters: string[] = [];
  const prose: string[] = [];
  for (const line of lines) {
    const chapter = line.match(TIMESTAMP_LINE);
    if (chapter) {
      const topic = chapter[2].replace(/^[-–~|:\s]+/, "").trim();
      if (topic.length >= 2 && !PROMO_LINE.test(topic)) chapters.push(`${chapter[1]} ${topic}`);
      continue;
    }
    if (isContentLine(line)) prose.push(line);
  }

  const body = prose.join(" ").replace(/\s+/g, " ").trim();

  if (chapters.length > 0) {
    return {
      summary: body ? body.slice(0, 400) : `영상 목차 기준 ${chapters.length}개 주제를 다룹니다.`,
      points: chapters.slice(0, 6),
    };
  }

  if (body.length >= 60) return summarizeLocally(title, body, 400);

  // 설명란이 광고·링크뿐인 채널(경제 방송에 흔함) — 없는 내용을 지어내지 않고
  // 제목에서 확실히 읽히는 사실(주제·출연자·코너)만 정리해 준다.
  const facts = titleFacts(title);
  return {
    summary: "설명란이 홍보·링크뿐이라, 제목에서 확인되는 정보만 정리했습니다.",
    points: facts,
    weak: true,
  };
}

const SPEAKER_ROLE =
  /(대표|센터장|교수|위원|이사|애널리스트|박사|소장|본부장|팀장|CEO|의원|회장|사장|연구원|변호사|기자)/;

function titleFacts(title: string): string[] {
  const facts: string[] = [];
  const program = title.match(/\[([^\]]{2,30})\]/)?.[1];
  const stripped = title.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const segments = stripped
    .split(/[ㅣ|｜/]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const speaker = segments.find((s) => SPEAKER_ROLE.test(s) && s.length <= 40);
  const topic = segments.find((s) => s !== speaker) || stripped;

  if (topic) facts.push(`다루는 주제: ${topic}`);
  if (speaker) facts.push(`출연: ${speaker}`);
  if (program) facts.push(`코너/프로그램: ${program}`);
  return facts;
}

/**
 * AI 없이도 쓸 수 있는 사이트 전체 브리핑.
 * 수집된 기사들의 리드에서 가장 정보량이 큰 문장을 뽑아 '지금 핵심'을 구성한다.
 */
export function buildLocalBriefing(siteName: string, items: CustomNewsItem[]): SiteBriefing {
  const solid = items.filter((i) => i.depth !== "title");
  const headline =
    solid.length > 0
      ? `${siteName} 최신 ${items.length}건 — 지금 가장 먼저 볼 건 「${solid[0].title}」입니다.`
      : `${siteName}에서 최신 ${items.length}건을 가져왔습니다. 본문 확보가 제한되어 제목 위주로 정리했습니다.`;

  const keyPoints = items.slice(0, 4).map((item) => {
    const firstFact =
      item.points[0] ||
      splitSentences(item.summary).find((s) => s.length >= 25) ||
      item.summary ||
      "본문 요약을 확보하지 못했습니다.";
    return `${item.title} — ${trimPoint(firstFact)}`;
  });

  return { headline, keyPoints };
}
