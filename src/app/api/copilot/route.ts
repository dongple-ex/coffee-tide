import { NextRequest, NextResponse } from "next/server";
import { askCopilot, extractCalendarEventDraft } from "@/lib/ai/gemini";
import { buildSparkAutonomousBriefing } from "@/lib/ai/fallbackEngine";
import { CopilotUserConfig } from "@/lib/ai/harness";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { UnifiedData } from "@/lib/types/unified";
import { getRecentSparkUnifiedItems } from "@/lib/adapters/sparkSync";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCalendarCreateRequest } from "@/lib/calendar/types";

function mergeById(items: UnifiedData[]): UnifiedData[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

interface CopilotIdentity {
  id: string;
  supabase?: SupabaseClient;
}

async function getCopilotIdentity(): Promise<CopilotIdentity | null> {
  const supabase = await createServerSupabaseClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return { id: user.id, supabase };
  }
  const session = await readSession();
  return session ? { id: session.userEmail } : null;
}

async function autonomousSparkResponse(identity: CopilotIdentity) {
  const sparkItems = await getRecentSparkUnifiedItems(identity.id, identity.supabase);
  const answer = buildSparkAutonomousBriefing(sparkItems);
  return {
    answer,
    spark_autonomous: answer !== null,
    spark_item_count: sparkItems.length,
  };
}

/** 질문 없이도 활성화된 클라이언트가 최신 Spark 브리핑을 안전하게 조회한다. */
export async function GET(request: NextRequest) {
  const identity = await getCopilotIdentity();
  if (!identity) return unauthorized();
  if (request.nextUrl.searchParams.get("includeSpark") !== "1") {
    return NextResponse.json({ answer: null, spark_autonomous: false, spark_item_count: 0 });
  }
  return NextResponse.json(await autonomousSparkResponse(identity));
}

export async function POST(request: NextRequest) {
  const identity = await getCopilotIdentity();
  if (!identity) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    question?: string;
    items?: UnifiedData[];
    timezone?: string;
    copilotConfig?: CopilotUserConfig;
    includeSpark?: boolean;
    autonomousSparkBriefing?: boolean;
  };

  if (body.autonomousSparkBriefing) {
    if (!body.includeSpark) {
      return NextResponse.json({ answer: null, spark_autonomous: false, spark_item_count: 0 });
    }
    return NextResponse.json(await autonomousSparkResponse(identity));
  }

  const question = body.question?.trim() || "오늘 해야 할 일을 브리핑해줘";

  if (isCalendarCreateRequest(question)) {
    const timezone = body.timezone || "Asia/Seoul";
    const extraction = await extractCalendarEventDraft(question, timezone);
    if (!extraction.draft) {
      return NextResponse.json({
        answer: `📅 ${extraction.clarification ?? "일정의 날짜와 시간을 조금 더 자세히 알려주세요."}`,
        calendar_intent: true,
        ai_fallback: !extraction.aiUsed,
      });
    }
    return NextResponse.json({
      answer: "📅 Google Calendar 일정 초안을 준비했어요. 아래 내용을 확인하고 **캘린더에 등록**을 눌러주세요.",
      calendar_intent: true,
      calendar_draft: extraction.draft,
      ai_fallback: !extraction.aiUsed,
    });
  }

  const clientItems = Array.isArray(body.items) ? body.items.slice(0, 80) : [];
  const sparkItems = body.includeSpark
    ? await getRecentSparkUnifiedItems(identity.id, identity.supabase)
    : [];
  const items = mergeById([...sparkItems, ...clientItems]);

  const { answer, aiUsed } = await askCopilot(
    question,
    items,
    body.timezone || "Asia/Seoul",
    body.copilotConfig
  );
  return NextResponse.json({ answer, ai_fallback: !aiUsed });
}
