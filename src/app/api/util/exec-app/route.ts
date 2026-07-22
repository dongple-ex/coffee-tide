import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { target?: string };
    const { target } = body;
    if (!target || typeof target !== "string") {
      return NextResponse.json({ error: "실행 대상(target)이 필요합니다." }, { status: 400 });
    }

    const trimmed = target.trim();

    // Windows/macOS/Linux 통합 프로그램 및 URL/스키마 실행 커맨드
    const command =
      process.platform === "win32"
        ? `start "" "${trimmed}"`
        : process.platform === "darwin"
        ? `open "${trimmed}"`
        : `xdg-open "${trimmed}"`;

    await execAsync(command);

    return NextResponse.json({ success: true, target: trimmed });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[coffeeTide] Exec app failed:", message);
    return NextResponse.json({ error: `프로그램 실행 실패: ${message}` }, { status: 500 });
  }
}
