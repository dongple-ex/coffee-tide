import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getStartupDir,
  HOTKEY_VBS_NAME,
  HOTKEY_PS1_NAME,
  HOTKEY_AHK_NAME,
  HOTKEY_LNK_NAME,
  GET,
  POST,
  DELETE,
} from "./route";
import { promises as fs } from "fs";
import { readSession } from "@/lib/auth/cookies";
import { launchHotkey, stopHotkeyProcesses } from "@/lib/windows/hotkeyProcesses";

vi.mock("@/lib/auth/cookies", () => ({
  readSession: vi.fn(),
  unauthorized: () => Response.json({ error: "unauthorized" }, { status: 401 }),
}));

function request(method = "GET", origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/util/windows-shortcut", { method, headers: { origin } });
}

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: vi.fn(),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      unlink: vi.fn(),
    },
  };
});

vi.mock("@/lib/windows/hotkeyProcesses", () => ({
  launchHotkey: vi.fn(),
  stopHotkeyProcesses: vi.fn(),
}));

describe("windows-shortcut API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(readSession).mockResolvedValue({ userEmail: "test@example.com", createdAt: "2026-09-15T00:00:00.000Z" });
    for (const key of ["DISABLE_LOCAL_EXEC", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "NETLIFY"]) vi.stubEnv(key, "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([GET, POST, DELETE])("rejects unauthenticated requests before OS access", async (handler) => {
    vi.mocked(readSession).mockResolvedValue(null);
    expect((await handler(request())).status).toBe(401);
    expect(fs.access).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
    expect(stopHotkeyProcesses).not.toHaveBeenCalled();
  });

  it.each(["DISABLE_LOCAL_EXEC", "VERCEL", "AWS_LAMBDA_FUNCTION_NAME", "NETLIFY"])("blocks OS access when %s disables local execution", async (key) => {
    vi.stubEnv(key, "true");
    expect((await POST(request("POST"))).status).toBe(403);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it("rejects non-local URLs and cross-origin writes", async () => {
    expect((await GET(new Request("https://example.com/api/util/windows-shortcut"))).status).toBe(403);
    expect((await POST(request("POST", "https://example.com"))).status).toBe(403);
    expect((await DELETE(new Request("http://localhost:3000/api/util/windows-shortcut", { method: "DELETE" }))).status).toBe(403);
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.unlink).not.toHaveBeenCalled();
  });

  it("exports proper file constants", () => {
    expect(HOTKEY_VBS_NAME).toBe("coffeeTide_hotkey.vbs");
    expect(HOTKEY_PS1_NAME).toBe("coffeeTide_hotkey.ps1");
    expect(HOTKEY_AHK_NAME).toBe("coffeeTide_hotkey.ahk");
    expect(HOTKEY_LNK_NAME).toBe("coffeeTide_shortcut.lnk");
  });

  it("resolves startup directory on win32 or returns null on other platforms", () => {
    const dir = getStartupDir();
    if (process.platform === "win32") {
      expect(typeof dir).toBe("string");
      expect(dir).toContain("Startup");
    } else {
      expect(dir).toBeNull();
    }
  });

  it("GET returns registration status", async () => {
    vi.mocked(fs.access).mockResolvedValueOnce(undefined);
    const res = await GET(request());
    const data = await res.json();

    if (process.platform === "win32") {
      expect(data.supported).toBe(true);
      expect(data.registered).toBe(true);
    } else {
      expect(data.supported).toBe(false);
    }
  });

  it("POST creates script files and returns success", async () => {
    vi.mocked(fs.mkdir).mockResolvedValueOnce(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const res = await POST(request("POST"));
    const data = await res.json();

    if (process.platform === "win32") {
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("Alt 두 번 누름");
      expect(fs.writeFile).toHaveBeenCalledTimes(3);
    } else {
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    }
  });

  it("DELETE unlinks files and returns success", async () => {
    vi.mocked(fs.unlink).mockResolvedValue(undefined);

    const res = await DELETE(request("DELETE"));
    const data = await res.json();

    if (process.platform === "win32") {
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(fs.unlink).toHaveBeenCalledTimes(4);
    } else {
      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    }
  });

  it.skipIf(process.platform !== "win32")("reports launch failures instead of success", async () => {
    vi.mocked(launchHotkey).mockRejectedValueOnce(new Error("spawn wscript.exe ENOENT"));
    const res = await POST(request("POST"));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it.skipIf(process.platform !== "win32")("reports cleanup failures instead of claiming removal", async () => {
    vi.mocked(fs.unlink).mockRejectedValue(Object.assign(new Error("access denied"), { code: "EACCES" }));
    expect((await DELETE(request("DELETE"))).status).toBe(500);
  });
});
