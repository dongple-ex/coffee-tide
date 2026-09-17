import { NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";

export function validateWindowPayload(body: unknown): { ok: true; action: "minimize" | "restore"; marker: string } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_body" };
  }
  const { action, marker } = body as { action?: unknown; marker?: unknown };
  if (action !== "minimize" && action !== "restore") {
    return { ok: false, error: "invalid_action" };
  }
  if (typeof marker !== "string" || !/^[a-f0-9]{32}$/.test(marker)) {
    return { ok: false, error: "invalid_marker" };
  }
  return { ok: true, action, marker };
}

export function executeWindowControl(action: "minimize" | "restore", marker: string): Promise<boolean> {
  if (process.platform !== "win32") {
    return Promise.resolve(false);
  }

  const psScriptPath = path.join(process.cwd(), "desktop", "native", "main-window.ps1");
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

  return new Promise((resolve) => {
    execFile(
      executable,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", psScriptPath, "-Action", action, "-Marker", marker],
      { windowsHide: true, timeout: 6000, maxBuffer: 4096 },
      (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed.ok === true);
        } catch {
          resolve(false);
        }
      }
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = validateWindowPayload(body);
    if (!validated.ok) {
      return NextResponse.json({ ok: false, error: validated.error }, { status: 400 });
    }

    const success = await executeWindowControl(validated.action, validated.marker);
    return NextResponse.json({ ok: success });
  } catch {
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
