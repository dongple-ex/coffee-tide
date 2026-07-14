import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/auth/cookies";
import { UnifiedData } from "@/lib/types/unified";

export async function POST(req: NextRequest) {
  try {
    const session = await readSession();
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File;
    const saveToDrive = formData.get("saveToDrive") === "true";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const textContent = await file.text();

    if (saveToDrive) {
      const token = session.googleToken;
      if (!token) {
        return NextResponse.json({ error: "Google 연동이 되어있지 않거나 권한이 만료되었습니다. 다시 로그인해주세요." }, { status: 401 });
      }

      let folderId = await getFolderId(token, "CoffeeTide");
      if (!folderId) {
        folderId = await createFolder(token, "CoffeeTide");
      }
      
      await uploadFileToDrive(token, file, folderId);
    }

    const doc: UnifiedData = {
      id: "upload-" + Date.now(),
      source: "manual", // Treat as manual input so it's included in briefings
      title: file.name,
      content: textContent,
      created_at: new Date().toISOString(),
      author: { name: session.userEmail },
      url: "",
    };

    return NextResponse.json(doc);
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function getFolderId(token: string, folderName: string): Promise<string | null> {
  const query = encodeURIComponent(`mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
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
    const text = await res.text();
    console.error("Drive upload failed:", text);
    throw new Error("Failed to upload file to Google Drive. Check permissions.");
  }
}
