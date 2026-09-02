// 🚦 GET /api/companion/status — 컴패니언 기능 활성화 및 롤아웃 상태 조회 API (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §14.5

import { NextRequest, NextResponse } from "next/server";
import {
  getCompanionFeatureAccess,
  getCompanionFeatureStatus,
} from "@/lib/companion/featureAccess";

export async function GET(req: NextRequest) {
  try {
    const userEnabledParam = req.nextUrl.searchParams.get("enabled");
    const userCohort = req.nextUrl.searchParams.get("cohort");

    const access = getCompanionFeatureAccess({
      userCohort,
      userEnabled: userEnabledParam === "true",
    });

    const status = getCompanionFeatureStatus(access);

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
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
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
