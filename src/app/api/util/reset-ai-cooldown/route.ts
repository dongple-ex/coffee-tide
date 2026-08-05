import { NextResponse } from "next/server";
import { resetGeminiCooldown } from "@/lib/ai/gemini";
import { readSession, unauthorized } from "@/lib/auth/cookies";

export async function POST() {
  const session = await readSession();
  if (!session) return unauthorized();

  resetGeminiCooldown();
  return NextResponse.json({ success: true, resetAt: new Date().toISOString() });
}
