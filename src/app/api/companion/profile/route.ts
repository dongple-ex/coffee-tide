// 👤 GET /api/companion/profile — 캐릭터별 관계 단계 & 프로필 조회 API (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2

import { NextRequest, NextResponse } from "next/server";
import { isValidPersonaId, requireCompanionContext } from "@/lib/companion/serverContext";

export async function GET(req: NextRequest) {
  try {
    const personaId = req.nextUrl.searchParams.get("personaId") || "karina";
    if (!isValidPersonaId(personaId)) {
      return NextResponse.json({ success: false, error: "invalid_persona_id" }, { status: 400 });
    }

    const context = await requireCompanionContext();
    if (!context.ok) return context.response;
    const profile = await context.repo!.getProfile(personaId);

    return NextResponse.json({
      success: true,
      active: true,
      profile,
    });
  } catch (error) {
    console.error("[GET /api/companion/profile] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "companion_profile_load_failed",
      },
      { status: 500 }
    );
  }
}
