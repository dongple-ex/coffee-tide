import { NextRequest, NextResponse } from "next/server";
import { YouTubeChapter } from "@/lib/types/youtube";

function parseVideoId(urlOrId: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
  const match = urlOrId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
  return match ? match[1] : null;
}

function parseChaptersFromText(text: string): YouTubeChapter[] {
  const chapters: YouTubeChapter[] = [];
  const timeRegex = /(?:(\d{1,2}):)?(\d{2}):(\d{2})\s+([^\n\r]+)/g;
  let match;
  while ((match = timeRegex.exec(text)) !== null) {
    const hours = match[1] ? parseInt(match[1], 10) : 0;
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const totalSecs = hours * 3600 + minutes * 60 + seconds;
    const label = match[4].trim().replace(/^[-–—:]\s*/, "");
    if (label) {
      chapters.push({
        time: match[1] ? `${match[1]}:${match[2]}:${match[3]}` : `${match[2]}:${match[3]}`,
        seconds: totalSecs,
        label,
      });
    }
  }
  return chapters;
}

export async function POST(req: NextRequest) {
  try {
    const { url, videoId: rawVideoId } = (await req.json()) as { url?: string; videoId?: string };
    const videoId = rawVideoId ? parseVideoId(rawVideoId) : (url ? parseVideoId(url) : null);

    if (!videoId) {
      return NextResponse.json({ success: false, error: "유효한 YouTube 비디오 ID 또는 URL이 아닙니다." }, { status: 400 });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // 1. YouTube 영상 페이지 HTML 메타데이터 파싱
    const pageRes = await fetch(videoUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 3600 },
    });

    let title = "";
    let description = "";
    let chapters: YouTubeChapter[] = [];

    if (pageRes.ok) {
      const html = await pageRes.text();
      const titleMatch = html.match(/<meta\s+name=["']title["']\s+content=["']([^"']+)["']/i) ||
                         html.match(/<title>([^<]+)<\/title>/i);
      const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
                        html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);

      title = titleMatch ? titleMatch[1].replace("- YouTube", "").trim() : "";
      description = descMatch ? descMatch[1].trim() : "";
      chapters = parseChaptersFromText(description);
    }

    // 2. Gemini AI 요약 생성 시도
    let summary = description ? `${description.slice(0, 200)}…` : "영상 요약 정보가 없습니다.";
    let points: string[] = [];

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && (title || description)) {
      try {
        const prompt = `역할: 유튜브 영상 요약기
영상 제목: ${title}
영상 설명 및 목차:
${description.slice(0, 2000)}

위 내용을 바탕으로 다음 JSON 포맷으로 1~2문장의 핵심 줄글 요약과 2~3개의 핵심 포인트를 작성하세요.
{
  "summary": "핵심 줄글 요약(120~200자)",
  "points": ["핵심 1", "핵심 2", "핵심 3"]
}`;

        const aiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );

        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          const text = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            if (parsed.summary) summary = parsed.summary;
            if (Array.isArray(parsed.points)) points = parsed.points;
          }
        }
      } catch (aiErr) {
        console.warn("[YouTube Transcript Summary AI Error]", aiErr);
      }
    }

    return NextResponse.json({
      success: true,
      videoId,
      title,
      summary,
      points,
      chapters,
      url: videoUrl,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    console.error("[POST /api/youtube/transcript-summary] Error:", message);
    return NextResponse.json({ success: false, error: message || "영상 분석에 실패했습니다." }, { status: 500 });
  }
}
