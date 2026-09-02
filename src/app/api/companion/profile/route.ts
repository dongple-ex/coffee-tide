// 👤 GET /api/companion/profile — 캐릭터별 관계 단계 & 프로필 조회 API (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2

import { NextRequest, NextResponse } from "next/server";
import { SupabaseCompanionRepository } from "@/lib/companion/repositories/supabase";
import { getCompanionFeatureAccess, isCompanionGrowthActive } from "@/lib/companion/featureAccess";

export async function GET(req: NextRequest) {
  try {
    const personaId = req.nextUrl.searchParams.get("personaId") || "karina";
    const userId = req.nextUrl.searchParams.get("userId") || "guest";

    const access = getCompanionFeatureAccess();
    const active = isCompanionGrowthActive(access);

    if (!active) {
      return NextResponse.json({
        success: true,
        active: false,
        profile: {
          userId,
          personaId,
          bondExp: 0,
          relationshipLevel: 1,
          currentMode: "momentum",
          completedTasksCount: 0,
          lastInteractionAt: Date.now(),
          version: 1,
          updatedAt: Date.now(),
        },
      });
    }

    const repo = new SupabaseCompanionRepository();
    const profile = await repo.getProfile(userId, personaId);

    return NextResponse.json({
      success: true,
      active: true,
      profile,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load companion profile",
      },
      { status: 500 }
    );
  }
}
