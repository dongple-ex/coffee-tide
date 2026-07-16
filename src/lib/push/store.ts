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

async function writeProfileFile(profiles: PushProfile[]): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    // 원자적 쓰기: temp에 완성 후 rename — 중간 크래시가 기존 파일(전체 구독 목록)을 파손시키지 않게
    const tmp = `${FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(profiles, null, 2), "utf8");
    await fs.rename(tmp, FILE);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EROFS" || process.env.VERCEL) {
      throw new Error(
        "이 서버 환경은 파일 저장이 불가합니다 — Upstash Redis 환경변수(UPSTASH_REDIS_REST_URL/TOKEN)를 설정해 주세요"
      );
    }
    throw err;
  }
}

const fileBackend: Backend = {
  async list() {
    let raw: string;
    try {
      raw = await fs.readFile(FILE, "utf8");
    } catch {
      return []; // 파일 없음 — 최초 상태
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PushProfile[]) : [];
    } catch {
      // 파손 파일은 조용히 버리지 않고 보존 — 이후 set()이 빈 목록으로 덮어써도 복구 여지를 남긴다
      console.error("[coffeeTide] push-profiles.json 파싱 실패 — .corrupt로 백업 후 빈 목록으로 시작");
      await fs.rename(FILE, `${FILE}.corrupt-${Date.now()}`).catch(() => {});
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
    await writeProfileFile(profiles);
  },
  async remove(endpoint) {
    await writeProfileFile((await this.list()).filter((p) => p.endpoint !== endpoint));
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

// 대시보드에 따옴표째 붙여넣은 값도 동작하도록 흡수 (Vercel은 따옴표를 값의 일부로 저장함)
function cleanEnv(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/^["']|["']$/g, "");
  return v || undefined;
}

// 백엔드 캐시와 쓰기 락은 반드시 globalThis에 둔다 — Next는 instrumentation(스케줄러)과
// 라우트 핸들러를 별도 모듈 인스턴스로 컴파일하므로, 모듈 스코프 변수로는 둘이 락을
// 공유하지 못한다 (scheduler.ts의 __coffeetideBriefingTimer와 같은 패턴).
const g = globalThis as typeof globalThis & {
  __coffeetidePushBackend?: Backend;
  __coffeetidePushOpLock?: Promise<unknown>;
};

function getBackend(): Backend {
  if (!g.__coffeetidePushBackend) {
    // Vercel Marketplace 통합은 KV_REST_API_* 이름으로 주입하므로 함께 인식
    const url = cleanEnv(process.env.UPSTASH_REDIS_REST_URL) ?? cleanEnv(process.env.KV_REST_API_URL);
    const token =
      cleanEnv(process.env.UPSTASH_REDIS_REST_TOKEN) ?? cleanEnv(process.env.KV_REST_API_TOKEN);
    g.__coffeetidePushBackend = url && token ? redisBackend(new Redis({ url, token })) : fileBackend;
  }
  return g.__coffeetidePushBackend;
}

// 프로세스 내 쓰기 직렬화 — 스케줄러(60초 틱)와 HTTP 라우트의 read-modify-write가
// 겹칠 때 마지막 쓰기가 앞선 갱신을 지우는 lost update를 막는다.
// (파일 백엔드는 전체 배열 재작성이라 특히 취약. 서버리스 다중 인스턴스 간 경쟁은 Redis hset의
// 필드 단위 원자성으로 완화됨.)
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const lock = g.__coffeetidePushOpLock ?? Promise.resolve();
  const run = lock.then(fn, fn);
  g.__coffeetidePushOpLock = run.catch(() => {});
  return run;
}

export function listProfiles(): Promise<PushProfile[]> {
  return getBackend().list();
}

export function getProfile(endpoint: string): Promise<PushProfile | undefined> {
  return getBackend().get(endpoint);
}

export function upsertProfile(profile: PushProfile): Promise<void> {
  return serialize(async () => {
    const store = getBackend();
    const existing = await store.get(profile.endpoint);
    if (existing) {
      // 기존 스냅샷·발송 기록·생성일은 락 안에서 읽은 값을 우선 유지 — 호출부가 락 밖에서
      // 읽은 낡은 lastSentDate로 스케줄러의 발송 기록을 덮어쓰지 못하게 한다
      await store.set({
        ...existing,
        ...profile,
        items: profile.items.length > 0 ? profile.items : existing.items,
        lastSentDate: existing.lastSentDate ?? profile.lastSentDate,
        createdAt: existing.createdAt ?? profile.createdAt,
      });
    } else {
      await store.set(profile);
    }
  });
}

export function updateProfile(endpoint: string, patch: Partial<PushProfile>): Promise<boolean> {
  return serialize(async () => {
    const store = getBackend();
    const existing = await store.get(endpoint);
    if (!existing) return false;
    await store.set({ ...existing, ...patch });
    return true;
  });
}

export function removeProfile(endpoint: string): Promise<void> {
  return serialize(() => getBackend().remove(endpoint));
}
