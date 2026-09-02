import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  createAdminSupabaseClient,
  requireSupabaseUser,
} from "@/lib/supabase/server";
import {
  getCompanionFeatureAccess,
  getCompanionFeatureStatus,
  isCompanionGrowthActive,
} from "./featureAccess";
import type {
  CompanionEvent,
  CompanionFeatureAccess,
  CompanionFeatureStatus,
  CompanionProfile,
} from "./contracts";
import {
  CompanionProfileVersionConflictError,
  SupabaseCompanionRepository,
} from "./repositories/supabase";
import { evaluateRelationshipProfile } from "./relationshipEngine";

type CompanionContextOptions = {
  requireActive?: boolean;
  requireAdmin?: boolean;
};

type CompanionContextSuccess = {
  ok: true;
  user: User;
  userId: string;
  supabase: SupabaseClient;
  admin: SupabaseClient | null;
  repo: SupabaseCompanionRepository | null;
  access: CompanionFeatureAccess;
  status: CompanionFeatureStatus;
};

type CompanionContextFailure = { ok: false; response: NextResponse };

export type CompanionServerContext = CompanionContextSuccess | CompanionContextFailure;

export async function requireCompanionContext(
  options: CompanionContextOptions = {}
): Promise<CompanionServerContext> {
  const auth = await requireSupabaseUser("컴패니언 계정 기능은 로그인이 필요합니다.");
  if (!auth.ok) return auth;

  const { data: profile, error: profileError } = await auth.supabase
    .from("user_profiles")
    .select("companion_growth_enabled, companion_test_cohort")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "companion_profile_schema_unavailable",
          message: "컴패니언 사용자 설정 스키마를 확인할 수 없습니다.",
        },
        { status: 503 }
      ),
    };
  }

  const access = getCompanionFeatureAccess({
    userCohort: profile?.companion_test_cohort ?? null,
    userEnabled: profile?.companion_growth_enabled === true,
  });
  const status = getCompanionFeatureStatus(access);

  if (options.requireActive !== false && !isCompanionGrowthActive(access)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "companion_feature_disabled",
          status,
        },
        { status: 403 }
      ),
    };
  }

  const admin = options.requireAdmin === false ? null : createAdminSupabaseClient();
  if (options.requireAdmin !== false && !admin) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "companion_service_unavailable",
          message: "컴패니언 서버 저장소 설정이 필요합니다.",
        },
        { status: 503 }
      ),
    };
  }

  return {
    ok: true,
    user: auth.user,
    userId: auth.user.id,
    supabase: auth.supabase,
    admin,
    repo: admin
      ? new SupabaseCompanionRepository(auth.supabase, auth.user.id, admin)
      : null,
    access,
    status,
  };
}

export function isValidPersonaId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function applyCompanionEventWithRetry(params: {
  repo: SupabaseCompanionRepository;
  personaId: string;
  buildEvent: (existingEvents: CompanionEvent[]) => CompanionEvent;
}): Promise<{
  recorded: boolean;
  bondDelta: number;
  profile: CompanionProfile;
  isLevelUp: boolean;
  transitionSceneKey?: string;
}> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const allEvents = await params.repo.getEvents();
    const existingPersonaEvents = allEvents.filter(
      (event) => event.personaId === params.personaId
    );
    const profile = await params.repo.getProfile(params.personaId);
    const event = params.buildEvent(allEvents);
    const evaluation = evaluateRelationshipProfile({
      existingProfile: profile,
      events: [event, ...existingPersonaEvents],
    });
    const now = Date.now();
    const nextProfile: CompanionProfile = {
      ...profile,
      bondExp: evaluation.bondExp,
      relationshipLevel: evaluation.relationshipLevel,
      lastInteractionAt: now,
      version: profile.version + 1,
      updatedAt: now,
    };

    try {
      const applied = await params.repo.applyEventAndProfile(
        event,
        nextProfile,
        profile.version
      );
      return {
        recorded: applied.recorded,
        bondDelta: applied.recorded ? applied.bondDelta : 0,
        profile: applied.profile,
        isLevelUp: applied.recorded && evaluation.isLevelUp,
        transitionSceneKey:
          applied.recorded && evaluation.isLevelUp
            ? evaluation.transitionSceneKey
            : undefined,
      };
    } catch (error) {
      if (error instanceof CompanionProfileVersionConflictError && attempt < 2) continue;
      throw error;
    }
  }
  throw new CompanionProfileVersionConflictError();
}
