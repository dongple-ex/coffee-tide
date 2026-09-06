import { AI_JOB_TIMEOUT_MS, AI_JOB_TTL_SECONDS, validAiJobId, type PublicAiJob } from "./types";

const active = new Set<string>();
export const AI_JOBS_CHANGED = "coffeetide-ai-jobs-changed";
const storageKey = (scope: string) => `ct_ai_jobs:${scope}`;
interface PendingJob { id: string; createdAt: number }

export function pendingAiJobs(scope: string): PendingJob[] {
  try {
    const jobs = JSON.parse(localStorage.getItem(storageKey(scope)) || "[]") as PendingJob[];
    return Array.isArray(jobs) ? jobs.filter((j) => validAiJobId(j.id) && Date.now() - j.createdAt < AI_JOB_TTL_SECONDS * 1000) : [];
  } catch { return []; }
}

function storePending(scope: string, jobs: PendingJob[]): void {
  try { localStorage.setItem(storageKey(scope), JSON.stringify(jobs.slice(-30))); } catch { /* storage may be unavailable */ }
  window.dispatchEvent(new Event(AI_JOBS_CHANGED));
}

export function forgetAiJob(scope: string, id: string): void {
  storePending(scope, pendingAiJobs(scope).filter((job) => job.id !== id));
}

export function isAiJobActive(id: string): boolean { return active.has(id); }

export class AiJobReadError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function readAiJob(id: string): Promise<PublicAiJob> {
  const response = await fetch(`/api/ai/jobs/${encodeURIComponent(id)}`, {
    cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json();
  if (!response.ok) throw new AiJobReadError(data.error || "작업 결과를 불러오지 못했습니다.", response.status);
  return data as PublicAiJob;
}

export class AiJobPendingError extends Error {
  constructor() { super("연결이 끊겨 작업 접수·완료 여부를 확인하지 못했어요. 연결이 복구되면 같은 작업의 저장된 결과를 확인합니다."); }
}

/** The POST only accepts the task; polling can stop without cancelling server work. */
export async function requestAiJob(path: string, body: Record<string, unknown>, options: { scope: string; pushEndpoint?: string | null }): Promise<Response> {
  const id = crypto.randomUUID();
  const started = Date.now();
  active.add(id);
  storePending(options.scope, [...pendingAiJobs(options.scope), { id, createdAt: started }]);
  try {
    let response: Response;
    try {
      response = await fetch(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, background: true, jobId: id, pushEndpoint: options.pushEndpoint }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      // The request may have been accepted even when its acknowledgment was lost.
      // Keep its ID for recovery; never submit a second model/tool request here.
      throw new AiJobPendingError();
    }
    if (response.status !== 202) {
      forgetAiJob(options.scope, id);
      return response;
    }
    let accepted: PublicAiJob;
    try { accepted = await response.json() as PublicAiJob; }
    catch { throw new AiJobPendingError(); }
    let job = accepted;
    for (;;) {
      if (job.status !== "running") {
        forgetAiJob(options.scope, id);
        return Response.json(job.result || { error: "결과를 불러오지 못했습니다." }, { status: job.httpStatus || 500 });
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      if (document.visibilityState === "hidden") continue;
      try { job = await readAiJob(id); }
      catch { /* temporary network loss: keep the same job and retry */ }
      if (job.status === "running" && Date.now() - started > AI_JOB_TIMEOUT_MS + 45_000) throw new AiJobPendingError();
    }
  } finally {
    active.delete(id);
    window.dispatchEvent(new Event(AI_JOBS_CHANGED));
  }
}
