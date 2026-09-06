import { NextRequest, NextResponse } from "next/server";
import { transformCanvasDocumentGemini } from "@/lib/ai/gemini";
import { resolveIdentity } from "@/lib/auth/identity";
import { unauthorized } from "@/lib/auth/cookies";
import type { CanvasAiAction } from "@/lib/canvas/types";
import { acceptAiJob } from "@/lib/ai/jobs/server";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const identity = await resolveIdentity();
  if (!identity) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    action?: CanvasAiAction;
    customPrompt?: string;
    docTitle?: string;
    docType?: string;
    personaName?: string;
    background?: boolean;
    jobId?: string;
    pushEndpoint?: string;
  };

  if (!body.content || !body.action) {
    return NextResponse.json(
      { error: "content and action are required" },
      { status: 400 }
    );
  }

  const content = body.content;
  const action = body.action;
  if (body.background === true) {
    return acceptAiJob({
      id: body.jobId, ownerId: identity.id, kind: "canvas",
      question: body.docTitle || "캔버스 문서 작업", pushEndpoint: body.pushEndpoint, execute,
    });
  }
  return execute();

  async function execute() {
  const result = await transformCanvasDocumentGemini({
    content,
    action,
    customPrompt: body.customPrompt,
    docTitle: body.docTitle,
    docType: body.docType,
    personaName: body.personaName,
  });

  return NextResponse.json({
    content: result.content,
    extractedTasks: result.extractedTasks,
    providerUsed: result.aiUsed ? "gemini_cloud" : "local_rules",
  });
  }
}
