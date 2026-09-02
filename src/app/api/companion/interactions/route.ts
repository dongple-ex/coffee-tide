// 🤝 POST /api/companion/interactions — 서버 영수증(Receipt) 기반 안전 상호작용 API (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §8.3, §11.2

import { NextRequest, NextResponse } from "next/server";
import { createCompanionDomainEvent } from "@/lib/companion/eventLedger";
import {
  applyCompanionEventWithRetry,
  isSameOriginRequest,
  isValidPersonaId,
  requireCompanionContext,
} from "@/lib/companion/serverContext";
import type { WorkspaceItem } from "@/lib/data/contracts";

type ReceiptResult = {
  status?: string;
  serverItem?: WorkspaceItem;
};

export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ success: false, error: "invalid_request_origin" }, { status: 403 });
    }
    const body: Record<string, unknown> = await req.json();
    const {
      personaId = "karina",
      interactionType,
      receiptId,
      sourceItemId,
    } = body;

    if (interactionType !== "task_progress") {
      return NextResponse.json(
        { success: false, accepted: false, error: "unsupported_receipt_type" },
        { status: 422 }
      );
    }
    if (typeof personaId !== "string" || !isValidPersonaId(personaId)) {
      return NextResponse.json({ success: false, error: "invalid_persona_id" }, { status: 400 });
    }
    if (typeof receiptId !== "string" || !receiptId || receiptId.length > 160) {
      return NextResponse.json({ success: false, error: "verified_receipt_required" }, { status: 400 });
    }
    if (sourceItemId !== undefined && typeof sourceItemId !== "string") {
      return NextResponse.json({ success: false, error: "invalid_source_item_id" }, { status: 400 });
    }
    const context = await requireCompanionContext();
    if (!context.ok) return context.response;

    const { data: receipt, error: receiptError } = await context.supabase
      .from("sync_mutation_receipts")
      .select("result")
      .eq("user_id", context.userId)
      .eq("mutation_id", receiptId)
      .maybeSingle();
    if (receiptError) {
      return NextResponse.json({ success: false, error: "receipt_verification_failed" }, { status: 500 });
    }

    const receiptResult = receipt?.result as ReceiptResult | undefined;
    const verifiedItem = receiptResult?.serverItem;
    if (!receiptResult || !["applied", "duplicate"].includes(receiptResult.status || "") || !verifiedItem) {
      return NextResponse.json({ success: false, accepted: false, error: "unverified_receipt" }, { status: 422 });
    }
    if (typeof sourceItemId === "string" && sourceItemId !== verifiedItem.id) {
      return NextResponse.json({ success: false, accepted: false, error: "receipt_item_mismatch" }, { status: 422 });
    }

    const repo = context.repo!;
    const attributes = verifiedItem.attributes || {};
    const applied = await applyCompanionEventWithRetry({
      repo,
      personaId,
      buildEvent: (existingEvents) =>
        createCompanionDomainEvent({
          userId: context.userId,
          personaId,
          eventType: "task_progressed",
          authority: "server_receipt",
          sourceItemId: verifiedItem.id,
          sourceVersion: verifiedItem.version,
          sourceReceiptId: receiptId,
          payload: {
            itemId: verifiedItem.id,
            sourceVersion: verifiedItem.version,
            isSample: attributes.isSample === true,
            isMock: attributes.isMock === true,
          },
          timezone: "Asia/Seoul",
          existingDayEvents: existingEvents,
        }),
    });

    return NextResponse.json({
      success: true,
      accepted: applied.recorded,
      eventRecorded: applied.recorded,
      duplicate: !applied.recorded,
      bondDelta: applied.bondDelta,
      profile: applied.profile,
      isLevelUp: applied.isLevelUp,
      transitionSceneKey: applied.transitionSceneKey,
    });
  } catch (error) {
    console.error("[POST /api/companion/interactions] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "companion_interaction_failed",
      },
      { status: 500 }
    );
  }
}
