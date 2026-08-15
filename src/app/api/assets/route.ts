import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapContentAssetFromDb, mapContentAssetToDbRow } from "@/lib/data/mappers";
import { buildContentAsset } from "@/lib/assets/service";

// 서버 경유 업로드는 Vercel Function 4.5MB 요청 제한을 넘지 않게 보수적으로 제한합니다.
const MAX_ASSET_SIZE_BYTES = 4 * 1024 * 1024;

function safeExtension(file: File): string {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension ? `.${extension.slice(0, 10)}` : "";
}

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
  const itemId = searchParams.get("itemId");

  let query = supabase
    .from("content_assets")
    .select("*")
    .eq("user_id", user.id)
    .is("deleted_at", null);

  if (itemId) {
    query = query.eq("item_id", itemId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const assets = (data || []).map(mapContentAssetFromDb);
  return NextResponse.json({ assets });
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
    const contentType = req.headers.get("content-type") || "";
    let asset;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const itemId = String(formData.get("itemId") || "");
      const kind = String(formData.get("kind") || "document");
      if (!(file instanceof File) || !itemId) {
        return NextResponse.json({ error: "file과 itemId가 필요합니다." }, { status: 400 });
      }
      if (file.size > MAX_ASSET_SIZE_BYTES) {
        return NextResponse.json({ error: "서버 경유 첨부 파일은 최대 4MB까지 저장할 수 있습니다." }, { status: 413 });
      }

      const { data: parentItem } = await supabase
        .from("unified_items")
        .select("id")
        .eq("user_id", user.id)
        .eq("id", itemId)
        .maybeSingle();
      if (!parentItem) {
        return NextResponse.json({ error: "연결할 업무 항목을 찾지 못했습니다." }, { status: 404 });
      }

      const storagePath = `${user.id}/${itemId}/${crypto.randomUUID()}${safeExtension(file)}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from("private-assets")
        .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream" });
      if (uploadError) {
        return NextResponse.json({ error: "비공개 첨부 업로드에 실패했습니다." }, { status: 502 });
      }

      try {
        asset = buildContentAsset({
          itemId,
          kind: kind as "document" | "image" | "audio" | "raw_text",
          provider: "supabase",
          providerRef: storagePath,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          retentionPolicy: "user_kept",
        }, user.id);
      } catch (error) {
        await supabase.storage.from("private-assets").remove([storagePath]);
        throw error;
      }
    } else {
      const body = await req.json();
      if (body.provider === "supabase") {
        return NextResponse.json(
          { error: "Supabase 자산은 multipart 파일 업로드를 사용해야 합니다." },
          { status: 400 }
        );
      }
      asset = buildContentAsset(body, user.id);
    }

    const dbRow = mapContentAssetToDbRow(asset, user.id);

    const { data, error } = await supabase
      .from("content_assets")
      .insert(dbRow)
      .select("*")
      .single();

    if (error) {
      if (asset.provider === "supabase") {
        await supabase.storage.from("private-assets").remove([asset.providerRef]);
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ asset: mapContentAssetFromDb(data) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Asset creation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
