import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GoogleDriveAdapter, GoogleDriveApiError } from "./googleDrive";
import { AuthExpiredError } from "./outlook";

describe("GoogleDriveAdapter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("fetchRecentFiles", () => {
    it("Google Drive API에서 최근 파일을 정상 수집하여 UnifiedData로 변환한다", async () => {
      const mockFiles = {
        files: [
          {
            id: "file-123",
            name: "2026_하반기_기획서.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            modifiedTime: "2026-09-08T10:00:00.000Z",
            webViewLink: "https://drive.google.com/file/d/file-123/view",
            description: "2026년 하반기 사업 기획안",
            owners: [{ displayName: "김기획", emailAddress: "planner@company.com" }],
            size: "102400",
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockFiles,
      });

      const adapter = new GoogleDriveAdapter("mock-token");
      const items = await adapter.fetchRecentFiles(10, 14);

      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.id).toBe("gdrive_file-123");
      expect(item.source).toBe("gdrive");
      expect(item.sourceApp).toBe("Google Drive");
      expect(item.category).toBe("reference");
      expect(item.title).toBe("2026_하반기_기획서.docx");
      expect(item.content).toContain("최근 수정: 2026-09-08 10:00");
      expect(item.content).toContain("2026년 하반기 사업 기획안");
      expect(item.author.name).toBe("김기획");
      expect(item.author.email).toBe("planner@company.com");
      expect(item.url).toBe("https://drive.google.com/file/d/file-123/view");
      expect(item.driveUrl).toBe("https://drive.google.com/file/d/file-123/view");
      expect(item.created_at).toBe("2026-09-08T10:00:00.000Z");
    });

    it("401 응답 시 AuthExpiredError를 던진다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const adapter = new GoogleDriveAdapter("expired-token");
      await expect(adapter.fetchRecentFiles(10)).rejects.toThrow(AuthExpiredError);
    });

    it("API 실패 시 GoogleDriveApiError를 던진다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Server Error",
      });

      const adapter = new GoogleDriveAdapter("mock-token");
      await expect(adapter.fetchRecentFiles(10)).rejects.toThrow(GoogleDriveApiError);
    });
  });

  describe("archive documents", () => {
    it("creates the CoffeeTide archive folders and uploads Markdown", async () => {
      const responses = [
        { files: [] },
        { files: [] },
        { id: "root" },
        { files: [] },
        { id: "archive-root" },
        { files: [] },
        { id: "year" },
        { id: "drive-file", name: "결정사항.md", webViewLink: "https://drive.google.com/file/d/drive-file/view" },
      ];
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => responses.shift(),
        text: async () => "",
      }));

      const adapter = new GoogleDriveAdapter("token");
      const saved = await adapter.saveArchiveMarkdown({
        archiveId: "archive:canvas:one",
        title: "결정사항",
        body: "# 결정사항\n\n본문",
        contentHash: "hash",
        archivedAt: "2026-09-14T00:00:00.000Z",
      });

      expect(saved.id).toBe("drive-file");
      expect(saved.webViewLink).toContain("drive-file");
      expect(global.fetch).toHaveBeenCalledTimes(8);
      const uploadCall = vi.mocked(global.fetch).mock.calls.at(-1);
      expect(uploadCall?.[0]).toContain("uploadType=multipart");
      expect(uploadCall?.[1]?.method).toBe("POST");
    });

    it("updates an existing archive file instead of creating another copy", async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ files: [{ id: "existing", name: "old.md" }] }),
          text: async () => "",
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ id: "existing", name: "new.md" }),
          text: async () => "",
        });

      const adapter = new GoogleDriveAdapter("token");
      await adapter.saveArchiveMarkdown({
        archiveId: "archive:canvas:one",
        title: "new",
        body: "updated",
        contentHash: "hash-2",
        archivedAt: "2026-09-14T00:00:00.000Z",
      });

      const updateCall = vi.mocked(global.fetch).mock.calls[1];
      expect(updateCall[0]).toContain("/files/existing");
      expect(updateCall[1]?.method).toBe("PATCH");
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
