// 🧪 POST /api/growth/experiments/[id]/review — 성장 실험 채택 및 회고 API (Phase 17-D)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2

import { NextRequest, NextResponse } from "next/server";
import { SupabaseCompanionRepository } from "@/lib/companion/repositories/supabase";
import { createCompanionDomainEvent } from "@/lib/companion/eventLedger";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { userId = "guest", personaId = "karina", action = "reviewed" } = body;

    const repo = new SupabaseCompanionRepository();

    // 주간 실험 검토 이벤트 기록 (+20 EXP)
    const event = createCompanionDomainEvent({
      userId,
      personaId,
      eventType: "growth_experiment_reviewed",
      authority: "server_domain",
      payload: {
        experimentId: id,
        action,
      },
    });

    await repo.recordEvent(event);

    return NextResponse.json({
      success: true,
      experimentId: id,
      eventRecorded: true,
      bondDelta: event.bondDelta,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to review experiment",
      },
      { status: 500 }
    );
  }
}
