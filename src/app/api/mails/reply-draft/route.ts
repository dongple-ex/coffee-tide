// AI 답장 초안 생성 + Outlook 임시보관함 저장 — doc/phase5 §2.2
// /api/mails·/api/upload와 동일하게 선제(만료 임박) + 반응형(401 시 1회) 토큰 리프레시 적용.

import { NextRequest, NextResponse } from "next/server";
import { isMockMode } from "@/lib/adapters/factory";
import { AuthExpiredError, OutlookAdapter } from "@/lib/adapters/outlook";
import { generateReplyDraft } from "@/lib/ai/gemini";
import { readSession, unauthorized, writeSession } from "@/lib/auth/cookies";
import { REFRESH_WINDOW_MS, refreshChannel } from "@/lib/auth/refresh";

export async function POST(request: NextRequest) {
  let session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    bodyContent?: string;
    source?: string;
  };
  if (!body.id || !body.bodyContent) {
    return NextResponse.json({ error: "id와 bodyContent가 필요합니다" }, { status: 400 });
  }

  const draftText = await generateReplyDraft(body.bodyContent);

  // Mock 항목이거나 MOCK_MODE면 Graph 저장은 모사하고 초안만 반환
  if (isMockMode() || body.id.startsWith("mock-")) {
    return NextResponse.json({ success: true, message: "답장 초안 다 썼어요! (Mock)", draftText });
  }

  // Gmail은 초안 저장 미지원(읽기 전용 scope) — 초안 텍스트만 반환
  if (body.source === "gmail" || !session.outlookToken) {
    return NextResponse.json({
      success: true,
      message: "답장 초안 다 썼어요! (Outlook을 연결하면 임시보관함까지 넣어드려요)",
      draftText,
    });
  }

  // 선제 리프레시 — 만료 임박(60초 이내) 시 갱신
  let sessionChanged = false;
  if (
    session.outlookRefreshToken &&
    session.outlookTokenExpiry &&
    session.outlookTokenExpiry - Date.now() < REFRESH_WINDOW_MS
  ) {
    const refreshed = await refreshChannel("outlook", session);
    if (refreshed) {
      session = refreshed;
      sessionChanged = true;
    }
  }

  try {
    try {
      await new OutlookAdapter(session.outlookToken!).saveReplyDraft(body.id, draftText);
    } catch (err) {
      // 반응형 리프레시: 401이면 1회 갱신 후 재시도 (백로그 A3)
      if (!(err instanceof AuthExpiredError)) throw err;
      const retried = await refreshChannel("outlook", session);
      if (!retried) throw err;
      session = retried;
      sessionChanged = true;
      await new OutlookAdapter(session.outlookToken!).saveReplyDraft(body.id, draftText);
    }
    const res = NextResponse.json({
      success: true,
      message: "답장 초안을 Outlook 임시보관함에 넣어뒀어요. 검토 후 전송만 눌러주세요!",
      draftText,
    });
    return sessionChanged ? writeSession(res, session) : res;
  } catch (err) {
    // 원칙 4(부분 실패 허용): Graph 저장이 안 돼도 초안 텍스트는 전달한다
    const reason =
      err instanceof AuthExpiredError
        ? "Outlook 세션이 만료돼 임시보관함엔 못 넣었어요 — 설정에서 재연동해 주세요. 초안은 아래 있어요!"
        : err instanceof Error && err.message
          ? err.message
          : "앗, 임시보관함에 넣다 놓쳤어요. 초안은 아래 있어요!";
    const res = NextResponse.json({ success: true, message: reason, draftText });
    return sessionChanged ? writeSession(res, session) : res;
  }
}
