import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth/cookies";
import { listIntegrationsForCurrentUser } from "@/lib/auth/integrationStore";
import { revokeGoogleToken } from "@/lib/auth/google";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "잘못된 요청 출처입니다." }, { status: 403 });
  }

  const supabase = await createServerSupabaseClient();
  const admin = createAdminSupabaseClient();
  if (!supabase || !admin) {
    return NextResponse.json({ error: "계정 관리 서버 설정이 필요합니다." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인 계정이 없습니다." }, { status: 401 });
  }

  const integrations = await listIntegrationsForCurrentUser();
  for (const integration of integrations) {
    if (integration.provider !== "google") continue;
    const credentials = integration.credentials;
    const token =
      "googleRefreshToken" in credentials
        ? credentials.googleRefreshToken || credentials.googleToken
        : undefined;
    if (token) await revokeGoogleToken(token);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[DELETE /api/account] Supabase 사용자 삭제 실패", error.message);
    return NextResponse.json({ error: "계정을 삭제하지 못했습니다." }, { status: 500 });
  }

  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  return clearSession(NextResponse.json({ success: true }));
}
