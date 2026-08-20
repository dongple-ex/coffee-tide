import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

import { fetchPage, isUnsafeIpAddress, rejectUnsafeRemoteUrl, rejectUnsafeUrl } from "./htmlParse";

describe("news URL SSRF protection", () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("blocks local, private, link-local and documentation IP ranges", () => {
    const unsafe = [
      "0.0.0.0",
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "198.18.0.1",
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ];

    for (const address of unsafe) {
      expect(isUnsafeIpAddress(address), address).toBe(true);
    }

    expect(isUnsafeIpAddress("8.8.8.8")).toBe(false);
    expect(isUnsafeIpAddress("192.0.1.1")).toBe(false);
    expect(isUnsafeIpAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("rejects non-http and local hostnames before DNS lookup", async () => {
    expect(rejectUnsafeUrl(new URL("file:///etc/passwd"))).toBeTruthy();
    expect(await rejectUnsafeRemoteUrl(new URL("http://localhost/admin"))).toBeTruthy();
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects a hostname when any resolved address is private", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);

    expect(await rejectUnsafeRemoteUrl(new URL("https://example.com"))).toBeTruthy();
  });

  it("allows a hostname only when every resolved address is public", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    expect(await rejectUnsafeRemoteUrl(new URL("https://example.com"))).toBeNull();
  });

  it("revalidates every redirect target and never fetches a private destination", async () => {
    lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPage("https://example.com/start");

    expect(result.ok).toBe(false);
    expect(result.finalUrl).toBe("http://127.0.0.1/private");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
