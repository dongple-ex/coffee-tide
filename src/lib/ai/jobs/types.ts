export const AI_JOB_TTL_SECONDS = 24 * 60 * 60;
export const AI_JOB_TIMEOUT_MS = 240_000;

export interface AiJob {
  id: string;
  ownerId: string;
  kind: "copilot" | "canvas";
  question: string;
  createdAt: number;
  status: "running" | "completed" | "failed";
  result?: Record<string, unknown>;
  httpStatus?: number;
  notification: "disabled" | "pending" | "sent" | "failed";
}

export type PublicAiJob = Omit<AiJob, "ownerId">;

export function validAiJobId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

export function publicAiJob(job: AiJob): PublicAiJob {
  const { ownerId: _ownerId, ...visible } = job;
  void _ownerId;
  // A terminated server invocation must not leave the client spinning forever.
  if (job.status === "running" && Date.now() - job.createdAt > AI_JOB_TIMEOUT_MS + 30_000) {
    return { ...visible, status: "failed", httpStatus: 504,
      result: { error: "작업 처리 시간이 초과되었습니다. 다시 요청해 주세요." } };
  }
  return visible;
}
