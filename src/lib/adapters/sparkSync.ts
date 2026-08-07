import type { SupabaseClient } from "@supabase/supabase-js";
import { UnifiedData, UnifiedCategory } from "../types/unified";

export interface SparkBriefingItem {
  id: string;
  externalId?: string;
  userId: string;
  title: string;
  summary: string;
  category: "urgent" | "approval_required" | "meeting" | "action_required" | "reference";
  sourceApp?: string;
  actionUrl?: string;
  receivedAt: string;
  timestamp: string;
  status: "pending" | "completed" | "flagged";
}

type SparkInput = Omit<SparkBriefingItem, "id" | "timestamp" | "receivedAt">;
type SparkRow = Record<string, unknown>;

const sampleSparkBriefings: SparkBriefingItem[] = [
  {
    id: "spark-sample-1",
    externalId: "sample-calendar-1",
    userId: "guest@coffeetide.dongple.kr",
    title: "내일 오후 2시 팀 주간 회의 생성 완료",
    summary: "Gemini Spark가 참석자 일정을 확인해 회의를 만들었습니다.",
    category: "meeting",
    sourceApp: "Google Calendar",
    receivedAt: new Date().toISOString(),
    timestamp: "방금 전",
    status: "completed",
  },
];

declare global {
  var __coffeeTideSparkCache: SparkBriefingItem[] | undefined;
}

function getSparkCache(): SparkBriefingItem[] {
  if (!globalThis.__coffeeTideSparkCache) {
    globalThis.__coffeeTideSparkCache = process.env.NODE_ENV === "production" ? [] : [...sampleSparkBriefings];
  }
  return globalThis.__coffeeTideSparkCache;
}

function formatTimestamp(receivedAt: string): string {
  return new Date(receivedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function fromSparkRow(row: SparkRow): SparkBriefingItem {
  const receivedAt = String(row.received_at);
  return {
    id: String(row.id),
    externalId: row.external_id ? String(row.external_id) : undefined,
    userId: String(row.user_id),
    title: String(row.title),
    summary: String(row.summary),
    category: row.category as SparkBriefingItem["category"],
    sourceApp: row.source_app ? String(row.source_app) : undefined,
    actionUrl: row.action_url ? String(row.action_url) : undefined,
    receivedAt,
    timestamp: formatTimestamp(receivedAt),
    status: row.status as SparkBriefingItem["status"],
  };
}

export async function getSparkBriefings(
  userId: string,
  supabase?: SupabaseClient
): Promise<SparkBriefingItem[]> {
  if (supabase) {
    const result = await supabase
      .from("spark_briefings")
      .select("*")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(100);
    if (!result.error) return (result.data as SparkRow[]).map(fromSparkRow);
    console.error("[getSparkBriefings] Supabase read failed", result.error.message);
  }
  return getSparkCache().filter((item) => item.userId === userId);
}

export async function addSparkBriefing(
  item: SparkInput,
  supabase?: SupabaseClient
): Promise<SparkBriefingItem> {
  const receivedAt = new Date().toISOString();
  if (supabase) {
    const row = {
      user_id: item.userId,
      external_id: item.externalId,
      title: item.title,
      summary: item.summary,
      category: item.category,
      source_app: item.sourceApp || "Gemini Spark",
      action_url: item.actionUrl,
      status: item.status,
      received_at: receivedAt,
      updated_at: receivedAt,
    };
    const query = item.externalId
      ? supabase.from("spark_briefings").upsert(row, { onConflict: "user_id,external_id" })
      : supabase.from("spark_briefings").insert(row);
    const result = await query.select("*").single();
    if (result.error) throw new Error(`Spark briefing persistence failed: ${result.error.message}`);
    return fromSparkRow(result.data as SparkRow);
  }

  const sparkCache = getSparkCache();
  const existingIndex = item.externalId
    ? sparkCache.findIndex((candidate) => candidate.userId === item.userId && candidate.externalId === item.externalId)
    : -1;
  const existing = existingIndex >= 0 ? sparkCache[existingIndex] : undefined;
  const newItem: SparkBriefingItem = {
    ...item,
    id: existing?.id ?? `spark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    receivedAt,
    timestamp: formatTimestamp(receivedAt),
  };
  if (existingIndex >= 0) sparkCache.splice(existingIndex, 1);
  sparkCache.unshift(newItem);
  sparkCache.splice(100);
  return newItem;
}

const SPARK_BRIEFING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function getRecentSparkBriefings(
  userId: string,
  supabase?: SupabaseClient,
  now = Date.now()
): Promise<SparkBriefingItem[]> {
  const items = await getSparkBriefings(userId, supabase);
  return items
    .filter((item) => {
      const receivedAt = Date.parse(item.receivedAt);
      return Number.isFinite(receivedAt) && receivedAt <= now && now - receivedAt <= SPARK_BRIEFING_MAX_AGE_MS;
    })
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, 5);
}

export function toUnifiedData(sparkItem: SparkBriefingItem): UnifiedData {
  return {
    id: sparkItem.id,
    source: "spark",
    sourceApp: sparkItem.sourceApp || "Gemini Spark",
    title: sparkItem.title,
    content: sparkItem.summary,
    created_at: sparkItem.receivedAt,
    author: { name: sparkItem.sourceApp || "Gemini Spark" },
    url: sparkItem.actionUrl || "",
    status: sparkItem.status === "completed" ? "completed" : "pending",
    category: sparkItem.category as UnifiedCategory,
    actionDirective: sparkItem.summary,
  };
}

export async function getRecentSparkUnifiedItems(
  userId: string,
  supabase?: SupabaseClient
): Promise<UnifiedData[]> {
  return (await getRecentSparkBriefings(userId, supabase)).map(toUnifiedData);
}
