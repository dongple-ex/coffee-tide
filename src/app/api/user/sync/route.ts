import { NextResponse } from "next/server";
import { getCloudUserData, saveCloudUserData, type UserCloudState } from "@/lib/db/syncAdapter";
import { getActiveDbProvider } from "@/lib/db/client";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

interface CloudIdentity {
  id: string;
  email: string;
  supabase?: SupabaseClient;
}

async function getCloudIdentity(provider: ReturnType<typeof getActiveDbProvider>): Promise<CloudIdentity | null> {
  if (provider === "supabase") {
    const supabase = await createServerSupabaseClient();
    if (!supabase) return null;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return null;
    return { id: user.id, email: user.email, supabase };
  }

  const session = await readSession();
  return session ? { id: session.userEmail, email: session.userEmail } : null;
}

export async function GET() {
  const provider = getActiveDbProvider();
  if (provider === "guest") {
    return NextResponse.json({
      success: true,
      provider: "guest",
      message: "No cloud DB configured. Using local storage.",
      state: null,
    });
  }

  const identity = await getCloudIdentity(provider);
  if (!identity) return unauthorized();

  const state = await getCloudUserData(identity.id, identity.supabase);
  return NextResponse.json({ success: true, provider, state });
}

export async function POST(request: Request) {
  try {
    const provider = getActiveDbProvider();
    if (provider === "guest") {
      return NextResponse.json({
        success: true,
        provider: "guest",
        saved: false,
        message: "Guest mode. Saved to browser local storage only.",
      });
    }

    const identity = await getCloudIdentity(provider);
    if (!identity) return unauthorized();

    const body = (await request.json()) as { state?: UserCloudState };
    if (!body.state) {
      return NextResponse.json({ success: false, error: "state is required." }, { status: 400 });
    }

    const saved = await saveCloudUserData(
      identity.id,
      identity.email,
      body.state,
      identity.supabase
    );
    return NextResponse.json(
      { success: saved, provider, saved },
      { status: saved ? 200 : 502 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to sync user data.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
