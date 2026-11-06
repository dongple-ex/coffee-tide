import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ config: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: mocks.config }));
import proxy from "@/proxy";

it("passes only the exact signed endpoint without session auth and keeps neighboring routes private", async () => {
  expect((await proxy(new NextRequest("https://example.com/api/integrations/trading/notifications"))).status).toBe(200);
  expect(mocks.config).not.toHaveBeenCalled();
  for (const route of ["/api/integrations/trading/other", "/api/telegram/link", "/api/tasks/update"]) {
    expect((await proxy(new NextRequest("https://example.com" + route))).status).toBe(401);
  }
});
