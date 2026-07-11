// 경로 기반 단일 폴더 연동 공용 핸들러 (obsidian / llm) — phase6 §5 "obsidian 라우트 구조 복제".
// 로컬 문서(local-doc)는 다중 폴더라 전용 라우트를 사용.

import { NextRequest, NextResponse } from "next/server";
import { isDirectory } from "../adapters/fsScan";
import { readSession, unauthorized, writeSession } from "./cookies";
import { SessionData } from "./session";

type PathField = "obsidianVaultPath" | "llmArtifactsPath";

export function makePathConnectionHandler(field: PathField) {
  return async function POST(request: NextRequest) {
    const session = await readSession();
    if (!session) return unauthorized();

    const body = (await request.json().catch(() => ({}))) as {
      action?: "connect" | "disconnect";
      path?: string;
    };

    const next: SessionData = { ...session };
    if (body.action === "disconnect") {
      delete next[field];
    } else {
      const path = (body.path || "").trim();
      if (!path) {
        return NextResponse.json({ error: "path가 필요합니다" }, { status: 400 });
      }
      if (!(await isDirectory(path))) {
        return NextResponse.json(
          { error: "존재하지 않는 폴더이거나 접근할 수 없습니다" },
          { status: 400 }
        );
      }
      next[field] = path;
    }

    return writeSession(NextResponse.json({ success: true }), next);
  };
}
