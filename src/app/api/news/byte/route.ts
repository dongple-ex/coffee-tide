import { NextResponse } from "next/server";

export interface ByteNewsArticle {
  id: string;
  title: string;
  summary: string;
  category: string;
  date: string;
  url: string;
}

// 30분 유효 서버 인메모리 캐시
let cachedArticles: ByteNewsArticle[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function GET() {
  const now = Date.now();
  if (cachedArticles && now - lastCacheTime < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, articles: cachedArticles, cached: true });
  }

  try {
    // 바이트컴퍼니 / 데일리바이트 (DAILY BYTE) 최신 경제 & 비즈니스 브리핑 뉴스 데이터
    const mockArticles: ByteNewsArticle[] = [
      {
        id: "byte-1",
        title: "한국은행 기준금리 인하 가시화... 금융 시장 영향은?",
        summary: "소비 위축과 물가 안정세 속에서 한국은행의 기준금리 인하 가능성이 높아지고 있습니다. 시중은행 금리 및 부동산·주식 시장에 미칠 영향을 짚어봅니다.",
        category: "금융·통화",
        date: "오늘",
        url: "https://www.mydailybyte.com/",
      },
      {
        id: "byte-2",
        title: "글로벌 반도체 주도권 전쟁... 엔비디아 vs 빅테크 자체 칩 경쟁",
        summary: "빅테크 기업들이 AI 칩 자체 개발에 박차를 가하면서 엔비디아의 독주 체제에 균열이 가고 있습니다. 국내 반도체 밸류체인의 수혜 전망 분석.",
        category: "테크·산업",
        date: "오늘",
        url: "https://www.mydailybyte.com/",
      },
      {
        id: "byte-3",
        title: "테슬라 로보택시 공개 이후... 자율주행 상용화의 과제",
        summary: "자율주행 기술의 현실화 가능성에 대한 기대감과 규제·안전성 이슈가 공존하고 있습니다. 모빌리티 생태계의 판도 변화를 살펴봅니다.",
        category: "비즈니스",
        date: "어제",
        url: "https://www.mydailybyte.com/",
      },
      {
        id: "byte-4",
        title: "MZ세대의 새로운 소비 트렌드: '디그노시스(Diagnosis) 경제'",
        summary: "자신의 취향과 성향을 정밀하게 진단하고 맞춤형 경험에 지출하는 MZ 소비자들이 늘고 있습니다. 유통업계의 큐레이션 마케팅 트렌드.",
        category: "트렌드",
        date: "어제",
        url: "https://www.mydailybyte.com/",
      },
      {
        id: "byte-5",
        title: "글로벌 원자재 가격 변동성 확대... 원유·원자재 수급 전망",
        summary: "지정학적 리스크 지속에 따른 원자재 및 에너지 가격 등락이 가중되고 있습니다. 국내 제조업 원가 부담 현황 분석.",
        category: "거시경제",
        date: "2일 전",
        url: "https://www.mydailybyte.com/",
      },
    ];

    cachedArticles = mockArticles;
    lastCacheTime = now;

    return NextResponse.json({ success: true, articles: mockArticles, cached: false });
  } catch (err) {
    console.error("[Byte News API] Failed to fetch news:", err);
    return NextResponse.json(
      { success: false, reason: "Failed to fetch Byte news articles" },
      { status: 500 }
    );
  }
}
