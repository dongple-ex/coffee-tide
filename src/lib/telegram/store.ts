import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export function telegramDb() {
  const db = createAdminSupabaseClient();
  if (!db) { throw new Error("Telegram storage unavailable"); }
  return db;
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function startLink(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await telegramDb().rpc("telegram_start_link", { p_user: userId, p_hash: tokenHash(token) });
  if (error || typeof data !== "string") { throw new Error("Telegram link could not be started"); }
  return { requestId: data, token };
}

export async function linkStatus(userId: string) {
  const db = telegramDb();
  const [link, pending] = await Promise.all([
    db.from("telegram_links").select("display_name,created_at").eq("user_id", userId).maybeSingle(),
    db.from("telegram_link_requests").select("id,display_name,telegram_user_id,expires_at")
      .eq("user_id", userId).gt("expires_at", new Date().toISOString()).maybeSingle(),
  ]);
  if (link.error || pending.error) { throw new Error("Telegram link status unavailable"); }
  return { connected: Boolean(link.data), displayName: link.data?.display_name ?? null,
    pending: pending.data ? { requestId: pending.data.id, displayName: pending.data.display_name,
      telegramUserId: pending.data.telegram_user_id, expiresAt: pending.data.expires_at } : null };
}

export interface TelegramEvent {
  state: "claimed";
  update_id: number;
  link_id: string;
  user_id: string;
  chat_id: string;
  job_id: string;
  lease_id: string;
  question: string;
  reply: string | null;
  status: "processing" | "ready";
}

export async function stillLinked(event: TelegramEvent): Promise<boolean> {
  const { data, error } = await telegramDb().from("telegram_links").select("id")
    .eq("id", event.link_id).eq("user_id", event.user_id).eq("chat_id", event.chat_id).maybeSingle();
  if (error) { throw new Error("Telegram link check failed"); }
  return Boolean(data);
}

export async function checkpoint(event: TelegramEvent, patch: { reply?: string; status?: string; lease_until?: string | null }) {
  const { data, error } = await telegramDb().from("telegram_events").update(patch)
    .eq("update_id", event.update_id).eq("link_id", event.link_id).eq("lease_id", event.lease_id)
    .gt("lease_until", new Date().toISOString()).select("update_id");
  if (error) { throw new Error("Telegram checkpoint failed"); }
  return Boolean(data?.length);
}
