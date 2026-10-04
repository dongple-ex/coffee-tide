import { NextRequest, NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/auth/identity";
import { summarizeSiteContent } from "@/lib/ai/gemini";
import { collectSocialSource, socialConnectionStatus } from "@/lib/social/server";
import { parseSocialSources } from "@/lib/social/sources";
import type { SocialBundleResponse } from "@/lib/social/types";

const requests = new Map<string, { at: number; count: number }>();
const responseHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  if (!await resolveIdentity()) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: responseHeaders });
  return NextResponse.json(socialConnectionStatus(), { headers: responseHeaders });
}

export async function POST(request: NextRequest) {
  const identity = await resolveIdentity();
  if (!identity) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401, headers: responseHeaders });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "같은 사이트에서 요청해 주세요." }, { status: 403, headers: responseHeaders });
  const now = Date.now();
  for (const [key, value] of requests) if (now - value.at >= 60_000) requests.delete(key);
  const window = requests.get(identity.id);
  if (window && window.count >= 4) return NextResponse.json({ error: "잠시 후 다시 확인해 주세요." }, { status: 429, headers: { ...responseHeaders, "Retry-After": "60" } });
  requests.set(identity.id, { at: window?.at ?? now, count: (window?.count ?? 0) + 1 });
  let sources;
  let body: Record<string, unknown>;
  try {
    if (Number(request.headers.get("content-length")) > 20_000) throw new Error("요청이 너무 큽니다.");
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("소스 목록을 확인해 주세요.");
    body = parsed as Record<string, unknown>;
    sources = parseSocialSources(body.sources);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "요청 형식을 확인해 주세요." }, { status: 400, headers: responseHeaders });
  }
  const results = await Promise.all(sources.map(collectSocialSource));
  const unique = new Map(results.flatMap((r) => r.posts).map((post) => [post.url, post]));
  const posts = [...unique.values()].sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
  const payload: SocialBundleResponse = { success: true, posts, sources: results.map((r) => r.result), aiUsed: false };
  if (body.summarize === true && posts.length) {
    const summary = await summarizeSiteContent(
      typeof body.bundleName === "string" ? body.bundleName.slice(0, 80) : "소식 번들",
      posts.slice(0, 8).filter((p) => p.text).map((p) => ({ id: p.id, title: `[${p.author}] ${p.title}`, text: p.text })),
      "article", AbortSignal.timeout(4_500),
    );
    payload.briefing = summary.briefing;
    payload.aiUsed = summary.aiUsed;
  }
  return NextResponse.json(payload, { headers: responseHeaders });
}
