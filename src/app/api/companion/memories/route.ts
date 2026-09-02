// 🧠 GET /api/companion/memories — 기억 목록 조회 API (Phase 17-C)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2

import { NextRequest, NextResponse } from "next/server";
import { isSameOriginRequest, requireCompanionContext } from "@/lib/companion/serverContext";
import type {
  CompanionMemory,
  CompanionMemoryStatus,
  CompanionMemoryType,
} from "@/lib/companion/contracts";
import { evaluateMemoryCandidate } from "@/lib/companion/memoryPolicy";

const MEMORY_STATUSES = new Set<CompanionMemoryStatus>([
  "candidate",
  "active",
  "rejected",
  "expired",
  "deleted",
]);

export async function GET(req: NextRequest) {
  try {
    const statusParam = req.nextUrl.searchParams.get("status");
    if (statusParam && !MEMORY_STATUSES.has(statusParam as CompanionMemoryStatus)) {
      return NextResponse.json({ success: false, error: "invalid_memory_status" }, { status: 400 });
    }

    const context = await requireCompanionContext({ requireActive: false });
    if (!context.ok) return context.response;
    const memories = await context.repo!.getMemories(statusParam || undefined);

    return NextResponse.json({
      success: true,
      memories,
      active: context.status.active,
      managementAvailable: true,
    });
  } catch (error) {
    console.error("[GET /api/companion/memories] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "companion_memories_load_failed",
      },
      { status: 500 }
    );
  }
}

const MEMORY_TYPES = new Set<CompanionMemoryType>([
  "preference",
  "work_style",
  "commitment",
  "boundary",
]);

export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ success: false, error: "invalid_request_origin" }, { status: 403 });
    }
    const body: { memoryType?: unknown; contentText?: unknown; personaScope?: unknown } = await req.json();
    if (typeof body.memoryType !== "string" || !MEMORY_TYPES.has(body.memoryType as CompanionMemoryType)) {
      return NextResponse.json({ success: false, error: "invalid_memory_type" }, { status: 400 });
    }
    if (typeof body.contentText !== "string" || !body.contentText.trim() || body.contentText.length > 2000) {
      return NextResponse.json({ success: false, error: "invalid_memory_content" }, { status: 400 });
    }
    const personaScope = body.personaScope === undefined ? "shared" : body.personaScope;
    if (typeof personaScope !== "string" || !/^(shared|[a-zA-Z0-9_-]{1,64})$/.test(personaScope)) {
      return NextResponse.json({ success: false, error: "invalid_persona_scope" }, { status: 400 });
    }

    const evaluation = evaluateMemoryCandidate(body.contentText);
    if (!evaluation.isEligible) {
      return NextResponse.json(
        { success: false, error: evaluation.rejectReason || "memory_not_eligible" },
        { status: 422 }
      );
    }

    const context = await requireCompanionContext();
    if (!context.ok) return context.response;
    const now = Date.now();
    const memory: CompanionMemory = {
      id: crypto.randomUUID(),
      userId: context.userId,
      personaScope,
      memoryType: body.memoryType as CompanionMemoryType,
      contentText: body.contentText.trim(),
      status: "active",
      confidence: 1,
      userConfirmed: true,
      sensitivity: evaluation.sensitivity,
      sourceRefs: ["manual_user_input"],
      recallCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await context.repo!.saveMemory(memory);
    return NextResponse.json({ success: true, memory }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/companion/memories] Failed", error);
    return NextResponse.json(
      { success: false, error: "companion_memory_save_failed" },
      { status: 500 }
    );
  }
}
