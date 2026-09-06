import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("public/sw.js", "utf8");

describe("completion notification navigation", () => {
  function setup(windows: unknown[]) {
    const listeners = new Map<string, (event: unknown) => void>();
    const openWindow = vi.fn().mockResolvedValue(null);
    const showNotification = vi.fn().mockResolvedValue(undefined);
    runInNewContext(source, {
      URL,
      self: {
        location: { origin: "https://coffee.example" },
        registration: { showNotification },
        addEventListener: (name: string, callback: (event: unknown) => void) => listeners.set(name, callback),
      },
      clients: { matchAll: async () => windows, openWindow },
    });
    return { listeners, openWindow, showNotification };
  }

  it("keeps the service worker alive through navigation before focusing the result", async () => {
    const focus = vi.fn();
    let resolveNavigation!: (client: { focus: typeof focus }) => void;
    const navigate = vi.fn(() => new Promise<{ focus: typeof focus }>((resolve) => { resolveNavigation = resolve; }));
    const { listeners } = setup([{ url: "https://coffee.example/", focus, navigate }]);
    let done = Promise.resolve();
    listeners.get("notificationclick")!({
      notification: { close: vi.fn(), data: { url: "/?aiJob=job-id" } },
      waitUntil: (promise: Promise<void>) => { done = promise; },
    });
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledWith("https://coffee.example/?aiJob=job-id");
    expect(focus).not.toHaveBeenCalled();
    resolveNavigation({ focus });
    await done;
    expect(focus).toHaveBeenCalledOnce();
  });

  it("opens a result when no app window remains, and rejects off-origin destinations", async () => {
    const { listeners, openWindow } = setup([]);
    let done = Promise.resolve();
    listeners.get("notificationclick")!({
      notification: { close: vi.fn(), data: { url: "https://untrusted.example/" } },
      waitUntil: (promise: Promise<void>) => { done = promise; },
    });
    await done;
    expect(openWindow).toHaveBeenCalledWith("https://coffee.example/");
  });
});
