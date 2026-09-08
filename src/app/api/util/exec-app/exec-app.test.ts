import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { expandEnvVars, classifyTarget } from "./route";

describe("exec-app target classification & env expansion (K13)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("expands Windows %LOCALAPPDATA% properly on win32", () => {
    process.env.LOCALAPPDATA = "C:\\Users\\testuser\\AppData\\Local";
    if (process.platform === "win32") {
      const input = "%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe";
      const expanded = expandEnvVars(input);
      expect(expanded).toBe("C:\\Users\\testuser\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe");
    }
  });

  it("classifies expanded Windows exe path as path", () => {
    process.env.LOCALAPPDATA = "C:\\Users\\testuser\\AppData\\Local";
    if (process.platform === "win32") {
      const result = classifyTarget("%LOCALAPPDATA%\\Programs\\Antigravity\\Antigravity.exe");
      expect(result.kind).toBe("path");
      if (result.kind === "path") {
        expect(result.value).toBe("C:\\Users\\testuser\\AppData\\Local\\Programs\\Antigravity\\Antigravity.exe");
      }
    }
  });

  it("correctly identifies allowed URL schemes", () => {
    const kakao = classifyTarget("kakaotalk://open");
    expect(kakao.kind).toBe("url");

    const notion = classifyTarget("notion://workspace");
    expect(notion.kind).toBe("url");

    const web = classifyTarget("https://github.com");
    expect(web.kind).toBe("url");
  });

  it("rejects forbidden executable extensions", () => {
    const script = classifyTarget("C:\\Tools\\run.bat");
    expect(script.kind).toBe("invalid");
  });
});
