import { NextRequest, NextResponse } from "next/server";
import { askCopilot, extractCalendarEventDraft } from "@/lib/ai/gemini";
import { buildSparkAutonomousBriefing } from "@/lib/ai/fallbackEngine";
import { CopilotUserConfig } from "@/lib/ai/harness";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { diagnoseConnections } from "@/lib/auth/connectionDiagnostics";
import {
  readSessionWithIntegrations,
  writeSessionForCurrentUser,
} from "@/lib/auth/integrationStore";
import { UnifiedData } from "@/lib/types/unified";
import { getRecentSparkUnifiedItems } from "@/lib/adapters/sparkSync";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCalendarCreateRequest } from "@/lib/calendar/types";
import { executeCloudTool, listCloudTools } from "@/lib/cloudTools/registry";

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
  const clientItems = Array.isArray(body.items) ? body.items.slice(0, 80) : [];

  if (/^\/tools(?:\s|$)/i.test(question)) {
    const tools = listCloudTools();
    const answer = [
      "## ☁️ Cloud Tool Registry",
      "로그인한 모든 PC·모바일에서 사용할 수 있는 서버 도구입니다.",
      "",
      ...tools.map(
        (tool) =>
          `- **${tool.name}** (\`${tool.id}\`) · ${tool.description} · ${tool.effect === "read_only" ? "읽기 전용" : "승인 필요"}`
      ),
      "",
      "사용 예: `/tool finance`, `/tool finance USD`, `/tool tasks`, `/tool tasks source`",
    ].join("\n");
    return NextResponse.json({ answer, cloud_tool_registry: true, tool_count: tools.length });
  }

  const toolCommand = question.match(/^\/tool\s+(\S+)(?:\s+(.+))?$/i);
  if (toolCommand) {
    const alias = toolCommand[1].toLowerCase();
    const option = toolCommand[2]?.trim() ?? "";
    const isFinance = ["finance", "market", "환율", "금리", "환율금리"].includes(alias);
    const isTasks = ["tasks", "task", "status", "업무", "현황"].includes(alias);
    if (!isFinance && !isTasks) {
      return NextResponse.json({
        answer: "등록된 명령을 찾지 못했습니다. `/tools`로 Cloud Tool 목록을 확인해 주세요.",
        cloud_tool_registry: true,
      });
    }

    const toolId = isFinance ? "finance.market_snapshot" : "workspace.task_summary";
    const upperOption = option.toUpperCase();
    const input = isFinance
      ? { currency: ["USD", "JPY", "EUR"].includes(upperOption) ? upperOption : "ALL" }
      : {
          scope: /(?:^|\s)all(?:\s|$)|전체/i.test(option) ? "all" : "active",
          groupBy: /source|출처/i.test(option) ? "source" : "category",
        };
    try {
      const execution = await executeCloudTool({
        toolId,
        input,
        context: {
          userId: identity.id,
          timezone: body.timezone || "Asia/Seoul",
          items: clientItems,
        },
      });
      return NextResponse.json({
        answer: execution.result.summary,
        cloud_tool_execution: {
          requestId: execution.requestId,
          toolId: execution.toolId,
          toolVersion: execution.toolVersion,
          durationMs: execution.durationMs,
          sources: execution.result.sources,
          warnings: execution.result.warnings,
        },
      });
    } catch (error) {
      console.warn("[coffeeTide] Copilot Cloud Tool failed:", error);
      return NextResponse.json({
        answer: `Cloud Tool을 실행하지 못했습니다. ${error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요."}`,
        cloud_tool_error: true,
      });
    }
  }

  if (/^\/connect(?:\s|$)/i.test(question)) {
    const session = await readSessionWithIntegrations();
    if (!session) return unauthorized();
    const diagnostic = await diagnoseConnections(session);
    const response = NextResponse.json({
      answer: diagnostic.answer,
      connections: diagnostic.connections,
      connection_errors: diagnostic.errors,
      connection_diagnostic: true,
    });
    return writeSessionForCurrentUser(
      response,
      diagnostic.session,
      diagnostic.preserveIntegrations
    );
  }

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
