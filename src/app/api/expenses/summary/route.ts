import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { mapExpenseEntryFromDb } from "@/lib/data/mappers";
import { calculateExpenseSummary } from "@/lib/expenses/service";
import { calculateExpenseAnalysis } from "@/lib/expenses/analysis";

export async function GET(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const timeZone = searchParams.get("timeZone") || "Asia/Seoul";
  const months = Number(searchParams.get("months")) || 12;

  // 1. 삭제되지 않은 활성 비용 unified_items 조회
  let itemQuery = supabase
    .from("unified_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_type", "expense")
    .is("deleted_at", null);

  if (from) {
    itemQuery = itemQuery.gte("occurred_at", from);
  }
  if (to) {
    itemQuery = itemQuery.lte("occurred_at", to);
  }

  const { data: activeItems, error: itemsError } = await itemQuery;
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const activeIds = (activeItems || []).map((i) => i.id);
  if (activeIds.length === 0) {
    const emptyAnalysis = calculateExpenseAnalysis([], { from, to, timeZone, months });
    return NextResponse.json({
      summary: { totals: [], totalEntriesCount: 0 },
      analysis: emptyAnalysis,
    });
  }

  // 2. 활성 ID들의 expense_entries 조회
  const { data: entryRows, error: entryError } = await supabase
    .from("expense_entries")
    .select("*")
    .eq("user_id", user.id)
    .in("item_id", activeIds);

  if (entryError) {
    return NextResponse.json({ error: entryError.message }, { status: 500 });
  }

  const entries = (entryRows || []).map(mapExpenseEntryFromDb);
  const summary = calculateExpenseSummary(entries);
  const analysis = calculateExpenseAnalysis(entries, { from, to, timeZone, months });

  return NextResponse.json({
    summary,
    analysis,
  });
}

