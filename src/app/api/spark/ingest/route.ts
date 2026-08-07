import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { getSparkBriefings, addSparkBriefing } from "@/lib/adapters/sparkSync";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type SparkCategory = "urgent" | "approval_required" | "meeting" | "action_required" | "reference";
type SparkStatus = "pending" | "completed" | "flagged";

const CATEGORIES = new Set<SparkCategory>(["urgent", "approval_required", "meeting", "action_required", "reference"]);
const STATUSES = new Set<SparkStatus>(["pending", "completed", "flagged"]);
const MAX_TEXT_LENGTH = 2_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asTrimmedText(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function isSparkCategory(value: unknown): value is SparkCategory {
  return typeof value === "string" && CATEGORIES.has(value as SparkCategory);
}

function isSparkStatus(value: unknown): value is SparkStatus {
  return typeof value === "string" && STATUSES.has(value as SparkStatus);
}

function hasValidBearer(request: Request, expectedSecret: string): boolean {
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = Buffer.from(expectedSecret);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function getSignedInIdentity(): Promise<{ id: string; client?: SupabaseClient } | null> {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { id: user.id, client: supabase };
  }
  const session = await readSession();
  return session ? { id: session.userEmail } : null;
}

async function resolveSparkUserId(admin: SupabaseClient, requestedUser: string): Promise<string | null> {
  const query = admin.from("user_profiles").select("id");
  const result = UUID_PATTERN.test(requestedUser)
    ? await query.eq("id", requestedUser).maybeSingle()
    : await query.ilike("email", requestedUser).maybeSingle();
  if (result.error) throw new Error(`Spark user lookup failed: ${result.error.message}`);
  return result.data?.id ? String(result.data.id) : null;
}

export async function GET() {
  const identity = await getSignedInIdentity();
  if (!identity) return unauthorized();

  const items = await getSparkBriefings(identity.id, identity.client);
  return NextResponse.json({ success: true, items });
}

export async function POST(request: Request) {
  try {
    const configuredSecret = process.env.SPARK_INGEST_SECRET;
    const identity = await getSignedInIdentity();
    const isExternalRequest = Boolean(configuredSecret);

    if (configuredSecret) {
      if (!hasValidBearer(request, configuredSecret)) return unauthorized();
    } else if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "SPARK_INGEST_SECRET is not configured." },
        { status: 503 }
      );
    } else if (!identity) {
      return unauthorized();
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ success: false, error: "Invalid JSON format." }, { status: 400 });
    }

    const title = asTrimmedText(body.title);
    const summary = asTrimmedText(body.summary);
    const sourceApp = asTrimmedText(body.sourceApp, 120) ?? "Gemini Spark";
    const actionUrl = asTrimmedText(body.actionUrl, 2_000) ?? undefined;
    const externalId = asTrimmedText(body.externalId, 160) ?? undefined;
    if (body.category !== undefined && !isSparkCategory(body.category)) {
      return NextResponse.json({ success: false, error: "Unsupported category." }, { status: 400 });
    }
    if (body.status !== undefined && !isSparkStatus(body.status)) {
      return NextResponse.json({ success: false, error: "Unsupported status." }, { status: 400 });
    }
    if (actionUrl) {
      try {
        const url = new URL(actionUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error("unsupported protocol");
      } catch {
        return NextResponse.json({ success: false, error: "actionUrl must be an HTTP(S) URL." }, { status: 400 });
      }
    }

    const admin = createAdminSupabaseClient();
    let userId = identity?.id ?? null;
    let persistenceClient: SupabaseClient | undefined;

    if (isExternalRequest) {
      if (!admin) {
        return NextResponse.json(
          { success: false, error: "SUPABASE_SECRET_KEY is required for durable Spark ingestion." },
          { status: 503 }
        );
      }
      const requestedUser = asTrimmedText(body.userId, 160);
      if (!requestedUser) {
        return NextResponse.json({ success: false, error: "userId is required." }, { status: 400 });
      }
      userId = await resolveSparkUserId(admin, requestedUser);
      if (!userId) {
        return NextResponse.json({ success: false, error: "Spark target user was not found." }, { status: 404 });
      }
      persistenceClient = admin;
    }

    if (!title || !summary || !userId) {
      return NextResponse.json(
        { success: false, error: "title, summary, and an authenticated user are required." },
        { status: 400 }
      );
    }

    const newItem = await addSparkBriefing({
      userId,
      externalId,
      title,
      summary,
      category: isSparkCategory(body.category) ? body.category : "reference",
      sourceApp,
      actionUrl,
      status: isSparkStatus(body.status) ? body.status : "completed",
    }, persistenceClient);

    return NextResponse.json({
      success: true,
      storage: persistenceClient ? "supabase" : "memory",
      item: newItem,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process Spark payload.";
    console.error("[POST /api/spark/ingest] Error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
