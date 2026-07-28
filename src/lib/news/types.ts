// 커스텀 사이트 위젯이 주고받는 공용 타입.
// 서버 라우트 모듈을 클라이언트 컴포넌트에서 import 하지 않도록 여기로 분리한다.

/** 본문을 어디까지 확보했는지 — UI에서 신뢰도 배지로 노출한다. */
export type ContentDepth = "full" | "meta" | "title";

export interface CustomNewsItem {
  id: string;
  title: string;
  /** 줄글 리드 요약 (원문 방문 없이 읽는 본문 핵심) */
  summary: string;
  /** 숫자·근거·전망 위주의 핵심 팩트 불릿 */
  points: string[];
  date: string;
  url: string;
  /** 본문 확보 수준 */
  depth: ContentDepth;
  /** 확보한 원문 글자 수 (요약 신뢰도 판단용) */
  chars: number;
}

export interface SiteBriefing {
  /** 사이트 전체 한 줄 총평 */
  headline: string;
  /** 지금 알아야 할 핵심 3~4가지 */
  keyPoints: string[];
}

export interface CustomNewsResponse {
  success: boolean;
  siteName: string;
  autoSiteName?: string;
  url: string;
  /** 실제로 사용한 피드 주소 (RSS 자동 탐지 결과) */
  feedUrl?: string;
  /** 수집 방식 — UI 진단 메시지에 사용 */
  strategy?: "feed" | "youtube" | "html";
  articles: CustomNewsItem[];
  briefing?: SiteBriefing;
  /** Gemini 요약을 실제로 사용했는지 */
  aiUsed?: boolean;
  cached?: boolean;
  /** 실패 사유 (success=false) */
  reason?: string;
  /** 사용자가 취할 수 있는 다음 행동 안내 */
  hint?: string;
}

/** 사이트 추가 전 연결 검증(preview) 응답 */
export interface CustomSitePreview {
  success: boolean;
  siteName: string;
  url: string;
  count: number;
  sampleTitles: string[];
  strategy?: "feed" | "youtube" | "html";
  feedUrl?: string;
  reason?: string;
  hint?: string;
}
