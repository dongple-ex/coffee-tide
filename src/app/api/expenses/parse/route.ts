import { NextRequest, NextResponse } from "next/server";
import { parseExpenseText } from "@/lib/expenses/parser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body.text || "");
    if (!text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const draft = parseExpenseText(text);
    return NextResponse.json({ draft });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Parsing failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
