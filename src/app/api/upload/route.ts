// 파일 업로드 — 텍스트 파일을 manual 항목으로 변환, 옵션으로 Google Drive 영구 저장.
// /api/mails와 동일하게 선제(만료 임박) + 반응형(401/403 시 1회) 토큰 리프레시를 적용한다.

import { NextRequest, NextResponse } from "next/server";
import { AuthExpiredError } from "@/lib/adapters/outlook";
import { readSession, writeSession } from "@/lib/auth/cookies";
import { refreshChannel, refreshGoogleIfExpiring } from "@/lib/auth/refresh";
import { UnifiedData } from "@/lib/types/unified";

// manual 항목은 localStorage(약 5MB 한도)에 통째로 저장되므로 크기를 제한한다.
const MAX_FILE_BYTES = 1 * 1024 * 1024;
const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".json", ".log"];

const RELOGIN_MESSAGE =
  "Google Drive 권한이 없거나 만료되었습니다. 설정에서 Google을 다시 연동해주세요.";

function isTextFile(file: File): boolean {
  if (file.type.startsWith("text/") || file.type === "application/json") return true;
  const name = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function POST(req: NextRequest) {
  try {
    let session = await readSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file");
    const saveToDrive = formData.get("saveToDrive") === "true";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "파일이 너무 큽니다. 1MB 이하의 텍스트 파일만 업로드할 수 있어요." },
        { status: 413 }
      );
    }
    if (!isTextFile(file)) {
      return NextResponse.json(
        { error: "텍스트 파일(.txt, .md, .csv, .json 등)만 업로드할 수 있어요." },
        { status: 415 }
      );
    }

    const textContent = await file.text();
    let sessionChanged = false;

    if (saveToDrive) {
      // 선제 리프레시 — 만료 임박(60초 이내) 시 갱신
      const refreshed = await refreshGoogleIfExpiring(session);
      if (refreshed) {
        session = refreshed;
        sessionChanged = true;
      }

      if (!session.googleToken) {
        return NextResponse.json({ error: RELOGIN_MESSAGE }, { status: 401 });
      }

      try {
        await saveToDriveFolder(session.googleToken, file);
      } catch (err) {
        // 반응형 리프레시: 401/403이면 1회 갱신 후 재시도 (백로그 A3)
        if (!(err instanceof AuthExpiredError)) throw err;
        const retried = await refreshChannel("google", session);
        if (!retried) {
          return NextResponse.json({ error: RELOGIN_MESSAGE }, { status: 401 });
        }
        session = retried;
        sessionChanged = true;
        try {
          await saveToDriveFolder(session.googleToken!, file);
        } catch (retryErr) {
          if (retryErr instanceof AuthExpiredError) {
            return NextResponse.json({ error: RELOGIN_MESSAGE }, { status: 401 });
          }
          throw retryErr;
        }
      }
    }

    const doc: UnifiedData = {
      id: "upload-" + Date.now(),
      source: "manual", // Treat as manual input so it's included in briefings
      title: file.name,
      content: textContent,
      created_at: new Date().toISOString(),
      author: { name: session.userEmail },
      url: "",
      status: "pending",
    };

    const res = NextResponse.json(doc);
    return sessionChanged ? writeSession(res, session) : res;
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "업로드에 실패했어요. 다시 시도해주세요." }, { status: 500 });
  }
}

async function saveToDriveFolder(token: string, file: File) {
  let folderId = await getFolderId(token, "CoffeeTide");
  if (!folderId) {
    folderId = await createFolder(token, "CoffeeTide");
  }
  await uploadFileToDrive(token, file, folderId);
}

function throwIfAuthError(status: number): void {
  // 401(만료)과 403(drive.file 스코프 미동의 — 스코프 추가 이전에 로그인한 세션)
  if (status === 401 || status === 403) throw new AuthExpiredError("google");
}

async function getFolderId(token: string, folderName: string): Promise<string | null> {
  const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    throwIfAuthError(res.status);
    console.error("getFolderId failed:", await res.text());
    throw new Error("Failed to search Drive folder. Please re-authenticate Google.");
  }
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

async function createFolder(token: string, folderName: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder"
    })
  });
  if (!res.ok) {
    throwIfAuthError(res.status);
    console.error("createFolder failed:", await res.text());
    throw new Error("Failed to create Drive folder");
  }
  const data = await res.json();
  return data.id;
}

async function uploadFileToDrive(token: string, file: File, folderId: string) {
  const form = new FormData();
  const metadata = {
    name: file.name,
    parents: [folderId]
  };
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });

  if (!res.ok) {
    throwIfAuthError(res.status);
    const text = await res.text();
    console.error("Drive upload failed:", text);
    throw new Error("Failed to upload file to Google Drive. Check permissions.");
  }
}
