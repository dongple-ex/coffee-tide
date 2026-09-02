// ⚙️ POST /api/companion/settings — 컴패니언 사용자 활성화 설정 및 동의 저장 API (Phase 17-A)
// 정본 문서: doc/17-ai-companion-growth-memory-system-design.md §14.3, §14.5

import { NextRequest, NextResponse } from "next/server";
import { getCompanionFeatureStatus } from "@/lib/companion/featureAccess";
import { isSameOriginRequest, requireCompanionContext } from "@/lib/companion/serverContext";

export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ success: false, error: "invalid_request_origin" }, { status: 403 });
    }
    const body: { enabled?: unknown; termsVersion?: unknown } = await req.json();
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ success: false, error: "enabled_must_be_boolean" }, { status: 400 });
    }
    const termsVersion = typeof body.termsVersion === "string" ? body.termsVersion.trim() : "2026-09-01";
    if (!termsVersion || termsVersion.length > 64) {
      return NextResponse.json({ success: false, error: "invalid_terms_version" }, { status: 400 });
    }

    const context = await requireCompanionContext({ requireActive: false, requireAdmin: false });
    if (!context.ok) return context.response;
    if (body.enabled && !context.status.canToggle) {
      return NextResponse.json(
        { success: false, error: "companion_feature_not_available", status: context.status },
        { status: 403 }
      );
    }
    if (!context.user.email) {
      return NextResponse.json({ success: false, error: "account_email_required" }, { status: 409 });
    }

    const isEnabled = body.enabled;
    const now = new Date().toISOString();
    const persistedSettings = {
      id: context.userId,
      email: context.user.email,
      companion_growth_enabled: isEnabled,
      companion_paused_at: isEnabled ? null : now,
      companion_terms_version: termsVersion,
      updated_at: now,
      ...(isEnabled ? { companion_consent_at: now } : {}),
    };
    const { data: savedSettings, error } = await context.supabase
      .from("user_profiles")
      .upsert(persistedSettings, { onConflict: "id" })
      .select(
        "companion_growth_enabled, companion_consent_at, companion_paused_at, companion_terms_version"
      )
      .single();
    if (error || !savedSettings) {
      return NextResponse.json(
        { success: false, error: "companion_settings_save_failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      settings: {
        enabled: savedSettings.companion_growth_enabled === true,
        consentAt: savedSettings.companion_consent_at,
        pausedAt: savedSettings.companion_paused_at,
        termsVersion: savedSettings.companion_terms_version,
      },
      status: getCompanionFeatureStatus({ ...context.access, userEnabled: isEnabled }),
    });
  } catch (error) {
    console.error("[POST /api/companion/settings] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof SyntaxError ? "invalid_json" : "companion_settings_update_failed",
      },
      { status: error instanceof SyntaxError ? 400 : 500 }
    );
  }
}
