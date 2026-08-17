import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapExpenseEntryFromDb, mapUnifiedItemFromDb } from "@/lib/data/mappers";
import { validateUpdateExpenseInput } from "@/lib/expenses/service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "비용 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const body = await req.json();
    const validation = validateUpdateExpenseInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `유효하지 않은 요청 데이터: ${validation.errors.join(", ")}` },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.amount !== undefined) patch.amount = body.amount;
    if (body.currency !== undefined) patch.currency = body.currency.toUpperCase();
    if (body.merchant !== undefined) patch.merchant = body.merchant;
    if (body.category !== undefined) patch.category = body.category;
    if (body.paymentMethod !== undefined) patch.payment_method = body.paymentMethod;
    if (body.occurredAt !== undefined) patch.occurred_at = body.occurredAt;

    const expectedVersion = typeof body.expectedVersion === "number" ? body.expectedVersion : null;

    const { data: updated, error: updateError } = await supabase.rpc("update_expense_with_item", {
      p_item_id: id,
      p_patch: patch,
      p_expected_version: expectedVersion,
    });

    if (updateError) {
      if (updateError.message.includes("version conflict")) {
        return NextResponse.json(
          { error: "다른 기기에서 항목이 변경되었습니다. 화면을 새로고침 후 다시 시도해 주세요." },
          { status: 409 }
        );
      }
      if (updateError.message.includes("not found")) {
        return NextResponse.json({ error: "비용 항목을 찾지 못했습니다." }, { status: 404 });
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updated?.item || !updated?.entry) {
      return NextResponse.json({ error: "비용을 갱신하지 못했습니다." }, { status: 500 });
    }

    return NextResponse.json({
      item: mapUnifiedItemFromDb(updated.item),
      entry: mapExpenseEntryFromDb(updated.entry),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Expense update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "비용 ID가 필요합니다." }, { status: 400 });
  }

  try {
    let expectedVersion: number | null = null;
    try {
      const body = await req.json();
      if (typeof body?.expectedVersion === "number") {
        expectedVersion = body.expectedVersion;
      }
    } catch {
      // 본문이 없는 DELETE 요청도 허용
    }

    const { data: deletedResult, error: deleteError } = await supabase.rpc("soft_delete_expense", {
      p_item_id: id,
      p_expected_version: expectedVersion,
    });

    if (deleteError) {
      if (deleteError.message.includes("version conflict")) {
        return NextResponse.json(
          { error: "다른 기기에서 항목이 변경되었습니다." },
          { status: 409 }
        );
      }
      if (deleteError.message.includes("not found")) {
        return NextResponse.json({ error: "비용 항목을 찾지 못했습니다." }, { status: 404 });
      }
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      itemId: id,
      result: deletedResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Expense delete failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
