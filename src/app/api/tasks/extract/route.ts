// 붙여넣기 가져오기 — 메모/메일/회의록 텍스트에서 업무 추출 (G1 paste 경로).
// 추출 결과는 클라이언트가 localStorage에 저장하는 1급 'paste' 소스가 된다.
// 구글 연동 세션이 있을 경우, Google Drive 'CoffeeTide/YYYY-MM-DD/' 일자별 폴더에 원문을 마크다운 파일로 자동 저장합니다.

import { NextRequest, NextResponse } from "next/server";
import { classifyTasks, extractTasks } from "@/lib/ai/gemini";
import { readSession, unauthorized } from "@/lib/auth/cookies";
import { UnifiedData } from "@/lib/types/unified";

async function getDriveFolderId(token: string, folderName: string, parentId?: string): Promise<string | null> {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id: string }> };
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function createDriveFolder(token: string, folderName: string, parentId?: string): Promise<string> {
  const bodyData: { name: string; mimeType: string; parents?: string[] } = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) bodyData.parents = [parentId];
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(bodyData),
  });
  if (!res.ok) throw new Error("Failed to create Drive folder");
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function saveToGoogleDriveDaily(token: string, text: string): Promise<{ driveUrl?: string }> {
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(today.getHours()).padStart(2, "0")}${String(today.getMinutes()).padStart(2, "0")}${String(today.getSeconds()).padStart(2, "0")}`;

    let rootFolderId = await getDriveFolderId(token, "CoffeeTide");
    if (!rootFolderId) {
      rootFolderId = await createDriveFolder(token, "CoffeeTide");
    }

    let dateFolderId = await getDriveFolderId(token, dateStr, rootFolderId);
    if (!dateFolderId) {
      dateFolderId = await createDriveFolder(token, dateStr, rootFolderId);
    }

    const fileName = `회의록_${timeStr}.md`;
    const fileContent = `# ☕ coffeeTide 회의록/메모 원문 (${dateStr} ${timeStr})\n\n${text}`;

    const metadata = { name: fileName, parents: [dateFolderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([fileContent], { type: "text/markdown" }), fileName);

    const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (res.ok) {
      const data = (await res.json()) as { id?: string; webViewLink?: string };
      return { driveUrl: data.webViewLink };
    }
  } catch (err) {
    console.warn("[tasks/extract] Google Drive daily backup skipped:", err);
  }
  return {};
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text가 필요합니다" }, { status: 400 });
  }

  // 구글 연동 세션이 있을 경우 Google Drive CoffeeTide/YYYY-MM-DD 폴더에 원문 마크다운 파일 자동 업로드
  let driveUrl: string | undefined;
  if (session.googleToken) {
    const driveRes = await saveToGoogleDriveDaily(session.googleToken, text);
    driveUrl = driveRes.driveUrl;
  }

  const extracted = await extractTasks(text);
  const now = Date.now();
  const items: UnifiedData[] = extracted.map((t, i) => ({
    id: `paste-${now}-${i}`,
    source: "paste",
    title: t.title,
    content: t.content,
    rawContent: text, // 사용자가 입력/붙여넣은 원문 텍스트 전체
    driveUrl, // Google Drive 일자별 저장 링크
    created_at: new Date().toISOString(),
    author: { name: session.userEmail },
    url: driveUrl ?? "",
    status: "pending",
  }));

  const { items: classified } = await classifyTasks(items);
  return NextResponse.json({ tasks: classified, driveUrl });
}
