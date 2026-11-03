import { NextResponse } from "next/server";
import { requireSupabaseUser } from "@/lib/supabase/server";
import { sameOrigin, telegramConfig } from "@/lib/telegram/config";
import { linkStatus, startLink, telegramDb } from "@/lib/telegram/store";

export async function GET() {
  const auth = await requireSupabaseUser();
  if (!auth.ok) { return auth.response; }
  if (!telegramConfig()) { return NextResponse.json({ configured: false }, { headers: { "Cache-Control": "no-store" } }); }
  try {
    return NextResponse.json({ configured: true, ...await linkStatus(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Telegram 연결 저장소를 확인하지 못했습니다." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const auth = await requireSupabaseUser();
  if (!auth.ok) { return auth.response; }
  const config = telegramConfig();
  if (!config) { return NextResponse.json({ error: "Telegram 연결이 아직 준비되지 않았습니다." }, { status: 503 }); }
  try {
    const body = await request.json();
    if (body.action === "start") {
      const link = await startLink(auth.user.id);
      return NextResponse.json({ requestId: link.requestId, url: `https://t.me/${config.username}?start=${link.token}` },
        { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "confirm" && typeof body.requestId === "string" && /^[0-9a-f-]{36}$/i.test(body.requestId)) {
      const { error } = await telegramDb().rpc("telegram_confirm_link", { p_user: auth.user.id, p_request: body.requestId });
      if (error) { return NextResponse.json({ error: "연결 요청이 만료되었거나 이미 연결된 계정입니다. 상태를 다시 확인해 주세요." }, { status: 409 }); }
      return NextResponse.json({ connected: true });
    }
    return NextResponse.json({ error: "잘못된 연결 요청입니다." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Telegram 연결을 시작하지 못했습니다. 상태를 다시 확인해 주세요." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
  const auth = await requireSupabaseUser();
  if (!auth.ok) { return auth.response; }
  try {
    const { error } = await telegramDb().rpc("telegram_unlink", { p_user: auth.user.id });
    if (error) { throw new Error("Unlink failed"); }
    return NextResponse.json({ connected: false });
  } catch {
    return NextResponse.json({ error: "Telegram 연결을 해제하지 못했습니다." }, { status: 503 });
  }
}
