import { NextRequest, NextResponse } from "next/server";
import { askCopilot, extractCalendarEventDraft } from "@/lib/ai/gemini";
import { buildSparkAutonomousBriefing } from "@/lib/ai/fallbackEngine";
import { CopilotUserConfig } from "@/lib/ai/harness";
import { unauthorized } from "@/lib/auth/cookies";
import { diagnoseConnections } from "@/lib/auth/connectionDiagnostics";
import {
  readSessionWithIntegrations,
  writeSessionForCurrentUser,
} from "@/lib/auth/integrationStore";
import { UnifiedData } from "@/lib/types/unified";
import { getRecentSparkUnifiedItems } from "@/lib/adapters/sparkSync";
import { resolveIdentity, type SignedInIdentity } from "@/lib/auth/identity";
import { isCalendarCreateRequest } from "@/lib/calendar/types";
import { extractRegistrationIntent } from "@/lib/ai/intents";
import { executeCloudTool, listCloudTools } from "@/lib/cloudTools/registry";
import { searchKnowledge } from "@/lib/knowledge/search";
import { filterItemsByExecutionPolicy } from "@/lib/knowledge/policy";
import { mapItemRelationFromDb, mapUnifiedItemFromDb } from "@/lib/data/mappers";
import type { ItemRelation, WorkspaceItem } from "@/lib/data/contracts";

function mergeById(items: UnifiedData[]): UnifiedData[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

async function autonomousSparkResponse(identity: SignedInIdentity) {
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
  const identity = await resolveIdentity();
  if (!identity) return unauthorized();
  if (request.nextUrl.searchParams.get("includeSpark") !== "1") {
    return NextResponse.json({ answer: null, spark_autonomous: false, spark_item_count: 0 });
  }
  return NextResponse.json(await autonomousSparkResponse(identity));
}

export async function POST(request: NextRequest) {
  const identity = await resolveIdentity();
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
        (tool) => {
          const policyLabel =
            tool.effect === "read_only"
              ? "읽기 전용"
              : tool.effect === "draft"
                ? "초안 검토"
                : "승인 필요";
          return `- **${tool.name}** (\`${tool.id}\`) · ${tool.description} · ${policyLabel}`;
        }
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
          output: execution.result.data,
          previewSummary: execution.result.summary,
          requiresUserApproval: false,
        },
      });
    } catch (err) {
      return NextResponse.json(
        {
          answer: `도구 실행 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`,
          cloud_tool_error: true,
        },
        { status: 500 }
      );
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

  const regIntent = extractRegistrationIntent(question);
  if (regIntent) {
    if (regIntent.type === "clarification") {
      return NextResponse.json({
        answer: regIntent.message,
        registration_intent: true,
      });
    }
    if (regIntent.type === "widget") {
      return NextResponse.json({
        answer: `🌐 **'${regIntent.name}'** (${regIntent.url}) 사이트를 **[휴식·도구] 위젯 칩**으로 등록했습니다. 상단 칩을 눌러 최신 브리핑을 확인해 보세요.`,
        registration_intent: true,
        custom_widget: {
          name: regIntent.name,
          url: regIntent.url,
        },
      });
    }
    if (regIntent.type === "shortcut") {
      return NextResponse.json({
        answer: `⭐ **'${regIntent.keyword}'** ➔ **[${regIntent.target}]** 바로가기 레시피를 등록했습니다. 앞으로 \`@${regIntent.keyword}\` 또는 \`${regIntent.keyword}\`를 입력하면 바로 실행돼요.`,
        registration_intent: true,
        app_shortcut: {
          keyword: regIntent.keyword,
          target: regIntent.target,
        },
      });
    }
  }

  const sparkItems = body.includeSpark
    ? await getRecentSparkUnifiedItems(identity.id, identity.supabase)
    : [];
  const items = mergeById([...sparkItems, ...clientItems]);

  // Phase 14-06: 근거 기반 지식 검색 수행
  let evidences: Array<{ itemId: string; title: string; excerpt: string; scoreReason: "relation" | "keyword" | "vector" | "recency" }> = [];
  let allowedItems: UnifiedData[] = items.filter((item) => {
    const candidate = item as UnifiedData & Partial<WorkspaceItem>;
    return candidate.privacyScope !== "local_only" &&
      candidate.aiPolicy !== "local_only" &&
      candidate.aiPolicy !== "disabled";
  });
  try {
    let serverItems: WorkspaceItem[] = [];
    let relations: ItemRelation[] = [];
    if (identity.supabase) {
      const requestedIds = Array.from(new Set(items.map((item) => item.id))).slice(0, 80);
      const requestedItemResult = requestedIds.length > 0
        ? await identity.supabase
            .from("unified_items")
            .select("*")
            .eq("user_id", identity.id)
            .in("id", requestedIds)
        : { data: [], error: null };
      const [itemResult, relationResult] = await Promise.all([
        identity.supabase
          .from("unified_items")
          .select("*")
          .eq("user_id", identity.id)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(500),
        identity.supabase
          .from("item_relations")
          .select("*")
          .eq("user_id", identity.id)
          .is("deleted_at", null)
          .limit(500),
      ]);
      if (requestedItemResult.error || itemResult.error || relationResult.error) {
        throw new Error("지식 정책을 서버에서 확인하지 못했습니다.");
      }
      const authoritativeRows = [
        ...(itemResult.data || []),
        ...(requestedItemResult.data || []),
      ];
      serverItems = Array.from(
        new Map(authoritativeRows.map((row) => [String(row.id), mapUnifiedItemFromDb(row)])).values()
      );
      relations = (relationResult.data || []).map(mapItemRelationFromDb);
    }

    const clientWorkspaceItems: WorkspaceItem[] = items.map((item) => {
      const candidate = item as UnifiedData & Partial<WorkspaceItem>;
      return {
        ...item,
        itemType: candidate.itemType ?? "task",
        attributes: candidate.attributes ?? {},
        version: candidate.version ?? 1,
        privacyScope: candidate.privacyScope ?? "cloud_private",
        aiPolicy: candidate.aiPolicy ?? "cloud_allowed",
        updatedAt: candidate.updatedAt ?? item.created_at,
      };
    });

    // 동일 ID는 서버 정책을 정본으로 사용하여 클라이언트가 local_only를 우회하지 못하게 합니다.
    const workspaceMap = new Map(clientWorkspaceItems.map((item) => [item.id, item]));
    for (const serverItem of serverItems) workspaceMap.set(serverItem.id, serverItem);
    const workspaceItems = Array.from(workspaceMap.values());
    const policyResult = filterItemsByExecutionPolicy(workspaceItems, "cloud_allowed");
    const knowledgePkg = searchKnowledge(policyResult.allowed, relations, {
      query: question,
      executionPolicy: "cloud_allowed",
      limit: 5,
    });
    evidences = knowledgePkg.evidence.map((e) => ({
      itemId: e.itemId,
      title: e.title,
      excerpt: e.excerpt,
      scoreReason: e.scoreReason,
    }));
    const evidenceIds = new Set(evidences.map((evidence) => evidence.itemId));
    allowedItems = [
      ...policyResult.allowed.filter((item) => evidenceIds.has(item.id)),
      ...policyResult.allowed.filter((item) => !evidenceIds.has(item.id)),
    ].slice(0, 80);
  } catch {
    // 로그인 사용자의 서버 정책을 확인하지 못하면 클라이언트 사본을 외부 AI에 보내지 않습니다.
    if (identity.supabase) allowedItems = [];
    evidences = [];
  }

  const { answer, aiUsed, cloudToolExecution, cloudToolDraft } = await askCopilot(
    question,
    allowedItems,
    body.timezone || "Asia/Seoul",
    body.copilotConfig,
    { userId: identity.id }
  );
  return NextResponse.json({
    answer,
    ai_fallback: !aiUsed,
    evidences: evidences.length > 0 ? evidences : undefined,
    ...(cloudToolExecution ? { cloud_tool_execution: cloudToolExecution } : {}),
    ...(cloudToolDraft ? { cloud_tool_draft: cloudToolDraft } : {}),
  });
}
