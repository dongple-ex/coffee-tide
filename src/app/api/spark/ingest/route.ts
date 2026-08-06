import { NextResponse } from "next/server";
import { getSparkBriefings, addSparkBriefing } from "@/lib/adapters/sparkSync";

export async function GET() {
  const items = getSparkBriefings();
  return NextResponse.json({ success: true, items });
}

export async function POST(req: Request) {
  try {
    const rawText = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON format." }, { status: 400 });
    }

    const title = body.title ? String(body.title) : "";
    const summary = body.summary ? String(body.summary) : "";
    const category = (body.category as "urgent" | "approval_required" | "meeting" | "action_required" | "reference") || "reference";
    const sourceApp = body.sourceApp ? String(body.sourceApp) : undefined;
    const actionUrl = body.actionUrl ? String(body.actionUrl) : undefined;
    const status = (body.status as "pending" | "completed" | "flagged") || "completed";

    if (!title || !summary) {
      return NextResponse.json(
        { success: false, error: "title and summary are required." },
        { status: 400 }
      );
    }

    const newItem = addSparkBriefing({
      title,
      summary,
      category: category || "reference",
      sourceApp: sourceApp || "Gemini Spark",
      actionUrl,
      status: status || "completed",
    });

    return NextResponse.json({ success: true, item: newItem });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : "Failed to process Spark payload.";
    console.error("[POST /api/spark/ingest] Error:", error);
    return NextResponse.json(
      { success: false, error: errMessage },
      { status: 500 }
    );
  }
}
