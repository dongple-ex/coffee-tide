export interface DriveFileOptions {
  name: string;
  mimeType: string;
  parents?: string[];
}

const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const FILE_URL = "https://www.googleapis.com/drive/v3/files";

/** Google Drive 폴더 생성 또는 조회 */
export async function ensureDriveFolder(token: string, folderName: string, parentId?: string): Promise<string> {
  // 먼저 폴더가 존재하는지 검색
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }
  const searchRes = await fetch(`${FILE_URL}?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // 없으면 생성
  const createRes = await fetch(FILE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create folder: ${folderName}`);
  }
  const createData = await createRes.json();
  return createData.id;
}

/** CoffeeTide/회의록/YYYY/meetingId 폴더 구조 생성 및 최종 ID 반환 */
export async function getOrCreateMeetingFolder(token: string, meetingId: string, year: string): Promise<string> {
  const rootFolderId = await ensureDriveFolder(token, "CoffeeTide");
  const meetingRootFolderId = await ensureDriveFolder(token, "회의록", rootFolderId);
  const yearFolderId = await ensureDriveFolder(token, year, meetingRootFolderId);
  return await ensureDriveFolder(token, meetingId, yearFolderId);
}

/** Multipart 업로드를 통해 파일 저장 */
export async function uploadToDrive(token: string, fileOptions: DriveFileOptions, content: Blob | string): Promise<string> {
  const metadata = {
    name: fileOptions.name,
    mimeType: fileOptions.mimeType,
    parents: fileOptions.parents,
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  
  let fileBlob: Blob;
  if (typeof content === "string") {
    fileBlob = new Blob([content], { type: fileOptions.mimeType });
  } else {
    fileBlob = content;
  }
  
  formData.append("file", fileBlob);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to upload file ${fileOptions.name}: ${errText}`);
  }

  const data = await res.json();
  return data.id;
}

/** 파일 내용 텍스트로 읽기 (참고자료 추출용) */
export async function downloadDriveFileText(token: string, fileId: string, mimeType: string): Promise<string> {
  // Google Docs나 Sheets 같은 워크스페이스 문서는 export를 사용해야 함
  if (mimeType.includes("vnd.google-apps.document")) {
    const res = await fetch(`${FILE_URL}/${fileId}/export?mimeType=text/plain`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to export Google Document");
    return res.text();
  } else if (mimeType.includes("vnd.google-apps.spreadsheet")) {
    const res = await fetch(`${FILE_URL}/${fileId}/export?mimeType=text/csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to export Google Spreadsheet");
    return res.text();
  } else if (mimeType.includes("vnd.google-apps.presentation")) {
    const res = await fetch(`${FILE_URL}/${fileId}/export?mimeType=text/plain`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to export Google Presentation");
    return res.text();
  }
  
  // 일반 파일
  const res = await fetch(`${FILE_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to download file");
  return res.text();
}
