// 사용자가 등록한 사이트의 최신 글을 수집 → 본문 확보 → 핵심 브리핑으로 압축한다.
// 수집/파싱은 src/lib/news/*, AI 요약은 src/lib/ai/gemini.ts(summarizeSiteContent)에 위임한다.
// GEMINI_API_KEY가 없으면 로컬 추출 요약기(summarizeLocally)가 그대로 결과가 된다.

import { NextRequest, NextResponse } from "next/server";
import { summarizeSiteContent } from "@/lib/ai/gemini";
import { collectSiteContent, normalizeUrl } from "@/lib/news/collect";
import { buildLocalBriefing, summarizeLocally, summarizeVideo } from "@/lib/news/summarize";
import type { CustomNewsItem, CustomNewsResponse } from "@/lib/news/types";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_VERSION = "v3";
const MAX_CACHE_ENTRIES = 40;

const cacheMap = new Map<string, { payload: CustomNewsResponse; time: number }>();

export async function POST(req: NextRequest) {
  let rawUrl = "";
  try {
    const body = (await req.json()) as { url?: string; siteName?: string; refresh?: boolean };
    rawUrl = body.url?.trim() ?? "";
    const userName = body.siteName?.trim() ?? "";

    if (!rawUrl) {
      return NextResponse.json<CustomNewsResponse>(
        {
          success: false,
          siteName: userName,
          url: "",
          articles: [],
          reason: "URL이 전달되지 않았습니다.",
          hint: "위젯을 다시 등록해 주세요.",
        },
        { status: 400 }
      );
    }

    const targetUrl = normalizeUrl(rawUrl);
    const cacheKey = `${CACHE_VERSION}|${targetUrl}`;

    if (!body.refresh) {
      const cached = cacheMap.get(cacheKey);
      if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
        return NextResponse.json<CustomNewsResponse>({
          ...cached.payload,
          siteName: userName || cached.payload.siteName,
          cached: true,
        });
      }
    }

    const collected = await collectSiteContent({ url: targetUrl, siteName: userName, limit: 6 });

    if (!collected.ok || collected.items.length === 0) {
      return NextResponse.json<CustomNewsResponse>({
        success: false,
        siteName: userName || collected.siteName || "사이트",
        url: targetUrl,
        articles: [],
        reason: collected.reason ?? "최신 글을 수집하지 못했습니다.",
        hint: collected.hint ?? "잠시 후 다시 시도하거나 RSS 주소를 입력해 보세요.",
      });
    }

    // ① 로컬 추출 요약 — AI 키가 없거나 실패해도 항상 이 결과가 남는다.
    const baseArticles: CustomNewsItem[] = collected.items.map((item, idx) => {
      const local = collected.isVideo
        ? summarizeVideo(item.title, item.text)
        : summarizeLocally(item.title, item.text);
      return {
        id: `custom-${idx}`,
        title: item.title,
        summary: local.summary,
        points: local.points,
        date: item.date,
        url: item.url,
        // 원문 글자 수가 많아도 알맹이가 없으면(광고성 설명 등) 신뢰도를 낮춰 표시한다.
        depth: local.weak ? "title" : item.depth,
        chars: item.text.length,
      };
    });

    // ② AI 요약으로 덮어쓰기 (성공한 항목만)
    const ai = await summarizeSiteContent(
      collected.siteName,
      collected.items
        .map((item, idx) => ({ id: `custom-${idx}`, title: item.title, text: item.text }))
        .filter((item) => item.text.length >= 80),
      collected.isVideo ? "video" : "article"
    );

    const merged = baseArticles.map((article) => {
      const aiResult = ai.byId[article.id];
      if (!aiResult || aiResult.summary.length < 40) return article;
      return {
        ...article,
        summary: aiResult.summary,
        points: aiResult.points.length > 0 ? aiResult.points : article.points,
        depth: "full" as const,
      };
    });

    // 알맹이 있는 카드가 충분하면, 제목만 건진 카드는 노출하지 않는다.
    const solid = merged.filter((article) => article.depth !== "title");
    const articles = solid.length >= 3 ? solid : merged;

    const briefing =
      ai.briefing && ai.briefing.keyPoints.length > 0
        ? ai.briefing
        : buildLocalBriefing(collected.siteName, articles);

    const payload: CustomNewsResponse = {
      success: true,
      siteName: userName || collected.siteName,
      autoSiteName: collected.autoSiteName,
      url: targetUrl,
      feedUrl: collected.feedUrl,
      strategy: collected.strategy,
      articles,
      briefing,
      aiUsed: ai.aiUsed,
    };

    rememberCache(cacheKey, payload);
    return NextResponse.json<CustomNewsResponse>(payload);
  } catch (err) {
    console.error("[Custom News API] 수집 실패:", err);
    return NextResponse.json<CustomNewsResponse>({
      success: false,
      siteName: "사이트",
      url: rawUrl,
      articles: [],
      reason: "수집 중 오류가 발생했습니다.",
      hint: "잠시 후 ↻ 갱신을 눌러 다시 시도해 주세요.",
    });
  }
}

function rememberCache(key: string, payload: CustomNewsResponse) {
  if (cacheMap.size >= MAX_CACHE_ENTRIES) {
    const oldest = [...cacheMap.entries()].sort((a, b) => a[1].time - b[1].time)[0];
    if (oldest) cacheMap.delete(oldest[0]);
  }
  cacheMap.set(key, { payload, time: Date.now() });
}
