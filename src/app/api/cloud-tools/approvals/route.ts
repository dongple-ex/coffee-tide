import { NextRequest, NextResponse } from "next/server";
import { unauthorized } from "@/lib/auth/cookies";
import { cloudToolRequestContext } from "@/lib/cloudTools/requestContext";
import {
  CloudToolGovernanceError,
  CloudToolInputError,
  CloudToolNotFoundError,
  CloudToolPolicyError,
  CloudToolRateLimitError,
  issueCloudToolApproval,
} from "@/lib/cloudTools/registry";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "승인 요청이 너무 큽니다." }, { status: 413 });
  }
  const context = await cloudToolRequestContext();
  if (!context) return unauthorized();

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "승인 요청이 너무 큽니다." }, { status: 413 });
    }
    const body = JSON.parse(rawBody || "{}") as {
      toolId?: unknown;
      input?: unknown;
      idempotencyKey?: unknown;
      timezone?: unknown;
    };
    const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";
    if (!toolId) return NextResponse.json({ error: "toolId가 필요합니다." }, { status: 400 });
    const approval = await issueCloudToolApproval({
      toolId,
      input: body.input,
      idempotencyKey: body.idempotencyKey,
      context: {
        ...context,
        timezone:
          typeof body.timezone === "string" && body.timezone.length <= 100
            ? body.timezone
            : context.timezone,
      },
    });
    return NextResponse.json({ success: true, approval });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SyntaxError || error instanceof CloudToolInputError) {
      return NextResponse.json(
        { error: error instanceof SyntaxError ? "올바른 JSON 요청이 아닙니다." : message },
        { status: 400 }
      );
    }
    if (error instanceof CloudToolNotFoundError) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (error instanceof CloudToolPolicyError || error instanceof CloudToolGovernanceError) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (error instanceof CloudToolRateLimitError) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    console.warn("[coffeeTide] Cloud Tool 승인 발급 실패", message);
    return NextResponse.json({ error: "외부 쓰기 승인을 발급하지 못했습니다." }, { status: 500 });
  }
}
