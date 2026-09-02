// 📈 GET /api/growth/weekly — 주간 4축 성장 스냅샷 및 카드 조회 API (Phase 17-D)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2

import { NextRequest, NextResponse } from "next/server";
import { SupabaseCompanionRepository } from "@/lib/companion/repositories/supabase";
import { analyzeUserGrowth } from "@/lib/companion/growthAnalyzer";
import { getCompanionFeatureAccess, isCompanionGrowthActive } from "@/lib/companion/featureAccess";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId") || "guest";

    const access = getCompanionFeatureAccess();
    if (!isCompanionGrowthActive(access)) {
      return NextResponse.json({
        success: true,
        active: false,
        snapshot: null,
      });
    }

    const repo = new SupabaseCompanionRepository();
    const events = await repo.getEvents(userId);
    const snapshot = analyzeUserGrowth(events);

    return NextResponse.json({
      success: true,
      active: true,
      snapshot,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch weekly growth",
      },
      { status: 500 }
    );
  }
}
