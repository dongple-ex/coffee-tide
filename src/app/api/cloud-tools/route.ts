import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "@/lib/auth/cookies";
import {
  CloudToolInputError,
  CloudToolGovernanceError,
  CloudToolNotFoundError,
  CloudToolPolicyError,
  CloudToolRateLimitError,
  executeCloudTool,
  listCloudTools,
} from "@/lib/cloudTools/registry";
import { cloudToolRequestContext } from "@/lib/cloudTools/requestContext";
import type { UnifiedData, UnifiedSource } from "@/lib/types/unified";
import { GoogleCalendarApiError } from "@/lib/adapters/googleCalendar";
import { GoogleDriveApiError } from "@/lib/adapters/googleDrive";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_BODY_BYTES = 128 * 1024;
const MAX_INPUT_BYTES = 32 * 1024;
const SOURCES = new Set<UnifiedSource>([
  "manual",
  "paste",
  "local_doc",
  "obsidian",
  "outlook",
  "gmail",
  "notion",
  "llm",
  "spark",
]);

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeItems(value: unknown): UnifiedData[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 80).flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const raw = candidate as Record<string, unknown>;
    const source = SOURCES.has(raw.source as UnifiedSource)
      ? (raw.source as UnifiedSource)
      : "manual";
    const status = ["pending", "held", "completed", "dismissed"].includes(String(raw.status))
      ? (raw.status as UnifiedData["status"])
      : undefined;
    const category = [
      "urgent",
      "approval_required",
      "meeting",
      "action_required",
      "reference",
      "ignore",
    ].includes(String(raw.category))
      ? (raw.category as UnifiedData["category"])
      : undefined;
    return [
      {
        id: safeText(raw.id, 200) || `request-item-${index}`,
        source,
        title: safeText(raw.title, 300),
        content: "",
        created_at: safeText(raw.created_at, 50) || new Date(0).toISOString(),
        author: { name: "" },
        url: "",
        status,
        category,
      } satisfies UnifiedData,
    ];
  });
}

export async function GET() {
  const context = await cloudToolRequestContext();
  if (!context) return unauthorized();
  return NextResponse.json({ success: true, tools: listCloudTools() });
}

export async function POST(request: NextRequest) {
  const context = await cloudToolRequestContext();
  if (!context) return unauthorized();
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Cloud Tool 요청이 너무 큽니다." }, { status: 413 });
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Cloud Tool 요청이 너무 큽니다." }, { status: 413 });
    }
    const body = (JSON.parse(rawBody || "{}") as {
      toolId?: unknown;
      input?: unknown;
      items?: unknown;
      timezone?: unknown;
      approvalToken?: unknown;
      idempotencyKey?: unknown;
    });
    const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";
    if (!toolId) {
      return NextResponse.json({ error: "toolId가 필요합니다." }, { status: 400 });
    }
    if (Buffer.byteLength(JSON.stringify(body.input ?? {}), "utf8") > MAX_INPUT_BYTES) {
      return NextResponse.json({ error: "Cloud Tool 입력이 너무 큽니다." }, { status: 413 });
    }

    const execution = await executeCloudTool({
      toolId,
      input: body.input,
      context: {
        ...context,
        timezone:
          typeof body.timezone === "string" && body.timezone.length <= 100
            ? body.timezone
            : "Asia/Seoul",
        items: safeItems(body.items),
      },
      approvalToken: body.approvalToken,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json({ success: true, execution });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "올바른 JSON 요청이 아닙니다." }, { status: 400 });
    }
    if (error instanceof CloudToolNotFoundError) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (error instanceof CloudToolInputError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (error instanceof CloudToolRateLimitError) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    if (error instanceof CloudToolPolicyError) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (error instanceof CloudToolGovernanceError) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (error instanceof GoogleCalendarApiError || error instanceof GoogleDriveApiError) {
      const reconnectRequired =
        error.status === 401 ||
        error.status === 403 ||
        /insufficientPermissions|insufficient authentication scopes/i.test(error.responseBody);
      return NextResponse.json(
        {
          error: reconnectRequired
            ? "Google 쓰기 권한이 필요합니다. Google을 다시 연동해 주세요."
            : "Google 외부 서비스 변경에 실패했습니다.",
          reconnectRequired,
        },
        { status: reconnectRequired ? 403 : 502 }
      );
    }
    if (message === "GOOGLE_RECONNECT_REQUIRED") {
      return NextResponse.json(
        { error: "Google 연동 후 외부 저장을 실행할 수 있습니다.", reconnectRequired: true },
        { status: 409 }
      );
    }
    console.warn("[coffeeTide] Cloud Tool API failed:", message);
    return NextResponse.json({ error: "Cloud Tool 실행에 실패했습니다." }, { status: 500 });
  }
}
