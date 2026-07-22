// 통합 수집 API — 선제(만료 임박 60초) + 반응형(401 시 1회) 토큰 리프레시(백로그 A3),
// 병렬 수집·부분 실패 허용(00-current-state 원칙 4), AI 분류(C1 캐시), 최신순 정렬.
// phase6 Q4: Obsidian 연동 시 오늘의 LLM 산출물을 일일 다이제스트로 자동 미러링.

import { NextRequest, NextResponse } from "next/server";
import { buildFetchers, connectionState, isMockMode } from "@/lib/adapters/factory";
import { AuthExpiredError } from "@/lib/adapters/outlook";
import { ObsidianAdapter } from "@/lib/adapters/obsidian";
import { classifyTasks } from "@/lib/ai/gemini";
import { readSession, touchSession, unauthorized } from "@/lib/auth/cookies";
import { REFRESH_WINDOW_MS, refreshChannel } from "@/lib/auth/refresh";
import { SessionData } from "@/lib/auth/session";
import { UnifiedData } from "@/lib/types/unified";

type Channel = "outlook" | "google" | "notion" | "obsidian" | "local_doc" | "llm";

export async function GET(request: NextRequest) {
  let session = await readSession();
  if (!session) return unauthorized();
  void request;

  // 선제 리프레시 — 만료 임박(60초 이내) 채널만
  if (!isMockMode()) {
    for (const channel of ["outlook", "google"] as const) {
      const expiry =
        channel === "outlook" ? session.outlookTokenExpiry : session.googleTokenExpiry;
      const hasRefresh =
        channel === "outlook" ? session.outlookRefreshToken : session.googleRefreshToken;
      if (hasRefresh && expiry && expiry - Date.now() < REFRESH_WINDOW_MS) {
        const refreshed = await refreshChannel(channel, session);
        if (refreshed) {
          session = refreshed;
        }
      }
    }
  }

  const errors: Partial<Record<Channel, string>> = {};

  async function collect(channel: Channel, current: SessionData): Promise<UnifiedData[]> {
    const fetcher = buildFetchers(current)[channel];
    if (!fetcher) return [];
    return fetcher();
  }

  const channels: Channel[] = ["outlook", "google", "notion", "obsidian", "local_doc", "llm"];
  const collected = await Promise.all(
    channels.map(async (channel) => {
      try {
        return await collect(channel, session!);
      } catch (err) {
        // 반응형 리프레시: 401이면 1회 갱신 후 재시도 (백로그 A3)
        if (
          err instanceof AuthExpiredError &&
          (channel === "outlook" || channel === "google")
        ) {
          const refreshed = await refreshChannel(channel, session!);
          if (refreshed) {
            // 두 채널이 같은 요청에서 동시에 리프레시되면 refreshed(스냅샷 기반 전체 세션)로
            // 통째로 덮을 때 다른 채널의 회전된 토큰이 유실된다 — 해당 채널 필드만 병합한다.
            session =
              channel === "outlook"
                ? {
                    ...session!,
                    outlookToken: refreshed.outlookToken,
                    outlookRefreshToken: refreshed.outlookRefreshToken,
                    outlookTokenExpiry: refreshed.outlookTokenExpiry,
                  }
                : {
                    ...session!,
                    googleToken: refreshed.googleToken,
                    googleRefreshToken: refreshed.googleRefreshToken,
                    googleTokenExpiry: refreshed.googleTokenExpiry,
                  };
            try {
              return await collect(channel, refreshed);
            } catch {
              errors[channel] = "재연동이 필요합니다";
              return [];
            }
          }
          errors[channel] = "재연동이 필요합니다";
          return [];
        }
        errors[channel] = err instanceof Error ? err.message : "수집 실패";
        return [];
      }
    })
  );

  const merged = collected.flat();
  const { items: classified, aiUsed } = await classifyTasks(merged);
  classified.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // phase6 Q4: 오늘의 LLM 산출물 → Obsidian 일일 다이제스트 자동 미러링 (idempotent)
  if (session.obsidianVaultPath && !errors.llm) {
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const todayLlm = classified.filter(
      (i) => i.source === "llm" && new Date(i.created_at).toDateString() === now.toDateString()
    );
    try {
      await ObsidianAdapter.writeLlmDigest(session.obsidianVaultPath, dateKey, todayLlm);
    } catch (err) {
      console.warn("[coffeeTide] LLM 다이제스트 미러링 실패 (수집은 계속)", err);
    }
  }

  const connections = connectionState(session);
  if (errors.outlook) connections.outlook = false;
  if (errors.google) connections.google = false;

  const res = NextResponse.json({
    mails: classified,
    userEmail: session.userEmail,
    connections,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
    ai_error: merged.length > 0 && !aiUsed ? true : undefined,
  });
  return touchSession(res, session);
}
