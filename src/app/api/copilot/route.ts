import { NextRequest, NextResponse } from "next/server";
import { askCopilot } from "@/lib/ai/gemini";
import { CopilotUserConfig } from "@/lib/ai/harness";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { UnifiedData } from "@/lib/types/unified";
import { getSparkUnifiedItems } from "@/lib/adapters/sparkSync";

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    items?: UnifiedData[];
    timezone?: string;
    copilotConfig?: CopilotUserConfig;
  };

  const question = body.question?.trim() || "오늘 해야 할 일을 브리핑해줘";
  const clientItems = Array.isArray(body.items) ? body.items.slice(0, 80) : [];
  const sparkItems = getSparkUnifiedItems();
  const items = [...sparkItems, ...clientItems];

  const { answer, aiUsed } = await askCopilot(
    question,
    items,
    body.timezone || "Asia/Seoul",
    body.copilotConfig
  );
  return NextResponse.json({ answer, ai_fallback: !aiUsed });
}
