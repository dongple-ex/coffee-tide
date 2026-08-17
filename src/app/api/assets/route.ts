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

function isValidImageSignature(bytes: Buffer): { valid: boolean; detectedMime?: string } {
  if (bytes.length < 12) return { valid: false };
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, detectedMime: "image/jpeg" };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { valid: true, detectedMime: "image/png" };
  }
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, detectedMime: "image/webp" };
  }
  return { valid: false };
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
        return NextResponse.json({ error: "첨부 파일은 최대 4MB까지 저장할 수 있습니다." }, { status: 413 });
      }

      const { data: parentItem } = await supabase
        .from("unified_items")
        .select("id, item_type")
        .eq("user_id", user.id)
        .eq("id", itemId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!parentItem) {
        return NextResponse.json({ error: "연결할 활성 항목을 찾지 못했습니다." }, { status: 404 });
      }

      const bytes = Buffer.from(await file.arrayBuffer());

      // 이미지(영수증) 첨부 검증 강화
      if (kind === "image" || parentItem.item_type === "expense") {
        const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedMimes.includes(file.type.toLowerCase())) {
          return NextResponse.json(
            { error: "영수증 이미지는 JPG, PNG, WebP 형식만 지원합니다." },
            { status: 415 }
          );
        }

        const signatureCheck = isValidImageSignature(bytes);
        if (!signatureCheck.valid) {
          return NextResponse.json(
            { error: "유효하지 않거나 손상된 이미지 파일입니다." },
            { status: 415 }
          );
        }

        // 최대 5장 검사
        const { count: existingReceiptsCount } = await supabase
          .from("content_assets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("item_id", itemId)
          .eq("kind", "image")
          .is("deleted_at", null);

        if ((existingReceiptsCount || 0) >= 5) {
          return NextResponse.json(
            { error: "한 비용 항목당 최대 5장의 영수증만 첨부할 수 있습니다." },
            { status: 409 }
          );
        }
      }

      const storagePath = `${user.id}/${itemId}/${crypto.randomUUID()}${safeExtension(file)}`;
      const { error: uploadError } = await supabase.storage
        .from("private-assets")
        .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream" });
      if (uploadError) {
        return NextResponse.json({ error: "비공개 첨부 업로드에 실패했습니다." }, { status: 502 });
      }

      try {
        asset = buildContentAsset({
          itemId,
          kind: (kind === "image" || parentItem.item_type === "expense") ? "image" : (kind as "document" | "image" | "audio" | "raw_text"),
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
