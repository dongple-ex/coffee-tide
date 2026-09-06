import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { AI_JOB_TTL_SECONDS, validAiJobId, type AiJob } from "./types";

const directory = path.join(process.cwd(), "data", "ai-jobs");
const clean = (value?: string) => value?.trim().replace(/^["']|["']$/g, "");

function redisClient(): Redis | null {
  const url = clean(process.env.UPSTASH_REDIS_REST_URL) || clean(process.env.KV_REST_API_URL);
  const token = clean(process.env.UPSTASH_REDIS_REST_TOKEN) || clean(process.env.KV_REST_API_TOKEN);
  if (url && token) return new Redis({ url, token });
  if (process.env.VERCEL) throw new Error("AI 작업 저장소가 설정되지 않았습니다.");
  return null;
}

function fileFor(id: string): string {
  if (!validAiJobId(id)) throw new Error("Invalid AI job ID");
  return path.join(directory, `${id}.json`);
}

/** Atomic creation prevents duplicate model/tool execution for a repeated request ID. */
export async function createAiJob(job: AiJob): Promise<boolean> {
  const file = fileFor(job.id);
  const redis = redisClient();
  if (redis) return (await redis.set(`coffeetide:ai-job:${job.id}`, job, { nx: true, ex: AI_JOB_TTL_SECONDS })) === "OK";
  await fs.mkdir(directory, { recursive: true });
  // Bounded retention for self-hosted installs, matching Redis expiry.
  for (const entry of await fs.readdir(directory)) {
    if (!validAiJobId(entry.replace(/\.json$/, "")) || !entry.endsWith(".json")) continue;
    const target = path.join(directory, entry);
    const stat = await fs.stat(target).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > AI_JOB_TTL_SECONDS * 1000) await fs.unlink(target).catch(() => {});
  }
  try {
    await fs.writeFile(file, JSON.stringify(job), { encoding: "utf8", flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export async function getAiJob(id: string, ownerId: string): Promise<AiJob | null> {
  const file = fileFor(id);
  const redis = redisClient();
  let job: AiJob | null;
  if (redis) job = await redis.get<AiJob>(`coffeetide:ai-job:${id}`);
  else {
    try { job = JSON.parse(await fs.readFile(/* turbopackIgnore: true */ file, "utf8")) as AiJob; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  if (!job || job.ownerId !== ownerId || Date.now() - job.createdAt >= AI_JOB_TTL_SECONDS * 1000) return null;
  return job;
}

export async function saveAiJob(job: AiJob): Promise<void> {
  const file = fileFor(job.id);
  const redis = redisClient();
  const remaining = Math.ceil(AI_JOB_TTL_SECONDS - (Date.now() - job.createdAt) / 1000);
  if (remaining <= 0) return;
  if (redis) {
    await redis.set(`coffeetide:ai-job:${job.id}`, job, { ex: remaining });
  } else {
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, JSON.stringify(job), "utf8");
    await fs.rename(temp, file);
  }
}
