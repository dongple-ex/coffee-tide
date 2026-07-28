// 사이트 추가 모달의 '연결 확인' 전용 엔드포인트.
// 등록 전에 실제로 최신 글을 읽을 수 있는지, 사이트 이름은 무엇인지 미리 확인시켜
// 동작하지 않는 위젯이 도구함에 쌓이는 것을 막는다. (본문 딥 페치·AI 요약은 생략해 빠르다)

import { NextRequest, NextResponse } from "next/server";
import { collectSiteContent, normalizeUrl } from "@/lib/news/collect";
import type { CustomSitePreview } from "@/lib/news/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string };
    const rawUrl = body.url?.trim() ?? "";

    if (!rawUrl) {
      return NextResponse.json<CustomSitePreview>(
        {
          success: false,
          siteName: "",
          url: "",
          count: 0,
          sampleTitles: [],
          reason: "주소를 입력해 주세요.",
        },
        { status: 400 }
      );
    }

    const targetUrl = normalizeUrl(rawUrl);
    const collected = await collectSiteContent({ url: targetUrl, limit: 4, deep: false });

    if (!collected.ok || collected.items.length === 0) {
      return NextResponse.json<CustomSitePreview>({
        success: false,
        siteName: collected.siteName,
        url: targetUrl,
        count: 0,
        sampleTitles: [],
        reason: collected.reason ?? "최신 글을 찾지 못했습니다.",
        hint: collected.hint ?? "RSS 주소를 직접 입력해 보세요.",
      });
    }

    return NextResponse.json<CustomSitePreview>({
      success: true,
      siteName: collected.siteName,
      url: targetUrl,
      count: collected.items.length,
      sampleTitles: collected.items.slice(0, 3).map((i) => i.title),
      strategy: collected.strategy,
      feedUrl: collected.feedUrl,
    });
  } catch (err) {
    console.error("[Custom News Preview] 확인 실패:", err);
    return NextResponse.json<CustomSitePreview>({
      success: false,
      siteName: "",
      url: "",
      count: 0,
      sampleTitles: [],
      reason: "연결 확인 중 오류가 발생했습니다.",
      hint: "잠시 후 다시 시도해 주세요.",
    });
  }
}
