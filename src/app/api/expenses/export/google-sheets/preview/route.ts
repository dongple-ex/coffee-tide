import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readSessionWithIntegrations } from "@/lib/auth/integrationStore";
import { mapExpenseEntryFromDb } from "@/lib/data/mappers";
import { calculateExpenseAnalysis } from "@/lib/expenses/analysis";
import type { ExpenseEntry } from "@/lib/data/contracts";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const session = await readSessionWithIntegrations();
  if (!session?.googleToken && !session?.googleRefreshToken) {
    return NextResponse.json(
      { error: "Google 계정 연동이 필요합니다. 설정에서 Google을 연동해 주세요." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const from = body.from || undefined;
    const to = body.to || undefined;
    const category = body.category;
    const currency = body.currency;
    const timeZone = body.timeZone || "Asia/Seoul";

    let itemQuery = supabase
      .from("unified_items")
      .select("id, occurred_at")
      .eq("user_id", user.id)
      .eq("item_type", "expense")
      .is("deleted_at", null);

    if (from) itemQuery = itemQuery.gte("occurred_at", from);
    if (to) itemQuery = itemQuery.lte("occurred_at", to);

    const { data: activeItems, error: itemsError } = await itemQuery;
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const activeIds = (activeItems || []).map((i) => i.id);
    let entries: ExpenseEntry[] = [];

    if (activeIds.length > 0) {
      const { data: entryRows, error: entryError } = await supabase
        .from("expense_entries")
        .select("*")
        .eq("user_id", user.id)
        .in("item_id", activeIds);

      if (entryError) {
        return NextResponse.json({ error: entryError.message }, { status: 500 });
      }
      entries = (entryRows || []).map(mapExpenseEntryFromDb);
    }

    if (category && category !== "전체") {
      entries = entries.filter((e) => (e.category || "미분류") === category);
    }
    if (currency && currency !== "전체") {
      entries = entries.filter((e) => (e.currency || "KRW").toUpperCase() === currency.toUpperCase());
    }

    const analysis = calculateExpenseAnalysis(entries, { from, to, timeZone });
    const chartCount = analysis.totals.length * 2; // 통화당 2개

    return NextResponse.json({
      googleEmail: session.googleEmail || "연동된 Google 계정",
      rowCount: entries.length,
      sheetNames: ["비용내역", "월별합계", "분류별분석", "대시보드"],
      chartCount,
      totals: analysis.totals,
      rangeText: from && to ? `${from.slice(0, 10)} ~ ${to.slice(0, 10)}` : "전체 기간",
      filterText: `분류: ${category || "전체"}, 통화: ${currency || "전체"}`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Preview failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
