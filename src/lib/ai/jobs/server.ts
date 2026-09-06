import { after, NextResponse } from "next/server";
import { getProfile } from "@/lib/push/store";
import { isPushConfigured, sendPush } from "@/lib/push/sender";
import { createAiJob, getAiJob, saveAiJob } from "./store";
import { AI_JOB_TIMEOUT_MS, publicAiJob, validAiJobId, type AiJob } from "./types";

export async function finishAiJob(job: AiJob, endpoint: string | undefined, execute: () => Promise<Response>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      execute(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("AI job timeout")), AI_JOB_TIMEOUT_MS);
      }),
    ]);
    job.result = await response.json() as Record<string, unknown>;
    job.status = response.ok ? "completed" : "failed";
    job.httpStatus = response.status;
  } catch {
    job.status = "failed";
    job.httpStatus = 500;
    job.result = { error: "AI 작업을 완료하지 못했습니다. 잠시 후 다시 요청해 주세요." };
  } finally {
    if (timer) clearTimeout(timer);
  }

  // Persist before sending: notification clicks can immediately retrieve the result.
  await saveAiJob(job);
  if (!endpoint || job.notification === "disabled") return;
  try {
    // Re-read so disabling notifications while a job runs is respected.
    const profile = await getProfile(endpoint);
    if (!profile) {
      job.notification = "disabled";
    } else {
      const fallback = job.result?.ai_fallback === true || job.result?.providerUsed === "local_rules";
      const payload = {
        title: job.status === "failed" ? "CoffeeTide · AI 작업 실패" : "CoffeeTide · 작업 완료",
        body: job.status === "failed" ? "작업을 완료하지 못했습니다. 눌러서 확인해 주세요."
          : fallback ? "AI를 사용할 수 없어 대체 응답을 준비했어요. 눌러서 확인해 주세요."
          : "요청하신 결과를 준비했어요. 눌러서 확인해 주세요.",
        url: `/?aiJob=${job.id}`,
        tag: `ai-job-${job.id}`,
      };
      let result = await sendPush(profile, payload);
      if (result === "transient") result = await sendPush(profile, payload);
      job.notification = result === "sent" ? "sent" : "failed";
    }
  } catch {
    job.notification = "failed";
  }
  // Push failures do not change a successfully saved AI result into an AI failure.
  await saveAiJob(job);
}

export async function acceptAiJob(options: {
  id: unknown;
  ownerId: string;
  kind: AiJob["kind"];
  question: string;
  pushEndpoint?: unknown;
  execute: () => Promise<Response>;
}): Promise<NextResponse> {
  if (!validAiJobId(options.id)) return NextResponse.json({ error: "잘못된 작업 ID입니다." }, { status: 400 });
  const endpoint = typeof options.pushEndpoint === "string" ? options.pushEndpoint : undefined;
  try {
    // Existing push APIs treat the high-entropy endpoint as a subscription capability.
    // Never accept an arbitrary network destination or broadcast to other subscriptions.
    const canNotify = Boolean(endpoint && isPushConfigured() && await getProfile(endpoint));
    const job: AiJob = {
      id: options.id, ownerId: options.ownerId, kind: options.kind,
      question: options.question.slice(0, 2000), createdAt: Date.now(), status: "running",
      notification: canNotify ? "pending" : "disabled",
    };
    if (!await createAiJob(job)) {
      const existing = await getAiJob(job.id, job.ownerId);
      if (!existing || existing.kind !== job.kind) return NextResponse.json({ error: "작업 ID를 사용할 수 없습니다." }, { status: 409 });
      return NextResponse.json(publicAiJob(existing), { status: 202 });
    }
    after(() => finishAiJob(job, endpoint, options.execute));
    return NextResponse.json(publicAiJob(job), { status: 202 });
  } catch {
    return NextResponse.json({ error: "AI 작업을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 });
  }
}
