// 푸시 구독 프로필 저장소 — 파일 기반 (data/push-profiles.json, gitignore됨).
// 세션이 쿠키에만 있는 구조라, 스케줄 발송에 필요한 최소 정보(구독+업무 스냅샷)를 서버에 둔다.

import { promises as fs } from "node:fs";
import path from "node:path";
import { UnifiedData } from "../types/unified";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "push-profiles.json");

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushProfile {
  endpoint: string;
  subscription: StoredSubscription;
  briefTime: string; // "HH:MM" (프로필 타임존 기준)
  timezone: string; // IANA
  items: UnifiedData[]; // 마지막 동기화 시점의 활성 업무 스냅샷
  lastSentDate?: string; // "YYYY-MM-DD" (프로필 타임존 기준)
  createdAt: string;
}

async function readAll(): Promise<PushProfile[]> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PushProfile[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(profiles: PushProfile[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(profiles, null, 2), "utf8");
}

export function listProfiles(): Promise<PushProfile[]> {
  return readAll();
}

export async function getProfile(endpoint: string): Promise<PushProfile | undefined> {
  return (await readAll()).find((p) => p.endpoint === endpoint);
}

export async function upsertProfile(profile: PushProfile): Promise<void> {
  const profiles = await readAll();
  const idx = profiles.findIndex((p) => p.endpoint === profile.endpoint);
  if (idx >= 0) {
    // 기존 스냅샷·발송 기록은 유지하고 설정만 갱신
    profiles[idx] = {
      ...profiles[idx],
      ...profile,
      items: profile.items.length > 0 ? profile.items : profiles[idx].items,
    };
  } else {
    profiles.push(profile);
  }
  await writeAll(profiles);
}

export async function updateProfile(
  endpoint: string,
  patch: Partial<PushProfile>
): Promise<boolean> {
  const profiles = await readAll();
  const idx = profiles.findIndex((p) => p.endpoint === endpoint);
  if (idx === -1) return false;
  profiles[idx] = { ...profiles[idx], ...patch };
  await writeAll(profiles);
  return true;
}

export async function removeProfile(endpoint: string): Promise<void> {
  const profiles = await readAll();
  await writeAll(profiles.filter((p) => p.endpoint !== endpoint));
}
