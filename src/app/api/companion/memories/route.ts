// 🧠 GET /api/companion/memories — 기억 목록 조회 API (Phase 17-C)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2

import { NextRequest, NextResponse } from "next/server";
import { SupabaseCompanionRepository } from "@/lib/companion/repositories/supabase";
import { getCompanionFeatureAccess, isCompanionGrowthActive } from "@/lib/companion/featureAccess";

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId") || "guest";
    const status = req.nextUrl.searchParams.get("status") || undefined;

    const access = getCompanionFeatureAccess();
    if (!isCompanionGrowthActive(access)) {
      return NextResponse.json({
        success: true,
        memories: [],
        active: false,
      });
    }

    const repo = new SupabaseCompanionRepository();
    const memories = await repo.getMemories(userId, status);

    return NextResponse.json({
      success: true,
      memories,
      active: true,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch memories",
      },
      { status: 500 }
    );
  }
}
