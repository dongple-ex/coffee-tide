import "server-only";

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
