import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapContentAssetFromDb, mapExpenseEntryFromDb, mapUnifiedItemFromDb } from "@/lib/data/mappers";
import { generateExpensesCsv, mapExpenseRecordToExportRow } from "@/lib/expenses/export";
import type { ContentAsset, ExpenseEntry, WorkspaceItem } from "@/lib/data/contracts";

const MAX_EXPORT_RECORDS = 10000;

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service unavailable" }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");
  if (format !== "csv") {
    return NextResponse.json({ error: "지원하지 않는 내보내기 형식입니다 (format=csv 만 지원)" }, { status: 400 });
  }

  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const category = searchParams.get("category");
  const currency = searchParams.get("currency");

  // 1. 활성 비용 unified_items 조회
  let itemQuery = supabase
    .from("unified_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("item_type", "expense")
    .is("deleted_at", null);

  if (from) {
    itemQuery = itemQuery.gte("occurred_at", from);
  }
  if (to) {
    itemQuery = itemQuery.lte("occurred_at", to);
  }

  itemQuery = itemQuery.order("occurred_at", { ascending: false }).limit(MAX_EXPORT_RECORDS + 1);

  const { data: itemRows, error: itemsError } = await itemQuery;
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  if ((itemRows || []).length > MAX_EXPORT_RECORDS) {
    return NextResponse.json(
      { error: `내보내기 대상이 최대 ${MAX_EXPORT_RECORDS.toLocaleString()}건을 초과했습니다. 기간을 축소해 주세요.` },
      { status: 413 }
    );
  }

  const items: WorkspaceItem[] = (itemRows || []).map(mapUnifiedItemFromDb);
  const itemIds = items.map((i) => i.id);

  let expenseEntries: ExpenseEntry[] = [];
  const receiptsMap = new Map<string, ContentAsset[]>();

  if (itemIds.length > 0) {
    const [entryRes, assetRes] = await Promise.all([
      supabase
        .from("expense_entries")
        .select("*")
        .eq("user_id", user.id)
        .in("item_id", itemIds),
      supabase
        .from("content_assets")
        .select("*")
        .eq("user_id", user.id)
        .in("item_id", itemIds)
        .eq("kind", "image")
        .is("deleted_at", null),
    ]);

    if (entryRes.data) {
      expenseEntries = entryRes.data.map(mapExpenseEntryFromDb);
    }
    if (assetRes.data) {
      const allAssets = assetRes.data.map(mapContentAssetFromDb);
      for (const asset of allAssets) {
        if (!asset.itemId) continue;
        const list = receiptsMap.get(asset.itemId) || [];
        list.push(asset);
        receiptsMap.set(asset.itemId, list);
      }
    }
  }

  let records = items.map((item) => {
    const entry = expenseEntries.find((e) => e.itemId === item.id) || {
      itemId: item.id,
      amount: String(item.attributes?.amount || "0"),
      currency: String(item.attributes?.currency || "KRW"),
      category: item.attributes?.category ? String(item.attributes.category) : undefined,
      merchant: item.attributes?.merchant ? String(item.attributes.merchant) : undefined,
      occurredAt: item.occurredAt || item.created_at,
      taxDeductible: false,
      reimbursable: false,
    };
    const receipts = receiptsMap.get(item.id) || [];
    return { item, entry, receipts };
  });

  if (category && category !== "전체") {
    records = records.filter((r) => (r.entry.category || "미분류") === category);
  }
  if (currency && currency !== "전체") {
    records = records.filter((r) => (r.entry.currency || "KRW").toUpperCase() === currency.toUpperCase());
  }

  const exportRows = records.map(mapExpenseRecordToExportRow);
  const csvContent = generateExpensesCsv(exportRows);

  const fromLabel = from ? from.slice(0, 10) : "all";
  const toLabel = to ? to.slice(0, 10) : "all";
  const filename = `coffeetide-expenses-${fromLabel}_${toLabel}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
