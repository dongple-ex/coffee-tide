import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import {
  mapContentAssetFromDb,
  mapExpenseEntryFromDb,
  mapExpenseEntryToDbRow,
  mapUnifiedItemFromDb,
  mapUnifiedItemToDbRow,
} from "@/lib/data/mappers";
import { buildExpenseItems } from "@/lib/expenses/service";
import type { ContentAsset, ExpenseEntry, WorkspaceItem } from "@/lib/data/contracts";

export async function GET(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");
  const currency = searchParams.get("currency");
  const cursor = searchParams.get("cursor");

  // 1. unified_items 활성 expense 항목 쿼리
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
  if (cursor) {
    itemQuery = itemQuery.lt("occurred_at", cursor);
  }

  itemQuery = itemQuery.order("occurred_at", { ascending: false }).limit(limit + 1);

  const { data: itemRows, error: itemsError } = await itemQuery;
  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  let items: WorkspaceItem[] = (itemRows || []).map(mapUnifiedItemFromDb);
  let nextCursor: string | undefined = undefined;

  if (items.length > limit) {
    const nextItem = items[limit];
    nextCursor = nextItem.occurredAt || nextItem.created_at;
    items = items.slice(0, limit);
  }

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

  // category / currency 클라이언트 요청 필터링 (필요 시)
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

  return NextResponse.json({
    expenses: records,
    nextCursor,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  try {
    const body = await req.json();
    if (
      body.itemId !== undefined &&
      (typeof body.itemId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(body.itemId))
    ) {
      return NextResponse.json({ error: "유효하지 않은 비용 요청 ID입니다." }, { status: 400 });
    }

    if (body.itemId) {
      const [{ data: existingItem }, { data: existingEntry }] = await Promise.all([
        supabase
          .from("unified_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", body.itemId)
          .eq("item_type", "expense")
          .maybeSingle(),
        supabase
          .from("expense_entries")
          .select("*")
          .eq("user_id", user.id)
          .eq("item_id", body.itemId)
          .maybeSingle(),
      ]);
      if (existingItem && existingEntry) {
        return NextResponse.json({
          item: mapUnifiedItemFromDb(existingItem),
          entry: mapExpenseEntryFromDb(existingEntry),
          duplicate: true,
        });
      }
    }

    const { workspaceItem, expenseEntry } = buildExpenseItems(body, user.id);

    const itemDbRow = mapUnifiedItemToDbRow(workspaceItem, user.id);
    const entryDbRow = mapExpenseEntryToDbRow(expenseEntry, user.id);

    const { data: saved, error: saveError } = await supabase.rpc("create_expense_with_item", {
      p_item: itemDbRow,
      p_expense: entryDbRow,
    });
    if (saveError || !saved?.item || !saved?.entry) {
      if (body.itemId) {
        const [{ data: existingItem }, { data: existingEntry }] = await Promise.all([
          supabase.from("unified_items").select("*").eq("user_id", user.id).eq("id", body.itemId).maybeSingle(),
          supabase.from("expense_entries").select("*").eq("user_id", user.id).eq("item_id", body.itemId).maybeSingle(),
        ]);
        if (existingItem && existingEntry) {
          return NextResponse.json({
            item: mapUnifiedItemFromDb(existingItem),
            entry: mapExpenseEntryFromDb(existingEntry),
            duplicate: true,
          });
        }
      }
      return NextResponse.json({ error: "비용을 원자적으로 저장하지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      item: mapUnifiedItemFromDb(saved.item),
      entry: mapExpenseEntryFromDb(saved.entry),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Expense creation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
