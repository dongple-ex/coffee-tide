import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import {
  loadLocalToolRegistry,
  localToolExecutionDisabled,
  LocalToolConfigurationError,
  publicLocalTool,
} from "@/lib/localTools/registry";
import {
  localToolPreview,
  LocalToolInputError,
  runLocalTool,
} from "@/lib/localTools/runner";

export const runtime = "nodejs";

interface ApprovalRecord {
  toolId: string;
  inputJson: string;
  sessionCreatedAt: string;
  expiresAt: number;
}

const approvals = new Map<string, ApprovalRecord>();
const APPROVAL_TTL_MS = 5 * 60 * 1_000;

function unavailableResponse() {
  return NextResponse.json(
    {
      error: "로컬 도구는 사용자 PC에서 실행 중인 CoffeeTide에서만 사용할 수 있습니다.",
      localOnly: true,
    },
    { status: 403 }
  );
}

function pruneApprovals() {
  const now = Date.now();
  for (const [token, record] of approvals) {
    if (record.expiresAt <= now) approvals.delete(token);
  }
}

function normalizedInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stableInputJson(input: Record<string, unknown>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)))
  );
}

export async function GET() {
  const session = await readSession();
  if (!session) return unauthorized();
  if (localToolExecutionDisabled()) return unavailableResponse();

  try {
    const tools = await loadLocalToolRegistry();
    return NextResponse.json({
      success: true,
      configured: Boolean(process.env.LOCAL_TOOL_REGISTRY_PATH),
      tools: tools.map(publicLocalTool),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return unauthorized();
  if (localToolExecutionDisabled()) return unavailableResponse();

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      toolId?: unknown;
      input?: unknown;
      approvalToken?: unknown;
    };
    const toolId = typeof body.toolId === "string" ? body.toolId : "";
    const input = normalizedInput(body.input);
    const inputJson = stableInputJson(input);
    const tool = (await loadLocalToolRegistry()).find((candidate) => candidate.id === toolId);
    if (!tool) return NextResponse.json({ error: "등록된 로컬 도구를 찾지 못했습니다." }, { status: 404 });

    if (body.action === "preview") {
      const { preview } = localToolPreview(tool, input);
      pruneApprovals();
      const approvalToken = randomUUID();
      approvals.set(approvalToken, {
        toolId,
        inputJson,
        sessionCreatedAt: session.createdAt,
        expiresAt: Date.now() + APPROVAL_TTL_MS,
      });
      return NextResponse.json({ success: true, preview, approvalToken, expiresInSeconds: 300 });
    }

    if (body.action === "execute") {
      pruneApprovals();
      const approvalToken = typeof body.approvalToken === "string" ? body.approvalToken : "";
      const approval = approvals.get(approvalToken);
      approvals.delete(approvalToken);
      if (
        !approval ||
        approval.toolId !== toolId ||
        approval.inputJson !== inputJson ||
        approval.sessionCreatedAt !== session.createdAt
      ) {
        return NextResponse.json(
          { error: "실행 승인이 없거나 만료되었습니다. 미리보기를 다시 확인해 주세요." },
          { status: 409 }
        );
      }
      return NextResponse.json(await runLocalTool(tool, input));
    }

    return NextResponse.json({ error: "action은 preview 또는 execute여야 합니다." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status =
      error instanceof LocalToolInputError || error instanceof LocalToolConfigurationError ? 400 : 500;
    console.warn("[coffeeTide] Local tool request failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
