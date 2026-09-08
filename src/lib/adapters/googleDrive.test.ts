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
});
