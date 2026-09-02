// 🧠 PATCH/DELETE /api/companion/memories/[id] — 기억 수정 및 tombstone 안전 삭제 API (Phase 17-C)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §11.2, §13.6

import { NextRequest, NextResponse } from "next/server";
import { SupabaseCompanionRepository } from "@/lib/companion/repositories/supabase";
import { generateMemoryKeyHash } from "@/lib/companion/memoryPolicy";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const { userId = "guest", userConfirmed, contentText, status } = body;

    const repo = new SupabaseCompanionRepository();
    const existing = await repo.getMemories(userId);
    const target = existing.find((m) => m.id === id);

    if (!target) {
      return NextResponse.json({ success: false, error: "Memory not found" }, { status: 404 });
    }

    const updated = {
      ...target,
      userConfirmed: typeof userConfirmed === "boolean" ? userConfirmed : target.userConfirmed,
      contentText: contentText ? String(contentText).trim() : target.contentText,
      status: status || target.status,
      version: target.version + 1,
      updatedAt: Date.now(),
    };

    await repo.saveMemory(updated);

    return NextResponse.json({
      success: true,
      memory: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to update memory",
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
    const { id } = await context.params;
    const userId = req.nextUrl.searchParams.get("userId") || "guest";

    const keyHash = generateMemoryKeyHash(userId, id);
    const repo = new SupabaseCompanionRepository();

    // 기억 즉시 삭제 및 30일 tombstone 기록
    await repo.deleteMemory(userId, id, keyHash);

    return NextResponse.json({
      success: true,
      deletedId: id,
      tombstoneCreated: true,
      expiresInDays: 30,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete memory",
      },
      { status: 500 }
    );
  }
}
