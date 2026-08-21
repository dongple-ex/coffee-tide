import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSupabaseUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const { id } = await params;
  const { data: asset, error: lookupError } = await supabase
    .from("content_assets")
    .select("id,provider,provider_ref")
    .eq("user_id", user.id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (lookupError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.provider === "supabase") {
    const { error: removeError } = await supabase.storage
      .from("private-assets")
      .remove([asset.provider_ref]);
    if (removeError) {
      return NextResponse.json({ error: "비공개 첨부 삭제에 실패했습니다." }, { status: 502 });
    }
  }

  const { error: deleteError } = await supabase
    .from("content_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", id);
  if (deleteError) {
    return NextResponse.json({ error: "첨부 메타데이터 삭제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, driveFileDeleted: false });
}
