// 📈 GET /api/growth/weekly — 주간 4축 성장 스냅샷 및 카드 조회 API (Phase 17-D)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2

import { NextResponse } from "next/server";
import { analyzeUserGrowth } from "@/lib/companion/growthAnalyzer";
import { requireCompanionContext } from "@/lib/companion/serverContext";

export async function GET() {
  try {
    const context = await requireCompanionContext();
    if (!context.ok) return context.response;
    const events = await context.repo!.getEvents();
    const snapshot = analyzeUserGrowth(events);

    return NextResponse.json({
      success: true,
      active: true,
      snapshot,
    });
  } catch (error) {
    console.error("[GET /api/growth/weekly] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "weekly_growth_load_failed",
      },
      { status: 500 }
    );
  }
}
