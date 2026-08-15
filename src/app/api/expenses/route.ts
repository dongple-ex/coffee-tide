import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  mapExpenseEntryFromDb,
  mapExpenseEntryToDbRow,
  mapUnifiedItemFromDb,
  mapUnifiedItemToDbRow,
} from "@/lib/data/mappers";
import { buildExpenseItems } from "@/lib/expenses/service";
import type { ExpenseEntry, WorkspaceItem } from "@/lib/data/contracts";

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
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  const { data: itemRows, error: itemsError } = await supabase
    .from("unified_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("item_type", "expense")
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const items: WorkspaceItem[] = (itemRows || []).map(mapUnifiedItemFromDb);
  const itemIds = items.map((i) => i.id);

  let expenseEntries: ExpenseEntry[] = [];
  if (itemIds.length > 0) {
    const { data: entryRows } = await supabase
      .from("expense_entries")
      .select("*")
      .eq("user_id", user.id)
      .in("item_id", itemIds);

    expenseEntries = (entryRows || []).map(mapExpenseEntryFromDb);
  }

  return NextResponse.json({
    expenses: items.map((item) => {
      const entry = expenseEntries.find((e) => e.itemId === item.id);
      return { item, entry };
    }),
  });
}

export async function POST(req: NextRequest) {
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
