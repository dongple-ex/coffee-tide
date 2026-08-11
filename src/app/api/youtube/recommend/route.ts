import { NextRequest, NextResponse } from "next/server";
import { ContextualRecommendation } from "@/lib/types/youtube";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tz = searchParams.get("tz") || "Asia/Seoul";

    const now = new Date();
    // KST 시간대 기준 시간 계산
    const kstHour = parseInt(
      now.toLocaleTimeString("en-US", { timeZone: tz, hour12: false, hour: "numeric" }),
      10
    );

    let rec: ContextualRecommendation;

    if (kstHour >= 6 && kstHour < 10) {
      // 🌅 모닝 출근 & 경제 시황
      rec = {
        contextType: "morning",
        badge: "📈 모닝 경제 & 시황 브리핑",
        headline: "오늘 하루 증시 개장 전, 핵심 경제 이슈를 빠르게 확인하세요.",
        reason: "상쾌한 아침 출근길 주요 경제·글로벌 시황 큐레이션",
        videos: [
          {
            id: "5qap5aO4i9A",
            title: "글로벌 매크로 지표와 금일 증시 핵심 체크포인트",
            url: "https://www.youtube.com/watch?v=5qap5aO4i9A",
            thumbnailUrl: "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg",
            publishedAt: "오늘 아침",
            channelTitle: "삼프로TV 경제 브리핑",
            channelId: "UCw8hhhsDCkkxLQ6yTQg9dIQ",
            summary: "환율, 유가, 글로벌 빅테크 동향 및 국내 시장 수혜 업종 총정리",
          },
          {
            id: "Dx5qFachd3A",
            title: "빅테크 실적 발표와 하반기 AI 투자 방향성 진단",
            url: "https://www.youtube.com/watch?v=Dx5qFachd3A",
            thumbnailUrl: "https://i.ytimg.com/vi/Dx5qFachd3A/hqdefault.jpg",
            publishedAt: "오늘 아침",
            channelTitle: "슈카월드 코믹스",
            channelId: "UCsJ6RuBiTVWRX156FVbeaGg",
            summary: "AI 생태계 수익화 시점과 글로벌 기업들의 Capex 전략 비교",
          },
        ],
      };
    } else if (kstHour >= 10 && kstHour < 12) {
      // ☕ 오전 집중 업무 BGM
      rec = {
        contextType: "focus",
        badge: "🎧 오전 딥워크 집중 BGM",
        headline: "방해 없는 몰입을 위한 차분한 비트와 백색소음",
        reason: "오전 집중력을 극대화하는 고효율 코딩 & 작업 플레이리스트",
        videos: [
          {
            id: "jfKfPfyJRdk",
            title: "Lofi Hip Hop Radio - Beats to Relax/Study to",
            url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
            thumbnailUrl: "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg",
            publishedAt: "LIVE",
            channelTitle: "Lofi Girl",
            channelId: "UCSJ4gkVC6NrvII8umztf0Ow",
            summary: "부드럽고 잔잔한 템포로 집중력을 유지해 주는 스트리밍 비트",
          },
          {
            id: "5qap5aO4i9A",
            title: "Warm Cozy Coffee Shop Ambience & Soft Piano",
            url: "https://www.youtube.com/watch?v=5qap5aO4i9A",
            thumbnailUrl: "https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg",
            publishedAt: "추천",
            channelTitle: "Cafe Music BGM",
            channelId: "UCqZldj7fSgD75vBq3_uV4oA",
            summary: "따뜻한 카페 분위기 피아노 연주곡으로 업무 피로도 감소",
          },
        ],
      };
    } else if (kstHour >= 12 && kstHour < 14) {
      // 🍱 점심 휴식 & IT 트렌드
      rec = {
        contextType: "lunch",
        badge: "💡 점심시간 숏 브레이크 & 테크 인사이트",
        headline: "커피 한 잔과 함께 가볍게 읽는 최신 IT 지식과 인사이트",
        reason: "점심시간 리프레시를 위한 유익한 테크 & 교양 콘텐츠",
        videos: [
          {
            id: "rPjez8z61rI",
            title: "최신 웹 개발 트렌드와 프론트엔드 변화 한눈에 보기",
            url: "https://www.youtube.com/watch?v=rPjez8z61rI",
            thumbnailUrl: "https://i.ytimg.com/vi/rPjez8z61rI/hqdefault.jpg",
            publishedAt: "인기 테크",
            channelTitle: "코딩애플",
            channelId: "UC_4u-bXaba7yrRz_6x6kb_w",
            summary: "Next.js와 현대 웹 프레임워크의 생태계 변화와 실무 활용 가이드",
          },
          {
            id: "kqtD5dpn9C8",
            title: "세상을 바꾸는 스타트업과 혁신가들의 인사이트 이야기",
            url: "https://www.youtube.com/watch?v=kqtD5dpn9C8",
            thumbnailUrl: "https://i.ytimg.com/vi/kqtD5dpn9C8/hqdefault.jpg",
            publishedAt: "추천 인터뷰",
            channelTitle: "EO 이오",
            channelId: "UCQ2DWm5MD60rQok5W0T2ywA",
            summary: "문제를 발견하고 해결해 나가는 개발자 및 창업가들의 생생한 인터뷰",
          },
        ],
      };
    } else if (kstHour >= 14 && kstHour < 18) {
      // 🍰 오후 리프레시 & 능률 재즈
      rec = {
        contextType: "focus",
        badge: "☕ 오후 나른함 타파! 카페 재즈 플레이리스트",
        headline: "오후 능률을 끌어올리는 감각적인 보사노바와 재즈 멜로디",
        reason: "오후 나른한 시간대를 깨우는 감각적인 라운지 음악",
        videos: [
          {
            id: "Dx5qFachd3A",
            title: "Cafe Jazz BGM & Afternoon Instrumental Chill",
            url: "https://www.youtube.com/watch?v=Dx5qFachd3A",
            thumbnailUrl: "https://i.ytimg.com/vi/Dx5qFachd3A/hqdefault.jpg",
            publishedAt: "인기",
            channelTitle: "Cafe Music BGM",
            channelId: "UCqZldj7fSgD75vBq3_uV4oA",
            summary: "오후 업무 능률을 높여주는 리드미컬하고 세련된 재즈 선곡",
          },
          {
            id: "rPjez8z61rI",
            title: "Work & Study Chill Beats - Coding Flow",
            url: "https://www.youtube.com/watch?v=rPjez8z61rI",
            thumbnailUrl: "https://i.ytimg.com/vi/rPjez8z61rI/hqdefault.jpg",
            publishedAt: "추천",
            channelTitle: "Lofi Girl",
            channelId: "UCSJ4gkVC6NrvII8umztf0Ow",
            summary: "생각을 정리하고 몰입 상태(Flow State)를 돕는 다운템포 비트",
          },
        ],
      };
    } else {
      // 🌙 퇴근길 & 야간 자기계발
      rec = {
        contextType: "evening",
        badge: "🌙 퇴근길 자기계발 & 편안한 휴식",
        headline: "오늘 하루를 알차게 마무리하는 지식과 힐링 선곡",
        reason: "하루 업무를 정리하고 내일을 준비하는 인사이트 큐레이션",
        videos: [
          {
            id: "kqtD5dpn9C8",
            title: "개발자를 위한 커리어 로드맵과 멘탈 관리법",
            url: "https://www.youtube.com/watch?v=kqtD5dpn9C8",
            thumbnailUrl: "https://i.ytimg.com/vi/kqtD5dpn9C8/hqdefault.jpg",
            publishedAt: "인기",
            channelTitle: "노마드 코더",
            channelId: "UCUpJs89fSBXNolQGOYKn0YQ",
            summary: "지치지 않고 꾸준히 성장하는 엔지니어들의 습관과 마인드셋",
          },
          {
            id: "21qNxnCS8WU",
            title: "Cozy Night Acoustic Guitar & Relaxing Ambience",
            url: "https://www.youtube.com/watch?v=21qNxnCS8WU",
            thumbnailUrl: "https://i.ytimg.com/vi/21qNxnCS8WU/hqdefault.jpg",
            publishedAt: "힐링",
            channelTitle: "Cafe Music BGM",
            channelId: "UCqZldj7fSgD75vBq3_uV4oA",
            summary: "편안한 하루 마무리를 위한 어쿠스틱 핑거스타일 기타 연주",
          },
        ],
      };
    }

    return NextResponse.json({ success: true, recommendation: rec });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("[GET /api/youtube/recommend] Error:", message);
    return NextResponse.json({ success: false, reason: "추천 영상을 가져오지 못했습니다." }, { status: 500 });
  }
}
