import { NextResponse } from "next/server";

export interface ThreeProVideo {
  id: string;
  title: string;
  summary: string;
  category: string;
  date: string;
  url: string;
  speaker?: string;
}

// 30분 유효 서버 캐시
let cachedVideos: ThreeProVideo[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET() {
  const now = Date.now();
  if (cachedVideos && now - lastCacheTime < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, videos: cachedVideos, cached: true });
  }

  try {
    // 삼프로TV (3Pro TV - 경제의 신들과 함께) 최신 영상 브리핑 데이터
    const mockVideos: ThreeProVideo[] = [
      {
        id: "yt-3pro-1",
        title: "[삼프로TV] 2026 하반기 증시 핫이슈: 반도체 주도주와 금리 인하 수혜주 분석",
        summary: "미국 연준의 금리 향방과 글로벌 반도체 밸류체인 실적 발표를 앞두고 코스피·코스닥 시장의 주요 수혜 업종을 집중 진단합니다.",
        category: "증시·시황",
        date: "오늘",
        speaker: "김프로 / 이진우 / 정영진",
        url: "https://www.youtube.com/@3ProTV",
      },
      {
        id: "yt-3pro-2",
        title: "[글로벌 마켓 심층] 빅테크 AI 투자 2차전... 수익화 시점은 언제인가?",
        summary: "엔비디아, 마이크로소프트, 구글 등 글로벌 빅테크의 AI 캡엑스(Capex) 투자 규모 확대와 실제 기업 수익성에 대한 미 시장의 평가.",
        category: "글로벌 마켓",
        date: "오늘",
        speaker: "글로벌 경제 전문가",
        url: "https://www.youtube.com/@3ProTV",
      },
      {
        id: "yt-3pro-3",
        title: "[부동산 인사이트] 수도권 아파트 거래량 증가와 금리 변동성 체크",
        summary: "수도권 주요 입지의 거래량 회복세와 대출 금리 추이에 따른 하반기 주택 시장 방향성을 전문가 관점에서 철저히 심층 분석합니다.",
        category: "부동산",
        date: "어제",
        speaker: "부동산 전문 위원",
        url: "https://www.youtube.com/@3ProTV",
      },
      {
        id: "yt-3pro-4",
        title: "[기업 분석 심층] 차세대 배터리 & 에너지 저장장치(ESS) 시장의 기회",
        summary: "전기차 수요 둔화 속에서도 고성장 중인 ESS(에너지저장장치) 시장과 국내 배터리 3사의 전략적 전환점을 점검해 봅니다.",
        category: "산업 분석",
        date: "어제",
        speaker: "산업 리서치 센터장",
        url: "https://www.youtube.com/@3ProTV",
      },
      {
        id: "yt-3pro-5",
        title: "[퇴근길 경제 읽기] 환율 1,350원대 복귀와 원자재 시장 움직임",
        summary: "원/달러 환율 변동과 유가·금값 등 주요 원자재 가격 추이가 국내 수출 기업 및 물가 지수에 미치는 영향 종합 정리.",
        category: "환율·원자재",
        date: "2일 전",
        speaker: "매크로 경제 연구원",
        url: "https://www.youtube.com/@3ProTV",
      },
    ];

    cachedVideos = mockVideos;
    lastCacheTime = now;

    return NextResponse.json({ success: true, videos: mockVideos, cached: false });
  } catch (err) {
    console.error("[3Pro TV API] Failed to fetch videos:", err);
    return NextResponse.json(
      { success: false, reason: "Failed to fetch 3Pro TV video data" },
      { status: 500 }
    );
  }
}
