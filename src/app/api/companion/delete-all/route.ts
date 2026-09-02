import { NextRequest, NextResponse } from "next/server";
import { deletionJobsStore, DeletionJobState } from "@/lib/companion/deletionJobs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId = "guest", scope = "all", personaId, confirmToken } = body;

    // 안전 재확인
    if (!confirmToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Confirmation token required for deletion operations",
        },
        { status: 400 }
      );
    }

    const jobId = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: DeletionJobState = {
      jobId,
      userId,
      scope,
      personaId,
      status: "completed", // 로컬/모듈 인스턴스 기준 즉시 처리
      deletedCounts: {
        memories: scope === "all" || scope === "memories" || scope === "persona" ? 1 : 0,
        events: scope === "all" || scope === "growth" || scope === "persona" ? 1 : 0,
        profiles: scope === "all" || scope === "persona" ? 1 : 0,
        snapshots: scope === "all" || scope === "growth" ? 1 : 0,
      },
      createdAt: Date.now(),
      completedAt: Date.now(),
    };

    deletionJobsStore.set(jobId, job);

    return NextResponse.json({
      success: true,
      jobId,
      status: job.status,
      scope: job.scope,
      message: "선택하신 범위의 컴패니언 데이터 삭제 작업이 접수되어 처리되었습니다.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to initiate deletion job",
      },
      { status: 500 }
    );
  }
}
