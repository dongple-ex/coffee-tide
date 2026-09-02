// 🚦 GET /api/companion/status — 컴패니언 기능 활성화 및 롤아웃 상태 조회 API (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §14.5

import { NextResponse } from "next/server";
import { requireCompanionContext } from "@/lib/companion/serverContext";

export async function GET() {
  try {
    const context = await requireCompanionContext({ requireActive: false, requireAdmin: false });
    if (!context.ok) return context.response;

    return NextResponse.json({
      success: true,
      status: context.status,
      settings: {
        enabled: context.access.userEnabled,
      },
    });
  } catch (error) {
    console.error("[GET /api/companion/status] Failed", error);
    return NextResponse.json(
      {
        success: false,
        status: {
          available: false,
          active: false,
          mode: "off",
          reason: "server_off",
          canToggle: false,
        },
        error: "companion_status_load_failed",
      },
      { status: 500 }
    );
  }
}
