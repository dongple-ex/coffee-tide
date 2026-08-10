import "server-only";

import type { NextResponse } from "next/server";
import { readSession, writeSession } from "./cookies";
import type { SessionData } from "./session";
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
} from "./integrationCrypto";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";

export type IntegrationProvider = "google" | "outlook" | "notion";

type GoogleCredentials = Pick<
  SessionData,
  "googleToken" | "googleRefreshToken" | "googleTokenExpiry" | "googleEmail"
>;
type OutlookCredentials = Pick<
  SessionData,
  "outlookToken" | "outlookRefreshToken" | "outlookTokenExpiry" | "outlookEmail"
>;
type NotionCredentials = Pick<SessionData, "notionToken" | "notionDbId">;
type IntegrationCredentials = GoogleCredentials | OutlookCredentials | NotionCredentials;

const TABLE = "user_integrations";

function credentialsFromSession(
  provider: IntegrationProvider,
  session: SessionData
): IntegrationCredentials | null {
  if (provider === "google" && session.googleToken) {
    return {
      googleToken: session.googleToken,
      googleRefreshToken: session.googleRefreshToken,
      googleTokenExpiry: session.googleTokenExpiry,
      googleEmail: session.googleEmail,
    };
  }
  if (provider === "outlook" && session.outlookToken) {
    return {
      outlookToken: session.outlookToken,
      outlookRefreshToken: session.outlookRefreshToken,
      outlookTokenExpiry: session.outlookTokenExpiry,
      outlookEmail: session.outlookEmail,
    };
  }
  if (provider === "notion" && session.notionToken && session.notionDbId) {
    return { notionToken: session.notionToken, notionDbId: session.notionDbId };
  }
  return null;
}

export function stripIntegrationCredentials(session: SessionData): SessionData {
  const next = { ...session };
  delete next.googleToken;
  delete next.googleRefreshToken;
  delete next.googleTokenExpiry;
  delete next.googleEmail;
  delete next.outlookToken;
  delete next.outlookRefreshToken;
  delete next.outlookTokenExpiry;
  delete next.outlookEmail;
  delete next.notionToken;
  delete next.notionDbId;
  return next;
}

async function authenticatedUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function storeForUser(
  userId: string,
  provider: IntegrationProvider,
  credentials: IntegrationCredentials
): Promise<boolean> {
  const admin = createAdminSupabaseClient();
  if (!admin) return false;
  const { error } = await admin.from(TABLE).upsert(
    {
      user_id: userId,
      provider,
      credentials_ciphertext: encryptIntegrationCredentials(credentials),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" }
  );
  if (error) {
    console.error(`[integrationStore] ${provider} 저장 실패`, error.message);
    return false;
  }
  return true;
}

export async function storeIntegrationForCurrentUser(
  provider: IntegrationProvider,
  credentials: IntegrationCredentials
): Promise<boolean> {
  const userId = await authenticatedUserId();
  return userId ? storeForUser(userId, provider, credentials) : false;
}

export async function deleteIntegrationForCurrentUser(
  provider: IntegrationProvider
): Promise<boolean> {
  const userId = await authenticatedUserId();
  const admin = createAdminSupabaseClient();
  if (!userId || !admin) return false;
  const { error } = await admin
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) {
    console.error(`[integrationStore] ${provider} 삭제 실패`, error.message);
    return false;
  }
  return true;
}

export async function readSessionWithIntegrations(): Promise<SessionData | null> {
  const session = await readSession();
  const supabase = await createServerSupabaseClient();
  if (!supabase) return session;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return session;

  const base: SessionData = {
    ...(session ?? {}),
    userEmail: user.email ?? session?.userEmail ?? "",
    createdAt: session?.createdAt ?? new Date().toISOString(),
  };
  const admin = createAdminSupabaseClient();
  if (!admin) return base;
  const { data, error } = await admin
    .from(TABLE)
    .select("provider,credentials_ciphertext")
    .eq("user_id", user.id);
  if (error) {
    // Supabase SQL을 아직 적용하지 않은 환경은 기존 암호화 쿠키를 계속 사용한다.
    console.warn("[integrationStore] 서버 연동 저장소를 사용할 수 없어 쿠키로 폴백합니다.");
    return base;
  }

  let merged = stripIntegrationCredentials(base);
  for (const row of data ?? []) {
    const credentials = decryptIntegrationCredentials<IntegrationCredentials>(
      row.credentials_ciphertext
    );
    if (credentials) merged = { ...merged, ...credentials };
  }
  return merged;
}

export async function migrateLegacyIntegrations(session: SessionData): Promise<boolean> {
  const userId = await authenticatedUserId();
  if (!userId) return false;
  for (const provider of ["google", "outlook", "notion"] as const) {
    const credentials = credentialsFromSession(provider, session);
    if (!credentials) continue;
    if (!(await storeForUser(userId, provider, credentials))) return false;
  }
  return true;
}

export async function persistRefreshedIntegration(
  provider: IntegrationProvider,
  session: SessionData
): Promise<boolean> {
  const credentials = credentialsFromSession(provider, session);
  return credentials ? storeIntegrationForCurrentUser(provider, credentials) : false;
}

export async function writeSessionForCurrentUser<T extends NextResponse>(
  response: T,
  session: SessionData,
  preserveIntegrations = false
): Promise<T> {
  const userId = await authenticatedUserId();
  if (!userId || preserveIntegrations) return writeSession(response, session);

  const admin = createAdminSupabaseClient();
  if (!admin) return writeSession(response, session);
  const { error } = await admin.from(TABLE).select("provider").eq("user_id", userId).limit(1);
  return writeSession(response, error ? session : stripIntegrationCredentials(session));
}

export async function listIntegrationsForCurrentUser(): Promise<
  Array<{ provider: IntegrationProvider; credentials: IntegrationCredentials }>
> {
  const userId = await authenticatedUserId();
  const admin = createAdminSupabaseClient();
  if (!userId || !admin) return [];
  const { data, error } = await admin
    .from(TABLE)
    .select("provider,credentials_ciphertext")
    .eq("user_id", userId);
  if (error) return [];
  return (data ?? []).flatMap((row) => {
    if (!(["google", "outlook", "notion"] as string[]).includes(row.provider)) return [];
    const credentials = decryptIntegrationCredentials<IntegrationCredentials>(
      row.credentials_ciphertext
    );
    return credentials
      ? [{ provider: row.provider as IntegrationProvider, credentials }]
      : [];
  });
}
