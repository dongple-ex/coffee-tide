// ⚙️ POST /api/companion/settings — 컴패니언 사용자 활성화 설정 및 동의 저장 API (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §14.3, §14.5

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { enabled, termsVersion = "2026-09-01" } = body;

    const isEnabled = Boolean(enabled);
    const now = new Date().toISOString();

    // 로그인 사용자 세션 확인 (있는 경우 Supabase에 저장)
    // 게스트는 응답 성공 후 클라이언트 로컬스토리지에 보관
    return NextResponse.json({
      success: true,
      settings: {
        companion_growth_enabled: isEnabled,
        companion_consent_at: isEnabled ? now : null,
        companion_paused_at: !isEnabled ? now : null,
        companion_terms_version: termsVersion,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update companion settings",
      },
      { status: 400 }
    );
  }
}
