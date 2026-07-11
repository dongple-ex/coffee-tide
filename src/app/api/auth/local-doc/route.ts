// 로컬 문서 폴더 연동 — 여러 폴더 지원 (connect=추가, disconnect=개별/전체 해제)

import { NextRequest, NextResponse } from "next/server";
import { isDirectory } from "@/lib/adapters/fsScan";
import { readSession, unauthorized, writeSession } from "@/lib/auth/cookies";

const MAX_FOLDERS = 5;

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    action?: "connect" | "disconnect";
    path?: string;
  };
  const paths = session.localDocPaths ?? [];

  if (body.action === "disconnect") {
    const remaining = body.path ? paths.filter((p) => p !== body.path) : [];
    const next = { ...session };
    if (remaining.length > 0) next.localDocPaths = remaining;
    else delete next.localDocPaths;
    return writeSession(NextResponse.json({ success: true, paths: remaining }), next);
  }

  const path = (body.path || "").trim();
  if (!path) {
    return NextResponse.json({ error: "폴더 경로를 알려주세요" }, { status: 400 });
  }
  if (paths.includes(path)) {
    return NextResponse.json({ error: "이미 살펴보고 있는 폴더예요" }, { status: 400 });
  }
  if (paths.length >= MAX_FOLDERS) {
    return NextResponse.json(
      { error: `폴더는 ${MAX_FOLDERS}개까지만 볼 수 있어요. 하나 정리하고 추가해 주세요.` },
      { status: 400 }
    );
  }
  if (!(await isDirectory(path))) {
    return NextResponse.json(
      { error: "존재하지 않는 폴더이거나 접근할 수 없어요" },
      { status: 400 }
    );
  }

  const next = { ...session, localDocPaths: [...paths, path] };
  return writeSession(NextResponse.json({ success: true, paths: next.localDocPaths }), next);
}
