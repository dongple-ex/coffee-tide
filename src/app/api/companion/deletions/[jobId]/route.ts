import { NextRequest, NextResponse } from "next/server";
import { deletionJobsStore } from "@/lib/companion/deletionJobs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await context.params;
    const job = deletionJobsStore.get(jobId);

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
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch deletion status",
      },
      { status: 500 }
    );
  }
}
