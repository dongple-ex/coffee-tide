// 네이티브 폴더 선택기 — 데스크톱(서버=사용자 PC) 전용. 실패 시 수동 입력 안내.

import { execFile } from "node:child_process";
import { NextResponse } from "next/server";
import { readSession, unauthorized } from "@/lib/auth/cookies";

const PS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'coffeeTide - 폴더 선택'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }
`;

export async function GET() {
  const session = await readSession();
  if (!session) return unauthorized();

  if (process.platform !== "win32") {
    return NextResponse.json(
      { error: "폴더 선택기는 Windows 데스크톱에서만 지원됩니다. 경로를 직접 입력해 주세요." },
      { status: 501 }
    );
  }

  const path = await new Promise<string>((resolve) => {
    execFile(
      "powershell.exe",
      ["-STA", "-NoProfile", "-NonInteractive", "-Command", PS_SCRIPT],
      { timeout: 120_000, windowsHide: false },
      (err, stdout) => resolve(err ? "" : stdout.trim())
    );
  });

  if (!path) {
    return NextResponse.json({ error: "폴더가 선택되지 않았습니다" }, { status: 400 });
  }
  return NextResponse.json({ path });
}
