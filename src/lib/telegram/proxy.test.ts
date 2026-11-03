import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: () => null }));
import proxy from "@/proxy";
it("allows the independently authenticated Telegram webhook while protecting account linking", async () => {
  const webhook = await proxy(new NextRequest("https://example.com/api/telegram/webhook"));
  expect(webhook.status).toBe(200);
  const link = await proxy(new NextRequest("https://example.com/api/telegram/link"));
  expect(link.status).toBe(401);
});
