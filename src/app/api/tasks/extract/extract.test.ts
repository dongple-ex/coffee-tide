import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, saveToGoogleDriveDaily } from "./route";
import { NextRequest } from "next/server";

// 모킹
vi.mock("@/lib/auth/integrationStore", () => ({
  readSessionWithIntegrations: vi.fn(),
}));

vi.mock("@/lib/ai/gemini", () => ({
  extractTasks: vi.fn().mockResolvedValue([
    { title: "테스트 업무", content: "테스트 내용" },
  ]),
  classifyTasks: vi.fn().mockImplementation(async (items) => ({ items })),
}));

import { readSessionWithIntegrations } from "@/lib/auth/integrationStore";

describe("Phase 14-01: /api/tasks/extract 저장 안전성 테스트", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("S01: Google 연결 + saveToDrive=false 인 경우 Drive fetch를 호출하지 않고 not_requested를 반환한다", async () => {
    (readSessionWithIntegrations as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userEmail: "user@example.com",
      googleToken: "valid-google-token",
    });

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const req = new NextRequest("http://localhost:3000/api/tasks/extract", {
      method: "POST",
      body: JSON.stringify({ text: "회의 안건 논의", saveToDrive: false }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0].driveUrl).toBeUndefined();
    expect(json.drive).toEqual({
      requested: false,
      saved: false,
      reason: "not_requested",
    });

    // Drive 관련 fetch 호출이 0회여야 함
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("S02: Google 연결 + saveToDrive=true 인 경우 Drive 백업을 수행하고 URL을 반환한다", async () => {
    (readSessionWithIntegrations as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userEmail: "user@example.com",
      googleToken: "valid-google-token",
    });

    // Mock fetch for Google Drive folder search and file upload
    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("files?q=")) {
        return {
          ok: true,
          json: async () => ({ files: [{ id: "folder-123" }] }),
        };
      }
      if (url.includes("upload/drive/v3/files")) {
        return {
          ok: true,
          json: async () => ({ id: "file-456", webViewLink: "https://drive.google.com/file/d/file-456/view" }),
        };
      }
      return { ok: false, status: 404 };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const req = new NextRequest("http://localhost:3000/api/tasks/extract", {
      method: "POST",
      body: JSON.stringify({ text: "회의 안건 논의", saveToDrive: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0].driveUrl).toBe("https://drive.google.com/file/d/file-456/view");
    expect(json.drive).toEqual({
      requested: true,
      saved: true,
      url: "https://drive.google.com/file/d/file-456/view",
    });
  });

  it("S03: Google 미연동 + saveToDrive=true 인 경우 not_connected를 반환하며 업무 추출은 성공한다", async () => {
    (readSessionWithIntegrations as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userEmail: "user@example.com",
      googleToken: undefined, // 미연동
    });

    const req = new NextRequest("http://localhost:3000/api/tasks/extract", {
      method: "POST",
      body: JSON.stringify({ text: "회의 안건 논의", saveToDrive: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tasks).toHaveLength(1);
    expect(json.tasks[0].driveUrl).toBeUndefined();
    expect(json.drive).toEqual({
      requested: true,
      saved: false,
      reason: "not_connected",
    });
  });

  it("S04: Drive 인증 만료(401/403) 시 auth_expired를 반환하고 업무 추출은 성공한다", async () => {
    (readSessionWithIntegrations as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userEmail: "user@example.com",
      googleToken: "expired-token",
    });

    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("files?q=")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { message: "Invalid Credentials" } }),
        };
      }
      if (url.includes("https://www.googleapis.com/drive/v3/files")) {
        return {
          ok: false,
          status: 401,
        };
      }
      return { ok: false, status: 401 };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const req = new NextRequest("http://localhost:3000/api/tasks/extract", {
      method: "POST",
      body: JSON.stringify({ text: "회의 안건 논의", saveToDrive: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tasks).toHaveLength(1);
    expect(json.drive.requested).toBe(true);
    expect(json.drive.saved).toBe(false);
    expect(json.drive.reason).toBe("auth_expired");
  });

  it("S05: Drive 500 서버 에러 시 write_failed를 반환하고 업무 추출은 성공한다", async () => {
    (readSessionWithIntegrations as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      userEmail: "user@example.com",
      googleToken: "valid-token",
    });

    const fetchSpy = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Internal Error" } }),
      };
    });
    vi.stubGlobal("fetch", fetchSpy);

    const req = new NextRequest("http://localhost:3000/api/tasks/extract", {
      method: "POST",
      body: JSON.stringify({ text: "회의 안건 논의", saveToDrive: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tasks).toHaveLength(1);
    expect(json.drive).toEqual({
      requested: true,
      saved: false,
      reason: "write_failed",
    });
  });

  it("S06: 원문이나 토큰이 에러 로그에 노출되지 않는다", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // 네트워크 실패 유발
    const fetchSpy = vi.fn().mockRejectedValue(new Error("Network connection reset"));
    vi.stubGlobal("fetch", fetchSpy);

    const sensitiveToken = "secret-oauth-token-xyz-123";
    const sensitiveText = "비밀 프로젝트 계획 회의록 텍스트";

    await saveToGoogleDriveDaily(sensitiveToken, sensitiveText);

    // console.warn 호출 시 토큰이나 원문 텍스트가 포함되지 않았는지 검증
    for (const call of consoleWarnSpy.mock.calls) {
      const logString = call.map(arg => String(arg)).join(" ");
      expect(logString).not.toContain(sensitiveToken);
      expect(logString).not.toContain(sensitiveText);
    }

    consoleWarnSpy.mockRestore();
  });
});
