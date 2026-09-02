// 🧠 PATCH/DELETE /api/companion/memories/[id] — 기억 수정 및 tombstone 안전 삭제 API (Phase 17-C)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2, §13.6

import { NextRequest, NextResponse } from "next/server";
import {
  isSameOriginRequest,
  isValidUuid,
  requireCompanionContext,
} from "@/lib/companion/serverContext";
import type { CompanionMemoryStatus } from "@/lib/companion/contracts";
import { evaluateMemoryCandidate } from "@/lib/companion/memoryPolicy";

const EDITABLE_MEMORY_STATUSES = new Set<CompanionMemoryStatus>([
  "candidate",
  "active",
  "rejected",
  "expired",
]);

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ success: false, error: "invalid_request_origin" }, { status: 403 });
    }
    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ success: false, error: "invalid_memory_id" }, { status: 400 });
    }
    const body: { userConfirmed?: unknown; contentText?: unknown; status?: unknown } = await req.json();
    if (body.status !== undefined && !EDITABLE_MEMORY_STATUSES.has(body.status as CompanionMemoryStatus)) {
      return NextResponse.json({ success: false, error: "invalid_memory_status" }, { status: 400 });
    }
    if (body.contentText !== undefined) {
      if (typeof body.contentText !== "string" || !body.contentText.trim() || body.contentText.length > 2000) {
        return NextResponse.json({ success: false, error: "invalid_memory_content" }, { status: 400 });
      }
      const evaluation = evaluateMemoryCandidate(body.contentText);
      if (!evaluation.isEligible) {
        return NextResponse.json(
          { success: false, error: evaluation.rejectReason || "memory_not_eligible" },
          { status: 422 }
        );
      }
    }
    if (body.userConfirmed !== undefined && typeof body.userConfirmed !== "boolean") {
      return NextResponse.json({ success: false, error: "invalid_confirmation_value" }, { status: 400 });
    }

    const companion = await requireCompanionContext();
    if (!companion.ok) return companion.response;
    const repo = companion.repo!;
    const existing = await repo.getMemories();
    const target = existing.find((m) => m.id === id);

    if (!target) {
      return NextResponse.json({ success: false, error: "Memory not found" }, { status: 404 });
    }

    const updated = {
      ...target,
      userConfirmed:
        typeof body.userConfirmed === "boolean" ? body.userConfirmed : target.userConfirmed,
      contentText:
        typeof body.contentText === "string" ? body.contentText.trim() : target.contentText,
      status: (body.status as CompanionMemoryStatus | undefined) || target.status,
      version: target.version + 1,
      updatedAt: Date.now(),
    };

    await repo.saveMemory(updated);

    return NextResponse.json({
      success: true,
      memory: updated,
    });
  } catch (error) {
    console.error("[PATCH /api/companion/memories/:id] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "companion_memory_update_failed",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ success: false, error: "invalid_request_origin" }, { status: 403 });
    }
    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ success: false, error: "invalid_memory_id" }, { status: 400 });
    }
    const companion = await requireCompanionContext({ requireActive: false });
    if (!companion.ok) return companion.response;
    const deleted = await companion.repo!.deleteMemory(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Memory not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      deletedId: id,
      tombstoneCreated: true,
      expiresInDays: 30,
    });
  } catch (error) {
    console.error("[DELETE /api/companion/memories/:id] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "companion_memory_delete_failed",
      },
      { status: 500 }
    );
  }
}
