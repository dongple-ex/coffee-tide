// 🧪 POST /api/growth/experiments/[id]/review — 성장 실험 채택 및 회고 API (Phase 17-D)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2

import { NextRequest, NextResponse } from "next/server";
import { createCompanionDomainEvent } from "@/lib/companion/eventLedger";
import {
  applyCompanionEventWithRetry,
  isSameOriginRequest,
  isValidPersonaId,
  requireCompanionContext,
} from "@/lib/companion/serverContext";
import { analyzeUserGrowth } from "@/lib/companion/growthAnalyzer";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ success: false, error: "invalid_request_origin" }, { status: 403 });
    }
    const { id } = await context.params;
    const body: { personaId?: unknown; action?: unknown } = await req.json();
    const personaId = body.personaId ?? "karina";
    const action = body.action ?? "reviewed";
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(id)) {
      return NextResponse.json({ success: false, error: "invalid_experiment_id" }, { status: 400 });
    }
    if (typeof personaId !== "string" || !isValidPersonaId(personaId)) {
      return NextResponse.json({ success: false, error: "invalid_persona_id" }, { status: 400 });
    }
    if (action !== "accepted" && action !== "reviewed" && action !== "rejected") {
      return NextResponse.json({ success: false, error: "invalid_review_action" }, { status: 400 });
    }

    const companion = await requireCompanionContext();
    if (!companion.ok) return companion.response;
    const repo = companion.repo!;
    const allEvents = await repo.getEvents();
    const currentExperiment = analyzeUserGrowth(allEvents).experiment;
    if (!currentExperiment || currentExperiment.id !== id) {
      return NextResponse.json({ success: false, error: "growth_experiment_not_found" }, { status: 404 });
    }
    const applied = await applyCompanionEventWithRetry({
      repo,
      personaId,
      buildEvent: (existingEvents) =>
        createCompanionDomainEvent({
          userId: companion.userId,
          personaId,
          eventType: "growth_experiment_reviewed",
          authority: "server_domain",
          payload: {
            experimentId: id,
            action,
          },
          existingDayEvents: existingEvents,
        }),
    });

    return NextResponse.json({
      success: true,
      experimentId: id,
      eventRecorded: applied.recorded,
      duplicate: !applied.recorded,
      bondDelta: applied.bondDelta,
    });
  } catch (error) {
    console.error("[POST /api/growth/experiments/:id/review] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "growth_experiment_review_failed",
      },
      { status: 500 }
    );
  }
}
