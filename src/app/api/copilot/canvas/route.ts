import { NextRequest, NextResponse } from "next/server";
import { transformCanvasDocumentGemini } from "@/lib/ai/gemini";
import { resolveIdentity } from "@/lib/auth/identity";
import { unauthorized } from "@/lib/auth/cookies";
import type { CanvasAiAction } from "@/lib/canvas/types";

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
  };

  if (!body.content || !body.action) {
    return NextResponse.json(
      { error: "content and action are required" },
      { status: 400 }
    );
  }

  const result = await transformCanvasDocumentGemini({
    content: body.content,
    action: body.action,
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
