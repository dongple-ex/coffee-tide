import type { SupabaseClient } from "@supabase/supabase-js";
import { UnifiedData } from "../types/unified";
import { CustomWidgetConfig } from "@/app/components/CustomNewsWidget";
import { AutomationRule } from "../automation/rules";
import { getActiveDbProvider } from "./client";
import { mapUnifiedItemFromDb } from "../data/mappers";

export interface UserCloudState {
  items: UnifiedData[];
  widgets: CustomWidgetConfig[];
  rules: AutomationRule[];
  dismissedIds: string[];
}

type DbRow = Record<string, unknown>;

async function supabaseSyncGet(
  supabase: SupabaseClient,
  userId: string
): Promise<UserCloudState | null> {
  const [profileResult, itemsResult, widgetsResult, rulesResult] = await Promise.all([
    supabase.from("user_profiles").select("dismissed_ids").eq("id", userId).maybeSingle(),
    supabase.from("unified_items").select("*").eq("user_id", userId),
    supabase.from("user_widgets").select("*").eq("user_id", userId),
    supabase.from("user_rules").select("*").eq("user_id", userId),
  ]);

  const error = profileResult.error || itemsResult.error || widgetsResult.error || rulesResult.error;
  if (error) {
    console.error("[supabaseSyncGet] Request failed", error.message);
    return null;
  }

  const hasCloudState =
    Boolean(profileResult.data) ||
    (itemsResult.data?.length ?? 0) > 0 ||
    (widgetsResult.data?.length ?? 0) > 0 ||
    (rulesResult.data?.length ?? 0) > 0;
  if (!hasCloudState) return null;

  const items = (itemsResult.data as DbRow[]).map(mapUnifiedItemFromDb);
  const widgets: CustomWidgetConfig[] = (widgetsResult.data as DbRow[]).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    url: String(row.url),
    icon: row.icon ? String(row.icon) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  }));
  const rules: AutomationRule[] = (rulesResult.data as DbRow[]).map((row) => ({
    id: String(row.id),
    field: row.field as AutomationRule["field"],
    value: String(row.value),
    action: row.action as AutomationRule["action"],
    enabled: Boolean(row.enabled),
  }));
  const dismissedIds = Array.isArray(profileResult.data?.dismissed_ids)
    ? profileResult.data.dismissed_ids.map(String)
    : [];

  return { items, widgets, rules, dismissedIds };
}

async function replaceUserRows(
  supabase: SupabaseClient,
  table: "user_widgets" | "user_rules",
  userId: string,
  rows: Array<Record<string, unknown>>
): Promise<boolean> {
  const existingResult = await supabase.from(table).select("id").eq("user_id", userId);
  if (existingResult.error) {
    console.error(`[supabaseSyncSave] ${table} read failed`, existingResult.error.message);
    return false;
  }

  if (rows.length > 0) {
    const upsertResult = await supabase.from(table).upsert(rows, { onConflict: "user_id,id" });
    if (upsertResult.error) {
      console.error(`[supabaseSyncSave] ${table} upsert failed`, upsertResult.error.message);
      return false;
    }
  }

  const desiredIds = new Set(rows.map((row) => String(row.id)));
  const staleIds = (existingResult.data ?? [])
    .map((row) => String(row.id))
    .filter((id) => !desiredIds.has(id));
  if (staleIds.length > 0) {
    const deleteResult = await supabase
      .from(table)
      .delete()
      .eq("user_id", userId)
      .in("id", staleIds);
    if (deleteResult.error) {
      console.error(`[supabaseSyncSave] ${table} delete failed`, deleteResult.error.message);
      return false;
    }
  }

  return true;
}

async function supabaseSyncSave(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  state: UserCloudState
): Promise<boolean> {
  const profileResult = await supabase.from("user_profiles").upsert({
    id: userId,
    email,
    dismissed_ids: state.dismissedIds,
    updated_at: new Date().toISOString(),
  });
  if (profileResult.error) {
    console.error("[supabaseSyncSave] Profile upsert failed", profileResult.error.message);
    return false;
  }

  const dbWidgets = state.widgets.map((widget) => ({
    id: widget.id,
    user_id: userId,
    name: widget.name,
    url: widget.url,
    icon: widget.icon,
    created_at: widget.createdAt,
  }));
  const dbRules = state.rules.map((rule, index) => ({
    id: rule.id ?? `legacy-${index}-${rule.field}-${rule.action}-${encodeURIComponent(rule.value).slice(0, 80)}`,
    user_id: userId,
    field: rule.field,
    value: rule.value,
    action: rule.action,
    enabled: rule.enabled,
  }));

  const results = await Promise.all([
    replaceUserRows(supabase, "user_widgets", userId, dbWidgets),
    replaceUserRows(supabase, "user_rules", userId, dbRules),
  ]);
  return results.every(Boolean);
}

async function upstashSyncGet(userId: string): Promise<UserCloudState | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const response = await fetch(`${url}/get/user_state:${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch {
    return null;
  }
}

async function upstashSyncSave(userId: string, state: UserCloudState): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const response = await fetch(`${url}/set/user_state:${userId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(JSON.stringify(state)),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getCloudUserData(
  userId: string,
  supabase?: SupabaseClient
): Promise<UserCloudState | null> {
  const provider = getActiveDbProvider();
  if (provider === "supabase") return supabase ? supabaseSyncGet(supabase, userId) : null;
  if (provider === "upstash") return upstashSyncGet(userId);
  return null;
}

export async function saveCloudUserData(
  userId: string,
  email: string,
  state: UserCloudState,
  supabase?: SupabaseClient
): Promise<boolean> {
  const provider = getActiveDbProvider();
  if (provider === "supabase") {
    return supabase ? supabaseSyncSave(supabase, userId, email, state) : false;
  }
  if (provider === "upstash") return upstashSyncSave(userId, state);
  return false;
}
