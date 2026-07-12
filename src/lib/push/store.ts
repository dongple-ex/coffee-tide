// 푸시 구독 프로필 저장소 — Upstash Redis(UPSTASH_REDIS_REST_* 설정 시) 또는 파일(data/push-profiles.json) 백엔드.
// 세션이 쿠키에만 있는 구조라, 스케줄 발송에 필요한 최소 정보(구독+업무 스냅샷)를 서버에 둔다.
// Vercel 등 서버리스 배포는 파일시스템이 휘발성이므로 Redis 필수. 셀프호스팅은 파일로 충분.

import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { UnifiedCategory, UnifiedStatus } from "../types/unified";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "push-profiles.json");
const REDIS_KEY = "coffeetide:push-profiles";

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// 브리핑 본문 생성에 필요한 최소 필드만 — 메일 본문·작성자 등 원문은 외부 저장소에 두지 않는다.
export interface BriefingItem {
  title: string;
  category?: UnifiedCategory;
  status?: UnifiedStatus;
}

export interface PushProfile {
  endpoint: string;
  subscription: StoredSubscription;
  briefTime: string; // "HH:MM" (프로필 타임존 기준)
  timezone: string; // IANA
  items: BriefingItem[]; // 마지막 동기화 시점의 활성 업무 스냅샷
  lastSentDate?: string; // "YYYY-MM-DD" (프로필 타임존 기준)
  createdAt: string;
}

interface Backend {
  list(): Promise<PushProfile[]>;
  get(endpoint: string): Promise<PushProfile | undefined>;
  set(profile: PushProfile): Promise<void>;
  remove(endpoint: string): Promise<void>;
}

const fileBackend: Backend = {
  async list() {
    try {
      const raw = await fs.readFile(FILE, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PushProfile[]) : [];
    } catch {
      return [];
    }
  },
  async get(endpoint) {
    return (await this.list()).find((p) => p.endpoint === endpoint);
  },
  async set(profile) {
    const profiles = await this.list();
    const idx = profiles.findIndex((p) => p.endpoint === profile.endpoint);
    if (idx >= 0) profiles[idx] = profile;
    else profiles.push(profile);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(profiles, null, 2), "utf8");
  },
  async remove(endpoint) {
    const profiles = (await this.list()).filter((p) => p.endpoint !== endpoint);
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(profiles, null, 2), "utf8");
  },
};

function redisBackend(redis: Redis): Backend {
  return {
    async list() {
      const values = await redis.hvals(REDIS_KEY);
      return Array.isArray(values) ? (values as PushProfile[]) : [];
    },
    async get(endpoint) {
      return (await redis.hget<PushProfile>(REDIS_KEY, endpoint)) ?? undefined;
    },
    async set(profile) {
      await redis.hset(REDIS_KEY, { [profile.endpoint]: profile });
    },
    async remove(endpoint) {
      await redis.hdel(REDIS_KEY, endpoint);
    },
  };
}

let backend: Backend | undefined;
function getBackend(): Backend {
  if (!backend) {
    backend =
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
        ? redisBackend(Redis.fromEnv())
        : fileBackend;
  }
  return backend;
}

export function listProfiles(): Promise<PushProfile[]> {
  return getBackend().list();
}

export function getProfile(endpoint: string): Promise<PushProfile | undefined> {
  return getBackend().get(endpoint);
}

export async function upsertProfile(profile: PushProfile): Promise<void> {
  const store = getBackend();
  const existing = await store.get(profile.endpoint);
  if (existing) {
    // 기존 스냅샷·발송 기록은 유지하고 설정만 갱신
    await store.set({
      ...existing,
      ...profile,
      items: profile.items.length > 0 ? profile.items : existing.items,
    });
  } else {
    await store.set(profile);
  }
}

export async function updateProfile(
  endpoint: string,
  patch: Partial<PushProfile>
): Promise<boolean> {
  const store = getBackend();
  const existing = await store.get(endpoint);
  if (!existing) return false;
  await store.set({ ...existing, ...patch });
  return true;
}

export async function removeProfile(endpoint: string): Promise<void> {
  await getBackend().remove(endpoint);
}
