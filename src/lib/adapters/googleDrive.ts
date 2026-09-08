import { UnifiedData } from "../types/unified";
import { AuthExpiredError } from "./outlook";

export class GoogleDriveApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = "GoogleDriveApiError";
  }
}

interface DriveFile {
  id: string;
  webViewLink?: string;
  name?: string;
}

function safeDriveName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "CoffeeTide 보고서";
}

export class GoogleDriveAdapter {
  constructor(private readonly accessToken: string) {}

  private async request(url: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
    if (response.status === 401) throw new AuthExpiredError("google");
    if (!response.ok) {
      const responseBody = (await response.text()).slice(0, 1000);
      throw new GoogleDriveApiError(
        `Google Drive request failed (${response.status})`,
        response.status,
        responseBody
      );
    }
    return response;
  }

  async fetchRecentFiles(limit = 10, windowDays = 14): Promise<UnifiedData[]> {
    const sinceDate = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const query = `trashed=false and mimeType!='application/vnd.google-apps.folder' and modifiedTime>='${sinceDate}'`;
    const params = new URLSearchParams({
      q: query,
      orderBy: "modifiedTime desc",
      pageSize: String(Math.min(Math.max(1, limit), 50)),
      fields: "files(id,name,mimeType,modifiedTime,webViewLink,owners(displayName,emailAddress),description,size)",
    });

    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files?${params}`
    );

    const data = (await response.json()) as {
      files?: Array<{
        id: string;
        name?: string;
        mimeType?: string;
        modifiedTime?: string;
        webViewLink?: string;
        description?: string;
        owners?: Array<{ displayName?: string; emailAddress?: string }>;
      }>;
    };
    const files = data.files || [];

    return files.map((file): UnifiedData => {
      const owner = file.owners?.[0];
      const typeLabel =
        file.mimeType?.replace("application/vnd.google-apps.", "Google ") ||
        file.mimeType ||
        "문서";
      const modTime = file.modifiedTime ? file.modifiedTime.slice(0, 16).replace("T", " ") : "";

      return {
        id: `gdrive_${file.id}`,
        source: "gdrive",
        sourceApp: "Google Drive",
        title: file.name || "제목 없는 문서",
        content: `[${typeLabel}] 최근 수정: ${modTime}${file.description ? `\n설명: ${file.description}` : ""}`.trim(),
        created_at: file.modifiedTime || new Date().toISOString(),
        author: {
          name: owner?.displayName || "Google Drive",
          email: owner?.emailAddress,
        },
        url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        driveUrl: file.webViewLink,
        category: "reference",
        status: "pending",
      };
    });
  }

  private async folderId(name: string, parentId?: string): Promise<string | null> {
    const escapedName = name.replaceAll("'", "\\'");
    let query = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`;
    if (parentId) query += ` and '${parentId}' in parents`;
    const response = await this.request(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`
    );
    const data = (await response.json()) as { files?: DriveFile[] };
    return data.files?.[0]?.id ?? null;
  }

  private async createFolder(name: string, parentId?: string): Promise<string> {
    const response = await this.request("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    });
    const data = (await response.json()) as DriveFile;
    if (!data.id) throw new GoogleDriveApiError("Drive folder id missing", 502, "");
    return data.id;
  }

  private async ensureFolder(name: string, parentId?: string): Promise<string> {
    return (await this.folderId(name, parentId)) ?? this.createFolder(name, parentId);
  }

  async saveMarkdownReport(options: {
    title: string;
    body: string;
    timezone: string;
  }): Promise<DriveFile> {
    const rootId = await this.ensureFolder("CoffeeTide");
    const date = new Intl.DateTimeFormat("sv-SE", {
      timeZone: options.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const dateFolderId = await this.ensureFolder(date, rootId);
    const fileName = `${safeDriveName(options.title)}.md`;
    const metadata = { name: fileName, parents: [dateFolderId] };
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    form.append("file", new Blob([options.body], { type: "text/markdown; charset=utf-8" }), fileName);
    const response = await this.request(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      { method: "POST", body: form }
    );
    const data = (await response.json()) as DriveFile;
    if (!data.id) throw new GoogleDriveApiError("Drive file id missing", 502, "");
    return data;
  }
}
