import { NextRequest, NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { id: assetId } = await params;

  // 1. 자산 메타데이터 조회 (본인 소유 확인)
  const { data: asset, error: fetchError } = await supabase
    .from("content_assets")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", assetId)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.provider !== "supabase") {
    // Drive나 로컬 등 외부 자산인 경우 providerRef 반환
    return NextResponse.json({
      downloadUrl: asset.provider_ref,
      provider: asset.provider,
      expiresInSeconds: null,
    });
  }

  // 2. 단기(60초) 서명된 다운로드 URL 생성
  const { data: signedData, error: signError } = await supabase.storage
    .from("private-assets")
    .createSignedUrl(asset.provider_ref, 60);

  if (signError || !signedData?.signedUrl) {
    return NextResponse.json({ error: "Failed to generate signed download URL" }, { status: 500 });
  }

  return NextResponse.json({
    downloadUrl: signedData.signedUrl,
    provider: "supabase",
    expiresInSeconds: 60,
  });
}
