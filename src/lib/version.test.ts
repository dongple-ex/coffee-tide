import { describe, it, expect, beforeEach } from "vitest";
import packageJson from "../../package.json";
import {
  APP_VERSION,
  RELEASE_HISTORY,
  getLastSeenVersion,
  setLastSeenVersion,
  hasUnseenUpdate,
  LS_LAST_SEEN_VERSION,
} from "./appVersion";

const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => storage.set(key, val),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: mockLocalStorage,
    writable: true,
  });
}
if (typeof globalThis.window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: mockLocalStorage,
    },
    writable: true,
  });
}

describe("Version Management & Consistency", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("package.json version과 appVersion.ts의 APP_VERSION이 일치해야 한다", () => {
    const rawVersion = APP_VERSION.replace(/^v/, "");
    expect(packageJson.version).toBe(rawVersion);
  });

  it("RELEASE_HISTORY의 최신 릴리스가 현재 APP_VERSION과 일치해야 한다", () => {
    expect(RELEASE_HISTORY.length).toBeGreaterThan(0);
    expect(RELEASE_HISTORY[0].version).toBe(APP_VERSION);
    expect(RELEASE_HISTORY[0].items.length).toBeGreaterThan(0);
  });

  it("사용자가 이전에 버전을 본 적이 없으면 hasUnseenUpdate가 true를 반환한다", () => {
    expect(getLastSeenVersion()).toBeNull();
    expect(hasUnseenUpdate()).toBe(true);
  });

  it("이전 버전(v1.1.0)을 본 사용자는 최신 버전(v1.2.0) 업데이트를 감지해야 한다", () => {
    mockLocalStorage.setItem(LS_LAST_SEEN_VERSION, "v1.1.0");
    expect(hasUnseenUpdate()).toBe(true);
  });

  it("현재 버전을 확인 처리하면 hasUnseenUpdate가 false가 된다", () => {
    setLastSeenVersion(APP_VERSION);
    expect(getLastSeenVersion()).toBe(APP_VERSION);
    expect(hasUnseenUpdate()).toBe(false);
  });
});
