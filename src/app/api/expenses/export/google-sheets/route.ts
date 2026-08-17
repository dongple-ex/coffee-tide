import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { persistRefreshedIntegration, readSessionWithIntegrations } from "@/lib/auth/integrationStore";
import { refreshChannel, refreshGoogleIfExpiring } from "@/lib/auth/refresh";
import { mapContentAssetFromDb, mapExpenseEntryFromDb, mapUnifiedItemFromDb } from "@/lib/data/mappers";
import { calculateExpenseAnalysis } from "@/lib/expenses/analysis";
import { mapExpenseRecordToExportRow } from "@/lib/expenses/export";
import {
  buildChartRequests,
  buildCreateSpreadsheetPayload,
  buildSpreadsheetValueRanges,
  deleteGoogleDriveFile,
  GoogleSheetsExportResult,
} from "@/lib/google/sheets";
import type { ContentAsset, ExpenseEntry, WorkspaceItem } from "@/lib/data/contracts";

// 5분 멱등성 캐시
const idempotencyCache = new Map<string, { timestamp: number; result: GoogleSheetsExportResult }>();

function cleanIdempotencyCache() {
  const now = Date.now();
  for (const [key, item] of idempotencyCache.entries()) {
    if (now - item.timestamp > 5 * 60 * 1000) {
      idempotencyCache.delete(key);
    }
  }
}

export async function POST(req: NextRequest) {
  cleanIdempotencyCache();

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

  const rawSession = await readSessionWithIntegrations();
  if (!rawSession?.googleToken && !rawSession?.googleRefreshToken) {
    return NextResponse.json(
      { error: "Google 계정 연동이 필요합니다. 설정에서 Google을 연동해 주세요." },
      { status: 403 }
    );
  }

  let session = rawSession;

  try {
    const body = await req.json();
    const { from, to, category, currency, timeZone = "Asia/Seoul", idempotencyKey } = body;

    // 멱등성 체크
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      const cached = idempotencyCache.get(idempotencyKey)!;
      return NextResponse.json(cached.result);
    }

    // 선제 토큰 갱신
    const refreshed = await refreshGoogleIfExpiring(session);
    if (refreshed?.googleToken) {
      session = refreshed;
      await persistRefreshedIntegration("google", session);
    }

    // 1. 활성 비용 및 영수증 조회
    let itemQuery = supabase
      .from("unified_items")
      .select("*")
      .eq("user_id", user.id)
      .eq("item_type", "expense")
      .is("deleted_at", null);

    if (from) itemQuery = itemQuery.gte("occurred_at", from);
    if (to) itemQuery = itemQuery.lte("occurred_at", to);

    itemQuery = itemQuery.order("occurred_at", { ascending: false }).limit(5000);

    const { data: itemRows, error: itemsError } = await itemQuery;
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
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
    const analysis = calculateExpenseAnalysis(
      records.map((r) => r.entry),
      { from, to, timeZone }
    );

    const fromText = from ? from.slice(0, 10) : "전체";
    const toText = to ? to.slice(0, 10) : "전체";
    const title = `CoffeeTide 비용 ${fromText} ~ ${toText}`;
    const rangeText = `${fromText} ~ ${toText}`;
    const filterText = `분류: ${category || "전체"}, 통화: ${currency || "전체"}`;

    // Google API 헬퍼
    const callGoogleApi = async (url: string, init: RequestInit) => {
      let token = session.googleToken;
      let res = await fetch(url, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401 || res.status === 403) {
        const refreshedReactive = await refreshChannel("google", session);
        if (refreshedReactive?.googleToken) {
          session = refreshedReactive;
          await persistRefreshedIntegration("google", session);
          token = session.googleToken;
          res = await fetch(url, {
            ...init,
            headers: {
              ...init.headers,
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });
        }
      }
      return res;
    };

    // 2. 스프레드시트 생성 (4개 시트)
    const createPayload = buildCreateSpreadsheetPayload(title);
    const createRes = await callGoogleApi("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return NextResponse.json({ error: `스프레드시트 생성 실패: ${errText}` }, { status: createRes.status });
    }

    const createdData = (await createRes.json()) as { spreadsheetId: string; spreadsheetUrl: string };
    const spreadsheetId = createdData.spreadsheetId;
    const spreadsheetUrl = createdData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 3. 값 일괄 입력 (valueInputOption=RAW)
    const valueRangesConfig = buildSpreadsheetValueRanges({
      title,
      userEmail: session.googleEmail,
      rangeText,
      filterText,
      rows: exportRows,
      analysis,
    });

    const valuesRes = await callGoogleApi(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: valueRangesConfig.valueRanges,
        }),
      }
    );

    if (!valuesRes.ok) {
      // 값 입력 실패 시 보상 삭제
      if (session.googleToken) {
        await deleteGoogleDriveFile(session.googleToken, spreadsheetId);
      }
      return NextResponse.json({ error: "시트 데이터 입력에 실패하여 생성을 취소했습니다." }, { status: 502 });
    }

    // 4. 차트 생성 (AddChartRequest)
    const chartRequests = buildChartRequests(analysis);
    let chartCount = 0;
    const warnings: string[] = [];

    if (chartRequests.length > 0) {
      const batchRes = await callGoogleApi(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: "POST",
          body: JSON.stringify({ requests: chartRequests }),
        }
      );

      if (!batchRes.ok) {
        // 차트 생성 실패 시 보상 삭제
        if (session.googleToken) {
          await deleteGoogleDriveFile(session.googleToken, spreadsheetId);
        }
        return NextResponse.json(
          { error: "차트 생성에 실패하여 생성을 취소했습니다." },
          { status: 502 }
        );
      } else {
        const batchData = (await batchRes.json()) as { replies?: Array<{ addChart?: { chart?: { chartId: number } } }> };
        chartCount = (batchData.replies || []).filter((r) => r.addChart?.chart?.chartId !== undefined).length;
      }
    }

    const result: GoogleSheetsExportResult = {
      spreadsheetId,
      spreadsheetUrl,
      title,
      rowCount: exportRows.length,
      sheetCount: 4,
      chartCount,
      warnings,
    };

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { timestamp: Date.now(), result });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Google Sheets export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
