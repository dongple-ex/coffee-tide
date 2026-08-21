import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { mapUnifiedItemFromDb, mapUnifiedItemToDbRow } from "@/lib/data/mappers";
import type {
  SyncMutation,
  SyncMutationResult,
  SyncMutationsResponse,
} from "@/lib/sync/contracts";
import type { WorkspaceItem } from "@/lib/data/contracts";

export async function POST(req: NextRequest) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  let body: { mutations?: SyncMutation[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mutations = body.mutations;
  if (!Array.isArray(mutations)) {
    return NextResponse.json({ error: "mutations array is required" }, { status: 400 });
  }
  if (mutations.length > 200) {
    return NextResponse.json({ error: "한 번에 최대 200개 변경만 전송할 수 있습니다." }, { status: 413 });
  }

  const results: SyncMutationResult[] = [];

  for (const mutation of mutations) {
    const { mutationId, itemId, operation, baseVersion, payload } = mutation;

    try {
      if (
        typeof mutationId !== "string" || mutationId.length === 0 || mutationId.length > 160 ||
        typeof itemId !== "string" || itemId.length === 0 || itemId.length > 240 ||
        !["create", "update", "delete"].includes(operation) ||
        (baseVersion !== undefined && (!Number.isInteger(baseVersion) || baseVersion < 1)) ||
        (payload !== undefined && JSON.stringify(payload).length > 256 * 1024)
      ) {
        results.push({
          mutationId: typeof mutationId === "string" ? mutationId : "invalid-mutation",
          status: "rejected",
          errorCode: "Invalid mutation payload",
        });
        continue;
      }

      const sameBatchResult = results.find((result) => result.mutationId === mutationId);
      if (sameBatchResult) {
        results.push(sameBatchResult);
        continue;
      }
      const { data: receipt } = await supabase
        .from("sync_mutation_receipts")
        .select("result")
        .eq("user_id", user.id)
        .eq("mutation_id", mutationId)
        .maybeSingle();
      if (receipt?.result) {
        results.push(receipt.result as SyncMutationResult);
        continue;
      }

      if (operation === "create") {
        // 이미 존재하는지 확인 (멱등성)
        const { data: existingRow } = await supabase
          .from("unified_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", itemId)
          .maybeSingle();

        if (existingRow) {
          results.push({
            mutationId,
            status: "duplicate",
            serverItem: mapUnifiedItemFromDb(existingRow),
          });
          continue;
        }

        const newItem: WorkspaceItem = {
          id: itemId,
          source: (payload?.source as WorkspaceItem["source"]) || "manual",
          title: payload?.title || "",
          content: payload?.content || "",
          created_at: payload?.created_at || new Date().toISOString(),
          author: payload?.author || { name: "User" },
          url: payload?.url || "",
          category: payload?.category,
          actionDirective: payload?.actionDirective,
          status: payload?.status || "pending",
          workNote: payload?.workNote,
          subTasks: payload?.subTasks,
          rawContent: payload?.rawContent,
          driveUrl: payload?.driveUrl,

          itemType: payload?.itemType || "task",
          sourceRef: payload?.sourceRef,
          occurredAt: payload?.occurredAt,
          attributes: payload?.attributes || {},
          version: 1,
          privacyScope: payload?.privacyScope || "cloud_private",
          aiPolicy: payload?.aiPolicy || "cloud_allowed",
          updatedAt: new Date().toISOString(),
        };

        const dbRow = mapUnifiedItemToDbRow(newItem, user.id);
        const { data: inserted, error: insertError } = await supabase
          .from("unified_items")
          .insert(dbRow)
          .select("*")
          .single();

        if (insertError) {
          if (insertError.code === "23505") {
            const { data: duplicateRow } = await supabase
              .from("unified_items")
              .select("*")
              .eq("user_id", user.id)
              .eq("id", itemId)
              .maybeSingle();
            results.push({
              mutationId,
              status: duplicateRow ? "duplicate" : "rejected",
              serverItem: duplicateRow ? mapUnifiedItemFromDb(duplicateRow) : undefined,
              errorCode: duplicateRow ? undefined : insertError.message,
            });
          } else {
            results.push({
              mutationId,
              status: "rejected",
              errorCode: insertError.message,
            });
          }
        } else {
          results.push({
            mutationId,
            status: "applied",
            serverItem: mapUnifiedItemFromDb(inserted),
          });
        }
      } else if (operation === "update") {
        const targetVersion = baseVersion !== undefined ? baseVersion : 1;
        const nowIso = new Date().toISOString();

        // 5단계: 원자적 낙관적 잠금 업데이트 (version = baseVersion 조건 포함)
        const updatePayload: Record<string, unknown> = {
          version: targetVersion + 1,
          updated_at: nowIso,
        };

        if (payload?.title !== undefined) updatePayload.title = payload.title;
        if (payload?.content !== undefined) updatePayload.content = payload.content;
        if (payload?.status !== undefined) updatePayload.status = payload.status;
        if (payload?.category !== undefined) updatePayload.category = payload.category;
        if (payload?.actionDirective !== undefined) updatePayload.action_directive = payload.actionDirective;
        if (payload?.workNote !== undefined) updatePayload.work_note = payload.workNote;
        if (payload?.subTasks !== undefined) updatePayload.sub_tasks = payload.subTasks;
        if (payload?.rawContent !== undefined) updatePayload.raw_content = payload.rawContent;
        if (payload?.driveUrl !== undefined) updatePayload.drive_url = payload.driveUrl;
        if (payload?.itemType !== undefined) updatePayload.item_type = payload.itemType;
        if (payload?.sourceRef !== undefined) updatePayload.source_ref = payload.sourceRef;
        if (payload?.occurredAt !== undefined) updatePayload.occurred_at = payload.occurredAt;
        if (payload?.attributes !== undefined) updatePayload.attributes = payload.attributes;
        if (payload?.privacyScope !== undefined) updatePayload.privacy_scope = payload.privacyScope;
        if (payload?.aiPolicy !== undefined) updatePayload.ai_policy = payload.aiPolicy;
        // 삭제 충돌에서 사용자가 '내 변경 유지'를 선택하면 동일 ID를 복원할 수 있습니다.
        updatePayload.deleted_at = null;

        const { data: updatedRows, error: updateError } = await supabase
          .from("unified_items")
          .update(updatePayload)
          .eq("user_id", user.id)
          .eq("id", itemId)
          .eq("version", targetVersion)
          .select("*");

        if (updateError) {
          results.push({
            mutationId,
            status: "rejected",
            errorCode: updateError.message,
          });
        } else if (!updatedRows || updatedRows.length === 0) {
          // 영향받은 행이 0개 -> 버전 불일치로 인한 충돌 또는 항목 없음
          const { data: latestRow } = await supabase
            .from("unified_items")
            .select("*")
            .eq("user_id", user.id)
            .eq("id", itemId)
            .maybeSingle();

          if (latestRow) {
            results.push({
              mutationId,
              status: "conflict",
              serverItem: mapUnifiedItemFromDb(latestRow),
            });
          } else {
            results.push({
              mutationId,
              status: "rejected",
              errorCode: "Item not found",
            });
          }
        } else {
          results.push({
            mutationId,
            status: "applied",
            serverItem: mapUnifiedItemFromDb(updatedRows[0]),
          });
        }
      } else if (operation === "delete") {
        const targetVersion = baseVersion !== undefined ? baseVersion : 1;
        const nowIso = new Date().toISOString();

        // 5단계: 원자적 soft delete (version = baseVersion 조건 포함)
        const { data: deletedRows, error: deleteError } = await supabase
          .from("unified_items")
          .update({
            deleted_at: nowIso,
            version: targetVersion + 1,
            updated_at: nowIso,
          })
          .eq("user_id", user.id)
          .eq("id", itemId)
          .eq("version", targetVersion)
          .select("*");

        if (deleteError) {
          results.push({
            mutationId,
            status: "rejected",
            errorCode: deleteError.message,
          });
        } else if (!deletedRows || deletedRows.length === 0) {
          // 영향받은 행이 0개인 경우
          const { data: latestRow } = await supabase
            .from("unified_items")
            .select("*")
            .eq("user_id", user.id)
            .eq("id", itemId)
            .maybeSingle();

          if (latestRow && !latestRow.deleted_at) {
            results.push({
              mutationId,
              status: "conflict",
              serverItem: mapUnifiedItemFromDb(latestRow),
            });
          } else {
            // 이미 삭제된 상태면 duplicate(성공) 처리
            results.push({
              mutationId,
              status: "duplicate",
            });
          }
        } else {
          results.push({
            mutationId,
            status: "applied",
            serverItem: mapUnifiedItemFromDb(deletedRows[0]),
          });
        }
      } else {
        results.push({
          mutationId,
          status: "rejected",
          errorCode: "Unsupported mutation operation",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({
        mutationId,
        status: "rejected",
        errorCode: message,
      });
    }
  }

  if (results.length > 0) {
    const uniqueResults = Array.from(
      new Map(results.map((result) => [result.mutationId, result])).values()
    );
    await supabase.from("sync_mutation_receipts").upsert(
      uniqueResults.map((result) => ({
        user_id: user.id,
        mutation_id: result.mutationId,
        result,
      })),
      { onConflict: "user_id,mutation_id", ignoreDuplicates: true }
    );
  }

  const response: SyncMutationsResponse = { results };
  return NextResponse.json(response);
}
