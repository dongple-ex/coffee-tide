// 사용자 데이터 동기화 DB 어댑터 (Supabase REST / Upstash Redis / Guest Mode)
import { UnifiedData, UnifiedCategory } from "../types/unified";
import { CustomWidgetConfig } from "@/app/components/CustomNewsWidget";
import { AutomationRule } from "../automation/rules";
import { getActiveDbProvider } from "./client";

export interface UserCloudState {
  items: UnifiedData[];
  widgets: CustomWidgetConfig[];
  rules: AutomationRule[];
  dismissedIds: string[];
}

/** Supabase PostgREST API를 통한 동기화 (패키지 종속성 없이 fetch 사용) */
async function supabaseSyncGet(userId: string): Promise<UserCloudState | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  try {
    const [itemsRes, widgetsRes, rulesRes] = await Promise.all([
      fetch(`${url}/rest/v1/unified_items?user_id=eq.${userId}&select=*`, { headers }),
      fetch(`${url}/rest/v1/user_widgets?user_id=eq.${userId}&select=*`, { headers }),
      fetch(`${url}/rest/v1/user_rules?user_id=eq.${userId}&select=*`, { headers }),
    ]);

    if (!itemsRes.ok || !widgetsRes.ok || !rulesRes.ok) return null;

    const dbItems = await itemsRes.json();
    const dbWidgets = await widgetsRes.json();
    const dbRules = await rulesRes.json();

    const items: UnifiedData[] = (dbItems as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      source: row.source as UnifiedData["source"],
      title: String(row.title),
      content: String(row.content || ""),
      created_at: String(row.created_at),
      author: (row.author as { name: string }) || { name: "System" },
      url: String(row.url || ""),
      category: row.category as UnifiedCategory,
      actionDirective: row.action_directive ? String(row.action_directive) : undefined,
      status: row.status as UnifiedData["status"],
      workNote: row.work_note ? String(row.work_note) : undefined,
      subTasks: row.sub_tasks as UnifiedData["subTasks"],
    }));

    const widgets: CustomWidgetConfig[] = (dbWidgets as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      url: String(row.url),
      icon: row.icon ? String(row.icon) : undefined,
      createdAt: String(row.created_at || new Date().toISOString()),
    }));

    const rules: AutomationRule[] = (dbRules as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      field: row.field as AutomationRule["field"],
      value: String(row.value),
      action: row.action as AutomationRule["action"],
      enabled: Boolean(row.enabled),
    }));

    return { items, widgets, rules, dismissedIds: [] };
  } catch (error) {
    console.error("[supabaseSyncGet] Error:", error);
    return null;
  }
}

async function supabaseSyncSave(userId: string, state: UserCloudState): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };

  try {
    const dbItems = state.items.map((i) => ({
      id: i.id,
      user_id: userId,
      source: i.source,
      title: i.title,
      content: i.content,
      created_at: i.created_at,
      author: i.author,
      url: i.url,
      category: i.category,
      action_directive: i.actionDirective,
      status: i.status,
      work_note: i.workNote,
      sub_tasks: i.subTasks,
    }));

    if (dbItems.length > 0) {
      await fetch(`${url}/rest/v1/unified_items`, {
        method: "POST",
        headers,
        body: JSON.stringify(dbItems),
      });
    }

    return true;
  } catch (error) {
    console.error("[supabaseSyncSave] Error:", error);
    return false;
  }
}

/** Upstash Redis REST API 동기화 */
async function upstashSyncGet(userId: string): Promise<UserCloudState | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/user_state:${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!data.result) return null;
    return JSON.parse(data.result);
  } catch {
    return null;
  }
}

async function upstashSyncSave(userId: string, state: UserCloudState): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    await fetch(`${url}/set/user_state:${userId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(JSON.stringify(state)),
    });
    return true;
  } catch {
    return false;
  }
}

/** 통합 데이터베이스 불러오기 */
export async function getCloudUserData(userId: string): Promise<UserCloudState | null> {
  const provider = getActiveDbProvider();
  if (provider === "supabase") return supabaseSyncGet(userId);
  if (provider === "upstash") return upstashSyncGet(userId);
  return null;
}

/** 통합 데이터베이스 저장하기 */
export async function saveCloudUserData(userId: string, state: UserCloudState): Promise<boolean> {
  const provider = getActiveDbProvider();
  if (provider === "supabase") return supabaseSyncSave(userId, state);
  if (provider === "upstash") return upstashSyncSave(userId, state);
  return false;
}
