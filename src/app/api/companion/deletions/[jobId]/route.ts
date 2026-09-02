import { NextRequest, NextResponse } from "next/server";
import { CompanionDeletionError, getDeletionJob } from "@/lib/companion/deletionService";
import { isValidUuid, requireCompanionContext } from "@/lib/companion/serverContext";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    if (!isValidUuid(jobId)) {
      return NextResponse.json({ success: false, error: "invalid_deletion_job_id" }, { status: 400 });
    }
    const companion = await requireCompanionContext({ requireActive: false });
    if (!companion.ok) return companion.response;
    const job = await getDeletionJob({
      admin: companion.admin!,
      userId: companion.userId,
      jobId,
    });

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: "Deletion job not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job,
    });
  } catch (error) {
    if (error instanceof CompanionDeletionError) {
      return NextResponse.json({ success: false, error: error.code }, { status: error.status });
    }
    console.error("[GET /api/companion/deletions/:jobId] Failed", error);
    return NextResponse.json(
      {
        success: false,
        error: "deletion_status_load_failed",
      },
      { status: 500 }
    );
  }
}
