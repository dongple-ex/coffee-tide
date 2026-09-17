import { NextRequest, NextResponse } from "next/server";
import { fetchThreadsChannel } from "@/lib/threads/server";
import { ThreadsApiResponse, ThreadsChannel } from "@/lib/types/threads";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawUsernames = searchParams.get("usernames") || searchParams.get("username") || "zuck,openai";

  const usernames = rawUsernames
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 5); // 최대 5개 계정 동시 요청 제한

  if (usernames.length === 0) {
    return NextResponse.json<ThreadsApiResponse>(
      { success: false, channels: [], error: "계정명이 지정되지 않았습니다." },
      { status: 400 }
    );
  }

  try {
    const channels: ThreadsChannel[] = await Promise.all(
      usernames.map(async (u) => {
        try {
          return await fetchThreadsChannel(u);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "수집 실패";
          return {
            username: u,
            displayName: u,
            profileUrl: `https://www.threads.net/@${u}`,
            posts: [],
            error: msg,
          };
        }
      })
    );

    return NextResponse.json<ThreadsApiResponse>({
      success: true,
      channels,
      cached: true,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "서버 오류";
    return NextResponse.json<ThreadsApiResponse>(
      { success: false, channels: [], error: errorMsg },
      { status: 500 }
    );
  }
}
