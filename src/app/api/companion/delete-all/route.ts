import { NextRequest, NextResponse } from "next/server";
import {
  CompanionDeletionError,
  createDeletionChallenge,
  executeDeletionChallenge,
} from "@/lib/companion/deletionService";
import type { CompanionDeletionScope } from "@/lib/companion/deletionJobs";
import {
  isSameOriginRequest,
  isValidPersonaId,
  isValidUuid,
  requireCompanionContext,
} from "@/lib/companion/serverContext";

const DELETION_SCOPES = new Set<CompanionDeletionScope>([
  "all",
  "persona",
  "growth",
  "memories",
]);

export async function POST(req: NextRequest) {
  try {
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ success: false, error: "invalid_request_origin" }, { status: 403 });
    }
    const body: {
      scope?: unknown;
      personaId?: unknown;
      preserveRelationship?: unknown;
      jobId?: unknown;
      confirmToken?: unknown;
    } = await req.json();
    const scope = (body.scope || "all") as CompanionDeletionScope;
    if (!DELETION_SCOPES.has(scope)) {
      return NextResponse.json({ success: false, error: "invalid_deletion_scope" }, { status: 400 });
    }
    if (scope === "persona") {
      if (typeof body.personaId !== "string" || !isValidPersonaId(body.personaId)) {
        return NextResponse.json({ success: false, error: "persona_id_required" }, { status: 400 });
      }
    } else if (body.personaId !== undefined) {
      return NextResponse.json({ success: false, error: "persona_id_not_allowed" }, { status: 400 });
    }
    if (body.preserveRelationship !== undefined) {
      if (scope !== "growth" || typeof body.preserveRelationship !== "boolean") {
        return NextResponse.json(
          { success: false, error: "invalid_preserve_relationship_option" },
          { status: 400 }
        );
      }
    }

    const companion = await requireCompanionContext({ requireActive: false });
    if (!companion.ok) return companion.response;
    const admin = companion.admin!;

    const hasConfirmation = body.jobId !== undefined || body.confirmToken !== undefined;
    if (!hasConfirmation) {
      const challenge = await createDeletionChallenge({
        admin,
        userId: companion.userId,
        scope,
        personaId: typeof body.personaId === "string" ? body.personaId : undefined,
        preserveRelationship:
          scope === "growth" ? body.preserveRelationship !== false : undefined,
      });
      return NextResponse.json(
        {
          success: true,
          requiresConfirmation: true,
          jobId: challenge.job.jobId,
          confirmToken: challenge.confirmToken,
          expiresAt: challenge.job.expiresAt,
          scope: challenge.job.scope,
          preserveRelationship: challenge.job.preserveRelationship,
        },
        { status: 202 }
      );
    }

    if (typeof body.jobId !== "string" || typeof body.confirmToken !== "string") {
      return NextResponse.json(
        { success: false, error: "job_id_and_confirmation_token_required" },
        { status: 400 }
      );
    }
    if (!isValidUuid(body.jobId) || body.confirmToken.length < 32 || body.confirmToken.length > 128) {
      return NextResponse.json({ success: false, error: "invalid_deletion_confirmation" }, { status: 400 });
    }
    const job = await executeDeletionChallenge({
      admin,
      userId: companion.userId,
      jobId: body.jobId,
      confirmToken: body.confirmToken,
    });
    return NextResponse.json({
      success: true,
      requiresConfirmation: false,
      job,
      message: "선택한 범위의 컴패니언 데이터가 삭제되었습니다.",
    });
  } catch (error) {
    if (error instanceof CompanionDeletionError) {
      return NextResponse.json({ success: false, error: error.code }, { status: error.status });
    }
    console.error("[POST /api/companion/delete-all] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "companion_delete_failed",
      },
      { status: 500 }
    );
  }
}
