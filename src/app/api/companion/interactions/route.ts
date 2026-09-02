// 🤝 POST /api/companion/interactions — 서버 영수증(Receipt) 기반 안전 상호작용 API (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §8.3, §11.2

import { NextRequest, NextResponse } from "next/server";
import { getCompanionFeatureAccess, isCompanionGrowthActive } from "@/lib/companion/featureAccess";
import { createCompanionDomainEvent } from "@/lib/companion/eventLedger";
import { evaluateRelationshipProfile } from "@/lib/companion/relationshipEngine";
import { SupabaseCompanionRepository } from "@/lib/companion/repositories/supabase";
import { CompanionEventType } from "@/lib/companion/contracts";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId = "guest",
      personaId = "karina",
      interactionType,
      receiptId,
      sourceItemId,
      sourceVersion,
      payload = {},
      timezone = "Asia/Seoul",
    } = body;

    const access = getCompanionFeatureAccess();
    const active = isCompanionGrowthActive(access);

    if (!active) {
      return NextResponse.json({
        success: true,
        accepted: false,
        reason: "feature_disabled",
      });
    }

    const eventType: CompanionEventType =
      interactionType === "focus_session"
        ? "focus_session_completed"
        : interactionType === "briefing_plan"
        ? "briefing_plan_accepted"
        : interactionType === "artifact"
        ? "artifact_accepted"
        : "task_progressed";

    const repo = new SupabaseCompanionRepository();
    const existingEvents = await repo.getEvents(userId, personaId);

    const event = createCompanionDomainEvent({
      userId,
      personaId,
      eventType,
      authority: "server_receipt",
      sourceItemId,
      sourceVersion,
      sourceReceiptId: receiptId || `rec_${Date.now()}`,
      payload,
      timezone,
      existingDayEvents: existingEvents,
    });

    const recorded = await repo.recordEvent(event);
    const updatedEvents = recorded ? [event, ...existingEvents] : existingEvents;

    const profile = await repo.getProfile(userId, personaId);
    const evalResult = evaluateRelationshipProfile({
      existingProfile: profile,
      events: updatedEvents,
    });

    const nextProfile = {
      ...profile,
      bondExp: evalResult.bondExp,
      relationshipLevel: evalResult.relationshipLevel,
      lastInteractionAt: Date.now(),
    };

    await repo.saveProfile(nextProfile);

    return NextResponse.json({
      success: true,
      accepted: true,
      eventRecorded: recorded,
      bondDelta: event.bondDelta,
      profile: nextProfile,
      isLevelUp: evalResult.isLevelUp,
      transitionSceneKey: evalResult.transitionSceneKey,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to process interaction",
      },
      { status: 500 }
    );
  }
}
