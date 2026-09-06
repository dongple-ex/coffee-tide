import { NextResponse } from "next/server";
import { resolveIdentity } from "@/lib/auth/identity";
import { unauthorized } from "@/lib/auth/cookies";
import { getAiJob } from "@/lib/ai/jobs/store";
import { publicAiJob, validAiJobId } from "@/lib/ai/jobs/types";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await resolveIdentity();
  if (!identity) return unauthorized();
  const { id } = await context.params;
  if (!validAiJobId(id)) return NextResponse.json({ error: "잘못된 작업 ID입니다." }, { status: 400 });
  try {
    const job = await getAiJob(id, identity.id);
    if (!job) return NextResponse.json({ error: "작업 결과가 없거나 보관 기간(24시간)이 지났습니다." }, { status: 404 });
    return NextResponse.json(publicAiJob(job), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "작업 결과를 불러오지 못했습니다." }, { status: 503 });
  }
}
